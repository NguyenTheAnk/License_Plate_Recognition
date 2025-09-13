const db = require('../db');
const { createWorker } = require('tesseract.js');
const crypto = require('crypto');
const path = require('path');

// Nhận diện biển số từ ảnh và lưu DB
async function uploadPlate(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const imagePath = req.file.path;
    // Nhận diện biển số
    const worker = await createWorker();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    const { data: { text } } = await worker.recognize(imagePath);
    await worker.terminate();
    const licensePlate = text.trim();
    if (!licensePlate) {
      return res.status(400).json({ error: 'Could not recognize license plate' });
    }
    const cameraId = req.body.cameraId || null;
    const locationId = req.body.locationId || null;
    const confidence = req.body.confidence || 0.0;
    const timestamp = new Date().toISOString();
    const hash = crypto.createHash('sha256').update(licensePlate + imagePath + timestamp).digest('hex');
    // Lưu DB
    const [result] = await db.promise().query(
      'INSERT INTO license_plates (plate_number, image_path, timestamp, data_hash, camera_id, location_id, detection_confidence) VALUES (?, ?, NOW(), ?, ?, ?, ?)',
      [licensePlate, imagePath, hash, cameraId, locationId, confidence]
    );
    res.json({ success: true, licensePlate, imagePath, id: result.insertId, timestamp: new Date() });
  } catch (error) {
    console.error('uploadPlate error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// Tra cứu danh sách biển số
async function getPlates(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        lpd.*,
        c.name as camera_name,
        l.name as location_name,
        l.address as location_address,
        l.zone_type as location_zone_type
      FROM license_plate_detections lpd
      LEFT JOIN cameras c ON lpd.camera_id = c.id
      LEFT JOIN locations l ON lpd.location_id = l.id
      WHERE 1=1
    `;
    const params = [];
    
    if (req.query.plate_number) {
      query += ' AND lpd.plate_number LIKE ?';
      params.push(`%${req.query.plate_number}%`);
    }
    if (req.query.location_id) {
      query += ' AND lpd.location_id = ?';
      params.push(req.query.location_id);
    }
    if (req.query.camera_id) {
      query += ' AND lpd.camera_id = ?';
      params.push(req.query.camera_id);
    }
    if (req.query.date_from) {
      query += ' AND lpd.detected_at >= ?';
      params.push(req.query.date_from);
    }
    if (req.query.date_to) {
      query += ' AND lpd.detected_at <= ?';
      params.push(req.query.date_to);
    }
    
    // Get total count
    const countQuery = query.replace(/SELECT.*FROM/, 'SELECT COUNT(*) as total FROM');
    const [countResult] = await db.promise().query(countQuery, params);
    const total = countResult[0].total;
    
    // Add pagination and ordering
    query += ' ORDER BY lpd.detected_at DESC';
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const [rows] = await db.promise().query(query, params);
    
    res.json({
      success: true,
      data: rows,
      total: total,
      pagination: {
        page: page,
        limit: limit,
        total_pages: Math.ceil(total / limit),
        total: total
      }
    });
  } catch (error) {
    console.error('getPlates error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// Tra cứu chi tiết biển số
async function getPlateDetail(req, res) {
  try {
    let query = `
      SELECT 
        lpd.*,
        c.name as camera_name,
        l.name as location_name,
        l.address as location_address,
        l.zone_type as location_zone_type
      FROM license_plate_detections lpd
      LEFT JOIN cameras c ON lpd.camera_id = c.id
      LEFT JOIN locations l ON lpd.location_id = l.id
      WHERE 1=1
    `;
    const params = [];
    if (req.params.id) {
      query += ' AND lpd.id = ?';
      params.push(req.params.id);
    } else if (req.params.plate_number) {
      query += ' AND lpd.plate_number = ?';
      params.push(req.params.plate_number);
    } else {
      return res.status(400).json({ error: 'Missing id or plate_number' });
    }
    const [rows] = await db.promise().query(query, params);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('getPlateDetail error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  uploadPlate,
  getPlates,
  getPlateDetail
}; 