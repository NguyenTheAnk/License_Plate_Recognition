const db = require('../../db');

const createBlacklist = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const {
            location_id,
            plate_number,
            vehicle_id,
            violation_type = 'unauthorized',
            reason,
            severity = 'medium',
            owner_name,
            owner_phone,
            valid_from,
            valid_to,
            description,
            evidence_files
        } = req.body;

        // Validate required fields
        if (!location_id || !plate_number || !reason) {
            return res.status(400).json({
                success: false,
                message: 'location_id, plate_number và reason là bắt buộc'
            });
        }

        // Check if location exists
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

        // Check if vehicle exists (if vehicle_id provided)
        if (vehicle_id) {
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

        // Check if blacklist entry already exists
        const [existingEntry] = await connection.execute(
            'SELECT id FROM vehicle_blacklist WHERE location_id = ? AND plate_number = ? AND is_active = 1',
            [location_id, plate_number]
        );

        if (existingEntry.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Biển số này đã có trong danh sách đen tại vị trí này'
            });
        }

        // Validate violation type and severity
        const validViolationTypes = ['unauthorized', 'security_threat', 'unpaid_fine', 'banned', 'suspicious', 'other'];
        const validSeverities = ['low', 'medium', 'high', 'critical'];

        if (!validViolationTypes.includes(violation_type)) {
            return res.status(400).json({
                success: false,
                message: 'Loại vi phạm không hợp lệ'
            });
        }

        if (!validSeverities.includes(severity)) {
            return res.status(400).json({
                success: false,
                message: 'Mức độ nghiêm trọng không hợp lệ'
            });
        }

        // Validate date range
        if (valid_from && valid_to && new Date(valid_from) > new Date(valid_to)) {
            return res.status(400).json({
                success: false,
                message: 'Ngày bắt đầu không thể sau ngày kết thúc'
            });
        }

        // Validate evidence files format if provided
        let evidenceFilesJson = null;
        if (evidence_files) {
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

        // Create blacklist entry
        const [result] = await connection.execute(
            `INSERT INTO vehicle_blacklist 
             (location_id, plate_number, vehicle_id, violation_type, reason, severity,
              owner_name, owner_phone, valid_from, valid_to, description, 
              evidence_files, created_by, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                location_id,
                plate_number,
                vehicle_id || null,
                violation_type,
                reason,
                severity,
                owner_name || null,
                owner_phone || null,
                valid_from || null,
                valid_to || null,
                description || null,
                evidenceFilesJson ? JSON.stringify(evidenceFilesJson) : null,
                req.user.userId
            ]
        );

        // Get the created blacklist entry with location info
        const [blacklistEntry] = await connection.execute(
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
            [result.insertId]
        );

        // Create alert for blacklist addition
        await connection.execute(
            `INSERT INTO alerts (
                alert_uuid, alert_type, severity, title, message,
                plate_number, location_id, vehicle_id, alert_data,
                status, priority_score, created_at
            ) VALUES (?, 'blacklist_detected', ?, ?, ?, ?, ?, ?, ?, 'new', ?, NOW())`,
            [
                require('crypto').randomUUID(),
                severity,
                `Xe ${plate_number} đã được thêm vào danh sách đen`,
                `Xe có biển số ${plate_number} đã được thêm vào danh sách đen tại ${blacklistEntry[0].location_name} với lý do: ${reason}`,
                plate_number,
                location_id,
                vehicle_id || null,
                JSON.stringify({
                    violation_type,
                    severity,
                    reason,
                    created_by: req.user.userId
                }),
                severity === 'critical' ? 95 : severity === 'high' ? 80 : severity === 'medium' ? 60 : 40
            ]
        );

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, 
                                    new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'CREATE', 'BLACKLIST', ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                result.insertId,
                JSON.stringify({ plate_number, location_id, violation_type, severity }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Thêm vào danh sách đen thành công',
            data: blacklistEntry[0]
        });

    } catch (error) {
        console.error('Error creating blacklist entry:', error);
        
        // Handle duplicate key error
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                message: 'Biển số này đã có trong danh sách đen tại vị trí này'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Lỗi khi thêm vào danh sách đen',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const createMultipleBlacklist = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { entries } = req.body;

        if (!entries || !Array.isArray(entries) || entries.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Danh sách entries không hợp lệ'
            });
        }

        await connection.beginTransaction();

        const results = [];
        const errors = [];

        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            
            try {
                // Validate required fields for each entry
                if (!entry.location_id || !entry.plate_number || !entry.reason) {
                    errors.push({
                        index: i,
                        plate_number: entry.plate_number,
                        error: 'location_id, plate_number và reason là bắt buộc'
                    });
                    continue;
                }

                // Check if entry already exists
                const [existingEntry] = await connection.execute(
                    'SELECT id FROM vehicle_blacklist WHERE location_id = ? AND plate_number = ? AND is_active = 1',
                    [entry.location_id, entry.plate_number]
                );

                if (existingEntry.length > 0) {
                    errors.push({
                        index: i,
                        plate_number: entry.plate_number,
                        error: 'Biển số này đã có trong danh sách đen tại vị trí này'
                    });
                    continue;
                }

                // Validate violation type and severity
                const validViolationTypes = ['unauthorized', 'security_threat', 'unpaid_fine', 'banned', 'suspicious', 'other'];
                const validSeverities = ['low', 'medium', 'high', 'critical'];

                const violationType = entry.violation_type || 'unauthorized';
                const severity = entry.severity || 'medium';

                if (!validViolationTypes.includes(violationType)) {
                    errors.push({
                        index: i,
                        plate_number: entry.plate_number,
                        error: 'Loại vi phạm không hợp lệ'
                    });
                    continue;
                }

                if (!validSeverities.includes(severity)) {
                    errors.push({
                        index: i,
                        plate_number: entry.plate_number,
                        error: 'Mức độ nghiêm trọng không hợp lệ'
                    });
                    continue;
                }

                // Insert entry
                const [result] = await connection.execute(
                    `INSERT INTO vehicle_blacklist 
                     (location_id, plate_number, vehicle_id, violation_type, reason, severity,
                      owner_name, owner_phone, valid_from, valid_to, description, 
                      evidence_files, created_by, created_at) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                    [
                        entry.location_id,
                        entry.plate_number,
                        entry.vehicle_id || null,
                        violationType,
                        entry.reason,
                        severity,
                        entry.owner_name || null,
                        entry.owner_phone || null,
                        entry.valid_from || null,
                        entry.valid_to || null,
                        entry.description || null,
                        entry.evidence_files ? JSON.stringify(entry.evidence_files) : null,
                        req.user.userId
                    ]
                );

                results.push({
                    index: i,
                    id: result.insertId,
                    plate_number: entry.plate_number,
                    status: 'success'
                });

            } catch (entryError) {
                errors.push({
                    index: i,
                    plate_number: entry.plate_number,
                    error: entryError.message
                });
            }
        }

        await connection.commit();

        // Log bulk access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, 
                                    new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'BULK_CREATE', 'BLACKLIST', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                JSON.stringify({ 
                    total_entries: entries.length,
                    successful: results.length,
                    failed: errors.length
                }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(201).json({
            success: true,
            message: `Đã thêm ${results.length}/${entries.length} entries vào danh sách đen`,
            data: {
                successful: results,
                failed: errors,
                summary: {
                    total: entries.length,
                    successful: results.length,
                    failed: errors.length
                }
            }
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error creating multiple blacklist entries:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi thêm nhiều entries vào danh sách đen',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    createBlacklist,
    createMultipleBlacklist
};