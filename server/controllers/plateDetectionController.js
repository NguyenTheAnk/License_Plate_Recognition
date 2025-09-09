const db = require('../db');
const { v4: uuidv4 } = require('uuid');

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
            camera_id || 1, // Default camera ID
            location_id || 1, // Default location ID
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

