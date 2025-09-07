// server\controllers\Camera\getCameraStream.js
const db = require('../../db');

const getCameraDetailedView = async (req, res) => {
    const connection = await db.promise();

    try {
        const cameraId = req.params.id;

        // Get camera with detailed information
        const [cameras] = await connection.execute(`
            SELECT 
                c.*,
                l.name as location_name,
                l.address as location_address,
                l.zone_type as location_zone_type,
                l.latitude as location_latitude,
                l.longitude as location_longitude,
                ml.name as monitoring_location_name,
                ml.zone_type as monitoring_zone_type,
                TIMESTAMPDIFF(SECOND, c.last_heartbeat, NOW()) as seconds_since_heartbeat,
                CASE 
                    WHEN c.last_heartbeat IS NULL THEN 'never'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 5 THEN 'online'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 15 THEN 'warning'
                    ELSE 'offline'
                END as connection_status,
                CONCAT(c.protocol, '://', c.host, ':', c.port, c.path) as rtsp_url
            FROM cameras c
            JOIN locations l ON c.location_id = l.id
            LEFT JOIN locations ml ON c.monitoring_location_id = ml.id
            WHERE c.id = ? AND c.is_active = 1
        `, [cameraId]);

        if (cameras.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy camera'
            });
        }

        const camera = cameras[0];

        // Get detection statistics for different time periods
        const [detectionStats] = await connection.execute(`
            SELECT 
                COUNT(CASE WHEN detected_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN 1 END) as detections_1h,
                COUNT(CASE WHEN detected_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as detections_24h,
                COUNT(CASE WHEN detected_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as detections_7d,
                COUNT(CASE WHEN detected_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as detections_30d,
                COUNT(*) as detections_total,
                COUNT(DISTINCT plate_number) as unique_plates_total,
                COUNT(DISTINCT DATE(detected_at)) as active_days,
                AVG(confidence) as avg_confidence,
                MAX(detected_at) as last_detected_at,
                MIN(detected_at) as first_detected_at
            FROM license_plate_detections 
            WHERE camera_id = ?
        `, [cameraId]);

        // Get hourly detection pattern (last 24 hours)
        const [hourlyPattern] = await connection.execute(`
            SELECT 
                HOUR(detected_at) as hour,
                COUNT(*) as detection_count,
                COUNT(DISTINCT plate_number) as unique_plates,
                AVG(confidence) as avg_confidence
            FROM license_plate_detections 
            WHERE camera_id = ? 
            AND detected_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            GROUP BY HOUR(detected_at)
            ORDER BY hour
        `, [cameraId]);

        // Get daily detection pattern (last 30 days)
        const [dailyPattern] = await connection.execute(`
            SELECT 
                DATE(detected_at) as date,
                COUNT(*) as detection_count,
                COUNT(DISTINCT plate_number) as unique_plates,
                AVG(confidence) as avg_confidence
            FROM license_plate_detections 
            WHERE camera_id = ? 
            AND detected_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY DATE(detected_at)
            ORDER BY date DESC
        `, [cameraId]);

        // Get recent detections
        const [recentDetections] = await connection.execute(`
            SELECT 
                id,
                plate_number,
                detected_at,
                confidence,
                direction,
                speed,
                vehicle_color,
                vehicle_type_detected,
                is_verified,
                image_path,
                cropped_image_path
            FROM license_plate_detections 
            WHERE camera_id = ?
            ORDER BY detected_at DESC
            LIMIT 10
        `, [cameraId]);

        // Get alerts related to this camera (last 30 days)
        const [alerts] = await connection.execute(`
            SELECT 
                id,
                alert_type,
                severity,
                title,
                message,
                status,
                created_at
            FROM alerts 
            WHERE camera_id = ? 
            AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            ORDER BY created_at DESC
            LIMIT 5
        `, [cameraId]);

        // Get confidence distribution
        const [confidenceDistribution] = await connection.execute(`
            SELECT 
                CASE 
                    WHEN confidence >= 0.9 THEN 'high'
                    WHEN confidence >= 0.7 THEN 'medium'
                    WHEN confidence >= 0.5 THEN 'low'
                    ELSE 'very_low'
                END as confidence_level,
                COUNT(*) as count,
                ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM license_plate_detections WHERE camera_id = ?), 2) as percentage
            FROM license_plate_detections 
            WHERE camera_id = ?
            GROUP BY confidence_level
            ORDER BY 
                CASE confidence_level 
                    WHEN 'high' THEN 1 
                    WHEN 'medium' THEN 2 
                    WHEN 'low' THEN 3 
                    ELSE 4 
                END
        `, [cameraId, cameraId]);

        res.status(200).json({
            success: true,
            data: {
                camera: camera,
                statistics: detectionStats[0],
                patterns: {
                    hourly: hourlyPattern,
                    daily: dailyPattern
                },
                recent_detections: recentDetections,
                recent_alerts: alerts,
                confidence_distribution: confidenceDistribution
            }
        });

    } catch (error) {
        console.error('Error getting camera detailed view:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin chi tiết camera',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getCameraHealthReport = async (req, res) => {
    const connection = await db.promise();

    try {
        const { days = 7 } = req.query;

        // Get camera health metrics
        const [healthMetrics] = await connection.execute(`
            SELECT 
                c.id,
                c.name,
                c.code,
                c.status,
                l.name as location_name,
                TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) as minutes_since_heartbeat,
                CASE 
                    WHEN c.last_heartbeat IS NULL THEN 'never_connected'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 5 THEN 'healthy'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 15 THEN 'warning'
                    ELSE 'critical'
                END as health_status,
                COUNT(lpd.id) as detections_period,
                COUNT(DISTINCT DATE(lpd.detected_at)) as active_days,
                AVG(lpd.confidence) as avg_confidence,
                COUNT(CASE WHEN lpd.confidence < 0.7 THEN 1 END) as low_confidence_count,
                MAX(lpd.detected_at) as last_detection,
                (SELECT COUNT(*) FROM alerts a WHERE a.camera_id = c.id AND a.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)) as alert_count
            FROM cameras c
            JOIN locations l ON c.location_id = l.id
            LEFT JOIN license_plate_detections lpd ON c.id = lpd.camera_id 
                AND lpd.detected_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            WHERE c.is_active = 1
            GROUP BY c.id, c.name, c.code, c.status, l.name, c.last_heartbeat
            ORDER BY 
                CASE health_status 
                    WHEN 'critical' THEN 1 
                    WHEN 'warning' THEN 2 
                    WHEN 'never_connected' THEN 3 
                    ELSE 4 
                END,
                c.name
        `, [days, days]);

        // Get overall health summary
        const [healthSummary] = await connection.execute(`
            SELECT 
                COUNT(*) as total_cameras,
                COUNT(CASE WHEN last_heartbeat IS NULL THEN 1 END) as never_connected,
                COUNT(CASE WHEN TIMESTAMPDIFF(MINUTE, last_heartbeat, NOW()) < 5 THEN 1 END) as healthy,
                COUNT(CASE WHEN TIMESTAMPDIFF(MINUTE, last_heartbeat, NOW()) BETWEEN 5 AND 14 THEN 1 END) as warning,
                COUNT(CASE WHEN TIMESTAMPDIFF(MINUTE, last_heartbeat, NOW()) >= 15 THEN 1 END) as critical,
                COUNT(CASE WHEN status = 'online' THEN 1 END) as status_online,
                COUNT(CASE WHEN status = 'offline' THEN 1 END) as status_offline,
                COUNT(CASE WHEN status = 'maintenance' THEN 1 END) as status_maintenance
            FROM cameras 
            WHERE is_active = 1
        `);

        res.status(200).json({
            success: true,
            data: {
                period_days: parseInt(days),
                summary: healthSummary[0],
                cameras: healthMetrics
            }
        });

    } catch (error) {
        console.error('Error getting camera health report:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy báo cáo sức khỏe camera',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getCameraPerformanceReport = async (req, res) => {
    const connection = await db.promise();

    try {
        const { days = 30, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        // Get camera performance metrics
        const [performanceMetrics] = await connection.execute(`
            SELECT 
                c.id,
                c.name,
                c.code,
                l.name as location_name,
                COUNT(lpd.id) as total_detections,
                COUNT(DISTINCT lpd.plate_number) as unique_plates,
                COUNT(DISTINCT DATE(lpd.detected_at)) as active_days,
                AVG(lpd.confidence) as avg_confidence,
                COUNT(CASE WHEN lpd.confidence >= 0.9 THEN 1 END) as high_confidence_count,
                COUNT(CASE WHEN lpd.confidence < 0.7 THEN 1 END) as low_confidence_count,
                COUNT(CASE WHEN lpd.is_verified = 1 THEN 1 END) as verified_count,
                MAX(lpd.detected_at) as last_detection,
                MIN(lpd.detected_at) as first_detection,
                ROUND(COUNT(lpd.id) / NULLIF(COUNT(DISTINCT DATE(lpd.detected_at)), 0), 2) as avg_detections_per_day,
                ROUND(COUNT(CASE WHEN lpd.confidence >= 0.9 THEN 1 END) * 100.0 / NULLIF(COUNT(lpd.id), 0), 2) as high_confidence_rate,
                ROUND(COUNT(CASE WHEN lpd.is_verified = 1 THEN 1 END) * 100.0 / NULLIF(COUNT(lpd.id), 0), 2) as verification_rate
            FROM cameras c
            JOIN locations l ON c.location_id = l.id
            LEFT JOIN license_plate_detections lpd ON c.id = lpd.camera_id 
                AND lpd.detected_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            WHERE c.is_active = 1
            GROUP BY c.id, c.name, c.code, l.name
            ORDER BY total_detections DESC
            LIMIT ? OFFSET ?
        `, [days, parseInt(limit), offset]);

        // Get total count for pagination
        const [countResult] = await connection.execute(
            'SELECT COUNT(*) as total FROM cameras WHERE is_active = 1'
        );

        const total = countResult[0].total;

        res.status(200).json({
            success: true,
            data: {
                period_days: parseInt(days),
                cameras: performanceMetrics,
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total: total,
                    total_pages: Math.ceil(total / limit),
                    has_next: page * limit < total,
                    has_prev: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Error getting camera performance report:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy báo cáo hiệu suất camera',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getCameraComparisonReport = async (req, res) => {
    const connection = await db.promise();

    try {
        const { camera_ids, days = 7 } = req.body;

        if (!camera_ids || !Array.isArray(camera_ids) || camera_ids.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Cần ít nhất 2 camera để so sánh'
            });
        }

        if (camera_ids.length > 10) {
            return res.status(400).json({
                success: false,
                message: 'Chỉ có thể so sánh tối đa 10 camera cùng lúc'
            });
        }

        const placeholders = camera_ids.map(() => '?').join(',');

        // Get comparison data
        const [comparisonData] = await connection.execute(`
            SELECT 
                c.id,
                c.name,
                c.code,
                l.name as location_name,
                c.status,
                TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) as minutes_since_heartbeat,
                COUNT(lpd.id) as total_detections,
                COUNT(DISTINCT lpd.plate_number) as unique_plates,
                COUNT(DISTINCT DATE(lpd.detected_at)) as active_days,
                AVG(lpd.confidence) as avg_confidence,
                COUNT(CASE WHEN lpd.confidence >= 0.9 THEN 1 END) as high_confidence_count,
                COUNT(CASE WHEN lpd.is_verified = 1 THEN 1 END) as verified_count,
                MAX(lpd.detected_at) as last_detection,
                ROUND(COUNT(lpd.id) / NULLIF(COUNT(DISTINCT DATE(lpd.detected_at)), 0), 2) as avg_detections_per_day
            FROM cameras c
            JOIN locations l ON c.location_id = l.id
            LEFT JOIN license_plate_detections lpd ON c.id = lpd.camera_id 
                AND lpd.detected_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            WHERE c.id IN (${placeholders}) AND c.is_active = 1
            GROUP BY c.id, c.name, c.code, l.name, c.status, c.last_heartbeat
            ORDER BY total_detections DESC
        `, [days, ...camera_ids]);

        // Get daily pattern comparison
        const [dailyComparison] = await connection.execute(`
            SELECT 
                lpd.camera_id,
                c.name as camera_name,
                DATE(lpd.detected_at) as date,
                COUNT(*) as detection_count,
                COUNT(DISTINCT lpd.plate_number) as unique_plates,
                AVG(lpd.confidence) as avg_confidence
            FROM license_plate_detections lpd
            JOIN cameras c ON lpd.camera_id = c.id
            WHERE lpd.camera_id IN (${placeholders}) 
            AND lpd.detected_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY lpd.camera_id, c.name, DATE(lpd.detected_at)
            ORDER BY camera_id, date
        `, [...camera_ids, days]);

        res.status(200).json({
            success: true,
            data: {
                period_days: parseInt(days),
                camera_count: camera_ids.length,
                comparison_data: comparisonData,
                daily_patterns: dailyComparison
            }
        });

    } catch (error) {
        console.error('Error getting camera comparison report:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy báo cáo so sánh camera',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    getCameraDetailedView,
    getCameraHealthReport,
    getCameraPerformanceReport,
    getCameraComparisonReport
};