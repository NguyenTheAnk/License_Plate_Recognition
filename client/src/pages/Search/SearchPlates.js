import React, { useState } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, TextField, Button, Select, MenuItem, InputLabel, FormControl, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert, Stack, Avatar, Divider
} from '@mui/material';
import { Search as SearchIcon, DirectionsCar, CameraAlt, LocationOn, Info, Close as CloseIcon, Person, Phone, Email, Description, Event } from '@mui/icons-material';

function SearchPlates({ filters, onFilterChange, onSearch, results, loading, error, onOpenDetail, locations = [], cameras = [] }) {
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
      {/* Bộ lọc plates */}
      <Card sx={{ borderRadius: 3, boxShadow: 1, mb: 2 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <TextField label="Biển số xe" value={filters.plate_number || ''} onChange={e => onFilterChange('plate_number', e.target.value)} fullWidth size="small" InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1 }} /> }} />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Camera</InputLabel>
                <Select value={filters.camera_id || ''} label="Camera" onChange={e => onFilterChange('camera_id', e.target.value)}>
                  <MenuItem value="">Tất cả</MenuItem>
                  {cameras.map(cam => <MenuItem key={cam.id} value={cam.id}>{cam.name}</MenuItem>)}
                </Select>
              </FormControl>
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
            <Grid item xs={12} md={3}>
              <TextField label="Thời gian từ" type="date" value={filters.date_from || ''} onChange={e => onFilterChange('date_from', e.target.value)} fullWidth size="small" InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField label="Thời gian đến" type="date" value={filters.date_to || ''} onChange={e => onFilterChange('date_to', e.target.value)} fullWidth size="small" InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} md={2}>
              <Button variant="contained" color="primary" startIcon={<SearchIcon />} onClick={onSearch} sx={{ borderRadius: 2, px: 3, fontWeight: 600 }} disabled={loading}>
                {loading ? <CircularProgress size={20} color="inherit" /> : 'Tìm kiếm'}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      {/* Bảng kết quả plates */}
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
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Biển số</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Ảnh phát hiện</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Camera</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Khu vực</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thời gian</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thao tác</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {results.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        <Typography color="text.secondary" sx={{ py: 4 }}>Không có kết quả</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    results.map(item => (
                      <TableRow key={item.id || (item.plate_number + item.timestamp)} hover>
                        <TableCell sx={{ fontWeight: 700 }}>{item.plate_number}</TableCell>
                        <TableCell>
                          <Avatar variant="rounded" src={item.plate_image || ''} sx={{ width: 60, height: 36, bgcolor: '#e0e0e0' }}>
                            <DirectionsCar />
                          </Avatar>
                        </TableCell>
                        <TableCell>{item.camera_name}</TableCell>
                        <TableCell>{item.location_name}</TableCell>
                        <TableCell>{item.timestamp}</TableCell>
                        <TableCell>
                          <Button variant="outlined" size="small" onClick={() => handleOpenDetail(item)} startIcon={<Info />} sx={{ borderRadius: 2, fontWeight: 600 }}>Chi tiết</Button>
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
      {/* Modal chi tiết plates */}
      <Dialog open={openDetail} onClose={handleCloseDetail} maxWidth="md" fullWidth>
        <DialogTitle sx={{ background: 'linear-gradient(90deg, #1976d2 60%, #42a5f5 100%)', color: 'white', display: 'flex', alignItems: 'center', gap: 2 }}>
          <Info sx={{ mr: 1 }} /> Thông tin chi tiết
          <IconButton onClick={handleCloseDetail} sx={{ ml: 'auto', color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {selectedItem && (
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <Avatar variant="rounded" sx={{ width: 120, height: 70, bgcolor: '#e0e0e0', mb: 2 }}>
                  <DirectionsCar sx={{ fontSize: 40 }} />
                </Avatar>
                <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>{selectedItem.plate_number}</Typography>
                <Stack direction="row" spacing={1} mb={2}>
                  <Typography variant="body2" color="text.secondary">Ảnh: {selectedItem.plate_image ? 'Có' : 'Không'}</Typography>
                  <Typography variant="body2" color="text.secondary">Camera: {selectedItem.camera_name}</Typography>
                  <Typography variant="body2" color="text.secondary">Khu vực: {selectedItem.location_name}</Typography>
                  <Typography variant="body2" color="text.secondary">Thời gian: {selectedItem.timestamp}</Typography>
                </Stack>
                <Divider sx={{ my: 1 }} />
                <Typography variant="body2" color="text.secondary">Chủ xe: {selectedItem.owner_name}</Typography>
                <Typography variant="body2" color="text.secondary">SĐT: {selectedItem.owner_phone}</Typography>
                <Typography variant="body2" color="text.secondary">Email: {selectedItem.contact_email}</Typography>
              </Grid>
              <Grid item xs={12} md={8}>
                <Typography variant="subtitle1" fontWeight={600} mb={1}>Thông tin khác</Typography>
                <Box display="flex" alignItems="center" gap={2} mb={1}>
                  <Description color="secondary" />
                  <Typography variant="body2">{selectedItem.violation_type ? `Loại vi phạm: ${selectedItem.violation_type}` : 'Không có vi phạm'}</Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={2} mb={1}>
                  <Event color="primary" />
                  <Typography variant="body2">Lịch sử phát hiện: {selectedItem.history_count || 0} lần</Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={2} mb={1}>
                  <CameraAlt color="action" />
                  <Typography variant="body2">Camera: {selectedItem.camera_name}</Typography>
                </Box>
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

export default SearchPlates; 