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
const app = express();

const port = process.env.PORT || 5000;
app.use(express.static('public'));
// Middleware
app.use(cors());
app.options('*', cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use('/api/cameras', require('./routes/camera')); // Sửa thành /api/cameras
app.use('/api/videos', require('./routes/videoRoutes'));
// Plate recognition and uploads
app.use('/api', require('./routes/upload'));
app.use('/streams', express.static(path.join(__dirname, '../public/streams')));

// Serve cropped plate images
app.use('/static/crops', express.static(path.join(__dirname, '../static/crops')));
app.use('/crops', express.static(path.join(__dirname, '../static/crops')));

// WebSocket setup
const server = http.createServer(app);
const wss = streamingService.initWebSocketServer(server);
app.set('wss', wss);

// Thêm xử lý WebSocket cho các sự kiện khác (không phải streaming)
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  if (url.pathname === '/recognize-ws') {
    // Recognition WebSocket - proxy to Python server
    console.log('Client connected to recognition WebSocket');
    
    // Proxy to Python server
    const pythonWs = new WebSocket('ws://127.0.0.1:5002/recognize-ws');
    
    pythonWs.on('open', () => {
      console.log('Connected to Python recognition server');
    });
    
    pythonWs.on('message', (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
    
    pythonWs.on('close', () => {
      console.log('Python recognition server disconnected');
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });
    
    pythonWs.on('error', (error) => {
      console.error('Python recognition server error:', error);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });
    
    ws.on('message', (data) => {
      if (pythonWs.readyState === WebSocket.OPEN) {
        pythonWs.send(data);
      }
    });
    
    ws.on('close', () => {
      console.log('Client disconnected from recognition WebSocket');
      if (pythonWs.readyState === WebSocket.OPEN) {
        pythonWs.close();
      }
    });
    
    ws.on('error', (error) => {
      console.error('Recognition WebSocket error:', error);
      if (pythonWs.readyState === WebSocket.OPEN) {
        pythonWs.close();
      }
    });
  } else {
    // Main WebSocket for other events
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
  }
});

// Đăng ký các routes chuẩn RESTful
const plateRoutes = require('./routes/plate');
const journeyRoutes = require('./routes/journey');
const accessControlRoutes = require('./routes/accessControl');
const rolesRoutes = require('./routes/roles');
const permissionsRoutes = require('./routes/permissions');
const authRoute = require('./routes/authRoute');
const userRoute = require('./routes/user');
const locationRoute = require('./routes/location');
const whiteList = require('./routes/whiteList');
const blackList = require('./routes/blackList');
const plateDetectionRoutes = require('./routes/plateDetection');
const plateRecognitionRoutes = require('./routes/plateRecognition');
const dashboardRoutes = require('./routes/dashboard');

app.use('/api/plates', plateRoutes);
app.use('/api/journeys', journeyRoutes);
app.use('/api/access-control', accessControlRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/permissions', permissionsRoutes);
app.use('/api/auth', authRoute);
app.use('/api/user', userRoute);
app.use('/api/location', locationRoute);
app.use('/api/whitelist', whiteList);
app.use('/api/blacklist', blackList);
app.use('/api/plate-detections', plateDetectionRoutes);
app.use('/api/plate-recognitions', plateRecognitionRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    status: 'healthy'
  });
});

// Test camera endpoint - không cần auth
app.get('/api/test-camera', (req, res) => {
  res.json({
    success: true,
    message: 'Test camera endpoint working',
    data: {
      status: 'online',
      timestamp: new Date().toISOString()
    }
  });
});

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