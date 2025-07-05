const express = require('express');
const router = express.Router();

// Import controllers
const { createWhitelist, createMultipleWhitelist } = require('../controllers/WhiteList/createWhiteList');
const { 
    getAllWhitelist, 
    getWhitelistById, 
    getWhitelistByPlateNumber, 
    getWhitelistStatistics,
    searchWhitelist 
} = require('../controllers/WhiteList/getWhiteList');
const { 
    updateWhitelist, 
    updateWhitelistStatus, 
    updateWhitelistApproval, 
    bulkUpdateWhitelist,
    extendWhitelistValidity 
} = require('../controllers/WhiteList/updateWhiteList');
const { 
    deleteWhitelist, 
    bulkDeleteWhitelist, 
    restoreWhitelist, 
    bulkRestoreWhitelist,
    deleteExpiredWhitelist 
} = require('../controllers/WhiteList/deleteWhiteList');

// Import middlewares
const auth = require('../middlewares/authMiddleware');
const checkPermission = require('../middlewares/checkPermission');
const { onlyAdminAccess } = require('../middlewares/adminMiddleware');

// Import validators
const {
    createWhitelistValidator,
    updateWhitelistValidator,
    bulkWhitelistValidator
} = require('../helper/validator');

// ========================================
// WHITELIST CRUD ROUTES
// ========================================

// Get all whitelist entries with pagination and filters
router.get('/', 
    auth, 
    checkPermission('whitelist.view'), 
    getAllWhitelist
);

// Get whitelist statistics
router.get('/statistics', 
    auth, 
    checkPermission('whitelist.view'), 
    getWhitelistStatistics
);

// Search whitelist entries
router.get('/search', 
    auth, 
    checkPermission('whitelist.view'), 
    searchWhitelist
);

// Get whitelist entry by ID
router.get('/:id', 
    auth, 
    checkPermission('whitelist.view'), 
    getWhitelistById
);

// Get whitelist entries by plate number
router.get('/plate/:plate_number', 
    auth, 
    checkPermission('whitelist.view'), 
    getWhitelistByPlateNumber
);

// Create single whitelist entry
router.post('/create', 
    auth, 
    checkPermission('whitelist.create'), 
    createWhitelistValidator, 
    createWhitelist
);

// Create multiple whitelist entries
router.post('/create/bulk', 
    auth, 
    checkPermission('whitelist.create'), 
    bulkWhitelistValidator, 
    createMultipleWhitelist
);

// Update whitelist entry
router.put('/:id', 
    auth, 
    checkPermission('whitelist.update'), 
    updateWhitelistValidator, 
    updateWhitelist
);

// Update whitelist status (active/inactive)
router.put('/:id/status', 
    auth, 
    checkPermission('whitelist.update'), 
    updateWhitelistStatus
);

// Update whitelist approval status
router.put('/:id/approval', 
    auth, 
    checkPermission('whitelist.update'), 
    updateWhitelistApproval
);

// Extend whitelist validity period
router.put('/:id/extend', 
    auth, 
    checkPermission('whitelist.update'), 
    extendWhitelistValidity
);

// Soft delete whitelist entry (set inactive)
router.delete('/:id', 
    auth, 
    checkPermission('whitelist.delete'), 
    deleteWhitelist
);

// Restore deleted (inactive) whitelist entry
router.post('/:id/restore', 
    auth, 
    checkPermission('whitelist.update'), 
    restoreWhitelist
);

// ========================================
// BULK OPERATIONS
// ========================================

// Bulk update whitelist entries
router.put('/bulk/update', 
    auth, 
    checkPermission('whitelist.update'), 
    bulkUpdateWhitelist
);

// Bulk delete whitelist entries
router.post('/bulk/delete', 
    auth, 
    checkPermission('whitelist.delete'), 
    bulkDeleteWhitelist
);

// Bulk restore whitelist entries
router.post('/bulk/restore', 
    auth, 
    checkPermission('whitelist.update'), 
    bulkRestoreWhitelist
);

// ========================================
// MAINTENANCE OPERATIONS
// ========================================

// Delete expired whitelist entries
router.post('/maintenance/delete-expired', 
    auth, 
    onlyAdminAccess, 
    checkPermission('whitelist.delete'), 
    deleteExpiredWhitelist
);

