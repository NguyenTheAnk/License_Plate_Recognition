
const db = require('../../db');

const searchCameras = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const {
            keyword = '',
            page = 1,
            limit = 20,
            sort = 'created_at',
            order = 'DESC'
        } = req.query;

        const offset = (page - 1) * limit;

        // Validate sort field
        const allowedSortFields = ['id', 'name', 'code', 'status', 'created_at', 'updated_at', 'last_heartbeat'];
        const sortField = allowedSortFields.includes(sort) ? sort : 'created_at';
        const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // Search query
        const searchKeyword = `%${keyword}%`;
        
        // Get total count
        const [countResult] = await connection.execute(`
            SELECT COUNT(*) as total 
            FROM cameras c 
            JOIN locations l ON c.location_id = l.id 
            WHERE c.is_active = 1 
            AND (c.name LIKE ? OR c.code LIKE ? OR l.name LIKE ?)
        `, [searchKeyword, searchKeyword, searchKeyword, searchKeyword]);

        const total = countResult[0].total;

        // Get cameras with search
        const [cameras] = await connection.execute(`
            SELECT 
                c.*,
                l.name as location_name,
                l.address as location_address,
                l.zone_type as location_zone_type,
                ml.name as monitoring_location_name,
                ml.zone_type as monitoring_zone_type,
                TIMESTAMPDIFF(SECOND, c.last_heartbeat, NOW()) as seconds_since_heartbeat,
                CASE 
                    WHEN c.last_heartbeat IS NULL THEN 'never'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 5 THEN 'online'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 15 THEN 'warning'
                    ELSE 'offline'
                END as connection_status,
                (SELECT COUNT(*) FROM license_plate_detections lpd 
                 WHERE lpd.camera_id = c.id AND lpd.detection_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) as detections_24h
            FROM cameras c
            JOIN locations l ON c.location_id = l.id
            WHERE c.is_active = 1 
            AND (c.name LIKE ? OR c.code LIKE ? OR l.name LIKE ?)
            ORDER BY c.${sortField} ${sortOrder}
            LIMIT ? OFFSET ?
        `, [searchKeyword, searchKeyword, searchKeyword, searchKeyword, parseInt(limit), offset]);

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, request_data, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'SEARCH', 'CAMERAS', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                JSON.stringify({ keyword, page, limit, sort, order }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            data: {
                cameras: cameras,
                search_params: {
                    keyword: keyword,
                    total_results: total
                },
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total: total,
                    total_pages: Math.ceil(total / limit),
                    has_next: page * limit < total,
                    has_prev: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Error searching cameras:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tìm kiếm camera',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const searchCamerasByCriteria = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const {
            name,
            code,
            status,
            location_id,
            camera_type,
            camera_role,
            direction,
            installation_date_from,
            installation_date_to,
            last_heartbeat_from,
            last_heartbeat_to,
            page = 1,
            limit = 20,
            sort = 'created_at',
            order = 'DESC'
        } = req.body;

        const offset = (page - 1) * limit;

        // Build dynamic where conditions
        let whereConditions = ['c.is_active = 1'];
        let queryParams = [];

        if (name) {
            whereConditions.push('c.name LIKE ?');
            queryParams.push(`%${name}%`);
        }

        if (code) {
            whereConditions.push('c.code LIKE ?');
            queryParams.push(`%${code}%`);
        }

        if (status) {
            whereConditions.push('c.status = ?');
            queryParams.push(status);
        }

        if (location_id) {
            whereConditions.push('c.location_id = ?');
            queryParams.push(location_id);
        }


        if (camera_type) {
            whereConditions.push('c.camera_type = ?');
            queryParams.push(camera_type);
        }

        if (camera_role) {
            whereConditions.push('c.camera_role = ?');
            queryParams.push(camera_role);
        }

        if (direction) {
            whereConditions.push('c.direction = ?');
            queryParams.push(direction);
        }

        if (installation_date_from) {
            whereConditions.push('c.installation_date >= ?');
            queryParams.push(installation_date_from);
        }

        if (installation_date_to) {
            whereConditions.push('c.installation_date <= ?');
            queryParams.push(installation_date_to);
        }

        if (last_heartbeat_from) {
            whereConditions.push('c.last_heartbeat >= ?');
            queryParams.push(last_heartbeat_from);
        }

        if (last_heartbeat_to) {
            whereConditions.push('c.last_heartbeat <= ?');
            queryParams.push(last_heartbeat_to);
        }

        const whereClause = whereConditions.join(' AND ');

        // Validate sort field
        const allowedSortFields = ['id', 'name', 'code', 'status', 'created_at', 'updated_at', 'last_heartbeat', 'installation_date'];
        const sortField = allowedSortFields.includes(sort) ? sort : 'created_at';
        const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // Get total count
        const [countResult] = await connection.execute(`
            SELECT COUNT(*) as total 
            FROM cameras c 
            JOIN locations l ON c.location_id = l.id 
            WHERE ${whereClause}
        `, queryParams);

        const total = countResult[0].total;

        // Get cameras
        const [cameras] = await connection.execute(`
            SELECT 
                c.*,
                l.name as location_name,
                l.address as location_address,
                l.zone_type as location_zone_type,
                ml.name as monitoring_location_name,
                ml.zone_type as monitoring_zone_type,
                TIMESTAMPDIFF(SECOND, c.last_heartbeat, NOW()) as seconds_since_heartbeat,
                CASE 
                    WHEN c.last_heartbeat IS NULL THEN 'never'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 5 THEN 'online'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 15 THEN 'warning'
                    ELSE 'offline'
                END as connection_status,
                (SELECT COUNT(*) FROM license_plate_detections lpd 
                 WHERE lpd.camera_id = c.id AND lpd.detection_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) as detections_24h
            FROM cameras c
            JOIN locations l ON c.location_id = l.id
            WHERE ${whereClause}
            ORDER BY c.${sortField} ${sortOrder}
            LIMIT ? OFFSET ?
        `, [...queryParams, parseInt(limit), offset]);

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, request_data, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'SEARCH_CRITERIA', 'CAMERAS', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                JSON.stringify({
                    name, code, status, location_id,
                    camera_type, camera_role, direction, installation_date_from, installation_date_to,
                    last_heartbeat_from, last_heartbeat_to, page, limit, sort, order
                }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            data: {
                cameras: cameras,
                search_criteria: {
                    name, code, status, location_id,
                    camera_type, camera_role, direction, installation_date_from, installation_date_to,
                    last_heartbeat_from, last_heartbeat_to
                },
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total: total,
                    total_pages: Math.ceil(total / limit),
                    has_next: page * limit < total,
                    has_prev: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Error searching cameras by criteria:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tìm kiếm camera theo tiêu chí',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const searchCamerasByKeyword = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { keyword, includeInactive = false } = req.query;

        if (!keyword || keyword.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Từ khóa tìm kiếm là bắt buộc'
            });
        }

        const searchTerm = `%${keyword.trim()}%`;
        const activeCondition = includeInactive === 'true' ? '' : 'AND c.is_active = 1';

        const [cameras] = await connection.execute(`
            SELECT 
                c.*,
                l.name as location_name,
                l.address as location_address,
                ml.name as monitoring_location_name,
                CASE 
                    WHEN c.last_heartbeat IS NULL THEN 'never'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 5 THEN 'online'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 15 THEN 'warning'
                    ELSE 'offline'
                END as connection_status,
                CASE 
                    WHEN c.name LIKE ? THEN 3
                    WHEN c.code LIKE ? THEN 2
                    WHEN l.name LIKE ? THEN 1
                    ELSE 0
                END as relevance_score
            FROM cameras c
            JOIN locations l ON c.location_id = l.id
            WHERE (
                c.name LIKE ? OR 
                c.code LIKE ? OR 
                l.name LIKE ? OR 
                c.maintenance_schedule LIKE ?
            ) ${activeCondition}
            ORDER BY relevance_score DESC, c.name
            LIMIT 50
        `, [keyword, keyword, keyword, searchTerm, searchTerm, searchTerm]);

        res.status(200).json({
            success: true,
            data: {
                cameras: cameras,
                search_keyword: keyword,
                total_results: cameras.length
            }
        });

    } catch (error) {
        console.error('Error searching cameras by keyword:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tìm kiếm camera theo từ khóa',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getCamerasByStatus = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { status } = req.params;
        const { page = 1, limit = 20 } = req.query;

        const validStatuses = ['online', 'offline', 'maintenance'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Trạng thái camera không hợp lệ'
            });
        }

        const offset = (page - 1) * limit;

        // Get total count
        const [countResult] = await connection.execute(
            'SELECT COUNT(*) as total FROM cameras WHERE status = ? AND is_active = 1',
            [status]
        );

        const total = countResult[0].total;

        // Get cameras by status
        const [cameras] = await connection.execute(`
            SELECT 
                c.*,
                l.name as location_name,
                l.address as location_address,
                l.zone_type as location_zone_type,
                ml.name as monitoring_location_name,
                TIMESTAMPDIFF(SECOND, c.last_heartbeat, NOW()) as seconds_since_heartbeat,
                CASE 
                    WHEN c.last_heartbeat IS NULL THEN 'never'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 5 THEN 'online'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 15 THEN 'warning'
                    ELSE 'offline'
                END as connection_status
            FROM cameras c
            JOIN locations l ON c.location_id = l.id
            WHERE c.status = ? AND c.is_active = 1
            ORDER BY c.updated_at DESC
            LIMIT ? OFFSET ?
        `, [status, parseInt(limit), offset]);

        res.status(200).json({
            success: true,
            data: {
                cameras: cameras,
                filter: {
                    status: status
                },
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total: total,
                    total_pages: Math.ceil(total / limit),
                    has_next: page * limit < total,
                    has_prev: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Error getting cameras by status:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy camera theo trạng thái',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getCamerasByType = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { type } = req.params;
        const { page = 1, limit = 20 } = req.query;

        const validTypes = ['fixed', 'ptz', 'mobile'];

        if (!validTypes.includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Loại camera không hợp lệ'
            });
        }

        const offset = (page - 1) * limit;

        // Get total count
        const [countResult] = await connection.execute(
            'SELECT COUNT(*) as total FROM cameras WHERE camera_type = ? AND is_active = 1',
            [type]
        );

        const total = countResult[0].total;

        // Get cameras by type
        const [cameras] = await connection.execute(`
            SELECT 
                c.*,
                l.name as location_name,
                l.address as location_address,
                l.zone_type as location_zone_type,
                ml.name as monitoring_location_name,
                TIMESTAMPDIFF(SECOND, c.last_heartbeat, NOW()) as seconds_since_heartbeat,
                CASE 
                    WHEN c.last_heartbeat IS NULL THEN 'never'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 5 THEN 'online'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 15 THEN 'warning'
                    ELSE 'offline'
                END as connection_status
            FROM cameras c
            JOIN locations l ON c.location_id = l.id
            WHERE c.camera_type = ? AND c.is_active = 1
            ORDER BY c.name
            LIMIT ? OFFSET ?
        `, [type, parseInt(limit), offset]);

        res.status(200).json({
            success: true,
            data: {
                cameras: cameras,
                filter: {
                    camera_type: type
                },
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total: total,
                    total_pages: Math.ceil(total / limit),
                    has_next: page * limit < total,
                    has_prev: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Error getting cameras by type:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy camera theo loại',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getCamerasByRole = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { role } = req.params;
        const { page = 1, limit = 20 } = req.query;

        const validRoles = ['entry', 'exit', 'internal', 'overview'];

        if (!validRoles.includes(role)) {
            return res.status(400).json({
                success: false,
                message: 'Vai trò camera không hợp lệ'
            });
        }

        const offset = (page - 1) * limit;

        // Get total count
        const [countResult] = await connection.execute(
            'SELECT COUNT(*) as total FROM cameras WHERE camera_role = ? AND is_active = 1',
            [role]
        );

        const total = countResult[0].total;

        // Get cameras by role
        const [cameras] = await connection.execute(`
            SELECT 
                c.*,
                l.name as location_name,
                l.address as location_address,
                l.zone_type as location_zone_type,
                ml.name as monitoring_location_name,
                TIMESTAMPDIFF(SECOND, c.last_heartbeat, NOW()) as seconds_since_heartbeat,
                CASE 
                    WHEN c.last_heartbeat IS NULL THEN 'never'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 5 THEN 'online'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 15 THEN 'warning'
                    ELSE 'offline'
                END as connection_status,
                (SELECT COUNT(*) FROM license_plate_detections lpd 
                 WHERE lpd.camera_id = c.id AND lpd.detection_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)) as detections_7d
            FROM cameras c
            JOIN locations l ON c.location_id = l.id
            WHERE c.camera_role = ? AND c.is_active = 1
            ORDER BY c.name
            LIMIT ? OFFSET ?
        `, [role, parseInt(limit), offset]);

        res.status(200).json({
            success: true,
            data: {
                cameras: cameras,
                filter: {
                    camera_role: role
                },
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total: total,
                    total_pages: Math.ceil(total / limit),
                    has_next: page * limit < total,
                    has_prev: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Error getting cameras by role:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy camera theo vai trò',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getOfflineCameras = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { minutes = 15, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        // Get total count
        const [countResult] = await connection.execute(`
            SELECT COUNT(*) as total 
            FROM cameras 
            WHERE is_active = 1 
            AND (last_heartbeat IS NULL OR TIMESTAMPDIFF(MINUTE, last_heartbeat, NOW()) >= ?)
        `, [parseInt(minutes)]);

        const total = countResult[0].total;

        // Get cameras that haven't sent heartbeat for specified minutes
        const [cameras] = await connection.execute(`
            SELECT 
                c.*,
                l.name as location_name,
                l.address as location_address,
                l.zone_type as location_zone_type,
                ml.name as monitoring_location_name,
                TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) as minutes_offline,
                TIMESTAMPDIFF(SECOND, c.last_heartbeat, NOW()) as seconds_since_heartbeat
            FROM cameras c
            JOIN locations l ON c.location_id = l.id
            WHERE c.is_active = 1 
            AND (c.last_heartbeat IS NULL OR TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) >= ?)
            ORDER BY c.last_heartbeat ASC
            LIMIT ? OFFSET ?
        `, [parseInt(minutes), parseInt(limit), offset]);

        res.status(200).json({
            success: true,
            data: {
                cameras: cameras,
                filter: {
                    offline_threshold_minutes: parseInt(minutes)
                },
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total: total,
                    total_pages: Math.ceil(total / limit),
                    has_next: page * limit < total,
                    has_prev: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Error getting offline cameras:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy camera offline',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getMaintenanceCameras = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { upcoming_days = 30 } = req.query;

        // Get cameras that need maintenance or are in maintenance
        const [cameras] = await connection.execute(`
            SELECT 
                c.*,
                l.name as location_name,
                l.address as location_address,
                ml.name as monitoring_location_name,
                CASE 
                    WHEN c.status = 'maintenance' THEN 'in_maintenance'
                    WHEN c.maintenance_schedule IS NOT NULL AND c.maintenance_schedule != '' THEN 'maintenance_scheduled'
                    ELSE 'no_schedule'
                END as maintenance_status,
                DATEDIFF(
                    CASE 
                        WHEN c.maintenance_schedule REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' 
                        THEN STR_TO_DATE(c.maintenance_schedule, '%Y-%m-%d')
                        ELSE NULL 
                    END, 
                    CURDATE()
                ) as days_until_maintenance
            FROM cameras c
            JOIN locations l ON c.location_id = l.id
            WHERE c.is_active = 1 
            AND (
                c.status = 'maintenance' OR 
                (c.maintenance_schedule IS NOT NULL AND c.maintenance_schedule != '')
            )
            ORDER BY 
                CASE c.status WHEN 'maintenance' THEN 1 ELSE 2 END,
                days_until_maintenance ASC
        `);

        // Separate into categories
        const inMaintenance = cameras.filter(c => c.maintenance_status === 'in_maintenance');
        const upcomingMaintenance = cameras.filter(c => 
            c.maintenance_status === 'maintenance_scheduled' && 
            c.days_until_maintenance !== null && 
            c.days_until_maintenance <= upcoming_days && 
            c.days_until_maintenance >= 0
        );
        const overdueMaintenance = cameras.filter(c => 
            c.maintenance_status === 'maintenance_scheduled' && 
            c.days_until_maintenance !== null && 
            c.days_until_maintenance < 0
        );

        res.status(200).json({
            success: true,
            data: {
                summary: {
                    total_cameras: cameras.length,
                    in_maintenance: inMaintenance.length,
                    upcoming_maintenance: upcomingMaintenance.length,
                    overdue_maintenance: overdueMaintenance.length
                },
                cameras: {
                    in_maintenance: inMaintenance,
                    upcoming_maintenance: upcomingMaintenance,
                    overdue_maintenance: overdueMaintenance
                },
                filter: {
                    upcoming_days: parseInt(upcoming_days)
                }
            }
        });

    } catch (error) {
        console.error('Error getting maintenance cameras:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy camera cần bảo trì',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getRecentlyAddedCameras = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { days = 7, limit = 20 } = req.query;

        const [cameras] = await connection.execute(`
            SELECT 
                c.*,
                l.name as location_name,
                l.address as location_address,
                ml.name as monitoring_location_name,
                DATEDIFF(NOW(), c.created_at) as days_since_added,
                CASE 
                    WHEN c.last_heartbeat IS NULL THEN 'never'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 5 THEN 'online'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 15 THEN 'warning'
                    ELSE 'offline'
                END as connection_status,
                (SELECT COUNT(*) FROM license_plate_detections lpd 
                 WHERE lpd.camera_id = c.id) as total_detections
            FROM cameras c
            JOIN locations l ON c.location_id = l.id
            WHERE c.is_active = 1 
            AND c.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            ORDER BY c.created_at DESC
            LIMIT ?
        `, [days, parseInt(limit)]);

        res.status(200).json({
            success: true,
            data: {
                cameras: cameras,
                filter: {
                    days: parseInt(days),
                    limit: parseInt(limit)
                },
                total_results: cameras.length
            }
        });

    } catch (error) {
        console.error('Error getting recently added cameras:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy camera mới thêm',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getInactiveCameras = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        // Get total count
        const [countResult] = await connection.execute(
            'SELECT COUNT(*) as total FROM cameras WHERE is_active = 0'
        );

        const total = countResult[0].total;

        // Get inactive cameras
        const [cameras] = await connection.execute(`
            SELECT 
                c.*,
                l.name as location_name,
                l.address as location_address,
                ml.name as monitoring_location_name,
                (SELECT COUNT(*) FROM license_plate_detections lpd 
                 WHERE lpd.camera_id = c.id) as total_detections,
                DATEDIFF(NOW(), c.updated_at) as days_since_deactivated
            FROM cameras c
            JOIN locations l ON c.location_id = l.id
            WHERE c.is_active = 0
            ORDER BY c.updated_at DESC
            LIMIT ? OFFSET ?
        `, [parseInt(limit), offset]);

        res.status(200).json({
            success: true,
            data: {
                cameras: cameras,
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total: total,
                    total_pages: Math.ceil(total / limit),
                    has_next: page * limit < total,
                    has_prev: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Error getting inactive cameras:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy camera đã vô hiệu hóa',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getLowPerformanceCameras = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { days = 7, threshold = 10 } = req.query;

        const [cameras] = await connection.execute(`
            SELECT 
                c.*,
                l.name as location_name,
                l.address as location_address,
                COUNT(lpd.id) as detections_count,
                ROUND(COUNT(lpd.id) / ?, 2) as avg_detections_per_day,
                AVG(lpd.confidence) as avg_confidence,
                COUNT(CASE WHEN lpd.confidence < 0.7 THEN 1 END) as low_confidence_count,
                CASE 
                    WHEN c.last_heartbeat IS NULL THEN 'never'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 5 THEN 'online'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 15 THEN 'warning'
                    ELSE 'offline'
                END as connection_status
            FROM cameras c
            JOIN locations l ON c.location_id = l.id
            LEFT JOIN license_plate_detections lpd ON c.id = lpd.camera_id 
                AND lpd.detection_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
            WHERE c.is_active = 1 
            AND c.status = 'online'
            GROUP BY c.id, c.name, l.name, l.address
            HAVING avg_detections_per_day < ?
            ORDER BY avg_detections_per_day ASC, c.name
        `, [days, days, threshold]);

        res.status(200).json({
            success: true,
            data: {
                cameras: cameras,
                filter: {
                    days: parseInt(days),
                    threshold: parseInt(threshold)
                },
                total_results: cameras.length
            }
        });

    } catch (error) {
        console.error('Error getting low performance cameras:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy camera hiệu suất thấp',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getHighErrorRateCameras = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { days = 7, error_threshold = 0.3 } = req.query;

        const [cameras] = await connection.execute(`
            SELECT 
                c.*,
                l.name as location_name,
                l.address as location_address,
                COUNT(lpd.id) as total_detections,
                COUNT(CASE WHEN lpd.confidence < 0.5 THEN 1 END) as low_confidence_detections,
                ROUND(
                    COUNT(CASE WHEN lpd.confidence < 0.5 THEN 1 END) * 100.0 / NULLIF(COUNT(lpd.id), 0), 
                    2
                ) as error_rate_percentage,
                AVG(lpd.confidence) as avg_confidence,
                MIN(lpd.confidence) as min_confidence,
                CASE 
                    WHEN c.last_heartbeat IS NULL THEN 'never'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 5 THEN 'online'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 15 THEN 'warning'
                    ELSE 'offline'
                END as connection_status
            FROM cameras c
            JOIN locations l ON c.location_id = l.id
            LEFT JOIN license_plate_detections lpd ON c.id = lpd.camera_id 
                AND lpd.detection_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
            WHERE c.is_active = 1
            GROUP BY c.id, c.name, l.name, l.address
            HAVING COUNT(lpd.id) > 0 AND error_rate_percentage >= ?
            ORDER BY error_rate_percentage DESC, c.name
        `, [days, error_threshold * 100]);

        res.status(200).json({
            success: true,
            data: {
                cameras: cameras,
                filter: {
                    days: parseInt(days),
                    error_threshold: parseFloat(error_threshold)
                },
                total_results: cameras.length
            }
        });

    } catch (error) {
        console.error('Error getting high error rate cameras:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy camera có tỷ lệ lỗi cao',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getCamerasByLocationWithStats = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { days = 7 } = req.query;

        const [locationStats] = await connection.execute(`
            SELECT 
                l.id as location_id,
                l.name as location_name,
                l.zone_type,
                l.address,
                COUNT(c.id) as total_cameras,
                COUNT(CASE WHEN c.status = 'online' THEN 1 END) as online_cameras,
                COUNT(CASE WHEN c.status = 'offline' THEN 1 END) as offline_cameras,
                COUNT(CASE WHEN c.status = 'maintenance' THEN 1 END) as maintenance_cameras,
                COALESCE(SUM(detection_stats.detection_count), 0) as total_detections,
                COALESCE(AVG(detection_stats.avg_confidence), 0) as avg_confidence,
                JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'id', c.id,
                        'name', c.name,
                        'code', c.code,
                        'status', c.status,
                        'camera_role', c.camera_role,
                        'detections', COALESCE(detection_stats.detection_count, 0),
                        'avg_confidence', COALESCE(detection_stats.avg_confidence, 0)
                    )
                ) as cameras
            FROM locations l
            LEFT JOIN cameras c ON l.id = c.location_id AND c.is_active = 1
            LEFT JOIN (
                SELECT 
                    camera_id,
                    COUNT(*) as detection_count,
                    AVG(confidence) as avg_confidence
                FROM license_plate_detections
                WHERE detection_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
                GROUP BY camera_id
            ) detection_stats ON c.id = detection_stats.camera_id
            WHERE l.is_active = 1
            GROUP BY l.id, l.name, l.zone_type, l.address
            HAVING total_cameras > 0
            ORDER BY total_detections DESC, l.name
        `, [days]);

        res.status(200).json({
            success: true,
            data: {
                locations: locationStats,
                filter: {
                    days: parseInt(days)
                },
                total_locations: locationStats.length
            }
        });

    } catch (error) {
        console.error('Error getting cameras by location with stats:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy camera theo vị trí kèm thống kê',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};


module.exports = { 
    searchCameras, 
    searchCamerasByCriteria, 
    searchCamerasByKeyword,
    getCamerasByStatus, 
    getCamerasByType, 
    getCamerasByRole, 
    getOfflineCameras,
    getMaintenanceCameras,
    getRecentlyAddedCameras,
    getInactiveCameras,
    getLowPerformanceCameras,
    getHighErrorRateCameras,
    getCamerasByLocationWithStats
};
