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

        // Log access (simplified without username)
        try {
            await connection.execute(
                `INSERT INTO access_logs (user_id, action_type, object_type, object_id, status, ip_address, user_agent, created_at)
                 VALUES (?, 'VIEW', 'PERMISSION', ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user?.userId || null,
                    id,
                    req.ip || '127.0.0.1',
                    (req.get('User-Agent') || '').substring(0, 255)
                ]
            );
        } catch (logError) {
            console.warn('Failed to log access:', logError.message);
        }

        res.status(200).json({
            success: true,
            message: 'Lấy thông tin quyền thành công',
            data: {
                permission
            }
        });

    } catch (error) {
        console.error('Error getting permission by ID:', error);
        
        // Log failed access (simplified)
        try {
            await connection.execute(
                `INSERT INTO access_logs (user_id, action_type, object_type, object_id, status, failure_reason, ip_address, user_agent, created_at)
                 VALUES (?, 'VIEW', 'PERMISSION', ?, 'FAILURE', ?, ?, ?, NOW())`,
                [
                    req.user?.userId || null,
                    req.params.id || null,
                    (error.message || 'Unknown error').substring(0, 255),
                    req.ip || '127.0.0.1',
                    (req.get('User-Agent') || '').substring(0, 255)
                ]
            );
        } catch (logError) {
            console.warn('Failed to log failed access:', logError.message);
        }

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
            module: rawModule,
            action: rawAction,
            search: rawSearch,
            isActive = 'all',
            sortBy = 'module',
            sortOrder = 'asc'
        } = req.query;

        const parsedPage = parseInt(page) || 1;
        const parsedPerPage = Math.min(parseInt(perPage) || 10, 100);
        const offset = (parsedPage - 1) * parsedPerPage;

        // Clean and validate input parameters
        const module = (rawModule && rawModule.trim() !== '') ? rawModule.trim() : null;
        const action = (rawAction && rawAction.trim() !== '') ? rawAction.trim() : null;
        const search = (rawSearch && rawSearch.trim() !== '') ? rawSearch.trim() : null;

        let whereConditions = [];
        let queryParams = [];

        // Build where conditions
        if (module !== null) {
            whereConditions.push('p.module = ?');
            queryParams.push(module);
        }

        if (action !== null) {
            whereConditions.push('p.action = ?');
            queryParams.push(action);
        }

        if (search !== null) {
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
        const totalPages = Math.ceil(totalPermissions / parsedPerPage);

        // Build the main query without dynamic ORDER BY to avoid SQL injection
        let mainQuery = `SELECT 
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
            GROUP BY p.id, p.module, p.action, p.code, p.description, p.is_active, p.created_at, p.updated_at`;

        // Add ORDER BY clause safely
        if (validSortBy === 'module') {
            mainQuery += validSortOrder === 'desc' ? ' ORDER BY p.module DESC' : ' ORDER BY p.module ASC';
        } else if (validSortBy === 'action') {
            mainQuery += validSortOrder === 'desc' ? ' ORDER BY p.action DESC' : ' ORDER BY p.action ASC';
        } else if (validSortBy === 'code') {
            mainQuery += validSortOrder === 'desc' ? ' ORDER BY p.code DESC' : ' ORDER BY p.code ASC';
        } else if (validSortBy === 'created_at') {
            mainQuery += validSortOrder === 'desc' ? ' ORDER BY p.created_at DESC' : ' ORDER BY p.created_at ASC';
        } else if (validSortBy === 'updated_at') {
            mainQuery += validSortOrder === 'desc' ? ' ORDER BY p.updated_at DESC' : ' ORDER BY p.updated_at ASC';
        } else {
            mainQuery += ' ORDER BY p.module ASC';
        }

        // Add LIMIT and OFFSET
        mainQuery += ' LIMIT ? OFFSET ?';

        // Prepare parameters for the main query
        const mainQueryParams = [...queryParams, parsedPerPage, offset];

        console.log('Main Query:', mainQuery);
        console.log('Query Params:', mainQueryParams);
        console.log('Params length:', mainQueryParams.length);
        console.log('parsedPerPage:', parsedPerPage, 'typeof:', typeof parsedPerPage);
        console.log('offset:', offset, 'typeof:', typeof offset);

        // Alternative approach: use connection.query instead of execute
        let permissions;
        try {
            [permissions] = await connection.query(mainQuery, mainQueryParams);
        } catch (queryError) {
            console.log('Query failed, trying alternative approach...');
            
            // Try with string concatenation as fallback
            const fallbackQuery = `SELECT 
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
            GROUP BY p.id, p.module, p.action, p.code, p.description, p.is_active, p.created_at, p.updated_at
            ORDER BY p.module ASC
            LIMIT ${parsedPerPage} OFFSET ${offset}`;
            
            [permissions] = await connection.query(fallbackQuery, queryParams);
        }

        // Get available modules and actions for filters
        const [modulesList] = await connection.execute(
            'SELECT DISTINCT module FROM permissions WHERE module IS NOT NULL ORDER BY module'
        );

        const [actionsList] = await connection.execute(
            'SELECT DISTINCT action FROM permissions WHERE action IS NOT NULL ORDER BY action'
        );

        // Simplified logging without username
        try {
            await connection.execute(
                `INSERT INTO access_logs (user_id, action_type, object_type, status, ip_address, user_agent, created_at)
                 VALUES (?, 'VIEW', 'PERMISSION', 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user?.userId || null,
                    req.ip || '127.0.0.1',
                    (req.get('User-Agent') || '').substring(0, 255)
                ]
            );
        } catch (logError) {
            console.warn('Failed to log access:', logError.message);
        }

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
                    page: parsedPage,
                    perPage: parsedPerPage,
                    totalPages,
                    totalPermissions,
                    hasNextPage: parsedPage < totalPages,
                    hasPrevPage: parsedPage > 1
                },
                sorting: {
                    sortBy: validSortBy,
                    sortOrder: validSortOrder
                }
            }
        });

    } catch (error) {
        console.error('Error getting permissions:', error);
        
        // Simplified error logging
        try {
            await connection.execute(
                `INSERT INTO access_logs (user_id, action_type, object_type, status, failure_reason, ip_address, user_agent, created_at)
                 VALUES (?, 'VIEW', 'PERMISSION', 'FAILURE', ?, ?, ?, NOW())`,
                [
                    req.user?.userId || null,
                    (error.message || 'Unknown error').substring(0, 255),
                    req.ip || '127.0.0.1',
                    (req.get('User-Agent') || '').substring(0, 255)
                ]
            );
        } catch (logError) {
            console.warn('Failed to log error:', logError.message);
        }

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