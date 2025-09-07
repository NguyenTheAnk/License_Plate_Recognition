const db = require('../../db');

const deleteBlacklist = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;

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

        const blacklistEntry = existingEntry[0];

        // Hard delete - completely remove from database
            await connection.execute(
                'DELETE FROM vehicle_blacklist WHERE id = ?',
                [id]
            );

            // Log access
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, 
                                        old_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'DELETE', 'BLACKLIST', ?, ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user.userId,
                    req.user.username || req.user.email,
                    id,
                    JSON.stringify(blacklistEntry),
                    req.ip,
                    req.get('User-Agent')
                ]
            );

            res.status(200).json({
                success: true,
            message: 'Xóa blacklist entry thành công',
                data: {
                    id: parseInt(id),
                    plate_number: blacklistEntry.plate_number,
                    deleted_permanently: true
                }
            });

    } catch (error) {
        console.error('Error deleting blacklist entry:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa blacklist entry',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const bulkDeleteBlacklist = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { ids } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Danh sách IDs không hợp lệ'
            });
        }

        // Get existing entries before deletion for logging
        const placeholders = ids.map(() => '?').join(',');
        const [existingEntries] = await connection.execute(
            `SELECT id, plate_number FROM vehicle_blacklist WHERE id IN (${placeholders})`,
            ids
        );

        if (existingEntries.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy blacklist entries'
            });
        }

        // Hard bulk delete
        const result = await connection.execute(
                `DELETE FROM vehicle_blacklist WHERE id IN (${placeholders})`,
                ids
            );

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, 
                                    old_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'DELETE', 'BLACKLIST', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
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
            message: `Xóa thành công ${result[0].affectedRows} blacklist entries`,
            data: {
                requested_count: ids.length,
                affected_count: result[0].affectedRows,
                deleted_permanently: true,
                deleted_entries: existingEntries
            }
        });

    } catch (error) {
        console.error('Error bulk deleting blacklist entries:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa nhiều blacklist entries',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const deleteExpiredBlacklist = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { days_expired = 30 } = req.query;

        // Calculate cutoff date
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - parseInt(days_expired));
        const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

        // Get expired entries
        const [expiredEntries] = await connection.execute(
            `SELECT id, plate_number, valid_to 
             FROM vehicle_blacklist 
             WHERE valid_to IS NOT NULL AND valid_to < ? AND is_active = 1`,
            [cutoffDateStr]
        );

        if (expiredEntries.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'Không có blacklist entries hết hạn nào để xóa',
                data: {
                    deleted_count: 0,
                    cutoff_date: cutoffDateStr
                }
            });
        }

        // Hard delete expired entries
        const result = await connection.execute(
                `DELETE FROM vehicle_blacklist 
                 WHERE valid_to IS NOT NULL AND valid_to < ? AND is_active = 1`,
                [cutoffDateStr]
            );

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, 
                                    old_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'DELETE', 'BLACKLIST', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
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
            message: `Xóa thành công ${result[0].affectedRows} blacklist entries hết hạn`,
            data: {
                deleted_count: result[0].affectedRows,
                cutoff_date: cutoffDateStr,
                days_expired: parseInt(days_expired),
                deleted_permanently: true,
                expired_entries: expiredEntries
            }
        });

    } catch (error) {
        console.error('Error deleting expired blacklist entries:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa blacklist entries hết hạn',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    deleteBlacklist,
    bulkDeleteBlacklist,
    deleteExpiredBlacklist
};