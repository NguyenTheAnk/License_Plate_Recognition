const db = require('../../db');

// Lấy các permission được gán cho Role và các Permission còn lại chưa được gán và thống kê chi tiết
const getRolePermissionsWithRemaining = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;

        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({
                success: false,
                message: 'ID vai trò không hợp lệ'
            });
        }

        // Check if role exists
        const [roleCheck] = await connection.execute(
            'SELECT id, name, description FROM roles WHERE id = ?',
            [parseInt(id)]
        );

        if (roleCheck.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy vai trò'
            });
        }

        const role = roleCheck[0];

        // Get all permissions
        const [allPermissions] = await connection.execute(`
            SELECT 
                p.id,
                p.module,
                p.action,
                p.code,
                p.description,
                p.is_active,
                CASE WHEN rp.role_id IS NOT NULL THEN rp.granted ELSE NULL END as granted,
                CASE WHEN rp.role_id IS NOT NULL THEN 1 ELSE 0 END as is_assigned
            FROM permissions p
            LEFT JOIN role_permissions rp ON p.id = rp.permission_id AND rp.role_id = ?
            WHERE p.is_active = 1
            ORDER BY p.module, p.action
        `, [parseInt(id)]);

        // Group permissions by module
        const permissionsByModule = {};
        const assignedPermissions = [];
        const availablePermissions = [];

        allPermissions.forEach(permission => {
            if (!permissionsByModule[permission.module]) {
                permissionsByModule[permission.module] = [];
            }
            permissionsByModule[permission.module].push(permission);

            if (permission.is_assigned) {
                assignedPermissions.push(permission);
            } else {
                availablePermissions.push(permission);
            }
        });

        // Get statistics
        const stats = {
            total_permissions: allPermissions.length,
            assigned_permissions: assignedPermissions.length,
            available_permissions: availablePermissions.length,
            granted_permissions: assignedPermissions.filter(p => p.granted).length,
            denied_permissions: assignedPermissions.filter(p => !p.granted).length,
            modules_count: Object.keys(permissionsByModule).length
        };

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'VIEW', 'ROLE_PERMISSIONS', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                id,
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.json({
            success: true,
            message: 'Lấy thông tin quyền của vai trò thành công',
            data: {
                role,
                permissions: {
                    by_module: permissionsByModule,
                    assigned: assignedPermissions,
                    available: availablePermissions,
                    all: allPermissions
                },
                statistics: stats
            }
        });

    } catch (error) {
        console.error('Error getting role permissions:', error);
        
        // Log failed access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, status, failure_reason, ip_address, user_agent, created_at)
             VALUES (?, ?, 'VIEW', 'ROLE_PERMISSIONS', ?, 'FAILURE', ?, ?, ?, NOW())`,
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
            message: 'Lỗi khi lấy thông tin quyền của vai trò',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};


const getRoleStatistics = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;

        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({
                success: false,
                message: 'ID vai trò không hợp lệ'
            });
        }

        // Check if role exists
        const [roleCheck] = await connection.execute(
            'SELECT * FROM roles WHERE id = ?',
            [parseInt(id)]
        );

        if (roleCheck.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy vai trò'
            });
        }

        const role = roleCheck[0];

        // Get basic statistics
        const [basicStats] = await connection.execute(`
            SELECT 
                COUNT(DISTINCT ur.user_id) as total_users,
                COUNT(DISTINCT CASE WHEN ur.is_active = 1 THEN ur.user_id END) as active_users,
                COUNT(DISTINCT CASE WHEN u.status = 'active' AND ur.is_active = 1 THEN ur.user_id END) as active_enabled_users,
                COUNT(DISTINCT rp.permission_id) as total_permissions,
                COUNT(DISTINCT CASE WHEN rp.granted = 1 THEN rp.permission_id END) as granted_permissions
            FROM roles r
            LEFT JOIN user_roles ur ON r.id = ur.role_id
            LEFT JOIN users u ON ur.user_id = u.id
            LEFT JOIN role_permissions rp ON r.id = rp.role_id
            WHERE r.id = ?
        `, [parseInt(id)]);

        // Get permissions by module
        const [permissionsByModule] = await connection.execute(`
            SELECT 
                p.module,
                COUNT(*) as total_permissions,
                COUNT(CASE WHEN rp.granted = 1 THEN 1 END) as granted_permissions
            FROM permissions p
            LEFT JOIN role_permissions rp ON p.id = rp.permission_id AND rp.role_id = ?
            WHERE p.is_active = 1
            GROUP BY p.module
            ORDER BY p.module
        `, [parseInt(id)]);

        // Get user assignment history (last 30 days)
        const [assignmentHistory] = await connection.execute(`
            SELECT 
                DATE(ur.assigned_at) as assignment_date,
                COUNT(*) as assignments_count
            FROM user_roles ur
            WHERE ur.role_id = ? 
            AND ur.assigned_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY DATE(ur.assigned_at)
            ORDER BY assignment_date DESC
        `, [parseInt(id)]);

        // Get child roles count
        const [childRolesStats] = await connection.execute(`
            SELECT 
                COUNT(*) as total_child_roles,
                COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_child_roles
            FROM roles
            WHERE parent_role_id = ?
        `, [parseInt(id)]);

        // Get recent activities related to this role
        const [recentActivities] = await connection.execute(`
            SELECT 
                al.action_type,
                al.object_type,
                al.status,
                al.created_at,
                u.name as user_name,
                u.username
            FROM access_logs al
            LEFT JOIN users u ON al.user_id = u.id
            WHERE (al.object_type = 'ROLE' AND al.object_id = ?)
            OR (al.object_type = 'ROLE_PERMISSIONS' AND al.object_id = ?)
            OR (al.object_type = 'USER_ROLES' AND JSON_EXTRACT(al.new_values, '$.role_id') = ?)
            ORDER BY al.created_at DESC
            LIMIT 10
        `, [id, id, parseInt(id)]);

        const statistics = {
            basic: basicStats[0],
            permissions_by_module: permissionsByModule,
            assignment_history: assignmentHistory,
            child_roles: childRolesStats[0],
            recent_activities: recentActivities,
            calculated: {
                permission_coverage: basicStats[0].total_permissions > 0 
                    ? (basicStats[0].granted_permissions / basicStats[0].total_permissions * 100).toFixed(2)
                    : 0,
                user_activation_rate: basicStats[0].total_users > 0 
                    ? (basicStats[0].active_users / basicStats[0].total_users * 100).toFixed(2)
                    : 0
            }
        };

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'VIEW', 'ROLE_STATISTICS', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                id,
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.json({
            success: true,
            message: 'Lấy thống kê vai trò thành công',
            data: {
                role,
                statistics
            }
        });

    } catch (error) {
        console.error('Error getting role statistics:', error);
        
        // Log failed access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, status, failure_reason, ip_address, user_agent, created_at)
             VALUES (?, ?, 'VIEW', 'ROLE_STATISTICS', ?, 'FAILURE', ?, ?, ?, NOW())`,
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
            message: 'Lỗi khi lấy thống kê vai trò',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getAllPermissions = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const {
            module = null,
            is_active = 'true',
            group_by = 'module'
        } = req.query;

        // Build WHERE conditions
        let whereConditions = [];
        let queryParams = [];
        
        if (module) {
            whereConditions.push('p.module = ?');
            queryParams.push(module);
        }
        
        if (is_active !== null) {
            whereConditions.push('p.is_active = ?');
            queryParams.push(is_active === 'true' ? 1 : 0);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Get all permissions
        const [permissions] = await connection.execute(`
            SELECT 
                p.id,
                p.module,
                p.action,
                p.code,
                p.description,
                p.is_active,
                p.created_at,
                p.updated_at,
                COUNT(DISTINCT rp.role_id) as assigned_to_roles_count
            FROM permissions p
            LEFT JOIN role_permissions rp ON p.id = rp.permission_id AND rp.granted = 1
            ${whereClause}
            GROUP BY p.id, p.module, p.action, p.code, p.description, p.is_active, p.created_at, p.updated_at
            ORDER BY p.module, p.action
        `, queryParams);

        // Group permissions based on request
        let groupedData = {};
        if (group_by === 'module') {
            permissions.forEach(permission => {
                if (!groupedData[permission.module]) {
                    groupedData[permission.module] = [];
                }
                groupedData[permission.module].push(permission);
            });
        } else {
            groupedData = { all: permissions };
        }

        // Get module statistics
        const [moduleStats] = await connection.execute(`
            SELECT 
                p.module,
                COUNT(*) as total_permissions,
                COUNT(CASE WHEN p.is_active = 1 THEN 1 END) as active_permissions,
                COUNT(DISTINCT rp.role_id) as roles_using_module
            FROM permissions p
            LEFT JOIN role_permissions rp ON p.id = rp.permission_id AND rp.granted = 1
            ${whereClause}
            GROUP BY p.module
            ORDER BY p.module
        `, queryParams);

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'VIEW', 'PERMISSIONS', 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.json({
            success: true,
            message: 'Lấy danh sách quyền thành công',
            data: {
                permissions: groupedData,
                flat_list: permissions,
                module_statistics: moduleStats,
                total_permissions: permissions.length
            }
        });

    } catch (error) {
        console.error('Error getting permissions:', error);
        
        // Log failed access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, status, failure_reason, ip_address, user_agent, created_at)
             VALUES (?, ?, 'VIEW', 'PERMISSIONS', 'FAILURE', ?, ?, ?, NOW())`,
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
    getRolePermissionsWithRemaining,
    getRoleStatistics, 
    getAllPermissions 
};