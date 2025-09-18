const express = require('express');
const router = express.Router();
// Import controllers
const { createRole } = require('../controllers/Role/createRole');
const { getRoles, getRoleById } = require('../controllers/Role/getRole');
const { updateRole, updateRolePermissions } = require('../controllers/Role/updateRole');
const { deleteRole, softDeleteRole } = require('../controllers/Role/deleteRole');
const { searchRoles, getRoleHierarchy } = require('../controllers/Role/searchRole');
const { getRolePermissionsWithRemaining, getRoleUsers, getRoleStatistics, getAllPermissions } = require('../controllers/Role/viewRole');

// Import middlewares
const auth = require('../middlewares/authMiddleware');
const checkPermission = require('../middlewares/checkPermission');
const { onlyAdminAccess } = require('../middlewares/adminMiddleware');
// Get all roles with pagination, filtering, sorting
router.get('/', auth,checkPermission('role.view'), getRoles);

// Get specific role by ID with detailed information
router.get('/:id', auth,checkPermission('role.view_detail'), getRoleById);

// Create new role
router.post('/', auth,checkPermission('role.create'), createRole);

// Update role information
router.put('/:id', auth, checkPermission('role.update'), updateRole);

router.put('/:id/rolePermission', auth,checkPermission('role.update_permission'), updateRolePermissions);
// Delete role (hard delete)
router.delete('/:id', auth,checkPermission('role.delete'), deleteRole);

// Lấy thông tin role đó có những quyền nào ứng với module nào
router.get('/:id/permissions', auth, checkPermission('role.view_detail'), getRolePermissionsWithRemaining);

// Lấy tất cả các quyền ứng với từng module
router.get('/permissions/all', auth, getAllPermissions);


// 3 cái cuối chưa test
// Search roles with advanced filters
router.get('/search/advanced', auth, searchRoles);

// Get role hierarchy structure
router.get('/hierarchy/tree', auth, getRoleHierarchy);

// Get detailed statistics for specific role
router.get('/:id/statistics', auth, getRoleStatistics);


module.exports = router;