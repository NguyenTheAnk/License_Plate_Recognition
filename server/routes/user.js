// const {User} = require('../models/user');
// const { Roles } = require('../models/roles');
const {ImageUpload} = require('../models/imageUpload');
const express = require('express');
const router = express.Router();
// const bcrypt = require('bcrypt');
// const jwt= require("jsonwebtoken");
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const fs = require('fs');
const auth = require('../middlewares/authMiddleware');
const authController = require('../controllers/authController');
const {registerValidator, loginValidator,createUserValidator,updateUserValidator,deleteUserValidator} = require('../helper/validator');
const userController = require('../controllers/userController');
const checkPermission = require('../middlewares/checkPermission');
const { onlyAdminAccess } = require('../middlewares/adminMiddleware');
var imagesArr = [];
var userEditId;
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'uploads')
    },
    filename: function (req, file, cb) {
      cb(null, `${Date.now()}_${file.originalname}`);
    }
  })
  const upload = multer({ storage: storage })
cloudinary.config({
    cloud_name: process.env.cloudinary_Config_Cloud_Name,
    api_key: process.env.cloudinary_Config_api_key,
    api_secret: process.env.cloudinary_Config_api_secret,
    secure: true
});

router.post(`/upload`, upload.array("images"), async (req, res) => {
    console.log(req.files);
    imagesArr=[];
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: "No files uploaded" });
        }
        for(let i=0; i<req.files.length;i++){
            const options={
                use_filename: true,
                unique_filename: false,
                overwrite: false,
            };
            const img = await cloudinary.uploader.upload(req.files[i].path, options, function (error, result){
                imagesArr.push(result.secure_url);
                fs.unlinkSync(`uploads/${req.files[i].filename}`);
            });
        }
        let imagesUploaded = new ImageUpload({
            images: imagesArr,
        })
        imagesUploaded = await imagesUploaded.save();
        return res.status(200).json(imagesArr);
    }catch(error){
        console.log(error);
    }
});

router.post('/register', registerValidator, authController.registerUser );
router.post('/login',loginValidator, authController.loginUser);
router.post('/', auth,onlyAdminAccess,checkPermission('createUser'), createUserValidator, userController.createUser);
router.put('/:id', auth,onlyAdminAccess,auth,onlyAdminAccess,checkPermission('updateUser'), updateUserValidator, userController.updateUser);
router.delete('/:id', auth,onlyAdminAccess,auth,onlyAdminAccess,checkPermission('deleteUser'), deleteUserValidator, userController.deleteUser);
router.get('/',auth,onlyAdminAccess,auth,onlyAdminAccess,checkPermission('viewUser'), userController.getAllUsers);
router.get('/:id',auth,onlyAdminAccess,auth,onlyAdminAccess,checkPermission('viewUser'), userController.getUserById);
router.post('/:id/assign-role', auth, userController.assignRole);
router.post('/:id/remove-role', auth, userController.removeRole);
// router.put('/:userId/roles',auth,onlyAdminAccess, userController.addRoleUser);
// router.put('/update-role',auth,onlyAdminAccess, userController.updateUserRole);







// router.post('/signUp', async (req, res) => {
//     const {name, phone, email, password,isAdmin} = req.body;

//     try{
//         const existingUser = await User.findOne({email: email});
//         const existingUserByPhone = await User.findOne({phone: phone});
//         if(existingUser && existingUserByPhone){
//             res.status(400).json({error: true, msg: "User already exists!"});
//         }
//         const hashPassword = await bcrypt.hash(password,10);
//         const result = await User.create({
//             name: name,
//             phone: phone,
//             email: email,
//             password: hashPassword
//         })

//         const token = jwt.sign({email: result.email, id: result._id}, process.env.JSON_WEB_TOKEN_SECRET_KEY);

//         res.status(200).json({
//             user: result,
//             token: token
//         })
//     }catch(error){
//         console.log(error);
//         res.status(500).json({error: true, msg: "Something went wrong!"});
//     }
// });

// router.post('/authWithGoogle', async (req, res) => {
//     const {name, phone, email, password,images, isAdmin} = req.body;

//     try{
//         const existingUser = await User.findOne({email: email});

