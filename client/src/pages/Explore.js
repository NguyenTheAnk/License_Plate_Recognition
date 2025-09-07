import React, { useState } from 'react';
import { Box, Typography, Paper, Button, TextField } from '@mui/material';

function Explore() {
  const [url, setUrl] = useState('');

  return (
    <Box sx={{ minHeight: '100vh', background: '#d3d3d3', p: 3, display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
      <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3, minWidth: 1500, maxWidth: '100%', mt: 2 }}>
        <Typography variant="h6" fontWeight={700} sx={{ mb: 2, borderBottom: '2px dashed #1976d2', pb: 1 }}>
          Thăm dò
        </Typography>
        <TextField
          label="URL luồng hoàn chỉnh"
          value={url}
          onChange={e => setUrl(e.target.value)}
          fullWidth
          sx={{ mb: 2 }}
          placeholder="Example : http://192.168.88.126/videostream.cgi or /dev/video0"
        />
        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
          <Button variant="contained" color="success" sx={{ flex: 1, fontWeight: 700, py: 1 }}>Kiểm tra</Button>
          <Button variant="contained" color="primary" sx={{ flex: 1, fontWeight: 700, py: 1, bgcolor: '#263238' }}>
            Lưu
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

export default Explore;