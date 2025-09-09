const express = require('express');
const router = express.Router();
const checkPermission = require('../middlewares/checkPermission');
// Import controllers
const {
    getLicensePlateRecognitions,
    getLicensePlateRecognitionById,
    getLicensePlateRecognitionStats,
    deleteLicensePlateRecognition,
    updateRecognitionVerification,
    createLicensePlateRecognition
} = require('../controllers/plateRecognitionController');

// Import middlewares
const auth = require('../middlewares/authMiddleware');

// ========================================
// LICENSE PLATE RECOGNITIONS CRUD ROUTES
// ========================================

// Create new license plate recognition (for real-time detection)
router.post('/detected-plates', 
    createLicensePlateRecognition
);

// Get all license plate recognitions with pagination and filters
router.get('/', 
    // auth,  // Tạm thời bỏ auth để test
    // checkPermission('recognition_plate.view'), 
    getLicensePlateRecognitions
);

// Get license plate recognition statistics
router.get('/stats', 
    auth, 
    getLicensePlateRecognitionStats
);

// Get single license plate recognition by ID
router.get('/:id', 
    auth, 
    checkPermission('recognition_plate.view_detail'),
    getLicensePlateRecognitionById
);

// Delete license plate recognition
router.delete('/:id', 
    auth, 
    checkPermission('recognition_plate.delete'),
    deleteLicensePlateRecognition
);

// Update verification status
router.put('/:id/verify', 
    auth, 
    checkPermission('recognition_plate.verify'),
    updateRecognitionVerification
);

module.exports = router;
