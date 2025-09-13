// server\controllers\Camera\getCameraStream.js
const db = require('../../db');
const streamingService = require('../../services/streamingService');
const ffmpeg = require('fluent-ffmpeg');

const buildRtspUrl = (camera) => {
    if (camera.protocol === 'rtsp') {
        if (camera.username && camera.password) {
            return `${camera.protocol}://${camera.username}:${camera.password}@${camera.host}:${camera.port}${camera.path}`;
        } else {
            return `${camera.protocol}://${camera.host}:${camera.port}${camera.path}`;
        }
    }
    return '';
};

// Test camera connection
const testCameraConnection = (rtspUrl) => {
    return new Promise((resolve) => {
        console.log(`Testing camera connection: ${rtspUrl}`);
        
        const command = ffmpeg(rtspUrl)
            .inputOptions([
                '-rtsp_transport', 'tcp',
                '-rtsp_flags', 'prefer_tcp',
                '-timeout', '5000000',
                '-analyzeduration', '1000000',
                '-probesize', '1000000'
            ])
            .outputOptions([
                '-f', 'null',
                '-t', '5' // Test 5 seconds only
            ])
            .output('-')
            .on('start', () => {
                console.log('Camera test started');
            })
            .on('error', (err) => {
                console.error('Camera test failed:', err.message);
                resolve({
                    success: false,
                    error: err.message
                });
            })
            .on('end', () => {
                console.log('Camera test successful');
                resolve({
                    success: true
                });
            });

        command.run();
        
        // Timeout after 10 seconds
        setTimeout(() => {
            command.kill();
            resolve({
                success: false,
                error: 'Connection timeout'
            });
        }, 10000);
    });
};

