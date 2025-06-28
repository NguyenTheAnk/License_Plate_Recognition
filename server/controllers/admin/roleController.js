const db = require('../../db');

const storeRole = async (req, res) => {
  try {
    // Validate incoming request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        msg: 'Validation errors',
        errors: errors.array(),
      });
    }

    const { name, description, permissions } = req.body;

    // Validate permissions if provided
    if (permissions && permissions.length > 0) {
      const validModules = await Permissions.find({
        _id: { $in: permissions }
      });

      // Check if all requested permissions are valid
      if (validModules.length !== permissions.length) {
        return res.status(400).json({
          success: false,
          msg: 'Some permissions are invalid',
        });
      }
    }

    // Create a new role instance
    const role = new Roles({
      name,
      description,
      permissions: permissions || []
    });

    // Save the role to the database
    const roleData = await role.save();
    const populatedRole = await Roles.findById(roleData._id).populate('permissions');
    // Respond with success message and role data
    return res.status(201).json({
      success: true,
      msg: 'Role created successfully',
      data: populatedRole
    });
  } catch (error) {
    // Handle unexpected errors
    console.error(error); // Log the error for debugging purposes
    return res.status(500).json({
      success: false,
      msg: 'An error occurred while creating the role',
      error: error.message
    });
  }
};


const getRoles = async (req, res) => {
  try {
    const roles = await Roles.find().populate({
      path: 'permissions',
      select: 'module action description code'
    });

    return res.status(200).json({
      success: true,
      msg: 'Roles fetched successfully',
      data: roles
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: error.message
    });
  }
};
const getRoleById = async (req, res) => {
  try {
    const { roleId } = req.params; // Lấy roleId từ URL parameter

    // Tìm role theo ID và populate thông tin permissions
    const role = await Roles.findById(roleId).populate({
      path: 'permissions',
      select: 'module action description code'
    });

    // Kiểm tra nếu không tìm thấy role
    if (!role) {
      return res.status(404).json({
        success: false,
        msg: 'Role not found'
      });
    }

    return res.status(200).json({
      success: true,
      msg: 'Role fetched successfully',
      data: role
    });
  } catch (error) {
    // Xử lý lỗi nếu có
    return res.status(500).json({
      success: false,
      msg: error.message
    });
  }
};

// const viewRole = async (req, res) => {
//   try {
//     const { roleId } = req.params;

//     if (!mongoose.Types.ObjectId.isValid(roleId)) {
//       return res.status(400).json({
//         success: false,
//         msg: 'Invalid Role ID',
//       });
//     }

//     const role = await Roles.findById(roleId).populate({
//       path: 'modules',
//       select: 'module_name description',
//       populate: {
//         path: 'permissions',
//         select: 'permission_name permission_contantName'
//       }
//     });

//     if (!role) {
//       return res.status(404).json({
//         success: false,
//         msg: 'Role not found',
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       msg: 'Role fetched successfully',
//       data: role
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       msg: error.message
//     });
//   }
// };

// const updateRole = async (req, res) => {
//   try {
//     const { roleId } = req.params;
//     const { name, description, permissions } = req.body;

//     if (!mongoose.Types.ObjectId.isValid(roleId)) {
//       return res.status(400).json({
//         success: false,
//         msg: 'Invalid Role ID',
//       });
//     }

//     // Validate modules
//     if (permissions && permissions.length > 0) {
//       const validModules = await Permissions.find({
//         _id: { $in: permissions }
//       });

//       if (validModules.length !== permissions.length) {
//         return res.status(400).json({
//           success: false,
//           msg: 'Some permissions are invalid',
//         });
//       }
//     }

//     const updatedRole = await Roles.findByIdAndUpdate(
//       roleId,
//       { name, description, permissions: permissions || [] },
//       {
//         new: true,
//         runValidators: true
//       }
//     );

//     if (!updatedRole) {
//       return res.status(404).json({
//         success: false,
//         msg: 'Role not found',
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       msg: 'Role updated successfully',
//       data: updatedRole
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       msg: error.message
//     });
//   }
// };

