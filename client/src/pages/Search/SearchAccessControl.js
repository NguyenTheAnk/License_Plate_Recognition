import React, { useState } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, TextField, Button, Select, MenuItem, InputLabel, FormControl, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert, Stack, Avatar, Divider
} from '@mui/material';
import { Search as SearchIcon, CheckCircle, Info, Close as CloseIcon, LocationOn, Person } from '@mui/icons-material';

const accessListTypes = [
  { value: '', label: 'Tất cả' },
  { value: 'whitelist', label: 'Whitelist' },
  { value: 'blacklist', label: 'Blacklist' }
];

function SearchAccessControl({ filters, onFilterChange, onSearch, results, loading, error, onOpenDetail, locations = [] }) {
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
      {/* Bộ lọc access control */}
      <Card sx={{ borderRadius: 3, boxShadow: 1, mb: 2 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <TextField label="Biển số xe" value={filters.plate_number || ''} onChange={e => onFilterChange('plate_number', e.target.value)} fullWidth size="small" InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1 }} /> }} />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Loại danh sách</InputLabel>
                <Select value={filters.list_type || ''} label="Loại danh sách" onChange={e => onFilterChange('list_type', e.target.value)}>
                  {accessListTypes.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
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
              <FormControl fullWidth size="small">
                <InputLabel>Trạng thái</InputLabel>
                <Select value={filters.is_active || ''} label="Trạng thái" onChange={e => onFilterChange('is_active', e.target.value)}>
                  <MenuItem value="">Tất cả</MenuItem>
                  <MenuItem value="true">Hoạt động</MenuItem>
                  <MenuItem value="false">Tạm dừng</MenuItem>
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
      {/* Bảng kết quả access control */}
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
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Loại danh sách</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Khu vực</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Người thêm</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Trạng thái</TableCell>
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
                      <TableRow key={item.id || (item.plate_number + item.list_type)} hover>
                        <TableCell>{item.plate_number}</TableCell>
                        <TableCell>{item.list_type}</TableCell>
                        <TableCell>{item.location_name}</TableCell>
                        <TableCell>{item.added_by_name}</TableCell>
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
      {/* Modal chi tiết access control */}
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
                  <CheckCircle sx={{ fontSize: 40 }} />
                </Avatar>
                <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>{selectedItem.plate_number}</Typography>
                <Stack direction="row" spacing={1} mb={2}>
                  <Typography variant="body2" color="text.secondary">Danh sách: {selectedItem.list_type}</Typography>
                  <Typography variant="body2" color="text.secondary">Khu vực: {selectedItem.location_name}</Typography>
                  <Typography variant="body2" color="text.secondary">Người thêm: {selectedItem.added_by_name}</Typography>
                  <Typography variant="body2" color="text.secondary">Trạng thái: {selectedItem.is_active ? 'Hoạt động' : 'Tạm dừng'}</Typography>
                </Stack>
                <Divider sx={{ my: 1 }} />
                <Typography variant="body2" color="text.secondary">Thời gian: {selectedItem.timestamp}</Typography>
              </Grid>
              <Grid item xs={12} md={8}>
                <Typography variant="subtitle1" fontWeight={600} mb={1}>Thông tin khác</Typography>
                <Box display="flex" alignItems="center" gap={2} mb={1}>
                  <Typography variant="body2">{selectedItem.violation_type ? `Loại vi phạm: ${selectedItem.violation_type}` : 'Không có vi phạm'}</Typography>
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

export default SearchAccessControl; 