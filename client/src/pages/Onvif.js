import React, { useState } from 'react';
import { Box, Typography, Paper, Button, Grid, TextField } from '@mui/material';

function Onvif() {
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // const [devices, setDevices] = useState([]); // Dữ liệu thực tế

  return (
    <Box sx={{ minHeight: '100vh', background: '#d3d3d3', p: 3 }}>
      <Grid container spacing={3} justifyContent="flex-start">
        {/* Card cài đặt quét */}
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2, borderBottom: '2px dashed #1976d2', pb: 1 }}>
              Cài đặt quét
            </Typography>
            <TextField
              label="Địa chỉ IP"
              value={ip}
              onChange={e => setIp(e.target.value)}
              fullWidth
              sx={{ mb: 2 }}
              placeholder="Example : 10.1.100.1-10.1.100.254"
              helperText="Phạm vi IP hoặc địa chỉ đơn."
            />
            <TextField
              label="Cổng"
              value={port}
              onChange={e => setPort(e.target.value)}
              fullWidth
              sx={{ mb: 2 }}
              placeholder="Example : 80,7575,8000,8486,8081"
            />
            <TextField
              label="Tên đăng nhập camera"
              value={username}
              onChange={e => setUsername(e.target.value)}
              fullWidth
              sx={{ mb: 2 }}
              placeholder="Có thể để trống"
              helperText="Dùng dấu phẩy để tách giữa các tên đăng nhập có thể đúng"
            />
            <TextField
              label="Mật khẩu camera"
              value={password}
              onChange={e => setPassword(e.target.value)}
              fullWidth
              sx={{ mb: 2 }}
              placeholder="Có thể để trống"
              helperText="Dấu phẩy và @ không được phép sử dụng trong mật khẩu. Dùng dấu phẩy để tách giữa các mật khẩu có thể đúng"
            />
            <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
              <Button variant="contained" color="success" sx={{ flex: 1, fontWeight: 700, py: 1 }}>Tìm kiếm</Button>
              <Button variant="contained" color="primary" sx={{ flex: 1, fontWeight: 700, py: 1, bgcolor: '#263238' }}>
                Thêm tất cả
              </Button>
            </Box>
          </Paper>
        </Grid>
        {/* Card kết quả tìm thấy thiết bị */}
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3, minHeight: 120 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2, borderBottom: '2px dashed #1976d2', pb: 1 }}>
              Tìm thấy thiết bị
            </Typography>
            {/* Danh sách thiết bị sẽ hiển thị ở đây */}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

export default Onvif;
