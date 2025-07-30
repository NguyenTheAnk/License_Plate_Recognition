require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const path = require('path');
const bodyParser = require('body-parser');
const http = require('http');
const WebSocket = require('ws');
const db = require('./db');
const streamingService = require('./services/streamingService');
const { getAllCameras } = require('./controllers/Camera/getCamera');
const { getAllCameraStreams, startCameraStream, stopCameraStream, getStreamStatus } = require('./controllers/Camera/getCameraStream');
const app = express();

const port = process.env.PORT || 4000;
app.use(express.static('public'));
// Middleware
app.use(cors());
app.options('*', cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use('/api/cameras', require('./routes/camera'));
app.use('/api/videos', require('./routes/videoRoutes'));
app.use('/streams', express.static(path.join(__dirname, '../public/streams')));

// WebSocket setup
const server = http.createServer(app);
const wss = streamingService.initWebSocketServer(server);
app.set('wss', wss);

// Thêm xử lý WebSocket cho các sự kiện khác (không phải streaming)
wss.on('connection', (ws) => {
  console.log('Client connected to main WebSocket');
  ws.on('message', (message) => {
    console.log('Received:', message.toString());
    try {
      const { event, data } = JSON.parse(message.toString());
      if (event === 'newOrder' || event === 'updateOrder') {
        const response = JSON.stringify({ event, data });
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(response);
          }
        });
      }
    } catch (err) {
      console.error('Error processing message:', err);
    }
  });
  ws.on('close', () => {
    console.log('Client disconnected from main WebSocket');
  });
});

// API endpoints - sử dụng controller có sẵn
app.get('/api/cameras', getAllCameras);
app.get('/api/cameras/streams', getAllCameraStreams);

// Streaming endpoints mới
app.post('/api/cameras/:id/stream/start', startCameraStream);
app.post('/api/cameras/:id/stream/stop', stopCameraStream);
app.get('/api/cameras/:id/stream/status', getStreamStatus);

// Cleanup khi server shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    streamingService.cleanupStreams();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

// Đăng ký các routes chuẩn RESTful
const plateRoutes = require('./routes/plate');
const journeyRoutes = require('./routes/journey');
const accessControlRoutes = require('./routes/accessControl');
const rolesRoutes = require('./routes/roles');
const permissionsRoutes = require('./routes/permissions');
const authRoute = require('./routes/authRoute');
const userRoute = require('./routes/user');
const cameraRoute = require('./routes/camera');
const locationRoute = require('./routes/location');
const whiteList = require('./routes/whiteList');
const blackList = require('./routes/blackList');

app.use('/api/plates', plateRoutes);
app.use('/api/journeys', journeyRoutes);
app.use('/api/access-control', accessControlRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/permissions', permissionsRoutes);
app.use('/api/auth', authRoute);
app.use('/api/user', userRoute);
app.use('/api/camera', cameraRoute);
app.use('/api/location', locationRoute);
app.use('/api/whitelist', whiteList);
app.use('/api/blacklist', blackList);

// Global error handler (luôn trả về JSON)
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});