// ========================================
// VALIDATION AND UTILITY ROUTES
// ========================================

// Check if plate number is whitelisted at specific location
router.get('/check/:plate_number/:location_id', 
    auth, 
    checkPermission('whitelist.view'), 
    async (req, res) => {
        const db = require('../db');
        const connection = await db.promise();
        
        try {
            const { plate_number, location_id } = req.params;
            const { check_validity = true } = req.query;

            let whereConditions = [
                'w.plate_number = ?',
                'w.location_id = ?',
                'w.is_active = 1',
                'w.approval_status = "approved"'
            ];
            let queryParams = [plate_number, location_id];

            // Check validity dates if requested
            if (check_validity === 'true') {
                const today = new Date().toISOString().split('T')[0];
                whereConditions.push(
                    '(w.valid_from IS NULL OR w.valid_from <= ?)',
                    '(w.valid_to IS NULL OR w.valid_to >= ?)'
                );
                queryParams.push(today, today);
            }

            const [result] = await connection.execute(
                `SELECT w.*, l.name as location_name,
                        CASE 
                            WHEN w.valid_from IS NULL AND w.valid_to IS NULL THEN 'permanent'
                            WHEN w.valid_from IS NOT NULL AND w.valid_from > CURDATE() THEN 'future'
                            WHEN w.valid_to IS NOT NULL AND w.valid_to < CURDATE() THEN 'expired'
                            ELSE 'valid'
                        END as validity_status
                 FROM vehicle_whitelist w
                 LEFT JOIN locations l ON w.location_id = l.id
                 WHERE ${whereConditions.join(' AND ')}`,
                queryParams
            );

            const isWhitelisted = result.length > 0;

            res.status(200).json({
                success: true,
                message: `Kiểm tra whitelist cho biển số ${plate_number}`,
                data: {
                    plate_number,
                    location_id: parseInt(location_id),
                    is_whitelisted: isWhitelisted,
                    whitelist_entry: isWhitelisted ? result[0] : null,
                    checked_at: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('Error checking whitelist:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi kiểm tra whitelist',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

// Get whitelist entries that are expiring soon
router.get('/alerts/expiring', 
    auth, 
    checkPermission('whitelist.view'), 
    async (req, res) => {
        const db = require('../db');
        const connection = await db.promise();
        
        try {
            const { days = 7, location_id } = req.query;

            let whereConditions = [
                'w.is_active = 1',
                'w.approval_status = "approved"',
                'w.valid_to IS NOT NULL',
                'w.valid_to BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)'
            ];
            let queryParams = [parseInt(days)];

            if (location_id) {
                whereConditions.push('w.location_id = ?');
                queryParams.push(location_id);
            }

            const [expiringEntries] = await connection.execute(
                `SELECT w.*, l.name as location_name,
                        DATEDIFF(w.valid_to, CURDATE()) as days_until_expiry
                 FROM vehicle_whitelist w
                 LEFT JOIN locations l ON w.location_id = l.id
                 WHERE ${whereConditions.join(' AND ')}
                 ORDER BY w.valid_to ASC`,
                queryParams
            );

            res.status(200).json({
                success: true,
                message: `Danh sách whitelist entries sắp hết hạn trong ${days} ngày`,
                data: expiringEntries,
                count: expiringEntries.length,
                alert_threshold_days: parseInt(days)
            });

        } catch (error) {
            console.error('Error fetching expiring whitelist entries:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh sách whitelist entries sắp hết hạn',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

// Get whitelist entries by location with summary
router.get('/location/:location_id/summary', 
    auth, 
    checkPermission('whitelist.view'), 
    async (req, res) => {
        const db = require('../db');
        const connection = await db.promise();
        
        try {
            const { location_id } = req.params;

            // Check if location exists
            const [locationExists] = await connection.execute(
                'SELECT id, name FROM locations WHERE id = ? AND is_active = 1',
                [location_id]
            );

            if (locationExists.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy vị trí'
                });
            }

            // Get summary statistics
            const [summary] = await connection.execute(
                `SELECT 
                    COUNT(*) as total_entries,
                    COUNT(CASE WHEN w.is_active = 1 THEN 1 END) as active_entries,
                    COUNT(CASE WHEN w.approval_status = 'pending' THEN 1 END) as pending_entries,
                    COUNT(CASE WHEN w.valid_to IS NOT NULL AND w.valid_to < CURDATE() THEN 1 END) as expired_entries,
                    COUNT(CASE WHEN w.valid_to IS NOT NULL AND w.valid_to BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 1 END) as expiring_soon
                 FROM vehicle_whitelist w
                 WHERE w.location_id = ?`,
                [location_id]
            );

            // Get recent entries
            const [recentEntries] = await connection.execute(
                `SELECT w.plate_number, w.owner_name, w.created_at, w.approval_status,
                        u.name as created_by_name
                 FROM vehicle_whitelist w
                 LEFT JOIN users u ON w.created_by = u.id
                 WHERE w.location_id = ?
                 ORDER BY w.created_at DESC
                 LIMIT 10`,
                [location_id]
            );

            res.status(200).json({
                success: true,
                message: 'Lấy tóm tắt whitelist theo vị trí thành công',
                data: {
                    location: locationExists[0],
                    summary: summary[0],
                    recent_entries: recentEntries
                }
            });

        } catch (error) {
            console.error('Error fetching location whitelist summary:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy tóm tắt whitelist theo vị trí',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

// Export whitelist data
router.get('/export/csv', 
    auth, 
    checkPermission('whitelist.view'), 
    async (req, res) => {
        const db = require('../db');
        const connection = await db.promise();
        
        try {
            const { location_id, approval_status, include_inactive } = req.query;

            let whereConditions = [];
            let queryParams = [];

            if (location_id) {
                whereConditions.push('w.location_id = ?');
                queryParams.push(location_id);
            }

            if (approval_status) {
                whereConditions.push('w.approval_status = ?');
                queryParams.push(approval_status);
            }

            if (include_inactive !== 'true') {
                whereConditions.push('w.is_active = 1');
            }

            const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

            const [whitelistData] = await connection.execute(
                `SELECT 
                    w.plate_number,
                    l.name as location_name,
                    w.owner_name,
                    w.owner_phone,
                    w.contact_email,
                    w.valid_from,
                    w.valid_to,
                    w.approval_status,
                    w.is_active,
                    w.description,
                    w.created_at,
                    u1.name as created_by,
                    u2.name as approved_by
                 FROM vehicle_whitelist w
                 LEFT JOIN locations l ON w.location_id = l.id
                 LEFT JOIN users u1 ON w.created_by = u1.id
                 LEFT JOIN users u2 ON w.approved_by = u2.id
                 ${whereClause}
                 ORDER BY w.created_at DESC`,
                queryParams
            );

            // Set CSV headers
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=whitelist_export_${new Date().toISOString().split('T')[0]}.csv`);

            // Write CSV header
            const csvHeader = 'Biển số,Vị trí,Tên chủ xe,Số điện thoại,Email,Có hiệu lực từ,Có hiệu lực đến,Trạng thái phê duyệt,Kích hoạt,Mô tả,Ngày tạo,Người tạo,Người phê duyệt\n';
            res.write(csvHeader);

            // Write data rows
            for (const row of whitelistData) {
                const csvRow = [
                    row.plate_number || '',
                    row.location_name || '',
                    row.owner_name || '',
                    row.owner_phone || '',
                    row.contact_email || '',
                    row.valid_from || '',
                    row.valid_to || '',
                    row.approval_status || '',
                    row.is_active ? 'Có' : 'Không',
                    (row.description || '').replace(/"/g, '""'),
                    row.created_at ? new Date(row.created_at).toLocaleString('vi-VN') : '',
                    row.created_by || '',
                    row.approved_by || ''
                ].map(field => `"${field}"`).join(',');
                
                res.write(csvRow + '\n');
            }

            res.end();

            // Log export
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, 
                                        new_values, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'EXPORT', 'WHITELIST', ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user.userId,
                    req.user.username || req.user.email,
                    JSON.stringify({ 
                        export_type: 'CSV',
                        filters: { location_id, approval_status, include_inactive },
                        record_count: whitelistData.length
                    }),
                    req.ip,
                    req.get('User-Agent')
                ]
            );

        } catch (error) {
            console.error('Error exporting whitelist data:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi xuất dữ liệu whitelist',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

module.exports = router;