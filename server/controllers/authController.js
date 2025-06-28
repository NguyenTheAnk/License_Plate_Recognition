const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

// Sinh access token với fallback cho JWT secret
const generateAccessToken = (user) => {
  const secret = process.env.JSON_WEB_TOKEN_SECRET_KEY || process.env.JWT_SECRET || 'fallback-secret-key';
  console.log('JWT Secret exists:', !!secret);
  return jwt.sign(user, secret, { expiresIn: '2h' });
};

// Đăng ký người dùng - đồng bộ với frontend Register.js
const registerUser = async (req, res) => {
  try {
    console.log('=== REGISTER DEBUG ===');
    console.log('req.body:', req.body);
    
    const { username, email, password } = req.body;
    
    console.log('Extracted fields:');
    console.log('- username:', username);
    console.log('- email:', email);
    console.log('- password:', password ? '[HIDDEN]' : 'undefined');
    
    // Kiểm tra required fields - đồng bộ với frontend
    if (!username || !email || !password) {
      console.log('Missing required fields');
      return res.status(400).json({ 
        success: false, 
        msg: 'Vui lòng nhập đầy đủ thông tin: tên đăng nhập, email và mật khẩu!'
      });
    }

    // Test database connection
    console.log('Testing database connection...');
    try {
      const [testRows] = await db.promise().query('SELECT 1 as test');
      console.log('Database connection OK');
    } catch (dbError) {
      console.error('Database connection failed:', dbError);
      return res.status(500).json({ 
        success: false, 
        msg: 'Lỗi kết nối cơ sở dữ liệu'
      });
    }

    // Kiểm tra mật khẩu mạnh - đồng bộ với frontend validation
    console.log('Validating password...');
    if (password.length < 8) {
      return res.status(400).json({ 
        success: false, 
        msg: 'Mật khẩu phải có ít nhất 8 ký tự!' 
      });
    }
    
    // Kiểm tra các yêu cầu mật khẩu phức tạp
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`])/.test(password)) {
      return res.status(400).json({ 
        success: false, 
        msg: 'Mật khẩu phải chứa ít nhất: 1 chữ hoa, 1 chữ thường, 1 số và 1 ký tự đặc biệt!' 
      });
    }

    // Kiểm tra username đã tồn tại
    console.log('Checking existing username...');
    const [existUsernameRows] = await db.promise().query('SELECT id FROM users WHERE username = ?', [username]);
    if (existUsernameRows.length > 0) {
      console.log('Username already exists');
      return res.status(400).json({ 
        success: false, 
        msg: 'Tên đăng nhập đã tồn tại!' 
      });
    }

    // Kiểm tra email đã tồn tại
    console.log('Checking existing email...');
    const [existEmailRows] = await db.promise().query('SELECT id FROM users WHERE email = ?', [email]);
    if (existEmailRows.length > 0) {
      console.log('Email already exists');
      return res.status(400).json({ 
        success: false, 
        msg: 'Email đã tồn tại!' 
      });
    }

    // Hash password
    console.log('Hashing password...');
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('Password hashed successfully');

    // Lấy role mặc định - với fallback tạo role nếu chưa có
    console.log('Getting default role...');
    let [roleRows] = await db.promise().query('SELECT id FROM roles WHERE is_default_role = TRUE LIMIT 1');
    
    if (roleRows.length === 0) {
      console.log('No default role found, creating one...');
      try {
        const [roleResult] = await db.promise().query(
          'INSERT INTO roles (name, description, is_default_role, level) VALUES (?, ?, TRUE, ?)',
          ['User', 'Default user role', 10]
        );
        roleRows = [{ id: roleResult.insertId }];
        console.log('Created default role with ID:', roleResult.insertId);
      } catch (roleError) {
        console.error('Error creating default role:', roleError);
        return res.status(500).json({ 
          success: false, 
          msg: 'Lỗi tạo role mặc định' 
        });
      }
    }

    // Thêm user với thông tin đồng bộ
    console.log('Inserting user...');
    const [result] = await db.promise().query(
      'INSERT INTO users (name, username, email, phone, password, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
      [username, username, email, null, hashedPassword, 'active'] // name = username để đơn giản
    );
    
    console.log('User inserted with ID:', result.insertId);

    // Gán role mặc định
    console.log('Assigning default role...');
    await db.promise().query(
      'INSERT INTO user_roles (user_id, role_id, is_active) VALUES (?, ?, TRUE)',
      [result.insertId, roleRows[0].id]
    );

    console.log('=== REGISTRATION SUCCESSFUL ===');
    return res.status(201).json({ 
      success: true, 
      msg: 'Đăng ký thành công!',
      user: {
        id: result.insertId,
        username: username,
        email: email
      }
    });

  } catch (error) {
    console.error('=== REGISTRATION ERROR ===');
    console.error('Error details:', error);
    return res.status(500).json({ 
      success: false, 
      msg: 'Lỗi server khi đăng ký!'
    });
  }
};

// Đăng nhập người dùng - đồng bộ với frontend Login.js
const loginUser = async (req, res) => {
  try {
    console.log('=== LOGIN DEBUG ===');
    console.log('req.body:', req.body);
    
    const { username, password } = req.body; // Frontend Login.js gửi username và password
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu!'
      });
    }

    // Tìm user bằng username hoặc email (để linh hoạt)
    console.log('Finding user by username:', username);
    const [userRows] = await db.promise().query(
      'SELECT * FROM users WHERE username = ? OR email = ?', 
      [username, username] // Cho phép đăng nhập bằng username hoặc email
    );
    
    if (userRows.length === 0) {
      console.log('User not found');
      return res.status(400).json({ 
        success: false, 
        error: 'Sai tài khoản hoặc mật khẩu!' 
      });
    }

    const user = userRows[0];
    console.log('Found user:', { id: user.id, username: user.username, status: user.status });
    
    // Kiểm tra trạng thái tài khoản
    if (user.status !== 'active') {
      return res.status(403).json({ 
        success: false, 
        error: 'Tài khoản đã bị khóa!' 
      });
    }

    if (user.account_locked) {
      return res.status(403).json({ 
        success: false, 
        error: 'Tài khoản bị khóa do đăng nhập sai quá nhiều lần!' 
      });
    }

    // So sánh mật khẩu
    console.log('Comparing password...');
    const isMatch = await bcrypt.compare(password, user.password);
    console.log('Password match:', isMatch);
    
    if (!isMatch) {
      // Tăng số lần đăng nhập thất bại
      const newFailedAttempts = (user.failed_login_attempts || 0) + 1;
      const shouldLock = newFailedAttempts >= 5;
      
      await db.promise().query(
        'UPDATE users SET failed_login_attempts = ?, account_locked = ? WHERE id = ?', 
        [newFailedAttempts, shouldLock, user.id]
      );
      
      if (shouldLock) {
        return res.status(400).json({ 
          success: false, 
          error: 'Tài khoản đã bị khóa do đăng nhập sai 5 lần!' 
        });
      }
      
      return res.status(400).json({ 
        success: false, 
        error: `Sai tài khoản hoặc mật khẩu! Còn ${5 - newFailedAttempts} lần thử.` 
      });
    }

    // Reset failed attempts và cập nhật last login
    await db.promise().query(
      'UPDATE users SET failed_login_attempts = 0, account_locked = FALSE, last_login = NOW() WHERE id = ?', 
      [user.id]
    );

    // Lấy roles của user
    const [roleRows] = await db.promise().query(
      `SELECT r.name, r.level, r.description 
       FROM user_roles ur 
       JOIN roles r ON ur.role_id = r.id 
       WHERE ur.user_id = ? AND ur.is_active = TRUE`, 
      [user.id]
    );

    // Kiểm tra mật khẩu có hết hạn không (có thể thêm logic hết hạn 90 ngày)
    const passwordExpired = false;

    // Sinh token
    const token = generateAccessToken({ 
      userId: user.id, 
      email: user.email, 
      username: user.username,
      roles: roleRows.map(r => r.name)
    });

    // Tạo user object để trả về - đồng bộ với frontend Login.js
    const userResponse = {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      phone: user.phone,
      status: user.status,
      roles: roleRows,
      passwordExpired: passwordExpired
    };

    console.log('Login successful for user:', user.username);
    
    // Response format đồng bộ với frontend Login.js
    return res.status(200).json({ 
      success: true, 
      message: 'Đăng nhập thành công!',
      data: {
        token: token, // Frontend mong đợi data.token
        user: userResponse
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Lỗi server. Vui lòng thử lại!' 
    });
  }
};

// Lấy profile người dùng
const getProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const [userRows] = await db.promise().query(
      `SELECT u.id, u.name, u.username, u.email, u.phone, u.status, u.created_at, u.updated_at,
        GROUP_CONCAT(r.name) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = TRUE
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.id = ?
      GROUP BY u.id`, [userId]
    );
    
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, msg: 'User not found' });
    }
    
    return res.status(200).json({ success: true, data: userRows[0] });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ success: false, msg: 'Server error', error: error.message });
  }
};

// Lấy quyền của user
const getUserPermissions = async (req, res) => {
  try {
    const userId = req.user.userId;
    const [permRows] = await db.promise().query(
      `SELECT p.code, p.module, p.action, p.description
      FROM user_roles ur
      JOIN role_permissions rp ON ur.role_id = rp.role_id AND rp.granted = TRUE
      JOIN permissions p ON rp.permission_id = p.id AND p.is_active = TRUE
      WHERE ur.user_id = ? AND ur.is_active = TRUE`, [userId]
    );
    
    return res.status(200).json({ success: true, permissions: permRows });
  } catch (error) {
    console.error('Get permissions error:', error);
    return res.status(500).json({ success: false, msg: 'Server error', error: error.message });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getProfile,
  getUserPermissions,
};