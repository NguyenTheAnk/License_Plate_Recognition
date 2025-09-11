import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, TextField, Button, Select, MenuItem, InputLabel, FormControl, Tabs, Tab, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, Autocomplete, Divider, Snackbar, Alert, Stack, Avatar, Fade, Collapse, useTheme, alpha, Paper, Tooltip, Badge,
  TablePagination
} from '@mui/material';
import { 
  Search as SearchIcon, DirectionsCar, Person, Phone, Email, LocationOn, CheckCircle, Block, History, CameraAlt, Info, Event, Description, Close as CloseIcon, FilterList, Refresh, TuneRounded, ExpandMore, ExpandLess, Visibility, ArrowForward, Timeline, Security, LocationSearching, FirstPage, LastPage, ChevronLeft, ChevronRight
} from '@mui/icons-material';
import { fetchDataFromAPI } from '../../utils/auth';
import { InputBase, InputAdornment } from '@mui/material';

function SearchPage() {
  const theme = useTheme();
  
  // Danh sách khu vực lấy từ API
  const [locations, setLocations] = useState([]);

  // Danh sách camera lấy từ API
  const [cameras, setCameras] = useState([]);

  const statusOptions = [
    { value: '', label: 'Tất cả trạng thái', color: 'default' },
    { value: 'whitelist', label: 'Whitelist', color: 'success' },
    { value: 'blacklist', label: 'Blacklist', color: 'error' }
  ];

  const validStatusOptions = [
    { value: '', label: 'Tất cả', color: 'default' },
    { value: 'valid', label: 'Còn hiệu lực', color: 'success' },
    { value: 'expired', label: 'Hết hạn', color: 'error' },
    { value: 'future', label: 'Chưa có hiệu lực', color: 'warning' },
    { value: 'permanent', label: 'Vĩnh viễn', color: 'info' }
  ];

  const approvalOptions = [
    { value: '', label: 'Tất cả', color: 'default' },
    { value: 'approved', label: 'Đã duyệt', color: 'success' },
    { value: 'pending', label: 'Chờ duyệt', color: 'warning' },
    { value: 'rejected', label: 'Từ chối', color: 'error' }
  ];

  const violationTypes = [
    { value: '', label: 'Tất cả loại', color: 'default' },
    { value: 'unauthorized', label: 'Không phép', color: 'error' },
    { value: 'security_threat', label: 'Nguy cơ an ninh', color: 'error' },
    { value: 'unpaid_fine', label: 'Chưa nộp phạt', color: 'warning' },
    { value: 'banned', label: 'Cấm', color: 'error' },
    { value: 'suspicious', label: 'Đáng ngờ', color: 'warning' },
    { value: 'other', label: 'Khác', color: 'info' }
  ];

  const severityOptions = [
    { value: '', label: 'Tất cả mức độ', color: 'default' },
    { value: 'low', label: 'Thấp', color: 'info' },
    { value: 'medium', label: 'Trung bình', color: 'warning' },
    { value: 'high', label: 'Cao', color: 'error' },
    { value: 'critical', label: 'Nghiêm trọng', color: 'error' }
  ];

  // Enhanced tab configuration with better icons and descriptions
  const tabList = [
    { 
      label: 'Tổng quan', 
      value: 'all', 
      icon: <SearchIcon />, 
      description: 'Tìm kiếm tất cả',
      color: 'primary'
    },
    { 
      label: 'Whitelist', 
      value: 'whitelist', 
      icon: <CheckCircle />, 
      description: 'Danh sách cho phép',
      color: 'success'
    },
    { 
      label: 'Blacklist', 
      value: 'blacklist', 
      icon: <Block />, 
      description: 'Danh sách cấm',
      color: 'error'
    },
    { 
      label: 'Lịch sử', 
      value: 'history', 
      icon: <History />, 
      description: 'Lịch sử ra vào',
      color: 'info'
    },
    { 
      label: 'Camera', 
      value: 'camera', 
      icon: <CameraAlt />, 
      description: 'Hệ thống camera',
      color: 'warning'
    },
    { 
      label: 'Khu vực', 
      value: 'location', 
      icon: <LocationOn />, 
      description: 'Quản lý khu vực',
      color: 'info'
    },
    { 
      label: 'Lộ trình', 
      value: 'journey', 
      icon: <Timeline />, 
      description: 'Theo dõi lộ trình',
      color: 'primary'
    },
    { 
      label: 'Phát hiện', 
      value: 'plate', 
      icon: <LocationSearching />, 
      description: 'Phát hiện biển số',
      color: 'secondary'
    },
    { 
      label: 'Truy cập', 
      value: 'access', 
      icon: <Security />, 
      description: 'Kiểm soát truy cập',
      color: 'warning'
    },
  ];

  const accessListTypes = [
    { value: '', label: 'Tất cả danh sách', color: 'default' },
    { value: 'whitelist', label: 'Whitelist', color: 'success' },
    { value: 'blacklist', label: 'Blacklist', color: 'error' }
  ];

  // Enhanced state management
  const [filters, setFilters] = useState({
    plate_number: '',
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
    journey_date: '',
    list_type: '',
    is_active: '',
    location_name: '',
    location_code: '',
    zone_type: ''
  });
  
  const [tab, setTab] = useState('all');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [stats, setStats] = useState({});
  const [openDetail, setOpenDetail] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [allResults, setAllResults] = useState({ 
    whitelist: [], blacklist: [], history: [], camera: [], location: [],
    journey: [], plate: [], access: []
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [error, setError] = useState(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [searchHistory, setSearchHistory] = useState([]);

  // State cho phân trang
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  // Thêm state gotoPage và reset khi currentPage thay đổi:
  const [gotoPage, setGotoPage] = useState('');
  useEffect(() => { setGotoPage(''); }, [currentPage]);

  // Fetch locations from API on mount
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetchDataFromAPI('/api/location/active', token, { params: { page: 1, limit: 1000 } });
        if (res && (res.data?.locations || res.data)) {
          setLocations(res.data?.locations || res.data);
        }
      } catch (err) {
        console.error('Error fetching locations:', err);
        setSnackbar({
          open: true,
          message: 'Lỗi khi tải danh sách khu vực',
          severity: 'error'
        });
      }
    };
    fetchLocations();
  }, []);

  // Fetch cameras from API on mount
  useEffect(() => {
    const fetchCameras = async () => {
      try {
        const token = localStorage.getItem('token');
        const data = await fetchDataFromAPI('/api/cameras/streams/all', token);
        // Lấy danh sách camera từ API (giống Sidebar)
        const cameraList = data.data?.cameras || [];
        setCameras(cameraList);
      } catch (error) {
        console.error('Error fetching cameras:', error);
        setSnackbar({
          open: true,
          message: 'Lỗi khi tải danh sách camera',
          severity: 'error'
        });
      }
    };
    fetchCameras();
  }, []);

 const handleSearch = async () => {
  setLoading(true);
  setError(null);
  
  try {
    const token = localStorage.getItem('token');
    // THÊM: Tham số phân trang
    const params = { 
      ...filters, 
      page: currentPage, 
      limit: itemsPerPage 
    };
    
    // Show loading message
    setSnackbar({
      open: true,
      message: 'Đang tìm kiếm...',
      severity: 'info'
    });

    // Parallel API calls with improved error handling
    const [whitelistRes, blacklistRes, cameraRes, locationRes, journeyRes, plateRes, accessRes] = await Promise.allSettled([
      fetchDataFromAPI(`/api/whitelist`, token, { params }),
      fetchDataFromAPI(`/api/blacklist`, token, { params }),
      fetchDataFromAPI(`/api/cameras/streams/all`, token, { params }),
      fetchDataFromAPI(`/api/location/active`, token, { params }),
      fetchDataFromAPI(`/api/journey`, token, { params }),
      fetchDataFromAPI(`/api/plates`, token, { params }),
      fetchDataFromAPI(`/api/access-control`, token, { params })
    ]);

    // Process results
    const processResult = (result) => result.status === 'fulfilled' ? result.value?.data || [] : [];
    
    const newResults = {
      whitelist: processResult(whitelistRes),
      blacklist: processResult(blacklistRes),
      camera: processResult(cameraRes),
      location: processResult(locationRes)?.locations || processResult(locationRes),
      journey: processResult(journeyRes),
      plate: processResult(plateRes),
      access: processResult(accessRes)
    };

    setAllResults(newResults);

    // Enhanced statistics calculation
    const totalWhitelist = newResults.whitelist.length;
    const totalBlacklist = newResults.blacklist.length;
    const totalResults = totalWhitelist + totalBlacklist;
    
    // THÊM: Xử lý thông tin phân trang từ API response
    let apiTotalCount = 0;
    let apiTotalPages = 1;
    
    if (whitelistRes.status === 'fulfilled' && whitelistRes.value?.pagination) {
      apiTotalCount = whitelistRes.value.pagination.total || 0;
      apiTotalPages = whitelistRes.value.pagination.total_pages || 1;
    } else if (blacklistRes.status === 'fulfilled' && blacklistRes.value?.pagination) {
      apiTotalCount = blacklistRes.value.pagination.total || 0;
      apiTotalPages = blacklistRes.value.pagination.total_pages || 1;
    }
    
    setTotalItems(apiTotalCount || totalResults);
    setTotalPages(apiTotalPages || Math.ceil((apiTotalCount || totalResults) / itemsPerPage));
    
    setStats({
      total: totalResults,
      whitelist: totalWhitelist,
      blacklist: totalBlacklist,
      cameras: newResults.camera.length,
      locations: newResults.location.length, // Đảm bảo đúng số lượng
      journeys: newResults.journey.length,
      plates: newResults.plate.length,
      access: newResults.access.length,
      valid: [...newResults.whitelist, ...newResults.blacklist].filter(x => x.current_status === 'valid').length,
      expired: [...newResults.whitelist, ...newResults.blacklist].filter(x => x.current_status === 'expired').length
    });

    // Set initial results
    setResults([
      ...newResults.whitelist.map(r => ({ ...r, status: 'whitelist' })),
      ...newResults.blacklist.map(r => ({ ...r, status: 'blacklist' }))
    ]);

    // Set total count for pagination
    setTotalCount(totalResults);

    // Add to search history
    const searchTerm = filters.plate_number || filters.q || 'Tìm kiếm tổng quát';
    setSearchHistory(prev => [
      { term: searchTerm, timestamp: new Date(), results: totalResults },
      ...prev.slice(0, 4)
    ]);

    setSnackbar({
      open: true,
      message: `Tìm thấy ${totalResults} kết quả`,
      severity: 'success'
    });

  } catch (err) {
    console.error('Search error:', err);
    setError('Lỗi khi tra cứu: ' + (err.message || 'Không xác định'));
    setResults([]);
    setStats({});
    setTotalCount(0);
    setTotalItems(0);
    setTotalPages(1);
    setSnackbar({
      open: true,
      message: 'Có lỗi xảy ra khi tìm kiếm',
      severity: 'error'
    });
  } finally {
    setLoading(false);
  }
};
const handleItemsPerPageChange = (event) => {
  setItemsPerPage(parseInt(event.target.value));
  setCurrentPage(1);
};
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
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

 const handleTabChange = (e, value) => {
  setTab(value);
  setCurrentPage(1); // Reset về trang đầu khi đổi tab
};

  const handleOpenDetail = (item) => {
    setSelectedItem(item);
    setOpenDetail(true);
  };

  const handleCloseDetail = () => {
    setOpenDetail(false);
    setSelectedItem(null);
  };

  const handleClearFilters = () => {
  setFilters({
    plate_number: '',
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
    journey_date: '',
    list_type: '',
    is_active: '', 
    location_name: '',
    location_code: '',
    zone_type: ''
  });
  setResults([]);
  setStats({});
  setCurrentPage(1); // Reset về trang đầu
  setTotalCount(0);
  setTotalItems(0);
  setTotalPages(1);
};

  // Pagination handlers
  const handleChangePage = (event, newPage) => {
    setCurrentPage(newPage);
    // Gọi lại fetchTabData hoặc fetchFilteredData
  };

  const handleChangeRowsPerPage = (event) => {
    setItemsPerPage(parseInt(event.target.value, 10));
    setCurrentPage(1);
    // Gọi lại fetchTabData hoặc fetchFilteredData
  };

  // Enhanced filter rendering based on tab
  const renderFilters = () => {
    return (
      <>
        {/* Main filters row */}
        <Grid container spacing={3} alignItems="center" sx={{ mb: 0 }}>
          <Grid item xs={12} md={3}>
            <TextField
              label="Biển số xe"
              value={filters.plate_number}
              onChange={e => handleFilterChange('plate_number', e.target.value)}
              fullWidth
              size="medium"
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon color="primary" sx={{ fontSize: 22 }} /></InputAdornment>,
                sx: { borderRadius: 4, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)' }
              }}
              InputLabelProps={{ sx: { fontWeight: 700, fontSize: 16, letterSpacing: 0.5 } }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 4, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)', fontSize: 16, fontWeight: 600, transition: 'box-shadow 0.2s', '&:hover': { boxShadow: '0 4px 16px rgba(25,118,210,0.10)' }, '&.Mui-focused': { boxShadow: '0 4px 24px rgba(25,118,210,0.16)' } } }}
            />
          </Grid>

          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="medium" sx={{ borderRadius: 4, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)' }}>
              <InputLabel sx={{ fontWeight: 700, fontSize: 16, letterSpacing: 0.5 }}>Khu vực</InputLabel>
              <Select
                value={filters.location_id}
                label="Khu vực"
                onChange={e => handleFilterChange('location_id', e.target.value)}
                startAdornment={<LocationOn color="info" sx={{ mr: 1, fontSize: 22 }} />}
                sx={{ borderRadius: 4, bgcolor: 'background.paper', fontSize: 16, fontWeight: 600, '& .MuiSelect-icon': { fontSize: 22 } }}
                MenuProps={{
                  PaperProps: {
                    style: {
                      maxHeight: '200px',
                      overflowY: 'auto'
                    }
                  }
                }}
              >
                <MenuItem value="">Tất cả</MenuItem>
                {locations.map(loc => (
                  <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="medium" sx={{ borderRadius: 4, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)' }}>
              <InputLabel sx={{ fontWeight: 700, fontSize: 16, letterSpacing: 0.5 }}>Trạng thái</InputLabel>
              <Select
                value={filters.status}
                label="Trạng thái"
                onChange={e => handleFilterChange('status', e.target.value)}
                sx={{ borderRadius: 4, bgcolor: 'background.paper', fontSize: 16, fontWeight: 600, '& .MuiSelect-icon': { fontSize: 22 } }}
              >
                {statusOptions.map(opt => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
        {/* Advanced filters collapsible */}
        <Divider sx={{ my: 2 }} />
        <Button
          variant="text"
          startIcon={showAdvancedFilters ? <ExpandLess /> : <ExpandMore />}
          onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          sx={{ textTransform: 'none', color: 'primary.main', fontWeight: 600, mb: 1 }}
        >
          Bộ lọc nâng cao
        </Button>
        <Collapse in={showAdvancedFilters} timeout="auto" unmountOnExit>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="medium" sx={{ borderRadius: 4, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)' }}>
                <InputLabel sx={{ fontWeight: 700, fontSize: 15 }}>Hiệu lực</InputLabel>
                <Select
                  value={filters.valid_status}
                  label="Hiệu lực"
                  onChange={e => handleFilterChange('valid_status', e.target.value)}
                  sx={{ borderRadius: 4, bgcolor: 'background.paper', fontSize: 15, fontWeight: 600 }}
                >
                  {validStatusOptions.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="medium" sx={{ borderRadius: 4, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)' }}>
                <InputLabel sx={{ fontWeight: 700, fontSize: 15 }}>Phê duyệt</InputLabel>
                <Select
                  value={filters.approval_status}
                  label="Phê duyệt"
                  onChange={e => handleFilterChange('approval_status', e.target.value)}
                  sx={{ borderRadius: 4, bgcolor: 'background.paper', fontSize: 15, fontWeight: 600 }}
                >
                  {approvalOptions.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="medium" sx={{ borderRadius: 4, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)' }}>
                <InputLabel sx={{ fontWeight: 700, fontSize: 15 }}>Loại vi phạm</InputLabel>
                <Select
                  value={filters.violation_type}
                  label="Loại vi phạm"
                  onChange={e => handleFilterChange('violation_type', e.target.value)}
                  sx={{ borderRadius: 4, bgcolor: 'background.paper', fontSize: 15, fontWeight: 600 }}
                >
                  {violationTypes.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="medium" sx={{ borderRadius: 4, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)' }}>
                <InputLabel sx={{ fontWeight: 700, fontSize: 15 }}>Mức độ</InputLabel>
                <Select
                  value={filters.severity}
                  label="Mức độ"
                  onChange={e => handleFilterChange('severity', e.target.value)}
                  sx={{ borderRadius: 4, bgcolor: 'background.paper', fontSize: 15, fontWeight: 600 }}
                >
                  {severityOptions.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                label="Từ ngày"
                type="date"
                value={filters.date_from}
                onChange={e => handleFilterChange('date_from', e.target.value)}
                fullWidth
                size="medium"
                InputLabelProps={{ shrink: true, sx: { fontWeight: 700, fontSize: 15 } }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 4, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)' } }}
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                label="Đến ngày"
                type="date"
                value={filters.date_to}
                onChange={e => handleFilterChange('date_to', e.target.value)}
                fullWidth
                size="medium"
                InputLabelProps={{ shrink: true, sx: { fontWeight: 700, fontSize: 15 } }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 4, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)' } }}
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="medium" sx={{ borderRadius: 4, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)' }}>
                <InputLabel sx={{ fontWeight: 700, fontSize: 15 }}>Camera</InputLabel>
                <Select
                  value={filters.camera_id}
                  label="Camera"
                  onChange={e => handleFilterChange('camera_id', e.target.value)}
                  sx={{ borderRadius: 4, bgcolor: 'background.paper', fontSize: 15, fontWeight: 600 }}
                  MenuProps={{
                    PaperProps: {
                      style: {
                        maxHeight: '200px',
                        overflowY: 'auto'
                      }
                    }
                  }}
                >
                  <MenuItem value="">Tất cả</MenuItem>
                  {cameras.map(cam => (
                    <MenuItem key={cam.id} value={cam.id}>{cam.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                label="Tìm kiếm toàn văn"
                value={filters.q}
                onChange={e => handleFilterChange('q', e.target.value)}
                fullWidth
                size="medium"
                placeholder="Nhập từ khóa tìm kiếm..."
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon color="primary" /></InputAdornment> }}
                InputLabelProps={{ sx: { fontWeight: 700, fontSize: 15 } }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 4, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)' } }}
              />
            </Grid>
          </Grid>
        </Collapse>
      </>
    );
  };

  // Enhanced statistics cards
  const renderStatsCards = () => {
    const statsData = [
      { 
        label: 'Tổng kết quả', 
        value: stats.total || 0, 
        color: '#1976d2', 
        bgColor: '#e3f2fd',
        icon: <SearchIcon />
      },
      { 
        label: 'Whitelist', 
        value: stats.whitelist || 0, 
        color: '#2e7d32', 
        bgColor: '#e8f5e9',
        icon: <CheckCircle />
      },
      { 
        label: 'Blacklist', 
        value: stats.blacklist || 0, 
        color: '#d32f2f', 
        bgColor: '#ffebee',
        icon: <Block />
      },
      { 
        label: 'Còn hiệu lực', 
        value: stats.valid || 0, 
        color: '#ed6c02', 
        bgColor: '#fff3e0',
        icon: <CheckCircle />
      },
      { 
        label: 'Hết hạn', 
        value: stats.expired || 0, 
        color: '#9c27b0', 
        bgColor: '#f3e5f5',
        icon: <Event />
      },
      { 
        label: 'Camera', 
        value: stats.cameras || 0, 
        color: '#ff9800', 
        bgColor: '#fff3e0',
        icon: <CameraAlt />
      }
    ];

    return (
      <Grid container spacing={2}>
        {statsData.map((stat, index) => (
          <Grid item xs={6} md={2} key={index}>
            <Fade in timeout={300 + index * 100}>
              <Card 
                sx={{ 
                  borderRadius: 3, 
                  bgcolor: stat.bgColor, 
                  boxShadow: 'none',
                  border: `1px solid ${alpha(stat.color, 0.2)}`,
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: `0 8px 25px ${alpha(stat.color, 0.15)}`,
                    border: `1px solid ${alpha(stat.color, 0.3)}`
                  }
                }}
              >
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Box display="flex" alignItems="center" gap={1} mb={1}>
                    <Avatar sx={{ bgcolor: stat.color, width: 32, height: 32 }}>
                      {React.cloneElement(stat.icon, { sx: { fontSize: 18, color: 'white' } })}
                    </Avatar>
                    <Typography variant="body2" color="text.secondary" fontWeight={500}>
                      {stat.label}
                    </Typography>
                  </Box>
                  <Typography variant="h4" fontWeight={700} color={stat.color}>
                    {stat.value.toLocaleString()}
                  </Typography>
                </CardContent>
              </Card>
            </Fade>
          </Grid>
        ))}
      </Grid>
    );
  };

useEffect(() => {
  const fetchTabData = async () => {
    setLoading(true);
    setError(null);
    const token = localStorage.getItem('token');
    // THÊM: Tham số phân trang và filters
    let params = { 
      page: currentPage, 
      limit: itemsPerPage,
      ...filters // Thêm filters vào params
    };
    try {
      let data = [];
      let totalCountFromAPI = 0;
      let totalPagesFromAPI = 1;
      
      switch (tab) {
        case 'whitelist':
          data = await fetchDataFromAPI(`/api/whitelist`, token, { params });
          setResults(data.data || []);
          totalCountFromAPI = data.pagination?.total || data.pagination?.total_records || data.total || (Array.isArray(data.data) ? data.data.length : 0) || (Array.isArray(data) ? data.length : 0);
          totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage) || 1;
          break;
        case 'blacklist':
          try {
            const token = localStorage.getItem('token');
            console.log('Loading blacklist with token (filtered):', token ? 'Token exists' : 'No token');
            
            const params = new URLSearchParams();
            params.append('page', currentPage.toString());
            params.append('limit', itemsPerPage.toString());
            
            // Add filters to params
            Object.entries(filters).forEach(([key, value]) => {
              if (value !== '' && value !== null && value !== undefined) {
                params.append(key, value);
              }
            });

            const headers = {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            };

            const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/blacklist?${params.toString()}`, {
              method: 'GET',
              headers
            });

            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Blacklist API response (fetchFilteredData):', data);
            console.log('Blacklist params sent (fetchFilteredData):', params.toString());

            if (data.success) {
              console.log('Blacklist loaded (filtered):', data.data);
              
              // Process data like BlackList.js
              const processedData = data.data.map(item => ({
                ...item,
                _refreshTimestamp: Date.now(),
                detected_plate_image: item.detected_plate_image,
                plate_image_path: item.plate_image_path
              }));
              
              setResults(processedData);
              console.log('Blacklist results after setResults (filtered):', processedData);
              
              if (data.pagination) {
                totalCountFromAPI = data.pagination.total || 0;
                totalPagesFromAPI = data.pagination.total_pages || 1;
              }
            } else {
              console.warn('Blacklist API returned error (filtered):', data.message);
              setResults([]);
              totalCountFromAPI = 0;
              totalPagesFromAPI = 1;
            }
          } catch (error) {
            console.error('Error loading blacklist (filtered):', error);
            setResults([]);
            totalCountFromAPI = 0;
            totalPagesFromAPI = 1;
          }
          break;
        case 'camera':
          data = await fetchDataFromAPI(`/api/cameras/streams/all`, token, { params });
          // Đảm bảo setResults là mảng camera
          const cameraList = (data.data && Array.isArray(data.data.cameras)) ? data.data.cameras : [];
          setResults(cameraList);
          totalCountFromAPI = cameraList.length;
          totalPagesFromAPI = Math.ceil(totalCountFromAPI / itemsPerPage);
          break;
        case 'location':
          data = await fetchDataFromAPI(`/api/location/active`, token, { params });
          console.log('Location API response:', data);
          console.log('Params sent:', params);
          if (data.data && data.data.locations) {
            setResults(data.data.locations);
            totalCountFromAPI = data.data.pagination?.total_records || 0; // Sửa: lấy từ pagination.total_records
            totalPagesFromAPI = data.data.pagination?.total_pages || 1;
          } else if (data.locations) {
            setResults(data.locations);
            totalCountFromAPI = data.pagination?.total_records || 0; // Sửa: lấy từ pagination.total_records
            totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage);
          } else if (Array.isArray(data.data)) {
            setResults(data.data);
            totalCountFromAPI = data.total || data.pagination?.total || 0;
            totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage);
          } else if (Array.isArray(data)) {
            setResults(data);
            totalCountFromAPI = data.length;
            totalPagesFromAPI = 1;
          } else {
            setResults([]);
            totalCountFromAPI = 0;
            totalPagesFromAPI = 1;
          }
          break;
        case 'journey':
          data = await fetchDataFromAPI(`/api/journey`, token, { params });
          setResults(data.data || []);
          totalCountFromAPI = data.total || data.pagination?.total || 0;
          totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage);
          break;
        case 'plate':
          data = await fetchDataFromAPI(`/api/plates`, token, { params });
          setResults(data.data || []);
          totalCountFromAPI = data.total || data.pagination?.total || 0;
          totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage);
          break;
        case 'access':
          data = await fetchDataFromAPI(`/api/access-control`, token, { params });
          setResults(data || []);
          totalCountFromAPI = data.total || data.pagination?.total || 0;
          totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage);
          break;
        default:
          setResults([]);
          totalCountFromAPI = 0;
          totalPagesFromAPI = 1;
      }
      setTotalCount(totalCountFromAPI);
      setTotalItems(totalCountFromAPI);
      setTotalPages(totalPagesFromAPI);
    } catch (err) {
      console.error('Fetch tab data error:', err);
      setError('Lỗi khi tải dữ liệu: ' + (err.message || 'Không xác định'));
      setResults([]);
      setTotalCount(0);
      setTotalItems(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  };
  if (tab !== 'all') fetchTabData();
}, [tab, currentPage, itemsPerPage, filters]); // Thêm filters vào dependencies

useEffect(() => {
  if (tab === 'all') return;
  const hasFilter = Object.values(filters).some(v => v && v !== '');
  if (!hasFilter) return;
  const fetchFilteredData = async () => {
    setLoading(true);
    setError(null);
    const token = localStorage.getItem('token');
    // THÊM: Tham số phân trang
    let params = { ...filters, page: currentPage, limit: itemsPerPage };
    try {
      let data = [];
      let totalCountFromAPI = 0;
      let totalPagesFromAPI = 1;
      
      switch (tab) {
        case 'whitelist':
          data = await fetchDataFromAPI(`/api/whitelist`, token, { params });
          setResults(data.data || []);
          console.log('Blacklist results after setResults (filtered):', data.data || []);
          totalCountFromAPI = data.pagination?.total || data.pagination?.total_records || data.total || (Array.isArray(data.data) ? data.data.length : 0) || (Array.isArray(data) ? data.length : 0);
          totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage) || 1;
          break;
        case 'blacklist':
          try {
            const token = localStorage.getItem('token');
            console.log('Loading blacklist with token (filtered):', token ? 'Token exists' : 'No token');
            
            const params = new URLSearchParams();
            params.append('page', currentPage.toString());
            params.append('limit', itemsPerPage.toString());
            
            // Add filters to params
            Object.entries(filters).forEach(([key, value]) => {
              if (value !== '' && value !== null && value !== undefined) {
                params.append(key, value);
              }
            });

            const headers = {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            };

            const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/blacklist?${params.toString()}`, {
              method: 'GET',
              headers
            });

            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Blacklist API response (fetchFilteredData):', data);
            console.log('Blacklist params sent (fetchFilteredData):', params.toString());

            if (data.success) {
              console.log('Blacklist loaded (filtered):', data.data);
              
              // Process data like BlackList.js
              const processedData = data.data.map(item => ({
                ...item,
                _refreshTimestamp: Date.now(),
                detected_plate_image: item.detected_plate_image,
                plate_image_path: item.plate_image_path
              }));
              
              setResults(processedData);
              console.log('Blacklist results after setResults (filtered):', processedData);
              
              if (data.pagination) {
                totalCountFromAPI = data.pagination.total || 0;
                totalPagesFromAPI = data.pagination.total_pages || 1;
              }
            } else {
              console.warn('Blacklist API returned error (filtered):', data.message);
              setResults([]);
              totalCountFromAPI = 0;
              totalPagesFromAPI = 1;
            }
          } catch (error) {
            console.error('Error loading blacklist (filtered):', error);
            setResults([]);
            totalCountFromAPI = 0;
            totalPagesFromAPI = 1;
          }
          break;
        case 'camera':
          data = await fetchDataFromAPI(`/api/cameras/streams/all`, token, { params });
          // Đảm bảo setResults là mảng camera
          const cameraList = (data.data && Array.isArray(data.data.cameras)) ? data.data.cameras : [];
          setResults(cameraList);
          totalCountFromAPI = cameraList.length;
          totalPagesFromAPI = Math.ceil(totalCountFromAPI / itemsPerPage);
          break;
        case 'location':
            // SỬA: Gửi đúng tham số cho location API với filters
            const locationFilterParams = {
              name: filters.location_name,     // ✅ ĐÚNG field name
              code: filters.location_code,     // ✅ ĐÚNG field name
              zone_type: filters.zone_type,
              is_active: filters.is_active,
              page: currentPage, 
              limit: itemsPerPage
            };
            data = await fetchDataFromAPI(`/api/location/active`, token, { params: locationFilterParams });
            console.log('Filtered Location API response:', data);
            console.log('Location filter params sent:', locationFilterParams);
          if (data.data && data.data.locations) {
            setResults(data.data.locations);
            totalCountFromAPI = data.data.pagination?.total_records || 0; // Sửa: lấy từ pagination.total_records
            totalPagesFromAPI = data.data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage);
          } else if (data.locations) {
            setResults(data.locations);
            totalCountFromAPI = data.pagination?.total_records || 0; // Sửa: lấy từ pagination.total_records
            totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage);
          } else if (Array.isArray(data.data)) {
            setResults(data.data);
            totalCountFromAPI = data.total || data.pagination?.total || 0;
            totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage);
          } else if (Array.isArray(data)) {
            setResults(data);
            totalCountFromAPI = data.length;
            totalPagesFromAPI = 1;
          } else {
            setResults([]);
            totalCountFromAPI = 0;
            totalPagesFromAPI = 1;
          }
          break;
        case 'journey':
          data = await fetchDataFromAPI(`/api/journey`, token, { params });
          setResults(data.data || []);
          totalCountFromAPI = data.total || data.pagination?.total || 0;
          totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage);
          break;
        case 'plate':
          data = await fetchDataFromAPI(`/api/plates`, token, { params });
          setResults(data.data || []);
          totalCountFromAPI = data.total || data.pagination?.total || 0;
          totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage);
          break;
        case 'access':
          data = await fetchDataFromAPI(`/api/access-control`, token, { params });
          setResults(data || []);
          totalCountFromAPI = data.total || data.pagination?.total || 0;
          totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage);
          break;
        default:
          setResults([]);
          totalCountFromAPI = 0;
          totalPagesFromAPI = 1;
      }
      setTotalCount(totalCountFromAPI);
      setTotalItems(totalCountFromAPI);
      setTotalPages(totalPagesFromAPI);
    } catch (err) {
      console.error('Filtered data error:', err);
      setError('Lỗi khi lọc dữ liệu: ' + (err.message || 'Không xác định'));
      setResults([]);
      setTotalCount(0);
      setTotalItems(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  };
  fetchFilteredData();
}, [filters, tab, currentPage, itemsPerPage]);

  // Helper function to get table header color based on tab
  const getTableHeaderStyle = () => {
    switch (tab) {
      case 'whitelist':
        return 'linear-gradient(90deg, #2e7d32 0%, #4caf50 100%)';
      case 'blacklist':
        return 'linear-gradient(90deg, #d32f2f 0%, #f44336 100%)';
      case 'camera':
        return 'linear-gradient(90deg, #ff9800 0%, #ffc107 100%)';
      case 'location':
        return 'linear-gradient(90deg, #1976d2 0%, #2196f3 100%)';
      case 'journey':
        return 'linear-gradient(90deg, #7b1fa2 0%, #9c27b0 100%)';
      case 'plate':
        return 'linear-gradient(90deg, #5d4037 0%, #8d6e63 100%)';
      case 'access':
        return 'linear-gradient(90deg, #ef6c00 0%, #ff9800 100%)';
      default:
        return 'linear-gradient(90deg, #1976d2 0%, #1565c0 100%)';
    }
  };

  // Helper function to get avatar color based on tab
  const getAvatarColor = () => {
    switch (tab) {
      case 'whitelist':
        return { bgcolor: '#e8f5e9', border: '2px solid #4caf50', iconColor: '#4caf50' };
      case 'blacklist':
        return { bgcolor: '#ffebee', border: '2px solid #f44336', iconColor: '#f44336' };
      case 'camera':
        return { bgcolor: '#fff3e0', border: '2px solid #ff9800', iconColor: '#ff9800' };
      case 'location':
        return { bgcolor: '#e3f2fd', border: '2px solid #2196f3', iconColor: '#2196f3' };
      default:
        return { bgcolor: '#e0e0e0', border: '2px solid #757575', iconColor: '#757575' };
    }
  };

  // Helper function to format date
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString; // Return original if invalid date
    
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    
    return `${day}/${month}/${year}`;
  };

  // Helper functions from BlackList.js
  const getStatusChip = (status) => {
    const statusConfig = {
      'valid': { label: 'Còn hiệu lực', color: 'success' },
      'expired': { label: 'Hết hạn', color: 'error' },
      'future': { label: 'Chưa hiệu lực', color: 'warning' },
      'permanent': { label: 'Vĩnh viễn', color: 'info' },
      'active': { label: 'Hoạt động', color: 'success' },
      'inactive': { label: 'Không hoạt động', color: 'error' }
    };
    
    const config = statusConfig[status] || { label: status || 'N/A', color: 'default' };
    
    return <Chip 
      label={config.label} 
      color={config.color} 
      size="small" 
      sx={{ fontWeight: 600 }}
    />;
  };

  const getViolationTypeChip = (type) => {
    const typeConfig = {
      'unauthorized': { label: 'Không phép', color: 'error' },
      'security_threat': { label: 'Nguy cơ an ninh', color: 'error' },
      'unpaid_fine': { label: 'Chưa nộp phạt', color: 'warning' },
      'banned': { label: 'Cấm', color: 'error' },
      'suspicious': { label: 'Đáng ngờ', color: 'warning' },
      'other': { label: 'Khác', color: 'default' }
    };
    
    const config = typeConfig[type] || { label: type || 'N/A', color: 'default' };
    
    return <Chip 
      label={config.label} 
      color={config.color} 
      size="small" 
      sx={{ fontWeight: 600 }}
    />;
  };

  const getSeverityChip = (severity) => {
    const severityConfig = {
      'low': { label: 'Thấp', color: 'success' },
      'medium': { label: 'Trung bình', color: 'warning' },
      'high': { label: 'Cao', color: 'error' },
      'critical': { label: 'Nghiêm trọng', color: 'error' }
    };
    
    const config = severityConfig[severity] || { label: severity || 'N/A', color: 'default' };
    
    return <Chip 
      label={config.label} 
      color={config.color} 
      size="small" 
      sx={{ fontWeight: 600 }}
    />;
  };

  const getApprovalChip = (status) => {
    const statusConfig = {
      'approved': { label: 'Đã phê duyệt', color: 'success' },
      'pending': { label: 'Chờ phê duyệt', color: 'warning' },
      'rejected': { label: 'Từ chối', color: 'error' }
    };
    
    const config = statusConfig[status] || { label: status || 'N/A', color: 'default' };
    
    return <Chip 
      label={config.label} 
      color={config.color} 
      size="small" 
      sx={{ fontWeight: 600 }}
    />;
  };

  // Debug: Log results state
  console.log('Current results state:', results);
  console.log('Current tab:', tab);
  console.log('Current loading state:', loading);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8f9fa', py: 3 }}>
      {/* Enhanced Header */}
      <Box sx={{ px: 3, mb: 3 }}>
        <Card sx={{ background: '#fff', color: '#222', borderRadius: 5, boxShadow: '0 4px 24px rgba(25, 118, 210, 0.06)', p: 0, mb: 3 }}>
          <CardContent sx={{ p: { xs: 3, md: 5 }, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <Avatar sx={{ bgcolor: '#e3f2fd', color: '#1976d2', width: 48, height: 48, boxShadow: '0 2px 8px rgba(25,118,210,0.08)', mb: 2 }}>
              <SearchIcon sx={{ fontSize: 28 }} />
            </Avatar>
            <Typography variant="h5" fontWeight={700} sx={{ color: '#1976d2', mb: 2, textAlign: 'center', letterSpacing: 0.5 }}>
              Tìm kiếm & quản lý phương tiện, biển số, lịch sử ra vào một cách toàn diện
            </Typography>
            <Box display="flex" gap={2} flexWrap="wrap" justifyContent="center" mb={1}>
              <Chip label="Tìm kiếm thông minh" variant="outlined" sx={{ fontWeight: 600, color: '#1976d2', borderColor: '#90caf9', bgcolor: '#f5fafd' }} />
              <Chip label="Báo cáo chi tiết" variant="outlined" sx={{ fontWeight: 600, color: '#1976d2', borderColor: '#90caf9', bgcolor: '#f5fafd' }} />
              <Chip label="Theo dõi realtime" variant="outlined" sx={{ fontWeight: 600, color: '#1976d2', borderColor: '#90caf9', bgcolor: '#f5fafd' }} />
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Enhanced Filter Section */}
      <Box sx={{ px: 3, mb: 3 }}>
        <Card sx={{ borderRadius: 5, boxShadow: '0 8px 32px rgba(25, 118, 210, 0.12)', background: '#fff', p: 0, overflow: 'visible' }}>
          <CardContent sx={{ p: { xs: 2, md: 5 }, borderRadius: 5, background: 'transparent' }}>
            <Box display="flex" alignItems="center" gap={2} mb={3}>
              <Avatar sx={{ bgcolor: 'linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)', width: 48, height: 48, boxShadow: '0 2px 8px rgba(25,118,210,0.12)' }}>
                <TuneRounded sx={{ fontSize: 28, color: 'white' }} />
              </Avatar>
              <Typography variant="h5" fontWeight={800} sx={{ background: 'linear-gradient(90deg, #1976d2 0%, #42a5f5 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: 1 }}>
                Bộ lọc tìm kiếm
              </Typography>
              <Box flex={1} />
              <Chip label={`Tab: ${tabList.find(t => t.value === tab)?.label}`} color="primary" size="small" sx={{ fontWeight: 700, fontSize: 15, px: 2, py: 1, borderRadius: 2 }} />
            </Box>
            
            <Grid container spacing={3} alignItems="center" sx={{ mb: 0 }}>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Biển số xe"
                  value={filters.plate_number}
                  onChange={e => handleFilterChange('plate_number', e.target.value)}
                  fullWidth
                  size="medium"
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><SearchIcon color="primary" sx={{ fontSize: 22 }} /></InputAdornment>,
                    sx: { borderRadius: 4, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)' }
                  }}
                  InputLabelProps={{ sx: { fontWeight: 700, fontSize: 16, letterSpacing: 0.5 } }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 4, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)', fontSize: 16, fontWeight: 600, transition: 'box-shadow 0.2s', '&:hover': { boxShadow: '0 4px 16px rgba(25,118,210,0.10)' }, '&.Mui-focused': { boxShadow: '0 4px 24px rgba(25,118,210,0.16)' } } }}
                />
              </Grid>

              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="medium" sx={{ borderRadius: 4, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)' }}>
                  <InputLabel sx={{ fontWeight: 700, fontSize: 16, letterSpacing: 0.5 }}>Khu vực</InputLabel>
                  <Select
                    value={filters.location_id}
                    label="Khu vực"
                    onChange={e => handleFilterChange('location_id', e.target.value)}
                    startAdornment={<LocationOn color="info" sx={{ mr: 1, fontSize: 22 }} />}
                    sx={{ borderRadius: 4, bgcolor: 'background.paper', fontSize: 16, fontWeight: 600, '& .MuiSelect-icon': { fontSize: 22 } }}
                    MenuProps={{
                      PaperProps: {
                        style: {
                          maxHeight: '200px',
                          overflowY: 'auto'
                        }
                      }
                    }}
                  >
                    <MenuItem value="">Tất cả</MenuItem>
                    {locations.map(loc => (
                      <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="medium" sx={{ borderRadius: 4, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)' }}>
                  <InputLabel sx={{ fontWeight: 700, fontSize: 16, letterSpacing: 0.5 }}>Trạng thái</InputLabel>
                  <Select
                    value={filters.status}
                    label="Trạng thái"
                    onChange={e => handleFilterChange('status', e.target.value)}
                    sx={{ borderRadius: 4, bgcolor: 'background.paper', fontSize: 16, fontWeight: 600, '& .MuiSelect-icon': { fontSize: 22 } }}
                  >
                    {statusOptions.map(opt => (
                      <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
            {/* Advanced filters collapsible */}
            <Divider sx={{ my: 2 }} />
            <Button
              variant="text"
              startIcon={showAdvancedFilters ? <ExpandLess /> : <ExpandMore />}
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              sx={{ textTransform: 'none', color: 'primary.main', fontWeight: 600, mb: 1 }}
            >
              Bộ lọc nâng cao
            </Button>
            <Collapse in={showAdvancedFilters} timeout="auto" unmountOnExit>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} md={2}>
                  <FormControl fullWidth size="medium" sx={{ borderRadius: 4, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)' }}>
                    <InputLabel sx={{ fontWeight: 700, fontSize: 15 }}>Hiệu lực</InputLabel>
                    <Select
                      value={filters.valid_status}
                      label="Hiệu lực"
                      onChange={e => handleFilterChange('valid_status', e.target.value)}
                      sx={{ borderRadius: 4, bgcolor: 'background.paper', fontSize: 15, fontWeight: 600 }}
                    >
                      {validStatusOptions.map(opt => (
                        <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={2}>
                  <FormControl fullWidth size="medium" sx={{ borderRadius: 4, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)' }}>
                    <InputLabel sx={{ fontWeight: 700, fontSize: 15 }}>Phê duyệt</InputLabel>
                    <Select
                      value={filters.approval_status}
                      label="Phê duyệt"
                      onChange={e => handleFilterChange('approval_status', e.target.value)}
                      sx={{ borderRadius: 4, bgcolor: 'background.paper', fontSize: 15, fontWeight: 600 }}
                    >
                      {approvalOptions.map(opt => (
                        <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={2}>
                  <FormControl fullWidth size="medium" sx={{ borderRadius: 4, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)' }}>
                    <InputLabel sx={{ fontWeight: 700, fontSize: 15 }}>Loại vi phạm</InputLabel>
                    <Select
                      value={filters.violation_type}
                      label="Loại vi phạm"
                      onChange={e => handleFilterChange('violation_type', e.target.value)}
                      sx={{ borderRadius: 4, bgcolor: 'background.paper', fontSize: 15, fontWeight: 600 }}
                    >
                      {violationTypes.map(opt => (
                        <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={2}>
                  <FormControl fullWidth size="medium" sx={{ borderRadius: 4, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)' }}>
                    <InputLabel sx={{ fontWeight: 700, fontSize: 15 }}>Mức độ</InputLabel>
                    <Select
                      value={filters.severity}
                      label="Mức độ"
                      onChange={e => handleFilterChange('severity', e.target.value)}
                      sx={{ borderRadius: 4, bgcolor: 'background.paper', fontSize: 15, fontWeight: 600 }}
                    >
                      {severityOptions.map(opt => (
                        <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={2}>
                  <TextField
                    label="Từ ngày"
                    type="date"
                    value={filters.date_from}
                    onChange={e => handleFilterChange('date_from', e.target.value)}
                    fullWidth
                    size="medium"
                    InputLabelProps={{ shrink: true, sx: { fontWeight: 700, fontSize: 15 } }}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 4, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)' } }}
                  />
                </Grid>
                <Grid item xs={12} md={2}>
                  <TextField
                    label="Đến ngày"
                    type="date"
                    value={filters.date_to}
                    onChange={e => handleFilterChange('date_to', e.target.value)}
                    fullWidth
                    size="medium"
                    InputLabelProps={{ shrink: true, sx: { fontWeight: 700, fontSize: 15 } }}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 4, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)' } }}
                  />
                </Grid>
                <Grid item xs={12} md={2}>
                  <FormControl fullWidth size="medium" sx={{ borderRadius: 4, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)' }}>
                    <InputLabel sx={{ fontWeight: 700, fontSize: 15 }}>Camera</InputLabel>
                    <Select
                      value={filters.camera_id}
                      label="Camera"
                      onChange={e => handleFilterChange('camera_id', e.target.value)}
                      sx={{ borderRadius: 4, bgcolor: 'background.paper', fontSize: 15, fontWeight: 600 }}
                      MenuProps={{
                        PaperProps: {
                          style: {
                            maxHeight: '200px',
                            overflowY: 'auto'
                          }
                        }
                      }}
                    >
                      <MenuItem value="">Tất cả</MenuItem>
                      {cameras.map(cam => (
                        <MenuItem key={cam.id} value={cam.id}>{cam.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Tìm kiếm toàn văn"
                    value={filters.q}
                    onChange={e => handleFilterChange('q', e.target.value)}
                    fullWidth
                    size="medium"
                    placeholder="Nhập từ khóa tìm kiếm..."
                    InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon color="primary" /></InputAdornment> }}
                    InputLabelProps={{ sx: { fontWeight: 700, fontSize: 15 } }}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 4, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)' } }}
                  />
                </Grid>
              </Grid>
            </Collapse>
          </CardContent>
        </Card>
      </Box>

      {/* Enhanced Statistics */}
      <Box sx={{ px: 3, mb: 3 }}>
        {renderStatsCards()}
      </Box>

      {/* Enhanced Tabs */}
      <Box sx={{ px: 3, mb: 3 }}>
        <Card sx={{ borderRadius: 3, boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
            <Tabs 
              value={tab} 
              onChange={handleTabChange} 
              variant="scrollable" 
              scrollButtons="auto" 
              allowScrollButtonsMobile
              sx={{
                '& .MuiTab-root': {
                  fontWeight: 600,
                  fontSize: 14,
                  minHeight: 64,
                  textTransform: 'none',
                  borderRadius: 2,
                  margin: '8px 4px',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    backgroundColor: alpha(theme.palette.primary.main, 0.04)
                  }
                }
              }}
            >
              {tabList.map(t => (
                <Tab 
                  key={t.value} 
                  value={t.value} 
                  label={
                    <Box display="flex" alignItems="center" gap={1}>
                      {React.cloneElement(t.icon, { 
                        sx: { 
                          fontSize: 18,
                          color: tab === t.value ? t.color + '.main' : 'text.secondary'
                        } 
                      })}
                      <Box>
                        <Typography variant="body2" fontWeight={600}>
                          {t.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {t.description}
                        </Typography>
                      </Box>
                      {stats[t.value.replace('all', 'total')] > 0 && (
                        <Badge 
                          badgeContent={stats[t.value.replace('all', 'total')] || stats.total} 
                          color={t.color}
                          max={999}
                        />
                      )}
                    </Box>
                  }
                />
              ))}
            </Tabs>
          </Box>
        </Card>
      </Box>

      {/* Enhanced Results Table */}
      <Box sx={{ px: 3 }}>
        <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
          <CardContent sx={{ p: 0 }}>
            {loading ? (
              <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight={300}>
                <CircularProgress size={60} thickness={4} />
                <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>
                  Đang tìm kiếm...
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Vui lòng đợi trong giây lát
                </Typography>
              </Box>
            ) : error ? (
              <Box display="flex" justifyContent="center" alignItems="center" minHeight={300} p={3}>
                <Alert 
                  severity="error" 
                  sx={{ 
                    width: '100%', 
                    maxWidth: 500,
                    borderRadius: 2
                  }}
                  action={
                    <Button color="inherit" size="small" onClick={handleSearch}>
                      Thử lại
                    </Button>
                  }
                >
                  <Typography variant="subtitle1" fontWeight={600}>
                    Có lỗi xảy ra
                  </Typography>
                  <Typography variant="body2">
                    {error}
                  </Typography>
                </Alert>
              </Box>
                          ) : (
                <>
                  <TableContainer>
                    <Table>
                    <TableHead>
                      <TableRow sx={{ 
                        background: getTableHeaderStyle()
                      }}>
                        {/* STT Column */}
                        <TableCell sx={{ color: 'white', fontWeight: 700, py: 2, width: '80px' }}>
                          <Box display="flex" alignItems="center" gap={1}>
                            STT
                          </Box>
                        </TableCell>

                        {/* Dynamic headers based on tab */}
                        {tab === 'whitelist' || tab === 'blacklist' ? (
                          <>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>
                              <Box display="flex" alignItems="center" gap={1}>
                                <DirectionsCar />
                                Biển số xe
                              </Box>
                            </TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Ảnh biển số</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Trạng thái</TableCell>
                            {tab === 'whitelist' && (
                              <TableCell sx={{ color: 'white', fontWeight: 700 }}>Phê duyệt</TableCell>
                            )}
                            {tab === 'blacklist' && (
                              <TableCell sx={{ color: 'white', fontWeight: 700 }}>Loại vi phạm</TableCell>
                            )}
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thao tác</TableCell>
                          </>
                        ) : tab === 'camera' ? (
                          <>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>
                              <Box display="flex" alignItems="center" gap={1}>
                                <CameraAlt />
                                Tên camera
                              </Box>
                            </TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Mã camera</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Vị trí</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Trạng thái</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thao tác</TableCell>
                          </>
                        ) : tab === 'location' ? (
                          <>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>
                              <Box display="flex" alignItems="center" gap={1}>
                                <LocationOn />
                                Tên khu vực
                              </Box>
                            </TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Mã khu vực</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Loại</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Trạng thái</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thao tác</TableCell>
                          </>
                        ) : tab === 'journey' ? (
                          <>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>
                              <Box display="flex" alignItems="center" gap={1}>
                                <DirectionsCar />
                                Biển số
                              </Box>
                            </TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Ngày</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Lộ trình</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Loại xe</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thao tác</TableCell>
                          </>
                        ) : tab === 'plate' ? (
                          <>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>
                              <Box display="flex" alignItems="center" gap={1}>
                                <DirectionsCar />
                                Biển số
                              </Box>
                            </TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Ảnh phát hiện</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Camera</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Khu vực</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thời gian</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thao tác</TableCell>
                          </>
                        ) : tab === 'access' ? (
                          <>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>
                              <Box display="flex" alignItems="center" gap={1}>
                                <Security />
                                Biển số
                              </Box>
                            </TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Loại danh sách</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Khu vực</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Người thêm</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Trạng thái</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thao tác</TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>
                              <Box display="flex" alignItems="center" gap={1}>
                                <DirectionsCar />
                                Biển số
                              </Box>
                            </TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Hình ảnh</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Khu vực</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Trạng thái</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Phê duyệt</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thao tác</TableCell>
                          </>
                        )}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tab === 'camera' ? (
                        cameras.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} align="center">
                              <Typography color="text.secondary" sx={{ py: 4 }}>
                                Không có camera nào
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ) : (
                          cameras.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((item, index) => (
                            <TableRow key={item.id || index} hover>
                              <TableCell>{((currentPage - 1) * itemsPerPage) + index + 1}</TableCell>
                              <TableCell>{item.name}</TableCell>
                              <TableCell>{item.camera_key || item.camera_id || item.id}</TableCell>
                              <TableCell>{item.location_name || item.location || ''}</TableCell>
                              <TableCell>
                                {getStatusChip(item.connection_status || item.status)}
                              </TableCell>
                              <TableCell>
                                <Button 
                                  variant="outlined" 
                                  size="small" 
                                  startIcon={<Visibility />} 
                                  sx={{ borderRadius: 2, textTransform: 'none' }}
                                >
                                  Xem chi tiết
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )
                      ) : (
                        results?.map((item, index) => {
                          const avatarStyle = getAvatarColor();
                          console.log('Rendering item:', item, 'at index:', index);
                          return (
                            <Fade in key={item.id || index} timeout={200 + index * 50}>
                              <TableRow 
                                hover 
                                sx={{ 
                                  '&:hover': { 
                                    backgroundColor: alpha(theme.palette.primary.main, 0.04),
                                    cursor: 'pointer'
                                  },
                                  transition: 'all 0.2s ease'
                                }}
                                onClick={() => handleOpenDetail(item)}
                              >
                                {/* STT Cell */}
                                <TableCell /* STT Cell */ sx={{ /* remove color and fontWeight, use default */ }}>
                                  {((currentPage - 1) * itemsPerPage) + index + 1}
                                </TableCell>

                                {/* Dynamic table rows based on tab */}
                                {tab === 'camera' ? (
                                  cameras.length === 0 ? (
                                    <TableRow>
                                      <TableCell colSpan={6} align="center">
                                        <Typography color="text.secondary" sx={{ py: 4 }}>
                                          Không có camera nào
                                        </Typography>
                                      </TableCell>
                                    </TableRow>
                                  ) : (
                                    cameras.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((item, index) => (
                                      <TableRow key={item.id || index} hover>
                                        <TableCell>{((currentPage - 1) * itemsPerPage) + index + 1}</TableCell>
                                        <TableCell>{item.name}</TableCell>
                                        <TableCell>{item.camera_key || item.camera_id || item.id}</TableCell>
                                        <TableCell>{item.location_name || item.location || ''}</TableCell>
                                        <TableCell>
                                          {getStatusChip(item.connection_status || item.status)}
                                        </TableCell>
                                        <TableCell>
                                          <Button 
                                            variant="outlined" 
                                            size="small" 
                                            startIcon={<Visibility />} 
                                            sx={{ borderRadius: 2, textTransform: 'none' }}
                                          >
                                            Xem chi tiết
                                          </Button>
                                        </TableCell>
                                      </TableRow>
                                    ))
                                  )
                                ) : tab === 'location' ? (
                                  <>
                                    <TableCell>
                                      <Box display="flex" alignItems="center" gap={2}>
                                        <Avatar sx={{ bgcolor: 'secondary.light', width: 40, height: 40 }}>
                                          <LocationOn />
                                        </Avatar>
                                        <Typography variant="body2" fontWeight={600}>
                                          {item.name}
                                        </Typography>
                                      </Box>
                                    </TableCell>
                                    <TableCell>
                                      <Chip 
                                        label={item.code} 
                                        variant="outlined" 
                                        size="small"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Chip 
                                        label={item.zone_type} 
                                        color="info" 
                                        size="small"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      {getStatusChip(item.is_active ? 'active' : 'inactive')}
                                    </TableCell>
                                    <TableCell>
                                      <Button 
                                        variant="outlined" 
                                        size="small" 
                                        startIcon={<Visibility />}
                                        sx={{ borderRadius: 2, textTransform: 'none' }}
                                      >
                                        Xem chi tiết
                                      </Button>
                                    </TableCell>
                                  </>
                                ) : tab === 'journey' ? (
                                  <>
                                    <TableCell>
                                      <Typography variant="body1" fontWeight={600} color="primary.main">
                                        {item.plate_number}
                                      </Typography>
                                    </TableCell>
                                    <TableCell>
                                      <Typography variant="body2">
                                        {formatDate(item.journey_date || item.date)}
                                      </Typography>
                                    </TableCell>
                                    <TableCell>
                                      <Typography variant="body2">
                                        {item.route || item.journey_route || 'N/A'}
                                      </Typography>
                                    </TableCell>
                                    <TableCell>
                                      {getSeverityChip(item.vehicle_type || 'unknown')}
                                    </TableCell>
                                    <TableCell>
                                      <Button 
                                        variant="outlined" 
                                        size="small" 
                                        startIcon={<Visibility />}
                                        sx={{ borderRadius: 2, textTransform: 'none' }}
                                      >
                                        Xem chi tiết
                                      </Button>
                                    </TableCell>
                                  </>
                                ) : tab === 'plate' ? (
                                  <>
                                    <TableCell>
                                      <Typography variant="body1" fontWeight={600} color="primary.main">
                                        {item.plate_number}
                                      </Typography>
                                    </TableCell>
                                    <TableCell>
                                      <Avatar
                                        variant="rounded"
                                        src={item.detected_plate_image || item.plate_image}
                                        sx={{ 
                                          width: 80, 
                                          height: 48,
                                          ...avatarStyle
                                        }}
                                        imgProps={{ style: { objectFit: 'cover', width: '100%', height: '100%' } }}
                                      >
                                        <DirectionsCar sx={{ color: avatarStyle.iconColor }} />
                                      </Avatar>
                                    </TableCell>
                                    <TableCell>
                                      <Box display="flex" alignItems="center" gap={1}>
                                        <CameraAlt sx={{ fontSize: 16, color: 'warning.main' }} />
                                        <Typography variant="body2">
                                          {item.camera_name || 'N/A'}
                                        </Typography>
                                      </Box>
                                    </TableCell>
                                    <TableCell>
                                      <Box display="flex" alignItems="center" gap={1}>
                                        <LocationOn sx={{ fontSize: 16, color: 'primary.main' }} />
                                        <Typography variant="body2">
                                          {item.location_name || 'N/A'}
                                        </Typography>
                                      </Box>
                                    </TableCell>
                                    <TableCell>
                                      <Typography variant="body2" color="text.secondary">
                                        {formatDate(item.detected_at || item.timestamp) || 'N/A'}
                                      </Typography>
                                    </TableCell>
                                    <TableCell>
                                      <Button 
                                        variant="outlined" 
                                        size="small" 
                                        startIcon={<Visibility />}
                                        sx={{ borderRadius: 2, textTransform: 'none' }}
                                      >
                                        Xem chi tiết
                                      </Button>
                                    </TableCell>
                                  </>
                                ) : tab === 'access' ? (
                                  <>
                                    <TableCell>
                                      <Typography variant="body1" fontWeight={600} color="primary.main">
                                        {item.plate_number}
                                      </Typography>
                                    </TableCell>
                                    <TableCell>
                                      <Chip label='Đã phê duyệt' size='small' sx={{ fontWeight: 700, fontSize: '0.8rem', px: 1.5, bgcolor: '#e8f5e9', color: '#2e7d32', border: '1px solid #81c784' }} />
                                    </TableCell>
                                    <TableCell>
                                      <Box display="flex" alignItems="center" gap={1}>
                                        <LocationOn sx={{ fontSize: 16, color: 'primary.main' }} />
                                        <Typography variant="body2">
                                          {item.location_name || 'N/A'}
                                        </Typography>
                                      </Box>
                                    </TableCell>
                                    <TableCell>
                                      <Box display="flex" alignItems="center" gap={1}>
                                        <Person sx={{ fontSize: 16, color: 'secondary.main' }} />
                                        <Typography variant="body2">
                                          {item.added_by || item.created_by || 'N/A'}
                                        </Typography>
                                      </Box>
                                    </TableCell>
                                    <TableCell>
                                      {getStatusChip(item.is_active ? 'active' : 'inactive')}
                                    </TableCell>
                                    <TableCell>
                                      <Button 
                                        variant="outlined" 
                                        size="small" 
                                        startIcon={<Visibility />}
                                        sx={{ borderRadius: 2, textTransform: 'none' }}
                                      >
                                        Xem chi tiết
                                      </Button>
                                    </TableCell>
                                  </>
                                ) : tab === 'whitelist' || tab === 'blacklist' ? (
                                  <>
                                    <TableCell sx={{ color: 'black', fontSize: 14, fontWeight: 600 }}>
                                      {item.plate_number}
                                    </TableCell>
                                    <TableCell>
                                      <Avatar
                                        variant="rounded"
                                        src={item.detected_plate_image || item.plate_image}
                                        sx={{ 
                                          width: 80, 
                                          height: 48,
                                          ...avatarStyle
                                        }}
                                        imgProps={{ style: { objectFit: 'cover', width: '100%', height: '100%' } }}
                                      >
                                        <DirectionsCar sx={{ color: avatarStyle.iconColor }} />
                                      </Avatar>
                                    </TableCell>
                                    <TableCell>
                                      {getStatusChip(item.current_status)}
                                    </TableCell>
                                    {tab === 'whitelist' && (
                                      <TableCell>
                                        {getApprovalChip(item.approval_status)}
                                      </TableCell>
                                    )}
                                    {tab === 'blacklist' && (
                                      <TableCell>
                                        {getViolationTypeChip(item.violation_type)}
                                      </TableCell>
                                    )}
                                    <TableCell>
                                      <Button 
                                        variant="outlined" 
                                        size="small" 
                                        startIcon={<Visibility />}
                                        sx={{ borderRadius: 2, textTransform: 'none' }}
                                      >
                                        Xem chi tiết
                                      </Button>
                                    </TableCell>
                                  </>
                                ) : (
                                  // Default table row for other tabs
                                  <>
                                    <TableCell sx={{ color: 'black', fontSize: 14 }}>
                                      {item.plate_number}
                                    </TableCell>
                                    <TableCell>
                                      <Avatar
                                        variant="rounded"
                                        src={item.detected_plate_image || item.plate_image}
                                        sx={{ 
                                          width: 80, 
                                          height: 48,
                                          ...avatarStyle
                                        }}
                                        imgProps={{ style: { objectFit: 'cover', width: '100%', height: '100%' } }}
                                      >
                                        <DirectionsCar sx={{ color: avatarStyle.iconColor }} />
                                      </Avatar>
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
                                      {getStatusChip(item.current_status)}
                                    </TableCell>
                                    <TableCell>
                                      {getApprovalChip(item.approval_status)}
                                    </TableCell>
                                    <TableCell>
                                      <Button 
                                        variant="outlined" 
                                        size="small" 
                                        startIcon={<Visibility />}
                                        sx={{ borderRadius: 2, textTransform: 'none' }}
                                      >
                                        Xem chi tiết
                                      </Button>
                                    </TableCell>
                                  </>
                                )}
                              </TableRow>
                            </Fade>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>

               <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'stretch', md: 'center' }, justifyContent: 'space-between', gap: 2, p: 2, borderTop: '1px solid #e0e0e0', backgroundColor: '#fafafa' }}>
  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
    {totalItems === 0
      ? 'Hiển thị 0/0 bản ghi'
      : `Hiển thị ${((currentPage - 1) * itemsPerPage) + 1} - ${Math.min(currentPage * itemsPerPage, totalItems)} của ${totalItems} bản ghi`}
  </Typography>
  <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: 'center', gap: 2 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography variant="body2" color="text.secondary">Hiển thị:</Typography>
      <Select 
        value={itemsPerPage} 
        onChange={handleItemsPerPageChange} 
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
      <Button size="small" variant="outlined" onClick={() => setCurrentPage(1)} disabled={currentPage === 1} sx={{ minWidth: 32, width: 32, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}><FirstPage fontSize="small" /></Button>
      <Button size="small" variant="outlined" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} sx={{ minWidth: 32, width: 32, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}><ChevronLeft fontSize="small" /></Button>
      {getPaginationItems(currentPage, totalPages).map((item, idx) => (
        item === '...'
          ? <Box key={`dots-${idx}`} sx={{ px: 1, color: '#999' }}>...</Box>
          : <Button key={item} variant={item === currentPage ? 'contained' : 'outlined'} size="small" onClick={() => setCurrentPage(item)} sx={{ minWidth: 32, width: 32, height: 32, borderRadius: 1, fontSize: '0.875rem', fontWeight: item === currentPage ? 600 : 400, ...(item === currentPage ? { backgroundColor: '#1976d2', color: 'white', border: 'none', '&:hover': { backgroundColor: '#1565c0' } } : { borderColor: '#e0e0e0', color: '#666', '&:hover': { backgroundColor: '#f5f5f5', borderColor: '#1976d2' } }) }}>{item}</Button>
      ))}
      <Button size="small" variant="outlined" onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} sx={{ minWidth: 32, width: 32, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}><ChevronRight fontSize="small" /></Button>
      <Button size="small" variant="outlined" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} sx={{ minWidth: 32, width: 32, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}><LastPage fontSize="small" /></Button>
    </Box>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography variant="body2" color="text.secondary">Đến trang:</Typography>
      <InputBase value={gotoPage} onChange={e => setGotoPage(e.target.value.replace(/[^0-9]/g, ''))} onKeyDown={e => { if (e.key === 'Enter') { const page = parseInt(gotoPage, 10); if (page && page >= 1 && page <= totalPages) { setCurrentPage(page); setGotoPage(''); } } }} placeholder="1" sx={{ width: 60, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, px: 1, fontSize: '0.875rem', '& input': { textAlign: 'center' } }} />
      <Button size="small" variant="outlined" onClick={() => { const page = parseInt(gotoPage, 10); if (page && page >= 1 && page <= totalPages) { setCurrentPage(page); setGotoPage(''); } }} disabled={!gotoPage || parseInt(gotoPage, 10) < 1 || parseInt(gotoPage, 10) > totalPages} sx={{ minWidth: 'auto', px: 2, height: 32, textTransform: 'none', fontSize: '0.875rem' }}>Đi</Button>
    </Box>
  </Box>
</Box>
              </>
            )}
          </CardContent>
        </Card>
      </Box>

      {/* Enhanced Detail Modal */}
      <Dialog 
        open={openDetail} 
        onClose={handleCloseDetail} 
        maxWidth="lg" 
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
            boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
            overflow: 'hidden'
          }
        }}
      >
        <DialogTitle 
          sx={{ 
            background: '#1976d2', 
            color: 'white', 
            display: 'flex', 
            alignItems: 'center', 
            gap: 2,
            py: 3,
            px: 3
          }}
        >
          <Avatar sx={{ 
            bgcolor: 'rgba(255,255,255,0.2)', 
            width: 40, 
            height: 40
          }}>
            <Info sx={{ fontSize: 20 }} />
          </Avatar>
          <Box flex={1}>
            <Typography variant="h5" fontWeight={600}>
              Thông tin chi tiết
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              {selectedItem?.plate_number || 'Xem thông tin đầy đủ'}
            </Typography>
          </Box>
          <IconButton 
            onClick={handleCloseDetail} 
            sx={{ 
              color: 'white',
              '&:hover': {
                bgcolor: 'rgba(255,255,255,0.1)'
              }
            }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        
        <DialogContent dividers sx={{ p: 0 }}>
          {selectedItem && (
            <Box>
              {/* Header Section */}
              <Box sx={{ 
                p: 3, 
                background: '#f5f5f5',
                borderBottom: '1px solid #e0e0e0'
              }}>
                <Grid container spacing={3}>
                  <Grid item xs={12} md={4}>
                    <Box display="flex" flexDirection="column" alignItems="center">
                      <Avatar 
                        variant="rounded" 
                        src={selectedItem.detected_plate_image || selectedItem.plate_image || ''} 
                        sx={{ 
                          width: 180, 
                          height: 110, 
                          bgcolor: '#e3f2fd',
                          border: '2px solid #1976d2',
                          mb: 2
                        }}
                      >
                        <DirectionsCar sx={{ fontSize: 50, color: '#1976d2' }} />
                      </Avatar>
                      
                      <Typography variant="h4" fontWeight={600} color="primary.main" mb={2}>
                        {selectedItem.plate_number}
                      </Typography>
                      
                      <Stack direction="row" spacing={1} mb={2} flexWrap="wrap" justifyContent="center">
                        {selectedItem.status === 'whitelist' && (
                          <Chip 
                            label="Whitelist" 
                            color="success"
                            sx={{ fontWeight: 600 }} 
                          />
                        )}
                        {selectedItem.status === 'blacklist' && (
                          <Chip 
                            label="Blacklist" 
                            color="error"
                            sx={{ fontWeight: 600 }} 
                          />
                        )}
                        {selectedItem.current_status && (
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
                            sx={{ fontWeight: 600 }}
                          />
                        )}
                        {selectedItem.approval_status && (
                          <Chip 
                            label={
                              selectedItem.approval_status === 'approved' ? 'Đã duyệt' : 
                              selectedItem.approval_status === 'pending' ? 'Chờ duyệt' : 'Từ chối'
                            }
                            color={
                              selectedItem.approval_status === 'approved' ? 'success' : 
                              selectedItem.approval_status === 'pending' ? 'warning' : 'error'
                            }
                            sx={{ fontWeight: 600 }}
                          />
                        )}
                      </Stack>
                    </Box>
                  </Grid>
                  
                  <Grid item xs={12} md={8}>
                    <Grid container spacing={3}>
                      {/* Vehicle Information */}
                      {/* Vehicle Information */}
                      <Grid item xs={12}>
                        <Paper sx={{ 
                          p: 2, 
                          borderRadius: 2, 
                          bgcolor: 'background.paper', 
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                        }}>
                          <Typography variant="h6" fontWeight={600} mb={2} color="primary.main" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <DirectionsCar sx={{ fontSize: 20, color: 'primary.main' }} />
                            Thông tin phương tiện
                          </Typography>
                          <Grid container spacing={3}>
                            <Grid item xs={12} md={6}>
                              <Box>
                                <Typography variant="body2" color="text.secondary" mb={1}>
                                  Biển số xe
                                </Typography>
                                <Typography variant="h6" fontWeight={600} color="primary.main">
                                  {selectedItem.plate_number}
                                </Typography>
                              </Box>
                            </Grid>
                            <Grid item xs={12} md={6}>
                              <Box>
                                <Typography variant="body2" color="text.secondary" mb={1}>
                                  Trạng thái
                                </Typography>
                                <Box display="flex" alignItems="center" gap={1}>
                                  {selectedItem.current_status && (
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
                                    />
                                  )}
                                </Box>
                              </Box>
                            </Grid>
                          </Grid>
                        </Paper>
                      </Grid>

                      {/* Owner Information */}
                      {(selectedItem.owner_name || selectedItem.owner_phone || selectedItem.contact_email) && (
                        <Grid item xs={12}>
                                                  <Paper sx={{ 
                          p: 2, 
                          borderRadius: 2, 
                          bgcolor: 'background.paper', 
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                        }}>
                          <Typography variant="h6" fontWeight={600} mb={2} color="secondary.main" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Person sx={{ fontSize: 20, color: 'secondary.main' }} />
                            Thông tin chủ xe
                          </Typography>
                            <Grid container spacing={3}>
                                                              <Grid item xs={12} md={4}>
                                  <Box>
                                    <Typography variant="body2" color="text.secondary" mb={1}>
                                      Họ tên
                                    </Typography>
                                    <Typography variant="body1" fontWeight={500}>
                                      {selectedItem.owner_name || 'Chưa có thông tin'}
                                    </Typography>
                                  </Box>
                                </Grid>
                                <Grid item xs={12} md={4}>
                                  <Box>
                                    <Typography variant="body2" color="text.secondary" mb={1}>
                                      Số điện thoại
                                    </Typography>
                                    <Typography variant="body1" fontWeight={500}>
                                      {selectedItem.owner_phone || 'N/A'}
                                    </Typography>
                                  </Box>
                                </Grid>
                                <Grid item xs={12} md={4}>
                                  <Box>
                                    <Typography variant="body2" color="text.secondary" mb={1}>
                                      Email
                                    </Typography>
                                    <Typography variant="body1" fontWeight={500}>
                                      {selectedItem.contact_email || 'N/A'}
                                    </Typography>
                                  </Box>
                                </Grid>
                            </Grid>
                          </Paper>
                        </Grid>
                      )}

                      {/* Additional Information */}
                      <Grid item xs={12}>
                        <Paper sx={{ 
                          p: 2, 
                          borderRadius: 2, 
                          bgcolor: 'background.paper', 
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                        }}>
                          <Typography variant="h6" fontWeight={600} mb={2} color="info.main" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Info sx={{ fontSize: 20, color: 'info.main' }} />
                            Thông tin bổ sung
                          </Typography>
                          <Grid container spacing={3}>
                            {selectedItem.violation_type && (
                              <Grid item xs={12} md={6}>
                                <Box>
                                  <Typography variant="body2" color="text.secondary" mb={1}>
                                    Loại vi phạm
                                  </Typography>
                                  <Box>
                                    {getViolationTypeChip(selectedItem.violation_type)}
                                  </Box>
                                </Box>
                              </Grid>
                            )}
                            <Grid item xs={12} md={6}>
                              <Box>
                                <Typography variant="body2" color="text.secondary" mb={1}>
                                  Lịch sử phát hiện
                                </Typography>
                                <Typography variant="body1" fontWeight={500}>
                                  {selectedItem.history_count || 0} lần
                                </Typography>
                              </Box>
                            </Grid>
                            {selectedItem.valid_from && (
                              <Grid item xs={12} md={6}>
                                <Box>
                                  <Typography variant="body2" color="text.secondary" mb={1}>
                                    Thời gian hiệu lực
                                  </Typography>
                                  <Typography variant="body1" fontWeight={500}>
                                    {formatDate(selectedItem.valid_from)} - {selectedItem.valid_to ? formatDate(selectedItem.valid_to) : 'Vĩnh viễn'}
                                  </Typography>
                                </Box>
                              </Grid>
                            )}
                            {selectedItem.created_at && (
                              <Grid item xs={12} md={6}>
                                <Box>
                                  <Typography variant="body2" color="text.secondary" mb={1}>
                                    Ngày tạo
                                  </Typography>
                                  <Typography variant="body1" fontWeight={500}>
                                    {formatDate(selectedItem.created_at)}
                                  </Typography>
                                </Box>
                              </Grid>
                            )}
                            {selectedItem.description && (
                              <Grid item xs={12}>
                                <Box>
                                  <Typography variant="body2" color="text.secondary" mb={1}>
                                    Mô tả chi tiết
                                  </Typography>
                                  <Typography variant="body1" sx={{ lineHeight: 1.6 }}>
                                    {selectedItem.description}
                                  </Typography>
                                </Box>
                              </Grid>
                            )}
                          </Grid>
                        </Paper>
                      </Grid>
                    </Grid>
                  </Grid>
                </Grid>
              </Box>
            </Box>
          )}
        </DialogContent>
        
        <DialogActions sx={{ 
          p: 2, 
          gap: 2, 
          background: '#fafafa',
          borderTop: '1px solid #e0e0e0'
        }}>
          <Button 
            onClick={handleCloseDetail} 
            variant="outlined" 
            startIcon={<CloseIcon />} 
            sx={{ 
              borderRadius: 2,
              px: 3,
              py: 1,
              textTransform: 'none',
              fontWeight: 500
            }}
          >
            Đóng
          </Button>
          <Button 
            variant="contained" 
            startIcon={<Info />}
            sx={{ 
              borderRadius: 2,
              px: 3,
              py: 1,
              textTransform: 'none',
              fontWeight: 500
            }}
          >
            Xem lịch sử
          </Button>
        </DialogActions>
      </Dialog>

      {/* Enhanced Snackbar */}
      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={4000} 
        onClose={() => setSnackbar({ ...snackbar, open: false })} 
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setSnackbar({ ...snackbar, open: false })} 
          severity={snackbar.severity} 
          sx={{ 
            width: '100%',
            borderRadius: 2,
            fontWeight: 600,
            '& .MuiAlert-icon': {
              fontSize: 24
            }
          }}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default SearchPage;