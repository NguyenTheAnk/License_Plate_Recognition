const db = require('../../db');

// Get user statistics
const getUserStatistics = async (req, res) => {
    const connection = await db.promise();
    
    try {
        // Get overall user statistics
        const [userStats] = await connection.execute(`
            SELECT 
                COUNT(*) as total_users,
                COUNT(CASE WHEN status = 'active' THEN 1 END) as active_users,
                COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive_users,
                COUNT(CASE WHEN status = 'suspended' THEN 1 END) as suspended_users,
                COUNT(CASE WHEN account_locked = 1 THEN 1 END) as locked_users,
                COUNT(CASE WHEN last_login >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as active_last_30_days,
                COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as new_users_last_30_days
            FROM users
        `);

        // Get user count by roles
        const [roleStats] = await connection.execute(`
            SELECT 
                r.name as role_name,
                r.description as role_description,
                COUNT(ur.user_id) as user_count
            FROM roles r
            LEFT JOIN user_roles ur ON r.id = ur.role_id AND ur.is_active = 1
            LEFT JOIN users u ON ur.user_id = u.id AND u.status = 'active'
            WHERE r.is_active = 1
            GROUP BY r.id, r.name
            ORDER BY user_count DESC
        `);

        // Get recent login activity
        const [recentActivity] = await connection.execute(`
            SELECT 
                DATE(created_at) as login_date,
                COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_logins,
                COUNT(CASE WHEN status = 'fail' THEN 1 END) as failed_logins,
                COUNT(DISTINCT user_id) as unique_users
            FROM login_logs
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            GROUP BY DATE(created_at)
            ORDER BY login_date DESC
        `);

        // Get user registration trend (last 30 days)
        const [registrationTrend] = await connection.execute(`
            SELECT 
                DATE(created_at) as registration_date,
                COUNT(*) as new_users
            FROM users
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY DATE(created_at)
            ORDER BY registration_date DESC
        `);

        res.status(200).json({
            success: true,
            message: 'Lấy thống kê người dùng thành công',
            data: {
                overview: userStats[0],
                roleStats,
                recentActivity,
                registrationTrend
            }
        });

    } catch (error) {
        console.error('Error getting user statistics:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thống kê người dùng',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get user detailed view with comprehensive information - FIXED VERSION
const getUserDetailedView = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const userId = req.params.id;

        if (!userId || isNaN(userId)) {
            return res.status(400).json({
                success: false,
                message: 'ID người dùng không hợp lệ'
            });
        }

        // Get user basic information - FIXED VERSION
        const [userInfo] = await connection.execute(`
            SELECT 
                u.id,
                u.name,
                u.username,
                u.email,
                u.phone,
                u.status,
                u.last_login,
                u.last_password_change,
                u.failed_login_attempts,
                u.account_locked,
                u.lock_until,
                u.created_at,
                u.updated_at
            FROM users u
            WHERE u.id = ?
        `, [userId]);

        if (userInfo.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng'
            });
        }

        const user = userInfo[0];

        // Get roles separately
        const [userRoles] = await connection.execute(`
            SELECT DISTINCT
                r.id,
                r.name,
                r.description,
                r.level,
                ur.assigned_at,
                ab.name as assigned_by_name
            FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            LEFT JOIN users ab ON ur.assigned_by = ab.id
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

        // Get user's recent login history
        const [loginHistory] = await connection.execute(`
            SELECT 
                status,
                ip_address,
                user_agent,
                failure_reason,
                created_at
            FROM login_logs
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 10
        `, [userId]);

        // Get user's recent access logs
        const [accessLogs] = await connection.execute(`
            SELECT 
                action_type,
                object_type,
                object_id,
                status,
                ip_address,
                created_at
            FROM access_logs
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 20
        `, [userId]);

        // Get user's activity statistics
        const [activityStats] = await connection.execute(`
            SELECT 
                COUNT(CASE WHEN al.action_type = 'LOGIN' AND al.status = 'SUCCESS' THEN 1 END) as total_logins,
                COUNT(CASE WHEN al.action_type = 'VIEW' THEN 1 END) as total_views,
                COUNT(CASE WHEN al.action_type = 'CREATE' THEN 1 END) as total_creates,
                COUNT(CASE WHEN al.action_type = 'UPDATE' THEN 1 END) as total_updates,
                COUNT(CASE WHEN al.action_type = 'DELETE' THEN 1 END) as total_deletes,
                MAX(al.created_at) as last_activity,
                COUNT(CASE WHEN al.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as activity_last_30_days
            FROM access_logs al
            WHERE al.user_id = ?
        `, [userId]);

        res.status(200).json({
            success: true,
            message: 'Lấy thông tin chi tiết người dùng thành công',
            data: {
                user,
                loginHistory,
                accessLogs,
                activityStats: activityStats[0]
            }
        });

    } catch (error) {
        console.error('Error getting user detailed view:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin chi tiết người dùng',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// FIXED: Get users with role and permission summary
const getUsersWithRolePermissionSummary = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const {
            page = 1,
            limit = 10,
            status = '',
            sort = 'created_at',
            order = 'desc'
        } = req.query;

        // Convert to integers
        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 10;
        const offset = (pageNum - 1) * limitNum;

        let whereClause = 'WHERE 1=1';
        const params = [];

        if (status && status.trim()) {
            whereClause += ' AND u.status = ?';
            params.push(status.trim());
        }

        // Validate sort column
        const allowedSortColumns = ['name', 'username', 'email', 'status', 'created_at', 'last_login'];
        const sortColumn = allowedSortColumns.includes(sort) ? sort : 'created_at';
        const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        console.log('Query params:', { pageNum, limitNum, offset, status, sort, order });
        console.log('Where clause:', whereClause);
        console.log('Params:', params);

        // Get total count
        const [countResult] = await connection.execute(`
            SELECT COUNT(*) as total
            FROM users u
            ${whereClause}
        `, params);

        const totalUsers = countResult[0].total;
        const totalPages = Math.ceil(totalUsers / limitNum);

        console.log('Total users:', totalUsers);

        // FIXED: Get users basic info with string interpolation for LIMIT/OFFSET
        const userQuery = `
            SELECT 
                u.id,
                u.name,
                u.username,
                u.email,
                u.phone,
                u.status,
                u.last_login,
                u.account_locked,
                u.created_at,
                u.updated_at
            FROM users u
            ${whereClause}
            ORDER BY u.${sortColumn} ${sortOrder}
            LIMIT ${limitNum} OFFSET ${offset}
        `;

        console.log('User query:', userQuery);
        console.log('Final params:', params);

        const [users] = await connection.execute(userQuery, params);

        console.log('Found users:', users.length);

        // Get role and permission summary for each user using optimized queries
        if (users.length > 0) {
            const userIds = users.map(user => user.id);
            const placeholders = userIds.map(() => '?').join(',');

            // Get all role info for all users in one query
            const [allRoleInfo] = await connection.execute(`
                SELECT 
                    ur.user_id,
                    COUNT(DISTINCT ur.role_id) as role_count,
                    GROUP_CONCAT(DISTINCT r.name ORDER BY r.level DESC SEPARATOR ', ') as role_names,
                    MAX(r.level) as highest_role_level
                FROM user_roles ur
                JOIN roles r ON ur.role_id = r.id
                WHERE ur.user_id IN (${placeholders}) 
                AND ur.is_active = 1 
                AND r.is_active = 1
                GROUP BY ur.user_id
            `, userIds);

            // Get all permission counts for all users in one query
            const [allPermissionInfo] = await connection.execute(`
                SELECT 
                    ur.user_id,
                    COUNT(DISTINCT p.id) as permission_count
                FROM user_roles ur
                JOIN roles r ON ur.role_id = r.id
                JOIN role_permissions rp ON r.id = rp.role_id
                JOIN permissions p ON rp.permission_id = p.id
                WHERE ur.user_id IN (${placeholders}) 
                AND ur.is_active = 1 
                AND r.is_active = 1 
                AND rp.granted = 1 
                AND p.is_active = 1
                GROUP BY ur.user_id
            `, userIds);

            // Get all roles for all users in one query
            const [allUserRoles] = await connection.execute(`
                SELECT 
                    ur.user_id,
                    r.id,
                    r.name,
                    r.level
                FROM user_roles ur
                JOIN roles r ON ur.role_id = r.id
                WHERE ur.user_id IN (${placeholders}) 
                AND ur.is_active = 1 
                AND r.is_active = 1
                ORDER BY ur.user_id, r.level DESC
            `, userIds);

            // Map data to users
            users.forEach(user => {
                // Find role info for this user
                const roleInfo = allRoleInfo.find(ri => ri.user_id === user.id);
                user.role_count = roleInfo ? roleInfo.role_count : 0;
                user.role_names = roleInfo ? roleInfo.role_names : '';
                user.highest_role_level = roleInfo ? roleInfo.highest_role_level : 0;

                // Find permission info for this user
                const permissionInfo = allPermissionInfo.find(pi => pi.user_id === user.id);
                user.permission_count = permissionInfo ? permissionInfo.permission_count : 0;

                // Find roles for this user
                user.roles = allUserRoles.filter(role => role.user_id === user.id)
                    .map(role => ({
                        id: role.id,
                        name: role.name,
                        level: role.level
                    }));
            });
        }

        res.status(200).json({
            success: true,
            message: 'Lấy danh sách người dùng với tóm tắt vai trò thành công',
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
        console.error('Error getting users with role permission summary:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            sql: error.sql
        });
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách người dùng',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// FIXED: Get user activity report
const getUserActivityReport = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const {
            userId,
            startDate,
            endDate,
            actionType = '',
            page = 1,
            limit = 20
        } = req.query;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'ID người dùng là bắt buộc'
            });
        }

        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 20;
        const offset = (pageNum - 1) * limitNum;

        let whereClause = 'WHERE al.user_id = ?';
        const params = [userId];

        if (startDate) {
            whereClause += ' AND DATE(al.created_at) >= ?';
            params.push(startDate);
        }

        if (endDate) {
            whereClause += ' AND DATE(al.created_at) <= ?';
            params.push(endDate);
        }

        if (actionType) {
            whereClause += ' AND al.action_type = ?';
            params.push(actionType);
        }

        // Get total count
        const [countResult] = await connection.execute(`
            SELECT COUNT(*) as total
            FROM access_logs al
            ${whereClause}
        `, params);

        const totalActivities = countResult[0].total;
        const totalPages = Math.ceil(totalActivities / limitNum);

        // FIXED: Get activity details with string interpolation for LIMIT/OFFSET
        const activitiesQuery = `
            SELECT 
                al.id,
                al.action_type,
                al.object_type,
                al.object_id,
                al.status,
                al.ip_address,
                al.user_agent,
                al.failure_reason,
                al.response_time_ms,
                al.created_at,
                u.name as user_name,
                u.username
            FROM access_logs al
            JOIN users u ON al.user_id = u.id
            ${whereClause}
            ORDER BY al.created_at DESC
            LIMIT ${limitNum} OFFSET ${offset}
        `;

        const [activities] = await connection.execute(activitiesQuery, params);

        // Get activity summary
        const [activitySummary] = await connection.execute(`
            SELECT 
                al.action_type,
                COUNT(*) as count,
                COUNT(CASE WHEN al.status = 'SUCCESS' THEN 1 END) as success_count,
                COUNT(CASE WHEN al.status = 'FAILURE' THEN 1 END) as failure_count,
                AVG(al.response_time_ms) as avg_response_time
            FROM access_logs al
            ${whereClause}
            GROUP BY al.action_type
            ORDER BY count DESC
        `, params);

        res.status(200).json({
            success: true,
            message: 'Lấy báo cáo hoạt động người dùng thành công',
            data: {
                activities,
                summary: activitySummary,
                pagination: {
                    currentPage: pageNum,
                    totalPages,
                    totalActivities,
                    limit: limitNum,
                    hasNextPage: pageNum < totalPages,
                    hasPrevPage: pageNum > 1
                },
                filters: {
                    userId,
                    startDate,
                    endDate,
                    actionType
                }
            }
        });

    } catch (error) {
        console.error('Error getting user activity report:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy báo cáo hoạt động người dùng',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get online users (users with recent activity) - FIXED VERSION
const getOnlineUsers = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { timeWindow = 15 } = req.query; // minutes

        // Get users with recent activity
        const [onlineUsers] = await connection.execute(`
            SELECT DISTINCT
                u.id,
                u.name,
                u.username,
                u.email,
                u.status,
                u.last_login,
                MAX(al.created_at) as last_activity,
                COUNT(al.id) as recent_actions
            FROM users u
            JOIN access_logs al ON u.id = al.user_id
            WHERE al.created_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
            AND u.status = 'active'
            GROUP BY u.id
            ORDER BY last_activity DESC
        `, [timeWindow]);

        // Get roles for each online user
        if (onlineUsers.length > 0) {
            const userIds = onlineUsers.map(user => user.id);
            const placeholders = userIds.map(() => '?').join(',');

            const [allUserRoles] = await connection.execute(`
                SELECT 
                    ur.user_id,
                    r.id,
                    r.name,
                    r.level
                FROM user_roles ur
                JOIN roles r ON ur.role_id = r.id
                WHERE ur.user_id IN (${placeholders}) 
                AND ur.is_active = 1 
                AND r.is_active = 1
            `, userIds);

            // Map roles to users
            onlineUsers.forEach(user => {
                user.roles = allUserRoles
                    .filter(role => role.user_id === user.id)
                    .map(role => ({
                        id: role.id,
                        name: role.name,
                        level: role.level
                    }));
            });
        }

        res.status(200).json({
            success: true,
            message: 'Lấy danh sách người dùng đang online thành công',
            data: {
                onlineUsers,
                count: onlineUsers.length,
                timeWindow: `${timeWindow} phút`
            }
        });

    } catch (error) {
        console.error('Error getting online users:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách người dùng đang online',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    getUserStatistics,
    getUserDetailedView,
    getUsersWithRolePermissionSummary,
    getUserActivityReport,
    getOnlineUsers
};