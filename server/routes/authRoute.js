const express = require('express');
const router = express.Router();

const auth = require('../middlewares/authMiddleware');
const authController = require('../controllers/authController');

// Routes không cần authentication
// Chú ý: Frontend gọi api/auth/register và api/auth/login
router.post('/register', authController.registerUser);
router.post('/login', authController.loginUser);

// Routes cần authentication
router.get('/profile', auth, authController.getProfile);
router.get('/permissions', auth, authController.getUserPermissions);

// Test route
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Auth routes working!',
    routes: [
      'POST /api/auth/register',
      'POST /api/auth/login', 
      'GET /api/auth/profile',
      'GET /api/auth/permissions'
    ]
  });
});

module.exports = router;