const db = require('../../db');

// Utility function to validate and sanitize parameters
const validateQueryParams = (params) => {
    return params.map(param => {
        if (param === undefined || param === null) {
            return null;
        }
        if (typeof param === 'string') {
            return param.trim() || null;
        }
        if (typeof param === 'number') {
            return isNaN(param) ? null : param;
        }
        return param;
    }).filter(param => param !== null && param !== '');
};

// Utility function to build dynamic WHERE clause
const buildWhereClause = (conditions, params) => {
    const validConditions = [];
    const validParams = [];
    
    conditions.forEach((condition, index) => {
        if (params[index] !== undefined && params[index] !== null && params[index] !== '') {
            validConditions.push(condition);
            validParams.push(params[index]);
        }
    });
    
    return {
        whereClause: validConditions.length > 0 ? 'WHERE ' + validConditions.join(' AND ') : '',
        params: validParams
    };
};

const getLocationById = async (req, res) => {
    let connection;
    
    try {
        connection = await db.promise();
        const locationId = req.params.id;

        // Validate locationId
        if (!locationId || isNaN(parseInt(locationId))) {
            return res.status(400).json({
                success: false,
                message: 'ID vị trí không hợp lệ'
            });
        }

        const [locations] = await connection.execute(`
            SELECT 
                l.*,
                pl.name as parent_location_name,
                pl.zone_type as parent_zone_type,
                COUNT(DISTINCT c.id) as camera_count,
                COUNT(DISTINCT CASE WHEN c.status = 'online' THEN c.id END) as online_camera_count,
                COUNT(DISTINCT CASE WHEN c.status = 'offline' THEN c.id END) as offline_camera_count,
                COUNT(DISTINCT CASE WHEN c.status = 'maintenance' THEN c.id END) as maintenance_camera_count
            FROM locations l
            LEFT JOIN locations pl ON l.parent_location_id = pl.id
            LEFT JOIN cameras c ON (l.id = c.location_id OR l.id = c.monitoring_location_id) AND c.is_active = 1
            WHERE l.id = ? AND l.is_active = 1
            GROUP BY l.id
        `, [parseInt(locationId)]);

        if (locations.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy vị trí'
            });
        }

        // Get child locations
        const [childLocations] = await connection.execute(`
            SELECT id, name, zone_type, address, latitude, longitude
            FROM locations 
            WHERE parent_location_id = ? AND is_active = 1
            ORDER BY name
        `, [parseInt(locationId)]);

        // Get recent activity (last 24 hours)
        const [recentActivity] = await connection.execute(`
            SELECT 
                COUNT(DISTINCT lpd.id) as total_detections_24h,
                COUNT(DISTINCT lpd.plate_number) as unique_plates_24h,
                AVG(lpd.confidence) as avg_confidence_24h,
                MAX(lpd.detection_time) as last_detection_time
            FROM license_plate_detections lpd
            JOIN cameras c ON lpd.camera_id = c.id
            WHERE (c.location_id = ? OR c.monitoring_location_id = ?)
            AND lpd.detection_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        `, [parseInt(locationId), parseInt(locationId)]);

        const location = {
            ...locations[0],
            child_locations: childLocations,
            recent_activity: recentActivity[0] || {
                total_detections_24h: 0,
                unique_plates_24h: 0,
                avg_confidence_24h: null,
                last_detection_time: null
            }
        };

        // Log access
        try {
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'VIEW', 'LOCATION', ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user?.userId || null,
                    req.user?.username || 'Anonymous',
                    parseInt(locationId),
                    req.ip || '127.0.0.1',
                    req.get('User-Agent') || 'Unknown'
                ]
            );
        } catch (logError) {
            console.error('Error logging access:', logError);
            // Continue without failing
        }

        res.status(200).json({
            success: true,
            data: {
                location: location
            }
        });

    } catch (error) {
        console.error('Error getting location:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin vị trí',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getAllLocations = async (req, res) => {
    let connection;
    
    try {
        connection = await db.promise();
        
        const {
            page = 1,
            limit = 20,
            sort = 'created_at',
            order = 'DESC',
            zone_type,
            parent_location_id,
            search
        } = req.query;

        // Validate and sanitize pagination parameters
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
        const offsetNum = (pageNum - 1) * limitNum;
        
        // Validate sort parameters
        const allowedSortFields = ['id', 'name', 'zone_type', 'created_at', 'updated_at'];
        const sortField = allowedSortFields.includes(sort) ? sort : 'created_at';
        const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // Build dynamic WHERE conditions with better validation
        let whereConditions = ['l.is_active = 1']; // Direct value instead of parameter
        let queryParams = [];

        if (zone_type && zone_type.trim()) {
            whereConditions.push('l.zone_type = ?');
            queryParams.push(zone_type.trim());
        }

        if (parent_location_id && parent_location_id.trim()) {
            if (parent_location_id.trim() === 'null') {
                whereConditions.push('l.parent_location_id IS NULL');
            } else {
                const parentId = parseInt(parent_location_id.trim());
                if (!isNaN(parentId)) {
                    whereConditions.push('l.parent_location_id = ?');
                    queryParams.push(parentId);
                }
            }
        }

        if (search && search.trim()) {
            whereConditions.push('(l.name LIKE ? OR l.address LIKE ?)');
            const searchTerm = `%${search.trim()}%`;
            queryParams.push(searchTerm, searchTerm);
        }

        const whereClause = whereConditions.join(' AND ');

        console.log('Debug - WHERE conditions:', whereConditions);
        console.log('Debug - Query params:', queryParams);

        // Get total count with simplified query
        const countQuery = `
            SELECT COUNT(DISTINCT l.id) as total 
            FROM locations l 
            LEFT JOIN locations pl ON l.parent_location_id = pl.id
            WHERE ${whereClause}
        `;
        
        const [countResult] = await connection.execute(countQuery, validateQueryParams(queryParams));
        const total = countResult[0].total;

        // Main query with string interpolation for LIMIT/OFFSET (safe since validated as numbers)
        const mainQuery = `
            SELECT 
                l.*,
                pl.name as parent_location_name,
                COUNT(DISTINCT c.id) as camera_count,
                COUNT(DISTINCT CASE WHEN c.status = 'online' THEN c.id END) as online_camera_count
            FROM locations l
            LEFT JOIN locations pl ON l.parent_location_id = pl.id
            LEFT JOIN cameras c ON (l.id = c.location_id OR l.id = c.monitoring_location_id) AND c.is_active = 1
            WHERE ${whereClause}
            GROUP BY l.id, l.name, l.zone_type, l.address, l.latitude, l.longitude, 
                     l.parent_location_id, l.is_active, l.created_at, l.updated_at, 
                     pl.name
            ORDER BY l.${sortField} ${sortOrder}
            LIMIT ${limitNum} OFFSET ${offsetNum}
        `;

        // Only use WHERE clause parameters (no LIMIT/OFFSET in params)
        const finalParams = validateQueryParams(queryParams);
        
        console.log('Debug - Final query:', mainQuery);
        console.log('Debug - Final params:', finalParams);

        const [locations] = await connection.execute(mainQuery, finalParams);

        // Get detection counts for locations with cameras (optimized)
        const locationIds = locations
            .filter(loc => loc.camera_count > 0)
            .map(loc => loc.id);
        
        let detectionCounts = {};
        
        if (locationIds.length > 0) {
            const placeholders = locationIds.map(() => '?').join(',');
            const detectionQuery = `
                SELECT 
                    COALESCE(c.location_id, c.monitoring_location_id) as location_id,
                    COUNT(lpd.id) as count 
                FROM license_plate_detections lpd
                JOIN cameras c ON lpd.camera_id = c.id
                WHERE (c.location_id IN (${placeholders}) OR c.monitoring_location_id IN (${placeholders}))
                AND lpd.detection_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
                GROUP BY COALESCE(c.location_id, c.monitoring_location_id)
            `;
            
            try {
                const detectionParams = [...locationIds, ...locationIds];
                const [detections] = await connection.execute(detectionQuery, detectionParams);
                detections.forEach(detection => {
                    detectionCounts[detection.location_id] = detection.count;
                });
            } catch (detectionError) {
                console.error('Error getting detection counts:', detectionError);
                // Continue without detection counts
            }
        }

        // Add detection counts to locations
        const locationsWithDetections = locations.map(location => ({
            ...location,
            detections_24h: detectionCounts[location.id] || 0
        }));

        // Log access
        try {
            await connection.execute(
                'INSERT INTO access_logs (user_id, username, action_type, object_type, status, ip_address, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
                [
                    req.user?.userId || null,
                    req.user?.username || 'Anonymous',
                    'VIEW',
                    'LOCATIONS',
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
                locations: locationsWithDetections,
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
        console.error('Error getting locations:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            errno: error.errno,
            sqlState: error.sqlState,
            sql: error.sql
        });
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách vị trí',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getLocationStatistics = async (req, res) => {
    let connection;
    
    try {
        connection = await db.promise();

        // Get overall statistics
        const [overallStats] = await connection.execute(`
            SELECT 
                COUNT(*) as total_locations,
                COUNT(CASE WHEN zone_type = 'entry' THEN 1 END) as entry_locations,
                COUNT(CASE WHEN zone_type = 'exit' THEN 1 END) as exit_locations,
                COUNT(CASE WHEN zone_type = 'parking' THEN 1 END) as parking_locations,
                COUNT(CASE WHEN zone_type = 'monitoring' THEN 1 END) as monitoring_locations,
                COUNT(CASE WHEN parent_location_id IS NULL THEN 1 END) as parent_locations,
                COUNT(CASE WHEN parent_location_id IS NOT NULL THEN 1 END) as child_locations
            FROM locations 
            WHERE is_active = ?
        `, [1]);

        // Get location hierarchy
        const [hierarchyStats] = await connection.execute(`
            SELECT 
                l.id,
                l.name as location_name,
                l.zone_type,
                COUNT(DISTINCT cl.id) as children_count,
                COUNT(DISTINCT c.id) as camera_count,
                COUNT(DISTINCT CASE WHEN c.status = 'online' THEN c.id END) as online_cameras
            FROM locations l
            LEFT JOIN locations cl ON l.id = cl.parent_location_id AND cl.is_active = 1
            LEFT JOIN cameras c ON (l.id = c.location_id OR l.id = c.monitoring_location_id) AND c.is_active = 1
            WHERE l.is_active = ? AND l.parent_location_id IS NULL
            GROUP BY l.id, l.name, l.zone_type
            ORDER BY camera_count DESC
        `, [1]);

        // Get detection statistics by location (last 7 days)
        const [detectionStats] = await connection.execute(`
            SELECT 
                l.id,
                l.name,
                l.zone_type,
                COUNT(DISTINCT lpd.id) as detections_7d,
                COUNT(DISTINCT lpd.plate_number) as unique_plates_7d,
                AVG(lpd.confidence) as avg_confidence_7d
            FROM locations l
            LEFT JOIN cameras c ON (l.id = c.location_id OR l.id = c.monitoring_location_id) AND c.is_active = 1
            LEFT JOIN license_plate_detections lpd ON c.id = lpd.camera_id 
                AND lpd.detection_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            WHERE l.is_active = ?
            GROUP BY l.id, l.name, l.zone_type
            HAVING detections_7d > 0
            ORDER BY detections_7d DESC
            LIMIT 10
        `, [1]);

        res.status(200).json({
            success: true,
            data: {
                overall: overallStats[0],
                hierarchy: hierarchyStats,
                top_detection_locations: detectionStats
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

const getLocationsByZoneType = async (req, res) => {
    let connection;
    
    try {
        connection = await db.promise();
        const { zone_type } = req.params;

        // Validate zone_type
        const validZoneTypes = ['entry', 'exit', 'parking', 'monitoring'];
        if (!validZoneTypes.includes(zone_type)) {
            return res.status(400).json({
                success: false,
                message: 'Loại khu vực không hợp lệ'
            });
        }

        const [locations] = await connection.execute(`
            SELECT 
                l.*,
                pl.name as parent_location_name,
                COUNT(DISTINCT c.id) as camera_count,
                COUNT(DISTINCT CASE WHEN c.status = 'online' THEN c.id END) as online_camera_count
            FROM locations l
            LEFT JOIN locations pl ON l.parent_location_id = pl.id
            LEFT JOIN cameras c ON (l.id = c.location_id OR l.id = c.monitoring_location_id) AND c.is_active = 1
            WHERE l.zone_type = ? AND l.is_active = 1
            GROUP BY l.id
            ORDER BY l.name
        `, [zone_type]);

        res.status(200).json({
            success: true,
            data: {
                zone_type: zone_type,
                locations: locations
            }
        });

    } catch (error) {
        console.error('Error getting locations by zone type:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy vị trí theo loại khu vực',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = { 
    getLocationById, 
    getAllLocations, 
    getLocationStatistics,
    getLocationsByZoneType
};