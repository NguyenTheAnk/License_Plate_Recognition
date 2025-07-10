const db = require('../../db');
const fs = require('fs').promises;
const path = require('path');

const deleteWhitelist = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;
        const { permanent = false } = req.query;

        // Check if whitelist entry exists
        const [existingEntry] = await connection.execute(
            `SELECT *, 
                    l.name as location_name,
                    v.make, v.model, v.color
             FROM vehicle_whitelist w
             LEFT JOIN locations l ON w.location_id = l.id
             LEFT JOIN vehicles v ON w.vehicle_id = v.id
             WHERE w.id = ?`,
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
            // FIX: Clean up image files before permanent deletion - sửa đường dẫn
            const imagePaths = [
                whitelistEntry.plate_image_path,
                whitelistEntry.detected_plate_image, // Thêm detected_plate_image
                whitelistEntry.plate_image_cropped_path,
                whitelistEntry.plate_image_processed_path
            ].filter(path => path !== null);

            for (const imagePath of imagePaths) {
                try {
                    // FIX: Xây dựng đường dẫn file đúng
                    const fullPath = path.join(__dirname, '../../public', imagePath);
                    await fs.unlink(fullPath);
                    console.log(`Deleted image file: ${fullPath}`);
                } catch (unlinkError) {
                    console.warn(`Could not delete image file ${imagePath}:`, unlinkError.message);
                }
            }

            // Permanent delete - completely remove from database
            await connection.execute(
                'DELETE FROM vehicle_whitelist WHERE id = ?',
                [id]
            );

            // Log access
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, 
                                        old_values, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'DELETE_PERM', 'WHITELIST', ?, ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user.userId,
                    req.user.username || req.user.email,
                    id,
                    JSON.stringify({
                        ...whitelistEntry,
                        deleted_image_files: imagePaths
                    }),
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
                    location_name: whitelistEntry.location_name,
                    deleted_permanently: true,
                    deleted_files_count: imagePaths.length
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
                 VALUES (?, ?, 'DELETE', 'WHITELIST', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
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
                    location_name: whitelistEntry.location_name,
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

        if (ids.length > 100) {
            return res.status(400).json({
                success: false,
                message: 'Không thể xóa quá 100 entries cùng lúc'
            });
        }

        // Get existing entries before deletion for logging
        const placeholders = ids.map(() => '?').join(',');
        const [existingEntries] = await connection.execute(
            `SELECT w.id, w.plate_number, w.location_id, l.name as location_name,
                    w.plate_image_path, w.detected_plate_image, w.plate_image_cropped_path, w.plate_image_processed_path,
                    w.ocr_raw_text, w.verification_status
             FROM vehicle_whitelist w
             LEFT JOIN locations l ON w.location_id = l.id
             WHERE w.id IN (${placeholders})`,
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
        let deletedFilesCount = 0;

        await connection.beginTransaction();

        try {
            if (permanent) {
                // FIX: Clean up image files for permanent deletion - sửa đường dẫn
                for (const entry of existingEntries) {
                    const imagePaths = [
                        entry.plate_image_path,
                        entry.detected_plate_image, // Thêm detected_plate_image
                        entry.plate_image_cropped_path,
                        entry.plate_image_processed_path
                    ].filter(path => path !== null);


                    for (const imagePath of imagePaths) {
                        try {
                            // SỬA: Xây dựng đường dẫn file đúng
                            const fullPath = path.join(__dirname, '../../public', imagePath);
                            await fs.unlink(fullPath);
                            console.log(`Deleted image file: ${fullPath}`);
                        } catch (unlinkError) {
                            console.warn(`Could not delete image file ${imagePath}:`, unlinkError.message);
                        }
                    }
                }

                // Permanent bulk delete
                result = await connection.execute(
                    `DELETE FROM vehicle_whitelist WHERE id IN (${placeholders})`,
                    ids
                );
                actionType = 'BULK_DELETE';
            } else {
                // Soft bulk delete
                result = await connection.execute(
                    `UPDATE vehicle_whitelist SET is_active = 0, updated_at = NOW() WHERE id IN (${placeholders})`,
                    ids
                );
                actionType = 'BULK_DELETE';
            }

            await connection.commit();

            // Log access
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, 
                                        old_values, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, ?, 'WHITELIST', ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user.userId,
                    req.user.username || req.user.email,
                    permanent ? 'BULK_DEL_P' : 'BULK_DEL', // Rút ngắn
                    JSON.stringify({ 
                        ids, 
                        entries: existingEntries,
                        affected_rows: result[0].affectedRows,
                        deleted_files_count: deletedFilesCount
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
                    deleted_files_count: deletedFilesCount,
                    deleted_entries: existingEntries.map(entry => ({
                        id: entry.id,
                        plate_number: entry.plate_number,
                        location_name: entry.location_name
                    }))
                }
            });

        } catch (error) {
            await connection.rollback();
            throw error;
        }

    } catch (error) {
        console.error('Error bulk deleting whitelist entries:', error);
    
        // Rollback nếu đang trong transaction
        try {
            await connection.rollback();
        } catch (rollbackError) {
            console.error('Rollback error:', rollbackError);
        }
        
        // Xử lý các loại lỗi cụ thể
        let errorMessage = 'Lỗi khi xóa nhiều whitelist entries';
        let statusCode = 500;
        
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            errorMessage = 'Không thể xóa: Có dữ liệu liên quan đang được sử dụng';
            statusCode = 400;
        } else if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            errorMessage = 'Không thể xóa: Dữ liệu đang được tham chiếu bởi bảng khác';
            statusCode = 400;
        } else if (error.code === 'ENOENT') {
            errorMessage = 'Lỗi khi xóa file ảnh: File không tồn tại';
            statusCode = 400;
        }
        
        res.status(statusCode).json({
            success: false,
            message: errorMessage,
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
            `SELECT w.*, l.name as location_name
             FROM vehicle_whitelist w
             LEFT JOIN locations l ON w.location_id = l.id
             WHERE w.id = ? AND w.is_active = 0`,
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
                location_name: whitelistEntry.location_name,
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
            `SELECT w.id, w.plate_number, w.location_id, l.name as location_name
             FROM vehicle_whitelist w
             LEFT JOIN locations l ON w.location_id = l.id
             WHERE w.id IN (${placeholders}) AND w.is_active = 0`,
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
                restored_entries: existingEntries.map(entry => ({
                    id: entry.id,
                    plate_number: entry.plate_number,
                    location_name: entry.location_name
                }))
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

        // Get expired entries with image paths
        const [expiredEntries] = await connection.execute(
            `SELECT w.id, w.plate_number, w.location_id, w.valid_to, l.name as location_name,
                    w.plate_image_path, w.plate_image_cropped_path, w.plate_image_processed_path
             FROM vehicle_whitelist w
             LEFT JOIN locations l ON w.location_id = l.id
             WHERE w.valid_to IS NOT NULL AND w.valid_to < ? AND w.is_active = 1`,
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
        let deletedFilesCount = 0;

        if (permanent === 'true') {
            // Clean up image files for expired entries
            for (const entry of expiredEntries) {
                const imagePaths = [
                    entry.plate_image_path,
                    entry.plate_image_cropped_path,
                    entry.plate_image_processed_path
                ].filter(path => path !== null);

                for (const imagePath of imagePaths) {
                    try {
                        await fs.unlink(imagePath);
                        deletedFilesCount++;
                    } catch (unlinkError) {
                        console.warn(`Could not delete image file ${imagePath}:`, unlinkError.message);
                    }
                }
            }

            // Permanent delete expired entries
            result = await connection.execute(
                `DELETE FROM vehicle_whitelist 
                 WHERE valid_to IS NOT NULL AND valid_to < ? AND is_active = 1`,
                [cutoffDateStr]
            );
            actionType = 'DELETE_EXP_PERMANENT';
        } else {
            // Soft delete expired entries
            result = await connection.execute(
                `UPDATE vehicle_whitelist SET is_active = 0, updated_at = NOW() 
                 WHERE valid_to IS NOT NULL AND valid_to < ? AND is_active = 1`,
                [cutoffDateStr]
            );
            actionType = 'DELETE_EXP_SOFT';
        }

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, 
                                    old_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, ?, 'WHITELIST', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                permanent === 'true' ? 'DEL_EXP_P' : 'DEL_EXP_S', // Rút ngắn
                JSON.stringify({ 
                    cutoff_date: cutoffDateStr,
                    days_expired: parseInt(days_expired),
                    expired_entries: expiredEntries.map(e => ({
                        id: e.id,
                        plate_number: e.plate_number,
                        location_name: e.location_name,
                        valid_to: e.valid_to
                    })),
                    affected_rows: result[0].affectedRows,
                    deleted_files_count: deletedFilesCount
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
                deleted_files_count: deletedFilesCount,
                expired_entries: expiredEntries.map(e => ({
                    id: e.id,
                    plate_number: e.plate_number,
                    location_name: e.location_name,
                    valid_to: e.valid_to
                }))
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
            `SELECT w.id, w.plate_number, w.location_id, w.updated_at, l.name as location_name,
                    w.plate_image_path, w.plate_image_cropped_path, w.plate_image_processed_path
             FROM vehicle_whitelist w
             LEFT JOIN locations l ON w.location_id = l.id
             WHERE w.is_active = 0 AND w.updated_at < ?`,
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

        let deletedFilesCount = 0;

        // Clean up image files for inactive entries
        for (const entry of inactiveEntries) {
            const imagePaths = [
                entry.plate_image_path,
                entry.plate_image_cropped_path,
                entry.plate_image_processed_path
            ].filter(path => path !== null);

            for (const imagePath of imagePaths) {
                try {
                    await fs.unlink(imagePath);
                    deletedFilesCount++;
                } catch (unlinkError) {
                    console.warn(`Could not delete image file ${imagePath}:`, unlinkError.message);
                }
            }
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
             VALUES (?, ?, 'PURGE', 'WHITELIST', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                JSON.stringify({ 
                    cutoff_date: cutoffDateStr,
                    days_inactive: parseInt(days_inactive),
                    inactive_entries: inactiveEntries.map(e => ({
                        id: e.id,
                        plate_number: e.plate_number,
                        location_name: e.location_name,
                        updated_at: e.updated_at
                    })),
                    affected_rows: result.affectedRows,
                    deleted_files_count: deletedFilesCount
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
                deleted_files_count: deletedFilesCount,
                purged_entries: inactiveEntries.map(e => ({
                    id: e.id,
                    plate_number: e.plate_number,
                    location_name: e.location_name,
                    updated_at: e.updated_at
                }))
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

const deleteWhitelistImages = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;
        const { image_type } = req.body; // 'original', 'cropped', 'processed', or 'all'

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
        const imagesToDelete = [];
        const updateFields = [];
        const updateValues = [];

        // Determine which images to delete
        if (image_type === 'all' || image_type === 'original') {
            if (whitelistEntry.plate_image_path) {
                imagesToDelete.push(whitelistEntry.plate_image_path);
                updateFields.push('plate_image_path = NULL');
            }
        }

        if (image_type === 'all' || image_type === 'cropped') {
            if (whitelistEntry.plate_image_cropped_path) {
                imagesToDelete.push(whitelistEntry.plate_image_cropped_path);
                updateFields.push('plate_image_cropped_path = NULL');
            }
        }

        if (image_type === 'all' || image_type === 'processed') {
            if (whitelistEntry.plate_image_processed_path) {
                imagesToDelete.push(whitelistEntry.plate_image_processed_path);
                updateFields.push('plate_image_processed_path = NULL');
            }
        }

        if (imagesToDelete.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy ảnh nào để xóa'
            });
        }

        // Delete physical files
        let deletedFilesCount = 0;
        for (const imagePath of imagesToDelete) {
            try {
                await fs.unlink(imagePath);
                deletedFilesCount++;
            } catch (unlinkError) {
                console.warn(`Could not delete image file ${imagePath}:`, unlinkError.message);
            }
        }

        // Update database to remove image paths
        if (updateFields.length > 0) {
            updateFields.push('updated_at = NOW()');
            await connection.execute(
                `UPDATE vehicle_whitelist SET ${updateFields.join(', ')} WHERE id = ?`,
                [...updateValues, id]
            );
        }

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, 
                                    old_values, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'DELETE_IMAGES', 'WHITELIST', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                id,
                JSON.stringify({ 
                    deleted_images: imagesToDelete,
                    image_type 
                }),
                JSON.stringify({ 
                    deleted_files_count: deletedFilesCount 
                }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: `Xóa thành công ${deletedFilesCount} ảnh`,
            data: {
                id: parseInt(id),
                plate_number: whitelistEntry.plate_number,
                image_type,
                deleted_files_count: deletedFilesCount,
                deleted_image_paths: imagesToDelete
            }
        });

    } catch (error) {
        console.error('Error deleting whitelist images:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa ảnh whitelist',
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
    purgeInactiveWhitelist,
    deleteWhitelistImages
};