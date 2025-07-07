const db = require('../../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const Tesseract = require('tesseract.js');

// Configure multer for image uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join('uploads', 'whitelist', 'images');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `whitelist-${uniqueSuffix}${ext}`);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Chỉ chấp nhận file ảnh (JPEG, PNG, WEBP)'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 3 // Maximum 3 files (original, cropped, processed)
    }
});

const uploadFields = upload.fields([
    { name: 'plate_image', maxCount: 1 },
    { name: 'plate_image_cropped', maxCount: 1 },
    { name: 'plate_image_processed', maxCount: 1 }
]);

const createWhitelist = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const {
            location_id,
            plate_number,
            vehicle_id,
            owner_name,
            owner_phone,
            contact_email,
            valid_from,
            valid_to,
            description,
            approval_status = 'approved',
            // OCR related fields
            ocr_raw_text,
            ocr_confidence,
            verification_status = 'pending',
            verified_plate_number
        } = req.body;

        // Validation
        if (!location_id || !plate_number) {
            return res.status(400).json({
                success: false,
                message: 'location_id và plate_number là bắt buộc'
            });
        }

        // Validate plate number format (Vietnamese license plate)
        const plateRegex = /^[0-9]{2}[A-Z]{1,2}-[0-9]{3,4}\.[0-9]{2}$|^[0-9]{2}[A-Z]{1,2}[0-9]{3,4}$/;
        if (!plateRegex.test(plate_number)) {
            return res.status(400).json({
                success: false,
                message: 'Định dạng biển số không hợp lệ'
            });
        }

        // Check if location exists and is active
        const [locationExists] = await connection.execute(
            'SELECT id, name, zone_type FROM locations WHERE id = ? AND is_active = 1',
            [location_id]
        );

        if (locationExists.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy vị trí hoặc vị trí đã bị vô hiệu hóa'
            });
        }

        // Check if vehicle exists (if vehicle_id is provided)
        if (vehicle_id) {
            const [vehicleExists] = await connection.execute(
                'SELECT id, plate_number as vehicle_plate FROM vehicles WHERE id = ? AND is_active = 1',
                [vehicle_id]
            );

            if (vehicleExists.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy phương tiện hoặc phương tiện đã bị vô hiệu hóa'
                });
            }

            // Check if plate numbers match
            if (vehicleExists[0].vehicle_plate !== plate_number) {
                return res.status(400).json({
                    success: false,
                    message: 'Biển số không khớp với thông tin phương tiện'
                });
            }
        }

        // Check for duplicate entry
        const [duplicateEntry] = await connection.execute(
            'SELECT id FROM vehicle_whitelist WHERE location_id = ? AND plate_number = ? AND is_active = 1',
            [location_id, plate_number]
        );

        if (duplicateEntry.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Biển số này đã có trong danh sách trắng tại vị trí này'
            });
        }

        // Validate date range
        if (valid_from && valid_to && new Date(valid_from) > new Date(valid_to)) {
            return res.status(400).json({
                success: false,
                message: 'Ngày bắt đầu không thể sau ngày kết thúc'
            });
        }

        // Validate email format if provided
        if (contact_email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(contact_email)) {
                return res.status(400).json({
                    success: false,
                    message: 'Định dạng email không hợp lệ'
                });
            }
        }

        // Validate phone format if provided (Vietnamese phone number)
        if (owner_phone) {
            const phoneRegex = /^(\+84|84|0)(3|5|7|8|9)[0-9]{8}$/;
            if (!phoneRegex.test(owner_phone.replace(/\s+/g, ''))) {
                return res.status(400).json({
                    success: false,
                    message: 'Định dạng số điện thoại không hợp lệ'
                });
            }
        }

        // Handle uploaded image (field 'image')
        let plateImagePath = null;
        let ocrText = null;
        if (req.file) {
            plateImagePath = '/uploads/whitelist/' + req.file.filename;
            const imagePath = require('path').join(__dirname, '../../public/uploads/whitelist/', req.file.filename);
            try {
                const result = await Tesseract.recognize(imagePath, 'eng', { logger: m => {} });
                ocrText = result.data.text.replace(/\s/g, '').toUpperCase();
            } catch (err) {
                ocrText = null;
            }
        }

        // Create whitelist entry
        const [result] = await connection.execute(
            `INSERT INTO vehicle_whitelist (
                location_id, plate_number, vehicle_id, owner_name, owner_phone, contact_email,
                plate_image_path, ocr_raw_text,
                verification_status, verified_plate_number,
                valid_from, valid_to, description, approval_status,
                created_by, is_active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
            [
                location_id,
                plate_number,
                vehicle_id || null,
                owner_name || null,
                owner_phone || null,
                contact_email || null,
                plateImagePath,
                ocrText,
                verification_status,
                verified_plate_number || plate_number,
                valid_from || null,
                valid_to || null,
                description || null,
                approval_status,
                req.user.userId
            ]
        );

        const whitelistId = result.insertId;

        // If approval status is approved, set approved_by and approved_at
        if (approval_status === 'approved') {
            await connection.execute(
                'UPDATE vehicle_whitelist SET approved_by = ?, approved_at = NOW() WHERE id = ?',
                [req.user.userId, whitelistId]
            );
        }

        // Get the created whitelist entry with related data
        const [createdEntry] = await connection.execute(
            `SELECT w.*, 
                    l.name as location_name, 
                    l.code as location_code,
                    l.zone_type,
                    v.make, v.model, v.color, v.vehicle_type,
                    u1.name as created_by_name, 
                    u2.name as approved_by_name,
                    CASE 
                        WHEN w.valid_from IS NULL AND w.valid_to IS NULL THEN 'permanent'
                        WHEN w.valid_from IS NOT NULL AND w.valid_from > CURDATE() THEN 'future'
                        WHEN w.valid_to IS NOT NULL AND w.valid_to < CURDATE() THEN 'expired'
                        ELSE 'valid'
                    END as current_status
             FROM vehicle_whitelist w
             LEFT JOIN locations l ON w.location_id = l.id
             LEFT JOIN vehicles v ON w.vehicle_id = v.id
             LEFT JOIN users u1 ON w.created_by = u1.id
             LEFT JOIN users u2 ON w.approved_by = u2.id
             WHERE w.id = ?`,
            [whitelistId]
        );

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, 
                                    new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'CREATE', 'WHITELIST', ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                whitelistId,
                JSON.stringify(createdEntry[0]),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Tạo whitelist thành công',
            data: {
                id: result.insertId,
                ocr_text: ocrText,
                plate_image_path: plateImagePath
            }
        });

    } catch (error) {
        console.error('Error creating whitelist:', error);
        
        // Clean up uploaded files if there was an error
        if (req.files) {
            const filesToDelete = [];
            if (req.files.plate_image) filesToDelete.push(req.files.plate_image[0].path);
            if (req.files.plate_image_cropped) filesToDelete.push(req.files.plate_image_cropped[0].path);
            if (req.files.plate_image_processed) filesToDelete.push(req.files.plate_image_processed[0].path);
            
            for (const filePath of filesToDelete) {
                try {
                    await fs.unlink(filePath);
                } catch (unlinkError) {
                    console.error('Error deleting uploaded file:', unlinkError);
                }
            }
        }

        // Handle duplicate key error
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                message: 'Biển số này đã có trong danh sách trắng tại vị trí này'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo whitelist',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const bulkCreateWhitelist = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { entries } = req.body;

        if (!entries || !Array.isArray(entries) || entries.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Danh sách entries không hợp lệ'
            });
        }

        if (entries.length > 100) {
            return res.status(400).json({
                success: false,
                message: 'Không thể tạo quá 100 entries cùng lúc'
            });
        }

        const results = {
            created: [],
            errors: [],
            duplicates: []
        };

        await connection.beginTransaction();

        try {
            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                const { location_id, plate_number, vehicle_id, owner_name, owner_phone, contact_email, valid_from, valid_to, description } = entry;

                try {
                    // Basic validation
                    if (!location_id || !plate_number) {
                        results.errors.push({
                            index: i,
                            entry,
                            error: 'location_id và plate_number là bắt buộc'
                        });
                        continue;
                    }

                    // Check for duplicate in database
                    const [duplicateEntry] = await connection.execute(
                        'SELECT id FROM vehicle_whitelist WHERE location_id = ? AND plate_number = ? AND is_active = 1',
                        [location_id, plate_number]
                    );

                    if (duplicateEntry.length > 0) {
                        results.duplicates.push({
                            index: i,
                            entry,
                            existing_id: duplicateEntry[0].id
                        });
                        continue;
                    }

                    // Check for duplicate in current batch
                    const duplicateInBatch = results.created.find(created => 
                        created.location_id === location_id && created.plate_number === plate_number
                    );

                    if (duplicateInBatch) {
                        results.duplicates.push({
                            index: i,
                            entry,
                            duplicate_in_batch: true
                        });
                        continue;
                    }

                    // Validate date range
                    if (valid_from && valid_to && new Date(valid_from) > new Date(valid_to)) {
                        results.errors.push({
                            index: i,
                            entry,
                            error: 'Ngày bắt đầu không thể sau ngày kết thúc'
                        });
                        continue;
                    }

                    // Create whitelist entry
                    const [result] = await connection.execute(
                        `INSERT INTO vehicle_whitelist (
                            location_id, plate_number, vehicle_id, owner_name, owner_phone, contact_email,
                            valid_from, valid_to, description, approval_status, created_by, is_active, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, 1, NOW(), NOW())`,
                        [
                            location_id,
                            plate_number,
                            vehicle_id || null,
                            owner_name || null,
                            owner_phone || null,
                            contact_email || null,
                            valid_from || null,
                            valid_to || null,
                            description || null,
                            req.user.userId
                        ]
                    );

                    results.created.push({
                        index: i,
                        id: result.insertId,
                        location_id,
                        plate_number,
                        ...entry
                    });

                } catch (entryError) {
                    results.errors.push({
                        index: i,
                        entry,
                        error: entryError.message
                    });
                }
            }

            await connection.commit();

            // Log bulk access
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, 
                                        new_values, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'BULK_CREATE', 'WHITELIST', ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user.userId,
                    req.user.username || req.user.email,
                    JSON.stringify({
                        total_entries: entries.length,
                        created_count: results.created.length,
                        error_count: results.errors.length,
                        duplicate_count: results.duplicates.length
                    }),
                    req.ip,
                    req.get('User-Agent')
                ]
            );

            res.status(201).json({
                success: true,
                message: `Bulk create hoàn thành: ${results.created.length} thành công, ${results.errors.length} lỗi, ${results.duplicates.length} trùng lặp`,
                data: results
            });

        } catch (error) {
            await connection.rollback();
            throw error;
        }

    } catch (error) {
        console.error('Error bulk creating whitelist entries:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo nhiều whitelist entries',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const importWhitelistFromCSV = async (req, res) => {
    const connection = await db.promise();
    
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Không tìm thấy file CSV'
            });
        }

        const csvContent = await fs.readFile(req.file.path, 'utf-8');
        const lines = csvContent.trim().split('\n');
        
        if (lines.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'File CSV phải có ít nhất 1 dòng dữ liệu'
            });
        }

        // Parse header
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const expectedHeaders = ['location_id', 'plate_number', 'owner_name', 'owner_phone', 'contact_email', 'valid_from', 'valid_to', 'description'];
        
        // Validate headers
        const missingHeaders = expectedHeaders.filter(h => !headers.includes(h));
        if (missingHeaders.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Thiếu các cột bắt buộc: ${missingHeaders.join(', ')}`
            });
        }

        const results = {
            created: [],
            errors: [],
            duplicates: []
        };

        await connection.beginTransaction();

        try {
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
                const entry = {};
                
                headers.forEach((header, index) => {
                    entry[header] = values[index] || null;
                });

                try {
                    // Basic validation
                    if (!entry.location_id || !entry.plate_number) {
                        results.errors.push({
                            line: i + 1,
                            entry,
                            error: 'location_id và plate_number là bắt buộc'
                        });
                        continue;
                    }

                    // Check for duplicate
                    const [duplicateEntry] = await connection.execute(
                        'SELECT id FROM vehicle_whitelist WHERE location_id = ? AND plate_number = ? AND is_active = 1',
                        [entry.location_id, entry.plate_number]
                    );

                    if (duplicateEntry.length > 0) {
                        results.duplicates.push({
                            line: i + 1,
                            entry,
                            existing_id: duplicateEntry[0].id
                        });
                        continue;
                    }

                    // Create whitelist entry
                    const [result] = await connection.execute(
                        `INSERT INTO vehicle_whitelist (
                            location_id, plate_number, owner_name, owner_phone, contact_email,
                            valid_from, valid_to, description, approval_status, created_by, is_active, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, 1, NOW(), NOW())`,
                        [
                            entry.location_id,
                            entry.plate_number,
                            entry.owner_name,
                            entry.owner_phone,
                            entry.contact_email,
                            entry.valid_from || null,
                            entry.valid_to || null,
                            entry.description,
                            req.user.userId
                        ]
                    );

                    results.created.push({
                        line: i + 1,
                        id: result.insertId,
                        ...entry
                    });

                } catch (entryError) {
                    results.errors.push({
                        line: i + 1,
                        entry,
                        error: entryError.message
                    });
                }
            }

            await connection.commit();

            // Clean up uploaded CSV file
            await fs.unlink(req.file.path);

            // Log import
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, 
                                        new_values, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'IMPORT_CSV', 'WHITELIST', ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user.userId,
                    req.user.username || req.user.email,
                    JSON.stringify({
                        filename: req.file.originalname,
                        total_lines: lines.length - 1,
                        created_count: results.created.length,
                        error_count: results.errors.length,
                        duplicate_count: results.duplicates.length
                    }),
                    req.ip,
                    req.get('User-Agent')
                ]
            );

            res.status(201).json({
                success: true,
                message: `Import CSV hoàn thành: ${results.created.length} thành công, ${results.errors.length} lỗi, ${results.duplicates.length} trùng lặp`,
                data: results
            });

        } catch (error) {
            await connection.rollback();
            throw error;
        }

    } catch (error) {
        console.error('Error importing whitelist from CSV:', error);
        
        // Clean up uploaded file on error
        if (req.file) {
            try {
                await fs.unlink(req.file.path);
            } catch (unlinkError) {
                console.error('Error deleting uploaded CSV file:', unlinkError);
            }
        }

        res.status(500).json({
            success: false,
            message: 'Lỗi khi import whitelist từ CSV',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const updateOCRData = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;
        const {
            ocr_raw_text,
            ocr_confidence,
            verification_status,
            verified_plate_number
        } = req.body;

        // Check if whitelist entry exists
        const [existingEntry] = await connection.execute(
            'SELECT * FROM vehicle_whitelist WHERE id = ?',
            [id]
        );

        if (existingEntry.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy whitelist entry'
            });
        }

        // Update OCR data
        await connection.execute(
            `UPDATE vehicle_whitelist SET 
                ocr_raw_text = ?, 
                ocr_confidence = ?, 
                ocr_processed_at = NOW(),
                verification_status = ?,
                verified_plate_number = ?,
                updated_at = NOW()
             WHERE id = ?`,
            [
                ocr_raw_text,
                ocr_confidence,
                verification_status || 'pending',
                verified_plate_number || existingEntry[0].plate_number,
                id
            ]
        );

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, 
                                    old_values, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'UPDATE_OCR', 'WHITELIST', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                id,
                JSON.stringify({
                    ocr_raw_text: existingEntry[0].ocr_raw_text,
                    ocr_confidence: existingEntry[0].ocr_confidence,
                    verification_status: existingEntry[0].verification_status
                }),
                JSON.stringify(req.body),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Cập nhật OCR data thành công',
            data: {
                id: parseInt(id),
                ocr_raw_text,
                ocr_confidence,
                verification_status: verification_status || 'pending',
                verified_plate_number: verified_plate_number || existingEntry[0].plate_number
            }
        });

    } catch (error) {
        console.error('Error updating OCR data:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật OCR data',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    createWhitelist,
    bulkCreateWhitelist,
    importWhitelistFromCSV,
    updateOCRData,
    uploadFields 
};