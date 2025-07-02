const db = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Register new user
const registerUser = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const {
            name,
            email,
            phone,
            password
        } = req.body;

        // Check if username or email already exists
        const [existingUsers] = await connection.execute(
            'SELECT id FROM users WHERE OR email = ?',
            [email]
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
            `INSERT INTO users (name, email, phone, password, status, created_at, updated_at) 
             VALUES (?,?, ?, ?, 'active', NOW(), NOW())`,
            [name,  email, phone, hashedPassword]
        );

        const userId = userResult.insertId;

        // Assign default role (Viewer)
        const [defaultRole] = await connection.execute(
            'SELECT id FROM roles WHERE is_default_role = 1 AND is_active = 1 LIMIT 1'
        );

        if (defaultRole.length > 0) {
            await connection.execute(
                'INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, ?)',
                [userId, defaultRole[0].id, userId]
            );
        }

        // Get user with roles and permissions - FIXED VERSION
        const [newUser] = await connection.execute(`
            SELECT 
                u.id,
                u.name,
                u.email,
                u.phone,
                u.status,
                u.created_at
            FROM users u
            WHERE u.id = ?
        `, [userId]);

        // Get roles separately
        const [userRoles] = await connection.execute(`
            SELECT DISTINCT
                r.id,
                r.name,
                r.description,
                r.level
            FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
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

        const user = newUser[0];
        user.roles = userRoles;
        user.permissions = userPermissions;

        // Create JWT token
        const token = jwt.sign(
            {
                userId: user.id,
                name: user.name,
                email: user.email,
                roles: user.roles.map(role => role.name),
                permissions: user.permissions.map(permission => permission.code)
            },
            process.env.JSON_WEB_TOKEN_SECRET_KEY,
            { expiresIn: '24h' }
        );

        // Create refresh token
        const refreshToken = jwt.sign(
            { userId: user.id },
            process.env.JSON_WEB_TOKEN_REFRESH_KEY || process.env.JSON_WEB_TOKEN_SECRET_KEY,
            { expiresIn: '7d' }
        );

        // Log successful registration
        await connection.execute(
            `INSERT INTO login_logs (user_id, email, ip_address, user_agent, status, message, created_at)
             VALUES (?, ?, ?, ?, 'success', 'User registered successfully', NOW())`,
            [userId, email, req.ip, req.get('User-Agent')]
        );

        res.status(201).json({
            success: true,
            message: 'Đăng ký thành công',
            data: {
                user,
                token,
                refreshToken
            }
        });

    } catch (error) {
        console.error('Error registering user:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi đăng ký người dùng',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Login user - FIXED VERSION
const loginUser = async (req, res) => {
    console.log('Login attempt for:', req.body.email);
    
    const connection = await db.promise();
    
    try {
        const { email, password } = req.body;

        // Find user basic info first - SIMPLIFIED QUERY
        const [users] = await connection.execute(`
            SELECT 
                u.id,
                u.name,
                u.email,
                u.phone,
                u.password,
                u.status,
                u.account_locked,
                u.lock_until,
                u.failed_login_attempts,
                u.last_login,
                u.created_at
            FROM users u
            WHERE u.email = ?
        `, [email]);

        console.log('Found users:', users.length);

        // Log failed login if user not found
        if (users.length === 0) {
            await connection.execute(
                `INSERT INTO login_logs (email, ip_address, user_agent, status, failure_reason, created_at)
                 VALUES (?, ?, ?, 'fail', 'User not found', NOW())`,
                [email, req.ip || 'unknown', req.get('User-Agent') || 'unknown']
            );

            return res.status(401).json({
                success: false,
                message: 'Email hoặc mật khẩu không chính xác'
            });
        }

        const user = users[0];
        console.log('User found:', user.email);

        // Check if account is locked
        if (user.account_locked && user.lock_until && new Date(user.lock_until) > new Date()) {
            await connection.execute(
                `INSERT INTO login_logs (user_id, email, ip_address, user_agent, status, failure_reason, created_at)
                 VALUES (?, ?, ?, ?, 'fail', 'Account locked', NOW())`,
                [user.id, email, req.ip || 'unknown', req.get('User-Agent') || 'unknown']
            );

            return res.status(401).json({
                success: false,
                message: `Tài khoản bị khóa đến ${new Date(user.lock_until).toLocaleString('vi-VN')}`
            });
        }

        // Check account status
        if (user.status !== 'active') {
            await connection.execute(
                `INSERT INTO login_logs (user_id, email, ip_address, user_agent, status, failure_reason, created_at)
                 VALUES (?, ?, ?, ?, 'fail', 'Account inactive', NOW())`,
                [user.id, email, req.ip || 'unknown', req.get('User-Agent') || 'unknown']
            );

            return res.status(401).json({
                success: false,
                message: 'Tài khoản đã bị vô hiệu hóa'
            });
        }

        // Verify password
        console.log('Verifying password...');
        const isValidPassword = await bcrypt.compare(password, user.password);
        console.log('Password valid:', isValidPassword);

        if (!isValidPassword) {
            // Increment failed login attempts
            const newFailedAttempts = user.failed_login_attempts + 1;
            const shouldLock = newFailedAttempts >= 5;

            await connection.execute(
                `UPDATE users SET 
                 failed_login_attempts = ?,
                 account_locked = ?,
                 lock_until = ?
                 WHERE id = ?`,
                [
                    newFailedAttempts,
                    shouldLock,
                    shouldLock ? new Date(Date.now() + 30 * 60 * 1000) : null, // 30 minutes
                    user.id
                ]
            );

            await connection.execute(
                `INSERT INTO login_logs (user_id, email, ip_address, user_agent, status, failure_reason, created_at)
                 VALUES (?, ?, ?, ?, 'fail', 'Invalid password', NOW())`,
                [user.id, email, req.ip || 'unknown', req.get('User-Agent') || 'unknown']
            );

            return res.status(401).json({
                success: false,
                message: shouldLock 
                    ? 'Đăng nhập sai quá nhiều lần. Tài khoản đã bị khóa 30 phút.'
                    : 'Email hoặc mật khẩu không chính xác'
            });
        }

        console.log('Password verified, getting roles and permissions...');

        // Get roles separately - FIXED VERSION
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

        // Get permissions separately - FIXED VERSION
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

        console.log('Found roles:', userRoles.length, 'permissions:', userPermissions.length);

        // Attach roles and permissions to user
        user.roles = userRoles;
        user.permissions = userPermissions;

        // Create JWT token
        const token = jwt.sign(
            {
                userId: user.id,
                name: user.name,
                email: user.email,
                roles: user.roles.map(role => role.name),
                permissions: user.permissions.map(permission => permission.code)
            },
            process.env.JSON_WEB_TOKEN_SECRET_KEY || 'default-secret-key',
            { expiresIn: '24h' }
        );

        // Create refresh token
        const refreshToken = jwt.sign(
            { userId: user.id },
            process.env.JSON_WEB_TOKEN_REFRESH_KEY || process.env.JSON_WEB_TOKEN_SECRET_KEY || 'default-refresh-key',
            { expiresIn: '7d' }
        );

        // Update user login info
        await connection.execute(
            `UPDATE users SET 
             last_login = NOW(),
             failed_login_attempts = 0,
             account_locked = FALSE,
             lock_until = NULL
             WHERE id = ?`,
            [user.id]
        );

        // Log successful login
        await connection.execute(
            `INSERT INTO login_logs (user_id, email, ip_address, user_agent, status, message, created_at)
             VALUES (?, ?, ?, ?, 'success', 'Login successful', NOW())`,
            [user.id, email, req.ip || 'unknown', req.get('User-Agent') || 'unknown']
        );

        // Remove sensitive data from response
        delete user.password;
        delete user.failed_login_attempts;
        delete user.account_locked;
        delete user.lock_until;

        console.log('Login successful for user:', user.id);

        res.status(200).json({
            success: true,
            message: 'Đăng nhập thành công',
            data: {
                user,
                token,
                refreshToken
            }
        });

    } catch (error) {
        console.error('Error logging in user:', error);
        
        // Log error
        try {
            await connection.execute(
                `INSERT INTO login_logs (email, ip_address, user_agent, status, failure_reason, created_at)
                 VALUES (?, ?, ?, 'fail', ?, NOW())`,
                [req.body.email || 'unknown', req.ip || 'unknown', req.get('User-Agent') || 'unknown', error.message]
            );
        } catch (logError) {
            console.error('Error logging to database:', logError);
        }

        res.status(500).json({
            success: false,
            message: 'Lỗi khi đăng nhập',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Refresh token - FIXED VERSION
const refreshToken = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                message: 'Refresh token là bắt buộc'
            });
        }

        // Verify refresh token
        const decoded = jwt.verify(refreshToken, process.env.JSON_WEB_TOKEN_REFRESH_KEY || process.env.JSON_WEB_TOKEN_SECRET_KEY);
        
        // Get user basic info
        const [users] = await connection.execute(`
            SELECT 
                u.id,
                u.name,
                u.email,
                u.phone,
                u.status
            FROM users u
            WHERE u.id = ? AND u.status = 'active'
        `, [decoded.userId]);

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Người dùng không tồn tại hoặc đã bị vô hiệu hóa'
            });
        }

        const user = users[0];

        // Get roles separately
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
        `, [user.id]);

        user.roles = userRoles;
        user.permissions = userPermissions;

        // Create new JWT token
        const newToken = jwt.sign(
            {
                userId: user.id,
                name: user.name,
                email: user.email,
                roles: user.roles.map(role => role.name),
                permissions: user.permissions.map(permission => permission.code)
            },
            process.env.JSON_WEB_TOKEN_SECRET_KEY,
            { expiresIn: '24h' }
        );

        res.status(200).json({
            success: true,
            message: 'Làm mới token thành công',
            data: {
                token: newToken,
                user
            }
        });

    } catch (error) {
        console.error('Error refreshing token:', error);
        
        res.status(401).json({
            success: false,
            message: 'Refresh token không hợp lệ hoặc đã hết hạn'
        });
    }
};

