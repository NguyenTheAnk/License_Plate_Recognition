const db = require('../../db');

const updateCamera = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const cameraId = req.params.id;
        const {
            name,
            code,
            url,
            location_id,
            direction,
            camera_type,
            camera_role,
            monitoring_location_id,
            resolution,
            fps,
            installation_date,
            maintenance_schedule,
            status
        } = req.body;

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

        // Check if code already exists (if being changed)
        if (code && code !== oldValues.code) {
            const [existingCameraWithCode] = await connection.execute(
                'SELECT id FROM cameras WHERE code = ? AND id != ?',
                [code, cameraId]
            );

            if (existingCameraWithCode.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Mã camera đã tồn tại'
                });
            }
        }

        // Check if location exists (if being changed)
        if (location_id && location_id !== oldValues.location_id) {
            const [location] = await connection.execute(
                'SELECT id FROM locations WHERE id = ? AND is_active = 1',
                [location_id]
            );

            if (location.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy vị trí lắp đặt'
                });
            }
        }

        // Normalize monitoring_location_id (convert empty string to null)
        const normalizedMonitoringLocationId = monitoring_location_id === '' || monitoring_location_id === null || monitoring_location_id === undefined 
            ? null 
            : monitoring_location_id;

        // Check monitoring location if provided (only if it's not null after normalization)
        if (normalizedMonitoringLocationId !== null) {
            const [monitoringLocation] = await connection.execute(
                'SELECT id FROM locations WHERE id = ? AND is_active = 1',
                [normalizedMonitoringLocationId]
            );

            if (monitoringLocation.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy vị trí giám sát'
                });
            }
        }

        // Validate enum values
        const validDirections = ['inbound', 'outbound', 'bidirectional', 'entry_only', 'exit_only'];
        const validCameraTypes = ['fixed', 'ptz', 'mobile'];
        const validCameraRoles = ['entry', 'exit', 'internal', 'overview'];
        const validStatuses = ['online', 'offline', 'maintenance'];

        if (direction && !validDirections.includes(direction)) {
            return res.status(400).json({
                success: false,
                message: 'Hướng giám sát không hợp lệ'
            });
        }

        if (camera_type && !validCameraTypes.includes(camera_type)) {
            return res.status(400).json({
                success: false,
                message: 'Loại camera không hợp lệ'
            });
        }

        if (camera_role && !validCameraRoles.includes(camera_role)) {
            return res.status(400).json({
                success: false,
                message: 'Vai trò camera không hợp lệ'
            });
        }

        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Trạng thái camera không hợp lệ'
            });
        }

        // Build update query dynamically
        const updateFields = [];
        const updateValues = [];

        // Prepare fields with normalized values
        const fieldsToUpdate = {
            name, 
            code, 
            url, 
            location_id, 
            direction, 
            camera_type, 
            camera_role,
            monitoring_location_id: normalizedMonitoringLocationId, // Use normalized value
            resolution, 
            fps, 
            installation_date, 
            maintenance_schedule, 
            status
        };

        Object.entries(fieldsToUpdate).forEach(([key, value]) => {
            if (value !== undefined) {
                updateFields.push(`${key} = ?`);
                updateValues.push(value);
            }
        });

        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Không có thông tin cần cập nhật'
            });
        }

        updateFields.push('updated_at = NOW()');
        updateValues.push(cameraId);

        // Update camera
        await connection.execute(
            `UPDATE cameras SET ${updateFields.join(', ')} WHERE id = ?`,
            updateValues
        );

        // Get updated camera
        const [updatedCamera] = await connection.execute(`
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
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, old_values, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'UPDATE', 'CAMERA', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                cameraId,
                JSON.stringify(oldValues),
                JSON.stringify(fieldsToUpdate),
                req.ip || '127.0.0.1',
                req.get('User-Agent') || 'Unknown'
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Cập nhật camera thành công',
            data: {
                camera: updatedCamera[0]
            }
        });

    } catch (error) {
        console.error('Error updating camera:', error);
        
        // Log failed access
        try {
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, status, failure_reason, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'UPDATE', 'CAMERA', ?, 'FAILURE', ?, ?, ?, NOW())`,
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
            message: 'Lỗi khi cập nhật camera',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const updateCameraStatus = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const cameraId = req.params.id;
        const { status } = req.body;

        const validStatuses = ['online', 'offline', 'maintenance'];

        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Trạng thái camera không hợp lệ'
            });
        }

        // Check if camera exists
        const [existingCamera] = await connection.execute(
            'SELECT id, status, name FROM cameras WHERE id = ? AND is_active = 1',
            [cameraId]
        );

        if (existingCamera.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy camera'
            });
        }

        const oldStatus = existingCamera[0].status;

        // Update status
        await connection.execute(
            'UPDATE cameras SET status = ?, updated_at = NOW() WHERE id = ?',
            [status, cameraId]
        );

        // Update last_heartbeat if going online
        if (status === 'online') {
            await connection.execute(
                'UPDATE cameras SET last_heartbeat = NOW() WHERE id = ?',
                [cameraId]
            );
        }

        // Log access - Sử dụng 'UPDATE' thay vì 'UPDATE_STATUS'
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, old_values, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'UPDATE', 'CAMERA', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                cameraId,
                JSON.stringify({ status: oldStatus, action: 'status_update' }), // Thêm thông tin chi tiết vào old_values
                JSON.stringify({ status, action: 'status_update' }), // Thêm thông tin chi tiết vào new_values
                req.ip || '127.0.0.1',
                req.get('User-Agent') || 'Unknown'
            ]
        );

        res.status(200).json({
            success: true,
            message: `Cập nhật trạng thái camera thành ${status === 'online' ? 'trực tuyến' : status === 'offline' ? 'ngoại tuyến' : 'bảo trì'}`,
            data: {
                camera_id: parseInt(cameraId),
                old_status: oldStatus,
                new_status: status
            }
        });

    } catch (error) {
        console.error('Error updating camera status:', error);
        
        // Log failed access
        try {
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, status, failure_reason, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'UPDATE', 'CAMERA', ?, 'FAILURE', ?, ?, ?, NOW())`,
                [
                    req.user?.userId || null,
                    req.user?.username || 'Unknown',
                    cameraId,
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
            message: 'Lỗi khi cập nhật trạng thái camera',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};


const bulkUpdateCameraStatus = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { cameraIds, status } = req.body;

        if (!cameraIds || !Array.isArray(cameraIds) || cameraIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Danh sách ID camera không hợp lệ'
            });
        }

        const validStatuses = ['online', 'offline', 'maintenance'];

        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Trạng thái camera không hợp lệ'
            });
        }

        // Check if all cameras exist
        const placeholders = cameraIds.map(() => '?').join(',');
        const [existingCameras] = await connection.execute(
            `SELECT id, name FROM cameras WHERE id IN (${placeholders}) AND is_active = 1`,
            cameraIds
        );

        if (existingCameras.length !== cameraIds.length) {
            return res.status(404).json({
                success: false,
                message: 'Một số camera không tồn tại'
            });
        }

        // Bulk update status
        const updateQuery = status === 'online' 
            ? `UPDATE cameras SET status = ?, last_heartbeat = NOW(), updated_at = NOW() WHERE id IN (${placeholders})`
            : `UPDATE cameras SET status = ?, updated_at = NOW() WHERE id IN (${placeholders})`;

        await connection.execute(updateQuery, [status, ...cameraIds]);

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'BULK_UPDATE_STATUS', 'CAMERAS', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                JSON.stringify({ cameraIds, status, count: cameraIds.length }),
                req.ip || '127.0.0.1',
                req.get('User-Agent') || 'Unknown'
            ]
        );

        res.status(200).json({
            success: true,
            message: `Cập nhật trạng thái thành công cho ${cameraIds.length} camera`,
            data: {
                updated_count: cameraIds.length,
                new_status: status
            }
        });

    } catch (error) {
        console.error('Error bulk updating camera status:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật trạng thái nhiều camera',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = { 
    updateCamera, 
    updateCameraStatus, 
    bulkUpdateCameraStatus 
};