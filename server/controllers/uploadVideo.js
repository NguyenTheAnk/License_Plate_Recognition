const db = require('../db');
   const path = require('path');
   const fs = require('fs');
   const multer = require('multer');

   // Configure multer for file uploads
   const storage = multer.diskStorage({
     destination: (req, file, cb) => {
       const uploadPath = path.join(__dirname, '../public/uploads/videos');
       if (!fs.existsSync(uploadPath)) {
         fs.mkdirSync(uploadPath, { recursive: true });
       }
       cb(null, uploadPath);
     },
     filename: (req, file, cb) => {
       cb(null, Date.now() + '-' + file.originalname);
     }
   });
   const upload = multer({ storage: storage });

   // Helper function to wrap db.query in Promise
   const query = (sql, params) => {
     return new Promise((resolve, reject) => {
       db.query(sql, params, (err, results) => {
         if (err) reject(err);
         else resolve(results);
       });
     });
   };

   const uploadVideo = async (req, res) => {
     try {
       if (!req.file) {
         return res.status(400).json({ success: false, message: 'Không có tệp nào được tải lên' });
       }
       const fileUrl = `/uploads/videos/${req.file.filename}`;
       const id = Date.now() + '-' + req.file.filename; // Tạo ID duy nhất
       const sql = 'INSERT INTO videos (id, mid, ext, size, saveDir) VALUES (?, ?, ?, ?, ?)';
       const result = await query(sql, [id, 'uploaded', req.file.originalname.split('.').pop(), req.file.size, fileUrl]);
       res.json({ success: true, data: { id, url: fileUrl }, message: 'Tải video thành công' });
     } catch (error) {
       console.error('Lỗi khi tải video:', error);
       res.status(500).json({ success: false, message: 'Lỗi server nội bộ' });
     }
   };

   const listVideos = async (req, res) => {
     try {
       const [rows] = await query('SELECT id, saveDir AS url, mid AS name FROM videos');
       res.json({ success: true, data: rows });
     } catch (error) {
       console.error('Error listing videos:', error);
       res.status(500).json({ success: false, message: 'Internal server error' });
     }
   };

   module.exports = {
     uploadVideo,
     listVideos,
     upload // Thêm dòng này để export upload
   };