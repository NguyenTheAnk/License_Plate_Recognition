import React, { useState } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, TextField, Button, Select, MenuItem, InputLabel, FormControl, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert, Stack, Avatar, Divider
} from '@mui/material';
import { Search as SearchIcon, LocationOn, Info, Close as CloseIcon } from '@mui/icons-material';

const zoneTypeOptions = [
  { value: '', label: 'Tất cả' },
  { value: 'entry', label: 'Cổng vào' },
  { value: 'exit', label: 'Cổng ra' },
  { value: 'parking', label: 'Bãi xe' },
  { value: 'internal', label: 'Nội bộ' }
];

const statusOptions = [
  { value: '', label: 'Tất cả' },
  { value: 'active', label: 'Hoạt động' },
  { value: 'inactive', label: 'Tạm dừng' }
];

// THÊM: Pagination helper function
function getPaginationItems(current, total) {
  const delta = 1;
  const range = [];
  const rangeWithDots = [];
  let l;

  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      range.push(i);
    }
  }

  for (let i of range) {
    if (l) {
      if (i - l === 2) {
        rangeWithDots.push(l + 1);
      } else if (i - l > 2) {
        rangeWithDots.push('...');
      }
    }
    rangeWithDots.push(i);
    l = i;
  }
  return rangeWithDots;
}

