const db = require('../../db');

const createCamera = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const {
            name,
            code,
            url,
            location_id,
            direction = 'bidirectional',
            camera_type = 'fixed',
            camera_role,
            monitoring_location_id,
            resolution,
            fps = 30,
            installation_date,
            maintenance_schedule
        } = req.body;

        // Validate required fields
        if (!name || !location_id) {
            return res.status(400).json({
                success: false,
                message: 'Tên camera và vị trí lắp đặt là bắt buộc'
            });
        }

        // Check if code already exists (if provided)
        if (code) {
            const [existingCamera] = await connection.execute(
                'SELECT id FROM cameras WHERE code = ?',
                [code]
            );

            if (existingCamera.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Mã camera đã tồn tại'
                });
            }
        }

        // Check if location exists
        const [location] = await connection.execute(
            'SELECT id, name FROM locations WHERE id = ? AND is_active = 1',
            [location_id]
        );

        if (location.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy vị trí lắp đặt'
            });
        }

        // Check monitoring location if provided
        if (monitoring_location_id) {
            const [monitoringLocation] = await connection.execute(
                'SELECT id FROM locations WHERE id = ? AND is_active = 1',
                [monitoring_location_id]
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

        if (!validDirections.includes(direction)) {
            return res.status(400).json({
                success: false,
                message: 'Hướng giám sát không hợp lệ'
            });
        }

        if (!validCameraTypes.includes(camera_type)) {
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

        // Create camera
        const [cameraResult] = await connection.execute(
            `INSERT INTO cameras (
                name, code, url, location_id, direction, camera_type, camera_role,
                monitoring_location_id, resolution, fps, installation_date, 
                maintenance_schedule, status, is_active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'offline', 1, NOW(), NOW())`,
            [
                name, 
                code || null, 
                url || null, 
                location_id, 
                direction, 
                camera_type, 
                camera_role || null,
                monitoring_location_id || null, 
                resolution || null, 
                fps, 
                installation_date || null, 
                maintenance_schedule || null
            ]
        );

        const cameraId = cameraResult.insertId;

        // Get created camera with location info
        const [createdCamera] = await connection.execute(`
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
             VALUES (?, ?, 'CREATE', 'CAMERA', ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                cameraId.toString(),
                JSON.stringify({
                    name, code, url, location_id, direction, camera_type, 
                    camera_role, monitoring_location_id, resolution, fps
                }),
                req.ip || '127.0.0.1',
                req.get('User-Agent') || 'Unknown'
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Tạo camera thành công',
            data: {
                camera: createdCamera[0]
            }
        });

    } catch (error) {
        console.error('Error creating camera:', error);
        
        // Log failed access
        try {
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, status, failure_reason, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'CREATE', 'CAMERA', 'FAILURE', ?, ?, ?, NOW())`,
                [
                    req.user?.userId || null,
                    req.user?.username || 'Unknown',
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
            message: 'Lỗi khi tạo camera',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = { createCamera };