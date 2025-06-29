const db = require('../../db');

const getLocationStatistics = async (req, res) => {
    const connection = await db.promise();
    
    try {
        // Get basic statistics
        const [basicStats] = await connection.execute(`
            SELECT 
                COUNT(*) as total_locations,
                COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_locations,
                COUNT(CASE WHEN is_active = 0 THEN 1 END) as inactive_locations,
                COUNT(CASE WHEN zone_type = 'entrance' THEN 1 END) as entrance_count,
                COUNT(CASE WHEN zone_type = 'exit' THEN 1 END) as exit_count,
                COUNT(CASE WHEN zone_type = 'checkpoint' THEN 1 END) as checkpoint_count,
                COUNT(CASE WHEN zone_type = 'parking' THEN 1 END) as parking_count,
                COUNT(CASE WHEN zone_type = 'restricted' THEN 1 END) as restricted_count,
                COUNT(CASE WHEN is_restricted = 1 THEN 1 END) as total_restricted,
                COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) as locations_with_coordinates
            FROM locations
        `);

        // Get zone type distribution
        const [zoneTypeStats] = await connection.execute(`
            SELECT 
                zone_type,
                COUNT(*) as count,
                COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_count
            FROM locations
            GROUP BY zone_type
            ORDER BY count DESC
        `);

        // Get camera statistics per location
        const [cameraStats] = await connection.execute(`
            SELECT 
                COUNT(CASE WHEN camera_count > 0 THEN 1 END) as locations_with_cameras,
                COUNT(CASE WHEN camera_count = 0 THEN 1 END) as locations_without_cameras,
                AVG(camera_count) as avg_cameras_per_location,
                MAX(camera_count) as max_cameras_per_location
            FROM (
                SELECT 
                    l.id,
                    COUNT(c.id) as camera_count
                FROM locations l
                LEFT JOIN cameras c ON l.id = c.location_id OR l.id = c.monitoring_location_id
                WHERE l.is_active = 1
                GROUP BY l.id
            ) location_camera_counts
        `);

        // Get recent activity
        const [recentActivity] = await connection.execute(`
            SELECT 
                COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as created_last_7_days,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as updated_last_7_days,
                COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as created_last_30_days
            FROM locations
        `);

        res.status(200).json({
            success: true,
            data: {
                basic_stats: basicStats[0],
                zone_type_distribution: zoneTypeStats,
                camera_stats: cameraStats[0],
                recent_activity: recentActivity[0]
            }
        });

    } catch (error) {
        console.error('Error getting location statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thống kê vị trí',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getLocationDetailedView = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const locationId = req.params.id;

        // Get location with all related data
        const [locationDetail] = await connection.execute(`
            SELECT 
                l.*,
                pl.name as parent_location_name,
                pl.zone_type as parent_zone_type
            FROM locations l
            LEFT JOIN locations pl ON l.parent_location_id = pl.id
            WHERE l.id = ?
        `, [locationId]);

        if (locationDetail.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy vị trí'
            });
        }

        // Get cameras
        const [cameras] = await connection.execute(`
            SELECT 
                c.id, c.name, c.code, c.url, c.direction, c.camera_type, c.camera_role,
                c.resolution, c.fps, c.status, c.last_heartbeat, c.installation_date
            FROM cameras c
            WHERE (c.location_id = ? OR c.monitoring_location_id = ?) AND c.is_active = 1
            ORDER BY c.camera_role, c.name
        `, [locationId, locationId]);

        // Get child locations
        const [childLocations] = await connection.execute(`
            SELECT 
                id, name, code, zone_type, is_restricted, is_active,
                created_at, updated_at
            FROM locations
            WHERE parent_location_id = ?
            ORDER BY name
        `, [locationId]);

        // Get recent detections
        const [recentDetections] = await connection.execute(`
            SELECT 
                lpd.id, lpd.plate_number, lpd.detection_time, lpd.confidence,
                lpd.direction, lpd.vehicle_color, lpd.is_verified,
                c.name as camera_name
            FROM license_plate_detections lpd
            JOIN cameras c ON lpd.camera_id = c.id
            WHERE lpd.location_id = ?
            ORDER BY lpd.detection_time DESC
            LIMIT 10
        `, [locationId]);

        // Get entry/exit statistics (if applicable)
        let entryExitStats = null;
        if (['entry_point', 'exit_point', 'monitoring_zone'].includes(locationDetail[0].zone_type)) {
            const [stats] = await connection.execute(`
                SELECT 
                    COUNT(*) as total_entries,
                    COUNT(CASE WHEN exit_time IS NOT NULL THEN 1 END) as total_exits,
                    COUNT(CASE WHEN status = 'entered' THEN 1 END) as currently_inside,
                    COUNT(CASE WHEN is_overstay = 1 THEN 1 END) as overstay_count,
                    AVG(duration_minutes) as avg_duration_minutes
                FROM vehicle_entry_exit_logs
                WHERE monitoring_location_id = ?
                AND entry_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            `, [locationId]);
            entryExitStats = stats[0];
        }

        // Get paired locations (entry/exit pairs)
        const [pairedLocations] = await connection.execute(`
            SELECT 
                id, name, zone_type, is_main_entry, is_main_exit
            FROM locations
            WHERE entry_exit_pair_id = ? AND entry_exit_pair_id IS NOT NULL AND id != ?
        `, [locationDetail[0].entry_exit_pair_id, locationId]);

        res.status(200).json({
            success: true,
            data: {
                location: locationDetail[0],
                cameras: cameras,
                child_locations: childLocations,
                recent_detections: recentDetections,
                entry_exit_stats: entryExitStats,
                paired_locations: pairedLocations
            }
        });

    } catch (error) {
        console.error('Error getting location detailed view:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin chi tiết vị trí',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getLocationHierarchy = async (req, res) => {
    const connection = await db.promise();
    
    try {
        // Get all locations with hierarchy information
        const [locations] = await connection.execute(`
            SELECT 
                l.*,
                pl.name as parent_name,
                COUNT(cl.id) as child_count,
                COUNT(c.id) as camera_count
            FROM locations l
            LEFT JOIN locations pl ON l.parent_location_id = pl.id
            LEFT JOIN locations cl ON cl.parent_location_id = l.id AND cl.is_active = 1
            LEFT JOIN cameras c ON l.id = c.location_id OR l.id = c.monitoring_location_id AND c.is_active = 1
            WHERE l.is_active = 1
            GROUP BY l.id
            ORDER BY l.parent_location_id, l.name
        `);

        // Build hierarchy tree
        const buildHierarchy = (locations, parentId = null) => {
            return locations
                .filter(location => location.parent_location_id === parentId)
                .map(location => ({
                    ...location,
                    children: buildHierarchy(locations, location.id)
                }));
        };

        const hierarchy = buildHierarchy(locations);

        res.status(200).json({
            success: true,
            data: {
                hierarchy: hierarchy,
                total_locations: locations.length
            }
        });

    } catch (error) {
        console.error('Error getting location hierarchy:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy cấu trúc phân cấp vị trí',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = { 
    getLocationStatistics, 
    getLocationDetailedView, 
    getLocationHierarchy 
};