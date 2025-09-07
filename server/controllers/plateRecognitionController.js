const db = require('../db');

// Vietnamese license plate validation function
function validateVietnamesePlateFormat(plateText) {
    if (!plateText || typeof plateText !== 'string') {
        return { isValid: false, normalized: '', reason: 'Empty or invalid input' };
    }
    
    // Clean and normalize text
    let text = plateText.toUpperCase().trim();
    text = text.replace(/[^A-Z0-9\-\.]/g, '');
    
    // Common Vietnamese plate patterns
    const patterns = [
        /^\d{2}[A-Z]-\d{3}\.\d{2}$/,  // 12A-345.67
        /^\d{2}[A-Z]\d-\d{4}$/,       // 12A3-4567
        /^\d{2}[A-Z]\d-\d{3}\.\d{2}$/,  // 12A1-345.67
        /^\d{2}[A-Z]{2}-\d{3}\.\d{2}$/, // 12AB-345.67
        /^\d{2}[A-Z]\d-\d{4}$/,         // 12A-3456
    ];
    
    // Check if text matches any pattern
    for (const pattern of patterns) {
        if (pattern.test(text)) {
            return { isValid: true, normalized: text, reason: 'Valid format' };
        }
    }
    
    // Additional validation checks
    if (text.length < 6 || text.length > 12) {
        return { isValid: false, normalized: text, reason: 'Invalid length' };
    }
    
    if (!/^\d{2}/.test(text)) {
        return { isValid: false, normalized: text, reason: 'Must start with 2 digits' };
    }
    
    if (!/[A-Z]/.test(text)) {
        return { isValid: false, normalized: text, reason: 'Must contain at least one letter' };
    }
    
    const digitCount = (text.match(/\d/g) || []).length;
    if (digitCount < 3) {
        return { isValid: false, normalized: text, reason: 'Must contain at least 3 digits' };
    }
    
    return { isValid: false, normalized: text, reason: 'Does not match Vietnamese plate format' };
}

