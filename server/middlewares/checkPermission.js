

const db = require('../db');

const checkPermission = (code) => {
    return async (req, res, next) => {
        try {
            // Kiểm tra xem người dùng đã đăng nhập chưa
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    msg: 'Unauthorized'
                });
            }

            const connection = await db.promise();
            const userId = req.user.userId || req.user.id;

            // Kiểm tra xem user có tồn tại không
            const [users] = await connection.execute(`
                SELECT id, name, email, status 
                FROM users 
                WHERE id = ? AND status = 'active'
            `, [userId]);

            if (users.length === 0) {
                return res.status(404).json({
                    success: false,
                    msg: 'User not found or inactive'
                });
            }

            // Lấy danh sách quyền từ role của người dùng
            const [userPermissions] = await connection.execute(`
                SELECT DISTINCT
                    p.code
                FROM user_roles ur
                JOIN roles r ON ur.role_id = r.id
                JOIN role_permissions rp ON r.id = rp.role_id
                JOIN permissions p ON rp.permission_id = p.id
                WHERE ur.user_id = ? 
                AND ur.is_active = 1 
                AND r.is_active = 1 
                AND rp.granted = 1 
                AND p.is_active = 1
                AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
            `, [userId]);

            // Trích xuất danh sách code từ kết quả query
            const userPermissionCodes = userPermissions.map(permission => permission.code);

            // Kiểm tra xem quyền cần kiểm tra có tồn tại trong mảng quyền của user hay không
            if (userPermissionCodes.includes(code)) {
                return next(); // Nếu có quyền, tiếp tục
            }

            // Nếu không có quyền, trả về lỗi 403
            return res.status(403).json({
                success: false,
                msg: `You do not have permission to perform this action: ${code}`
            });

        } catch (error) {
            // Xử lý lỗi nếu có
            console.error("Permission check error:", error);
            return res.status(500).json({
                success: false,
                msg: "An error occurred while checking permissions"
            });
        }
    };
};


module.exports = checkPermission;