const getCameraStreamInfo = async (req, res) => {
    const connection = await db.promise();

    try {
        const cameraId = req.params.id;

        const [cameras] = await connection.execute(`
            SELECT 
                c.id,
                c.name,
                c.code,
                c.protocol,
                c.username,
                c.password,
                c.host,
                c.path,
                c.port,
                c.width,
                c.height,
                c.fps,
                c.is_detect,
                c.status,
                c.last_heartbeat,
                CASE 
                    WHEN c.last_heartbeat IS NULL THEN 'never'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 5 THEN 'online'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 15 THEN 'warning'
                    ELSE 'offline'
                END as connection_status
            FROM cameras c
            WHERE c.id = ? AND c.is_active = 1
        `, [cameraId]);

        if (cameras.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy camera'
            });
        }

        const camera = cameras[0];
        const streamUrl = buildRtspUrl(camera);

        res.status(200).json({
            success: true,
            data: {
                camera: {
                    id: camera.id,
                    name: camera.name,
                    code: camera.code,
                    protocol: camera.protocol,
                    host: camera.host,
                    port: camera.port,
                    path: camera.path,
                    width: camera.width,
                    height: camera.height,
                    fps: camera.fps,
                    is_detect: camera.is_detect,
                    status: camera.status,
                    connection_status: camera.connection_status,
                    stream_url: streamUrl
                }
            }
        });

    } catch (error) {
        console.error('Error getting camera stream info:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin stream camera',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getAllCameraStreams = async (req, res) => {
    const connection = await db.promise();

    try {
        const { is_detect } = req.query;

        let whereClause = 'WHERE c.is_active = 1';
        let queryParams = [];

        if (is_detect !== undefined) {
            whereClause += ' AND c.is_detect = ?';
            queryParams.push(is_detect === 'true' ? 1 : 0);
        }

        const [cameras] = await connection.execute(`
            SELECT 
                c.id,
                c.name,
                c.code,
                c.protocol,
                c.host,
                c.path,
                c.port,
                c.width,
                c.height,
                c.fps,
                c.is_detect,
                c.status,
                c.last_heartbeat,
                c.location_id,
                l.name as location_name,
                l.address as location_address,
                l.zone_type as location_zone_type,
                CASE 
                    WHEN c.username IS NOT NULL AND c.password IS NOT NULL THEN
                        CONCAT(c.protocol, '://', c.username, ':', c.password, '@', c.host, ':', c.port, c.path)
                    ELSE
                        CONCAT(c.protocol, '://', c.host, ':', c.port, c.path)
                END as stream_url,
                CASE 
                    WHEN c.last_heartbeat IS NULL THEN 'never'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 5 THEN 'online'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 15 THEN 'warning'
                    ELSE 'offline'
                END as connection_status
            FROM cameras c
            LEFT JOIN locations l ON c.location_id = l.id
            ${whereClause}
            ORDER BY c.name
        `, queryParams);

        res.status(200).json({
            success: true,
            data: {
                cameras: cameras
            }
        });

    } catch (error) {
        console.error('Error getting all camera streams:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách stream camera',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const startCameraStream = async (req, res) => {
    try {
        const cameraId = req.params.id;
        const { type = 'hls' } = req.body; // 'hls' hoặc 'websocket'

        console.log(`Starting stream for camera ${cameraId} with type ${type}`);

        // Kiểm tra camera có tồn tại không
        const connection = await db.promise();
        const [cameras] = await connection.execute(`
            SELECT id, username, password, name, code, status, protocol, host, port, path
            FROM cameras 
            WHERE id = ? AND is_active = 1
        `, [cameraId]);

        if (cameras.length === 0) {
            console.log(`Camera ${cameraId} not found or not active`);
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy camera hoặc camera không hoạt động'
            });
        }

        const camera = cameras[0];
        console.log(`Found camera:`, { id: camera.id, name: camera.name, host: camera.host, port: camera.port });

        // Kiểm tra thông tin camera có đầy đủ không
        if (!camera.host || !camera.port || !camera.path) {
            console.log(`Camera ${cameraId} missing required configuration`);
            return res.status(400).json({
                success: false,
                message: 'Camera thiếu thông tin cấu hình (host, port, path)'
            });
        }

        let streamInfo;

        if (type === 'hls') {
            console.log(`Starting real camera stream for camera ${cameraId}`);
            // Sử dụng camera thật từ database
            const camera = await streamingService.getCameraInfo(cameraId);
            if (!camera) {
                return res.status(404).json({
                    success: false,
                    message: 'Camera not found'
                });
            }
            
            const rtspUrl = streamingService.buildRtspUrl(camera);
            console.log(`Real camera RTSP URL: ${rtspUrl}`);
            
            // Sử dụng MJPEG stream thay vì HLS
            const mjpegPath = `http://localhost:5000/api/rtsp-stream?url=${encodeURIComponent(rtspUrl)}`;

            streamInfo = {
                type: 'hls',
                streamUrl: mjpegPath,
                wsUrl: null
            };
            console.log(`HLS stream started successfully: ${streamInfo.streamUrl}`);
        } else {
            // WebSocket stream sẽ được xử lý qua WebSocket connection
            streamInfo = {
                type: 'websocket',
                streamUrl: null,
                wsUrl: `ws://${req.get('host')}`
            };
        }

        // Log hoạt động
        try {
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'CREATE', 'CAMERA', ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user?.userId || null,
                    req.user?.username || 'Anonymous',
                    cameraId,
                    req.ip || '127.0.0.1',
                    req.get('User-Agent') || 'Unknown'
                ]
            );
        } catch (logError) {
            console.error('Error logging stream start:', logError);
        }

        return res.json({
            success: true,
            data: {
                camera: camera,
                stream: streamInfo
            }
        });

    } catch (error) {
        console.error('Error starting camera stream:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi bắt đầu stream camera',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const stopCameraStream = async (req, res) => {
    try {
        const cameraId = req.params.id;

        streamingService.stopStream(cameraId);

        // Log hoạt động
        try {
            const connection = await db.promise();
            await connection.execute(
                `INSERT INTO access_logs (user_id, username, action_type, object_type, object_id, status, ip_address, user_agent, created_at)
                 VALUES (?, ?, 'DELETE', 'CAMERA', ?, 'SUCCESS', ?, ?, NOW())`,
                [
                    req.user?.userId || null,
                    req.user?.username || 'Anonymous',
                    cameraId,
                    req.ip || '127.0.0.1',
                    req.get('User-Agent') || 'Unknown'
                ]
            );
        } catch (logError) {
            console.error('Error logging stream stop:', logError);
        }

        res.json({
            success: true,
            message: 'Đã dừng stream camera'
        });

    } catch (error) {
        console.error('Error stopping camera stream:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi dừng stream camera',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getStreamStatus = async (req, res) => {
    try {
        const cameraId = req.params.id;

        const activeStreams = streamingService.getActiveStreams();
        const isStreaming = activeStreams.has(cameraId);

        let streamInfo = null;
        if (isStreaming) {
            const streamData = activeStreams.get(cameraId);
            streamInfo = {
                type: streamData.type || 'websocket',
                started_at: streamData.started_at || new Date().toISOString(),
                clients: streamData.clients || 1
            };
        }

        res.json({
            success: true,
            data: {
                is_streaming: isStreaming,
                stream_info: streamInfo
            }
        });

    } catch (error) {
        console.error('Error getting stream status:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy trạng thái stream',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    getCameraStreamInfo,
    getAllCameraStreams,
    startCameraStream,
    stopCameraStream,
    getStreamStatus
}; 