const db = require('../../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { execSync } = require('child_process');

// Đảm bảo khai báo fileFilter TRƯỚC khi sử dụng trong multer config
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Chỉ chấp nhận file ảnh (JPEG, PNG, WEBP)'), false);
    }
};

const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../public/uploads/blacklist/');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            // Đảm bảo thư mục detected_plates cũng tồn tại
            const detectedDir = path.join(__dirname, '../../public/uploads/blacklist/detected_plates/');
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
        cb(null, `blacklist-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 1
    }
});


const uploadField1s = upload.fields([
    { name: 'image', maxCount: 1 }, // CHÍNH FIELD NÀY
    { name: 'plate_image', maxCount: 1 },
    { name: 'plate_image_cropped', maxCount: 1 },
    { name: 'plate_image_processed', maxCount: 1 }
]);

const createBlacklist = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const {
            plate_number,
            vehicle_id,
            violation_type = 'unauthorized',
            reason,
            severity = 'medium',
            valid_from,
            valid_to,
            description,
            evidence_files,
            ocr_raw_text,
            ocr_confidence,
            verification_status = 'pending',
            verified_plate_number
        } = req.body;

        if (!reason) {
            return res.status(400).json({
                success: false,
                message: 'reason là bắt buộc'
            });
        }

        // SỬA: Kiểm tra plate_number trước, xử lý file sau
            if (!plate_number || plate_number.trim() === '') {
                // Nếu không có plate_number, kiểm tra xem có file upload không
                let hasUploadedFile = false;
                if (req.file) {
                    hasUploadedFile = true;
                } else if (req.files) {
                    hasUploadedFile = (req.files.image && req.files.image.length > 0) || 
                                    (req.files.plate_image && req.files.plate_image.length > 0);
                }
                
                if (!hasUploadedFile) {
                    return res.status(400).json({
                        success: false,
                        message: 'Vui lòng nhập biển số xe hoặc upload ảnh để nhận diện tự động'
                    });
                }
            }


        // Check if vehicle exists (if vehicle_id provided)
        if (vehicle_id) {
            const [vehicleExists] = await connection.execute(
                'SELECT id, plate_number as vehicle_plate FROM vehicles WHERE id = ? AND is_active = 1',
                [vehicle_id]
            );

            if (vehicleExists.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy phương tiện'
                });
            }

            if (vehicleExists[0].vehicle_plate !== plate_number) {
                return res.status(400).json({
                    success: false,
                    message: 'Biển số không khớp với thông tin phương tiện'
                });
            }
        }

        // Check if blacklist entry already exists
        const [existingEntry] = await connection.execute(
            'SELECT id FROM vehicle_blacklist WHERE plate_number = ? AND is_active = 1',
            [plate_number]
        );

        if (existingEntry.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Biển số này đã có trong danh sách đen tại vị trí này'
            });
        }

        // Validate violation type and severity
        const validViolationTypes = ['unauthorized', 'security_threat', 'unpaid_fine', 'banned', 'suspicious', 'other'];
        const validSeverities = ['low', 'medium', 'high', 'critical'];

        if (!validViolationTypes.includes(violation_type)) {
            return res.status(400).json({
                success: false,
                message: 'Loại vi phạm không hợp lệ'
            });
        }

        if (!validSeverities.includes(severity)) {
            return res.status(400).json({
                success: false,
                message: 'Mức độ nghiêm trọng không hợp lệ'
            });
        }

        // Validate date range
        if (valid_from && valid_to && new Date(valid_from) > new Date(valid_to)) {
            return res.status(400).json({
                success: false,
                message: 'Ngày bắt đầu không thể sau ngày kết thúc'
            });
        }

      

        // ===== XỬ LÝ FILE ẢNH UPLOAD =====
        let plateImagePath = null;
        let ocrText = '';
        let ocrDetails = null;
        let detectedPlateImage = null;
        let uploadedFile = req.file;

        // SỬA: Tìm file upload từ nhiều field và ưu tiên 'image'
        if (!uploadedFile && req.files) {
            if (req.files.image && req.files.image.length > 0) {
                uploadedFile = req.files.image[0];
            } else if (req.files.plate_image && req.files.plate_image.length > 0) {
                uploadedFile = req.files.plate_image[0];
            }
        }

        console.log('[DEBUG] uploadedFile after fixes:', uploadedFile);

        if (uploadedFile) {
            // Sử dụng đường dẫn file thực tế
            const actualImagePath = uploadedFile.path;
            plateImagePath = '/uploads/blacklist/' + uploadedFile.filename;

            console.log('[DEBUG] actualImagePath:', actualImagePath);
            console.log('[DEBUG] plateImagePath:', plateImagePath);

            // Kiểm tra file tồn tại (lặp lại tối đa 10 lần, mỗi lần 200ms)
            let fileExists = fsSync.existsSync(actualImagePath);
            let retryCount = 0;
            while (!fileExists && retryCount < 10) {
                console.warn(`[DEBUG] File chưa tồn tại, thử delay 200ms lần ${retryCount + 1}:`, actualImagePath);
                await new Promise(resolve => setTimeout(resolve, 200));
                fileExists = fsSync.existsSync(actualImagePath);
                retryCount++;
            }

            if (!fileExists) {
                console.error('[ERROR] File vẫn không tồn tại, không thể detect:', actualImagePath);
                detectedPlateImage = null;
                ocrText = '';
                ocrDetails = {
                    method: 'error',
                    message: 'File ảnh không tồn tại, không thể detect',
                    detected_plate_image: null
                };
            } else {
                try {
                    // Gọi script Python detect biển số - sử dụng script riêng cho blacklist
                    const pythonScript = path.join(__dirname, './detect_plate.py');
                    const result = execSync(`python "${pythonScript}" --image "${actualImagePath}" --save-crop`).toString();
                    const lines = result.trim().split('\n');
                    const lastLine = lines[lines.length - 1];
                    const ocrResult = JSON.parse(lastLine);

                    console.log('[DEBUG] ocrResult:', ocrResult);

                    detectedPlateImage = ocrResult.detected_plate_image || null;
                    // Đảm bảo đường dẫn đúng subfolder
                    if (detectedPlateImage && !detectedPlateImage.startsWith('/uploads/blacklist/detected_plates/')) {
                        const fileName = detectedPlateImage.split('/').pop();
                        detectedPlateImage = `/uploads/blacklist/detected_plates/${fileName}`;
                    }

                    // Nếu không có detectedPlateImage, lấy file mới nhất trong detected_plates
                    if (!detectedPlateImage) {
                        const detectedDir = path.join(__dirname, '../../public/uploads/blacklist/detected_plates/');
                        try {
                            const files = fsSync.readdirSync(detectedDir)
                                .filter(f => f.startsWith('detected_') && f.endsWith('.jpg'))
                                .map(f => ({ name: f, time: fsSync.statSync(path.join(detectedDir, f)).mtime.getTime() }))
                                .sort((a, b) => b.time - a.time);
                            if (files.length > 0) {
                                detectedPlateImage = `/uploads/blacklist/detected_plates/${files[0].name}`;
                                console.warn('[DEBUG] Không có detected_plate_image từ script, tự động lấy file mới nhất:', detectedPlateImage);
                            } else {
                                console.warn('[DEBUG] Không có file detected nào trong thư mục detected_plates');
                            }
                        } catch (dirErr) {
                            console.warn('[DEBUG] Lỗi khi đọc thư mục detected_plates:', dirErr.message);
                        }
                    }

                    console.log('[DEBUG] detectedPlateImage:', detectedPlateImage);

                    if (ocrResult.success) {
                        ocrText = ocrResult.text || '';
                        ocrDetails = {
                            method: ocrResult.method,
                            confidence: ocrResult.confidence,
                            bbox: ocrResult.bbox,
                            detections: ocrResult.detections || [],
                            message: ocrResult.message,
                            detected_plate_image: detectedPlateImage
                        };
                    } else {
                        ocrText = '';
                        ocrDetails = {
                            method: 'failed',
                            message: ocrResult.message,
                            detected_plate_image: detectedPlateImage
                        };
                    }
                } catch (err) {
                    console.error('OCR error:', err);
                    ocrDetails = {
                        method: 'error',
                        message: err.message,
                        detected_plate_image: null
                    };
                    detectedPlateImage = null;
                }
            }
        } else {
            // Không có file upload, bỏ qua phần xử lý ảnh
            plateImagePath = null;
            detectedPlateImage = null;
            ocrText = '';
            ocrDetails = null;
        }

        // Validate evidence files format if provided
        let evidenceFilesJson = null;
        if (evidence_files) {
            try {
                evidenceFilesJson = typeof evidence_files === 'string' ? JSON.parse(evidence_files) : evidence_files;
                if (!Array.isArray(evidenceFilesJson)) {
                    throw new Error('Evidence files must be an array');
                }
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    message: 'Định dạng evidence_files không hợp lệ'
                });
            }
        }

        // Lưu đường dẫn ảnh và kết quả OCR vào evidence_files
        if (plateImagePath) {
            evidenceFilesJson = [{ 
                type: 'plate_image', 
                path: plateImagePath, 
                detected_plate_image: detectedPlateImage, 
                ocr_text: ocrText 
            }];
        }

        // ===== LƯU DB =====
        const insertFields = [
            'plate_number', 'vehicle_id', 'violation_type', 'reason', 'severity',
            'valid_from', 'valid_to', 'description', 'evidence_files',
            'plate_image_path', 'detected_plate_image', 'ocr_raw_text', 'ocr_confidence', 'ocr_processed_at',
            'verification_status', 'verified_plate_number', 'created_by', 'is_active'
        ];
        const finalPlateNumber = plate_number && plate_number.trim() !== '' ? plate_number : (ocrText || '');
        if (!finalPlateNumber) {
            return res.status(400).json({
                success: false,
                message: 'Không thể xác định biển số xe. Vui lòng nhập thủ công hoặc upload ảnh rõ nét hơn'
            });
        }
        const insertValues = [
            finalPlateNumber, vehicle_id || null, violation_type, reason, severity,
            valid_from || null, valid_to || null, description || null,
            evidenceFilesJson ? JSON.stringify(evidenceFilesJson) : null,
            plateImagePath, detectedPlateImage, ocrText, ocrDetails?.confidence || null, 
            ocrText ? new Date() : null, verification_status || 'pending', verified_plate_number || null,
            req.user ? req.user.userId : null, 1
        ];

        console.log('[DEBUG] INSERT vehicle_blacklist fields:', insertFields);
        console.log('[DEBUG] INSERT vehicle_blacklist values:', insertValues);

        // Create blacklist entry
        const [result] = await connection.execute(
            `INSERT INTO vehicle_blacklist (${insertFields.join(', ')}) VALUES (${insertFields.map(_ => '?').join(', ')})`,
            insertValues
        );

        // Get the created blacklist entry with location info
        const [blacklistEntry] = await connection.execute(
            `SELECT b.*, v.make, v.model, v.color,
                    u.name as created_by_name,
                    CASE 
                        WHEN b.valid_from IS NULL AND b.valid_to IS NULL THEN 'permanent'
                        WHEN b.valid_from IS NOT NULL AND b.valid_from > CURDATE() THEN 'future'
                        WHEN b.valid_to IS NOT NULL AND b.valid_to < CURDATE() THEN 'expired'
                        ELSE 'active'
                    END as current_status
             FROM vehicle_blacklist b
             LEFT JOIN vehicles v ON b.vehicle_id = v.id
             LEFT JOIN users u ON b.created_by = u.id
             WHERE b.id = ?`,
            [result.insertId]
        );

        // Create alert for blacklist addition
        await connection.execute(
            `INSERT INTO alerts (
                alert_uuid, alert_type, severity, title, message,
                plate_number, vehicle_id, alert_data,
                status, priority_score, created_at
            ) VALUES (?, 'blacklist_detected', ?, ?, ?, ?, ?, ?, 'new', ?, NOW())`,
            [
                require('crypto').randomUUID(),
                severity,
                `Xe ${plate_number || ocrText} đã được thêm vào danh sách đen`,
                `Xe có biển số ${plate_number || ocrText} đã được thêm vào danh sách đen tại ${blacklistEntry[0].location_name} với lý do: ${reason}`,
                plate_number || ocrText,
                vehicle_id || null,
                JSON.stringify({
                    violation_type,
                    severity,
                    reason,
                    created_by: req.user.userId,
                    ocr_details: ocrDetails
                }),
                severity === 'critical' ? 95 : severity === 'high' ? 80 : severity === 'medium' ? 60 : 40
            ]
        );

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, 
                                    new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'CREATE', 'BLACKLIST', ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                result.insertId,
                JSON.stringify({ 
                    plate_number: plate_number || ocrText, 
                    violation_type, 
                    severity,
                    ocr_text: ocrText,
                    detected_plate_image: detectedPlateImage
                }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Thêm vào danh sách đen thành công' + (detectedPlateImage ? '' : ' (chưa phát hiện được biển số)'),
            data: {
                ...blacklistEntry[0],
                ocr_text: ocrText,
                plate_image_path: plateImagePath,
                detected_plate_image: detectedPlateImage,
                ocr_details: ocrDetails,
                valid_from_text: valid_from ? new Date(valid_from).toLocaleDateString('vi-VN') : null,
                valid_to_text: valid_to ? new Date(valid_to).toLocaleDateString('vi-VN') : null
            }
        });

    } catch (error) {
        console.error('Error creating blacklist entry:', error);
        
        // Clean up uploaded files nếu có lỗi
        if (req.files) {
            const filesToDelete = [];
            if (req.files.plate_image) filesToDelete.push(req.files.plate_image[0].path);
            if (req.files.image) filesToDelete.push(req.files.image[0].path);
            if (req.files.plate_image_cropped) filesToDelete.push(req.files.plate_image_cropped[0].path);
            if (req.files.plate_image_processed) filesToDelete.push(req.files.plate_image_processed[0].path);
            for (const filePath of filesToDelete) {
                try { await fs.unlink(filePath); } catch (unlinkError) { console.error('Error deleting uploaded file:', unlinkError); }
            }
        }
        
        // Handle duplicate key error
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                message: 'Biển số này đã có trong danh sách đen tại vị trí này'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Lỗi khi thêm vào danh sách đen',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const createMultipleBlacklist = async (req, res) => {
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
                const { plate_number, vehicle_id, violation_type, reason, severity, valid_from, valid_to, description } = entry;

                try {
                    

                    // Check for duplicate in database
                    const [duplicateEntry] = await connection.execute(
                        'SELECT id FROM vehicle_blacklist WHERE plate_number = ? AND is_active = 1',
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

                    // Create blacklist entry
                    const [result] = await connection.execute(
                        `INSERT INTO vehicle_blacklist (
                            plate_number, vehicle_id, violation_type, reason, severity,
                            valid_from, valid_to, description, 
                            created_by, is_active, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
                        [
                            plate_number,
                            vehicle_id || null,
                            violation_type || 'unauthorized',
                            reason,
                            severity || 'medium',
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
                 VALUES (?, ?, 'BULK_CREATE', 'BLACKLIST', ?, 'SUCCESS', ?, ?, NOW())`,
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
        console.error('Error creating multiple blacklist entries:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi thêm nhiều entries vào danh sách đen',
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
            // Sử dụng script Python riêng cho blacklist
            const pythonScript = path.join(__dirname, './detect_plate.py');
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
    createBlacklist,
    createMultipleBlacklist,
    uploadField1s,
    ocrPreview,
    upload // THÊM export instance upload
};