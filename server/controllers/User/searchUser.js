const db = require('../../db');

// Advanced search users with filters - FIXED VERSION
const searchUsers = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const {
            query = '',
            status = '',
            role = '',
            permission = '',
            dateFrom = '',
            dateTo = '',
            lastLoginFrom = '',
            lastLoginTo = '',
            page = 1,
            limit = 10,
            sort = 'created_at',
            order = 'desc'
        } = req.query;

        const offset = (page - 1) * limit;
        let whereClause = 'WHERE 1=1';
        const params = [];

        // Add text search filter
        if (query) {
            whereClause += ' AND (u.name LIKE ? OR u.username LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)';
            const searchTerm = `%${query}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        // Add status filter
        if (status) {
            whereClause += ' AND u.status = ?';
            params.push(status);
        }

        // Add role filter
        if (role) {
            whereClause += ' AND EXISTS (SELECT 1 FROM user_roles ur2 JOIN roles r2 ON ur2.role_id = r2.id WHERE ur2.user_id = u.id AND ur2.is_active = 1 AND r2.name = ?)';
            params.push(role);
        }

        // Add permission filter
        if (permission) {
            whereClause += ` AND EXISTS (
                SELECT 1 FROM user_roles ur3 
                JOIN roles r3 ON ur3.role_id = r3.id 
                JOIN role_permissions rp3 ON r3.id = rp3.role_id 
                JOIN permissions p3 ON rp3.permission_id = p3.id 
                WHERE ur3.user_id = u.id AND ur3.is_active = 1 AND rp3.granted = 1 AND p3.code = ?
            )`;
            params.push(permission);
        }

        // Add date range filter (registration date)
        if (dateFrom) {
            whereClause += ' AND DATE(u.created_at) >= ?';
            params.push(dateFrom);
        }
        if (dateTo) {
            whereClause += ' AND DATE(u.created_at) <= ?';
            params.push(dateTo);
        }

        // Add last login date filter
        if (lastLoginFrom) {
            whereClause += ' AND DATE(u.last_login) >= ?';
            params.push(lastLoginFrom);
        }
        if (lastLoginTo) {
            whereClause += ' AND DATE(u.last_login) <= ?';
            params.push(lastLoginTo);
        }

        // Validate sort column
        const allowedSortColumns = ['name', 'username', 'email', 'status', 'created_at', 'last_login', 'updated_at'];
        const sortColumn = allowedSortColumns.includes(sort) ? sort : 'created_at';
        const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        // Get total count
        const [countResult] = await connection.execute(`
            SELECT COUNT(DISTINCT u.id) as total
            FROM users u
            ${whereClause}
        `, params);

        const totalUsers = countResult[0].total;
        const totalPages = Math.ceil(totalUsers / limit);

        // Get users basic info - SIMPLIFIED QUERY
        const [users] = await connection.execute(`
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
                u.created_at,
                u.updated_at
            FROM users u
            ${whereClause}
            ORDER BY u.${sortColumn} ${sortOrder}
            LIMIT ? OFFSET ?
        `, [...params, parseInt(limit), parseInt(offset)]);

        // Get roles and permissions for each user
        for (let user of users) {
            // Get roles for this user
            const [userRoles] = await connection.execute(`
                SELECT DISTINCT
                    r.id,
                    r.name,
                    r.description,
                    r.level
                FROM user_roles ur
                JOIN roles r ON ur.role_id = r.id
                WHERE ur.user_id = ? AND ur.is_active = 1 AND r.is_active = 1
            `, [user.id]);

            // Get permissions for this user
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
            `, [user.id]);

            user.roles = userRoles;
            user.permissions = userPermissions;
            user.permission_count = userPermissions.length;
        }

        // Log search access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, request_data, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'SEARCH', 'USERS', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                JSON.stringify({ query, status, role, permission, dateFrom, dateTo, lastLoginFrom, lastLoginTo }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Tìm kiếm người dùng thành công',
            data: {
                users,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages,
                    totalUsers,
                    limit: parseInt(limit),
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1
                },
                filters: {
                    query,
                    status,
                    role,
                    permission,
                    dateFrom,
                    dateTo,
                    lastLoginFrom,
                    lastLoginTo,
                    sort,
                    order
                }
            }
        });

    } catch (error) {
        console.error('Error searching users:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tìm kiếm người dùng',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Search users by specific criteria - FIXED VERSION
const searchUsersByCriteria = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { criteria, value, exact = false } = req.body;

        if (!criteria || !value) {
            return res.status(400).json({
                success: false,
                message: 'Tiêu chí và giá trị tìm kiếm là bắt buộc'
            });
        }

        const allowedCriteria = ['username', 'email', 'phone', 'name'];
        if (!allowedCriteria.includes(criteria)) {
            return res.status(400).json({
                success: false,
                message: 'Tiêu chí tìm kiếm không hợp lệ'
            });
        }

        const searchValue = exact ? value : `%${value}%`;
        const operator = exact ? '=' : 'LIKE';

        // Get users basic info
        const [users] = await connection.execute(`
            SELECT 
                u.id,
                u.name,
                u.username,
                u.email,
                u.phone,
                u.status,
                u.last_login,
                u.created_at
            FROM users u
            WHERE u.${criteria} ${operator} ?
            ORDER BY u.created_at DESC
        `, [searchValue]);

        // Get roles for each user
        for (let user of users) {
            const [userRoles] = await connection.execute(`
                SELECT DISTINCT
                    r.id,
                    r.name,
                    r.description,
                    r.level
                FROM user_roles ur
                JOIN roles r ON ur.role_id = r.id
                WHERE ur.user_id = ? AND ur.is_active = 1 AND r.is_active = 1
            `, [user.id]);

            user.roles = userRoles;
        }

        res.status(200).json({
            success: true,
            message: 'Tìm kiếm thành công',
            data: {
                users,
                count: users.length,
                criteria,
                value,
                exact
            }
        });

    } catch (error) {
        console.error('Error searching users by criteria:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tìm kiếm người dùng',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get users by role - USING QUERY INSTEAD OF EXECUTE
const getUsersByRole = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { roleName } = req.params;
        const { status = '', page = 1, limit = 10 } = req.query;

        if (!roleName) {
            return res.status(400).json({
                success: false,
                message: 'Tên vai trò là bắt buộc'
            });
        }

        // Ensure proper data types and decode URL params
        const decodedRoleName = decodeURIComponent(roleName);
        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 10;
        const offset = (pageNum - 1) * limitNum;

        console.log('Debug - roleName:', decodedRoleName, 'status:', status, 'page:', pageNum, 'limit:', limitNum);

        // Escape string values to prevent SQL injection
        const escapedRoleName = connection.escape(decodedRoleName);
        const escapedStatus = status && status.trim() !== '' ? connection.escape(status.trim()) : null;

        // First, get the role ID
        const roleQuery = `SELECT id FROM roles WHERE name = ${escapedRoleName} AND is_active = 1`;
        const [roleResult] = await connection.query(roleQuery);

        if (roleResult.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy vai trò'
            });
        }

        const roleId = roleResult[0].id;

        // Build queries using string interpolation with escaped values
        let countQuery = `
            SELECT COUNT(DISTINCT u.id) as total
            FROM users u
            JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = 1
            WHERE ur.role_id = ${roleId}
        `;

        let userQuery = `
            SELECT DISTINCT
                u.id,
                u.name,
                u.username,
                u.email,
                u.phone,
                u.status,
                u.last_login,
                u.created_at
            FROM users u
            JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = 1
            WHERE ur.role_id = ${roleId}
        `;

        if (escapedStatus) {
            countQuery += ` AND u.status = ${escapedStatus}`;
            userQuery += ` AND u.status = ${escapedStatus}`;
        }

        userQuery += ` ORDER BY u.name ASC LIMIT ${limitNum} OFFSET ${offset}`;

        console.log('Count Query:', countQuery);
        console.log('User Query:', userQuery);

        // Execute queries
        const [countResult] = await connection.query(countQuery);
        const totalUsers = countResult[0].total;
        const totalPages = Math.ceil(totalUsers / limitNum);

        const [users] = await connection.query(userQuery);

        // Get additional details for each user
        for (let user of users) {
            // Get assignment details for this specific role
            const assignmentQuery = `
                SELECT ur.assigned_at, ab.name as assigned_by_name
                FROM user_roles ur
                LEFT JOIN users ab ON ur.assigned_by = ab.id
                WHERE ur.user_id = ${user.id} AND ur.role_id = ${roleId} AND ur.is_active = 1
            `;
            const [assignmentDetails] = await connection.query(assignmentQuery);

            if (assignmentDetails.length > 0) {
                user.assigned_at = assignmentDetails[0].assigned_at;
                user.assigned_by_name = assignmentDetails[0].assigned_by_name;
            }

            // Get all roles for this user
            const rolesQuery = `
                SELECT DISTINCT r.id, r.name, r.description, r.level
                FROM user_roles ur
                JOIN roles r ON ur.role_id = r.id
                WHERE ur.user_id = ${user.id} AND ur.is_active = 1 AND r.is_active = 1
            `;
            const [allRoles] = await connection.query(rolesQuery);
            user.all_roles = allRoles;
        }

        res.status(200).json({
            success: true,
            message: 'Lấy danh sách người dùng theo vai trò thành công',
            data: {
                users,
                roleName: decodedRoleName,
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
        console.error('Error getting users by role:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách người dùng theo vai trò',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getUsersByPermission = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { permissionCode } = req.params;
        const { page = 1, limit = 10 } = req.query;

        if (!permissionCode) {
            return res.status(400).json({
                success: false,
                message: 'Mã quyền là bắt buộc'
            });
        }

        // Ensure proper data types and decode URL params
        const decodedPermissionCode = decodeURIComponent(permissionCode);
        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 10;
        const offset = (pageNum - 1) * limitNum;

        console.log('Debug - permissionCode:', decodedPermissionCode, 'page:', pageNum, 'limit:', limitNum);

        // Escape string values to prevent SQL injection
        const escapedPermissionCode = connection.escape(decodedPermissionCode);

        // First, check if permission exists
        const permissionCheckQuery = `SELECT id FROM permissions WHERE code = ${escapedPermissionCode} AND is_active = 1`;
        const [permissionResult] = await connection.query(permissionCheckQuery);

        if (permissionResult.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy quyền'
            });
        }

        // Get total count
        const countQuery = `
            SELECT COUNT(DISTINCT u.id) as total
            FROM users u
            JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = 1
            JOIN roles r ON ur.role_id = r.id AND r.is_active = 1
            JOIN role_permissions rp ON r.id = rp.role_id AND rp.granted = 1
            JOIN permissions p ON rp.permission_id = p.id AND p.is_active = 1
            WHERE p.code = ${escapedPermissionCode}
        `;

        console.log('Count Query:', countQuery);

        const [countResult] = await connection.query(countQuery);
        const totalUsers = countResult[0].total;
        const totalPages = Math.ceil(totalUsers / limitNum);

        // Get users basic info
        const userQuery = `
            SELECT DISTINCT
                u.id,
                u.name,
                u.username,
                u.email,
                u.phone,
                u.status,
                u.last_login,
                u.created_at
            FROM users u
            JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = 1
            JOIN roles r ON ur.role_id = r.id AND r.is_active = 1
            JOIN role_permissions rp ON r.id = rp.role_id AND rp.granted = 1
            JOIN permissions p ON rp.permission_id = p.id AND p.is_active = 1
            WHERE p.code = ${escapedPermissionCode}
            ORDER BY u.name ASC
            LIMIT ${limitNum} OFFSET ${offset}
        `;

        console.log('User Query:', userQuery);

        const [users] = await connection.query(userQuery);

        // Get roles with this permission for each user
        for (let user of users) {
            const rolesQuery = `
                SELECT DISTINCT
                    r.id,
                    r.name,
                    r.description,
                    r.level
                FROM user_roles ur
                JOIN roles r ON ur.role_id = r.id
                JOIN role_permissions rp ON r.id = rp.role_id
                JOIN permissions p ON rp.permission_id = p.id
                WHERE ur.user_id = ${user.id} AND ur.is_active = 1 AND r.is_active = 1 AND rp.granted = 1 AND p.is_active = 1 AND p.code = ${escapedPermissionCode}
            `;

            const [rolesWithPermission] = await connection.query(rolesQuery);
            user.roles_with_permission = rolesWithPermission;
        }

        res.status(200).json({
            success: true,
            message: 'Lấy danh sách người dùng theo quyền thành công',
            data: {
                users,
                permissionCode: decodedPermissionCode,
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
        console.error('Error getting users by permission:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách người dùng theo quyền',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    searchUsers,
    searchUsersByCriteria,
    getUsersByRole,
    getUsersByPermission
};