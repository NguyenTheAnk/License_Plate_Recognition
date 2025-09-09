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
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Tên camera</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Mã</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Vị trí</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Trạng thái</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thao tác</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {results.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        <Typography color="text.secondary" sx={{ py: 4 }}>Không có kết quả</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    results.map(item => (
                      <TableRow key={item.id || item.camera_key} hover>
                        <TableCell>{item.name}</TableCell>
                        <TableCell>{item.camera_key || item.camera_id}</TableCell>
                        <TableCell>{item.location_name}</TableCell>
                        <TableCell>
                          <Chip label={item.is_active ? 'Hoạt động' : 'Tạm dừng'} color={item.is_active ? 'success' : 'default'} size="small" />
                        </TableCell>
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
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <Avatar variant="rounded" sx={{ width: 120, height: 70, bgcolor: '#e0e0e0', mb: 2 }}>
                  <CameraAlt sx={{ fontSize: 40 }} />
                </Avatar>
                <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>{selectedItem.name}</Typography>
                <Typography variant="body2" color="text.secondary">Mã: {selectedItem.camera_key || selectedItem.camera_id}</Typography>
                <Typography variant="body2" color="text.secondary">Vị trí: {selectedItem.location_name}</Typography>
                <Typography variant="body2" color="text.secondary">Trạng thái: {selectedItem.is_active ? 'Hoạt động' : 'Tạm dừng'}</Typography>
              </Grid>
              <Grid item xs={12} md={8}>
                <Typography variant="subtitle1" fontWeight={600} mb={1}>Thông tin chi tiết</Typography>
                <Typography variant="body2">{selectedItem.description}</Typography>
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