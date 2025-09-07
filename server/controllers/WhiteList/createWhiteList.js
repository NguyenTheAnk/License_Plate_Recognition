// ===== IMPORTS & MODULES =====
const path = require('path');
const db = require('../../db');
const multer = require('multer');
const fs = require('fs').promises;
const fsSync = require('fs');
const sharp = require('sharp');
const { spawn, execSync } = require('child_process');
const { validateVietnamesePlateNumberBackend } = require('../../helper/plateValidator');
// ===== MULTER CONFIGURATION =====
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../public/uploads/whitelist/');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            // Đảm bảo thư mục detected_plates cũng tồn tại
            const detectedDir = path.join(__dirname, '../../public/uploads/whitelist/detected_plates/');
            if (!fsSync.existsSync(detectedDir)) {
                await fs.mkdir(detectedDir, { recursive: true });
            }
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
        files: 1
    }
});

const uploadFields = upload.fields([
    { name: 'plate_image', maxCount: 1 },
    { name: 'image', maxCount: 1 }, // Để handle từ frontend
    { name: 'plate_image_cropped', maxCount: 1 },
    { name: 'plate_image_processed', maxCount: 1 }
]);

// ===== CONTROLLERS =====

/**
 * Tạo mới whitelist entry
 */
const createWhitelist = async (req, res) => {
    const connection = await db.promise();
    try {
        // Lấy dữ liệu từ body
        const {
            plate_number, 
            vehicle_id, 
            valid_from, valid_to, description, approval_status = 'approved',
            ocr_raw_text, ocr_confidence, verification_status = 'pending', verified_plate_number
        } = req.body;

        // ✅ SỬA: Validate plate_number thay vì location_id
        if (!plate_number || plate_number.trim() === '') {
            return res.status(400).json({ 
                success: false, 
                message: 'Biển số xe là bắt buộc' 
            });
        }
        const plateValidation = validateVietnamesePlateNumberBackend(plate_number);
        if (!plateValidation.isValid) {
            return res.status(400).json({
                success: false,
                message: plateValidation.message
            });
        }
        const formattedPlateNumber = plateValidation.formattedPlate;

        // ✅ BỎ: Kiểm tra location tồn tại

        // Kiểm tra vehicle nếu có
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
            if (vehicleExists[0].vehicle_plate !== plate_number) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Biển số không khớp với thông tin phương tiện' 
                });
            }
        }

        // ✅ SỬA: Kiểm tra duplicate chỉ theo plate_number (bỏ location_id)
        const [duplicateEntry] = await connection.execute(
            'SELECT id FROM vehicle_whitelist WHERE plate_number = ? AND is_active = 1',
            [formattedPlateNumber]
        );
        if (duplicateEntry.length > 0) {
            return res.status(409).json({ 
                success: false, 
                message: 'Biển số này đã có trong danh sách trắng' 
            });
        }

        // Validate ngày
        if (valid_from && valid_to && new Date(valid_from) > new Date(valid_to)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Ngày bắt đầu không thể sau ngày kết thúc' 
            });
        }
        

        // ===== XỬ LÝ FILE ẢNH UPLOAD - KHÔNG THAY ĐỔI =====
        let plateImagePath = null;
        let ocrText = '';
        let ocrDetails = null;
        let detectedPlateImage = null;
        let uploadedFile = req.file;
        
        if (!uploadedFile && req.files) {
        uploadedFile = req.files.image?.[0] || req.files.plate_image?.[0];
    }
     if (uploadedFile) {
        plateImagePath = `/uploads/whitelist/${uploadedFile.filename}`;
        
        try {
            const pythonScript = path.join(__dirname, 'detect_plate.py');
            const imagePath = uploadedFile.path;
            const { execSync } = require('child_process');
            
            console.log('Running OCR with image:', imagePath);
            
            const result = execSync(`python "${pythonScript}" --image "${imagePath}" --save-crop`, { 
                encoding: 'utf-8', 
                stdio: ['pipe', 'pipe', 'pipe'] 
            });
            
            console.log('Python script result:', result);
            
            const lines = result.trim().split('\n');
            const lastLine = lines[lines.length - 1];
            const ocrResult = JSON.parse(lastLine);
            
            console.log('Parsed OCR result:', ocrResult);
            
            if (ocrResult.success && ocrResult.text) {
                ocrText = ocrResult.text;
                detectedPlateImage = ocrResult.detected_plate_image; // ← QUAN TRỌNG
                
                console.log('OCR Text:', ocrText);
                console.log('Detected plate image path:', detectedPlateImage);
                
                ocrDetails = {
                    vehicle_type: ocrResult.vehicle_type,
                    confidence: ocrResult.confidence,
                    method: ocrResult.method,
                    bbox: ocrResult.bbox
                };
            } else {
                console.log('OCR failed:', ocrResult.message);
            }
        } catch (err) {
            console.error('OCR error:', err);
            detectedPlateImage = null;
            ocrText = '';
        }
    }
        // ... (giữ nguyên logic xử lý ảnh) ...

        // ===== LƯU DB =====
        const insertFields = [
            'plate_number', 'vehicle_id', 
            'plate_image_path', 'detected_plate_image', 'ocr_raw_text', 'verification_status', 'verified_plate_number',
            'valid_from', 'valid_to', 'description', 'approval_status', 'created_by', 'is_active'
        ];
        const insertValues = [
            formattedPlateNumber, vehicle_id || null, 
            plateImagePath, detectedPlateImage, ocrText, verification_status || 'pending', verified_plate_number || null,
            valid_from || null, valid_to || null, description || null, approval_status || 'approved', 
            req.user ? req.user.userId : null, 1
        ];
        
        const [result] = await connection.execute(
            `INSERT INTO vehicle_whitelist (${insertFields.join(', ')}) VALUES (${insertFields.map(_ => '?').join(', ')})`,
            insertValues
        );

        // Nếu approved thì cập nhật approved_by
        if (approval_status === 'approved') {
            await connection.execute(
                'UPDATE vehicle_whitelist SET approved_by = ?, approved_at = NOW() WHERE id = ?',
                [req.user.userId, result.insertId]
            );
        }

        // Trả về kết quả
        res.status(201).json({
            success: true,
            message: 'Tạo whitelist thành công' + (detectedPlateImage ? '' : ' (chưa phát hiện được biển số)'),
            data: {
                id: result.insertId,
                plate_number: plate_number, // ✅ SỬA: Trả về plate_number từ input
                ocr_text: ocrText,
                plate_image_path: plateImagePath,
                detected_plate_image: detectedPlateImage,
                ocr_details: ocrDetails,
                valid_from_text: valid_from ? new Date(valid_from).toLocaleDateString('vi-VN') : null,
                valid_to_text: valid_to ? new Date(valid_to).toLocaleDateString('vi-VN') : null
            }
        });
    } catch (error) {
        console.error('Error creating whitelist:', error);
        // ... (giữ nguyên error handling) ...
    }
};

