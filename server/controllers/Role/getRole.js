const db = require('../../db');

const getRoles = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            is_active = null,
            level_min = null,
            level_max = null,
            parent_role_id = null,
            sort_by = 'created_at',
            sort_order = 'desc'
        } = req.query;

        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        // Build WHERE conditions
        let whereConditions = [];
        let whereParams = [];
        
        if (search && search.trim() !== '') {
            whereConditions.push('(r.name LIKE ? OR r.description LIKE ?)');
            whereParams.push(`%${search.trim()}%`, `%${search.trim()}%`);
        }
        
        if (is_active !== null && is_active !== '') {
            whereConditions.push('r.is_active = ?');
            whereParams.push(is_active === 'true' ? 1 : 0);
        }
        
        if (level_min !== null && level_min !== '') {
            whereConditions.push('r.level >= ?');
            whereParams.push(parseInt(level_min));
        }
        
        if (level_max !== null && level_max !== '') {
            whereConditions.push('r.level <= ?');
            whereParams.push(parseInt(level_max));
        }
        
        if (parent_role_id !== null && parent_role_id !== '') {
            if (parent_role_id === 'null') {
                whereConditions.push('r.parent_role_id IS NULL');
            } else {
                whereConditions.push('r.parent_role_id = ?');
                whereParams.push(parseInt(parent_role_id));
            }
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
        
        // Validate sort fields
        const allowedSortFields = ['id', 'name', 'level', 'created_at', 'updated_at'];
        const validSortBy = allowedSortFields.includes(sort_by) ? sort_by : 'created_at';
        const validSortOrder = ['asc', 'desc'].includes(sort_order.toLowerCase()) ? sort_order.toUpperCase() : 'DESC';

        // Get total count
        const countQuery = `
            SELECT COUNT(DISTINCT r.id) as total
            FROM roles r
            LEFT JOIN roles pr ON r.parent_role_id = pr.id
            ${whereClause}
        `;
        
        console.log('Count Query:', countQuery);
        console.log('Count Params:', whereParams);
        
        const [countResult] = await connection.execute(countQuery, whereParams);
        const total = countResult[0].total;

        // Get roles with pagination - lấy danh sách permission_ids trước
        const rolesQuery = `
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
                COUNT(DISTINCT CASE WHEN rp.granted = 1 THEN rp.permission_id END) as permissions_count,
                GROUP_CONCAT(
                    DISTINCT CASE 
                        WHEN rp.granted = 1 THEN rp.permission_id
                        END 
                    SEPARATOR ','
                ) as permission_ids
            FROM roles r
            LEFT JOIN roles pr ON r.parent_role_id = pr.id
            LEFT JOIN user_roles ur ON r.id = ur.role_id AND ur.is_active = 1
            LEFT JOIN role_permissions rp ON r.id = rp.role_id
            ${whereClause}
            GROUP BY r.id, r.name, r.description, r.parent_role_id, pr.name, r.is_default_role, r.level, r.is_active, r.created_at, r.updated_at
            ORDER BY r.${validSortBy} ${validSortOrder}
            LIMIT ${parseInt(limit)} OFFSET ${offset}
        `;

        console.log('Roles Query:', rolesQuery);
        console.log('Where Params:', whereParams);
        
        const [rolesResult] = await connection.query(rolesQuery, whereParams);

        // Lấy chi tiết permissions cho tất cả roles cùng lúc để tối ưu
        let allPermissionIds = [];
        rolesResult.forEach(role => {
            if (role.permission_ids) {
                const ids = role.permission_ids.split(',').map(id => parseInt(id));
                allPermissionIds.push(...ids);
            }
        });

        // Loại bỏ duplicate permission IDs
        allPermissionIds = [...new Set(allPermissionIds)];

        // Lấy tất cả permissions cùng một lần
        let allPermissions = {};
        if (allPermissionIds.length > 0) {
            const placeholders = allPermissionIds.map(() => '?').join(',');
            const permissionsQuery = `
                SELECT id, module, action, code, description 
                FROM permissions 
                WHERE id IN (${placeholders})
            `;
            const [permissionsResult] = await connection.execute(permissionsQuery, allPermissionIds);
            
            // Tạo map để tra cứu nhanh
            permissionsResult.forEach(permission => {
                allPermissions[permission.id] = permission;
            });
        }

        // Map roles với permissions
        const roles = rolesResult.map(role => {
            let permissions = [];
            if (role.permission_ids) {
                const permissionIds = role.permission_ids.split(',').map(id => parseInt(id));
                permissions = permissionIds.map(id => allPermissions[id]).filter(Boolean);
            }
            
            return {
                ...role,
                permission_ids: undefined, // Remove raw string
                permissions: permissions || []
            };
        });

        // Log access
        try {
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'VIEW', 'ROLE', 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user?.userId || null,
                    req.user?.username || 'anonymous',
                    req.ip || 'unknown',
                    req.get('User-Agent') || 'unknown'
                ]
            );
        } catch (logError) {
            console.error('Error logging access:', logError);
            // Don't fail the main request due to logging error
        }

        res.json({
            success: true,
            message: 'Lấy danh sách vai trò thành công',
            data: {
                roles,
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
        console.error('Error getting roles:', error);
        
        // Log failed access
        try {
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, status, failure_reason, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'VIEW', 'ROLE', 'FAILURE', ?, ?, ?, NOW())`,
                [
                    req.user?.userId || null,
                    req.user?.username || 'anonymous',
                    error.message,
                    req.ip || 'unknown',
                    req.get('User-Agent') || 'unknown'
                ]
            );
        } catch (logError) {
            console.error('Error logging failed access:', logError);
        }

        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách vai trò',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getRoleById = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;

        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({
                success: false,
                message: 'ID vai trò không hợp lệ'
            });
        }

        // Get role with permissions and users
        const [roleData] = await connection.execute(`
            SELECT 
                r.id,
                r.name,
                r.description,
                r.parent_role_id,
                pr.name as parent_role_name,
                pr.description as parent_role_description,
                r.is_default_role,
                r.level,
                r.is_active,
                r.created_at,
                r.updated_at
            FROM roles r
            LEFT JOIN roles pr ON r.parent_role_id = pr.id
            WHERE r.id = ?
        `, [parseInt(id)]);

        if (roleData.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy vai trò'
            });
        }

        const role = roleData[0];

        // Get permissions for this role
        const [permissions] = await connection.execute(`
            SELECT 
                p.id,
                p.module,
                p.action,
                p.code,
                p.description,
                rp.granted,
                rp.created_at as assigned_at
            FROM role_permissions rp
            JOIN permissions p ON rp.permission_id = p.id
            WHERE rp.role_id = ? AND p.is_active = 1
            ORDER BY p.module, p.action
        `, [parseInt(id)]);

        // Get users with this role
        const [users] = await connection.execute(`
            SELECT 
                u.id,
                u.name,
                u.username,
                u.email,
                u.status,
                ur.assigned_at,
                ur.is_active as role_active,
                assigner.name as assigned_by_name
            FROM user_roles ur
            JOIN users u ON ur.user_id = u.id
            LEFT JOIN users assigner ON ur.assigned_by = assigner.id
            WHERE ur.role_id = ?
            ORDER BY ur.assigned_at DESC
        `, [parseInt(id)]);

        // Get child roles
        const [childRoles] = await connection.execute(`
            SELECT 
                id,
                name,
                description,
                level,
                is_active,
                created_at
            FROM roles
            WHERE parent_role_id = ? AND is_active = 1
            ORDER BY level, name
        `, [parseInt(id)]);

        role.permissions = permissions;
        role.users = users;
        role.child_roles = childRoles;

        // Log access
        try {
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'VIEW', 'ROLE', ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user?.userId || null,
                    req.user?.username || 'anonymous',
                    parseInt(id),
                    req.ip || 'unknown',
                    req.get('User-Agent') || 'unknown'
                ]
            );
        } catch (logError) {
            console.error('Error logging access:', logError);
        }

        res.json({
            success: true,
            message: 'Lấy thông tin vai trò thành công',
            data: {
                role
            }
        });

    } catch (error) {
        console.error('Error getting role by ID:', error);
        
        // Log failed access
        try {
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, status, failure_reason, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'VIEW', 'ROLE', ?, 'FAILURE', ?, ?, ?, NOW())`,
                [
                    req.user?.userId || null,
                    req.user?.username || 'anonymous',
                    req.params.id,
                    error.message,
                    req.ip || 'unknown',
                    req.get('User-Agent') || 'unknown'
                ]
            );
        } catch (logError) {
            console.error('Error logging failed access:', logError);
        }

        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin vai trò',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = { getRoles, getRoleById };