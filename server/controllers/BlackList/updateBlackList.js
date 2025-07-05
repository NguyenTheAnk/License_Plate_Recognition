const db = require('../../db');

const updateBlacklist = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;
        const {
            location_id,
            plate_number,
            vehicle_id,
            violation_type,
            reason,
            severity,
            owner_name,
            owner_phone,
            valid_from,
            valid_to,
            description,
            evidence_files,
            is_active
        } = req.body;

        // Check if blacklist entry exists
        const [existingEntry] = await connection.execute(
            'SELECT * FROM vehicle_blacklist WHERE id = ?',
            [id]
        );

        if (existingEntry.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy blacklist entry'
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
                'SELECT id FROM vehicle_blacklist WHERE location_id = ? AND plate_number = ? AND id != ? AND is_active = 1',
                [newLocationId, newPlateNumber, id]
            );

            if (duplicateEntry.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Biển số này đã có trong danh sách đen tại vị trí này'
                });
            }
        }

        // Validate violation type and severity if provided
        if (violation_type) {
            const validViolationTypes = ['unauthorized', 'security_threat', 'unpaid_fine', 'banned', 'suspicious', 'other'];
            if (!validViolationTypes.includes(violation_type)) {
                return res.status(400).json({
                    success: false,
                    message: 'Loại vi phạm không hợp lệ'
                });
            }
        }

        if (severity) {
            const validSeverities = ['low', 'medium', 'high', 'critical'];
            if (!validSeverities.includes(severity)) {
                return res.status(400).json({
                    success: false,
                    message: 'Mức độ nghiêm trọng không hợp lệ'
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

        // Validate evidence files format if provided
        let evidenceFilesJson = currentEntry.evidence_files;
        if (evidence_files !== undefined) {
            if (evidence_files === null) {
                evidenceFilesJson = null;
            } else {
                try {
                    evidenceFilesJson = typeof evidence_files === 'string' ? JSON.parse(evidence_files) : evidence_files;
                    if (!Array.isArray(evidenceFilesJson)) {
                        throw new Error('Evidence files must be an array');
                    }
                } catch (error) {
                    return res.status(400).json({
                        success: false,
                        message: 'Định dạng evidence_files không hợp lệ'
                    });
                }
            }
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
        if (violation_type !== undefined) {
            updateFields.push('violation_type = ?');
            updateValues.push(violation_type);
        }
        if (reason !== undefined) {
            updateFields.push('reason = ?');
            updateValues.push(reason);
        }
        if (severity !== undefined) {
            updateFields.push('severity = ?');
            updateValues.push(severity);
        }
        if (owner_name !== undefined) {
            updateFields.push('owner_name = ?');
            updateValues.push(owner_name);
        }
        if (owner_phone !== undefined) {
            updateFields.push('owner_phone = ?');
            updateValues.push(owner_phone);
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
        if (evidence_files !== undefined) {
            updateFields.push('evidence_files = ?');
            updateValues.push(evidenceFilesJson ? JSON.stringify(evidenceFilesJson) : null);
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

        // Update blacklist entry
        await connection.execute(
            `UPDATE vehicle_blacklist SET ${updateFields.join(', ')} WHERE id = ?`,
            updateValues
        );

        // Get updated entry with related data
        const [updatedEntry] = await connection.execute(
            `SELECT b.*, l.name as location_name, v.make, v.model, v.color,
                    u.name as created_by_name,
                    CASE 
                        WHEN b.valid_from IS NULL AND b.valid_to IS NULL THEN 'permanent'
                        WHEN b.valid_from IS NOT NULL AND b.valid_from > CURDATE() THEN 'future'
                        WHEN b.valid_to IS NOT NULL AND b.valid_to < CURDATE() THEN 'expired'
                        ELSE 'active'
                    END as current_status
             FROM vehicle_blacklist b
             LEFT JOIN locations l ON b.location_id = l.id
             LEFT JOIN vehicles v ON b.vehicle_id = v.id
             LEFT JOIN users u ON b.created_by = u.id
             WHERE b.id = ?`,
            [id]
        );

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, 
                                    old_values, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'UPDATE', 'BLACKLIST', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
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
            message: 'Cập nhật blacklist entry thành công',
            data: updatedEntry[0]
        });

    } catch (error) {
        console.error('Error updating blacklist entry:', error);
        
        // Handle duplicate key error
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                message: 'Biển số này đã có trong danh sách đen tại vị trí này'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật blacklist entry',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const updateBlacklistStatus = async (req, res) => {
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

        // Check if blacklist entry exists
        const [existingEntry] = await connection.execute(
            'SELECT id, plate_number, is_active FROM vehicle_blacklist WHERE id = ?',
            [id]
        );

        if (existingEntry.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy blacklist entry'
            });
        }

        const currentEntry = existingEntry[0];

        // Update status
        await connection.execute(
            'UPDATE vehicle_blacklist SET is_active = ?, updated_at = NOW() WHERE id = ?',
            [is_active ? 1 : 0, id]
        );

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, 
                                    old_values, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'UPDATE_STATUS', 'BLACKLIST', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
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
            message: `${is_active ? 'Kích hoạt' : 'Vô hiệu hóa'} blacklist entry thành công`,
            data: {
                id: parseInt(id),
                plate_number: currentEntry.plate_number,
                is_active
            }
        });

    } catch (error) {
        console.error('Error updating blacklist status:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật trạng thái blacklist entry',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const bulkUpdateBlacklist = async (req, res) => {
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
            'is_active', 'violation_type', 'severity', 'valid_from', 'valid_to', 
            'description', 'owner_name', 'owner_phone', 'reason'
        ];

        // Validate update fields
        const updateFields = [];
        const updateValues = [];

        for (const [field, value] of Object.entries(update_data)) {
            if (allowedFields.includes(field)) {
                // Validate specific fields
                if (field === 'violation_type') {
                    const validViolationTypes = ['unauthorized', 'security_threat', 'unpaid_fine', 'banned', 'suspicious', 'other'];
                    if (!validViolationTypes.includes(value)) {
                        return res.status(400).json({
                            success: false,
                            message: 'Loại vi phạm không hợp lệ'
                        });
                    }
                }
                
                if (field === 'severity') {
                    const validSeverities = ['low', 'medium', 'high', 'critical'];
                    if (!validSeverities.includes(value)) {
                        return res.status(400).json({
                            success: false,
                            message: 'Mức độ nghiêm trọng không hợp lệ'
                        });
                    }
                }

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

        // Add updated_at
        updateFields.push('updated_at = NOW()');

        // Prepare WHERE clause
        const placeholders = ids.map(() => '?').join(',');
        updateValues.push(...ids);

        // Perform bulk update
        const [result] = await connection.execute(
            `UPDATE vehicle_blacklist SET ${updateFields.join(', ')} WHERE id IN (${placeholders})`,
            updateValues
        );

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, 
                                    new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'BULK_UPDATE', 'BLACKLIST', ?, 'SUCCESS', ?, ?, NOW())`,
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
            message: `Cập nhật thành công ${result.affectedRows} blacklist entries`,
            data: {
                updated_count: result.affectedRows,
                requested_count: ids.length
            }
        });

    } catch (error) {
        console.error('Error bulk updating blacklist:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật nhiều blacklist entries',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const extendBlacklistValidity = async (req, res) => {
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

        // Check if blacklist entry exists
        const [existingEntry] = await connection.execute(
            'SELECT id, plate_number, valid_to FROM vehicle_blacklist WHERE id = ?',
            [id]
        );

        if (existingEntry.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy blacklist entry'
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
            'UPDATE vehicle_blacklist SET valid_to = ?, updated_at = NOW() WHERE id = ?',
            [newValidTo, id]
        );

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, 
                                    old_values, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'EXTEND_VALIDITY', 'BLACKLIST', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
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
            message: 'Gia hạn blacklist entry thành công',
            data: {
                id: parseInt(id),
                plate_number: currentEntry.plate_number,
                old_valid_to: currentEntry.valid_to,
                new_valid_to: newValidTo
            }
        });

    } catch (error) {
        console.error('Error extending blacklist validity:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi gia hạn blacklist entry',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    updateBlacklist,
    updateBlacklistStatus,
    bulkUpdateBlacklist,
    extendBlacklistValidity
};