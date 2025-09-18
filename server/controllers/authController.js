const db = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');

// Helper function to create login log
const createLoginLog = async (connection, user, email, ip, userAgent, status, message) => {
    try {
        await connection.execute(
            `INSERT INTO login_logs (user_id, email, ip_address, user_agent, status, failure_reason, login_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [user, email, ip, userAgent, status, message]
        );
    } catch (error) {
        console.error('Error creating login log:', error);
    }
};

// Helper function to validate password strength
const validatePasswordStrength = (password) => {
    const errors = [];
    
    if (password.length < 8) {
        errors.push('Password must be at least 8 characters long');
    }
    if (!/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }
    if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
        errors.push('Password must contain at least one special character');
    }
    
    return errors;
};

// Register new user
const registerUser = async (req, res) => {
    const connection = await db.promise();
    
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                msg: 'Validation errors',
                errors: errors.array(),
            });
        }

        const {
            name,
            email,
            phone,
            password
        } = req.body;

        // Validate input
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                msg: 'Name, email and password are required'
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                msg: 'Invalid email format'
            });
        }

        // Validate password strength
        const passwordErrors = validatePasswordStrength(password);
        if (passwordErrors.length > 0) {
            return res.status(400).json({
                success: false,
                msg: 'Password validation failed',
                errors: passwordErrors
            });
        }

        // Check if email already exists
        const [existingUsers] = await connection.execute(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );

        if (existingUsers.length > 0) {
            await createLoginLog(connection, null, email, req.ip || 'unknown', req.get('User-Agent') || 'unknown', 'failed', 'Email already exists');
            return res.status(400).json({
                success: false,
                msg: 'Email already exists!'
            });
        }

        // Hash password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Create user with password expiry
        const passwordExpiresAt = new Date();
        passwordExpiresAt.setDate(passwordExpiresAt.getDate() + 90); // 90 days from now

        const [userResult] = await connection.execute(
            `INSERT INTO users (name, email, phone, password, status, last_password_changed_at, password_expires_at, created_at, updated_at) 
             VALUES (?, ?, ?, ?, 'active', NOW(), ?, NOW(), NOW())`,
            [name, email, phone, hashedPassword, passwordExpiresAt]
        );

        const userId = userResult.insertId;

        // Assign role with id = 4 (Người dùng)
        const [targetRole] = await connection.execute(
            'SELECT id, name FROM roles WHERE id = ? AND is_active = 1',
            [4]
        );

        if (targetRole.length > 0) {
            await connection.execute(
                'INSERT INTO user_roles (user_id, role_id, assigned_by, assigned_at, is_active) VALUES (?, ?, ?, NOW(), 1)',
                [userId, 4, userId]
            );
        } else {
            // Fallback to default role if role id = 4 doesn't exist
            const [defaultRole] = await connection.execute(
                'SELECT id FROM roles WHERE is_default_role = 1 AND is_active = 1 LIMIT 1'
            );
            
            if (defaultRole.length > 0) {
                await connection.execute(
                    'INSERT INTO user_roles (user_id, role_id, assigned_by, assigned_at, is_active) VALUES (?, ?, ?, NOW(), 1)',
                    [userId, defaultRole[0].id, userId]
                );
            }
        }

        // Get user with roles and permissions
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
        await createLoginLog(connection, userId, email, req.ip || 'unknown', req.get('User-Agent') || 'unknown', 'success', 'User registered successfully');

        res.status(201).json({
            success: true,
            msg: 'User registered successfully!',
            data: {
                user,
                token,
                refreshToken
            }
        });

    } catch (error) {
        console.error('Error registering user:', error);
        
        // Log registration error
        try {
            await createLoginLog(connection, null, req.body.email || 'unknown', req.ip || 'unknown', req.get('User-Agent') || 'unknown', 'failed', error.message);
        } catch (logError) {
            console.error('Error logging registration failure:', logError);
        }
        
        res.status(500).json({
            success: false,
            msg: 'Server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Enable/Disable 2FA (for future implementation)
const toggle2FA = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { enable } = req.body;
        const userId = req.user.userId;

        // Log 2FA toggle action
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'UPDATE', '2FA', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                userId, 
                req.user.name, 
                JSON.stringify({twoFactorEnabled: enable}),
                req.ip || 'unknown', 
                req.get('User-Agent') || 'unknown'
            ]
        );

        res.status(200).json({
            success: true,
            message: enable ? 'Bật xác thực 2 bước thành công' : 'Tắt xác thực 2 bước thành công'
        });

    } catch (error) {
        console.error('Error toggling 2FA:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi thay đổi cài đặt xác thực 2 bước',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get user sessions
const getUserSessions = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const userId = req.user.userId;

        // Get recent login sessions from login_logs
        const [sessions] = await connection.execute(`
            SELECT 
                ll.ip_address,
                ll.user_agent,
                ll.status,
                ll.login_at as created_at,
                ll.session_id,
                CASE 
                    WHEN ll.login_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) AND ll.status = 'success' THEN 'active'
                    ELSE 'expired'
                END as session_status,
                CASE
                    WHEN ll.ip_address = ? THEN true
                    ELSE false
                END as is_current
            FROM login_logs ll
            WHERE ll.user_id = ? AND ll.status = 'success'
            ORDER BY ll.login_at DESC
            LIMIT 10
        `, [req.ip || 'unknown', userId]);

        // Get user profile info
        const [userInfo] = await connection.execute(`
            SELECT 
                id,
                name,
                email,
                last_login_at,
                created_at
            FROM users 
            WHERE id = ?
        `, [userId]);

        res.status(200).json({
            success: true,
            message: 'Lấy danh sách phiên đăng nhập thành công',
            data: {
                user: userInfo[0],
                sessions,
                currentSession: {
                    ip_address: req.ip || 'unknown',
                    user_agent: req.get('User-Agent') || 'unknown',
                    created_at: new Date(),
                    session_status: 'active',
                    is_current: true
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

// Get user profile
const getUserProfile = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const userId = req.user.userId;

        // Get user info with roles and permissions
        const [users] = await connection.execute(`
            SELECT 
                u.id,
                u.name,
                u.email,
                u.phone,
                u.status,
                u.last_login_at,
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

        // Get roles
        const [userRoles] = await connection.execute(`
            SELECT DISTINCT
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
        `, [userId]);

        // Get permissions
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
            AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        `, [userId]);

        user.roles = userRoles;
        user.permissions = userPermissions;

        res.status(200).json({
            success: true,
            message: 'Lấy thông tin hồ sơ thành công',
            data: {
                user
            }
        });

    } catch (error) {
        console.error('Error getting user profile:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin hồ sơ',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get user permissions
const getUserPermissions = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const userId = req.user.userId;

        // Get permissions
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
            AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        `, [userId]);

        res.status(200).json({
            success: true,
            msg: 'User permissions retrieved successfully!',
            data: userPermissions
        });

    } catch (error) {
        console.error('Error getting user permissions:', error);
        
        res.status(500).json({
            success: false,
            msg: error.message
        });
    }
};

