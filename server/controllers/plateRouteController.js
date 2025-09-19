const db = require('../db');


// Tìm kiếm biển số xe và trả về thông tin hành trình
const searchPlateRoute = async (req, res) => {
    try {
        const { plate_number, start_date, end_date } = req.query;

        if (!plate_number) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng nhập biển số xe'
            });
        }

        // Xử lý start_date và end_date
        let startDate = null;
        let endDate = null;

        if (start_date) {
            startDate = new Date(start_date);
            // Đặt thời gian về đầu ngày (00:00:00)
            startDate.setHours(0, 0, 0, 0);
        }

        if (end_date) {
            endDate = new Date(end_date);
            // Đặt thời gian về cuối ngày (23:59:59)
            endDate.setHours(23, 59, 59, 999);
        }

        // Xây dựng truy vấn với điều kiện thời gian
        let query = `
      SELECT 
        lpd.*,
        c.name as camera_name,
        l.Ox as map_x,
        l.Oy as map_y,
        l.name as location_name
      FROM license_plate_detections lpd
      LEFT JOIN cameras c ON lpd.camera_id = c.id
      LEFT JOIN locations l ON lpd.location_id = l.id
      WHERE (lpd.plate_number = ? OR lpd.raw_plate_text = ?)
    `;

        let queryParams = [plate_number, plate_number];

        // Thêm điều kiện thời gian nếu có
        if (startDate) {
            query += ` AND lpd.detected_at >= ?`;
            queryParams.push(startDate);
        }

        if (endDate) {
            query += ` AND lpd.detected_at <= ?`;
            queryParams.push(endDate);
        }

        query += ` ORDER BY lpd.detected_at ASC`;

        const [rows] = await db.promise().execute(query, queryParams);

        if (rows.length === 0) {
            return res.json({
                success: true,
                message: 'Không tìm thấy dữ liệu cho biển số xe này',
                data: []
            });
        }

        // Nhóm theo camera_id và sắp xếp theo thời gian
        const groupedDetections = {};
        rows.forEach(detection => {
            const cameraId = detection.camera_id;
            if (!groupedDetections[cameraId]) {
                groupedDetections[cameraId] = {
                    camera_id: cameraId,
                    camera_name: detection.camera_name,
                    map_x: detection.map_x,
                    map_y: detection.map_y,
                    location_name: detection.location_name,
                    detections: []
                };
            }
            groupedDetections[cameraId].detections.push(detection);
        });

        // Sắp xếp detections trong mỗi camera theo thời gian
        Object.values(groupedDetections).forEach(group => {
            group.detections.sort((a, b) => new Date(a.detected_at) - new Date(b.detected_at));
        });

        // Chuyển đổi thành mảng và sắp xếp theo thời gian phát hiện đầu tiên
        const routeData = Object.values(groupedDetections).sort((a, b) => {
            const aFirstDetection = a.detections[0].detected_at;
            const bFirstDetection = b.detections[0].detected_at;
            return new Date(aFirstDetection) - new Date(bFirstDetection);
        });

        // Tạo danh sách camera theo thứ tự thời gian (chỉ lấy camera đầu tiên của mỗi camera)
        const orderedCameras = routeData.map(group => ({
            camera_id: group.camera_id,
            camera_name: group.camera_name,
            map_x: group.map_x,
            map_y: group.map_y,
            location_name: group.location_name,
            first_detected_at: group.detections[0].detected_at,
            detection_count: group.detections.length,
            detections: group.detections
        }));

        // Thông tin về khoảng thời gian
        let dateRangeInfo = ' (tất cả thời gian)';
        if (startDate && endDate) {
            dateRangeInfo = ` (từ ${startDate.toLocaleDateString('vi-VN')} đến ${endDate.toLocaleDateString('vi-VN')})`;
        } else if (startDate) {
            dateRangeInfo = ` (từ ${startDate.toLocaleDateString('vi-VN')})`;
        } else if (endDate) {
            dateRangeInfo = ` (đến ${endDate.toLocaleDateString('vi-VN')})`;
        }

        console.log(`🔍 Found ${rows.length} total detections for plate ${plate_number}${dateRangeInfo}`);
        console.log(`📹 Detected on ${routeData.length} different cameras`);
        console.log(`🕒 Time range: ${rows[0]?.detected_at} to ${rows[rows.length - 1]?.detected_at}`);
        console.log(`📍 Cameras: ${orderedCameras.map(c => `${c.camera_name}(${c.camera_id})`).join(' -> ')}`);

        res.json({
            success: true,
            message: `Tìm thấy ${rows.length} phát hiện trên ${routeData.length} camera${dateRangeInfo}`,
            data: rows, // Trả về tất cả detections để vẽ đường đi
            routeData: routeData, // Dữ liệu đã nhóm theo camera
            orderedCameras: orderedCameras, // Danh sách camera theo thứ tự thời gian
            totalDetections: rows.length,
            totalCameras: routeData.length,
            timeRange: {
                start: rows[0]?.detected_at,
                end: rows[rows.length - 1]?.detected_at
            },
            filterInfo: {
                startDate: startDate,
                endDate: endDate,
                dateRangeLabel: dateRangeInfo.replace(/[()]/g, '').trim(),
                hasDateFilter: !!(startDate || endDate)
            }
        });

    } catch (error) {
        console.error('Lỗi khi tìm kiếm hành trình biển số xe:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi tìm kiếm hành trình'
        });
    }
};

// Lấy thống kê hành trình của biển số xe
const getPlateRouteStats = async (req, res) => {
    try {
        const { plate_number } = req.query;

        if (!plate_number) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng nhập biển số xe'
            });
        }

        // Thống kê tổng quan
        const statsQuery = `
      SELECT 
        COUNT(*) as total_detections,
        COUNT(DISTINCT camera_id) as cameras_visited,
        COUNT(DISTINCT location_id) as locations_visited,
        MIN(detected_at) as first_detection,
        MAX(detected_at) as last_detection,
        AVG(confidence_score) as avg_confidence
      FROM license_plate_detections 
      WHERE plate_number = ?
    `;

        const [statsRows] = await db.promise().execute(statsQuery, [plate_number]);

        // Thống kê theo camera
        const cameraStatsQuery = `
      SELECT 
        c.name as camera_name,
        l.name as location_name,
        COUNT(*) as detection_count,
        MIN(lpd.detected_at) as first_seen,
        MAX(lpd.detected_at) as last_seen,
        AVG(lpd.confidence_score) as avg_confidence
      FROM license_plate_detections lpd
      LEFT JOIN cameras c ON lpd.camera_id = c.id
      LEFT JOIN locations l ON lpd.location_id = l.id
      WHERE lpd.plate_number = ?
      GROUP BY lpd.camera_id, c.name, l.name
      ORDER BY MIN(lpd.detected_at) ASC
    `;

        const [cameraStatsRows] = await db.promise().execute(cameraStatsQuery, [plate_number]);

        res.json({
            success: true,
            data: {
                overview: statsRows[0],
                cameraStats: cameraStatsRows
            }
        });

    } catch (error) {
        console.error('Lỗi khi lấy thống kê hành trình:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi lấy thống kê hành trình'
        });
    }
};

module.exports = {
    searchPlateRoute,
    getPlateRouteStats
};
