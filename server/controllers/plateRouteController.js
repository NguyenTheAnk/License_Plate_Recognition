const db = require('../db');

// Tìm kiếm biển số xe và trả về thông tin hành trình
const searchPlateRoute = async (req, res) => {
    try {
        const { plate_number } = req.query;

        if (!plate_number) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng nhập biển số xe'
            });
        }

        // Truy vấn tất cả detections của biển số xe
        const query = `
      SELECT 
        lpd.*,
        c.name as camera_name,
        l.Ox as map_x,
        l.Oy as map_y,
        l.name as location_name
      FROM license_plate_detections lpd
      LEFT JOIN cameras c ON lpd.camera_id = c.id
      LEFT JOIN locations l ON lpd.location_id = l.id
      WHERE lpd.plate_number = ?
      ORDER BY lpd.detected_at ASC
    `;

        const [rows] = await db.promise().execute(query, [plate_number]);

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

        // Chuyển đổi thành mảng và sắp xếp theo thời gian phát hiện đầu tiên
        const routeData = Object.values(groupedDetections).sort((a, b) => {
            const aFirstDetection = a.detections[0].detected_at;
            const bFirstDetection = b.detections[0].detected_at;
            return new Date(aFirstDetection) - new Date(bFirstDetection);
        });

        res.json({
            success: true,
            message: 'Tìm thấy dữ liệu hành trình',
            data: rows, // Trả về tất cả detections để vẽ đường đi
            routeData: routeData // Dữ liệu đã nhóm theo camera
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
