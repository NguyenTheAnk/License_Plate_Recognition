require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const path = require('path');
const bodyParser = require('body-parser');
const http = require('http');
const WebSocket = require('ws');
const db = require('./db');

const app = express();

const port = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.options('*', cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));




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
// Thêm các routes khác nếu có



// WebSocket setup
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
app.set('wss', wss);
wss.on('connection', (ws) => {
  console.log('Client connected');
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
    console.log('Client disconnected');
  });
});

// Đăng ký các routes chuẩn RESTful
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
// Đăng ký các routes khác nếu có

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 