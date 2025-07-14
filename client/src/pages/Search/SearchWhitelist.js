import React, { useState } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, TextField, Button, Select, MenuItem, InputLabel, FormControl, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert, Stack, Avatar, Divider
} from '@mui/material';
import { Search as SearchIcon, DirectionsCar, Person, Phone, Email, LocationOn, CheckCircle, Info, Close as CloseIcon } from '@mui/icons-material';

const statusOptions = [
  { value: '', label: 'Tất cả' },
  { value: 'whitelist', label: 'Whitelist' }
];
const validStatusOptions = [
  { value: '', label: 'Tất cả' },
  { value: 'valid', label: 'Còn hiệu lực' },
  { value: 'expired', label: 'Hết hạn' },
  { value: 'future', label: 'Chưa có hiệu lực' },
  { value: 'permanent', label: 'Vĩnh viễn' }
];
const approvalOptions = [
  { value: '', label: 'Tất cả' },
  { value: 'approved', label: 'Đã duyệt' },
  { value: 'pending', label: 'Chờ duyệt' },
  { value: 'rejected', label: 'Từ chối' }
];

function SearchWhitelist({ filters, onFilterChange, onSearch, results, loading, error, onOpenDetail, locations = [], cameras = [] }) {
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
      {/* Bộ lọc whitelist */}
      <Card sx={{ borderRadius: 3, boxShadow: 1, mb: 2 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <TextField label="Biển số xe" value={filters.plate_number} onChange={e => onFilterChange('plate_number', e.target.value)} fullWidth size="small" InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1 }} /> }} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField label="Chủ xe" value={filters.owner_name} onChange={e => onFilterChange('owner_name', e.target.value)} fullWidth size="small" InputProps={{ startAdornment: <Person sx={{ mr: 1 }} /> }} />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField label="SĐT chủ xe" value={filters.owner_phone} onChange={e => onFilterChange('owner_phone', e.target.value)} fullWidth size="small" InputProps={{ startAdornment: <Phone sx={{ mr: 1 }} /> }} />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField label="Email liên hệ" value={filters.contact_email} onChange={e => onFilterChange('contact_email', e.target.value)} fullWidth size="small" InputProps={{ startAdornment: <Email sx={{ mr: 1 }} /> }} />
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Khu vực</InputLabel>
                <Select value={filters.location_id} label="Khu vực" onChange={e => onFilterChange('location_id', e.target.value)}>
                  <MenuItem value="">Tất cả</MenuItem>
                  {locations.map(loc => <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Trạng thái</InputLabel>
                <Select value={filters.status} label="Trạng thái" onChange={e => onFilterChange('status', e.target.value)}>
                  {statusOptions.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Hiệu lực</InputLabel>
                <Select value={filters.valid_status} label="Hiệu lực" onChange={e => onFilterChange('valid_status', e.target.value)}>
                  {validStatusOptions.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Phê duyệt</InputLabel>
                <Select value={filters.approval_status} label="Phê duyệt" onChange={e => onFilterChange('approval_status', e.target.value)}>
                  {approvalOptions.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField label="Ngày hiệu lực từ" type="date" value={filters.date_from} onChange={e => onFilterChange('date_from', e.target.value)} fullWidth size="small" InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField label="Ngày hiệu lực đến" type="date" value={filters.date_to} onChange={e => onFilterChange('date_to', e.target.value)} fullWidth size="small" InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Camera</InputLabel>
                <Select value={filters.camera_id} label="Camera" onChange={e => onFilterChange('camera_id', e.target.value)}>
                  <MenuItem value="">Tất cả</MenuItem>
                  {cameras.map(cam => <MenuItem key={cam.id} value={cam.id}>{cam.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <Button variant="contained" color="primary" startIcon={<SearchIcon />} onClick={onSearch} sx={{ borderRadius: 2, px: 3, fontWeight: 600 }} disabled={loading}>
                {loading ? <CircularProgress size={20} color="inherit" /> : 'Tìm kiếm'}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      {/* Bảng kết quả whitelist */}
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
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Ảnh</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Chủ xe</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Khu vực</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Trạng thái</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Hiệu lực</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Phê duyệt</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thao tác</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {results.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center">
                        <Typography color="text.secondary" sx={{ py: 4 }}>Không có kết quả</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    results.map(item => (
                      <TableRow key={item.id} hover>
                        <TableCell sx={{ fontWeight: 600, fontSize: 16 }}>{item.plate_number}</TableCell>
                        <TableCell>
                          <Avatar variant="rounded" src={item.detected_plate_image || item.plate_image || ''} sx={{ width: 60, height: 36, bgcolor: '#e0e0e0' }}>
                            <DirectionsCar />
                          </Avatar>
                        </TableCell>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={1}>
                            <Person sx={{ fontSize: 18, color: '#1976d2' }} />
                            <Typography variant="body2" fontWeight={500}>{item.owner_name}</Typography>
                          </Box>
                          <Box display="flex" alignItems="center" gap={1}>
                            <Phone sx={{ fontSize: 16, color: '#888' }} />
                            <Typography variant="caption" color="text.secondary">{item.owner_phone}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={1}>
                            <LocationOn sx={{ fontSize: 18, color: '#1976d2' }} />
                            <Typography variant="body2" fontWeight={500}>{item.location_name}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip label="Whitelist" color="success" size="small" />
                        </TableCell>
                        <TableCell>
                          <Chip label={item.current_status === 'valid' ? 'Còn hiệu lực' : item.current_status === 'expired' ? 'Hết hạn' : item.current_status === 'future' ? 'Chưa hiệu lực' : 'Vĩnh viễn'} color={item.current_status === 'valid' ? 'success' : item.current_status === 'expired' ? 'error' : item.current_status === 'future' ? 'warning' : 'info'} size="small" />
                        </TableCell>
                        <TableCell>
                          <Chip label={item.approval_status === 'approved' ? 'Đã duyệt' : item.approval_status === 'pending' ? 'Chờ duyệt' : 'Từ chối'} color={item.approval_status === 'approved' ? 'success' : item.approval_status === 'pending' ? 'warning' : 'error'} size="small" />
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
      {/* Modal chi tiết whitelist */}
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
                <Avatar variant="rounded" src={selectedItem.detected_plate_image || selectedItem.plate_image || ''} sx={{ width: 120, height: 70, bgcolor: '#e0e0e0', mb: 2 }}>
                  <DirectionsCar sx={{ fontSize: 40 }} />
                </Avatar>
                <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>{selectedItem.plate_number}</Typography>
                <Stack direction="row" spacing={1} mb={2}>
                  <Chip label="Whitelist" color="success" size="small" />
                  <Chip label={selectedItem.current_status === 'valid' ? 'Còn hiệu lực' : selectedItem.current_status === 'expired' ? 'Hết hạn' : selectedItem.current_status === 'future' ? 'Chưa hiệu lực' : 'Vĩnh viễn'} color={selectedItem.current_status === 'valid' ? 'success' : selectedItem.current_status === 'expired' ? 'error' : selectedItem.current_status === 'future' ? 'warning' : 'info'} size="small" />
                  <Chip label={selectedItem.approval_status === 'approved' ? 'Đã duyệt' : selectedItem.approval_status === 'pending' ? 'Chờ duyệt' : 'Từ chối'} color={selectedItem.approval_status === 'approved' ? 'success' : selectedItem.approval_status === 'pending' ? 'warning' : 'error'} size="small" />
                </Stack>
                <Divider sx={{ my: 1 }} />
                <Typography variant="body2" color="text.secondary">Khu vực: {selectedItem.location_name}</Typography>
                <Typography variant="body2" color="text.secondary">Camera: {selectedItem.camera_name}</Typography>
                <Typography variant="body2" color="text.secondary">Ngày hiệu lực: {selectedItem.valid_from} - {selectedItem.valid_to}</Typography>
                <Typography variant="body2" color="text.secondary">Ngày tạo: {selectedItem.created_at}</Typography>
              </Grid>
              <Grid item xs={12} md={8}>
                <Typography variant="subtitle1" fontWeight={600} mb={1}>Thông tin chủ xe</Typography>
                <Box display="flex" alignItems="center" gap={2} mb={1}>
                  <Person color="info" />
                  <Typography variant="body2" fontWeight={500}>{selectedItem.owner_name}</Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={2} mb={1}>
                  <Phone color="success" />
                  <Typography variant="body2">{selectedItem.owner_phone}</Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={2} mb={1}>
                  <Email color="warning" />
                  <Typography variant="body2">{selectedItem.contact_email}</Typography>
                </Box>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle1" fontWeight={600} mb={1}>Thông tin khác</Typography>
                <Box display="flex" alignItems="center" gap={2} mb={1}>
                  <Typography variant="body2">{selectedItem.description}</Typography>
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

export default SearchWhitelist; 