const db = require('../db');

// Simple in-memory cache for frequently accessed data
const cache = {
    locations: { data: null, timestamp: 0, ttl: 5 * 60 * 1000 }, // 5 minutes
    cameras: { data: null, timestamp: 0, ttl: 5 * 60 * 1000 }, // 5 minutes
    stats: { data: null, timestamp: 0, ttl: 2 * 60 * 1000 } // 2 minutes
};

// Cache helper functions
const getCachedData = (key) => {
    const cached = cache[key];
    if (cached && (Date.now() - cached.timestamp) < cached.ttl) {
        return cached.data;
    }
    return null;
};

const setCachedData = (key, data) => {
    cache[key] = {
        data: data,
        timestamp: Date.now(),
        ttl: cache[key]?.ttl || 5 * 60 * 1000
    };
};

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
        
        // Validate pagination bounds
        if (parsedPage < 1 || parsedPage > 10000) {
            return res.status(400).json({
                success: false,
                message: 'Số trang không hợp lệ (1-10000)',
                error: 'Invalid page number'
            });
        }
        
        if (parsedLimit < 1 || parsedLimit > 100) {
            return res.status(400).json({
                success: false,
                message: 'Số lượng bản ghi không hợp lệ (1-100)',
                error: 'Invalid limit'
            });
        }
        
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
            // Sanitize plate number input
            const sanitizedPlateNumber = plate_number.trim().replace(/[^A-Z0-9\-\.]/g, '');
            if (sanitizedPlateNumber.length > 0) {
                whereConditions.push('lpd.plate_number LIKE ?');
                queryParams.push(`%${sanitizedPlateNumber}%`);
            }
        }

        // Camera filter
        if (camera_id) {
            const cameraId = parseInt(camera_id);
            if (!isNaN(cameraId) && cameraId > 0) {
                whereConditions.push('lpd.camera_id = ?');
                queryParams.push(cameraId);
            }
        }

        // Location filter
        if (location_id) {
            const locationId = parseInt(location_id);
            if (!isNaN(locationId) && locationId > 0) {
                whereConditions.push('lpd.location_id = ?');
                queryParams.push(locationId);
            }
        }

        // Date range filters
        if (start_date) {
            // Validate date format
            const startDate = new Date(start_date);
            if (!isNaN(startDate.getTime())) {
                whereConditions.push('lpd.detected_at >= ?');
                queryParams.push(start_date);
            }
        }

        if (end_date) {
            // Validate date format
            const endDate = new Date(end_date);
            if (!isNaN(endDate.getTime())) {
                whereConditions.push('lpd.detected_at <= ?');
                queryParams.push(end_date);
            }
        }

        // Confidence range filters
        if (confidence_min) {
            const minVal = parseFloat(confidence_min);
            if (!isNaN(minVal) && minVal >= 0 && minVal <= 1) {
                whereConditions.push('lpd.confidence_score >= ?');
                queryParams.push(minVal);
            }
        }

        if (confidence_max) {
            const maxVal = parseFloat(confidence_max);
            if (!isNaN(maxVal) && maxVal >= 0 && maxVal <= 1) {
                whereConditions.push('lpd.confidence_score <= ?');
                queryParams.push(maxVal);
            }
        }

        // Verification status filter
        if (is_verified !== undefined && is_verified !== '') {
            const validVerificationValues = ['verified', 'unverified'];
            if (validVerificationValues.includes(is_verified)) {
                if (is_verified === 'verified') {
                    whereConditions.push('lpd.is_verified = 1');
                } else if (is_verified === 'unverified') {
                    whereConditions.push('lpd.is_verified = 0');
                }
            }
        }

        // Whitelist match filter
        if (is_whitelist_match !== undefined && is_whitelist_match !== '') {
            const validWhitelistValues = ['match', 'no_match'];
            if (validWhitelistValues.includes(is_whitelist_match)) {
                if (is_whitelist_match === 'match') {
                    whereConditions.push('lpd.is_whitelist_match = 1');
                } else if (is_whitelist_match === 'no_match') {
                    whereConditions.push('lpd.is_whitelist_match = 0');
                }
            }
        }

        // Blacklist match filter
        if (is_blacklist_match !== undefined && is_blacklist_match !== '') {
            const validBlacklistValues = ['match', 'no_match'];
            if (validBlacklistValues.includes(is_blacklist_match)) {
                if (is_blacklist_match === 'match') {
                    whereConditions.push('lpd.is_blacklist_match = 1');
                } else if (is_blacklist_match === 'no_match') {
                    whereConditions.push('lpd.is_blacklist_match = 0');
                }
            }
        }

        // Source type filter
        if (source_type) {
            const validSourceTypes = ['camera', 'video_upload', 'rtsp_stream', 'websocket_stream', 'http_upload', 'video_file', 'websocket_video'];
            if (validSourceTypes.includes(source_type)) {
                whereConditions.push('lpd.source_type = ?');
                queryParams.push(source_type);
            }
        }

        // Alert triggered filter
        if (alert_triggered !== undefined && alert_triggered !== '') {
            const validAlertValues = ['true', 'false', '1', '0'];
            if (validAlertValues.includes(alert_triggered)) {
                if (alert_triggered === 'true' || alert_triggered === '1') {
                    whereConditions.push('lpd.alert_triggered = 1');
                } else if (alert_triggered === 'false' || alert_triggered === '0') {
                    whereConditions.push('lpd.alert_triggered = 0');
                }
            }
        }

        // Detection status filter (based on verification status)
        if (detection_status) {
            const validStatuses = ['detected', 'verified', 'pending', 'error'];
            if (validStatuses.includes(detection_status)) {
                if (detection_status === 'detected') {
                    whereConditions.push('lpd.is_verified = 0');
                } else if (detection_status === 'verified') {
                    whereConditions.push('lpd.is_verified = 1');
                } else if (detection_status === 'pending') {
                    whereConditions.push('lpd.is_verified = 0 AND lpd.is_whitelist_match = 0 AND lpd.is_blacklist_match = 0');
                } else if (detection_status === 'error') {
                    whereConditions.push('lpd.confidence_score < 0.5');
                }
            }
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Debug logging for filters
        console.log('Filter conditions:', whereConditions);
        console.log('Filter parameters:', queryParams);
        console.log('Final WHERE clause:', whereClause);
        
        // Query performance monitoring
        const queryStartTime = Date.now();

        // Validate sort parameters
        const allowedSortFields = ['detected_at', 'created_at', 'plate_number', 'confidence_score', 'camera_id', 'location_id', 'is_verified', 'is_whitelist_match', 'is_blacklist_match', 'source_type', 'alert_triggered'];
        const sortBy = allowedSortFields.includes(sort_by) ? sort_by : 'detected_at';
        const sortOrder = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // Get total count first - optimized for performance
        const countQuery = `SELECT COUNT(*) as total FROM license_plate_detections lpd ${whereClause}`;
        
        const countStartTime = Date.now();
        const countResults = await new Promise((resolve, reject) => {
            db.query(countQuery, queryParams, (error, results) => {
                const countEndTime = Date.now();
                const countDuration = countEndTime - countStartTime;
                
                if (error) {
                    console.error('Count query error:', error);
                    console.error('Count query duration:', countDuration + 'ms');
                    reject(new Error(`Database count query failed: ${error.message}`));
                } else {
                    console.log('Count query results:', results);
                    console.log('Count query duration:', countDuration + 'ms');
                    
                    // Log slow count queries
                    if (countDuration > 500) {
                        console.warn('Slow count query detected:', {
                            duration: countDuration + 'ms',
                            conditions: whereConditions.length
                        });
                    }
                    
                    resolve(results);
                }
            });
        });
        
        const total = countResults && countResults.length > 0 ? countResults[0].total : 0;

        // FIXED: Get data with pagination - using string interpolation for LIMIT/OFFSET
        // Optimized query with proper indexing hints
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
            LIMIT ${parsedLimit} OFFSET ${offset}`;

        // FIXED: Use only queryParams for WHERE conditions, not LIMIT/OFFSET
        const dataParams = [...queryParams];

        // Debug logging for data query
        console.log('Data query:', dataQuery);
        console.log('Data params:', dataParams);
        console.log('Pagination:', { parsedLimit, offset, page: parsedPage });

        const detections = await new Promise((resolve, reject) => {
            db.query(dataQuery, dataParams, (error, results) => {
                const queryEndTime = Date.now();
                const queryDuration = queryEndTime - queryStartTime;
                
                if (error) {
                    console.error('Database query error:', error);
                    console.error('Query duration:', queryDuration + 'ms');
                    reject(new Error(`Database data query failed: ${error.message}`));
                } else {
                    console.log('Data query results count:', results ? results.length : 0);
                    console.log('Query duration:', queryDuration + 'ms');
                    
                    // Log slow queries
                    if (queryDuration > 1000) {
                        console.warn('Slow query detected:', {
                            duration: queryDuration + 'ms',
                            conditions: whereConditions.length,
                            params: queryParams.length
                        });
                    }
                    
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

        // Validate response data
        if (!Array.isArray(detections)) {
            console.error('Invalid detections data type:', typeof detections);
            return res.status(500).json({
                success: false,
                message: 'Dữ liệu trả về không hợp lệ',
                error: 'Invalid data type'
            });
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
                location_id: location_id || null,
                start_date: start_date || null,
                end_date: end_date || null,
                confidence_min: confidence_min || null,
                confidence_max: confidence_max || null,
                is_verified: is_verified || null,
                is_whitelist_match: is_whitelist_match || null,
                is_blacklist_match: is_blacklist_match || null,
                source_type: source_type || null,
                detection_status: detection_status || null,
                alert_triggered: alert_triggered || null
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
        
        // Thống kê tổng quan - check cache first
        let stats = getCachedData('stats');
        if (!stats) {
            const statsQuery = `
                SELECT 
                    COUNT(*) as total_detect
                    COUNT(DISTINCT plate_number) as unique_plates,
                    COUNT(CASE WHEN is_whitelist_match = 1 THEN 1 END) as whitelist_matches,
                    COUNT(CASE WHEN is_blacklist_match = 1 THEN 1 END) as blacklist_matches,
                    COUNT(CASE WHEN is_verified = 1 THEN 1 END) as verified_detections,
                    AVG((detection_confidence + ocr_confidence) / 2) as avg_confidence,
                    AVG(ocr_confidence) as avg_ocr_confidence,
                    AVG(detection_confidence) as avg_detection_confidence
                FROM license_plate_detections 
                ${whereClause}
            `;
            
            const statsStartTime = Date.now();
            const statsResult = await new Promise((resolve, reject) => {
                db.query(statsQuery, queryParams, (error, results) => {
                    const statsEndTime = Date.now();
                    const statsDuration = statsEndTime - statsStartTime;
                    
                    if (error) {
                        console.error('Stats query error:', error);
                        console.error('Stats query duration:', statsDuration + 'ms');
                        reject(error);
                    } else {
                        console.log('Stats query duration:', statsDuration + 'ms');
                        
                        // Log slow stats queries
                        if (statsDuration > 1000) {
                            console.warn('Slow stats query detected:', {
                                duration: statsDuration + 'ms',
                                conditions: whereConditions.length
                            });
                        }
                        
                        resolve(results);
                    }
                });
            });
            stats = statsResult[0];
            
            // Cache the stats
            setCachedData('stats', stats);
        }
        
        // Thống kê theo loại xe - check cache first
        let vehicleTypeStats = getCachedData('vehicleTypeStats');
        if (!vehicleTypeStats) {
            const vehicleTypeQuery = `
                SELECT 
                    detected_vehicle_type,
                    COUNT(*) as count
                FROM license_plate_detections 
                ${whereClause}
                GROUP BY detected_vehicle_type
                ORDER BY count DESC
            `;
            
            const vehicleTypeStartTime = Date.now();
            vehicleTypeStats = await new Promise((resolve, reject) => {
                db.query(vehicleTypeQuery, queryParams, (error, results) => {
                    const vehicleTypeEndTime = Date.now();
                    const vehicleTypeDuration = vehicleTypeEndTime - vehicleTypeStartTime;
                    
                    if (error) {
                        console.error('Vehicle type query error:', error);
                        console.error('Vehicle type query duration:', vehicleTypeDuration + 'ms');
                        reject(error);
                    } else {
                        console.log('Vehicle type query duration:', vehicleTypeDuration + 'ms');
                        
                        // Log slow vehicle type queries
                        if (vehicleTypeDuration > 1000) {
                            console.warn('Slow vehicle type query detected:', {
                                duration: vehicleTypeDuration + 'ms',
                                conditions: whereConditions.length
                            });
                        }
                        
                        resolve(results || []);
                    }
                });
            });
            
            // Cache the vehicle type stats
            setCachedData('vehicleTypeStats', vehicleTypeStats);
        }
        
        // Thống kê theo camera - check cache first
        let cameraStats = getCachedData('cameraStats');
        if (!cameraStats) {
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
            
            const cameraStartTime = Date.now();
            cameraStats = await new Promise((resolve, reject) => {
                db.query(cameraQuery, queryParams, (error, results) => {
                    const cameraEndTime = Date.now();
                    const cameraDuration = cameraEndTime - cameraStartTime;
                    
                    if (error) {
                        console.error('Camera stats query error:', error);
                        console.error('Camera query duration:', cameraDuration + 'ms');
                        reject(error);
                    } else {
                        console.log('Camera query duration:', cameraDuration + 'ms');
                        
                        // Log slow camera queries
                        if (cameraDuration > 1000) {
                            console.warn('Slow camera query detected:', {
                                duration: cameraDuration + 'ms',
                                conditions: whereConditions.length
                            });
                        }
                        
                        resolve(results || []);
                    }
                });
            });
            
            // Cache the camera stats
            setCachedData('cameraStats', cameraStats);
        }
        
        // Thống kê theo ngày - check cache first
        let dailyStats = getCachedData('dailyStats');
        if (!dailyStats) {
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
            
            const dailyStartTime = Date.now();
            dailyStats = await new Promise((resolve, reject) => {
                db.query(dailyQuery, queryParams, (error, results) => {
                    const dailyEndTime = Date.now();
                    const dailyDuration = dailyEndTime - dailyStartTime;
                    
                    if (error) {
                        console.error('Daily stats query error:', error);
                        console.error('Daily query duration:', dailyDuration + 'ms');
                        reject(error);
                    } else {
                        console.log('Daily query duration:', dailyDuration + 'ms');
                        
                        // Log slow daily queries
                        if (dailyDuration > 1000) {
                            console.warn('Slow daily query detected:', {
                                duration: dailyDuration + 'ms',
                                conditions: whereConditions.length
                            });
                        }
                        
                        resolve(results || []);
                    }
                });
            });
            
            // Cache the daily stats
            setCachedData('dailyStats', dailyStats);
        }
        
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

// Tạo mới license plate recognition (cho real-time detection)
const createLicensePlateRecognition = async (req, res) => {
    try {
        let {
            detection_uuid,
            plate_number,
            raw_plate_text,
            camera_id,
            location_id,
            detected_at,
            confidence_score,
            ocr_confidence,
            detection_confidence,
            bbox,
            frame_path,
            detected_vehicle_type,
            source_type,
            camera_name,
            is_whitelist_match,
            is_blacklist_match
        } = req.body;

        // Validate required fields
        if (!plate_number) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu thông tin bắt buộc: plate_number'
            });
        }
        
        // Set default camera_id if not provided or invalid
        if (!camera_id || camera_id === 'default' || camera_id === 'null' || camera_id === 'test') {
            camera_id = 1; // Default camera ID
            console.log('⚠️ Using default camera_id: 1');
        }
        
        // Ensure camera_id is a valid integer
        const parsedCameraId = parseInt(camera_id);
        if (isNaN(parsedCameraId) || parsedCameraId <= 0) {
            camera_id = 1; // Default camera ID
            console.log('⚠️ Invalid camera_id, using default: 1');
        } else {
            camera_id = parsedCameraId;
        }

        // Get location_id and location name from camera
        let actualLocationId = location_id || 1; // Default fallback
        let locationName = 'Unknown Location';
        try {
            const cameraQuery = `
                SELECT c.location_id, l.name as location_name 
                FROM cameras c 
                LEFT JOIN locations l ON c.location_id = l.id 
                WHERE c.id = ?
            `;
            const cameraResult = await new Promise((resolve, reject) => {
                db.query(cameraQuery, [camera_id], (error, results) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(results);
                    }
                });
            });
            
            if (cameraResult.length > 0) {
                actualLocationId = cameraResult[0].location_id;
                locationName = cameraResult[0].location_name || 'Unknown Location';
                console.log(`📷 Using location_id ${actualLocationId} and location_name "${locationName}" from camera ${camera_id}`);
            } else {
                console.log(`⚠️ Camera ${camera_id} not found, using default location_id: ${actualLocationId}`);
            }
        } catch (error) {
            console.error('Error getting location info from camera:', error);
            console.log(`⚠️ Using default location_id: ${actualLocationId}`);
        }

        // Process video_filename and camera_name based on source_type
        let video_filename = req.body.video_filename || null;
        
        // Chỉ ghi đè camera_name nếu không được cung cấp từ frontend
        if (!camera_name) {
            if (source_type === 'video_upload') {
                // For video upload, use video filename
                video_filename = video_filename || 'Unknown Video';
                camera_name = `Video Upload: ${video_filename}`;
                console.log(`📹 Video upload detected: ${camera_name}`);
            } else if (source_type === 'camera_with_video') {
                // For camera with video source, use camera name from frontend
                camera_name = camera_name || `Camera with Video: ${video_filename || 'Unknown'}`;
                console.log(`📹📷 Camera with video detected: ${camera_name}`);
            } else if (source_type === 'camera' || !source_type) {
                // For camera live, use camera name from frontend or default
                camera_name = camera_name || `Camera ${camera_id}`;
                console.log(`📷 Camera live detected: ${camera_name}`);
            } else {
                // Default fallback
                camera_name = `Source: ${source_type || 'Unknown'}`;
                console.log(`🔍 Other source detected: ${camera_name}`);
            }
        } else {
            // Camera name được cung cấp từ frontend, sử dụng nó
            console.log(`📷 Using camera name from frontend: ${camera_name}`);
        }

        // Validate plate format
        const plateValidation = validateVietnamesePlateFormat(plate_number);
        if (!plateValidation.isValid) {
            return res.status(400).json({
                success: false,
                message: `Biển số không hợp lệ: ${plateValidation.reason}`,
                plate_number: plate_number
            });
        }

        // Generate UUID if not provided
        const detectionUuid = detection_uuid || require('crypto').randomUUID();
        
        // Parse bbox if provided
        let bbox_x1 = null, bbox_y1 = null, bbox_x2 = null, bbox_y2 = null;
        if (bbox && Array.isArray(bbox) && bbox.length >= 4) {
            [bbox_x1, bbox_y1, bbox_x2, bbox_y2] = bbox;
        }
        
        // Check BlackList and WhiteList from database
        let actual_whitelist_match = false;
        let actual_blacklist_match = false;
        
        try {
            // DEBUG: Log plate number being checked
            console.log(`🔍 DEBUG: Checking plate number: "${plateValidation.normalized}"`);
            console.log(`🔍 DEBUG: Original plate number: "${plate_number}"`);
            
            // Check whitelist - ENHANCED with validity and approval checks
            const whitelistQuery = `
                SELECT id FROM vehicle_whitelist 
                WHERE plate_number = ? 
                AND is_active = 1 
                AND approval_status = 'approved'
                AND (valid_from IS NULL OR valid_from <= CURDATE())
                AND (valid_to IS NULL OR valid_to >= CURDATE())
            `;
            
            // DEBUG: First check all entries with this plate number (without conditions)
            const debugQuery = 'SELECT * FROM vehicle_whitelist WHERE plate_number = ?';
            const debugResult = await new Promise((resolve, reject) => {
                db.query(debugQuery, [plateValidation.normalized], (error, results) => {
                    if (error) {
                        console.error('❌ DEBUG: Debug query error:', error);
                        reject(error);
                    } else {
                        console.log(`🔍 DEBUG: All whitelist entries for "${plateValidation.normalized}":`, results);
                        resolve(results);
                    }
                });
            });
            
            // DEBUG: Log the exact query being executed
            console.log(`🔍 DEBUG: Whitelist query:`, whitelistQuery);
            console.log(`🔍 DEBUG: Query parameter:`, plateValidation.normalized);
            
            const whitelistResult = await new Promise((resolve, reject) => {
                db.query(whitelistQuery, [plateValidation.normalized], (error, results) => {
                    if (error) {
                        console.error('❌ DEBUG: Whitelist query error:', error);
                        reject(error);
                    } else {
                        console.log(`🔍 DEBUG: Whitelist query result:`, results);
                        resolve(results);
                    }
                });
            });
            actual_whitelist_match = whitelistResult.length > 0;
            
            // Check blacklist - ENHANCED with validity checks
            const blacklistQuery = `
                SELECT id FROM vehicle_blacklist 
                WHERE plate_number = ? 
                AND is_active = 1 
                AND (valid_from IS NULL OR valid_from <= CURDATE())
                AND (valid_to IS NULL OR valid_to >= CURDATE())
            `;
            
            // DEBUG: Log blacklist query
            console.log(`🔍 DEBUG: Blacklist query:`, blacklistQuery);
            
            const blacklistResult = await new Promise((resolve, reject) => {
                db.query(blacklistQuery, [plateValidation.normalized], (error, results) => {
                    if (error) {
                        console.error('❌ DEBUG: Blacklist query error:', error);
                        reject(error);
                    } else {
                        console.log(`🔍 DEBUG: Blacklist query result:`, results);
                        resolve(results);
                    }
                });
            });
            actual_blacklist_match = blacklistResult.length > 0;
            
            console.log(`🔍 ENHANCED BlackList/WhiteList check for ${plateValidation.normalized}:`, {
                whitelist_match: actual_whitelist_match,
                blacklist_match: actual_blacklist_match,
                whitelist_criteria: 'is_active=1 AND approval_status=approved AND valid_dates',
                blacklist_criteria: 'is_active=1 AND valid_dates'
            });
        } catch (error) {
            console.error('❌ Error checking BlackList/WhiteList:', error);
            // Keep original values if database check fails
            actual_whitelist_match = is_whitelist_match;
            actual_blacklist_match = is_blacklist_match;
        }

        // Enhanced logging for debugging
        console.log('🔍 Received plate detection data:', {
            detection_uuid: detectionUuid,
            plate_number: plate_number,
            camera_id: camera_id,
            location_id: location_id,
            confidence_score: confidence_score,
            bbox: bbox,
            whitelist_match: actual_whitelist_match,
            blacklist_match: actual_blacklist_match
        });

        // Prepare data for insertion
        const insertData = {
            detection_uuid: detectionUuid,
            plate_number: plateValidation.normalized,
            raw_plate_text: raw_plate_text || plate_number,
            camera_id: camera_id,
            location_id: actualLocationId,
            detected_at: detected_at && !isNaN(parseInt(detected_at)) ? new Date(parseInt(detected_at)) : new Date(),
            confidence_score: parseFloat(confidence_score) || 0.0,
            ocr_confidence: parseFloat(ocr_confidence) || 0.0,
            detection_confidence: parseFloat(detection_confidence) || 0.0,
            bbox_x1: bbox_x1,
            bbox_y1: bbox_y1,
            bbox_x2: bbox_x2,
            bbox_y2: bbox_y2,
            cropped_plate_image_path: frame_path || null,
            detected_vehicle_type: detected_vehicle_type || 'other',
            source_type: source_type || 'camera',
            video_filename: video_filename,
            camera_name: camera_name || null,
            is_whitelist_match: actual_whitelist_match ? 1 : 0,
            is_blacklist_match: actual_blacklist_match ? 1 : 0,
            is_verified: 0,
            alert_triggered: 0
        };

        // Insert into database
        const insertQuery = `
            INSERT INTO license_plate_detections (
                detection_uuid, plate_number, raw_plate_text, camera_id, location_id,
                detected_at, confidence_score, ocr_confidence, detection_confidence,
                bbox_x1, bbox_y1, bbox_x2, bbox_y2, cropped_plate_image_path,
                detected_vehicle_type, source_type, video_filename, camera_name, is_whitelist_match, is_blacklist_match,
                is_verified, alert_triggered
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const insertParams = [
            insertData.detection_uuid,
            insertData.plate_number,
            insertData.raw_plate_text,
            insertData.camera_id,
            insertData.location_id,
            insertData.detected_at,
            insertData.confidence_score,
            insertData.ocr_confidence,
            insertData.detection_confidence,
            insertData.bbox_x1,
            insertData.bbox_y1,
            insertData.bbox_x2,
            insertData.bbox_y2,
            insertData.cropped_plate_image_path,
            insertData.detected_vehicle_type,
            insertData.source_type,
            insertData.video_filename,
            insertData.camera_name,
            insertData.is_whitelist_match,
            insertData.is_blacklist_match,
            insertData.is_verified,
            insertData.alert_triggered
        ];

        // Log chi tiết trước khi insert
        console.log('🔍 Insert data:', JSON.stringify(insertData, null, 2));
        console.log('🔍 Insert params:', insertParams);
        
        try {
        const result = await new Promise((resolve, reject) => {
            db.query(insertQuery, insertParams, (error, results) => {
                if (error) {
                    // Xử lý duplicate entry - không coi là lỗi nghiêm trọng
                    if (error.code === 'ER_DUP_ENTRY') {
                        console.log(`⚠️ Duplicate entry detected for ${insertData.detection_uuid}, skipping...`);
                        resolve({ duplicate: true });
                    } else {
                        console.error('❌ Insert query error:', error);
                        console.error('❌ Error code:', error.code);
                        console.error('❌ Error sql:', error.sql);
                        console.error('❌ Error message:', error.message);
                        reject(error);
                    }
                } else {
                    console.log('✅ Insert successful, ID:', results.insertId);
                    resolve(results);
                }
            });
        });

        if (result.duplicate) {
            console.log(`⏭️ Skipped duplicate plate detection: ${insertData.plate_number} (BL:${insertData.is_blacklist_match}, WL:${insertData.is_whitelist_match})`);
        } else {
            console.log(`✅ Saved plate detection: ${insertData.plate_number} (BL:${insertData.is_blacklist_match}, WL:${insertData.is_whitelist_match})`);
        }
        } catch (dbError) {
            console.error('❌ Database operation failed:', dbError);
            throw dbError;
        }

        res.status(201).json({
            success: true,
            message: result.duplicate ? 'Duplicate entry skipped' : 'Lưu kết quả nhận diện thành công',
            data: {
                id: result.insertId,
                detection_uuid: insertData.detection_uuid,
                plate_number: insertData.plate_number,
                is_whitelist_match: insertData.is_whitelist_match,
                is_blacklist_match: insertData.is_blacklist_match
            }
        });

    } catch (error) {
        console.error('Error creating license plate recognition:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lưu kết quả nhận diện',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Lấy detections realtime (mới nhất)
const getRealtimeDetections = async (req, res) => {
    try {
        const { limit = 10, camera_id } = req.query;
        
        let whereConditions = [];
        let queryParams = [];
        
        if (camera_id) {
            whereConditions.push('lpd.camera_id = ?');
            queryParams.push(camera_id);
        }
        
        // Add confidence filters to where conditions
        whereConditions.push('lpd.detection_confidence >= 0.8');
        whereConditions.push('lpd.ocr_confidence >= 0.9');
        
        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
        
        const query = `
            SELECT 
                lpd.id, lpd.detection_uuid, lpd.plate_number, lpd.raw_plate_text, 
                lpd.camera_id, lpd.location_id, lpd.detected_at, lpd.confidence_score,
                lpd.ocr_confidence, lpd.detection_confidence,
                lpd.is_whitelist_match, lpd.is_blacklist_match, lpd.alert_triggered,
                lpd.source_type, lpd.cropped_plate_image_path, lpd.bbox_x1, lpd.bbox_y1, lpd.bbox_x2, lpd.bbox_y2,
                c.name as camera_name,
                loc.name as location_name
            FROM license_plate_detections lpd
            LEFT JOIN cameras c ON lpd.camera_id = c.id
            LEFT JOIN locations loc ON lpd.location_id = loc.id
            ${whereClause}
            ORDER BY lpd.detected_at DESC
            LIMIT ?
        `;
        
        queryParams.push(parseInt(limit));
        
        const detections = await new Promise((resolve, reject) => {
            db.query(query, queryParams, (error, results) => {
                if (error) {
                    console.error('Realtime detections query error:', error);
                    reject(error);
                } else {
                    resolve(results || []);
                }
            });
        });
        
        res.status(200).json({
            success: true,
            data: detections,
            count: detections.length,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error getting realtime detections:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách detections realtime',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    getLicensePlateRecognitions,
    getLicensePlateRecognitionById,
    getLicensePlateRecognitionStats,
    deleteLicensePlateRecognition,
    updateRecognitionVerification,
    createLicensePlateRecognition,
    getRealtimeDetections
};