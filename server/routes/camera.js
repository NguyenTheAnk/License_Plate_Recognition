// server\routes\camera.js
const express = require('express');
const router = express.Router();
const videoController = require('../controllers/Camera/uploadVideo');
const upload = require('../controllers/Camera/uploadVideo').upload;

// Import controllers
const { createCamera } = require('../controllers/Camera/createCamera');
const { getCameraById, getAllCameras, getCamerasByLocation, getCameraStatistics, getCamerasForRouteMonitoring } = require('../controllers/Camera/getCamera');
const { deleteCamera, hardDeleteCamera, restoreCamera, bulkDeleteCameras } = require('../controllers/Camera/deleteCamera');
const { searchCameras, searchCamerasByCriteria, getCamerasByStatus, getCamerasByType, getCamerasByRole, getOfflineCameras } = require('../controllers/Camera/searchCamera');
const { getCameraDetailedView, getCameraHealthReport, getCameraPerformanceReport, getCameraComparisonReport } = require('../controllers/Camera/viewCamera');
const { getCameraStreamInfo,
    getAllCameraStreams,
    startCameraStream,
    stopCameraStream,
    getStreamStatus } = require('../controllers/Camera/getCameraStream');

// Import middlewares
const auth = require('../middlewares/authMiddleware');
const checkPermission = require('../middlewares/checkPermission');
const { onlyAdminAccess } = require('../middlewares/adminMiddleware');
const {
    createCameraValidator,
    updateCameraValidator,
    deleteCameraValidator,
    updateStatusValidator,
    bulkOperationValidator,
    bulkStatusUpdateValidator,
    searchValidator,
    searchCriteriaValidator,
    comparisonReportValidator,
    locationParamValidator,
    statusParamValidator,
    typeParamValidator,
    roleParamValidator,
    offlineCamerasValidator,
    healthReportValidator,
    performanceReportValidator
} = require('../helper/cameraValidator');

// Camera CRUD routes
router.post('/create',
    auth,
    checkPermission('camera.create'),
    createCameraValidator,
    createCamera
);

router.post('/:id/stream/start',
    auth,
    // checkPermission('cameras.update'), 
    // có thể thêm validator nếu muốn
    startCameraStream
);

router.post('/:id/stream/stop',
    auth,
    // checkPermission('cameras.update'),
    // có thể thêm validator nếu muốn
    stopCameraStream
);

router.get('/:id/stream/status',
    auth,
    // checkPermission('cameras.view'),
    getStreamStatus
);

router.get('/',
    auth,
    checkPermission('camera.view_detail'),
    getAllCameras
);

router.get('/statistics',
    auth,
    // checkPermission('camera.view'), 
    getCameraStatistics
);

router.get('/route-monitoring',
    auth,
    checkPermission('camera.view_detail'),
    getCamerasForRouteMonitoring
);

router.get('/health-report',
    auth,
    // checkPermission('camera.view'), 
    healthReportValidator,
    getCameraHealthReport
);
router.post('/upload-video', upload.single('video'), videoController.uploadVideo);
router.get('/list-videos', videoController.listVideos);
router.get('/performance-report',
    auth,
    // checkPermission('cameras.view'), 
    performanceReportValidator,
    getCameraPerformanceReport
);

router.post('/comparison-report',
    auth,
    // checkPermission('cameras.view'), 
    comparisonReportValidator,
    getCameraComparisonReport
);

router.get('/:id',
    auth,
    checkPermission('camera.view_detail'),
    deleteCameraValidator,
    getCameraById
);

router.get('/:id/detailed',
    auth,
    checkPermission('camera.view_detail'),
    deleteCameraValidator,
    getCameraDetailedView
);

router.get('/:id/stream',
    auth,
    // checkPermission('cameras.view'), 
    deleteCameraValidator,
    getCameraStreamInfo
);

router.get('/streams/all',
    auth,
    // checkPermission('cameras.view'), 
    getAllCameraStreams
);

// router.put('/:id',
//     auth,
//     // checkPermission('cameras.update'), 
//     updateCameraValidator,
//     updateCamera
// );

