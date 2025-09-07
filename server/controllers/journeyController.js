const db = require('../db');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Lấy danh sách lộ trình xe
async function getJourneys(req, res) {
  try {
    let query = `
      SELECT vj.*, v.make, v.model, v.color
      FROM vehicle_journeys vj
      LEFT JOIN vehicles v ON vj.plate_number = v.plate_number
      WHERE 1=1
    `;
    const params = [];
    if (req.query.plate_number) {
      query += ' AND vj.plate_number = ?';
      params.push(req.query.plate_number);
    }
    if (req.query.journey_date) {
      query += ' AND vj.journey_date = ?';
      params.push(req.query.journey_date);
    }
    query += ' ORDER BY vj.journey_date DESC, vj.started_at DESC';
    if (req.query.limit) {
      query += ' LIMIT ?';
      params.push(parseInt(req.query.limit));
    }
    const [rows] = await db.promise().query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('getJourneys error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// Search journeys with advanced filters
async function searchJourneys(req, res) {
  try {
    const {
      plate_number,
      journey_date,
      start_date,
      end_date,
      make,
      model,
      color,
      page = 1,
      limit = 10
    } = req.query;

    let query = `
      SELECT vj.*, v.make, v.model, v.color
      FROM vehicle_journeys vj
      LEFT JOIN vehicles v ON vj.plate_number = v.plate_number
      WHERE 1=1
    `;
    const params = [];

    // Search filters
    if (plate_number) {
      query += ' AND vj.plate_number LIKE ?';
      params.push(`%${plate_number}%`);
    }
    if (journey_date) {
      query += ' AND vj.journey_date = ?';
      params.push(journey_date);
    }
    if (start_date) {
      query += ' AND vj.journey_date >= ?';
      params.push(start_date);
    }
    if (end_date) {
      query += ' AND vj.journey_date <= ?';
      params.push(end_date);
    }
    if (make) {
      query += ' AND v.make LIKE ?';
      params.push(`%${make}%`);
    }
    if (model) {
      query += ' AND v.model LIKE ?';
      params.push(`%${model}%`);
    }
    if (color) {
      query += ' AND v.color LIKE ?';
      params.push(`%${color}%`);
    }

    // Count total records
    const countQuery = query.replace('SELECT vj.*, v.make, v.model, v.color', 'SELECT COUNT(*) as total');
    const [countResult] = await db.promise().query(countQuery, params);
    const totalCount = countResult[0].total;

    // Add pagination
    query += ' ORDER BY vj.journey_date DESC, vj.started_at DESC';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [rows] = await db.promise().query(query, params);

    res.json({
      success: true,
      data: rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalCount: totalCount,
        hasNextPage: parseInt(page) < Math.ceil(totalCount / parseInt(limit)),
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('searchJourneys error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Server error',
      message: error.message 
    });
  }
}

// Lấy chi tiết lộ trình
async function getJourneyDetail(req, res) {
  try {
    let query = `
      SELECT vj.*, v.make, v.model, v.color, jp.id as point_id, jp.detection_id, jp.sequence_number, jp.point_time, jp.latitude, jp.longitude
      FROM vehicle_journeys vj
      LEFT JOIN vehicles v ON vj.plate_number = v.plate_number
      LEFT JOIN journey_points jp ON vj.id = jp.journey_id
      WHERE 1=1
    `;
    const params = [];
    if (req.params.id) {
      query += ' AND vj.id = ?';
      params.push(req.params.id);
    } else if (req.query.plate_number && req.query.journey_date) {
      query += ' AND vj.plate_number = ? AND vj.journey_date = ?';
      params.push(req.query.plate_number, req.query.journey_date);
    } else {
      return res.status(400).json({ error: 'Missing id or (plate_number & journey_date)' });
    }
    query += ' ORDER BY jp.sequence_number ASC';
    const [rows] = await db.promise().query(query, params);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows);
  } catch (error) {
    console.error('getJourneyDetail error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// Nhận diện biển số xe từ video/camera cho giám sát lộ trình
async function detectPlatesFromStream(req, res) {
  try {
    const { streamType, streamUrl, cameraId, videoId } = req.body;
    
    if (!streamType || !streamUrl) {
      return res.status(400).json({ 
        success: false, 
        message: 'Thiếu thông tin stream (streamType hoặc streamUrl)' 
      });
    }

    console.log(`Starting plate detection for ${streamType}: ${streamUrl}`);

    // Tạo WebSocket connection để giao tiếp với Python detector
    const WebSocket = require('ws');
    const ws = new WebSocket('ws://localhost:5002/plate-recognition');

    const detectionResults = [];
    let isProcessing = true;

    ws.on('open', () => {
      console.log('Connected to Python detector');
      
      // Gửi yêu cầu bắt đầu nhận diện
      const message = {
        action: 'start_recognition',
        streamId: `${streamType}_${Date.now()}`,
        streamType: streamType,
        rtspUrl: streamType === 'camera' ? streamUrl : null,
        videoUrl: streamType === 'video' || streamType === 'uploaded_video' ? streamUrl : null
      };
      
      ws.send(JSON.stringify(message));
    });

    ws.on('message', (data) => {
      try {
        const result = JSON.parse(data);
        
        if (result.type === 'plate_detected') {
          console.log('Plate detected:', result);
          
          // Lưu kết quả nhận diện
          detectionResults.push({
            plate_number: result.plate_text,
            confidence: result.confidence,
            bbox: result.bbox,
            timestamp: new Date().toISOString(),
            frame_index: result.frame_index,
            stream_type: streamType,
            camera_id: cameraId,
            video_id: videoId
          });

          // Lưu vào database nếu có thông tin camera
          if (cameraId) {
            saveDetectionToDatabase(result, cameraId);
          }
        } else if (result.type === 'recognition_status' && result.status === 'stopped') {
          console.log('Recognition completed');
          isProcessing = false;
          ws.close();
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Lỗi kết nối với detector' 
      });
    });

    ws.on('close', () => {
      console.log('WebSocket connection closed');
      
      // Trả về kết quả sau khi hoàn thành
      res.json({
        success: true,
        message: 'Nhận diện biển số hoàn thành',
        data: {
          total_detections: detectionResults.length,
          detections: detectionResults,
          stream_type: streamType,
          stream_url: streamUrl
        }
      });
    });

  } catch (error) {
    console.error('detectPlatesFromStream error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi khi nhận diện biển số xe' 
    });
  }
}

// Kiểm tra trùng lặp detection trong khoảng thời gian
async function checkDuplicateDetection(plate_number, camera_id, location_id, time_window_seconds = 30) {
  try {
    const connection = await db.promise();
    const query = `
      SELECT id, detected_at, confidence_score, cropped_plate_image_path
      FROM license_plate_detections 
      WHERE plate_number = ? 
      AND camera_id = ? 
      AND location_id = ? 
      AND detected_at >= DATE_SUB(NOW(), INTERVAL ? SECOND)
      ORDER BY detected_at DESC 
      LIMIT 1
    `;
    
    const [rows] = await connection.execute(query, [plate_number, camera_id, location_id, time_window_seconds]);
    
    if (rows.length > 0) {
      const { id, detected_at, confidence_score, cropped_plate_image_path } = rows[0];
      console.log(`🔄 Duplicate detection found for ${plate_number} at ${detected_at} (confidence: ${confidence_score})`);
      return { isDuplicate: true, id, detected_at, confidence_score, image_path: cropped_plate_image_path };
    }
    
    return { isDuplicate: false };
  } catch (error) {
    console.error('Error checking duplicate detection:', error);
    return { isDuplicate: false }; // Lỗi thì cho phép lưu để an toàn
  }
}

// Lưu kết quả nhận diện vào database
async function saveDetectionToDatabase(detection, cameraId) {
  try {
    const connection = await db.promise();
    
    // Lấy thông tin camera
    const [cameras] = await connection.execute(
      'SELECT location_id FROM cameras WHERE id = ?',
      [cameraId]
    );

    if (cameras.length > 0) {
      const locationId = cameras[0].location_id;
      const plateNumber = detection.plate_text;
      
      // Kiểm tra trùng lặp trước khi lưu
      const duplicateCheck = await checkDuplicateDetection(plateNumber, cameraId, locationId, 30);
      
      if (duplicateCheck.isDuplicate) {
        const current_confidence = detection.confidence || 0.5;
        const existing_confidence = duplicateCheck.confidence_score || 0;
        
        // Nếu confidence hiện tại cao hơn ít nhất 0.1, cập nhật record cũ
        if (current_confidence > existing_confidence + 0.1) {
          console.log(`🔄 Updating existing detection ${duplicateCheck.id} with better confidence: ${current_confidence} > ${existing_confidence}`);
          await connection.execute(`
            UPDATE license_plate_detections SET
              confidence_score = ?,
              bbox_data = ?,
              detected_at = NOW()
            WHERE id = ?
          `, [current_confidence, JSON.stringify(detection.bbox), duplicateCheck.id]);
          console.log(`Updated detection: ${plateNumber} from camera ${cameraId}`);
        } else {
          console.log(`⏭️ Skipping duplicate detection for ${plateNumber} (confidence: ${current_confidence} <= ${existing_confidence})`);
        }
      } else {
        // Lưu detection mới
        await connection.execute(`
          INSERT INTO license_plate_detections 
          (plate_number, camera_id, location_id, detected_at, confidence_score, bbox_data, is_verified, created_at)
          VALUES (?, ?, ?, NOW(), ?, ?, 0, NOW())
        `, [
          plateNumber,
          cameraId,
          locationId,
          detection.confidence,
          JSON.stringify(detection.bbox)
        ]);
        console.log(`Saved detection: ${plateNumber} from camera ${cameraId}`);
      }
    }
  } catch (error) {
    console.error('Error saving detection to database:', error);
  }
}

// Lấy danh sách nhận diện biển số theo lộ trình
async function getJourneyDetections(req, res) {
  try {
    const { journey_id, plate_number, start_date, end_date, camera_id } = req.query;
    
    let query = `
      SELECT 
        lpd.*,
        c.name as camera_name,
        l.name as location_name,
        v.make, v.model, v.color
      FROM license_plate_detections lpd
      LEFT JOIN cameras c ON lpd.camera_id = c.id
      LEFT JOIN locations l ON lpd.location_id = l.id
      LEFT JOIN vehicles v ON lpd.plate_number = v.plate_number
      WHERE 1=1
    `;
    
    const params = [];
    
    if (journey_id) {
      query += ' AND lpd.journey_id = ?';
      params.push(journey_id);
    }
    
    if (plate_number) {
      query += ' AND lpd.plate_number LIKE ?';
      params.push(`%${plate_number}%`);
    }
    
    if (start_date) {
      query += ' AND DATE(lpd.detected_at) >= ?';
      params.push(start_date);
    }
    
    if (end_date) {
      query += ' AND DATE(lpd.detected_at) <= ?';
      params.push(end_date);
    }
    
    if (camera_id) {
      query += ' AND lpd.camera_id = ?';
      params.push(camera_id);
    }
    
    query += ' ORDER BY lpd.detected_at DESC';
    
    const [rows] = await db.promise().query(query, params);
    
    res.json({
      success: true,
      data: rows,
      total: rows.length
    });
    
  } catch (error) {
    console.error('getJourneyDetections error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi khi lấy danh sách nhận diện' 
    });
  }
}

// Tạo lộ trình mới từ các phát hiện biển số
async function createJourneyFromDetections(req, res) {
  try {
    const { plate_number, start_date, end_date, camera_ids } = req.body;
    
    if (!plate_number || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin bắt buộc (plate_number, start_date, end_date)'
      });
    }

    const connection = await db.promise();
    
    // Lấy tất cả phát hiện của biển số trong khoảng thời gian
    let query = `
      SELECT 
        lpd.*,
        c.name as camera_name,
        l.name as location_name,
        l.latitude, l.longitude
      FROM license_plate_detections lpd
      LEFT JOIN cameras c ON lpd.camera_id = c.id
      LEFT JOIN locations l ON lpd.location_id = l.id
      WHERE lpd.plate_number = ?
      AND DATE(lpd.detected_at) BETWEEN ? AND ?
    `;
    
    const params = [plate_number, start_date, end_date];
    
    if (camera_ids && camera_ids.length > 0) {
      const placeholders = camera_ids.map(() => '?').join(',');
      query += ` AND lpd.camera_id IN (${placeholders})`;
      params.push(...camera_ids);
    }
    
    query += ' ORDER BY lpd.detected_at ASC';
    
    const [detections] = await connection.execute(query, params);
    
    if (detections.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy phát hiện nào cho biển số này'
      });
    }

    // Tạo lộ trình mới
    const journeyUuid = require('crypto').randomUUID();
    const [journeyResult] = await connection.execute(`
      INSERT INTO vehicle_journeys 
      (journey_uuid, plate_number, journey_date, started_at, ended_at, detection_count, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', NOW())
    `, [
      journeyUuid,
      plate_number,
      start_date,
      detections[0].detected_at,
      detections[detections.length - 1].detected_at,
      detections.length
    ]);

    const journeyId = journeyResult.insertId;

    // Tạo các checkpoint cho lộ trình
    for (let i = 0; i < detections.length; i++) {
      const detection = detections[i];
      await connection.execute(`
        INSERT INTO journey_checkpoints 
        (journey_id, detection_id, sequence_number, checkpoint_time, location_id, camera_id, confidence_score, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
      `, [
        journeyId,
        detection.id,
        i + 1,
        detection.detected_at,
        detection.location_id,
        detection.camera_id,
        detection.confidence_score
      ]);
    }

    res.json({
      success: true,
      message: 'Tạo lộ trình thành công',
      data: {
        journey_id: journeyId,
        journey_uuid: journeyUuid,
        plate_number: plate_number,
        total_checkpoints: detections.length,
        start_time: detections[0].detected_at,
        end_time: detections[detections.length - 1].detected_at
      }
    });

  } catch (error) {
    console.error('createJourneyFromDetections error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi tạo lộ trình'
    });
  }
}

module.exports = {
  getJourneys,
  searchJourneys,
  getJourneyDetail,
  detectPlatesFromStream,
  getJourneyDetections,
  createJourneyFromDetections
}; 