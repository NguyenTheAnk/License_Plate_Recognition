// const jwt= require("jsonwebtoken");
// const { User } = require('../models/user');
// const { Roles } = require('../models/roles');


// function generateToken(user) {
//     return jwt.sign(
//         { 
//             userId: user.id,
//             isAdmin: user.isAdmin,
//             roles: user.roles 
//         },
//         process.env.JSON_WEB_TOKEN_SECRET_KEY,
//         { expiresIn: '1d' }
//     );
// }
// //Middleware
// const auth = async (req, res, next) => {
//     try {
//         // Kiểm tra token chi tiết hơn
//         const authHeader = req.headers.authorization;
//         if (!authHeader) {
//             return res.status(401).json({ message: 'Token không hợp lệ' });
//         }

//         const token = authHeader.split(' ')[1] || authHeader;
        
//         // Giải mã token
//         const decoded = jwt.verify(token, process.env.JSON_WEB_TOKEN_SECRET_KEY);
        
//         // Tìm user và nạp đầy đủ thông tin roles và permissions
//         const user = await User.findById(decoded.userId)
//             .populate({
//                 path: 'roles',
//                 populate: {
//                     path: 'permissions',
//                     select: 'permissionConstantName' // Chọn các trường cần thiết
//                 }
//             })
//             .lean(); // Sử dụng .lean() để tăng hiệu suất

//         if (!user) {
//             return res.status(401).json({ message: 'Người dùng không tồn tại' });
//         }

//         // Kiểm tra token hết hạn (nếu có trường hạn)
//         if (decoded.exp && Date.now() >= decoded.exp * 1000) {
//             return res.status(401).json({ message: 'Token đã hết hạn' });
//         }

//         req.user = user;
//         next();
//     } catch (error) {
//         // Xử lý các lỗi token khác nhau
//         if (error.name === 'JsonWebTokenError') {
//             return res.status(401).json({ message: 'Token không hợp lệ' });
//         }
//         if (error.name === 'TokenExpiredError') {
//             return res.status(401).json({ message: 'Token đã hết hạn' });
//         }
//         res.status(500).json({ message: 'Lỗi xác thực', error: error.message });
//     }
// };

// // const checkPermission = (requiredPermission) => {
// //     return async (req, res, next) => {
// //         try {
// //             const user = req.user;
            
// //             if (!user.roles || user.roles.length === 0) {
// //                 // Super admin luôn được phép
// //                 if (user.isAdmin) {
// //                     return next();
// //                 }
// //                 return res.status(403).json({ 
// //                     message: 'Bạn không có quyền thực hiện thao tác này' 
// //                 });
// //             }

// //             // Kiểm tra permission 
// //             const hasPermission = user.roles.some(role => 
// //                 role.permissions.some(permission => 
// //                     permission.code === requiredPermission
// //                 )
// //             );

// //             if (!hasPermission) {
// //                 return res.status(403).json({ 
// //                     message: 'Bạn không có quyền thực hiện thao tác này',
// //                     requiredPermission 
// //                 });
// //             }

// //             next();
// //         } catch (error) {
// //             console.error('Permission check error:', error);
// //             res.status(500).json({ 
// //                 message: 'Lỗi kiểm tra quyền', 
// //                 error: error.message 
// //             });
// //         }
// //     };
// // };
// const checkPermission = (requiredPermission) => {
//     return async (req, res, next) => {
//         try {
//             const user = req.user;  // Lấy thông tin người dùng từ `req.user`

//             // Nếu người dùng không có vai trò, chỉ admin mới được phép
//             if (!user.roles || user.roles.length === 0) {
//                 if (user.isAdmin) {
//                     return next();  // Nếu là admin, cho phép tiếp tục
//                 }
//                 return res.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác này' });
//             }

//             // Truy vấn cơ sở dữ liệu để lấy quyền của người dùng
//             const roles = await Role.find({ '_id': { $in: user.roles } })
//                 .populate({
//                     path: 'permissions',  // Lấy quyền của vai trò
//                     match: { permissionConstantName: requiredPermission },  // Kiểm tra quyền cụ thể
//                     select: 'permissionConstantName childPermissions',  // Lấy các trường cần thiết
//                 });

//             // Kiểm tra xem người dùng có quyền `requiredPermission` không
//             const hasPermission = roles.some(role => {
//                 return role.permissions.some(permission => {
//                     // Kiểm tra quyền chính
//                     if (permission.permissionConstantName === requiredPermission) {
//                         return true;
//                     }

//                     // Kiểm tra quyền con (nếu có)
//                     if (permission.childPermissions && permission.childPermissions.length > 0) {
//                         return permission.childPermissions.some(childPermission => childPermission.permissionConstantName === requiredPermission);
//                     }

//                     return false;
//                 });
//             });

//             if (!hasPermission) {
//                 return res.status(403).json({ 
//                     message: 'Bạn không có quyền thực hiện thao tác này', 
//                     requiredPermission 
//                 });
//             }

//             // Nếu có quyền, tiếp tục xử lý request
//             next();
//         } catch (error) {
//             console.error('Permission check error:', error);
//             res.status(500).json({ 
//                 message: 'Lỗi kiểm tra quyền', 
//                 error: error.message 
//             });
//         }
//     };
// };

// const refreshToken = async (req, res) => {
//     try {
//       const { refreshToken } = req.body;
      
//       if (!refreshToken) {
//         return res.status(401).json({ message: 'Refresh token không hợp lệ' });
//       }
  
//       const decoded = jwt.verify(refreshToken, process.env.JSON_WEB_TOKEN_REFRESH_KEY);
//       const user = await User.findById(decoded.userId);
  
//       if (!user) {
//         return res.status(401).json({ message: 'Người dùng không tồn tại' });
//       }
  
//       // Tạo token mới
//       const newToken = generateToken(user);
  
//       res.json({ token: newToken });
//     } catch (error) {
//       res.status(403).json({ message: 'Refresh token không hợp lệ' });
//     }
//   };
// module.exports = {
//     auth,
//     checkPermission,
//     generateToken,
//     refreshToken
// };
