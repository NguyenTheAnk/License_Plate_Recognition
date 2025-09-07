import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, TextField, Button, Select, MenuItem, InputLabel, FormControl, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert, Stack, Checkbox, InputBase, Radio, RadioGroup, FormControlLabel
} from '@mui/material';
import { 
  Search as SearchIcon, 
  DirectionsCar, 
  CameraAlt, 
  LocationOn, 
  CheckCircle, 
  Cancel, 
  Info, 
  Close as CloseIcon,
  Delete,
  Edit,
  Visibility,
  FirstPage,
  LastPage,
  ChevronLeft,
  ChevronRight,
  Route as RouteIcon
} from '@mui/icons-material';
import { fetchDataFromAPI, fetchDataFromFlaskAPI } from '../../utils/auth';

const vehicleTypeOptions = [
  { value: '', label: 'Tất cả' },
  { value: 'motorcycle', label: 'Xe máy' },
  { value: 'car', label: 'Ô tô' },
  { value: 'truck', label: 'Xe tải' },
  { value: 'bus', label: 'Xe buýt' },
  { value: 'other', label: 'Khác' }
];

const confidenceOptions = [
  { value: '', label: 'Tất cả' },
  { value: '0.8-1.0', label: 'Rất cao (0.8-1.0)' },
  { value: '0.6-0.8', label: 'Cao (0.6-0.8)' },
  { value: '0.4-0.6', label: 'Trung bình (0.4-0.6)' },
  { value: '0.2-0.4', label: 'Thấp (0.2-0.4)' }
];

