const express = require('express');
const router = express.Router();

// Import controllers
const { createLocation } = require('../controllers/Location/createLocation');
const { getLocationById, getAllLocations } = require('../controllers/Location/getLocation');
const { updateLocation, updateLocationStatus } = require('../controllers/Location/updateLocation');
const { deleteLocation, hardDeleteLocation, restoreLocation } = require('../controllers/Location/deleteLocation');
const { searchLocations, searchLocationsByCriteria, getLocationsByZoneType } = require('../controllers/Location/searchLocation');
const { getLocationStatistics, getLocationDetailedView, getLocationHierarchy } = require('../controllers/Location/viewLocation');

// Import middlewares
const auth = require('../middlewares/authMiddleware');
const checkPermission = require('../middlewares/checkPermission');
const { onlyAdminAccess } = require('../middlewares/adminMiddleware');

// Location CRUD routes
router.post('/create', 
    auth, 
    // checkPermission('locations.create'), 
    createLocation
);

router.get('/', 
    auth, 
    // checkPermission('locations.view'),
    getAllLocations
);

router.get('/statistics', 
    auth, 
    // checkPermission('locations.view'),
    getLocationStatistics
);

router.get('/hierarchy', 
    auth, 
    // checkPermission('locations.view'),
    getLocationHierarchy
);

router.get('/:id', 
    auth, 
    // checkPermission('locations.view'),
    getLocationById
);

router.get('/:id/detailed', 
    auth, 
    // checkPermission('locations.view'),
    getLocationDetailedView
);

router.put('/:id', 
    auth, 
    // checkPermission('locations.update'),
    updateLocation
);

router.put('/:id/status', 
    auth, 
    // checkPermission('locations.update'),
    updateLocationStatus
);

router.delete('/:id', 
    auth, 
    // checkPermission('locations.delete'),
    deleteLocation
);

router.delete('/:id/hard', 
    auth, 
    // onlyAdminAccess,
    // checkPermission('locations.delete'),
    hardDeleteLocation
);

router.post('/:id/restore', 
    auth, 
    // checkPermission('locations.update'),
    restoreLocation
);

// Search and filter routes
router.get('/search/locations', 
    auth, 
    // checkPermission('locations.view'),
    searchLocations
);

router.post('/search/criteria', 
    auth, 
    // checkPermission('locations.view'),
    searchLocationsByCriteria
);

router.get('/zone/:zoneType', 
    auth, 
    // checkPermission('locations.view'),
    getLocationsByZoneType
);

// Bulk operations
router.post('/bulk/delete', 
    auth, 
    // onlyAdminAccess,
    // checkPermission('locations.delete'),
    async (req, res) => {
        const db = require('../../db');
        const connection = await db.promise();
        
        try {
            const { locationIds } = req.body;

            if (!locationIds || !Array.isArray(locationIds) || locationIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Danh sách ID vị trí không hợp lệ'
                });
            }

            // Check for dependencies
            for (const locationId of locationIds) {
                const [dependencies] = await connection.execute(`
                    SELECT 
                        (SELECT COUNT(*) FROM cameras WHERE location_id = ? OR monitoring_location_id = ?) as camera_count,
                        (SELECT COUNT(*) FROM locations WHERE parent_location_id = ?) as child_count,
                        (SELECT COUNT(*) FROM license_plate_detections WHERE location_id = ?) as detection_count
                `, [locationId, locationId, locationId, locationId]);

                const dep = dependencies[0];
                if (dep.camera_count > 0 || dep.child_count > 0 || dep.detection_count > 0) {
                    return res.status(400).json({
                        success: false,
                        message: `Vị trí ID ${locationId} có dữ liệu liên quan, không thể xóa`
                    });
                }
            }

            // Bulk soft delete
            const placeholders = locationIds.map(() => '?').join(',');
            await connection.execute(
                `UPDATE locations SET is_active = 0, updated_at = NOW() WHERE id IN (${placeholders})`,
                locationIds
            );

            // Log access
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, new_values, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'BULK_DELETE', 'LOCATIONS', ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user.userId,
                    req.user.username,
                    JSON.stringify({ locationIds, count: locationIds.length }),
                    req.ip,
                    req.get('User-Agent')
                ]
            );

            res.status(200).json({
                success: true,
                message: `Xóa thành công ${locationIds.length} vị trí`,
                data: { deletedCount: locationIds.length }
            });

        } catch (error) {
            console.error('Error bulk deleting locations:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi xóa nhiều vị trí',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

router.post('/bulk/update-status', 
    auth, 
    // checkPermission('locations.update'),
    async (req, res) => {
        const db = require('../../db');
        const connection = await db.promise();
        
        try {
            const { locationIds, is_active } = req.body;

            if (!locationIds || !Array.isArray(locationIds) || locationIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Danh sách ID vị trí không hợp lệ'
                });
            }

            if (is_active === undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'Trạng thái là bắt buộc'
                });
            }

            // Bulk update status
            const placeholders = locationIds.map(() => '?').join(',');
            await connection.execute(
                `UPDATE locations SET is_active = ?, updated_at = NOW() WHERE id IN (${placeholders})`,
                [is_active, ...locationIds]
            );

            // Log access
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, new_values, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'BULK_UPDATE_STATUS', 'LOCATIONS', ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user.userId,
                    req.user.username,
                    JSON.stringify({ locationIds, is_active, count: locationIds.length }),
                    req.ip,
                    req.get('User-Agent')
                ]
            );

            res.status(200).json({
                success: true,
                message: `Cập nhật trạng thái thành công cho ${locationIds.length} vị trí`,
                data: { updatedCount: locationIds.length }
            });

        } catch (error) {
            console.error('Error bulk updating location status:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi cập nhật trạng thái nhiều vị trí',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

module.exports = router;