const express = require('express');
const router = express.Router();

// Import controllers
const { createUser } = require('../controllers/User/createUser');
const { getUserById, getAllUsers, getUserProfile } = require('../controllers/User/getUser');
const { updateUser, changePassword, updateUserStatus } = require('../controllers/User/updateUser');
const { deleteUser, hardDeleteUser, restoreUser } = require('../controllers/User/deleteUser');
const { searchUsers, searchUsersByCriteria, getUsersByRole, getUsersByPermission } = require('../controllers/User/searchUser');
const { getUserStatistics, getUserDetailedView, getUsersWithRolePermissionSummary, getUserActivityReport, getOnlineUsers } = require('../controllers/User/viewUser');

// Import middlewares
const auth = require('../middlewares/authMiddleware');
const checkPermission = require('../middlewares/checkPermission');
const { onlyAdminAccess } = require('../middlewares/adminMiddleware');
const { registerValidator, loginValidator, createUserValidator, updateUserValidator, deleteUserValidator } = require('../helper/validator');

// Import auth controller for login/register
const authController = require('../controllers/authController');

// Authentication routes
router.post('/register', registerValidator, authController.registerUser);
router.post('/login', loginValidator, authController.loginUser);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', auth, authController.logoutUser);

// User profile routes
router.get('/profile', auth, getUserProfile);
router.put('/profile', auth, updateUser);
router.put('/change-password/:id', auth, changePassword);

// User CRUD routes (Admin only)
router.post('/', 
    auth, 
    onlyAdminAccess, 
    checkPermission('users.create'), 
    createUserValidator, 
    createUser
);

router.get('/', 
    auth, 
    getAllUsers
);

router.get('/statistics', 
    auth, 
    getUserStatistics
);

router.get('/online', 
    auth, 
    getOnlineUsers
);

router.get('/summary', 
    auth, 
    getUsersWithRolePermissionSummary
);

router.get('/:id', 
    auth, 
    getUserById
);

router.get('/:id/detailed', 
    auth, 
    getUserDetailedView
);

router.put('/:id', 
    auth, 
    onlyAdminAccess, 
    checkPermission('users.update'), 
    updateUserValidator, 
    updateUser
);

router.put('/:id/status', 
    auth, 
    onlyAdminAccess, 
    checkPermission('users.update'), 
    updateUserStatus
);

router.delete('/:id', 
    auth, 
    onlyAdminAccess, 
    checkPermission('users.delete'), 
    deleteUserValidator, 
    deleteUser
);

router.delete('/:id/hard', 
    auth, 
    onlyAdminAccess, 
    checkPermission('users.delete'), 
    hardDeleteUser
);

router.put('/:id/restore', 
    auth, 
    onlyAdminAccess, 
    checkPermission('users.update'), 
    restoreUser
);

// Search and filter routes
router.get('/search/users', 
    auth, 
    checkPermission('users.search'), 
    searchUsers
);

router.post('/search/criteria', 
    auth, 
    checkPermission('users.search'), 
    searchUsersByCriteria
);

router.get('/role/:roleName', 
    auth, 
    checkPermission('users.view'), 
    getUsersByRole
);

router.get('/permission/:permissionCode', 
    auth, 
    checkPermission('users.view'), 
    getUsersByPermission
);

// Activity and reporting routes
router.get('/activity/report', 
    auth, 
    checkPermission('logs.view'), 
    getUserActivityReport
);

