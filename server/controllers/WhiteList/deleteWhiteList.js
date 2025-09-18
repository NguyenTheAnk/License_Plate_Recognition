const db = require('../../db');
const fs = require('fs').promises;
const path = require('path');

const deleteWhitelist = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;

        // ✅ FIXED: Removed location and owner field references
        const [existingEntry] = await connection.execute(
            `SELECT w.*, 
                    v.make, v.model, v.color
             FROM vehicle_whitelist w
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

        // Clean up image files before permanent deletion
        const imagePaths = [
            whitelistEntry.plate_image_path,
            whitelistEntry.detected_plate_image,
            whitelistEntry.plate_image_cropped_path,
            whitelistEntry.plate_image_processed_path
        ].filter(path => path !== null);

        for (const imagePath of imagePaths) {
            try {
                if (!imagePath) continue;
                
                const fullPath = path.join(__dirname, '../../public', imagePath);
                
                await fs.access(fullPath); // Kiểm tra file tồn tại
                await fs.unlink(fullPath);
                console.log(`Deleted image file: ${fullPath}`);
            } catch (unlinkError) {
                if (unlinkError.code !== 'ENOENT') {
                    console.warn(`Could not delete image file ${imagePath}:`, unlinkError.message);
                }
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
             VALUES (?, ?, 'DELETE', 'WHITELIST', ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                id,
                JSON.stringify({
                    ...whitelistEntry,
                    deleted_image_files: imagePaths,
                    permanent: true
                }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        // ✅ FIXED: Removed location_name from response
        res.status(200).json({
            success: true,
            message: 'Xóa vĩnh viễn whitelist entry thành công',
            data: {
                id: parseInt(id),
                plate_number: whitelistEntry.plate_number,
                deleted_permanently: true,
                deleted_files_count: imagePaths.length
            }
        });

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
        const { ids } = req.body;

        // Validation
        if (!req.body) {
            console.log('ERROR: No request body');
            return res.status(400).json({
                success: false,
                message: 'Không có dữ liệu trong request body'
            });
        }

        if (!ids) {
            console.log('ERROR: No ids in request body');
            return res.status(400).json({
                success: false,
                message: 'Thiếu danh sách IDs trong request'
            });
        }

        if (!Array.isArray(ids)) {
            console.log('ERROR: ids is not an array:', typeof ids, ids);
            return res.status(400).json({
                success: false,
                message: 'IDs phải là một mảng'
            });
        }

        if (ids.length === 0) {
            console.log('ERROR: Empty ids array');
            return res.status(400).json({
                success: false,
                message: 'Danh sách IDs không được để trống'
            });
        }

        // Validate each ID
        const invalidIds = ids.filter(id => {
            const parsed = parseInt(id);
            return isNaN(parsed) || parsed <= 0;
        });
        
        if (invalidIds.length > 0) {
            console.log('ERROR: Invalid IDs found:', invalidIds);
            return res.status(400).json({
                success: false,
                message: `IDs không hợp lệ: ${invalidIds.join(', ')}`
            });
        }

        // Begin transaction
        await connection.beginTransaction();

        try {
            // Get existing entries before deletion for logging
            const placeholders = ids.map(() => '?').join(',');
            
            // ✅ FIXED: Removed location references
            const [existingEntries] = await connection.execute(
                `SELECT w.id, w.plate_number,
                        w.plate_image_path, w.detected_plate_image, w.plate_image_cropped_path, w.plate_image_processed_path,
                        w.ocr_raw_text, w.verification_status
                 FROM vehicle_whitelist w
                 WHERE w.id IN (${placeholders})`,
                ids
            );

            console.log('Found entries to delete:', existingEntries.length);

            if (existingEntries.length === 0) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy whitelist entries nào với IDs đã cung cấp'
                });
            }

            let deletedFilesCount = 0;

            // Execute permanent delete
            console.log('Executing DELETE query...');
            const [result] = await connection.execute(
                `DELETE FROM vehicle_whitelist WHERE id IN (${placeholders})`,
                ids
            );

            console.log('Database delete result:', result);

            // Commit transaction before deleting files
            await connection.commit();
            console.log('Transaction committed successfully');

            // Delete files after committing database
            for (const entry of existingEntries) {
                const imagePaths = [
                    entry.plate_image_path,
                    entry.detected_plate_image,
                    entry.plate_image_cropped_path,
                    entry.plate_image_processed_path
                ].filter(path => path !== null && path !== undefined && path !== '');

                for (const imagePath of imagePaths) {
                    try {
                        const fullPath = path.join(__dirname, '../../public', imagePath);
                        await fs.access(fullPath);
                        await fs.unlink(fullPath);
                        deletedFilesCount++;
                        console.log(`Deleted image file: ${fullPath}`);
                    } catch (unlinkError) {
                        if (unlinkError.code !== 'ENOENT') {
                            console.warn(`Could not delete image file ${imagePath}:`, unlinkError.message);
                        }
                    }
                }
            }

            // Log access after success
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, 
                                        old_values, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'DELETE', 'WHITELIST', ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user?.userId || null,
                    req.user?.username || req.user?.email || 'unknown',
                    JSON.stringify({ 
                        bulk_operation: true,
                        action: 'bulk_delete_permanent',
                        requested_ids: ids, 
                        deleted_entries: existingEntries,
                        affected_rows: result.affectedRows,
                        deleted_files_count: deletedFilesCount
                    }),
                    req.ip || 'unknown',
                    req.get('User-Agent') || 'unknown'
                ]
            );

            console.log('✓ Bulk delete completed successfully');

            res.status(200).json({
                success: true,
                message: `Xóa vĩnh viễn thành công ${result.affectedRows} whitelist entries`,
                data: {
                    requested_count: ids.length,
                    found_count: existingEntries.length,
                    affected_count: result.affectedRows,
                    deleted_permanently: true,
                    deleted_files_count: deletedFilesCount,
                    deleted_entries: existingEntries.map(entry => ({
                        id: entry.id,
                        plate_number: entry.plate_number,
                    }))
                }
            });

        } catch (dbError) {
            console.error('Database error in bulk delete:', dbError);
            await connection.rollback();
            throw dbError;
        }

    } catch (error) {
        console.error('Error bulk deleting whitelist entries:', error);
        
        let errorMessage = 'Lỗi khi xóa nhiều whitelist entries';
        let statusCode = 500;
        
        if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_ROW_IS_REFERENCED_2') {
            errorMessage = 'Không thể xóa: Dữ liệu đang được tham chiếu bởi bảng khác';
            statusCode = 400;
        } else if (error.code === 'ENOENT') {
            errorMessage = 'Lỗi khi xóa file ảnh: File không tồn tại';
            statusCode = 400;
        } else if (error.code === 'ER_PARSE_ERROR') {
            errorMessage = 'Lỗi cú pháp SQL';
            statusCode = 400;
        }
        
        res.status(statusCode).json({
            success: false,
            message: errorMessage,
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            debug_info: process.env.NODE_ENV === 'development' ? {
                error_code: error.code,
                sql_state: error.sqlState,
                sql_message: error.sqlMessage,
                requested_ids: req.body?.ids
            } : undefined
        });
    }
};

const restoreWhitelist = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { id } = req.params;

        // Check if whitelist entry exists and is inactive
        const [existingEntry] = await connection.execute(
            `SELECT w.*
             FROM vehicle_whitelist w
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

        // ✅ FIXED: Check for duplicate only by plate_number (removed location_id)
        const [duplicateEntry] = await connection.execute(
            'SELECT id FROM vehicle_whitelist WHERE plate_number = ? AND id != ? AND is_active = 1',
            [whitelistEntry.plate_number, id]
        );

        if (duplicateEntry.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Biển số này đã có trong danh sách trắng. Không thể khôi phục.'
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
             VALUES (?, ?, 'UPDATE', 'WHITELIST', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                id,
                JSON.stringify({ is_active: 0 }),
                JSON.stringify({ is_active: 1, action: 'restore' }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        // ✅ FIXED: Removed location_name from response
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
            `SELECT w.id, w.plate_number
             FROM vehicle_whitelist w
             WHERE w.id IN (${placeholders}) AND w.is_active = 0`,
            ids
        );

        if (existingEntries.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy whitelist entries đã bị vô hiệu hóa'
            });
        }

        // ✅ FIXED: Check for duplicates only by plate_number (removed location_id)
        const duplicateChecks = [];
        const duplicateParams = [];

        for (const entry of existingEntries) {
            duplicateChecks.push('(plate_number = ? AND id != ? AND is_active = 1)');
            duplicateParams.push(entry.plate_number, entry.id);
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
             VALUES (?, ?, 'UPDATE', 'WHITELIST', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                JSON.stringify({ 
                    bulk_operation: true,
                    action: 'bulk_restore',
                    ids, 
                    restored_entries: existingEntries,
                    affected_rows: result.affectedRows 
                }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        // ✅ FIXED: Removed location_name from response
        res.status(200).json({
            success: true,
            message: `Khôi phục thành công ${result.affectedRows} whitelist entries`,
            data: {
                requested_count: ids.length,
                found_inactive_count: existingEntries.length,
                restored_count: result.affectedRows,
                restored_entries: existingEntries.map(entry => ({
                    id: entry.id,
                    plate_number: entry.plate_number
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

        // ✅ FIXED: Removed location references from expired entries query
        const [expiredEntries] = await connection.execute(
            `SELECT w.id, w.plate_number, w.valid_to,
                    w.plate_image_path, w.plate_image_cropped_path, w.plate_image_processed_path
             FROM vehicle_whitelist w
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
        } else {
            // Soft delete expired entries
            result = await connection.execute(
                `UPDATE vehicle_whitelist SET is_active = 0, updated_at = NOW() 
                 WHERE valid_to IS NOT NULL AND valid_to < ? AND is_active = 1`,
                [cutoffDateStr]
            );
        }

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, 
                                    old_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, ?, 'WHITELIST', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                permanent === 'true' ? 'DELETE' : 'UPDATE',
                JSON.stringify({ 
                    action: 'delete_expired',
                    permanent: permanent === 'true',
                    cutoff_date: cutoffDateStr,
                    days_expired: parseInt(days_expired),
                    expired_entries: expiredEntries.map(e => ({
                        id: e.id,
                        plate_number: e.plate_number,
                        valid_to: e.valid_to
                    })),
                    affected_rows: result[0].affectedRows,
                    deleted_files_count: deletedFilesCount
                }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        // ✅ FIXED: Removed location_name from response
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

        // ✅ FIXED: Removed location references from inactive entries query
        const [inactiveEntries] = await connection.execute(
            `SELECT w.id, w.plate_number, w.updated_at,
                    w.plate_image_path, w.plate_image_cropped_path, w.plate_image_processed_path
             FROM vehicle_whitelist w
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
             VALUES (?, ?, 'DELETE', 'WHITELIST', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                JSON.stringify({ 
                    action: 'purge_inactive',
                    cutoff_date: cutoffDateStr,
                    days_inactive: parseInt(days_inactive),
                    inactive_entries: inactiveEntries.map(e => ({
                        id: e.id,
                        plate_number: e.plate_number,
                        updated_at: e.updated_at
                    })),
                    affected_rows: result.affectedRows,
                    deleted_files_count: deletedFilesCount
                }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        // ✅ FIXED: Removed location_name from response
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
             VALUES (?, ?, 'DELETE', 'WHITELIST', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username || req.user.email,
                id,
                JSON.stringify({ 
                    action: 'delete_images',
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