const updateRole = async (req, res) => {
  try {
    const { roleId } = req.params;
    const { name, description, permissions } = req.body;

    // Validate roleId
    if (!mongoose.Types.ObjectId.isValid(roleId)) {
      return res.status(400).json({
        success: false,
        msg: 'Invalid Role ID',
      });
    }

    // Fetch the existing role to get current permissions
    const existingRole = await Roles.findById(roleId);
    if (!existingRole) {
      return res.status(404).json({
        success: false,
        msg: 'Role not found',
      });
    }

    // Validate modules if permissions are provided
    if (permissions && permissions.length > 0) {
      const validModules = await Permissions.find({
        _id: { $in: permissions }
      });

      if (validModules.length !== permissions.length) {
        return res.status(400).json({
          success: false,
          msg: 'Some permissions are invalid',
        });
      }
    }

    // Update the role with new data
    const updatedRole = await Roles.findByIdAndUpdate(
      roleId,
      {
        name,
        description,
        permissions: permissions || existingRole.permissions // Use existing permissions if none provided
      },
      {
        new: true,
        runValidators: true
      }
    );

    return res.status(200).json({
      success: true,
      msg: 'Role updated successfully',
      data: updatedRole
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: error.message
    });
  }
};

const deleteRole = async (req, res) => {
  try {
    const { roleId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(roleId)) {
      return res.status(400).json({
        success: false,
        msg: 'Invalid Role ID',
      });
    }

    const deletedRole = await Roles.findByIdAndDelete(roleId);

    if (!deletedRole) {
      return res.status(404).json({
        success: false,
        msg: 'Role not found',
      });
    }

    return res.status(200).json({
      success: true,
      msg: 'Role deleted successfully',
      data: deletedRole
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: error.message
    });
  }
};



const addModulesToRole = async (req, res) => {
  try {
    const { roleId } = req.params;
    const { modules } = req.body;

    // Validate Role ID
    if (!mongoose.Types.ObjectId.isValid(roleId)) {
      return res.status(400).json({
        success: false,
        msg: 'Invalid Role ID',
      });
    }

    // Find the role
    const role = await Roles.findById(roleId);
    if (!role) {
      return res.status(404).json({
        success: false,
        msg: 'Role not found',
      });
    }

    // Validate modules input
    if (!modules || !Array.isArray(modules)) {
      return res.status(400).json({
        success: false,
        msg: 'Invalid modules input',
      });
    }

    // Process and validate each module
    const processedModules = [];
    for (const moduleItem of modules) {
      // Validate module ID
      if (!mongoose.Types.ObjectId.isValid(moduleItem.moduleId)) {
        return res.status(400).json({
          success: false,
          msg: `Invalid Module ID: ${moduleItem.moduleId}`,
        });
      }

      // Find the module
      const module = await Module.findById(moduleItem.moduleId);
      if (!module) {
        return res.status(404).json({
          success: false,
          msg: `Module not found: ${moduleItem.moduleId}`,
        });
      }

      // Validate permissions if provided
      const permissionsToAdd = [];
      if (moduleItem.permissions && moduleItem.permissions.length > 0) {
        for (const permissionId of moduleItem.permissions) {
          // Validate permission ID
          if (!mongoose.Types.ObjectId.isValid(permissionId)) {
            return res.status(400).json({
              success: false,
              msg: `Invalid Permission ID: ${permissionId}`,
            });
          }

          // Check if permission exists in the module
          const isPermissionInModule = module.permissions.some(
            (modulePermission) => modulePermission.toString() === permissionId
          );

          if (!isPermissionInModule) {
            return res.status(400).json({
              success: false,
              msg: `Permission ${permissionId} does not belong to module ${module._id}`,
            });
          }

          permissionsToAdd.push(permissionId);
        }
      } else {
        // If no specific permissions, add all module permissions
        permissionsToAdd.push(...module.permissions);
      }

      processedModules.push({
        moduleId: module._id,
        permissions: permissionsToAdd,
      });
    }

    // Update role with new modules
    role.modules = processedModules;
    const updatedRole = await role.save();

    return res.status(200).json({
      success: true,
      msg: 'Modules added to role successfully',
      data: updatedRole,
    });
  } catch (error) {
    console.error('Error adding modules to role:', error);
    return res.status(500).json({
      success: false,
      msg: error.message,
    });
  }
};

