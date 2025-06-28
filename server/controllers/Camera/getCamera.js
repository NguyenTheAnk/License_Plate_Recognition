const db = require('../../db');

const getCameraById = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const cameraId = req.params.id;

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
                END as connection_status
            FROM cameras c
            JOIN locations l ON c.location_id = l.id
            LEFT JOIN locations ml ON c.monitoring_location_id = ml.id
            WHERE c.id = ? AND c.is_active = 1
        `, [cameraId]);

        if (cameras.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy camera'
            });
        }

        // Get recent detections from this camera (last 24 hours)
        const [recentDetections] = await connection.execute(`
            SELECT 
                COUNT(*) as total_detections_24h,
                COUNT(DISTINCT plate_number) as unique_plates_24h,
                AVG(confidence) as avg_confidence_24h,
                MAX(detection_time) as last_detection_time
            FROM license_plate_detections 
            WHERE camera_id = ? AND detection_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        `, [cameraId]);

        // Get camera maintenance logs (if any related table exists)
        const camera = {
            ...cameras[0],
            recent_stats: recentDetections[0]
        };

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'VIEW', 'CAMERA', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                cameraId,
                req.ip,
                req.get('User-Agent')
            ]
        );

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

        const offset = (page - 1) * limit;
        
        // Build where conditions
        let whereConditions = ['c.is_active = 1'];
        let queryParams = [];

        if (status) {
            whereConditions.push('c.status = ?');
            queryParams.push(status);
        }

        if (location_id) {
            whereConditions.push('(c.location_id = ? OR c.monitoring_location_id = ?)');
            queryParams.push(location_id, location_id);
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

        const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

        // Validate sort field
        const allowedSortFields = ['id', 'name', 'code', 'status', 'created_at', 'updated_at', 'last_heartbeat'];
        const sortField = allowedSortFields.includes(sort) ? sort : 'created_at';
        const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // Get total count
        const [countResult] = await connection.execute(`
            SELECT COUNT(*) as total 
            FROM cameras c 
            JOIN locations l ON c.location_id = l.id 
            ${whereClause}
        `, queryParams);

        const total = countResult[0].total;

        // Get cameras with pagination
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
            LEFT JOIN locations ml ON c.monitoring_location_id = ml.id
            ${whereClause}
            ORDER BY c.${sortField} ${sortOrder}
            LIMIT ? OFFSET ?
        `, [...queryParams, parseInt(limit), offset]);

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'VIEW', 'CAMERAS', 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                req.ip,
                req.get('User-Agent')
            ]
        );

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
        console.error('Error getting cameras:', error);
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

        // Check if location exists
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
                c.*,
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

        res.status(200).json({
            success: true,
            data: {
                location: location[0],
                cameras: cameras
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
        // Get overall statistics
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

        // Get cameras by location
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

        // Get detection statistics per camera (last 7 days)
        const [detectionStats] = await connection.execute(`
            SELECT 
                c.id,
                c.name,
                COUNT(lpd.id) as detections_7d,
                COUNT(DISTINCT lpd.plate_number) as unique_plates_7d,
                AVG(lpd.confidence) as avg_confidence_7d
            FROM cameras c
            LEFT JOIN license_plate_detections lpd ON c.id = lpd.camera_id 
                AND lpd.detection_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)
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