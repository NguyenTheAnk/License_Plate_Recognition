const db = require('../../db');

// Get user statistics
const getUserStatistics = async (req, res) => {
    let connection;
    
    try {
        connection = await db.promise();
        
        // Get overall user statistics
        const [userStats] = await connection.execute(`
            SELECT 
                COUNT(*) as total_users,
                COUNT(CASE WHEN status = 'active' THEN 1 END) as active_users,
                COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive_users,
                COUNT(CASE WHEN status = 'suspended' THEN 1 END) as suspended_users,
                COUNT(CASE WHEN is_account_locked = 1 THEN 1 END) as locked_users,
                COUNT(CASE WHEN last_login_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as active_last_30_days,
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

        // Get recent login activity (use proper table check)
        let recentActivity = [];
        try {
            const [loginActivity] = await connection.execute(`
                SELECT 
                    DATE(login_at) as login_date,
                    COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_logins,
                    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_logins,
                    COUNT(DISTINCT user_id) as unique_users
                FROM login_logs
                WHERE login_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                GROUP BY DATE(login_at)
                ORDER BY login_date DESC
            `);
            recentActivity = loginActivity;
        } catch (tableError) {
            console.warn('login_logs table may not exist:', tableError.message);
            recentActivity = [];
        }

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

// FIXED: Enhanced getUserDetailedView with proper MySQL handling
const getUserDetailedView = async (req, res) => {
    let connection;
    
    try {
        connection = await db.promise();
        const userId = req.params.id;
        
        console.log('[getUserDetailedView] Received userId:', userId);

        // Validate userId
        if (!userId || isNaN(parseInt(userId))) {
            console.log('[getUserDetailedView] Invalid userId:', userId);
            return res.status(400).json({
                success: false,
                message: 'ID người dùng không hợp lệ'
            });
        }

        const userIdInt = parseInt(userId);

        // Get pagination parameters with validation
        const loginPage = Math.max(1, parseInt(req.query.loginPage, 10) || 1);
        const loginLimit = Math.min(50, Math.max(5, parseInt(req.query.loginLimit, 10) || 10));
        const accessPage = Math.max(1, parseInt(req.query.accessPage, 10) || 1);
        const accessLimit = Math.min(50, Math.max(5, parseInt(req.query.accessLimit, 10) || 15));

        // FIXED: Ensure safe integers for string interpolation
        const loginOffset = Math.max(0, (loginPage - 1) * loginLimit);
        const accessOffset = Math.max(0, (accessPage - 1) * accessLimit);



        // STEP 1: Get user basic information
        const [userInfo] = await connection.execute(`
            SELECT 
                u.id,
                u.name,
                u.email,
                u.phone,
                u.status,
                u.last_login_at,
                u.last_password_changed_at,
                u.failed_login_attempts,
                u.is_account_locked,
                u.locked_until,
                u.created_at,
                u.updated_at
            FROM users u
            WHERE u.id = ?
        `, [userIdInt]);

        if (userInfo.length === 0) {
            console.log('[getUserDetailedView] User not found:', userIdInt);
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng'
            });
        }

        const user = userInfo[0];
        console.log('[getUserDetailedView] Found user:', user.name);

        // STEP 2: Get user roles with details
        console.log('[getUserDetailedView] Fetching user roles...');
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
            ORDER BY r.level DESC
        `, [userIdInt]);

        console.log('[getUserDetailedView] Found roles:', userRoles.length);

        // STEP 3: Get permissions for each role (if any roles exist)
        let rolesWithModules = [];
        if (userRoles.length > 0) {
            const roleIds = userRoles.map(r => r.id);
            const placeholders = roleIds.map(() => '?').join(',');
            
            console.log('[getUserDetailedView] Fetching role permissions for roles:', roleIds);
            
            try {
                const rolePermsQuery = `
                    SELECT
                        rp.role_id,
                        p.module,
                        p.action
                    FROM role_permissions rp
                    JOIN permissions p ON rp.permission_id = p.id
                    WHERE rp.role_id IN (${placeholders})
                      AND rp.granted = 1
                      AND p.is_active = 1
                `;
                const [rolePerms] = await connection.execute(rolePermsQuery, roleIds);
                console.log('[getUserDetailedView] Found permissions:', rolePerms.length);

                // Group permissions by role -> module -> actions
                rolesWithModules = userRoles.map(role => {
                    const perms = rolePerms.filter(rp => rp.role_id === role.id);
                    const modules = {};
                    perms.forEach(p => {
                        if (!modules[p.module]) modules[p.module] = [];
                        if (!modules[p.module].includes(p.action)) {
                            modules[p.module].push(p.action);
                        }
                    });
                    return { ...role, modules };
                });
            } catch (permError) {
                console.warn('[getUserDetailedView] Error fetching permissions:', permError.message);
                // Continue without permissions if table doesn't exist
                rolesWithModules = userRoles.map(role => ({ ...role, modules: {} }));
            }
        } else {
            rolesWithModules = [];
        }

        user.roles = rolesWithModules;

        // STEP 4: Get login history with total count (with table existence check)
        let loginHistory = [];
        let totalLoginLogs = 0;
        
        try {
            console.log('[getUserDetailedView] Fetching login history...');
            const [loginCountResult] = await connection.execute(`
                SELECT COUNT(*) as total FROM login_logs WHERE user_id = ?
            `, [userIdInt]);
            totalLoginLogs = loginCountResult[0]?.total || 0;

            // FIXED: Use string interpolation for LIMIT/OFFSET
            const loginQuery = `
                SELECT 
                    id,
                    email,
                    ip_address,
                    user_agent,
                    status,
                    failure_reason,
                    session_id,
                    login_at as created_at
                FROM login_logs
                WHERE user_id = ?
                ORDER BY login_at DESC
                LIMIT ${loginLimit} OFFSET ${loginOffset}
            `;
            const [loginHistoryResult] = await connection.execute(loginQuery, [userIdInt]);
            loginHistory = loginHistoryResult;
            
            console.log('[getUserDetailedView] Login history count:', loginHistory.length);
        } catch (loginError) {
            console.warn('[getUserDetailedView] login_logs table may not exist:', loginError.message);
            loginHistory = [];
            totalLoginLogs = 0;
        }

        // STEP 5: Get access logs with total count (with table existence check)
        let accessLogs = [];
        let totalAccessLogs = 0;
        
        try {
            console.log('[getUserDetailedView] Fetching access logs...');
            const [accessCountResult] = await connection.execute(`
                SELECT COUNT(*) as total FROM access_logs WHERE user_id = ?
            `, [userIdInt]);
            totalAccessLogs = accessCountResult[0]?.total || 0;

            // FIXED: Use string interpolation for LIMIT/OFFSET
            const accessQuery = `
                SELECT 
                    id,
                    action_type,
                    object_type,
                    object_id,
                    object_name,
                    status,
                    response_time_ms,
                    records_affected,
                    ip_address,
                    user_agent,
                    request_method,
                    request_url,
                    failure_reason,
                    error_code,
                    session_id,
                    created_at
                FROM access_logs
                WHERE user_id = ?
                ORDER BY created_at DESC
                LIMIT ${accessLimit} OFFSET ${accessOffset}
            `;
            const [accessLogsResult] = await connection.execute(accessQuery, [userIdInt]);
            accessLogs = accessLogsResult;
            
            console.log('[getUserDetailedView] Access logs count:', accessLogs.length);
        } catch (accessError) {
            console.warn('[getUserDetailedView] access_logs table may not exist:', accessError.message);
            accessLogs = [];
            totalAccessLogs = 0;
        }

        // STEP 6: Get user's activity statistics (with table existence check)
        let activityStats = {};
        
        try {
            console.log('[getUserDetailedView] Fetching activity stats...');
            const [activityStatsResult] = await connection.execute(`
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
            `, [userIdInt]);
            
            // Also get login stats from login_logs if available
            let loginStats = {};
            try {
                const [loginStatsResult] = await connection.execute(`
                    SELECT 
                        COUNT(CASE WHEN ll.status = 'success' THEN 1 END) as successful_logins,
                        COUNT(CASE WHEN ll.status = 'failed' THEN 1 END) as failed_logins,
                        MAX(ll.login_at) as last_successful_login,
                        COUNT(CASE WHEN ll.login_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as logins_last_30_days
                    FROM login_logs ll
                    WHERE ll.user_id = ?
                `, [userIdInt]);
                loginStats = loginStatsResult[0] || {};
            } catch (loginStatsError) {
                console.warn('[getUserDetailedView] Could not fetch login stats:', loginStatsError.message);
                loginStats = {};
            }
            
            activityStats = { ...(activityStatsResult[0] || {}), ...loginStats };
            console.log('[getUserDetailedView] Activity stats fetched');
        } catch (statsError) {
            console.warn('[getUserDetailedView] Could not fetch activity stats:', statsError.message);
            activityStats = {};
        }

        // STEP 7: Prepare response
        const responseData = {
            user,
            loginHistory: loginHistory || [],
            loginPagination: {
                page: loginPage,
                limit: loginLimit,
                total: totalLoginLogs,
                totalPages: Math.ceil(totalLoginLogs / loginLimit),
                hasNextPage: loginPage < Math.ceil(totalLoginLogs / loginLimit),
                hasPrevPage: loginPage > 1
            },
            accessLogs: accessLogs || [],
            accessPagination: {
                page: accessPage,
                limit: accessLimit,
                total: totalAccessLogs,
                totalPages: Math.ceil(totalAccessLogs / accessLimit),
                hasNextPage: accessPage < Math.ceil(totalAccessLogs / accessLimit),
                hasPrevPage: accessPage > 1
            },
            activityStats: activityStats || {}
        };

        console.log('[getUserDetailedView] Success - returning data');

        res.status(200).json({
            success: true,
            message: 'Lấy thông tin chi tiết người dùng thành công',
            data: responseData
        });

    } catch (error) {
        console.error('[getUserDetailedView] Error:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            sql: error.sql,
            stack: error.stack
        });
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin chi tiết người dùng',
            error: process.env.NODE_ENV === 'development' ? {
                message: error.message,
                code: error.code,
                sql: error.sql
            } : undefined
        });
    }
};

