const db = require('../../db');

const createRole = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const {
            name,
            description,
            parent_role_id,
            level = 0,
            is_default_role = false,
            permissionIds = []
        } = req.body;

        // Validate required fields
        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Tên vai trò là bắt buộc'
            });
        }

        // Xử lý parent_role_id - chuyển chuỗi rỗng hoặc undefined thành null
        const processedParentRoleId = parent_role_id && parent_role_id !== '' 
            ? parseInt(parent_role_id) 
            : null;

        // Xử lý level - đảm bảo là số nguyên
        const processedLevel = level && level !== '' ? parseInt(level) : 0;

        // Xử lý is_default_role - chuyển đổi thành boolean
        const processedIsDefaultRole = is_default_role ? 1 : 0;

        // Check if role name already exists
        const [existingRoles] = await connection.execute(
            'SELECT id FROM roles WHERE name = ?',
            [name]
        );

        if (existingRoles.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Tên vai trò đã tồn tại'
            });
        }

        // Validate parent role if provided
        if (processedParentRoleId) {
            const [parentRole] = await connection.execute(
                'SELECT id FROM roles WHERE id = ? AND is_active = 1',
                [processedParentRoleId]
            );

            if (parentRole.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Vai trò cha không tồn tại'
                });
            }
        }

        // Validate permission IDs if provided
        if (permissionIds.length > 0) {
            const [validPermissions] = await connection.execute(
                `SELECT id FROM permissions WHERE id IN (${permissionIds.map(() => '?').join(',')}) AND is_active = 1`,
                permissionIds
            );

            if (validPermissions.length !== permissionIds.length) {
                return res.status(400).json({
                    success: false,
                    message: 'Một hoặc nhiều quyền không hợp lệ'
                });
            }
        }

        // Create role với các giá trị đã được xử lý
        const [roleResult] = await connection.execute(
            `INSERT INTO roles (name, description, parent_role_id, is_default_role, level, is_active, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())`,
            [name, description, processedParentRoleId, processedIsDefaultRole, processedLevel]
        );

        const roleId = roleResult.insertId;

        // Assign permissions if provided
        if (permissionIds.length > 0) {
            const permissionValues = permissionIds.map(permissionId => 
                `(${roleId}, ${permissionId}, 1, NOW())`
            ).join(', ');
            
            await connection.execute(
                `INSERT INTO role_permissions (role_id, permission_id, granted, created_at) VALUES ${permissionValues}`
            );
        }

        // Get created role with permissions - sử dụng phương pháp tương tự getRoles
        const [roleData] = await connection.execute(`
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
                COUNT(DISTINCT CASE WHEN rp.granted = 1 THEN rp.permission_id END) as permissions_count,
                GROUP_CONCAT(
                    DISTINCT CASE 
                        WHEN rp.granted = 1 THEN rp.permission_id
                        END 
                    SEPARATOR ','
                ) as permission_ids
            FROM roles r
            LEFT JOIN roles pr ON r.parent_role_id = pr.id
            LEFT JOIN role_permissions rp ON r.id = rp.role_id
            WHERE r.id = ?
            GROUP BY r.id, r.name, r.description, r.parent_role_id, pr.name, r.is_default_role, r.level, r.is_active, r.created_at, r.updated_at
        `, [roleId]);

        // Lấy chi tiết permissions nếu có
        let permissions = [];
        if (roleData[0].permission_ids) {
            const permissionIds = roleData[0].permission_ids.split(',').map(id => parseInt(id));
            const placeholders = permissionIds.map(() => '?').join(',');
            const [permissionsResult] = await connection.execute(`
                SELECT id, module, action, code, description 
                FROM permissions 
                WHERE id IN (${placeholders})
            `, permissionIds);
            permissions = permissionsResult;
        }

        const roleWithPermissions = {
            ...roleData[0],
            permission_ids: undefined, // Remove raw string
            permissions: permissions
        };

        // Log access
        try {
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, new_values, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'CREATE', 'ROLE', ?, ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user?.userId || null,
                    req.user?.username || 'unknown',
                    roleId.toString(),
                    JSON.stringify({ name, description, parent_role_id: processedParentRoleId, level: processedLevel, is_default_role: processedIsDefaultRole, permissionIds }),
                    req.ip || 'unknown',
                    req.get('User-Agent') || 'unknown'
                ]
            );
        } catch (logError) {
            console.error('Error logging access:', logError);
            // Don't fail the main request due to logging error
        }

        res.status(201).json({
            success: true,
            message: 'Tạo vai trò thành công',
            data: {
                role: roleWithPermissions
            }
        });

    } catch (error) {
        console.error('Error creating role:', error);
        
        // Log failed access
        try {
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, status, failure_reason, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'CREATE', 'ROLE', 'FAILURE', ?, ?, ?, NOW())`,
                [
                    req.user?.userId || null,
                    req.user?.username || 'unknown',
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
            message: 'Lỗi khi tạo vai trò',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = { createRole };