const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { execSync } = require('child_process');

// Import controllers
const { createBlacklist, ocrPreview, createMultipleBlacklist,uploadField1s, upload } = require('../controllers/BlackList/createBlackList');
const { 
    getAllBlacklist, 
    getBlacklistById, 
    getBlacklistByPlateNumber, 
    getBlacklistStatistics,
    searchBlacklist,
    getViolationTypes
} = require('../controllers/BlackList/getBlackList');
const { 
    updateBlacklist, 
    uploadFields,
    updateBlacklistStatus, 
    bulkUpdateBlacklist,
    extendBlacklistValidity 
} = require('../controllers/BlackList/updateBlackList');
const { 
    deleteBlacklist, 
    bulkDeleteBlacklist,
    deleteExpiredBlacklist 
} = require('../controllers/BlackList/deleteBlackList');

// Import middlewares
const auth = require('../middlewares/authMiddleware');
const checkPermission = require('../middlewares/checkPermission');
const { onlyAdminAccess } = require('../middlewares/adminMiddleware');

// Import validators
const {
    createBlacklistValidator,
    updateBlacklistValidator,
    bulkBlacklistValidator
} = require('../helper/validator');

// ========================================
// BLACKLIST CRUD ROUTES
// ========================================

// Get all blacklist entries with pagination and filters
router.get('/', 
    auth, checkPermission('blacklist.view'),
    getAllBlacklist
);

// Get blacklist statistics
router.get('/statistics', 
    auth, 
    //checkPermission('blacklist.view'), 
    getBlacklistStatistics
);

// Get violation types for dropdown
router.get('/violation-types', 
    auth, 
    getViolationTypes
);

// Search blacklist entries
router.get('/search', 
    auth, 
    checkPermission('blacklist.search'), 
    searchBlacklist
);

// Get blacklist entry by ID
router.get('/:id', 
    auth, 
    getBlacklistById
);

// Get blacklist entries by plate number
router.get('/plate/:plate_number', 
    auth, 
    //checkPermission('blacklist.view'), 
    getBlacklistByPlateNumber
);

// Create single blacklist entry
router.post(
  '/create',
  auth,
  uploadField1s, // Sử dụng uploadFields từ createBlackList.js
  //createBlacklistValidator, // Tạm comment để test
  checkPermission('blacklist.create'),
  createBlacklist
);
router.post('/ocr-preview', auth, upload.single('image'), ocrPreview);
// Create multiple blacklist entries
router.post('/create/bulk', 
    auth, 
    //checkPermission('blacklist.create'), 
    bulkBlacklistValidator, 
    createMultipleBlacklist
);

// Update blacklist entry
router.put('/:id', 
    auth, 
    //checkPermission('blacklist.update'), 
    updateBlacklistValidator, 
    uploadFields,
    checkPermission('blacklist.update'),
    updateBlacklist
);

// Update blacklist status (active/inactive)
router.put('/:id/status', 
    auth, 
    //checkPermission('blacklist.update'), 
    updateBlacklistStatus
);

// Extend blacklist validity period
router.put('/:id/extend', 
    auth, 
    //checkPermission('blacklist.update'), 
    extendBlacklistValidity
);

// Delete blacklist entry (permanent)
router.delete('/:id', 
    auth, 
    checkPermission('blacklist.delete'), 
    deleteBlacklist
);

// ========================================
// BULK OPERATIONS
// ========================================

// Bulk update blacklist entries
router.put('/bulk/update', 
    auth, 
    //checkPermission('blacklist.update'), 
    bulkUpdateBlacklist
);

// Bulk delete blacklist entries
router.post('/bulk/delete', 
    auth, 
    //checkPermission('blacklist.delete'), 
    bulkDeleteBlacklist
);

// ========================================
// MAINTENANCE OPERATIONS
// ========================================

// Delete expired blacklist entries
router.post('/maintenance/delete-expired', 
    auth, 
    onlyAdminAccess, 
    //checkPermission('blacklist.delete'), 
    deleteExpiredBlacklist
);

// ========================================
// VALIDATION AND UTILITY ROUTES
// ========================================

