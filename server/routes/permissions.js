const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const { onlyAdminAccess } = require('../middlewares/adminMiddleware.js');
const checkPermission = require('../middlewares/checkPermission');

// Import all permission controllers
const { createPermission } = require('../controllers/Permissions/createPermission');
const { getPermissionById, getAllPermissions } = require('../controllers/Permissions/getPermission');
const { updatePermission } = require('../controllers/Permissions/updatePermission');
const { deletePermission, bulkDeletePermissions } = require('../controllers/Permissions/deletePermission');
const { searchPermissions, getPermissionsByModule, getPermissionSuggestions } = require('../controllers/Permissions/searchPermission');
const { getPermissionUsageAnalytics, exportPermissions, compareRolePermissions, getPermissionHierarchy } = require('../controllers/Permissions/viewPermission');

// Basic CRUD routes
// GET /permissions - Get all permissions with pagination and filtering
router.get('/', 
    auth, 
    checkPermission('permission.view'),
    getAllPermissions
);

// GET /permissions/:id - Get permission by ID
router.get('/:id', 
    auth, 
    checkPermission('permission.view_detail'),
    getPermissionById
);

// POST /permissions - Create new permission
router.post('/', 
    auth, 
    checkPermission('permission.create'),
    createPermission
);

// PUT /permissions/:id - Update permission
router.put('/:id', 
    auth, 
    checkPermission('permission.update'),
    updatePermission
);

// DELETE /permissions/:id - Delete permission
router.delete('/:id', 
    auth, 
    checkPermission('permission.delete'),
    deletePermission
);


// CHƯA TESTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
// Advanced search and filtering routes
// GET /permissions/search/advanced - Search permissions with advanced filters
router.get('/search/advanced', 
    auth, 
    //checkPermission('permissions.view'),
    searchPermissions
);

// GET /permissions/search/suggestions - Get permission suggestions for autocomplete
router.get('/search/suggestions', 
    auth, 
    //checkPermission('permissions.view'),
    getPermissionSuggestions
);

// Organization and structure routes
// GET /permissions/modules/grouped - Get permissions grouped by module
router.get('/modules/grouped', 
    auth, 
    //checkPermission('permissions.view'),
    getPermissionsByModule
);

// GET /permissions/hierarchy/structure - Get permission hierarchy and dependencies
router.get('/hierarchy/structure', 
    auth, 
    //checkPermission('permissions.view'),
    getPermissionHierarchy
);

// Analytics and reporting routes
// GET /permissions/analytics/usage - Get permission usage analytics
router.get('/analytics/usage', 
    auth, 
    //checkPermission('permissions.view'),
    getPermissionUsageAnalytics
);

// GET /permissions/analytics/compare-roles - Compare permissions between roles
router.get('/analytics/compare-roles', 
    auth, 
    //checkPermission('permissions.view'),
    compareRolePermissions
);

// Export and bulk operations routes
// GET /permissions/export/data - Export permissions to various formats
router.get('/export/data', 
    auth, 
    //checkPermission('permissions.view'),
    exportPermissions
);

// DELETE /permissions/bulk/delete - Bulk delete permissions
router.delete('/bulk/delete', 
    auth, 
    checkPermission('permission.delete_all'),
    bulkDeletePermissions
);

module.exports = router;