const db = require('../../db');

const updateWhitelist = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;
        const {
            location_id,
            plate_number,
            vehicle_id,
            owner_name,
            owner_phone,
            contact_email,
            valid_from,
            valid_to,
            description,
            approval_status,
            is_active
        } = req.body;

        // Check if whitelist entry exists
        const [existingEntry] = await connection.execute(
            'SELECT * FROM vehicle_whitelist WHERE id = ?',
            [id]
        );

        if (existingEntry.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy whitelist entry'
            });
        }

        const currentEntry = existingEntry[0];

        // Check if location exists (if location_id is being updated)
        if (location_id && location_id !== currentEntry.location_id) {
            const [locationExists] = await connection.execute(
                'SELECT id FROM locations WHERE id = ? AND is_active = 1',
                [location_id]
            );

            if (locationExists.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy vị trí'
                });
            }
        }

        // Check if vehicle exists (if vehicle_id is being updated)
        if (vehicle_id && vehicle_id !== currentEntry.vehicle_id) {
            const [vehicleExists] = await connection.execute(
                'SELECT id FROM vehicles WHERE id = ? AND is_active = 1',
                [vehicle_id]
            );

            if (vehicleExists.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy phương tiện'
                });
            }
        }

        // Check for duplicate entry if plate_number or location_id is being changed
        const newPlateNumber = plate_number || currentEntry.plate_number;
        const newLocationId = location_id || currentEntry.location_id;

        if (plate_number !== currentEntry.plate_number || location_id !== currentEntry.location_id) {
            const [duplicateEntry] = await connection.execute(
                'SELECT id FROM vehicle_whitelist WHERE location_id = ? AND plate_number = ? AND id != ? AND is_active = 1',
                [newLocationId, newPlateNumber, id]
            );

            if (duplicateEntry.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Biển số này đã có trong danh sách trắng tại vị trí này'
                });
            }
        }

        // Validate date range
        const newValidFrom = valid_from || currentEntry.valid_from;
        const newValidTo = valid_to || currentEntry.valid_to;
        
        if (newValidFrom && newValidTo && new Date(newValidFrom) > new Date(newValidTo)) {
            return res.status(400).json({
                success: false,
                message: 'Ngày bắt đầu không thể sau ngày kết thúc'
            });
        }

        // Prepare update data
        const updateFields = [];
        const updateValues = [];

        if (location_id !== undefined) {
            updateFields.push('location_id = ?');
            updateValues.push(location_id);
        }
        if (plate_number !== undefined) {
            updateFields.push('plate_number = ?');
            updateValues.push(plate_number);
        }
        if (vehicle_id !== undefined) {
            updateFields.push('vehicle_id = ?');
            updateValues.push(vehicle_id);
        }
        if (owner_name !== undefined) {
            updateFields.push('owner_name = ?');
            updateValues.push(owner_name);
        }
        if (owner_phone !== undefined) {
            updateFields.push('owner_phone = ?');
            updateValues.push(owner_phone);
        }
        if (contact_email !== undefined) {
            updateFields.push('contact_email = ?');
            updateValues.push(contact_email);
        }
        if (valid_from !== undefined) {
            updateFields.push('valid_from = ?');
            updateValues.push(valid_from);
        }
        if (valid_to !== undefined) {
            updateFields.push('valid_to = ?');
            updateValues.push(valid_to);
        }
        if (description !== undefined) {
            updateFields.push('description = ?');
            updateValues.push(description);
        }
        if (approval_status !== undefined) {
            updateFields.push('approval_status = ?');
            updateValues.push(approval_status);
            
            // If approval status is being changed to approved, set approved_by and approved_at
            if (approval_status === 'approved' && currentEntry.approval_status !== 'approved') {
                updateFields.push('approved_by = ?', 'approved_at = NOW()');
                updateValues.push(req.user.userId);
            }
        }
        if (is_active !== undefined) {
            updateFields.push('is_active = ?');
            updateValues.push(is_active ? 1 : 0);
        }

        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Không có dữ liệu để cập nhật'
            });
        }

        // Add updated_at
        updateFields.push('updated_at = NOW()');
        updateValues.push(id);

        // Update whitelist entry
        await connection.execute(
            `UPDATE vehicle_whitelist SET ${updateFields.join(', ')} WHERE id = ?`,
            updateValues
        );

        // Get updated entry with related data
        const [updatedEntry] = await connection.execute(
            `SELECT w.*, l.name as location_name, v.make, v.model, v.color,
                    u1.name as created_by_name, u2.name as approved_by_name,
                    CASE 
                        WHEN w.valid_from IS NULL AND w.valid_to IS NULL THEN 'permanent'
                        WHEN w.valid_from IS NOT NULL AND w.valid_from > CURDATE() THEN 'future'
                        WHEN w.valid_to IS NOT NULL AND w.valid_to < CURDATE() THEN 'expired'
                        ELSE 'valid'
                    END as current_status
             FROM vehicle_whitelist w
             LEFT JOIN locations l ON w.location_id = l.id
             LEFT JOIN vehicles v ON w.vehicle_id = v.id
             LEFT JOIN users u1 ON w.created_by = u1.id
             LEFT JOIN users u2 ON w.approved_by = u2.id
             WHERE w.id = ?`,
            [id]
        );

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, 
                                    old_values, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'UPDATE', 'WHITELIST', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                id,
                JSON.stringify(currentEntry),
                JSON.stringify(req.body),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Cập nhật whitelist entry thành công',
            data: updatedEntry[0]
        });

    } catch (error) {
        console.error('Error updating whitelist entry:', error);
        
        // Handle duplicate key error
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                message: 'Biển số này đã có trong danh sách trắng tại vị trí này'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật whitelist entry',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const updateWhitelistStatus = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;
        const { is_active } = req.body;

        if (typeof is_active !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'is_active phải là boolean'
            });
        }

        // Check if whitelist entry exists
        const [existingEntry] = await connection.execute(
            'SELECT id, plate_number, is_active FROM vehicle_whitelist WHERE id = ?',
            [id]
        );

        if (existingEntry.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy whitelist entry'
            });
        }

        const currentEntry = existingEntry[0];

        // Update status
        await connection.execute(
            'UPDATE vehicle_whitelist SET is_active = ?, updated_at = NOW() WHERE id = ?',
            [is_active ? 1 : 0, id]
        );

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, 
                                    old_values, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'UPDATE_STATUS', 'WHITELIST', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                id,
                JSON.stringify({ is_active: currentEntry.is_active }),
                JSON.stringify({ is_active }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: `${is_active ? 'Kích hoạt' : 'Vô hiệu hóa'} whitelist entry thành công`,
            data: {
                id: parseInt(id),
                plate_number: currentEntry.plate_number,
                is_active
            }
        });

    } catch (error) {
        console.error('Error updating whitelist status:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật trạng thái whitelist entry',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const updateWhitelistApproval = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;
        const { approval_status, approval_notes } = req.body;

        if (!['pending', 'approved', 'rejected'].includes(approval_status)) {
            return res.status(400).json({
                success: false,
                message: 'approval_status không hợp lệ'
            });
        }

        // Check if whitelist entry exists
        const [existingEntry] = await connection.execute(
            'SELECT id, plate_number, approval_status FROM vehicle_whitelist WHERE id = ?',
            [id]
        );

        if (existingEntry.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy whitelist entry'
            });
        }

        const currentEntry = existingEntry[0];

        // Update approval status
        let updateQuery = 'UPDATE vehicle_whitelist SET approval_status = ?, updated_at = NOW()';
        let updateParams = [approval_status];

        if (approval_status === 'approved') {
            updateQuery += ', approved_by = ?, approved_at = NOW()';
            updateParams.push(req.user.userId);
        }

        if (approval_notes) {
            updateQuery += ', description = CONCAT(COALESCE(description, ""), "\n--- Ghi chú phê duyệt: ", ?)';
            updateParams.push(approval_notes);
        }

        updateQuery += ' WHERE id = ?';
        updateParams.push(id);

        await connection.execute(updateQuery, updateParams);

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, 
                                    old_values, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'UPDATE_APPROVAL', 'WHITELIST', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                id,
                JSON.stringify({ approval_status: currentEntry.approval_status }),
                JSON.stringify({ approval_status, approval_notes }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: `${approval_status === 'approved' ? 'Phê duyệt' : approval_status === 'rejected' ? 'Từ chối' : 'Cập nhật trạng thái'} whitelist entry thành công`,
            data: {
                id: parseInt(id),
                plate_number: currentEntry.plate_number,
                approval_status,
                approved_by: approval_status === 'approved' ? req.user.userId : null
            }
        });

    } catch (error) {
        console.error('Error updating whitelist approval:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật phê duyệt whitelist entry',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const bulkUpdateWhitelist = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { ids, update_data } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Danh sách IDs không hợp lệ'
            });
        }

        if (!update_data || Object.keys(update_data).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Dữ liệu cập nhật không hợp lệ'
            });
        }

        const allowedFields = [
            'is_active', 'approval_status', 'valid_from', 'valid_to', 
            'description', 'owner_name', 'owner_phone', 'contact_email'
        ];

        // Validate update fields
        const updateFields = [];
        const updateValues = [];

        for (const [field, value] of Object.entries(update_data)) {
            if (allowedFields.includes(field)) {
                updateFields.push(`${field} = ?`);
                updateValues.push(value);
            }
        }

        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Không có trường hợp lệ để cập nhật'
            });
        }

        // Add approval fields if approval_status is being updated to approved
        if (update_data.approval_status === 'approved') {
            updateFields.push('approved_by = ?', 'approved_at = NOW()');
            updateValues.push(req.user.userId);
        }

        // Add updated_at
        updateFields.push('updated_at = NOW()');

        // Prepare WHERE clause
        const placeholders = ids.map(() => '?').join(',');
        updateValues.push(...ids);

        // Perform bulk update
        const [result] = await connection.execute(
            `UPDATE vehicle_whitelist SET ${updateFields.join(', ')} WHERE id IN (${placeholders})`,
            updateValues
        );

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, 
                                    new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'BULK_UPDATE', 'WHITELIST', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                JSON.stringify({ 
                    ids, 
                    update_data, 
                    affected_rows: result.affectedRows 
                }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: `Cập nhật thành công ${result.affectedRows} whitelist entries`,
            data: {
                updated_count: result.affectedRows,
                requested_count: ids.length
            }
        });

    } catch (error) {
        console.error('Error bulk updating whitelist:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật nhiều whitelist entries',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const extendWhitelistValidity = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;
        const { extend_days, new_valid_to } = req.body;

        if (!extend_days && !new_valid_to) {
            return res.status(400).json({
                success: false,
                message: 'extend_days hoặc new_valid_to là bắt buộc'
            });
        }

        // Check if whitelist entry exists
        const [existingEntry] = await connection.execute(
            'SELECT id, plate_number, valid_to FROM vehicle_whitelist WHERE id = ?',
            [id]
        );

        if (existingEntry.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy whitelist entry'
            });
        }

        const currentEntry = existingEntry[0];
        let newValidTo;

        if (new_valid_to) {
            newValidTo = new_valid_to;
        } else {
            // Calculate new valid_to date
            const baseDate = currentEntry.valid_to ? new Date(currentEntry.valid_to) : new Date();
            baseDate.setDate(baseDate.getDate() + parseInt(extend_days));
            newValidTo = baseDate.toISOString().split('T')[0];
        }

        // Update valid_to
        await connection.execute(
            'UPDATE vehicle_whitelist SET valid_to = ?, updated_at = NOW() WHERE id = ?',
            [newValidTo, id]
        );

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, 
                                    old_values, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'EXTEND_VALIDITY', 'WHITELIST', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                id,
                JSON.stringify({ valid_to: currentEntry.valid_to }),
                JSON.stringify({ valid_to: newValidTo, extend_days }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Gia hạn whitelist entry thành công',
            data: {
                id: parseInt(id),
                plate_number: currentEntry.plate_number,
                old_valid_to: currentEntry.valid_to,
                new_valid_to: newValidTo
            }
        });

    } catch (error) {
        console.error('Error extending whitelist validity:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi gia hạn whitelist entry',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    updateWhitelist,
    updateWhitelistStatus,
    updateWhitelistApproval,
    bulkUpdateWhitelist,
    extendWhitelistValidity
};