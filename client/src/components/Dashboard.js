import React from 'react';
import { Box, Grid, Paper, Typography, Avatar } from '@mui/material';
import { PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, LineChart, Line, AreaChart, Area } from 'recharts';
import VideocamIcon from '@mui/icons-material/Videocam';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import EventNoteIcon from '@mui/icons-material/EventNote';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

const cameraStats = [
  { name: 'Đang hoạt động', value: 32 },
  { name: 'Không hoạt động', value: 14 },
];
const COLORS = ['#43a047', '#d32f2f'];

const eventStats = [
  { name: 'T2', xe: 120, suKien: 10 },
  { name: 'T3', xe: 98, suKien: 8 },
  { name: 'T4', xe: 110, suKien: 12 },
  { name: 'T5', xe: 150, suKien: 15 },
  { name: 'T6', xe: 130, suKien: 9 },
  { name: 'T7', xe: 90, suKien: 7 },
  { name: 'CN', xe: 80, suKien: 5 },
];

const summary = [
  { label: 'Tổng số camera', value: 46, icon: <VideocamIcon fontSize="large" />, color: '#1976d2' },
  { label: 'Đang hoạt động', value: 32, icon: <CheckCircleIcon fontSize="large" />, color: '#43a047' },
  { label: 'Số sự kiện', value: 55, icon: <EventNoteIcon fontSize="large" />, color: '#ffa000' },
  { label: 'Xe nhận diện', value: 678, icon: <DirectionsCarIcon fontSize="large" />, color: '#d32f2f' },
];

// Dữ liệu mẫu cho LineChart: số xe nhận diện theo giờ
const lineData = [
  { hour: '06h', xe: 5 }, { hour: '07h', xe: 12 }, { hour: '08h', xe: 20 }, { hour: '09h', xe: 18 },
  { hour: '10h', xe: 25 }, { hour: '11h', xe: 22 }, { hour: '12h', xe: 15 }, { hour: '13h', xe: 10 },
  { hour: '14h', xe: 8 }, { hour: '15h', xe: 14 }, { hour: '16h', xe: 19 }, { hour: '17h', xe: 23 },
];

// Dữ liệu mẫu cho BarChart: số xe nhận diện theo camera
const camBarData = [
  { camera: 'Cam 1', xe: 120 },
  { camera: 'Cam 2', xe: 98 },
  { camera: 'Cam 3', xe: 110 },
  { camera: 'Cam 4', xe: 150 },
  { camera: 'Cam 5', xe: 130 },
];

function Dashboard() {
  return (
    <Box sx={{ minHeight: '100vh', background: '#f4f6fa', p: 3 }}>
      <Grid container spacing={3}>
        {/* Card tổng quan */}
        {summary.map((item, idx) => (
          <Grid item xs={12} sm={6} md={3} key={item.label}>
            <Paper sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, borderRadius: 2, boxShadow: 3 }}>
              <Avatar sx={{ bgcolor: item.color, width: 48, height: 48 }}>{item.icon}</Avatar>
              <Box>
                <Typography variant="h6" fontWeight={700}>{item.value}</Typography>
                <Typography variant="body2" color="text.secondary">{item.label}</Typography>
              </Box>
            </Paper>
          </Grid>
        ))}
        {/* Biểu đồ tròn và cột */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3, height: 360 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Tỉ lệ trạng thái camera</Typography>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={cameraStats} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {cameraStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3, height: 360 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Thống kê xe & sự kiện trong tuần</Typography>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={eventStats}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="xe" fill="#1976d2" name="Xe nhận diện" radius={[6, 6, 0, 0]} />
                <Bar dataKey="suKien" fill="#ffa000" name="Sự kiện" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
        {/* Biểu đồ đường: số xe nhận diện theo giờ */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3, height: 360 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Số xe nhận diện theo giờ</Typography>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={lineData}>
                <XAxis dataKey="hour" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="xe" stroke="#1976d2" strokeWidth={3} dot={{ r: 5 }} name="Xe nhận diện" />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
        {/* Biểu đồ cột: số xe nhận diện theo camera */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3, height: 360 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Số xe nhận diện theo camera</Typography>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={camBarData}>
                <XAxis dataKey="camera" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="xe" fill="#43a047" name="Xe nhận diện" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

export default Dashboard; 