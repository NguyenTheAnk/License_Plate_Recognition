const db = require('../../db');

// Helper function to validate user_id exists
const validateUserId = async (connection, userId) => {
    if (!userId) return null;
    
    const [users] = await connection.execute(
        'SELECT id FROM users WHERE id = ?',
        [userId]
    );
    
    return users.length > 0 ? userId : null;
};

// Enhanced getAllUsers with complete roles and permissions info
const getAllUsers = async (req, res) => {
    const connection = await db.promise();
    
    try {
        console.log('getAllUsers called with query:', req.query);
        
        const {
            page = 1,
            limit = 10,
            search = '',
            status = '',
            role = '',
            sort = 'created_at',
            order = 'desc'
        } = req.query;

        // Convert to numbers and validate
        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 10;
        const offset = (pageNum - 1) * limitNum;

        console.log('Pagination params:', { pageNum, limitNum, offset });

        let whereClause = 'WHERE 1=1';
        const params = [];

        // Add search filter
        if (search && search.trim()) {
            whereClause += ' AND (u.name LIKE ? OR u.email LIKE ?)';
            const searchTerm = `%${search.trim()}%`;
            params.push(searchTerm, searchTerm);
        }

        // Add status filter
        if (status && status.trim()) {
            whereClause += ' AND u.status = ?';
            params.push(status.trim());
        }

        // Add role filter
        if (role && role.trim()) {
            whereClause += ' AND EXISTS (SELECT 1 FROM user_roles ur2 JOIN roles r2 ON ur2.role_id = r2.id WHERE ur2.user_id = u.id AND ur2.is_active = 1 AND r2.name = ?)';
            params.push(role.trim());
        }

        // Validate sort column
        const allowedSortColumns = ['name', 'email', 'status', 'created_at', 'last_login_at'];
        const sortColumn = allowedSortColumns.includes(sort) ? sort : 'created_at';
        const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        console.log('Where clause:', whereClause);
        console.log('Params:', params);

        // Get total count
        const countQuery = `SELECT COUNT(DISTINCT u.id) as total FROM users u ${whereClause}`;
        console.log('Count query:', countQuery);
        
        const [countResult] = await connection.execute(countQuery, params);
        const totalUsers = countResult[0].total;
        const totalPages = Math.ceil(totalUsers / limitNum);

        console.log('Total users:', totalUsers);

        // Get users basic info with proper column names from schema
        const userQuery = `
            SELECT 
                u.id,
                u.name,
                u.email,
                u.phone,
                u.status,
                u.last_login_at,
                u.failed_login_attempts,
                u.is_account_locked,
                u.locked_until,
                u.created_at,
                u.updated_at
            FROM users u
            ${whereClause}
            ORDER BY u.${sortColumn} ${sortOrder}
            LIMIT ${limitNum} OFFSET ${offset}
        `;

        console.log('User query:', userQuery);
        console.log('Query params:', params);

        const [users] = await connection.execute(userQuery, params);

        console.log('Found users:', users.length);

        // Enhanced: Get detailed roles and permissions for each user
        if (users.length > 0) {
            const userIds = users.map(user => user.id);
            const placeholders = userIds.map(() => '?').join(',');

            // Get detailed roles information for all users
            const [allUserRoles] = await connection.execute(`
                SELECT 
                    ur.user_id,
                    r.id as role_id,
                    r.name as role_name,
                    r.description as role_description,
                    r.level as role_level,
                    ur.assigned_at,
                    ur.assigned_by,
                    ab.name as assigned_by_name,
                    ur.expires_at
                FROM user_roles ur
                JOIN roles r ON ur.role_id = r.id
                LEFT JOIN users ab ON ur.assigned_by = ab.id
                WHERE ur.user_id IN (${placeholders}) 
                AND ur.is_active = 1 
                AND r.is_active = 1
                AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
                ORDER BY ur.user_id, r.level DESC
            `, userIds);

            // Get all permissions for all users in one query
            const [allUserPermissions] = await connection.execute(`
                SELECT 
                    ur.user_id,
                    p.id as permission_id,
                    p.module,
                    p.action,
                    p.code,
                    p.description,
                    r.name as role_name
                FROM user_roles ur
                JOIN roles r ON ur.role_id = r.id
                JOIN role_permissions rp ON r.id = rp.role_id
                JOIN permissions p ON rp.permission_id = p.id
                WHERE ur.user_id IN (${placeholders}) 
                AND ur.is_active = 1 
                AND r.is_active = 1 
                AND rp.granted = 1 
                AND p.is_active = 1
                AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
                ORDER BY ur.user_id, p.module, p.action
            `, userIds);

            // Map roles and permissions to users
            users.forEach(user => {
                // Get roles for this user
                user.roles = allUserRoles
                    .filter(role => role.user_id === user.id)
                    .map(role => ({
                        id: role.role_id,
                        name: role.role_name,
                        description: role.role_description,
                        level: role.role_level,
                        assigned_at: role.assigned_at,
                        assigned_by: role.assigned_by,
                        assigned_by_name: role.assigned_by_name,
                        expires_at: role.expires_at
                    }));

                // Get permissions for this user
                user.permissions = allUserPermissions
                    .filter(permission => permission.user_id === user.id)
                    .map(permission => ({
                        id: permission.permission_id,
                        module: permission.module,
                        action: permission.action,
                        code: permission.code,
                        description: permission.description,
                        from_role: permission.role_name
                    }));

                // Add summary info
                user.roles_count = user.roles.length;
                user.permissions_count = user.permissions.length;
                user.role_names = user.roles.map(role => role.name).join(', ');
                user.highest_role_level = user.roles.length > 0 ? Math.max(...user.roles.map(role => role.level)) : 0;
                
                // Security info
                user.account_status = user.is_account_locked ? 
                    (user.locked_until && new Date(user.locked_until) > new Date() ? 'locked' : 'unlocked') : 
                    'normal';
            });
        }

        // Log access with proper UUID
        try {
            const validUserId = await validateUserId(connection, req.user?.userId);
            if (validUserId) {
                await connection.execute(
                    `INSERT INTO access_logs (
                        user_id, username, action_type, object_type, 
                        status, ip_address, user_agent, created_at
                    ) VALUES (?, ?, 'VIEW', 'USERS_LIST', 'SUCCESS', ?, ?, NOW())`,
                    [
                        validUserId,
                        req.user?.name || 'unknown',
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
            message: 'Lấy danh sách người dùng thành công',
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
        console.error('Error getting users:', error);
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

// Enhanced getUserById with complete information
const getUserById = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const userId = req.params.id;

        if (!userId || isNaN(userId)) {
            return res.status(400).json({
                success: false,
                message: 'ID người dùng không hợp lệ'
            });
        }

        // Get user basic info with proper column names
        const [users] = await connection.execute(`
            SELECT 
                u.id,
                u.name,
                u.email,
                u.phone,
                u.status,
                u.last_login_at,
                u.last_password_changed_at,
                u.password_expires_at,
                u.failed_login_attempts,
                u.is_account_locked,
                u.locked_until,
                u.created_at,
                u.updated_at
            FROM users u
            WHERE u.id = ?
        `, [userId]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng'
            });
        }

        const user = users[0];

        // Get detailed roles information
        const [userRoles] = await connection.execute(`
            SELECT 
                r.id,
                r.name,
                r.description,
                r.level,
                r.parent_role_id,
                ur.assigned_at,
                ur.assigned_by,
                ur.expires_at,
                ab.name as assigned_by_name
            FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            LEFT JOIN users ab ON ur.assigned_by = ab.id
            WHERE ur.user_id = ? AND ur.is_active = 1 AND r.is_active = 1
            AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
            ORDER BY r.level DESC
        `, [userId]);

        // Get detailed permissions with role information
        const [userPermissions] = await connection.execute(`
            SELECT 
                p.id,
                p.module,
                p.action,
                p.code,
                p.description,
                r.name as from_role,
                r.level as role_level
            FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            JOIN role_permissions rp ON r.id = rp.role_id
            JOIN permissions p ON rp.permission_id = p.id
            WHERE ur.user_id = ? 
            AND ur.is_active = 1 
            AND r.is_active = 1 
            AND rp.granted = 1 
            AND p.is_active = 1
            AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
            ORDER BY p.module, p.action
        `, [userId]);

        // Group permissions by module for better organization
        const permissionsByModule = {};
        userPermissions.forEach(permission => {
            if (!permissionsByModule[permission.module]) {
                permissionsByModule[permission.module] = [];
            }
            permissionsByModule[permission.module].push({
                id: permission.id,
                action: permission.action,
                code: permission.code,
                description: permission.description,
                from_role: permission.from_role,
                role_level: permission.role_level
            });
        });

        user.roles = userRoles;
        user.permissions = userPermissions;
        user.permissions_by_module = permissionsByModule;
        user.roles_count = userRoles.length;
        user.permissions_count = userPermissions.length;
        user.role_names = userRoles.map(role => role.name).join(', ');

        // Add security status info
        user.account_status = user.is_account_locked ? 
            (user.locked_until && new Date(user.locked_until) > new Date() ? 'locked' : 'unlocked') : 
            'normal';
        user.password_expired = user.password_expires_at && new Date(user.password_expires_at) < new Date();

        // Log access with proper UUID
        try {
            const validUserId = await validateUserId(connection, req.user?.userId);
            if (validUserId) {
                await connection.execute(
                    `INSERT INTO access_logs (
                        user_id, username, action_type, object_type, 
                        object_id, status, ip_address, user_agent, created_at
                    ) VALUES (?, ?, 'VIEW', 'USER', ?, 'SUCCESS', ?, ?, NOW())`,
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
            message: 'Lấy thông tin người dùng thành công',
            data: { user }
        });

    } catch (error) {
        console.error('Error getting user:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin người dùng',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Enhanced getUserProfile
const getUserProfile = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const userId = req.user.userId;

        // Get user basic info with proper column names
        const [users] = await connection.execute(`
            SELECT 
                u.id,
                u.name,
                u.email,
                u.phone,
                u.status,
                u.last_login_at,
                u.last_password_changed_at,
                u.password_expires_at,
                u.created_at
            FROM users u
            WHERE u.id = ?
        `, [userId]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy thông tin người dùng'
            });
        }

        const user = users[0];

        // Get roles with detailed information
        const [userRoles] = await connection.execute(`
            SELECT 
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
            ORDER BY r.level DESC
        `, [userId]);

        // Get permissions grouped by module
        const [userPermissions] = await connection.execute(`
            SELECT 
                p.id,
                p.module,
                p.action,
                p.code,
                p.description,
                r.name as from_role
            FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            JOIN role_permissions rp ON r.id = rp.role_id
            JOIN permissions p ON rp.permission_id = p.id
            WHERE ur.user_id = ? 
            AND ur.is_active = 1 
            AND r.is_active = 1 
            AND rp.granted = 1 
            AND p.is_active = 1
            AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
            ORDER BY p.module, p.action
        `, [userId]);

        user.roles = userRoles;
        user.permissions = userPermissions;
        user.can_access = userPermissions.map(p => p.code); // Array of permission codes for easy checking
        user.password_expired = user.password_expires_at && new Date(user.password_expires_at) < new Date();

        res.status(200).json({
            success: true,
            message: 'Lấy thông tin profile thành công',
            data: { user }
        });

    } catch (error) {
        console.error('Error getting user profile:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin profile',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    getUserById,
    getAllUsers,
    getUserProfile
};