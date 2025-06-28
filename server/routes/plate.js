const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const plateController = require('../controllers/plateController');
const multer = require('multer');
const upload = multer({ dest: 'public/uploads' });

// Nhận diện biển số từ ảnh
router.post('/upload', auth, upload.single('image'), plateController.uploadPlate);
// Tra cứu danh sách biển số
router.get('/', auth, plateController.getPlates);
// Tra cứu chi tiết biển số theo id
router.get('/:id', auth, plateController.getPlateDetail);
// Tra cứu chi tiết biển số theo plate_number
router.get('/by-number/:plate_number', auth, plateController.getPlateDetail);

module.exports = router; 