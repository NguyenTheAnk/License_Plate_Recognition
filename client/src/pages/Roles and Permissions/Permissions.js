import React, { useState, useEffect, useCallback, useContext } from 'react';
import { 
  Add as AddIcon, 
  Edit as EditIcon, 
  Delete as DeleteIcon,
  Search as SearchIcon,
  ExpandMore as ExpandMoreIcon,
  Security as SecurityIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  FilterList as FilterIcon,
  Home as HomeIcon,
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
  ViewColumn as ViewColumnIcon,
  Group as GroupIcon,
  FirstPage, LastPage, ChevronLeft, ChevronRight
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
  Alert, 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions,
  Card,
  Typography,
  Chip,
  Box,
  IconButton,
  Grid,
  Avatar,
  Fab,
  Collapse,
  Breadcrumbs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  InputBase
} from '@mui/material';
import {
  FaSave,
  FaTimes,
  FaLock,
  FaCog,
  FaShieldAlt,
  FaEye
} from 'react-icons/fa';
import {
  BiSolidTrashAlt
} from 'react-icons/bi';
import { fetchDataFromAPI, postData, editData, deleteData, handleErrorResponse } from '../../utils/auth';
import * as XLSX from 'xlsx';

// Mock localStorage for demo purposes
if (typeof window !== 'undefined' && !localStorage.getItem('token')) {
  localStorage.setItem('token', 'mock-jwt-token-12345');
}

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
const CreatePermissionDialog = ({ open, handleClose, onPermissionCreated, setAlertBox }) => {
  const [formData, setFormData] = useState({
    module: '',
    action: '',
    code: '',
    description: '',
    isActive: true
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

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
      
      setAlertBox({
        open: true,
        error: false,
        msg: 'Tạo quyền thành công!'
      });
      onPermissionCreated();
      handleClose();
      resetForm();
    } catch (err) {
      setAlertBox({
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
        borderBottom: '1px solid #e0e0e0',
        pt: 3,
        pb: 2,
        px: 3
      }}>
        <Box display="flex" alignItems="center">
          <FaShieldAlt style={{ marginRight: 12, fontSize: '1.5rem' }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Thêm quyền mới
          </Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent sx={{ pt: 6, px: 3, pb: 2, background: 'white' }}>
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
const UpdatePermissionDialog = ({ open, handleClose, permission, onPermissionUpdated, setAlertBox }) => {
  const [formData, setFormData] = useState({
    module: '',
    action: '',
    code: '',
    description: '',
    isActive: true
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

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
    // Extra check for required fields before sending
    if (!formData.module || !formData.action || !formData.code) {
      setAlertBox({
        open: true,
        error: true,
        msg: 'Module, hành động và mã quyền là bắt buộc.'
      });
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      // Ensure all fields are never undefined/null for backend
      const payload = {
        module: formData.module || '',
        action: formData.action || '',
        code: formData.code || '',
        description: formData.description || '',
        isActive: !!formData.isActive
      };
      console.log('Update permission payload:', payload);
      const response = await editData(`/api/permissions/${permission.id}`, payload, token);
      setAlertBox({
        open: true,
        error: false,
        msg: 'Cập nhật quyền thành công!'
      });
      onPermissionUpdated();
      handleClose();
    } catch (err) {
      setAlertBox({
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
      
      <DialogContent sx={{ pt: 6 }}>
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

// Thêm hàm tạo mảng trang với dấu ...
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

// Main Permissions Component
const Permissions = () => {
  // State management
  const [permissions, setPermissions] = useState([]);
  const [filters, setFilters] = useState({
    page: 1,
    perPage: 10,
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
  const [selectedPermissions, setSelectedPermissions] = useState(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, permissionId: null, name: '' });
  const [roleDialog, setRoleDialog] = useState({ open: false, permission: null });
  const [visibleColumns, setVisibleColumns] = useState({
    module: true,
    action: true,
    code: true,
    description: true,
    is_active: true
  });
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
  const [historyDialog, setHistoryDialog] = useState({ open: false, permission: null });
  const [historyData, setHistoryData] = useState([]);
  const [alertBox, setAlertBox] = useState({ open: false, error: false, msg: '' });
  const token = localStorage.getItem('token');
  const [gotoPage, setGotoPage] = useState('');
  const [hasCreatePermission, sethasCreatePermission] = useState(false);
  const [hasUpdatePermission, sethasUpdatePermission] = useState(false);
  const [hasDeletePermission, sethasDeletePermission] = useState(false);

    useEffect(() => {
            const storedUser = localStorage.getItem('user');
            if (storedUser ) {
                try {
                    const user = JSON.parse(storedUser); // Parse dữ liệu user
                    const permissions = user.permissions || [];
                    sethasCreatePermission(permissions.some(permission => permission.code === 'permission.create'));
                    sethasUpdatePermission(permissions.some(permission => permission.code === 'permission.update'));
                    sethasDeletePermission(permissions.some(permission => permission.code === 'permission.delete'));
  
                } catch (error) {
                    console.error('Error parsing permissions:', error);
                }
            }
        }, []);
  useEffect(() => { setGotoPage(''); }, [filters.page]);

  // Fetch permissions and filter options from API
  const fetchPermissions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchDataFromAPI('/api/permissions', token + '', { params: filters });
      const perms = response.data?.permissions || response.permissions || [];
      setPermissions(perms);
      setPagination(response.data?.pagination || response.pagination || {});
      setModules(response.data?.filters?.modules || response.filters?.modules || []);
      setActions(response.data?.filters?.actions || response.filters?.actions || []);
      setError(null);
    } catch (err) {
      setError(handleErrorResponse(err));
    } finally {
      setLoading(false);
    }
  }, [filters, token]);

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

  // Sau useEffect cho filters.perPage
  useEffect(() => {
    fetchPermissions();
  }, [filters.perPage]);

  // Handle delete permission
  const handleDelete = async (id, name) => {
    setDeleteDialog({ open: true, permissionId: id, name });
  };

  const confirmDelete = async () => {
    const { permissionId } = deleteDialog;
    try {
      const response = await deleteData(`/api/permissions/${permissionId}`, token);
      setAlertBox({
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
      setAlertBox({
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
      setAlertBox({
        open: true,
        error: true,
        msg: 'Vui lòng chọn ít nhất một quyền để xóa'
      });
      return;
    }
    if (!window.confirm(`Bạn có chắc muốn xóa ${selectedPermissions.size} quyền?`)) return;
    
    console.log('Selected permissions:', Array.from(selectedPermissions));
    console.log('Token:', token);
    
    try {
      await deleteData('/api/permissions/bulk/delete', { 
        ids: Array.from(selectedPermissions) 
      }, token);
      setAlertBox({
        open: true,
        error: false,
        msg: `Xóa thành công ${selectedPermissions.size} quyền!`
      });
      setSelectedPermissions(new Set());
      fetchPermissions();
    } catch (err) {
      setAlertBox({
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

  // Update handleRefresh to only reset filters and selectedPermissions
  const handleRefresh = () => {
    setFilters({
      page: 1,
      perPage: 10,
      module: '',
      action: '',
      search: '',
      isActive: 'all',
      sortBy: 'module',
      sortOrder: 'asc'
    });
    setSelectedPermissions(new Set());
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

  // Handle select all
  const handleSelectAll = () => {
    if (selectedPermissions.size === permissions.length && permissions.length > 0) {
      setSelectedPermissions(new Set());
    } else {
      setSelectedPermissions(new Set(permissions.map(p => p.id)));
    }
  };

  // Add export to Excel/CSV
  const handleExport = (type = 'xlsx') => {
    const exportData = permissions.map(p => ({
      Module: p.module,
      Action: p.action,
      Code: p.code,
      Description: p.description,
      Status: p.is_active ? 'Active' : 'Inactive'
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Permissions');
    XLSX.writeFile(wb, `permissions.${type}`);
  };

  // Import from Excel/CSV
  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const imported = XLSX.utils.sheet_to_json(sheet);
      // Optionally: send imported data to backend
      // For now, just show a success alert
      setAlertBox({ open: true, error: false, msg: `Đã nhập ${imported.length} quyền (chưa lưu vào hệ thống)` });
      setImportDialogOpen(false);
    };
    reader.readAsArrayBuffer(file);
  };

  // Permission history effect
  useEffect(() => {
    if (historyDialog.open && historyDialog.permission) {
      (async () => {
        const token = localStorage.getItem('token');
        const res = await fetchDataFromAPI(`/api/permissions/${historyDialog.permission.id}/history`, token);
        setHistoryData(res.data?.history || []);
      })();
    }
  }, [historyDialog]);

  const getActiveChip = (isActive) => {
    if (isActive) {
      return <Chip label="Hoạt động" size="small" sx={{ fontWeight: 700, fontSize: '0.8rem', px: 1.5, bgcolor: '#e8f5e9', color: '#2e7d32', border: '1px solid #81c784' }} />;
    } else {
      return <Chip label="Không hoạt động" size="small" sx={{ fontWeight: 700, fontSize: '0.8rem', px: 1.5, bgcolor: '#ffebee', color: '#d32f2f', border: '1px solid #e57373' }} />;
    }
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
                  Quản lý quyền
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  Quản lý và phân quyền truy cập cho các chức năng trong hệ thống
                </Typography>
              </Box>
              <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
                <Breadcrumbs sx={{ '& .MuiBreadcrumbs-ol': { flexWrap: 'nowrap', overflow: 'hidden' } }}>
                  <StyledBreadcrumb
                    label="Trang chủ"
                    icon={<HomeIcon fontSize="small" />}
                    onClick={() => window.location.href = '/'}
                  />
                  <StyledBreadcrumb
                    label="Quản lý quyền"
                    icon={<ExpandMoreIcon fontSize="small" />}
                  />
                </Breadcrumbs>
                {hasCreatePermission && (
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
                  Thêm quyền
                </Button>
                )}
                
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
          <Box sx={{ p: 3 }}>
            <Grid container spacing={3} alignItems="center">
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  fullWidth
                  label="Tìm kiếm"
                  value={filters.search || ''}
                  onChange={e => setFilters(prev => ({ ...prev, search: e.target.value, page: 1 }))}
                  placeholder="Module, hành động, mã quyền..."
                  size="small"
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      '&:hover fieldset': {
                        borderColor: '#1976d2',
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: '#1976d2',
                      },
                    },
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Module</InputLabel>
                  <Select
                    value={filters.module || ''}
                    onChange={e => setFilters(prev => ({ ...prev, module: e.target.value, page: 1 }))}
                    label="Module"
                    sx={{ borderRadius: 2 }}
                  >
                    <MenuItem value="">Tất cả</MenuItem>
                    {modules.map((m) => (
                      <MenuItem key={m} value={m}>{m}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Hành động</InputLabel>
                  <Select
                    value={filters.action || ''}
                    onChange={e => setFilters(prev => ({ ...prev, action: e.target.value, page: 1 }))}
                    label="Hành động"
                    sx={{ borderRadius: 2 }}
                  >
                    <MenuItem value="">Tất cả</MenuItem>
                    {actions.map((a) => (
                      <MenuItem key={a} value={a}>{a}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Trạng thái</InputLabel>
                  <Select
                    value={filters.isActive || 'all'}
                    onChange={e => setFilters(prev => ({ ...prev, isActive: e.target.value, page: 1 }))}
                    label="Trạng thái"
                    sx={{
                      borderRadius: 2,
                      '& .MuiOutlinedInput-notchedOutline': {
                        '&:hover': {
                          borderColor: '#1976d2',
                        },
                      },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#1976d2',
                      },
                    }}
                  >
                    <MenuItem value="all">Tất cả</MenuItem>
                    <MenuItem value="true">Hoạt động</MenuItem>
                    <MenuItem value="false">Không hoạt động</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={fetchPermissions}
                  disabled={loading}
                  sx={{
                    borderRadius: 2,
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
                  Làm mới
                </Button>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                {selectedPermissions.size > 0 && (
                  <Button
                    fullWidth
                    variant="outlined"
                    color="error"
                    startIcon={<BiSolidTrashAlt />}
                    onClick={handleBulkDelete}
                    sx={{
                      borderRadius: 2,
                      py: 1.5,
                      textTransform: 'none',
                      fontWeight: 600,
                      '&:hover': {
                        backgroundColor: 'rgba(244, 67, 54, 0.04)',
                      },
                    }}
                  >
                    Xóa đã chọn ({selectedPermissions.size})
                  </Button>
                )}
              </Grid>
            </Grid>
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
        ) : (
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
                    <TableCell sx={{ width: 60 }}>STT</TableCell>
                    {visibleColumns.module && <TableCell>Module</TableCell>}
                    {visibleColumns.action && <TableCell>Hành động</TableCell>}
                    {visibleColumns.code && <TableCell>Mã quyền</TableCell>}
                    {visibleColumns.description && <TableCell>Mô tả</TableCell>}
                    {visibleColumns.is_active && <TableCell>Trạng thái</TableCell>}
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
                        <TableCell>{(filters.page - 1) * filters.perPage + index + 1}</TableCell>
                        {visibleColumns.module && <TableCell>
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
                        </TableCell>}
                        {visibleColumns.action && <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {permission.action}
                          </Typography>
                        </TableCell>}
                        {visibleColumns.code && <TableCell>
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
                        </TableCell>}
                        {visibleColumns.description && <TableCell>
                          <Typography variant="body2" color="text.secondary" sx={{
                            maxWidth: 200,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {permission.description || '-'}
                          </Typography>
                        </TableCell>}
                        {visibleColumns.is_active && (
                          <TableCell>
                            {getActiveChip(permission.is_active)}
                          </TableCell>
                        )}
                        <TableCell align="center">
                          <Box display="flex" justifyContent="center" gap={1}>
                            {hasUpdatePermission && (
                               <IconButton
                              size="small"
                              title="Chỉnh sửa quyền"
                              onClick={() => openModal('update', permission)}
                              sx={{ color: '#ff9800', backgroundColor: 'rgba(255, 152, 0, 0.1)', '&:hover': { backgroundColor: 'rgba(255, 152, 0, 0.2)' } }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                            )}
                           {hasDeletePermission && (
                            <IconButton
                              size="small"
                              title="Xóa quyền"
                              onClick={() => handleDelete(permission.id, permission.code)}
                              sx={{ color: '#f44336', backgroundColor: 'rgba(244, 67, 54, 0.1)', '&:hover': { backgroundColor: 'rgba(244, 67, 54, 0.2)' } }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                           )}
                            
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            
            {/* Enhanced Pagination */}
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'stretch', md: 'center' }, justifyContent: 'space-between', gap: 2, p: 2, borderTop: '1px solid #e0e0e0', backgroundColor: '#fafafa' }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                Hiển thị <strong>{((filters.page - 1) * filters.perPage) + 1} - {Math.min(filters.page * filters.perPage, pagination.totalPermissions)}</strong> của <strong>{pagination.totalPermissions}</strong> quyền
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: 'center', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" color="text.secondary">Hiển thị:</Typography>
                  <Select value={filters.perPage} onChange={e => setFilters(prev => ({ ...prev, perPage: e.target.value, page: 1 }))} size="small" sx={{ minWidth: 80, '& .MuiSelect-select': { py: 0.5, fontSize: '0.875rem' } }}
                    renderValue={v => `${v}/ trang`}
                  >
                    {[5, 10, 20, 50, 100].map(size => (
                      <MenuItem key={size} value={size}>{size}/ trang</MenuItem>
                    ))}
                  </Select>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Button size="small" variant="outlined" onClick={() => setFilters(prev => ({ ...prev, page: 1 }))} disabled={filters.page === 1} sx={{ minWidth: 32, width: 32, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}><FirstPage fontSize="small" /></Button>
                  <Button size="small" variant="outlined" onClick={() => setFilters(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))} disabled={filters.page === 1} sx={{ minWidth: 32, width: 32, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}><ChevronLeft fontSize="small" /></Button>
                  {getPaginationItems(filters.page, pagination.totalPages || 1).map((item, idx) => (
                    item === '...'
                      ? <Box key={`dots-${idx}`} sx={{ px: 1, color: '#999' }}>...</Box>
                      : <Button key={item} variant={item === filters.page ? 'contained' : 'outlined'} size="small" onClick={() => setFilters(prev => ({ ...prev, page: item }))} sx={{ minWidth: 32, width: 32, height: 32, borderRadius: 1, fontSize: '0.875rem', fontWeight: item === filters.page ? 600 : 400, ...(item === filters.page ? { backgroundColor: '#1976d2', color: 'white', border: 'none', '&:hover': { backgroundColor: '#1565c0' } } : { borderColor: '#e0e0e0', color: '#666', '&:hover': { backgroundColor: '#f5f5f5', borderColor: '#1976d2' } }) }}>{item}</Button>
                  ))}
                  <Button size="small" variant="outlined" onClick={() => setFilters(prev => ({ ...prev, page: Math.min(pagination.totalPages || 1, prev.page + 1) }))} disabled={filters.page === (pagination.totalPages || 1)} sx={{ minWidth: 32, width: 32, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}><ChevronRight fontSize="small" /></Button>
                  <Button size="small" variant="outlined" onClick={() => setFilters(prev => ({ ...prev, page: (pagination.totalPages || 1) }))} disabled={filters.page === (pagination.totalPages || 1)} sx={{ minWidth: 32, width: 32, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}><LastPage fontSize="small" /></Button>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" color="text.secondary">Đến trang:</Typography>
                  <InputBase value={gotoPage} onChange={e => setGotoPage(e.target.value.replace(/[^0-9]/g, ''))} onKeyDown={e => { if (e.key === 'Enter') { const page = parseInt(gotoPage, 10); if (page && page >= 1 && page <= (pagination.totalPages || 1)) { setFilters(prev => ({ ...prev, page })); setGotoPage(''); } } }} placeholder="1" sx={{ width: 60, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, px: 1, fontSize: '0.875rem', '& input': { textAlign: 'center' } }} />
                  <Button size="small" variant="outlined" onClick={() => { const page = parseInt(gotoPage, 10); if (page && page >= 1 && page <= (pagination.totalPages || 1)) { setFilters(prev => ({ ...prev, page })); setGotoPage(''); } }} disabled={!gotoPage || parseInt(gotoPage, 10) < 1 || parseInt(gotoPage, 10) > (pagination.totalPages || 1)} sx={{ minWidth: 'auto', px: 2, height: 32, textTransform: 'none', fontSize: '0.875rem' }}>Đi</Button>
                </Box>
              </Box>
            </Box>
          </Card>
        )}
      </Box>

      {/* Floating Action Button */}
      {hasCreatePermission && (
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
      )}
      

      {/* Create Permission Dialog */}
      <CreatePermissionDialog
        open={modal.isOpen && modal.type === 'create'}
        handleClose={() => setModal({ isOpen: false, type: '', data: null })}
        onPermissionCreated={fetchPermissions}
        setAlertBox={setAlertBox}
      />
      
      {/* Update Permission Dialog */}
      <UpdatePermissionDialog
        open={modal.isOpen && modal.type === 'update'}
        handleClose={() => setModal({ isOpen: false, type: '', data: null })}
        permission={modal.data}
        onPermissionUpdated={fetchPermissions}
        setAlertBox={setAlertBox}
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

      {/* Import Dialog */}
      <Dialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Nhập quyền từ file</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Chọn file Excel hoặc CSV chứa danh sách quyền cần nhập. Hệ thống sẽ tự động phân tích và tạo quyền tương ứng.
          </Typography>
          <Button
            variant="outlined"
            component="label"
            fullWidth
            sx={{
              borderRadius: 2,
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
            Tải file mẫu
            <input type="file" accept=".xlsx,.csv" hidden onChange={handleImport} />
          </Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportDialogOpen(false)}>Đóng</Button>
        </DialogActions>
      </Dialog>

      {/* Column customization dialog */}
      <Dialog
        open={columnDialogOpen}
        onClose={() => setColumnDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Tùy chỉnh cột hiển thị</DialogTitle>
        <DialogContent>
          {Object.keys(visibleColumns).map(col => (
            <FormControlLabel
              key={col}
              control={<Checkbox checked={visibleColumns[col]} onChange={() => setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }))} />}
              label={col}
            />
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setColumnDialogOpen(false)}>Đóng</Button>
        </DialogActions>
      </Dialog>

      {/* Alert/Snackbar at the root of Permissions */}
      {alertBox.open && (
        <Alert
          severity={alertBox.error ? 'error' : 'success'}
          onClose={() => setAlertBox({ ...alertBox, open: false })}
          sx={{ position: 'fixed', top: 24, right: 24, zIndex: 9999, minWidth: 300 }}
        >
          {alertBox.msg}
        </Alert>
      )}
    </Box>
  );
};

export default Permissions;