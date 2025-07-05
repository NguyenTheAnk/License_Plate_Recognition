const db = require('../../db');

const deleteWhitelist = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;
        const { permanent = false } = req.query;

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

        const whitelistEntry = existingEntry[0];

        if (permanent === 'true') {
            // Permanent delete - completely remove from database
            await connection.execute(
                'DELETE FROM vehicle_whitelist WHERE id = ?',
                [id]
            );

            // Log access
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, 
                                        old_values, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'PERMANENT_DELETE', 'WHITELIST', ?, ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user.userId,
                    req.user.username || req.user.email,
                    id,
                    JSON.stringify(whitelistEntry),
                    req.ip,
                    req.get('User-Agent')
                ]
            );

            res.status(200).json({
                success: true,
                message: 'Xóa vĩnh viễn whitelist entry thành công',
                data: {
                    id: parseInt(id),
                    plate_number: whitelistEntry.plate_number,
                    deleted_permanently: true
                }
            });

        } else {
            // Soft delete - just mark as inactive
            await connection.execute(
                'UPDATE vehicle_whitelist SET is_active = 0, updated_at = NOW() WHERE id = ?',
                [id]
            );

            // Log access
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, 
                                        old_values, new_values, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'SOFT_DELETE', 'WHITELIST', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user.userId,
                    req.user.username || req.user.email,
                    id,
                    JSON.stringify({ is_active: whitelistEntry.is_active }),
                    JSON.stringify({ is_active: 0 }),
                    req.ip,
                    req.get('User-Agent')
                ]
            );

            res.status(200).json({
                success: true,
                message: 'Vô hiệu hóa whitelist entry thành công',
                data: {
                    id: parseInt(id),
                    plate_number: whitelistEntry.plate_number,
                    is_active: false
                }
            });
        }

    } catch (error) {
        console.error('Error deleting whitelist entry:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa whitelist entry',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const bulkDeleteWhitelist = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { ids, permanent = false } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Danh sách IDs không hợp lệ'
            });
        }

        // Get existing entries before deletion for logging
        const placeholders = ids.map(() => '?').join(',');
        const [existingEntries] = await connection.execute(
            `SELECT id, plate_number, location_id FROM vehicle_whitelist WHERE id IN (${placeholders})`,
            ids
        );

        if (existingEntries.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy whitelist entries'
            });
        }

        let result;
        let actionType;

        if (permanent) {
            // Permanent bulk delete
            result = await connection.execute(
                `DELETE FROM vehicle_whitelist WHERE id IN (${placeholders})`,
                ids
            );
            actionType = 'BULK_PERMANENT_DELETE';
        } else {
            // Soft bulk delete
            result = await connection.execute(
                `UPDATE vehicle_whitelist SET is_active = 0, updated_at = NOW() WHERE id IN (${placeholders})`,
                ids
            );
            actionType = 'BULK_SOFT_DELETE';
        }

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, 
                                    old_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, ?, 'WHITELIST', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                actionType,
                JSON.stringify({ 
                    ids, 
                    entries: existingEntries,
                    affected_rows: result[0].affectedRows 
                }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: `${permanent ? 'Xóa vĩnh viễn' : 'Vô hiệu hóa'} thành công ${result[0].affectedRows} whitelist entries`,
            data: {
                requested_count: ids.length,
                affected_count: result[0].affectedRows,
                deleted_permanently: permanent,
                deleted_entries: existingEntries
            }
        });

    } catch (error) {
        console.error('Error bulk deleting whitelist entries:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa nhiều whitelist entries',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const restoreWhitelist = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;

        // Check if whitelist entry exists and is inactive
        const [existingEntry] = await connection.execute(
            'SELECT * FROM vehicle_whitelist WHERE id = ? AND is_active = 0',
            [id]
        );

        if (existingEntry.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy whitelist entry đã bị vô hiệu hóa'
            });
        }

        const whitelistEntry = existingEntry[0];

        // Check for duplicate if restoring
        const [duplicateEntry] = await connection.execute(
            'SELECT id FROM vehicle_whitelist WHERE location_id = ? AND plate_number = ? AND id != ? AND is_active = 1',
            [whitelistEntry.location_id, whitelistEntry.plate_number, id]
        );

        if (duplicateEntry.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Biển số này đã có trong danh sách trắng tại vị trí này. Không thể khôi phục.'
            });
        }

        // Restore whitelist entry
        await connection.execute(
            'UPDATE vehicle_whitelist SET is_active = 1, updated_at = NOW() WHERE id = ?',
            [id]
        );

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, 
                                    old_values, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'RESTORE', 'WHITELIST', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                id,
                JSON.stringify({ is_active: 0 }),
                JSON.stringify({ is_active: 1 }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Khôi phục whitelist entry thành công',
            data: {
                id: parseInt(id),
                plate_number: whitelistEntry.plate_number,
                is_active: true
            }
        });

    } catch (error) {
        console.error('Error restoring whitelist entry:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi khôi phục whitelist entry',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const bulkRestoreWhitelist = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { ids } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Danh sách IDs không hợp lệ'
            });
        }

        // Get existing inactive entries
        const placeholders = ids.map(() => '?').join(',');
        const [existingEntries] = await connection.execute(
            `SELECT id, plate_number, location_id FROM vehicle_whitelist 
             WHERE id IN (${placeholders}) AND is_active = 0`,
            ids
        );

        if (existingEntries.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy whitelist entries đã bị vô hiệu hóa'
            });
        }

        // Check for duplicates that would prevent restoration
        const duplicateChecks = [];
        const duplicateParams = [];

        for (const entry of existingEntries) {
            duplicateChecks.push('(location_id = ? AND plate_number = ? AND id != ? AND is_active = 1)');
            duplicateParams.push(entry.location_id, entry.plate_number, entry.id);
        }

        if (duplicateChecks.length > 0) {
            const [duplicates] = await connection.execute(
                `SELECT COUNT(*) as count FROM vehicle_whitelist WHERE ${duplicateChecks.join(' OR ')}`,
                duplicateParams
            );

            if (duplicates[0].count > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Một số biển số đã có trong danh sách trắng. Không thể khôi phục.'
                });
            }
        }

        // Restore entries
        const restoreIds = existingEntries.map(entry => entry.id);
        const restorePlaceholders = restoreIds.map(() => '?').join(',');
        
        const [result] = await connection.execute(
            `UPDATE vehicle_whitelist SET is_active = 1, updated_at = NOW() 
             WHERE id IN (${restorePlaceholders})`,
            restoreIds
        );

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, 
                                    old_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'BULK_RESTORE', 'WHITELIST', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                JSON.stringify({ 
                    ids, 
                    restored_entries: existingEntries,
                    affected_rows: result.affectedRows 
                }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: `Khôi phục thành công ${result.affectedRows} whitelist entries`,
            data: {
                requested_count: ids.length,
                found_inactive_count: existingEntries.length,
                restored_count: result.affectedRows,
                restored_entries: existingEntries
            }
        });

    } catch (error) {
        console.error('Error bulk restoring whitelist entries:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi khôi phục nhiều whitelist entries',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const deleteExpiredWhitelist = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { permanent = false, days_expired = 30 } = req.query;

        // Calculate cutoff date
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - parseInt(days_expired));
        const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

        // Get expired entries
        const [expiredEntries] = await connection.execute(
            `SELECT id, plate_number, location_id, valid_to 
             FROM vehicle_whitelist 
             WHERE valid_to IS NOT NULL AND valid_to < ? AND is_active = 1`,
            [cutoffDateStr]
        );

        if (expiredEntries.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'Không có whitelist entries hết hạn nào để xóa',
                data: {
                    deleted_count: 0,
                    cutoff_date: cutoffDateStr
                }
            });
        }

        let result;
        let actionType;

        if (permanent === 'true') {
            // Permanent delete expired entries
            result = await connection.execute(
                `DELETE FROM vehicle_whitelist 
                 WHERE valid_to IS NOT NULL AND valid_to < ? AND is_active = 1`,
                [cutoffDateStr]
            );
            actionType = 'DELETE_EXPIRED_PERMANENT';
        } else {
            // Soft delete expired entries
            result = await connection.execute(
                `UPDATE vehicle_whitelist SET is_active = 0, updated_at = NOW() 
                 WHERE valid_to IS NOT NULL AND valid_to < ? AND is_active = 1`,
                [cutoffDateStr]
            );
            actionType = 'DELETE_EXPIRED_SOFT';
        }

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, 
                                    old_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, ?, 'WHITELIST', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                actionType,
                JSON.stringify({ 
                    cutoff_date: cutoffDateStr,
                    days_expired: parseInt(days_expired),
                    expired_entries: expiredEntries,
                    affected_rows: result[0].affectedRows 
                }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: `${permanent === 'true' ? 'Xóa vĩnh viễn' : 'Vô hiệu hóa'} thành công ${result[0].affectedRows} whitelist entries hết hạn`,
            data: {
                deleted_count: result[0].affectedRows,
                cutoff_date: cutoffDateStr,
                days_expired: parseInt(days_expired),
                deleted_permanently: permanent === 'true',
                expired_entries: expiredEntries
            }
        });

    } catch (error) {
        console.error('Error deleting expired whitelist entries:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa whitelist entries hết hạn',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const purgeInactiveWhitelist = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { days_inactive = 90 } = req.query;

        // Calculate cutoff date
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - parseInt(days_inactive));
        const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

        // Get inactive entries that haven't been updated for specified days
        const [inactiveEntries] = await connection.execute(
            `SELECT id, plate_number, location_id, updated_at 
             FROM vehicle_whitelist 
             WHERE is_active = 0 AND updated_at < ?`,
            [cutoffDateStr]
        );

        if (inactiveEntries.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'Không có whitelist entries không hoạt động nào để dọn dẹp',
                data: {
                    purged_count: 0,
                    cutoff_date: cutoffDateStr
                }
            });
        }

        // Permanently delete inactive entries
        const [result] = await connection.execute(
            `DELETE FROM vehicle_whitelist 
             WHERE is_active = 0 AND updated_at < ?`,
            [cutoffDateStr]
        );

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, 
                                    old_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'PURGE_INACTIVE', 'WHITELIST', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                JSON.stringify({ 
                    cutoff_date: cutoffDateStr,
                    days_inactive: parseInt(days_inactive),
                    inactive_entries: inactiveEntries,
                    affected_rows: result.affectedRows 
                }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: `Dọn dẹp thành công ${result.affectedRows} whitelist entries không hoạt động`,
            data: {
                purged_count: result.affectedRows,
                cutoff_date: cutoffDateStr,
                days_inactive: parseInt(days_inactive),
                purged_entries: inactiveEntries
            }
        });

    } catch (error) {
        console.error('Error purging inactive whitelist entries:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi dọn dẹp whitelist entries không hoạt động',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    deleteWhitelist,
    bulkDeleteWhitelist,
    restoreWhitelist,
    bulkRestoreWhitelist,
    deleteExpiredWhitelist,
    purgeInactiveWhitelist
};