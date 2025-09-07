const db = require('../db');
const { v4: uuidv4 } = require('uuid');

// Kiểm tra trùng lặp detection trong khoảng thời gian
const checkDuplicateDetection = async (plate_number, camera_id, location_id, time_window_seconds = 30) => {
    try {
        const query = `
            SELECT id, detected_at, confidence_score, cropped_plate_image_path
            FROM license_plate_detections 
            WHERE plate_number = ? 
            AND camera_id = ? 
            AND location_id = ? 
            AND detected_at >= DATE_SUB(NOW(), INTERVAL ? SECOND)
            ORDER BY detected_at DESC 
            LIMIT 1
        `;
        
        const [rows] = await db.execute(query, [plate_number, camera_id, location_id, time_window_seconds]);
        
        if (rows.length > 0) {
            const { id, detected_at, confidence_score, cropped_plate_image_path } = rows[0];
            console.log(`🔄 Duplicate detection found for ${plate_number} at ${detected_at} (confidence: ${confidence_score})`);
            return { isDuplicate: true, id, detected_at, confidence_score, image_path: cropped_plate_image_path };
        }
        
        return { isDuplicate: false };
    } catch (error) {
        console.error('Error checking duplicate detection:', error);
        return { isDuplicate: false }; // Lỗi thì cho phép lưu để an toàn
    }
};

// Cập nhật detection đã tồn tại
const updateExistingDetection = async (detection_id, detectionData) => {
    try {
        const query = `
            UPDATE license_plate_detections SET
                confidence_score = ?,
                ocr_confidence = ?,
                detection_confidence = ?,
                cropped_plate_image_path = ?,
                bbox_x1 = ?,
                bbox_y1 = ?,
                bbox_x2 = ?,
                bbox_y2 = ?,
                detected_at = NOW(),
                raw_detection_data = ?
            WHERE id = ?
        `;
        
        const values = [
            detectionData.confidence_score || 0.0,
            detectionData.ocr_confidence || 0.0,
            detectionData.detection_confidence || 0.0,
            detectionData.cropped_plate_image_path || '',
            detectionData.bbox_x1 || 0,
            detectionData.bbox_y1 || 0,
            detectionData.bbox_x2 || 0,
            detectionData.bbox_y2 || 0,
            JSON.stringify(detectionData.raw_detection_data || {}),
            detection_id
        ];
        
        await db.execute(query, values);
        console.log(`✅ Updated detection ${detection_id} successfully`);
        return true;
    } catch (error) {
        console.error('Error updating existing detection:', error);
        return false;
    }
};

