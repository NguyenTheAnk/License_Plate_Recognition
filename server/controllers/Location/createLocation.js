const db = require('../../db');

const createLocation = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const {
            name,
            code,
            address,
            latitude,
            longitude,
            description,
            zone_type = 'checkpoint',
            is_restricted = false,
            parent_location_id,
            entry_exit_pair_id,
            is_main_entry = false,
            is_main_exit = false,
            max_stay_duration_hours = 24,
            alert_on_overstay = true,
            alert_on_no_exit = true
        } = req.body;

        // Validate required fields
        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Tên vị trí là bắt buộc'
            });
        }

        // Check if code already exists (if provided)
        if (code) {
            const [existingLocation] = await connection.execute(
                'SELECT id FROM locations WHERE code = ?',
                [code]
            );

            if (existingLocation.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Mã vị trí đã tồn tại'
                });
            }
        }

        // Validate parent location exists
        if (parent_location_id) {
            const [parentLocation] = await connection.execute(
                'SELECT id FROM locations WHERE id = ? AND is_active = 1',
                [parent_location_id]
            );

            if (parentLocation.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Vị trí cha không tồn tại'
                });
            }
        }

        // Validate coordinates if provided
        if (latitude && (latitude < -90 || latitude > 90)) {
            return res.status(400).json({
                success: false,
                message: 'Vĩ độ phải trong khoảng -90 đến 90'
            });
        }

        if (longitude && (longitude < -180 || longitude > 180)) {
            return res.status(400).json({
                success: false,
                message: 'Kinh độ phải trong khoảng -180 đến 180'
            });
        }

        // Create location
        const [result] = await connection.execute(
            `INSERT INTO locations (
                name, code, address, latitude, longitude, description, zone_type,
                is_restricted, parent_location_id, entry_exit_pair_id,
                is_main_entry, is_main_exit, max_stay_duration_hours,
                alert_on_overstay, alert_on_no_exit, is_active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
            [
                name, code, address, latitude, longitude, description, zone_type,
                is_restricted, parent_location_id, entry_exit_pair_id,
                is_main_entry, is_main_exit, max_stay_duration_hours,
                alert_on_overstay, alert_on_no_exit
            ]
        );

        const locationId = result.insertId;

        // Get created location with parent info
        const [createdLocation] = await connection.execute(`
            SELECT 
                l.*,
                pl.name as parent_location_name
            FROM locations l
            LEFT JOIN locations pl ON l.parent_location_id = pl.id
            WHERE l.id = ?
        `, [locationId]);

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'CREATE', 'LOCATION', ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                locationId.toString(),
                JSON.stringify(req.body),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Tạo vị trí thành công',
            data: {
                location: createdLocation[0]
            }
        });

    } catch (error) {
        console.error('Error creating location:', error);
        
        // Log failed access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, status, failure_reason, ip_address, user_agent, created_at)
             VALUES (?, ?, 'CREATE', 'LOCATION', 'FAILURE', ?, ?, ?, NOW())`,
            [
                req.user?.userId,
                req.user?.username,
                error.message,
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo vị trí',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = { createLocation };