const db = require('../../db');
const bcrypt = require('bcrypt');

const createUser = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const {
            name,
            email,
            phone,
            password,
            status = 'active',
            roleIds = []
        } = req.body;

        // Validate required fields
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Tên, email và mật khẩu là bắt buộc'
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Định dạng email không hợp lệ'
            });
        }

        // Validate password strength
        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'Mật khẩu phải có ít nhất 8 ký tự'
            });
        }

        // Validate status
        if (!['active', 'inactive', 'suspended'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Trạng thái không hợp lệ'
            });
        }

        // Check if email already exists
        const [existingUsers] = await connection.execute(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );

        if (existingUsers.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Email đã tồn tại'
            });
        }

        // Validate roles exist if provided
        if (roleIds.length > 0) {
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

        // Hash password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Calculate password expiry (90 days from now)
        const passwordExpiresAt = new Date();
        passwordExpiresAt.setDate(passwordExpiresAt.getDate() + 90);

        // Create user with all required fields from schema
        const [userResult] = await connection.execute(
            `INSERT INTO users (
                name, email, phone, password, status, 
                last_password_changed_at, password_expires_at, 
                failed_login_attempts, is_account_locked, 
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, NOW(), ?, 0, FALSE, NOW(), NOW())`,
            [name, email, phone || null, hashedPassword, status, passwordExpiresAt]
        );

        const userId = userResult.insertId;

        // Assign roles if provided
        if (roleIds.length > 0) {
            const roleInsertValues = roleIds.map(roleId => 
                `(${userId}, ${roleId}, ${req.user?.userId || 'NULL'}, NOW(), 1)`
            ).join(', ');
            
            await connection.execute(
                `INSERT INTO user_roles (user_id, role_id, assigned_by, assigned_at, is_active) 
                 VALUES ${roleInsertValues}`
            );
        } else {
            // Assign default role if no roles specified
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

        // Get created user with roles and permissions
        const [newUser] = await connection.execute(`
            SELECT 
                u.id,
                u.name,
                u.email,
                u.phone,
                u.status,
                u.created_at,
                u.updated_at
            FROM users u
            WHERE u.id = ?
        `, [userId]);

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
            WHERE ur.user_id = ? 
            AND ur.is_active = 1 
            AND r.is_active = 1 
            AND rp.granted = 1 
            AND p.is_active = 1
        `, [userId]);

        const user = newUser[0];
        user.roles = userRoles;
        user.permissions = userPermissions;

        // Log access with proper UUID
        await connection.execute(
            `INSERT INTO access_logs (
                user_id, username, action_type, object_type, 
                object_id, new_values, status, ip_address, user_agent, created_at
            ) VALUES (?, ?, 'CREATE', 'USER', ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user?.userId || null,
                req.user?.name || 'system',
                userId.toString(),
                JSON.stringify({ name, email, phone, status, roleIds }),
                req.ip || 'unknown',
                req.get('User-Agent') || 'unknown'
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Tạo người dùng thành công',
            data: { user }
        });

    } catch (error) {
        console.error('Error creating user:', error);
        
        // Log failed access
        try {
            await connection.execute(
                `INSERT INTO access_logs (
                    user_id, username, action_type, object_type, 
                    status, failure_reason, ip_address, user_agent, created_at
                ) VALUES (?, ?, 'CREATE', 'USER', 'FAILURE', ?, ?, ?, NOW())`,
                [
                    req.user?.userId || null,
                    req.user?.name || 'system',
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
            message: 'Lỗi khi tạo người dùng',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = { createUser };