//         if(!existingUser){
//             const result = await User.create({
//                 name: name,
//                 phone: phone,
//                 email: email,
//                 password: password,
//                 images: images,
//                 isAdmin: isAdmin
//             });
//             const token = jwt.sign({email: result.email, id: result._id}, process.env.JSON_WEB_TOKEN_SECRET_KEY);
//             return res.status(200).send({
//                 user: result,
//                 token: token,
//                 msg: "User Login Successfully"
//             });
//         }else{
//             const existingUser = await User.findOne({email: email});
//             const token = jwt.sign({email: existingUser.email, id: existingUser._id}, process.env.JSON_WEB_TOKEN_SECRET_KEY);
//             return res.status(200).json({
//                 user: existingUser,
//                 token: token,
//                 msg: "User Login Successfully"
//             });
//         }
//     }catch(error){
//         console.log(error);
//         res.status(500).json({error: true, msg: "Something went wrong!"});
//     }
// });


// // router.post(`/signIn`,async (req,res)=>{
// //     const {email, password} = req.body;

// //     try{
// //         const existingUser = await User.findOne({email: email});

// //         if(!existingUser){
// //             return res.status(404).json({error: true, msg: "User not found!"});
// //         }
// //         const matchPassword = await bcrypt.compare(password, existingUser.password);
// //         if(!matchPassword){
// //             return res.status(400).json({error: true, msg: "Invailid credentials!"});
// //         }

// //         const token = jwt.sign({email: existingUser.email, id: existingUser._id}, process.env.JSON_WEB_TOKEN_SECRET_KEY);
// //         res.status(200).json({
// //             user: existingUser,
// //             token: token,
// //             msg:"User Authenticated!"
// //         })
// //     }catch(error){
// //         res.status(500).json({error: true, msg: "Something went wrong!"});
// //     }
// // });
// // router.post('/signIn', async (req, res) => {
// //     const { email, password } = req.body;

// //     try {
// //         // Validate input
// //         if (!email || !password) {
// //             return res.status(400).json({ 
// //                 error: true, 
// //                 msg: "Email và mật khẩu là bắt buộc!" 
// //             });
// //         }

// //         // Tìm user và nạp roles, permissions
// //         const existingUser = await User.findOne({ email })
// //             .populate({
// //                 path: 'roles',
// //                 populate: {
// //                     path: 'permissions',
// //                     select: 'permissionConstantName'
// //                 }
// //             });

// //         if (!existingUser) {
// //             return res.status(404).json({
// //                 error: true, 
// //                 msg: "Người dùng không tồn tại!"
// //             });
// //         }

// //         // So sánh mật khẩu
// //         const matchPassword = await bcrypt.compare(password, existingUser.password);
// //         if (!matchPassword) {
// //             return res.status(400).json({
// //                 error: true, 
// //                 msg: "Thông tin đăng nhập không chính xác!"
// //             });
// //         }

// //         // Tạo token với thông tin mở rộng
// //         const token = jwt.sign(
// //             { 
// //                 userId: existingUser._id, 
// //                 email: existingUser.email,
// //                 roles: existingUser.roles.map(role => role.roleName),
// //                 permissions: existingUser.roles.flatMap(role => 
// //                     role.permissions.map(perm => perm.permissionConstantName)
// //                 )
// //             }, 
// //             process.env.JSON_WEB_TOKEN_SECRET_KEY,
// //             { expiresIn: '1d' } // Token hết hạn trong 1 ngày
// //         );

// //         // Tạo refresh token (tùy chọn)
// //         const refreshToken = jwt.sign(
// //             { userId: existingUser._id },
// //             process.env.JSON_WEB_TOKEN_REFRESH_KEY,
// //             { expiresIn: '7d' }
// //         );

// //         // Loại bỏ thông tin nhạy cảm trước khi trả về
// //         const userResponse = {
// //             _id: existingUser._id,
// //             email: existingUser.email,
// //             name: existingUser.name,
// //             roles: existingUser.roles.map(role => role.roleName),
// //             permissions: existingUser.roles.flatMap(role => 
// //                 role.permissions.map(perm => perm.permissionConstantName)
// //             )
// //         };

