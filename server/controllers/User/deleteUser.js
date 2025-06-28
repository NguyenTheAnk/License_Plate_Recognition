const db = require('../../db');

// Soft delete user (set status to inactive)
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
        if (parseInt(userId) === req.user.userId) {
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
            WHERE r.name = 'SuperAdmin' AND u.status = 'active' AND u.id != ?
        `, [userId]);

        const [currentUserRoles] = await connection.execute(`
            SELECT r.name
            FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = ? AND ur.is_active = 1 AND r.name = 'SuperAdmin'
        `, [userId]);

        if (currentUserRoles.length > 0 && superAdminCheck[0].admin_count === 0) {
            return res.status(400).json({
                success: false,
                message: 'Không thể xóa SuperAdmin cuối cùng của hệ thống'
            });
        }

        // Soft delete: set status to inactive instead of actually deleting
        await connection.execute(
            'UPDATE users SET status = ?, updated_at = NOW() WHERE id = ?',
            ['inactive', userId]
        );

        // Deactivate all user roles
        await connection.execute(
            'UPDATE user_roles SET is_active = 0 WHERE user_id = ?',
            [userId]
        );

        // Log access
        try {
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, old_values, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'DELETE', 'USER', ?, ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user.userId,
                    req.user.username,
                    userId,
                    JSON.stringify(currentUser[0]),
                    req.ip,
                    req.get('User-Agent')
                ]
            );
        } catch (logError) {
            console.error('Error logging access:', logError);
        }

        res.status(200).json({
            success: true,
            message: 'Xóa người dùng thành công'
        });

    } catch (error) {
        console.error('Error deleting user:', error);
        
        // Log failed access
        try {
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, status, failure_reason, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'DELETE', 'USER', ?, 'FAILURE', ?, ?, ?, NOW())`,
                [
                    req.user?.userId,
                    req.user?.username,
                    req.params.id,
                    error.message,
                    req.ip,
                    req.get('User-Agent')
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

// Hard delete user (permanently remove from database)
const hardDeleteUser = async (req, res) => {
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
        if (parseInt(userId) === req.user.userId) {
            return res.status(400).json({
                success: false,
                message: 'Không thể xóa tài khoản của chính mình'
            });
        }

        // Check if user has related data that prevents deletion
        const [relatedData] = await connection.execute(`
            SELECT 
                (SELECT COUNT(*) FROM license_plate_detections WHERE verified_by = ?) as detection_count,
                (SELECT COUNT(*) FROM access_control_lists WHERE added_by = ?) as acl_count,
                (SELECT COUNT(*) FROM alerts WHERE acknowledged_by = ? OR resolved_by = ?) as alert_count
        `, [userId, userId, userId, userId]);

        if (relatedData[0].detection_count > 0 || relatedData[0].acl_count > 0 || relatedData[0].alert_count > 0) {
            return res.status(400).json({
                success: false,
                message: 'Không thể xóa người dùng này vì còn có dữ liệu liên quan trong hệ thống. Vui lòng sử dụng xóa mềm (soft delete).'
            });
        }

        // Begin transaction for hard delete
        await connection.execute('START TRANSACTION');

        try {
            // Delete user roles first (foreign key constraint)
            await connection.execute('DELETE FROM user_roles WHERE user_id = ?', [userId]);
            
            // Delete user
            await connection.execute('DELETE FROM users WHERE id = ?', [userId]);

            // Commit transaction
            await connection.execute('COMMIT');

            // Log access
            try {
                await connection.execute(
                    `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, old_values, status, ip_address, user_agent, created_at)
                     VALUES (?, ?, 'DELETE', 'USER_HARD', ?, ?, 'SUCCESS', ?, ?, NOW())`,
                    [
                        req.user.userId,
                        req.user.username,
                        userId,
                        JSON.stringify(currentUser[0]),
                        req.ip,
                        req.get('User-Agent')
                    ]
                );
            } catch (logError) {
                console.error('Error logging access:', logError);
            }

            res.status(200).json({
                success: true,
                message: 'Xóa người dùng vĩnh viễn thành công'
            });

        } catch (transactionError) {
            // Rollback transaction
            await connection.execute('ROLLBACK');
            throw transactionError;
        }

    } catch (error) {
        console.error('Error hard deleting user:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa người dùng vĩnh viễn',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Restore soft deleted user - FIXED VERSION
const restoreUser = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const userId = req.params.id;

        if (!userId || isNaN(userId)) {
            return res.status(400).json({
                success: false,
                message: 'ID người dùng không hợp lệ'
            });
        }

        // Check if user exists and is inactive
        const [currentUser] = await connection.execute(
            'SELECT * FROM users WHERE id = ? AND status = ?',
            [userId, 'inactive']
        );

        if (currentUser.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng đã bị xóa'
            });
        }

        // Restore user
        await connection.execute(
            'UPDATE users SET status = ?, updated_at = NOW() WHERE id = ?',
            ['active', userId]
        );

        // Get user with roles after restore - FIXED VERSION
        const [restoredUser] = await connection.execute(`
            SELECT 
                u.id,
                u.name,
                u.username,
                u.email,
                u.phone,
                u.status,
                u.created_at,
                u.updated_at
            FROM users u
            WHERE u.id = ?
        `, [userId]);

        const user = restoredUser[0];

        // Get roles separately
        const [userRoles] = await connection.execute(`
            SELECT DISTINCT
                r.id,
                r.name,
                r.description,
                r.level
            FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = ? AND r.is_active = 1
        `, [userId]);

        user.roles = userRoles;

        // Log access
        try {
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, new_values, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'RESTORE', 'USER', ?, ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user.userId,
                    req.user.username,
                    userId,
                    JSON.stringify({ status: 'active' }),
                    req.ip,
                    req.get('User-Agent')
                ]
            );
        } catch (logError) {
            console.error('Error logging access:', logError);
        }

        res.status(200).json({
            success: true,
            message: 'Khôi phục người dùng thành công',
            data: { user }
        });

    } catch (error) {
        console.error('Error restoring user:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi khôi phục người dùng',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    deleteUser,
    hardDeleteUser,
    restoreUser
};