const db = require('../../db');

const deleteLocation = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const locationId = req.params.id;

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

        // Check if location has child locations
        const [childLocations] = await connection.execute(
            'SELECT COUNT(*) as count FROM locations WHERE parent_location_id = ? AND is_active = 1',
            [locationId]
        );

        if (childLocations[0].count > 0) {
            return res.status(400).json({
                success: false,
                message: 'Không thể xóa vị trí có vị trí con'
            });
        }

        // Check if location has cameras
        const [cameras] = await connection.execute(
            'SELECT COUNT(*) as count FROM cameras WHERE (location_id = ? OR  = ?) AND is_active = 1',
            [locationId, locationId]
        );

        if (cameras[0].count > 0) {
            return res.status(400).json({
                success: false,
                message: 'Không thể xóa vị trí có camera'
            });
        }

        // Check if location has detection records
        const [detections] = await connection.execute(
            'SELECT COUNT(*) as count FROM license_plate_detections WHERE location_id = ?',
            [locationId]
        );

        if (detections[0].count > 0) {
            return res.status(400).json({
                success: false,
                message: 'Không thể xóa vị trí có bản ghi phát hiện'
            });
        }

        // Soft delete location
        await connection.execute(
            'UPDATE locations SET is_active = 0, updated_at = NOW() WHERE id = ?',
            [locationId]
        );

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, old_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'DELETE', 'LOCATION', ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                locationId,
                JSON.stringify(existingLocation[0]),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Xóa vị trí thành công'
        });

    } catch (error) {
        console.error('Error deleting location:', error);
        
        // Log failed access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, status, failure_reason, ip_address, user_agent, created_at)
             VALUES (?, ?, 'DELETE', 'LOCATION', ?, 'FAILURE', ?, ?, ?, NOW())`,
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
            message: 'Lỗi khi xóa vị trí',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const hardDeleteLocation = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const locationId = req.params.id;

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

        // Check for any references that would prevent deletion
        const [references] = await connection.execute(`
            SELECT 
                (SELECT COUNT(*) FROM cameras WHERE location_id = ? OR  = ?) as camera_count,
                (SELECT COUNT(*) FROM license_plate_detections WHERE location_id = ?) as detection_count,
                (SELECT COUNT(*) FROM vehicle_entry_exit_logs WHERE  = ? OR entry_location_id = ? OR exit_location_id = ?) as log_count,
                (SELECT COUNT(*) FROM locations WHERE parent_location_id = ?) as child_count
        `, [locationId, locationId, locationId, locationId, locationId, locationId, locationId]);

        const ref = references[0];
        if (ref.camera_count > 0 || ref.detection_count > 0 || ref.log_count > 0 || ref.child_count > 0) {
            return res.status(400).json({
                success: false,
                message: 'Không thể xóa vĩnh viễn vị trí có dữ liệu liên quan'
            });
        }

        // Hard delete location
        await connection.execute('DELETE FROM locations WHERE id = ?', [locationId]);

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, old_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'HARD_DELETE', 'LOCATION', ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                locationId,
                JSON.stringify(existingLocation[0]),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Xóa vĩnh viễn vị trí thành công'
        });

    } catch (error) {
        console.error('Error hard deleting location:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa vĩnh viễn vị trí',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const restoreLocation = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const locationId = req.params.id;

        // Check if location exists and is deleted
        const [existingLocation] = await connection.execute(
            'SELECT * FROM locations WHERE id = ? AND is_active = 0',
            [locationId]
        );

        if (existingLocation.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy vị trí đã xóa'
            });
        }

        // Restore location
        await connection.execute(
            'UPDATE locations SET is_active = 1, updated_at = NOW() WHERE id = ?',
            [locationId]
        );

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'RESTORE', 'LOCATION', ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                locationId,
                JSON.stringify({ is_active: 1 }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Khôi phục vị trí thành công'
        });

    } catch (error) {
        console.error('Error restoring location:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi khôi phục vị trí',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = { deleteLocation, hardDeleteLocation, restoreLocation };