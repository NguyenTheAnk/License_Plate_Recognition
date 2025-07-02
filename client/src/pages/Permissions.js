import React, { useState, useEffect, useCallback, useContext } from 'react';
import { 
  Add as AddIcon, 
  Edit as EditIcon, 
  Delete as DeleteIcon,
  Search as SearchIcon,
  ExpandMore as ExpandMoreIcon,
  ViewModule as ViewModuleIcon,
  TableChart as TableChartIcon,
  Security as SecurityIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  FilterList as FilterIcon,
  Home as HomeIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { 
  Button, 
  Checkbox, 
  TextField, 
  Select, 
  MenuItem, 
  FormControl, 
  InputLabel, 
  FormControlLabel, 
  Paper, 
  Pagination, 
  Alert, 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions,
  Card,
  CardContent,
  CardActions,
  Typography,
  Chip,
  Box,
  IconButton,
  Tooltip,
  Badge,
  Grid,
  Divider,
  Avatar,
  ButtonGroup,
  Fab,
  Collapse,
  Breadcrumbs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination
} from '@mui/material';
import {
  FaSave,
  FaTimes,
  FaLock,
  FaUnlock,
  FaUsers,
  FaCog,
  FaShieldAlt
} from 'react-icons/fa';
import {
  BiSolidTrashAlt,
  BiRefresh
} from 'react-icons/bi';
// Mock localStorage for demo purposes
if (typeof window !== 'undefined' && !localStorage.getItem('token')) {
  localStorage.setItem('token', 'mock-jwt-token-12345');
}

// Mock API functions - replace with your actual API utilities
const fetchDataFromAPI = async (url, token, options = {}) => {
  // Mock implementation - replace with your actual API call
  return new Promise((resolve) => {
    setTimeout(() => {
      let permissions = [
        { id: 1, module: 'users', action: 'create', code: 'users.create', description: 'Tạo người dùng mới', is_active: true, granted_roles_count: 3 },
        { id: 2, module: 'users', action: 'view', code: 'users.view', description: 'Xem danh sách người dùng', is_active: true, granted_roles_count: 5 },
        { id: 3, module: 'users', action: 'update', code: 'users.update', description: 'Cập nhật thông tin người dùng', is_active: true, granted_roles_count: 2 },
        { id: 4, module: 'users', action: 'delete', code: 'users.delete', description: 'Xóa người dùng', is_active: false, granted_roles_count: 1 },
        { id: 5, module: 'roles', action: 'create', code: 'roles.create', description: 'Tạo vai trò mới', is_active: true, granted_roles_count: 2 },
        { id: 6, module: 'roles', action: 'view', code: 'roles.view', description: 'Xem danh sách vai trò', is_active: true, granted_roles_count: 4 },
        { id: 7, module: 'permissions', action: 'create', code: 'permissions.create', description: 'Tạo quyền mới', is_active: true, granted_roles_count: 1 },
        { id: 8, module: 'permissions', action: 'view', code: 'permissions.view', description: 'Xem danh sách quyền', is_active: true, granted_roles_count: 3 },
        { id: 9, module: 'products', action: 'create', code: 'products.create', description: 'Tạo sản phẩm mới', is_active: true, granted_roles_count: 2 },
        { id: 10, module: 'products', action: 'view', code: 'products.view', description: 'Xem danh sách sản phẩm', is_active: false, granted_roles_count: 3 },
        { id: 11, module: 'reports', action: 'create', code: 'reports.create', description: 'Tạo báo cáo', is_active: true, granted_roles_count: 1 },
        { id: 12, module: 'reports', action: 'view', code: 'reports.view', description: 'Xem báo cáo', is_active: true, granted_roles_count: 4 },
        { id: 13, module: 'settings', action: 'update', code: 'settings.update', description: 'Cập nhật cài đặt hệ thống', is_active: false, granted_roles_count: 1 },
        { id: 14, module: 'dashboard', action: 'view', code: 'dashboard.view', description: 'Xem dashboard', is_active: true, granted_roles_count: 6 },
      ];

      // Apply filters if provided
      const filters = options.params || {};
      
      if (filters.module) {
        permissions = permissions.filter(p => p.module === filters.module);
      }
      
      if (filters.action) {
        permissions = permissions.filter(p => p.action === filters.action);
      }
      
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        permissions = permissions.filter(p => 
          p.code.toLowerCase().includes(searchLower) ||
          p.description.toLowerCase().includes(searchLower) ||
          p.module.toLowerCase().includes(searchLower) ||
          p.action.toLowerCase().includes(searchLower)
        );
      }
      
      if (filters.isActive && filters.isActive !== 'all') {
        const isActive = filters.isActive === 'true';
        permissions = permissions.filter(p => p.is_active === isActive);
      }

      // Sort permissions
      if (filters.sortBy) {
        permissions.sort((a, b) => {
          const aVal = a[filters.sortBy] || '';
          const bVal = b[filters.sortBy] || '';
          const compareResult = aVal.toString().localeCompare(bVal.toString());
          return filters.sortOrder === 'desc' ? -compareResult : compareResult;
        });
      }

      // Pagination
      const page = parseInt(filters.page) || 1;
      const perPage = parseInt(filters.perPage) || 20;
      const startIndex = (page - 1) * perPage;
      const endIndex = startIndex + perPage;
      const paginatedPermissions = permissions.slice(startIndex, endIndex);
      
      const totalPages = Math.ceil(permissions.length / perPage);

      resolve({
        success: true,
        data: {
          permissions: paginatedPermissions,
          pagination: {
            totalPages,
            totalPermissions: permissions.length,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            currentPage: page,
            perPage
          },
          filters: {
            modules: ['users', 'roles', 'permissions', 'products', 'reports', 'settings', 'dashboard'],
            actions: ['create', 'view', 'update', 'delete']
          }
        }
      });
    }, 800);
  });
};

