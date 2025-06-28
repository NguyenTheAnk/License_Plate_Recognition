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

module.exports = router; 