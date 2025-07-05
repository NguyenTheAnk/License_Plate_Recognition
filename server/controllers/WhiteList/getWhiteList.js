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

        const offset = (page - 1) * limit;
        
        // Build WHERE conditions
        let whereConditions = [];
        let queryParams = [];

        if (location_id) {
            whereConditions.push('w.location_id = ?');
            queryParams.push(location_id);
        }

        if (plate_number) {
            whereConditions.push('w.plate_number LIKE ?');
            queryParams.push(`%${plate_number}%`);
        }

        if (approval_status) {
            whereConditions.push('w.approval_status = ?');
            queryParams.push(approval_status);
        }

        if (is_active !== undefined) {
            whereConditions.push('w.is_active = ?');
            queryParams.push(is_active === 'true' ? 1 : 0);
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
            } else if (valid_status === 'future') {
                whereConditions.push('w.valid_from IS NOT NULL AND w.valid_from > ?');
                queryParams.push(today);
            }
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Validate sort parameters
        const allowedSortFields = ['created_at', 'plate_number', 'location_name', 'approval_status', 'valid_from', 'valid_to'];
        const sortBy = allowedSortFields.includes(sort_by) ? sort_by : 'created_at';
        const sortOrder = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // Get total count
        const [countResult] = await connection.execute(
            `SELECT COUNT(*) as total 
             FROM vehicle_whitelist w
             LEFT JOIN locations l ON w.location_id = l.id
             ${whereClause}`,
            queryParams
        );

        const total = countResult[0].total;

        // Get whitelist entries with pagination
        const [whitelistEntries] = await connection.execute(
            `SELECT w.*, 
                    l.name as location_name, 
                    l.code as location_code,
                    v.make, v.model, v.color, v.vehicle_type,
                    u1.name as created_by_name, 
                    u2.name as approved_by_name,
                    CASE 
                        WHEN w.valid_from IS NULL AND w.valid_to IS NULL THEN 'permanent'
                        WHEN w.valid_from IS NOT NULL AND w.valid_from > CURDATE() THEN 'future'
                        WHEN w.valid_to IS NOT NULL AND w.valid_to < CURDATE() THEN 'expired'
                        ELSE 'valid'
                    END as current_status
             FROM vehicle_whitelist w
             LEFT JOIN locations l ON w.location_id = l.id
             LEFT JOIN vehicles v ON w.vehicle_id = v.id
             LEFT JOIN users u1 ON w.created_by = u1.id
             LEFT JOIN users u2 ON w.approved_by = u2.id
             ${whereClause}
             ORDER BY ${sortBy === 'location_name' ? 'l.name' : `w.${sortBy}`} ${sortOrder}
             LIMIT ? OFFSET ?`,
            [...queryParams, parseInt(limit), parseInt(offset)]
        );

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, 
                                    status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'VIEW', 'WHITELIST', 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Lấy danh sách trắng thành công',
            data: whitelistEntries,
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
        console.error('Error fetching whitelist:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách trắng',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getWhitelistById = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;

        const [whitelistEntry] = await connection.execute(
            `SELECT w.*, 
                    l.name as location_name, 
                    l.code as location_code,
                    l.address as location_address,
                    l.zone_type,
                    v.make, v.model, v.color, v.vehicle_type, v.year_manufactured,
                    v.owner_name as vehicle_owner_name,
                    v.owner_phone as vehicle_owner_phone,
                    v.owner_email as vehicle_owner_email,
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
                    DATEDIFF(COALESCE(w.valid_to, '9999-12-31'), CURDATE()) as days_until_expiry
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

        // Get recent detections for this plate number at this location
        const [recentDetections] = await connection.execute(
            `SELECT lpd.*, c.name as camera_name
             FROM license_plate_detections lpd
             LEFT JOIN cameras c ON lpd.camera_id = c.id
             WHERE lpd.plate_number = ? AND lpd.location_id = ?
             ORDER BY lpd.detected_at DESC
             LIMIT 10`,
            [whitelistEntry[0].plate_number, whitelistEntry[0].location_id]
        );

        // Get usage statistics
        const [usageStats] = await connection.execute(
            `SELECT 
                COUNT(*) as total_detections,
                COUNT(DISTINCT DATE(lpd.detected_at)) as active_days,
                MAX(lpd.detected_at) as last_detection,
                COUNT(CASE WHEN lpd.detected_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as detections_last_30_days
             FROM license_plate_detections lpd
             WHERE lpd.plate_number = ? AND lpd.location_id = ?`,
            [whitelistEntry[0].plate_number, whitelistEntry[0].location_id]
        );

        const result = {
            ...whitelistEntry[0],
            recent_detections: recentDetections,
            usage_statistics: usageStats[0]
        };

        // Log access
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

const getWhitelistByPlateNumber = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { plate_number } = req.params;
        const { location_id, include_inactive } = req.query;

        let whereConditions = ['w.plate_number = ?'];
        let queryParams = [plate_number];

        if (location_id) {
            whereConditions.push('w.location_id = ?');
            queryParams.push(location_id);
        }

        if (include_inactive !== 'true') {
            whereConditions.push('w.is_active = 1');
        }

        const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

        const [whitelistEntries] = await connection.execute(
            `SELECT w.*, 
                    l.name as location_name, 
                    l.code as location_code,
                    v.make, v.model, v.color,
                    u1.name as created_by_name, 
                    u2.name as approved_by_name,
                    CASE 
                        WHEN w.valid_from IS NULL AND w.valid_to IS NULL THEN 'permanent'
                        WHEN w.valid_from IS NOT NULL AND w.valid_from > CURDATE() THEN 'future'
                        WHEN w.valid_to IS NOT NULL AND w.valid_to < CURDATE() THEN 'expired'
                        ELSE 'valid'
                    END as current_status
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
                COUNT(CASE WHEN w.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) THEN 1 END) as recent_additions
             FROM vehicle_whitelist w
             WHERE 1=1 ${locationFilter}`,
            [time_period, ...queryParams]
        );

        // Get statistics by location
        const [locationStats] = await connection.execute(
            `SELECT 
                l.id, l.name as location_name, l.code as location_code,
                COUNT(w.id) as total_entries,
                COUNT(CASE WHEN w.is_active = 1 THEN 1 END) as active_entries,
                COUNT(CASE WHEN w.approval_status = 'pending' THEN 1 END) as pending_entries
             FROM locations l
             LEFT JOIN vehicle_whitelist w ON l.id = w.location_id ${location_id ? 'AND l.id = ?' : ''}
             WHERE l.is_active = 1
             GROUP BY l.id, l.name, l.code
             ORDER BY total_entries DESC`,
            location_id ? [location_id] : []
        );

        // Get recent activity
        const [recentActivity] = await connection.execute(
            `SELECT 
                w.plate_number, w.created_at, w.approval_status,
                l.name as location_name,
                u.name as created_by_name
             FROM vehicle_whitelist w
             LEFT JOIN locations l ON w.location_id = l.id
             LEFT JOIN users u ON w.created_by = u.id
             WHERE w.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) ${locationFilter}
             ORDER BY w.created_at DESC
             LIMIT 20`,
            [time_period, ...queryParams]
        );

        // Get top plates by detection count
        const [topPlates] = await connection.execute(
            `SELECT 
                w.plate_number, 
                l.name as location_name,
                COUNT(lpd.id) as detection_count,
                MAX(lpd.detected_at) as last_detection
             FROM vehicle_whitelist w
             LEFT JOIN locations l ON w.location_id = l.id
             LEFT JOIN license_plate_detections lpd ON w.plate_number = lpd.plate_number 
                                                      AND w.location_id = lpd.location_id
                                                      AND lpd.detected_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
             WHERE w.is_active = 1 ${locationFilter}
             GROUP BY w.plate_number, l.name
             HAVING detection_count > 0
             ORDER BY detection_count DESC
             LIMIT 10`,
            [time_period, ...queryParams]
        );

        res.status(200).json({
            success: true,
            message: 'Lấy thống kê whitelist thành công',
            data: {
                general_statistics: generalStats[0],
                by_location: locationStats,
                recent_activity: recentActivity,
                top_active_plates: topPlates,
                time_period: `${time_period} days`
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
                w.owner_name LIKE ? OR 
                w.description LIKE ? OR
                l.name LIKE ?
            )`);
            const searchTerm = `%${q}%`;
            queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        // Specific field searches
        if (plate_number) {
            whereConditions.push('w.plate_number LIKE ?');
            queryParams.push(`%${plate_number}%`);
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
        const [countResult] = await connection.execute(
            `SELECT COUNT(*) as total 
             FROM vehicle_whitelist w
             LEFT JOIN locations l ON w.location_id = l.id
             ${whereClause}`,
            queryParams
        );

        // Get search results
        const [results] = await connection.execute(
            `SELECT w.*, 
                    l.name as location_name, 
                    l.code as location_code,
                    v.make, v.model, v.color,
                    u1.name as created_by_name, 
                    u2.name as approved_by_name,
                    CASE 
                        WHEN w.valid_from IS NULL AND w.valid_to IS NULL THEN 'permanent'
                        WHEN w.valid_from IS NOT NULL AND w.valid_from > CURDATE() THEN 'future'
                        WHEN w.valid_to IS NOT NULL AND w.valid_to < CURDATE() THEN 'expired'
                        ELSE 'valid'
                    END as current_status
             FROM vehicle_whitelist w
             LEFT JOIN locations l ON w.location_id = l.id
             LEFT JOIN vehicles v ON w.vehicle_id = v.id
             LEFT JOIN users u1 ON w.created_by = u1.id
             LEFT JOIN users u2 ON w.approved_by = u2.id
             ${whereClause}
             ORDER BY w.created_at DESC
             LIMIT ? OFFSET ?`,
            [...queryParams, parseInt(limit), parseInt(offset)]
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

module.exports = {
    getAllWhitelist,
    getWhitelistById,
    getWhitelistByPlateNumber,
    getWhitelistStatistics,
    searchWhitelist
};