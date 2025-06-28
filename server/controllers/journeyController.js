const db = require('../db');

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
    query += ' ORDER BY vj.journey_date DESC, vj.start_time DESC';
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

module.exports = {
  getJourneys,
  getJourneyDetail
}; 