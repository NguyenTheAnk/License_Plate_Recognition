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

        // Hash password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Create user
        const [userResult] = await connection.execute(
            `INSERT INTO users (name, email, phone, password, status, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
            [name, email, phone, hashedPassword, status]
        );

        const userId = userResult.insertId;

        // Assign roles if provided
        if (roleIds.length > 0) {
            const roleValues = roleIds.map(roleId => `(${userId}, ${roleId}, ${req.user.userId})`).join(', ');
            await connection.execute(
                `INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ${roleValues}`
            );
        }

        // Get created user with roles and permissions - Sửa lại query JSON_ARRAYAGG
        const [userWithRoles] = await connection.execute(`
            SELECT 
                u.id,
                u.name,
                u.email,
                u.phone,
                u.status,
                u.created_at,
                u.updated_at,
                COALESCE(
                    JSON_ARRAYAGG(
                        CASE 
                            WHEN r.id IS NOT NULL THEN
                                JSON_OBJECT(
                                    'id', r.id,
                                    'name', r.name,
                                    'description', r.description,
                                    'level', r.level
                                )
                            ELSE NULL
                        END
                    ), 
                    JSON_ARRAY()
                ) as roles,
                COALESCE(
                    JSON_ARRAYAGG(
                        CASE 
                            WHEN p.id IS NOT NULL THEN
                                JSON_OBJECT(
                                    'id', p.id,
                                    'module', p.module,
                                    'action', p.action,
                                    'code', p.code,
                                    'description', p.description
                                )
                            ELSE NULL
                        END
                    ), 
                    JSON_ARRAY()
                ) as permissions
            FROM users u
            LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = 1
            LEFT JOIN roles r ON ur.role_id = r.id AND r.is_active = 1
            LEFT JOIN role_permissions rp ON r.id = rp.role_id AND rp.granted = 1
            LEFT JOIN permissions p ON rp.permission_id = p.id AND p.is_active = 1
            WHERE u.id = ?
            GROUP BY u.id, u.name, u.email, u.phone, u.status, u.created_at, u.updated_at
        `, [userId]);

        // Log access - Sửa lại query để đúng số lượng columns
        await connection.execute(
            `INSERT INTO access_logs (user_id, action_type, object_type, object_id, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, 'CREATE', 'USER', ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                userId.toString(),
                JSON.stringify({ name, email, phone, status, roleIds }),
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
        
        // Log failed access - Sửa lại query để đúng số lượng columns
        try {
            await connection.execute(
                `INSERT INTO access_logs (user_id, action_type, object_type, status, failure_reason, ip_address, user_agent, created_at)
                 VALUES (?, 'CREATE', 'USER', 'FAILURE', ?, ?, ?, NOW())`,
                [
                    req.user?.userId || null,
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
            message: 'Lỗi khi tạo người dùng',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = { createUser };