// Lấy danh sách license plate detections
const getLicensePlateRecognitions = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            plate_number,
            camera_id,
            location_id,
            start_date,
            end_date,
            confidence_min,
            confidence_max,
            is_verified,
            is_whitelist_match,
            is_blacklist_match,
            direction,
            vehicle_type,
            source_type,
            detection_status,
            alert_triggered,
            sort_by = 'detected_at',
            sort_order = 'DESC'
        } = req.query;

        // Validate and parse pagination parameters
        const parsedPage = Math.max(1, parseInt(page) || 1);
        const parsedLimit = Math.min(100, Math.max(1, parseInt(limit) || 50));
        const offset = (parsedPage - 1) * parsedLimit;
        
        console.log('Pagination params:', { page, limit, offset, parsedPage, parsedLimit });
        
        // Debug: Test if table exists and has data
        const testQuery = `SELECT COUNT(*) as total FROM license_plate_detections LIMIT 1`;
        try {
            const testResult = await new Promise((resolve, reject) => {
                db.query(testQuery, [], (error, results) => {
                    if (error) {
                        console.error('Table test error:', error);
                        reject(error);
                    } else {
                        console.log('Table test results:', results);
                        resolve(results);
                    }
                });
            });
        } catch (testError) {
            console.error('Table does not exist or is inaccessible:', testError);
            return res.status(500).json({
                success: false,
                message: 'Bảng license_plate_detections không tồn tại hoặc không thể truy cập',
                error: process.env.NODE_ENV === 'development' ? testError.message : undefined
            });
        }
        
        // Build WHERE conditions and parameters
        let whereConditions = [];
        let queryParams = [];

        // Plate number search
        if (plate_number) {
            whereConditions.push('lpd.plate_number LIKE ?');
            queryParams.push(`%${plate_number}%`);
        }

        // Camera filter
        if (camera_id) {
            whereConditions.push('lpd.camera_id = ?');
            queryParams.push(camera_id);
        }

        // Location filter
        if (location_id) {
            whereConditions.push('lpd.location_id = ?');
            queryParams.push(location_id);
        }

        // Date range filters
        if (start_date) {
            whereConditions.push('lpd.detected_at >= ?');
            queryParams.push(start_date);
        }

        if (end_date) {
            whereConditions.push('lpd.detected_at <= ?');
            queryParams.push(end_date);
        }

        // Confidence filters
        if (confidence_min) {
            whereConditions.push('lpd.confidence_score >= ?');
            queryParams.push(parseFloat(confidence_min) / 100); // Convert percentage to decimal
        }

        if (confidence_max) {
            whereConditions.push('lpd.confidence_score <= ?');
            queryParams.push(parseFloat(confidence_max) / 100); // Convert percentage to decimal
        }

        // Verification status filter
        if (is_verified !== undefined && is_verified !== '') {
            whereConditions.push('lpd.is_verified = ?');
            queryParams.push(is_verified === 'true' ? 1 : 0);
        }

        // Whitelist match filter
        if (is_whitelist_match !== undefined && is_whitelist_match !== '') {
            whereConditions.push('lpd.is_whitelist_match = ?');
            queryParams.push(is_whitelist_match === 'true' ? 1 : 0);
        }

        // Blacklist match filter
        if (is_blacklist_match !== undefined && is_blacklist_match !== '') {
            whereConditions.push('lpd.is_blacklist_match = ?');
            queryParams.push(is_blacklist_match === 'true' ? 1 : 0);
        }

        // Direction filter
        if (direction) {
            whereConditions.push('lpd.direction = ?');
            queryParams.push(direction);
        }

        // Vehicle type filter
        if (vehicle_type) {
            whereConditions.push('lpd.detected_vehicle_type = ?');
            queryParams.push(vehicle_type);
        }

        // Source type filter
        if (source_type) {
            whereConditions.push('lpd.source_type = ?');
            queryParams.push(source_type);
        }

        // Detection status filter
        if (detection_status) {
            if (detection_status === 'verified') {
                whereConditions.push('lpd.is_verified = 1');
            } else if (detection_status === 'unverified') {
                whereConditions.push('lpd.is_verified = 0');
            } else if (detection_status === 'pending') {
                whereConditions.push('lpd.is_verified = 0 AND lpd.verified_by IS NULL');
            } else if (detection_status === 'error') {
                whereConditions.push('lpd.confidence_score < 0.5');
            }
        }

        // Alert triggered filter
        if (alert_triggered !== undefined && alert_triggered !== '') {
            whereConditions.push('lpd.alert_triggered = ?');
            queryParams.push(alert_triggered === 'triggered' ? 1 : 0);
        }





        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Validate sort parameters
        const allowedSortFields = ['detected_at', 'created_at', 'plate_number', 'confidence_score', 'camera_id', 'location_id', 'is_verified', 'direction', 'detected_vehicle_type'];
        const sortBy = allowedSortFields.includes(sort_by) ? sort_by : 'detected_at';
        const sortOrder = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // Get total count first
        const countQuery = `SELECT COUNT(*) as total FROM license_plate_detections lpd ${whereClause}`;
        
        const countResults = await new Promise((resolve, reject) => {
            db.query(countQuery, queryParams, (error, results) => {
                if (error) {
                    console.error('Count query error:', error);
                    reject(error);
                } else {
                    console.log('Count query results:', results);
                    resolve(results);
                }
            });
        });
        
        const total = countResults && countResults.length > 0 ? countResults[0].total : 0;

        // FIXED: Get data with pagination - using parameterized query for LIMIT/OFFSET
        const dataQuery = `
            SELECT 
                lpd.id, lpd.detection_uuid, lpd.plate_number, lpd.raw_plate_text, 
                lpd.camera_id, lpd.location_id, lpd.vehicle_id,
                lpd.detected_at, lpd.direction, lpd.confidence_score, lpd.ocr_confidence,
                lpd.detection_confidence, lpd.original_image_path, lpd.cropped_plate_image_path,
                lpd.annotated_image_path, lpd.detected_vehicle_type, lpd.detected_vehicle_color,
                lpd.vehicle_speed, lpd.bbox_x1, lpd.bbox_y1, lpd.bbox_x2, lpd.bbox_y2,
                lpd.is_verified, lpd.verified_by, lpd.verified_at, lpd.verification_notes,
                lpd.is_whitelist_match, lpd.is_blacklist_match, lpd.alert_triggered,
                lpd.processing_time_ms, lpd.ai_model_version, lpd.raw_detection_data,
                lpd.source_type, lpd.video_filename, lpd.created_at,
                c.name as camera_name,
                loc.name as location_name
            FROM license_plate_detections lpd
            LEFT JOIN cameras c ON lpd.camera_id = c.id
            LEFT JOIN locations loc ON lpd.location_id = loc.id
            ${whereClause}
            ORDER BY lpd.${sortBy} ${sortOrder}
            LIMIT ? OFFSET ?`;

        // FIXED: Add LIMIT and OFFSET as parameters
        const dataParams = [...queryParams, parsedLimit, offset];

        const detections = await new Promise((resolve, reject) => {
            db.query(dataQuery, dataParams, (error, results) => {
                if (error) {
                    console.error('Database query error:', error);
                    reject(error);
                } else {
                    console.log('Data query results count:', results ? results.length : 0);
                    resolve(results || []);
                }
            });
        });

        // Log access for audit trail
        try {
            await new Promise((resolve, reject) => {
                db.query(
                    `INSERT INTO access_logs (user_id, username, action_type, object_type, status, created_at)
                     VALUES (?, ?, 'VIEW', 'LICENSE_PLATE_DETECTIONS', 'SUCCESS', NOW())`,
                    [
                        req.user?.userId || null,
                        req.user?.username || req.user?.email || 'unknown'
                    ],
                    (error, results) => {
                        if (error) reject(error);
                        else resolve(results);
                    }
                );
            });
        } catch (auditError) {
            console.warn('Audit log failed:', auditError.message);
        }

        // Return response
        res.status(200).json({
            success: true,
            message: 'Lấy danh sách nhận diện biển số thành công',
            data: detections,
            pagination: {
                current_page: parsedPage,
                per_page: parsedLimit,
                total: total,
                total_pages: Math.ceil(total / parsedLimit),
                has_next: (parsedPage * parsedLimit) < total,
                has_prev: parsedPage > 1
            },
            filters_applied: {
                plate_number: plate_number || null,
                camera_id: camera_id || null,
                start_date: start_date || null,
                end_date: end_date || null
            }
        });

    } catch (error) {
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            errno: error.errno,
            sqlState: error.sqlState,
            sql: error.sql
        });
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách nhận diện biển số',
            error: process.env.NODE_ENV === 'development' ? {
                message: error.message,
                code: error.code,
                details: error.sqlMessage || error.sql
            } : undefined
        });
    }
};

