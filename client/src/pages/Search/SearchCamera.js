import React, { useState } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, TextField, Button, Select, MenuItem, InputLabel, FormControl, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert, Stack, Avatar, Divider
} from '@mui/material';
import { Search as SearchIcon, CameraAlt, LocationOn, Info, Close as CloseIcon } from '@mui/icons-material';

const statusOptions = [
  { value: '', label: 'Tất cả' },
  { value: 'online', label: 'Online' },
  { value: 'offline', label: 'Offline' },
  { value: 'warning', label: 'Cảnh báo' }
];
const cameraTypeOptions = [
  { value: '', label: 'Tất cả' },
  { value: 'entry', label: 'Cổng vào' },
  { value: 'exit', label: 'Cổng ra' },
  { value: 'internal', label: 'Nội bộ' },
  { value: 'overview', label: 'Tổng quan' }
];

function SearchCamera({ filters, onFilterChange, onSearch, results, loading, error, onOpenDetail, locations = [] }) {
  const [openDetail, setOpenDetail] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  const handleOpenDetail = (item) => {
    setSelectedItem(item);
    setOpenDetail(true);
    if (onOpenDetail) onOpenDetail(item);
  };
  const handleCloseDetail = () => {
    setOpenDetail(false);
    setSelectedItem(null);
  };

  return (
    <Box>
      {/* Bộ lọc camera */}
      <Card sx={{ borderRadius: 3, boxShadow: 1, mb: 2 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <TextField label="Tên camera" value={filters.name || ''} onChange={e => onFilterChange('name', e.target.value)} fullWidth size="small" InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1 }} /> }} />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Khu vực</InputLabel>
                <Select value={filters.location_id || ''} label="Khu vực" onChange={e => onFilterChange('location_id', e.target.value)}>
                  <MenuItem value="">Tất cả</MenuItem>
                  {locations.map(loc => <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Trạng thái</InputLabel>
                <Select value={filters.status || ''} label="Trạng thái" onChange={e => onFilterChange('status', e.target.value)}>
                  {statusOptions.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Loại camera</InputLabel>
                <Select value={filters.camera_type || ''} label="Loại camera" onChange={e => onFilterChange('camera_type', e.target.value)}>
                  {cameraTypeOptions.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <Button variant="contained" color="primary" startIcon={<SearchIcon />} onClick={onSearch} sx={{ borderRadius: 2, px: 3, fontWeight: 600 }} disabled={loading}>
                {loading ? <CircularProgress size={20} color="inherit" /> : 'Tìm kiếm'}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      {/* Bảng kết quả camera */}
      <Card sx={{ borderRadius: 3, boxShadow: 1 }}>
        <CardContent sx={{ p: 0 }}>
          {loading ? (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
              <CircularProgress size={40} />
            </Box>
          ) : error ? (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
              <Alert severity="error" sx={{ width: '100%' }}>{error}</Alert>
            </Box>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ background: '#1976d2' }}>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>STT</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Tên camera</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Mã camera</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Vị trí</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Độ phân giải</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Trạng thái</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Kết nối</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Phát hiện 24h</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thao tác</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {results.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} align="center">
                        <Typography color="text.secondary" sx={{ py: 4 }}>Không có kết quả</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    results.map((item, index) => (
                      <TableRow key={item.id || item.camera_key} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>
                            {index + 1}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={1}>
                            <CameraAlt sx={{ fontSize: 16, color: '#1976d2' }} />
                            <Typography variant="body2" fontWeight={600}>
                              {item.name}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {item.code || item.camera_key || item.camera_id}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box>
                            <Typography variant="body2" fontWeight={500}>
                              {item.location_name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {item.location_address}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>
                            {item.resolution || `${item.width}x${item.height}`}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {item.fps} FPS
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={item.is_active ? 'Hoạt động' : 'Tạm dừng'} 
                            color={item.is_active ? 'success' : 'default'} 
                            size="small" 
                          />
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={item.connection_status === 'online' ? 'Online' : 
                                   item.connection_status === 'warning' ? 'Cảnh báo' : 'Offline'} 
                            color={item.connection_status === 'online' ? 'success' : 
                                   item.connection_status === 'warning' ? 'warning' : 'error'} 
                            size="small" 
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500} color="primary">
                            {item.detections_24h || 0}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="outlined" 
                            size="small" 
                            onClick={() => handleOpenDetail(item)} 
                            startIcon={<Info />} 
                            sx={{ borderRadius: 2, fontWeight: 600 }}
                          >
                            Xem chi tiết
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
      {/* Modal chi tiết camera */}
      <Dialog open={openDetail} onClose={handleCloseDetail} maxWidth="md" fullWidth>
        <DialogTitle sx={{ background: 'linear-gradient(90deg, #ffa726 60%, #ffd54f 100%)', color: 'white', display: 'flex', alignItems: 'center', gap: 2 }}>
          <Info sx={{ mr: 1 }} /> Thông tin chi tiết
          <IconButton onClick={handleCloseDetail} sx={{ ml: 'auto', color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {selectedItem && (
            <Grid container spacing={3}>
              {/* Thông tin cơ bản */}
              <Grid item xs={12} md={4}>
                <Avatar variant="rounded" sx={{ width: 120, height: 70, bgcolor: '#e0e0e0', mb: 2 }}>
                  <CameraAlt sx={{ fontSize: 40 }} />
                </Avatar>
                <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>{selectedItem.name}</Typography>
                <Typography variant="body2" color="text.secondary">Mã: {selectedItem.code || selectedItem.camera_key || selectedItem.camera_id}</Typography>
                <Typography variant="body2" color="text.secondary">Vị trí: {selectedItem.location_name}</Typography>
                <Typography variant="body2" color="text.secondary">Địa chỉ: {selectedItem.location_address}</Typography>
                <Box sx={{ mt: 2 }}>
                  <Chip 
                    label={selectedItem.is_active ? 'Hoạt động' : 'Tạm dừng'} 
                    color={selectedItem.is_active ? 'success' : 'default'} 
                    size="small" 
                    sx={{ mr: 1 }}
                  />
                  <Chip 
                    label={selectedItem.connection_status === 'online' ? 'Online' : 
                           selectedItem.connection_status === 'warning' ? 'Cảnh báo' : 'Offline'} 
                    color={selectedItem.connection_status === 'online' ? 'success' : 
                           selectedItem.connection_status === 'warning' ? 'warning' : 'error'} 
                    size="small" 
                  />
                </Box>
              </Grid>
              
              {/* Thông tin kỹ thuật */}
              <Grid item xs={12} md={8}>
                <Typography variant="h6" fontWeight={600} mb={2} color="primary">Thông tin kỹ thuật</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Giao thức:</Typography>
                    <Typography variant="body2" fontWeight={500}>{selectedItem.protocol?.toUpperCase()}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Host:</Typography>
                    <Typography variant="body2" fontWeight={500}>{selectedItem.host}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Port:</Typography>
                    <Typography variant="body2" fontWeight={500}>{selectedItem.port}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Độ phân giải:</Typography>
                    <Typography variant="body2" fontWeight={500}>{selectedItem.resolution || `${selectedItem.width}x${selectedItem.height}`}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">FPS:</Typography>
                    <Typography variant="body2" fontWeight={500}>{selectedItem.fps}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Loại camera:</Typography>
                    <Typography variant="body2" fontWeight={500}>{selectedItem.camera_type}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Vai trò:</Typography>
                    <Typography variant="body2" fontWeight={500}>{selectedItem.camera_role}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Hướng:</Typography>
                    <Typography variant="body2" fontWeight={500}>{selectedItem.direction}</Typography>
                  </Grid>
                </Grid>
                
                <Divider sx={{ my: 2 }} />
                
                {/* Thông tin cài đặt & bảo trì */}
                <Typography variant="h6" fontWeight={600} mb={2} color="primary">Cài đặt & Bảo trì</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Ngày lắp đặt:</Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {selectedItem.installation_date_formatted || selectedItem.installation_date || 'Chưa có'}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Số ngày hoạt động:</Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {selectedItem.days_since_installation ? `${selectedItem.days_since_installation} ngày` : 'Chưa có'}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Lịch bảo trì:</Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {selectedItem.maintenance_schedule || 'Chưa có'}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Khoảng cách bảo trì:</Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {selectedItem.maintenance_interval_days ? `${selectedItem.maintenance_interval_days} ngày` : 'Chưa có'}
                    </Typography>
                  </Grid>
                </Grid>
                
                <Divider sx={{ my: 2 }} />
                
                {/* Thông tin phát hiện */}
                <Typography variant="h6" fontWeight={600} mb={2} color="primary">Thông tin phát hiện</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Phát hiện 24h:</Typography>
                    <Typography variant="body2" fontWeight={500} color="primary">
                      {selectedItem.detections_24h || 0} lần
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Bật phát hiện:</Typography>
                    <Chip 
                      label={selectedItem.is_detect ? 'Có' : 'Không'} 
                      color={selectedItem.is_detect ? 'success' : 'default'} 
                      size="small" 
                    />
                  </Grid>
                </Grid>
                
                <Divider sx={{ my: 2 }} />
                
                {/* Thông tin kết nối */}
                <Typography variant="h6" fontWeight={600} mb={2} color="primary">Thông tin kết nối</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <Typography variant="body2" color="text.secondary">RTSP URL:</Typography>
                    <Typography variant="body2" fontWeight={500} sx={{ 
                      wordBreak: 'break-all', 
                      bgcolor: '#f5f5f5', 
                      p: 1, 
                      borderRadius: 1,
                      fontFamily: 'monospace'
                    }}>
                      {selectedItem.rtsp_url || 'Chưa có'}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Lần ping cuối:</Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {selectedItem.last_heartbeat_formatted || selectedItem.last_heartbeat || 'Chưa có'}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Giây từ lần ping cuối:</Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {selectedItem.seconds_since_heartbeat ? `${selectedItem.seconds_since_heartbeat}s` : 'Chưa có'}
                    </Typography>
                  </Grid>
                </Grid>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDetail} variant="outlined" startIcon={<CloseIcon />} sx={{ borderRadius: 2 }}>Đóng</Button>
        </DialogActions>
      </Dialog>
      {/* Snackbar */}
      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default SearchCamera; 