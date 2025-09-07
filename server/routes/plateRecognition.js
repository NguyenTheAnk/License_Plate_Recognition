const express = require('express');
const router = express.Router();

// Import controllers
const {
    getLicensePlateRecognitions,
    getLicensePlateRecognitionById,
    getLicensePlateRecognitionStats,
    deleteLicensePlateRecognition,
    updateRecognitionVerification
} = require('../controllers/plateRecognitionController');

// Import middlewares
const auth = require('../middlewares/authMiddleware');

// ========================================
// LICENSE PLATE RECOGNITIONS CRUD ROUTES
// ========================================

// Get all license plate recognitions with pagination and filters
router.get('/', 
    auth, 
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
    getLicensePlateRecognitionById
);

// Delete license plate recognition
router.delete('/:id', 
    auth, 
    deleteLicensePlateRecognition
);

// Update verification status
router.put('/:id/verify', 
    auth, 
    updateRecognitionVerification
);

module.exports = router;
