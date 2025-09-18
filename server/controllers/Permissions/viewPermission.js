const db = require('../../db');

// Get permission usage analytics
const getPermissionUsageAnalytics = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { 
            period = '30', // days
            groupBy = 'module' // 'module', 'action', 'permission'
        } = req.query;

        const periodDays = parseInt(period);
        
        // Get most used permissions
        const [mostUsedPermissions] = await connection.execute(`
            SELECT 
                p.id,
                p.module,
                p.action,
                p.code,
                p.description,
                COUNT(DISTINCT rp.role_id) as roles_count,
                COUNT(DISTINCT ur.user_id) as users_count,
                GROUP_CONCAT(DISTINCT r.name ORDER BY r.name) as role_names
            FROM permissions p
            JOIN role_permissions rp ON p.id = rp.permission_id AND rp.granted = 1
            JOIN roles r ON rp.role_id = r.id AND r.is_active = 1
            LEFT JOIN user_roles ur ON rp.role_id = ur.role_id AND ur.is_active = 1
            WHERE p.is_active = 1
            GROUP BY p.id
            ORDER BY COUNT(DISTINCT rp.role_id) DESC, COUNT(DISTINCT ur.user_id) DESC
            LIMIT 10
        `);

        // Get unused permissions
        const [unusedPermissions] = await connection.execute(`
            SELECT 
                p.id,
                p.module,
                p.action,
                p.code,
                p.description,
                p.created_at,
                DATEDIFF(NOW(), p.created_at) as days_since_created
            FROM permissions p
            LEFT JOIN role_permissions rp ON p.id = rp.permission_id
            WHERE p.is_active = 1 AND rp.id IS NULL
            ORDER BY p.created_at DESC
        `);

        // Get permissions by module statistics
        const [moduleStats] = await connection.execute(`
            SELECT 
                p.module,
                COUNT(*) as total_permissions,
                COUNT(CASE WHEN p.is_active = 1 THEN 1 END) as active_permissions,
                COUNT(DISTINCT rp.role_id) as assigned_roles,
                COUNT(DISTINCT ur.user_id) as affected_users,
                ROUND(AVG(CASE WHEN rp.id IS NOT NULL THEN 1 ELSE 0 END) * 100, 2) as usage_rate_percent
            FROM permissions p
            LEFT JOIN role_permissions rp ON p.id = rp.permission_id AND rp.granted = 1
            LEFT JOIN user_roles ur ON rp.role_id = ur.role_id AND ur.is_active = 1
            GROUP BY p.module
            ORDER BY COUNT(*) DESC
        `);

        // Get permissions by action statistics
        const [actionStats] = await connection.execute(`
            SELECT 
                p.action,
                COUNT(*) as total_permissions,
                COUNT(CASE WHEN p.is_active = 1 THEN 1 END) as active_permissions,
                COUNT(DISTINCT rp.role_id) as assigned_roles,
                COUNT(DISTINCT ur.user_id) as affected_users,
                COUNT(DISTINCT p.module) as modules_using
            FROM permissions p
            LEFT JOIN role_permissions rp ON p.id = rp.permission_id AND rp.granted = 1
            LEFT JOIN user_roles ur ON rp.role_id = ur.role_id AND ur.is_active = 1
            GROUP BY p.action
            ORDER BY COUNT(*) DESC
        `);

        // Get recent permission access logs
        const [recentAccess] = await connection.execute(`
            SELECT 
                al.action_type,
                al.object_id,
                al.created_at,
                u.name as user_name,
                u.username,
                p.code as permission_code,
                p.module,
                p.action,
                al.status
            FROM access_logs al
            JOIN users u ON al.user_id = u.id
            LEFT JOIN permissions p ON al.object_id = p.id
            WHERE al.object_type = 'PERMISSION' 
            AND al.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            ORDER BY al.created_at DESC
            LIMIT 20
        `, [periodDays]);

        // Get overall statistics
        const [overallStats] = await connection.execute(`
            SELECT 
                COUNT(*) as total_permissions,
                COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_permissions,
                COUNT(CASE WHEN is_active = 0 THEN 1 END) as inactive_permissions,
                COUNT(DISTINCT module) as total_modules,
                COUNT(DISTINCT action) as total_actions
            FROM permissions
        `);

        const [usageStats] = await connection.execute(`
            SELECT 
                COUNT(DISTINCT p.id) as used_permissions,
                COUNT(DISTINCT rp.role_id) as roles_with_permissions,
                COUNT(DISTINCT ur.user_id) as users_with_permissions
            FROM permissions p
            JOIN role_permissions rp ON p.id = rp.permission_id AND rp.granted = 1
            JOIN user_roles ur ON rp.role_id = ur.role_id AND ur.is_active = 1
            WHERE p.is_active = 1
        `);

        // Get permission creation trend (last 30 days)
        const [creationTrend] = await connection.execute(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as permissions_created
            FROM permissions 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY DATE(created_at)
            ORDER BY date DESC
        `);

        // Log access
        await connection.execute(
            `INSERT INTO access_logs (log_uuid, user_id, username, action_type, object_type, status, ip_address, user_agent, created_at)
             VALUES (UUID(), ?, ?, 'VIEW', 'PERMISSION_ANALYTICS', 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Lấy thống kê quyền thành công',
            data: {
                mostUsedPermissions,
                unusedPermissions,
                moduleStats,
                actionStats,
                recentAccess,
                creationTrend,
                overallStats: {
                    ...overallStats[0],
                    ...usageStats[0],
                    usage_percentage: overallStats[0].total_permissions > 0 
                        ? ((usageStats[0].used_permissions / overallStats[0].total_permissions) * 100).toFixed(2)
                        : 0
                },
                period: {
                    days: periodDays,
                    from: new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString(),
                    to: new Date().toISOString()
                }
            }
        });

    } catch (error) {
        console.error('Error getting permission analytics:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thống kê quyền',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Export permissions to various formats
const exportPermissions = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { 
            format = 'json', // 'json', 'csv', 'xlsx'
            includeUsageStats = 'false',
            includeRoles = 'false',
            filters = '{}'
        } = req.query;

        let parsedFilters = {};
        try {
            parsedFilters = JSON.parse(filters);
        } catch (error) {
            parsedFilters = {};
        }

        let whereConditions = [];
        let queryParams = [];

        // Apply filters
        if (parsedFilters.module) {
            whereConditions.push('p.module = ?');
            queryParams.push(parsedFilters.module);
        }

        if (parsedFilters.action) {
            whereConditions.push('p.action = ?');
            queryParams.push(parsedFilters.action);
        }

        if (parsedFilters.isActive !== undefined) {
            whereConditions.push('p.is_active = ?');
            queryParams.push(parsedFilters.isActive ? 1 : 0);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Build query based on requirements
        let selectQuery = `
            SELECT 
                p.id,
                p.module,
                p.action,
                p.code,
                p.description,
                p.is_active,
                p.created_at,
                p.updated_at
        `;

        let joinClause = '';

        if (includeUsageStats === 'true') {
            selectQuery += `,
                COALESCE(rp_stats.total_roles, 0) as total_roles,
                COALESCE(rp_stats.granted_roles, 0) as granted_roles,
                COALESCE(rp_stats.denied_roles, 0) as denied_roles,
                COALESCE(ur_stats.affected_users, 0) as affected_users
            `;
            joinClause = `
                LEFT JOIN (
                    SELECT 
                        permission_id,
                        COUNT(*) as total_roles,
                        COUNT(CASE WHEN granted = 1 THEN 1 END) as granted_roles,
                        COUNT(CASE WHEN granted = 0 THEN 1 END) as denied_roles
                    FROM role_permissions 
                    GROUP BY permission_id
                ) rp_stats ON p.id = rp_stats.permission_id
                LEFT JOIN (
                    SELECT 
                        rp.permission_id,
                        COUNT(DISTINCT ur.user_id) as affected_users
                    FROM role_permissions rp
                    JOIN user_roles ur ON rp.role_id = ur.role_id AND ur.is_active = 1
                    WHERE rp.granted = 1
                    GROUP BY rp.permission_id
                ) ur_stats ON p.id = ur_stats.permission_id
            `;
        }

        if (includeRoles === 'true') {
            selectQuery += `,
                GROUP_CONCAT(
                    DISTINCT CASE WHEN rp.granted = 1 
                    THEN CONCAT(r.name, ':granted') 
                    ELSE CONCAT(r.name, ':denied') 
                    END 
                    ORDER BY r.name SEPARATOR ', '
                ) as assigned_roles
            `;
            joinClause += `
                LEFT JOIN role_permissions rp ON p.id = rp.permission_id
                LEFT JOIN roles r ON rp.role_id = r.id AND r.is_active = 1
            `;
        }

        const groupByClause = includeRoles === 'true' ? 'GROUP BY p.id' : '';

        const [permissions] = await connection.execute(`
            ${selectQuery}
            FROM permissions p
            ${joinClause}
            ${whereClause}
            ${groupByClause}
            ORDER BY p.module, p.action
        `, queryParams);

        // Log export access
        await connection.execute(
            `INSERT INTO access_logs (log_uuid, user_id, username, action_type, object_type, request_data, status, ip_address, user_agent, created_at)
             VALUES (UUID(), ?, ?, 'EXPORT', 'PERMISSION', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                JSON.stringify({ format, includeUsageStats, includeRoles, filters: parsedFilters }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        // Return data based on format
        switch (format.toLowerCase()) {
            case 'csv':
                res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                res.setHeader('Content-Disposition', 'attachment; filename=permissions.csv');
                
                // Convert to CSV
                if (permissions.length > 0) {
                    const headers = Object.keys(permissions[0]).join(',');
                    const rows = permissions.map(permission => 
                        Object.values(permission).map(value => {
                            if (value === null || value === undefined) return '';
                            const stringValue = String(value);
                            // Escape quotes and wrap in quotes if contains comma, quote, or newline
                            if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                                return `"${stringValue.replace(/"/g, '""')}"`;
                            }
                            return stringValue;
                        }).join(',')
                    ).join('\n');
                    res.send(`\uFEFF${headers}\n${rows}`); // Add BOM for UTF-8
                } else {
                    res.send('No data available');
                }
                break;

            case 'xlsx':
                // Note: In a real implementation, you'd use a library like xlsx or exceljs
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', 'attachment; filename=permissions.xlsx');
                res.status(501).json({
                    success: false,
                    message: 'XLSX export chưa được implement. Vui lòng sử dụng JSON hoặc CSV.',
                    note: 'Để implement XLSX, cần cài đặt thư viện như xlsx hoặc exceljs'
                });
                break;

            default: // json
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.setHeader('Content-Disposition', 'attachment; filename=permissions.json');
                res.status(200).json({
                    success: true,
                    message: 'Xuất dữ liệu quyền thành công',
                    data: {
                        permissions,
                        exportInfo: {
                            format,
                            exportedAt: new Date().toISOString(),
                            exportedBy: req.user.username,
                            totalRecords: permissions.length,
                            filters: parsedFilters,
                            includeUsageStats: includeUsageStats === 'true',
                            includeRoles: includeRoles === 'true'
                        }
                    }
                });
                break;
        }

    } catch (error) {
        console.error('Error exporting permissions:', error);
        
        // Log failed export
        await connection.execute(
            `INSERT INTO access_logs (log_uuid, user_id, username, action_type, object_type, status, failure_reason, ip_address, user_agent, created_at)
             VALUES (UUID(), ?, ?, 'EXPORT', 'PERMISSION', 'FAILURE', ?, ?, ?, NOW())`,
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
            message: 'Lỗi khi xuất dữ liệu quyền',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Compare permissions between roles
const compareRolePermissions = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { roleIds } = req.query;

        if (!roleIds) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng cung cấp danh sách ID vai trò'
            });
        }

        const roleIdArray = roleIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

        if (roleIdArray.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Cần ít nhất 2 vai trò để so sánh'
            });
        }

        if (roleIdArray.length > 5) {
            return res.status(400).json({
                success: false,
                message: 'Chỉ có thể so sánh tối đa 5 vai trò cùng lúc'
            });
        }

        // Get role information
        const rolePlaceholders = roleIdArray.map(() => '?').join(',');
        const [roles] = await connection.execute(
            `SELECT id, name, description, level FROM roles WHERE id IN (${rolePlaceholders}) AND is_active = 1`,
            roleIdArray
        );

        if (roles.length !== roleIdArray.length) {
            return res.status(400).json({
                success: false,
                message: 'Một số vai trò không tồn tại hoặc không hoạt động'
            });
        }

        // Get all permissions with role assignments
        const [permissionComparison] = await connection.execute(`
            SELECT 
                p.id,
                p.module,
                p.action,
                p.code,
                p.description,
                ${roleIdArray.map(roleId => 
                    `MAX(CASE WHEN rp.role_id = ${roleId} THEN 
                        CASE WHEN rp.granted = 1 THEN 'granted' 
                             WHEN rp.granted = 0 THEN 'denied' 
                             ELSE NULL END 
                     ELSE NULL END) as role_${roleId}`
                ).join(', ')}
            FROM permissions p
            LEFT JOIN role_permissions rp ON p.id = rp.permission_id AND rp.role_id IN (${rolePlaceholders})
            WHERE p.is_active = 1
            GROUP BY p.id
            ORDER BY p.module, p.action
        `, roleIdArray);

        // Analyze differences
        const analysis = {
            commonPermissions: [],
            uniquePermissions: {},
            conflictingPermissions: [],
            statistics: {}
        };

        // Initialize unique permissions for each role
        roles.forEach(role => {
            analysis.uniquePermissions[role.id] = [];
            analysis.statistics[role.id] = {
                roleName: role.name,
                roleLevel: role.level,
                totalGranted: 0,
                totalDenied: 0,
                totalUnassigned: 0
            };
        });

        permissionComparison.forEach(permission => {
            const roleStatuses = roleIdArray.map(roleId => permission[`role_${roleId}`]);
            const grantedCount = roleStatuses.filter(status => status === 'granted').length;
            const deniedCount = roleStatuses.filter(status => status === 'denied').length;
            const unassignedCount = roleStatuses.filter(status => status === null).length;

            // Update statistics
            roleIdArray.forEach((roleId, index) => {
                const status = roleStatuses[index];
                if (status === 'granted') {
                    analysis.statistics[roleId].totalGranted++;
                } else if (status === 'denied') {
                    analysis.statistics[roleId].totalDenied++;
                } else {
                    analysis.statistics[roleId].totalUnassigned++;
                }
            });

            // Check if all roles have the same permission status
            if (grantedCount === roleIdArray.length) {
                analysis.commonPermissions.push({
                    ...permission,
                    status: 'granted'
                });
            } else if (deniedCount === roleIdArray.length) {
                analysis.commonPermissions.push({
                    ...permission,
                    status: 'denied'
                });
            } else if (unassignedCount === roleIdArray.length) {
                analysis.commonPermissions.push({
                    ...permission,
                    status: 'unassigned'
                });
            } else {
                // There are differences
                if (grantedCount > 0 && (deniedCount > 0 || unassignedCount > 0)) {
                    analysis.conflictingPermissions.push(permission);
                }

                // Find unique permissions for each role
                roleIdArray.forEach((roleId, index) => {
                    const status = roleStatuses[index];
                    const otherStatuses = roleStatuses.filter((_, i) => i !== index);
                    
                    if (status === 'granted' && !otherStatuses.includes('granted')) {
                        analysis.uniquePermissions[roleId].push({
                            ...permission,
                            uniqueStatus: 'granted'
                        });
                    }
                });
            }
        });

        // Calculate similarity matrix
        const similarityMatrix = {};
        for (let i = 0; i < roleIdArray.length; i++) {
            for (let j = i + 1; j < roleIdArray.length; j++) {
                const role1Id = roleIdArray[i];
                const role2Id = roleIdArray[j];
                
                let matchCount = 0;
                let totalComparisons = 0;
                
                permissionComparison.forEach(permission => {
                    const status1 = permission[`role_${role1Id}`];
                    const status2 = permission[`role_${role2Id}`];
                    
                    if (status1 !== null || status2 !== null) {
                        totalComparisons++;
                        if (status1 === status2) {
                            matchCount++;
                        }
                    }
                });
                
                const similarity = totalComparisons > 0 ? (matchCount / totalComparisons * 100).toFixed(2) : 0;
                
                if (!similarityMatrix[role1Id]) similarityMatrix[role1Id] = {};
                if (!similarityMatrix[role2Id]) similarityMatrix[role2Id] = {};
                
                similarityMatrix[role1Id][role2Id] = similarity;
                similarityMatrix[role2Id][role1Id] = similarity;
            }
        }

        // Log comparison access
        await connection.execute(
            `INSERT INTO access_logs (log_uuid, user_id, username, action_type, object_type, request_data, status, ip_address, user_agent, created_at)
             VALUES (UUID(), ?, ?, 'VIEW', 'PERMISSION_COMPARISON', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                JSON.stringify({ roleIds: roleIdArray }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: 'So sánh quyền giữa các vai trò thành công',
            data: {
                roles,
                comparison: analysis,
                similarityMatrix,
                summary: {
                    totalPermissions: permissionComparison.length,
                    commonPermissions: analysis.commonPermissions.length,
                    conflictingPermissions: analysis.conflictingPermissions.length,
                    comparedRoles: roles.length,
                    averageSimilarity: Object.values(similarityMatrix).reduce((acc, roleMatrix) => {
                        const similarities = Object.values(roleMatrix);
                        return acc + similarities.reduce((sum, sim) => sum + parseFloat(sim), 0) / similarities.length;
                    }, 0) / roleIdArray.length
                }
            }
        });

    } catch (error) {
        console.error('Error comparing role permissions:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi so sánh quyền giữa các vai trò',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get permission hierarchy and dependencies
const getPermissionHierarchy = async (req, res) => {
    const connection = await db.promise();
    
    try {
        // Get all permissions grouped by module with action relationships
        const [permissionHierarchy] = await connection.execute(`
            SELECT 
                p.module,
                JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'id', p.id,
                        'action', p.action,
                        'code', p.code,
                        'description', p.description,
                        'is_active', p.is_active,
                        'usage_count', COALESCE(usage_stats.usage_count, 0),
                        'user_count', COALESCE(usage_stats.user_count, 0),
                        'priority_order', CASE p.action 
                            WHEN 'view' THEN 1
                            WHEN 'create' THEN 2
                            WHEN 'update' THEN 3
                            WHEN 'delete' THEN 4
                            ELSE 5
                        END
                    ) ORDER BY 
                        CASE p.action 
                            WHEN 'view' THEN 1
                            WHEN 'create' THEN 2
                            WHEN 'update' THEN 3
                            WHEN 'delete' THEN 4
                            ELSE 5
                        END, p.action
                ) as actions,
                COUNT(*) as total_actions,
                COUNT(CASE WHEN p.is_active = 1 THEN 1 END) as active_actions,
                ROUND(AVG(COALESCE(usage_stats.usage_count, 0)), 2) as avg_usage_per_action
            FROM permissions p
            LEFT JOIN (
                SELECT 
                    rp.permission_id,
                    COUNT(DISTINCT rp.role_id) as usage_count,
                    COUNT(DISTINCT ur.user_id) as user_count
                FROM role_permissions rp
                JOIN user_roles ur ON rp.role_id = ur.role_id AND ur.is_active = 1
                WHERE rp.granted = 1
                GROUP BY rp.permission_id
            ) usage_stats ON p.id = usage_stats.permission_id
            GROUP BY p.module
            ORDER BY p.module
        `);

        // Get action patterns across modules
        const [actionPatterns] = await connection.execute(`
            SELECT 
                action,
                COUNT(DISTINCT module) as module_count,
                COUNT(*) as total_permissions,
                GROUP_CONCAT(DISTINCT module ORDER BY module) as modules,
                ROUND(AVG(COALESCE(usage_stats.usage_count, 0)), 2) as avg_usage
            FROM permissions p
            LEFT JOIN (
                SELECT 
                    rp.permission_id,
                    COUNT(DISTINCT rp.role_id) as usage_count
                FROM role_permissions rp
                WHERE rp.granted = 1
                GROUP BY rp.permission_id
            ) usage_stats ON p.id = usage_stats.permission_id
            WHERE p.is_active = 1
            GROUP BY action
            ORDER BY COUNT(DISTINCT module) DESC, action
        `);

        // Get suggested permission dependencies (common patterns)
        const [dependencyPatterns] = await connection.execute(`
            SELECT 
                p1.module,
                p1.action as primary_action,
                p2.action as dependent_action,
                COUNT(*) as pattern_frequency,
                ROUND((COUNT(*) * 100.0 / role_total.total), 2) as frequency_percentage
            FROM permissions p1
            JOIN permissions p2 ON p1.module = p2.module AND p1.id != p2.id
            JOIN role_permissions rp1 ON p1.id = rp1.permission_id AND rp1.granted = 1
            JOIN role_permissions rp2 ON p2.id = rp2.permission_id AND rp2.granted = 1 AND rp1.role_id = rp2.role_id
            CROSS JOIN (
                SELECT COUNT(DISTINCT role_id) as total FROM role_permissions WHERE granted = 1
            ) role_total
            WHERE p1.is_active = 1 AND p2.is_active = 1
            GROUP BY p1.module, p1.action, p2.action, role_total.total
            HAVING pattern_frequency >= 2
            ORDER BY p1.module, pattern_frequency DESC
        `);

        // Get module relationships (modules that often have similar permission patterns)
        const [moduleRelationships] = await connection.execute(`
            SELECT 
                m1.module as module1,
                m2.module as module2,
                COUNT(*) as shared_roles,
                ROUND((COUNT(*) * 100.0 / GREATEST(m1.total_roles, m2.total_roles)), 2) as relationship_strength
            FROM (
                SELECT p.module, rp.role_id, COUNT(DISTINCT p.id) as permissions_count
                FROM permissions p
                JOIN role_permissions rp ON p.id = rp.permission_id AND rp.granted = 1
                WHERE p.is_active = 1
                GROUP BY p.module, rp.role_id
            ) r1
            JOIN (
                SELECT p.module, rp.role_id, COUNT(DISTINCT p.id) as permissions_count
                FROM permissions p
                JOIN role_permissions rp ON p.id = rp.permission_id AND rp.granted = 1
                WHERE p.is_active = 1
                GROUP BY p.module, rp.role_id
            ) r2 ON r1.role_id = r2.role_id AND r1.module < r2.module
            JOIN (
                SELECT module, COUNT(DISTINCT rp.role_id) as total_roles
                FROM permissions p
                JOIN role_permissions rp ON p.id = rp.permission_id AND rp.granted = 1
                WHERE p.is_active = 1
                GROUP BY module
            ) m1 ON r1.module = m1.module
            JOIN (
                SELECT module, COUNT(DISTINCT rp.role_id) as total_roles
                FROM permissions p
                JOIN role_permissions rp ON p.id = rp.permission_id AND rp.granted = 1
                WHERE p.is_active = 1
                GROUP BY module
            ) m2 ON r2.module = m2.module
            GROUP BY m1.module, m2.module, m1.total_roles, m2.total_roles
            HAVING shared_roles >= 2
            ORDER BY relationship_strength DESC
        `);

        // Get permission complexity score by module
        const [complexityAnalysis] = await connection.execute(`
            SELECT 
                p.module,
                COUNT(DISTINCT p.action) as action_variety,
                COUNT(*) as total_permissions,
                COUNT(DISTINCT rp.role_id) as roles_involved,
                ROUND(AVG(p.id), 2) as avg_permission_age_score,
                CASE 
                    WHEN COUNT(DISTINCT p.action) >= 5 THEN 'High'
                    WHEN COUNT(DISTINCT p.action) >= 3 THEN 'Medium'
                    ELSE 'Low'
                END as complexity_level
            FROM permissions p
            LEFT JOIN role_permissions rp ON p.id = rp.permission_id AND rp.granted = 1
            WHERE p.is_active = 1
            GROUP BY p.module
            ORDER BY action_variety DESC, total_permissions DESC
        `);

        // Get orphaned permissions (permissions that exist but are never used)
        const [orphanedPermissions] = await connection.execute(`
            SELECT 
                p.id,
                p.module,
                p.action,
                p.code,
                p.description,
                p.created_at,
                DATEDIFF(NOW(), p.created_at) as days_unused
            FROM permissions p
            LEFT JOIN role_permissions rp ON p.id = rp.permission_id
            WHERE p.is_active = 1 
            AND rp.id IS NULL
            ORDER BY p.created_at ASC
        `);

        // Get recommended permission structure improvements
        const [recommendations] = await connection.execute(`
            SELECT 
                'missing_view_permission' as recommendation_type,
                p.module,
                'Thiếu quyền view cơ bản' as description,
                CONCAT('Nên tạo quyền ', p.module, '.view') as suggestion
            FROM (
                SELECT DISTINCT module FROM permissions WHERE action != 'view' AND is_active = 1
            ) p
            WHERE NOT EXISTS (
                SELECT 1 FROM permissions 
                WHERE module = p.module AND action = 'view' AND is_active = 1
            )
            
            UNION ALL
            
            SELECT 
                'unused_module' as recommendation_type,
                p.module,
                CONCAT('Module có ', COUNT(*), ' quyền nhưng không được sử dụng') as description,
                'Cân nhắc xóa hoặc kích hoạt sử dụng' as suggestion
            FROM permissions p
            LEFT JOIN role_permissions rp ON p.id = rp.permission_id
            WHERE p.is_active = 1 AND rp.id IS NULL
            GROUP BY p.module
            HAVING COUNT(*) >= 3
            
            UNION ALL
            
            SELECT 
                'inconsistent_actions' as recommendation_type,
                incomplete.module,
                CONCAT('Module thiếu một số action chuẩn: ', GROUP_CONCAT(missing_actions.action)) as description,
                'Nên bổ sung các action còn thiếu để đồng nhất' as suggestion
            FROM (
                SELECT DISTINCT module 
                FROM permissions 
                WHERE is_active = 1
                GROUP BY module
                HAVING COUNT(DISTINCT action) < 4
            ) incomplete
            CROSS JOIN (
                SELECT 'view' as action UNION SELECT 'create' UNION SELECT 'update' UNION SELECT 'delete'
            ) missing_actions
            WHERE NOT EXISTS (
                SELECT 1 FROM permissions 
                WHERE module = incomplete.module 
                AND action = missing_actions.action 
                AND is_active = 1
            )
            GROUP BY incomplete.module
        `);

        res.status(200).json({
            success: true,
            message: 'Lấy cấu trúc phân cấp quyền thành công',
            data: {
                hierarchy: permissionHierarchy,
                actionPatterns,
                dependencyPatterns,
                moduleRelationships,
                complexityAnalysis,
                orphanedPermissions,
                recommendations,
                summary: {
                    totalModules: permissionHierarchy.length,
                    totalActionTypes: actionPatterns.length,
                    totalDependencyPatterns: dependencyPatterns.length,
                    totalModuleRelationships: moduleRelationships.length,
                    orphanedCount: orphanedPermissions.length,
                    recommendationCount: recommendations.length,
                    avgActionsPerModule: permissionHierarchy.length > 0 
                        ? (permissionHierarchy.reduce((sum, m) => sum + m.total_actions, 0) / permissionHierarchy.length).toFixed(2)
                        : 0
                }
            }
        });

    } catch (error) {
        console.error('Error getting permission hierarchy:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy cấu trúc phân cấp quyền',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Generate permission usage report
const generatePermissionReport = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const {
            reportType = 'summary', // 'summary', 'detailed', 'security', 'optimization'
            period = '30',
            format = 'json'
        } = req.query;

        const periodDays = parseInt(period);
        const report = {
            reportInfo: {
                type: reportType,
                period: periodDays,
                generatedAt: new Date().toISOString(),
                generatedBy: req.user.username
            }
        };

        switch (reportType) {
            case 'summary':
                // Executive summary report
                const [summaryStats] = await connection.execute(`
                    SELECT 
                        COUNT(*) as total_permissions,
                        COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_permissions,
                        COUNT(DISTINCT module) as total_modules,
                        COUNT(DISTINCT action) as total_actions
                    FROM permissions
                `);

                const [usageSummary] = await connection.execute(`
                    SELECT 
                        COUNT(DISTINCT p.id) as used_permissions,
                        COUNT(DISTINCT rp.role_id) as roles_using_permissions,
                        COUNT(DISTINCT ur.user_id) as users_affected
                    FROM permissions p
                    JOIN role_permissions rp ON p.id = rp.permission_id AND rp.granted = 1
                    JOIN user_roles ur ON rp.role_id = ur.role_id AND ur.is_active = 1
                    WHERE p.is_active = 1
                `);

                const [topModules] = await connection.execute(`
                    SELECT 
                        module,
                        COUNT(*) as permission_count,
                        COUNT(DISTINCT rp.role_id) as role_usage
                    FROM permissions p
                    LEFT JOIN role_permissions rp ON p.id = rp.permission_id AND rp.granted = 1
                    WHERE p.is_active = 1
                    GROUP BY module
                    ORDER BY COUNT(*) DESC
                    LIMIT 5
                `);

                report.summary = {
                    overview: summaryStats[0],
                    usage: usageSummary[0],
                    topModules
                };
                break;

            case 'detailed':
                // Detailed analysis report
                const [detailedStats] = await connection.execute(`
                    SELECT 
                        p.module,
                        p.action,
                        COUNT(*) as permission_count,
                        COUNT(DISTINCT rp.role_id) as roles_assigned,
                        COUNT(DISTINCT ur.user_id) as users_affected,
                        GROUP_CONCAT(DISTINCT r.name ORDER BY r.name) as role_names
                    FROM permissions p
                    LEFT JOIN role_permissions rp ON p.id = rp.permission_id AND rp.granted = 1
                    LEFT JOIN roles r ON rp.role_id = r.id AND r.is_active = 1
                    LEFT JOIN user_roles ur ON rp.role_id = ur.role_id AND ur.is_active = 1
                    WHERE p.is_active = 1
                    GROUP BY p.module, p.action
                    ORDER BY p.module, p.action
                `);

                const [permissionActivity] = await connection.execute(`
                    SELECT 
                        DATE(al.created_at) as activity_date,
                        al.action_type,
                        COUNT(*) as operation_count,
                        COUNT(DISTINCT al.user_id) as unique_users
                    FROM access_logs al
                    WHERE al.object_type = 'PERMISSION'
                    AND al.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                    GROUP BY DATE(al.created_at), al.action_type
                    ORDER BY activity_date DESC, al.action_type
                `, [periodDays]);

                report.detailed = {
                    moduleActionBreakdown: detailedStats,
                    recentActivity: permissionActivity
                };
                break;

            case 'security':
                // Security analysis report
                const [criticalPermissions] = await connection.execute(`
                    SELECT 
                        p.id,
                        p.code,
                        p.description,
                        COUNT(DISTINCT ur.user_id) as user_count,
                        GROUP_CONCAT(DISTINCT r.name ORDER BY r.name) as roles
                    FROM permissions p
                    JOIN role_permissions rp ON p.id = rp.permission_id AND rp.granted = 1
                    JOIN roles r ON rp.role_id = r.id AND r.is_active = 1
                    JOIN user_roles ur ON rp.role_id = ur.role_id AND ur.is_active = 1
                    WHERE p.is_active = 1
                    AND (p.action = 'delete' OR p.module IN ('users', 'roles', 'permissions'))
                    GROUP BY p.id
                    ORDER BY COUNT(DISTINCT ur.user_id) DESC
                `);

                const [privilegedUsers] = await connection.execute(`
                    SELECT 
                        u.id,
                        u.username,
                        u.name,
                        COUNT(DISTINCT p.id) as permission_count,
                        COUNT(DISTINCT CASE WHEN p.action = 'delete' THEN p.id END) as delete_permissions,
                        COUNT(DISTINCT CASE WHEN p.module IN ('users', 'roles', 'permissions') THEN p.id END) as admin_permissions
                    FROM users u
                    JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = 1
                    JOIN role_permissions rp ON ur.role_id = rp.role_id AND rp.granted = 1
                    JOIN permissions p ON rp.permission_id = p.id AND p.is_active = 1
                    WHERE u.status = 'active'
                    GROUP BY u.id
                    HAVING permission_count > 10
                    ORDER BY permission_count DESC
                    LIMIT 10
                `);

                const [securityAlerts] = await connection.execute(`
                    SELECT 
                        'unused_critical_permission' as alert_type,
                        p.code as subject,
                        'Quyền quan trọng không được sử dụng' as message,
                        'medium' as severity
                    FROM permissions p
                    LEFT JOIN role_permissions rp ON p.id = rp.permission_id
                    WHERE p.is_active = 1
                    AND p.module IN ('users', 'roles', 'permissions')
                    AND rp.id IS NULL
                    
                    UNION ALL
                    
                    SELECT 
                        'excessive_permissions' as alert_type,
                        u.username as subject,
                        CONCAT('Người dùng có ', COUNT(DISTINCT p.id), ' quyền') as message,
                        'high' as severity
                    FROM users u
                    JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = 1
                    JOIN role_permissions rp ON ur.role_id = rp.role_id AND rp.granted = 1
                    JOIN permissions p ON rp.permission_id = p.id AND p.is_active = 1
                    WHERE u.status = 'active'
                    GROUP BY u.id, u.username
                    HAVING COUNT(DISTINCT p.id) > 50
                `);

                report.security = {
                    criticalPermissions,
                    privilegedUsers,
                    securityAlerts
                };
                break;

            case 'optimization':
                // Optimization recommendations report
                const [duplicatePermissions] = await connection.execute(`
                    SELECT 
                        module,
                        action,
                        COUNT(*) as duplicate_count,
                        GROUP_CONCAT(code) as duplicate_codes
                    FROM permissions
                    WHERE is_active = 1
                    GROUP BY module, action
                    HAVING COUNT(*) > 1
                `);

                const [underutilizedPermissions] = await connection.execute(`
                    SELECT 
                        p.id,
                        p.code,
                        p.description,
                        COALESCE(rp_count.role_count, 0) as role_count,
                        COALESCE(ur_count.user_count, 0) as user_count,
                        DATEDIFF(NOW(), p.created_at) as days_since_created
                    FROM permissions p
                    LEFT JOIN (
                        SELECT permission_id, COUNT(DISTINCT role_id) as role_count
                        FROM role_permissions WHERE granted = 1
                        GROUP BY permission_id
                    ) rp_count ON p.id = rp_count.permission_id
                    LEFT JOIN (
                        SELECT rp.permission_id, COUNT(DISTINCT ur.user_id) as user_count
                        FROM role_permissions rp
                        JOIN user_roles ur ON rp.role_id = ur.role_id AND ur.is_active = 1
                        WHERE rp.granted = 1
                        GROUP BY rp.permission_id
                    ) ur_count ON p.id = ur_count.permission_id
                    WHERE p.is_active = 1
                    AND COALESCE(rp_count.role_count, 0) <= 1
                    AND DATEDIFF(NOW(), p.created_at) > 30
                    ORDER BY days_since_created DESC
                `);

                const [optimizationRecommendations] = await connection.execute(`
                    SELECT 
                        'consolidate_modules' as recommendation_type,
                        CONCAT('Module "', module, '" chỉ có ', COUNT(*), ' quyền') as description,
                        'Cân nhắc gộp vào module khác hoặc mở rộng' as action_needed,
                        'low' as priority
                    FROM permissions
                    WHERE is_active = 1
                    GROUP BY module
                    HAVING COUNT(*) < 3
                    
                    UNION ALL
                    
                    SELECT 
                        'remove_unused' as recommendation_type,
                        CONCAT('Có ', COUNT(*), ' quyền không được sử dụng') as description,
                        'Xem xét xóa để giảm độ phức tạp' as action_needed,
                        'medium' as priority
                    FROM permissions p
                    LEFT JOIN role_permissions rp ON p.id = rp.permission_id
                    WHERE p.is_active = 1 AND rp.id IS NULL
                    
                    UNION ALL
                    
                    SELECT 
                        'standardize_actions' as recommendation_type,
                        CONCAT('Module "', incomplete.module, '" thiếu action chuẩn') as description,
                        'Bổ sung view/create/update/delete đầy đủ' as action_needed,
                        'low' as priority
                    FROM (
                        SELECT module 
                        FROM permissions 
                        WHERE is_active = 1
                        GROUP BY module
                        HAVING COUNT(DISTINCT action) < 4
                    ) incomplete
                `);

                report.optimization = {
                    duplicatePermissions,
                    underutilizedPermissions,
                    recommendations: optimizationRecommendations
                };
                break;
        }

        // Log report generation
        await connection.execute(
            `INSERT INTO access_logs (log_uuid, user_id, username, action_type, object_type, request_data, status, ip_address, user_agent, created_at)
             VALUES (UUID(), ?, ?, 'VIEW', 'PERMISSION_REPORT', ?, 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                JSON.stringify({ reportType, period, format }),
                req.ip,
                req.get('User-Agent')
            ]
        );

        if (format === 'pdf') {
            res.status(501).json({
                success: false,
                message: 'PDF export chưa được implement. Vui lòng sử dụng JSON.'
            });
        } else {
            res.status(200).json({
                success: true,
                message: 'Tạo báo cáo quyền thành công',
                data: report
            });
        }

    } catch (error) {
        console.error('Error generating permission report:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo báo cáo quyền',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Validate permission structure
const validatePermissionStructure = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const validationResults = {
            issues: [],
            warnings: [],
            suggestions: [],
            summary: {}
        };

        // Check for missing basic permissions (view, create, update, delete)
        const [missingBasicPermissions] = await connection.execute(`
            SELECT 
                modules.module,
                basic_actions.action
            FROM (
                SELECT DISTINCT module FROM permissions WHERE is_active = 1
            ) modules
            CROSS JOIN (
                SELECT 'view' as action 
                UNION SELECT 'create' 
                UNION SELECT 'update' 
                UNION SELECT 'delete'
            ) basic_actions
            WHERE NOT EXISTS (
                SELECT 1 FROM permissions 
                WHERE module = modules.module 
                AND action = basic_actions.action 
                AND is_active = 1
            )
            ORDER BY modules.module, basic_actions.action
        `);

        if (missingBasicPermissions.length > 0) {
            validationResults.suggestions.push({
                type: 'missing_basic_permissions',
                severity: 'medium',
                message: `Thiếu ${missingBasicPermissions.length} quyền cơ bản`,
                details: missingBasicPermissions,
                recommendation: 'Bổ sung các quyền view, create, update, delete cho đầy đủ'
            });
        }

        // Check for duplicate permission codes
        const [duplicateCodes] = await connection.execute(`
            SELECT code, COUNT(*) as count
            FROM permissions 
            WHERE is_active = 1
            GROUP BY code
            HAVING COUNT(*) > 1
        `);

        if (duplicateCodes.length > 0) {
            validationResults.issues.push({
                type: 'duplicate_codes',
                severity: 'high',
                message: `Phát hiện ${duplicateCodes.length} mã quyền trùng lặp`,
                details: duplicateCodes,
                recommendation: 'Xóa hoặc đổi tên các quyền trùng lặp ngay lập tức'
            });
        }

        // Check for inconsistent naming conventions
        const [inconsistentNaming] = await connection.execute(`
            SELECT 
                id,
                code,
                module,
                action,
                CASE 
                    WHEN code != CONCAT(module, '.', action) THEN 'code_format_mismatch'
                    WHEN module REGEXP '[^a-z_]' THEN 'invalid_module_format'
                    WHEN action REGEXP '[^a-z_]' THEN 'invalid_action_format'
                END as issue_type
            FROM permissions 
            WHERE is_active = 1
            AND (
                code != CONCAT(module, '.', action) OR
                module REGEXP '[^a-z_]' OR
                action REGEXP '[^a-z_]'
            )
        `);

        if (inconsistentNaming.length > 0) {
            validationResults.warnings.push({
                type: 'inconsistent_naming',
                severity: 'medium',
                message: `Phát hiện ${inconsistentNaming.length} quyền không tuân thủ quy tắc đặt tên`,
                details: inconsistentNaming,
                recommendation: 'Chuẩn hóa tên module.action và chỉ sử dụng chữ thường + dấu gạch dưới'
            });
        }

        // Check for orphaned permissions (never assigned to any role)
        const [orphanedPermissions] = await connection.execute(`
            SELECT 
                p.id,
                p.code,
                p.description,
                DATEDIFF(NOW(), p.created_at) as days_unused
            FROM permissions p
            LEFT JOIN role_permissions rp ON p.id = rp.permission_id
            WHERE p.is_active = 1 AND rp.id IS NULL
            AND DATEDIFF(NOW(), p.created_at) > 7
        `);

        if (orphanedPermissions.length > 0) {
            validationResults.warnings.push({
                type: 'orphaned_permissions',
                severity: 'low',
                message: `Có ${orphanedPermissions.length} quyền chưa được gán cho vai trò nào`,
                details: orphanedPermissions,
                recommendation: 'Gán cho vai trò hoặc xóa nếu không cần thiết'
            });
        }

        // Check for over-privileged roles (roles with too many permissions)
        const [overPrivilegedRoles] = await connection.execute(`
            SELECT 
                r.id,
                r.name,
                COUNT(DISTINCT p.id) as permission_count
            FROM roles r
            JOIN role_permissions rp ON r.id = rp.role_id AND rp.granted = 1
            JOIN permissions p ON rp.permission_id = p.id AND p.is_active = 1
            WHERE r.is_active = 1
            GROUP BY r.id
            HAVING COUNT(DISTINCT p.id) > 30
            ORDER BY permission_count DESC
        `);

        if (overPrivilegedRoles.length > 0) {
            validationResults.warnings.push({
                type: 'over_privileged_roles',
                severity: 'medium',
                message: `Có ${overPrivilegedRoles.length} vai trò có quá nhiều quyền`,
                details: overPrivilegedRoles,
                recommendation: 'Xem xét tách nhỏ vai trò hoặc giảm quyền không cần thiết'
            });
        }

        // Check for security risks
        const [securityRisks] = await connection.execute(`
            SELECT 
                'delete_permissions_too_common' as risk_type,
                COUNT(*) as count,
                'Quyền delete được cấp quá rộng rãi' as description
            FROM permissions p
            JOIN role_permissions rp ON p.id = rp.permission_id AND rp.granted = 1
            WHERE p.action = 'delete' AND p.is_active = 1
            GROUP BY p.action
            HAVING COUNT(*) > 10
            
            UNION ALL
            
            SELECT 
                'admin_permissions_widespread' as risk_type,
                COUNT(DISTINCT ur.user_id) as count,
                'Quá nhiều người có quyền quản trị' as description
            FROM permissions p
            JOIN role_permissions rp ON p.id = rp.permission_id AND rp.granted = 1
            JOIN user_roles ur ON rp.role_id = ur.role_id AND ur.is_active = 1
            WHERE p.module IN ('users', 'roles', 'permissions') AND p.is_active = 1
            GROUP BY p.module
            HAVING COUNT(DISTINCT ur.user_id) > 5
        `);

        if (securityRisks.length > 0) {
            validationResults.issues.push({
                type: 'security_risks',
                severity: 'high',
                message: 'Phát hiện các rủi ro bảo mật',
                details: securityRisks,
                recommendation: 'Xem xét lại và hạn chế quyền nhạy cảm'
            });
        }

        // Calculate summary
        validationResults.summary = {
            totalIssues: validationResults.issues.length,
            totalWarnings: validationResults.warnings.length,
            totalSuggestions: validationResults.suggestions.length,
            overallHealth: (() => {
                const totalProblems = validationResults.issues.length + validationResults.warnings.length;
                if (totalProblems === 0) return 'excellent';
                if (totalProblems <= 2) return 'good';
                if (totalProblems <= 5) return 'fair';
                return 'poor';
            })(),
            validatedAt: new Date().toISOString()
        };

        // Log validation
        await connection.execute(
            `INSERT INTO access_logs (log_uuid, user_id, username, action_type, object_type, status, ip_address, user_agent, created_at)
             VALUES (UUID(), ?, ?, 'VIEW', 'PERMISSION_VALIDATION', 'SUCCESS', ?, ?, NOW())`,
            [
                req.user.userId,
                req.user.username,
                req.ip,
                req.get('User-Agent')
            ]
        );

        res.status(200).json({
            success: true,
            message: 'Kiểm tra cấu trúc quyền thành công',
            data: validationResults
        });

    } catch (error) {
        console.error('Error validating permission structure:', error);
        
        res.status(500).json({
            success: false,
            message: 'Lỗi khi kiểm tra cấu trúc quyền',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    getPermissionUsageAnalytics,
    exportPermissions,
    compareRolePermissions,
    getPermissionHierarchy,
    generatePermissionReport,
    validatePermissionStructure
};