// router.put('/:id/status',
//     auth,
//     // checkPermission('cameras.update'), 
//     updateStatusValidator,
//     updateCameraStatus
// );

// router.put('/:id/heartbeat',
//     auth,
//     // checkPermission('cameras.update'), 
//     deleteCameraValidator,
//     updateCameraHeartbeat
// );

router.delete('/:id',
    auth,
    checkPermission('camera.delete'),
    deleteCameraValidator,
    deleteCamera
);

router.delete('/:id/hard',
    auth,
    // onlyAdminAccess, 
    // checkPermission('cameras.delete'), 
    deleteCameraValidator,
    hardDeleteCamera
);

router.put('/:id/restore',
    auth,
    // checkPermission('cameras.update'), 
    deleteCameraValidator,
    restoreCamera
);

// Search and filter routes
router.get('/search/cameras',
    auth,
    // checkPermission('cameras.view'), 
    searchValidator,
    searchCameras
);

router.post('/search/criteria',
    auth,
    // checkPermission('cameras.view'), 
    searchCriteriaValidator,
    searchCamerasByCriteria
);

router.get('/filter/status/:status',
    auth,
    // checkPermission('cameras.view'), 
    statusParamValidator,
    getCamerasByStatus
);

router.get('/filter/type/:type',
    auth,
    // checkPermission('cameras.view'), 
    typeParamValidator,
    getCamerasByType
);

router.get('/filter/role/:role',
    auth,
    // checkPermission('cameras.view'), 
    roleParamValidator,
    getCamerasByRole
);

router.get('/filter/offline',
    auth,
    // checkPermission('cameras.view'), 
    offlineCamerasValidator,
    getOfflineCameras
);

router.get('/location/:locationId',
    auth,
    // checkPermission('cameras.view'), 
    locationParamValidator,
    getCamerasByLocation
);

// // Bulk operations
// router.post('/bulk/update-status',
//     auth,
//     // checkPermission('cameras.update'), 
//     bulkStatusUpdateValidator,
//     bulkUpdateCameraStatus
// );

router.post('/bulk/delete',
    auth,
    // checkPermission('cameras.delete'), 
    bulkOperationValidator,
    bulkDeleteCameras
);

