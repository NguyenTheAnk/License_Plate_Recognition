const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const dashboardController = require('../controllers/dashboardController');

// Lấy thống kê tổng hợp cho dashboard
router.get('/stats', auth, dashboardController.getDashboardStats);

// Tạo dữ liệu mẫu cho testing
router.post('/create-sample-data', auth, dashboardController.createSampleData);

module.exports = router;
