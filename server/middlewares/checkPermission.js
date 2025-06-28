


const checkPermission = (permissionName) => {
    return async (req, res, next) => {
        try {
            // Kiểm tra xem người dùng đã đăng nhập chưa
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    msg: 'Unauthorized'
                });
            }

            // Lấy thông tin user từ req.user (sau khi xác thực token)
            const user = await User.findById(req.user._id)
                .populate({
                    path: 'roles',
                    populate: {
                        path: 'permissions',
                        model: 'Permissions'  // Populate permissions từ Role
                    }
                });

            // Kiểm tra xem user có tồn tại không
            if (!user) {
                return res.status(404).json({
                    success: false,
                    msg: 'User not found'
                });
            }

            // Lấy danh sách quyền từ role của người dùng
            const userPermissions = user.roles?.flatMap(roles => roles.permissions.map(permissions => permissions.code)) || [];

            // Kiểm tra xem quyền cần kiểm tra có tồn tại trong mảng quyền của user hay không
            if (userPermissions.includes(permissionName)) {
                return next(); // Nếu có quyền, tiếp tục
            }

            // Nếu không có quyền, trả về lỗi 403
            return res.status(403).json({
                success: false,
                msg: `You do not have permission to perform this action: ${permissionName}`
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