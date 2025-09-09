const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Configure multer for video uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../public/uploads/videos');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'video-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /mp4|avi|mov|mkv|wmv|flv|webm/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Chỉ cho phép upload file video'));
    }
  }
});

// Upload video and start plate recognition
const uploadVideoForRecognition = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Không có file video được tải lên'
      });
    }

    const videoPath = req.file.path;
    const videoFilename = req.file.filename;
    const originalName = req.file.originalname;
    const fileSize = req.file.size;

    console.log('Video uploaded:', {
      filename: videoFilename,
      originalName: originalName,
      path: videoPath,
      size: fileSize
    });

    // Start plate recognition process
    const recognitionResult = await startPlateRecognition(videoPath, videoFilename);

    res.status(200).json({
      success: true,
      message: 'Video đã được tải lên và bắt đầu nhận diện biển số',
      data: {
        video_id: recognitionResult.videoId,
        filename: videoFilename,
        original_name: originalName,
        file_size: fileSize,
        recognition_status: 'processing',
        detected_plates: recognitionResult.detectedPlates || []
      }
    });

  } catch (error) {
    console.error('Error uploading video:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi tải lên video',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Start plate recognition process using Python script
const startPlateRecognition = async (videoPath, videoFilename) => {
  return new Promise((resolve, reject) => {
    const videoId = Date.now().toString();
    const detectedPlates = [];

    // Call Python script for plate recognition
    const pythonProcess = spawn('python', [
      path.join(__dirname, '../../plate_recognition/detector.py'),
      '--video', videoPath,
      '--output', path.join(__dirname, '../public/uploads/results'),
      '--video-id', videoId
    ]);

    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('Python output:', output);
      
      // Parse detection results from Python output
      try {
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.includes('DETECTED_PLATE:')) {
            const plateData = JSON.parse(line.replace('DETECTED_PLATE:', ''));
            detectedPlates.push(plateData);
            
            // Save to database
            savePlateDetection(plateData, videoId, videoFilename);
          }
        }
      } catch (parseError) {
        console.error('Error parsing Python output:', parseError);
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error('Python error:', data.toString());
    });

    pythonProcess.on('close', (code) => {
      console.log(`Python process exited with code ${code}`);
      resolve({
        videoId,
        detectedPlates,
        status: code === 0 ? 'completed' : 'error'
      });
    });

    pythonProcess.on('error', (error) => {
      console.error('Failed to start Python process:', error);
      reject(error);
    });
  });
};