// Function to get all modules and permissions for a role
const getModulesToRole = async (req, res) => {
  try {
    const { roleId } = req.params;

    // Validate Role ID
    if (!mongoose.Types.ObjectId.isValid(roleId)) {
      return res.status(400).json({
        success: false,
        msg: 'Invalid Role ID',
      });
    }

    // Find the role and populate modules and permissions
    const role = await Roles.findById(roleId)
      .populate({
        path: 'modules.moduleId',
        model: 'Module',
        select: 'module_name description', // Select specific module fields
        populate: {
          path: 'permissions',
          model: 'Permissions',
          select: 'permission_name permission_contantName' // Select specific permission fields
        }
      })
      .populate({
        path: 'modules.permissions',
        model: 'Permissions',
        select: 'permission_name permission_contantName' // Select specific permission fields
      });

    // Check if role exists
    if (!role) {
      return res.status(404).json({
        success: false,
        msg: 'Role not found',
      });
    }

    // Transform the result to a more readable format
    const roleModules = role.modules.map(moduleEntry => ({
      module: {
        id: moduleEntry.moduleId._id,
        name: moduleEntry.moduleId.module_name,
        description: moduleEntry.moduleId.description
      },
      permissions: moduleEntry.permissions.map(permission => ({
        id: permission._id,
        name: permission.permission_name,
        contentName: permission.permission_contantName
      }))
    }));

    return res.status(200).json({
      success: true,
      msg: 'Role modules retrieved successfully',
      data: {
        roleId: role._id,
        roleName: role.role_name,
        modules: roleModules
      }
    });
  } catch (error) {
    console.error('Error retrieving role modules:', error);
    return res.status(500).json({
      success: false,
      msg: error.message,
    });
  }
};
const updateRolePermissions = async (req, res) => {
  try {
    const { roleId } = req.params; // Lấy roleId từ URL
    const { permissionIds } = req.body; // Danh sách ID permissions cần cập nhật

    // Kiểm tra dữ liệu đầu vào
    if (!mongoose.Types.ObjectId.isValid(roleId)) {
      return res.status(400).json({ success: false, msg: 'Invalid Role ID' });
    }

    if (!Array.isArray(permissionIds) || !permissionIds.every(id => mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ success: false, msg: 'Invalid Permission IDs' });
    }

    // Tìm role
    const role = await Roles.findById(roleId);
    if (!role) {
      return res.status(404).json({ success: false, msg: 'Role not found' });
    }

    // Kiểm tra các permissionIds có tồn tại trong bảng Permissions
    const validPermissions = await Permissions.find({ _id: { $in: permissionIds } });
    if (validPermissions.length !== permissionIds.length) {
      return res.status(400).json({ success: false, msg: 'Some Permission IDs are invalid' });
    }

    // Cập nhật permissions cho role
    role.permissions = permissionIds;
    await role.save();

    // Lấy lại thông tin permissions để trả về
    const updatedPermissions = await Permissions.find({ _id: { $in: permissionIds } });

    return res.status(200).json({
      success: true,
      msg: 'Permissions updated successfully',
      data: {
        roleId: role._id,
        roleName: role.role_name, // Nếu bạn có trường tên role
        permissions: updatedPermissions.map(perm => ({
          id: perm._id,
          name: perm.permission_name,
        })),
      },
    });
  } catch (error) {
    console.error('Error updating role permissions:', error);
    return res.status(500).json({ success: false, msg: 'Server error', error: error.message });
  }
};

const getRolePermissionsWithRemaining = async (req, res) => {
  try {
    const { roleId } = req.params;

    // Kiểm tra ID role hợp lệ
    if (!mongoose.Types.ObjectId.isValid(roleId)) {
      return res.status(400).json({ success: false, msg: 'Invalid Role ID' });
    }

    // Tìm role và populate permissions
    const role = await Roles.findById(roleId).populate('permissions');
    if (!role) {
      return res.status(404).json({ success: false, msg: 'Role not found' });
    }

    // Lấy tất cả permissions
    const allPermissions = await Permissions.find();

    // Phân loại permissions thành hai nhóm
    const currentPermissions = allPermissions.filter(permission =>
      role.permissions.some(rolePerm => rolePerm._id.equals(permission._id))
    );

    const remainingPermissions = allPermissions.filter(permission =>
      !role.permissions.some(rolePerm => rolePerm._id.equals(permission._id))
    );

    return res.status(200).json({
      success: true,
      data: {
        currentPermissions: currentPermissions.map(perm => ({
          id: perm._id,
          name: perm.permission_name,
        })),
        remainingPermissions: remainingPermissions.map(perm => ({
          id: perm._id,
          name: perm.permission_name,
        })),
      },
    });
  } catch (error) {
    console.error('Error retrieving role permissions:', error);
    return res.status(500).json({ success: false, msg: 'Server error', error: error.message });
  }
};


module.exports = {
  storeRole,
  getRoles,
  updateRole,
  deleteRole,
  getRoleById,
  addModulesToRole,
  getModulesToRole,
  updateRolePermissions,
  getRolePermissionsWithRemaining
};