// Role management routes
router.post('/:id/assign-role', 
    auth, 
    onlyAdminAccess, 
    checkPermission('users.update'), 
    async (req, res) => {
        const db = require('../config/db');
        const connection = await db.promise();
        
        try {
            const userId = req.params.id;
            const { roleId } = req.body;

            if (!roleId) {
                return res.status(400).json({
                    success: false,
                    message: 'ID vai trò là bắt buộc'
                });
            }

            // Check if user exists
            const [user] = await connection.execute('SELECT id FROM users WHERE id = ?', [userId]);
            if (user.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy người dùng'
                });
            }

            // Check if role exists
            const [role] = await connection.execute('SELECT id FROM roles WHERE id = ? AND is_active = 1', [roleId]);
            if (role.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy vai trò'
                });
            }

            // Assign role
            await connection.execute(
                `INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE is_active = 1, assigned_at = NOW(), assigned_by = ?`,
                [userId, roleId, req.user.userId, req.user.userId]
            );

            // Log access
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, new_values, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'ASSIGN_ROLE', 'USER', ?, ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user.userId,
                    req.user.username,
                    userId,
                    JSON.stringify({ roleId }),
                    req.ip,
                    req.get('User-Agent')
                ]
            );

            res.status(200).json({
                success: true,
                message: 'Gán vai trò thành công'
            });

        } catch (error) {
            console.error('Error assigning role:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi gán vai trò',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

router.post('/:id/remove-role', 
    auth, 
    onlyAdminAccess, 
    checkPermission('users.update'), 
    async (req, res) => {
        const db = require('../config/db');
        const connection = await db.promise();
        
        try {
            const userId = req.params.id;
            const { roleId } = req.body;

            if (!roleId) {
                return res.status(400).json({
                    success: false,
                    message: 'ID vai trò là bắt buộc'
                });
            }

            // Check if user-role assignment exists
            const [userRole] = await connection.execute(
                'SELECT id FROM user_roles WHERE user_id = ? AND role_id = ? AND is_active = 1',
                [userId, roleId]
            );

            if (userRole.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Người dùng không có vai trò này'
                });
            }

            // Remove role
            await connection.execute(
                'UPDATE user_roles SET is_active = 0 WHERE user_id = ? AND role_id = ?',
                [userId, roleId]
            );

            // Log access
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, old_values, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'REMOVE_ROLE', 'USER', ?, ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user.userId,
                    req.user.username,
                    userId,
                    JSON.stringify({ roleId }),
                    req.ip,
                    req.get('User-Agent')
                ]
            );

            res.status(200).json({
                success: true,
                message: 'Gỡ vai trò thành công'
            });

        } catch (error) {
            console.error('Error removing role:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi gỡ vai trò',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

// Bulk operations
router.post('/bulk/delete', 
    auth, 
    onlyAdminAccess, 
    checkPermission('users.delete'), 
    async (req, res) => {
        const db = require('../config/db');
        const connection = await db.promise();
        
        try {
            const { userIds } = req.body;

            if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Danh sách ID người dùng không hợp lệ'
                });
            }

            // Prevent self-deletion
            if (userIds.includes(req.user.userId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Không thể xóa tài khoản của chính mình'
                });
            }

            // Bulk soft delete
            const placeholders = userIds.map(() => '?').join(',');
            await connection.execute(
                `UPDATE users SET status = 'inactive', updated_at = NOW() WHERE id IN (${placeholders})`,
                userIds
            );

            // Deactivate roles
            await connection.execute(
                `UPDATE user_roles SET is_active = 0 WHERE user_id IN (${placeholders})`,
                userIds
            );

            // Log access
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, new_values, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'BULK_DELETE', 'USERS', ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user.userId,
                    req.user.username,
                    JSON.stringify({ userIds, count: userIds.length }),
                    req.ip,
                    req.get('User-Agent')
                ]
            );

            res.status(200).json({
                success: true,
                message: `Xóa thành công ${userIds.length} người dùng`,
                data: { deletedCount: userIds.length }
            });

        } catch (error) {
            console.error('Error bulk deleting users:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi xóa nhiều người dùng',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

router.post('/bulk/assign-role', 
    auth, 
    onlyAdminAccess, 
    checkPermission('users.update'), 
    async (req, res) => {
        const db = require('../config/db');
        const connection = await db.promise();
        
        try {
            const { userIds, roleId } = req.body;

            if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Danh sách ID người dùng không hợp lệ'
                });
            }

            if (!roleId) {
                return res.status(400).json({
                    success: false,
                    message: 'ID vai trò là bắt buộc'
                });
            }

            // Check if role exists
            const [role] = await connection.execute('SELECT id FROM roles WHERE id = ? AND is_active = 1', [roleId]);
            if (role.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy vai trò'
                });
            }

            // Bulk assign role
            const values = userIds.map(userId => `(${userId}, ${roleId}, ${req.user.userId})`).join(', ');
            await connection.execute(
                `INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ${values}
                 ON DUPLICATE KEY UPDATE is_active = 1, assigned_at = NOW(), assigned_by = ${req.user.userId}`
            );

            // Log access
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, new_values, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'BULK_ASSIGN_ROLE', 'USERS', ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user.userId,
                    req.user.username,
                    JSON.stringify({ userIds, roleId, count: userIds.length }),
                    req.ip,
                    req.get('User-Agent')
                ]
            );

            res.status(200).json({
                success: true,
                message: `Gán vai trò thành công cho ${userIds.length} người dùng`,
                data: { assignedCount: userIds.length }
            });

        } catch (error) {
            console.error('Error bulk assigning role:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi gán vai trò cho nhiều người dùng',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

router.post('/bulk/update-status', 
    auth, 
    onlyAdminAccess, 
    checkPermission('users.update'), 
    async (req, res) => {
        const db = require('../config/db');
        const connection = await db.promise();
        
        try {
            const { userIds, status } = req.body;

            if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Danh sách ID người dùng không hợp lệ'
                });
            }

            if (!['active', 'inactive', 'suspended'].includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Trạng thái không hợp lệ'
                });
            }

            // Prevent changing own status
            if (userIds.includes(req.user.userId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Không thể thay đổi trạng thái tài khoản của chính mình'
                });
            }

            // Bulk update status
            const placeholders = userIds.map(() => '?').join(',');
            await connection.execute(
                `UPDATE users SET status = ?, updated_at = NOW() WHERE id IN (${placeholders})`,
                [status, ...userIds]
            );

            // Log access
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, new_values, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'BULK_UPDATE_STATUS', 'USERS', ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user.userId,
                    req.user.username,
                    JSON.stringify({ userIds, status, count: userIds.length }),
                    req.ip,
                    req.get('User-Agent')
                ]
            );

            res.status(200).json({
                success: true,
                message: `Cập nhật trạng thái thành công cho ${userIds.length} người dùng`,
                data: { updatedCount: userIds.length }
            });

        } catch (error) {
            console.error('Error bulk updating status:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi cập nhật trạng thái nhiều người dùng',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

// Export and import routes
router.get('/export/csv', 
    auth, 
    checkPermission('reports.export'), 
    async (req, res) => {
        const db = require('../config/db');
        const connection = await db.promise();
        
        try {
            const { status = '', role = '' } = req.query;
            
            let whereClause = 'WHERE 1=1';
            const params = [];

            if (status) {
                whereClause += ' AND u.status = ?';
                params.push(status);
            }

            if (role) {
                whereClause += ' AND EXISTS (SELECT 1 FROM user_roles ur2 JOIN roles r2 ON ur2.role_id = r2.id WHERE ur2.user_id = u.id AND ur2.is_active = 1 AND r2.name = ?)';
                params.push(role);
            }

            const [users] = await connection.execute(`
                SELECT 
                    u.id,
                    u.name,
                    u.username,
                    u.email,
                    u.phone,
                    u.status,
                    u.last_login,
                    u.created_at,
                    GROUP_CONCAT(DISTINCT r.name ORDER BY r.level DESC SEPARATOR ', ') as roles,
                    COUNT(DISTINCT p.id) as permission_count
                FROM users u
                LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = 1
                LEFT JOIN roles r ON ur.role_id = r.id AND r.is_active = 1
                LEFT JOIN role_permissions rp ON r.id = rp.role_id AND rp.granted = 1
                LEFT JOIN permissions p ON rp.permission_id = p.id AND p.is_active = 1
                ${whereClause}
                GROUP BY u.id
                ORDER BY u.created_at DESC
            `, params);

            // Log export
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, request_data, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'EXPORT', 'USERS_CSV', ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user.userId,
                    req.user.username,
                    JSON.stringify({ count: users.length, filters: { status, role } }),
                    req.ip,
                    req.get('User-Agent')
                ]
            );

            // Convert to CSV format
            const csvHeader = 'ID,Tên,Tên đăng nhập,Email,Điện thoại,Trạng thái,Đăng nhập cuối,Ngày tạo,Vai trò,Số quyền\n';
            const csvData = users.map(user => 
                `${user.id},"${user.name}","${user.username}","${user.email}","${user.phone || ''}","${user.status}","${user.last_login || ''}","${user.created_at}","${user.roles || ''}","${user.permission_count}"`
            ).join('\n');

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename=users_${new Date().toISOString().split('T')[0]}.csv`);
            res.send('\ufeff' + csvHeader + csvData); // UTF-8 BOM for Excel

        } catch (error) {
            console.error('Error exporting users:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi xuất dữ liệu người dùng',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

// Password reset routes
router.post('/forgot-password', async (req, res) => {
    const db = require('../config/db');
    const connection = await db.promise();
    
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email là bắt buộc'
            });
        }

        // Check if user exists
        const [users] = await connection.execute('SELECT id, name FROM users WHERE email = ? AND status = ?', [email, 'active']);
        
        if (users.length === 0) {
            // Don't reveal if email exists or not for security
            return res.status(200).json({
                success: true,
                message: 'Nếu email tồn tại, bạn sẽ nhận được link đặt lại mật khẩu'
            });
        }

        // In a real application, you would:
        // 1. Generate a secure reset token
        // 2. Store it in database with expiry time
        // 3. Send email with reset link
        
        // For now, just return success
        res.status(200).json({
            success: true,
            message: 'Link đặt lại mật khẩu đã được gửi đến email của bạn'
        });

    } catch (error) {
        console.error('Error in forgot password:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xử lý yêu cầu đặt lại mật khẩu'
        });
    }
});

// Health check route
router.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'User API is healthy',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;