const db = require('../../db');

const searchRoles = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const {
            q = '',
            filters = {},
            page = 1,
            limit = 10,
            sort_by = 'relevance',
            sort_order = 'desc'
        } = req.query;

        // Parse filters if it's a string
        let parsedFilters = {};
        if (typeof filters === 'string') {
            try {
                parsedFilters = JSON.parse(filters);
            } catch (e) {
                parsedFilters = {};
            }
        } else {
            parsedFilters = filters;
        }

        const {
            is_active = null,
            level_min = null,
            level_max = null,
            has_permissions = null,
            has_users = null,
            parent_role_id = null,
            permission_codes = []
        } = parsedFilters;

        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        // Build search conditions
        let searchConditions = [];
        let searchParams = [];
        
        if (q.trim()) {
            searchConditions.push(`(
                r.name LIKE ? OR 
                r.description LIKE ? OR 
                pr.name LIKE ?
            )`);
            const searchTerm = `%${q.trim()}%`;
            searchParams.push(searchTerm, searchTerm, searchTerm);
        }

        // Build filter conditions
        let filterConditions = [];
        let filterParams = [];
        
        if (is_active !== null) {
            filterConditions.push('r.is_active = ?');
            filterParams.push(is_active === 'true' ? 1 : 0);
        }
        
        if (level_min !== null) {
            filterConditions.push('r.level >= ?');
            filterParams.push(parseInt(level_min));
        }
        
        if (level_max !== null) {
            filterConditions.push('r.level <= ?');
            filterParams.push(parseInt(level_max));
        }
        
        if (parent_role_id !== null) {
            if (parent_role_id === 'null') {
                filterConditions.push('r.parent_role_id IS NULL');
            } else {
                filterConditions.push('r.parent_role_id = ?');
                filterParams.push(parseInt(parent_role_id));
            }
        }

        // Permission-based filters
        let permissionJoins = '';
        if (permission_codes.length > 0) {
            permissionJoins = `
                JOIN role_permissions rp_search ON r.id = rp_search.role_id AND rp_search.granted = 1
                JOIN permissions p_search ON rp_search.permission_id = p_search.id AND p_search.is_active = 1
            `;
            filterConditions.push(`p_search.code IN (${permission_codes.map(() => '?').join(',')})`);
            filterParams.push(...permission_codes);
        }

        // Combine all conditions
        let allConditions = [...searchConditions, ...filterConditions];
        let allParams = [...searchParams, ...filterParams];
        const whereClause = allConditions.length > 0 ? `WHERE ${allConditions.join(' AND ')}` : '';

        // Build ORDER BY clause
        let orderByClause = '';
        if (q.trim() && sort_by === 'relevance') {
            orderByClause = `
                ORDER BY 
                    CASE 
                        WHEN r.name LIKE ? THEN 1
                        WHEN r.name LIKE ? THEN 2
                        WHEN r.description LIKE ? THEN 3
                        ELSE 4
                    END,
                    r.level DESC,
                    r.name
            `;
            const exactMatch = q.trim();
            const startsWith = `${q.trim()}%`;
            const contains = `%${q.trim()}%`;
            allParams.push(exactMatch, startsWith, contains);
        } else {
            const allowedSortFields = ['id', 'name', 'level', 'created_at', 'updated_at'];
            const validSortBy = allowedSortFields.includes(sort_by) ? sort_by : 'created_at';
            const validSortOrder = ['asc', 'desc'].includes(sort_order.toLowerCase()) ? sort_order.toUpperCase() : 'DESC';
            orderByClause = `ORDER BY r.` + validSortBy + ` ` + validSortOrder;
        }

        // Main search query
        const searchQuery = `
            SELECT 
                r.id,
                r.name,
                r.description,
                r.parent_role_id,
                pr.name as parent_role_name,
                r.is_default_role,
                r.level,
                r.is_active,
                r.created_at,
                r.updated_at,
                COUNT(DISTINCT ur.user_id) as users_count,
                COUNT(DISTINCT rp_count.permission_id) as permissions_count,
                GROUP_CONCAT(DISTINCT p_list.code ORDER BY p_list.code SEPARATOR ', ') as permission_codes
            FROM roles r
            LEFT JOIN roles pr ON r.parent_role_id = pr.id
            LEFT JOIN user_roles ur ON r.id = ur.role_id AND ur.is_active = 1
            LEFT JOIN role_permissions rp_count ON r.id = rp_count.role_id AND rp_count.granted = 1
            LEFT JOIN permissions p_list ON rp_count.permission_id = p_list.id AND p_list.is_active = 1
            ${permissionJoins}
            ${whereClause}
            GROUP BY r.id, r.name, r.description, r.parent_role_id, pr.name, r.is_default_role, r.level, r.is_active, r.created_at, r.updated_at
        `;

        // Apply additional filters after grouping
        let havingConditions = [];
        let havingParams = [];

        if (has_permissions !== null) {
            if (has_permissions === 'true') {
                havingConditions.push('permissions_count > 0');
            } else {
                havingConditions.push('permissions_count = 0');
            }
        }

        if (has_users !== null) {
            if (has_users === 'true') {
                havingConditions.push('users_count > 0');
            } else {
                havingConditions.push('users_count = 0');
            }
        }

        const havingClause = havingConditions.length > 0 ? `HAVING ${havingConditions.join(' AND ')}` : '';

        // Get total count
        const countQuery = `
            SELECT COUNT(*) as total FROM (
                ${searchQuery}
                ${havingClause}
            ) as counted_results
        `;

        const [countResult] = await connection.execute(countQuery, [...allParams, ...havingParams]);
        const total = countResult[0].total;

        // Get paginated results
        const finalQuery = `
            ${searchQuery}
            ${havingClause}
            ${orderByClause}
            LIMIT ? OFFSET ?
        `;

        const [roles] = await connection.execute(finalQuery, [...allParams, ...havingParams, parseInt(limit), offset]);

        // Add search highlights if there's a search query
        if (q.trim()) {
            roles.forEach(role => {
                const searchTerm = q.trim().toLowerCase();
                role.search_highlights = {
                    name: role.name.toLowerCase().includes(searchTerm),
                    description: role.description ? role.description.toLowerCase().includes(searchTerm) : false,
                    parent_role_name: role.parent_role_name ? role.parent_role_name.toLowerCase().includes(searchTerm) : false
                };
            });
        }

        // Log search access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, request_data, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'SEARCH', 'ROLE', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                JSON.stringify({ query: q, filters: parsedFilters, page, limit }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.json({
            success: true,
            message: 'Tìm kiếm vai trò thành công',
            data: {
                roles,
                search_info: {
                    query: q,
                    filters: parsedFilters,
                    total_results: total,
                    has_results: total > 0
                },
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total,
                    total_pages: Math.ceil(total / parseInt(limit)),
                    from: offset + 1,
                    to: Math.min(offset + parseInt(limit), total)
                }
            }
        });

    } catch (error) {
        console.error('Error searching roles:', error);
        
        // Log failed search
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, status, failure_reason, ip_address, user_agent, created_at)
             VALUES (?, ?, 'SEARCH', 'ROLE', 'FAILURE', ?, ?, ?, NOW())`,
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
            message: 'Lỗi khi tìm kiếm vai trò',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getRoleHierarchy = async (req, res) => {
    const connection = await db.promise();
    
    try {
        // Get all roles with their hierarchy information
        const [roles] = await connection.execute(`
            WITH RECURSIVE role_hierarchy AS (
                SELECT 
                    id, 
                    name, 
                    description,
                    parent_role_id, 
                    level,
                    is_active,
                    0 as depth,
                    CAST(name AS CHAR(1000)) as path
                FROM roles 
                WHERE parent_role_id IS NULL AND is_active = 1
                
                UNION ALL
                
                SELECT 
                    r.id, 
                    r.name, 
                    r.description,
                    r.parent_role_id, 
                    r.level,
                    r.is_active,
                    rh.depth + 1,
                    CONCAT(rh.path, ' > ', r.name)
                FROM roles r
                INNER JOIN role_hierarchy rh ON r.parent_role_id = rh.id
                WHERE r.is_active = 1 AND rh.depth < 10
            )
            SELECT 
                rh.*,
                COUNT(DISTINCT ur.user_id) as users_count,
                COUNT(DISTINCT rp.permission_id) as permissions_count
            FROM role_hierarchy rh
            LEFT JOIN user_roles ur ON rh.id = ur.role_id AND ur.is_active = 1
            LEFT JOIN role_permissions rp ON rh.id = rp.role_id AND rp.granted = 1
            GROUP BY rh.id, rh.name, rh.description, rh.parent_role_id, rh.level, rh.is_active, rh.depth, rh.path
            ORDER BY rh.path
        `);

        // Build tree structure
        const buildTree = (roles, parentId = null, depth = 0) => {
            return roles
                .filter(role => role.parent_role_id === parentId)
                .map(role => ({
                    ...role,
                    children: buildTree(roles, role.id, depth + 1)
                }));
        };

        const hierarchyTree = buildTree(roles.map(r => ({
            id: r.id,
            name: r.name,
            description: r.description,
            parent_role_id: r.parent_role_id,
            level: r.level,
            depth: r.depth,
            path: r.path,
            users_count: r.users_count,
            permissions_count: r.permissions_count,
            is_active: r.is_active
        })));

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'VIEW', 'ROLE_HIERARCHY', 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.json({
            success: true,
            message: 'Lấy cấu trúc phân cấp vai trò thành công',
            data: {
                hierarchy: hierarchyTree,
                flat_list: roles,
                total_roles: roles.length
            }
        });

    } catch (error) {
        console.error('Error getting role hierarchy:', error);
        
        // Log failed access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, status, failure_reason, ip_address, user_agent, created_at)
             VALUES (?, ?, 'VIEW', 'ROLE_HIERARCHY', 'FAILURE', ?, ?, ?, NOW())`,
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
            message: 'Lỗi khi lấy cấu trúc phân cấp vai trò',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = { searchRoles, getRoleHierarchy };