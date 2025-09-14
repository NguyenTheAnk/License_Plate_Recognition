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
    let query = `
      SELECT lp.*, c.name as camera_name, l.name as location_name, v.make, v.model, v.color
      FROM license_plates lp
      LEFT JOIN cameras c ON lp.camera_id = c.id
      LEFT JOIN locations l ON lp.location_id = l.id
      LEFT JOIN vehicles v ON lp.vehicle_id = v.id
      WHERE 1=1
    `;
    const params = [];
    if (req.query.plate_number) {
      query += ' AND lp.plate_number LIKE ?';
      params.push(`%${req.query.plate_number}%`);
    }
    if (req.query.location_id) {
      query += ' AND lp.location_id = ?';
      params.push(req.query.location_id);
    }
    if (req.query.camera_id) {
      query += ' AND lp.camera_id = ?';
      params.push(req.query.camera_id);
    }
    query += ' ORDER BY lp.timestamp DESC';
    if (req.query.limit) {
      query += ' LIMIT ?';
      params.push(parseInt(req.query.limit));
    }
    const [rows] = await db.promise().query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('getPlates error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// Tra cứu chi tiết biển số
async function getPlateDetail(req, res) {
  try {
    let query = `
      SELECT lp.*, c.name as camera_name, l.name as location_name, v.make, v.model, v.color
      FROM license_plates lp
      LEFT JOIN cameras c ON lp.camera_id = c.id
      LEFT JOIN locations l ON lp.location_id = l.id
      LEFT JOIN vehicles v ON lp.vehicle_id = v.id
      WHERE 1=1
    `;
    const params = [];
    if (req.params.id) {
      query += ' AND lp.id = ?';
      params.push(req.params.id);
    } else if (req.params.plate_number) {
      query += ' AND lp.plate_number = ?';
      params.push(req.params.plate_number);
    } else {
      return res.status(400).json({ error: 'Missing id or plate_number' });
    }
    const [rows] = await db.promise().query(query, params);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
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