// Logout user
const logoutUser = async (req, res) => {
    const connection = await db.promise();
    
    try {
        // Log logout
        await connection.execute(
            `INSERT INTO access_logs (user_id, action_type, object_type, status, ip_address, user_agent, created_at)
             VALUES (?, 'LOGOUT', 'USER', 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.name,
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Đăng xuất thành công'
        });

    } catch (error) {
        console.error('Error logging out user:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi đăng xuất',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Check user permissions
const checkUserPermission = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { permissionCode } = req.params;
        const userId = req.user.userId;

        const [permissions] = await connection.execute(`
            SELECT COUNT(*) as has_permission
            FROM user_roles ur
            JOIN role_permissions rp ON ur.role_id = rp.role_id
            JOIN permissions p ON rp.permission_id = p.id
            WHERE ur.user_id = ? 
            AND ur.is_active = 1 
            AND rp.granted = 1 
            AND p.code = ? 
            AND p.is_active = 1
        `, [userId, permissionCode]);

        const hasPermission = permissions[0].has_permission > 0;

        res.status(200).json({
            success: true,
            message: 'Kiểm tra quyền thành công',
            data: {
                permissionCode,
                hasPermission
            }
        });

    } catch (error) {
        console.error('Error checking user permission:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi kiểm tra quyền',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Verify email (for future implementation)
const verifyEmail = async (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Email đã được xác minh thành công'
    });
};

// Reset password
const resetPassword = async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({
            success: false,
            message: 'Token và mật khẩu mới là bắt buộc'
        });
    }

    if (newPassword.length < 8) {
        return res.status(400).json({
            success: false,
            message: 'Mật khẩu phải có ít nhất 8 ký tự'
        });
    }

    res.status(200).json({
        success: true,
        message: 'Đặt lại mật khẩu thành công'
    });
};

// Change email
const changeEmail = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const userId = req.user.userId;
        const { newEmail, password } = req.body;

        if (!newEmail || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email mới và mật khẩu là bắt buộc'
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newEmail)) {
            return res.status(400).json({
                success: false,
                message: 'Định dạng email không hợp lệ'
            });
        }

        // Get current user
        const [users] = await connection.execute(
            'SELECT email, password FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng'
            });
        }

        const user = users[0];

        // Verify current password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(400).json({
                success: false,
                message: 'Mật khẩu hiện tại không chính xác'
            });
        }

        // Check if new email already exists
        const [existingUsers] = await connection.execute(
            'SELECT id FROM users WHERE email = ? AND id != ?',
            [newEmail, userId]
        );

        if (existingUsers.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Email này đã được sử dụng bởi tài khoản khác'
            });
        }

        // Update email
        await connection.execute(
            'UPDATE users SET email = ?, updated_at = NOW() WHERE id = ?',
            [newEmail, userId]
        );

        res.status(200).json({
            success: true,
            message: 'Thay đổi email thành công'
        });

    } catch (error) {
        console.error('Error changing email:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi thay đổi email',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Enable/Disable 2FA (for future implementation)
const toggle2FA = async (req, res) => {
    const { enable } = req.body;

    res.status(200).json({
        success: true,
        message: enable ? 'Bật xác thực 2 bước thành công' : 'Tắt xác thực 2 bước thành công'
    });
};

// Get user sessions (for future implementation)
const getUserSessions = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const userId = req.user.userId;

        // Get recent login sessions
        const [sessions] = await connection.execute(`
            SELECT 
                ip_address,
                user_agent,
                status,
                created_at,
                CASE 
                    WHEN created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 'active'
                    ELSE 'expired'
                END as session_status
            FROM login_logs
            WHERE user_id = ? AND status = 'success'
            ORDER BY created_at DESC
            LIMIT 10
        `, [userId]);

        res.status(200).json({
            success: true,
            message: 'Lấy danh sách phiên đăng nhập thành công',
            data: {
                sessions,
                currentSession: {
                    ip_address: req.ip,
                    user_agent: req.get('User-Agent'),
                    created_at: new Date()
                }
            }
        });

    } catch (error) {
        console.error('Error getting user sessions:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách phiên đăng nhập',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    registerUser,
    loginUser,
    refreshToken,
    logoutUser,
    checkUserPermission,
    verifyEmail,
    resetPassword,
    changeEmail,
    toggle2FA,
    getUserSessions
};