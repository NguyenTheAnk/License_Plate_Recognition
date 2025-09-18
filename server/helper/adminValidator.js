const {check} = require('express-validator');


exports.permissionAddValidator =[
    check('module', ' Module is required').not().isEmpty(),
    check('action', ' Action is required').not().isEmpty(),
    check('code', ' Code is required').not().isEmpty(),
]
exports.permissionDeleteValidator =[
    check('id', ' ID is required').not().isEmpty()
]

exports.permissionUpdateValidator =[
    check('id', ' ID is required').not().isEmpty(),
    check('module', ' Module is required').not().isEmpty(),
    check('action', ' Action is required').not().isEmpty(),
    check('code', ' Code is required').not().isEmpty(),
]
exports.permissionUpdateCatValidator =[
    check('id', ' ID is required').not().isEmpty(),
    // check('name', ' name is required').not().isEmpty()
]

exports.categoryAddValidator =[
    check('name', ' Category Name is required').not().isEmpty()
]

exports.permissionDeleteCatValidator =[
    check('id', ' ID is required').not().isEmpty()
]
exports.permissionDeleteRoleValidator =[
    check('id', ' ID is required').not().isEmpty()
]
exports.viewRoleValidator =[
    check('id', ' ID is required').not().isEmpty()
]

exports.storeRoleValidator =[
    check('name', ' Name is required').not().isEmpty()
]
// exports.addRouterPermissionsValidator =[
//     check('router_endpoint', ' Router_endpoint is required').not().isEmpty(),
//     check('role', ' Role is required').not().isEmpty(),
//     check('permission_id', ' Permission_id is required').not().isEmpty(),
//     check('permission', ' Permission must be an array').isArray()
// ]
exports.roleUpdateValidator =[
    check('id', ' ID is required').not().isEmpty(),
    check('name', ' Role_name is required').not().isEmpty()
]
exports.getRouterPermissionsValidator =[
    check('router_endpoint', ' Router_endpoint is required').not().isEmpty(),
]

exports.addModuleValidator =[
    check('module_name', ' Module Name is required').not().isEmpty()
]
exports.moduleUpdateValidator =[
    check('id', ' ID is required').not().isEmpty()
]
exports.moduleDeleteValidator =[
    check('id', ' ID is required').not().isEmpty()
]