/**
 * Tạo nhiều whitelist entries (bulk)
 */
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
                const { plate_number, vehicle_id, valid_from, valid_to, description } = entry;

                try {
                    if (!plate_number || plate_number.trim() === '') {
                    results.errors.push({
                        index: i,
                        entry,
                        error: 'Biển số xe là bắt buộc'
                    });
                    continue;
                }

                    // Check for duplicate in database
                    const [duplicateEntry] = await connection.execute(
                        'SELECT id FROM vehicle_whitelist WHERE plate_number = ? AND is_active = 1',
                        [plate_number]
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
                       created.plate_number === plate_number
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
                            plate_number, vehicle_id, 
                            valid_from, valid_to, description, approval_status, created_by, is_active, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, 'approved', ?, 1, NOW(), NOW())`,
                        [
                            plate_number,
                            vehicle_id || null,
                            valid_from || null,
                            valid_to || null,
                            description || null,
                            req.user.userId
                        ]
                    );

                    // Format valid_from, valid_to sang dd/mm/yyyy nếu có
                    const formatDate = (d) => {
                        if (!d) return null;
                        const date = new Date(d);
                        if (isNaN(date)) return null;
                        return date.toLocaleDateString('vi-VN');
                    };
                    const valid_from_text = formatDate(valid_from);
                    const valid_to_text = formatDate(valid_to);
                    results.created.push({
                        index: i,
                        id: result.insertId,
                        plate_number,
                        ...entry,
                        valid_from_text,
                        valid_to_text
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

/**
 * Import whitelist từ CSV
 */
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
        const expectedHeaders = [ 'plate_number', 'valid_from', 'valid_to', 'description'];
        
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
                    if (!plate_number || plate_number.trim() === '') {
                    results.errors.push({
                        index: i,
                        entry,
                        error: 'Biển số xe là bắt buộc'
                    });
                    continue;
                }

                    // Check for duplicate
                    const [duplicateEntry] = await connection.execute(
                        'SELECT id FROM vehicle_whitelist WHERE plate_number = ? AND is_active = 1',
                        [entry.plate_number]
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
                            plate_number,
                            valid_from, valid_to, description, approval_status, created_by, is_active, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, 'approved', ?, 1, NOW(), NOW())`,
                        [
                            entry.plate_number,
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

/**
 * Cập nhật OCR data cho whitelist entry
 */
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

/**
 * Nhận diện ký tự từ ảnh biển số xe (OCR preview, không lưu DB)
 */
const ocrPreview = async (req, res) => {
  try {
    if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                message: 'Vui lòng upload file ảnh (image)' 
            });
    }
        
        // FIX: Sử dụng đường dẫn file thực tế
    const imagePath = req.file.path;
        
        console.log('[DEBUG OCR Preview] imagePath:', imagePath);
        
        if (!fsSync.existsSync(imagePath)) {
      console.error('OCR error: File does not exist:', imagePath);
            return res.status(500).json({ 
                success: false, 
                message: 'File ảnh không tồn tại trên server. Vui lòng thử lại.' 
            });
    }
        
    let ocrText = '';
    let ocrMessage = '';
    let fallbackText = '';
    let ocrResult = null;
        
    try {
      const pythonScript = path.join(__dirname, 'detect_plate.py');
      const { execSync } = require('child_process');
      let result, stderr = '';
            
      try {
                result = execSync(`python "${pythonScript}" --image "${imagePath}" --save-crop`, { 
                    encoding: 'utf-8', 
                    stdio: ['pipe', 'pipe', 'pipe'] 
                });
      } catch (err) {
        stderr = err.stderr ? err.stderr.toString() : '';
        console.error('OCR Python stderr:', stderr);
        // Nếu có stdout, log luôn
        if (err.stdout) console.error('OCR Python stdout:', err.stdout.toString());
                return res.status(500).json({ 
                    success: false, 
                    message: 'Lỗi khi chạy nhận diện ký tự từ ảnh', 
                    stderr, 
                    stdout: err.stdout ? err.stdout.toString() : '' 
                });
      }
            
      // Lấy dòng JSON cuối cùng
      const lines = result.trim().split('\n');
      const lastLine = lines[lines.length - 1];
      try {
        ocrResult = JSON.parse(lastLine);
      } catch (parseErr) {
        console.error('OCR JSON parse error:', lastLine);
        // Trả về toàn bộ stdout để debug
                return res.status(500).json({ 
                    success: false, 
                    message: 'Lỗi parse kết quả từ Python', 
                    raw: result 
                });
      }
            
      if (ocrResult.success && ocrResult.text) {
        ocrText = ocrResult.text;
        // Thêm thông tin chi tiết về detection
        ocrMessage = ocrResult.message || '';
        if (ocrResult.method) {
          ocrMessage += ` (Method: ${ocrResult.method})`;
        }
        if (ocrResult.confidence) {
          ocrMessage += ` (Confidence: ${(ocrResult.confidence * 100).toFixed(1)}%)`;
        }
      } else {
        ocrMessage = ocrResult.message || 'Không phát hiện được biển số hoặc nhận diện rỗng.';
        fallbackText = ocrResult.text || '';
      }
    } catch (err) {
      console.error('OCR error:', err);
            return res.status(500).json({ 
                success: false, 
                message: 'Lỗi khi nhận diện ký tự từ ảnh', 
                error: err.message 
            });
    }
        
        // FIX: Cleanup uploaded file after processing
        try {
            await fs.unlink(imagePath);
            console.log('[DEBUG] Cleaned up uploaded file:', imagePath);
        } catch (cleanupErr) {
            console.warn('[DEBUG] Failed to cleanup uploaded file:', cleanupErr.message);
        }
        
    if (ocrText && ocrText.trim()) {
      res.json({ 
        success: true, 
        ocr_text: ocrText,
        detected_plate_image: ocrResult?.detected_plate_image || null,
        method: ocrResult?.method || 'unknown',
        confidence: ocrResult?.confidence || null,
        bbox: ocrResult?.bbox || null,
        message: ocrMessage || 'Nhận diện thành công'
      });
    } else {
      res.json({ 
        success: false, 
        ocr_text: fallbackText, 
        detected_plate_image: ocrResult?.detected_plate_image || null,
        method: ocrResult?.method || 'failed',
        message: ocrMessage || 'Không nhận diện được ký tự. Hãy kiểm tra lại ảnh hoặc model.' 
      });
    }
  } catch (error) {
    console.error('OCR preview server error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Lỗi server khi nhận diện ký tự từ ảnh', 
            error: error.message 
        });
  }
};

module.exports = {
    createWhitelist,
    bulkCreateWhitelist,
    importWhitelistFromCSV,
    updateOCRData,
    uploadFields,
    ocrPreview
};