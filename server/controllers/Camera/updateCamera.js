const db = require("../../db");

const updateCamera = async (req, res) => {
  const connection = await db.promise();

  try {
    const cameraId = req.params.id;
    let {
      name,
      code,
      url,
      location_id,
      direction,
      camera_type,
      camera_role,
      details,
      width,
      height,
      fps,
      status,
      ke,
      mid,
      is_active,
      is_detect,
      protocol,
      host,
      path,
      port,
    } = req.body;

    console.log("Updating camera with ID:", cameraId, "Data:", req.body);

    // Handle URL parsing
    if (url) {
      const urlParts = url.match(
        /(rtsp|http|https):\/\/([^:/]+)(?::(\d+))?(\/[^?#]*)?/i
      );
      if (urlParts) {
        protocol = urlParts[1] || "rtsp";
        host = urlParts[2] || "";
        port = urlParts[3]
          ? parseInt(urlParts[3])
          : protocol === "https"
          ? 443
          : 554;
        path = urlParts[4] || "/";
      } else {
        console.warn("Invalid URL format:", url);
        return res.status(400).json({
          success: false,
          message: "Định dạng URL không hợp lệ",
        });
      }
    } else if (!protocol || !host) {
      const [existingCamera] = await connection.execute(
        "SELECT protocol, host, port, path FROM cameras WHERE id = ?",
        [cameraId]
      );
      if (existingCamera.length > 0) {
        protocol = protocol || existingCamera[0].protocol || "rtsp";
        host = host || existingCamera[0].host || "";
        port =
          port || existingCamera[0].port || (protocol === "https" ? 443 : 554);
        path = path || existingCamera[0].path || "/";
      }
    }

    // Check if camera exists
    const [existingCamera] = await connection.execute(
      "SELECT * FROM cameras WHERE id = ?",
      [cameraId]
    );

    if (existingCamera.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy camera",
      });
    }

    const oldValues = existingCamera[0];
    console.log("Existing camera data:", oldValues);

    // Check for duplicate camera code
    if (code && code !== oldValues.code) {
      const [existingCameraWithCode] = await connection.execute(
        "SELECT id FROM cameras WHERE code = ? AND id != ?",
        [code, cameraId]
      );

      if (existingCameraWithCode.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Mã camera đã tồn tại",
        });
      }
    }

    // Validate location_id
    if (location_id === undefined || location_id === null) {
      location_id = oldValues.location_id;
    }
    const [location] = await connection.execute(
      "SELECT id FROM locations WHERE id = ?",
      [location_id]
    );
    if (location.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy vị trí lắp đặt",
      });
    }


    // Validate enum values
    const validDirections = [
      "inbound",
      "outbound",
      "bidirectional",
      "entry_only",
      "exit_only",
    ];
    const validCameraTypes = ["fixed", "ptz", "mobile"];
    const validCameraRoles = ["entry", "exit", "internal", "overview"];
    const validStatuses = ["online", "offline", "maintenance"];

    if (direction && !validDirections.includes(direction)) {
      return res.status(400).json({
        success: false,
        message: "Hướng giám sát không hợp lệ",
      });
    }

    if (camera_type && !validCameraTypes.includes(camera_type)) {
      return res.status(400).json({
        success: false,
        message: "Loại camera không hợp lệ",
      });
    }

    if (camera_role && !validCameraRoles.includes(camera_role)) {
      return res.status(400).json({
        success: false,
        message: "Vai trò camera không hợp lệ",
      });
    }

    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Trạng thái camera không hợp lệ",
      });
    }

    // Convert boolean values
    is_active = is_active === true || is_active === 1 ? 1 : 0;
    is_detect = is_detect === true || is_detect === 1 ? 1 : 0;

    // Build update query
    const updateFields = [];
    const updateValues = [];

    const fieldsToUpdate = {
      name: name !== undefined ? name : oldValues.name,
      code: code !== undefined ? code : oldValues.code,
      protocol: protocol !== undefined ? protocol : oldValues.protocol,
      host: host !== undefined ? host : oldValues.host,
      port: port !== undefined ? port : oldValues.port,
      path: path !== undefined ? path : oldValues.path,
      location_id: location_id !== undefined ? location_id : oldValues.location_id,
      direction: direction !== undefined ? direction : oldValues.direction,
      camera_type: camera_type !== undefined ? camera_type : oldValues.camera_type,
      camera_role: camera_role !== undefined ? camera_role : oldValues.camera_role,
      width: width !== undefined ? width : oldValues.width,
      height: height !== undefined ? height : oldValues.height,
      fps: fps !== undefined ? fps : oldValues.fps,
      status: status !== undefined ? status : oldValues.status,
      ke: ke !== undefined ? ke : oldValues.ke,
      mid: mid !== undefined ? mid : oldValues.mid,
      is_active: is_active !== undefined ? is_active : oldValues.is_active,
      is_detect: is_detect !== undefined ? is_detect : oldValues.is_detect,
      details: details !== undefined ? details : oldValues.details,
    };

    // Log fieldsToUpdate to debug
    console.log("Fields to update:", fieldsToUpdate);

    // Only include fields that have changed or are explicitly provided
    Object.entries(fieldsToUpdate).forEach(([key, value]) => {
      updateFields.push(`${key} = ?`);
      updateValues.push(value);
    });

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Không có thông tin cần cập nhật",
      });
    }

    updateFields.push("updated_at = NOW()");
    updateValues.push(cameraId);

    // Log final update values to debug
    console.log(
      "Update query:",
      `UPDATE cameras SET ${updateFields.join(", ")} WHERE id = ?`,
      "Values:",
      updateValues
    );

    // Execute update query
    await connection.execute(
      `UPDATE cameras SET ${updateFields.join(", ")} WHERE id = ?`,
      updateValues
    );

    // Fetch updated camera data
    const [updatedCamera] = await connection.execute(
      `
            SELECT 
                c.*,
                l.name as location_name,
                l.address as location_address,
            FROM cameras c
            LEFT JOIN locations l ON c.location_id = l.id
            WHERE c.id = ?
        `,
      [cameraId]
    );

    // Log success
    // await connection.execute(
    //   `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, old_values, new_values, status, ip_address, user_agent, created_at)
    //          VALUES (?, ?, 'UPDATE', 'CAMERA', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
    //   [
    //     req.user.userId,
    //     req.user.username,
    //     cameraId,
    //     JSON.stringify(oldValues),
    //     JSON.stringify(fieldsToUpdate),
    //     req.ip || "127.0.0.1",
    //     req.get("User-Agent") || "Unknown",
    //   ]
    // );

    res.status(200).json({
      success: true,
      message: "Cập nhật camera thành công",
      data: {
        camera: updatedCamera[0],
      },
    });
  } catch (error) {
    console.error("Error updating camera:", {
      message: error.message,
      stack: error.stack,
      code: error.code,
      sqlMessage: error.sqlMessage,
    });

    // Log error
    // try {
    //   await connection.execute(
    //     `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, status, failure_reason, ip_address, user_agent, created_at)
    //              VALUES (?, ?, 'UPDATE', 'CAMERA', ?, 'FAILURE', ?, ?, ?, NOW())`,
    //     [
    //       req.user?.userId || null,
    //       req.user?.username || "Unknown",
    //       req.params.id,
    //       error.message,
    //       req.ip || "127.0.0.1",
    //       req.get("User-Agent") || "Unknown",
    //     ]
    //   );
    // } catch (logError) {
    //   console.error("Error logging failed access:", logError);
    // }

    res.status(500).json({
      success: false,
      message: "Lỗi khi cập nhật camera",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const updateCameraStatus = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const cameraId = req.params.id;
        const { status } = req.body;

        const validStatuses = ['online', 'offline', 'maintenance'];

        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Trạng thái camera không hợp lệ'
            });
        }

        // Check if camera exists
        const [existingCamera] = await connection.execute(
            'SELECT id, status, name FROM cameras WHERE id = ? AND is_active = 1',
            [cameraId]
        );

        if (existingCamera.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy camera'
            });
        }

        const oldStatus = existingCamera[0].status;

        // Update status
        await connection.execute(
            'UPDATE cameras SET status = ?, updated_at = NOW() WHERE id = ?',
            [status, cameraId]
        );

        // Update last_heartbeat if going online
        if (status === 'online') {
            await connection.execute(
                'UPDATE cameras SET last_heartbeat = NOW() WHERE id = ?',
                [cameraId]
            );
        }

        // Log access
        // await connection.execute(
        //     `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, old_values, new_values, status, ip_address, user_agent, created_at)
        //      VALUES (?, ?, 'UPDATE_STATUS', 'CAMERA', ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
        //     [
        //         req.user.userId,
        //         req.user.username,
        //         cameraId,
        //         JSON.stringify({ status: oldStatus }),
        //         JSON.stringify({ status }),
        //         req.ip || '127.0.0.1',
        //         req.get('User-Agent') || 'Unknown'
        //     ]
        // );

        res.status(200).json({
            success: true,
            message: `Cập nhật trạng thái camera thành ${status === 'online' ? 'trực tuyến' : status === 'offline' ? 'ngoại tuyến' : 'bảo trì'}`,
            data: {
                camera_id: parseInt(cameraId),
                old_status: oldStatus,
                new_status: status
            }
        });

    } catch (error) {
        console.error('Error updating camera status:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật trạng thái camera',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const updateCameraHeartbeat = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const cameraId = req.params.id;

        // Check if camera exists
        const [existingCamera] = await connection.execute(
            'SELECT id, name FROM cameras WHERE id = ? AND is_active = 1',
            [cameraId]
        );

        if (existingCamera.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy camera'
            });
        }

        // Update heartbeat and status
        await connection.execute(
            'UPDATE cameras SET last_heartbeat = NOW(), status = "online", updated_at = NOW() WHERE id = ?',
            [cameraId]
        );

        res.status(200).json({
            success: true,
            message: 'Cập nhật heartbeat thành công',
            data: {
                camera_id: parseInt(cameraId),
                last_heartbeat: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error updating camera heartbeat:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật heartbeat camera',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const bulkUpdateCameraStatus = async (req, res) => {
    const connection = await db.promise();
    
    try {
        const { cameraIds, status } = req.body;

        if (!cameraIds || !Array.isArray(cameraIds) || cameraIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Danh sách ID camera không hợp lệ'
            });
        }

        const validStatuses = ['online', 'offline', 'maintenance'];

        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Trạng thái camera không hợp lệ'
            });
        }

        // Check if all cameras exist
        const placeholders = cameraIds.map(() => '?').join(',');
        const [existingCameras] = await connection.execute(
            `SELECT id, name FROM cameras WHERE id IN (${placeholders}) AND is_active = 1`,
            cameraIds
        );

        if (existingCameras.length !== cameraIds.length) {
            return res.status(404).json({
                success: false,
                message: 'Một số camera không tồn tại'
            });
        }

        // Bulk update status
        const updateQuery = status === 'online' 
            ? `UPDATE cameras SET status = ?, last_heartbeat = NOW(), updated_at = NOW() WHERE id IN (${placeholders})`
            : `UPDATE cameras SET status = ?, updated_at = NOW() WHERE id IN (${placeholders})`;

        await connection.execute(updateQuery, [status, ...cameraIds]);

        // Log access
        // await connection.execute(
        //     `INSERT INTO access_logs (user_id, username, action_type, object_type, new_values, status, ip_address, user_agent, created_at)
        //      VALUES (?, ?, 'BULK_UPDATE_STATUS', 'CAMERAS', ?, 'SUCCESS', ?, ?, NOW())`,
        //     [
        //         req.user.userId,
        //         req.user.username,
        //         JSON.stringify({ cameraIds, status, count: cameraIds.length }),
        //         req.ip || '127.0.0.1',
        //         req.get('User-Agent') || 'Unknown'
        //     ]
        // );

        res.status(200).json({
            success: true,
            message: `Cập nhật trạng thái thành công cho ${cameraIds.length} camera`,
            data: {
                updated_count: cameraIds.length,
                new_status: status
            }
        });

    } catch (error) {
        console.error('Error bulk updating camera status:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật trạng thái nhiều camera',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
  updateCamera,
  updateCameraStatus,
  updateCameraHeartbeat,
  bulkUpdateCameraStatus,
};