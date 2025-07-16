const db = require('../../db');

const getAllLocations = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const zoneType = req.query.zone_type || '';
        const isRestricted = req.query.is_restricted || '';
        const isActive = req.query.is_active || '1';
        const parentLocationId = req.query.parent_location_id || '';
        const entryExitPairId = req.query.entry_exit_pair_id || '';
        const sortBy = req.query.sort_by || 'created_at';
        const sortOrder = req.query.sort_order || 'DESC';

        // Build WHERE clause
        let whereConditions = [];
        let queryParams = [];

        // Active status filter
        if (isActive !== '') {
            whereConditions.push('l.is_active = ?');
            queryParams.push(isActive === 'true' || isActive === '1' ? 1 : 0);
        }

        if (search) {
            whereConditions.push('(l.name LIKE ? OR l.code LIKE ? OR l.address LIKE ? OR l.description LIKE ?)');
            queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (zoneType) {
            whereConditions.push('l.zone_type = ?');
            queryParams.push(zoneType);
        }

        if (isRestricted !== '') {
            whereConditions.push('l.is_restricted = ?');
            queryParams.push(isRestricted === 'true' ? 1 : 0);
        }

        if (parentLocationId) {
            if (parentLocationId === 'null') {
                whereConditions.push('l.parent_location_id IS NULL');
            } else {
                whereConditions.push('l.parent_location_id = ?');
                queryParams.push(parseInt(parentLocationId));
            }
        }

        if (entryExitPairId) {
            if (entryExitPairId === 'null') {
                whereConditions.push('l.entry_exit_pair_id IS NULL');
            } else {
                whereConditions.push('l.entry_exit_pair_id = ?');
                queryParams.push(parseInt(entryExitPairId));
            }
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Clean up queryParams to ensure no undefined values
        queryParams = queryParams.map(param => {
            if (param === undefined || param === null) {
                return null;
            }
            return param;
        });

        console.log('WHERE clause:', whereClause);
        console.log('Query params:', queryParams);
        console.log('Params length:', queryParams.length);

        // Get total count first
        const [countResult] = await connection.execute(`
            SELECT COUNT(*) as total
            FROM locations l
            ${whereClause}
        `, queryParams);

        const totalRecords = countResult[0].total;
        const totalPages = Math.ceil(totalRecords / limit);

        // Main query with safe parameter handling
        const mainQuery = `
            SELECT 
                l.id,
                l.name,
                l.code,
                l.address,
                l.latitude,
                l.longitude,
                l.description,
                l.zone_type,
                l.is_restricted,
                l.parent_location_id,
                l.entry_exit_pair_id,
                l.is_main_entry,
                l.is_main_exit,
                l.max_stay_duration_hours,
                l.is_alert_on_overstay,
                l.is_alert_on_no_exit,
                l.is_active,
                l.created_at,
                l.updated_at,
                pl.name as parent_location_name,
                pl.zone_type as parent_zone_type,
                
                -- Camera statistics
                COALESCE(camera_stats.camera_count, 0) as camera_count,
                COALESCE(camera_stats.online_camera_count, 0) as online_camera_count,
                COALESCE(camera_stats.detection_enabled_count, 0) as detection_enabled_camera_count,
                
                -- Child locations count
                COALESCE(child_stats.child_count, 0) as child_locations_count,
                
                -- Detection statistics (last 24 hours)
                COALESCE(detection_stats.today_detections, 0) as today_detections,
                COALESCE(detection_stats.today_unique_vehicles, 0) as today_unique_vehicles,
                COALESCE(detection_stats.today_alerts, 0) as today_alerts,
                
                -- Entry/Exit statistics (for applicable zones)
                COALESCE(entry_exit_stats.currently_inside, 0) as currently_inside,
                COALESCE(entry_exit_stats.overstay_count, 0) as overstay_count,
                
                -- Whitelist/Blacklist counts
                COALESCE(whitelist_stats.whitelist_count, 0) as whitelist_count,
                COALESCE(blacklist_stats.blacklist_count, 0) as blacklist_count,
                
                -- Paired locations info
                COALESCE(paired_stats.paired_locations_count, 0) as paired_locations_count
                
            FROM locations l
            LEFT JOIN locations pl ON l.parent_location_id = pl.id
            
            -- Camera statistics
            LEFT JOIN (
                SELECT 
                    location_id,
                    COUNT(*) as camera_count,
                    COUNT(CASE WHEN last_online_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 1 END) as online_camera_count,
                    COUNT(CASE WHEN detection_enabled = 1 THEN 1 END) as detection_enabled_count
                FROM cameras 
                WHERE is_active = 1
                GROUP BY location_id
            ) camera_stats ON l.id = camera_stats.location_id
            
            -- Child locations count
            LEFT JOIN (
                SELECT 
                    parent_location_id,
                    COUNT(*) as child_count
                FROM locations 
                WHERE is_active = 1
                GROUP BY parent_location_id
            ) child_stats ON l.id = child_stats.parent_location_id
            
            -- Detection statistics (last 24 hours)
            LEFT JOIN (
                SELECT 
                    location_id,
                    COUNT(*) as today_detections,
                    COUNT(DISTINCT plate_number) as today_unique_vehicles,
                    COUNT(CASE WHEN alert_triggered = 1 THEN 1 END) as today_alerts
                FROM license_plate_detections 
                WHERE detected_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
                GROUP BY location_id
            ) detection_stats ON l.id = detection_stats.location_id
            
            -- Entry/Exit statistics
            LEFT JOIN (
                SELECT 
                    location_id,
                    COUNT(CASE WHEN status = 'entered' THEN 1 END) as currently_inside,
                    COUNT(CASE WHEN is_overstay = 1 THEN 1 END) as overstay_count
                FROM vehicle_entry_exit_logs 
                WHERE entry_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                GROUP BY location_id
            ) entry_exit_stats ON l.id = entry_exit_stats.location_id
            
            -- Whitelist statistics
            LEFT JOIN (
                SELECT 
                    location_id,
                    COUNT(*) as whitelist_count
                FROM vehicle_whitelist 
                WHERE is_active = 1 
                AND (valid_from IS NULL OR valid_from <= CURDATE())
                AND (valid_to IS NULL OR valid_to >= CURDATE())
                GROUP BY location_id
            ) whitelist_stats ON l.id = whitelist_stats.location_id
            
            -- Blacklist statistics
            LEFT JOIN (
                SELECT 
                    location_id,
                    COUNT(*) as blacklist_count
                FROM vehicle_blacklist 
                WHERE is_active = 1 
                AND (valid_from IS NULL OR valid_from <= CURDATE())
                AND (valid_to IS NULL OR valid_to >= CURDATE())
                GROUP BY location_id
            ) blacklist_stats ON l.id = blacklist_stats.location_id
            
            -- Paired locations count
            LEFT JOIN (
                SELECT 
                    entry_exit_pair_id,
                    COUNT(*) as paired_locations_count
                FROM locations 
                WHERE entry_exit_pair_id IS NOT NULL AND is_active = 1
                GROUP BY entry_exit_pair_id
            ) paired_stats ON l.entry_exit_pair_id = paired_stats.entry_exit_pair_id
            
            ${whereClause}
            ORDER BY l.${sortBy} ${sortOrder}
            LIMIT ${limit} OFFSET ${offset}
        `;

        const [locations] = await connection.execute(mainQuery, queryParams);

        // Log access with proper null checking and safe parameter handling
        const logParams = [
            req.user?.userId || null,
            req.user?.username || null,
            req.ip || null,
            req.get('User-Agent') || null
        ].map(param => param === undefined ? null : param);

        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'VIEW', 'LOCATION', 'SUCCESS', ?, ?, NOW())`,
            logParams
        );

        res.status(200).json({
            success: true,
            data: {
                locations: locations,
                pagination: {
                    current_page: page,
                    total_pages: totalPages,
                    total_records: totalRecords,
                    limit: limit,
                    has_next: page < totalPages,
                    has_prev: page > 1
                },
                filters_applied: {
                    search: search,
                    zone_type: zoneType,
                    is_restricted: isRestricted,
                    is_active: isActive,
                    parent_location_id: parentLocationId,
                    entry_exit_pair_id: entryExitPairId
                }
            }
        });

    } catch (error) {
        console.error('Error getting locations:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách vị trí',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getLocationById = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const locationId = req.params.id;

        const [location] = await connection.execute(`
            SELECT 
                l.*,
                pl.name as parent_location_name,
                pl.zone_type as parent_zone_type,
                pl.code as parent_location_code,
                
                -- Camera information
                COALESCE(camera_stats.camera_count, 0) as camera_count,
                COALESCE(camera_stats.online_camera_count, 0) as online_camera_count,
                COALESCE(camera_stats.detection_enabled_count, 0) as detection_enabled_camera_count,
                COALESCE(camera_stats.recording_enabled_count, 0) as recording_enabled_camera_count,
                camera_stats.last_camera_online as last_camera_online_at,
                
                -- Child locations count
                COALESCE(child_stats.child_count, 0) as child_locations_count,
                
                -- Detection statistics
                COALESCE(detection_stats.total_detections, 0) as total_detections,
                COALESCE(detection_stats.verified_detections, 0) as verified_detections,
                COALESCE(detection_stats.today_detections, 0) as today_detections,
                COALESCE(detection_stats.week_detections, 0) as week_detections,
                COALESCE(detection_stats.unique_vehicles_today, 0) as unique_vehicles_today,
                COALESCE(detection_stats.avg_confidence, 0) as avg_detection_confidence,
                detection_stats.last_detection_at,
                
                -- Alert statistics
                COALESCE(alert_stats.total_alerts, 0) as total_alerts,
                COALESCE(alert_stats.active_alerts, 0) as active_alerts,
                COALESCE(alert_stats.critical_alerts, 0) as critical_alerts,
                alert_stats.last_alert_at,
                
                -- Entry/Exit statistics
                COALESCE(entry_exit_stats.total_entries, 0) as total_entries,
                COALESCE(entry_exit_stats.total_exits, 0) as total_exits,
                COALESCE(entry_exit_stats.currently_inside, 0) as currently_inside,
                COALESCE(entry_exit_stats.overstay_count, 0) as overstay_count,
                COALESCE(entry_exit_stats.avg_duration_minutes, 0) as avg_stay_duration_minutes,
                COALESCE(entry_exit_stats.entries_today, 0) as entries_today,
                COALESCE(entry_exit_stats.exits_today, 0) as exits_today,
                
                -- List statistics
                COALESCE(list_stats.whitelist_count, 0) as whitelist_count,
                COALESCE(list_stats.blacklist_count, 0) as blacklist_count,
                COALESCE(list_stats.active_whitelist_count, 0) as active_whitelist_count,
                COALESCE(list_stats.active_blacklist_count, 0) as active_blacklist_count
                
            FROM locations l
            LEFT JOIN locations pl ON l.parent_location_id = pl.id
            
            -- Camera statistics
            LEFT JOIN (
                SELECT 
                    location_id,
                    COUNT(*) as camera_count,
                    COUNT(CASE WHEN last_online_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 1 END) as online_camera_count,
                    COUNT(CASE WHEN detection_enabled = 1 THEN 1 END) as detection_enabled_count,
                    COUNT(CASE WHEN recording_enabled = 1 THEN 1 END) as recording_enabled_count,
                    MAX(last_online_at) as last_camera_online
                FROM cameras 
                WHERE is_active = 1
                GROUP BY location_id
            ) camera_stats ON l.id = camera_stats.location_id
            
            -- Child locations
            LEFT JOIN (
                SELECT 
                    parent_location_id,
                    COUNT(*) as child_count
                FROM locations 
                WHERE is_active = 1
                GROUP BY parent_location_id
            ) child_stats ON l.id = child_stats.parent_location_id
            
            -- Detection statistics
            LEFT JOIN (
                SELECT 
                    location_id,
                    COUNT(*) as total_detections,
                    COUNT(CASE WHEN is_verified = 1 THEN 1 END) as verified_detections,
                    COUNT(CASE WHEN detected_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as today_detections,
                    COUNT(CASE WHEN detected_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as week_detections,
                    COUNT(DISTINCT CASE WHEN detected_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN plate_number END) as unique_vehicles_today,
                    AVG(confidence_score) as avg_confidence,
                    MAX(detected_at) as last_detection_at
                FROM license_plate_detections 
                GROUP BY location_id
            ) detection_stats ON l.id = detection_stats.location_id
            
            -- Alert statistics
            LEFT JOIN (
                SELECT 
                    location_id,
                    COUNT(*) as total_alerts,
                    COUNT(CASE WHEN status IN ('new', 'acknowledged', 'investigating') THEN 1 END) as active_alerts,
                    COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_alerts,
                    MAX(created_at) as last_alert_at
                FROM alerts 
                GROUP BY location_id
            ) alert_stats ON l.id = alert_stats.location_id
            
            -- Entry/Exit statistics
            LEFT JOIN (
                SELECT 
                    location_id,
                    COUNT(*) as total_entries,
                    COUNT(CASE WHEN exit_time IS NOT NULL THEN 1 END) as total_exits,
                    COUNT(CASE WHEN status = 'entered' THEN 1 END) as currently_inside,
                    COUNT(CASE WHEN is_overstay = 1 THEN 1 END) as overstay_count,
                    AVG(duration_minutes) as avg_duration_minutes,
                    COUNT(CASE WHEN entry_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as entries_today,
                    COUNT(CASE WHEN exit_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as exits_today
                FROM vehicle_entry_exit_logs 
                GROUP BY location_id
            ) entry_exit_stats ON l.id = entry_exit_stats.location_id
            
            -- List statistics
            LEFT JOIN (
                SELECT 
                    location_id,
                    COUNT(CASE WHEN source_table = 'whitelist' THEN 1 END) as whitelist_count,
                    COUNT(CASE WHEN source_table = 'blacklist' THEN 1 END) as blacklist_count,
                    COUNT(CASE WHEN source_table = 'whitelist' AND is_active = 1 
                        AND (valid_from IS NULL OR valid_from <= CURDATE())
                        AND (valid_to IS NULL OR valid_to >= CURDATE()) THEN 1 END) as active_whitelist_count,
                    COUNT(CASE WHEN source_table = 'blacklist' AND is_active = 1 
                        AND (valid_from IS NULL OR valid_from <= CURDATE())
                        AND (valid_to IS NULL OR valid_to >= CURDATE()) THEN 1 END) as active_blacklist_count
                FROM (
                    SELECT location_id, is_active, valid_from, valid_to, 'whitelist' as source_table
                    FROM vehicle_whitelist
                    UNION ALL
                    SELECT location_id, is_active, valid_from, valid_to, 'blacklist' as source_table
                    FROM vehicle_blacklist
                ) combined_lists
                GROUP BY location_id
            ) list_stats ON l.id = list_stats.location_id
            
            WHERE l.id = ?
        `, [locationId]);

        if (location.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy vị trí'
            });
        }

        // Log access with safe parameter handling
        const logParams = [
            req.user?.userId || null,
            req.user?.username || null,
            locationId,
            req.ip || null,
            req.get('User-Agent') || null
        ].map(param => param === undefined ? null : param);

        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'VIEW', 'LOCATION', ?, 'SUCCESS', ?, ?, NOW())`,
            logParams
        );

        res.status(200).json({
            success: true,
            data: location[0]
        });

    } catch (error) {
        console.error('Error getting location by ID:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin vị trí',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Các function khác giữ nguyên nhưng cần áp dụng cùng logic xử lý safe parameters
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
                COUNT(CASE WHEN zone_type = 'monitoring_zone' THEN 1 END) as monitoring_zone_count,
                COUNT(CASE WHEN is_restricted = 1 THEN 1 END) as total_restricted,
                COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) as locations_with_coordinates,
                COUNT(CASE WHEN parent_location_id IS NULL THEN 1 END) as root_locations,
                COUNT(CASE WHEN entry_exit_pair_id IS NOT NULL THEN 1 END) as paired_locations,
                COUNT(CASE WHEN is_main_entry = 1 THEN 1 END) as main_entries,
                COUNT(CASE WHEN is_main_exit = 1 THEN 1 END) as main_exits
            FROM locations
        `);

        // Get zone type distribution with details
        const [zoneTypeStats] = await connection.execute(`
            SELECT 
                zone_type,
                COUNT(*) as total_count,
                COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_count,
                COUNT(CASE WHEN is_restricted = 1 THEN 1 END) as restricted_count,
                AVG(max_stay_duration_hours) as avg_max_stay_hours,
                COUNT(CASE WHEN is_alert_on_overstay = 1 THEN 1 END) as overstay_alert_enabled,
                COUNT(CASE WHEN is_alert_on_no_exit = 1 THEN 1 END) as no_exit_alert_enabled
            FROM locations
            GROUP BY zone_type
            ORDER BY total_count DESC
        `);

        // Get camera distribution statistics
        const [cameraStats] = await connection.execute(`
            SELECT 
                COUNT(CASE WHEN camera_count > 0 THEN 1 END) as locations_with_cameras,
                COUNT(CASE WHEN camera_count = 0 OR camera_count IS NULL THEN 1 END) as locations_without_cameras,
                COALESCE(AVG(camera_count), 0) as avg_cameras_per_location,
                COALESCE(MAX(camera_count), 0) as max_cameras_per_location,
                COUNT(CASE WHEN online_camera_count > 0 THEN 1 END) as locations_with_online_cameras,
                COALESCE(SUM(camera_count), 0) as total_cameras,
                COALESCE(SUM(online_camera_count), 0) as total_online_cameras
            FROM (
                SELECT 
                    l.id,
                    COUNT(c.id) as camera_count,
                    COUNT(CASE WHEN c.last_online_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 1 END) as online_camera_count
                FROM locations l
                LEFT JOIN cameras c ON l.id = c.location_id AND c.is_active = 1
                WHERE l.is_active = 1
                GROUP BY l.id
            ) location_camera_counts
        `);

        // Get detection activity statistics
        const [detectionStats] = await connection.execute(`
            SELECT 
                COUNT(DISTINCT lpd.location_id) as locations_with_detections,
                COUNT(CASE WHEN lpd.detected_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as detections_today,
                COUNT(CASE WHEN lpd.detected_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as detections_this_week,
                COUNT(CASE WHEN lpd.detected_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as detections_this_month,
                AVG(lpd.confidence_score) as avg_confidence_score,
                COUNT(CASE WHEN lpd.alert_triggered = 1 THEN 1 END) as total_alerts_triggered
            FROM license_plate_detections lpd
            JOIN locations l ON lpd.location_id = l.id
            WHERE l.is_active = 1
        `);

        // Get entry/exit statistics
        const [entryExitStats] = await connection.execute(`
            SELECT 
                COUNT(DISTINCT veel.location_id) as locations_with_entry_exit,
                COUNT(CASE WHEN veel.status = 'entered' THEN 1 END) as total_currently_inside,
                COUNT(CASE WHEN veel.is_overstay = 1 THEN 1 END) as total_overstays,
                AVG(veel.duration_minutes) as avg_stay_duration_minutes,
                COUNT(CASE WHEN veel.entry_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as entries_today,
                COUNT(CASE WHEN veel.exit_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as exits_today
            FROM vehicle_entry_exit_logs veel
            JOIN locations l ON veel.location_id = l.id
            WHERE l.is_active = 1
        `);

        // Get whitelist/blacklist statistics
        const [listStats] = await connection.execute(`
            SELECT 
                COUNT(DISTINCT vwl.location_id) as locations_with_whitelist,
                COUNT(DISTINCT vbl.location_id) as locations_with_blacklist,
                COUNT(vwl.id) as total_whitelist_entries,
                COUNT(vbl.id) as total_blacklist_entries,
                COUNT(CASE WHEN vwl.is_active = 1 AND (vwl.valid_to IS NULL OR vwl.valid_to >= CURDATE()) THEN 1 END) as active_whitelist_entries,
                COUNT(CASE WHEN vbl.is_active = 1 AND (vbl.valid_to IS NULL OR vbl.valid_to >= CURDATE()) THEN 1 END) as active_blacklist_entries
            FROM locations l
            LEFT JOIN vehicle_whitelist vwl ON l.id = vwl.location_id
            LEFT JOIN vehicle_blacklist vbl ON l.id = vbl.location_id
            WHERE l.is_active = 1
        `);

        // Get recent activity
        const [recentActivity] = await connection.execute(`
            SELECT 
                COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as created_last_7_days,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as updated_last_7_days,
                COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as created_last_30_days,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as updated_last_30_days
            FROM locations
        `);

        // Get paired location statistics
        const [pairedLocationStats] = await connection.execute(`
            SELECT 
                entry_exit_pair_id,
                COUNT(*) as locations_in_pair,
                COUNT(CASE WHEN is_main_entry = 1 THEN 1 END) as main_entries_in_pair,
                COUNT(CASE WHEN is_main_exit = 1 THEN 1 END) as main_exits_in_pair,
                GROUP_CONCAT(zone_type) as zone_types_in_pair
            FROM locations
            WHERE entry_exit_pair_id IS NOT NULL AND is_active = 1
            GROUP BY entry_exit_pair_id
            ORDER BY locations_in_pair DESC
        `);

        // Get hierarchy depth statistics
        const [hierarchyStats] = await connection.execute(`
            WITH RECURSIVE location_hierarchy AS (
                -- Base case: root locations (no parent)
                SELECT id, name, parent_location_id, 0 as depth
                FROM locations 
                WHERE parent_location_id IS NULL AND is_active = 1
                
                UNION ALL
                
                -- Recursive case: child locations
                SELECT l.id, l.name, l.parent_location_id, lh.depth + 1
                FROM locations l
                JOIN location_hierarchy lh ON l.parent_location_id = lh.id
                WHERE l.is_active = 1
            )
            SELECT 
                MAX(depth) as max_hierarchy_depth,
                AVG(depth) as avg_hierarchy_depth,
                COUNT(CASE WHEN depth = 0 THEN 1 END) as root_locations_count,
                COUNT(CASE WHEN depth = 1 THEN 1 END) as level_1_locations,
                COUNT(CASE WHEN depth = 2 THEN 1 END) as level_2_locations,
                COUNT(CASE WHEN depth >= 3 THEN 1 END) as level_3_plus_locations
            FROM location_hierarchy
        `);

        res.status(200).json({
            success: true,
            data: {
                basic_stats: basicStats[0],
                zone_type_distribution: zoneTypeStats,
                camera_stats: cameraStats[0],
                detection_stats: detectionStats[0],
                entry_exit_stats: entryExitStats[0],
                list_stats: listStats[0],
                recent_activity: recentActivity[0],
                paired_location_stats: pairedLocationStats,
                hierarchy_stats: hierarchyStats[0]
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
                pl.zone_type as parent_zone_type,
                pl.code as parent_location_code
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

        // Get cameras with detailed information
        const [cameras] = await connection.execute(`
            SELECT 
                c.id, c.camera_key, c.camera_id, c.name, c.description,
                c.type, c.protocol, c.host, c.port, c.path,
                c.username, c.resolution_width, c.resolution_height, c.fps, c.bitrate,
                c.save_directory, c.recording_enabled, c.detection_enabled, c.is_active,
                c.last_online_at, c.created_at, c.updated_at, c.tags, c.configuration,
                
                -- Detection statistics for this camera
                COALESCE(detection_stats.total_detections, 0) as total_detections,
                COALESCE(detection_stats.today_detections, 0) as today_detections,
                COALESCE(detection_stats.avg_confidence, 0) as avg_confidence,
                COALESCE(detection_stats.avg_processing_time, 0) as avg_processing_time,
                detection_stats.last_detection_at,
                
                -- Online status
                CASE 
                    WHEN c.last_online_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 'online'
                    WHEN c.last_online_at >= DATE_SUB(NOW(), INTERVAL 30 MINUTE) THEN 'recently_offline'
                    ELSE 'offline'
                END as online_status
                
            FROM cameras c
            LEFT JOIN (
                SELECT 
                    camera_id,
                    COUNT(*) as total_detections,
                    COUNT(CASE WHEN detected_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as today_detections,
                    AVG(confidence_score) as avg_confidence,
                    AVG(processing_time_ms) as avg_processing_time,
                    MAX(detected_at) as last_detection_at
                FROM license_plate_detections
                GROUP BY camera_id
            ) detection_stats ON c.id = detection_stats.camera_id
            
            WHERE c.location_id = ?
            ORDER BY c.name
        `, [locationId]);

        // Get child locations with their statistics
        const [childLocations] = await connection.execute(`
            SELECT 
                cl.id, cl.name, cl.code, cl.zone_type, cl.is_restricted, cl.is_active,
                cl.entry_exit_pair_id, cl.is_main_entry, cl.is_main_exit,
                cl.max_stay_duration_hours, cl.created_at, cl.updated_at,
                
                -- Camera count for child location
                COALESCE(child_camera_stats.camera_count, 0) as camera_count,
                COALESCE(child_camera_stats.online_camera_count, 0) as online_camera_count,
                
                -- Detection count for child location
                COALESCE(child_detection_stats.today_detections, 0) as today_detections,
                COALESCE(child_detection_stats.total_detections, 0) as total_detections
                
            FROM locations cl
            LEFT JOIN (
                SELECT 
                    location_id,
                    COUNT(*) as camera_count,
                    COUNT(CASE WHEN last_online_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 1 END) as online_camera_count
                FROM cameras 
                WHERE is_active = 1
                GROUP BY location_id
            ) child_camera_stats ON cl.id = child_camera_stats.location_id
            
            LEFT JOIN (
                SELECT 
                    location_id,
                    COUNT(*) as total_detections,
                    COUNT(CASE WHEN detected_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as today_detections
                FROM license_plate_detections
                GROUP BY location_id
            ) child_detection_stats ON cl.id = child_detection_stats.location_id
            
            WHERE cl.parent_location_id = ?
            ORDER BY cl.name
        `, [locationId]);

        // Get recent detections with enhanced information
        const [recentDetections] = await connection.execute(`
            SELECT 
                lpd.id, lpd.detection_uuid, lpd.plate_number, lpd.raw_plate_text,
                lpd.detected_at, lpd.direction, lpd.confidence_score,
                lpd.ocr_confidence, lpd.detection_confidence,
                lpd.detected_vehicle_type, lpd.detected_vehicle_color, lpd.vehicle_speed,
                lpd.is_verified, lpd.is_whitelist_match, lpd.is_blacklist_match,
                lpd.alert_triggered, lpd.processing_time_ms, lpd.ai_model_version,
                
                c.name as camera_name, c.camera_key, c.camera_id,
                v.owner_name, v.owner_phone,
                
                -- Images paths
                lpd.original_image_path, lpd.cropped_plate_image_path, lpd.annotated_image_path
                
            FROM license_plate_detections lpd
            JOIN cameras c ON lpd.camera_id = c.id
            LEFT JOIN vehicles v ON lpd.vehicle_id = v.id
            WHERE lpd.location_id = ?
            ORDER BY lpd.detected_at DESC
            LIMIT 20
        `, [locationId]);

        // Get entry/exit statistics and current status
        let entryExitStats = null;
        let currentlyInside = [];
        
        if (['entrance', 'exit', 'checkpoint', 'monitoring_zone', 'parking'].includes(locationDetail[0].zone_type)) {
            const [stats] = await connection.execute(`
                SELECT 
                    COUNT(*) as total_entries,
                    COUNT(CASE WHEN exit_time IS NOT NULL THEN 1 END) as total_exits,
                    COUNT(CASE WHEN status = 'entered' THEN 1 END) as currently_inside,
                    COUNT(CASE WHEN is_overstay = 1 THEN 1 END) as overstay_count,
                    COUNT(CASE WHEN status = 'no_exit_record' THEN 1 END) as no_exit_records,
                    AVG(duration_minutes) as avg_duration_minutes,
                    MAX(duration_minutes) as max_duration_minutes,
                    MIN(duration_minutes) as min_duration_minutes,
                    COUNT(CASE WHEN entry_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as entries_today,
                    COUNT(CASE WHEN exit_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as exits_today,
                    COUNT(CASE WHEN entry_time >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as entries_this_week,
                    COUNT(CASE WHEN exit_time >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as exits_this_week
                FROM vehicle_entry_exit_logs
                WHERE location_id = ?
            `, [locationId]);
            entryExitStats = stats[0];

            // Get vehicles currently inside
            const [insideVehicles] = await connection.execute(`
                SELECT 
                    veel.plate_number, veel.entry_time, veel.duration_minutes,
                    veel.is_overstay, veel.entry_confidence, veel.entry_image_path,
                    v.owner_name, v.owner_phone, v.vehicle_type, v.color,
                    c.name as entry_camera_name,
                    TIMESTAMPDIFF(MINUTE, veel.entry_time, NOW()) as minutes_inside,
                    CASE 
                        WHEN TIMESTAMPDIFF(MINUTE, veel.entry_time, NOW()) > l.max_stay_duration_hours * 60 THEN 1
                        ELSE 0
                    END as is_currently_overstay
                FROM vehicle_entry_exit_logs veel
                LEFT JOIN vehicles v ON veel.vehicle_id = v.id
                LEFT JOIN cameras c ON veel.entry_camera_id = c.id
                LEFT JOIN locations l ON veel.location_id = l.id
                WHERE veel.location_id = ? AND veel.status = 'entered'
                ORDER BY veel.entry_time DESC
                LIMIT 50
            `, [locationId]);
            currentlyInside = insideVehicles;
        }

        // Get paired locations with detailed info
        const [pairedLocations] = await connection.execute(`
            SELECT 
                pl.id, pl.name, pl.code, pl.zone_type, pl.is_main_entry, pl.is_main_exit,
                pl.address, pl.description, pl.is_active,
                
                -- Camera count for paired location
                COALESCE(paired_camera_stats.camera_count, 0) as camera_count,
                COALESCE(paired_camera_stats.online_camera_count, 0) as online_camera_count,
                
                -- Detection count for paired location  
                COALESCE(paired_detection_stats.today_detections, 0) as today_detections
                
            FROM locations pl
            LEFT JOIN (
                SELECT 
                    location_id,
                    COUNT(*) as camera_count,
                    COUNT(CASE WHEN last_online_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 1 END) as online_camera_count
                FROM cameras 
                WHERE is_active = 1
                GROUP BY location_id
            ) paired_camera_stats ON pl.id = paired_camera_stats.location_id
            
            LEFT JOIN (
                SELECT 
                    location_id,
                    COUNT(CASE WHEN detected_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as today_detections
                FROM license_plate_detections
                GROUP BY location_id
            ) paired_detection_stats ON pl.id = paired_detection_stats.location_id
            
            WHERE pl.entry_exit_pair_id = ? AND pl.entry_exit_pair_id IS NOT NULL AND pl.id != ?
        `, [locationDetail[0].entry_exit_pair_id || null, locationId]);

        // Get whitelist entries with OCR information
        const [whitelistEntries] = await connection.execute(`
            SELECT 
                vwl.id, vwl.plate_number, vwl.verified_plate_number, vwl.owner_name, vwl.owner_phone,
                vwl.contact_email, vwl.valid_from, vwl.valid_to, vwl.description,
                vwl.approval_status, vwl.is_active, vwl.created_at,
                vwl.plate_image_path, vwl.ocr_raw_text, vwl.ocr_confidence,
                vwl.verification_status, vwl.ocr_processed_at,
                u1.name as created_by_name, u2.name as approved_by_name,
                v.vehicle_type, v.make, v.model, v.color
            FROM vehicle_whitelist vwl
            LEFT JOIN users u1 ON vwl.created_by = u1.id
            LEFT JOIN users u2 ON vwl.approved_by = u2.id
            LEFT JOIN vehicles v ON vwl.vehicle_id = v.id
            WHERE vwl.location_id = ?
            ORDER BY vwl.created_at DESC
            LIMIT 50
        `, [locationId]);

        // Get blacklist entries with violation details
        const [blacklistEntries] = await connection.execute(`
            SELECT 
                vbl.id, vbl.plate_number, vbl.verified_plate_number, vbl.owner_name, vbl.owner_phone,
                vbl.violation_type, vbl.reason, vbl.severity, vbl.valid_from, vbl.valid_to,
                vbl.description, vbl.evidence_files, vbl.is_active, vbl.created_at,
                vbl.plate_image_path, vbl.ocr_raw_text, vbl.ocr_confidence,
                vbl.verification_status, vbl.ocr_processed_at,
                u.name as created_by_name,
                v.vehicle_type, v.make, v.model, v.color
            FROM vehicle_blacklist vbl
            LEFT JOIN users u ON vbl.created_by = u.id
            LEFT JOIN vehicles v ON vbl.vehicle_id = v.id
            WHERE vbl.location_id = ?
            ORDER BY vbl.created_at DESC
            LIMIT 50
        `, [locationId]);

        // Get recent alerts with full context
        const [recentAlerts] = await connection.execute(`
            SELECT 
                a.id, a.alert_uuid, a.alert_type, a.severity, a.title, a.message, a.summary,
                a.plate_number, a.status, a.priority_score, a.created_at, a.updated_at,
                a.acknowledged_at, a.resolved_at, a.resolution_notes, a.escalation_level,
                a.alert_data, a.context_data, a.evidence_files,
                c.name as camera_name, c.camera_key,
                u1.name as acknowledged_by_name, u2.name as resolved_by_name,
                lpd.confidence_score as detection_confidence,
                lpd.detected_at as detection_time
            FROM alerts a
            LEFT JOIN cameras c ON a.camera_id = c.id
            LEFT JOIN users u1 ON a.acknowledged_by = u1.id
            LEFT JOIN users u2 ON a.resolved_by = u2.id
            LEFT JOIN license_plate_detections lpd ON a.detection_id = lpd.id
            WHERE a.location_id = ?
            ORDER BY a.created_at DESC
            LIMIT 20
        `, [locationId]);

        // Get detection hourly statistics for today
        const [hourlyDetectionStats] = await connection.execute(`
            SELECT 
                HOUR(detected_at) as hour,
                COUNT(*) as detection_count,
                COUNT(DISTINCT plate_number) as unique_vehicles,
                AVG(confidence_score) as avg_confidence,
                COUNT(CASE WHEN alert_triggered = 1 THEN 1 END) as alert_count,
                COUNT(CASE WHEN direction = 'inbound' THEN 1 END) as inbound_count,
                COUNT(CASE WHEN direction = 'outbound' THEN 1 END) as outbound_count
            FROM license_plate_detections
            WHERE location_id = ? AND DATE(detected_at) = CURDATE()
            GROUP BY HOUR(detected_at)
            ORDER BY hour
        `, [locationId]);

        // Get vehicle journey statistics
        const [journeyStats] = await connection.execute(`
            SELECT 
                COUNT(DISTINCT vj.id) as total_journeys,
                COUNT(CASE WHEN vj.status = 'active' THEN 1 END) as active_journeys,
                COUNT(CASE WHEN vj.status = 'completed' THEN 1 END) as completed_journeys,
                COUNT(CASE WHEN vj.status = 'anomaly' THEN 1 END) as anomaly_journeys,
                AVG(vj.total_duration_minutes) as avg_journey_duration,
                AVG(vj.detection_count) as avg_detections_per_journey,
                COUNT(CASE WHEN DATE(vj.started_at) = CURDATE() THEN 1 END) as journeys_today
            FROM vehicle_journeys vj
            JOIN journey_checkpoints jc ON vj.id = jc.journey_id
            WHERE jc.location_id = ?
        `, [locationId]);

        // Get system performance metrics for this location
        const [performanceMetrics] = await connection.execute(`
            SELECT 
                COUNT(lpd.id) as total_processed,
                AVG(lpd.processing_time_ms) as avg_processing_time,
                MIN(lpd.processing_time_ms) as min_processing_time,
                MAX(lpd.processing_time_ms) as max_processing_time,
                COUNT(CASE WHEN lpd.processing_time_ms > 5000 THEN 1 END) as slow_processing_count,
                COUNT(CASE WHEN lpd.confidence_score < 0.7 THEN 1 END) as low_confidence_count,
                COUNT(CASE WHEN lpd.is_verified = 1 THEN 1 END) as verified_count,
                COUNT(DISTINCT lpd.ai_model_version) as model_versions_used
            FROM license_plate_detections lpd
            WHERE lpd.location_id = ? AND lpd.detected_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        `, [locationId]);

        res.status(200).json({
            success: true,
            data: {
                location: locationDetail[0],
                cameras: cameras,
                child_locations: childLocations,
                recent_detections: recentDetections,
                entry_exit_stats: entryExitStats,
                currently_inside: currentlyInside,
                paired_locations: pairedLocations,
                whitelist_entries: whitelistEntries,
                blacklist_entries: blacklistEntries,
                recent_alerts: recentAlerts,
                hourly_detection_stats: hourlyDetectionStats,
                journey_stats: journeyStats[0],
                performance_metrics: performanceMetrics[0],
                counts: {
                    cameras: cameras.length,
                    child_locations: childLocations.length,
                    whitelist_entries: whitelistEntries.length,
                    blacklist_entries: blacklistEntries.length,
                    recent_alerts: recentAlerts.length,
                    currently_inside: currentlyInside.length
                }
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
        const includeInactive = req.query.include_inactive === 'true';
        const includeStats = req.query.include_stats === 'true';
        
        // Get all locations with hierarchy information
        let baseQuery = `
            SELECT 
                l.id, l.name, l.code, l.address, l.latitude, l.longitude, 
                l.description, l.zone_type, l.is_restricted, l.parent_location_id,
                l.entry_exit_pair_id, l.is_main_entry, l.is_main_exit, 
                l.max_stay_duration_hours, l.is_alert_on_overstay, 
                l.is_alert_on_no_exit, l.is_active, l.created_at, l.updated_at,
                pl.name as parent_name,
                COUNT(DISTINCT cl.id) as child_count
        `;
        
        if (includeStats) {
            baseQuery += `,
                COUNT(DISTINCT c.id) as camera_count,
                COUNT(DISTINCT CASE WHEN c.last_online_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN c.id END) as online_camera_count,
                COUNT(DISTINCT CASE WHEN lpd.detected_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN lpd.id END) as today_detections,
                COUNT(DISTINCT veel.id) as entry_exit_logs_count
            `;
        }
        
        baseQuery += `
            FROM locations l
            LEFT JOIN locations pl ON l.parent_location_id = pl.id
            LEFT JOIN locations cl ON cl.parent_location_id = l.id ${includeInactive ? '' : 'AND cl.is_active = 1'}
        `;
        
        if (includeStats) {
            baseQuery += `
                LEFT JOIN cameras c ON l.id = c.location_id AND c.is_active = 1
                LEFT JOIN license_plate_detections lpd ON l.id = lpd.location_id
                LEFT JOIN vehicle_entry_exit_logs veel ON l.id = veel.location_id
            `;
        }
        
        baseQuery += `
            WHERE ${includeInactive ? '1=1' : 'l.is_active = 1'}
            GROUP BY l.id, l.name, l.code, l.address, l.latitude, l.longitude, 
                     l.description, l.zone_type, l.is_restricted, l.parent_location_id,
                     l.entry_exit_pair_id, l.is_main_entry, l.is_main_exit, 
                     l.max_stay_duration_hours, l.is_alert_on_overstay, 
                     l.is_alert_on_no_exit, l.is_active, l.created_at, l.updated_at,
                     pl.name
            ORDER BY l.parent_location_id, l.name
        `;

        const [locations] = await connection.execute(baseQuery);

        // Build hierarchy tree with depth calculation
        const buildHierarchy = (locations, parentId = null, depth = 0) => {
            return locations
                .filter(location => location.parent_location_id === parentId)
                .map(location => ({
                    ...location,
                    depth: depth,
                    children: buildHierarchy(locations, location.id, depth + 1)
                }));
        };

        const hierarchy = buildHierarchy(locations);

        // Calculate hierarchy statistics
        const hierarchyStats = {
            total_locations: locations.length,
            root_locations: locations.filter(l => l.parent_location_id === null).length,
            max_depth: 0,
            locations_by_depth: {},
            locations_by_zone_type: {},
            restricted_locations: locations.filter(l => l.is_restricted).length,
            active_locations: locations.filter(l => l.is_active).length
        };

        // Calculate max depth and distribution
        const calculateDepth = (items, currentDepth = 0) => {
            hierarchyStats.max_depth = Math.max(hierarchyStats.max_depth, currentDepth);
            hierarchyStats.locations_by_depth[currentDepth] = (hierarchyStats.locations_by_depth[currentDepth] || 0) + items.length;
            
            items.forEach(item => {
                hierarchyStats.locations_by_zone_type[item.zone_type] = (hierarchyStats.locations_by_zone_type[item.zone_type] || 0) + 1;
                if (item.children && item.children.length > 0) {
                    calculateDepth(item.children, currentDepth + 1);
                }
            });
        };

        calculateDepth(hierarchy);

        res.status(200).json({
            success: true,
            data: {
                hierarchy: hierarchy,
                statistics: hierarchyStats,
                options: {
                    include_inactive: includeInactive,
                    include_stats: includeStats
                }
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

// Các function còn lại với cùng pattern xử lý safe parameters
const getLocationPerformance = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const locationId = req.params.id;
        const days = parseInt(req.query.days) || 7;
        const includeHourly = req.query.include_hourly === 'true';

        // Ensure safe parameters
        const safeParams = [locationId, days].map(param => param === undefined ? null : param);

        // Get daily detection statistics
        const [detectionStats] = await connection.execute(`
            SELECT 
                DATE(detected_at) as date,
                COUNT(*) as total_detections,
                COUNT(DISTINCT plate_number) as unique_vehicles,
                AVG(confidence_score) as avg_confidence,
                AVG(ocr_confidence) as avg_ocr_confidence,
                AVG(detection_confidence) as avg_detection_confidence,
                COUNT(CASE WHEN is_verified = 1 THEN 1 END) as verified_detections,
                COUNT(CASE WHEN alert_triggered = 1 THEN 1 END) as alert_count,
                COUNT(CASE WHEN is_blacklist_match = 1 THEN 1 END) as blacklist_matches,
                COUNT(CASE WHEN is_whitelist_match = 1 THEN 1 END) as whitelist_matches,
                COUNT(CASE WHEN direction = 'inbound' THEN 1 END) as inbound_count,
                COUNT(CASE WHEN direction = 'outbound' THEN 1 END) as outbound_count,
                COUNT(CASE WHEN direction = 'unknown' THEN 1 END) as unknown_direction_count,
                AVG(processing_time_ms) as avg_processing_time,
                MAX(processing_time_ms) as max_processing_time,
                COUNT(CASE WHEN processing_time_ms > 5000 THEN 1 END) as slow_processing_count
            FROM license_plate_detections
            WHERE location_id = ? 
            AND detected_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY DATE(detected_at)
            ORDER BY date DESC
        `, safeParams);

        // Get hourly distribution if requested
        let hourlyStats = null;
        if (includeHourly) {
            const [hourlyResult] = await connection.execute(`
                SELECT 
                    HOUR(detected_at) as hour,
                    COUNT(*) as detection_count,
                    COUNT(DISTINCT plate_number) as unique_vehicles,
                    AVG(confidence_score) as avg_confidence,
                    COUNT(CASE WHEN alert_triggered = 1 THEN 1 END) as alert_count
                FROM license_plate_detections
                WHERE location_id = ? 
                AND detected_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                GROUP BY HOUR(detected_at)
                ORDER BY hour
            `, safeParams);
            hourlyStats = hourlyResult;
        }

        // Get camera performance for this location
        const [cameraPerformance] = await connection.execute(`
            SELECT 
                c.id, c.name, c.camera_key, c.camera_id,
                c.is_active, c.detection_enabled, c.recording_enabled,
                COUNT(lpd.id) as detection_count,
                AVG(lpd.confidence_score) as avg_confidence,
                AVG(lpd.processing_time_ms) as avg_processing_time,
                MAX(lpd.detected_at) as last_detection,
                COUNT(CASE WHEN lpd.alert_triggered = 1 THEN 1 END) as alert_count,
                COUNT(CASE WHEN lpd.is_verified = 1 THEN 1 END) as verified_count,
                c.last_online_at,
                CASE 
                    WHEN c.last_online_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 'online'
                    WHEN c.last_online_at >= DATE_SUB(NOW(), INTERVAL 30 MINUTE) THEN 'recently_offline'
                    ELSE 'offline'
                END as online_status,
                TIMESTAMPDIFF(MINUTE, c.last_online_at, NOW()) as minutes_since_online
            FROM cameras c
            LEFT JOIN license_plate_detections lpd ON c.id = lpd.camera_id 
                AND lpd.detected_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            WHERE c.location_id = ?
            GROUP BY c.id, c.name, c.camera_key, c.camera_id, c.is_active, 
                     c.detection_enabled, c.recording_enabled, c.last_online_at
            ORDER BY detection_count DESC
        `, [days, locationId]);

        // Additional statistics with safe parameter handling
        let entryExitPerformance = null;
        const [locationInfo] = await connection.execute('SELECT zone_type FROM locations WHERE id = ?', [locationId]);
        
        if (locationInfo.length > 0 && ['entrance', 'exit', 'checkpoint', 'parking', 'monitoring_zone'].includes(locationInfo[0].zone_type)) {
            const [entryExitResult] = await connection.execute(`
                SELECT 
                    DATE(entry_time) as date,
                    COUNT(*) as total_entries,
                    COUNT(CASE WHEN exit_time IS NOT NULL THEN 1 END) as total_exits,
                    COUNT(CASE WHEN status = 'entered' THEN 1 END) as still_inside,
                    COUNT(CASE WHEN is_overstay = 1 THEN 1 END) as overstays,
                    AVG(duration_minutes) as avg_duration_minutes,
                    MAX(duration_minutes) as max_duration_minutes,
                    AVG(entry_confidence) as avg_entry_confidence,
                    AVG(exit_confidence) as avg_exit_confidence
                FROM vehicle_entry_exit_logs
                WHERE location_id = ? 
                AND entry_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
                GROUP BY DATE(entry_time)
                ORDER BY date DESC
            `, [locationId, days]);
            entryExitPerformance = entryExitResult;
        }

        // Get alert performance
        const [alertPerformance] = await connection.execute(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as total_alerts,
                COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_alerts,
                COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_alerts,
                COUNT(CASE WHEN severity = 'medium' THEN 1 END) as medium_alerts,
                COUNT(CASE WHEN severity = 'low' THEN 1 END) as low_alerts,
                COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_alerts,
                AVG(CASE WHEN status = 'resolved' THEN resolution_time_minutes END) as avg_resolution_time,
                COUNT(CASE WHEN alert_type = 'blacklist_detected' THEN 1 END) as blacklist_alerts,
                COUNT(CASE WHEN alert_type = 'unauthorized_access' THEN 1 END) as unauthorized_alerts,
                COUNT(CASE WHEN alert_type = 'overstay' THEN 1 END) as overstay_alerts
            FROM alerts
            WHERE location_id = ? 
            AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY DATE(created_at)
            ORDER BY date DESC
        `, [locationId, days]);

        // Get vehicle type distribution
        const [vehicleTypeStats] = await connection.execute(`
            SELECT 
                detected_vehicle_type as vehicle_type,
                COUNT(*) as detection_count,
                COUNT(DISTINCT plate_number) as unique_vehicles,
                AVG(confidence_score) as avg_confidence
            FROM license_plate_detections
            WHERE location_id = ? 
            AND detected_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            AND detected_vehicle_type IS NOT NULL
            GROUP BY detected_vehicle_type
            ORDER BY detection_count DESC
        `, [locationId, days]);

        // Get top detected plates
        const [topPlates] = await connection.execute(`
            SELECT 
                plate_number,
                COUNT(*) as detection_count,
                MIN(detected_at) as first_detection,
                MAX(detected_at) as last_detection,
                AVG(confidence_score) as avg_confidence,
                COUNT(CASE WHEN alert_triggered = 1 THEN 1 END) as alert_count,
                MAX(CASE WHEN is_whitelist_match = 1 THEN 1 ELSE 0 END) as is_whitelisted,
                MAX(CASE WHEN is_blacklist_match = 1 THEN 1 ELSE 0 END) as is_blacklisted
            FROM license_plate_detections
            WHERE location_id = ? 
            AND detected_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY plate_number
            ORDER BY detection_count DESC
            LIMIT 20
        `, [locationId, days]);

        // Get system performance trends
        const [systemPerformance] = await connection.execute(`
            SELECT 
                DATE(detected_at) as date,
                AVG(processing_time_ms) as avg_processing_time,
                MIN(processing_time_ms) as min_processing_time,
                MAX(processing_time_ms) as max_processing_time,
                STDDEV(processing_time_ms) as stddev_processing_time,
                COUNT(CASE WHEN processing_time_ms > 5000 THEN 1 END) as slow_count,
                COUNT(CASE WHEN processing_time_ms BETWEEN 0 AND 1000 THEN 1 END) as fast_count,
                COUNT(CASE WHEN processing_time_ms BETWEEN 1001 AND 3000 THEN 1 END) as medium_count,
                COUNT(CASE WHEN processing_time_ms BETWEEN 3001 AND 5000 THEN 1 END) as slow_medium_count
            FROM license_plate_detections
            WHERE location_id = ? 
            AND detected_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            AND processing_time_ms IS NOT NULL
            GROUP BY DATE(detected_at)
            ORDER BY date DESC
        `, [locationId, days]);

        res.status(200).json({
            success: true,
            data: {
                detection_stats: detectionStats,
                hourly_stats: hourlyStats,
                camera_performance: cameraPerformance,
                entry_exit_performance: entryExitPerformance,
                alert_performance: alertPerformance,
                vehicle_type_stats: vehicleTypeStats,
                top_detected_plates: topPlates,
                system_performance: systemPerformance,
                period_days: days,
                location_id: locationId
            }
        });

    } catch (error) {
        console.error('Error getting location performance:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thống kê hiệu suất vị trí',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getLocationsByZoneType = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const zoneType = req.params.zone_type;
        const includeInactive = req.query.include_inactive === 'true';
        const includeStats = req.query.include_stats === 'true';
        
        if (!['entrance', 'exit', 'checkpoint', 'parking', 'restricted', 'monitoring_zone'].includes(zoneType)) {
            return res.status(400).json({
                success: false,
                message: 'Loại zone không hợp lệ'
            });
        }

        let baseQuery = `
            SELECT 
                l.*,
                pl.name as parent_location_name,
                pl.zone_type as parent_zone_type
        `;

        if (includeStats) {
            baseQuery += `,
                COALESCE(camera_stats.camera_count, 0) as camera_count,
                COALESCE(camera_stats.online_camera_count, 0) as online_camera_count,
                COALESCE(camera_stats.detection_enabled_count, 0) as detection_enabled_count,
                COALESCE(detection_stats.today_detections, 0) as today_detections,
                COALESCE(detection_stats.week_detections, 0) as week_detections,
                COALESCE(detection_stats.total_detections, 0) as total_detections,
                COALESCE(detection_stats.avg_confidence, 0) as avg_confidence,
                COALESCE(alert_stats.active_alerts, 0) as active_alerts,
                COALESCE(list_stats.whitelist_count, 0) as whitelist_count,
                COALESCE(list_stats.blacklist_count, 0) as blacklist_count
            `;
        }

        baseQuery += `
            FROM locations l
            LEFT JOIN locations pl ON l.parent_location_id = pl.id
        `;

        if (includeStats) {
            baseQuery += `
                LEFT JOIN (
                    SELECT 
                        location_id,
                        COUNT(*) as camera_count,
                        COUNT(CASE WHEN last_online_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 1 END) as online_camera_count,
                        COUNT(CASE WHEN detection_enabled = 1 THEN 1 END) as detection_enabled_count
                    FROM cameras 
                    WHERE is_active = 1
                    GROUP BY location_id
                ) camera_stats ON l.id = camera_stats.location_id
                
                LEFT JOIN (
                    SELECT 
                        location_id,
                        COUNT(CASE WHEN detected_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as today_detections,
                        COUNT(CASE WHEN detected_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as week_detections,
                        COUNT(*) as total_detections,
                        AVG(confidence_score) as avg_confidence
                    FROM license_plate_detections
                    GROUP BY location_id
                ) detection_stats ON l.id = detection_stats.location_id
                
                LEFT JOIN (
                    SELECT 
                        location_id,
                        COUNT(CASE WHEN status IN ('new', 'acknowledged', 'investigating') THEN 1 END) as active_alerts
                    FROM alerts
                    GROUP BY location_id
                ) alert_stats ON l.id = alert_stats.location_id
                
                LEFT JOIN (
                    SELECT 
                        location_id,
                        COUNT(CASE WHEN source_table = 'whitelist' AND is_active = 1 THEN 1 END) as whitelist_count,
                        COUNT(CASE WHEN source_table = 'blacklist' AND is_active = 1 THEN 1 END) as blacklist_count
                    FROM (
                        SELECT location_id, is_active, 'whitelist' as source_table FROM vehicle_whitelist
                        UNION ALL
                        SELECT location_id, is_active, 'blacklist' as source_table FROM vehicle_blacklist
                    ) combined_lists
                    GROUP BY location_id
                ) list_stats ON l.id = list_stats.location_id
            `;
        }

        baseQuery += `
            WHERE l.zone_type = ? ${includeInactive ? '' : 'AND l.is_active = 1'}
            ORDER BY l.name
        `;

        const [locations] = await connection.execute(baseQuery, [zoneType]);

        // Get zone-specific statistics
        const [zoneStats] = await connection.execute(`
            SELECT 
                COUNT(*) as total_locations,
                COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_locations,
                COUNT(CASE WHEN is_restricted = 1 THEN 1 END) as restricted_locations,
                COUNT(CASE WHEN parent_location_id IS NULL THEN 1 END) as root_locations,
                COUNT(CASE WHEN is_main_entry = 1 THEN 1 END) as main_entries,
                COUNT(CASE WHEN is_main_exit = 1 THEN 1 END) as main_exits,
                COUNT(CASE WHEN entry_exit_pair_id IS NOT NULL THEN 1 END) as paired_locations,
                AVG(max_stay_duration_hours) as avg_max_stay_hours,
                COUNT(CASE WHEN is_alert_on_overstay = 1 THEN 1 END) as overstay_alert_enabled,
                COUNT(CASE WHEN is_alert_on_no_exit = 1 THEN 1 END) as no_exit_alert_enabled
            FROM locations
            WHERE zone_type = ? ${includeInactive ? '' : 'AND is_active = 1'}
        `, [zoneType]);

        res.status(200).json({
            success: true,
            data: {
                zone_type: zoneType,
                locations: locations,
                zone_statistics: zoneStats[0],
                options: {
                    include_inactive: includeInactive,
                    include_stats: includeStats
                }
            }
        });

    } catch (error) {
        console.error('Error getting locations by zone type:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy vị trí theo loại zone',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const searchLocations = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const searchTerm = req.query.q || '';
        const limit = parseInt(req.query.limit) || 10;
        const includeInactive = req.query.include_inactive === 'true';
        const zoneTypeFilter = req.query.zone_type || '';
        const restrictedFilter = req.query.is_restricted || '';

        if (!searchTerm || searchTerm.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Từ khóa tìm kiếm phải có ít nhất 2 ký tự'
            });
        }

        let whereConditions = [];
        let queryParams = [];

        // Base search conditions
        whereConditions.push('(l.name LIKE ? OR l.code LIKE ? OR l.address LIKE ? OR l.description LIKE ?)');
        queryParams.push(`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`);

        // Active filter
        if (!includeInactive) {
            whereConditions.push('l.is_active = 1');
        }

        // Zone type filter
        if (zoneTypeFilter) {
            whereConditions.push('l.zone_type = ?');
            queryParams.push(zoneTypeFilter);
        }

        // Restricted filter
        if (restrictedFilter !== '') {
            whereConditions.push('l.is_restricted = ?');
            queryParams.push(restrictedFilter === 'true' ? 1 : 0);
        }

        // Ensure safe parameters
        queryParams = queryParams.map(param => param === undefined ? null : param);

        const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

        const [locations] = await connection.execute(`
            SELECT 
                l.id, l.name, l.code, l.zone_type, l.address, l.description,
                l.is_restricted, l.is_active, l.latitude, l.longitude,
                l.entry_exit_pair_id, l.is_main_entry, l.is_main_exit,
                pl.name as parent_location_name,
                pl.zone_type as parent_zone_type,
                
                -- Basic stats
                COALESCE(camera_stats.camera_count, 0) as camera_count,
                COALESCE(camera_stats.online_camera_count, 0) as online_camera_count,
                COALESCE(detection_stats.today_detections, 0) as today_detections,
                
                -- Search relevance scoring
                CASE 
                    WHEN l.name LIKE ? THEN 1
                    WHEN l.code LIKE ? THEN 2
                    WHEN l.address LIKE ? THEN 3
                    WHEN l.description LIKE ? THEN 4
                    ELSE 5
                END as relevance_score
                
            FROM locations l
            LEFT JOIN locations pl ON l.parent_location_id = pl.id
            LEFT JOIN (
                SELECT 
                    location_id,
                    COUNT(*) as camera_count,
                    COUNT(CASE WHEN last_online_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 1 END) as online_camera_count
                FROM cameras 
                WHERE is_active = 1
                GROUP BY location_id
            ) camera_stats ON l.id = camera_stats.location_id
            LEFT JOIN (
                SELECT 
                    location_id,
                    COUNT(CASE WHEN detected_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as today_detections
                FROM license_plate_detections
                GROUP BY location_id
            ) detection_stats ON l.id = detection_stats.location_id
            
            ${whereClause}
            ORDER BY relevance_score, l.name
            LIMIT ?
        `, [
            ...queryParams,
            `${searchTerm}%`, `${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`,
            limit
        ]);

        // Get search statistics
        const [searchStats] = await connection.execute(`
            SELECT 
                COUNT(*) as total_matches,
                COUNT(CASE WHEN zone_type = 'entrance' THEN 1 END) as entrance_matches,
                COUNT(CASE WHEN zone_type = 'exit' THEN 1 END) as exit_matches,
                COUNT(CASE WHEN zone_type = 'checkpoint' THEN 1 END) as checkpoint_matches,
                COUNT(CASE WHEN zone_type = 'parking' THEN 1 END) as parking_matches,
                COUNT(CASE WHEN zone_type = 'restricted' THEN 1 END) as restricted_matches,
                COUNT(CASE WHEN zone_type = 'monitoring_zone' THEN 1 END) as monitoring_zone_matches,
                COUNT(CASE WHEN is_restricted = 1 THEN 1 END) as restricted_location_matches
            FROM locations l
            ${whereClause}
        `, queryParams);

        res.status(200).json({
            success: true,
            data: {
                search_term: searchTerm,
                locations: locations,
                search_statistics: searchStats[0],
                filters_applied: {
                    zone_type: zoneTypeFilter,
                    is_restricted: restrictedFilter,
                    include_inactive: includeInactive
                },
                pagination: {
                    limit: limit,
                    returned_count: locations.length
                }
            }
        });

    } catch (error) {
        console.error('Error searching locations:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tìm kiếm vị trí',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// New API endpoints
const getLocationDashboard = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const locationId = req.params.id;

        // Get real-time overview
        const [overview] = await connection.execute(`
            SELECT 
                l.name, l.zone_type, l.is_restricted,
                COUNT(DISTINCT c.id) as total_cameras,
                COUNT(DISTINCT CASE WHEN c.last_online_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN c.id END) as online_cameras,
                COUNT(DISTINCT CASE WHEN lpd.detected_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN lpd.id END) as today_detections,
                COUNT(DISTINCT CASE WHEN lpd.detected_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN lpd.plate_number END) as unique_vehicles_last_hour,
                COUNT(DISTINCT CASE WHEN a.status IN ('new', 'acknowledged') THEN a.id END) as active_alerts,
                COUNT(DISTINCT CASE WHEN veel.status = 'entered' THEN veel.id END) as currently_inside
            FROM locations l
            LEFT JOIN cameras c ON l.id = c.location_id AND c.is_active = 1
            LEFT JOIN license_plate_detections lpd ON l.id = lpd.location_id
            LEFT JOIN alerts a ON l.id = a.location_id
            LEFT JOIN vehicle_entry_exit_logs veel ON l.id = veel.location_id
            WHERE l.id = ?
            GROUP BY l.id, l.name, l.zone_type, l.is_restricted
        `, [locationId]);

        if (overview.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy vị trí'
            });
        }

        // Get recent activity (last 2 hours)
        const [recentActivity] = await connection.execute(`
            SELECT 
                'detection' as activity_type,
                lpd.plate_number as description,
                lpd.detected_at as timestamp,
                lpd.confidence_score as score,
                c.name as source,
                CASE WHEN lpd.alert_triggered = 1 THEN 'alert' ELSE 'normal' END as status
            FROM license_plate_detections lpd
            JOIN cameras c ON lpd.camera_id = c.id
            WHERE lpd.location_id = ? 
            AND lpd.detected_at >= DATE_SUB(NOW(), INTERVAL 2 HOUR)
            
            UNION ALL
            
            SELECT 
                'alert' as activity_type,
                CONCAT(a.alert_type, ': ', a.title) as description,
                a.created_at as timestamp,
                a.priority_score as score,
                c.name as source,
                a.severity as status
            FROM alerts a
            LEFT JOIN cameras c ON a.camera_id = c.id
            WHERE a.location_id = ?
            AND a.created_at >= DATE_SUB(NOW(), INTERVAL 2 HOUR)
            
            ORDER BY timestamp DESC
            LIMIT 20
        `, [locationId, locationId]);

        // Get hourly statistics for today
        const [hourlyStats] = await connection.execute(`
            SELECT 
                HOUR(detected_at) as hour,
                COUNT(*) as detections,
                COUNT(DISTINCT plate_number) as unique_vehicles,
                COUNT(CASE WHEN alert_triggered = 1 THEN 1 END) as alerts
            FROM license_plate_detections
            WHERE location_id = ? AND DATE(detected_at) = CURDATE()
            GROUP BY HOUR(detected_at)
            ORDER BY hour
        `, [locationId]);

        // Get camera status
        const [cameraStatus] = await connection.execute(`
            SELECT 
                c.id, c.name, c.camera_key,
                CASE 
                    WHEN c.last_online_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 'online'
                    WHEN c.last_online_at >= DATE_SUB(NOW(), INTERVAL 30 MINUTE) THEN 'warning'
                    ELSE 'offline'
                END as status,
                c.detection_enabled, c.recording_enabled,
                COUNT(lpd.id) as detections_today
            FROM cameras c
            LEFT JOIN license_plate_detections lpd ON c.id = lpd.camera_id 
                AND DATE(lpd.detected_at) = CURDATE()
            WHERE c.location_id = ? AND c.is_active = 1
            GROUP BY c.id, c.name, c.camera_key, c.last_online_at, c.detection_enabled, c.recording_enabled
            ORDER BY c.name
        `, [locationId]);

        res.status(200).json({
            success: true,
            data: {
                overview: overview[0],
                recent_activity: recentActivity,
                hourly_stats: hourlyStats,
                camera_status: cameraStatus,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error getting location dashboard:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy dashboard vị trí',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getLocationAlerts = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const locationId = req.params.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const status = req.query.status || '';
        const severity = req.query.severity || '';
        const alertType = req.query.alert_type || '';

        let whereConditions = ['a.location_id = ?'];
        let queryParams = [locationId];

        if (status) {
            whereConditions.push('a.status = ?');
            queryParams.push(status);
        }

        if (severity) {
            whereConditions.push('a.severity = ?');
            queryParams.push(severity);
        }

        if (alertType) {
            whereConditions.push('a.alert_type = ?');
            queryParams.push(alertType);
        }

        // Ensure safe parameters
        queryParams = queryParams.map(param => param === undefined ? null : param);

        const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

        // Get total count
        const [countResult] = await connection.execute(`
            SELECT COUNT(*) as total
            FROM alerts a
            ${whereClause}
        `, queryParams);

        const totalRecords = countResult[0].total;
        const totalPages = Math.ceil(totalRecords / limit);

        // Get alerts
        const [alerts] = await connection.execute(`
            SELECT 
                a.id, a.alert_uuid, a.alert_type, a.severity, a.title, a.message,
                a.plate_number, a.status, a.priority_score, a.created_at,
                a.acknowledged_at, a.resolved_at, a.escalation_level,
                c.name as camera_name, c.camera_key,
                u1.name as acknowledged_by_name,
                u2.name as resolved_by_name,
                lpd.confidence_score as detection_confidence
            FROM alerts a
            LEFT JOIN cameras c ON a.camera_id = c.id
            LEFT JOIN users u1 ON a.acknowledged_by = u1.id
            LEFT JOIN users u2 ON a.resolved_by = u2.id
            LEFT JOIN license_plate_detections lpd ON a.detection_id = lpd.id
            ${whereClause}
            ORDER BY a.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `, queryParams);

        res.status(200).json({
            success: true,
            data: {
                alerts: alerts,
                pagination: {
                    current_page: page,
                    total_pages: totalPages,
                    total_records: totalRecords,
                    limit: limit
                },
                filters: {
                    status: status,
                    severity: severity,
                    alert_type: alertType
                }
            }
        });

    } catch (error) {
        console.error('Error getting location alerts:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách cảnh báo',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getLocationEntryExitLogs = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const locationId = req.params.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const status = req.query.status || '';
        const dateFrom = req.query.date_from || '';
        const dateTo = req.query.date_to || '';

        let whereConditions = ['veel.location_id = ?'];
        let queryParams = [locationId];

        if (status) {
            whereConditions.push('veel.status = ?');
            queryParams.push(status);
        }

        if (dateFrom) {
            whereConditions.push('DATE(veel.entry_time) >= ?');
            queryParams.push(dateFrom);
        }

        if (dateTo) {
            whereConditions.push('DATE(veel.entry_time) <= ?');
            queryParams.push(dateTo);
        }

        // Ensure safe parameters
        queryParams = queryParams.map(param => param === undefined ? null : param);

        const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

        // Get total count
        const [countResult] = await connection.execute(`
            SELECT COUNT(*) as total
            FROM vehicle_entry_exit_logs veel
            ${whereClause}
        `, queryParams);

        const totalRecords = countResult[0].total;
        const totalPages = Math.ceil(totalRecords / limit);

        // Get entry/exit logs
        const [logs] = await connection.execute(`
            SELECT 
                veel.*,
                v.owner_name, v.owner_phone, v.vehicle_type, v.color,
                c1.name as entry_camera_name,
                c2.name as exit_camera_name,
                l1.name as entry_location_name,
                l2.name as exit_location_name
            FROM vehicle_entry_exit_logs veel
            LEFT JOIN vehicles v ON veel.vehicle_id = v.id
            LEFT JOIN cameras c1 ON veel.entry_camera_id = c1.id
            LEFT JOIN cameras c2 ON veel.exit_camera_id = c2.id
            LEFT JOIN locations l1 ON veel.entry_location_id = l1.id
            LEFT JOIN locations l2 ON veel.exit_location_id = l2.id
            ${whereClause}
            ORDER BY veel.entry_time DESC
            LIMIT ${limit} OFFSET ${offset}
        `, queryParams);

        res.status(200).json({
            success: true,
            data: {
                entry_exit_logs: logs,
                pagination: {
                    current_page: page,
                    total_pages: totalPages,
                    total_records: totalRecords,
                    limit: limit
                },
                filters: {
                    status: status,
                    date_from: dateFrom,
                    date_to: dateTo
                }
            }
        });

    } catch (error) {
        console.error('Error getting location entry/exit logs:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy nhật ký ra vào',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get all active locations for dropdown (simplified version)
 */
const getAllActiveLocations = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const zoneType = req.query.zone_type || '';
        
        // Build WHERE clause
        let whereConditions = ['is_active = 1'];
        let queryParams = [];

        if (search) {
            whereConditions.push('(name LIKE ? OR code LIKE ? OR address LIKE ?)');
            queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (zoneType) {
            whereConditions.push('zone_type = ?');
            queryParams.push(zoneType);
        }

        const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

        // Get total count
        const [countResult] = await connection.execute(`
            SELECT COUNT(*) as total
            FROM locations 
            ${whereClause}
        `, queryParams);

        const totalRecords = countResult[0].total;
        const totalPages = Math.ceil(totalRecords / limit);

        // Get paginated data
        const [locations] = await connection.execute(`
            SELECT 
                id,
                name,
                code,
                zone_type,
                address,
                is_restricted,
                parent_location_id
            FROM locations 
            ${whereClause}
            ORDER BY name ASC
            LIMIT ${limit} OFFSET ${offset}
        `, queryParams);

        res.status(200).json({
            success: true,
            message: 'Lấy danh sách khu vực thành công',
            data: {
                locations: locations,
                pagination: {
                    current_page: page,
                    total_pages: totalPages,
                    total_records: totalRecords,
                    limit: limit,
                    has_next: page < totalPages,
                    has_prev: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Error getting all active locations:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách khu vực',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = { 
    getAllLocations,
    getLocationById,
    getLocationStatistics, 
    getLocationDetailedView,
    getLocationHierarchy,
    getLocationPerformance,
    getLocationsByZoneType,
    searchLocations,
    getLocationDashboard,
    getLocationAlerts,
    getLocationEntryExitLogs,
    getAllActiveLocations
};