// Check if plate number is blacklisted at specific location
router.get('/check/:plate_number/:location_id', 
    auth, 
    //checkPermission('blacklist.view'), 
    async (req, res) => {
        const db = require('../db');
        const connection = await db.promise();
        
        try {
            const { plate_number, location_id } = req.params;
            const { check_validity = true } = req.query;

            let whereConditions = [
                'b.plate_number = ?',
                'b.location_id = ?',
                'b.is_active = 1'
            ];
            let queryParams = [plate_number, location_id];

            // Check validity dates if requested
            if (check_validity === 'true') {
                const today = new Date().toISOString().split('T')[0];
                whereConditions.push(
                    '(b.valid_from IS NULL OR b.valid_from <= ?)',
                    '(b.valid_to IS NULL OR b.valid_to >= ?)'
                );
                queryParams.push(today, today);
            }

            const [result] = await connection.execute(
                `SELECT b.*, l.name as location_name,
                        CASE 
                            WHEN b.valid_from IS NULL AND b.valid_to IS NULL THEN 'permanent'
                            WHEN b.valid_from IS NOT NULL AND b.valid_from > CURDATE() THEN 'future'
                            WHEN b.valid_to IS NOT NULL AND b.valid_to < CURDATE() THEN 'expired'
                            ELSE 'active'
                        END as validity_status
                 FROM vehicle_blacklist b
                 LEFT JOIN locations l ON b.location_id = l.id
                 WHERE ${whereConditions.join(' AND ')}`,
                queryParams
            );

            const isBlacklisted = result.length > 0;

            res.status(200).json({
                success: true,
                message: `Kiểm tra blacklist cho biển số ${plate_number}`,
                data: {
                    plate_number,
                    location_id: parseInt(location_id),
                    is_blacklisted: isBlacklisted,
                    blacklist_entry: isBlacklisted ? result[0] : null,
                    checked_at: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('Error checking blacklist:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi kiểm tra blacklist',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

// Get blacklist entries that are expiring soon
router.get('/alerts/expiring', 
    auth, 
    //checkPermission('blacklist.view'), 
    async (req, res) => {
        const db = require('../db');
        const connection = await db.promise();
        
        try {
            const { days = 7, location_id } = req.query;

            let whereConditions = [
                'b.is_active = 1',
                'b.valid_to IS NOT NULL',
                'b.valid_to BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)'
            ];
            let queryParams = [parseInt(days)];

            if (location_id) {
                whereConditions.push('b.location_id = ?');
                queryParams.push(location_id);
            }

            const [expiringEntries] = await connection.execute(
                `SELECT b.*, l.name as location_name,
                        DATEDIFF(b.valid_to, CURDATE()) as days_until_expiry
                 FROM vehicle_blacklist b
                 LEFT JOIN locations l ON b.location_id = l.id
                 WHERE ${whereConditions.join(' AND ')}
                 ORDER BY b.valid_to ASC`,
                queryParams
            );

            res.status(200).json({
                success: true,
                message: `Danh sách blacklist entries sắp hết hạn trong ${days} ngày`,
                data: expiringEntries,
                count: expiringEntries.length,
                alert_threshold_days: parseInt(days)
            });

        } catch (error) {
            console.error('Error fetching expiring blacklist entries:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh sách blacklist entries sắp hết hạn',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

// Get blacklist entries by location with summary
router.get('/location/:location_id/summary', 
    auth, 
    //checkPermission('blacklist.view'), 
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
                    COUNT(CASE WHEN b.is_active = 1 THEN 1 END) as active_entries,
                    COUNT(CASE WHEN b.severity = 'critical' THEN 1 END) as critical_entries,
                    COUNT(CASE WHEN b.severity = 'high' THEN 1 END) as high_severity_entries,
                    COUNT(CASE WHEN b.valid_to IS NOT NULL AND b.valid_to < CURDATE() THEN 1 END) as expired_entries,
                    COUNT(CASE WHEN b.valid_to IS NOT NULL AND b.valid_to BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 1 END) as expiring_soon
                 FROM vehicle_blacklist b
                 WHERE b.location_id = ?`,
                [location_id]
            );

            // Get recent entries
            const [recentEntries] = await connection.execute(
                `SELECT b.plate_number, b.violation_type, b.severity, b.created_at,
                        u.name as created_by_name
                 FROM vehicle_blacklist b
                 LEFT JOIN users u ON b.created_by = u.id
                 WHERE b.location_id = ?
                 ORDER BY b.created_at DESC
                 LIMIT 10`,
                [location_id]
            );

            // Get violation type breakdown
            const [violationBreakdown] = await connection.execute(
                `SELECT 
                    b.violation_type,
                    COUNT(*) as count,
                    COUNT(CASE WHEN b.is_active = 1 THEN 1 END) as active_count
                 FROM vehicle_blacklist b
                 WHERE b.location_id = ?
                 GROUP BY b.violation_type
                 ORDER BY count DESC`,
                [location_id]
            );

            res.status(200).json({
                success: true,
                message: 'Lấy tóm tắt blacklist theo vị trí thành công',
                data: {
                    location: locationExists[0],
                    summary: summary[0],
                    recent_entries: recentEntries,
                    violation_breakdown: violationBreakdown
                }
            });

        } catch (error) {
            console.error('Error fetching location blacklist summary:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy tóm tắt blacklist theo vị trí',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

// Get high severity blacklist entries (for alerts)
router.get('/alerts/high-severity', 
    auth, 
    //checkPermission('blacklist.view'), 
    async (req, res) => {
        const db = require('../db');
        const connection = await db.promise();
        
        try {
            const { location_id, limit = 20 } = req.query;

            let whereConditions = [
                'b.is_active = 1',
                'b.severity IN ("critical", "high")'
            ];
            let queryParams = [];

            if (location_id) {
                whereConditions.push('b.location_id = ?');
                queryParams.push(location_id);
            }

            // Add current validity check
            const today = new Date().toISOString().split('T')[0];
            whereConditions.push(
                '(b.valid_from IS NULL OR b.valid_from <= ?)',
                '(b.valid_to IS NULL OR b.valid_to >= ?)'
            );
            queryParams.push(today, today);

            const [highSeverityEntries] = await connection.execute(
                `SELECT b.*, l.name as location_name,
                        u.name as created_by_name,
                        COUNT(lpd.id) as recent_detections
                 FROM vehicle_blacklist b
                 LEFT JOIN locations l ON b.location_id = l.id
                 LEFT JOIN users u ON b.created_by = u.id
                 LEFT JOIN license_plate_detections lpd ON b.plate_number = lpd.plate_number 
                                                          AND b.location_id = lpd.location_id
                                                          AND lpd.detected_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                 WHERE ${whereConditions.join(' AND ')}
                 GROUP BY b.id
                 ORDER BY FIELD(b.severity, 'critical', 'high'), b.created_at DESC
                 LIMIT ?`,
                [...queryParams, parseInt(limit)]
            );

            res.status(200).json({
                success: true,
                message: 'Lấy danh sách blacklist entries mức độ cao thành công',
                data: highSeverityEntries,
                count: highSeverityEntries.length
            });

        } catch (error) {
            console.error('Error fetching high severity blacklist entries:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh sách blacklist entries mức độ cao',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

// Export blacklist data
router.get('/export/csv', 
    auth, 
    //checkPermission('blacklist.view'), 
    async (req, res) => {
        const db = require('../db');
        const connection = await db.promise();
        
        try {
            const { location_id, violation_type, severity, include_inactive } = req.query;

            let whereConditions = [];
            let queryParams = [];

            if (location_id) {
                whereConditions.push('b.location_id = ?');
                queryParams.push(location_id);
            }

            if (violation_type) {
                whereConditions.push('b.violation_type = ?');
                queryParams.push(violation_type);
            }

            if (severity) {
                whereConditions.push('b.severity = ?');
                queryParams.push(severity);
            }

            if (include_inactive !== 'true') {
                whereConditions.push('b.is_active = 1');
            }

            const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

            const [blacklistData] = await connection.execute(
                `SELECT 
                    b.plate_number,
                    l.name as location_name,
                    b.violation_type,
                    b.severity,
                    b.reason,
                    b.owner_name,
                    b.owner_phone,
                    b.valid_from,
                    b.valid_to,
                    b.is_active,
                    b.description,
                    b.created_at,
                    u.name as created_by
                 FROM vehicle_blacklist b
                 LEFT JOIN locations l ON b.location_id = l.id
                 LEFT JOIN users u ON b.created_by = u.id
                 ${whereClause}
                 ORDER BY b.created_at DESC`,
                queryParams
            );

            // Set CSV headers
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename=blacklist_export_${new Date().toISOString().split('T')[0]}.csv`);

            // Write BOM for UTF-8
            res.write('\uFEFF');

            // Write CSV header
            const csvHeader = 'Biển số,Vị trí,Loại vi phạm,Mức độ,Lý do,Tên chủ xe,Số điện thoại,Có hiệu lực từ,Có hiệu lực đến,Kích hoạt,Mô tả,Ngày tạo,Người tạo\n';
            res.write(csvHeader);

            // Write data rows
            for (const row of blacklistData) {
                const csvRow = [
                    row.plate_number || '',
                    row.location_name || '',
                    row.violation_type || '',
                    row.severity || '',
                    (row.reason || '').replace(/"/g, '""'),
                    row.owner_name || '',
                    row.owner_phone || '',
                    row.valid_from || '',
                    row.valid_to || '',
                    row.is_active ? 'Có' : 'Không',
                    (row.description || '').replace(/"/g, '""'),
                    row.created_at ? new Date(row.created_at).toLocaleString('vi-VN') : '',
                    row.created_by || ''
                ].map(field => `"${field}"`).join(',');
                
                res.write(csvRow + '\n');
            }

            res.end();

            // Log export
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, 
                                        new_values, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'EXPORT', 'BLACKLIST', ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user.userId,
                    req.user.username || req.user.email,
                    JSON.stringify({ 
                        export_type: 'CSV',
                        filters: { location_id, violation_type, severity, include_inactive },
                        record_count: blacklistData.length
                    }),
                    req.ip,
                    req.get('User-Agent')
                ]
            );

        } catch (error) {
            console.error('Error exporting blacklist data:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi xuất dữ liệu blacklist',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

// Compare whitelist vs blacklist for a plate number
router.get('/compare/:plate_number', 
    auth, 
    //checkPermission('blacklist.view'), 
    async (req, res) => {
        const db = require('../db');
        const connection = await db.promise();
        
        try {
            const { plate_number } = req.params;
            const { location_id } = req.query;

            let locationFilter = '';
            let queryParams = [plate_number];

            if (location_id) {
                locationFilter = 'AND location_id = ?';
                queryParams.push(location_id);
            }

            // Get whitelist entries
            const [whitelistEntries] = await connection.execute(
                `SELECT w.*, l.name as location_name,
                        CASE 
                            WHEN w.valid_from IS NULL AND w.valid_to IS NULL THEN 'permanent'
                            WHEN w.valid_from IS NOT NULL AND w.valid_from > CURDATE() THEN 'future'
                            WHEN w.valid_to IS NOT NULL AND w.valid_to < CURDATE() THEN 'expired'
                            ELSE 'valid'
                        END as status
                 FROM vehicle_whitelist w
                 LEFT JOIN locations l ON w.location_id = l.id
                 WHERE w.plate_number = ? AND w.is_active = 1 ${locationFilter}
                 ORDER BY w.created_at DESC`,
                queryParams
            );

            // Get blacklist entries
            const [blacklistEntries] = await connection.execute(
                `SELECT b.*, l.name as location_name,
                        CASE 
                            WHEN b.valid_from IS NULL AND b.valid_to IS NULL THEN 'permanent'
                            WHEN b.valid_from IS NOT NULL AND b.valid_from > CURDATE() THEN 'future'
                            WHEN b.valid_to IS NOT NULL AND b.valid_to < CURDATE() THEN 'expired'
                            ELSE 'active'
                        END as status
                 FROM vehicle_blacklist b
                 LEFT JOIN locations l ON b.location_id = l.id
                 WHERE b.plate_number = ? AND b.is_active = 1 ${locationFilter}
                 ORDER BY b.created_at DESC`,
                queryParams
            );

            // Check for conflicts (same location in both lists)
            const conflicts = [];
            for (const whitelist of whitelistEntries) {
                for (const blacklist of blacklistEntries) {
                    if (whitelist.location_id === blacklist.location_id) {
                        conflicts.push({
                            location_id: whitelist.location_id,
                            location_name: whitelist.location_name,
                            whitelist_status: whitelist.status,
                            blacklist_status: blacklist.status,
                            priority: blacklist.severity === 'critical' ? 'blacklist_priority' : 'conflict_review_needed'
                        });
                    }
                }
            }

            res.status(200).json({
                success: true,
                message: `So sánh whitelist/blacklist cho biển số ${plate_number}`,
                data: {
                    plate_number,
                    whitelist_entries: whitelistEntries,
                    blacklist_entries: blacklistEntries,
                    conflicts: conflicts,
                    summary: {
                        whitelist_count: whitelistEntries.length,
                        blacklist_count: blacklistEntries.length,
                        conflict_count: conflicts.length,
                        has_conflicts: conflicts.length > 0
                    }
                }
            });

        } catch (error) {
            console.error('Error comparing whitelist/blacklist:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi so sánh whitelist/blacklist',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);


module.exports = router;