const db = require('../../db');

const updateRole = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;
        const {
            name,
            description,
            parent_role_id,
            level,
            is_default_role,
            is_active,
            permissionIds = [] // Danh sách permission IDs mới
        } = req.body;

        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({
                success: false,
                message: 'ID vai trò không hợp lệ'
            });
        }

        const roleId = parseInt(id);

        // Check if role exists
        const [existingRole] = await connection.execute(
            'SELECT * FROM roles WHERE id = ?',
            [roleId]
        );

        if (existingRole.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy vai trò'
            });
        }

        const oldData = existingRole[0];

        // Xử lý parent_role_id - cho phép null
        const processedParentRoleId = parent_role_id === null || parent_role_id === '' || parent_role_id === undefined
            ? null 
            : parseInt(parent_role_id);

        // Xử lý level
        const processedLevel = level !== undefined ? parseInt(level) : oldData.level;

        // Xử lý is_default_role
        const processedIsDefaultRole = is_default_role !== undefined ? (is_default_role ? 1 : 0) : oldData.is_default_role;

        // Xử lý is_active
        const processedIsActive = is_active !== undefined ? (is_active ? 1 : 0) : oldData.is_active;

        // Check if name already exists (exclude current role)
        if (name && name !== oldData.name) {
            const [nameCheck] = await connection.execute(
                'SELECT id FROM roles WHERE name = ? AND id != ?',
                [name, roleId]
            );

            if (nameCheck.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Tên vai trò đã tồn tại'
                });
            }
        }

        // Validate parent role if provided
        if (processedParentRoleId !== null) {
            // Check for circular reference
            if (processedParentRoleId === roleId) {
                return res.status(400).json({
                    success: false,
                    message: 'Vai trò không thể là cha của chính nó'
                });
            }

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

            // Check for circular reference in hierarchy
            const [circularCheck] = await connection.execute(`
                WITH RECURSIVE role_hierarchy AS (
                    SELECT id, parent_role_id, 1 as level
                    FROM roles 
                    WHERE id = ?
                    
                    UNION ALL
                    
                    SELECT r.id, r.parent_role_id, rh.level + 1
                    FROM roles r
                    INNER JOIN role_hierarchy rh ON r.id = rh.parent_role_id
                    WHERE rh.level < 10
                )
                SELECT id FROM role_hierarchy WHERE id = ?
            `, [processedParentRoleId, roleId]);

            if (circularCheck.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Tạo vai trò cha sẽ gây ra vòng lặp trong cấu trúc phân cấp'
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

        // Start transaction
        await connection.beginTransaction();

        try {
            // Build update query dynamically
            let updateFields = [];
            let updateValues = [];

            if (name !== undefined) {
                updateFields.push('name = ?');
                updateValues.push(name);
            }
            if (description !== undefined) {
                updateFields.push('description = ?');
                updateValues.push(description);
            }
            if (parent_role_id !== undefined) {
                updateFields.push('parent_role_id = ?');
                updateValues.push(processedParentRoleId);
            }
            if (level !== undefined) {
                updateFields.push('level = ?');
                updateValues.push(processedLevel);
            }
            if (is_default_role !== undefined) {
                updateFields.push('is_default_role = ?');
                updateValues.push(processedIsDefaultRole);
            }
            if (is_active !== undefined) {
                updateFields.push('is_active = ?');
                updateValues.push(processedIsActive);
            }

            // Always update updated_at
            updateFields.push('updated_at = NOW()');
            updateValues.push(roleId);

            // Update role if there are fields to update
            if (updateFields.length > 1) { // > 1 because updated_at is always included
                await connection.execute(
                    `UPDATE roles SET ${updateFields.join(', ')} WHERE id = ?`,
                    updateValues
                );
            }

            // Update permissions
            // First, delete all existing permissions for this role
            await connection.execute(
                'DELETE FROM role_permissions WHERE role_id = ?',
                [roleId]
            );

            // Then, insert new permissions if provided
            if (permissionIds.length > 0) {
                const permissionValues = permissionIds.map(permissionId => 
                    `(${roleId}, ${permissionId}, 1, NOW())`
                ).join(', ');
                
                await connection.execute(
                    `INSERT INTO role_permissions (role_id, permission_id, granted, created_at) VALUES ${permissionValues}`
                );
            }

            // Commit transaction
            await connection.commit();

        } catch (transactionError) {
            // Rollback transaction on error
            await connection.rollback();
            throw transactionError;
        }

        // Get updated role with permissions using the same method as getRoles
        const [updatedRoleData] = await connection.execute(`
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
        if (updatedRoleData[0].permission_ids) {
            const permissionIdList = updatedRoleData[0].permission_ids.split(',').map(id => parseInt(id));
            const placeholders = permissionIdList.map(() => '?').join(',');
            const [permissionsResult] = await connection.execute(`
                SELECT id, module, action, code, description 
                FROM permissions 
                WHERE id IN (${placeholders})
            `, permissionIdList);
            permissions = permissionsResult;
        }

        const updatedRole = {
            ...updatedRoleData[0],
            permission_ids: undefined, // Remove raw string
            permissions: permissions
        };

        // Prepare change log
        const newData = {
            name: name !== undefined ? name : oldData.name,
            description: description !== undefined ? description : oldData.description,
            parent_role_id: parent_role_id !== undefined ? processedParentRoleId : oldData.parent_role_id,
            level: level !== undefined ? processedLevel : oldData.level,
            is_default_role: is_default_role !== undefined ? processedIsDefaultRole : oldData.is_default_role,
            is_active: is_active !== undefined ? processedIsActive : oldData.is_active,
            permissionIds: permissionIds
        };

        // Log access
        try {
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, old_values, new_values, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'UPDATE', 'ROLE', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user?.userId || null,
                    req.user?.username || 'unknown',
                    roleId,
                    JSON.stringify(oldData),
                    JSON.stringify(newData),
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
            message: 'Cập nhật vai trò thành công',
            data: {
                role: updatedRole
            }
        });

    } catch (error) {
        console.error('Error updating role:', error);
        
        // Log failed access
        try {
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, status, failure_reason, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'UPDATE', 'ROLE', ?, 'FAILURE', ?, ?, ?, NOW())`,
                [
                    req.user?.userId || null,
                    req.user?.username || 'unknown',
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
            message: 'Lỗi khi cập nhật vai trò',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const updateRolePermissions = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;
        const { permissionIds = [] } = req.body;

        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({
                success: false,
                message: 'ID vai trò không hợp lệ'
            });
        }

        // Check if role exists
        const [roleCheck] = await connection.execute(
            'SELECT id, name FROM roles WHERE id = ?',
            [parseInt(id)]
        );

        if (roleCheck.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy vai trò'
            });
        }

        // Validate permission IDs
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

        // Get old permissions for logging
        const [oldPermissions] = await connection.execute(
            'SELECT permission_id FROM role_permissions WHERE role_id = ?',
            [parseInt(id)]
        );

        // Start transaction
        await connection.beginTransaction();

        try {
            // Remove all existing permissions for this role
            await connection.execute(
                'DELETE FROM role_permissions WHERE role_id = ?',
                [parseInt(id)]
            );

            // Add new permissions
            if (permissionIds.length > 0) {
                const permissionValues = permissionIds.map(permissionId => 
                    `(${parseInt(id)}, ${parseInt(permissionId)}, 1, NOW())`
                ).join(', ');
                
                await connection.execute(
                    `INSERT INTO role_permissions (role_id, permission_id, granted, created_at) VALUES ${permissionValues}`
                );
            }

            await connection.commit();

            // Get updated role with new permissions
            const [updatedRole] = await connection.execute(`
                SELECT 
                    r.id,
                    r.name,
                    r.description,
                    r.level,
                    COALESCE(
                        JSON_ARRAYAGG(
                            CASE WHEN p.id IS NOT NULL THEN
                                JSON_OBJECT(
                                    'id', p.id,
                                    'module', p.module,
                                    'action', p.action,
                                    'code', p.code,
                                    'description', p.description,
                                    'granted', rp.granted
                                )
                            END
                        ),
                        JSON_ARRAY()
                    ) as permissions
                FROM roles r
                LEFT JOIN role_permissions rp ON r.id = rp.role_id
                LEFT JOIN permissions p ON rp.permission_id = p.id AND p.is_active = 1
                WHERE r.id = ?
                GROUP BY r.id
            `, [parseInt(id)]);

            // Log access
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, old_values, new_values, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'UPDATE', 'ROLE_PERMISSIONS', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user.userId,
                    req.user.username,
                    id,
                    JSON.stringify({ permissions: oldPermissions.map(p => p.permission_id) }),
                    JSON.stringify({ permissions: permissionIds }),
                    req.ip,
                    req.get('User-Agent')
                ]
            );

            res.json({
                success: true,
                message: 'Cập nhật quyền cho vai trò thành công',
                data: {
                    role: updatedRole[0]
                }
            });

        } catch (transactionError) {
            await connection.rollback();
            throw transactionError;
        }

    } catch (error) {
        console.error('Error updating role permissions:', error);
        
        // Log failed access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, status, failure_reason, ip_address, user_agent, created_at)
             VALUES (?, ?, 'UPDATE', 'ROLE_PERMISSIONS', ?, 'FAILURE', ?, ?, ?, NOW())`,
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
            message: 'Lỗi khi cập nhật quyền cho vai trò',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = { updateRole, updateRolePermissions };