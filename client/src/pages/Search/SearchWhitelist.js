import React, { useState } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, TextField, Button, Select, MenuItem, InputLabel, FormControl, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert, Stack, Avatar, Divider, TablePagination
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

function SearchWhitelist({ 
  filters, 
  onFilterChange, 
  onSearch, 
  results, 
  loading, 
  error, 
  onOpenDetail, 
  locations = [], 
  cameras = [], 
  page = 0, 
  rowsPerPage = 10, 
  totalCount = 0,
  onPageChange,
  onRowsPerPageChange 
}) {
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

  const handleChangePage = (event, newPage) => {
    if (onPageChange) onPageChange(event, newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    if (onRowsPerPageChange) onRowsPerPageChange(event);
  };

  return (
    <Box>
      {/* Bộ lọc whitelist */}
      <Card sx={{ borderRadius: 3, boxShadow: 1, mb: 2 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <TextField 
                label="Biển số xe" 
                value={filters.plate_number || ''} 
                onChange={e => onFilterChange('plate_number', e.target.value)} 
                fullWidth 
                size="small" 
                InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1 }} /> }} 
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField 
                label="Chủ xe" 
                value={filters.owner_name || ''} 
                onChange={e => onFilterChange('owner_name', e.target.value)} 
                fullWidth 
                size="small" 
                InputProps={{ startAdornment: <Person sx={{ mr: 1 }} /> }} 
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField 
                label="SĐT chủ xe" 
                value={filters.owner_phone || ''} 
                onChange={e => onFilterChange('owner_phone', e.target.value)} 
                fullWidth 
                size="small" 
                InputProps={{ startAdornment: <Phone sx={{ mr: 1 }} /> }} 
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField 
                label="Email liên hệ" 
                value={filters.contact_email || ''} 
                onChange={e => onFilterChange('contact_email', e.target.value)} 
                fullWidth 
                size="small" 
                InputProps={{ startAdornment: <Email sx={{ mr: 1 }} /> }} 
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Khu vực</InputLabel>
                <Select 
                  value={filters.location_id || ''} 
                  label="Khu vực" 
                  onChange={e => onFilterChange('location_id', e.target.value)}
                >
                  <MenuItem value="">Tất cả</MenuItem>
                  {locations.map(loc => (
                    <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Hiệu lực</InputLabel>
                <Select 
                  value={filters.valid_status || ''} 
                  label="Hiệu lực" 
                  onChange={e => onFilterChange('valid_status', e.target.value)}
                >
                  {validStatusOptions.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Phê duyệt</InputLabel>
                <Select 
                  value={filters.approval_status || ''} 
                  label="Phê duyệt" 
                  onChange={e => onFilterChange('approval_status', e.target.value)}
                >
                  {approvalOptions.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField 
                label="Ngày hiệu lực từ" 
                type="date" 
                value={filters.date_from || ''} 
                onChange={e => onFilterChange('date_from', e.target.value)} 
                fullWidth 
                size="small" 
                InputLabelProps={{ shrink: true }} 
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField 
                label="Ngày hiệu lực đến" 
                type="date" 
                value={filters.date_to || ''} 
                onChange={e => onFilterChange('date_to', e.target.value)} 
                fullWidth 
                size="small" 
                InputLabelProps={{ shrink: true }} 
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Camera</InputLabel>
                <Select 
                  value={filters.camera_id || ''} 
                  label="Camera" 
                  onChange={e => onFilterChange('camera_id', e.target.value)}
                >
                  <MenuItem value="">Tất cả</MenuItem>
                  {cameras.map(cam => (
                    <MenuItem key={cam.id} value={cam.id}>{cam.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <Button 
                variant="contained" 
                color="primary" 
                startIcon={<SearchIcon />} 
                onClick={onSearch} 
                sx={{ borderRadius: 2, px: 3, fontWeight: 600 }} 
                disabled={loading}
              >
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
            <>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow sx={{ background: 'linear-gradient(90deg, #2e7d32 0%, #4caf50 100%)' }}>
                      <TableCell sx={{ color: 'white', fontWeight: 700, width: '80px' }}>
                        <Box display="flex" alignItems="center" gap={1}>
                          STT
                        </Box>
                      </TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 700 }}>
                        <Box display="flex" alignItems="center" gap={1}>
                          <DirectionsCar />
                          Biển số
                        </Box>
                      </TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 700 }}>Ảnh</TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 700 }}>
                        <Box display="flex" alignItems="center" gap={1}>
                          <Person />
                          Chủ xe
                        </Box>
                      </TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 700 }}>
                        <Box display="flex" alignItems="center" gap={1}>
                          <LocationOn />
                          Khu vực
                        </Box>
                      </TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 700 }}>Trạng thái</TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 700 }}>Phê duyệt</TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thao tác</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {results.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} align="center">
                          <Box display="flex" flexDirection="column" alignItems="center" gap={2} py={4}>
                            <Avatar sx={{ bgcolor: 'grey.100', width: 64, height: 64 }}>
                              <SearchIcon sx={{ fontSize: 32, color: 'grey.400' }} />
                            </Avatar>
                            <Typography variant="h6" color="text.secondary">
                              Không tìm thấy kết quả
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Thử điều chỉnh bộ lọc hoặc từ khóa tìm kiếm
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ) : (
                      results.map((item, idx) => (
                        <TableRow 
                          key={item.id} 
                          hover
                          sx={{ 
                            '&:hover': { 
                              backgroundColor: 'rgba(46, 125, 50, 0.04)',
                              cursor: 'pointer'
                            },
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <TableCell sx={{ fontWeight: 600, color: 'primary.main' }}>
                            {page * rowsPerPage + idx + 1}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 600, fontSize: 16, color: 'primary.main' }}>
                            {item.plate_number}
                          </TableCell>
                          <TableCell>
                            <Avatar 
                              variant="rounded" 
                              src={item.detected_plate_image || item.plate_image || ''} 
                              sx={{ 
                                width: 80, 
                                height: 48, 
                                bgcolor: '#e8f5e9',
                                border: '2px solid #4caf50'
                              }}
                            >
                              <DirectionsCar sx={{ color: '#4caf50' }} />
                            </Avatar>
                          </TableCell>
                          <TableCell>
                            <Box>
                              <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                                <Person sx={{ fontSize: 16, color: 'primary.main' }} />
                                <Typography variant="body2" fontWeight={600}>
                                  {item.owner_name || 'Chưa có thông tin'}
                                </Typography>
                              </Box>
                              <Box display="flex" alignItems="center" gap={1}>
                                <Phone sx={{ fontSize: 14, color: 'text.secondary' }} />
                                <Typography variant="caption" color="text.secondary">
                                  {item.owner_phone || 'N/A'}
                                </Typography>
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Box display="flex" alignItems="center" gap={1}>
                              <LocationOn sx={{ fontSize: 16, color: 'primary.main' }} />
                              <Typography variant="body2" fontWeight={500}>
                                {item.location_name || 'N/A'}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={
                                item.current_status === 'valid' ? 'Còn hiệu lực' : 
                                item.current_status === 'expired' ? 'Hết hạn' : 
                                item.current_status === 'future' ? 'Chưa hiệu lực' : 'Vĩnh viễn'
                              } 
                              color={
                                item.current_status === 'valid' ? 'success' : 
                                item.current_status === 'expired' ? 'error' : 
                                item.current_status === 'future' ? 'warning' : 'info'
                              } 
                              size="small"
                              sx={{ fontWeight: 600 }}
                            />
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={
                                item.approval_status === 'approved' ? 'Đã duyệt' : 
                                item.approval_status === 'pending' ? 'Chờ duyệt' : 'Từ chối'
                              } 
                              color={
                                item.approval_status === 'approved' ? 'success' : 
                                item.approval_status === 'pending' ? 'warning' : 'error'
                              } 
                              size="small"
                              sx={{ fontWeight: 600 }}
                            />
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="outlined" 
                              size="small" 
                              onClick={() => handleOpenDetail(item)} 
                              startIcon={<Info />} 
                              sx={{ 
                                borderRadius: 2, 
                                fontWeight: 600,
                                textTransform: 'none'
                              }}
                            >
                              Chi tiết
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Phân trang */}
              <TablePagination
                component="div"
                count={totalCount}
                page={page}
                onPageChange={handleChangePage}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={handleChangeRowsPerPage}
                labelRowsPerPage="Số dòng mỗi trang:"
                labelDisplayedRows={({ from, to, count }) => 
                  `${from}–${to} trong tổng số ${count !== -1 ? count : `hơn ${to}`} kết quả`
                }
                rowsPerPageOptions={[5, 10, 20, 50, 100]}
                sx={{
                  borderTop: 1,
                  borderColor: 'divider',
                  '& .MuiTablePagination-toolbar': {
                    px: 3
                  },
                  '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
                    fontWeight: 500,
                    color: 'text.secondary'
                  }
                }}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Modal chi tiết whitelist */}
      <Dialog open={openDetail} onClose={handleCloseDetail} maxWidth="md" fullWidth>
        <DialogTitle sx={{ 
          background: 'linear-gradient(90deg, #2e7d32 60%, #4caf50 100%)', 
          color: 'white', 
          display: 'flex', 
          alignItems: 'center', 
          gap: 2 
        }}>
          <CheckCircle sx={{ mr: 1 }} /> 
          Thông tin chi tiết - Whitelist
          <IconButton onClick={handleCloseDetail} sx={{ ml: 'auto', color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {selectedItem && (
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <Avatar 
                  variant="rounded" 
                  src={selectedItem.detected_plate_image || selectedItem.plate_image || ''} 
                  sx={{ 
                    width: 120, 
                    height: 70, 
                    bgcolor: '#e8f5e9', 
                    border: '3px solid #4caf50',
                    mb: 2 
                  }}
                >
                  <DirectionsCar sx={{ fontSize: 40, color: '#4caf50' }} />
                </Avatar>
                <Typography variant="h5" fontWeight={700} sx={{ mb: 1, color: 'primary.main' }}>
                  {selectedItem.plate_number}
                </Typography>
                <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
                  <Chip 
                    label="Whitelist" 
                    color="success" 
                    size="small" 
                    sx={{ fontWeight: 600 }}
                  />
                  <Chip 
                    label={
                      selectedItem.current_status === 'valid' ? 'Còn hiệu lực' : 
                      selectedItem.current_status === 'expired' ? 'Hết hạn' : 
                      selectedItem.current_status === 'future' ? 'Chưa hiệu lực' : 'Vĩnh viễn'
                    } 
                    color={
                      selectedItem.current_status === 'valid' ? 'success' : 
                      selectedItem.current_status === 'expired' ? 'error' : 
                      selectedItem.current_status === 'future' ? 'warning' : 'info'
                    } 
                    size="small" 
                    sx={{ fontWeight: 600 }}
                  />
                  <Chip 
                    label={
                      selectedItem.approval_status === 'approved' ? 'Đã duyệt' : 
                      selectedItem.approval_status === 'pending' ? 'Chờ duyệt' : 'Từ chối'
                    } 
                    color={
                      selectedItem.approval_status === 'approved' ? 'success' : 
                      selectedItem.approval_status === 'pending' ? 'warning' : 'error'
                    } 
                    size="small" 
                    sx={{ fontWeight: 600 }}
                  />
                </Stack>
                <Divider sx={{ my: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  <strong>Khu vực:</strong> {selectedItem.location_name || 'N/A'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>Camera:</strong> {selectedItem.camera_name || 'N/A'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>Ngày hiệu lực:</strong> {selectedItem.valid_from || 'N/A'} - {selectedItem.valid_to || 'Vĩnh viễn'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>Ngày tạo:</strong> {selectedItem.created_at || 'N/A'}
                </Typography>
              </Grid>
              <Grid item xs={12} md={8}>
                <Typography variant="h6" fontWeight={600} mb={2} color="success.main">
                  <Person sx={{ mr: 1, verticalAlign: 'middle' }} />
                  Thông tin chủ xe
                </Typography>
                <Box display="flex" alignItems="center" gap={2} mb={1}>
                  <Person color="info" />
                  <Box>
                    <Typography variant="caption" color="text.secondary">Họ tên</Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {selectedItem.owner_name || 'Chưa có thông tin'}
                    </Typography>
                  </Box>
                </Box>
                <Box display="flex" alignItems="center" gap={2} mb={1}>
                  <Phone color="success" />
                  <Box>
                    <Typography variant="caption" color="text.secondary">Số điện thoại</Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {selectedItem.owner_phone || 'N/A'}
                    </Typography>
                  </Box>
                </Box>
                <Box display="flex" alignItems="center" gap={2} mb={1}>
                  <Email color="warning" />
                  <Box>
                    <Typography variant="caption" color="text.secondary">Email</Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {selectedItem.contact_email || 'N/A'}
                    </Typography>
                  </Box>
                </Box>
                <Divider sx={{ my: 2 }} />
                <Typography variant="h6" fontWeight={600} mb={1} color="info.main">
                  Thông tin bổ sung
                </Typography>
                {selectedItem.description && (
                  <Typography variant="body2" sx={{ 
                    p: 2, 
                    bgcolor: 'grey.50', 
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'grey.200'
                  }}>
                    {selectedItem.description}
                  </Typography>
                )}
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button 
            onClick={handleCloseDetail} 
            variant="outlined" 
            startIcon={<CloseIcon />} 
            sx={{ borderRadius: 2, fontWeight: 600 }}
          >
            Đóng
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={4000} 
        onClose={() => setSnackbar({ ...snackbar, open: false })} 
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setSnackbar({ ...snackbar, open: false })} 
          severity={snackbar.severity} 
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default SearchWhitelist;