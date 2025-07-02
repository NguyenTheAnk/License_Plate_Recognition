const db = require('../../db');
const bcrypt = require('bcrypt');

// Helper function to validate user_id exists
const validateUserId = async (connection, userId) => {
    if (!userId) return null;
    
    const [users] = await connection.execute(
        'SELECT id FROM users WHERE id = ?',
        [userId]
    );
    
    return users.length > 0 ? userId : null;
};

// Update user information - FIXED VERSION
const updateUser = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const userId = req.params.id;
        const {
            name,
            email,
            phone,
            status,
            roleIds
        } = req.body;

        if (!userId || isNaN(userId)) {
            return res.status(400).json({
                success: false,
                message: 'ID người dùng không hợp lệ'
            });
        }

        // Get current user data for logging
        const [currentUser] = await connection.execute(
            'SELECT * FROM users WHERE id = ?',
            [userId]
        );

        if (currentUser.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng'
            });
        }

        // Check if email already exists (excluding current user)
        if (email) {
            const [existingUsers] = await connection.execute(
                'SELECT id FROM users WHERE email = ? AND id != ?',
                [email, userId]
            );

            if (existingUsers.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Email đã tồn tại'
                });
            }
        }

        // Build update query dynamically
        const updateFields = [];
        const updateValues = [];

        if (name !== undefined) {
            updateFields.push('name = ?');
            updateValues.push(name);
        }
        if (email !== undefined) {
            updateFields.push('email = ?');
            updateValues.push(email);
        }
        if (phone !== undefined) {
            updateFields.push('phone = ?');
            updateValues.push(phone);
        }
        if (status !== undefined) {
            updateFields.push('status = ?');
            updateValues.push(status);
        }

        updateFields.push('updated_at = NOW()');
        updateValues.push(userId);

        // Update user basic information
        if (updateFields.length > 1) { // More than just updated_at
            await connection.execute(
                `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
                updateValues
            );
        }

        // Update user roles if provided
        if (roleIds !== undefined && Array.isArray(roleIds)) {
            // First, deactivate all current roles
            await connection.execute(
                'UPDATE user_roles SET is_active = 0 WHERE user_id = ?',
                [userId]
            );

            // Then add new roles
            if (roleIds.length > 0) {
                // Validate req.user.userId exists
                const validAssignedBy = await validateUserId(connection, req.user?.userId);
                const roleValues = roleIds.map(roleId => `(${userId}, ${roleId}, ${validAssignedBy || 'NULL'})`).join(', ');
                await connection.execute(
                    `INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ${roleValues}
                     ON DUPLICATE KEY UPDATE is_active = 1, assigned_at = NOW(), assigned_by = ${validAssignedBy || 'NULL'}`
                );
            }
        }

        // Get updated user basic info
        const [updatedUser] = await connection.execute(`
            SELECT 
                u.id,
                u.name,
                u.email,
                u.phone,
                u.status,
                u.last_login,
                u.created_at,
                u.updated_at
            FROM users u
            WHERE u.id = ?
        `, [userId]);

        const user = updatedUser[0];

        // Get roles separately
        const [userRoles] = await connection.execute(`
            SELECT DISTINCT
                r.id,
                r.name,
                r.description,
                r.level,
                ur.assigned_at
            FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = ? AND ur.is_active = 1 AND r.is_active = 1
        `, [userId]);

        // Get permissions separately
        const [userPermissions] = await connection.execute(`
            SELECT DISTINCT
                p.id,
                p.module,
                p.action,
                p.code,
                p.description
            FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            JOIN role_permissions rp ON r.id = rp.role_id
            JOIN permissions p ON rp.permission_id = p.id
            WHERE ur.user_id = ? AND ur.is_active = 1 AND r.is_active = 1 AND rp.granted = 1 AND p.is_active = 1
        `, [userId]);

        user.roles = userRoles;
        user.permissions = userPermissions;

        // Log access - Fixed foreign key constraint
        try {
            const validUserId = await validateUserId(connection, req.user?.userId);
            if (validUserId) {
                await connection.execute(
                    `INSERT INTO access_logs (user_id, action_type, object_type, object_id, old_values, new_values, status, ip_address, user_agent, created_at)
                     VALUES (?, 'UPDATE', 'USER', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
                    [
                        validUserId,
                        userId,
                        JSON.stringify(currentUser[0]),
                        JSON.stringify({ name, email, phone, status, roleIds }),
                        req.ip,
                        req.get('User-Agent')
                    ]
                );
            }
        } catch (logError) {
            console.error('Error logging access:', logError);
        }

        res.status(200).json({
            success: true,
            message: 'Cập nhật người dùng thành công',
            data: { user }
        });

    } catch (error) {
        console.error('Error updating user:', error);
        
        // Log failed access - Fixed foreign key constraint
        try {
            const validUserId = await validateUserId(connection, req.user?.userId);
            if (validUserId) {
                await connection.execute(
                    `INSERT INTO access_logs (user_id, action_type, object_type, object_id, status, failure_reason, ip_address, user_agent, created_at)
                     VALUES (?, 'UPDATE', 'USER', ?, 'FAILURE', ?, ?, ?, NOW())`,
                    [
                        validUserId,
                        req.params.id,
                        error.message,
                        req.ip,
                        req.get('User-Agent')
                    ]
                );
            }
        } catch (logError) {
            console.error('Error logging failed access:', logError);
        }

        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật người dùng',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Change password
const changePassword = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const userId = req.params.id;
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Mật khẩu hiện tại và mật khẩu mới là bắt buộc'
            });
        }

        // Validate new password strength
        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'Mật khẩu mới phải có ít nhất 8 ký tự'
            });
        }

        // Get current user
        const [users] = await connection.execute(
            'SELECT password FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng'
            });
        }

        // Verify current password
        const isValidPassword = await bcrypt.compare(currentPassword, users[0].password);
        if (!isValidPassword) {
            return res.status(400).json({
                success: false,
                message: 'Mật khẩu hiện tại không chính xác'
            });
        }

        // Hash new password
        const saltRounds = 10;
        const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

        // Update password
        await connection.execute(
            'UPDATE users SET password = ?, last_password_change = NOW(), updated_at = NOW() WHERE id = ?',
            [hashedNewPassword, userId]
        );

        // Log access - Fixed foreign key constraint
        try {
            const validUserId = await validateUserId(connection, req.user?.userId);
            if (validUserId) {
                await connection.execute(
                    `INSERT INTO access_logs (user_id, action_type, object_type, object_id, status, ip_address, user_agent, created_at)
                     VALUES (?, 'UPDATE', 'USER_PASSWORD', ?, 'SUCCESS', ?, ?, NOW())`,
                    [
                        validUserId,
                        userId,
                        req.ip,
                        req.get('User-Agent')
                    ]
                );
            }
        } catch (logError) {
            console.error('Error logging access:', logError);
        }

        res.status(200).json({
            success: true,
            message: 'Đổi mật khẩu thành công'
        });

    } catch (error) {
        console.error('Error changing password:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi đổi mật khẩu',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Update user status (activate/deactivate/suspend)
const updateUserStatus = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const userId = req.params.id;
        const { status } = req.body;

        if (!['active', 'inactive', 'suspended'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Trạng thái không hợp lệ'
            });
        }

        // Get current user status for logging
        const [currentUser] = await connection.execute(
            'SELECT status FROM users WHERE id = ?',
            [userId]
        );

        if (currentUser.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng'
            });
        }

        // Update status
        await connection.execute(
            'UPDATE users SET status = ?, updated_at = NOW() WHERE id = ?',
            [status, userId]
        );

        // Log access - Fixed foreign key constraint
        try {
            const validUserId = await validateUserId(connection, req.user?.userId);
            if (validUserId) {
                await connection.execute(
                    `INSERT INTO access_logs (user_id, action_type, object_type, object_id, old_values, new_values, status, ip_address, user_agent, created_at)
                     VALUES (?, 'UPDATE', 'USER_STATUS', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
                    [
                        validUserId,
                        userId,
                        JSON.stringify({ status: currentUser[0].status }),
                        JSON.stringify({ status }),
                        req.ip,
                        req.get('User-Agent')
                    ]
                );
            }
        } catch (logError) {
            console.error('Error logging access:', logError);
        }

        res.status(200).json({
            success: true,
            message: 'Cập nhật trạng thái người dùng thành công'
        });

    } catch (error) {
        console.error('Error updating user status:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật trạng thái người dùng',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    updateUser,
    changePassword,
    updateUserStatus
};