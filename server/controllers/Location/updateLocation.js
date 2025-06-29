const db = require('../../db');

const updateLocation = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const locationId = req.params.id;
        const {
            name,
            code,
            address,
            latitude,
            longitude,
            description,
            zone_type,
            is_restricted,
            parent_location_id,
            entry_exit_pair_id,
            is_main_entry,
            is_main_exit,
            max_stay_duration_hours,
            alert_on_overstay,
            alert_on_no_exit
        } = req.body;

        // Check if location exists
        const [existingLocation] = await connection.execute(
            'SELECT * FROM locations WHERE id = ? AND is_active = 1',
            [locationId]
        );

        if (existingLocation.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy vị trí'
            });
        }

        // Check if code already exists (if provided and different from current)
        if (code && code !== existingLocation[0].code) {
            const [duplicateCode] = await connection.execute(
                'SELECT id FROM locations WHERE code = ? AND id != ?',
                [code, locationId]
            );

            if (duplicateCode.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Mã vị trí đã tồn tại'
                });
            }
        }

        // Validate parent location exists and prevent circular reference
        if (parent_location_id) {
            if (parent_location_id == locationId) {
                return res.status(400).json({
                    success: false,
                    message: 'Vị trí không thể là cha của chính nó'
                });
            }

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

        // Build update query dynamically
        const updateFields = [];
        const updateValues = [];

        if (name !== undefined) {
            updateFields.push('name = ?');
            updateValues.push(name);
        }
        if (code !== undefined) {
            updateFields.push('code = ?');
            updateValues.push(code);
        }
        if (address !== undefined) {
            updateFields.push('address = ?');
            updateValues.push(address);
        }
        if (latitude !== undefined) {
            updateFields.push('latitude = ?');
            updateValues.push(latitude);
        }
        if (longitude !== undefined) {
            updateFields.push('longitude = ?');
            updateValues.push(longitude);
        }
        if (description !== undefined) {
            updateFields.push('description = ?');
            updateValues.push(description);
        }
        if (zone_type !== undefined) {
            updateFields.push('zone_type = ?');
            updateValues.push(zone_type);
        }
        if (is_restricted !== undefined) {
            updateFields.push('is_restricted = ?');
            updateValues.push(is_restricted);
        }
        if (parent_location_id !== undefined) {
            updateFields.push('parent_location_id = ?');
            updateValues.push(parent_location_id);
        }
        if (entry_exit_pair_id !== undefined) {
            updateFields.push('entry_exit_pair_id = ?');
            updateValues.push(entry_exit_pair_id);
        }
        if (is_main_entry !== undefined) {
            updateFields.push('is_main_entry = ?');
            updateValues.push(is_main_entry);
        }
        if (is_main_exit !== undefined) {
            updateFields.push('is_main_exit = ?');
            updateValues.push(is_main_exit);
        }
        if (max_stay_duration_hours !== undefined) {
            updateFields.push('max_stay_duration_hours = ?');
            updateValues.push(max_stay_duration_hours);
        }
        if (alert_on_overstay !== undefined) {
            updateFields.push('alert_on_overstay = ?');
            updateValues.push(alert_on_overstay);
        }
        if (alert_on_no_exit !== undefined) {
            updateFields.push('alert_on_no_exit = ?');
            updateValues.push(alert_on_no_exit);
        }

        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Không có dữ liệu để cập nhật'
            });
        }

        updateFields.push('updated_at = NOW()');
        updateValues.push(locationId);

        // Update location
        await connection.execute(
            `UPDATE locations SET ${updateFields.join(', ')} WHERE id = ?`,
            updateValues
        );

        // Get updated location
        const [updatedLocation] = await connection.execute(`
            SELECT 
                l.*,
                pl.name as parent_location_name
            FROM locations l
            LEFT JOIN locations pl ON l.parent_location_id = pl.id
            WHERE l.id = ?
        `, [locationId]);

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, old_values, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'UPDATE', 'LOCATION', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                locationId,
                JSON.stringify(existingLocation[0]),
                JSON.stringify(req.body),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Cập nhật vị trí thành công',
            data: {
                location: updatedLocation[0]
            }
        });

    } catch (error) {
        console.error('Error updating location:', error);
        
        // Log failed access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, status, failure_reason, ip_address, user_agent, created_at)
             VALUES (?, ?, 'UPDATE', 'LOCATION', ?, 'FAILURE', ?, ?, ?, NOW())`,
            [
                req.user?.userId,
                req.user?.username,
                req.params.id,
                error.message,
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật vị trí',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const updateLocationStatus = async (req, res) => {
    let connection;
    
    try {
        connection = await db.promise();
        const locationId = parseInt(req.params.id);
        const { is_active } = req.body;

        console.log('Location ID:', locationId);
        console.log('Request body:', req.body);
        console.log('User:', req.user);

        // Validate locationId
        if (!locationId || isNaN(locationId)) {
            return res.status(400).json({
                success: false,
                message: 'ID vị trí không hợp lệ'
            });
        }

        if (is_active === undefined || is_active === null) {
            return res.status(400).json({
                success: false,
                message: 'Trạng thái là bắt buộc'
            });
        }

        // Check authentication
        if (!req.user || !req.user.userId) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized'
            });
        }

        // Check if location exists
        const [existingLocation] = await connection.execute(
            'SELECT * FROM locations WHERE id = ?',
            [locationId]
        );

        if (existingLocation.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy vị trí'
            });
        }

        // Check if location has active cameras before deactivating
        if (!is_active) {
            const [activeCameras] = await connection.execute(
                'SELECT COUNT(*) as count FROM cameras WHERE (location_id = ? OR monitoring_location_id = ?) AND is_active = 1',
                [locationId, locationId]
            );

            if (activeCameras[0].count > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Không thể vô hiệu hóa vị trí có camera đang hoạt động'
                });
            }
        }

        // Determine the new status value
        const newActiveValue = is_active === true || is_active === 1 || is_active === '1' ? 1 : 0;
        console.log('Current is_active:', existingLocation[0].is_active);
        console.log('New is_active value:', newActiveValue);

        // Update status
        const [updateResult] = await connection.execute(
            'UPDATE locations SET is_active = ?, updated_at = NOW() WHERE id = ?',
            [newActiveValue, locationId]
        );

        console.log('Update result:', updateResult);
        console.log('Affected rows:', updateResult.affectedRows);
        console.log('Changed rows:', updateResult.changedRows);

        // Verify the update
        const [verifyLocation] = await connection.execute(
            'SELECT id, name, is_active, updated_at FROM locations WHERE id = ?',
            [locationId]
        );
        console.log('Location after update:', verifyLocation[0]);

        // If no rows were affected, something went wrong
        if (updateResult.affectedRows === 0) {
            return res.status(400).json({
                success: false,
                message: 'Không thể cập nhật vị trí (không có dòng nào bị ảnh hưởng)'
            });
        }

        // Log access with shorter action_type
        try {
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, old_values, new_values, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                [
                    req.user.userId,
                    req.user.username,
                    'UPDATE',  // Changed from 'UPDATE_STATUS' to 'UPDATE'
                    'LOCATION',
                    locationId.toString(),
                    JSON.stringify({ is_active: existingLocation[0].is_active }),
                    JSON.stringify({ is_active: is_active ? 1 : 0 }),
                    'SUCCESS',
                    req.ip || '127.0.0.1',
                    req.get('User-Agent') || 'Unknown'
                ]
            );
        } catch (logError) {
            console.error('Error logging access (non-critical):', logError);
            // Continue without failing the main operation
        }

        res.status(200).json({
            success: true,
            message: `${is_active ? 'Kích hoạt' : 'Vô hiệu hóa'} vị trí thành công`
        });

    } catch (error) {
        console.error('Error updating location status:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            errno: error.errno,
            sqlState: error.sqlState
        });

        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật trạng thái vị trí',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = { updateLocation, updateLocationStatus };