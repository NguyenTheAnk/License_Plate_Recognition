const {check} = require('express-validator');

exports.registerValidator =[
    check('name', 'Name is required').not().isEmpty(),
    check('phone', 'Phone is required').not().isEmpty(),
    check('email', 'Email is required').isEmail(),
    check('password', 'Password is required')
        .not().isEmpty()
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
        .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
        .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
        .matches(/[0-9]/).withMessage('Password must contain at least one number')
        .matches(/[^A-Za-z0-9]/).withMessage('Password must contain at least one special character')
]

exports.loginValidator =[
    check('email', 'Email is required').isEmail(),
    check('password', 'Password is required').not().isEmpty()
]

exports.createUserValidator =[
    check('name', 'Name is required').not().isEmpty(),
    check('email', 'Email is required').isEmail().normalizeEmail({
        gmail_remove_dots: true
    }),
   
]
exports.updateUserValidator =[
    check('id', 'ID is required').not().isEmpty(),
    check('name', 'Name is required').not().isEmpty()

]
exports.deleteUserValidator =[
    check('id', 'ID is required').not().isEmpty(),

]