const mysql = require('mysql2');
require('dotenv').config();

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
});

async function checkAndCreateSampleCamera() {
  try {
    console.log('Checking camera table...');
    
    // Kiểm tra bảng cameras có tồn tại không
    const [tables] = await db.promise().execute(`
      SHOW TABLES LIKE 'cameras'
    `);
    
    if (tables.length === 0) {
      console.log('Camera table does not exist. Creating...');
      await db.promise().execute(`
        CREATE TABLE cameras (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          code VARCHAR(100) UNIQUE,
          protocol VARCHAR(10) DEFAULT 'rtsp',
          host VARCHAR(255) NOT NULL,
          port INT DEFAULT 554,
          path VARCHAR(500) DEFAULT '/',
          username VARCHAR(100),
          password VARCHAR(100),
          width INT DEFAULT 1920,
          height INT DEFAULT 1080,
          fps INT DEFAULT 25,
          status ENUM('active', 'inactive') DEFAULT 'active',
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      console.log('Camera table created successfully.');
    }
    
    // Kiểm tra có camera nào không
    const [cameras] = await db.promise().execute(`
      SELECT COUNT(*) as count FROM cameras WHERE is_active = 1
    `);
    
    console.log(`Found ${cameras[0].count} active cameras`);
    
    if (cameras[0].count === 0) {
      console.log('No cameras found. Creating sample camera...');
      
      // Tạo camera mẫu
      await db.promise().execute(`
        INSERT INTO cameras (name, code, protocol, host, port, path, username, password, width, height, fps, status, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        'Sample Camera 1',
        'CAM001',
        'rtsp',
        '192.168.1.100',
        554,
        '/live/stream1',
        'admin',
        'password123',
        1920,
        1080,
        25,
        'active',
        1
      ]);
      
      console.log('Sample camera created successfully.');
      console.log('Camera details:');
      console.log('- Name: Sample Camera 1');
      console.log('- Code: CAM001');
      console.log('- Protocol: rtsp');
      console.log('- Host: 192.168.1.100');
      console.log('- Port: 554');
      console.log('- Path: /live/stream1');
      console.log('- Username: admin');
      console.log('- Password: password123');
    }
    
    // Hiển thị danh sách camera
    const [allCameras] = await db.promise().execute(`
      SELECT id, name, code, protocol, host, port, path, status, is_active
      FROM cameras
      ORDER BY id
    `);
    
    console.log('\nCurrent cameras:');
    allCameras.forEach(camera => {
      console.log(`- ID: ${camera.id}, Name: ${camera.name}, Code: ${camera.code}, Status: ${camera.status}, Active: ${camera.is_active}`);
    });
    
  } catch (error) {
    console.error('Error checking/creating camera:', error);
  } finally {
    db.end();
  }
}

checkAndCreateSampleCamera(); 