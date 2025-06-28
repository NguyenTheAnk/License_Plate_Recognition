import React, { useState } from 'react';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody, Button, Grid, TextField, MenuItem, Select, InputLabel, FormControl, Checkbox
} from '@mui/material';

function Videos() {
  // Dữ liệu mẫu
  const videos = [];
  const [search, setSearch] = useState('');
  const [camera, setCamera] = useState('all');
  const [date, setDate] = useState('00:00:00 28/04/2025 - 23:59:59 04/05/2025');
  const [storage, setStorage] = useState('localhost');

  return (
    <Box sx={{ minHeight: '100vh', background: '#d3d3d3', p: 3 }}>
      <Grid container spacing={3} justifyContent="center">
        {/* Bộ lọc tìm kiếm */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2, borderBottom: '2px dashed #43a047', pb: 1 }}>
              Cài đặt tìm kiếm
            </Typography>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Camera</InputLabel>
              <Select
                value={camera}
                label="Camera"
                onChange={e => setCamera(e.target.value)}
              >
                <MenuItem value="all">Chọn tất cả</MenuItem>
                <MenuItem value="cam1">Camera 1</MenuItem>
                <MenuItem value="cam2">Camera 2</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Ngày tháng"
              value={date}
              onChange={e => setDate(e.target.value)}
              fullWidth
              sx={{ mb: 2 }}
            />
            <TextField
              label="Vị trí lưu trữ"
              value={storage}
              onChange={e => setStorage(e.target.value)}
              fullWidth
              sx={{ mb: 2 }}
            />
            <Button variant="contained" color="success" fullWidth sx={{ fontWeight: 700, py: 1 }}>
              Làm mới
            </Button>
          </Paper>
        </Grid>
        {/* Bảng kết quả video */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2, borderRadius: 2, boxShadow: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
              <TextField
                size="small"
                placeholder="Tìm kiếm"
                value={search}
                onChange={e => setSearch(e.target.value)}
                sx={{ width: 180 }}
              />
            </Box>
            <Table sx={{ minWidth: 500 }}>
              <TableHead>
                <TableRow sx={{ background: '#43a047' }}>
                  <TableCell padding="checkbox" sx={{ color: '#fff', fontWeight: 700 }}><Checkbox sx={{ color: '#fff' }} /></TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Thời gian</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Kích thước</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Thao tác</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {videos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ background: '#e0e0e0', color: '#333' }}>
                      Không tìm thấy dữ liệu
                    </TableCell>
                  </TableRow>
                ) : (
                  videos.map(v => (
                    <TableRow key={v.id}>
                      <TableCell padding="checkbox"><Checkbox /></TableCell>
                      <TableCell>{v.time}</TableCell>
                      <TableCell>{v.size}</TableCell>
                      <TableCell>
                        <Button size="small" color="primary">Xem</Button>
                        <Button size="small" color="error">Xóa</Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

export default Videos;
