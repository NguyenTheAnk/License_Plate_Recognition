
// searchLocation.js
const db = require('../../db');

const searchLocations = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { 
            q: searchQuery,
            zone_type,
            is_restricted,
            has_cameras,
            page = 1,
            limit = 10
        } = req.query;

        if (!searchQuery) {
            return res.status(400).json({
                success: false,
                message: 'Từ khóa tìm kiếm là bắt buộc'
            });
        }

        const offset = (page - 1) * limit;
        let whereClause = 'WHERE l.is_active = 1 AND (l.name LIKE ? OR l.code LIKE ? OR l.address LIKE ?)';
        let queryParams = [`%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`];

        if (zone_type) {
            whereClause += ' AND l.zone_type = ?';
            queryParams.push(zone_type);
        }

        if (is_restricted !== undefined) {
            whereClause += ' AND l.is_restricted = ?';
            queryParams.push(is_restricted);
        }

        if (has_cameras !== undefined) {
            if (has_cameras === 'true') {
                whereClause += ' AND EXISTS (SELECT 1 FROM cameras c WHERE (c.location_id = l.id OR c. = l.id) AND c.is_active = 1)';
            } else {
                whereClause += ' AND NOT EXISTS (SELECT 1 FROM cameras c WHERE (c.location_id = l.id OR c. = l.id) AND c.is_active = 1)';
            }
        }

        // Get total count
        const [countResult] = await connection.execute(`
            SELECT COUNT(DISTINCT l.id) as total 
            FROM locations l 
            ${whereClause}
        `, queryParams);

        // Get search results
        const [locations] = await connection.execute(`
            SELECT 
                l.*,
                pl.name as parent_location_name,
                COUNT(c.id) as camera_count,
                COUNT(CASE WHEN c.status = 'online' THEN 1 END) as online_camera_count
            FROM locations l
            LEFT JOIN locations pl ON l.parent_location_id = pl.id
            LEFT JOIN cameras c ON l.id = c.location_id OR l.id = c.            ${whereClause}
            GROUP BY l.id
            ORDER BY l.name ASC
            LIMIT ? OFFSET ?
        `, [...queryParams, parseInt(limit), parseInt(offset)]);

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, request_data, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'SEARCH', 'LOCATIONS', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                JSON.stringify(req.query),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            data: {
                locations: locations,
                pagination: {
                    current_page: parseInt(page),
                    total_pages: Math.ceil(countResult[0].total / limit),
                    total_items: countResult[0].total,
                    items_per_page: parseInt(limit)
                },
                search_query: searchQuery
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

const searchLocationsByCriteria = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const {
            name,
            code,
            zone_type,
            is_restricted,
            parent_location_id,
            has_coordinates,
            entry_exit_pair_id,
            page = 1,
            limit = 10,
            sort_by = 'name',
            sort_order = 'ASC'
        } = req.body;

        const offset = (page - 1) * limit;
        let whereClause = 'WHERE l.is_active = 1';
        let queryParams = [];

        if (name) {
            whereClause += ' AND l.name LIKE ?';
            queryParams.push(`%${name}%`);
        }

        if (code) {
            whereClause += ' AND l.code LIKE ?';
            queryParams.push(`%${code}%`);
        }

        if (zone_type) {
            whereClause += ' AND l.zone_type = ?';
            queryParams.push(zone_type);
        }

        if (is_restricted !== undefined) {
            whereClause += ' AND l.is_restricted = ?';
            queryParams.push(is_restricted);
        }

        if (parent_location_id !== undefined) {
            if (parent_location_id === null) {
                whereClause += ' AND l.parent_location_id IS NULL';
            } else {
                whereClause += ' AND l.parent_location_id = ?';
                queryParams.push(parent_location_id);
            }
        }

        if (has_coordinates !== undefined) {
            if (has_coordinates) {
                whereClause += ' AND l.latitude IS NOT NULL AND l.longitude IS NOT NULL';
            } else {
                whereClause += ' AND (l.latitude IS NULL OR l.longitude IS NULL)';
            }
        }

        if (entry_exit_pair_id !== undefined) {
            if (entry_exit_pair_id === null) {
                whereClause += ' AND l.entry_exit_pair_id IS NULL';
            } else {
                whereClause += ' AND l.entry_exit_pair_id = ?';
                queryParams.push(entry_exit_pair_id);
            }
        }

        // Get total count
        const [countResult] = await connection.execute(`
            SELECT COUNT(DISTINCT l.id) as total 
            FROM locations l 
            ${whereClause}
        `, queryParams);

        // Get results
        const [locations] = await connection.execute(`
            SELECT 
                l.*,
                pl.name as parent_location_name,
                COUNT(c.id) as camera_count,
                COUNT(CASE WHEN c.status = 'online' THEN 1 END) as online_camera_count
            FROM locations l
            LEFT JOIN locations pl ON l.parent_location_id = pl.id
            LEFT JOIN cameras c ON l.id = c.location_id OR l.id = c.            ${whereClause}
            GROUP BY l.id
            ORDER BY l.${sort_by} ${sort_order}
            LIMIT ? OFFSET ?
        `, [...queryParams, parseInt(limit), parseInt(offset)]);

        res.status(200).json({
            success: true,
            data: {
                locations: locations,
                pagination: {
                    current_page: parseInt(page),
                    total_pages: Math.ceil(countResult[0].total / limit),
                    total_items: countResult[0].total,
                    items_per_page: parseInt(limit)
                },
                criteria: req.body
            }
        });

    } catch (error) {
        console.error('Error searching locations by criteria:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tìm kiếm vị trí theo tiêu chí',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getLocationsByZoneType = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { zoneType } = req.params;
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const validZoneTypes = ['entrance', 'exit', 'checkpoint', 'parking', 'restricted', 'entry_point', 'exit_point', 'monitoring_zone'];
        
        if (!validZoneTypes.includes(zoneType)) {
            return res.status(400).json({
                success: false,
                message: 'Loại khu vực không hợp lệ'
            });
        }

        // Get total count
        const [countResult] = await connection.execute(
            'SELECT COUNT(*) as total FROM locations WHERE zone_type = ? AND is_active = 1',
            [zoneType]
        );

        // Get locations
        const [locations] = await connection.execute(`
            SELECT 
                l.*,
                pl.name as parent_location_name,
                COUNT(c.id) as camera_count,
                COUNT(CASE WHEN c.status = 'online' THEN 1 END) as online_camera_count
            FROM locations l
            LEFT JOIN locations pl ON l.parent_location_id = pl.id
            LEFT JOIN cameras c ON l.id = c.location_id OR l.id = c.            WHERE l.zone_type = ? AND l.is_active = 1
            GROUP BY l.id
            ORDER BY l.name ASC
            LIMIT ? OFFSET ?
        `, [zoneType, parseInt(limit), parseInt(offset)]);

        res.status(200).json({
            success: true,
            data: {
                locations: locations,
                pagination: {
                    current_page: parseInt(page),
                    total_pages: Math.ceil(countResult[0].total / limit),
                    total_items: countResult[0].total,
                    items_per_page: parseInt(limit)
                },
                zone_type: zoneType
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

module.exports = { searchLocations, searchLocationsByCriteria, getLocationsByZoneType };