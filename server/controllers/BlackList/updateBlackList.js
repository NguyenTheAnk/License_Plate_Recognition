const db = require('../../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { execSync } = require('child_process');

const parseImageMetadata = (metadata) => {
    try {
        if (!metadata) return {};
        if (typeof metadata === 'object') return metadata;
        if (typeof metadata === 'string') {
            // Kiểm tra nếu string bắt đầu bằng { hoặc [
            if (metadata.startsWith('{') || metadata.startsWith('[')) {
                return JSON.parse(metadata);
            }
        }
        return {};
    } catch (err) {
        console.warn('Failed to parse image_metadata:', err);
        return {};
    }
};

// Configure multer for image uploads (same as create)
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join('uploads', 'blacklist', 'images');
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
        cb(null, `blacklist-update-${uniqueSuffix}${ext}`);
    }
});

// SỬA: Thay thế hàm formatDateForMySQL trong updateBlackList.js
const formatDateForMySQL = (dateString) => {
    if (!dateString) return null;
    
    console.log('[BACKEND] formatDateForMySQL input:', dateString, typeof dateString);
    
    // Nếu đã là định dạng YYYY-MM-DD thì return luôn
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        console.log('[BACKEND] Already YYYY-MM-DD format:', dateString);
        return dateString;
    }
    
    // SỬA: Xử lý string date mà không dùng Date constructor để tránh timezone
    let year, month, day;
    
    if (dateString.includes('-')) {
        // YYYY-MM-DD format
        [year, month, day] = dateString.split('-').map(num => parseInt(num));
    } else if (dateString.includes('/')) {
        // Frontend gửi format YYYY-MM-DD đã convert từ dd/MM/yyyy
        // Nhưng nếu vẫn nhận dd/MM/yyyy thì xử lý
        const parts = dateString.split('/');
        if (parts.length === 3) {
            // Assume dd/MM/yyyy format từ frontend
            day = parseInt(parts[0]);
            month = parseInt(parts[1]);
            year = parseInt(parts[2]);
        }
    } else if (dateString.includes('T')) {
        // ISO string - chỉ lấy phần date
        const datePart = dateString.split('T')[0];
        console.log('[BACKEND] ISO string date part:', datePart);
        return datePart; // Đã là YYYY-MM-DD
    }
    
    // Validate components
    if (year && month && day && 
        year >= 1900 && year <= 2100 && 
        month >= 1 && month <= 12 && 
        day >= 1 && day <= 31) {
        
        const result = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        console.log('[BACKEND] formatDateForMySQL result:', result);
        return result;
    }
    
    console.error('[BACKEND] Invalid date format:', dateString);
    return null;
};

const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 3
    }
});

const uploadFields = upload.fields([
    { name: 'plate_image', maxCount: 1 },
    { name: 'plate_image_cropped', maxCount: 1 },
    { name: 'plate_image_processed', maxCount: 1 }
]);

