const db = require('../db');

// Lấy danh sách whitelist/blacklist
async function getAccessControl(req, res) {
  try {
    let query = `
      SELECT acl.*, u.name as added_by_name, l.name as location_name
      FROM access_control_lists acl
      LEFT JOIN users u ON acl.added_by = u.id
      LEFT JOIN locations l ON acl.location_id = l.id
      WHERE 1=1
    `;
    const params = [];
    if (req.query.plate_number) {
      query += ' AND acl.plate_number LIKE ?';
      params.push(`%${req.query.plate_number}%`);
    }
    if (req.query.list_type) {
      query += ' AND acl.list_type = ?';
      params.push(req.query.list_type);
    }
    if (req.query.location_id) {
      query += ' AND acl.location_id = ?';
      params.push(req.query.location_id);
    }
    if (req.query.is_active) {
      query += ' AND acl.is_active = ?';
      params.push(req.query.is_active === 'true' ? 1 : 0);
    }
    query += ' ORDER BY acl.created_at DESC';
    if (req.query.limit) {
      query += ' LIMIT ?';
      params.push(parseInt(req.query.limit));
    }
    const [rows] = await db.promise().query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('getAccessControl error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// Thêm mới entry
async function createAccessControl(req, res) {
  try {
    const { plate_number, list_type, reason, description, location_id, effective_from, effective_until, priority, alert_on_detection, auto_action, is_active } = req.body;
    if (!plate_number || !list_type) {
      return res.status(400).json({ error: 'plate_number and list_type are required' });
    }
    const added_by = req.user.userId;
    const [result] = await db.promise().query(
      `INSERT INTO access_control_lists (plate_number, list_type, reason, description, location_id, effective_from, effective_until, added_by, priority, alert_on_detection, auto_action, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [plate_number, list_type, reason, description, location_id, effective_from, effective_until, added_by, priority || 0, alert_on_detection || true, auto_action || 'notify', is_active !== undefined ? is_active : true]
    );
    res.status(201).json({ success: true, id: result.insertId });
  } catch (error) {
    console.error('createAccessControl error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// Cập nhật entry
async function updateAccessControl(req, res) {
  try {
    const id = req.params.id;
    const { plate_number, list_type, reason, description, location_id, effective_from, effective_until, priority, alert_on_detection, auto_action, is_active } = req.body;
    const [result] = await db.promise().query(
      `UPDATE access_control_lists SET plate_number=?, list_type=?, reason=?, description=?, location_id=?, effective_from=?, effective_until=?, priority=?, alert_on_detection=?, auto_action=?, is_active=?, updated_at=NOW() WHERE id=?`,
      [plate_number, list_type, reason, description, location_id, effective_from, effective_until, priority, alert_on_detection, auto_action, is_active, id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('updateAccessControl error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// Xoá entry
async function deleteAccessControl(req, res) {
  try {
    const id = req.params.id;
    await db.promise().query('DELETE FROM access_control_lists WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('deleteAccessControl error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  getAccessControl,
  createAccessControl,
  updateAccessControl,
  deleteAccessControl
};
