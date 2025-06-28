const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const accessControlController = require('../controllers/accessControlController');

// Lấy danh sách whitelist/blacklist
router.get('/', auth, accessControlController.getAccessControl);
// Thêm mới
router.post('/', auth, accessControlController.createAccessControl);
// Cập nhật
router.put('/:id', auth, accessControlController.updateAccessControl);
// Xoá
router.delete('/:id', auth, accessControlController.deleteAccessControl);

module.exports = router;