// //         // Ghi log đăng nhập (tùy chọn)
// //         await LoginAttempt.create({
// //             user: existingUser._id,
// //             success: true,
// //             ip: req.ip
// //         });

// //         res.status(200).json({
// //             error: false,
// //             msg: "Đăng nhập thành công!",
// //             user: userResponse,
// //             token: token,
// //             refreshToken: refreshToken
// //         });

// //     } catch (error) {
// //         // Ghi log lỗi
// //         console.error('Đăng nhập lỗi:', error);

// //         // Ghi log đăng nhập không thành công (tùy chọn)
// //         await LoginAttempt.create({
// //             user: null,
// //             success: false,
// //             ip: req.ip,
// //             error: error.message
// //         });

// //         res.status(500).json({
// //             error: true, 
// //             msg: "Có lỗi trong quá trình đăng nhập!",
// //             details: process.env.NODE_ENV === 'development' ? error.message : undefined
// //         });
// //     }
// // });
// router.post('/signIn', async (req, res) => {
//     const { email, password } = req.body;

//     try {
//         // Validate input
//         if (!email || !password) {
//             return res.status(400).json({ 
//                 error: true, 
//                 msg: "Email và mật khẩu là bắt buộc!" 
//             });
//         }

//         // Tìm user và nạp roles, permissions
//         const existingUser = await User.findOne({ email })
//             .populate({
//                 path: 'roles',
//                 populate: {
//                     path: 'permissions',
//                     select: 'permissionConstantName'
//                 }
//             });

//         if (!existingUser) {
//             return res.status(404).json({
//                 error: true, 
//                 msg: "Người dùng không tồn tại!"
//             });
//         }

//         // So sánh mật khẩu
//         const matchPassword = await bcrypt.compare(password, existingUser.password);
//         if (!matchPassword) {
//             return res.status(400).json({
//                 error: true, 
//                 msg: "Thông tin đăng nhập không chính xác!"
//             });
//         }

//         // Tạo token với thông tin mở rộng
//         const token = jwt.sign(
//             { 
//                 userId: existingUser._id, 
//                 email: existingUser.email,
//                 roles: existingUser.roles.map(role => role.roleName),
//                 permissions: existingUser.roles.flatMap(role => 
//                     role.permissions.map(perm => perm.permissionConstantName)
//                 )
//             }, 
//             process.env.JSON_WEB_TOKEN_SECRET_KEY,
//             { expiresIn: '1d' } // Token hết hạn trong 1 ngày
//         );

//         // Tạo refresh token (tùy chọn)
//         const refreshToken = jwt.sign(
//             { userId: existingUser._id },
//             process.env.JSON_WEB_TOKEN_REFRESH_KEY,
//             { expiresIn: '7d' }
//         );

//         // Loại bỏ thông tin nhạy cảm trước khi trả về
//         const userResponse = {
//             _id: existingUser._id,
//             email: existingUser.email,
//             name: existingUser.name,
//             roles: existingUser.roles.map(role => role.roleName),
//             permissions: existingUser.roles.flatMap(role => 
//                 role.permissions.map(perm => perm.permissionConstantName)
//             )
//         };

//         // Trả về kết quả đăng nhập thành công
//         res.status(200).json({
//             error: false,
//             msg: "Đăng nhập thành công!",
//             user: userResponse,
//             token: token,
//             refreshToken: refreshToken
//         });

//     } catch (error) {
//         // Ghi log lỗi
//         console.error('Đăng nhập lỗi:', error);

//         res.status(500).json({
//             error: true, 
//             msg: "Có lỗi trong quá trình đăng nhập!",
//             details: process.env.NODE_ENV === 'development' ? error.message : undefined
//         });
//     }
// });

// router.post('/refresh-token', async (req, res) => {
//     const { refreshToken } = req.body;

//     try {
//         // Giải mã refresh token
//         const decoded = jwt.verify(refreshToken, process.env.JSON_WEB_TOKEN_REFRESH_KEY);
        
//         // Tìm user
//         const user = await User.findById(decoded.userId)
//             .populate({
//                 path: 'roles',
//                 populate: {
//                     path: 'permissions',
//                     select: 'code name'
//                 }
//             });