const updateBlacklist = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;
        
        // THÊM: Debug logging
        console.log('=== UPDATE BLACKLIST DEBUG ===');
        console.log('Request params:', req.params);
        console.log('Request body:', req.body);
        console.log('Request files:', req.files ? Object.keys(req.files) : 'No files');
        console.log('Content-Type:', req.get('Content-Type'));
        console.log('===============================');
        
        const {
            location_id,
            plate_number,
            vehicle_id,
            violation_type,
            reason,
            severity,
            owner_name,
            owner_phone,
            valid_from,
            valid_to,
            description,
            evidence_files,
            is_active,
            // OCR related fields
            ocr_raw_text,
            ocr_confidence,
            verification_status,
            verified_plate_number,
            // Image replacement options
            replace_images = 'false'
        } = req.body;

        // Check if blacklist entry exists
        const [existingEntry] = await connection.execute(
            `SELECT b.*, l.name as location_name, v.plate_number as vehicle_plate
             FROM vehicle_blacklist b
             LEFT JOIN locations l ON b.location_id = l.id
             LEFT JOIN vehicles v ON b.vehicle_id = v.id
             WHERE b.id = ?`,
            [id]
        );

        if (existingEntry.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy blacklist entry'
            });
        }

        const currentEntry = existingEntry[0];

        // Check if location exists (if location_id is being updated)
        if (location_id && location_id !== currentEntry.location_id) {
            const [locationExists] = await connection.execute(
                'SELECT id FROM locations WHERE id = ? AND is_active = 1',
                [location_id]
            );

            if (locationExists.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy vị trí'
                });
            }
        }

        // Check if vehicle exists (if vehicle_id is being updated)
        if (vehicle_id && vehicle_id !== currentEntry.vehicle_id) {
            const [vehicleExists] = await connection.execute(
                'SELECT id, plate_number FROM vehicles WHERE id = ? AND is_active = 1',
                [vehicle_id]
            );

            if (vehicleExists.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy phương tiện'
                });
            }

            // Check if plate numbers match
            const newPlateNumber = plate_number || currentEntry.plate_number;
            if (vehicleExists[0].plate_number !== newPlateNumber) {
                return res.status(400).json({
                    success: false,
                    message: 'Biển số không khớp với thông tin phương tiện'
                });
            }
        }

        // Check for duplicate entry if plate_number or location_id is being changed
        const newPlateNumber = plate_number || currentEntry.plate_number;
        const newLocationId = location_id || currentEntry.location_id;

        if (plate_number !== currentEntry.plate_number || location_id !== currentEntry.location_id) {
            const [duplicateEntry] = await connection.execute(
                'SELECT id FROM vehicle_blacklist WHERE location_id = ? AND plate_number = ? AND id != ? AND is_active = 1',
                [newLocationId, newPlateNumber, id]
            );

            if (duplicateEntry.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Biển số này đã có trong danh sách đen tại vị trí này'
                });
            }
        }

        // Validate violation type and severity
        if (violation_type) {
            const validViolationTypes = ['unauthorized', 'security_threat', 'unpaid_fine', 'banned', 'suspicious', 'other'];
            if (!validViolationTypes.includes(violation_type)) {
                return res.status(400).json({
                    success: false,
                    message: 'Loại vi phạm không hợp lệ'
                });
            }
        }

        if (severity) {
            const validSeverities = ['low', 'medium', 'high', 'critical'];
            if (!validSeverities.includes(severity)) {
                return res.status(400).json({
                    success: false,
                    message: 'Mức độ nghiêm trọng không hợp lệ'
                });
            }
        }

        // Validate date range
        const newValidFrom = valid_from || currentEntry.valid_from;
        const newValidTo = valid_to || currentEntry.valid_to;
        
        if (newValidFrom && newValidTo && new Date(newValidFrom) > new Date(newValidTo)) {
            return res.status(400).json({
                success: false,
                message: 'Ngày bắt đầu không thể sau ngày kết thúc'
            });
        }

        // Validate phone format if provided
        if (owner_phone && owner_phone.trim() !== '') {
            const phoneRegex = /^(\+84|84|0)(3|5|7|8|9)[0-9]{8}$/;
            if (!phoneRegex.test(owner_phone.replace(/\s+/g, ''))) {
                return res.status(400).json({
                    success: false,
                    message: 'Định dạng số điện thoại không hợp lệ'
                });
            }
        }

        // Handle uploaded images
        let newImagePaths = {
            plate_image_path: currentEntry.plate_image_path,
            plate_image_cropped_path: currentEntry.plate_image_cropped_path,
            plate_image_processed_path: currentEntry.plate_image_processed_path
        };
        let newImageMetadata = parseImageMetadata(currentEntry.image_metadata);

        let oldImagesToDelete = [];
        let detectedPlateImage = currentEntry.detected_plate_image || null;
        let ocrUpdateData = null;
        
        // SỬA: Chỉ xử lý ảnh khi có files
        if (req.files && Object.keys(req.files).length > 0) {
            if (req.files.plate_image) {
                if (replace_images === 'true' && currentEntry.plate_image_path) {
                    oldImagesToDelete.push(currentEntry.plate_image_path);
                }
                newImagePaths.plate_image_path = req.files.plate_image[0].path;
                newImageMetadata.original = {
                    filename: req.files.plate_image[0].filename,
                    size: req.files.plate_image[0].size,
                    mimetype: req.files.plate_image[0].mimetype,
                    updated_at: new Date()
                };
                
                // THÊM: Detect lại biển số từ ảnh mới
                try {
                    const pythonScript = path.join(__dirname, '../WhiteList/detect_plate.py');
                    const imagePath = req.files.plate_image[0].path;
                    
                    console.log('[DEBUG] Python script path:', pythonScript);
                    console.log('[DEBUG] Image path:', imagePath);
                    
                    const result = execSync(`python "${pythonScript}" --image "${imagePath}" --save-crop`).toString();
                    const lines = result.trim().split('\n');
                    const lastLine = lines[lines.length - 1];
                    
                    console.log('[DEBUG] Python output:', result);
                    console.log('[DEBUG] Last line:', lastLine);
                    
                    const ocrResult = JSON.parse(lastLine);
                    
                    detectedPlateImage = ocrResult.detected_plate_image || null;
                    if (detectedPlateImage && !detectedPlateImage.startsWith('/uploads/blacklist/detected_plates/')) {
                        const fileName = detectedPlateImage.split('/').pop();
                        detectedPlateImage = `/uploads/blacklist/detected_plates/${fileName}`;
                    }
                    
                   if (ocrResult.plate_text) {  // SỬA: plate_text thay vì text
                        ocrUpdateData = {
                            ocr_raw_text: ocrResult.plate_text,  // SỬA: plate_text thay vì text
                            ocr_confidence: ocrResult.confidence || 0
                        };
                    }
                    
                    console.log('[DEBUG][UPDATE] detectedPlateImage:', detectedPlateImage);
                    console.log('[DEBUG][UPDATE] ocrUpdateData:', ocrUpdateData);
                    
                } catch (err) {
                    console.error('[UPDATE] OCR error:', err);
                    detectedPlateImage = currentEntry.detected_plate_image;
                    ocrUpdateData = null;
                }
            }
        
            if (req.files.plate_image_cropped) {
                if (replace_images === 'true' && currentEntry.plate_image_cropped_path) {
                    oldImagesToDelete.push(currentEntry.plate_image_cropped_path);
                }
                newImagePaths.plate_image_cropped_path = req.files.plate_image_cropped[0].path;
                newImageMetadata.cropped = {
                    filename: req.files.plate_image_cropped[0].filename,
                    size: req.files.plate_image_cropped[0].size,
                    mimetype: req.files.plate_image_cropped[0].mimetype,
                    updated_at: new Date()
                };
            }
        
            if (req.files.plate_image_processed) {
                if (replace_images === 'true' && currentEntry.plate_image_processed_path) {
                    oldImagesToDelete.push(currentEntry.plate_image_processed_path);
                }
                newImagePaths.plate_image_processed_path = req.files.plate_image_processed[0].path;
                newImageMetadata.processed = {
                    filename: req.files.plate_image_processed[0].filename,
                    size: req.files.plate_image_processed[0].size,
                    mimetype: req.files.plate_image_processed[0].mimetype,
                    updated_at: new Date()
                };
            }
        }

        // Validate evidence files format if provided
        let evidenceFilesJson = currentEntry.evidence_files;
        if (evidence_files !== undefined) {
            if (evidence_files === null) {
                evidenceFilesJson = null;
            } else {
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
        }

        // Prepare update data
        const updateFields = [];
        const updateValues = [];
        
       // SỬA: Cho phép update field với empty string và kiểm tra các giá trị có thay đổi không
if (location_id !== undefined && location_id !== currentEntry.location_id) {
    updateFields.push('location_id = ?');
    updateValues.push(location_id || null);
}
if (plate_number !== undefined && plate_number !== currentEntry.plate_number) {
    updateFields.push('plate_number = ?');
    updateValues.push(plate_number);
}
if (vehicle_id !== undefined && vehicle_id !== currentEntry.vehicle_id) {
    updateFields.push('vehicle_id = ?');
    updateValues.push(vehicle_id || null);
}
if (violation_type !== undefined && violation_type !== currentEntry.violation_type) {
    updateFields.push('violation_type = ?');
    updateValues.push(violation_type);
}
if (reason !== undefined && reason !== currentEntry.reason) {
    updateFields.push('reason = ?');
    updateValues.push(reason);
}
if (severity !== undefined && severity !== currentEntry.severity) {
    updateFields.push('severity = ?');
    updateValues.push(severity);
}
if (owner_name !== undefined && owner_name !== currentEntry.owner_name) {
    updateFields.push('owner_name = ?');
    updateValues.push(owner_name || null);
}
// Validate phone format if provided
if (owner_phone && owner_phone.trim() !== '') {
    const phoneRegex = /^(\+84|84|0)(3|5|7|8|9)[0-9]{8}$/;
    if (!phoneRegex.test(owner_phone.replace(/\s+/g, ''))) {
        console.log('Phone validation failed for:', owner_phone); // THÊM debug
        return res.status(400).json({
            success: false,
            message: 'Định dạng số điện thoại không hợp lệ',
            errors: [`Số điện thoại "${owner_phone}" không đúng định dạng`]
        });
    }
}
if (valid_from !== undefined) {
    const processedValidFrom = valid_from ? formatDateForMySQL(valid_from) : null;
    console.log('[BACKEND] valid_from processing:');
    console.log('  Input:', valid_from);
    console.log('  Processed:', processedValidFrom);
    console.log('  Current DB value:', currentEntry.valid_from);
    
    if (processedValidFrom !== currentEntry.valid_from) {
        updateFields.push('valid_from = ?');
        updateValues.push(processedValidFrom);
        console.log('[BACKEND] valid_from will be updated to:', processedValidFrom);
    } else {
        console.log('[BACKEND] valid_from unchanged');
    }
}
if (valid_to !== undefined) {
    const processedValidTo = valid_to ? formatDateForMySQL(valid_to) : null;
    console.log('[BACKEND] valid_to processing:');
    console.log('  Input:', valid_to);
    console.log('  Processed:', processedValidTo);
    console.log('  Current DB value:', currentEntry.valid_to);
    
    if (processedValidTo !== currentEntry.valid_to) {
        updateFields.push('valid_to = ?');
        updateValues.push(processedValidTo);
        console.log('[BACKEND] valid_to will be updated to:', processedValidTo);
    } else {
        console.log('[BACKEND] valid_to unchanged');
    }
}
if (description !== undefined && description !== currentEntry.description) {
    updateFields.push('description = ?');
    updateValues.push(description || null);
}
        if (evidence_files !== undefined) {
            updateFields.push('evidence_files = ?');
            updateValues.push(evidenceFilesJson ? JSON.stringify(evidenceFilesJson) : null);
        }
        
        // OCR data update
        if (ocrUpdateData && ocrUpdateData.ocr_raw_text) {
            updateFields.push('ocr_raw_text = ?');
            updateValues.push(ocrUpdateData.ocr_raw_text);
            updateFields.push('ocr_confidence = ?');
            updateValues.push(ocrUpdateData.ocr_confidence);
            updateFields.push('ocr_processed_at = NOW()');
            console.log('[DEBUG] Adding OCR data to update:', ocrUpdateData);
        }
        
        // Manual OCR fields
        if (ocr_raw_text !== undefined && ocr_raw_text !== currentEntry.ocr_raw_text) {
            updateFields.push('ocr_raw_text = ?');
            updateValues.push(ocr_raw_text);
        }
        if (ocr_confidence !== undefined && ocr_confidence !== currentEntry.ocr_confidence) {
            updateFields.push('ocr_confidence = ?');
            updateValues.push(ocr_confidence);
            if (ocr_raw_text !== undefined || ocr_confidence !== undefined) {
                updateFields.push('ocr_processed_at = NOW()');
            }
        }
        if (verification_status !== undefined && verification_status !== currentEntry.verification_status) {
            updateFields.push('verification_status = ?');
            updateValues.push(verification_status);
        }
        if (verified_plate_number !== undefined && verified_plate_number !== currentEntry.verified_plate_number) {
            updateFields.push('verified_plate_number = ?');
            updateValues.push(verified_plate_number);
        }

        // Image updates - chỉ update khi có file mới
        if (req.files && Object.keys(req.files).length > 0) {
            updateFields.push('plate_image_path = ?');
            updateValues.push(newImagePaths.plate_image_path);
            
            updateFields.push('plate_image_cropped_path = ?');
            updateValues.push(newImagePaths.plate_image_cropped_path);
            
            updateFields.push('plate_image_processed_path = ?');
            updateValues.push(newImagePaths.plate_image_processed_path);
            
            updateFields.push('image_metadata = ?');
            updateValues.push(JSON.stringify(newImageMetadata));
            
            updateFields.push('detected_plate_image = ?');
            updateValues.push(detectedPlateImage);
        }

        if (is_active !== undefined && (is_active ? 1 : 0) !== currentEntry.is_active) {
            updateFields.push('is_active = ?');
            updateValues.push(is_active ? 1 : 0);
        }

        // SỬA: Kiểm tra có field nào thay đổi không
        if (updateFields.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'Không có thay đổi nào để cập nhật',
                data: currentEntry
            });
        }

        // Add updated_at
        updateFields.push('updated_at = NOW()');
        updateValues.push(id);

        await connection.beginTransaction();

        try {
            // Update blacklist entry
            await connection.execute(
                `UPDATE vehicle_blacklist SET ${updateFields.join(', ')} WHERE id = ?`,
                updateValues
            );

            // Delete old images if replacing
            for (const oldImagePath of oldImagesToDelete) {
                try {
                    await fs.unlink(oldImagePath);
                    console.log(`Deleted old image: ${oldImagePath}`);
                } catch (unlinkError) {
                    console.warn(`Could not delete old image ${oldImagePath}:`, unlinkError.message);
                }
            }

            await connection.commit();

        } catch (error) {
            await connection.rollback();
            
            // Clean up newly uploaded files on error
            if (req.files) {
                const newFilesToDelete = [];
                if (req.files.plate_image) newFilesToDelete.push(req.files.plate_image[0].path);
                if (req.files.plate_image_cropped) newFilesToDelete.push(req.files.plate_image_cropped[0].path);
                if (req.files.plate_image_processed) newFilesToDelete.push(req.files.plate_image_processed[0].path);
                
                for (const filePath of newFilesToDelete) {
                    try {
                        await fs.unlink(filePath);
                    } catch (unlinkError) {
                        console.error('Error deleting uploaded file:', unlinkError);
                    }
                }
            }
            throw error;
        }

        const [updatedEntry] = await connection.execute(
            `SELECT b.*, l.name as location_name, l.code as location_code, l.zone_type,
                    v.make, v.model, v.color, v.vehicle_type,
                    u.name as created_by_name,
                    CASE 
                        WHEN b.valid_from IS NULL AND b.valid_to IS NULL THEN 'permanent'
                        WHEN b.valid_from IS NOT NULL AND b.valid_from > CURDATE() THEN 'future'
                        WHEN b.valid_to IS NOT NULL AND b.valid_to < CURDATE() THEN 'expired'
                        ELSE 'active'
                    END as current_status,
                    CASE 
                        WHEN b.plate_image_path IS NOT NULL OR b.plate_image_cropped_path IS NOT NULL OR b.plate_image_processed_path IS NOT NULL THEN TRUE
                        ELSE FALSE
                    END as has_images
             FROM vehicle_blacklist b
             LEFT JOIN locations l ON b.location_id = l.id
             LEFT JOIN vehicles v ON b.vehicle_id = v.id
             LEFT JOIN users u ON b.created_by = u.id
             WHERE b.id = ?`,
            [id]
        );

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, 
                                    old_values, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'UPDATE', 'BLACKLIST', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                id,
                JSON.stringify({
                    ...currentEntry,
                    image_metadata: null
                }),
                JSON.stringify({
                    ...req.body,
                    has_new_images: req.files ? Object.keys(req.files).length > 0 : false,
                    replaced_images: oldImagesToDelete.length > 0,
                    deleted_old_images_count: oldImagesToDelete.length,
                    updated_fields_count: updateFields.length - 1 // Subtract updated_at
                }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        const responseData = {
            ...updatedEntry[0],
            // Ensure image paths are correctly returned
            detected_plate_image: detectedPlateImage || updatedEntry[0].detected_plate_image,
            plate_image_path: newImagePaths.plate_image_path || updatedEntry[0].plate_image_path,
            plate_image_cropped_path: newImagePaths.plate_image_cropped_path || updatedEntry[0].plate_image_cropped_path,
            plate_image_processed_path: newImagePaths.plate_image_processed_path || updatedEntry[0].plate_image_processed_path,
            update_info: {
                updated_fields: updateFields.filter(field => !field.includes('updated_at')),
                has_new_images: req.files ? Object.keys(req.files).length > 0 : false,
                replaced_images_count: oldImagesToDelete.length,
                ocr_updated: ocrUpdateData ? true : false,
                new_detected_plate_image: detectedPlateImage
            }
        };

        console.log('[DEBUG] Final response data:', {
            id: responseData.id,
            plate_number: responseData.plate_number,
            detected_plate_image: responseData.detected_plate_image,
            plate_image_path: responseData.plate_image_path,
            has_new_images: responseData.update_info.has_new_images
        });

        res.status(200).json({
            success: true,
            message: 'Cập nhật blacklist entry thành công',
            data: responseData
        });

    } catch (error) {
        console.error('Error updating blacklist entry:', error);
        
        // Handle duplicate key error
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                message: 'Biển số này đã có trong danh sách đen tại vị trí này'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật blacklist entry',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const updateBlacklistStatus = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;
        const { is_active } = req.body;

        if (typeof is_active !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'is_active phải là boolean'
            });
        }

        // Check if blacklist entry exists
        const [existingEntry] = await connection.execute(
            'SELECT id, plate_number, is_active, location_id FROM vehicle_blacklist WHERE id = ?',
            [id]
        );

        if (existingEntry.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy blacklist entry'
            });
        }

        const currentEntry = existingEntry[0];

        // If activating, check for duplicates
        if (is_active && !currentEntry.is_active) {
            const [duplicateEntry] = await connection.execute(
                'SELECT id FROM vehicle_blacklist WHERE location_id = ? AND plate_number = ? AND id != ? AND is_active = 1',
                [currentEntry.location_id, currentEntry.plate_number, id]
            );

            if (duplicateEntry.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Không thể kích hoạt: Biển số này đã có trong danh sách đen tại vị trí này'
                });
            }
        }

        // Update status
        await connection.execute(
            'UPDATE vehicle_blacklist SET is_active = ?, updated_at = NOW() WHERE id = ?',
            [is_active ? 1 : 0, id]
        );

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, 
                                    old_values, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'UPDATE_STATUS', 'BLACKLIST', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                id,
                JSON.stringify({ is_active: currentEntry.is_active }),
                JSON.stringify({ is_active }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Cập nhật blacklist entry thành công',
            data: {
                ...updatedEntry[0],
                // SỬA: Đảm bảo trả về đường dẫn ảnh đầy đủ
                detected_plate_image: detectedPlateImage || updatedEntry[0].detected_plate_image,
                plate_image_path: newImagePaths.plate_image_path || updatedEntry[0].plate_image_path,
                update_info: {
                updated_fields: updateFields.filter(field => !field.includes('updated_at')),
                has_new_images: req.files ? Object.keys(req.files).length > 0 : false,
                replaced_images_count: oldImagesToDelete.length
                }
            }
            });

    } catch (error) {
        console.error('Error updating blacklist status:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật trạng thái blacklist entry',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const bulkUpdateBlacklist = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { ids, update_data } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Danh sách IDs không hợp lệ'
            });
        }

        if (!update_data || Object.keys(update_data).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Dữ liệu cập nhật không hợp lệ'
            });
        }

        const allowedFields = [
            'is_active', 'violation_type', 'severity', 'valid_from', 'valid_to', 
            'description', 'owner_name', 'owner_phone', 'reason',
            'verification_status', 'verified_plate_number'
        ];

        // Validate update fields
        const updateFields = [];
        const updateValues = [];

        for (const [field, value] of Object.entries(update_data)) {
            if (allowedFields.includes(field)) {
                // Validate specific fields
                if (field === 'violation_type') {
                    const validViolationTypes = ['unauthorized', 'security_threat', 'unpaid_fine', 'banned', 'suspicious', 'other'];
                    if (!validViolationTypes.includes(value)) {
                        return res.status(400).json({
                            success: false,
                            message: 'Loại vi phạm không hợp lệ'
                        });
                    }
                }
                
                if (field === 'severity') {
                    const validSeverities = ['low', 'medium', 'high', 'critical'];
                    if (!validSeverities.includes(value)) {
                        return res.status(400).json({
                            success: false,
                            message: 'Mức độ nghiêm trọng không hợp lệ'
                        });
                    }
                }

                if (field === 'verification_status') {
                    const validStatuses = ['pending', 'ocr_matched', 'manually_verified', 'rejected'];
                    if (!validStatuses.includes(value)) {
                        return res.status(400).json({
                            success: false,
                            message: 'Trạng thái xác minh không hợp lệ'
                        });
                    }
                }

                updateFields.push(`${field} = ?`);
                updateValues.push(value);
            }
        }

        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Không có trường hợp lệ để cập nhật'
            });
        }

        // Add updated_at
        updateFields.push('updated_at = NOW()');

        // Prepare WHERE clause
        const placeholders = ids.map(() => '?').join(',');
        updateValues.push(...ids);

        // Get existing entries for logging
        const [existingEntries] = await connection.execute(
            `SELECT id, plate_number, location_id, violation_type, severity, is_active
             FROM vehicle_blacklist WHERE id IN (${placeholders})`,
            ids
        );

        // Perform bulk update
        const [result] = await connection.execute(
            `UPDATE vehicle_blacklist SET ${updateFields.join(', ')} WHERE id IN (${placeholders})`,
            updateValues
        );

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, 
                                    new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'BULK_UPDATE', 'BLACKLIST', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                JSON.stringify({ 
                    ids, 
                    update_data, 
                    affected_rows: result.affectedRows,
                    existing_entries: existingEntries
                }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: `Cập nhật thành công ${result.affectedRows} blacklist entries`,
            data: {
                updated_count: result.affectedRows,
                requested_count: ids.length,
                updated_fields: Object.keys(update_data),
                entries_found: existingEntries.length
            }
        });

    } catch (error) {
        console.error('Error bulk updating blacklist:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật nhiều blacklist entries',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const extendBlacklistValidity = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;
        const { extend_days, new_valid_to, extend_reason } = req.body;

        if (!extend_days && !new_valid_to) {
            return res.status(400).json({
                success: false,
                message: 'extend_days hoặc new_valid_to là bắt buộc'
            });
        }

        // Check if blacklist entry exists
        const [existingEntry] = await connection.execute(
            'SELECT id, plate_number, valid_to, description FROM vehicle_blacklist WHERE id = ?',
            [id]
        );

        if (existingEntry.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy blacklist entry'
            });
        }

        const currentEntry = existingEntry[0];
        let newValidTo;

        if (new_valid_to) {
            newValidTo = new_valid_to;
        } else {
            // Calculate new valid_to date
            const baseDate = currentEntry.valid_to ? new Date(currentEntry.valid_to) : new Date();
            baseDate.setDate(baseDate.getDate() + parseInt(extend_days));
            newValidTo = baseDate.toISOString().split('T')[0];
        }

        // Validate new date is in the future
        if (new Date(newValidTo) <= new Date()) {
            return res.status(400).json({
                success: false,
                message: 'Ngày hết hạn mới phải trong tương lai'
            });
        }

        // Update valid_to and add extension note
        let updateQuery = 'UPDATE vehicle_blacklist SET valid_to = ?, updated_at = NOW()';
        let updateParams = [newValidTo];

        if (extend_reason) {
            const currentDescription = currentEntry.description || '';
            const extensionNote = `\n--- Gia hạn (${new Date().toISOString()}): ${extend_reason}`;
            updateQuery += ', description = ?';
            updateParams.push(currentDescription + extensionNote);
        }

        updateQuery += ' WHERE id = ?';
        updateParams.push(id);

        await connection.execute(updateQuery, updateParams);

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, 
                                    old_values, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'EXTEND_VALIDITY', 'BLACKLIST', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                id,
                JSON.stringify({ valid_to: currentEntry.valid_to }),
                JSON.stringify({ 
                    valid_to: newValidTo, 
                    extend_days: extend_days || null,
                    extend_reason: extend_reason || null
                }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Gia hạn blacklist entry thành công',
            data: {
                id: parseInt(id),
                plate_number: currentEntry.plate_number,
                old_valid_to: currentEntry.valid_to,
                new_valid_to: newValidTo,
                extend_days: extend_days || null,
                extend_reason: extend_reason || null
            }
        });

    } catch (error) {
        console.error('Error extending blacklist validity:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi gia hạn blacklist entry',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const updateBlacklistOCRData = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;
        const {
            ocr_raw_text,
            ocr_confidence,
            verification_status,
            verified_plate_number,
            verification_notes
        } = req.body;

        // Validation
        if (ocr_confidence !== undefined && (ocr_confidence < 0 || ocr_confidence > 1)) {
            return res.status(400).json({
                success: false,
                message: 'ocr_confidence phải trong khoảng 0-1'
            });
        }

        if (verification_status && !['pending', 'ocr_matched', 'manually_verified', 'rejected'].includes(verification_status)) {
            return res.status(400).json({
                success: false,
                message: 'verification_status không hợp lệ'
            });
        }

        // Check if blacklist entry exists
        const [existingEntry] = await connection.execute(
            'SELECT * FROM vehicle_blacklist WHERE id = ?',
            [id]
        );

        if (existingEntry.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy blacklist entry'
            });
        }

        const currentEntry = existingEntry[0];

        // Prepare update fields
        const updateFields = [];
        const updateValues = [];

        if (ocr_raw_text !== undefined) {
            updateFields.push('ocr_raw_text = ?');
            updateValues.push(ocr_raw_text);
        }

        if (ocr_confidence !== undefined) {
            updateFields.push('ocr_confidence = ?');
            updateValues.push(ocr_confidence);
        }

        if (ocr_raw_text !== undefined || ocr_confidence !== undefined) {
            updateFields.push('ocr_processed_at = NOW()');
        }

        if (verification_status !== undefined) {
            updateFields.push('verification_status = ?');
            updateValues.push(verification_status);
        }

        if (verified_plate_number !== undefined) {
            updateFields.push('verified_plate_number = ?');
            updateValues.push(verified_plate_number);
        }

        if (verification_notes) {
            const currentDescription = currentEntry.description || '';
            const verificationNote = `\n--- Xác minh OCR (${new Date().toISOString()}): ${verification_notes}`;
            updateFields.push('description = ?');
            updateValues.push(currentDescription + verificationNote);
        }

        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Không có dữ liệu OCR để cập nhật'
            });
        }

        updateFields.push('updated_at = NOW()');
        updateValues.push(id);

        // Update OCR data
        await connection.execute(
            `UPDATE vehicle_blacklist SET ${updateFields.join(', ')} WHERE id = ?`,
            updateValues
        );

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, 
                                    old_values, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'UPDATE_OCR', 'BLACKLIST', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                id,
                JSON.stringify({
                    ocr_raw_text: currentEntry.ocr_raw_text,
                    ocr_confidence: currentEntry.ocr_confidence,
                    verification_status: currentEntry.verification_status,
                    verified_plate_number: currentEntry.verified_plate_number
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
                plate_number: currentEntry.plate_number,
                ocr_raw_text: ocr_raw_text !== undefined ? ocr_raw_text : currentEntry.ocr_raw_text,
                ocr_confidence: ocr_confidence !== undefined ? ocr_confidence : currentEntry.ocr_confidence,
                verification_status: verification_status || currentEntry.verification_status,
                verified_plate_number: verified_plate_number !== undefined ? verified_plate_number : currentEntry.verified_plate_number,
                verification_notes: verification_notes || null
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

const replaceBlacklistImages = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;

        if (!req.files || Object.keys(req.files).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Không có file ảnh để thay thế'
            });
        }

        // Check if blacklist entry exists
        const [existingEntry] = await connection.execute(
            'SELECT * FROM vehicle_blacklist WHERE id = ?',
            [id]
        );

        if (existingEntry.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy blacklist entry'
            });
        }

        const currentEntry = existingEntry[0];
        const oldImagesToDelete = [];
        const newImagePaths = {};
        const newImageMetadata = parseImageMetadata(currentEntry.image_metadata);

        await connection.beginTransaction();

        try {
            // Handle image replacements
            if (req.files.plate_image) {
                if (currentEntry.plate_image_path) {
                    oldImagesToDelete.push(currentEntry.plate_image_path);
                }
                newImagePaths.plate_image_path = req.files.plate_image[0].path;
                newImageMetadata.original = {
                    filename: req.files.plate_image[0].filename,
                    size: req.files.plate_image[0].size,
                    mimetype: req.files.plate_image[0].mimetype,
                    replaced_at: new Date()
                };
            }

            if (req.files.plate_image_cropped) {
                if (currentEntry.plate_image_cropped_path) {
                    oldImagesToDelete.push(currentEntry.plate_image_cropped_path);
                }
                newImagePaths.plate_image_cropped_path = req.files.plate_image_cropped[0].path;
                newImageMetadata.cropped = {
                    filename: req.files.plate_image_cropped[0].filename,
                    size: req.files.plate_image_cropped[0].size,
                    mimetype: req.files.plate_image_cropped[0].mimetype,
                    replaced_at: new Date()
                };
            }

            if (req.files.plate_image_processed) {
                if (currentEntry.plate_image_processed_path) {
                    oldImagesToDelete.push(currentEntry.plate_image_processed_path);
                }
                newImagePaths.plate_image_processed_path = req.files.plate_image_processed[0].path;
                newImageMetadata.processed = {
                    filename: req.files.plate_image_processed[0].filename,
                    size: req.files.plate_image_processed[0].size,
                    mimetype: req.files.plate_image_processed[0].mimetype,
                    replaced_at: new Date()
                };
            }

            // Update database with new image paths
            const updateFields = [];
            const updateValues = [];

            Object.keys(newImagePaths).forEach(field => {
                updateFields.push(`${field} = ?`);
                updateValues.push(newImagePaths[field]);
            });

            updateFields.push('image_metadata = ?', 'updated_at = NOW()');
            updateValues.push(JSON.stringify(newImageMetadata), id);

            await connection.execute(
                `UPDATE vehicle_blacklist SET ${updateFields.join(', ')} WHERE id = ?`,
                updateValues
            );

            // Delete old images
            for (const oldImagePath of oldImagesToDelete) {
                try {
                    await fs.unlink(oldImagePath);
                    console.log(`Deleted old image: ${oldImagePath}`);
                } catch (unlinkError) {
                    console.warn(`Could not delete old image ${oldImagePath}:`, unlinkError.message);
                }
            }

            await connection.commit();

            // Log access
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, 
                                        old_values, new_values, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'REPLACE_IMAGES', 'BLACKLIST', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user.userId,
                    req.user.username || req.user.email,
                    id,
                    JSON.stringify({ 
                        old_image_paths: oldImagesToDelete 
                    }),
                    JSON.stringify({ 
                        new_image_paths: newImagePaths,
                        replaced_count: Object.keys(newImagePaths).length
                    }),
                    req.ip,
                    req.get('User-Agent')
                ]
            );

            res.status(200).json({
                success: true,
                message: `Thay thế thành công ${Object.keys(newImagePaths).length} ảnh`,
                data: {
                    id: parseInt(id),
                    plate_number: currentEntry.plate_number,
                    replaced_images: Object.keys(newImagePaths),
                    new_image_paths: newImagePaths,
                    deleted_old_images_count: oldImagesToDelete.length
                }
            });

        } catch (error) {
            await connection.rollback();
            
            // Clean up newly uploaded files on error
            const newFilesToDelete = [];
            Object.values(req.files).flat().forEach(file => {
                newFilesToDelete.push(file.path);
            });
            
            for (const filePath of newFilesToDelete) {
                try {
                    await fs.unlink(filePath);
                } catch (unlinkError) {
                    console.error('Error deleting uploaded file:', unlinkError);
                }
            }
            throw error;
        }

    } catch (error) {
        console.error('Error replacing blacklist images:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi thay thế ảnh blacklist',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    updateBlacklist,
    updateBlacklistStatus,
    bulkUpdateBlacklist,
    extendBlacklistValidity,
    updateBlacklistOCRData,
    replaceBlacklistImages,
    uploadFields 
};