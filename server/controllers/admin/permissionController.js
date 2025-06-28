const db = require('../../db');

// Lấy danh sách quyền
async function getAllPermissions(req, res) {
  try {
    const [rows] = await db.promise().query('SELECT * FROM permissions');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
}

// Lấy chi tiết quyền
async function getPermissionById(req, res) {
  try {
    const [rows] = await db.promise().query('SELECT * FROM permissions WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Permission not found' });
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
}

// Tạo quyền mới
async function createPermission(req, res) {
  try {
    const { module, action, code, description, is_active } = req.body;
    if (!module || !action || !code) return res.status(400).json({ error: 'Missing required fields' });
    const [result] = await db.promise().query(
      'INSERT INTO permissions (module, action, code, description, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
      [module, action, code, description, is_active !== undefined ? is_active : true]
    );
    res.status(201).json({ success: true, id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
}

// Cập nhật quyền
async function updatePermission(req, res) {
  try {
    const { module, action, code, description, is_active } = req.body;
    await db.promise().query(
      'UPDATE permissions SET module=?, action=?, code=?, description=?, is_active=?, updated_at=NOW() WHERE id=?',
      [module, action, code, description, is_active, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
}

// Xoá quyền
async function deletePermission(req, res) {
  try {
    await db.promise().query('DELETE FROM permissions WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  getAllPermissions,
  getPermissionById,
  createPermission,
  updatePermission,
  deletePermission
};