//         if (!user) {
//             return res.status(401).json({ 
//                 error: true, 
//                 msg: "Người dùng không tồn tại" 
//             });
//         }

//         // Tạo token mới
//         const newToken = jwt.sign(
//             { 
//                 userId: user._id, 
//                 email: user.email,
//                 roles: user.roles.map(role => role.roleName),
//                 permissions: user.roles.flatMap(role => 
//                     role.permissions.map(perm => perm.permissionConstantName)
//                 )
//             }, 
//             process.env.JSON_WEB_TOKEN_SECRET_KEY,
//             { expiresIn: '1d' }
//         );

//         res.json({
//             error: false,
//             token: newToken
//         });

//     } catch (error) {
//         res.status(401).json({ 
//             error: true, 
//             msg: "Refresh token không hợp lệ" 
//         });
//     }
// });
// router.put('/changePassword/:id', async (req, res) => {
//     try {
//         const {name, phone, email, password, newPass, images} = req.body;
//         console.log('Request body:', req.body);  // Log toàn bộ request body
//         console.log('Old password:', password);  // Log old password
//         console.log('New password:', newPass);   // Log new password
//         // Validate input
//         if (!email || !password || !newPass) {
//             return res.status(400).json({
//                 error: true,
//                 msg: "Missing required fields"
//             });
//         }

//         const existingUser = await User.findOne({email: email});

//         if (!existingUser) {
//             return res.status(404).json({
//                 error: true,
//                 msg: "User not found!"
//             });
//         }

//         const matchPassword = await bcrypt.compare(password, existingUser.password);
        
//         if (!matchPassword) {
//             return res.status(400).json({
//                 error: true,
//                 msg: "Current password is incorrect!"
//             });
//         }

//         // Hash new password
//         const newPassword = await bcrypt.hash(newPass, 10);

//         // Update user
//         const user = await User.findByIdAndUpdate(
//             req.params.id,
//             {
//                 name: name,
//                 phone: phone,
//                 email: email,
//                 password: newPassword,
//                 images: images || existingUser.images // Keep existing images if none provided
//             },
//             {new: true}
//         );
        
//         if (!user) {
//             return res.status(400).json({
//                 error: true,
//                 msg: 'Failed to update user!'
//             });
//         }

//         res.status(200).json({
//             error: false,
//             msg: 'Password changed successfully',
//             user
//         });

//     } catch (error) {
//         console.error('Change password error:', error);
//         res.status(500).json({
//             error: true,
//             msg: "Server error occurred"
//         });
//     }
// });
// router.get(`/`, async(req,res)=>{
//     try{
//         const page = parseInt(req.query.page) || 1;
//         const perPage = req.query.perPage || 10;
//         const totalPosts = await User.countDocuments();
//         const totalPages = Math.ceil(totalPosts / perPage);

//         if(page > totalPages){
//             return res.status(404).json({message: "No data found!"})
//         }

//         let userList = [];
//         if(req.query.page !==undefined && req.query.perPage !==undefined){
//             userList = await User.find().populate('roles')
//             .skip((page -1)* perPage)
//             .limit(perPage)
//             .exec();
//         }
//         else{
//             userList = await User.find().populate('roles')
//             .exec();
//         }
        

//         if(!userList){
//             res.status(500).json({success: false})
//         }

//         return res.status(200).json({
//             "userList": userList,
//             "totalPages": totalPages,
//             "totalPosts": totalPosts,
//             "page": page
//         });

//     }catch(error){
//         res.status(500).json({success: false})
// }
// })

// // router.get(`/:id`, async(req,res)=>{
// //     userEditId = req.params.id;
// //     const user = await User.findById(req.params.id).populate("roles permissions");
// //     if(!user){
// //         res.status(500).json({error: true, message: 'The user with the given ID was not found!'});
// //     }
// //     res.status(200).send(user);
// // })
// // router.get(`/:id`, async(req, res) => {
// //     try {
// //         const user = await User.findById(req.params.id).populate("roles permissions");
// //         if (!user) {
// //             return res.status(500).json({ error: true, message: 'User not found' });
// //         }