// Lấy chi tiết một detection
const getLicensePlateRecognitionById = async (req, res) => {
    try {
        const { id } = req.params;

        const query = `
            SELECT 
                lpd.id, lpd.detection_uuid, lpd.plate_number, lpd.raw_plate_text, 
                lpd.camera_id, lpd.location_id, lpd.vehicle_id,
                lpd.detected_at, lpd.direction, lpd.confidence_score, lpd.ocr_confidence,
                lpd.detection_confidence, lpd.original_image_path, lpd.cropped_plate_image_path,
                lpd.annotated_image_path, lpd.detected_vehicle_type, lpd.detected_vehicle_color,
                lpd.vehicle_speed, lpd.bbox_x1, lpd.bbox_y1, lpd.bbox_x2, lpd.bbox_y2,
                lpd.is_verified, lpd.verified_by, lpd.verified_at, lpd.verification_notes,
                lpd.is_whitelist_match, lpd.is_blacklist_match, lpd.alert_triggered,
                lpd.processing_time_ms, lpd.ai_model_version, lpd.raw_detection_data,
                lpd.source_type, lpd.video_filename, lpd.created_at,
                c.name as camera_name,
                loc.name as location_name
            FROM license_plate_detections lpd
            LEFT JOIN cameras c ON lpd.camera_id = c.id
            LEFT JOIN locations loc ON lpd.location_id = loc.id
            WHERE lpd.id = ?
        `;
        
        const detections = await new Promise((resolve, reject) => {
            db.query(query, [id], (error, results) => {
                if (error) {
                    console.error('Database query error:', error);
                    reject(error);
                } else {
                    console.log('Detection query results:', results);
                    resolve(results || []);
                }
            });
        });
        
        if (detections.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy bản ghi nhận diện'
            });
        }
        
        const detection = detections[0];
        
        res.status(200).json({
            success: true,
            message: 'Lấy chi tiết nhận diện biển số thành công',
            data: detection
        });
        
    } catch (error) {
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            errno: error.errno,
            sqlState: error.sqlState,
            sql: error.sql
        });
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy chi tiết nhận diện biển số',
            error: process.env.NODE_ENV === 'development' ? {
                message: error.message,
                code: error.code,
                details: error.sqlMessage || error.sql
            } : undefined
        });
    }
};

