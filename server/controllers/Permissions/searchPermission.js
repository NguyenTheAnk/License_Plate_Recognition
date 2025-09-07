const db = require('../../db');

// Advanced search permissions
const searchPermissions = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const {
            query,
            modules,
            actions,
            isActive = 'all',
            sortBy = 'module',
            sortOrder = 'asc',
            page = 1,
            perPage = 20,
            includeUsageStats = 'false'
        } = req.query;

        const offset = (parseInt(page) - 1) * parseInt(perPage);
        let whereConditions = [];
        let queryParams = [];

        // Search in multiple fields
        if (query) {
            whereConditions.push(`(
                p.code LIKE ? OR 
                p.description LIKE ? OR 
                p.module LIKE ? OR 
                p.action LIKE ?
            )`);
            const searchTerm = `%${query}%`;
            queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        // Filter by modules
        if (modules) {
            const moduleList = modules.split(',').map(m => m.trim()).filter(m => m);
            if (moduleList.length > 0) {
                const modulePlaceholders = moduleList.map(() => '?').join(',');
                whereConditions.push(`p.module IN (${modulePlaceholders})`);
                queryParams.push(...moduleList);
            }
        }

        // Filter by actions
        if (actions) {
            const actionList = actions.split(',').map(a => a.trim()).filter(a => a);
            if (actionList.length > 0) {
                const actionPlaceholders = actionList.map(() => '?').join(',');
                whereConditions.push(`p.action IN (${actionPlaceholders})`);
                queryParams.push(...actionList);
            }
        }

        // Filter by active status
        if (isActive !== 'all') {
            whereConditions.push('p.is_active = ?');
            queryParams.push(isActive === 'true' ? 1 : 0);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Validate sort parameters
        const allowedSortFields = ['module', 'action', 'code', 'created_at', 'updated_at', 'usage_count'];
        const allowedSortOrders = ['asc', 'desc'];
        const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'module';
        const validSortOrder = allowedSortOrders.includes(sortOrder.toLowerCase()) ? sortOrder.toLowerCase() : 'asc';

        // Get total count
        const safeQueryParams = queryParams.map(v => v === undefined ? null : v);
        const [countResult] = await connection.execute(
            `SELECT COUNT(*) as total FROM permissions p ${whereClause}`,
            safeQueryParams
        );
        const totalPermissions = countResult[0].total;
        const totalPages = Math.ceil(totalPermissions / parseInt(perPage));

        // Build select query based on whether usage stats are needed
        let selectQuery;
        if (includeUsageStats === 'true') {
            selectQuery = 
                "SELECT " +
                    "p.id, " +
                    "p.module, " +
                    "p.action, " +
                    "p.code, " +
                    "p.description, " +
                    "p.is_active, " +
                    "p.created_at, " +
                    "p.updated_at, " +
                    "COUNT(DISTINCT CASE WHEN rp.granted = 1 THEN rp.role_id END) as granted_roles_count, " +
                    "COUNT(DISTINCT CASE WHEN rp.granted = 0 THEN rp.role_id END) as denied_roles_count, " +
                    "COUNT(DISTINCT ur.user_id) as affected_users_count, " +
                    "(COUNT(DISTINCT CASE WHEN rp.granted = 1 THEN rp.role_id END) + " +
                     "COUNT(DISTINCT CASE WHEN rp.granted = 0 THEN rp.role_id END)) as usage_count " +
                "FROM permissions p " +
                "LEFT JOIN role_permissions rp ON p.id = rp.permission_id " +
                "LEFT JOIN user_roles ur ON rp.role_id = ur.role_id AND ur.is_active = 1 " +
                whereClause + " " +
                "GROUP BY p.id " +
                "ORDER BY " + (validSortBy === 'usage_count' ? 'usage_count' : 'p.' + validSortBy) + " " + validSortOrder + " " +
                "LIMIT ? OFFSET ?";
        } else {
            selectQuery = 
                "SELECT " +
                    "p.id, " +
                    "p.module, " +
                    "p.action, " +
                    "p.code, " +
                    "p.description, " +
                    "p.is_active, " +
                    "p.created_at, " +
                    "p.updated_at " +
                "FROM permissions p " +
                whereClause + " " +
                "ORDER BY p." + validSortBy + " " + validSortOrder + " " +
                "LIMIT ? OFFSET ?";
        }

        // Get permissions with search and sorting
        const mainQueryParams = [...safeQueryParams, parseInt(perPage), offset].map(v => v === undefined ? null : v);
        const [permissions] = await connection.execute(
            selectQuery,
            mainQueryParams
        );

        // Get available filters
        const [modulesList] = await connection.execute(
            'SELECT DISTINCT module, COUNT(*) as count FROM permissions WHERE is_active = 1 GROUP BY module ORDER BY module'
        );

        const [actionsList] = await connection.execute(
            'SELECT DISTINCT action, COUNT(*) as count FROM permissions WHERE is_active = 1 GROUP BY action ORDER BY action'
        );

        // Get search statistics
        const [searchStats] = await connection.execute(`
            SELECT 
                COUNT(*) as total_found,
                COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_found,
                COUNT(CASE WHEN is_active = 0 THEN 1 END) as inactive_found,
                COUNT(DISTINCT module) as modules_found,
                COUNT(DISTINCT action) as actions_found
            FROM permissions p
            ${whereClause}
        `, safeQueryParams);

        // Log search access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, request_data, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'SEARCH', 'PERMISSION', ?, 'SUCCESS', ?, ?, NOW())`,
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
            message: 'Tìm kiếm quyền thành công',
            data: {
                permissions,
                searchStats: searchStats[0],
                filters: {
                    modules: modulesList,
                    actions: actionsList
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
        console.error('Error searching permissions:', error);
        
        // Log failed access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, request_data, status, failure_reason, ip_address, user_agent, created_at)
             VALUES (?, ?, 'SEARCH', 'PERMISSION', ?, 'FAILURE', ?, ?, ?, NOW())`,
            [
                req.user?.userId,
                req.user?.username,
                JSON.stringify(req.query),
                error.message,
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(500).json({
            success: false,
            message: 'Lỗi khi tìm kiếm quyền',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get permissions grouped by module
const getPermissionsByModule = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { 
            isActive = 'true',
            includeUsageStats = 'false',
            sortBy = 'module'
        } = req.query;

        let whereClause = '';
        const queryParams = [];

        if (isActive !== 'all') {
            whereClause = 'WHERE p.is_active = ?';
            queryParams.push(isActive === 'true' ? 1 : 0);
        }

        let selectFields = `
            p.id,
            p.action,
            p.code,
            p.description,
            p.is_active,
            p.created_at,
            p.updated_at
        `;

        let joinClause = '';

        if (includeUsageStats === 'true') {
            selectFields += `,
                COALESCE(rp_count.granted_roles_count, 0) as granted_roles_count,
                COALESCE(rp_count.denied_roles_count, 0) as denied_roles_count,
                COALESCE(rp_count.total_roles_count, 0) as total_roles_count,
                COALESCE(ur_count.affected_users_count, 0) as affected_users_count
            `;
            joinClause = `
                LEFT JOIN (
                    SELECT 
                        permission_id,
                        COUNT(DISTINCT CASE WHEN granted = 1 THEN role_id END) as granted_roles_count,
                        COUNT(DISTINCT CASE WHEN granted = 0 THEN role_id END) as denied_roles_count,
                        COUNT(DISTINCT role_id) as total_roles_count
                    FROM role_permissions 
                    GROUP BY permission_id
                ) rp_count ON p.id = rp_count.permission_id
                LEFT JOIN (
                    SELECT 
                        rp.permission_id,
                        COUNT(DISTINCT ur.user_id) as affected_users_count
                    FROM role_permissions rp
                    JOIN user_roles ur ON rp.role_id = ur.role_id AND ur.is_active = 1
                    WHERE rp.granted = 1
                    GROUP BY rp.permission_id
                ) ur_count ON p.id = ur_count.permission_id
            `;
        }

        const [permissions] = await connection.execute(
            "SELECT " +
                "p.module, " +
                "JSON_ARRAYAGG( " +
                    "JSON_OBJECT( " +
                        selectFields.split(',').map(field => {
                            const cleanField = field.trim();
                            const fieldName = cleanField.includes(' as ') 
                                ? cleanField.split(' as ')[1] 
                                : cleanField.split('.')[1] || cleanField;
                            return "'" + fieldName + "', " + cleanField;
                        }).join(', ') +
                    ") ORDER BY p.action " +
                ") as permissions, " +
                "COUNT(*) as total_permissions, " +
                "COUNT(CASE WHEN p.is_active = 1 THEN 1 END) as active_permissions, " +
                "COUNT(CASE WHEN p.is_active = 0 THEN 1 END) as inactive_permissions " +
            "FROM permissions p " +
            joinClause + " " +
            whereClause + " " +
            "GROUP BY p.module " +
            "ORDER BY " + (sortBy === 'count' ? 'COUNT(*) DESC' : 'p.module'),
            queryParams
        );

        // Get overall statistics
        const [overallStats] = await connection.execute(`
            SELECT 
                COUNT(*) as total_permissions,
                COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_permissions,
                COUNT(CASE WHEN is_active = 0 THEN 1 END) as inactive_permissions,
                COUNT(DISTINCT module) as total_modules,
                COUNT(DISTINCT action) as total_actions
            FROM permissions p
            ${whereClause}
        `, queryParams);

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'VIEW', 'PERMISSION_MODULE', 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Lấy quyền theo module thành công',
            data: {
                modules: permissions,
                overallStats: overallStats[0]
            }
        });

    } catch (error) {
        console.error('Error getting permissions by module:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy quyền theo module',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get permission suggestions for autocomplete
const getPermissionSuggestions = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { 
            query = '',
            type = 'all', // 'code', 'module', 'action', 'description', 'all'
            limit = 10
        } = req.query;

        if (!query || query.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Query phải có ít nhất 2 ký tự'
            });
        }

        const searchTerm = `%${query}%`;
        let suggestions = [];

        switch (type) {
            case 'code':
                const [codes] = await connection.execute(
                    `SELECT DISTINCT code as value, code as label, 'code' as type 
                     FROM permissions 
                     WHERE code LIKE ? AND is_active = 1 
                     ORDER BY code 
                     LIMIT ?`,
                    [searchTerm, parseInt(limit)]
                );
                suggestions = codes;
                break;

            case 'module':
                const [modules] = await connection.execute(
                    `SELECT DISTINCT module as value, module as label, 'module' as type 
                     FROM permissions 
                     WHERE module LIKE ? AND is_active = 1 
                     ORDER BY module 
                     LIMIT ?`,
                    [searchTerm, parseInt(limit)]
                );
                suggestions = modules;
                break;

            case 'action':
                const [actions] = await connection.execute(
                    `SELECT DISTINCT action as value, action as label, 'action' as type 
                     FROM permissions 
                     WHERE action LIKE ? AND is_active = 1 
                     ORDER BY action 
                     LIMIT ?`,
                    [searchTerm, parseInt(limit)]
                );
                suggestions = actions;
                break;

            case 'description':
                const [descriptions] = await connection.execute(
                    `SELECT DISTINCT description as value, CONCAT(code, ' - ', description) as label, 'description' as type 
                     FROM permissions 
                     WHERE description LIKE ? AND is_active = 1 
                     ORDER BY description 
                     LIMIT ?`,
                    [searchTerm, parseInt(limit)]
                );
                suggestions = descriptions;
                break;

            default:
                const [allSuggestions] = await connection.execute(
                    `SELECT code as value, CONCAT(code, ' - ', description) as label, 'code' as type 
                     FROM permissions 
                     WHERE (code LIKE ? OR description LIKE ? OR module LIKE ? OR action LIKE ?) 
                     AND is_active = 1 
                     ORDER BY 
                        CASE WHEN code LIKE ? THEN 1 ELSE 2 END,
                        code
                     LIMIT ?`,
                    [searchTerm, searchTerm, searchTerm, searchTerm, `${query}%`, parseInt(limit)]
                );
                suggestions = allSuggestions;
                break;
        }

        res.status(200).json({
            success: true,
            message: 'Lấy gợi ý thành công',
            data: {
                suggestions,
                query: query,
                type: type,
                count: suggestions.length
            }
        });

    } catch (error) {
        console.error('Error getting permission suggestions:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy gợi ý quyền',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    searchPermissions,
    getPermissionsByModule,
    getPermissionSuggestions
};