// Update user profile
const updateUserProfile = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const userId = req.user.userId;
        const { name, phone } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Tên là bắt buộc'
            });
        }

        // Get current user data
        const [currentUser] = await connection.execute(
            'SELECT name, phone FROM users WHERE id = ?',
            [userId]
        );

        if (currentUser.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng'
            });
        }

        const oldValues = currentUser[0];

        // Update user profile
        await connection.execute(
            'UPDATE users SET name = ?, phone = ?, updated_at = NOW() WHERE id = ?',
            [name, phone || null, userId]
        );

        // Log profile update
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, old_values, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'UPDATE', 'PROFILE', ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                userId, 
                name, // Use new name
                JSON.stringify(oldValues), 
                JSON.stringify({name, phone}),
                req.ip || 'unknown', 
                req.get('User-Agent') || 'unknown'
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Cập nhật hồ sơ thành công'
        });

    } catch (error) {
        console.error('Error updating user profile:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật hồ sơ',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Revoke session (terminate specific session)
const revokeSession = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const userId = req.user.userId;
        const { sessionId } = req.params;

        // Log session revocation
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'DELETE', 'SESSION', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                userId, 
                req.user.name,
                sessionId,
                req.ip || 'unknown', 
                req.get('User-Agent') || 'unknown'
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Thu hồi phiên đăng nhập thành công'
        });

    } catch (error) {
        console.error('Error revoking session:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi thu hồi phiên đăng nhập',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get user activity logs
const getUserActivityLogs = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const userId = req.user.userId;
        const { page = 1, limit = 20, action_type, date_from, date_to } = req.query;
        
        const offset = (page - 1) * limit;
        
        // Build WHERE clause
        let whereClause = 'WHERE al.user_id = ?';
        let queryParams = [userId];
        
        if (action_type) {
            whereClause += ' AND al.action_type = ?';
            queryParams.push(action_type);
        }
        
        if (date_from) {
            whereClause += ' AND DATE(al.created_at) >= ?';
            queryParams.push(date_from);
        }
        
        if (date_to) {
            whereClause += ' AND DATE(al.created_at) <= ?';
            queryParams.push(date_to);
        }

        // Get activity logs
        const [logs] = await connection.execute(`
            SELECT 
                al.id,
                al.action_type,
                al.object_type,
                al.object_id,
                al.object_name,
                al.status,
                al.ip_address,
                al.user_agent,
                al.created_at,
                al.response_time_ms,
                al.records_affected
            FROM access_logs al
            ${whereClause}
            ORDER BY al.created_at DESC
            LIMIT ? OFFSET ?
        `, [...queryParams, parseInt(limit), offset]);

        // Get total count
        const [totalCount] = await connection.execute(`
            SELECT COUNT(*) as total
            FROM access_logs al
            ${whereClause}
        `, queryParams);

        const total = totalCount[0].total;
        const totalPages = Math.ceil(total / limit);

        res.status(200).json({
            success: true,
            message: 'Lấy nhật ký hoạt động thành công',
            data: {
                logs,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    totalPages,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Error getting user activity logs:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy nhật ký hoạt động',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Login user
const loginUser = async (req, res) => {
    console.log('Login attempt for:', req.body.email);
    
    const connection = await db.promise();
    
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            await createLoginLog(connection, null, req.body.email || '', req.ip || 'unknown', req.get('User-Agent') || 'unknown', 'failed', 'Validation errors');
            return res.status(400).json({
                success: false,
                msg: 'Validation errors',
                errors: errors.array(),
            });
        }

        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            await createLoginLog(connection, null, email || '', req.ip || 'unknown', req.get('User-Agent') || 'unknown', 'failed', 'Email and password are required');
            return res.status(400).json({
                success: false,
                msg: 'Email and password are required'
            });
        }

        // Find user basic info first
        const [users] = await connection.execute(`
            SELECT 
                u.id,
                u.name,
                u.email,
                u.phone,
                u.password,
                u.status,
                u.is_account_locked,
                u.locked_until,
                u.failed_login_attempts,
                u.last_login_at,
                u.password_expires_at,
                u.created_at
            FROM users u
            WHERE u.email = ?
        `, [email]);

        console.log('Found users:', users.length);

        // Log failed login if user not found
        if (users.length === 0) {
            await createLoginLog(connection, null, email, req.ip || 'unknown', req.get('User-Agent') || 'unknown', 'failed', 'User not found');
            return res.status(401).json({
                success: false,
                msg: 'Login information is incorrect!'
            });
        }

        const user = users[0];
        console.log('User found:', user.email);

        // Check if account is locked
        if (user.is_account_locked && user.locked_until && new Date(user.locked_until) > new Date()) {
            await createLoginLog(connection, user.id, email, req.ip || 'unknown', req.get('User-Agent') || 'unknown', 'failed', 'Account locked');
            return res.status(401).json({
                success: false,
                msg: `Account locked until ${new Date(user.locked_until).toLocaleString()}`
            });
        }

        // Check account status
        if (user.status !== 'active') {
            await createLoginLog(connection, user.id, email, req.ip || 'unknown', req.get('User-Agent') || 'unknown', 'failed', 'Account inactive');
            return res.status(401).json({
                success: false,
                msg: 'Account has been disabled'
            });
        }

        // Check password expiry
        if (user.password_expires_at && new Date(user.password_expires_at) < new Date()) {
            await createLoginLog(connection, user.id, email, req.ip || 'unknown', req.get('User-Agent') || 'unknown', 'failed', 'Password expired');
            return res.status(401).json({
                success: false,
                msg: 'Password has expired. Please reset your password.',
                requirePasswordReset: true
            });
        }

        // Verify password
        console.log('Verifying password...');
        const isValidPassword = await bcrypt.compare(password, user.password);
        console.log('Password valid:', isValidPassword);

        if (!isValidPassword) {
            // Increment failed login attempts
            const newFailedAttempts = user.failed_login_attempts + 1;
            const maxAttempts = 5; // From system_settings
            const shouldLock = newFailedAttempts >= maxAttempts;

            await connection.execute(
                `UPDATE users SET 
                 failed_login_attempts = ?,
                 is_account_locked = ?,
                 locked_until = ?,
                 updated_at = NOW()
                 WHERE id = ?`,
                [
                    newFailedAttempts,
                    shouldLock,
                    shouldLock ? new Date(Date.now() + 30 * 60 * 1000) : null, // 30 minutes
                    user.id
                ]
            );

            await createLoginLog(connection, user.id, email, req.ip || 'unknown', req.get('User-Agent') || 'unknown', 'failed', 'Wrong password');

            return res.status(401).json({
                success: false,
                msg: shouldLock 
                    ? 'Too many failed login attempts. Account locked for 30 minutes.'
                    : `Login information is incorrect! (${maxAttempts - newFailedAttempts} attempts remaining)`
            });
        }

        console.log('Password verified, getting roles and permissions...');

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
            AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
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
            WHERE ur.user_id = ? 
            AND ur.is_active = 1 
            AND r.is_active = 1 
            AND rp.granted = 1 
            AND p.is_active = 1
            AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
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

        // Generate session ID
        const sessionId = require('crypto').randomBytes(64).toString('hex');

        // Update user login info
        await connection.execute(
            `UPDATE users SET 
             last_login_at = NOW(),
             failed_login_attempts = 0,
             is_account_locked = FALSE,
             locked_until = NULL,
             updated_at = NOW()
             WHERE id = ?`,
            [user.id]
        );

        // Log successful login with session ID
        await createLoginLog(connection, user.id, email, req.ip || 'unknown', req.get('User-Agent') || 'unknown', 'success', 'Login successfully');

        // Log access event
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, status, ip_address, user_agent, session_id, created_at)
             VALUES (?, ?, 'LOGIN', 'USER', 'SUCCESS', ?, ?, ?, NOW())`,
            [user.id, user.name, req.ip || 'unknown', req.get('User-Agent') || 'unknown', sessionId]
        );

        // Remove sensitive data from response
        delete user.password;
        delete user.failed_login_attempts;
        delete user.is_account_locked;
        delete user.locked_until;
        delete user.password_expires_at;

        console.log('Login successful for user:', user.id);

        res.status(200).json({
            success: true,
            msg: 'Login successfully!',
            data: {
                token: token,
                refreshToken: refreshToken,
                user: user
            }
        });

    } catch (error) {
        console.error('Error logging in user:', error);
        
        // Log error
        try {
            await createLoginLog(connection, null, req.body.email || 'unknown', req.ip || 'unknown', req.get('User-Agent') || 'unknown', 'failed', error.message);
        } catch (logError) {
            console.error('Error logging to database:', logError);
        }

        res.status(500).json({
            success: false,
            msg: error.message
        });
    }
};

// Refresh token
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
                u.status,
                u.is_account_locked,
                u.locked_until
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

        // Check if account is locked
        if (user.is_account_locked && user.locked_until && new Date(user.locked_until) > new Date()) {
            return res.status(401).json({
                success: false,
                message: 'Tài khoản đang bị khóa'
            });
        }

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
            AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
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
            WHERE ur.user_id = ? 
            AND ur.is_active = 1 
            AND r.is_active = 1 
            AND rp.granted = 1 
            AND p.is_active = 1
            AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
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

        // Remove sensitive data
        delete user.is_account_locked;
        delete user.locked_until;

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
        // Generate session ID for tracking
        const sessionId = require('crypto').randomBytes(32).toString('hex');

        // Log logout in access_logs
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, status, ip_address, user_agent, session_id, created_at)
             VALUES (?, ?, 'LOGOUT', 'USER', 'SUCCESS', ?, ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.name,
                req.ip || 'unknown',
                req.get('User-Agent') || 'unknown',
                sessionId
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
            AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
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
    const connection = await db.promise();
    
    try {
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

        // In a real implementation, you would verify the reset token here
        // For now, we'll just return success
        res.status(200).json({
            success: true,
            message: 'Đặt lại mật khẩu thành công'
        });

    } catch (error) {
        console.error('Error resetting password:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi đặt lại mật khẩu',
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
    toggle2FA,
    getUserSessions,
    getUserProfile,
    getUserPermissions
};