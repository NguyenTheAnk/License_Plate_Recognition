const db = require('../../db');

const getAllBlacklist = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const {
            page = 1,
            limit = 50,
            location_id,
            plate_number,
            violation_type,
            severity,
            is_active,
            valid_status,
            sort_by = 'created_at',
            sort_order = 'DESC'
        } = req.query;

        // Validate and parse pagination parameters
        const parsedPage = Math.max(1, parseInt(page) || 1);
        const parsedLimit = Math.min(100, Math.max(1, parseInt(limit) || 50));
        const offset = (parsedPage - 1) * parsedLimit;
        
        // Build WHERE conditions
        let whereConditions = [];
        let queryParams = [];

        if (location_id) {
            whereConditions.push('b.location_id = ?');
            queryParams.push(location_id);
        }

        if (plate_number) {
            whereConditions.push('b.plate_number LIKE ?');
            queryParams.push(`%${plate_number}%`);
        }

        if (violation_type) {
            whereConditions.push('b.violation_type = ?');
            queryParams.push(violation_type);
        }

        if (severity) {
            whereConditions.push('b.severity = ?');
            queryParams.push(severity);
        }

        if (is_active !== undefined) {
            whereConditions.push('b.is_active = ?');
            queryParams.push(is_active === 'true' ? 1 : 0);
        }

        // Handle valid status filter
        if (valid_status) {
            const today = new Date().toISOString().split('T')[0];
            if (valid_status === 'active') {
                whereConditions.push('(b.valid_from IS NULL OR b.valid_from <= ?) AND (b.valid_to IS NULL OR b.valid_to >= ?)');
                queryParams.push(today, today);
            } else if (valid_status === 'expired') {
                whereConditions.push('b.valid_to IS NOT NULL AND b.valid_to < ?');
                queryParams.push(today);
            } else if (valid_status === 'future') {
                whereConditions.push('b.valid_from IS NOT NULL AND b.valid_from > ?');
                queryParams.push(today);
            }
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Validate sort parameters
        const allowedSortFields = ['created_at', 'plate_number', 'location_name', 'violation_type', 'severity', 'valid_from', 'valid_to'];
        const sortBy = allowedSortFields.includes(sort_by) ? sort_by : 'created_at';
        const sortOrder = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // Get total count
        const [countResult] = await connection.execute(
            `SELECT COUNT(*) as total 
             FROM vehicle_blacklist b
             LEFT JOIN locations l ON b.location_id = l.id
             ${whereClause}`,
            queryParams
        );

        const total = countResult[0].total;

        // Get blacklist entries with pagination
        const dataQuery = `
            SELECT b.*, 
                    l.name as location_name, 
                    l.code as location_code,
                    v.make, v.model, v.color, v.vehicle_type,
                    u.name as created_by_name,
                    CASE 
                        WHEN b.valid_from IS NULL AND b.valid_to IS NULL THEN 'permanent'
                        WHEN b.valid_from IS NOT NULL AND b.valid_from > CURDATE() THEN 'future'
                        WHEN b.valid_to IS NOT NULL AND b.valid_to < CURDATE() THEN 'expired'
                        ELSE 'active'
                    END as current_status
             FROM vehicle_blacklist b
             LEFT JOIN locations l ON b.location_id = l.id
             LEFT JOIN vehicles v ON b.vehicle_id = v.id
             LEFT JOIN users u ON b.created_by = u.id
             ${whereClause}
             ORDER BY ${sortBy === 'location_name' ? 'l.name' : `b.${sortBy}`} ${sortOrder}
             LIMIT ${parsedLimit} OFFSET ${offset}`;

        const [blacklistEntries] = await connection.execute(dataQuery, queryParams);

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, 
                                    status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'VIEW', 'BLACKLIST', 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Lấy danh sách đen thành công',
            data: blacklistEntries,
            pagination: {
                current_page: parseInt(page),
                per_page: parseInt(limit),
                total: total,
                total_pages: Math.ceil(total / limit),
                has_next: (page * limit) < total,
                has_prev: page > 1
            }
        });

    } catch (error) {
        console.error('Error fetching blacklist:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách đen',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getBlacklistById = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;

        const [blacklistEntry] = await connection.execute(
            `SELECT b.*, 
                    l.name as location_name, 
                    l.code as location_code,
                    l.address as location_address,
                    l.zone_type,
                    v.make, v.model, v.color, v.vehicle_type, v.year_manufactured,
                    v.owner_name as vehicle_owner_name,
                    v.owner_phone as vehicle_owner_phone,
                    v.owner_email as vehicle_owner_email,
                    u.name as created_by_name, 
                    u.email as created_by_email,
                    CASE 
                        WHEN b.valid_from IS NULL AND b.valid_to IS NULL THEN 'permanent'
                        WHEN b.valid_from IS NOT NULL AND b.valid_from > CURDATE() THEN 'future'
                        WHEN b.valid_to IS NOT NULL AND b.valid_to < CURDATE() THEN 'expired'
                        ELSE 'active'
                    END as current_status,
                    DATEDIFF(COALESCE(b.valid_to, '9999-12-31'), CURDATE()) as days_until_expiry
             FROM vehicle_blacklist b
             LEFT JOIN locations l ON b.location_id = l.id
             LEFT JOIN vehicles v ON b.vehicle_id = v.id
             LEFT JOIN users u ON b.created_by = u.id
             WHERE b.id = ?`,
            [id]
        );

        if (blacklistEntry.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy blacklist entry'
            });
        }

        // Get recent detections for this plate number at this location
        const [recentDetections] = await connection.execute(
            `SELECT lpd.*, c.name as camera_name,
                    CASE WHEN lpd.is_blacklist_match = 1 THEN 'Triggered' ELSE 'Normal' END as alert_status
             FROM license_plate_detections lpd
             LEFT JOIN cameras c ON lpd.camera_id = c.id
             WHERE lpd.plate_number = ? AND lpd.location_id = ?
             ORDER BY lpd.detected_at DESC
             LIMIT 10`,
            [blacklistEntry[0].plate_number, blacklistEntry[0].location_id]
        );

        // Get detection statistics
        const [detectionStats] = await connection.execute(
            `SELECT 
                COUNT(*) as total_detections,
                COUNT(CASE WHEN lpd.is_blacklist_match = 1 THEN 1 END) as triggered_alerts,
                COUNT(DISTINCT DATE(lpd.detected_at)) as active_days,
                MAX(lpd.detected_at) as last_detection,
                COUNT(CASE WHEN lpd.detected_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as detections_last_30_days
             FROM license_plate_detections lpd
             WHERE lpd.plate_number = ? AND lpd.location_id = ?`,
            [blacklistEntry[0].plate_number, blacklistEntry[0].location_id]
        );

        // Get related alerts
        const [relatedAlerts] = await connection.execute(
            `SELECT id, alert_type, severity, title, status, created_at
             FROM alerts 
             WHERE plate_number = ? AND location_id = ?
             ORDER BY created_at DESC
             LIMIT 10`,
            [blacklistEntry[0].plate_number, blacklistEntry[0].location_id]
        );

        const result = {
            ...blacklistEntry[0],
            recent_detections: recentDetections,
            detection_statistics: detectionStats[0],
            related_alerts: relatedAlerts
        };

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id,
                                    status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'VIEW', 'BLACKLIST', ?, 'SUCCESS', ?, ?, NOW())`,
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
            message: 'Lấy thông tin blacklist entry thành công',
            data: result
        });

    } catch (error) {
        console.error('Error fetching blacklist entry:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin blacklist entry',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getBlacklistByPlateNumber = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { plate_number } = req.params;
        const { location_id, include_inactive } = req.query;

        let whereConditions = ['b.plate_number = ?'];
        let queryParams = [plate_number];

        if (location_id) {
            whereConditions.push('b.location_id = ?');
            queryParams.push(location_id);
        }

        if (include_inactive !== 'true') {
            whereConditions.push('b.is_active = 1');
        }

        const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

        const [blacklistEntries] = await connection.execute(
            `SELECT b.*, 
                    l.name as location_name, 
                    l.code as location_code,
                    v.make, v.model, v.color,
                    u.name as created_by_name,
                    CASE 
                        WHEN b.valid_from IS NULL AND b.valid_to IS NULL THEN 'permanent'
                        WHEN b.valid_from IS NOT NULL AND b.valid_from > CURDATE() THEN 'future'
                        WHEN b.valid_to IS NOT NULL AND b.valid_to < CURDATE() THEN 'expired'
                        ELSE 'active'
                    END as current_status
             FROM vehicle_blacklist b
             LEFT JOIN locations l ON b.location_id = l.id
             LEFT JOIN vehicles v ON b.vehicle_id = v.id
             LEFT JOIN users u ON b.created_by = u.id
             ${whereClause}
             ORDER BY b.created_at DESC`,
            queryParams
        );

        res.status(200).json({
            success: true,
            message: 'Lấy danh sách blacklist theo biển số thành công',
            data: blacklistEntries,
            count: blacklistEntries.length
        });

    } catch (error) {
        console.error('Error fetching blacklist by plate number:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách blacklist theo biển số',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getBlacklistStatistics = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { location_id, time_period = '30' } = req.query;

        let locationFilter = '';
        let queryParams = [];

        if (location_id) {
            locationFilter = 'AND b.location_id = ?';
            queryParams.push(location_id);
        }

        // Get general statistics
        const [generalStats] = await connection.execute(
            `SELECT 
                COUNT(*) as total_entries,
                COUNT(CASE WHEN b.is_active = 1 THEN 1 END) as active_entries,
                COUNT(CASE WHEN b.severity = 'critical' THEN 1 END) as critical_entries,
                COUNT(CASE WHEN b.severity = 'high' THEN 1 END) as high_severity_entries,
                COUNT(CASE WHEN b.severity = 'medium' THEN 1 END) as medium_severity_entries,
                COUNT(CASE WHEN b.severity = 'low' THEN 1 END) as low_severity_entries,
                COUNT(CASE WHEN b.valid_to IS NOT NULL AND b.valid_to < CURDATE() THEN 1 END) as expired_entries,
                COUNT(CASE WHEN b.valid_from IS NOT NULL AND b.valid_from > CURDATE() THEN 1 END) as future_entries,
                COUNT(CASE WHEN b.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) THEN 1 END) as recent_additions
             FROM vehicle_blacklist b
             WHERE 1=1 ${locationFilter}`,
            [time_period, ...queryParams]
        );

        // Get statistics by violation type
        const [violationStats] = await connection.execute(
            `SELECT 
                b.violation_type,
                COUNT(*) as count,
                COUNT(CASE WHEN b.is_active = 1 THEN 1 END) as active_count
             FROM vehicle_blacklist b
             WHERE 1=1 ${locationFilter}
             GROUP BY b.violation_type
             ORDER BY count DESC`,
            queryParams
        );

        // Get statistics by severity
        const [severityStats] = await connection.execute(
            `SELECT 
                b.severity,
                COUNT(*) as count,
                COUNT(CASE WHEN b.is_active = 1 THEN 1 END) as active_count
             FROM vehicle_blacklist b
             WHERE 1=1 ${locationFilter}
             GROUP BY b.severity
             ORDER BY FIELD(b.severity, 'critical', 'high', 'medium', 'low')`,
            queryParams
        );

        // Get statistics by location
        const [locationStats] = await connection.execute(
            `SELECT 
                l.id, l.name as location_name, l.code as location_code,
                COUNT(b.id) as total_entries,
                COUNT(CASE WHEN b.is_active = 1 THEN 1 END) as active_entries,
                COUNT(CASE WHEN b.severity = 'critical' THEN 1 END) as critical_entries
             FROM locations l
             LEFT JOIN vehicle_blacklist b ON l.id = b.location_id ${location_id ? 'AND l.id = ?' : ''}
             WHERE l.is_active = 1
             GROUP BY l.id, l.name, l.code
             ORDER BY total_entries DESC`,
            location_id ? [location_id] : []
        );

        // Get recent activity
        const [recentActivity] = await connection.execute(
            `SELECT 
                b.plate_number, b.violation_type, b.severity, b.created_at,
                l.name as location_name,
                u.name as created_by_name
             FROM vehicle_blacklist b
             LEFT JOIN locations l ON b.location_id = l.id
             LEFT JOIN users u ON b.created_by = u.id
             WHERE b.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) ${locationFilter}
             ORDER BY b.created_at DESC
             LIMIT 20`,
            [time_period, ...queryParams]
        );

        // Get most detected blacklisted plates
        const [topDetected] = await connection.execute(
            `SELECT 
                b.plate_number, 
                l.name as location_name,
                b.violation_type,
                b.severity,
                COUNT(lpd.id) as detection_count,
                COUNT(CASE WHEN lpd.is_blacklist_match = 1 THEN 1 END) as alert_count,
                MAX(lpd.detected_at) as last_detection
             FROM vehicle_blacklist b
             LEFT JOIN locations l ON b.location_id = l.id
             LEFT JOIN license_plate_detections lpd ON b.plate_number = lpd.plate_number 
                                                      AND b.location_id = lpd.location_id
                                                      AND lpd.detected_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
             WHERE b.is_active = 1 ${locationFilter}
             GROUP BY b.plate_number, l.name, b.violation_type, b.severity
             HAVING detection_count > 0
             ORDER BY detection_count DESC
             LIMIT 10`,
            [time_period, ...queryParams]
        );

        res.status(200).json({
            success: true,
            message: 'Lấy thống kê blacklist thành công',
            data: {
                general_statistics: generalStats[0],
                by_violation_type: violationStats,
                by_severity: severityStats,
                by_location: locationStats,
                recent_activity: recentActivity,
                most_detected_plates: topDetected,
                time_period: `${time_period} days`
            }
        });

    } catch (error) {
        console.error('Error fetching blacklist statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thống kê blacklist',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const searchBlacklist = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { 
            q, // general search query
            plate_number,
            owner_name,
            reason,
            location_id,
            violation_type,
            severity,
            valid_status,
            page = 1,
            limit = 20
        } = req.query;

        const offset = (page - 1) * limit;
        let whereConditions = [];
        let queryParams = [];

        // General search across multiple fields
        if (q) {
            whereConditions.push(`(
                b.plate_number LIKE ? OR 
                b.owner_name LIKE ? OR 
                b.reason LIKE ? OR
                b.description LIKE ? OR
                l.name LIKE ?
            )`);
            const searchTerm = `%${q}%`;
            queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
        }

        // Specific field searches
        if (plate_number) {
            whereConditions.push('b.plate_number LIKE ?');
            queryParams.push(`%${plate_number}%`);
        }

        if (owner_name) {
            whereConditions.push('b.owner_name LIKE ?');
            queryParams.push(`%${owner_name}%`);
        }

        if (reason) {
            whereConditions.push('b.reason LIKE ?');
            queryParams.push(`%${reason}%`);
        }

        if (location_id) {
            whereConditions.push('b.location_id = ?');
            queryParams.push(location_id);
        }

        if (violation_type) {
            whereConditions.push('b.violation_type = ?');
            queryParams.push(violation_type);
        }

        if (severity) {
            whereConditions.push('b.severity = ?');
            queryParams.push(severity);
        }

        // Handle valid status filter
        if (valid_status) {
            const today = new Date().toISOString().split('T')[0];
            if (valid_status === 'active') {
                whereConditions.push('(b.valid_from IS NULL OR b.valid_from <= ?) AND (b.valid_to IS NULL OR b.valid_to >= ?)');
                queryParams.push(today, today);
            } else if (valid_status === 'expired') {
                whereConditions.push('b.valid_to IS NOT NULL AND b.valid_to < ?');
                queryParams.push(today);
            }
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Get total count
        const [countResult] = await connection.execute(
            `SELECT COUNT(*) as total 
             FROM vehicle_blacklist b
             LEFT JOIN locations l ON b.location_id = l.id
             ${whereClause}`,
            queryParams
        );

        // Get search results
        const [results] = await connection.execute(
            `SELECT b.*, 
                    l.name as location_name, 
                    l.code as location_code,
                    v.make, v.model, v.color,
                    u.name as created_by_name,
                    CASE 
                        WHEN b.valid_from IS NULL AND b.valid_to IS NULL THEN 'permanent'
                        WHEN b.valid_from IS NOT NULL AND b.valid_from > CURDATE() THEN 'future'
                        WHEN b.valid_to IS NOT NULL AND b.valid_to < CURDATE() THEN 'expired'
                        ELSE 'active'
                    END as current_status
             FROM vehicle_blacklist b
             LEFT JOIN locations l ON b.location_id = l.id
             LEFT JOIN vehicles v ON b.vehicle_id = v.id
             LEFT JOIN users u ON b.created_by = u.id
             ${whereClause}
             ORDER BY b.created_at DESC
             LIMIT ? OFFSET ?`,
            [...queryParams, parseInt(limit), parseInt(offset)]
        );

        res.status(200).json({
            success: true,
            message: 'Tìm kiếm blacklist thành công',
            data: results,
            pagination: {
                current_page: parseInt(page),
                per_page: parseInt(limit),
                total: countResult[0].total,
                total_pages: Math.ceil(countResult[0].total / limit)
            }
        });

    } catch (error) {
        console.error('Error searching blacklist:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tìm kiếm blacklist',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    getAllBlacklist,
    getBlacklistById,
    getBlacklistByPlateNumber,
    getBlacklistStatistics,
    searchBlacklist
};