// Save plate detection to database
const savePlateDetection = async (plateData, videoId, videoFilename) => {
  try {
    const {
      plate_number,
      confidence,
      bbox,
      timestamp,
      frame_path,
      vehicle_type = 'unknown'
    } = plateData;

    const query = `
      INSERT INTO license_plate_detections (
        detection_uuid, plate_number, raw_plate_text, camera_id, location_id,
        detected_at, confidence_score, ocr_confidence, detection_confidence,
        original_image_path, cropped_plate_image_path, detected_vehicle_type,
        bbox_x1, bbox_y1, bbox_x2, bbox_y2, source_type, video_filename,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    const [x1, y1, x2, y2] = bbox || [0, 0, 0, 0];
    const detectionUuid = `video_${videoId}_${Date.now()}`;

    await new Promise((resolve, reject) => {
      db.query(query, [
        detectionUuid,
        plate_number,
        plate_number,
        null, // camera_id
        null, // location_id
        new Date(timestamp * 1000),
        confidence,
        confidence,
        confidence,
        frame_path,
        frame_path,
        vehicle_type,
        x1, y1, x2, y2,
        'video_upload',
        videoFilename
      ], (error, results) => {
        if (error) {
          console.error('Database save error:', error);
          reject(error);
        } else {
          console.log('Plate detection saved to database:', results.insertId);
          resolve(results);
        }
      });
    });

  } catch (error) {
    console.error('Error saving plate detection:', error);
  }
};

// Get recognition results for a video
const getVideoRecognitionResults = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const offset = (page - 1) * limit;

    const query = `
      SELECT 
        id, detection_uuid, plate_number, raw_plate_text,
        detected_at, confidence_score, detected_vehicle_type,
        bbox_x1, bbox_y1, bbox_x2, bbox_y2,
        cropped_plate_image_path, video_filename, created_at
      FROM license_plate_detections 
      WHERE video_filename LIKE ? AND source_type = 'video_upload'
      ORDER BY detected_at DESC
      LIMIT ? OFFSET ?
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM license_plate_detections 
      WHERE video_filename LIKE ? AND source_type = 'video_upload'
    `;

    const [detections, countResult] = await Promise.all([
      new Promise((resolve, reject) => {
        db.query(query, [`%${videoId}%`, parseInt(limit), offset], (error, results) => {
          if (error) reject(error);
          else resolve(results || []);
        });
      }),
      new Promise((resolve, reject) => {
        db.query(countQuery, [`%${videoId}%`], (error, results) => {
          if (error) reject(error);
          else resolve(results[0]?.total || 0);
        });
      })
    ]);

    res.status(200).json({
      success: true,
      message: 'Lấy kết quả nhận diện video thành công',
      data: detections,
      pagination: {
        current_page: parseInt(page),
        per_page: parseInt(limit),
        total: countResult,
        total_pages: Math.ceil(countResult / limit)
      }
    });

  } catch (error) {
    console.error('Error getting video recognition results:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy kết quả nhận diện video',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get all detected plates with pagination
const getDetectedPlates = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const query = `
      SELECT 
        id, detection_uuid, plate_number, raw_plate_text,
        detected_at, confidence_score, detected_vehicle_type,
        bbox_x1, bbox_y1, bbox_x2, bbox_y2,
        cropped_plate_image_path, video_filename, source_type, created_at
      FROM license_plate_detections 
      ORDER BY detected_at DESC
      LIMIT ? OFFSET ?
    `;

    const countQuery = `SELECT COUNT(*) as total FROM license_plate_detections`;

    const [detections, countResult] = await Promise.all([
      new Promise((resolve, reject) => {
        db.query(query, [parseInt(limit), offset], (error, results) => {
          if (error) reject(error);
          else resolve(results || []);
        });
      }),
      new Promise((resolve, reject) => {
        db.query(countQuery, [], (error, results) => {
          if (error) reject(error);
          else resolve(results[0]?.total || 0);
        });
      })
    ]);

    res.status(200).json({
      success: true,
      message: 'Lấy danh sách biển số được phát hiện thành công',
      data: detections,
      pagination: {
        current_page: parseInt(page),
        per_page: parseInt(limit),
        total: countResult,
        total_pages: Math.ceil(countResult / limit)
      }
    });

  } catch (error) {
    console.error('Error getting detected plates:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy danh sách biển số được phát hiện',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Clear all detected plates
const clearDetectedPlates = async (req, res) => {
  try {
    const query = 'DELETE FROM license_plate_detections';
    
    await new Promise((resolve, reject) => {
      db.query(query, [], (error, results) => {
        if (error) reject(error);
        else resolve(results);
      });
    });

    res.status(200).json({
      success: true,
      message: 'Đã xóa tất cả biển số được phát hiện'
    });

  } catch (error) {
    console.error('Error clearing detected plates:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi xóa biển số được phát hiện',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Save plate detection from detector.py
const savePlateDetectionFromDetector = async (req, res) => {
  try {
    const {
      detection_uuid,
      plate_number,
      raw_plate_text,
      camera_id,
      location_id,
      detected_at,
      confidence_score,
      ocr_confidence,
      detection_confidence,
      bbox,
      frame_path,
      detected_vehicle_type,
      source_type
    } = req.body;

    const query = `
      INSERT INTO license_plate_detections (
        detection_uuid, plate_number, raw_plate_text, camera_id, location_id,
        detected_at, confidence_score, ocr_confidence, detection_confidence,
        cropped_plate_image_path, detected_vehicle_type,
        bbox_x1, bbox_y1, bbox_x2, bbox_y2, source_type,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    const [x1, y1, x2, y2] = bbox || [0, 0, 0, 0];

    await new Promise((resolve, reject) => {
      db.query(query, [
        detection_uuid,
        plate_number,
        raw_plate_text,
        camera_id,
        location_id,
        new Date(detected_at * 1000),
        confidence_score,
        ocr_confidence,
        detection_confidence,
        frame_path,
        detected_vehicle_type,
        x1, y1, x2, y2,
        source_type
      ], (error, results) => {
        if (error) {
          console.error('Database save error:', error);
          reject(error);
        } else {
          console.log('Plate detection saved to database:', results.insertId);
          resolve(results);
        }
      });
    });

    res.status(200).json({
      success: true,
      message: 'Biển số đã được lưu thành công'
    });

  } catch (error) {
    console.error('Error saving plate detection:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lưu biển số',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  uploadVideoForRecognition,
  getVideoRecognitionResults,
  getDetectedPlates,
  clearDetectedPlates,
  savePlateDetectionFromDetector,
  upload
};
