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

        // Validate status if provided
        if (status && !['active', 'inactive', 'suspended'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Trạng thái không hợp lệ'
            });
        }

        // Check if email already exists (excluding current user)
        if (email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    success: false,
                    message: 'Định dạng email không hợp lệ'
                });
            }

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

        // Validate roles exist if provided
        if (roleIds !== undefined && Array.isArray(roleIds) && roleIds.length > 0) {
            const placeholders = roleIds.map(() => '?').join(',');
            const [validRoles] = await connection.execute(
                `SELECT id FROM roles WHERE id IN (${placeholders}) AND is_active = 1`,
                roleIds
            );

            if (validRoles.length !== roleIds.length) {
                return res.status(400).json({
                    success: false,
                    message: 'Một hoặc nhiều vai trò không hợp lệ'
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
            updateValues.push(phone || null);
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
                
                for (const roleId of roleIds) {
                    await connection.execute(
                        `INSERT INTO user_roles (user_id, role_id, assigned_by, assigned_at, is_active) 
                         VALUES (?, ?, ?, NOW(), 1)
                         ON DUPLICATE KEY UPDATE is_active = 1, assigned_at = NOW(), assigned_by = ?`,
                        [userId, roleId, validAssignedBy, validAssignedBy]
                    );
                }
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
                u.last_login_at,
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
                ur.assigned_at,
                ur.expires_at
            FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = ? AND ur.is_active = 1 AND r.is_active = 1
            AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
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
            AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        `, [userId]);

        user.roles = userRoles;
        user.permissions = userPermissions;

        // Log access with proper UUID and column names
        try {
            const validUserId = await validateUserId(connection, req.user?.userId);
            if (validUserId) {
                await connection.execute(
                    `INSERT INTO access_logs (
                        user_id, username, action_type, object_type, 
                        object_id, old_values, new_values, status, ip_address, user_agent, created_at
                    ) VALUES (?, ?, 'UPDATE', 'USER', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
                    [
                        validUserId,
                        req.user?.name || 'unknown',
                        userId,
                        JSON.stringify(currentUser[0]),
                        JSON.stringify({ name, email, phone, status, roleIds }),
                        req.ip || 'unknown',
                        req.get('User-Agent') || 'unknown'
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
        
        // Log failed access with proper UUID
        try {
            const validUserId = await validateUserId(connection, req.user?.userId);
            if (validUserId) {
                await connection.execute(
                    `INSERT INTO access_logs (
                        user_id, username, action_type, object_type, 
                        object_id, status, failure_reason, ip_address, user_agent, created_at
                    ) VALUES (?, ?, 'UPDATE', 'USER', ?, 'FAILURE', ?, ?, ?, NOW())`,
                    [
                        validUserId,
                        req.user?.name || 'unknown',
                        req.params.id,
                        error.message,
                        req.ip || 'unknown',
                        req.get('User-Agent') || 'unknown'
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

// Change password with enhanced security
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

        // Calculate new password expiry (90 days from now)
        const passwordExpiresAt = new Date();
        passwordExpiresAt.setDate(passwordExpiresAt.getDate() + 90);

        // Update password with proper column names
        await connection.execute(
            `UPDATE users SET 
             password = ?, 
             last_password_changed_at = NOW(), 
             password_expires_at = ?,
             failed_login_attempts = 0,
             is_account_locked = FALSE,
             locked_until = NULL,
             updated_at = NOW() 
             WHERE id = ?`,
            [hashedNewPassword, passwordExpiresAt, userId]
        );

        // Log access with proper UUID
        try {
            const validUserId = await validateUserId(connection, req.user?.userId);
            if (validUserId) {
                await connection.execute(
                    `INSERT INTO access_logs (
                        user_id, username, action_type, object_type, 
                        object_id, status, ip_address, user_agent, created_at
                    ) VALUES (?, ?, 'UPDATE', 'USER_PASSWORD', ?, 'SUCCESS', ?, ?, NOW())`,
                    [
                        validUserId,
                        req.user?.name || 'unknown',
                        userId,
                        req.ip || 'unknown',
                        req.get('User-Agent') || 'unknown'
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
        const { status, locked_until } = req.body;

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

        // Prevent self-deactivation
        if (parseInt(userId) === req.user?.userId && status !== 'active') {
            return res.status(400).json({
                success: false,
                message: 'Không thể tự thay đổi trạng thái tài khoản của mình'
            });
        }

        // Update status
        await connection.execute(
            'UPDATE users SET status = ?, updated_at = NOW() WHERE id = ?',
            [status, userId]
        );

        // If suspending or deactivating, also lock the account
        if (status === 'suspended') {
            let lockedUntilValue = locked_until;
            if (!lockedUntilValue) {
                // Nếu client không gửi locked_until thì mặc định 30 ngày
                const now = new Date();
                const until = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
                lockedUntilValue = until.toISOString().slice(0, 19).replace('T', ' ');
            }
            await connection.execute(
                'UPDATE users SET is_account_locked = TRUE, locked_until = ? WHERE id = ?',
                [lockedUntilValue, userId]
            );
        } else if (status === 'active') {
            // Unlock account when activating
            await connection.execute(
                'UPDATE users SET is_account_locked = FALSE, locked_until = NULL, failed_login_attempts = 0 WHERE id = ?',
                [userId]
            );
        }

        // Log access with proper UUID
        try {
            const validUserId = await validateUserId(connection, req.user?.userId);
            if (validUserId) {
                await connection.execute(
                    `INSERT INTO access_logs (
                        user_id, username, action_type, object_type, 
                        object_id, old_values, new_values, status, ip_address, user_agent, created_at
                    ) VALUES (?, ?, 'UPDATE', 'USER_STATUS', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
                    [
                        validUserId,
                        req.user?.name || 'unknown',
                        userId,
                        JSON.stringify({ status: currentUser[0].status }),
                        JSON.stringify({ status }),
                        req.ip || 'unknown',
                        req.get('User-Agent') || 'unknown'
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

// Reset user password (admin function)
const resetUserPassword = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const userId = req.params.id;
        const { newPassword, forceChangeOnLogin = true } = req.body;

        if (!newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Mật khẩu mới là bắt buộc'
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'Mật khẩu phải có ít nhất 8 ký tự'
            });
        }

        // Check if user exists
        const [users] = await connection.execute(
            'SELECT name, email FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng'
            });
        }

        // Hash new password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

        // Set password expiry based on forceChangeOnLogin
        const passwordExpiresAt = forceChangeOnLogin ? 
            new Date() : // Expire immediately to force change
            new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days

        // Update password
        await connection.execute(
            `UPDATE users SET 
             password = ?, 
             last_password_changed_at = NOW(), 
             password_expires_at = ?,
             failed_login_attempts = 0,
             is_account_locked = FALSE,
             locked_until = NULL,
             updated_at = NOW() 
             WHERE id = ?`,
            [hashedPassword, passwordExpiresAt, userId]
        );

        // Log access
        try {
            const validUserId = await validateUserId(connection, req.user?.userId);
            if (validUserId) {
                await connection.execute(
                    `INSERT INTO access_logs (
                        user_id, username, action_type, object_type, 
                        object_id, new_values, status, ip_address, user_agent, created_at
                    ) VALUES (?, ?, 'UPDATE', 'PASSWORD_RESET', ?, ?, 'SUCCESS', ?, ?, NOW())`,
                    [
                        validUserId,
                        req.user?.name || 'unknown',
                        userId,
                        JSON.stringify({ forceChangeOnLogin }),
                        req.ip || 'unknown',
                        req.get('User-Agent') || 'unknown'
                    ]
                );
            }
        } catch (logError) {
            console.error('Error logging access:', logError);
        }

        res.status(200).json({
            success: true,
            message: forceChangeOnLogin ? 
                'Đặt lại mật khẩu thành công. Người dùng sẽ phải đổi mật khẩu khi đăng nhập lần tiếp theo.' :
                'Đặt lại mật khẩu thành công.',
            data: {
                user: {
                    id: userId,
                    name: users[0].name,
                    email: users[0].email
                },
                forceChangeOnLogin
            }
        });

    } catch (error) {
        console.error('Error resetting user password:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi đặt lại mật khẩu',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    updateUser,
    changePassword,
    updateUserStatus,
    resetUserPassword
};