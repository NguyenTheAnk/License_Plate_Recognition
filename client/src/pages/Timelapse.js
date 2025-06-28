import React, { useState } from 'react';
import {
  Box, Typography, Paper, Grid, TextField, MenuItem, Select, InputLabel, FormControl, Button, Slider, Checkbox
} from '@mui/material';

function Timelapse() {
  const [camera, setCamera] = useState('1910 S1 (Manual)');
  const [date, setDate] = useState('00:00:00 28/04/2025 - 23:59:59 04/05/2025');
  const [ratio, setRatio] = useState(50);
  const [checked, setChecked] = useState(false);
  // const [data, setData] = useState([]); // Dữ liệu thực tế
  const data = [];

  return (
    <Box sx={{ minHeight: '100vh', background: '#d3d3d3', p: 3 }}>
      <Grid container spacing={3} justifyContent="center">
        {/* Bộ lọc và thao tác */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3, mb: 3 }}>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Camera</InputLabel>
              <Select
                value={camera}
                label="Camera"
                onChange={e => setCamera(e.target.value)}
              >
                <MenuItem value="1910 S1 (Manual)">1910 S1 (Manual)</MenuItem>
                <MenuItem value="1910 S1 Local (64)">1910 S1 Local (64)</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Ngày tháng"
              value={date}
              onChange={e => setDate(e.target.value)}
              fullWidth
              sx={{ mb: 2 }}
            />
            <Typography sx={{ mb: 1 }}>Tỷ lệ khung hình</Typography>
            <Slider
              value={ratio}
              onChange={(_, v) => setRatio(v)}
              min={0}
              max={100}
              sx={{ mb: 2 }}
            />
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <Button variant="contained" color="success" sx={{ flex: 1, fontWeight: 700, py: 1 }}>Phát</Button>
              <Button variant="contained" color="info" sx={{ flex: 1, fontWeight: 700, py: 1 }}>Xây dựng video</Button>
            </Box>
            <Button variant="contained" color="success" fullWidth sx={{ fontWeight: 700, py: 1, mb: 1 }}>Làm mới</Button>
          </Paper>
          <Paper sx={{ p: 2, borderRadius: 2, boxShadow: 2 }}>
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <Button variant="contained" color="error" sx={{ fontWeight: 700 }}>Xóa đã chọn</Button>
              <Button variant="contained" color="success" sx={{ fontWeight: 700 }}>Nén và tải xuống</Button>
              <Checkbox checked={checked} onChange={e => setChecked(e.target.checked)} sx={{ ml: 'auto' }} />
            </Box>
            <Box sx={{ borderTop: '2px dashed #888', borderBottom: '2px dashed #888', py: 2, textAlign: 'center', color: '#888', fontWeight: 500 }}>
              {data.length === 0 ? 'Không có dữ liệu' : 'Có dữ liệu'}
            </Box>
          </Paper>
        </Grid>
        {/* Phần còn lại để trống hoặc có thể thêm preview video nếu muốn */}
        <Grid item xs={12} md={8}></Grid>
      </Grid>
    </Box>
  );
}

export default Timelapse;
