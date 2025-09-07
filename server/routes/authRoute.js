const express = require('express');
const router = express.Router();

// Import controllers
const authController = require('../controllers/authController');

// Import middlewares
const auth = require('../middlewares/authMiddleware');

// Import validators
const { 
    registerValidator, 
    loginValidator, 
    refreshTokenValidator,
    resetPasswordValidator,
    changeEmailValidator,
    forgotPasswordValidator
} = require('../helper/validator');

// Authentication routes
router.post('/register', authController.registerUser);
router.post('/login', loginValidator, authController.loginUser);
router.post('/refresh-token', refreshTokenValidator, authController.refreshToken);
router.post('/logout', auth, authController.logoutUser);

// Password management routes
router.post('/forgot-password', forgotPasswordValidator, authController.resetPassword);
router.post('/reset-password', resetPasswordValidator, authController.resetPassword);

// // Email management
// router.put('/change-email', auth, changeEmailValidator, authController.changeEmail);

// Permission check
router.get('/check-permission/:permissionCode', auth, authController.checkUserPermission);

// User sessions
router.get('/sessions', auth, authController.getUserSessions);

// Email verification (for future use)
router.get('/verify-email/:token', authController.verifyEmail);

// 2FA management (for future use)
router.post('/toggle-2fa', auth, authController.toggle2FA);

// Health check
router.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Auth API is healthy',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;