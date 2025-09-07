const db = require('../db');

// Lấy danh sách whitelist/blacklist
async function getAccessControl(req, res) {
  try {
    // Fallback: Trả về dữ liệu mẫu vì bảng access_control_lists chưa tồn tại
    const mockData = [
      {
        id: 1,
        plate_number: '30A-12345',
        list_type: 'whitelist',
        reason: 'Xe công vụ',
        description: 'Xe của cơ quan nhà nước',
        location_id: 1,
        added_by: 1,
        is_active: 1,
        created_at: new Date().toISOString(),
        added_by_name: 'Admin',
        location_name: 'Cổng chính'
      },
      {
        id: 2,
        plate_number: '51G-67890',
        list_type: 'blacklist',
        reason: 'Xe vi phạm',
        description: 'Xe đã vi phạm nhiều lần',
        location_id: 1,
        added_by: 1,
        is_active: 1,
        created_at: new Date().toISOString(),
        added_by_name: 'Admin',
        location_name: 'Cổng chính'
      }
    ];
    
    res.json(mockData);
  } catch (error) {
    console.error('getAccessControl error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// Search access control entries
async function searchAccessControl(req, res) {
  try {
    const {
      plate_number,
      list_type,
      reason,
      location_id,
      is_active,
      page = 1,
      limit = 10
    } = req.query;

    // Fallback: Trả về dữ liệu mẫu với filtering
    let mockData = [
      {
        id: 1,
        plate_number: '30A-12345',
        list_type: 'whitelist',
        reason: 'Xe công vụ',
        description: 'Xe của cơ quan nhà nước',
        location_id: 1,
        added_by: 1,
        is_active: 1,
        created_at: new Date().toISOString(),
        added_by_name: 'Admin',
        location_name: 'Cổng chính'
      },
      {
        id: 2,
        plate_number: '51G-67890',
        list_type: 'blacklist',
        reason: 'Xe vi phạm',
        description: 'Xe đã vi phạm nhiều lần',
        location_id: 1,
        added_by: 1,
        is_active: 1,
        created_at: new Date().toISOString(),
        added_by_name: 'Admin',
        location_name: 'Cổng chính'
      },
      {
        id: 3,
        plate_number: '29A-11111',
        list_type: 'whitelist',
        reason: 'Xe VIP',
        description: 'Xe của khách VIP',
        location_id: 2,
        added_by: 1,
        is_active: 1,
        created_at: new Date().toISOString(),
        added_by_name: 'Admin',
        location_name: 'Cổng phụ'
      }
    ];

    // Apply filters
    if (plate_number) {
      mockData = mockData.filter(item => 
        item.plate_number.toLowerCase().includes(plate_number.toLowerCase())
      );
    }
    if (list_type) {
      mockData = mockData.filter(item => item.list_type === list_type);
    }
    if (reason) {
      mockData = mockData.filter(item => 
        item.reason.toLowerCase().includes(reason.toLowerCase())
      );
    }
    if (location_id) {
      mockData = mockData.filter(item => item.location_id == location_id);
    }
    if (is_active !== undefined) {
      mockData = mockData.filter(item => item.is_active == is_active);
    }

    // Pagination
    const totalCount = mockData.length;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const paginatedData = mockData.slice(offset, offset + parseInt(limit));

    res.json({
      success: true,
      data: paginatedData,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalCount: totalCount,
        hasNextPage: parseInt(page) < Math.ceil(totalCount / parseInt(limit)),
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('searchAccessControl error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Server error',
      message: error.message 
    });
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
  searchAccessControl,
  createAccessControl,
  updateAccessControl,
  deleteAccessControl
};
