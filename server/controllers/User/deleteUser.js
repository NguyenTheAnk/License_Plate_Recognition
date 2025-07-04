const db = require('../../db');

// Hard delete user (completely remove from database)
const deleteUser = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const userId = req.params.id;

        if (!userId || isNaN(userId)) {
            return res.status(400).json({
                success: false,
                message: 'ID người dùng không hợp lệ'
            });
        }

        // Check if user exists and get current data for logging
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

        // Prevent self-deletion
        if (parseInt(userId) === req.user?.userId) {
            return res.status(400).json({
                success: false,
                message: 'Không thể xóa tài khoản của chính mình'
            });
        }

        // Check if user is the last SuperAdmin
        const [superAdminCheck] = await connection.execute(`
            SELECT COUNT(DISTINCT u.id) as admin_count
            FROM users u
            JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = 1
            JOIN roles r ON ur.role_id = r.id
            WHERE r.name = 'super_admin' AND u.status = 'active' AND u.id != ?
        `, [userId]);

        const [currentUserRoles] = await connection.execute(`
            SELECT r.name
            FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = ? AND ur.is_active = 1 AND r.name = 'super_admin'
        `, [userId]);

        if (currentUserRoles.length > 0 && superAdminCheck[0].admin_count === 0) {
            return res.status(400).json({
                success: false,
                message: 'Không thể xóa SuperAdmin cuối cùng của hệ thống'
            });
        }

        // Start transaction for data integrity
        await connection.beginTransaction();

        try {
            // Log the deletion before actually deleting (important for audit trail)
            await connection.execute(
                `INSERT INTO access_logs (
                    log_uuid, user_id, username, action_type, object_type, 
                    object_id, old_values, status, ip_address, user_agent, created_at
                ) VALUES (UUID(), ?, ?, 'DELETE', 'USER', ?, ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user?.userId || null,
                    req.user?.name || 'system',
                    userId,
                    JSON.stringify(currentUser[0]),
                    req.ip || 'unknown',
                    req.get('User-Agent') || 'unknown'
                ]
            );

            // Step 1: Delete user roles (due to foreign key constraints)
            await connection.execute(
                'DELETE FROM user_roles WHERE user_id = ?',
                [userId]
            );

            // Step 2: Update any records that reference this user to NULL or handle them
            // Update access_logs to preserve history but set user_id to NULL
            await connection.execute(
                'UPDATE access_logs SET user_id = NULL WHERE user_id = ?',
                [userId]
            );

            // Update login_logs to preserve history but set user_id to NULL
            await connection.execute(
                'UPDATE login_logs SET user_id = NULL WHERE user_id = ?',
                [userId]
            );

            // Update vehicle_whitelist - set created_by and approved_by to NULL
            await connection.execute(
                'UPDATE vehicle_whitelist SET created_by = NULL WHERE created_by = ?',
                [userId]
            );

            await connection.execute(
                'UPDATE vehicle_whitelist SET approved_by = NULL WHERE approved_by = ?',
                [userId]
            );

            // Update vehicle_blacklist - set created_by to NULL
            await connection.execute(
                'UPDATE vehicle_blacklist SET created_by = NULL WHERE created_by = ?',
                [userId]
            );

            // Update user_roles assigned_by to NULL
            await connection.execute(
                'UPDATE user_roles SET assigned_by = NULL WHERE assigned_by = ?',
                [userId]
            );

            // Update alerts - set user_id, acknowledged_by, resolved_by to NULL
            await connection.execute(
                'UPDATE alerts SET user_id = NULL WHERE user_id = ?',
                [userId]
            );

            await connection.execute(
                'UPDATE alerts SET acknowledged_by = NULL WHERE acknowledged_by = ?',
                [userId]
            );

            await connection.execute(
                'UPDATE alerts SET resolved_by = NULL WHERE resolved_by = ?',
                [userId]
            );

            // Update license_plate_detections - set verified_by to NULL
            await connection.execute(
                'UPDATE license_plate_detections SET verified_by = NULL WHERE verified_by = ?',
                [userId]
            );

            // Update data_integrity_logs - set checked_by to NULL
            await connection.execute(
                'UPDATE data_integrity_logs SET checked_by = NULL WHERE checked_by = ?',
                [userId]
            );

            // Update system_settings - set last_modified_by to NULL
            await connection.execute(
                'UPDATE system_settings SET last_modified_by = NULL WHERE last_modified_by = ?',
                [userId]
            );

            // Update watermarks - set created_by to NULL
            await connection.execute(
                'UPDATE watermarks SET created_by = NULL WHERE created_by = ?',
                [userId]
            );

            // Step 3: Finally delete the user
            const [deleteResult] = await connection.execute(
                'DELETE FROM users WHERE id = ?',
                [userId]
            );

            if (deleteResult.affectedRows === 0) {
                throw new Error('Không thể xóa người dùng - có thể đã bị xóa bởi người khác');
            }

            // Commit transaction
            await connection.commit();

            res.status(200).json({
                success: true,
                message: 'Xóa người dùng thành công',
                data: {
                    deletedUserId: userId,
                    deletedUserInfo: {
                        email: currentUser[0].email,
                        name: currentUser[0].name
                    }
                }
            });

        } catch (transactionError) {
            // Rollback transaction on error
            await connection.rollback();
            throw transactionError;
        }

    } catch (error) {
        console.error('Error deleting user:', error);
        
        // Log failed access
        try {
            await connection.execute(
                `INSERT INTO access_logs (
                    log_uuid, user_id, username, action_type, object_type, 
                    object_id, status, failure_reason, ip_address, user_agent, created_at
                ) VALUES (UUID(), ?, ?, 'DELETE', 'USER', ?, 'FAILURE', ?, ?, ?, NOW())`,
                [
                    req.user?.userId || null,
                    req.user?.name || 'system',
                    userId,
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
            message: 'Lỗi khi xóa người dùng',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Soft delete user (set status to inactive) - Alternative approach
const deactivateUser = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const userId = req.params.id;

        if (!userId || isNaN(userId)) {
            return res.status(400).json({
                success: false,
                message: 'ID người dùng không hợp lệ'
            });
        }

        // Check if user exists
        const [currentUser] = await connection.execute(
            'SELECT id, name, email, status FROM users WHERE id = ?',
            [userId]
        );

        if (currentUser.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng'
            });
        }

        // Prevent self-deactivation
        if (parseInt(userId) === req.user?.userId) {
            return res.status(400).json({
                success: false,
                message: 'Không thể vô hiệu hóa tài khoản của chính mình'
            });
        }

        const user = currentUser[0];

        // Check if already inactive
        if (user.status === 'inactive') {
            return res.status(400).json({
                success: false,
                message: 'Người dùng đã bị vô hiệu hóa'
            });
        }

        // Check if user is the last active SuperAdmin
        const [superAdminCheck] = await connection.execute(`
            SELECT COUNT(DISTINCT u.id) as admin_count
            FROM users u
            JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = 1
            JOIN roles r ON ur.role_id = r.id
            WHERE r.name = 'super_admin' AND u.status = 'active' AND u.id != ?
        `, [userId]);

        const [currentUserRoles] = await connection.execute(`
            SELECT r.name
            FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = ? AND ur.is_active = 1 AND r.name = 'super_admin'
        `, [userId]);

        if (currentUserRoles.length > 0 && superAdminCheck[0].admin_count === 0) {
            return res.status(400).json({
                success: false,
                message: 'Không thể vô hiệu hóa SuperAdmin cuối cùng của hệ thống'
            });
        }

        // Deactivate user
        await connection.execute(
            `UPDATE users SET 
             status = 'inactive', 
             is_account_locked = TRUE, 
             locked_until = DATE_ADD(NOW(), INTERVAL 1 YEAR),
             updated_at = NOW() 
             WHERE id = ?`,
            [userId]
        );

        // Deactivate all user roles
        await connection.execute(
            'UPDATE user_roles SET is_active = 0 WHERE user_id = ?',
            [userId]
        );

        // Log the deactivation
        await connection.execute(
            `INSERT INTO access_logs (
                log_uuid, user_id, username, action_type, object_type, 
                object_id, old_values, new_values, status, ip_address, user_agent, created_at
            ) VALUES (UUID(), ?, ?, 'UPDATE', 'USER_DEACTIVATE', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user?.userId || null,
                req.user?.name || 'system',
                userId,
                JSON.stringify({ status: user.status }),
                JSON.stringify({ status: 'inactive' }),
                req.ip || 'unknown',
                req.get('User-Agent') || 'unknown'
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Vô hiệu hóa người dùng thành công',
            data: {
                userId: userId,
                userInfo: {
                    name: user.name,
                    email: user.email,
                    previousStatus: user.status,
                    currentStatus: 'inactive'
                }
            }
        });

    } catch (error) {
        console.error('Error deactivating user:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi vô hiệu hóa người dùng',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Reactivate user (restore from inactive status)
const reactivateUser = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const userId = req.params.id;

        if (!userId || isNaN(userId)) {
            return res.status(400).json({
                success: false,
                message: 'ID người dùng không hợp lệ'
            });
        }

        // Check if user exists
        const [currentUser] = await connection.execute(
            'SELECT id, name, email, status FROM users WHERE id = ?',
            [userId]
        );

        if (currentUser.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng'
            });
        }

        const user = currentUser[0];

        // Check if already active
        if (user.status === 'active') {
            return res.status(400).json({
                success: false,
                message: 'Người dùng đã được kích hoạt'
            });
        }

        // Reactivate user
        await connection.execute(
            `UPDATE users SET 
             status = 'active', 
             is_account_locked = FALSE, 
             locked_until = NULL,
             failed_login_attempts = 0,
             updated_at = NOW() 
             WHERE id = ?`,
            [userId]
        );

        // Check if user has any roles, if not assign default role
        const [userRoles] = await connection.execute(
            'SELECT COUNT(*) as role_count FROM user_roles WHERE user_id = ? AND is_active = 1',
            [userId]
        );

        if (userRoles[0].role_count === 0) {
            // Assign default role
            const [defaultRole] = await connection.execute(
                'SELECT id FROM roles WHERE is_default_role = 1 AND is_active = 1 LIMIT 1'
            );

            if (defaultRole.length > 0) {
                await connection.execute(
                    'INSERT INTO user_roles (user_id, role_id, assigned_by, assigned_at, is_active) VALUES (?, ?, ?, NOW(), 1)',
                    [userId, defaultRole[0].id, req.user?.userId || null]
                );
            }
        }

        // Log the reactivation
        await connection.execute(
            `INSERT INTO access_logs (
                log_uuid, user_id, username, action_type, object_type, 
                object_id, old_values, new_values, status, ip_address, user_agent, created_at
            ) VALUES (UUID(), ?, ?, 'UPDATE', 'USER_REACTIVATE', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user?.userId || null,
                req.user?.name || 'system',
                userId,
                JSON.stringify({ status: user.status }),
                JSON.stringify({ status: 'active' }),
                req.ip || 'unknown',
                req.get('User-Agent') || 'unknown'
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Kích hoạt lại người dùng thành công',
            data: {
                userId: userId,
                userInfo: {
                    name: user.name,
                    email: user.email,
                    previousStatus: user.status,
                    currentStatus: 'active'
                }
            }
        });

    } catch (error) {
        console.error('Error reactivating user:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi kích hoạt lại người dùng',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get users pending deletion (if you want to implement a "trash" system)
const getDeletedUsers = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const {
            page = 1,
            limit = 10,
            search = ''
        } = req.query;

        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 10;
        const offset = (pageNum - 1) * limitNum;

        let whereClause = "WHERE u.status = 'inactive'";
        const params = [];

        // Add search filter
        if (search && search.trim()) {
            whereClause += ' AND (u.name LIKE ? OR u.email LIKE ?)';
            const searchTerm = `%${search.trim()}%`;
            params.push(searchTerm, searchTerm);
        }

        // Get total count
        const [countResult] = await connection.execute(
            `SELECT COUNT(*) as total FROM users u ${whereClause}`,
            params
        );
        const totalUsers = countResult[0].total;
        const totalPages = Math.ceil(totalUsers / limitNum);

        // Get inactive users
        const [users] = await connection.execute(`
            SELECT 
                u.id,
                u.name,
                u.email,
                u.phone,
                u.status,
                u.is_account_locked,
                u.locked_until,
                u.created_at,
                u.updated_at
            FROM users u
            ${whereClause}
            ORDER BY u.updated_at DESC
            LIMIT ${limitNum} OFFSET ${offset}
        `, params);

        // Log access
        try {
            await connection.execute(
                `INSERT INTO access_logs (
                    log_uuid, user_id, username, action_type, object_type, 
                    status, ip_address, user_agent, created_at
                ) VALUES (UUID(), ?, ?, 'VIEW', 'DELETED_USERS_LIST', 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user?.userId || null,
                    req.user?.name || 'system',
                    req.ip || 'unknown',
                    req.get('User-Agent') || 'unknown'
                ]
            );
        } catch (logError) {
            console.error('Error logging access:', logError);
        }

        res.status(200).json({
            success: true,
            message: 'Lấy danh sách người dùng đã xóa thành công',
            data: {
                users,
                pagination: {
                    currentPage: pageNum,
                    totalPages,
                    totalUsers,
                    limit: limitNum,
                    hasNextPage: pageNum < totalPages,
                    hasPrevPage: pageNum > 1
                }
            }
        });

    } catch (error) {
        console.error('Error getting deleted users:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách người dùng đã xóa',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Permanently delete user (admin only, for GDPR compliance)
const permanentlyDeleteUser = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const userId = req.params.id;
        const { confirmPassword } = req.body;

        if (!userId || isNaN(userId)) {
            return res.status(400).json({
                success: false,
                message: 'ID người dùng không hợp lệ'
            });
        }

        if (!confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Mật khẩu xác nhận là bắt buộc để xóa vĩnh viễn'
            });
        }

        // Verify admin password
        const [adminUser] = await connection.execute(
            'SELECT password FROM users WHERE id = ?',
            [req.user?.userId]
        );

        if (adminUser.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Không thể xác thực người dùng'
            });
        }

        const bcrypt = require('bcrypt');
        const isValidPassword = await bcrypt.compare(confirmPassword, adminUser[0].password);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Mật khẩu xác nhận không chính xác'
            });
        }

        // Check if user exists and is already inactive
        const [userToDelete] = await connection.execute(
            'SELECT * FROM users WHERE id = ? AND status = ?',
            [userId, 'inactive']
        );

        if (userToDelete.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng hoặc người dùng chưa bị vô hiệu hóa'
            });
        }

        // Start transaction for permanent deletion
        await connection.beginTransaction();

        try {
            // Log the permanent deletion
            await connection.execute(
                `INSERT INTO access_logs (
                    log_uuid, user_id, username, action_type, object_type, 
                    object_id, old_values, status, ip_address, user_agent, created_at
                ) VALUES (UUID(), ?, ?, 'DELETE', 'USER_PERMANENT', ?, ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user?.userId || null,
                    req.user?.name || 'system',
                    userId,
                    JSON.stringify(userToDelete[0]),
                    req.ip || 'unknown',
                    req.get('User-Agent') || 'unknown'
                ]
            );

            // Delete user roles
            await connection.execute(
                'DELETE FROM user_roles WHERE user_id = ?',
                [userId]
            );

            // Anonymize or delete personal data in other tables
            // Update access_logs to remove personal connection
            await connection.execute(
                'UPDATE access_logs SET user_id = NULL WHERE user_id = ?',
                [userId]
            );

            // Update login_logs to remove personal connection
            await connection.execute(
                'UPDATE login_logs SET user_id = NULL WHERE user_id = ?',
                [userId]
            );

            // Remove from other related tables as needed...
            // (Same cleanup as in deleteUser function)

            // Finally delete the user record
            await connection.execute(
                'DELETE FROM users WHERE id = ?',
                [userId]
            );

            await connection.commit();

            res.status(200).json({
                success: true,
                message: 'Xóa vĩnh viễn người dùng thành công',
                data: {
                    deletedUserId: userId,
                    deletedUserEmail: userToDelete[0].email
                }
            });

        } catch (transactionError) {
            await connection.rollback();
            throw transactionError;
        }

    } catch (error) {
        console.error('Error permanently deleting user:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa vĩnh viễn người dùng',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    deleteUser,
    deactivateUser,
    reactivateUser,
    getDeletedUsers,
    permanentlyDeleteUser
};