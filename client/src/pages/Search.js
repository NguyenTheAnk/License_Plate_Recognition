import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, TextField, Button, Select, MenuItem, InputLabel, FormControl, Tabs, Tab, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, Autocomplete, Divider, Snackbar, Alert, Stack, Avatar
} from '@mui/material';
import { Search as SearchIcon, DirectionsCar, Person, Phone, Email, LocationOn, CheckCircle, Block, History, CameraAlt, Info, Event, Description, Close as CloseIcon } from '@mui/icons-material';
import { fetchDataFromAPI } from '../utils/auth';
import SearchWhitelist from './Search/SearchWhitelist';
import SearchBlacklist from './Search/SearchBlacklist';
import SearchCamera from './Search/SearchCamera';
import SearchLocation from './Search/SearchLocation';
import SearchJourney from './Search/SearchJourney';
import SearchPlates from './Search/SearchPlates';
import SearchAccessControl from './Search/SearchAccessControl';

// Dummy data & options (replace with API calls)
const locations = [
  { id: 1, name: 'Cổng chính' },
  { id: 2, name: 'Bãi xe A' },
  { id: 3, name: 'Bãi xe B' }
];
const cameras = [
  { id: 1, name: 'Camera 01' },
  { id: 2, name: 'Camera 02' }
];
const statusOptions = [
  { value: '', label: 'Tất cả' },
  { value: 'whitelist', label: 'Whitelist' },
  { value: 'blacklist', label: 'Blacklist' }
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
const violationTypes = [
  { value: '', label: 'Tất cả' },
  { value: 'unauthorized', label: 'Không phép' },
  { value: 'security_threat', label: 'Nguy cơ an ninh' },
  { value: 'unpaid_fine', label: 'Chưa nộp phạt' },
  { value: 'banned', label: 'Cấm' },
  { value: 'suspicious', label: 'Đáng ngờ' },
  { value: 'other', label: 'Khác' }
];
const severityOptions = [
  { value: '', label: 'Tất cả' },
  { value: 'low', label: 'Thấp' },
  { value: 'medium', label: 'Trung bình' },
  { value: 'high', label: 'Cao' },
  { value: 'critical', label: 'Nghiêm trọng' }
];

const tabList = [
  { label: 'Tất cả', value: 'all', icon: <SearchIcon /> },
  { label: 'Whitelist', value: 'whitelist', icon: <CheckCircle color="success" /> },
  { label: 'Blacklist', value: 'blacklist', icon: <Block color="error" /> },
  { label: 'Lịch sử', value: 'history', icon: <History color="primary" /> },
  { label: 'Chủ xe', value: 'owner', icon: <Person color="info" /> },
  { label: 'Camera', value: 'camera', icon: <CameraAlt color="warning" /> },
  { label: 'Khu vực', value: 'location', icon: <LocationOn color="secondary" /> },
  // Thêm các tab mới
  { label: 'Lộ trình', value: 'journey', icon: <DirectionsCar color="info" /> },
  { label: 'Phát hiện biển số', value: 'plate', icon: <Info color="primary" /> },
  { label: 'Truy cập', value: 'access', icon: <CheckCircle color="secondary" /> },
];

// Thêm các filter riêng cho từng tab mới
const accessListTypes = [
  { value: '', label: 'Tất cả' },
  { value: 'whitelist', label: 'Whitelist' },
  { value: 'blacklist', label: 'Blacklist' }
];

function SearchPage() {
  // State cho filter
  const [filters, setFilters] = useState({
    plate_number: '',
    owner_name: '',
    owner_phone: '',
    contact_email: '',
    location_id: '',
    status: '',
    valid_status: '',
    approval_status: '',
    violation_type: '',
    severity: '',
    date_from: '',
    date_to: '',
    camera_id: '',
    q: '',
    journey_date: '', // Thêm filter cho lộ trình
    list_type: '', // Thêm filter cho truy cập
    is_active: '' // Thêm filter cho truy cập
  });
  const [tab, setTab] = useState('all');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]); // Kết quả tra cứu
  const [stats, setStats] = useState({}); // Thống kê nhanh
  const [openDetail, setOpenDetail] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [allResults, setAllResults] = useState({ whitelist: [], blacklist: [], history: [], camera: [], location: [] });
  const [error, setError] = useState(null);

  // Dummy fetch (thay bằng API call thực tế)
  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const params = { ...filters, page: 1, limit: 20 };
      // Gọi song song các API với endpoint chính xác
      const [whitelistRes, blacklistRes, cameraRes, locationRes, journeyRes, plateRes, accessRes] = await Promise.all([
        fetchDataFromAPI(`/api/whitelist`, token, { params }),
        fetchDataFromAPI(`/api/blacklist`, token, { params }),
        fetchDataFromAPI(`/api/camera`, token, { params }),
        fetchDataFromAPI(`/api/location`, token, { params }),
        fetchDataFromAPI(`/api/journey`, token, { params }), // Đúng là /api/journey
        fetchDataFromAPI(`/api/plates`, token, { params }), // Đúng là /api/plates
        fetchDataFromAPI(`/api/access-control`, token, { params })
      ]);
      setAllResults({
        whitelist: whitelistRes.data || [],
        blacklist: blacklistRes.data || [],
        history: [], // Có thể bổ sung nếu có API lịch sử
        camera: cameraRes.data || [],
        location: locationRes.data?.locations || [],
        journey: journeyRes.data || journeyRes || [],
        plate: plateRes.data || plateRes || [],
        access: accessRes.data || accessRes || []
      });
      // Gộp kết quả cho tab All
      setResults([
        ...(whitelistRes.data || []).map(r => ({ ...r, status: 'whitelist' })),
        ...(blacklistRes.data || []).map(r => ({ ...r, status: 'blacklist' }))
      ]);
      setStats({
        total: (whitelistRes.data?.length || 0) + (blacklistRes.data?.length || 0),
        whitelist: whitelistRes.data?.length || 0,
        blacklist: blacklistRes.data?.length || 0,
        valid: (whitelistRes.data?.filter(x => x.current_status === 'valid').length || 0) + (blacklistRes.data?.filter(x => x.current_status === 'valid').length || 0),
        expired: (whitelistRes.data?.filter(x => x.current_status === 'expired').length || 0) + (blacklistRes.data?.filter(x => x.current_status === 'expired').length || 0)
      });
    } catch (err) {
      setError('Lỗi khi tra cứu: ' + (err.message || 'Không xác định'));
      setResults([]);
      setStats({});
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleTabChange = (e, value) => {
    setTab(value);
    // Có thể filter lại kết quả theo tab
  };

  const handleOpenDetail = (item) => {
    setSelectedItem(item);
    setOpenDetail(true);
  };

  const handleCloseDetail = () => {
    setOpenDetail(false);
    setSelectedItem(null);
  };

  // Khi đổi tab, hiển thị đúng dữ liệu
  useEffect(() => {
    if (tab === 'all') {
      setResults([
        ...(allResults.whitelist || []).map(r => ({ ...r, status: 'whitelist' })),
        ...(allResults.blacklist || []).map(r => ({ ...r, status: 'blacklist' }))
      ]);
    } else if (tab === 'whitelist') {
      setResults((allResults.whitelist || []).map(r => ({ ...r, status: 'whitelist' })));
    } else if (tab === 'blacklist') {
      setResults((allResults.blacklist || []).map(r => ({ ...r, status: 'blacklist' })));
    } else if (tab === 'camera') {
      setResults(allResults.camera || []);
    } else if (tab === 'location') {
      setResults(allResults.location || []);
    } else if (tab === 'journey') {
      setResults(allResults.journey || []);
    } else if (tab === 'plate') {
      setResults(allResults.plate || []);
    } else if (tab === 'access') {
      setResults(allResults.access || []);
    } else {
      setResults([]);
    }
  }, [tab, allResults]);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f7fa', py: 3 }}>
      {/* Header */}
      <Box sx={{ px: 3, mb: 3 }}>
        <Card sx={{ background: 'linear-gradient(90deg, #1976d2 60%, #42a5f5 100%)', color: 'white', borderRadius: 3, boxShadow: 3 }}>
          <CardContent>
            <Box display="flex" alignItems="center" gap={2}>
              <Avatar sx={{ bgcolor: 'white', color: '#1976d2', width: 56, height: 56 }}>
                <SearchIcon fontSize="large" />
              </Avatar>
              <Box>
                <Typography variant="h4" fontWeight={700} sx={{ mb: 0.5 }}>Tra cứu tổng hợp</Typography>
                <Typography variant="body1" sx={{ opacity: 0.9 }}>Tìm kiếm mọi thông tin về phương tiện, biển số, lịch sử, whitelist, blacklist, chủ xe, camera, khu vực...</Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Bộ lọc thông minh */}
      <Box sx={{ px: 3, mb: 2 }}>
        <Card sx={{ borderRadius: 3, boxShadow: 1 }}>
          <CardContent>
            <Grid container spacing={2}>
              {/* Bộ lọc động theo tab */}
              {tab === 'journey' ? (
                <>
                  <Grid item xs={12} md={3}>
                    <TextField label="Biển số xe" value={filters.plate_number} onChange={e => handleFilterChange('plate_number', e.target.value)} fullWidth size="small" InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1 }} /> }} />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <TextField label="Ngày lộ trình" type="date" value={filters.journey_date || ''} onChange={e => handleFilterChange('journey_date', e.target.value)} fullWidth size="small" InputLabelProps={{ shrink: true }} />
                  </Grid>
                </>
              ) : tab === 'plate' ? (
                <>
                  <Grid item xs={12} md={3}>
                    <TextField label="Biển số xe" value={filters.plate_number} onChange={e => handleFilterChange('plate_number', e.target.value)} fullWidth size="small" InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1 }} /> }} />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Camera</InputLabel>
                      <Select value={filters.camera_id} label="Camera" onChange={e => handleFilterChange('camera_id', e.target.value)}>
                        <MenuItem value="">Tất cả</MenuItem>
                        {cameras.map(cam => <MenuItem key={cam.id} value={cam.id}>{cam.name}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Khu vực</InputLabel>
                      <Select value={filters.location_id} label="Khu vực" onChange={e => handleFilterChange('location_id', e.target.value)}>
                        <MenuItem value="">Tất cả</MenuItem>
                        {locations.map(loc => <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <TextField label="Thời gian từ" type="date" value={filters.date_from || ''} onChange={e => handleFilterChange('date_from', e.target.value)} fullWidth size="small" InputLabelProps={{ shrink: true }} />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <TextField label="Thời gian đến" type="date" value={filters.date_to || ''} onChange={e => handleFilterChange('date_to', e.target.value)} fullWidth size="small" InputLabelProps={{ shrink: true }} />
                  </Grid>
                </>
              ) : tab === 'access' ? (
                <>
                  <Grid item xs={12} md={3}>
                    <TextField label="Biển số xe" value={filters.plate_number} onChange={e => handleFilterChange('plate_number', e.target.value)} fullWidth size="small" InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1 }} /> }} />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Loại danh sách</InputLabel>
                      <Select value={filters.list_type || ''} label="Loại danh sách" onChange={e => handleFilterChange('list_type', e.target.value)}>
                        {accessListTypes.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Khu vực</InputLabel>
                      <Select value={filters.location_id} label="Khu vực" onChange={e => handleFilterChange('location_id', e.target.value)}>
                        <MenuItem value="">Tất cả</MenuItem>
                        {locations.map(loc => <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Trạng thái</InputLabel>
                      <Select value={filters.is_active || ''} label="Trạng thái" onChange={e => handleFilterChange('is_active', e.target.value)}>
                        <MenuItem value="">Tất cả</MenuItem>
                        <MenuItem value="true">Hoạt động</MenuItem>
                        <MenuItem value="false">Tạm dừng</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                </>
              ) : (
                <>
                  <Grid item xs={12} md={3}>
                    <TextField label="Biển số xe" value={filters.plate_number} onChange={e => handleFilterChange('plate_number', e.target.value)} fullWidth size="small" InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1 }} /> }} />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <TextField label="Chủ xe" value={filters.owner_name} onChange={e => handleFilterChange('owner_name', e.target.value)} fullWidth size="small" InputProps={{ startAdornment: <Person sx={{ mr: 1 }} /> }} />
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <TextField label="SĐT chủ xe" value={filters.owner_phone} onChange={e => handleFilterChange('owner_phone', e.target.value)} fullWidth size="small" InputProps={{ startAdornment: <Phone sx={{ mr: 1 }} /> }} />
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <TextField label="Email liên hệ" value={filters.contact_email} onChange={e => handleFilterChange('contact_email', e.target.value)} fullWidth size="small" InputProps={{ startAdornment: <Email sx={{ mr: 1 }} /> }} />
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Khu vực</InputLabel>
                      <Select value={filters.location_id} label="Khu vực" onChange={e => handleFilterChange('location_id', e.target.value)}>
                        <MenuItem value="">Tất cả</MenuItem>
                        {locations.map(loc => <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Trạng thái</InputLabel>
                      <Select value={filters.status} label="Trạng thái" onChange={e => handleFilterChange('status', e.target.value)}>
                        {statusOptions.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Hiệu lực</InputLabel>
                      <Select value={filters.valid_status} label="Hiệu lực" onChange={e => handleFilterChange('valid_status', e.target.value)}>
                        {validStatusOptions.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Phê duyệt</InputLabel>
                      <Select value={filters.approval_status} label="Phê duyệt" onChange={e => handleFilterChange('approval_status', e.target.value)}>
                        {approvalOptions.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Loại vi phạm</InputLabel>
                      <Select value={filters.violation_type} label="Loại vi phạm" onChange={e => handleFilterChange('violation_type', e.target.value)}>
                        {violationTypes.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Mức độ</InputLabel>
                      <Select value={filters.severity} label="Mức độ" onChange={e => handleFilterChange('severity', e.target.value)}>
                        {severityOptions.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <TextField label="Ngày hiệu lực từ" type="date" value={filters.date_from} onChange={e => handleFilterChange('date_from', e.target.value)} fullWidth size="small" InputLabelProps={{ shrink: true }} />
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <TextField label="Ngày hiệu lực đến" type="date" value={filters.date_to} onChange={e => handleFilterChange('date_to', e.target.value)} fullWidth size="small" InputLabelProps={{ shrink: true }} />
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Camera</InputLabel>
                      <Select value={filters.camera_id} label="Camera" onChange={e => handleFilterChange('camera_id', e.target.value)}>
                        <MenuItem value="">Tất cả</MenuItem>
                        {cameras.map(cam => <MenuItem key={cam.id} value={cam.id}>{cam.name}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <TextField label="Tìm kiếm toàn văn" value={filters.q} onChange={e => handleFilterChange('q', e.target.value)} fullWidth size="small" InputProps={{ startAdornment: <Info sx={{ mr: 1 }} /> }} />
                  </Grid>
                </>
              )}
              {/* Nút tìm kiếm và làm mới giữ nguyên */}
              <Grid item xs={12} md={3} display="flex" alignItems="center" gap={2}>
                <Button variant="contained" color="primary" startIcon={<SearchIcon />} onClick={handleSearch} sx={{ borderRadius: 2, px: 3, fontWeight: 600 }} disabled={loading}>
                  {loading ? <CircularProgress size={20} color="inherit" /> : 'Tìm kiếm'}
                </Button>
                <Button variant="outlined" color="secondary" onClick={() => setFilters({ plate_number: '', owner_name: '', owner_phone: '', contact_email: '', location_id: '', status: '', valid_status: '', approval_status: '', violation_type: '', severity: '', date_from: '', date_to: '', camera_id: '', q: '', journey_date: '', list_type: '', is_active: '' })} sx={{ borderRadius: 2, px: 3, fontWeight: 600 }} disabled={loading}>
                  Làm mới
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Box>

      {/* Thống kê nhanh */}
      <Box sx={{ px: 3, mb: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={6} md={2}>
            <Card sx={{ borderRadius: 2, bgcolor: '#e3f2fd', boxShadow: 0 }}>
              <CardContent>
                <Typography variant="h6" color="primary">Tổng số</Typography>
                <Typography variant="h4" fontWeight={700}>{stats.total || 0}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} md={2}>
            <Card sx={{ borderRadius: 2, bgcolor: '#e8f5e9', boxShadow: 0 }}>
              <CardContent>
                <Typography variant="h6" color="success.main">Whitelist</Typography>
                <Typography variant="h4" fontWeight={700}>{stats.whitelist || 0}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} md={2}>
            <Card sx={{ borderRadius: 2, bgcolor: '#ffebee', boxShadow: 0 }}>
              <CardContent>
                <Typography variant="h6" color="error.main">Blacklist</Typography>
                <Typography variant="h4" fontWeight={700}>{stats.blacklist || 0}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} md={2}>
            <Card sx={{ borderRadius: 2, bgcolor: '#fffde7', boxShadow: 0 }}>
              <CardContent>
                <Typography variant="h6" color="warning.main">Còn hiệu lực</Typography>
                <Typography variant="h4" fontWeight={700}>{stats.valid || 0}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} md={2}>
            <Card sx={{ borderRadius: 2, bgcolor: '#f3e5f5', boxShadow: 0 }}>
              <CardContent>
                <Typography variant="h6" color="secondary">Hết hạn</Typography>
                <Typography variant="h4" fontWeight={700}>{stats.expired || 0}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>

      {/* Tabs */}
      <Box sx={{ px: 3, mb: 2 }}>
        <Tabs value={tab} onChange={handleTabChange} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile>
          {tabList.map(t => (
            <Tab key={t.value} value={t.value} label={t.label} icon={t.icon} iconPosition="start" sx={{ fontWeight: 600, fontSize: 16, minHeight: 48 }} />
          ))}
        </Tabs>
      </Box>

      {/* Bảng kết quả */}
      <Box sx={{ px: 3 }}>
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
                      {/* Header động theo tab */}
                      {tab === 'camera' ? (
                        <>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Tên camera</TableCell>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Mã</TableCell>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Vị trí</TableCell>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Trạng thái</TableCell>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thao tác</TableCell>
                        </>
                      ) : tab === 'location' ? (
                        <>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Tên khu vực</TableCell>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Mã</TableCell>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Loại</TableCell>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Trạng thái</TableCell>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thao tác</TableCell>
                        </>
                      ) : tab === 'journey' ? (
                        <>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Biển số</TableCell>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Ngày</TableCell>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Lộ trình</TableCell>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Loại xe</TableCell>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thao tác</TableCell>
                        </>
                      ) : tab === 'plate' ? (
                        <>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Biển số</TableCell>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Ảnh phát hiện</TableCell>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Camera</TableCell>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Khu vực</TableCell>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thời gian</TableCell>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thao tác</TableCell>
                        </>
                      ) : tab === 'access' ? (
                        <>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Biển số</TableCell>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Loại danh sách</TableCell>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Khu vực</TableCell>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Người thêm</TableCell>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Trạng thái</TableCell>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thao tác</TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Biển số</TableCell>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Ảnh</TableCell>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Chủ xe</TableCell>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Khu vực</TableCell>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Trạng thái</TableCell>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Hiệu lực</TableCell>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Phê duyệt</TableCell>
                          <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thao tác</TableCell>
                        </>
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {results.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={tab === 'camera' || tab === 'location' || tab === 'journey' || tab === 'plate' || tab === 'access' ? 5 : 8} align="center">
                          <Typography color="text.secondary" sx={{ py: 4 }}>Không có kết quả</Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      results.map(item => (
                        <TableRow key={item.id || item.code || item.camera_key || item.plate_number + item.journey_date || item.plate_number + item.timestamp} hover>
                          {/* Row động theo tab */}
                          {tab === 'camera' ? (
                            <>
                              <TableCell>{item.name}</TableCell>
                              <TableCell>{item.camera_key || item.camera_id}</TableCell>
                              <TableCell>{item.location_name}</TableCell>
                              <TableCell>
                                <Chip label={item.is_active ? 'Hoạt động' : 'Tạm dừng'} color={item.is_active ? 'success' : 'default'} size="small" />
                              </TableCell>
                              <TableCell>
                                <Button variant="outlined" size="small" onClick={() => handleOpenDetail(item)} startIcon={<Info />} sx={{ borderRadius: 2, fontWeight: 600 }}>Chi tiết</Button>
                              </TableCell>
                            </>
                          ) : tab === 'location' ? (
                            <>
                              <TableCell>{item.name}</TableCell>
                              <TableCell>{item.code}</TableCell>
                              <TableCell>{item.zone_type}</TableCell>
                              <TableCell>
                                <Chip label={item.is_active ? 'Hoạt động' : 'Tạm dừng'} color={item.is_active ? 'success' : 'default'} size="small" />
                              </TableCell>
                              <TableCell>
                                <Button variant="outlined" size="small" onClick={() => handleOpenDetail(item)} startIcon={<Info />} sx={{ borderRadius: 2, fontWeight: 600 }}>Chi tiết</Button>
                              </TableCell>
                            </>
                          ) : tab === 'journey' ? (
                            <>
                              <TableCell>{item.plate_number}</TableCell>
                              <TableCell>{item.journey_date}</TableCell>
                              <TableCell>{item.route_description || item.start_location + ' → ' + item.end_location}</TableCell>
                              <TableCell>{item.vehicle_type || item.make + ' ' + item.model}</TableCell>
                              <TableCell>
                                <Button variant="outlined" size="small" onClick={() => handleOpenDetail(item)} startIcon={<Info />} sx={{ borderRadius: 2, fontWeight: 600 }}>Chi tiết</Button>
                              </TableCell>
                            </>
                          ) : tab === 'plate' ? (
                            <>
                              <TableCell>{item.plate_number}</TableCell>
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
                            </>
                          ) : tab === 'access' ? (
                            <>
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
                            </>
                          ) : (
                            <>
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
                                <Stack direction="row" spacing={1}>
                                  {item.status === 'whitelist' && <Chip label="Whitelist" color="success" size="small" />}
                                  {item.status === 'blacklist' && <Chip label="Blacklist" color="error" size="small" />}
                                </Stack>
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
                            </>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      </Box>

      {/* Modal chi tiết động theo loại bản ghi */}
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
              {/* Nếu là camera */}
              {tab === 'camera' ? (
                <>
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
                </>
              ) : tab === 'location' ? (
                <>
                  <Grid item xs={12} md={4}>
                    <Avatar variant="rounded" sx={{ width: 120, height: 70, bgcolor: '#e0e0e0', mb: 2 }}>
                      <LocationOn sx={{ fontSize: 40 }} />
                    </Avatar>
                    <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>{selectedItem.name}</Typography>
                    <Typography variant="body2" color="text.secondary">Mã: {selectedItem.code}</Typography>
                    <Typography variant="body2" color="text.secondary">Loại: {selectedItem.zone_type}</Typography>
                    <Typography variant="body2" color="text.secondary">Trạng thái: {selectedItem.is_active ? 'Hoạt động' : 'Tạm dừng'}</Typography>
                  </Grid>
                  <Grid item xs={12} md={8}>
                    <Typography variant="subtitle1" fontWeight={600} mb={1}>Địa chỉ</Typography>
                    <Typography variant="body2">{selectedItem.address}</Typography>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="subtitle1" fontWeight={600} mb={1}>Mô tả</Typography>
                    <Typography variant="body2">{selectedItem.description}</Typography>
                  </Grid>
                </>
              ) : tab === 'journey' ? (
                <>
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
                    <Box display="flex" alignItems="center" gap={2} mb={1}>
                      <Email color="warning" />
                      <Typography variant="body2">{selectedItem.contact_email}</Typography>
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
                </>
              ) : tab === 'plate' ? (
                <>
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
                </>
              ) : tab === 'access' ? (
                <>
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
                </>
              ) : (
                <>
                  <Grid item xs={12} md={4}>
                    <Avatar variant="rounded" src={selectedItem.detected_plate_image || selectedItem.plate_image || ''} sx={{ width: 120, height: 70, bgcolor: '#e0e0e0', mb: 2 }}>
                      <DirectionsCar sx={{ fontSize: 40 }} />
                    </Avatar>
                    <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>{selectedItem.plate_number}</Typography>
                    <Stack direction="row" spacing={1} mb={2}>
                      {selectedItem.status === 'whitelist' && <Chip label="Whitelist" color="success" size="small" />}
                      {selectedItem.status === 'blacklist' && <Chip label="Blacklist" color="error" size="small" />}
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
                </>
              )}
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

export default SearchPage; 