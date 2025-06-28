const db = require('../../db');

const getPermissionById = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;

        // Validate ID
        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({
                success: false,
                message: 'ID quyền không hợp lệ'
            });
        }

        const [permissions] = await connection.execute(
            `SELECT 
                p.id,
                p.module,
                p.action,
                p.code,
                p.description,
                p.is_active,
                p.created_at,
                p.updated_at,
                JSON_ARRAYAGG(
                    CASE 
                        WHEN r.id IS NOT NULL THEN
                            JSON_OBJECT(
                                'id', r.id,
                                'name', r.name,
                                'description', r.description,
                                'level', r.level,
                                'granted', rp.granted,
                                'assigned_at', rp.created_at
                            )
                        ELSE NULL
                    END
                ) as roles
            FROM permissions p
            LEFT JOIN role_permissions rp ON p.id = rp.permission_id
            LEFT JOIN roles r ON rp.role_id = r.id AND r.is_active = 1
            WHERE p.id = ?
            GROUP BY p.id`,
            [id]
        );

        if (permissions.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy quyền với ID đã cho'
            });
        }

        // Clean up roles array (remove null values)
        const permission = permissions[0];
        permission.roles = permission.roles.filter(role => role !== null);

        // Get usage statistics
        const [usageStats] = await connection.execute(
            `SELECT 
                COUNT(DISTINCT rp.role_id) as total_roles,
                COUNT(DISTINCT CASE WHEN rp.granted = 1 THEN rp.role_id END) as granted_roles,
                COUNT(DISTINCT CASE WHEN rp.granted = 0 THEN rp.role_id END) as denied_roles,
                COUNT(DISTINCT ur.user_id) as affected_users
            FROM permissions p
            LEFT JOIN role_permissions rp ON p.id = rp.permission_id
            LEFT JOIN user_roles ur ON rp.role_id = ur.role_id AND ur.is_active = 1
            WHERE p.id = ?`,
            [id]
        );

        permission.usage_stats = usageStats[0];

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'VIEW', 'PERMISSION', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                id,
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Lấy thông tin quyền thành công',
            data: {
                permission
            }
        });

    } catch (error) {
        console.error('Error getting permission by ID:', error);
        
        // Log failed access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, status, failure_reason, ip_address, user_agent, created_at)
             VALUES (?, ?, 'VIEW', 'PERMISSION', ?, 'FAILURE', ?, ?, ?, NOW())`,
            [
                req.user?.userId,
                req.user?.username,
                req.params.id,
                error.message,
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin quyền',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getAllPermissions = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const {
            page = 1,
            perPage = 10,
            module,
            action,
            search,
            isActive = 'all',
            sortBy = 'module',
            sortOrder = 'asc'
        } = req.query;

        const offset = (parseInt(page) - 1) * parseInt(perPage);
        let whereConditions = [];
        let queryParams = [];

        // Build where conditions
        if (module) {
            whereConditions.push('p.module = ?');
            queryParams.push(module);
        }

        if (action) {
            whereConditions.push('p.action = ?');
            queryParams.push(action);
        }

        if (search) {
            whereConditions.push('(p.code LIKE ? OR p.description LIKE ? OR p.module LIKE ? OR p.action LIKE ?)');
            const searchTerm = `%${search}%`;
            queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        if (isActive !== 'all') {
            whereConditions.push('p.is_active = ?');
            queryParams.push(isActive === 'true' ? 1 : 0);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Validate sort parameters
        const allowedSortFields = ['module', 'action', 'code', 'created_at', 'updated_at'];
        const allowedSortOrders = ['asc', 'desc'];
        const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'module';
        const validSortOrder = allowedSortOrders.includes(sortOrder.toLowerCase()) ? sortOrder.toLowerCase() : 'asc';

        // Get total count
        const [countResult] = await connection.execute(
            `SELECT COUNT(*) as total FROM permissions p ${whereClause}`,
            queryParams
        );
        const totalPermissions = countResult[0].total;
        const totalPages = Math.ceil(totalPermissions / parseInt(perPage));

        // Build the main query with string concatenation for ORDER BY (cannot use placeholders for column names)
        const mainQuery = `SELECT 
                p.id,
                p.module,
                p.action,
                p.code,
                p.description,
                p.is_active,
                p.created_at,
                p.updated_at,
                COUNT(DISTINCT CASE WHEN rp.granted = 1 THEN rp.role_id END) as granted_roles_count,
                COUNT(DISTINCT CASE WHEN rp.granted = 0 THEN rp.role_id END) as denied_roles_count,
                COUNT(DISTINCT ur.user_id) as affected_users_count
            FROM permissions p
            LEFT JOIN role_permissions rp ON p.id = rp.permission_id
            LEFT JOIN user_roles ur ON rp.role_id = ur.role_id AND ur.is_active = 1
            ${whereClause}
            GROUP BY p.id
            ORDER BY p.${validSortBy} ${validSortOrder}
            LIMIT ? OFFSET ?`;

        // Prepare parameters for the main query (includes pagination params)
        const limitValue = parseInt(perPage) || 10;
        const offsetValue = parseInt(offset) || 0;
        const mainQueryParams = [...queryParams, limitValue, offsetValue];

        // Debug logging
        console.log('Main Query:', mainQuery);
        console.log('Query Params:', mainQueryParams);
        console.log('Params count:', mainQueryParams.length);
        console.log('Limit:', limitValue, 'Offset:', offsetValue);

        // Get permissions with pagination using query() instead of execute() for dynamic ORDER BY
        const [permissions] = await connection.query(
            mainQuery,
            mainQueryParams
        );

        // Get available modules and actions for filters
        const [modulesList] = await connection.execute(
            'SELECT DISTINCT module FROM permissions WHERE is_active = 1 ORDER BY module'
        );

        const [actionsList] = await connection.execute(
            'SELECT DISTINCT action FROM permissions WHERE is_active = 1 ORDER BY action'
        );

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'VIEW', 'PERMISSION', 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Lấy danh sách quyền thành công',
            data: {
                permissions,
                filters: {
                    modules: modulesList.map(m => m.module),
                    actions: actionsList.map(a => a.action)
                },
                pagination: {
                    page: parseInt(page),
                    perPage: parseInt(perPage),
                    totalPages,
                    totalPermissions,
                    hasNextPage: parseInt(page) < totalPages,
                    hasPrevPage: parseInt(page) > 1
                },
                sorting: {
                    sortBy: validSortBy,
                    sortOrder: validSortOrder
                }
            }
        });

    } catch (error) {
        console.error('Error getting permissions:', error);
        
        // Log failed access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, status, failure_reason, ip_address, user_agent, created_at)
             VALUES (?, ?, 'VIEW', 'PERMISSION', 'FAILURE', ?, ?, ?, NOW())`,
            [
                req.user?.userId,
                req.user?.username,
                error.message,
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách quyền',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = { 
    getPermissionById, 
    getAllPermissions 
};