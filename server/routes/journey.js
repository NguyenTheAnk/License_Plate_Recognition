const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const journeyController = require('../controllers/journeyController');

// Lấy danh sách lộ trình
router.get('/', auth, journeyController.getJourneys);

// Lấy chi tiết lộ trình theo id
router.get('/:id', auth, journeyController.getJourneyDetail);

// Lấy chi tiết lộ trình theo biển số và ngày
router.get('/detail', auth, journeyController.getJourneyDetail);

// Nhận diện biển số xe từ video/camera cho giám sát lộ trình
router.post('/detect-plates', auth, journeyController.detectPlatesFromStream);

// Lấy danh sách nhận diện biển số theo lộ trình
router.get('/detections/list', auth, journeyController.getJourneyDetections);

// Tạo lộ trình mới từ các phát hiện biển số
router.post('/create-from-detections', auth, journeyController.createJourneyFromDetections);

module.exports = router; 