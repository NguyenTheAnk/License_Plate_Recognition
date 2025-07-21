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
        // Ảnh upload gốc lưu vào public/uploads/blacklist
        const uploadDir = path.join(__dirname, '../../public/uploads/blacklist/');
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

const formatDateForMySQL = (dateString) => {
    if (!dateString) return null;
    
    console.log('[BACKEND] formatDateForMySQL input:', dateString, typeof dateString);
    
    // Nếu đã là định dạng YYYY-MM-DD thì return luôn
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        console.log('[BACKEND] Already YYYY-MM-DD format:', dateString);
        return dateString;
    }
    
    let year, month, day;
    
    if (dateString.includes('/')) {
        // Frontend gửi format dd/MM/yyyy
        const parts = dateString.split('/');
        if (parts.length === 3) {
            day = parseInt(parts[0]);
            month = parseInt(parts[1]);
            year = parseInt(parts[2]);
        }
    } else if (dateString.includes('-')) {
        // YYYY-MM-DD format
        [year, month, day] = dateString.split('-').map(num => parseInt(num));
    } else if (dateString.includes('T')) {
        // ISO string - chỉ lấy phần date
        const datePart = dateString.split('T')[0];
        console.log('[BACKEND] ISO string date part:', datePart);
        return datePart;
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
        
        // THÊM: Debug logging chi tiết hơn
        console.log('=== UPDATE BLACKLIST DEBUG ===');
        console.log('Request params:', req.params);
        console.log('Request body raw:', req.body);
        console.log('Request files:', req.files ? Object.keys(req.files) : 'No files');
        console.log('Content-Type:', req.get('Content-Type'));
        
        // SỬA: Xử lý FormData duplicates và convert types
        const processFormData = (body) => {
            const processed = {};
            
            Object.keys(body).forEach(key => {
                let value = body[key];
                
                // Xử lý array values (từ FormData duplicates)
                if (Array.isArray(value)) {
                    // Lấy giá trị cuối cùng (thường là giá trị mới nhất)
                    value = value[value.length - 1];
                    console.log(`[PROCESS] Array detected for ${key}:`, body[key], '-> taking last value:', value);
                }
                
                // Convert to string nếu cần và xử lý null/undefined
                if (value !== null && value !== undefined) {
                    processed[key] = String(value).trim();
                } else {
                    processed[key] = '';
                }
                
                // Convert empty string to null for certain fields
                if (processed[key] === '' && ['vehicle_id', 'owner_name', 'owner_phone', 'description', 'valid_from', 'valid_to'].includes(key)) {
                    processed[key] = null;
                }
            });
            
            return processed;
        };
        
        // Process form data
        const cleanedBody = processFormData(req.body);
        console.log('Cleaned body:', cleanedBody);
        
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
        } = cleanedBody;

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

        // SỬA: Logic kiểm tra thay đổi an toàn với type checking
        const safeCompare = (newVal, oldVal) => {
            // Convert both values to string safely
            const newStr = (newVal === null || newVal === undefined) ? '' : String(newVal).trim();
            const oldStr = (oldVal === null || oldVal === undefined) ? '' : String(oldVal).trim();
            
            return newStr !== oldStr;
        };

        // SỬA: Validate phone với type checking an toàn
        const validatePhone = (phone) => {
            if (!phone) return true; // Empty phone is valid
            
            // Ensure phone is string
            const phoneStr = String(phone).trim();
            if (phoneStr === '') return true;
            
            const phoneRegex = /^(\+84|84|0)(3|5|7|8|9)[0-9]{8}$/;
            return phoneRegex.test(phoneStr.replace(/\s+/g, ''));
        };

        // Prepare update data
        const updateFields = [];
        const updateValues = [];
        
        // Location ID
        if (location_id !== undefined && safeCompare(location_id, currentEntry.location_id)) {
            updateFields.push('location_id = ?');
            updateValues.push(location_id || null);
            console.log('[UPDATE] location_id:', currentEntry.location_id, '->', location_id);
        }

        // Plate Number
        if (plate_number !== undefined && safeCompare(plate_number, currentEntry.plate_number)) {
            updateFields.push('plate_number = ?');
            updateValues.push(plate_number);
            console.log('[UPDATE] plate_number:', currentEntry.plate_number, '->', plate_number);
        }

        // Vehicle ID - convert to number if needed
        if (vehicle_id !== undefined && safeCompare(vehicle_id, currentEntry.vehicle_id)) {
            const vehicleIdNum = vehicle_id && vehicle_id !== '' ? parseInt(vehicle_id) : null;
            updateFields.push('vehicle_id = ?');
            updateValues.push(vehicleIdNum);
            console.log('[UPDATE] vehicle_id:', currentEntry.vehicle_id, '->', vehicleIdNum);
        }

        // Violation Type
        if (violation_type !== undefined && safeCompare(violation_type, currentEntry.violation_type)) {
            updateFields.push('violation_type = ?');
            updateValues.push(violation_type);
            console.log('[UPDATE] violation_type:', currentEntry.violation_type, '->', violation_type);
        }

        // Reason
        if (reason !== undefined && safeCompare(reason, currentEntry.reason)) {
            updateFields.push('reason = ?');
            updateValues.push(reason);
            console.log('[UPDATE] reason:', currentEntry.reason, '->', reason);
        }

        // Severity
        if (severity !== undefined && safeCompare(severity, currentEntry.severity)) {
            updateFields.push('severity = ?');
            updateValues.push(severity);
            console.log('[UPDATE] severity:', currentEntry.severity, '->', severity);
        }

        // Owner Name
        if (owner_name !== undefined && safeCompare(owner_name, currentEntry.owner_name)) {
            updateFields.push('owner_name = ?');
            updateValues.push(owner_name || null);
            console.log('[UPDATE] owner_name:', currentEntry.owner_name, '->', owner_name);
        }

        // Owner Phone with safe validation
        if (owner_phone !== undefined && safeCompare(owner_phone, currentEntry.owner_phone)) {
            // SỬA: Validate phone với type checking an toàn
            if (!validatePhone(owner_phone)) {
                return res.status(400).json({
                    success: false,
                    message: 'Định dạng số điện thoại không hợp lệ',
                    errors: [`Số điện thoại "${owner_phone}" không đúng định dạng`]
                });
            }
            
            updateFields.push('owner_phone = ?');
            updateValues.push(owner_phone || null);
            console.log('[UPDATE] owner_phone:', currentEntry.owner_phone, '->', owner_phone);
        }

        // Valid From Date
        if (valid_from !== undefined) {
            const processedValidFrom = valid_from ? formatDateForMySQL(valid_from) : null;
            
            let currentDbValidFrom = null;
            if (currentEntry.valid_from) {
                if (currentEntry.valid_from instanceof Date) {
                    currentDbValidFrom = currentEntry.valid_from.toISOString().split('T')[0];
                } else {
                    currentDbValidFrom = currentEntry.valid_from;
                }
            }
            
            console.log('[BACKEND] Comparing valid_from:', processedValidFrom, 'vs', currentDbValidFrom);
            
            if (processedValidFrom !== currentDbValidFrom) {
                updateFields.push('valid_from = ?');
                updateValues.push(processedValidFrom);
                console.log('[UPDATE] valid_from:', currentDbValidFrom, '->', processedValidFrom);
            }
        }

        // Valid To Date
        if (valid_to !== undefined) {
            const processedValidTo = valid_to ? formatDateForMySQL(valid_to) : null;
            
            let currentDbValidTo = null;
            if (currentEntry.valid_to) {
                if (currentEntry.valid_to instanceof Date) {
                    currentDbValidTo = currentEntry.valid_to.toISOString().split('T')[0];
                } else {
                    currentDbValidTo = currentEntry.valid_to;
                }
            }
            
            console.log('[BACKEND] Comparing valid_to:', processedValidTo, 'vs', currentDbValidTo);
            
            if (processedValidTo !== currentDbValidTo) {
                updateFields.push('valid_to = ?');
                updateValues.push(processedValidTo);
                console.log('[UPDATE] valid_to:', currentDbValidTo, '->', processedValidTo);
            }
        }

        // Description
        if (description !== undefined && safeCompare(description, currentEntry.description)) {
            updateFields.push('description = ?');
            updateValues.push(description || null);
            console.log('[UPDATE] description:', currentEntry.description, '->', description);
        }

        // Active status
        if (is_active !== undefined) {
            const activeValue = is_active === 'true' || is_active === true || is_active === 1 ? 1 : 0;
            if (activeValue !== currentEntry.is_active) {
                updateFields.push('is_active = ?');
                updateValues.push(activeValue);
                console.log('[UPDATE] is_active:', currentEntry.is_active, '->', activeValue);
            }
        }

        // Handle uploaded images nếu có
        let newImagePaths = {
            plate_image_path: currentEntry.plate_image_path,
            plate_image_cropped_path: currentEntry.plate_image_cropped_path,
            plate_image_processed_path: currentEntry.plate_image_processed_path
        };
        let newImageMetadata = parseImageMetadata(currentEntry.image_metadata);

        let oldImagesToDelete = [];
        let detectedPlateImage = currentEntry.detected_plate_image || null;
        let ocrUpdateData = null;
        
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
        
        // SỬA: QUAN TRỌNG - Detect lại biển số từ ảnh mới
        try {
            const pythonScript = path.join(__dirname, './detect_plate.py');
            const imagePath = req.files.plate_image[0].path;
            
            console.log('[DEBUG UPDATE] Python script path:', pythonScript);
            console.log('[DEBUG UPDATE] Image path:', imagePath);
            
            // Đảm bảo file tồn tại trước khi chạy OCR
            let fileExists = fsSync.existsSync(imagePath);
            let retryCount = 0;
            while (!fileExists && retryCount < 10) {
                console.warn(`[DEBUG UPDATE] File chưa tồn tại, thử delay 200ms lần ${retryCount + 1}:`, imagePath);
                await new Promise(resolve => setTimeout(resolve, 200));
                fileExists = fsSync.existsSync(imagePath);
                retryCount++;
            }

            if (fileExists) {
                const result = execSync(`python "${pythonScript}" --image "${imagePath}" --save-crop`).toString();
                const lines = result.trim().split('\n');
                const lastLine = lines[lines.length - 1];
                
                console.log('[DEBUG UPDATE] Python output:', result);
                console.log('[DEBUG UPDATE] Last line:', lastLine);
                
                const ocrResult = JSON.parse(lastLine);
                
                // SỬA: Update detected plate image path
                if (ocrResult.detected_plate_image) {
                    detectedPlateImage = ocrResult.detected_plate_image;
                    // Đảm bảo đường dẫn đúng subfolder
                    if (!detectedPlateImage.startsWith('/uploads/blacklist/detected_plates/')) {
                        const fileName = detectedPlateImage.split('/').pop();
                        detectedPlateImage = `/uploads/blacklist/detected_plates/${fileName}`;
                    }
                    console.log('[DEBUG UPDATE] New detected plate image:', detectedPlateImage);
                } else {
                    // Fallback: tìm file detected mới nhất
                    const detectedDir = path.join(__dirname, '../../public/uploads/blacklist/detected_plates/');
                    try {
                        const files = fsSync.readdirSync(detectedDir)
                            .filter(f => f.startsWith('detected_') && f.endsWith('.jpg'))
                            .map(f => ({ 
                                name: f, 
                                time: fsSync.statSync(path.join(detectedDir, f)).mtime.getTime() 
                            }))
                            .sort((a, b) => b.time - a.time);
                        
                        if (files.length > 0) {
                            detectedPlateImage = `/uploads/blacklist/detected_plates/${files[0].name}`;
                            console.log('[DEBUG UPDATE] Fallback detected plate image:', detectedPlateImage);
                        }
                    } catch (dirErr) {
                        console.warn('[DEBUG UPDATE] Lỗi khi đọc thư mục detected_plates:', dirErr.message);
                    }
                }
               
                if (ocrUpdateData && ocrUpdateData.ocr_raw_text) {
                        updateFields.push('ocr_raw_text = ?');
                        updateValues.push(ocrUpdateData.ocr_raw_text);
                        updateFields.push('ocr_confidence = ?');
                        updateValues.push(ocrUpdateData.ocr_confidence);
                        updateFields.push('ocr_processed_at = NOW()');
                        console.log('[DEBUG UPDATE] Adding OCR data to update:', ocrUpdateData);
                    }
                
            } else {
                console.error('[DEBUG UPDATE] File vẫn không tồn tại sau retry:', imagePath);
                detectedPlateImage = currentEntry.detected_plate_image; // Giữ nguyên ảnh cũ
            }
            
        } catch (err) {
            console.error('[UPDATE] OCR error:', err);
            detectedPlateImage = currentEntry.detected_plate_image; // Giữ nguyên ảnh cũ nếu lỗi
            ocrUpdateData = null;
        }
    }
    
    // SỬA: QUAN TRỌNG - Cập nhật các đường dẫn ảnh vào database
    updateFields.push('plate_image_path = ?');
    updateValues.push(newImagePaths.plate_image_path);
    
    updateFields.push('plate_image_cropped_path = ?');
    updateValues.push(newImagePaths.plate_image_cropped_path);
    
    updateFields.push('plate_image_processed_path = ?');
    updateValues.push(newImagePaths.plate_image_processed_path);
    
    updateFields.push('image_metadata = ?');
    updateValues.push(JSON.stringify(newImageMetadata));
    
    // SỬA: QUAN TRỌNG - Cập nhật detected_plate_image
    updateFields.push('detected_plate_image = ?');
    updateValues.push(detectedPlateImage);
    
    console.log('[DEBUG UPDATE] Final detected_plate_image to save:', detectedPlateImage);
}

        // Debug final update info
        console.log('[DEBUG] Final update fields:', updateFields);
        console.log('[DEBUG] Final update values:', updateValues);

        // Check if there are any changes
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

            await connection.commit();

            // Get updated entry
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

           const responseData = {
            ...updatedEntry[0],
            // SỬA: Đảm bảo detected_plate_image được trả về
            detected_plate_image: detectedPlateImage || updatedEntry[0].detected_plate_image,
            plate_image_path: newImagePaths.plate_image_path || updatedEntry[0].plate_image_path,
            plate_image_cropped_path: newImagePaths.plate_image_cropped_path || updatedEntry[0].plate_image_cropped_path,
            plate_image_processed_path: newImagePaths.plate_image_processed_path || updatedEntry[0].plate_image_processed_path,
            update_info: {
                updated_fields: updateFields.filter(field => !field.includes('updated_at')),
                has_new_images: req.files ? Object.keys(req.files).length > 0 : false,
                replaced_images_count: oldImagesToDelete.length,
                ocr_updated: ocrUpdateData ? true : false,
                new_detected_plate_image: detectedPlateImage,
                // SỬA: Thêm debug info
                original_detected_image: currentEntry.detected_plate_image,
                detected_image_changed: detectedPlateImage !== currentEntry.detected_plate_image
            }
        };

        console.log('[DEBUG RESPONSE] Final response data:', {
            id: responseData.id,
            plate_number: responseData.plate_number,
            detected_plate_image: responseData.detected_plate_image,
            plate_image_path: responseData.plate_image_path,
            has_new_images: responseData.update_info.has_new_images,
            detected_image_changed: responseData.update_info.detected_image_changed
        });

        res.status(200).json({
            success: true,
            message: 'Cập nhật blacklist entry thành công',
            data: responseData
        });
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
        } catch (error) {
            await connection.rollback();
            throw error;
        }

    } catch (error) {
        console.error('Error updating blacklist entry:', error);
        
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

        // Sau khi thực hiện UPDATE, lấy lại bản ghi vừa cập nhật từ DB
        const [updatedRows] = await db.query('SELECT * FROM blacklist WHERE id = ?', [id]);
        const updatedData = updatedRows && updatedRows[0] ? updatedRows[0] : null;

        if (!updatedData) {
          return res.status(404).json({ success: false, message: 'Không tìm thấy bản ghi sau khi cập nhật' });
        }

        res.status(200).json({
          success: true,
          message: 'Cập nhật trạng thái blacklist entry thành công',
          data: updatedData
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