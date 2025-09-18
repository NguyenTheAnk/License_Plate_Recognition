const express = require('express');
const router = express.Router();
const { searchPlateRoute, getPlateRouteStats } = require('../controllers/plateRouteController');
const authMiddleware = require('../middlewares/authMiddleware');

// Tìm kiếm hành trình biển số xe
router.get('/search-route', authMiddleware, searchPlateRoute);

// Lấy thống kê hành trình biển số xe
router.get('/route-stats', authMiddleware, getPlateRouteStats);

module.exports = router;
