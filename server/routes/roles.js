const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const roleController = require('../controllers/admin/roleController');

router.get('/', auth, roleController.getRoles);
router.get('/:id', auth, roleController.getRoleById);
router.post('/', auth, roleController.storeRole);
router.put('/:id', auth, roleController.updateRole);
router.delete('/:id', auth, roleController.deleteRole);
router.post('/:id/permissions', auth, roleController.updateRolePermissions);
router.get('/:id/permissions', auth, roleController.getRolePermissionsWithRemaining);

module.exports = router;