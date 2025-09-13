const db = require('../../db');

const buildRtspUrl = (camera) => {
    if (camera.protocol === 'rtsp') {
        if (camera.username && camera.password) {
            return `${camera.protocol}://${camera.username}:${camera.password}@${camera.host}:${camera.port}${camera.path}`;
        } else {
            return `${camera.protocol}://${camera.host}:${camera.port}${camera.path}`;
        }
    }
    return '';
};

const getCameraById = async (req, res) => {
    const connection = await db.promise();

    try {
        const cameraId = req.params.id;

        const [cameras] = await connection.execute(`
            SELECT 
                c.id,
                c.ke,
                c.mid,
                c.name,
                c.code,
                c.details,
                c.protocol,
                c.host,
                c.path,
                c.port,
                c.fps,
                c.width,
                c.height,
                c.location_id,
                c.direction,
                c.camera_type,
                c.camera_role,
                c.status,
                c.last_heartbeat,
                c.is_active,
                c.is_detect,
                c.installation_date,
                c.maintenance_schedule,
                c.created_at,
                c.updated_at,
                c.username,
                c.password,
                l.name as location_name,
                l.address as location_address,
                l.zone_type as location_zone_type,
                l.latitude as location_latitude,
                l.longitude as location_longitude,
                l.description as location_description,
                TIMESTAMPDIFF(SECOND, c.last_heartbeat, NOW()) as seconds_since_heartbeat,
                CASE 
                    WHEN c.last_heartbeat IS NULL THEN 'never'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 5 THEN 'online'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 15 THEN 'warning'
                    ELSE 'offline'
                END as connection_status,
                -- Detection statistics
                COALESCE(detection_stats.total_detections, 0) as total_detections,
                COALESCE(detection_stats.today_detections, 0) as today_detections,
                COALESCE(detection_stats.week_detections, 0) as week_detections,
                COALESCE(detection_stats.avg_confidence, 0) as avg_confidence,
                COALESCE(detection_stats.last_detection_at, NULL) as last_detection_at,
                -- Alert statistics
                COALESCE(alert_stats.total_alerts, 0) as total_alerts,
                COALESCE(alert_stats.active_alerts, 0) as active_alerts,
                COALESCE(alert_stats.last_alert_at, NULL) as last_alert_at
            FROM cameras c
            JOIN locations l ON c.location_id = l.id
            LEFT JOIN (
                SELECT 
                    camera_id,
                    COUNT(*) as total_detections,
                    COUNT(CASE WHEN detected_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as today_detections,
                    COUNT(CASE WHEN detected_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as week_detections,
                    AVG(confidence_score) as avg_confidence,
                    MAX(detected_at) as last_detection_at
                FROM license_plate_detections
                GROUP BY camera_id
            ) detection_stats ON c.id = detection_stats.camera_id
            LEFT JOIN (
                SELECT 
                    camera_id,
                    COUNT(*) as total_alerts,
                    COUNT(CASE WHEN status IN ('new', 'acknowledged', 'investigating') THEN 1 END) as active_alerts,
                    MAX(created_at) as last_alert_at
                FROM alerts
                GROUP BY camera_id
            ) alert_stats ON c.id = alert_stats.camera_id
            WHERE c.id = ? AND c.is_active = 1
        `, [cameraId]);

        if (cameras.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy camera'
            });
        }

        const camera = cameras[0];
        delete camera.username;
        delete camera.password;

        // Add computed fields
        camera.rtsp_url = buildRtspUrl(camera);
        camera.uptime_hours = camera.last_heartbeat ? 
            Math.round(camera.seconds_since_heartbeat / 3600) : 0;
        camera.resolution = `${camera.width}x${camera.height}`;
        camera.stream_url = camera.rtsp_url;

        try {
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'VIEW', 'CAMERA', ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user?.userId || null,
                    req.user?.username || 'Anonymous',
                    cameraId,
                    req.ip || '127.0.0.1',
                    req.get('User-Agent') || 'Unknown'
                ]
            );
        } catch (logError) {
            console.error('Error logging access:', logError);
        }

        res.status(200).json({
            success: true,
            data: {
                camera: camera
            }
        });

    } catch (error) {
        console.error('Error getting camera:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin camera',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getAllCameras = async (req, res) => {
    const connection = await db.promise();

    try {
        const {
            page = 1,
            limit = 20,
            sort = 'created_at',
            order = 'DESC',
            status,
            location_id,
            camera_type,
            camera_role,
            direction
        } = req.query;

        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
        const offsetNum = (pageNum - 1) * limitNum;

        let whereConditions = ['c.is_active = 1'];
        let queryParams = [];

        if (status && status.trim()) {
            whereConditions.push('c.status = ?');
            queryParams.push(status.trim());
        }

        if (location_id && location_id.trim()) {
            whereConditions.push('c.location_id = ?');
            queryParams.push(location_id.trim());
        }

        if (camera_type && camera_type.trim()) {
            whereConditions.push('c.camera_type = ?');
            queryParams.push(camera_type.trim());
        }

        if (camera_role && camera_role.trim()) {
            whereConditions.push('c.camera_role = ?');
            queryParams.push(camera_role.trim());
        }

        if (direction && direction.trim()) {
            whereConditions.push('c.direction = ?');
            queryParams.push(direction.trim());
        }

        const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

        const allowedSortFields = ['id', 'name', 'code', 'status', 'created_at', 'updated_at', 'last_heartbeat'];
        const sortField = allowedSortFields.includes(sort) ? sort : 'created_at';
        const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        const countQuery = `
            SELECT COUNT(*) as total 
            FROM cameras c 
            JOIN locations l ON c.location_id = l.id 
            ${whereClause}
        `;

        const [countResult] = await connection.execute(countQuery, queryParams);
        const total = countResult[0].total;

        const mainQuery = `
            SELECT 
                c.id,
                c.ke,
                c.mid,
                c.name,
                c.code,
                c.details,
                c.protocol,
                c.host,
                c.path,
                c.port,
                c.fps,
                c.width,
                c.height,
                c.location_id,
                c.direction,
                c.camera_type,
                c.camera_role,
                c.status,
                c.last_heartbeat,
                c.is_active,
                c.is_detect,
                c.created_at,
                c.updated_at,
                c.username,
                c.password,
                l.name as location_name,
                l.address as location_address,
                l.zone_type as location_zone_type,
                TIMESTAMPDIFF(SECOND, c.last_heartbeat, NOW()) as seconds_since_heartbeat,
                CASE 
                    WHEN c.last_heartbeat IS NULL THEN 'never'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 5 THEN 'online'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 15 THEN 'warning'
                    ELSE 'offline'
                END as connection_status
            FROM cameras c
            JOIN locations l ON c.location_id = l.id
            ${whereClause}
            ORDER BY c.${sortField} ${sortOrder}
            LIMIT ? OFFSET ?
        `;

        const [cameras] = await connection.query(mainQuery, [...queryParams, limitNum, offsetNum]);

        const cameraIds = cameras.map(camera => camera.id);
        let detectionCounts = {};

        if (cameraIds.length > 0) {
            const placeholders = cameraIds.map(() => '?').join(',');
            const detectionQuery = `
                SELECT 
                    camera_id, 
                    COUNT(*) as count 
                FROM license_plate_detections 
                WHERE camera_id IN (${placeholders}) 
                AND detected_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
                GROUP BY camera_id
            `;

            const [detections] = await connection.query(detectionQuery, cameraIds);
            detections.forEach(detection => {
                detectionCounts[detection.camera_id] = detection.count;
            });
        }

        const camerasWithDetections = cameras.map(camera => ({
            ...camera,
            rtsp_url: buildRtspUrl(camera),
            detections_24h: detectionCounts[camera.id] || 0,
            username: undefined,
            password: undefined
        }));

        try {
            await connection.execute(
                'INSERT INTO access_logs (user_id, username, action_type, object_type, status, ip_address, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
                [
                    req.user?.userId || null,
                    req.user?.username || 'Anonymous',
                    'VIEW',
                    'CAMERAS',
                    'SUCCESS',
                    req.ip || '127.0.0.1',
                    req.get('User-Agent') || 'Unknown'
                ]
            );
        } catch (logError) {
            console.error('Error logging access:', logError);
        }

        res.status(200).json({
            success: true,
            data: {
                cameras: camerasWithDetections,
                pagination: {
                    current_page: pageNum,
                    per_page: limitNum,
                    total: total,
                    total_pages: Math.ceil(total / limitNum),
                    has_next: pageNum * limitNum < total,
                    has_prev: pageNum > 1
                }
            }
        });

    } catch (error) {
        console.error('Error getting cameras:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            errno: error.errno,
            sqlState: error.sqlState,
            sql: error.sql
        });

        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách camera',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getCamerasByLocation = async (req, res) => {
    const connection = await db.promise();

    try {
        const locationId = req.params.locationId;

        const [location] = await connection.execute(
            'SELECT id, name FROM locations WHERE id = ? AND is_active = 1',
            [locationId]
        );

        if (location.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy vị trí'
            });
        }

        const [cameras] = await connection.execute(`
            SELECT 
                c.ke,
                c.mid,
                c.name,
                c.code,
                c.details,
                c.protocol,
                c.host,
                c.path,
                c.port,
                c.fps,
                c.width,
                c.height,
                c.location_id,
                c.direction,
                c.camera_type,
                c.camera_role,
                c.status,
                c.last_heartbeat,
                c.is_active,
                c.is_detect,
                c.created_at,
                c.updated_at,
                c.username,
                c.password,
                l.name as location_name,
                CASE 
                    WHEN c.last_heartbeat IS NULL THEN 'never'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 5 THEN 'online'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 15 THEN 'warning'
                    ELSE 'offline'
                END as connection_status
            FROM cameras c
            JOIN locations l ON c.location_id = l.id
            WHERE (c.location_id = ? OR c.monitoring_location_id = ?) AND c.is_active = 1
            ORDER BY c.camera_role, c.name
        `, [locationId, locationId]);

        const camerasWithRtsp = cameras.map(camera => ({
            ...camera,
            rtsp_url: buildRtspUrl(camera),
            username: undefined,
            password: undefined
        }));

        res.status(200).json({
            success: true,
            data: {
                location: location[0],
                cameras: camerasWithRtsp
            }
        });

    } catch (error) {
        console.error('Error getting cameras by location:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy camera theo vị trí',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getCameraStatistics = async (req, res) => {
    const connection = await db.promise();

    try {
        const [overallStats] = await connection.execute(`
            SELECT 
                COUNT(*) as total_cameras,
                COUNT(CASE WHEN status = 'online' THEN 1 END) as online_cameras,
                COUNT(CASE WHEN status = 'offline' THEN 1 END) as offline_cameras,
                COUNT(CASE WHEN status = 'maintenance' THEN 1 END) as maintenance_cameras,
                COUNT(CASE WHEN camera_type = 'fixed' THEN 1 END) as fixed_cameras,
                COUNT(CASE WHEN camera_type = 'ptz' THEN 1 END) as ptz_cameras,
                COUNT(CASE WHEN camera_type = 'mobile' THEN 1 END) as mobile_cameras,
                COUNT(CASE WHEN camera_role = 'entry' THEN 1 END) as entry_cameras,
                COUNT(CASE WHEN camera_role = 'exit' THEN 1 END) as exit_cameras,
                COUNT(CASE WHEN camera_role = 'overview' THEN 1 END) as overview_cameras
            FROM cameras 
            WHERE is_active = 1
        `);

        const [locationStats] = await connection.execute(`
            SELECT 
                l.id,
                l.name as location_name,
                l.zone_type,
                COUNT(c.id) as camera_count,
                COUNT(CASE WHEN c.status = 'online' THEN 1 END) as online_count,
                COUNT(CASE WHEN c.status = 'offline' THEN 1 END) as offline_count
            FROM locations l
            LEFT JOIN cameras c ON (l.id = c.location_id OR l.id = c.monitoring_location_id) AND c.is_active = 1
            WHERE l.is_active = 1
            GROUP BY l.id, l.name, l.zone_type
            HAVING camera_count > 0
            ORDER BY camera_count DESC
        `);

        const [detectionStats] = await connection.execute(`
            SELECT 
                c.id,
                c.name,
                COUNT(lpd.id) as detections_7d,
                COUNT(DISTINCT lpd.plate_number) as unique_plates_7d,
                AVG(lpd.confidence_score) as avg_confidence_7d,
                MAX(lpd.detected_at) as last_detection_time
            FROM cameras c
            LEFT JOIN license_plate_detections lpd ON c.id = lpd.camera_id 
                AND lpd.detected_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            WHERE c.is_active = 1
            GROUP BY c.id, c.name
            ORDER BY detections_7d DESC
            LIMIT 10
        `);

        res.status(200).json({
            success: true,
            data: {
                overall: overallStats[0],
                by_location: locationStats,
                top_detection_cameras: detectionStats
            }
        });

    } catch (error) {
        console.error('Error getting camera statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thống kê camera',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    getCameraById,
    getAllCameras,
    getCamerasByLocation,
    getCameraStatistics
};