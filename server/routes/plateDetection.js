const express = require('express');
const router = express.Router();
const plateDetectionController = require('../controllers/plateDetectionController');
const authMiddleware = require('../middlewares/authMiddleware');

// Test route - no auth
router.get('/test', async (req, res) => {
    res.json({ message: 'Plate detection API is working!', timestamp: new Date().toISOString() });
});

// Lưu detection mới
router.post('/save', authMiddleware, async (req, res) => {
    try {
        const detectionId = await plateDetectionController.saveDetection(req.body);
        res.json({ 
            success: true, 
            message: 'Detection saved successfully', 
            detection_id: detectionId 
        });
    } catch (error) {
        console.error('Error saving detection:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error saving detection', 
            error: error.message 
        });
    }
});

// Lấy danh sách detections với phân trang và lọc (root route) - No auth for testing
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        const cameraId = req.query.camera_id || '';
        const startDate = req.query.start_date || '';
        const endDate = req.query.end_date || '';
        
        const filters = {};
        if (search) filters.plate_number = search;
        if (cameraId) filters.camera_id = cameraId;
        if (startDate) filters.date_from = startDate;
        if (endDate) filters.date_to = endDate;
        
        const result = await plateDetectionController.getDetections(
            filters,
            page - 1, // Convert to 0-based page
            limit
        );
        
        res.json({
            success: true,
            data: result.detections,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(result.totalCount / limit),
                totalCount: result.totalCount,
                hasNextPage: page < Math.ceil(result.totalCount / limit),
                hasPrevPage: page > 1
            }
        });
    } catch (error) {
        console.error('Error getting detections:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting detections',
            error: error.message
        });
    }
});

// Lấy danh sách detections với phân trang và lọc (legacy route)
router.get('/list', authMiddleware, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 0;
        const rowsPerPage = parseInt(req.query.rowsPerPage) || 10;
        
        const filters = {
            plate_number: req.query.plate_number,
            camera_id: req.query.camera_id ? parseInt(req.query.camera_id) : null,
            location_id: req.query.location_id ? parseInt(req.query.location_id) : null,
            confidence_min: req.query.confidence_min ? parseFloat(req.query.confidence_min) : null,
            confidence_max: req.query.confidence_max ? parseFloat(req.query.confidence_max) : null,
            date_from: req.query.date_from,
            date_to: req.query.date_to,
            vehicle_type: req.query.vehicle_type
        };

        const result = await plateDetectionController.getDetections(filters, page, rowsPerPage);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error getting detections:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error getting detections', 
            error: error.message 
        });
    }
});

// Lấy chi tiết một detection
router.get('/detail/:id', authMiddleware, async (req, res) => {
    try {
        const detection = await plateDetectionController.getDetectionById(req.params.id);
        if (!detection) {
            return res.status(404).json({ 
                success: false, 
                message: 'Detection not found' 
            });
        }
        
        res.json({
            success: true,
            data: detection
        });
    } catch (error) {
        console.error('Error getting detection detail:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error getting detection detail', 
            error: error.message 
        });
    }
});

// Cập nhật trạng thái verification
router.put('/verify/:id', authMiddleware, async (req, res) => {
    try {
        const success = await plateDetectionController.updateVerification(
            req.params.id, 
            req.body
        );
        
        if (success) {
            res.json({ 
                success: true, 
                message: 'Verification updated successfully' 
            });
        } else {
            res.status(404).json({ 
                success: false, 
                message: 'Detection not found' 
            });
        }
    } catch (error) {
        console.error('Error updating verification:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error updating verification', 
            error: error.message 
        });
    }
});

// Xóa detection
router.delete('/delete/:id', authMiddleware, async (req, res) => {
    try {
        const success = await plateDetectionController.deleteDetection(req.params.id);
        
        if (success) {
            res.json({ 
                success: true, 
                message: 'Detection deleted successfully' 
            });
        } else {
            res.status(404).json({ 
                success: false, 
                message: 'Detection not found' 
            });
        }
    } catch (error) {
        console.error('Error deleting detection:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error deleting detection', 
            error: error.message 
        });
    }
});

module.exports = router;