// //         // Trả về dữ liệu user cùng với roles và permissions
// //         res.status(200).json({
// //             user: user,
// //             roles: user.roles,
// //             permissions: user.permissions
// //         });
// //     } catch (error) {
// //         res.status(500).json({ error: true, message: 'Error fetching user details' });
// //     }
// // });


// router.get('/:id', async (req, res) => {
//     try {
//         const user = await User.findById(req.params._id)
//             .populate({
//                 path: 'roles',
//                 populate: {
//                     path: 'permissions',
//                     model: 'Permissions'
//                 }
//             });

//         if (!user) {
//             return res.status(404).json({ error: true, message: 'User not found' });
//         }

//         res.status(200).json({
//             user: {
//                 _id: user._id,
//                 name: user.name,
//                 email: user.email,
//                 phone: user.phone,
//                 roles: user.roles, // Roles đầy đủ thông tin
//                 images: user.images,
//                 permissions: user.roles.flatMap(role => role.permissions)
//             },
//         });
//     } catch (error) {
//         console.error('Error fetching user details:', error);
//         res.status(500).json({ error: true, message: 'Error fetching user details' });
//     }
// });


// router.delete(`/:id`, (req, res)=>{
//     User.findByIdAndDelete(req.params.id).then(user=>{
//         if(user){
//             return res.status(200).json({success: true, message: 'The user is deleted!'});
//         }else{
//             return res.status(404).json({success: false, message: 'User not found!'});
//         }
//     }).catch(err =>{
//         return res.status(500).json({success: false, error: err});
//     });
// });

// router.get(`/get/count`, async(req, res)=>{
//     const userCount = await User.countDocuments((count)=> count);
//     if(!userCount){
//         res.status(500).json({success: false});
//     }
//     res.send({
//         userCount: userCount
//     });
// });

// router.put(`/:id`, async(req,res)=>{
//     const {name, phone, email} = req.body;

//     const userExits = await User.findById(req.params.id);

//     if(req.body.password){
//         newPassword = bcrypt.hash(req.body.password, 10);
//     }else{
//         newPassword = userExits.passwordHash;
//     }

//     const user = await User.findByIdAndUpdate(
//         req.params.id,{
//             name: name,
//             phone: phone,
//             email: email,
//             password: newPassword,
//             images: imagesArr
//         },
//         {new: true}
//     )

//     if(!user){
//         return res.status(400).send('The user cannot be updated!');
//     }
//     res.send(user);
// });
// // Update user roles
// router.post('/addRoles/:userId', async (req, res) => {
//     const { userId } = req.params;
//     const { roles } = req.body; // Lấy danh sách roleIds từ body

//     try {
//         const user = await User.findById(userId);
//         if (!user) {
//             return res.status(404).json({ success: false, message: 'User not found' });
//         }

//         const rolesToAdd = await Promise.all(
//             roles.map(async (roleId) => {
//                 const role = await Roles.findById(roleId);
//                 if (!role) {
//                     throw new Error(`Role with ID ${roleId} not found`);
//                 }
//                 return role._id;
//             })
//         );

//         // Gộp các roles vào danh sách hiện tại
//         user.roles = [...new Set([...user.roles, ...rolesToAdd])];
//         await user.save();

//         // Populate để trả về đầy đủ thông tin roles và permissions
//         const updatedUser = await User.findById(userId)
//             .populate({
//                 path: 'roles',
//                 populate: {
//                     path: 'permissions', // Populate permissions trong roles
//                 },
//             });

//         res.status(200).json({
//             success: true,
//             message: 'Roles added successfully',
//             user: updatedUser,
//         });
//     } catch (error) {
//         console.error('Error adding roles:', error);
//         res.status(500).json({
//             success: false,
//             message: error.message,
//         });
//     }
// });


// router.delete('/deleteImage', async(req, res)=>{
//     const imgUrl = req.query.img;
//     const urlArr = imgUrl.split('/');
//     const image = urlArr[urlArr.length - 1];
//     const imageName = image.split('.')[0];
//     const response = await cloudinary.uploader.destroy(imageName, (error, result)=>{

//     });
//     if(response){
//         res.status(200).send(response);
//     }
// })


module.exports = router;
