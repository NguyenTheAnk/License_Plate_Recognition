
const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const {onlyAdminAccess} = require('../middlewares//adminMiddleware.js');
const checkPermission = require('../middlewares/checkPermission');
const permissionController = require('../controllers/admin/permissionController');
var permissionEditId;
// router.get(`/`, async (req, res) => {
//     try{
//         const page = parseInt(req.query.page) || 1;
//         const perPage = req.query.perPage;
//         const totalPosts = await Permissions.countDocuments();
//         const totalPages = Math.ceil(totalPosts / perPage);

//         if(page > totalPages){
//             return res.status(404).json({message: "No data found!"})
//         }

//         let permissionList = [];
//         if(req.query.page !==undefined && req.query.perPage !==undefined){
//             permissionList = await Permissions.find()
//             .skip((page -1)* perPage)
//             .limit(perPage)
//             .exec();
//         }
//         else{
//             permissionList = await Permissions.find()
//             .exec();
//         }
        

//         if(!permissionList){
//             res.status(500).json({success: false})
//         }

//         return res.status(200).json({
//             "permissionList": permissionList,
//             "totalPages": totalPages,
//             "totalPosts": totalPosts,
//             "page": page
//         });

//     }catch(error){
//         res.status(500).json({success: false})
//     }

// });
// router.get(`/:id`, async (req, res) => {
//     router.get('/:id', async (req, res) => {
//         try {
//             const permission = await Permissions.findById(req.params.id);
            
//             if (!permission) {
//                 return res.status(404).json({
//                     success: false,
//                     message: 'Permission with the given ID was not found'
//                 });
//             }
    
//             return res.status(200).json({
//                 success: true,
//                 data: permission
//             });
    
//         } catch (error) {
//             return res.status(500).json({
//                 success: false,
//                 message: 'Error retrieving permission',
//                 error: error.message
//             });
//         }
//     });
// })
// router.post('/create', async (req, res) => {

//     permission = new Permissions({
//         permissionTitle: req.body.permissionTitle,
//         permissionConstantName: req.body.permissionConstantName
//     });
//     permission = await permission.save();
//     if(!permission){
//         res.status(500).json({
//             error: err,
//             success: false
//         })
//     }
//     res.status(201).json(permission);
// });

// router.delete(`/:id`, async (req, res) => {
//     const deletedPermission = await Permissions.findByIdAndDelete(req.params.id);
//     if(!deletedPermission){
//         res.status(404).json({
//             message: 'Permission not found!',
//             success: false
//         })
//     }

//     res.status(200).json({
//         success: true,
//         message: 'Permission Deleted!'
//     })
// });
// router.put('/:id', async (req, res) => {


//     const permission = await Permissions.findByIdAndUpdate(
//         req.params.id,{
//             permissionTitle: req.body.permissionTitle,
//             permissionConstantName: req.body.permissionConstantName
//         },
//         {new: true}
//         )
//         if(!permission) {
//             return res.status(500).json({
//                 message: 'Permission cannot be updated',
//                 success: false
//             })
//         }
//         res.send(permission);
// });


router.get('/', auth, permissionController.getAllPermissions);
router.get('/:id', auth, permissionController.getPermissionById);
router.post('/', auth, permissionController.createPermission);
router.put('/:id', auth, permissionController.updatePermission);
router.delete('/:id', auth, permissionController.deletePermission);

module.exports = router;