// Lưu detection mới vào database
const saveDetection = async (detectionData) => {
    try {
        const {
            plate_number,
            raw_plate_text,
            camera_id,
            location_id,
            confidence_score,
            ocr_confidence,
            detection_confidence,
            cropped_plate_image_path,
            bbox_x1,
            bbox_y1,
            bbox_x2,
            bbox_y2,
            detected_vehicle_type,
            processing_time_ms,
            ai_model_version,
            source_type
        } = detectionData;

        // Kiểm tra trùng lặp trước khi lưu
        const final_camera_id = camera_id || 1;
        const final_location_id = location_id || 1;
        
        if (plate_number && final_camera_id && final_location_id) {
            const duplicateCheck = await checkDuplicateDetection(plate_number, final_camera_id, final_location_id, 30);
            
            if (duplicateCheck.isDuplicate) {
                const current_confidence = confidence_score || 0.5;
                const existing_confidence = duplicateCheck.confidence_score || 0;
                
                // Nếu confidence hiện tại cao hơn ít nhất 0.1, cập nhật record cũ
                if (current_confidence > existing_confidence + 0.1) {
                    console.log(`🔄 Updating existing detection ${duplicateCheck.id} with better confidence: ${current_confidence} > ${existing_confidence}`);
                    await updateExistingDetection(duplicateCheck.id, detectionData);
                    return duplicateCheck.id;
                } else {
                    console.log(`⏭️ Skipping duplicate detection for ${plate_number} (confidence: ${current_confidence} <= ${existing_confidence})`);
                    return null; // Không lưu vì đã có detection tương tự
                }
            }
        }

        const query = `
            INSERT INTO license_plate_detections (
                detection_uuid,
                plate_number,
                raw_plate_text,
                camera_id,
                location_id,
                confidence_score,
                ocr_confidence,
                detection_confidence,
                cropped_plate_image_path,
                bbox_x1,
                bbox_y1,
                bbox_x2,
                bbox_y2,
                detected_vehicle_type,
                processing_time_ms,
                ai_model_version,
                source_type,
                detected_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        const values = [
            uuidv4(),
            plate_number,
            raw_plate_text || plate_number,
            final_camera_id,
            final_location_id,
            confidence_score || 0.5, // Default confidence score
            ocr_confidence || 0.5, // Default OCR confidence
            detection_confidence || 0.5, // Default detection confidence
            cropped_plate_image_path,
            bbox_x1,
            bbox_y1,
            bbox_x2,
            bbox_y2,
            detected_vehicle_type || 'car',
            processing_time_ms,
            ai_model_version || 'yolov8-paddleocr',
            source_type || 'camera' // Default to camera
        ];

        const [result] = await db.execute(query, values);
        console.log(`✅ Saved new detection for ${plate_number} with ID: ${result.insertId}`);
        return result.insertId;
    } catch (error) {
        console.error('Error saving detection:', error);
        throw error;
    }
};

// Lấy danh sách detections với phân trang và lọc
const getDetections = async (filters = {}, page = 0, rowsPerPage = 10) => {
    try {
        let whereClause = 'WHERE 1=1';
        let values = [];
        let offset = page * rowsPerPage;

        // Áp dụng các bộ lọc
        if (filters.plate_number) {
            whereClause += ' AND plate_number LIKE ?';
            values.push(`%${filters.plate_number}%`);
        }

        if (filters.camera_id) {
            whereClause += ' AND camera_id = ?';
            values.push(filters.camera_id);
        }

        if (filters.location_id) {
            whereClause += ' AND location_id = ?';
            values.push(filters.location_id);
        }

        if (filters.confidence_min) {
            whereClause += ' AND confidence_score >= ?';
            values.push(filters.confidence_min);
        }

        if (filters.confidence_max) {
            whereClause += ' AND confidence_score <= ?';
            values.push(filters.confidence_max);
        }

        if (filters.date_from) {
            whereClause += ' AND detected_at >= ?';
            values.push(filters.date_from);
        }

        if (filters.date_to) {
            whereClause += ' AND detected_at <= ?';
            values.push(filters.date_to);
        }

        if (filters.vehicle_type) {
            whereClause += ' AND detected_vehicle_type = ?';
            values.push(filters.vehicle_type);
        }

        // Query để đếm tổng số records
        const countQuery = `SELECT COUNT(*) as total FROM license_plate_detections ${whereClause}`;
        const [countResult] = await db.promise().query(countQuery, values);
        const totalCount = countResult[0].total;

        // Query chính để lấy data
        const mainQuery = `
            SELECT 
                d.*,
                c.name as camera_name,
                l.name as location_name,
                l.address as location_address
            FROM license_plate_detections d
            LEFT JOIN cameras c ON d.camera_id = c.id
            LEFT JOIN locations l ON d.location_id = l.id
            ${whereClause}
            ORDER BY d.detected_at DESC
            LIMIT ? OFFSET ?
        `;

        const mainValues = [...values, rowsPerPage, offset];
        const [detections] = await db.promise().query(mainQuery, mainValues);

        return {
            detections,
            totalCount,
            page,
            rowsPerPage
        };
    } catch (error) {
        console.error('Error getting detections:', error);
        throw error;
    }
};

// Lấy chi tiết một detection
const getDetectionById = async (id) => {
    try {
        const query = `
            SELECT 
                d.*,
                c.name as camera_name,
                l.name as location_name,
                l.address as location_address
            FROM license_plate_detections d
            LEFT JOIN cameras c ON d.camera_id = c.id
            LEFT JOIN locations l ON d.location_id = l.id
            WHERE d.id = ?
        `;

        const [detections] = await db.promise().query(query, [id]);
        return detections[0];
    } catch (error) {
        console.error('Error getting detection by ID:', error);
        throw error;
    }
};

// Cập nhật trạng thái verification
const updateVerification = async (id, verificationData) => {
    try {
        const {
            is_verified,
            verified_by,
            verification_notes
        } = verificationData;

        const query = `
            UPDATE license_plate_detections 
            SET 
                is_verified = ?,
                verified_by = ?,
                verification_notes = ?,
                verified_at = NOW()
            WHERE id = ?
        `;

        const [result] = await db.promise().query(query, [
            is_verified,
            verified_by,
            verification_notes,
            id
        ]);

        return result.affectedRows > 0;
    } catch (error) {
        console.error('Error updating verification:', error);
        throw error;
    }
};

// Xóa detection
const deleteDetection = async (id) => {
    try {
        const query = 'DELETE FROM license_plate_detections WHERE id = ?';
        const [result] = await db.promise().query(query, [id]);
        return result.affectedRows > 0;
    } catch (error) {
        console.error('Error deleting detection:', error);
        throw error;
    }
};

module.exports = {
    saveDetection,
    getDetections,
    getDetectionById,
    updateVerification,
    deleteDetection
};

