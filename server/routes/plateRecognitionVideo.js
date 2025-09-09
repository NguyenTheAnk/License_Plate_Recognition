const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const plateRecognitionVideoController = require('../controllers/plateRecognitionVideoController');

// Upload video for plate recognition
router.post('/upload-video', 
  auth, 
  plateRecognitionVideoController.upload.single('video'),
  plateRecognitionVideoController.uploadVideoForRecognition
);

// Get recognition results for a specific video
router.get('/video/:videoId/results', 
  auth, 
  plateRecognitionVideoController.getVideoRecognitionResults
);

// Get all detected plates with pagination
router.get('/detected-plates', 
  auth, 
  plateRecognitionVideoController.getDetectedPlates
);

// Clear all detected plates
router.post('/clear-detected-plates', 
  auth, 
  plateRecognitionVideoController.clearDetectedPlates
);

// Save plate detection from detector.py (no auth required for internal communication)
router.post('/detected-plates', 
  plateRecognitionVideoController.savePlateDetectionFromDetector
);

module.exports = router;
