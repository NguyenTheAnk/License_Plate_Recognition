// User detail page for viewing user info, roles, and permissions
import React, { useState, useEffect, useContext, useRef } from 'react';
import {
  Grid, Typography, Box, Card, Divider, Avatar, Chip,
  Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Breadcrumbs, Alert, CircularProgress, Tabs, Tab, Checkbox, TablePagination,
  FormControl, Select, MenuItem, InputBase
} from '@mui/material';
import { 
FaUserTag, FaEnvelope, FaPhone, FaArrowLeft, FaHistory, 
  FaChartLine
} from 'react-icons/fa';
import { 
  Home as HomeIcon, 
  ExpandMore as ExpandMoreIcon,
  AccessTime as AccessTimeIcon,
  Security as SecurityIcon,
  Assignment as AssignmentIcon,
  FirstPage, 
  LastPage, 
  ChevronLeft, 
  ChevronRight,
  MoreHoriz 
} from '@mui/icons-material';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

// Import API functions from utils
import { 
  fetchDataFromAPI, 
  handleErrorResponse 
} from '../../utils/auth';

// Context - in real app, this would be imported from a separate context file
const MyContext = React.createContext({
  setProgress: () => {},
  setAlertBox: () => {},
});

// Helper to format date/time
const formatDateTime = (dateTime) => {
  if (!dateTime) return 'Chưa có';
  return new Date(dateTime).toLocaleString('vi-VN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
};

const getStatusColor = (status) => {
  switch (status) {
    case 'active': return 'success';
    case 'inactive': return 'default';
    case 'suspended': return 'error';
    default: return 'default';
  }
};

const getStatusText = (status) => {
  switch (status) {
    case 'active': return 'Hoạt động';
    case 'inactive': return 'Không hoạt động';
    case 'suspended': return 'Tạm khóa';
    default: return status;
  }
};

const getModuleDisplayName = (module) => {
  const moduleNames = {
    'users': 'Người dùng',
    'roles': 'Vai trò',
    'permissions': 'Quyền hạn',
    'detections': 'Phát hiện',
    'vehicles': 'Phương tiện',
    'access_control': 'Kiểm soát truy cập',
    'journeys': 'Lộ trình',
    'cameras': 'Camera',
    'locations': 'Vị trí',
    'alerts': 'Cảnh báo',
    'reports': 'Báo cáo',
    'settings': 'Cài đặt',
    'logs': 'Nhật ký',
    'watermarks': 'Watermark'
  };
  return moduleNames[module] || module.toUpperCase();
};

// Styled Breadcrumb component
const StyledBreadcrumb = ({ component, href, label, icon, onClick, ...props }) => (
  <Chip
    component={component || 'div'}
    href={href}
    label={label}
    icon={icon}
    onClick={onClick}
    sx={{
      backgroundColor: 'grey.100',
      height: 24,
      color: 'text.primary',
      fontWeight: 'fontWeightRegular',
      '&:hover, &:focus': {
        backgroundColor: 'grey.200',
      },
      '&:active': {
        boxShadow: 1,
        backgroundColor: 'grey.300',
      },
      cursor: 'pointer'
    }}
    {...props}
  />
);

// Tab Panel Component
function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`user-detail-tabpanel-${index}`}
      aria-labelledby={`user-detail-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function getPaginationItems(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  
  const items = [];
  items.push(1);
  
  if (current > 4) {
    items.push('...');
  }
  
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  
  for (let i = start; i <= end; i++) {
    if (!items.includes(i)) {
      items.push(i);
    }
  }
  
  if (current < total - 3) {
    items.push('...');
  }
  
  if (total > 1) {
    items.push(total);
  }
  
  return items;
}

const UserDetail = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const context = useContext(MyContext);
  
  // States
  const [user, setUser] = useState(null);
  const [userDetail, setUserDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);
  const [permissionsByModule, setPermissionsByModule] = useState({});
  const [actionLabels, setActionLabels] = useState({});
  const [loginHistory, setLoginHistory] = useState([]);
  const [loginPagination, setLoginPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [accessLogs, setAccessLogs] = useState([]);
  const [accessPagination, setAccessPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  // State cho input go to page
  const [loginGoto, setLoginGoto] = useState('');
  const [accessGoto, setAccessGoto] = useState('');

  // Get user data from location state or fetch from API
  const userFromState = location.state?.user;
  const userId = userFromState?.id || params?.id;

  const firstLoadRef = useRef(true);

  useEffect(() => {
    if (userId) {
      fetchUserDetailData(userId);
    } else {
      // Redirect if no user ID
      navigate('/user');
    }
  }, [userId, navigate]);

  // useEffect gọi lại API khi phân trang thay đổi, nhưng tránh lặp vô hạn khi set lại state từ response
  useEffect(() => {
    if (userId) {
      if (firstLoadRef.current) {
        fetchUserDetailData(userId, loginPagination.page, loginPagination.limit, accessPagination.page, accessPagination.limit);
        firstLoadRef.current = false;
      }
    }
    // eslint-disable-next-line
  }, [userId]);

  // Chỉ gọi lại khi người dùng thực sự đổi trang hoặc đổi số dòng/trang
  const prevLogin = useRef({ page: 1, limit: 10 });
  const prevAccess = useRef({ page: 1, limit: 10 });
  useEffect(() => {
    if (!firstLoadRef.current && userId) {
      if (
        loginPagination.page !== prevLogin.current.page ||
        loginPagination.limit !== prevLogin.current.limit ||
        accessPagination.page !== prevAccess.current.page ||
        accessPagination.limit !== prevAccess.current.limit
      ) {
        fetchUserDetailData(userId, loginPagination.page, loginPagination.limit, accessPagination.page, accessPagination.limit);
        prevLogin.current = { page: loginPagination.page, limit: loginPagination.limit };
        prevAccess.current = { page: accessPagination.page, limit: accessPagination.limit };
      }
    }
    // eslint-disable-next-line
  }, [loginPagination.page, loginPagination.limit, accessPagination.page, accessPagination.limit]);

  // Đặt mặc định accessPagination.limit = 10 khi mount hoặc khi chuyển tab sang nhật ký truy cập
  useEffect(() => {
    if (tabValue === 3 && accessPagination.limit !== 10) {
      setAccessPagination(prev => ({ ...prev, limit: 10, page: 1 }));
    }
    // eslint-disable-next-line
  }, [tabValue]);

  // Sửa fetchUserDetailData để nhận các tham số phân trang
  const fetchUserDetailData = async (id, loginPage = 1, loginLimit = 10, accessPage = 1, accessLimit = 15) => {
    setLoading(true);
    context.setProgress?.(20);
    
    try {
      const token = localStorage.getItem('token');
      
      // FIXED: Use correct API endpoint that matches the backend route
      const response = await fetchDataFromAPI(`/api/user/${id}/detailed?loginPage=${loginPage}&loginLimit=${loginLimit}&accessPage=${accessPage}&accessLimit=${accessLimit}`, token);
      
      console.log('API Response:', response); // Debug log
      
      if (response.success && response.data) {
        setUserDetail(response.data);
        setUser(response.data.user);
        
        // Group permissions by module
        const permissionsGrouped = {};
        if (response.data.user.permissions) {
          response.data.user.permissions.forEach(permission => {
            if (!permissionsGrouped[permission.module]) {
              permissionsGrouped[permission.module] = [];
            }
            permissionsGrouped[permission.module].push(permission);
          });
        }
        setPermissionsByModule(permissionsGrouped);
        
        // Build action label mapping from user.roles/modules
        const labelMap = {};
        if (response.data.user.roles) {
        response.data.user.roles.forEach(role => {
          const modules = role.modules || {};
          Object.values(modules).forEach(actionsArr => {
              if (Array.isArray(actionsArr)) {
            actionsArr.forEach(action => {
              if (!labelMap[action]) {
                // Capitalize first letter, replace camelCase with spaces
                labelMap[action] = action.charAt(0).toUpperCase() + action.slice(1).replace(/([A-Z])/g, ' $1');
              }
            });
              }
          });
        });
        }
        setActionLabels(labelMap);
        
        setLoginHistory(response.data.loginHistory || []);
        setLoginPagination(response.data.loginPagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
        setAccessLogs(response.data.accessLogs || []);
        setAccessPagination(response.data.accessPagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
        
        context.setProgress?.(100);
      } else {
        console.error('API Error:', response);
        context.setAlertBox?.({
          open: true,
          error: true,
          msg: response.message || 'Lỗi khi tải thông tin chi tiết người dùng!'
        });
        navigate('/user');
      }
    } catch (error) {
      console.error('Error fetching user detail:', error);
      context.setAlertBox?.({
        open: true,
        error: true,
        msg: handleErrorResponse(error)
      });
      navigate('/user');
    } finally {
      setLoading(false);
    }
  };

  const handleGoBack = () => {
    navigate('/user');
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const actionViMap = {
    'create': 'Tạo mới',
    'update': 'Cập nhật',
    'delete': 'Xóa',
    'view': 'Xem',
    'search': 'Tìm kiếm',
    'filter': 'Lọc',
    'review': 'Duyệt',
    'uploadImg': 'Upload ảnh',
    'deleteImg': 'Xóa ảnh',
    'export': 'Xuất'
  };
  
  const getActionText = (action) => {
    if (actionViMap[action]) return actionViMap[action];
    return actionLabels[action] || (action.charAt(0).toUpperCase() + action.slice(1).replace(/([A-Z])/g, ' $1'));
  };

  // Hàm chuyển trang và đổi số dòng/trang cho login logs
  const handleLoginPageChange = (event, newPage) => {
    setLoginPagination(prev => ({ ...prev, page: newPage + 1 }));
  };
  const handleLoginRowsPerPageChange = (event) => {
    setLoginPagination(prev => ({ ...prev, page: 1, limit: parseInt(event.target.value, 10) }));
  };
  // Hàm chuyển trang và đổi số dòng/trang cho access logs
  const handleAccessPageChange = (event, newPage) => {
    setAccessPagination(prev => ({ ...prev, page: newPage + 1 }));
  };
  const handleAccessRowsPerPageChange = (event) => {
    setAccessPagination(prev => ({ ...prev, page: 1, limit: parseInt(event.target.value, 10) }));
  };

  if (loading) {
    return (
      <Box sx={{ 
        minHeight: '100vh',
        backgroundColor: '#f5f5f5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
          <CircularProgress size={40} />
          <Typography variant="body2" color="text.secondary">
            Đang tải thông tin chi tiết...
          </Typography>
        </Box>
      </Box>
    );
  }

  if (!user || !userDetail) {
    return (
      <Box sx={{ 
        minHeight: '100vh',
        backgroundColor: '#f5f5f5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <Typography variant="h6" color="text.secondary">
          Không tìm thấy thông tin người dùng
        </Typography>
      </Box>
    );
  }

  const { activityStats } = userDetail;

  // Gộp quyền từ tất cả roles
  const mergedModules = {};
  (user.roles || []).forEach(role => {
    const modules = role.modules || {};
    Object.entries(modules).forEach(([module, actions]) => {
      if (!mergedModules[module]) mergedModules[module] = new Set();
      if (Array.isArray(actions)) {
      actions.forEach(action => mergedModules[module].add(action));
      }
    });
  });
  const moduleNames = Object.keys(mergedModules);
  const allActions = Array.from(new Set(Object.values(mergedModules).flatMap(set => Array.from(set))));

  return (
    <Box sx={{ 
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      py: 3
    }}>
      {/* Header */}
      <Box sx={{ px: 3, mb: 3 }}>
        <Card sx={{ 
          background: 'white',
          borderRadius: 3,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          border: '1px solid #e0e0e0'
        }}>
          <Box sx={{ p: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
              <Box>
                <Typography variant="h4" component="h1" sx={{ 
                  fontWeight: 700,
                  color: '#1976d2',
                  mb: 1
                }}>
                  Chi tiết người dùng
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  Thông tin chi tiết về người dùng {user.name}
                </Typography>
              </Box>
              
              <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
                <Breadcrumbs sx={{ 
                  '& .MuiBreadcrumbs-ol': { 
                    flexWrap: 'nowrap',
                    overflow: 'hidden'
                  }
                }}>
                  <StyledBreadcrumb
                    label="Trang chủ"
                    icon={<HomeIcon fontSize="small" />}
                    onClick={() => navigate('/')}
                  />
                  <StyledBreadcrumb
                    label="Quản lý người dùng"
                    icon={<ExpandMoreIcon fontSize="small" />}
                    onClick={() => navigate('/user')}
                  />
                  <StyledBreadcrumb
                    label="Chi tiết"
                    icon={<ExpandMoreIcon fontSize="small" />}
                  />
                </Breadcrumbs>
                
                <Button
                  variant="outlined"
                  startIcon={<FaArrowLeft />}
                  onClick={handleGoBack}
                  sx={{ 
                    borderRadius: 2,
                    px: 3,
                    py: 1.5,
                    textTransform: 'none',
                    fontWeight: 600,
                    borderColor: '#1976d2',
                    color: '#1976d2',
                    '&:hover': {
                      borderColor: '#1565c0',
                      backgroundColor: 'rgba(25, 118, 210, 0.04)',
                    },
                  }}
                >
                  Quay lại
                </Button>
              </Box>
            </Box>
          </Box>
        </Card>
      </Box>

      {/* Content */}
      <Box sx={{ px: 3 }}>
        <Grid container spacing={4}>
          {/* Left: Avatar + Basic Info */}
          <Grid item xs={12} md={4}>
            <Card elevation={0} sx={{ 
              p: 4, 
              textAlign: 'center', 
              border: '1px solid #eee', 
              borderRadius: 3, 
              mb: 4,
              background: 'white',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            }}>
              <Avatar sx={{ 
                width: 120, 
                height: 120, 
                mx: 'auto', 
                mb: 2.5, 
                bgcolor: '#1976d2',
                fontSize: 48,
                fontWeight: 600
              }}>
                {user.name.charAt(0).toUpperCase()}
              </Avatar>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#222', mb: 1.5 }}>
                {user.name}
              </Typography>
              <Chip 
                label={getStatusText(user.status)} 
                color={getStatusColor(user.status)} 
                size="medium" 
                sx={{ mb: 3, fontWeight: 600 }} 
              />
              <Divider sx={{ my: 3 }} />
              <Box textAlign="left">
                <Typography variant="body1" color="text.secondary" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                  <FaEnvelope style={{ marginRight: 12, fontSize: 16, color: '#1976d2' }} /> 
                  {user.email}
                </Typography>
                {user.phone && (
                  <Typography variant="body1" color="text.secondary" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                    <FaPhone style={{ marginRight: 12, fontSize: 16, color: '#1976d2' }} /> 
                    {user.phone}
                  </Typography>
                )}
              </Box>
            </Card>

            {/* Activity Stats */}
            <Card elevation={0} sx={{ 
              p: 3, 
              border: '1px solid #eee', 
              borderRadius: 3,
              background: 'white',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            }}>
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#1976d2', mb: 2, display: 'flex', alignItems: 'center' }}>
                <FaChartLine style={{ marginRight: 8 }} />
                Thống kê hoạt động
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Box textAlign="center" sx={{ p: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#4caf50' }}>
                      {activityStats?.total_views || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Lượt xem
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6}>
                  <Box textAlign="center" sx={{ p: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#2196f3' }}>
                      {activityStats?.total_creates || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Tạo mới
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6}>
                  <Box textAlign="center" sx={{ p: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#ff9800' }}>
                      {activityStats?.total_updates || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Cập nhật
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6}>
                  <Box textAlign="center" sx={{ p: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#f44336' }}>
                      {activityStats?.total_deletes || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Xóa
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
              <Divider sx={{ my: 2 }} />
              <Typography variant="body2" color="text.secondary" textAlign="center">
                <strong>Hoạt động 30 ngày:</strong> {activityStats?.activity_last_30_days || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mt: 1 }}>
                <strong>Lần cuối:</strong> {formatDateTime(activityStats?.last_activity)}
              </Typography>
            </Card>
          </Grid>

          {/* Right: Detailed Information with Tabs */}
          <Grid item xs={12} md={8}>
            <Card elevation={0} sx={{ 
              border: '1px solid #eee', 
              borderRadius: 3,
              background: 'white',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            }}>
              {/* Tabs */}
              <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs value={tabValue} onChange={handleTabChange} aria-label="user detail tabs">
                  <Tab 
                    label="Thông tin tài khoản" 
                    icon={<SecurityIcon />}
                    iconPosition="start"
                    sx={{ textTransform: 'none', fontWeight: 600 }}
                  />
                  <Tab 
                    label="Vai trò & Quyền" 
                    icon={<AssignmentIcon />}
                    iconPosition="start"
                    sx={{ textTransform: 'none', fontWeight: 600 }}
                  />
                  <Tab 
                    label="Lịch sử đăng nhập" 
                    icon={<AccessTimeIcon />}
                    iconPosition="start"
                    sx={{ textTransform: 'none', fontWeight: 600 }}
                  />
                  <Tab 
                    label="Nhật ký truy cập" 
                    icon={<FaHistory />}
                    iconPosition="start"
                    sx={{ textTransform: 'none', fontWeight: 600 }}
                  />
                </Tabs>
              </Box>

              {/* Tab 1: Account Information */}
              <TabPanel value={tabValue} index={0}>
                <Grid container spacing={3}>
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                        Trạng thái
                      </Typography>
                      <Box sx={{ mt: 1 }}>
                        <Chip label={getStatusText(user.status)} color={getStatusColor(user.status)} size="small" />
                      </Box>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                        Đăng nhập cuối
                      </Typography>
                      <Typography variant="body1" sx={{ mt: 1 }}>
                        {formatDateTime(user.last_login_at)}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                        Đổi mật khẩu cuối
                      </Typography>
                      <Typography variant="body1" sx={{ mt: 1 }}>
                        {formatDateTime(user.last_password_changed_at)}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                        Tạo tài khoản
                      </Typography>
                      <Typography variant="body1" sx={{ mt: 1 }}>
                        {formatDateTime(user.created_at)}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                        Cập nhật cuối
                      </Typography>
                      <Typography variant="body1" sx={{ mt: 1 }}>
                        {formatDateTime(user.updated_at)}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                        Lần đăng nhập thất bại
                      </Typography>
                      <Typography variant="body1" color={user.failed_login_attempts > 0 ? 'error' : 'inherit'} sx={{ mt: 1 }}>
                        {user.failed_login_attempts} lần
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                        Tài khoản bị khóa
                      </Typography>
                      <Box sx={{ mt: 1 }}>
                        <Chip label={user.is_account_locked ? 'Có' : 'Không'} color={user.is_account_locked ? 'error' : 'success'} size="small" />
                      </Box>
                    </Box>
                  </Grid>
                  {user.locked_until && (
                    <Grid item xs={12} sm={6}>
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                          Khóa đến
                        </Typography>
                        <Typography variant="body1" color="error" sx={{ mt: 1 }}>
                          {formatDateTime(user.locked_until)}
                        </Typography>
                      </Box>
                    </Grid>
                  )}
                </Grid>
              </TabPanel>

              {/* Tab 2: Roles & Permissions */}
              <TabPanel value={tabValue} index={1}>
                <Typography variant="h6" sx={{ fontWeight: 600, color: '#1976d2', mb: 2 }}>
                  Quyền hạn tổng hợp
                </Typography>
                {user.roles && user.roles.length > 0 ? (() => {
                  // Hiển thị thông tin các roles phía trên bảng quyền
                  const rolesSummary = (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 3 }}>
                      {user.roles.map(role => (
                        <Card key={role.id} sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1, borderRadius: 2, border: '1px solid #e0e0e0', boxShadow: 'none', minWidth: 220 }}>
                          <FaUserTag style={{ color: '#1976d2', fontSize: 20 }} />
                          <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#1976d2' }}>{role.name}</Typography>
                            {role.level && <Chip label={`Level ${role.level}`} size="small" color="secondary" sx={{ ml: 1 }} />}
                            {role.description && <Typography variant="body2" color="text.secondary">{role.description}</Typography>}
                            <Typography variant="caption" color="text.secondary">
                              Ngày gán: {formatDateTime(role.assigned_at)}
                              {role.assigned_by_name && <> • Người gán: {role.assigned_by_name}</>}
                            </Typography>
                          </Box>
                        </Card>
                      ))}
                    </Box>
                  );
                  
                  if (moduleNames.length === 0 || allActions.length === 0) {
                    return <>{rolesSummary}<Alert severity="info">Người dùng chưa có quyền hạn nào</Alert></>;
                  }
                  return (
                    <>
                      {rolesSummary}
                      <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ fontWeight: 600, background: '#f5f5f5' }}>Chức năng</TableCell>
                              {allActions.map(action => (
                                <TableCell key={action} align="center" sx={{ fontWeight: 600, background: '#f5f5f5' }}>{getActionText(action)}</TableCell>
                              ))}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {moduleNames.map(module => (
                              <TableRow key={module}>
                                <TableCell>{getModuleDisplayName(module)}</TableCell>
                                {allActions.map(action => (
                                  <TableCell key={action} align="center">
                                    <Checkbox
                                      checked={mergedModules[module]?.has(action)}
                                      readOnly
                                      sx={{ color: '#1976d2', pointerEvents: 'none' }}
                                    />
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </>
                  );
                })() : (
                  <Alert severity="info">Người dùng chưa được gán vai trò nào</Alert>
                )}
              </TabPanel>

              {/* Tab 3: Login History */}
              <TabPanel value={tabValue} index={2}>
                <Typography variant="h6" sx={{ fontWeight: 600, color: '#1976d2', mb: 2 }}>
                  Lịch sử đăng nhập gần đây
                </Typography>
                {loginHistory && loginHistory.length > 0 ? (
                  <>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ '& th': { fontWeight: 600, bgcolor: '#f5f5f5' } }}>
                          <TableCell>Thời gian</TableCell>
                          <TableCell>Trạng thái</TableCell>
                          <TableCell>IP Address</TableCell>
                          <TableCell>User Agent</TableCell>
                          <TableCell>Lý do thất bại</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                          {loginHistory.slice(0, loginPagination.limit).map((login, index) => (
                          <TableRow key={index}>
                            <TableCell>{formatDateTime(login.created_at)}</TableCell>
                            <TableCell>
                              <Chip 
                                label={login.status === 'success' ? 'Thành công' : 'Thất bại'} 
                                color={login.status === 'success' ? 'success' : 'error'} 
                                size="small" 
                              />
                            </TableCell>
                            <TableCell>{login.ip_address}</TableCell>
                            <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {login.user_agent}
                            </TableCell>
                            <TableCell>
                              {login.failure_reason || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
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
  {/* Thông tin hiển thị */}
  <Typography 
    variant="body2" 
    color="text.secondary"
    sx={{ fontWeight: 500 }}
  >
    Hiển thị <strong>{((loginPagination.page - 1) * loginPagination.limit) + 1}-{Math.min(loginPagination.page * loginPagination.limit, loginPagination.total)}</strong> của <strong>{loginPagination.total}</strong> bản ghi
  </Typography>

  {/* Controls phân trang */}
  <Box sx={{ 
    display: 'flex', 
    flexDirection: { xs: 'column', sm: 'row' },
    alignItems: 'center',
    gap: 2
  }}>
    {/* Rows per page */}
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography variant="body2" color="text.secondary">
        Hiển thị:
      </Typography>
      <Select
        value={loginPagination.limit}
        onChange={handleLoginRowsPerPageChange}
        size="small"
        sx={{
          minWidth: 80,
          '& .MuiSelect-select': {
            py: 0.5,
            fontSize: '0.875rem'
          }
        }}
      >
        {[5, 10, 20, 50, 100].map(size => (
          <MenuItem key={size} value={size}>{size}</MenuItem>
        ))}
      </Select>
    </Box>

    {/* Navigation buttons */}
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      {/* First & Previous */}
      <Button
        size="small"
        variant="outlined"
        onClick={() => setLoginPagination(prev => ({ ...prev, page: 1 }))}
        disabled={loginPagination.page === 1}
        sx={{ 
          minWidth: 32, 
          width: 32, 
          height: 32,
          border: '1px solid #e0e0e0',
          borderRadius: 1,
          p: 0
        }}
      >
        <FirstPage fontSize="small" />
      </Button>
      
      <Button
        size="small"
        variant="outlined"
        onClick={() => setLoginPagination(prev => ({ ...prev, page: prev.page - 1 }))}
        disabled={loginPagination.page === 1}
        sx={{ 
          minWidth: 32, 
          width: 32, 
          height: 32,
          border: '1px solid #e0e0e0',
          borderRadius: 1,
          p: 0
        }}
      >
        <ChevronLeft fontSize="small" />
      </Button>

      {/* Page numbers */}
      {getPaginationItems(loginPagination.page, loginPagination.totalPages).map((item, idx) => (
        item === '...' ? (
          <Box key={`dots-${idx}`} sx={{ px: 1, color: '#999' }}>...</Box>
        ) : (
          <Button
            key={item}
            variant={item === loginPagination.page ? 'contained' : 'outlined'}
            size="small"
            onClick={() => setLoginPagination(prev => ({ ...prev, page: item }))}
            sx={{
              minWidth: 32,
              width: 32,
              height: 32,
              borderRadius: 1,
              fontSize: '0.875rem',
              fontWeight: item === loginPagination.page ? 600 : 400,
              ...(item === loginPagination.page ? {
                backgroundColor: '#1976d2',
                color: 'white',
                border: 'none',
                '&:hover': { backgroundColor: '#1565c0' }
              } : {
                borderColor: '#e0e0e0',
                color: '#666',
                '&:hover': { 
                  backgroundColor: '#f5f5f5',
                  borderColor: '#1976d2'
                }
              })
            }}
          >
            {item}
          </Button>
        )
      ))}

      {/* Next & Last */}
      <Button
        size="small"
        variant="outlined"
        onClick={() => setLoginPagination(prev => ({ ...prev, page: prev.page + 1 }))}
        disabled={loginPagination.page === loginPagination.totalPages || loginPagination.totalPages === 0}
        sx={{ 
          minWidth: 32, 
          width: 32, 
          height: 32,
          border: '1px solid #e0e0e0',
          borderRadius: 1,
          p: 0
        }}
      >
        <ChevronRight fontSize="small" />
      </Button>
      
      <Button
        size="small"
        variant="outlined"
        onClick={() => setLoginPagination(prev => ({ ...prev, page: loginPagination.totalPages }))}
        disabled={loginPagination.page === loginPagination.totalPages || loginPagination.totalPages === 0}
        sx={{ 
          minWidth: 32, 
          width: 32, 
          height: 32,
          border: '1px solid #e0e0e0',
          borderRadius: 1,
          p: 0
        }}
      >
        <LastPage fontSize="small" />
      </Button>
    </Box>

    {/* Go to page */}
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography variant="body2" color="text.secondary">
        Đến trang:
      </Typography>
      <InputBase
        value={loginGoto}
        onChange={e => setLoginGoto(e.target.value.replace(/[^0-9]/g, ''))}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            const page = parseInt(loginGoto, 10);
            if (page && page >= 1 && page <= loginPagination.totalPages) {
              setLoginPagination(prev => ({ ...prev, page }));
              setLoginGoto('');
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
          const page = parseInt(loginGoto, 10);
          if (page && page >= 1 && page <= loginPagination.totalPages) {
            setLoginPagination(prev => ({ ...prev, page }));
            setLoginGoto('');
          }
        }}
        disabled={!loginGoto || parseInt(loginGoto, 10) < 1 || parseInt(loginGoto, 10) > loginPagination.totalPages}
        sx={{
          minWidth: 'auto',
          px: 2,
          height: 32,
          textTransform: 'none',
          fontSize: '0.875rem'
        }}
      >
        Đi
      </Button>
    </Box>
  </Box>
</Box>
                  </>
                ) : (
                  <Alert severity="info">
                    Chưa có lịch sử đăng nhập
                  </Alert>
                )}
              </TabPanel>

              {/* Tab 4: Access Logs */}
              <TabPanel value={tabValue} index={3}>
                <Typography variant="h6" sx={{ fontWeight: 600, color: '#1976d2', mb: 2 }}>
                  Nhật ký truy cập gần đây
                </Typography>
                {accessLogs && accessLogs.length > 0 ? (
                  <>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ '& th': { fontWeight: 600, bgcolor: '#f5f5f5' } }}>
                          <TableCell>Thời gian</TableCell>
                          <TableCell>Hành động</TableCell>
                          <TableCell>Đối tượng</TableCell>
                          <TableCell>Trạng thái</TableCell>
                          <TableCell>IP Address</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                          {accessLogs.slice(0, accessPagination.limit).map((log, index) => (
                          <TableRow key={index}>
                            <TableCell>{formatDateTime(log.created_at)}</TableCell>
                            <TableCell>
                              <Chip 
                                label={log.action_type} 
                                size="small" 
                                variant="outlined"
                                color="primary"
                              />
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2">
                                {log.object_type}
                                {log.object_id && (
                                  <Typography variant="caption" color="text.secondary" display="block">
                                    ID: {log.object_id}
                                  </Typography>
                                )}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip 
                                label={log.status} 
                                color={log.status === 'SUCCESS' ? 'success' : 'error'} 
                                size="small" 
                              />
                            </TableCell>
                            <TableCell>{log.ip_address}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
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
  {/* Thông tin hiển thị */}
  <Typography 
    variant="body2" 
    color="text.secondary"
    sx={{ fontWeight: 500 }}
  >
    Hiển thị <strong>{((accessPagination.page - 1) * accessPagination.limit) + 1}-{Math.min(accessPagination.page * accessPagination.limit, accessPagination.total)}</strong> của <strong>{accessPagination.total}</strong> bản ghi
  </Typography>

  {/* Controls phân trang */}
  <Box sx={{ 
    display: 'flex', 
    flexDirection: { xs: 'column', sm: 'row' },
    alignItems: 'center',
    gap: 2
  }}>
    {/* Rows per page */}
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography variant="body2" color="text.secondary">
        Hiển thị:
      </Typography>
      <Select
        value={accessPagination.limit}
        onChange={handleAccessRowsPerPageChange}
        size="small"
        sx={{
          minWidth: 80,
          '& .MuiSelect-select': {
            py: 0.5,
            fontSize: '0.875rem'
          }
        }}
      >
        {[5, 10, 20, 50, 100].map(size => (
          <MenuItem key={size} value={size}>{size}</MenuItem>
        ))}
      </Select>
    </Box>

    {/* Navigation buttons */}
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      {/* First & Previous */}
      <Button
        size="small"
        variant="outlined"
        onClick={() => setAccessPagination(prev => ({ ...prev, page: 1 }))}
        disabled={accessPagination.page === 1}
        sx={{ 
          minWidth: 32, 
          width: 32, 
          height: 32,
          border: '1px solid #e0e0e0',
          borderRadius: 1,
          p: 0
        }}
      >
        <FirstPage fontSize="small" />
      </Button>
      
      <Button
        size="small"
        variant="outlined"
        onClick={() => setAccessPagination(prev => ({ ...prev, page: prev.page - 1 }))}
        disabled={accessPagination.page === 1}
        sx={{ 
          minWidth: 32, 
          width: 32, 
          height: 32,
          border: '1px solid #e0e0e0',
          borderRadius: 1,
          p: 0
        }}
      >
        <ChevronLeft fontSize="small" />
      </Button>

      {/* Page numbers */}
      {getPaginationItems(accessPagination.page, accessPagination.totalPages).map((item, idx) => (
        item === '...' ? (
          <Box key={`dots-${idx}`} sx={{ px: 1, color: '#999' }}>...</Box>
        ) : (
          <Button
            key={item}
            variant={item === accessPagination.page ? 'contained' : 'outlined'}
            size="small"
            onClick={() => setAccessPagination(prev => ({ ...prev, page: item }))}
            sx={{
              minWidth: 32,
              width: 32,
              height: 32,
              borderRadius: 1,
              fontSize: '0.875rem',
              fontWeight: item === accessPagination.page ? 600 : 400,
              ...(item === accessPagination.page ? {
                backgroundColor: '#1976d2',
                color: 'white',
                border: 'none',
                '&:hover': { backgroundColor: '#1565c0' }
              } : {
                borderColor: '#e0e0e0',
                color: '#666',
                '&:hover': { 
                  backgroundColor: '#f5f5f5',
                  borderColor: '#1976d2'
                }
              })
            }}
          >
            {item}
          </Button>
        )
      ))}

      {/* Next & Last */}
      <Button
        size="small"
        variant="outlined"
        onClick={() => setAccessPagination(prev => ({ ...prev, page: prev.page + 1 }))}
        disabled={accessPagination.page === accessPagination.totalPages || accessPagination.totalPages === 0}
        sx={{ 
          minWidth: 32, 
          width: 32, 
          height: 32,
          border: '1px solid #e0e0e0',
          borderRadius: 1,
          p: 0
        }}
      >
        <ChevronRight fontSize="small" />
      </Button>
      
      <Button
        size="small"
        variant="outlined"
        onClick={() => setAccessPagination(prev => ({ ...prev, page: accessPagination.totalPages }))}
        disabled={accessPagination.page === accessPagination.totalPages || accessPagination.totalPages === 0}
        sx={{ 
          minWidth: 32, 
          width: 32, 
          height: 32,
          border: '1px solid #e0e0e0',
          borderRadius: 1,
          p: 0
        }}
      >
        <LastPage fontSize="small" />
      </Button>
    </Box>

    {/* Go to page */}
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography variant="body2" color="text.secondary">
        Đến trang:
      </Typography>
      <InputBase
        value={accessGoto}
        onChange={e => setAccessGoto(e.target.value.replace(/[^0-9]/g, ''))}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            const page = parseInt(accessGoto, 10);
            if (page && page >= 1 && page <= accessPagination.totalPages) {
              setAccessPagination(prev => ({ ...prev, page }));
              setAccessGoto('');
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
          const page = parseInt(accessGoto, 10);
          if (page && page >= 1 && page <= accessPagination.totalPages) {
            setAccessPagination(prev => ({ ...prev, page }));
            setAccessGoto('');
          }
        }}
        disabled={!accessGoto || parseInt(accessGoto, 10) < 1 || parseInt(accessGoto, 10) > accessPagination.totalPages}
        sx={{
          minWidth: 'auto',
          px: 2,
          height: 32,
          textTransform: 'none',
          fontSize: '0.875rem'
        }}
      >
        Đi
      </Button>
    </Box>
  </Box>
</Box>
                  </>
                ) : (
                  <Alert severity="info">
                    Chưa có nhật ký truy cập
                  </Alert>
                )}
              </TabPanel>
            </Card>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
};

// Demo Component with Context Provider
const UserDetailDemo = () => {
  const [progress, setProgress] = useState(0);
  const [alertBox, setAlertBox] = useState({ open: false, error: false, msg: '' });

  // Auto close alert after 5 seconds
  useEffect(() => {
    if (alertBox.open) {
      const timer = setTimeout(() => {
        setAlertBox({ ...alertBox, open: false });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [alertBox.open]);

  const contextValue = {
    setProgress,
    setAlertBox
  };

  return (
    <MyContext.Provider value={contextValue}>
      <Box sx={{ minHeight: '100vh' }}>
        {/* Progress Bar */}
        {progress > 0 && progress < 100 && (
          <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999 }}>
            <Box sx={{ width: '100%', height: 4, backgroundColor: 'rgba(0, 0, 0, 0.1)' }}>
              <Box
                sx={{
                  width: `${progress}%`,
                  height: '100%',
                  backgroundColor: '#1976d2',
                  transition: 'width 0.3s ease',
                  boxShadow: '0 0 8px rgba(25, 118, 210, 0.3)'
                }}
              />
            </Box>
          </Box>
        )}
        
        {/* Enhanced Alert */}
        {alertBox.open && (
          <Alert 
            severity={alertBox.error ? 'error' : 'success'}
            onClose={() => setAlertBox({ ...alertBox, open: false })}
            sx={{ 
              position: 'fixed', 
              top: 20, 
              right: 20, 
              zIndex: 9999,
              minWidth: 350,
              borderRadius: 3,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
              border: '1px solid #e0e0e0',
              '& .MuiAlert-icon': {
                fontSize: '1.5rem'
              },
              '& .MuiAlert-message': {
                fontWeight: 500
              }
            }}
          >
            {alertBox.msg}
          </Alert>
        )}
        
        <UserDetail />
      </Box>
    </MyContext.Provider>
  );
};

export default UserDetail;