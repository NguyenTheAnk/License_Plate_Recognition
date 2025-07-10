const db = require('../../db');


const getAllWhitelist = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const {
            page = 1,
            limit = 50,
            location_id,
            plate_number,
            approval_status,
            is_active,
            valid_status,
            sort_by = 'created_at',
            sort_order = 'DESC'
        } = req.query;

        // Validate and parse pagination parameters
        const parsedPage = Math.max(1, parseInt(page) || 1);
        const parsedLimit = Math.min(100, Math.max(1, parseInt(limit) || 50));
        const offset = (parsedPage - 1) * parsedLimit;
        
        console.log('Pagination params:', { page, limit, offset, parsedPage, parsedLimit });
        
        // Build WHERE conditions and parameters
        let whereConditions = [];
        let queryParams = [];

        // Location filter
        if (location_id) {
            whereConditions.push('w.location_id = ?');
            queryParams.push(parseInt(location_id));
        }

        // Plate number search
        if (plate_number) {
            whereConditions.push('w.plate_number LIKE ?');
            queryParams.push(`%${plate_number}%`);
        }

        // Approval status filter
        if (approval_status) {
            whereConditions.push('w.approval_status = ?');
            queryParams.push(approval_status);
        }

        // Active status filter
        if (is_active !== undefined && is_active !== null && is_active !== '') {
            whereConditions.push('w.is_active = ?');
            queryParams.push(is_active === 'true' ? 1 : 0);
        }

        // Valid status filter
        if (valid_status) {
            const today = new Date().toISOString().split('T')[0];
            if (valid_status === 'valid') {
                whereConditions.push('(w.valid_from IS NULL OR w.valid_from <= ?) AND (w.valid_to IS NULL OR w.valid_to >= ?)');
                queryParams.push(today, today);
            } else if (valid_status === 'expired') {
                whereConditions.push('w.valid_to IS NOT NULL AND w.valid_to < ?');
                queryParams.push(today);
            } else if (valid_status === 'future') {
                whereConditions.push('w.valid_from IS NOT NULL AND w.valid_from > ?');
                queryParams.push(today);
            }
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Validate sort parameters
        const allowedSortFields = ['created_at', 'updated_at', 'plate_number', 'approval_status', 'valid_from', 'valid_to'];
        const sortBy = allowedSortFields.includes(sort_by) ? sort_by : 'created_at';
        const sortOrder = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        console.log('WHERE clause:', whereClause);
        console.log('Query params:', queryParams);

        // Get total count first
        const countQuery = `SELECT COUNT(*) as total FROM vehicle_whitelist w ${whereClause}`;
        console.log('Count query:', countQuery);
        
        const [countResult] = await connection.execute(countQuery, queryParams);
        const total = countResult[0].total;
        console.log('Count result:', total);

        // SOLUTION: Use direct string interpolation for LIMIT and OFFSET to avoid parameter issues
        const dataQuery = `
        SELECT w.id, w.location_id, w.plate_number, w.vehicle_id,
               w.owner_name, w.owner_phone, w.contact_email,
               w.valid_from, w.valid_to, w.description, 
               w.approval_status, w.approved_by, w.approved_at,
               w.is_active, w.created_by, w.created_at, w.updated_at,
               w.plate_image_path, w.detected_plate_image, w.ocr_raw_text, w.ocr_processed_at,
               w.ocr_confidence, w.verification_status, w.verified_plate_number,
               l.name as location_name, 
               l.code as location_code,
               l.zone_type,
               u1.name as created_by_name,
               u2.name as approved_by_name,
               CASE 
                   WHEN w.valid_from IS NULL AND w.valid_to IS NULL THEN 'permanent'
                   WHEN w.valid_from IS NOT NULL AND w.valid_from > CURDATE() THEN 'future'
                   WHEN w.valid_to IS NOT NULL AND w.valid_to < CURDATE() THEN 'expired'
                   ELSE 'valid'
               END as current_status,
               CASE 
                   WHEN w.plate_image_path IS NOT NULL OR w.detected_plate_image IS NOT NULL THEN 1 
                   ELSE 0 
               END as has_images
        FROM vehicle_whitelist w
        LEFT JOIN locations l ON w.location_id = l.id
        LEFT JOIN users u1 ON w.created_by = u1.id
        LEFT JOIN users u2 ON w.approved_by = u2.id
        ${whereClause}
        ORDER BY w.${sortBy} ${sortOrder}
        LIMIT ${parsedLimit} OFFSET ${offset}`;

        console.log('Data query:', dataQuery);
        console.log('Data query params (only filters):', queryParams);

        // Execute with only filter parameters (no LIMIT/OFFSET params)
        const [whitelistEntries] = await connection.execute(dataQuery, queryParams);

        console.log('Query executed successfully, results:', whitelistEntries.length);

        // Log access for audit trail
        try {
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, status, created_at)
                 VALUES (?, ?, 'VIEW', 'WHITELIST', 'SUCCESS', NOW())`,
                [
                    req.user.userId,
                    req.user.username || req.user.email
                ]
            );
        } catch (auditError) {
            console.warn('Audit log failed:', auditError.message);
        }

        // Return response
        res.status(200).json({
            success: true,
            message: 'Lấy danh sách trắng thành công',
            data: whitelistEntries,
            pagination: {
                current_page: parsedPage,
                per_page: parsedLimit,
                total: total,
                total_pages: Math.ceil(total / parsedLimit),
                has_next: (parsedPage * parsedLimit) < total,
                has_prev: parsedPage > 1
            },
            filters_applied: {
                location_id: location_id || null,
                plate_number: plate_number || null,
                approval_status: approval_status || null,
                is_active: is_active || null,
                valid_status: valid_status || null
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
            message: 'Lỗi khi lấy danh sách trắng',
            error: process.env.NODE_ENV === 'development' ? {
                message: error.message,
                code: error.code,
                details: error.sqlMessage
            } : undefined
        });
    }
};

/**
 * Get whitelist entry by ID with detailed information
 */
const getWhitelistById = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;
        const { include_detection_history = 'false' } = req.query;

        // Get whitelist entry with related data
        const [whitelistEntry] = await connection.execute(
            `SELECT w.*, 
                    l.name as location_name, 
                    l.code as location_code,
                    l.address as location_address,
                    l.zone_type,
                    l.latitude,
                    l.longitude,
                    v.make, v.model, v.color, v.vehicle_type, v.year_manufactured,
                    v.owner_name as vehicle_owner_name,
                    v.owner_phone as vehicle_owner_phone,
                    v.owner_email as vehicle_owner_email,
                    v.owner_address as vehicle_owner_address,
                    u1.name as created_by_name, 
                    u1.email as created_by_email,
                    u2.name as approved_by_name,
                    u2.email as approved_by_email,
                    CASE 
                        WHEN w.valid_from IS NULL AND w.valid_to IS NULL THEN 'permanent'
                        WHEN w.valid_from IS NOT NULL AND w.valid_from > CURDATE() THEN 'future'
                        WHEN w.valid_to IS NOT NULL AND w.valid_to < CURDATE() THEN 'expired'
                        ELSE 'valid'
                    END as current_status,
                    DATEDIFF(COALESCE(w.valid_to, '9999-12-31'), CURDATE()) as days_until_expiry,
                    CASE 
                        WHEN w.plate_image_path IS NOT NULL OR w.detected_plate_image IS NOT NULL OR w.plate_image_cropped_path IS NOT NULL OR w.plate_image_processed_path IS NOT NULL THEN TRUE
                        ELSE FALSE
                    END as has_images
             FROM vehicle_whitelist w
             LEFT JOIN locations l ON w.location_id = l.id
             LEFT JOIN vehicles v ON w.vehicle_id = v.id
             LEFT JOIN users u1 ON w.created_by = u1.id
             LEFT JOIN users u2 ON w.approved_by = u2.id
             WHERE w.id = ?`,
            [id]
        );

        if (whitelistEntry.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy whitelist entry'
            });
        }

        const entry = whitelistEntry[0];

        // SỬA: Xử lý image_metadata an toàn
        const parseImageMetadata = (metadata) => {
            try {
                if (!metadata) return null;
                if (typeof metadata === 'object') return metadata;
                if (typeof metadata === 'string') {
                    // Kiểm tra nếu string bắt đầu bằng { hoặc [
                    if (metadata.startsWith('{') || metadata.startsWith('[')) {
                        return JSON.parse(metadata);
                    }
                }
                return null;
            } catch (err) {
                console.warn('Failed to parse image_metadata:', err);
                return null;
            }
        };

        // Get image information
        const imageInfo = {
            has_images: entry.has_images,
            original_image: entry.plate_image_path ? {
                path: entry.plate_image_path,
                exists: true
            } : null,
            detected_image: entry.detected_plate_image ? {
                path: entry.detected_plate_image,
                exists: true
            } : null,
            cropped_image: entry.plate_image_cropped_path ? {
                path: entry.plate_image_cropped_path,
                exists: true
            } : null,
            processed_image: entry.plate_image_processed_path ? {
                path: entry.plate_image_processed_path,
                exists: true
            } : null,
            image_metadata: parseImageMetadata(entry.image_metadata)
        };

        // Get OCR information
        const ocrInfo = {
            raw_text: entry.ocr_raw_text,
            confidence: entry.ocr_confidence,
            processed_at: entry.ocr_processed_at,
            verification_status: entry.verification_status,
            verified_plate_number: entry.verified_plate_number,
            plate_number_matches: entry.plate_number === entry.verified_plate_number
        };

        // Get recent detections for this plate number at this location
        const [recentDetections] = await connection.execute(
            `SELECT lpd.id, lpd.detected_at, lpd.direction, lpd.confidence_score, lpd.is_verified,
                    lpd.original_image_path, lpd.cropped_plate_image_path,
                    c.name as camera_name, c.camera_key
             FROM license_plate_detections lpd
             LEFT JOIN cameras c ON lpd.camera_id = c.id
             WHERE lpd.plate_number = ? AND lpd.location_id = ?
             ORDER BY lpd.detected_at DESC
             LIMIT 10`,
            [entry.plate_number, entry.location_id]
        );

        // Get usage statistics
        const [usageStats] = await connection.execute(
            `SELECT 
                COUNT(*) as total_detections,
                COUNT(DISTINCT DATE(lpd.detected_at)) as active_days,
                MAX(lpd.detected_at) as last_detection,
                MIN(lpd.detected_at) as first_detection,
                COUNT(CASE WHEN lpd.detected_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as detections_last_7_days,
                COUNT(CASE WHEN lpd.detected_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as detections_last_30_days,
                COUNT(CASE WHEN lpd.direction = 'inbound' THEN 1 END) as inbound_count,
                COUNT(CASE WHEN lpd.direction = 'outbound' THEN 1 END) as outbound_count,
                AVG(lpd.confidence_score) as avg_confidence,
                COUNT(CASE WHEN lpd.is_verified = TRUE THEN 1 END) as verified_detections
             FROM license_plate_detections lpd
             WHERE lpd.plate_number = ? AND lpd.location_id = ?`,
            [entry.plate_number, entry.location_id]
        );

        // Get full detection history if requested
        let detectionHistory = null;
        if (include_detection_history === 'true') {
            const [fullDetections] = await connection.execute(
                `SELECT lpd.*, c.name as camera_name, c.camera_key
                 FROM license_plate_detections lpd
                 LEFT JOIN cameras c ON lpd.camera_id = c.id
                 WHERE lpd.plate_number = ? AND lpd.location_id = ?
                 ORDER BY lpd.detected_at DESC
                 LIMIT 100`,
                [entry.plate_number, entry.location_id]
            );
            detectionHistory = fullDetections;
        }

        // Get related alerts
        const [relatedAlerts] = await connection.execute(
            `SELECT a.id, a.alert_type, a.severity, a.title, a.status, a.created_at
             FROM alerts a
             WHERE a.plate_number = ? AND a.location_id = ?
             ORDER BY a.created_at DESC
             LIMIT 5`,
            [entry.plate_number, entry.location_id]
        );

        // Build result object
        const result = {
            ...entry,
            image_info: imageInfo,
            ocr_info: ocrInfo,
            recent_detections: recentDetections,
            usage_statistics: usageStats[0] || {},
            related_alerts: relatedAlerts
        };

        if (detectionHistory) {
            result.detection_history = detectionHistory;
        }

        // Log access for audit trail
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id,
                                    status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'VIEW', 'WHITELIST', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                id,
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Lấy thông tin whitelist entry thành công',
            data: result
        });

    } catch (error) {
        console.error('Error fetching whitelist entry:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin whitelist entry',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get whitelist entries by plate number with flexible search options
 */
const getWhitelistByPlateNumber = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { plate_number } = req.params;
        const { location_id, include_inactive = 'false', exact_match = 'true' } = req.query;

        let whereConditions = [];
        let queryParams = [];

        // Handle exact vs fuzzy search
        if (exact_match === 'true') {
            whereConditions.push('(w.plate_number = ? OR w.verified_plate_number = ?)');
            queryParams.push(plate_number, plate_number);
        } else {
            whereConditions.push('(w.plate_number LIKE ? OR w.verified_plate_number LIKE ? OR w.ocr_raw_text LIKE ?)');
            const searchTerm = `%${plate_number}%`;
            queryParams.push(searchTerm, searchTerm, searchTerm);
        }

        // Location filter
        if (location_id) {
            whereConditions.push('w.location_id = ?');
            queryParams.push(location_id);
        }

        // Active status filter
        if (include_inactive !== 'true') {
            whereConditions.push('w.is_active = 1');
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        const [whitelistEntries] = await connection.execute(
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
                    END as current_status,
                    CASE 
                        WHEN w.plate_image_path IS NOT NULL OR w.plate_image_cropped_path IS NOT NULL OR w.plate_image_processed_path IS NOT NULL THEN TRUE
                        ELSE FALSE
                    END as has_images
             FROM vehicle_whitelist w
             LEFT JOIN locations l ON w.location_id = l.id
             LEFT JOIN vehicles v ON w.vehicle_id = v.id
             LEFT JOIN users u1 ON w.created_by = u1.id
             LEFT JOIN users u2 ON w.approved_by = u2.id
             ${whereClause}
             ORDER BY w.created_at DESC`,
            queryParams
        );

        res.status(200).json({
            success: true,
            message: 'Lấy danh sách whitelist theo biển số thành công',
            data: whitelistEntries,
            search_params: {
                plate_number,
                location_id: location_id || null,
                include_inactive: include_inactive === 'true',
                exact_match: exact_match === 'true'
            },
            count: whitelistEntries.length
        });

    } catch (error) {
        console.error('Error fetching whitelist by plate number:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách whitelist theo biển số',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Advanced search functionality for whitelist entries
 */
const searchWhitelist = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { 
            q, // general search query
            plate_number,
            owner_name,
            location_id,
            approval_status,
            valid_status,
            verification_status,
            ocr_text,
            has_images,
            confidence_min,
            confidence_max,
            date_from,
            date_to,
            page = 1,
            limit = 20
        } = req.query;

        const offset = (page - 1) * limit;
        let whereConditions = [];
        let queryParams = [];

        // General search across multiple fields
        if (q) {
            whereConditions.push(`(
                w.plate_number LIKE ? OR 
                w.verified_plate_number LIKE ? OR
                w.ocr_raw_text LIKE ? OR
                w.owner_name LIKE ? OR 
                w.description LIKE ? OR
                l.name LIKE ?
            )`);
            const searchTerm = `%${q}%`;
            queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
        }

        // Specific field searches
        if (plate_number) {
            whereConditions.push('(w.plate_number LIKE ? OR w.verified_plate_number LIKE ?)');
            const plateSearchTerm = `%${plate_number}%`;
            queryParams.push(plateSearchTerm, plateSearchTerm);
        }

        if (owner_name) {
            whereConditions.push('w.owner_name LIKE ?');
            queryParams.push(`%${owner_name}%`);
        }

        if (location_id) {
            whereConditions.push('w.location_id = ?');
            queryParams.push(location_id);
        }

        if (approval_status) {
            whereConditions.push('w.approval_status = ?');
            queryParams.push(approval_status);
        }

        if (verification_status) {
            whereConditions.push('w.verification_status = ?');
            queryParams.push(verification_status);
        }

        if (ocr_text) {
            whereConditions.push('w.ocr_raw_text LIKE ?');
            queryParams.push(`%${ocr_text}%`);
        }

        if (has_images === 'true') {
            whereConditions.push('(w.plate_image_path IS NOT NULL OR w.plate_image_cropped_path IS NOT NULL OR w.plate_image_processed_path IS NOT NULL)');
        } else if (has_images === 'false') {
            whereConditions.push('(w.plate_image_path IS NULL AND w.plate_image_cropped_path IS NULL AND w.plate_image_processed_path IS NULL)');
        }

        if (confidence_min) {
            whereConditions.push('w.ocr_confidence >= ?');
            queryParams.push(parseFloat(confidence_min));
        }

        if (confidence_max) {
            whereConditions.push('w.ocr_confidence <= ?');
            queryParams.push(parseFloat(confidence_max));
        }

        if (date_from) {
            whereConditions.push('w.created_at >= ?');
            queryParams.push(date_from);
        }

        if (date_to) {
            whereConditions.push('w.created_at <= ?');
            queryParams.push(date_to + ' 23:59:59');
        }

        // Handle valid status filter
        if (valid_status) {
            const today = new Date().toISOString().split('T')[0];
            if (valid_status === 'valid') {
                whereConditions.push('(w.valid_from IS NULL OR w.valid_from <= ?) AND (w.valid_to IS NULL OR w.valid_to >= ?)');
                queryParams.push(today, today);
            } else if (valid_status === 'expired') {
                whereConditions.push('w.valid_to IS NOT NULL AND w.valid_to < ?');
                queryParams.push(today);
            }
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Get total count
        const countParams = [...queryParams];
        const [countResult] = await connection.execute(
            `SELECT COUNT(*) as total 
             FROM vehicle_whitelist w
             LEFT JOIN locations l ON w.location_id = l.id
             ${whereClause}`,
            countParams
        );

        // Get search results
        const searchParams = [...queryParams, parseInt(limit), parseInt(offset)];
        const [results] = await connection.execute(
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
                    END as current_status,
                    CASE 
                        WHEN w.plate_image_path IS NOT NULL OR w.plate_image_cropped_path IS NOT NULL OR w.plate_image_processed_path IS NOT NULL THEN TRUE
                        ELSE FALSE
                    END as has_images
             FROM vehicle_whitelist w
             LEFT JOIN locations l ON w.location_id = l.id
             LEFT JOIN vehicles v ON w.vehicle_id = v.id
             LEFT JOIN users u1 ON w.created_by = u1.id
             LEFT JOIN users u2 ON w.approved_by = u2.id
             ${whereClause}
             ORDER BY w.created_at DESC
             LIMIT ? OFFSET ?`,
            searchParams
        );

        res.status(200).json({
            success: true,
            message: 'Tìm kiếm whitelist thành công',
            data: results,
            pagination: {
                current_page: parseInt(page),
                per_page: parseInt(limit),
                total: countResult[0].total,
                total_pages: Math.ceil(countResult[0].total / limit)
            },
            search_criteria: {
                general_query: q || null,
                plate_number: plate_number || null,
                owner_name: owner_name || null,
                location_id: location_id || null,
                approval_status: approval_status || null,
                valid_status: valid_status || null,
                verification_status: verification_status || null,
                ocr_text: ocr_text || null,
                has_images: has_images || null,
                confidence_range: {
                    min: confidence_min || null,
                    max: confidence_max || null
                },
                date_range: {
                    from: date_from || null,
                    to: date_to || null
                }
            }
        });

    } catch (error) {
        console.error('Error searching whitelist:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tìm kiếm whitelist',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get comprehensive statistics for whitelist entries
 */
const getWhitelistStatistics = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { location_id, time_period = '30' } = req.query;

        let locationFilter = '';
        let queryParams = [];

        if (location_id) {
            locationFilter = 'AND w.location_id = ?';
            queryParams.push(location_id);
        }

        // Get general statistics
        const [generalStats] = await connection.execute(
            `SELECT 
                COUNT(*) as total_entries,
                COUNT(CASE WHEN w.is_active = 1 THEN 1 END) as active_entries,
                COUNT(CASE WHEN w.approval_status = 'pending' THEN 1 END) as pending_approval,
                COUNT(CASE WHEN w.approval_status = 'approved' THEN 1 END) as approved_entries,
                COUNT(CASE WHEN w.approval_status = 'rejected' THEN 1 END) as rejected_entries,
                COUNT(CASE WHEN w.valid_to IS NOT NULL AND w.valid_to < CURDATE() THEN 1 END) as expired_entries,
                COUNT(CASE WHEN w.valid_from IS NOT NULL AND w.valid_from > CURDATE() THEN 1 END) as future_entries,
                COUNT(CASE WHEN w.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) THEN 1 END) as recent_additions,
                COUNT(CASE WHEN w.ocr_raw_text IS NOT NULL THEN 1 END) as entries_with_ocr,
                COUNT(CASE WHEN w.verification_status = 'ocr_matched' THEN 1 END) as ocr_matched,
                COUNT(CASE WHEN w.verification_status = 'manually_verified' THEN 1 END) as manually_verified,
                COUNT(CASE WHEN w.verification_status = 'rejected' THEN 1 END) as ocr_rejected,
                AVG(w.ocr_confidence) as avg_ocr_confidence,
                COUNT(CASE WHEN w.plate_image_path IS NOT NULL THEN 1 END) as entries_with_original_image,
                COUNT(CASE WHEN w.plate_image_cropped_path IS NOT NULL THEN 1 END) as entries_with_cropped_image,
                COUNT(CASE WHEN w.plate_image_processed_path IS NOT NULL THEN 1 END) as entries_with_processed_image
             FROM vehicle_whitelist w
             WHERE 1=1 ${locationFilter}`,
            [time_period, ...queryParams]
        );

        // Get statistics by location
        const locationStatsParams = location_id ? [location_id] : [];
        const [locationStats] = await connection.execute(
            `SELECT 
                l.id, l.name as location_name, l.code as location_code, l.zone_type,
                COUNT(w.id) as total_entries,
                COUNT(CASE WHEN w.is_active = 1 THEN 1 END) as active_entries,
                COUNT(CASE WHEN w.approval_status = 'pending' THEN 1 END) as pending_entries,
                COUNT(CASE WHEN w.ocr_raw_text IS NOT NULL THEN 1 END) as entries_with_ocr,
                AVG(w.ocr_confidence) as avg_ocr_confidence
             FROM locations l
             LEFT JOIN vehicle_whitelist w ON l.id = w.location_id ${location_id ? 'AND l.id = ?' : ''}
             WHERE l.is_active = 1
             GROUP BY l.id, l.name, l.code, l.zone_type
             ORDER BY total_entries DESC`,
            locationStatsParams
        );

        // Get verification status statistics
        const verificationStatsParams = location_id ? [location_id] : [];
        const [verificationStats] = await connection.execute(
            `SELECT 
                w.verification_status,
                COUNT(*) as count,
                AVG(w.ocr_confidence) as avg_confidence
             FROM vehicle_whitelist w
             WHERE w.ocr_raw_text IS NOT NULL ${locationFilter}
             GROUP BY w.verification_status
             ORDER BY count DESC`,
            verificationStatsParams
        );

        // Get recent activity
        const recentActivityParams = [time_period, ...queryParams];
        const [recentActivity] = await connection.execute(
            `SELECT 
                w.id, w.plate_number, w.created_at, w.approval_status, w.verification_status,
                l.name as location_name,
                u.name as created_by_name
             FROM vehicle_whitelist w
             LEFT JOIN locations l ON w.location_id = l.id
             LEFT JOIN users u ON w.created_by = u.id
             WHERE w.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) ${locationFilter}
             ORDER BY w.created_at DESC
             LIMIT 20`,
            recentActivityParams
        );

        // Get top plates by detection count
        const topPlatesParams = [time_period, ...queryParams];
        const [topPlates] = await connection.execute(
            `SELECT 
                w.plate_number, 
                w.verified_plate_number,
                l.name as location_name,
                COUNT(lpd.id) as detection_count,
                MAX(lpd.detected_at) as last_detection,
                AVG(lpd.confidence_score) as avg_detection_confidence
             FROM vehicle_whitelist w
             LEFT JOIN locations l ON w.location_id = l.id
             LEFT JOIN license_plate_detections lpd ON w.plate_number = lpd.plate_number 
                                                      AND w.location_id = lpd.location_id
                                                      AND lpd.detected_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
             WHERE w.is_active = 1 ${locationFilter}
             GROUP BY w.plate_number, w.verified_plate_number, l.name
             HAVING detection_count > 0
             ORDER BY detection_count DESC
             LIMIT 10`,
            topPlatesParams
        );

        // Get OCR accuracy statistics
        const ocrAccuracyParams = location_id ? [location_id] : [];
        const [ocrAccuracyStats] = await connection.execute(
            `SELECT 
                CASE 
                    WHEN w.ocr_confidence >= 0.9 THEN 'high'
                    WHEN w.ocr_confidence >= 0.7 THEN 'medium'
                    WHEN w.ocr_confidence >= 0.5 THEN 'low'
                    ELSE 'very_low'
                END as confidence_range,
                COUNT(*) as count,
                COUNT(CASE WHEN w.verification_status = 'ocr_matched' THEN 1 END) as verified_matches
             FROM vehicle_whitelist w
             WHERE w.ocr_confidence IS NOT NULL ${locationFilter}
             GROUP BY confidence_range
             ORDER BY FIELD(confidence_range, 'high', 'medium', 'low', 'very_low')`,
            ocrAccuracyParams
        );

        res.status(200).json({
            success: true,
            message: 'Lấy thống kê whitelist thành công',
            data: {
                general_statistics: generalStats[0] || {},
                by_location: locationStats,
                verification_statistics: verificationStats,
                ocr_accuracy_statistics: ocrAccuracyStats,
                recent_activity: recentActivity,
                top_active_plates: topPlates,
                time_period: `${time_period} days`,
                location_filter: location_id || 'all'
            }
        });

    } catch (error) {
        console.error('Error fetching whitelist statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thống kê whitelist',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get image information for a specific whitelist entry
 */
const getWhitelistImages = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;
        const { image_type = 'all' } = req.query;

        // Check if whitelist entry exists
        const [whitelistEntry] = await connection.execute(
            `SELECT id, plate_number, plate_image_path, plate_image_cropped_path, 
                    plate_image_processed_path, image_metadata
             FROM vehicle_whitelist WHERE id = ?`,
            [id]
        );

        if (whitelistEntry.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy whitelist entry'
            });
        }

        const entry = whitelistEntry[0];
        const images = {};

        // Build image response based on requested type
        if (image_type === 'all' || image_type === 'original') {
            images.original = entry.plate_image_path ? {
                path: entry.plate_image_path,
                type: 'original'
            } : null;
        }

        if (image_type === 'all' || image_type === 'cropped') {
            images.cropped = entry.plate_image_cropped_path ? {
                path: entry.plate_image_cropped_path,
                type: 'cropped'
            } : null;
        }

        if (image_type === 'all' || image_type === 'processed') {
            images.processed = entry.plate_image_processed_path ? {
                path: entry.plate_image_processed_path,
                type: 'processed'
            } : null;
        }

        const imageMetadata = entry.image_metadata ? JSON.parse(entry.image_metadata) : null;

        // Log access for audit trail
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id,
                                    status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'VIEW_IMAGES', 'WHITELIST', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                id,
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Lấy thông tin ảnh whitelist thành công',
            data: {
                id: parseInt(id),
                plate_number: entry.plate_number,
                images,
                image_metadata: imageMetadata,
                requested_type: image_type
            }
        });

    } catch (error) {
        console.error('Error fetching whitelist images:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy ảnh whitelist',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get OCR data for a specific whitelist entry
 */
const getWhitelistOCRData = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;

        // Get OCR data for whitelist entry
        const [whitelistEntry] = await connection.execute(
            `SELECT id, plate_number, ocr_raw_text, ocr_confidence, ocr_processed_at,
                    verification_status, verified_plate_number, image_metadata
             FROM vehicle_whitelist WHERE id = ?`,
            [id]
        );

        if (whitelistEntry.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy whitelist entry'
            });
        }

        const entry = whitelistEntry[0];

        // Build OCR data response
        const ocrData = {
            id: entry.id,
            plate_number: entry.plate_number,
            ocr_raw_text: entry.ocr_raw_text,
            ocr_confidence: entry.ocr_confidence,
            ocr_processed_at: entry.ocr_processed_at,
            verification_status: entry.verification_status,
            verified_plate_number: entry.verified_plate_number,
            image_metadata: entry.image_metadata ? JSON.parse(entry.image_metadata) : null,
            has_ocr_data: entry.ocr_raw_text !== null,
            plate_number_matches: entry.plate_number === entry.verified_plate_number,
            confidence_level: entry.ocr_confidence ? (
                entry.ocr_confidence >= 0.9 ? 'high' :
                entry.ocr_confidence >= 0.7 ? 'medium' :
                entry.ocr_confidence >= 0.5 ? 'low' : 'very_low'
            ) : null
        };

        // Log access for audit trail
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id,
                                    status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'VIEW_OCR', 'WHITELIST', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                id,
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Lấy thông tin OCR whitelist thành công',
            data: ocrData
        });

    } catch (error) {
        console.error('Error fetching whitelist OCR data:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin OCR whitelist',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Export whitelist data in various formats
 */
const exportWhitelistData = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const {
            format = 'csv',
            location_id,
            approval_status,
            valid_status,
            include_images = 'false',
            include_ocr = 'true',
            date_from,
            date_to
        } = req.query;

        let whereConditions = [];
        let queryParams = [];

        // Build export filters
        if (location_id) {
            whereConditions.push('w.location_id = ?');
            queryParams.push(location_id);
        }

        if (approval_status) {
            whereConditions.push('w.approval_status = ?');
            queryParams.push(approval_status);
        }

        if (date_from) {
            whereConditions.push('w.created_at >= ?');
            queryParams.push(date_from);
        }

        if (date_to) {
            whereConditions.push('w.created_at <= ?');
            queryParams.push(date_to + ' 23:59:59');
        }

        // Handle valid status filter
        if (valid_status) {
            const today = new Date().toISOString().split('T')[0];
            if (valid_status === 'valid') {
                whereConditions.push('(w.valid_from IS NULL OR w.valid_from <= ?) AND (w.valid_to IS NULL OR w.valid_to >= ?)');
                queryParams.push(today, today);
            } else if (valid_status === 'expired') {
                whereConditions.push('w.valid_to IS NOT NULL AND w.valid_to < ?');
                queryParams.push(today);
            }
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Build SELECT fields based on export options
        let selectFields = `
            w.id, w.plate_number, w.vehicle_id, w.owner_name, w.owner_phone, w.contact_email,
            w.valid_from, w.valid_to, w.description, w.approval_status, w.is_active,
            w.created_at, w.updated_at,
            l.name as location_name, l.code as location_code, l.zone_type,
            v.make, v.model, v.color, v.vehicle_type,
            u1.name as created_by_name, u2.name as approved_by_name,
            CASE 
                WHEN w.valid_from IS NULL AND w.valid_to IS NULL THEN 'permanent'
                WHEN w.valid_from IS NOT NULL AND w.valid_from > CURDATE() THEN 'future'
                WHEN w.valid_to IS NOT NULL AND w.valid_to < CURDATE() THEN 'expired'
                ELSE 'valid'
            END as current_status
        `;

        if (include_ocr === 'true') {
            selectFields += `, 
                w.ocr_raw_text, w.ocr_confidence, w.ocr_processed_at,
                w.verification_status, w.verified_plate_number
            `;
        }

        if (include_images === 'true') {
            selectFields += `, 
                w.plate_image_path, w.plate_image_cropped_path, w.plate_image_processed_path,
                w.image_metadata
            `;
        }

        // Get export data
        const [exportData] = await connection.execute(
            `SELECT ${selectFields}
             FROM vehicle_whitelist w
             LEFT JOIN locations l ON w.location_id = l.id
             LEFT JOIN vehicles v ON w.vehicle_id = v.id
             LEFT JOIN users u1 ON w.created_by = u1.id
             LEFT JOIN users u2 ON w.approved_by = u2.id
             ${whereClause}
             ORDER BY w.created_at DESC`,
            queryParams
        );

        // Log export activity
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, 
                                    new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'EXPORT', 'WHITELIST', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                JSON.stringify({
                    format,
                    record_count: exportData.length,
                    filters: {
                        location_id: location_id || null,
                        approval_status: approval_status || null,
                        valid_status: valid_status || null,
                        date_range: {
                            from: date_from || null,
                            to: date_to || null
                        }
                    },
                    options: {
                        include_images: include_images === 'true',
                        include_ocr: include_ocr === 'true'
                    }
                }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        // Return data based on requested format
        if (format === 'json') {
            res.status(200).json({
                success: true,
                message: `Xuất dữ liệu thành công ${exportData.length} records`,
                data: exportData,
                export_info: {
                    format,
                    record_count: exportData.length,
                    exported_at: new Date(),
                    exported_by: req.user.username || req.user.email
                }
            });
        } else {
            res.status(200).json({
                success: true,
                message: `Chuẩn bị xuất dữ liệu ${format.toUpperCase()} với ${exportData.length} records`,
                data: {
                    format,
                    record_count: exportData.length,
                    download_ready: true,
                    download_url: `/api/whitelist/download-export/${Date.now()}`
                }
            });
        }

    } catch (error) {
        console.error('Error exporting whitelist data:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xuất dữ liệu whitelist',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get audit log for a specific whitelist entry
 */
const getWhitelistAuditLog = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;
        const { page = 1, limit = 20 } = req.query;

        const offset = (page - 1) * limit;

        // Check if whitelist entry exists
        const [whitelistEntry] = await connection.execute(
            'SELECT id, plate_number FROM vehicle_whitelist WHERE id = ?',
            [id]
        );

        if (whitelistEntry.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy whitelist entry'
            });
        }

        // Get audit logs for this whitelist entry
        const [auditLogs] = await connection.execute(
            `SELECT al.*, u.name as user_name, u.email as user_email
             FROM access_logs al
             LEFT JOIN users u ON al.user_id = u.id
             WHERE al.object_type = 'WHITELIST' AND al.object_id = ?
             ORDER BY al.created_at DESC
             LIMIT ? OFFSET ?`,
            [id, parseInt(limit), parseInt(offset)]
        );

        // Get total count of audit logs
        const [countResult] = await connection.execute(
            `SELECT COUNT(*) as total
             FROM access_logs 
             WHERE object_type = 'WHITELIST' AND object_id = ?`,
            [id]
        );

        res.status(200).json({
            success: true,
            message: 'Lấy lịch sử audit thành công',
            data: {
                whitelist_entry: whitelistEntry[0],
                audit_logs: auditLogs,
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total: countResult[0].total,
                    total_pages: Math.ceil(countResult[0].total / limit)
                }
            }
        });

    } catch (error) {
        console.error('Error fetching whitelist audit log:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy lịch sử audit whitelist',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};


module.exports = {
    getAllWhitelist,
    getWhitelistById,
    getWhitelistByPlateNumber,
    searchWhitelist,
    getWhitelistStatistics,
    getWhitelistImages,
    getWhitelistOCRData,
    exportWhitelistData,
    getWhitelistAuditLog
};