// Camera management utilities
router.post('/test-connection/:id',
    auth,
    // checkPermission('cameras.update'), 
    deleteCameraValidator,
    async (req, res) => {
        const db = require('../db');
        const connection = await db.promise();

        try {
            const cameraId = req.params.id;

            // Check if camera exists
            const [camera] = await connection.execute(
                'SELECT id, name, url FROM cameras WHERE id = ? AND is_active = 1',
                [cameraId]
            );

            if (camera.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy camera'
                });
            }

            // In a real implementation, you would test the actual camera connection
            // For now, we'll simulate a connection test
            const testResult = {
                camera_id: parseInt(cameraId),
                camera_name: camera[0].name,
                url: camera[0].url,
                connection_status: 'success', // This would be determined by actual test
                response_time_ms: Math.floor(Math.random() * 1000) + 100, // Simulated
                test_time: new Date().toISOString()
            };

            // Update last heartbeat if connection successful
            if (testResult.connection_status === 'success') {
                await connection.execute(
                    'UPDATE cameras SET last_heartbeat = NOW(), status = "online" WHERE id = ?',
                    [cameraId]
                );
            }

            // Log access
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, request_data, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'TEST_CONNECTION', 'CAMERA', ?, ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user.userId,
                    req.user.username,
                    cameraId,
                    JSON.stringify(testResult),
                    req.ip,
                    req.get('User-Agent')
                ]
            );

            res.status(200).json({
                success: true,
                message: 'Kiểm tra kết nối camera thành công',
                data: testResult
            });

        } catch (error) {
            console.error('Error testing camera connection:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi kiểm tra kết nối camera',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

router.post('/bulk/test-connection',
    auth,
    // checkPermission('cameras.update'), 
    bulkOperationValidator,
    async (req, res) => {
        const db = require('../db');
        const connection = await db.promise();

        try {
            const { cameraIds } = req.body;

            const placeholders = cameraIds.map(() => '?').join(',');
            const [cameras] = await connection.execute(
                `SELECT id, name, url FROM cameras WHERE id IN (${placeholders}) AND is_active = 1`,
                cameraIds
            );

            const testResults = cameras.map(camera => ({
                camera_id: camera.id,
                camera_name: camera.name,
                url: camera.url,
                connection_status: Math.random() > 0.2 ? 'success' : 'failed', // Simulated
                response_time_ms: Math.floor(Math.random() * 1000) + 100,
                test_time: new Date().toISOString()
            }));

            // Update cameras that tested successfully
            const successfulCameras = testResults
                .filter(result => result.connection_status === 'success')
                .map(result => result.camera_id);

            if (successfulCameras.length > 0) {
                const updatePlaceholders = successfulCameras.map(() => '?').join(',');
                await connection.execute(
                    `UPDATE cameras SET last_heartbeat = NOW(), status = 'online' WHERE id IN (${updatePlaceholders})`,
                    successfulCameras
                );
            }

            // Log access
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, request_data, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'BULK_TEST_CONNECTION', 'CAMERAS', ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user.userId,
                    req.user.username,
                    JSON.stringify({ cameraIds, results: testResults }),
                    req.ip,
                    req.get('User-Agent')
                ]
            );

            res.status(200).json({
                success: true,
                message: `Kiểm tra kết nối thành công ${cameras.length} camera`,
                data: {
                    total_tested: cameras.length,
                    successful_connections: testResults.filter(r => r.connection_status === 'success').length,
                    failed_connections: testResults.filter(r => r.connection_status === 'failed').length,
                    results: testResults
                }
            });

        } catch (error) {
            console.error('Error bulk testing camera connections:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi kiểm tra kết nối nhiều camera',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

// Camera configuration management
router.get('/:id/config',
    auth,
    // checkPermission('cameras.view'), 
    deleteCameraValidator,
    async (req, res) => {
        const db = require('../db');
        const connection = await db.promise();

        try {
            const cameraId = req.params.id;

            const [camera] = await connection.execute(`
                SELECT 
                    c.*,
                    l.name as location_name,
,
                    JSON_OBJECT(
                        'detection_enabled', true,
                        'recording_enabled', false,
                        'motion_detection', true,
                        'night_mode', 'auto',
                        'quality_settings', JSON_OBJECT(
                            'resolution', c.resolution,
                            'fps', c.fps,
                            'bitrate', '2048'
                        )
                    ) as config_data
                FROM cameras c
                JOIN locations l ON c.location_id = l.id
                WHERE c.id = ? AND c.is_active = 1
            `, [cameraId]);

            if (camera.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy camera'
                });
            }

            res.status(200).json({
                success: true,
                data: {
                    camera: camera[0]
                }
            });

        } catch (error) {
            console.error('Error getting camera config:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy cấu hình camera',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

// Export cameras data
router.get('/export/excel',
    auth,
    // checkPermission('cameras.export'), 
    async (req, res) => {
        const db = require('../db');
        const connection = await db.promise();

        try {
            const [cameras] = await connection.execute(`
                SELECT 
                    c.id,
                    c.name,
                    c.code,
                    c.url,
                    c.direction,
                    c.camera_type,
                    c.camera_role,
                    c.resolution,
                    c.fps,
                    c.status,
                    c.installation_date,
                    c.maintenance_schedule,
                    c.last_heartbeat,
                    c.created_at,
                    l.name as location_name,
                    l.address as location_address,
                FROM cameras c
                JOIN locations l ON c.location_id = l.id
                WHERE c.is_active = 1
                ORDER BY c.id
            `);

            // Log access
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'EXPORT', 'CAMERAS', 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user.userId,
                    req.user.username,
                    req.ip,
                    req.get('User-Agent')
                ]
            );

            res.status(200).json({
                success: true,
                message: 'Xuất dữ liệu camera thành công',
                data: {
                    cameras: cameras,
                    total_records: cameras.length,
                    export_time: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('Error exporting cameras:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi xuất dữ liệu camera',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

module.exports = router;