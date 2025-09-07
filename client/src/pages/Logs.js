import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Grid, TextField, Button, MenuItem, Select, InputLabel, FormControl, Divider, Alert
} from '@mui/material';

const savedLogsSample = [
  {
    id: 1,
    type: 'WebSocket đã kết nối',
    mail: 'admin',
    logid: '59ZEwgu55R',
    ip: '::ffff:172.18.16.1',
    time: '19:23:48 2025-05-03',
    content: ''
  },
  {
    id: 2,
    type: 'Mã thông báo xác thực mới',
    mail: 'admin',
    logid: '59ZEwgu55R',
    ip: '::ffff:172.18.16.1',
    time: '19:23:46 2025-05-03',
    content: 'for : dash'
  }
];

const liveLogsSample = [
  {
    id: 1,
    type: 'H2 304 local 1 (64) (1921681064)',
    time: '07:27:25 PM 2025-05-03',
    content: 'Ping không thành công',
    detail: 'Hãy thử đặt "Bỏ qua ping" thành Có.'
  },
  {
    id: 2,
    type: 'H2 304 local 1 (64) (1921681064)',
    time: '07:26:56 2025-05-03',
    content: 'Ping không thành công',
    detail: 'Hãy thử đặt "Bỏ qua ping" thành Có.'
  }
];

function Logs() {
  const [savedLogs, setSavedLogs] = useState(savedLogsSample);
  const [liveLogs, setLiveLogs] = useState(liveLogsSample);
  const [searchSaved, setSearchSaved] = useState('');
  const [searchLive, setSearchLive] = useState('');
  const [logType, setLogType] = useState('all');
  const [dateRange, setDateRange] = useState('00:00:00 28/04/2025 - 23:59:59 04/05/2025');

  // Tự động cập nhật log live (giả lập)
  useEffect(() => {
    const interval = setInterval(() => {
      setLiveLogs(liveLogs => [
        ...liveLogs,
        {
          id: liveLogs.length + 1,
          type: 'H2 304 local 1 (64) (1921681064)',
          time: new Date().toLocaleTimeString() + ' ' + new Date().toISOString().slice(0, 10),
          content: 'Ping không thành công',
          detail: 'Hãy thử đặt "Bỏ qua ping" thành Có.'
        }
      ]);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Box sx={{ minHeight: '100vh', background: '#d3d3d3', p: 3 }}>
      <Grid container spacing={3} justifyContent="center">
        {/* Nhật ký đã lưu */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3, minHeight: 600 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2, borderBottom: '2px dashed #1976d2', pb: 1 }}>
              Nhật ký đã lưu
            </Typography>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Tất cả nhật ký</InputLabel>
              <Select
                value={logType}
                label="Tất cả nhật ký"
                onChange={e => setLogType(e.target.value)}
              >
                <MenuItem value="all">Tất cả nhật ký</MenuItem>
                <MenuItem value="login">Đăng nhập</MenuItem>
                <MenuItem value="camera">Camera</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Tìm kiếm"
              value={searchSaved}
              onChange={e => setSearchSaved(e.target.value)}
              fullWidth
              sx={{ mb: 2 }}
            />
            <TextField
              label="Thời gian"
              value={dateRange}
              onChange={e => setDateRange(e.target.value)}
              fullWidth
              sx={{ mb: 2 }}
            />
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <Button variant="outlined" color="primary" sx={{ flex: 1 }}>Export</Button>
              <Button variant="contained" color="success" sx={{ flex: 1 }}>Kiểm tra</Button>
            </Box>
            <Divider sx={{ mb: 2 }} />
            <Box sx={{ maxHeight: 350, overflowY: 'auto', pr: 1 }}>
              {savedLogs.length === 0 ? (
                <Typography color="text.secondary" align="center">Không có nhật ký</Typography>
              ) : (
                savedLogs.map(log => (
                  <Paper key={log.id} sx={{ p: 2, mb: 2, background: '#232f3e', color: '#fff', borderRadius: 2 }}>
                    <Typography sx={{ fontWeight: 700 }}>{log.type}</Typography>
                    <Typography variant="body2" sx={{ color: '#b2dfdb' }}>mail : {log.mail}</Typography>
                    <Typography variant="body2" sx={{ color: '#b2dfdb' }}>id : {log.logid}</Typography>
                    <Typography variant="body2" sx={{ color: '#b2dfdb' }}>ip : {log.ip}</Typography>
                    {log.content && <Typography variant="body2" sx={{ color: '#b2dfdb' }}>{log.content}</Typography>}
                    <Typography variant="caption" sx={{ color: '#b2dfdb', display: 'block', mt: 1 }}>{log.time}</Typography>
                  </Paper>
                ))
              )}
            </Box>
          </Paper>
        </Grid>
        {/* Nhật ký phát trực tuyến */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3, minHeight: 600 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2, borderBottom: '2px dashed #388e3c', pb: 1 }}>
              Nhật ký phát trực tuyến
            </Typography>
            <TextField
              label="Tìm kiếm"
              value={searchLive}
              onChange={e => setSearchLive(e.target.value)}
              fullWidth
              sx={{ mb: 2 }}
            />
            <Divider sx={{ mb: 2 }} />
            <Box sx={{ maxHeight: 470, overflowY: 'auto', pr: 1 }}>
              {/* Thông báo lỗi giả lập */}
              <Alert severity="warning" sx={{ mb: 2, fontSize: 14 }}>
                <b>undefined (_USER)</b>
              </Alert>
              {liveLogs.length === 0 ? (
                <Typography color="text.secondary" align="center">Không có nhật ký</Typography>
              ) : (
                liveLogs.map(log => (
                  <Box key={log.id} sx={{ mb: 2 }}>
                    <Paper sx={{ p: 2, background: '#232f3e', color: '#fff', borderRadius: 2, mb: 1 }}>
                      <Typography sx={{ fontWeight: 700 }}>{log.type}</Typography>
                      <Typography variant="body2" sx={{ color: '#b2dfdb' }}>{log.content}</Typography>
                      <Typography variant="body2" sx={{ color: '#b2dfdb' }}>{log.detail}</Typography>
                    </Paper>
                    <Typography variant="caption" sx={{ color: '#888', display: 'block', ml: 1 }}>{log.time}</Typography>
                  </Box>
                ))
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

export default Logs;