// Lấy thống kê detections
const getLicensePlateRecognitionStats = async (req, res) => {
    try {
        const { start_date, end_date, camera_id } = req.query;
        
        let whereConditions = [];
        let queryParams = [];
        
        if (start_date) {
            whereConditions.push('detected_at >= ?');
            queryParams.push(start_date);
        }
        
        if (end_date) {
            whereConditions.push('detected_at <= ?');
            queryParams.push(end_date);
        }
        
        if (camera_id) {
            whereConditions.push('camera_id = ?');
            queryParams.push(camera_id);
        }
        
        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
        
        // Thống kê tổng quan
        const statsQuery = `
            SELECT 
                COUNT(*) as total_detections,
                COUNT(DISTINCT plate_number) as unique_plates,
                COUNT(CASE WHEN is_whitelist_match = 1 THEN 1 END) as whitelist_matches,
                COUNT(CASE WHEN is_blacklist_match = 1 THEN 1 END) as blacklist_matches,
                COUNT(CASE WHEN is_verified = 1 THEN 1 END) as verified_detections,
                AVG(confidence_score) as avg_confidence,
                AVG(ocr_confidence) as avg_ocr_confidence,
                AVG(detection_confidence) as avg_detection_confidence
            FROM license_plate_detections 
            ${whereClause}
        `;
        
        const statsResult = await new Promise((resolve, reject) => {
            db.query(statsQuery, queryParams, (error, results) => {
                if (error) {
                    console.error('Stats query error:', error);
                    reject(error);
                } else {
                    resolve(results);
                }
            });
        });
        const stats = statsResult[0];
        
        // Thống kê theo loại xe
        const vehicleTypeQuery = `
            SELECT 
                detected_vehicle_type,
                COUNT(*) as count
            FROM license_plate_detections 
            ${whereClause}
            GROUP BY detected_vehicle_type
            ORDER BY count DESC
        `;
        
        const vehicleTypeStats = await new Promise((resolve, reject) => {
            db.query(vehicleTypeQuery, queryParams, (error, results) => {
                if (error) {
                    console.error('Vehicle type query error:', error);
                    reject(error);
                } else {
                    resolve(results);
                }
            });
        });
        
        // Thống kê theo camera
        const cameraQuery = `
            SELECT 
                lpd.camera_id,
                c.name as camera_name,
                COUNT(*) as count
            FROM license_plate_detections lpd
            LEFT JOIN cameras c ON lpd.camera_id = c.id
            ${whereClause}
            GROUP BY lpd.camera_id, c.name
            ORDER BY count DESC
        `;
        
        const cameraStats = await new Promise((resolve, reject) => {
            db.query(cameraQuery, queryParams, (error, results) => {
                if (error) {
                    console.error('Camera stats query error:', error);
                    reject(error);
                } else {
                    resolve(results);
                }
            });
        });
        
        // Thống kê theo ngày
        const dailyQuery = `
            SELECT 
                DATE(detected_at) as date,
                COUNT(*) as count
            FROM license_plate_detections 
            ${whereClause}
            GROUP BY DATE(detected_at)
            ORDER BY date DESC
            LIMIT 30
        `;
        
        const dailyStats = await new Promise((resolve, reject) => {
            db.query(dailyQuery, queryParams, (error, results) => {
                if (error) {
                    console.error('Daily stats query error:', error);
                    reject(error);
                } else {
                    resolve(results);
                }
            });
        });
        
        res.status(200).json({
            success: true,
            message: 'Lấy thống kê nhận diện biển số thành công',
            data: {
                overview: {
                    total_detections: parseInt(stats.total_detections) || 0,
                    unique_plates: parseInt(stats.unique_plates) || 0,
                    whitelist_matches: parseInt(stats.whitelist_matches) || 0,
                    blacklist_matches: parseInt(stats.blacklist_matches) || 0,
                    verified_detections: parseInt(stats.verified_detections) || 0,
                    avg_confidence: parseFloat(stats.avg_confidence) || 0,
                    avg_ocr_confidence: parseFloat(stats.avg_ocr_confidence) || 0,
                    avg_detection_confidence: parseFloat(stats.avg_detection_confidence) || 0
                },
                vehicle_types: vehicleTypeStats,
                cameras: cameraStats,
                daily_stats: dailyStats
            }
        });
        
    } catch (error) {
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            errno: error.errno,
            sqlState: error.sqlState,
            sql: error.sql
        });
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thống kê nhận diện biển số',
            error: process.env.NODE_ENV === 'development' ? {
                message: error.message,
                code: error.code,
                details: error.sqlMessage || error.sql
            } : undefined
        });
    }
};

