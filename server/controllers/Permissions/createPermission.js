const db = require('../../db');

const createPermission = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const {
            module,
            action,
            code,
            description,
            isActive = true
        } = req.body;

        // Validate required fields
        if (!module || !action || !code) {
            return res.status(400).json({
                success: false,
                message: 'Module, hành động và mã quyền là bắt buộc'
            });
        }

        // Validate code format (should be module.action)
        const expectedCode = `${module}.${action}`;
        if (code !== expectedCode) {
            return res.status(400).json({
                success: false,
                message: `Mã quyền phải theo định dạng: ${expectedCode}`
            });
        }

        // Validate module and action naming conventions
        const validModulePattern = /^[a-z_]+$/;
        const validActionPattern = /^[a-z_]+$/;
        
        if (!validModulePattern.test(module)) {
            return res.status(400).json({
                success: false,
                message: 'Module chỉ được chứa chữ cái thường và dấu gạch dưới'
            });
        }

        if (!validActionPattern.test(action)) {
            return res.status(400).json({
                success: false,
                message: 'Hành động chỉ được chứa chữ cái thường và dấu gạch dưới'
            });
        }

        // Check if permission code already exists
        const [existingPermissions] = await connection.execute(
            'SELECT id FROM permissions WHERE code = ?',
            [code]
        );

        if (existingPermissions.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Mã quyền đã tồn tại'
            });
        }

        // Check if module.action combination already exists (additional safety check)
        const [existingCombination] = await connection.execute(
            'SELECT id FROM permissions WHERE module = ? AND action = ?',
            [module, action]
        );

        if (existingCombination.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Tổ hợp module và hành động đã tồn tại'
            });
        }

        // Create permission
        const [permissionResult] = await connection.execute(
            `INSERT INTO permissions (module, action, code, description, is_active, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
            [module, action, code, description, isActive ? 1 : 0]
        );

        const permissionId = permissionResult.insertId;

        // Get created permission with additional info
        const [createdPermission] = await connection.execute(
            `SELECT 
                id,
                module,
                action,
                code,
                description,
                is_active,
                created_at,
                updated_at
            FROM permissions 
            WHERE id = ?`,
            [permissionId]
        );

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, new_values, status, ip_address, user_agent, created_at)
             VALUES (?, ?, 'CREATE', 'PERMISSION', ?, ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                permissionId.toString(),
                JSON.stringify({ module, action, code, description, isActive }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Tạo quyền thành công',
            data: {
                permission: createdPermission[0]
            }
        });

    } catch (error) {
        console.error('Error creating permission:', error);
        
        // Log failed access
        await connection.execute(
            `INSERT INTO access_logs (user_id, username, action_type, object_type, status, failure_reason, ip_address, user_agent, created_at)
             VALUES (?, ?, 'CREATE', 'PERMISSION', 'FAILURE', ?, ?, ?, NOW())`,
            [
                req.user?.userId,
                req.user?.username,
                error.message,
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo quyền',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = { createPermission };