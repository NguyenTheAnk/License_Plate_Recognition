const db = require('../../db');

const deletePermission = async (req, res) => {
    const connection = await db.promise();
    
    // Helper function to convert undefined to null
    const sanitizeParam = (value) => {
        return value === undefined ? null : value;
    };
    
    try {
        const { id } = req.params;

        // Validate ID
        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({
                success: false,
                message: 'ID quyền không hợp lệ'
            });
        }

        // Get current permission data
        const [currentPermission] = await connection.execute(
            'SELECT * FROM permissions WHERE id = ?',
            [sanitizeParam(id)]
        );

        if (currentPermission.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy quyền với ID đã cho'
            });
        }

        const oldValues = currentPermission[0];

        // Check if permission is being used by any roles
        const [rolePermissions] = await connection.execute(
            `SELECT 
                COUNT(*) as count, 
                GROUP_CONCAT(DISTINCT r.name ORDER BY r.name) as role_names,
                COUNT(DISTINCT CASE WHEN rp.granted = 1 THEN rp.role_id END) as granted_count,
                COUNT(DISTINCT CASE WHEN rp.granted = 0 THEN rp.role_id END) as denied_count
             FROM role_permissions rp 
             JOIN roles r ON rp.role_id = r.id 
             WHERE rp.permission_id = ?`,
            [sanitizeParam(id)]
        );

        if (rolePermissions[0].count > 0) {
            return res.status(400).json({
                success: false,
                message: `Không thể xóa quyền đang được sử dụng bởi ${rolePermissions[0].count} vai trò: ${rolePermissions[0].role_names}. Vui lòng xóa khỏi các vai trò trước.`,
                data: {
                    usedByRoles: rolePermissions[0].role_names ? rolePermissions[0].role_names.split(',') : [],
                    grantedCount: rolePermissions[0].granted_count,
                    deniedCount: rolePermissions[0].denied_count
                }
            });
        }

        // Check if this is a system permission (prevent deletion of critical permissions)
        const systemPermissions = [
            'users.view', 'users.create', 'users.update', 'users.delete',
            'roles.view', 'roles.create', 'roles.update', 'roles.delete',
            'permissions.view', 'permissions.create', 'permissions.update', 'permissions.delete'
        ];

        if (systemPermissions.includes(oldValues.code)) {
            return res.status(400).json({
                success: false,
                message: 'Không thể xóa quyền hệ thống. Quyền này là cần thiết cho hoạt động của hệ thống.'
            });
        }

        // Start transaction for safe deletion - get a connection from pool
        const transactionConnection = await db.promise().getConnection();
        
        try {
            await transactionConnection.beginTransaction();

            // Delete any role_permissions entries (should be 0 based on check above, but for safety)
            await transactionConnection.execute(
                'DELETE FROM role_permissions WHERE permission_id = ?',
                [sanitizeParam(id)]
            );

            // Delete the permission
            const [deleteResult] = await transactionConnection.execute(
                'DELETE FROM permissions WHERE id = ?',
                [sanitizeParam(id)]
            );

            if (deleteResult.affectedRows === 0) {
                await transactionConnection.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Quyền không tồn tại hoặc đã bị xóa'
                });
            }

            // Commit transaction
            await transactionConnection.commit();

            // Log access with sanitized parameters
            const logParams = [
                sanitizeParam(req.user?.userId),
                sanitizeParam(req.user?.username),
                sanitizeParam(id),
                JSON.stringify(oldValues),
                sanitizeParam(req.ip || '127.0.0.1'),
                sanitizeParam((req.get('User-Agent') || '').substring(0, 255))
            ];

            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, old_values, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'DELETE', 'PERMISSION', ?, ?, 'SUCCESS', ?, ?, NOW())`,
                logParams
            );

            res.status(200).json({
                success: true,
                message: 'Xóa quyền thành công',
                data: {
                    deletedPermission: {
                        id: oldValues.id,
                        module: oldValues.module,
                        action: oldValues.action,
                        code: oldValues.code,
                        description: oldValues.description
                    }
                }
            });

        } catch (error) {
            await transactionConnection.rollback();
            throw error;
        } finally {
            // Always release the connection back to the pool
            transactionConnection.release();
        }

    } catch (error) {
        console.error('Error deleting permission:', error);
        
        // Log failed access with sanitized parameters
        const errorLogParams = [
            sanitizeParam(req.user?.userId),
            sanitizeParam(req.user?.username),
            sanitizeParam(req.params.id),
            sanitizeParam((error.message || 'Unknown error').substring(0, 255)),
            sanitizeParam(req.ip || '127.0.0.1'),
            sanitizeParam((req.get('User-Agent') || '').substring(0, 255))
        ];

        try {
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, status, failure_reason, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'DELETE', 'PERMISSION', ?, 'FAILURE', ?, ?, ?, NOW())`,
                errorLogParams
            );
        } catch (logError) {
            console.warn('Failed to log error:', logError.message);
        }

        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa quyền',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Bulk delete permissions
