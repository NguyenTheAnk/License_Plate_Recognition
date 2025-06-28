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

        // Start transaction for data integrity
        await connection.beginTransaction();

        try {
            // Log the deletion before actually deleting (important for audit trail)
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, old_values, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'DELETE', 'USER', ?, ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user.userId,
                    req.user.username,
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

            // Update any assignments/created_by fields that reference this user
            // Access control lists - set added_by to NULL
            await connection.execute(
                'UPDATE access_control_lists SET added_by = NULL WHERE added_by = ?',
                [userId]
            );

            // Update user_roles assigned_by to NULL
            await connection.execute(
                'UPDATE user_roles SET assigned_by = NULL WHERE assigned_by = ?',
                [userId]
            );

            // Update any other tables that might reference this user
            // Alerts - set user_id, acknowledged_by, resolved_by to NULL
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

            // License plate detections - set verified_by to NULL
            await connection.execute(
                'UPDATE license_plate_detections SET verified_by = NULL WHERE verified_by = ?',
                [userId]
            );

            // Data integrity logs - set checked_by to NULL
            await connection.execute(
                'UPDATE data_integrity_logs SET checked_by = NULL WHERE checked_by = ?',
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
                        username: currentUser[0].username,
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
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, status, failure_reason, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'DELETE', 'USER', ?, 'FAILURE', ?, ?, ?, NOW())`,
                [
                    req.user?.userId || null,
                    req.user?.username || 'unknown',
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



module.exports = {
    deleteUser
};