const postData = async (url, data, token) => {
  // Mock implementation - replace with your actual API call
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        message: 'Tạo thành công!',
        data: { id: Date.now(), ...data }
      });
    }, 1500);
  });
};

const editData = async (url, data, token) => {
  // Mock implementation - replace with your actual API call
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        message: 'Cập nhật thành công!',
        data: { ...data }
      });
    }, 1500);
  });
};

const deleteData = async (url, token, options = {}) => {
  // Mock implementation - replace with your actual API call
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        message: 'Xóa thành công!'
      });
    }, 1000);
  });
};

const handleErrorResponse = (error) => {
  // Mock error handler - replace with your actual error handling
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }
  if (error?.message) {
    return error.message;
  }
  return 'Có lỗi xảy ra, vui lòng thử lại!';
};

// Context - in real app, this would be imported from a separate context file
const MyContext = React.createContext({
  setProgress: () => {},
  setAlertBox: () => {},
  setIsHideSidebarAndHeader: () => {}
});

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

// Create Permission Dialog Component
const CreatePermissionDialog = ({ open, handleClose, onPermissionCreated }) => {
  const [formData, setFormData] = useState({
    module: '',
    action: '',
    code: '',
    description: '',
    isActive: true
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const context = useContext(MyContext);

  useEffect(() => {
    if (open) {
      resetForm();
    }
  }, [open]);

  const resetForm = () => {
    setFormData({
      module: '',
      action: '',
      code: '',
      description: '',
      isActive: true
    });
    setErrors({});
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => {
      const newData = {
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      };
      
      // Auto-generate code when module or action changes
      if (name === 'module' || name === 'action') {
        const module = name === 'module' ? value : prev.module;
        const action = name === 'action' ? value : prev.action;
        if (module && action) {
          newData.code = `${module}.${action}`;
        }
      }
      
      // Clear errors when user starts typing
      if (errors[name]) {
        setErrors(prevErrors => ({
          ...prevErrors,
          [name]: ''
        }));
      }
      
      return newData;
    });
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.module.trim()) newErrors.module = 'Module là bắt buộc';
    if (!formData.action.trim()) newErrors.action = 'Hành động là bắt buộc';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await postData('/api/permissions', formData, token);
      
      context.setAlertBox({
        open: true,
        error: false,
        msg: 'Tạo quyền thành công!'
      });
      onPermissionCreated();
      handleClose();
      resetForm();
    } catch (err) {
      context.setAlertBox({
        open: true,
        error: true,
        msg: handleErrorResponse(err)
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: { 
          borderRadius: 3,
          background: 'white',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
          border: '1px solid #e0e0e0'
        }
      }}
    >
      <DialogTitle sx={{ 
        background: '#1976d2',
        color: 'white',
        borderRadius: '12px 12px 0 0',
        borderBottom: '1px solid #e0e0e0'
      }}>
        <Box display="flex" alignItems="center">
          <FaShieldAlt style={{ marginRight: 12, fontSize: '1.5rem' }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Thêm quyền mới
          </Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent sx={{ pt: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Module"
              name="module"
              value={formData.module}
              onChange={handleInputChange}
              error={!!errors.module}
              helperText={errors.module}
              required
              InputProps={{
                startAdornment: <FaCog style={{ marginRight: 8, color: '#666' }} />
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Hành động"
              name="action"
              value={formData.action}
              onChange={handleInputChange}
              error={!!errors.action}
              helperText={errors.action}
              required
              InputProps={{
                startAdornment: <SecurityIcon style={{ marginRight: 8, color: '#666' }} />
              }}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Mã quyền"
              name="code"
              value={formData.code}
              InputProps={{ 
                readOnly: true,
                startAdornment: <FaLock style={{ marginRight: 8, color: '#666' }} />
              }}
              helperText="Mã quyền được tạo tự động từ module và hành động"
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Mô tả"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              multiline
              rows={3}
              placeholder="Mô tả chi tiết về quyền này..."
            />
          </Grid>
          <Grid item xs={12}>
            <FormControlLabel
              control={
                <Checkbox
                  name="isActive"
                  checked={formData.isActive}
                  onChange={handleInputChange}
                  color="primary"
                />
              }
              label="Kích hoạt quyền này"
            />
          </Grid>
        </Grid>
      </DialogContent>
      
      <DialogActions sx={{ 
        p: 3, 
        borderTop: '1px solid #e0e0e0',
        background: '#fafafa'
      }}>
        <Button 
          onClick={handleClose} 
          disabled={loading}
          sx={{
            borderRadius: 2,
            px: 3,
            py: 1.5,
            textTransform: 'none',
            fontWeight: 600,
            backgroundColor: '#f5f5f5',
            color: '#222',
            '&:hover': {
              backgroundColor: '#ededed',
            },
          }}
        >
          <FaTimes style={{ marginRight: 8 }} />
          Hủy
        </Button>
        <Button 
          variant="contained" 
          onClick={handleSubmit} 
          disabled={loading}
          sx={{
            borderRadius: 2,
            px: 3,
            py: 1.5,
            textTransform: 'none',
            fontWeight: 600,
            backgroundColor: '#4caf50',
            '&:hover': {
              backgroundColor: '#45a049',
            },
          }}
        >
          <FaSave style={{ marginRight: 8 }} />
          {loading ? 'Đang tạo...' : 'Tạo quyền'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Update Permission Dialog Component  
const UpdatePermissionDialog = ({ open, handleClose, permission, onPermissionUpdated }) => {
  const [formData, setFormData] = useState({
    module: '',
    action: '',
    code: '',
    description: '',
    isActive: true
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const context = useContext(MyContext);

  useEffect(() => {
    if (open && permission) {
      setFormData({
        module: permission.module || '',
        action: permission.action || '',
        code: permission.code || '',
        description: permission.description || '',
        isActive: permission.is_active !== undefined ? permission.is_active : true
      });
    }
  }, [open, permission]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => {
      const newData = {
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      };
      
      // Auto-generate code when module or action changes
      if (name === 'module' || name === 'action') {
        const module = name === 'module' ? value : prev.module;
        const action = name === 'action' ? value : prev.action;
        if (module && action) {
          newData.code = `${module}.${action}`;
        }
      }
      
      // Clear errors when user starts typing
      if (errors[name]) {
        setErrors(prevErrors => ({
          ...prevErrors,
          [name]: ''
        }));
      }
      
      return newData;
    });
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.module.trim()) newErrors.module = 'Module là bắt buộc';
    if (!formData.action.trim()) newErrors.action = 'Hành động là bắt buộc';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await editData(`/api/permissions/${permission.id}`, formData, token);
      
      context.setAlertBox({
        open: true,
        error: false,
        msg: 'Cập nhật quyền thành công!'
      });
      onPermissionUpdated();
      handleClose();
    } catch (err) {
      context.setAlertBox({
        open: true,
        error: true,
        msg: handleErrorResponse(err)
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth
      PaperProps={{
        sx: { borderRadius: 3 }
      }}
    >
      <DialogTitle sx={{ 
        background: 'white',
        color: 'black',
        borderRadius: '12px 12px 0 0',
        borderBottom: '1px solid #e0e0e0'
      }}>
        <Box display="flex" alignItems="center">
          <EditIcon style={{ marginRight: 12, fontSize: '1.5rem', color: '#888' }} />
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#222' }}>
            Cập nhật quyền
          </Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent sx={{ pt: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Module"
              name="module"
              value={formData.module}
              onChange={handleInputChange}
              error={!!errors.module}
              helperText={errors.module}
              required
              InputProps={{
                startAdornment: <FaCog style={{ marginRight: 8, color: '#666' }} />
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Hành động"
              name="action"
              value={formData.action}
              onChange={handleInputChange}
              error={!!errors.action}
              helperText={errors.action}
              required
              InputProps={{
                startAdornment: <SecurityIcon style={{ marginRight: 8, color: '#666' }} />
              }}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Mã quyền"
              name="code"
              value={formData.code}
              InputProps={{ 
                readOnly: true,
                startAdornment: <FaLock style={{ marginRight: 8, color: '#666' }} />
              }}
              helperText="Mã quyền được tạo tự động từ module và hành động"
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Mô tả"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              multiline
              rows={3}
            />
          </Grid>
          <Grid item xs={12}>
            <FormControlLabel
              control={
                <Checkbox
                  name="isActive"
                  checked={formData.isActive}
                  onChange={handleInputChange}
                  color="primary"
                />
              }
              label="Kích hoạt quyền này"
            />
          </Grid>
        </Grid>
      </DialogContent>
      
      <DialogActions sx={{ 
        p: 3, 
        borderTop: '1px solid #e0e0e0',
        background: '#fafafa'
      }}>
        <Button 
          onClick={handleClose} 
          disabled={loading}
          sx={{
            borderRadius: 2,
            px: 3,
            py: 1.5,
            textTransform: 'none',
            fontWeight: 600,
            backgroundColor: '#f5f5f5',
            color: '#222',
            '&:hover': {
              backgroundColor: '#ededed',
            },
          }}
        >
          <FaTimes style={{ marginRight: 8 }} />
          Hủy
        </Button>
        <Button 
          variant="contained" 
          onClick={handleSubmit} 
          disabled={loading}
          sx={{
            borderRadius: 2,
            px: 3,
            py: 1.5,
            textTransform: 'none',
            fontWeight: 600,
            backgroundColor: '#1976d2',
            '&:hover': {
              backgroundColor: '#1565c0',
            },
          }}
        >
          <FaSave style={{ marginRight: 8 }} />
          {loading ? 'Đang cập nhật...' : 'Cập nhật'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Main Permissions Component
const Permissions = () => {
  // State management
  const [permissions, setPermissions] = useState([]);
  const [groupedPermissions, setGroupedPermissions] = useState({});
  const [filters, setFilters] = useState({
    page: 1,
    perPage: 20,
    module: '',
    action: '',
    search: '',
    isActive: 'all',
    sortBy: 'module',
    sortOrder: 'asc'
  });
  const [pagination, setPagination] = useState({
    totalPages: 0,
    totalPermissions: 0,
    hasNextPage: false,
    hasPrevPage: false
  });
  const [modules, setModules] = useState([]);
  const [actions, setActions] = useState([]);
  const [modal, setModal] = useState({ isOpen: false, type: '', data: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('grouped'); // 'grouped' or 'table'
  const [expandedModules, setExpandedModules] = useState({});
  const [selectedPermissions, setSelectedPermissions] = useState(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, permissionId: null, name: '' });
  const token = localStorage.getItem('token');

  const context = useContext(MyContext);

  // Group permissions by module
  const groupPermissionsByModule = useCallback((perms) => {
    const grouped = perms.reduce((acc, permission) => {
      const module = permission.module;
      if (!acc[module]) {
        acc[module] = [];
      }
      acc[module].push(permission);
      return acc;
    }, {});

    // Sort actions within each module
    Object.keys(grouped).forEach(module => {
      grouped[module].sort((a, b) => a.action.localeCompare(b.action));
    });

    return grouped;
  }, []);

  // Fetch permissions
  const fetchPermissions = useCallback(async () => {
    setLoading(true);
    context.setProgress(20);
    try {
      const response = await fetchDataFromAPI('/api/permissions', token, { params: filters });
      const perms = response.data?.permissions || response.permissions || [];
      setPermissions(perms);
      setGroupedPermissions(groupPermissionsByModule(perms));
      setPagination(response.data?.pagination || response.pagination || {});
      setModules(response.data?.filters?.modules || response.filters?.modules || []);
      setActions(response.data?.filters?.actions || response.filters?.actions || []);
      setError(null);
      context.setProgress(100);
    } catch (err) {
      setError(handleErrorResponse(err));
      context.setAlertBox({
        open: true,
        error: true,
        msg: handleErrorResponse(err)
      });
      context.setProgress(100);
    } finally {
      setLoading(false);
    }
  }, [filters, token, groupPermissionsByModule, context]);

  useEffect(() => {
    fetchPermissions();
  }, [filters.page, filters.module, filters.action, filters.isActive, filters.sortBy, filters.sortOrder]);

  // Debounce search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (filters.page === 1) {
        fetchPermissions();
      } else {
        setFilters(prev => ({ ...prev, page: 1 }));
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [filters.search]);

  // Clear selected permissions when filters change
  useEffect(() => {
    setSelectedPermissions(new Set());
  }, [filters.module, filters.action, filters.search, filters.isActive]);

  // Auto-expand modules with permissions
  useEffect(() => {
    if (viewMode === 'grouped') {
      const initialExpanded = {};
      Object.keys(groupedPermissions).forEach(module => {
        initialExpanded[module] = true;
      });
      setExpandedModules(initialExpanded);
    }
  }, [groupedPermissions, viewMode]);

  // Handle delete permission
  const handleDelete = async (id, name) => {
    setDeleteDialog({ open: true, permissionId: id, name });
  };

  const confirmDelete = async () => {
    const { permissionId } = deleteDialog;
    try {
      const response = await deleteData(`/api/permissions/${permissionId}`, token);
      context.setAlertBox({
        open: true,
        error: false,
        msg: 'Xóa quyền thành công!'
      });
      setSelectedPermissions(prev => {
        const newSet = new Set(prev);
        newSet.delete(permissionId);
        return newSet;
      });
      fetchPermissions();
    } catch (err) {
      context.setAlertBox({
        open: true,
        error: true,
        msg: handleErrorResponse(err)
      });
    } finally {
      setDeleteDialog({ open: false, permissionId: null, name: '' });
    }
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedPermissions.size === 0) {
      context.setAlertBox({
        open: true,
        error: true,
        msg: 'Vui lòng chọn ít nhất một quyền để xóa'
      });
      return;
    }
    if (!window.confirm(`Bạn có chắc muốn xóa ${selectedPermissions.size} quyền?`)) return;
    
    try {
      await deleteData('/api/permissions/bulk/delete', token, { 
        data: { ids: Array.from(selectedPermissions) } 
      });
      context.setAlertBox({
        open: true,
        error: false,
        msg: `Xóa thành công ${selectedPermissions.size} quyền!`
      });
      setSelectedPermissions(new Set());
      fetchPermissions();
    } catch (err) {
      context.setAlertBox({
        open: true,
        error: true,
        msg: handleErrorResponse(err)
      });
    }
  };

  // Handle modal open
  const openModal = (type, data = null) => {
    setModal({ isOpen: true, type, data });
  };

  // Handle filter changes
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value,
      ...(name !== 'page' ? { page: 1 } : {})
    }));
  };

  // Handle refresh
  const handleRefresh = () => {
    setFilters({
      page: 1,
      perPage: 20,
      module: '',
      action: '',
      search: '',
      isActive: 'all',
      sortBy: 'module',
      sortOrder: 'asc'
    });
    setSelectedPermissions(new Set());
    fetchPermissions();
  };

  // Toggle module expansion
  const toggleModule = (module) => {
    setExpandedModules(prev => ({
      ...prev,
      [module]: !prev[module]
    }));
  };

  // Handle permission selection
  const togglePermissionSelection = (id) => {
    setSelectedPermissions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Select all permissions in module
  const toggleModuleSelection = (module) => {
    const modulePermissions = groupedPermissions[module] || [];
    const moduleIds = modulePermissions.map(p => p.id);
    const allSelected = moduleIds.every(id => selectedPermissions.has(id));
    
    setSelectedPermissions(prev => {
      const newSet = new Set(prev);
      if (allSelected) {
        moduleIds.forEach(id => newSet.delete(id));
      } else {
        moduleIds.forEach(id => newSet.add(id));
      }
      return newSet;
    });
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectedPermissions.size === permissions.length && permissions.length > 0) {
      setSelectedPermissions(new Set());
    } else {
      setSelectedPermissions(new Set(permissions.map(p => p.id)));
    }
  };

  // Get module statistics
  const getModuleStats = (module) => {
    const modulePermissions = groupedPermissions[module] || [];
    const activeCount = modulePermissions.filter(p => p.is_active).length;
    const totalCount = modulePermissions.length;
    const selectedCount = modulePermissions.filter(p => selectedPermissions.has(p.id)).length;
    
    return { activeCount, totalCount, selectedCount };
  };

  // Get module color based on activity
  const getModuleColor = (module) => {
    const stats = getModuleStats(module);
    const activeRatio = stats.activeCount / stats.totalCount;
    
    if (activeRatio === 1) return '#4caf50';
    if (activeRatio > 0.5) return '#ff9800';
    if (activeRatio > 0) return '#f44336';
    return '#9e9e9e';
  };

  return (
    <Box sx={{ 
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      py: 3
    }}>
      {/* Modern Header */}
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
                  Quản lý quyền truy cập
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  Tổng cộng {pagination.totalPermissions || permissions.length} quyền trong {Object.keys(groupedPermissions).length} module
                </Typography>
              </Box>
              
              <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
                <Breadcrumbs>
                  <StyledBreadcrumb
                    label="Trang chủ"
                    icon={<HomeIcon fontSize="small" />}
                    onClick={() => window.location.href = '/'}
                  />
                  <StyledBreadcrumb
                    label="Quản lý quyền"
                    icon={<SecurityIcon fontSize="small" />}
                  />
                </Breadcrumbs>
                
                <ButtonGroup variant="contained" size="small">
                  <Button
                    onClick={() => setViewMode('grouped')}
                    startIcon={<ViewModuleIcon />}
                    sx={{
                      backgroundColor: viewMode === 'grouped' ? '#1976d2' : '#e0e0e0',
                      color: viewMode === 'grouped' ? 'white' : '#666',
                      '&:hover': {
                        backgroundColor: viewMode === 'grouped' ? '#1565c0' : '#d0d0d0',
                      }
                    }}
                  >
                    Nhóm
                  </Button>
                  <Button
                    onClick={() => setViewMode('table')}
                    startIcon={<TableChartIcon />}
                    sx={{
                      backgroundColor: viewMode === 'table' ? '#1976d2' : '#e0e0e0',
                      color: viewMode === 'table' ? 'white' : '#666',
                      '&:hover': {
                        backgroundColor: viewMode === 'table' ? '#1565c0' : '#d0d0d0',
                      }
                    }}
                  >
                    Bảng
                  </Button>
                </ButtonGroup>
                
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => openModal('create')}
                  sx={{ 
                    backgroundColor: '#1976d2',
                    borderRadius: 2,
                    px: 3,
                    py: 1.5,
                    textTransform: 'none',
                    fontWeight: 600,
                    boxShadow: '0 2px 8px rgba(25, 118, 210, 0.3)',
                    '&:hover': {
                      backgroundColor: '#1565c0',
                      boxShadow: '0 4px 12px rgba(25, 118, 210, 0.4)',
                      transform: 'translateY(-1px)'
                    },
                    transition: 'all 0.2s ease'
                  }}
                >
                  Thêm quyền mới
                </Button>
              </Box>
            </Box>
          </Box>
        </Card>
      </Box>

      {/* Enhanced Filters */}
      <Box sx={{ px: 3, mb: 3 }}>
        <Card sx={{ 
          background: 'white',
          borderRadius: 3,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          border: '1px solid #e0e0e0'
        }}>
          <Box sx={{ p: 2 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={showFilters ? 2 : 0}>
              <Box display="flex" alignItems="center" gap={1}>
                <FilterIcon />
                <Typography variant="h6">Bộ lọc</Typography>
              </Box>
              <IconButton onClick={() => setShowFilters(!showFilters)}>
                <ExpandMoreIcon sx={{ 
                  transform: showFilters ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.3s ease'
                }} />
              </IconButton>
            </Box>
            
            <Collapse in={showFilters}>
              <Grid container spacing={3} alignItems="center">
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    fullWidth
                    label="Tìm kiếm"
                    name="search"
                    value={filters.search}
                    onChange={handleFilterChange}
                    placeholder="Tìm theo code, mô tả..."
                    size="small"
                    InputProps={{
                      startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
                    }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2,
                      },
                    }}
                  />
                </Grid>
                
                <Grid item xs={12} sm={6} md={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Module</InputLabel>
                    <Select
                      name="module"
                      value={filters.module}
                      onChange={handleFilterChange}
                      label="Module"
                      sx={{ borderRadius: 2 }}
                    >
                      <MenuItem value="">Tất cả</MenuItem>
                      {modules.map(module => (
                        <MenuItem key={module} value={module}>{module}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={12} sm={6} md={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Hành động</InputLabel>
                    <Select
                      name="action"
                      value={filters.action}
                      onChange={handleFilterChange}
                      label="Hành động"
                      sx={{ borderRadius: 2 }}
                    >
                      <MenuItem value="">Tất cả</MenuItem>
                      {actions.map(action => (
                        <MenuItem key={action} value={action}>{action}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={12} sm={6} md={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Trạng thái</InputLabel>
                    <Select
                      name="isActive"
                      value={filters.isActive}
                      onChange={handleFilterChange}
                      label="Trạng thái"
                      sx={{ borderRadius: 2 }}
                    >
                      <MenuItem value="all">Tất cả</MenuItem>
                      <MenuItem value="true">Kích hoạt</MenuItem>
                      <MenuItem value="false">Không kích hoạt</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={12} sm={6} md={3}>
                  <Box display="flex" gap={1}>
                    <Button
                      variant="outlined"
                      startIcon={<RefreshIcon />}
                      onClick={handleRefresh}
                      disabled={loading}
                      sx={{
                        borderRadius: 2,
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
                      Làm mới
                    </Button>
                    
                    {selectedPermissions.size > 0 && (
                      <Button
                        variant="outlined"
                        color="error"
                        startIcon={<BiSolidTrashAlt />}
                        onClick={handleBulkDelete}
                        sx={{
                          borderRadius: 2,
                          textTransform: 'none',
                          fontWeight: 600,
                          '&:hover': {
                            backgroundColor: 'rgba(244, 67, 54, 0.04)',
                          },
                        }}
                      >
                        Xóa ({selectedPermissions.size})
                      </Button>
                    )}
                  </Box>
                </Grid>
              </Grid>
            </Collapse>
          </Box>
        </Card>
      </Box>

      {/* Error message */}
      {error && (
        <Box sx={{ px: 3, mb: 3 }}>
          <Alert severity="error" sx={{ borderRadius: 2 }}>
            {error}
          </Alert>
        </Box>
      )}

      {/* Action Bar */}
      {selectedPermissions.size > 0 && (
        <Box sx={{ px: 3, mb: 3 }}>
          <Paper elevation={2} sx={{ p: 3, bg: '#e3f2fd', borderRadius: 2, border: '1px solid #bbdefb' }}>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="body1" sx={{ color: '#1565c0', fontWeight: 600 }}>
                Đã chọn {selectedPermissions.size} quyền
              </Typography>
              <Button
                variant="contained"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={handleBulkDelete}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                }}
              >
                Xóa đã chọn
              </Button>
            </Box>
          </Paper>
        </Box>
      )}

      {/* Content */}
      <Box sx={{ px: 3 }}>
        {loading ? (
          <Card sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
            <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  border: '3px solid #f3f3f3',
                  borderTop: '3px solid #1976d2',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  '@keyframes spin': {
                    '0%': { transform: 'rotate(0deg)' },
                    '100%': { transform: 'rotate(360deg)' },
                  },
                }}
              />
              <Typography variant="h6" color="text.secondary">
                Đang tải dữ liệu...
              </Typography>
            </Box>
          </Card>
        ) : viewMode === 'grouped' ? (
          /* Grouped View */
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {Object.keys(groupedPermissions).length === 0 ? (
              <Card sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
                <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
                  <SecurityIcon sx={{ fontSize: 48, color: '#ccc' }} />
                  <Typography variant="h6" color="text.secondary">
                    Không có dữ liệu
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Không tìm thấy quyền nào phù hợp với bộ lọc
                  </Typography>
                </Box>
              </Card>
            ) : (
              Object.keys(groupedPermissions).map(module => {
                const stats = getModuleStats(module);
                const moduleColor = getModuleColor(module);
                const isExpanded = expandedModules[module];
                
                return (
                  <Card key={module} sx={{ borderRadius: 3, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }}>
                    <Box 
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        p: 3,
                        cursor: 'pointer',
                        borderLeft: `4px solid ${moduleColor}`,
                        backgroundColor: 'white',
                        '&:hover': {
                          backgroundColor: 'rgba(0, 0, 0, 0.02)',
                        },
                        transition: 'background-color 0.2s ease',
                      }}
                      onClick={() => toggleModule(module)}
                    >
                      <Box display="flex" alignItems="center" gap={2}>
                        <Checkbox
                          checked={stats.selectedCount === stats.totalCount && stats.totalCount > 0}
                          indeterminate={stats.selectedCount > 0 && stats.selectedCount < stats.totalCount}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleModuleSelection(module);
                          }}
                          sx={{
                            '&.Mui-checked': {
                              color: '#1976d2',
                            },
                          }}
                        />
                        <Avatar sx={{ 
                          bgcolor: moduleColor,
                          width: 48,
                          height: 48,
                          fontSize: '1.2rem',
                          fontWeight: 600
                        }}>
                          <SecurityIcon />
                        </Avatar>
                        <Box>
                          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                            {module}
                          </Typography>
                          <Box display="flex" gap={1} flexWrap="wrap">
                            <Chip 
                              size="small" 
                              label={`${stats.totalCount} quyền`}
                              sx={{
                                backgroundColor: '#e3f2fd',
                                color: '#1976d2',
                                fontWeight: 600,
                                fontSize: '0.75rem',
                              }}
                            />
                            <Chip 
                              size="small" 
                              label={`${stats.activeCount} hoạt động`}
                              sx={{
                                backgroundColor: stats.activeCount === stats.totalCount ? '#e8f5e8' : '#fff3e0',
                                color: stats.activeCount === stats.totalCount ? '#2e7d32' : '#f57c00',
                                fontWeight: 600,
                                fontSize: '0.75rem',
                              }}
                            />
                            {stats.selectedCount > 0 && (
                              <Chip 
                                size="small" 
                                label={`${stats.selectedCount} đã chọn`}
                                sx={{
                                  backgroundColor: '#f3e5f5',
                                  color: '#7b1fa2',
                                  fontWeight: 600,
                                  fontSize: '0.75rem',
                                }}
                              />
                            )}
                          </Box>
                        </Box>
                      </Box>
                      <IconButton sx={{ color: '#666' }}>
                        <ExpandMoreIcon sx={{ 
                          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.3s ease'
                        }} />
                      </IconButton>
                    </Box>
                    
                    <Collapse in={isExpanded}>
                      <Box sx={{ borderTop: '1px solid #e0e0e0', backgroundColor: '#fafafa' }}>
                        <Grid container spacing={2} sx={{ p: 3 }}>
                          {groupedPermissions[module].map(permission => (
                            <Grid item xs={12} md={6} lg={4} key={permission.id}>
                              <Card 
                                sx={{
                                  height: '100%',
                                  transition: 'all 0.2s ease',
                                  borderRadius: 2,
                                  border: selectedPermissions.has(permission.id) 
                                    ? '2px solid #1976d2' 
                                    : '1px solid #e0e0e0',
                                  backgroundColor: selectedPermissions.has(permission.id) 
                                    ? '#f3f9ff' 
                                    : 'white',
                                  '&:hover': {
                                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                                    transform: 'translateY(-2px)',
                                  },
                                }}
                              >
                                <CardContent sx={{ pb: 1 }}>
                                  <Box display="flex" justifyContent="space-between" alignItems="start" mb={2}>
                                    <Checkbox
                                      checked={selectedPermissions.has(permission.id)}
                                      onChange={() => togglePermissionSelection(permission.id)}
                                      size="small"
                                      sx={{
                                        '&.Mui-checked': {
                                          color: '#1976d2',
                                        },
                                      }}
                                    />
                                    <Chip
                                      size="small"
                                      icon={permission.is_active ? <CheckCircleIcon /> : <CancelIcon />}
                                      label={permission.is_active ? 'Hoạt động' : 'Không hoạt động'}
                                      sx={{
                                        backgroundColor: permission.is_active ? '#e8f5e8' : '#ffebee',
                                        color: permission.is_active ? '#2e7d32' : '#c62828',
                                        fontWeight: 600,
                                        '& .MuiChip-icon': {
                                          color: permission.is_active ? '#2e7d32' : '#c62828',
                                        },
                                      }}
                                    />
                                  </Box>
                                  
                                  <Typography variant="h6" sx={{ 
                                    fontWeight: 600, 
                                    fontSize: '0.95rem', 
                                    mb: 1,
                                    color: '#1a1a1a'
                                  }}>
                                    {permission.action}
                                  </Typography>
                                  
                                  <Typography variant="body2" sx={{ 
                                    color: '#666', 
                                    mb: 2, 
                                    fontFamily: 'monospace',
                                    fontSize: '0.8rem',
                                    backgroundColor: '#f5f5f5',
                                    padding: '4px 8px',
                                    borderRadius: 1,
                                  }}>
                                    {permission.code}
                                  </Typography>
                                  
                                  {permission.description && (
                                    <Typography variant="body2" sx={{ 
                                      color: '#777', 
                                      fontSize: '0.8rem', 
                                      mb: 2,
                                      lineHeight: 1.4
                                    }}>
                                      {permission.description}
                                    </Typography>
                                  )}
                                  
                                  <Chip
                                    size="small"
                                    icon={<FaUsers style={{ fontSize: '0.7rem' }} />}
                                    label={`${permission.granted_roles_count || 0} vai trò`}
                                    sx={{
                                      backgroundColor: '#e1f5fe',
                                      color: '#0277bd',
                                      fontSize: '0.75rem',
                                      fontWeight: 600,
                                    }}
                                  />
                                </CardContent>
                                
                                <CardActions sx={{ pt: 0, px: 2, pb: 2 }}>
                                  <Tooltip title="Chỉnh sửa">
                                    <IconButton
                                      size="small"
                                      onClick={() => openModal('update', permission)}
                                      sx={{
                                        color: '#ff9800',
                                        backgroundColor: 'rgba(255, 152, 0, 0.1)',
                                        '&:hover': {
                                          backgroundColor: 'rgba(255, 152, 0, 0.2)',
                                        },
                                      }}
                                    >
                                      <EditIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Xóa">
                                    <IconButton
                                      size="small"
                                      onClick={() => handleDelete(permission.id, permission.code)}
                                      sx={{
                                        color: '#f44336',
                                        backgroundColor: 'rgba(244, 67, 54, 0.1)',
                                        '&:hover': {
                                          backgroundColor: 'rgba(244, 67, 54, 0.2)',
                                        },
                                      }}
                                    >
                                      <DeleteIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </CardActions>
                              </Card>
                            </Grid>
                          ))}
                        </Grid>
                      </Box>
                    </Collapse>
                  </Card>
                );
              })
            )}
          </Box>
        ) : (
          /* Table View */
          <Card sx={{ borderRadius: 3, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ 
                    background: '#1976d2',
                    '& th': {
                      color: 'white',
                      fontWeight: 600,
                      fontSize: '0.875rem',
                      borderBottom: 'none',
                      py: 2
                    }
                  }}>
                    <TableCell padding="checkbox" sx={{ width: 60 }}>
                      <Checkbox
                        checked={permissions.length > 0 && selectedPermissions.size === permissions.length}
                        indeterminate={selectedPermissions.size > 0 && selectedPermissions.size < permissions.length}
                        onChange={handleSelectAll}
                        sx={{
                          color: 'rgba(255, 255, 255, 0.7)',
                          '&.Mui-checked': {
                            color: 'white',
                          },
                          '&.MuiCheckbox-indeterminate': {
                            color: 'white',
                          },
                        }}
                      />
                    </TableCell>
                    <TableCell>Module</TableCell>
                    <TableCell>Hành động</TableCell>
                    <TableCell>Mã quyền</TableCell>
                    <TableCell>Mô tả</TableCell>
                    <TableCell>Trạng thái</TableCell>
                    <TableCell>Vai trò được cấp</TableCell>
                    <TableCell align="center">Thao tác</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {permissions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                        <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
                          <SecurityIcon sx={{ fontSize: 48, color: '#ccc' }} />
                          <Typography variant="h6" color="text.secondary">
                            Không có dữ liệu
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Không tìm thấy quyền nào phù hợp với bộ lọc
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ) : (
                    permissions.map((permission, index) => (
                      <TableRow 
                        key={permission.id} 
                        hover
                        sx={{ 
                          '&:hover': {
                            backgroundColor: 'rgba(25, 118, 210, 0.04)',
                          },
                          '&:nth-of-type(even)': {
                            backgroundColor: 'rgba(0, 0, 0, 0.02)',
                          },
                        }}
                      >
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={selectedPermissions.has(permission.id)}
                            onChange={() => togglePermissionSelection(permission.id)}
                            sx={{
                              '&.Mui-checked': {
                                color: '#1976d2',
                              },
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={2}>
                            <Avatar sx={{ 
                              bgcolor: '#1976d2',
                              width: 32,
                              height: 32,
                              fontSize: '0.8rem'
                            }}>
                              <SecurityIcon fontSize="small" />
                            </Avatar>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                              {permission.module}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {permission.action}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ 
                            fontFamily: 'monospace',
                            fontSize: '0.8rem',
                            backgroundColor: '#f5f5f5',
                            padding: '2px 6px',
                            borderRadius: 1,
                            display: 'inline-block'
                          }}>
                            {permission.code}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary" sx={{
                            maxWidth: 200,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {permission.description || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            icon={permission.is_active ? <CheckCircleIcon /> : <CancelIcon />}
                            label={permission.is_active ? 'Hoạt động' : 'Không hoạt động'}
                            sx={{
                              backgroundColor: permission.is_active ? '#e8f5e8' : '#ffebee',
                              color: permission.is_active ? '#2e7d32' : '#c62828',
                              fontWeight: 600,
                              '& .MuiChip-icon': {
                                color: permission.is_active ? '#2e7d32' : '#c62828',
                              },
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={`${permission.granted_roles_count || 0} vai trò`}
                            sx={{
                              backgroundColor: '#e1f5fe',
                              color: '#0277bd',
                              fontWeight: 600,
                            }}
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Box display="flex" justifyContent="center" gap={1}>
                            <IconButton
                              size="small"
                              onClick={() => openModal('update', permission)}
                              sx={{
                                color: '#ff9800',
                                backgroundColor: 'rgba(255, 152, 0, 0.1)',
                                '&:hover': {
                                  backgroundColor: 'rgba(255, 152, 0, 0.2)',
                                },
                              }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => handleDelete(permission.id, permission.code)}
                              sx={{
                                color: '#f44336',
                                backgroundColor: 'rgba(244, 67, 54, 0.1)',
                                '&:hover': {
                                  backgroundColor: 'rgba(244, 67, 54, 0.2)',
                                },
                              }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            
            {/* Enhanced Pagination */}
            <Box display="flex" justifyContent="space-between" alignItems="center" p={3} sx={{
              borderTop: '1px solid rgba(0, 0, 0, 0.1)',
              background: 'rgba(0, 0, 0, 0.02)',
            }}>
              <Typography variant="body2" color="textSecondary" sx={{ fontWeight: 500 }}>
                Hiển thị {((filters.page - 1) * filters.perPage) + 1} - {Math.min(filters.page * filters.perPage, pagination.totalPermissions || permissions.length)} của {pagination.totalPermissions || permissions.length} quyền
              </Typography>
              <Pagination
                count={pagination.totalPages || 1}
                page={filters.page}
                onChange={(event, value) => setFilters(prev => ({ ...prev, page: value }))}
                color="primary"
                showFirstButton
                showLastButton
                sx={{
                  '& .MuiPaginationItem-root': {
                    borderRadius: 2,
                    fontWeight: 600,
                    '&.Mui-selected': {
                      background: '#1976d2',
                      color: 'white',
                      '&:hover': {
                        background: '#1565c0',
                      },
                    },
                  },
                }}
              />
            </Box>
          </Card>
        )}
      </Box>

      {/* Floating Action Button */}
      <Fab
        color="primary"
        aria-label="add"
        onClick={() => openModal('create')}
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          backgroundColor: '#1976d2',
          '&:hover': {
            backgroundColor: '#1565c0',
            transform: 'scale(1.1)',
          },
          transition: 'all 0.2s ease',
        }}
      >
        <AddIcon />
      </Fab>

      {/* Create Permission Dialog */}
      <CreatePermissionDialog
        open={modal.isOpen && modal.type === 'create'}
        handleClose={() => setModal({ isOpen: false, type: '', data: null })}
        onPermissionCreated={fetchPermissions}
      />
      
      {/* Update Permission Dialog */}
      <UpdatePermissionDialog
        open={modal.isOpen && modal.type === 'update'}
        handleClose={() => setModal({ isOpen: false, type: '', data: null })}
        permission={modal.data}
        onPermissionUpdated={fetchPermissions}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, permissionId: null, name: '' })}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            background: 'white',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            border: '1px solid #e0e0e0'
          }
        }}
      >
        <DialogTitle sx={{
          background: 'white',
          color: 'black',
          borderRadius: '12px 12px 0 0',
          borderBottom: '1px solid #e0e0e0',
          fontWeight: 600,
        }}>
          <Box display="flex" alignItems="center">
            <BiSolidTrashAlt style={{ marginRight: 12, fontSize: '1.5rem', color: '#888' }} />
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#222' }}>
              Xác nhận xóa
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <Typography variant="body1" sx={{ mb: 2, color: '#222' }}>
            Bạn có chắc chắn muốn xóa quyền <strong>"{deleteDialog.name}"</strong>?
          </Typography>
          <Alert severity="warning" sx={{ background: '#fffbe6', color: '#8a6d3b', border: '1px solid #faebcc' }}>
            <Typography variant="body2" sx={{ color: '#8a6d3b' }}>
              • Quyền này sẽ bị xóa khỏi tất cả vai trò đang sử dụng<br/>
              • Hành động này không thể hoàn tác<br/>
              • Có thể ảnh hưởng đến quyền truy cập của người dùng
            </Typography>
          </Alert>
        </DialogContent>
        <DialogActions sx={{
          p: 3,
          borderTop: '1px solid #e0e0e0',
          background: '#fafafa'
        }}>
          <Button
            onClick={() => setDeleteDialog({ open: false, permissionId: null, name: '' })}
            sx={{
              borderRadius: 2,
              px: 3,
              py: 1.5,
              textTransform: 'none',
              fontWeight: 600,
              backgroundColor: '#f5f5f5',
              color: '#222',
              '&:hover': {
                backgroundColor: '#ededed',
              },
            }}
          >
            Hủy
          </Button>
          <Button
            variant="contained"
            onClick={confirmDelete}
            sx={{
              borderRadius: 2,
              px: 3,
              py: 1.5,
              textTransform: 'none',
              fontWeight: 600,
              backgroundColor: '#e53935',
              color: 'white',
              '&:hover': {
                backgroundColor: '#b71c1c',
              },
            }}
          >
            <BiSolidTrashAlt style={{ marginRight: 8, color: '#fff' }} />
            Xóa quyền
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Permissions;