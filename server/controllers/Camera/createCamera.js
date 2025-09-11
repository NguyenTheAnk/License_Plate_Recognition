const db = require('../../db');

const createCamera = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const {
            name,
            code,
            protocol = 'rtsp',
            host,
            port = 554,
            path = '',
            location_id,
            direction = 'bidirectional',
            camera_type = 'fixed',
            camera_role = 'internal',
            width = 1920,
            height = 1080,
            fps = 30,
            installation_date,
            maintenance_schedule,
            details
        } = req.body;

        // Validate required fields
        if (!name || !location_id) {
            return res.status(400).json({
                success: false,
                message: 'Tên camera và vị trí là bắt buộc'
            });
        }

        // Check if camera code already exists
        if (code) {
            const [existingCameras] = await connection.execute(
                'SELECT id FROM cameras WHERE code = ?',
                [code]
            );

            if (existingCameras.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Mã camera đã tồn tại'
                });
            }
        }

        // Validate location exists
        const [location] = await connection.execute(
            'SELECT id FROM locations WHERE id = ? AND is_active = 1',
            [location_id]
        );

        if (location.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Vị trí không tồn tại'
            });
        }

        // Create camera
        const [cameraResult] = await connection.execute(
            `INSERT INTO cameras (
                name, code, protocol, host, port, path, location_id, direction, camera_type, camera_role,
                width, height, fps, installation_date, maintenance_schedule, details, 
                status, is_active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'online', 1, NOW(), NOW())`,
            [
                name,
                code,
                protocol,
                host,
                port,
                path,
                location_id,
                direction,
                camera_type,
                camera_role,
                width,
                height,
                fps,
                installation_date,
                maintenance_schedule,
                details
            ]
        );

        const cameraId = cameraResult.insertId;

        // Get created camera with location info
        const [createdCamera] = await connection.execute(`
            SELECT 
                c.*,
                l.name as location_name,
                l.address as location_address,
                l.zone_type as location_zone_type
            FROM cameras c
            JOIN locations l ON c.location_id = l.id
            WHERE c.id = ?
        `, [cameraId]);

        // Log access
        try {
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, new_values, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'CREATE', 'CAMERA', ?, ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user?.userId || null,
                    req.user?.username || 'unknown',
                    cameraId.toString(),
                    JSON.stringify({ name, code, protocol, host, port, path, location_id, direction, camera_type, camera_role, width, height, fps, installation_date, maintenance_schedule, details }),
                    req.ip || 'unknown',
                    req.get('User-Agent') || 'unknown'
                ]
            );
        } catch (logError) {
            console.error('Error logging access:', logError);
            // Don't fail the main request due to logging error
        }

        res.status(201).json({
            success: true,
            message: 'Thêm mới camera thành công',
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
                    req.user?.username || 'unknown',
                    error.message,
                    req.ip || 'unknown',
                    req.get('User-Agent') || 'unknown'
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