function RouteMonitoringPage() {
  const [detections, setDetections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [openDetail, setOpenDetail] = useState(false);
  const [selectedDetection, setSelectedDetection] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [gotoPage, setGotoPage] = useState('');

  // Video input states
  const [videoSource, setVideoSource] = useState('rtsp');
  const [selectedFile, setSelectedFile] = useState(null);

  const [filters, setFilters] = useState({
    plate_number: '',
    camera_id: '',
    location_id: '',
    confidence_min: '',
    confidence_max: '',
    date_from: '',
    date_to: '',
    vehicle_type: ''
  });

  const [cameras, setCameras] = useState([]);
  const [locations, setLocations] = useState([]);

  // Load cameras và locations
  useEffect(() => {
    loadCameras();
    loadLocations();
  }, []);

  const loadCameras = async () => {
    try {
      const response = await fetchDataFromAPI('/api/cameras');
      if (response.success) {
        setCameras(response.data);
      }
    } catch (error) {
      console.error('Error loading cameras:', error);
    }
  };

  const loadLocations = async () => {
    try {
      const response = await fetchDataFromAPI('/api/location');
      if (response.success) {
        setLocations(response.data);
      }
    } catch (error) {
      console.error('Error loading locations:', error);
    }
  };

  // Load detections
  const loadDetections = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = {
        page: page + 1, // Convert to 1-based indexing for Flask
        limit: rowsPerPage,
        ...filters
      };

      // Xử lý confidence range
      if (filters.confidence_min && filters.confidence_max) {
        params.confidence_min = parseFloat(filters.confidence_min);
        params.confidence_max = parseFloat(filters.confidence_max);
      }

      const response = await fetchDataFromFlaskAPI('/api/detected-plates', { params });
      
      if (response.success) {
        setDetections(response.data);
        setTotalCount(response.pagination?.total || 0);
      } else {
        setError('Failed to load detections');
      }
    } catch (error) {
      console.error('Error loading detections:', error);
      setError(error.response?.data?.message || 'Error loading detections');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetections();
  }, [page, rowsPerPage, filters]);

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
    setPage(0); // Reset về trang đầu khi thay đổi filter
  };

  const handleSearch = () => {
    setPage(0);
    loadDetections();
  };

  const handleResetFilters = () => {
    setFilters({
      plate_number: '',
      camera_id: '',
      location_id: '',
      confidence_min: '',
      confidence_max: '',
      date_from: '',
      date_to: '',
      vehicle_type: ''
    });
    setPage(0);
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleOpenDetail = (detection) => {
    setSelectedDetection(detection);
    setOpenDetail(true);
  };

  const handleCloseDetail = () => {
    setOpenDetail(false);
    setSelectedDetection(null);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa detection này?')) {
      try {
        // Implement delete logic here
        setSnackbar({ open: true, message: 'Detection deleted successfully', severity: 'success' });
        loadDetections();
      } catch (error) {
        setSnackbar({ open: true, message: 'Error deleting detection', severity: 'error' });
      }
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('vi-VN');
  };

  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.8) return 'success';
    if (confidence >= 0.6) return 'warning';
    return 'error';
  };

  const getVehicleTypeIcon = (type) => {
    switch (type) {
      case 'motorcycle': return <DirectionsCar />;
      case 'car': return <DirectionsCar />;
      case 'truck': return <DirectionsCar />;
      case 'bus': return <DirectionsCar />;
      default: return <DirectionsCar />;
    }
  };

  // Video handling functions
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleClearAll = () => {
    setSelectedFile(null);
    setVideoSource('rtsp');
  };

  // Reset gotoPage when currentPage changes
  useEffect(() => {
    setGotoPage('');
  }, [page]);

  return (
    <Box>
      {/* Header - Giống hệt như trong ảnh */}
      <Typography variant="h4" gutterBottom sx={{ 
        color: '#1976d2', 
        fontWeight: 600, 
        textAlign: 'center',
        mb: 3
      }}>
        Hệ thống nhận diện biển số xe
      </Typography>

      {/* Video/Camera Input Section - Giống hệt như trong ảnh */}
      <Card sx={{ borderRadius: 3, boxShadow: 1, mb: 2 }}>
        <CardContent>
          {/* Video Input Controls */}
          <Grid container spacing={2} alignItems="center" sx={{ mb: 2 }}>
            <Grid item xs={12} md={6}>
              <Stack direction="row" spacing={2}>
                <Button 
                  variant="outlined" 
                  onClick={handleClearAll}
                  sx={{ minWidth: 100 }}
                >
                  Clear All
                </Button>
                <Button 
                  variant="outlined" 
                  component="label"
                  sx={{ minWidth: 120 }}
                >
                  Choose File
                  <input
                    type="file"
                    hidden
                    accept="video/*"
                    onChange={handleFileChange}
                  />
                </Button>
                <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
                  {selectedFile ? selectedFile.name : 'No file chosen'}
                </Typography>
              </Stack>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <FormControl component="fieldset">
                <RadioGroup 
                  row 
                  value={videoSource} 
                  onChange={(e) => setVideoSource(e.target.value)}
                >
                  <FormControlLabel 
                    value="rtsp" 
                    control={<Radio sx={{ '&.Mui-checked': { color: '#ff9800' } }} />} 
                    label="RTSP" 
                  />
                  <FormControlLabel 
                    value="viewing" 
                    control={<Radio sx={{ '&.Mui-checked': { color: '#4caf50' } }} />} 
                    label="Đang xem" 
                  />
                </RadioGroup>
              </FormControl>
            </Grid>
          </Grid>
          
          {/* Video Display Area */}
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            minHeight: 400,
            backgroundColor: '#f5f5f5',
            borderRadius: 2,
            border: '2px dashed #ccc'
          }}>
            <Box sx={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              gap: 2,
              color: 'text.secondary'
            }}>
              <CameraAlt sx={{ fontSize: 80, opacity: 0.5 }} />
              <Typography variant="h6" sx={{ opacity: 0.7 }}>
                Không có camera hoặc video nào được chọn
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.5 }}>
                Vui lòng chọn camera từ sidebar hoặc tải video lên
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Bộ lọc tìm kiếm - Giống hệt như trong ảnh */}
      <Card sx={{ borderRadius: 3, boxShadow: 1, mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', fontWeight: 600 }}>
            Bộ lọc tìm kiếm
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={2}>
              <TextField 
                label="Biển số xe" 
                value={filters.plate_number || ''} 
                onChange={e => handleFilterChange('plate_number', e.target.value)} 
                fullWidth 
                size="small" 
                InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1 }} /> }} 
              />
            </Grid>
            
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Camera</InputLabel>
                <Select 
                  value={filters.camera_id || ''} 
                  label="Camera" 
                  onChange={e => handleFilterChange('camera_id', e.target.value)}
                >
                  <MenuItem value="">Tất cả</MenuItem>
                  {cameras.map(camera => (
                    <MenuItem key={camera.id} value={camera.id}>{camera.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Vị trí</InputLabel>
                <Select 
                  value={filters.location_id || ''} 
                  label="Vị trí" 
                  onChange={e => handleFilterChange('location_id', e.target.value)}
                >
                  <MenuItem value="">Tất cả</MenuItem>
                  {locations.map(location => (
                    <MenuItem key={location.id} value={location.id}>{location.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Loại xe</InputLabel>
                <Select 
                  value={filters.vehicle_type || ''} 
                  label="Loại xe" 
                  onChange={e => handleFilterChange('vehicle_type', e.target.value)}
                >
                  {vehicleTypeOptions.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Độ tin cậy</InputLabel>
                <Select 
                  value={filters.confidence_min || ''} 
                  label="Độ tin cậy" 
                  onChange={e => {
                    const [min, max] = e.target.value.split('-').map(v => parseFloat(v));
                    handleFilterChange('confidence_min', min);
                    handleFilterChange('confidence_max', max);
                  }}
                >
                  {confidenceOptions.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <Stack direction="row" spacing={1}>
                <TextField
                  label="Từ ngày"
                  type="date"
                  value={filters.date_from || ''}
                  onChange={e => handleFilterChange('date_from', e.target.value)}
                  size="small"
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="Đến ngày"
                  type="date"
                  value={filters.date_to || ''}
                  onChange={e => handleFilterChange('date_to', e.target.value)}
                  size="small"
                  InputLabelProps={{ shrink: true }}
                />
              </Stack>
            </Grid>

            <Grid item xs={12}>
              <Stack direction="row" spacing={2} justifyContent="flex-end">
                <Button 
                  variant="outlined" 
                  onClick={handleResetFilters}
                  startIcon={<Cancel />}
                >
                  Đặt lại
                </Button>
                <Button 
                  variant="contained" 
                  onClick={handleSearch}
                  startIcon={<SearchIcon />}
                  sx={{ backgroundColor: '#1976d2' }}
                >
                  TÌM KIẾM
                </Button>
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Danh sách biển số đã phát hiện - Giống hệt như trong ảnh */}
      <Card sx={{ borderRadius: 3, boxShadow: 1, overflow: 'hidden' }}>
        <CardContent sx={{ p: 0 }}>
          <Typography variant="h6" sx={{ p: 2, borderBottom: '1px solid #e0e0e0', backgroundColor: '#fafafa' }}>
            Danh sách biển số đã phát hiện ({totalCount} kết quả)
          </Typography>
          
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
              <Alert severity="error">{error}</Alert>
            </Box>
          ) : detections.length === 0 ? (
            <Box sx={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center', 
              height: 400,
              gap: 2
            }}>
              <RouteIcon sx={{ fontSize: 80, color: 'text.secondary' }} />
              <Typography variant="h6" color="text.secondary">
                Không có dữ liệu
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Không tìm thấy biển số nào phù hợp với bộ lọc
              </Typography>
            </Box>
          ) : (
            <>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#1976d2' }}>
                      <TableCell sx={{ color: 'white', fontWeight: 600, width: 50 }}>
                        <Checkbox size="small" />
                      </TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 600, width: 80 }}>
                        STT
                      </TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 600 }}>
                        Biển số
                      </TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 600, width: 120 }}>
                        Ảnh biển số
                      </TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 600, width: 120 }}>
                        Camera
                      </TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 600, width: 120 }}>
                        Vị trí
                      </TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 600, width: 100 }}>
                        Loại xe
                      </TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 600, width: 120 }}>
                        Độ tin cậy
                      </TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 600, width: 150 }}>
                        Thời gian phát hiện
                      </TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 600, width: 120 }}>
                        Trạng thái
                      </TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 600, width: 100 }}>
                        Thao tác
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {detections.map((detection, index) => (
                      <TableRow key={detection.id} hover>
                        <TableCell>
                          <Checkbox size="small" />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>
                            {(page * rowsPerPage) + index + 1}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="subtitle2" fontWeight="bold" color="primary">
                            {detection.plate_number || 'N/A'}
                          </Typography>
                          {detection.ocr_raw_text && detection.ocr_raw_text !== detection.plate_number && (
                            <Typography variant="caption" color="textSecondary">
                              Raw: {detection.ocr_raw_text}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          {detection.crop_filename ? (
                            <Box 
                              component="img"
                              src={`/static/crops/${detection.crop_filename}`}
                              alt="Plate crop"
                              sx={{ 
                                width: 60, 
                                height: 24,  // Tỷ lệ 2.5:1 phù hợp với ảnh crop mới (300x120)
                                objectFit: 'cover',
                                borderRadius: 1,
                                border: '1px solid #e0e0e0'
                              }}
                            />
                          ) : (
                            <Typography variant="caption" color="textSecondary">
                              Không có ảnh
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {cameras.find(c => c.id === detection.camera_id)?.name || `Camera ${detection.camera_id}`}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {locations.find(l => l.id === detection.location_id)?.name || `Location ${detection.location_id}`}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" alignItems="center" spacing={1}>
                            {getVehicleTypeIcon(detection.vehicle_type || 'car')}
                            <Typography variant="body2">
                              {detection.vehicle_type || 'Unknown'}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={`${((detection.confidence || 0) * 100).toFixed(1)}%`}
                            color={getConfidenceColor(detection.confidence || 0)}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {detection.first_seen ? formatDate(detection.first_seen * 1000) : 'N/A'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {detection.verification_status === 'verified' ? (
                            <Chip label="Đã xác minh" color="success" size="small" icon={<CheckCircle />} />
                          ) : (
                            <Chip label="Chưa xác minh" color="warning" size="small" icon={<Info />} />
                          )}
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1}>
                            <IconButton 
                              size="small" 
                              onClick={() => handleOpenDetail(detection)}
                              color="primary"
                              title="Xem chi tiết"
                            >
                              <Visibility />
                            </IconButton>
                            <IconButton 
                              size="small" 
                              onClick={() => handleDelete(detection.id)}
                              color="error"
                              title="Xóa"
                            >
                              <Delete />
                            </IconButton>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Phân trang - Thiết kế giống như WhiteList */}
              <Box sx={{ 
                display: 'flex', 
                flexDirection: { xs: 'column', md: 'row' }, 
                alignItems: { xs: 'stretch', md: 'center' }, 
                justifyContent: 'space-between', 
                gap: 2, 
                p: 2, 
                borderTop: '1px solid #e0e0e0', 
                backgroundColor: '#fafafa'
              }}>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                  Hiển thị <strong>{((page * rowsPerPage) + 1)} - {Math.min((page + 1) * rowsPerPage, totalCount)}</strong> của <strong>{totalCount}</strong> bản ghi
                </Typography>
                
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: 'center', gap: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" color="text.secondary">Hiển thị:</Typography>
                    <Select 
                      value={rowsPerPage} 
                      onChange={handleChangeRowsPerPage} 
                      size="small" 
                      sx={{ minWidth: 80, '& .MuiSelect-select': { py: 0.5, fontSize: '0.875rem' } }}
                      renderValue={v => `${v}/ trang`}
                    >
                      {[5, 10, 20, 50, 100].map(size => (
                        <MenuItem key={size} value={size}>{size}/ trang</MenuItem>
                      ))}
                    </Select>
                  </Box>
                  
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Button 
                      size="small" 
                      variant="outlined" 
                      onClick={() => handleChangePage(null, 0)} 
                      disabled={page === 0} 
                      sx={{ minWidth: 32, width: 32, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}
                    >
                      <FirstPage fontSize="small" />
                    </Button>
                    <Button 
                      size="small" 
                      variant="outlined" 
                      onClick={() => handleChangePage(null, Math.max(0, page - 1))} 
                      disabled={page === 0} 
                      sx={{ minWidth: 32, width: 32, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}
                    >
                      <ChevronLeft fontSize="small" />
                    </Button>
                    
                    {/* Số trang */}
                    <Button 
                      variant="contained" 
                      size="small" 
                      sx={{ 
                        minWidth: 32, 
                        width: 32, 
                        height: 32, 
                        borderRadius: 1, 
                        fontSize: '0.875rem', 
                        fontWeight: 600,
                        backgroundColor: '#1976d2',
                        color: 'white',
                        border: 'none',
                        '&:hover': { backgroundColor: '#1565c0' }
                      }}
                    >
                      {page + 1}
                    </Button>
                    
                    <Button 
                      size="small" 
                      variant="outlined" 
                      onClick={() => handleChangePage(null, Math.min(Math.ceil(totalCount / rowsPerPage) - 1, page + 1))} 
                      disabled={page >= Math.ceil(totalCount / rowsPerPage) - 1} 
                      sx={{ minWidth: 32, width: 32, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}
                    >
                      <ChevronRight fontSize="small" />
                    </Button>
                    <Button 
                      size="small" 
                      variant="outlined" 
                      onClick={() => handleChangePage(null, Math.ceil(totalCount / rowsPerPage) - 1)} 
                      disabled={page >= Math.ceil(totalCount / rowsPerPage) - 1} 
                      sx={{ minWidth: 32, width: 32, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}
                    >
                      <LastPage fontSize="small" />
                    </Button>
                  </Box>
                  
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" color="text.secondary">Đến trang:</Typography>
                    <InputBase 
                      value={gotoPage} 
                      onChange={e => setGotoPage(e.target.value.replace(/[^0-9]/g, ''))} 
                      onKeyDown={e => { 
                        if (e.key === 'Enter') { 
                          const pageNum = parseInt(gotoPage, 10) - 1;
                          if (pageNum >= 0 && pageNum < Math.ceil(totalCount / rowsPerPage)) {
                            handleChangePage(null, pageNum);
                            setGotoPage('');
                          }
                        } 
                      }} 
                      placeholder="1" 
                      sx={{ 
                        width: 60, 
                        height: 32, 
                        border: '1px solid #e0e0e0', 
                        borderRadius: 1, 
                        px: 1, 
                        fontSize: '0.875rem', 
                        '& input': { textAlign: 'center' } 
                      }} 
                    />
                    <Button 
                      size="small" 
                      variant="outlined" 
                      onClick={() => {
                        const pageNum = parseInt(gotoPage, 10) - 1;
                        if (pageNum >= 0 && pageNum < Math.ceil(totalCount / rowsPerPage)) {
                          handleChangePage(null, pageNum);
                          setGotoPage('');
                        }
                      }} 
                      disabled={!gotoPage || parseInt(gotoPage, 10) < 1 || parseInt(gotoPage, 10) > Math.ceil(totalCount / rowsPerPage)} 
                      sx={{ minWidth: 'auto', px: 2, height: 32, textTransform: 'none', fontSize: '0.875rem' }}
                    >
                      Đi
                    </Button>
                  </Box>
                </Box>
              </Box>
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialog chi tiết */}
      <Dialog open={openDetail} onClose={handleCloseDetail} maxWidth="md" fullWidth>
        <DialogTitle sx={{ 
          background: 'linear-gradient(90deg, #1976d2 60%, #42a5f5 100%)', 
          color: 'white', 
          display: 'flex', 
          alignItems: 'center', 
          gap: 2 
        }}>
          <RouteIcon sx={{ mr: 1 }} /> 
          Chi tiết phát hiện biển số theo lộ trình
          <IconButton 
            onClick={handleCloseDetail} 
            sx={{ ml: 'auto', color: 'white' }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          {selectedDetection && (
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>Thông tin biển số</Typography>
                <Stack spacing={2}>
                  <Box>
                    <Typography variant="body2" color="textSecondary">Biển số:</Typography>
                    <Typography variant="body1" fontWeight="bold">{selectedDetection.plate_number}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="textSecondary">Độ tin cậy:</Typography>
                    <Chip 
                      label={`${((selectedDetection.confidence || 0) * 100).toFixed(1)}%`}
                      color={getConfidenceColor(selectedDetection.confidence || 0)}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" color="textSecondary">Thời gian phát hiện:</Typography>
                    <Typography variant="body1">
                      {selectedDetection.first_seen ? formatDate(selectedDetection.first_seen * 1000) : 'N/A'}
                    </Typography>
                  </Box>
                </Stack>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>Thông tin lộ trình</Typography>
                <Stack spacing={2}>
                  <Box>
                    <Typography variant="body2" color="textSecondary">Camera:</Typography>
                    <Typography variant="body1">
                      {cameras.find(c => c.id === selectedDetection.camera_id)?.name || 'N/A'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="textSecondary">Vị trí:</Typography>
                    <Typography variant="body1">
                      {locations.find(l => l.id === selectedDetection.location_id)?.name || 'N/A'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="textSecondary">Loại xe:</Typography>
                    <Typography variant="body1">
                      {selectedDetection.vehicle_type || 'Unknown'}
                    </Typography>
                  </Box>
                </Stack>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDetail}>Đóng</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
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

export default RouteMonitoringPage;

