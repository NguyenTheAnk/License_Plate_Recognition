import React, { useState } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, TextField, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert, Stack, Avatar, Divider
} from '@mui/material';
import { Search as SearchIcon, DirectionsCar, Person, Phone, Info, Close as CloseIcon, Event, Description, CameraAlt } from '@mui/icons-material';

function SearchJourney({ filters, onFilterChange, onSearch, results, loading, error, onOpenDetail }) {
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
      {/* Bộ lọc journey */}
      <Card sx={{ borderRadius: 3, boxShadow: 1, mb: 2 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <TextField label="Biển số xe" value={filters.plate_number || ''} onChange={e => onFilterChange('plate_number', e.target.value)} fullWidth size="small" InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1 }} /> }} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField label="Ngày lộ trình" type="date" value={filters.journey_date || ''} onChange={e => onFilterChange('journey_date', e.target.value)} fullWidth size="small" InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} md={2}>
              <Button variant="contained" color="primary" startIcon={<SearchIcon />} onClick={onSearch} sx={{ borderRadius: 2, px: 3, fontWeight: 600 }} disabled={loading}>
                {loading ? <CircularProgress size={20} color="inherit" /> : 'Tìm kiếm'}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      {/* Bảng kết quả journey */}
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
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Ngày</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Lộ trình</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Loại xe</TableCell>
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
                      <TableRow key={item.id || (item.plate_number + item.journey_date)} hover>
                        <TableCell sx={{ fontWeight: 700 }}>{item.plate_number}</TableCell>
                        <TableCell>{item.journey_date}</TableCell>
                        <TableCell>{item.route_description || (item.start_location + ' → ' + item.end_location)}</TableCell>
                        <TableCell>{item.vehicle_type || (item.make + ' ' + item.model)}</TableCell>
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
      {/* Modal chi tiết journey */}
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
                  <Typography variant="body2" color="text.secondary">Ngày: {selectedItem.journey_date}</Typography>
                  <Typography variant="body2" color="text.secondary">Lộ trình: {selectedItem.route_description || (selectedItem.start_location + ' → ' + selectedItem.end_location)}</Typography>
                  <Typography variant="body2" color="text.secondary">Loại xe: {selectedItem.vehicle_type || (selectedItem.make + ' ' + selectedItem.model)}</Typography>
                </Stack>
                <Divider sx={{ my: 1 }} />
                <Typography variant="body2" color="text.secondary">Camera: {selectedItem.camera_name}</Typography>
                <Typography variant="body2" color="text.secondary">Thời gian: {selectedItem.timestamp}</Typography>
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
                <Divider sx={{ my: 2 }} />
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

export default SearchJourney; 