function SearchLocation({ 
  filters, 
  onFilterChange, 
  onSearch, 
  results, 
  loading, 
  error, 
  onOpenDetail, 
  // THÊM: Các props cho phân trang
  currentPage = 1, 
  totalPages = 1,
  totalItems = 0,
  itemsPerPage = 10,
  onPageChange,
  onItemsPerPageChange
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

  // THÊM: Xử lý thay đổi số items per page
  const handleItemsPerPageChange = (event) => {
    if (onItemsPerPageChange) {
      onItemsPerPageChange(parseInt(event.target.value));
    }
  };

  return (
    <Box>
      {/* Bộ lọc location */}
      <Card sx={{ borderRadius: 3, boxShadow: 1, mb: 2 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <TextField 
                label="Tên khu vực" 
                value={filters.name || ''} 
                onChange={e => onFilterChange('name', e.target.value)} 
                fullWidth 
                size="small" 
                InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1 }} /> }} 
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField 
                label="Mã khu vực" 
                value={filters.code || ''} 
                onChange={e => onFilterChange('code', e.target.value)} 
                fullWidth 
                size="small" 
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Loại</InputLabel>
                <Select 
                  value={filters.zone_type || ''} 
                  label="Loại" 
                  onChange={e => onFilterChange('zone_type', e.target.value)}
                >
                  {zoneTypeOptions.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Trạng thái</InputLabel>
                <Select 
                  value={filters.status || ''} 
                  label="Trạng thái" 
                  onChange={e => onFilterChange('status', e.target.value)}
                >
                  {statusOptions.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
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

      {/* Bảng kết quả location */}
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
                    <TableRow sx={{ background: '#1976d2' }}>
                      <TableCell sx={{ color: 'white', fontWeight: 700 }}>STT</TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 700 }}>Tên khu vực</TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 700 }}>Mã</TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 700 }}>Loại</TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 700 }}>Trạng thái</TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thao tác</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {results.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} align="center">
                          <Typography color="text.secondary" sx={{ py: 4 }}>
                            Không có kết quả
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      results.map((item, idx) => (
                        <TableRow key={item.id || item.code} hover>
                          <TableCell>
                            {((currentPage - 1) * itemsPerPage) + idx + 1}
                          </TableCell>
                          <TableCell>{item.name}</TableCell>
                          <TableCell>{item.code}</TableCell>
                          <TableCell>{item.zone_type}</TableCell>
                          <TableCell>
                            <Chip 
                              label={item.is_active ? 'Hoạt động' : 'Tạm dừng'} 
                              color={item.is_active ? 'success' : 'default'} 
                              size="small" 
                            />
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="outlined" 
                              size="small" 
                              onClick={() => handleOpenDetail(item)} 
                              startIcon={<Info />} 
                              sx={{ borderRadius: 2, fontWeight: 600 }}
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

              {/* THÊM: Enhanced Pagination giống Search.js */}
              <Box sx={{ 
                borderTop: '1px solid rgba(0, 0, 0, 0.1)',
                background: 'rgba(0, 0, 0, 0.02)'
              }}>
                <Typography variant="body2" color="textSecondary" sx={{ fontWeight: 500, px: 3, pt: 2 }}>
                  Hiển thị {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalItems)} / {totalItems} bản ghi
                </Typography>
                <Box display="flex" justifyContent="space-between" alignItems="center" p={3}>
                  <FormControl size="small" sx={{ minWidth: 120, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500, mr: 1 }}>
                      Hiển thị
                    </Typography>
                    <Select
                      value={itemsPerPage}
                      onChange={handleItemsPerPageChange}
                      sx={{ minWidth: 60, mx: 0.5 }}
                      size="small"
                      displayEmpty
                      inputProps={{ 'aria-label': 'Số hàng mỗi trang' }}
                    >
                      {[5, 10, 20, 50, 100].map(size => (
                        <MenuItem key={size} value={size}>{size}</MenuItem>
                      ))}
                    </Select>
                    <Typography variant="body2" sx={{ fontWeight: 500, ml: 1 }}>
                      hàng
                    </Typography>
                  </FormControl>
                  
                  {/* Always show pagination controls */}
                  <Box display="flex" alignItems="center" gap={1}>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={currentPage === 1}
                      onClick={() => onPageChange && onPageChange(1)}
                      sx={{ minWidth: 36, fontWeight: 600, borderRadius: 2, mx: 0.25 }}
                    >
                      {'<<'}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={currentPage === 1}
                      onClick={() => onPageChange && onPageChange(currentPage - 1)}
                      sx={{ minWidth: 36, fontWeight: 600, borderRadius: 2, mx: 0.25 }}
                    >
                      {'<'}
                    </Button>
                    {getPaginationItems(currentPage, totalPages).map((item, idx) =>
                      item === '...'
                        ? <Box key={idx} sx={{ px: 1, color: '#888', fontWeight: 600 }}>...</Box>
                        : <Button
                            key={item}
                            variant={item === currentPage ? 'contained' : 'outlined'}
                            color={item === currentPage ? 'primary' : 'inherit'}
                            size="small"
                            sx={{ 
                              minWidth: 36, 
                              fontWeight: 600, 
                              borderRadius: 2, 
                              mx: 0.25,
                              ...(item === currentPage && { boxShadow: '0 2px 8px rgba(25, 118, 210, 0.15)' })
                            }}
                            onClick={() => onPageChange && onPageChange(item)}
                          >
                            {item}
                          </Button>
                    )}
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={currentPage === totalPages || totalPages === 0}
                      onClick={() => onPageChange && onPageChange(currentPage + 1)}
                      sx={{ minWidth: 36, fontWeight: 600, borderRadius: 2, mx: 0.25 }}
                    >
                      {'>'}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={currentPage === totalPages || totalPages === 0}
                      onClick={() => onPageChange && onPageChange(totalPages)}
                      sx={{ minWidth: 36, fontWeight: 600, borderRadius: 2, mx: 0.25 }}
                    >
                      {'>>'}
                    </Button>
                  </Box>
                </Box>
              </Box>
            </>
          )}
        </CardContent>
      </Card>

      {/* Modal chi tiết location */}
      <Dialog open={openDetail} onClose={handleCloseDetail} maxWidth="md" fullWidth>
        <DialogTitle sx={{ 
          background: 'linear-gradient(90deg, #7b1fa2 60%, #ba68c8 100%)', 
          color: 'white', 
          display: 'flex', 
          alignItems: 'center', 
          gap: 2 
        }}>
          <Info sx={{ mr: 1 }} /> 
          Thông tin chi tiết
          <IconButton onClick={handleCloseDetail} sx={{ ml: 'auto', color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {selectedItem && (
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <Avatar variant="rounded" sx={{ width: 120, height: 70, bgcolor: '#e0e0e0', mb: 2 }}>
                  <LocationOn sx={{ fontSize: 40 }} />
                </Avatar>
                <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
                  {selectedItem.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Mã: {selectedItem.code}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Loại: {selectedItem.zone_type}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Trạng thái: {selectedItem.is_active ? 'Hoạt động' : 'Tạm dừng'}
                </Typography>
              </Grid>
              <Grid item xs={12} md={8}>
                <Typography variant="subtitle1" fontWeight={600} mb={1}>
                  Địa chỉ
                </Typography>
                <Typography variant="body2">{selectedItem.address}</Typography>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle1" fontWeight={600} mb={1}>
                  Mô tả
                </Typography>
                <Typography variant="body2">{selectedItem.description}</Typography>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={handleCloseDetail} 
            variant="outlined" 
            startIcon={<CloseIcon />} 
            sx={{ borderRadius: 2 }}
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

export default SearchLocation;