const db = require('../../db');
const bcrypt = require('bcrypt');

const createUser = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const {
            name,
            username,
            email,
            phone,
            password,
            status = 'active',
            roleIds = []
        } = req.body;

        // Validate required fields
        if (!name || !username || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Tên, tên đăng nhập, email và mật khẩu là bắt buộc'
            });
        }

        // Check if username or email already exists
        const [existingUsers] = await connection.execute(
            'SELECT id FROM users WHERE username = ? OR email = ?',
            [username, email]
        );

        if (existingUsers.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Tên đăng nhập hoặc email đã tồn tại'
            });
        }

        // Hash password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Create user
        const [userResult] = await connection.execute(
            `INSERT INTO users (name, username, email, phone, password, status, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [name, username, email, phone, hashedPassword, status]
        );

        const userId = userResult.insertId;

        // Assign roles if provided
        if (roleIds.length > 0) {
            const roleValues = roleIds.map(roleId => `(${userId}, ${roleId}, ${req.user.userId})`).join(', ');
            await connection.execute(
                `INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ${roleValues}`
            );
        }

        // Get created user with roles and permissions
        const [userWithRoles] = await connection.execute(`
            SELECT 
                u.id,
                u.name,
                u.username,
                u.email,
                u.phone,
                u.status,
                u.created_at,
                u.updated_at,
                JSON_ARRAYAGG(
                    DISTINCT JSON_OBJECT(
                        'id', r.id,
                        'name', r.name,
                        'description', r.description,
                        'level', r.level
                    )
                ) as roles,
                JSON_ARRAYAGG(
                    DISTINCT JSON_OBJECT(
                        'id', p.id,
                        'module', p.module,
                        'action', p.action,
                        'code', p.code,
                        'description', p.description
                    )
                ) as permissions
            FROM users u
            LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = 1
            LEFT JOIN roles r ON ur.role_id = r.id AND r.is_active = 1
            LEFT JOIN role_permissions rp ON r.id = rp.role_id AND rp.granted = 1
            LEFT JOIN permissions p ON rp.permission_id = p.id AND p.is_active = 1
            WHERE u.id = ?
            GROUP BY u.id
        `, [userId]);

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'CREATE', 'USER', ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                userId.toString(),
                JSON.stringify({ name, username, email, phone, status, roleIds }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Tạo người dùng thành công',
            data: {
                user: userWithRoles[0]
            }
        });

    } catch (error) {
        console.error('Error creating user:', error);
        
        // Log failed access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, status, failure_reason, ip_address, user_agent, created_at)
             VALUES (?, ?, 'CREATE', 'USER', 'FAILURE', ?, ?, ?, NOW())`,
            [
                req.user?.userId,
                req.user?.username,
                error.message,
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo người dùng',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = { createUser };