// Xóa detection
const deleteLicensePlateRecognition = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Kiểm tra xem detection có tồn tại không
        const checkQuery = 'SELECT id FROM license_plate_detections WHERE id = ?';
        const existing = await new Promise((resolve, reject) => {
            db.query(checkQuery, [id], (error, results) => {
                if (error) {
                    console.error('Check query error:', error);
                    reject(error);
                } else {
                    resolve(results);
                }
            });
        });
        
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy bản ghi nhận diện'
            });
        }
        
        // Xóa detection
        const deleteQuery = 'DELETE FROM license_plate_detections WHERE id = ?';
        await new Promise((resolve, reject) => {
            db.query(deleteQuery, [id], (error, results) => {
                if (error) {
                    console.error('Delete query error:', error);
                    reject(error);
                } else {
                    resolve(results);
                }
            });
        });
        
        res.status(200).json({
            success: true,
            message: 'Xóa bản ghi nhận diện thành công'
        });
        
    } catch (error) {
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            errno: error.errno,
            sqlState: error.sqlState,
            sql: error.sql
        });
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa bản ghi nhận diện',
            error: process.env.NODE_ENV === 'development' ? {
                message: error.message,
                code: error.code,
                details: error.sqlMessage || error.sql
            } : undefined
        });
    }
};

// Cập nhật trạng thái verification
const updateRecognitionVerification = async (req, res) => {
    try {
        console.log('updateRecognitionVerification called with:', {
            id: req.params.id,
            body: req.body,
            user: req.user
        });
        
        const { id } = req.params;
        const { is_verified, verification_notes } = req.body;
        const verified_by = req.user?.userId; // Lấy user ID từ middleware auth
        
        // Kiểm tra xem detection có tồn tại không
        const checkQuery = 'SELECT id FROM license_plate_detections WHERE id = ?';
        const existing = await new Promise((resolve, reject) => {
            db.query(checkQuery, [id], (error, results) => {
                if (error) {
                    console.error('Check query error:', error);
                    reject(error);
                } else {
                    resolve(results);
                }
            });
        });
        
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy bản ghi nhận diện'
            });
        }
        
        // Cập nhật verification
        const updateQuery = `
            UPDATE license_plate_detections 
            SET is_verified = ?, verification_notes = ?, verified_by = ?, verified_at = NOW()
            WHERE id = ?
        `;
        
        await new Promise((resolve, reject) => {
            db.query(updateQuery, [is_verified, verification_notes, verified_by, id], (error, results) => {
                if (error) {
                    console.error('Update query error:', error);
                    reject(error);
                } else {
                    resolve(results);
                }
            });
        });
        
        res.status(200).json({
            success: true,
            message: 'Cập nhật trạng thái xác thực thành công'
        });
        
    } catch (error) {
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            errno: error.errno,
            sqlState: error.sqlState,
            sql: error.sql
        });
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật trạng thái xác thực',
            error: process.env.NODE_ENV === 'development' ? {
                message: error.message,
                code: error.code,
                details: error.sqlMessage || error.sql
            } : undefined
        });
    }
};

module.exports = {
    getLicensePlateRecognitions,
    getLicensePlateRecognitionById,
    getLicensePlateRecognitionStats,
    deleteLicensePlateRecognition,
    updateRecognitionVerification
};