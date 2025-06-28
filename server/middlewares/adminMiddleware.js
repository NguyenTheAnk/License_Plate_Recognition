// const mongoose = require('mongoose');
// const { Roles } = require('../models/roles');
// const { User } = require('../models/user');

// const onlyAdminAccess = async (req, res, next) => {
//   try {

//     // Kiểm tra xem thông tin người dùng có tồn tại khôngs
//     if (!req.user) {
//       return res.status(401).json({
//         success: false,
//         msg: "User not found in request",
//       });
//     }

//     // Kiểm tra danh sách role của user
//     const userRoles = req.user.roles;

//     if (!userRoles || userRoles.length === 0) {
//       return res.status(403).json({
//         success: false,
//         msg: "User has no roles assigned",
//       });
//     }

//     // Lấy thông tin các role từ cơ sở dữ liệu
//     const roles = await Roles.find({ _id: { $in: userRoles } });

//     if (!roles || roles.length === 0) {
//       return res.status(403).json({
//         success: false,
//         msg: "Invalid roles assigned to user",
//       });
//     }

//     // Kiểm tra xem user có vai trò admin không
//     const isAdmin = roles.some((role) => role.name === 'Admin' || role.name === 'SuperAdmin');

//     if (!isAdmin) {
//       return res.status(403).json({
//         success: false,
//         msg: "You don't have permission to access this route!",
//       });
//     }

//     // Nếu là admin, tiếp tục
//     return next();
//   } catch (error) {
//     console.error('Error in onlyAdminAccess:', error);
//     return res.status(500).json({
//       success: false,
//       msg: "Something went wrong!",
//     });
//   }
// };

// module.exports = {
//   onlyAdminAccess,
// };



const onlyAdminAccess = async (req, res, next) => {
  try {
    // Kiểm tra thông tin user từ req.user
    if (!req.user) {
      return res.status(401).json({
        success: false,
        msg: "User not found in request!",
      });
    }

    // Lấy danh sách roles từ user
    const userRoles = req.user.roles;

    if (!userRoles || !Array.isArray(userRoles) || userRoles.length === 0) {
      return res.status(403).json({
        success: false,
        msg: "User has no roles assigned!",
      });
    }

    // Lấy thông tin roles từ cơ sở dữ liệu
    const roles = await Roles.find({ _id: { $in: userRoles } });

    if (!roles || roles.length === 0) {
      return res.status(403).json({
        success: false,
        msg: "Invalid roles assigned to user!",
      });
    }

    // Kiểm tra user có phải Admin/SuperAdmin không
    const isAdmin = roles.some(role => role.name === 'Admin' || role.name === 'SuperAdmin');
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        msg: "You don't have permission to access this route!",
      });
    }

    // Nếu user là Admin/SuperAdmin, tiếp tục
    next();
  } catch (error) {
    console.error("Error in onlyAdminAccess:", error);
    return res.status(500).json({
      success: false,
      msg: "Something went wrong!",
    });
  }
};

module.exports = {
  onlyAdminAccess,
};