const bulkDeletePermissions = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { ids } = req.body;

        // Helper function to convert undefined to null
        const sanitizeParam = (value) => {
            return value === undefined ? null : value;
        };

        // Validate input
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Danh sách ID không hợp lệ'
            });
        }

        // Validate all IDs
        const invalidIds = ids.filter(id => !id || isNaN(parseInt(id)));
        if (invalidIds.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Một số ID không hợp lệ'
            });
        }

        // Get permissions data
        const placeholders = ids.map(() => '?').join(',');
        const sanitizedIds = ids.map(id => sanitizeParam(id));
        
        const [permissions] = await connection.execute(
            `SELECT * FROM permissions WHERE id IN (${placeholders})`,
            sanitizedIds
        );

        if (permissions.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy quyền nào với các ID đã cho'
            });
        }

        // Check for system permissions
        const systemPermissions = [
            'users.view', 'users.create', 'users.update', 'users.delete',
            'roles.view', 'roles.create', 'roles.update', 'roles.delete',
            'permissions.view', 'permissions.create', 'permissions.update', 'permissions.delete'
        ];

        const systemPermissionFound = permissions.find(p => systemPermissions.includes(p.code));
        if (systemPermissionFound) {
            return res.status(400).json({
                success: false,
                message: `Không thể xóa quyền hệ thống: ${systemPermissionFound.code}`
            });
        }

        // Check if any permissions are being used
        const [usageCheck] = await connection.execute(
            `SELECT 
                rp.permission_id,
                p.code,
                COUNT(*) as usage_count,
                GROUP_CONCAT(DISTINCT r.name) as role_names
             FROM role_permissions rp 
             JOIN permissions p ON rp.permission_id = p.id
             JOIN roles r ON rp.role_id = r.id 
             WHERE rp.permission_id IN (${placeholders})
             GROUP BY rp.permission_id, p.code`,
            sanitizedIds
        );

        if (usageCheck.length > 0) {
            const usedPermissions = usageCheck.map(usage => ({
                id: usage.permission_id,
                code: usage.code,
                usageCount: usage.usage_count,
                roleNames: usage.role_names ? usage.role_names.split(',') : []
            }));

            return res.status(400).json({
                success: false,
                message: 'Một số quyền đang được sử dụng và không thể xóa',
                data: {
                    usedPermissions
                }
            });
        }

        // Start transaction - get a connection from pool
        const transactionConnection = await db.promise().getConnection();
        
        try {
            await transactionConnection.beginTransaction();

            const deletedPermissions = [];
            let successCount = 0;
            let failedCount = 0;

            for (const permission of permissions) {
                try {
                    // Delete role_permissions first (should be none based on check above)
                    await transactionConnection.execute(
                        'DELETE FROM role_permissions WHERE permission_id = ?',
                        [sanitizeParam(permission.id)]
                    );

                    // Delete the permission
                    const [deleteResult] = await transactionConnection.execute(
                        'DELETE FROM permissions WHERE id = ?',
                        [sanitizeParam(permission.id)]
                    );

                    if (deleteResult.affectedRows > 0) {
                        deletedPermissions.push({
                            id: permission.id,
                            module: permission.module,
                            action: permission.action,
                            code: permission.code,
                            description: permission.description
                        });
                        successCount++;
                    } else {
                        failedCount++;
                    }

                } catch (error) {
                    console.error(`Error deleting permission ${permission.id}:`, error);
                    failedCount++;
                }
            }

            if (successCount === 0) {
                await transactionConnection.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Không thể xóa bất kỳ quyền nào'
                });
            }

            // Commit transaction
            await transactionConnection.commit();

            // Log bulk delete access with sanitized parameters
            const logParams = [
                sanitizeParam(req.user?.userId),
                sanitizeParam(req.user?.username),
                sanitizeParam(ids.join(',')),
                JSON.stringify({ deletedCount: successCount, failedCount, deletedPermissions }),
                sanitizeParam(req.ip || '127.0.0.1'),
                sanitizeParam((req.get('User-Agent') || '').substring(0, 255))
            ];

            await transactionConnection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, old_values, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'DELETE', 'PERMISSION_BULK', ?, ?, 'SUCCESS', ?, ?, NOW())`,
                logParams
            );

            res.status(200).json({
                success: true,
                message: `Xóa thành công ${successCount} quyền${failedCount > 0 ? `, ${failedCount} quyền thất bại` : ''}`,
                data: {
                    deletedCount: successCount,
                    failedCount,
                    deletedPermissions
                }
            });

        } catch (error) {
            await transactionConnection.rollback();
            throw error;
        } finally {
            // Always release the connection back to the pool
            transactionConnection.release();
        }

    } catch (error) {
        console.error('Error bulk deleting permissions:', error);
        
        // Log failed access with sanitized parameters
        const errorLogParams = [
            sanitizeParam(req.user?.userId),
            sanitizeParam(req.user?.username),
            sanitizeParam((error.message || 'Unknown error').substring(0, 255)),
            sanitizeParam(req.ip || '127.0.0.1'),
            sanitizeParam((req.get('User-Agent') || '').substring(0, 255))
        ];

        try {
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, status, failure_reason, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'DELETE', 'PERMISSION_BULK', 'FAILURE', ?, ?, ?, NOW())`,
                errorLogParams
            );
        } catch (logError) {
            console.warn('Failed to log error:', logError.message);
        }

        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa hàng loạt quyền',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = { 
    deletePermission, 
    bulkDeletePermissions 
};