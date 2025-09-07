const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Cấu hình multer cho upload video
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../public/uploads/videos');
        
        // Tạo thư mục nếu chưa tồn tại
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Tạo tên file unique với timestamp
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

// Filter để chỉ chấp nhận file video
const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'video/mp4',
        'video/avi',
        'video/mov',
        'video/wmv',
        'video/flv',
        'video/webm',
        'video/mkv'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Chỉ chấp nhận file video (MP4, AVI, MOV, WMV, FLV, WEBM, MKV)'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 500 * 1024 * 1024 // Giới hạn 500MB
    }
});

// Route upload video
router.post('/upload-video', upload.single('video'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Không có file video được upload'
            });
        }

        // Tạo URL tương đối cho video
        const videoUrl = `/uploads/videos/${req.file.filename}`;
        
        console.log('Video uploaded successfully:', {
            originalName: req.file.originalname,
            filename: req.file.filename,
            size: req.file.size,
            path: req.file.path,
            url: videoUrl
        });

        res.json({
            success: true,
            message: 'Upload video thành công',
            videoUrl: videoUrl,
            filename: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size
        });

    } catch (error) {
        console.error('Error uploading video:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi upload video',
            error: error.message
        });
    }
});

// Route để lấy danh sách video đã upload
router.get('/videos', (req, res) => {
    try {
        const videosDir = path.join(__dirname, '../public/uploads/videos');
        
        if (!fs.existsSync(videosDir)) {
            return res.json({
                success: true,
                videos: []
            });
        }

        const files = fs.readdirSync(videosDir);
        const videos = files
            .filter(file => {
                const ext = path.extname(file).toLowerCase();
                return ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv'].includes(ext);
            })
            .map(file => {
                const filePath = path.join(videosDir, file);
                const stats = fs.statSync(filePath);
                return {
                    filename: file,
                    name: path.parse(file).name,
                    size: stats.size,
                    uploadDate: stats.mtime,
                    url: `/uploads/videos/${file}`
                };
            })
            .sort((a, b) => b.uploadDate - a.uploadDate);

        res.json({
            success: true,
            videos: videos
        });

    } catch (error) {
        console.error('Error getting videos list:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách video',
            error: error.message
        });
    }
});

// Route để xóa video
router.delete('/video/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const videoPath = path.join(__dirname, '../public/uploads/videos', filename);
        
        if (!fs.existsSync(videoPath)) {
            return res.status(404).json({
                success: false,
                message: 'File video không tồn tại'
            });
        }

        fs.unlinkSync(videoPath);
        
        console.log('Video deleted successfully:', filename);

        res.json({
            success: true,
            message: 'Xóa video thành công'
        });

    } catch (error) {
        console.error('Error deleting video:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa video',
            error: error.message
        });
    }
});

module.exports = router;
