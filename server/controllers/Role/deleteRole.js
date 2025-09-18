const db = require('../../db');

const deleteRole = async (req, res) => {
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
        const [existingRole] = await connection.execute(
            'SELECT * FROM roles WHERE id = ?',
            [parseInt(id)]
        );

        if (existingRole.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy vai trò'
            });
        }

        const roleData = existingRole[0];

        // Check if role is a system default role
        if (roleData.is_default_role) {
            return res.status(400).json({
                success: false,
                message: 'Không thể xóa vai trò mặc định của hệ thống'
            });
        }

        // Check if role has active users
        const [activeUsers] = await connection.execute(
            'SELECT COUNT(*) as count FROM user_roles WHERE role_id = ? AND is_active = 1',
            [parseInt(id)]
        );

        if (activeUsers[0].count > 0) {
            return res.status(400).json({
                success: false,
                message: `Không thể xóa vai trò vì còn ${activeUsers[0].count} người dùng đang sử dụng vai trò này`,
                data: {
                    active_users_count: activeUsers[0].count
                }
            });
        }

        // Check if role has child roles
        const [childRoles] = await connection.execute(
            'SELECT COUNT(*) as count FROM roles WHERE parent_role_id = ? AND is_active = 1',
            [parseInt(id)]
        );

        if (childRoles[0].count > 0) {
            return res.status(400).json({
                success: false,
                message: `Không thể xóa vai trò vì còn ${childRoles[0].count} vai trò con đang kế thừa từ vai trò này`,
                data: {
                    child_roles_count: childRoles[0].count
                }
            });
        }

        // Start transaction
        await connection.beginTransaction();

        try {
            // First, set parent_role_id to NULL for any roles that reference this role (safety measure)
            await connection.execute(
                'UPDATE roles SET parent_role_id = NULL WHERE parent_role_id = ?',
                [parseInt(id)]
            );

            // Remove all role permissions
            await connection.execute(
                'DELETE FROM role_permissions WHERE role_id = ?',
                [parseInt(id)]
            );

            // Remove all user role assignments (including inactive ones)
            await connection.execute(
                'DELETE FROM user_roles WHERE role_id = ?',
                [parseInt(id)]
            );

            // Finally, delete the role
            await connection.execute(
                'DELETE FROM roles WHERE id = ?',
                [parseInt(id)]
            );

            await connection.commit();

            // Log access - Fix: Handle undefined values
            await connection.execute(
                `INSERT INTO access_logs (user_id, action_type, object_type, object_id, old_values, status, ip_address, user_agent, created_at)
                 VALUES (?, 'DELETE', 'ROLE', ?, ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user?.userId || null,
                    id,
                    JSON.stringify(roleData),
                    req.ip || null,
                    req.get('User-Agent') || null
                ]
            );

            res.json({
                success: true,
                message: `Xóa vai trò "${roleData.name}" thành công`,
                data: {
                    deleted_role: {
                        id: roleData.id,
                        name: roleData.name,
                        description: roleData.description
                    }
                }
            });

        } catch (transactionError) {
            await connection.rollback();
            throw transactionError;
        }

    } catch (error) {
        console.error('Error deleting role:', error);
        
        // Log failed access - Fix: Handle undefined values
        try {
            await connection.execute(
                `INSERT INTO access_logs (user_id, action_type, object_type, object_id, status, failure_reason, ip_address, user_agent, created_at)
                 VALUES (?, 'DELETE', 'ROLE', ?, 'FAILURE', ?, ?, ?, NOW())`,
                [
                    req.user?.userId || null,
                    req.params.id || null,
                    error.message || null,
                    req.ip || null,
                    req.get('User-Agent') || null
                ]
            );
        } catch (logError) {
            console.error('Error logging failed access:', logError);
        }

        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa vai trò',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = { deleteRole };