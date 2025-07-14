
const db = require('../../db');

const deleteCamera = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const cameraId = req.params.id;

        // Check if camera exists
        const [existingCamera] = await connection.execute(
            'SELECT * FROM cameras WHERE id = ? AND is_active = 1',
            [cameraId]
        );

        if (existingCamera.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy camera'
            });
        }

        const oldValues = existingCamera[0];

        // Check if camera has any detection records
        const [detectionCount] = await connection.execute(
            'SELECT COUNT(*) as count FROM license_plate_detections WHERE camera_id = ?',
            [cameraId]
        );

        if (detectionCount[0].count > 0) {
            // Soft delete - just mark as inactive
            await connection.execute(
                'UPDATE cameras SET is_active = 0, status = "offline", updated_at = NOW() WHERE id = ?',
                [cameraId]
            );

            // Log access
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, old_values, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'DELETE', 'CAMERA', ?, ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user.userId,
                    req.user.username,
                    cameraId,
                    JSON.stringify(oldValues),
                    req.ip || '127.0.0.1',
                    req.get('User-Agent') || 'Unknown'
                ]
            );

            return res.status(200).json({
                success: true,
                message: 'Xóa camera thành công (camera có dữ liệu phát hiện nên được chuyển sang trạng thái không hoạt động)',
                data: {
                    camera_id: parseInt(cameraId),
                    deletion_type: 'soft',
                    has_detection_records: true
                }
            });
        }

        // Hard delete if no detection records
        await connection.execute('DELETE FROM cameras WHERE id = ?', [cameraId]);

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, old_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'DELETE', 'CAMERA', ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                cameraId,
                JSON.stringify(oldValues),
                req.ip || '127.0.0.1',
                req.get('User-Agent') || 'Unknown'
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Xóa camera thành công',
            data: {
                camera_id: parseInt(cameraId),
                deletion_type: 'hard',
                has_detection_records: false
            }
        });

    } catch (error) {
        console.error('Error deleting camera:', error);
        
        // Log failed access
        try {
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, status, failure_reason, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'DELETE', 'CAMERA', ?, 'FAILURE', ?, ?, ?, NOW())`,
                [
                    req.user?.userId || null,
                    req.user?.username || 'Unknown',
                    req.params.id,
                    error.message,
                    req.ip || '127.0.0.1',
                    req.get('User-Agent') || 'Unknown'
                ]
            );
        } catch (logError) {
            console.error('Error logging failed access:', logError);
        }

        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa camera',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const hardDeleteCamera = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const cameraId = req.params.id;

        // Check if camera exists
        const [existingCamera] = await connection.execute(
            'SELECT * FROM cameras WHERE id = ?', // Note: không check is_active để có thể xóa cả camera đã bị soft delete
            [cameraId]
        );

        if (existingCamera.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy camera'
            });
        }

        const oldValues = existingCamera[0];

        // Check if camera has detection records
        const [detectionCount] = await connection.execute(
            'SELECT COUNT(*) as count FROM license_plate_detections WHERE camera_id = ?',
            [cameraId]
        );

        if (detectionCount[0].count > 0) {
            return res.status(400).json({
                success: false,
                message: 'Không thể xóa hoàn toàn camera có dữ liệu phát hiện. Vui lòng sử dụng soft delete.',
                data: {
                    detection_count: detectionCount[0].count
                }
            });
        }

        // Delete camera permanently
        await connection.execute('DELETE FROM cameras WHERE id = ?', [cameraId]);

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, old_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'HARD_DELETE', 'CAMERA', ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                cameraId,
                JSON.stringify(oldValues),
                req.ip || '127.0.0.1',
                req.get('User-Agent') || 'Unknown'
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Xóa hoàn toàn camera thành công',
            data: {
                camera_id: parseInt(cameraId)
            }
        });

    } catch (error) {
        console.error('Error hard deleting camera:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa hoàn toàn camera',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const restoreCamera = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const cameraId = req.params.id;

        // Check if camera exists and is inactive
        const [existingCamera] = await connection.execute(
            'SELECT * FROM cameras WHERE id = ? AND is_active = 0',
            [cameraId]
        );

        if (existingCamera.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy camera đã xóa'
            });
        }

        // Restore camera
        await connection.execute(
            'UPDATE cameras SET is_active = 1, status = "offline", updated_at = NOW() WHERE id = ?',
            [cameraId]
        );

        // Get restored camera
        const [restoredCamera] = await connection.execute(`
            SELECT 
                c.*,
                l.name as location_name,
                l.address as location_address,
                ml.name as monitoring_location_name
            FROM cameras c
            JOIN locations l ON c.location_id = l.id
            LEFT JOIN locations ml ON c.monitoring_location_id = ml.id
            WHERE c.id = ?
        `, [cameraId]);

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'RESTORE', 'CAMERA', ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                cameraId,
                JSON.stringify({ is_active: 1, status: 'offline' }),
                req.ip || '127.0.0.1',
                req.get('User-Agent') || 'Unknown'
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Khôi phục camera thành công',
            data: {
                camera: restoredCamera[0]
            }
        });

    } catch (error) {
        console.error('Error restoring camera:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi khôi phục camera',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const bulkDeleteCameras = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { cameraIds } = req.body;

        if (!cameraIds || !Array.isArray(cameraIds) || cameraIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Danh sách ID camera không hợp lệ'
            });
        }

        // Check which cameras exist
        const placeholders = cameraIds.map(() => '?').join(',');
        const [existingCameras] = await connection.execute(
            `SELECT id, name FROM cameras WHERE id IN (${placeholders}) AND is_active = 1`,
            cameraIds
        );

        if (existingCameras.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy camera nào'
            });
        }

        const existingCameraIds = existingCameras.map(camera => camera.id);

        // Check if any cameras have detection records
        const [detectionCounts] = await connection.execute(`
            SELECT camera_id, COUNT(*) as count 
            FROM license_plate_detections 
            WHERE camera_id IN (${placeholders}) 
            GROUP BY camera_id
        `, cameraIds);

        const camerasWithDetections = detectionCounts.map(item => item.camera_id);
        const camerasWithoutDetections = existingCameraIds.filter(id => !camerasWithDetections.includes(id));

        // Soft delete cameras with detections
        if (camerasWithDetections.length > 0) {
            const softDeletePlaceholders = camerasWithDetections.map(() => '?').join(',');
            await connection.execute(
                `UPDATE cameras SET is_active = 0, status = 'offline', updated_at = NOW() WHERE id IN (${softDeletePlaceholders})`,
                camerasWithDetections
            );
        }

        // Hard delete cameras without detections
        if (camerasWithoutDetections.length > 0) {
            const hardDeletePlaceholders = camerasWithoutDetections.map(() => '?').join(',');
            await connection.execute(
                `DELETE FROM cameras WHERE id IN (${hardDeletePlaceholders})`,
                camerasWithoutDetections
            );
        }

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'BULK_DELETE', 'CAMERAS', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                JSON.stringify({
                    requested_ids: cameraIds,
                    soft_deleted: camerasWithDetections,
                    hard_deleted: camerasWithoutDetections,
                    total_deleted: existingCameraIds.length
                }),
                req.ip || '127.0.0.1',
                req.get('User-Agent') || 'Unknown'
            ]
        );

        res.status(200).json({
            success: true,
            message: `Xóa thành công ${existingCameraIds.length} camera`,
            data: {
                total_deleted: existingCameraIds.length,
                soft_deleted_count: camerasWithDetections.length,
                hard_deleted_count: camerasWithoutDetections.length,
                soft_deleted_ids: camerasWithDetections,
                hard_deleted_ids: camerasWithoutDetections
            }
        });

    } catch (error) {
        console.error('Error bulk deleting cameras:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa nhiều camera',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = { 
    deleteCamera, 
    hardDeleteCamera, 
    restoreCamera, 
    bulkDeleteCameras 
};
