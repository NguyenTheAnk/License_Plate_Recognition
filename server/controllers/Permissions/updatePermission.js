const db = require('../../db');

const updatePermission = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;
        const {
            module,
            action,
            code,
            description,
            isActive
        } = req.body;

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
            [id]
        );

        if (currentPermission.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy quyền với ID đã cho'
            });
        }

        const oldValues = currentPermission[0];

        // Validate required fields
        if (!module || !action || !code) {
            return res.status(400).json({
                success: false,
                message: 'Module, hành động và mã quyền là bắt buộc'
            });
        }

        // Validate module and action naming conventions
        const validModulePattern = /^[a-z_]+$/;
        const validActionPattern = /^[a-z_]+$/;
        
        if (!validModulePattern.test(module)) {
            return res.status(400).json({
                success: false,
                message: 'Module chỉ được chứa chữ cái thường và dấu gạch dưới'
            });
        }

        if (!validActionPattern.test(action)) {
            return res.status(400).json({
                success: false,
                message: 'Hành động chỉ được chứa chữ cái thường và dấu gạch dưới'
            });
        }

        // Validate code format if changed
        if (code !== oldValues.code) {
            const expectedCode = `${module}.${action}`;
            if (code !== expectedCode) {
                return res.status(400).json({
                    success: false,
                    message: `Mã quyền phải theo định dạng: ${expectedCode}`
                });
            }

            // Check if new code already exists
            const [existingPermissions] = await connection.execute(
                'SELECT id FROM permissions WHERE code = ? AND id != ?',
                [code, id]
            );

            if (existingPermissions.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Mã quyền đã tồn tại'
                });
            }
        }

        // Check if module.action combination already exists (if changed)
        if (module !== oldValues.module || action !== oldValues.action) {
            const [existingCombination] = await connection.execute(
                'SELECT id FROM permissions WHERE module = ? AND action = ? AND id != ?',
                [module, action, id]
            );

            if (existingCombination.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Tổ hợp module và hành động đã tồn tại'
                });
            }
        }

        // Check if permission is being used and if critical changes are being made
        const [rolePermissions] = await connection.execute(
            `SELECT COUNT(*) as count, GROUP_CONCAT(r.name) as role_names
             FROM role_permissions rp 
             JOIN roles r ON rp.role_id = r.id 
             WHERE rp.permission_id = ? AND rp.granted = 1`,
            [id]
        );

        const isBeingUsed = rolePermissions[0].count > 0;
        const criticalChange = (module !== oldValues.module || action !== oldValues.action || code !== oldValues.code);

        if (isBeingUsed && criticalChange) {
            return res.status(400).json({
                success: false,
                message: `Không thể thay đổi module, action hoặc code vì quyền đang được sử dụng bởi các vai trò: ${rolePermissions[0].role_names}. Vui lòng tạo quyền mới thay vì sửa đổi.`
            });
        }

        // Update permission
        await connection.execute(
            `UPDATE permissions 
             SET module = ?, action = ?, code = ?, description = ?, is_active = ?, updated_at = NOW()
             WHERE id = ?`,
            [module, action, code, description, isActive ? 1 : 0, id]
        );

        // Get updated permission with additional info
        const [updatedPermission] = await connection.execute(
            `SELECT 
                p.id,
                p.module,
                p.action,
                p.code,
                p.description,
                p.is_active,
                p.created_at,
                p.updated_at,
                COUNT(DISTINCT CASE WHEN rp.granted = 1 THEN rp.role_id END) as granted_roles_count,
                COUNT(DISTINCT CASE WHEN rp.granted = 0 THEN rp.role_id END) as denied_roles_count
            FROM permissions p
            LEFT JOIN role_permissions rp ON p.id = rp.permission_id
            WHERE p.id = ?
            GROUP BY p.id`,
            [id]
        );

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, old_values, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'UPDATE', 'PERMISSION', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                id,
                JSON.stringify(oldValues),
                JSON.stringify({ module, action, code, description, isActive }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Cập nhật quyền thành công',
            data: {
                permission: updatedPermission[0],
                changes: {
                    module: oldValues.module !== module,
                    action: oldValues.action !== action,
                    code: oldValues.code !== code,
                    description: oldValues.description !== description,
                    isActive: oldValues.is_active !== (isActive ? 1 : 0)
                }
            }
        });

    } catch (error) {
        console.error('Error updating permission:', error);
        
        // Log failed access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, status, failure_reason, ip_address, user_agent, created_at)
             VALUES (?, ?, 'UPDATE', 'PERMISSION', ?, 'FAILURE', ?, ?, ?, NOW())`,
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
            message: 'Lỗi khi cập nhật quyền',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = { updatePermission };