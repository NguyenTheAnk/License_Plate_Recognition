const mysql = require('mysql2');
require('dotenv').config();

// Sử dụng connection pool thay vì single connection
const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'license_plate_recognition',
  port: process.env.DB_PORT || 3306,
  dateStrings: true, // Đảm bảo trả về ngày dạng string, không bị lệch timezone
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  idleTimeout: 300000
});

// Test connection
db.getConnection((err, connection) => {
  if (err) {
    console.error('Error connecting to database:', err);
    console.log('Server will continue without database connection');
    return;
  }
  console.log('Connected to MySQL database with connection pool');
  connection.release();
});

// Thêm error handler để tránh crash
db.on('error', (err) => {
  console.error('Database pool error:', err);
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    console.log('Database connection was closed. Pool will handle reconnection...');
  } else if (err.code === 'ER_CON_COUNT_ERROR') {
    console.log('Database has too many connections.');
  } else if (err.code === 'ECONNREFUSED') {
    console.log('Database connection was refused.');
  } else {
    console.log('Database error:', err);
  }
});

module.exports = db; 