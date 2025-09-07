const db = require('../../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
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
        // Ảnh upload gốc lưu vào public/uploads/whitelist
        const uploadDir = path.join(__dirname, '../../public/uploads/whitelist/');
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
        cb(null, `whitelist-update-${uniqueSuffix}${ext}`);
    }
});
const formatDateForMySQL = (dateString) => {
    if (!dateString) return null;
    
    // Nếu đã là định dạng YYYY-MM-DD thì return luôn
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return dateString;
    }
    
    // Chuyển đổi từ ISO datetime hoặc date object sang YYYY-MM-DD
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    
    return date.toISOString().split('T')[0];
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

const updateWhitelist = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;
        
        const {
            plate_number,
            vehicle_id,
            valid_from,
            valid_to,
            description,
            approval_status,
            is_active,
            // OCR related fields
            ocr_raw_text,
            ocr_confidence,
            verification_status,
            verified_plate_number,
            // Image replacement options
            replace_images = 'false'
        } = req.body;

        // Check if whitelist entry exists
        const [existingEntry] = await connection.execute(
            `SELECT w.*, v.plate_number as vehicle_plate
             FROM vehicle_whitelist w
             LEFT JOIN vehicles v ON w.vehicle_id = v.id
             WHERE w.id = ?`,
            [id]
        );

        if (existingEntry.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy whitelist entry'
            });
        }

        const currentEntry = existingEntry[0];      

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

        if (plate_number && plate_number !== currentEntry.plate_number) {
            const [duplicateEntry] = await connection.execute(
                'SELECT id FROM vehicle_whitelist WHERE plate_number = ? AND id != ? AND is_active = 1',
                [newPlateNumber, id]
            );

            if (duplicateEntry.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Biển số này đã có trong danh sách trắng tại vị trí này'
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
                    const pythonScript = path.join(__dirname, 'detect_plate.py');
                    const imagePath = req.files.plate_image[0].path;
                    const { execSync } = require('child_process');
                    
                  
                    
                    const result = execSync(`python "${pythonScript}" --image "${imagePath}" --save-crop`).toString();
                    const lines = result.trim().split('\n');
                    const lastLine = lines[lines.length - 1];
                    
                    
                    
                    const ocrResult = JSON.parse(lastLine);
                    
                    detectedPlateImage = ocrResult.detected_plate_image || null;
                    if (detectedPlateImage && !detectedPlateImage.startsWith('/uploads/whitelist/detected_plates/')) {
                        const fileName = detectedPlateImage.split('/').pop();
                        detectedPlateImage = `/uploads/whitelist/detected_plates/${fileName}`;
                    }
                    
                    if (ocrResult.plate_text) {
                        ocrUpdateData = {
                            ocr_raw_text: ocrResult.plate_text,
                            ocr_confidence: ocrResult.confidence || 0
                        };
                    }
                    
                    
                } catch (err) {
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

        // Prepare update data
        const updateFields = [];
        const updateValues = [];
        
        
        if (plate_number !== undefined && plate_number !== currentEntry.plate_number) {
            updateFields.push('plate_number = ?');
            updateValues.push(plate_number);
        }
        if (vehicle_id !== undefined && vehicle_id !== currentEntry.vehicle_id) {
            updateFields.push('vehicle_id = ?');
            updateValues.push(vehicle_id || null);
        }
       
        if (valid_from !== undefined) {
            const processedValidFrom = valid_from ? formatDateForMySQL(valid_from) : null;
            if (processedValidFrom !== currentEntry.valid_from) {
                updateFields.push('valid_from = ?');
                updateValues.push(processedValidFrom);
            }
        }
        if (valid_to !== undefined) {
            const processedValidTo = valid_to ? formatDateForMySQL(valid_to) : null;
            if (processedValidTo !== currentEntry.valid_to) {
                updateFields.push('valid_to = ?');
                updateValues.push(processedValidTo);
            }
        }
        if (description !== undefined && description !== currentEntry.description) {
            updateFields.push('description = ?');
            updateValues.push(description || null);
        }
        if (approval_status !== undefined && approval_status !== currentEntry.approval_status) {
            updateFields.push('approval_status = ?');
            updateValues.push(approval_status);
            
            // If approval status is being changed to approved, set approved_by and approved_at
            if (approval_status === 'approved' && currentEntry.approval_status !== 'approved') {
                updateFields.push('approved_by = ?', 'approved_at = NOW()');
                updateValues.push(req.user.userId);
            }
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
            // Update whitelist entry
            await connection.execute(
                `UPDATE vehicle_whitelist SET ${updateFields.join(', ')} WHERE id = ?`,
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

        // Get updated entry with related data
        const [updatedEntry] = await connection.execute(
            `SELECT w.*,
                    v.make, v.model, v.color, v.vehicle_type,
                    u1.name as created_by_name, u2.name as approved_by_name,
                    CASE 
                        WHEN w.valid_from IS NULL AND w.valid_to IS NULL THEN 'permanent'
                        WHEN w.valid_from IS NOT NULL AND w.valid_from > CURDATE() THEN 'future'
                        WHEN w.valid_to IS NOT NULL AND w.valid_to < CURDATE() THEN 'expired'
                        ELSE 'valid'
                    END as current_status,
                    CASE 
                        WHEN w.plate_image_path IS NOT NULL OR w.plate_image_cropped_path IS NOT NULL OR w.plate_image_processed_path IS NOT NULL THEN TRUE
                        ELSE FALSE
                    END as has_images
             FROM vehicle_whitelist w
             LEFT JOIN vehicles v ON w.vehicle_id = v.id
             LEFT JOIN users u1 ON w.created_by = u1.id
             LEFT JOIN users u2 ON w.approved_by = u2.id
             WHERE w.id = ?`,
            [id]
        );

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, 
                                    old_values, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'UPDATE', 'WHITELIST', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
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

        res.status(200).json({
            success: true,
            message: 'Cập nhật whitelist entry thành công',
            data: {
                ...updatedEntry[0],
                update_info: {
                    updated_fields: updateFields.filter(field => !field.includes('updated_at')),
                    has_new_images: req.files ? Object.keys(req.files).length > 0 : false,
                    replaced_images_count: oldImagesToDelete.length
                }
            }
        });

    } catch (error) {
        console.error('Error updating whitelist entry:', error);
        
        // Handle duplicate key error
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                message: 'Biển số này đã có trong danh sách trắng tại vị trí này'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật whitelist entry',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const updateWhitelistStatus = async (req, res) => {
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

        // Check if whitelist entry exists
        const [existingEntry] = await connection.execute(
            'SELECT id, plate_number, is_active FROM vehicle_whitelist WHERE id = ?',
            [id]
        );

        if (existingEntry.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy whitelist entry'
            });
        }

        const currentEntry = existingEntry[0];

        // If activating, check for duplicates
        if (is_active && !currentEntry.is_active) {
            const [duplicateEntry] = await connection.execute(
                'SELECT id FROM vehicle_whitelist WHERE plate_number = ? AND id != ? AND is_active = 1',
                [currentEntry.plate_number, id]
            );

            if (duplicateEntry.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Không thể kích hoạt: Biển số này đã có trong danh sách trắng tại vị trí này'
                });
            }
        }

        // Update status
        await connection.execute(
            'UPDATE vehicle_whitelist SET is_active = ?, updated_at = NOW() WHERE id = ?',
            [is_active ? 1 : 0, id]
        );

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, 
                                    old_values, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'UPDATE', 'WHITELIST', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                id,
                JSON.stringify({ is_active: currentEntry.is_active }),
                JSON.stringify({ is_active, action: 'update_status' }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: `${is_active ? 'Kích hoạt' : 'Vô hiệu hóa'} whitelist entry thành công`,
            data: {
                id: parseInt(id),
                plate_number: currentEntry.plate_number,
                is_active,
                previous_status: currentEntry.is_active
            }
        });

    } catch (error) {
        console.error('Error updating whitelist status:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật trạng thái whitelist entry',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const updateWhitelistApproval = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;
        const { approval_status, approval_notes } = req.body;

        if (!['pending', 'approved', 'rejected'].includes(approval_status)) {
            return res.status(400).json({
                success: false,
                message: 'approval_status không hợp lệ. Phải là: pending, approved, rejected'
            });
        }

        // Check if whitelist entry exists
        const [existingEntry] = await connection.execute(
            'SELECT id, plate_number, approval_status, description FROM vehicle_whitelist WHERE id = ?',
            [id]
        );

        if (existingEntry.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy whitelist entry'
            });
        }

        const currentEntry = existingEntry[0];

        // Update approval status
        let updateQuery = 'UPDATE vehicle_whitelist SET approval_status = ?, updated_at = NOW()';
        let updateParams = [approval_status];

        if (approval_status === 'approved') {
            updateQuery += ', approved_by = ?, approved_at = NOW()';
            updateParams.push(req.user.userId);
        } else if (approval_status === 'rejected') {
            // Clear approved_by and approved_at for rejected status
            updateQuery += ', approved_by = NULL, approved_at = NULL';
        }

        if (approval_notes) {
            const currentDescription = currentEntry.description || '';
            const updatedDescription = currentDescription + 
                `\n--- Ghi chú phê duyệt (${new Date().toISOString()}): ${approval_notes}`;
            updateQuery += ', description = ?';
            updateParams.push(updatedDescription);
        }

        updateQuery += ' WHERE id = ?';
        updateParams.push(id);

        await connection.execute(updateQuery, updateParams);

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, 
                                    old_values, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'UPDATE_APPROVAL', 'WHITELIST', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                id,
                JSON.stringify({ approval_status: currentEntry.approval_status }),
                JSON.stringify({ approval_status, approval_notes }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: `${approval_status === 'approved' ? 'Phê duyệt' : approval_status === 'rejected' ? 'Từ chối' : 'Cập nhật trạng thái'} whitelist entry thành công`,
            data: {
                id: parseInt(id),
                plate_number: currentEntry.plate_number,
                approval_status,
                approved_by: approval_status === 'approved' ? req.user.userId : null,
                previous_status: currentEntry.approval_status,
                approval_notes: approval_notes || null
            }
        });

    } catch (error) {
        console.error('Error updating whitelist approval:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật phê duyệt whitelist entry',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const bulkUpdateWhitelist = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { ids, update_data } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Danh sách IDs không hợp lệ'
            });
        }

        if (ids.length > 100) {
            return res.status(400).json({
                success: false,
                message: 'Không thể cập nhật quá 100 entries cùng lúc'
            });
        }

        if (!update_data || Object.keys(update_data).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Dữ liệu cập nhật không hợp lệ'
            });
        }

        const allowedFields = [
            'is_active', 'approval_status', 'valid_from', 'valid_to', 
            'description',
            'verification_status', 'verified_plate_number'
        ];

        // Validate update fields
        const updateFields = [];
        const updateValues = [];

        for (const [field, value] of Object.entries(update_data)) {
            if (allowedFields.includes(field)) {
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

        // Add approval fields if approval_status is being updated to approved
        if (update_data.approval_status === 'approved') {
            updateFields.push('approved_by = ?', 'approved_at = NOW()');
            updateValues.push(req.user.userId);
        } else if (update_data.approval_status === 'rejected') {
            updateFields.push('approved_by = NULL', 'approved_at = NULL');
        }

        // Add updated_at
        updateFields.push('updated_at = NOW()');

        // Get existing entries for logging
        const placeholders = ids.map(() => '?').join(',');
        const [existingEntries] = await connection.execute(
            `SELECT id, plate_number, approval_status, is_active
             FROM vehicle_whitelist WHERE id IN (${placeholders})`,
            ids
        );

        // Check for potential conflicts if activating entries
        if (update_data.is_active === true || update_data.is_active === 1) {
            const [conflicts] = await connection.execute(
                `SELECT w1.id, w1.plate_number,
                 FROM vehicle_whitelist w1
                 WHERE w1.id IN (${placeholders}) 
                 AND w1.is_active = 0
                 AND EXISTS (
                     SELECT 1 FROM vehicle_whitelist w2 
                     AND w2.plate_number = w1.plate_number 
                     AND w2.id != w1.id 
                     AND w2.is_active = 1
                 )`,
                ids
            );

            if (conflicts.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Một số entries không thể kích hoạt do trùng lặp biển số tại cùng vị trí',
                    conflicts: conflicts
                });
            }
        }

        // Prepare WHERE clause
        updateValues.push(...ids);

        await connection.beginTransaction();

        try {
            // Perform bulk update
            const [result] = await connection.execute(
                `UPDATE vehicle_whitelist SET ${updateFields.join(', ')} WHERE id IN (${placeholders})`,
                updateValues
            );

            await connection.commit();

            // Log access
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, 
                                        new_values, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'BULK_UPDATE', 'WHITELIST', ?, 'SUCCESS', ?, ?, NOW())`,
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
                message: `Cập nhật thành công ${result.affectedRows} whitelist entries`,
                data: {
                    updated_count: result.affectedRows,
                    requested_count: ids.length,
                    updated_fields: Object.keys(update_data),
                    entries_found: existingEntries.length
                }
            });

        } catch (error) {
            await connection.rollback();
            throw error;
        }

    } catch (error) {
        console.error('Error bulk updating whitelist:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật nhiều whitelist entries',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const extendWhitelistValidity = async (req, res) => {
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

        // Check if whitelist entry exists
        const [existingEntry] = await connection.execute(
            'SELECT id, plate_number, valid_to, description FROM vehicle_whitelist WHERE id = ?',
            [id]
        );

        if (existingEntry.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy whitelist entry'
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
        let updateQuery = 'UPDATE vehicle_whitelist SET valid_to = ?, updated_at = NOW()';
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
             VALUES (?, ?, 'EXTEND_VALIDITY', 'WHITELIST', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
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
            message: 'Gia hạn whitelist entry thành công',
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
        console.error('Error extending whitelist validity:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi gia hạn whitelist entry',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const updateWhitelistOCRData = async (req, res) => {
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
            `UPDATE vehicle_whitelist SET ${updateFields.join(', ')} WHERE id = ?`,
            updateValues
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

const replaceWhitelistImages = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;

        if (!req.files || Object.keys(req.files).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Không có file ảnh để thay thế'
            });
        }

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
                `UPDATE vehicle_whitelist SET ${updateFields.join(', ')} WHERE id = ?`,
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
                 VALUES (?, ?, 'REPLACE_IMAGES', 'WHITELIST', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
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
        console.error('Error replacing whitelist images:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi thay thế ảnh whitelist',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    updateWhitelist,
    updateWhitelistStatus,
    updateWhitelistApproval,
    bulkUpdateWhitelist,
    extendWhitelistValidity,
    updateWhitelistOCRData,
    replaceWhitelistImages,
    uploadFields 
};