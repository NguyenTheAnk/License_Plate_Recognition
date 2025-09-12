const db = require('../db');

// Lấy dữ liệu thống kê tổng hợp cho dashboard
const getDashboardStats = async (req, res) => {
  try {
    const connection = await db.promise();

    // 1. Thống kê camera
    const [cameraStats] = await connection.execute(`
      SELECT 
        COUNT(*) as total_cameras,
        COUNT(CASE WHEN status = 'online' THEN 1 END) as online_cameras,
        COUNT(CASE WHEN status = 'offline' THEN 1 END) as offline_cameras,
        COUNT(CASE WHEN status = 'maintenance' THEN 1 END) as maintenance_cameras
      FROM cameras 
      WHERE is_active = 1
    `);

    // 2. Thống kê phát hiện biển số (7 ngày gần nhất)
    const [detectionStats] = await connection.execute(`
      SELECT 
        COUNT(*) as total_detections_7d,
        COUNT(DISTINCT plate_number) as unique_plates_7d,
        AVG(confidence_score) as avg_confidence_7d,
        COUNT(CASE WHEN confidence_score >= 0.8 THEN 1 END) as high_confidence_detections,
        COUNT(CASE WHEN confidence_score >= 0.5 AND confidence_score < 0.8 THEN 1 END) as medium_confidence_detections,
        COUNT(CASE WHEN confidence_score < 0.5 THEN 1 END) as low_confidence_detections,
        COUNT(CASE WHEN is_whitelist_match = 1 THEN 1 END) as whitelist_matches,
        COUNT(CASE WHEN is_blacklist_match = 1 THEN 1 END) as blacklist_matches,
        MIN(confidence_score) as min_confidence,
        MAX(confidence_score) as max_confidence,
        STDDEV(confidence_score) as confidence_stddev
      FROM license_plate_detections 
      WHERE detected_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    `);

    // 2.1. Thống kê hiệu suất theo giờ (24 giờ gần nhất)
    const [hourlyPerformance] = await connection.execute(`
      SELECT 
        HOUR(detected_at) as hour,
        COUNT(*) as detections,
        AVG(confidence_score) as avg_confidence,
        COUNT(CASE WHEN confidence_score >= 0.8 THEN 1 END) as high_confidence,
        COUNT(CASE WHEN is_whitelist_match = 1 THEN 1 END) as whitelist_matches,
        COUNT(CASE WHEN is_blacklist_match = 1 THEN 1 END) as blacklist_matches
      FROM license_plate_detections 
      WHERE detected_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY HOUR(detected_at)
      ORDER BY hour
    `);

    // 2.2. Thống kê hiệu suất theo camera
    const [cameraPerformance] = await connection.execute(`
      SELECT 
        c.id,
        c.name,
        COUNT(lpd.id) as total_detections,
        AVG(lpd.confidence_score) as avg_confidence,
        COUNT(CASE WHEN lpd.confidence_score >= 0.8 THEN 1 END) as high_confidence_detections,
        COUNT(CASE WHEN lpd.is_whitelist_match = 1 THEN 1 END) as whitelist_matches,
        COUNT(CASE WHEN lpd.is_blacklist_match = 1 THEN 1 END) as blacklist_matches,
        (COUNT(CASE WHEN lpd.confidence_score >= 0.8 THEN 1 END) / COUNT(lpd.id)) * 100 as accuracy_rate
      FROM cameras c
      LEFT JOIN license_plate_detections lpd ON c.id = lpd.camera_id 
        AND lpd.detected_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      WHERE c.is_active = 1
      GROUP BY c.id, c.name
      ORDER BY total_detections DESC
    `);

    // 3. Thống kê phát hiện theo ngày (7 ngày gần nhất)
    const [dailyStats] = await connection.execute(`
      SELECT 
        DATE(detected_at) as date,
        COUNT(*) as detections,
        COUNT(DISTINCT plate_number) as unique_plates,
        AVG(confidence_score) as avg_confidence
      FROM license_plate_detections 
      WHERE detected_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(detected_at)
      ORDER BY date DESC
    `);

    // 4. Thống kê phát hiện theo giờ (24 giờ gần nhất)
    const [hourlyStats] = await connection.execute(`
      SELECT 
        HOUR(detected_at) as hour,
        COUNT(*) as detections,
        AVG(confidence_score) as avg_confidence,
        COUNT(CASE WHEN confidence_score >= 0.8 THEN 1 END) as high_confidence_detections,
        COUNT(CASE WHEN is_whitelist_match = 1 THEN 1 END) as whitelist_detections,
        COUNT(CASE WHEN is_blacklist_match = 1 THEN 1 END) as blacklist_detections
      FROM license_plate_detections 
      WHERE detected_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY HOUR(detected_at)
      ORDER BY hour
    `);

    // 5. Top camera có nhiều phát hiện nhất
    const [topCameras] = await connection.execute(`
      SELECT 
        c.id,
        c.name,
        c.location_id,
        l.name as location_name,
        COUNT(lpd.id) as detection_count,
        AVG(lpd.confidence_score) as avg_confidence
      FROM cameras c
      LEFT JOIN license_plate_detections lpd ON c.id = lpd.camera_id 
        AND lpd.detected_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      LEFT JOIN locations l ON c.location_id = l.id
      WHERE c.is_active = 1
      GROUP BY c.id, c.name, c.location_id, l.name
      ORDER BY detection_count DESC
      LIMIT 10
    `);

    // 6. Top biển số được phát hiện nhiều nhất
    const [topPlates] = await connection.execute(`
      SELECT 
        plate_number,
        COUNT(*) as detection_count,
        MAX(detected_at) as last_detection,
        AVG(confidence_score) as avg_confidence
      FROM license_plate_detections 
      WHERE detected_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY plate_number
      ORDER BY detection_count DESC
      LIMIT 10
    `);

    // 7. Phát hiện gần đây nhất
    const [recentDetections] = await connection.execute(`
      SELECT 
        lpd.*,
        c.name as camera_name,
        l.name as location_name
      FROM license_plate_detections lpd
      LEFT JOIN cameras c ON lpd.camera_id = c.id
      LEFT JOIN locations l ON lpd.location_id = l.id
      ORDER BY lpd.detected_at DESC
      LIMIT 10
    `);

    // 8. Thống kê theo vị trí
    const [locationStats] = await connection.execute(`
      SELECT 
        l.id,
        l.name as location_name,
        COUNT(DISTINCT c.id) as camera_count,
        COUNT(lpd.id) as detection_count,
        AVG(lpd.confidence_score) as avg_confidence
      FROM locations l
      LEFT JOIN cameras c ON l.id = c.location_id AND c.is_active = 1
      LEFT JOIN license_plate_detections lpd ON c.id = lpd.camera_id 
        AND lpd.detected_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      WHERE l.is_active = 1
      GROUP BY l.id, l.name
      ORDER BY detection_count DESC
    `);

    // 9. Thống kê lộ trình (nếu có bảng vehicle_journeys)
    let journeyStats = { total_journeys: 0, active_journeys: 0 };
    try {
      // Kiểm tra xem bảng có tồn tại không
      const [tableExists] = await connection.execute(`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'vehicle_journeys'
      `);
      
      if (tableExists[0].count > 0) {
        const [journeyData] = await connection.execute(`
          SELECT 
            COUNT(*) as total_journeys,
            COUNT(CASE WHEN status = 'active' THEN 1 END) as active_journeys
          FROM vehicle_journeys 
          WHERE journey_date >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        `);
        journeyStats = journeyData[0] || journeyStats;
      }
    } catch (error) {
      // Bảng không tồn tại, sử dụng giá trị mặc định
      journeyStats = { total_journeys: 0, active_journeys: 0 };
    }

    // 10. Thống kê access control (whitelist/blacklist)
    let accessStats = { whitelist_count: 0, blacklist_count: 0 };
    try {
      // Kiểm tra xem bảng có tồn tại không
      const [tableExists] = await connection.execute(`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'access_control_lists'
      `);
      
      if (tableExists[0].count > 0) {
        const [accessData] = await connection.execute(`
          SELECT 
            COUNT(CASE WHEN list_type = 'whitelist' THEN 1 END) as whitelist_count,
            COUNT(CASE WHEN list_type = 'blacklist' THEN 1 END) as blacklist_count
          FROM access_control_lists 
          WHERE is_active = 1
        `);
        accessStats = accessData[0] || accessStats;
      }
    } catch (error) {
      // Bảng không tồn tại, sử dụng giá trị mặc định
      accessStats = { whitelist_count: 0, blacklist_count: 0 };
    }

    // Xử lý dữ liệu để phù hợp với frontend
    const processedData = {
      summary: {
        total_cameras: cameraStats[0]?.total_cameras || 0,
        online_cameras: cameraStats[0]?.online_cameras || 0,
        offline_cameras: cameraStats[0]?.offline_cameras || 0,
        total_detections: detectionStats[0]?.total_detections_7d || 0,
        unique_plates: detectionStats[0]?.unique_plates_7d || 0,
        total_journeys: journeyStats.total_journeys,
        active_journeys: journeyStats.active_journeys
      },
      performance: {
        total_detections: detectionStats[0]?.total_detections_7d || 0,
        avg_confidence: detectionStats[0]?.avg_confidence_7d || 0,
        high_confidence: detectionStats[0]?.high_confidence_detections || 0,
        medium_confidence: detectionStats[0]?.medium_confidence_detections || 0,
        low_confidence: detectionStats[0]?.low_confidence_detections || 0,
        accuracy_rate: detectionStats[0]?.total_detections_7d > 0 
          ? ((detectionStats[0]?.high_confidence_detections || 0) / detectionStats[0]?.total_detections_7d * 100).toFixed(1)
          : 0,
        whitelist_matches: detectionStats[0]?.whitelist_matches || 0,
        blacklist_matches: detectionStats[0]?.blacklist_matches || 0,
        min_confidence: detectionStats[0]?.min_confidence || 0,
        max_confidence: detectionStats[0]?.max_confidence || 0,
        confidence_stddev: detectionStats[0]?.confidence_stddev || 0,
        unique_plates: detectionStats[0]?.unique_plates_7d || 0
      },
      hourly_performance: Array.from({ length: 24 }, (_, i) => {
        const hourData = hourlyPerformance.find(h => h.hour === i);
        return {
          hour: i,
          detections: hourData?.detections || 0,
          avg_confidence: parseFloat(hourData?.avg_confidence || 0),
          high_confidence: hourData?.high_confidence || 0,
          whitelist_matches: hourData?.whitelist_matches || 0,
          blacklist_matches: hourData?.blacklist_matches || 0
        };
      }),
      camera_performance: cameraPerformance.map(camera => ({
        id: camera.id,
        name: camera.name,
        total_detections: camera.total_detections || 0,
        avg_confidence: parseFloat(camera.avg_confidence || 0).toFixed(3),
        high_confidence_detections: camera.high_confidence_detections || 0,
        whitelist_matches: camera.whitelist_matches || 0,
        blacklist_matches: camera.blacklist_matches || 0,
        accuracy_rate: parseFloat(camera.accuracy_rate || 0).toFixed(2)
      })),
      daily_stats: dailyStats.map(stat => ({
        date: stat.date,
        detections: stat.detections,
        unique_plates: stat.unique_plates,
        avg_confidence: parseFloat(stat.avg_confidence || 0).toFixed(2)
      })),
      hourly_stats: Array.from({ length: 24 }, (_, i) => {
        const hourData = hourlyStats.find(h => h.hour === i);
        return {
          hour: `${i}h`,
          detections: hourData?.detections || 0,
          avg_confidence: parseFloat(hourData?.avg_confidence || 0).toFixed(2),
          high_confidence: hourData?.high_confidence_detections || 0,
          whitelist: hourData?.whitelist_detections || 0,
          blacklist: hourData?.blacklist_detections || 0
        };
      }),
      top_cameras: topCameras.map(camera => ({
        id: camera.id,
        name: camera.name,
        location_name: camera.location_name,
        detections: camera.detection_count || 0,
        avg_confidence: parseFloat(camera.avg_confidence || 0).toFixed(2)
      })),
      top_plates: topPlates.map(plate => ({
        plate: plate.plate_number,
        count: plate.detection_count,
        last_detection: plate.last_detection,
        avg_confidence: parseFloat(plate.avg_confidence || 0).toFixed(2)
      })),
      recent_detections: recentDetections.map(detection => ({
        id: detection.id,
        plate_number: detection.plate_number,
        detected_at: detection.detected_at,
        confidence_score: parseFloat(detection.confidence_score || 0).toFixed(2),
        camera_name: detection.camera_name || 'Unknown',
        location_name: detection.location_name || 'Unknown'
      })),
      location_stats: locationStats.map(location => ({
        id: location.id,
        name: location.location_name,
        camera_count: location.camera_count,
        detection_count: location.detection_count || 0,
        avg_confidence: parseFloat(location.avg_confidence || 0).toFixed(2)
      })),
      time_series_data: hourlyStats.map(stat => ({
        time: stat.hour,
        detections: stat.detections,
        highConfidence: stat.high_confidence_detections,
        whitelist: stat.whitelist_detections,
        blacklist: stat.blacklist_detections
      })),
      access_control: accessStats
    };

    res.status(200).json({
      success: true,
      data: processedData
    });

  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy thống kê dashboard',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Tạo dữ liệu mẫu cho testing
const createSampleData = async (req, res) => {
  try {
    const connection = await db.promise();
    
    // Tạo một số dữ liệu mẫu cho license_plate_detections
    const sampleDetections = [];
    const now = new Date();
    
    // Tạo dữ liệu cho 24 giờ gần nhất
    for (let i = 0; i < 24; i++) {
      const hour = new Date(now);
      hour.setHours(hour.getHours() - i);
      
      // Tạo 5-15 phát hiện cho mỗi giờ
      const detectionCount = Math.floor(Math.random() * 11) + 5;
      
      for (let j = 0; j < detectionCount; j++) {
        const detectionTime = new Date(hour);
        detectionTime.setMinutes(Math.floor(Math.random() * 60));
        
        sampleDetections.push({
          plate_number: `30A-${Math.floor(Math.random() * 90000) + 10000}`,
          camera_id: Math.floor(Math.random() * 3) + 1,
          location_id: Math.floor(Math.random() * 3) + 1,
          confidence_score: Math.random() * 0.5 + 0.5, // 0.5 - 1.0
          detected_at: detectionTime.toISOString().slice(0, 19).replace('T', ' '),
          is_whitelist_match: Math.random() > 0.8 ? 1 : 0,
          is_blacklist_match: Math.random() > 0.95 ? 1 : 0
        });
      }
    }
    
    // Xóa dữ liệu cũ trước khi thêm mới
    await connection.execute('DELETE FROM license_plate_detections WHERE detected_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)');
    
    // Thêm dữ liệu mẫu
    for (const detection of sampleDetections) {
      await connection.execute(`
        INSERT INTO license_plate_detections 
        (plate_number, camera_id, location_id, confidence_score, detected_at, is_whitelist_match, is_blacklist_match, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
      `, [
        detection.plate_number,
        detection.camera_id,
        detection.location_id,
        detection.confidence_score,
        detection.detected_at,
        detection.is_whitelist_match,
        detection.is_blacklist_match
      ]);
    }
    
    res.status(200).json({
      success: true,
      message: `Đã tạo ${sampleDetections.length} phát hiện mẫu`,
      data: {
        total_detections: sampleDetections.length,
        time_range: '24 giờ gần nhất'
      }
    });
    
  } catch (error) {
    console.error('Error creating sample data:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi tạo dữ liệu mẫu',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  getDashboardStats,
  createSampleData
};