// FIXED: Get users with role and permission summary
const getUsersWithRolePermissionSummary = async (req, res) => {
    let connection;
    
    try {
        connection = await db.promise();
        
        const {
            page = 1,
            limit = 10,
            status = '',
            search = '',
            role = '',
            sort = 'created_at',
            order = 'desc'
        } = req.query;

        // Convert to integers with validation
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(5, parseInt(limit, 10) || 10));
        // FIXED: Ensure offset is safe integer for string interpolation
        const offset = Math.max(0, (pageNum - 1) * limitNum);

        let whereClause = 'WHERE 1=1';
        const params = [];

        // Add filters
        if (status && status.trim()) {
            whereClause += ' AND u.status = ?';
            params.push(status.trim());
        }

        if (search && search.trim()) {
            whereClause += ' AND (u.name LIKE ? OR u.email LIKE ?)';
            const searchTerm = `%${search.trim()}%`;
            params.push(searchTerm, searchTerm);
        }

        if (role && role.trim()) {
            whereClause += ` AND u.id IN (
                SELECT DISTINCT ur.user_id 
                FROM user_roles ur 
                JOIN roles r ON ur.role_id = r.id 
                WHERE r.name = ? AND ur.is_active = 1
            )`;
            params.push(role.trim());
        }

        // Validate sort column
        const allowedSortColumns = ['name', 'email', 'status', 'created_at', 'last_login_at'];
        const sortColumn = allowedSortColumns.includes(sort) ? sort : 'created_at';
        const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        console.log('[getUsersWithRolePermissionSummary] Query params:', { 
            pageNum, limitNum, offset, status, search, role, sort, order 
        });

        // Get total count
        const countQuery = `
            SELECT COUNT(*) as total
            FROM users u
            ${whereClause}
        `;
        
        const [countResult] = await connection.execute(countQuery, params);
        const totalUsers = countResult[0]?.total || 0;
        const totalPages = Math.ceil(totalUsers / limitNum);

        console.log('[getUsersWithRolePermissionSummary] Total users:', totalUsers);

        // FIXED: Get users basic info with string interpolation for LIMIT/OFFSET
        const userQuery = `
            SELECT 
                u.id,
                u.name,
                u.email,
                u.phone,
                u.status,
                u.last_login_at,
                u.is_account_locked,
                u.created_at,
                u.updated_at
            FROM users u
            ${whereClause}
            ORDER BY u.${sortColumn} ${sortOrder}
            LIMIT ${limitNum} OFFSET ${offset}
        `;

        const [users] = await connection.execute(userQuery, params);
        console.log('[getUsersWithRolePermissionSummary] Found users:', users.length);

        // Get role and permission summary for each user using optimized queries
        if (users.length > 0) {
            const userIds = users.map(user => user.id);
            const placeholders = userIds.map(() => '?').join(',');

            try {
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
                let allPermissionInfo = [];
                try {
                    const [permissionResults] = await connection.execute(`
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
                    allPermissionInfo = permissionResults;
                } catch (permError) {
                    console.warn('Could not fetch permission info:', permError.message);
                    allPermissionInfo = [];
                }

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
            } catch (roleError) {
                console.warn('Could not fetch role/permission data:', roleError.message);
                // Set default values if role queries fail
                users.forEach(user => {
                    user.role_count = 0;
                    user.role_names = '';
                    user.highest_role_level = 0;
                    user.permission_count = 0;
                    user.roles = [];
                });
            }
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
        console.error('[getUsersWithRolePermissionSummary] Error:', error);
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
    let connection;
    
    try {
        connection = await db.promise();
        
        const {
            userId,
            startDate,
            endDate,
            actionType = '',
            page = 1,
            limit = 20
        } = req.query;

        if (!userId || isNaN(parseInt(userId))) {
            return res.status(400).json({
                success: false,
                message: 'ID người dùng là bắt buộc và phải hợp lệ'
            });
        }

        const userIdInt = parseInt(userId);
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(5, parseInt(limit, 10) || 20));
        // FIXED: Ensure offset is safe integer for string interpolation
        const offset = Math.max(0, (pageNum - 1) * limitNum);

        let whereClause = 'WHERE al.user_id = ?';
        const params = [userIdInt];

        if (startDate) {
            whereClause += ' AND DATE(al.created_at) >= ?';
            params.push(startDate);
        }

        if (endDate) {
            whereClause += ' AND DATE(al.created_at) <= ?';
            params.push(endDate);
        }

        if (actionType && actionType.trim()) {
            whereClause += ' AND al.action_type = ?';
            params.push(actionType.trim());
        }

        // Check if access_logs table exists and get data
        let activities = [];
        let totalActivities = 0;
        let activitySummary = [];

        try {
            // Get total count
            const [countResult] = await connection.execute(`
                SELECT COUNT(*) as total
                FROM access_logs al
                ${whereClause}
            `, params);

            totalActivities = countResult[0]?.total || 0;
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
                    u.name as user_name
                FROM access_logs al
                JOIN users u ON al.user_id = u.id
                ${whereClause}
                ORDER BY al.created_at DESC
                LIMIT ${limitNum} OFFSET ${offset}
            `;

            const [activitiesResult] = await connection.execute(activitiesQuery, params);
            activities = activitiesResult;

            // Get activity summary
            const [summaryResult] = await connection.execute(`
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
            activitySummary = summaryResult;

        } catch (accessError) {
            console.warn('access_logs table may not exist:', accessError.message);
            activities = [];
            totalActivities = 0;
            activitySummary = [];
        }

        const totalPages = Math.ceil(totalActivities / limitNum);

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
                    userId: userIdInt,
                    startDate,
                    endDate,
                    actionType
                }
            }
        });

    } catch (error) {
        console.error('[getUserActivityReport] Error:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy báo cáo hoạt động người dùng',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get online users (users with recent activity) - FIXED VERSION
const getOnlineUsers = async (req, res) => {
    let connection;
    
    try {
        connection = await db.promise();
        const { timeWindow = 15 } = req.query; // minutes

        const timeWindowInt = Math.max(1, Math.min(1440, parseInt(timeWindow) || 15)); // Between 1 minute and 24 hours

        let onlineUsers = [];

        try {
            // Get users with recent activity from access_logs
            const [onlineUsersResult] = await connection.execute(`
                SELECT DISTINCT
                    u.id,
                    u.name,
                    u.email,
                    u.status,
                    u.last_login_at,
                    MAX(al.created_at) as last_activity,
                    COUNT(al.id) as recent_actions
                FROM users u
                JOIN access_logs al ON u.id = al.user_id
                WHERE al.created_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
                AND u.status = 'active'
                GROUP BY u.id, u.name, u.email, u.status, u.last_login_at
                ORDER BY last_activity DESC
            `, [timeWindowInt]);
            
            onlineUsers = onlineUsersResult;
        } catch (accessError) {
            console.warn('access_logs table may not exist, trying alternative approach:', accessError.message);
            
            // Fallback: get users with recent login_at
            try {
                const [fallbackUsers] = await connection.execute(`
                    SELECT DISTINCT
                        u.id,
                        u.name,
                        u.email,
                        u.status,
                        u.last_login_at,
                        u.last_login_at as last_activity,
                        0 as recent_actions
                    FROM users u
                    WHERE u.last_login_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
                    AND u.status = 'active'
                    ORDER BY u.last_login_at DESC
                `, [timeWindowInt]);
                
                onlineUsers = fallbackUsers;
            } catch (fallbackError) {
                console.warn('Could not get online users:', fallbackError.message);
                onlineUsers = [];
            }
        }

        // Get roles for each online user
        if (onlineUsers.length > 0) {
            const userIds = onlineUsers.map(user => user.id);
            const placeholders = userIds.map(() => '?').join(',');

            try {
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
            } catch (roleError) {
                console.warn('Could not fetch roles for online users:', roleError.message);
                // Continue without roles
                onlineUsers.forEach(user => {
                    user.roles = [];
                });
            }
        }

        res.status(200).json({
            success: true,
            message: 'Lấy danh sách người dùng đang online thành công',
            data: {
                onlineUsers,
                count: onlineUsers.length,
                timeWindow: `${timeWindowInt} phút`
            }
        });

    } catch (error) {
        console.error('[getOnlineUsers] Error:', error);
        
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