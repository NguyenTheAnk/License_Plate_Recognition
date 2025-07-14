import React, { useState } from 'react';
import {
  Box, Typography, Grid, Card, CardContent, Button, TextField, Divider
} from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import SettingsIcon from '@mui/icons-material/Settings';
import EditIcon from '@mui/icons-material/Edit';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ListAltIcon from '@mui/icons-material/ListAlt';
import SaveAltIcon from '@mui/icons-material/SaveAlt';

const cameraData = [
  {
    id: 1,
    name: '1910 S1 (Manual)',
    ip: '192.168.12.201',
    status: 'Stopped',
    type: 'Manual',
  },
  {
    id: 2,
    name: '1910 S1 Local (64)',
    ip: '192.168.3.64',
    status: 'Stopped',
    type: 'Local',
  },
  {
    id: 3,
    name: '1910 S1 local 2',
    ip: '192.168.3.66',
    status: 'Stopped',
    type: 'Local',
  },
  {
    id: 4,
    name: '1910 S1 ONVIF 3',
    ip: '192.168.3.66',
    status: 'Stopped',
    type: 'ONVIF',
  },
  {
    id: 5,
    name: 'H2 304 Internet',
    ip: '117.4.240.104',
    status: 'Stopped',
    type: 'Internet',
  },
  {
    id: 6,
    name: 'H2 304 local 1 (64)',
    ip: '192.168.10.64',
    status: 'Không hoạt động',
    type: 'Local',
  },
];

function Cameras() {
  const [search, setSearch] = useState('');
  const filteredCameras = cameraData.filter(cam =>
    cam.name.toLowerCase().includes(search.toLowerCase()) ||
    cam.ip.includes(search)
  );

  return (
    <Box sx={{
      minHeight: '100vh',
      width: '100vw',
      pr: { xs: 1, md: 3 },
      pt: 3,
      background: '#f4f6fa',
      boxSizing: 'border-box',
      position: 'relative',
      transition: 'padding-left 0.2s',
      overflowX: 'hidden',
    }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>Camera</Typography>
      <Divider sx={{ mb: 2, borderStyle: 'dashed' }} />
      <TextField
        label="Tìm kiếm"
        variant="outlined"
        size="small"
        sx={{ mb: 3, maxWidth: 350 }}
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <Grid container spacing={2} sx={{ width: '83%', m: 0 }} justifyContent="flex-start">
        {filteredCameras.map((cam, idx) => (
          <Grid item xs={12} sm={6} md={4} lg={4} key={cam.id}>
            <Card sx={{ borderRadius: 2, boxShadow: 2, minHeight: 320, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              {/* Khung hình camera */}
              <Box sx={{ bgcolor: '#b48b5a', height: 120, borderTopLeftRadius: 8, borderTopRightRadius: 8 }} />
              <CardContent sx={{ pb: 1 }}>
                <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                  <Button variant="contained" size="small" color="primary" startIcon={<InfoIcon />} sx={{ fontSize: 13, fontWeight: 600, borderRadius: 1, minWidth: 0, px: 1.5 }}>
                    Thông tin
                  </Button>
                  <Button variant="contained" size="small" color="info" startIcon={<SettingsIcon />} sx={{ fontSize: 13, fontWeight: 600, borderRadius: 1, minWidth: 0, px: 1.5 }}>
                    Cài đặt nhanh
                  </Button>
                </Box>
                <Typography fontWeight={700} fontSize={15} sx={{ mb: 0.5 }}>{cam.name}</Typography>
                <Typography fontSize={13} color="text.secondary" sx={{ mb: 0.5 }}>{cam.ip}</Typography>
                <Typography fontSize={12} color={cam.status === 'Stopped' ? 'text.secondary' : 'error'} sx={{ mb: 1 }}>
                  {cam.status}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                  <Button variant="outlined" size="small" startIcon={<SaveAltIcon />} sx={{ fontSize: 12, borderRadius: 1, minWidth: 0, px: 1 }}>
                    Xuất cấu hình
                  </Button>
                  <Button variant="outlined" size="small" startIcon={<EditIcon />} sx={{ fontSize: 12, borderRadius: 1, minWidth: 0, px: 1 }}>
                    Chỉnh sửa
                  </Button>
                  <Button variant="outlined" size="small" startIcon={<ContentCopyIcon />} sx={{ fontSize: 12, borderRadius: 1, minWidth: 0, px: 1 }}>
                    Sao chép URL
                  </Button>
                  <Button variant="outlined" size="small" startIcon={<ListAltIcon />} sx={{ fontSize: 12, borderRadius: 1, minWidth: 0, px: 1 }}>
                    Xem TKB
                  </Button>
                </Box>
                <Button variant="contained" color="success" fullWidth sx={{ borderRadius: 1, fontWeight: 700, fontSize: 15, minHeight: 32 }}>
                  Video
                </Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

export default Cameras;