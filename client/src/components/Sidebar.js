import React, { useState, useEffect } from "react";
import {
  Box,
  Avatar,
  Typography,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Switch,
  Button,
  LinearProgress,
  Paper,
  Collapse,
  Chip,
} from "@mui/material";
import {
  Home as HomeIcon,
  DirectionsCar as LicensePlateIcon,
  Route as RouteIcon,
  Search as SearchIcon,
  CheckCircleOutline as WhiteListIcon,
  BlockOutlined as BlackListIcon,
  SupervisorAccount as UserManagementIcon,
  PeopleOutline as UsersIcon,
  SecurityOutlined as PermissionIcon,
  BadgeOutlined as RoleIcon,
  PersonAddAlt as UserPermissionIcon,
  ExitToApp as LogoutIcon,
  ExpandLess,
  ExpandMore,
  SmartToy as AiIcon,
  Videocam as CameraIcon,
  PlayCircleOutline as PlayIcon,
} from "@mui/icons-material";
import { fetchDataFromAPI } from '../utils/auth';

const SIDEBAR_WIDTH = 260;

const menuGroups = [
  {
    label: '',
    items: [
      { text: 'Trang chủ', icon: <HomeIcon />, path: '/' },
      { text: 'Nhận diện biển số xe', icon: <LicensePlateIcon />, path: '/license-plate' },
      { text: 'Giám sát theo lộ trình', icon: <RouteIcon />, path: '/route-monitoring' },
      { text: 'Tra cứu', icon: <SearchIcon />, path: '/search' },
      { text: 'WhiteList', icon: <WhiteListIcon />, path: '/whitelist' },
      { text: 'BlackList', icon: <BlackListIcon />, path: '/blacklist' },
      {
        text: 'Quản lý người dùng và phân quyền',
        icon: <UserManagementIcon />,
        path: '/user-management',
        children: [
          { text: 'Quản lý người dùng', icon: <UsersIcon />, path: '/user' },
          { text: 'Quản lý quyền', icon: <PermissionIcon />, path: '/permissions' },
          { text: 'Quản lý vai trò', icon: <RoleIcon />, path: '/roles' },
        ]
      },
    ]
  }
];

function Sidebar({ user, onLogout, navigate, currentPath, handleCameraClick }) {
  // Debug: Log user object
  useEffect(() => {
  }, [user]);

  // Thời gian thực
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // State cho việc mở/đóng submenu
  const [openSubmenus, setOpenSubmenus] = useState({});
  const [isCameraListOpen, setIsCameraListOpen] = useState(false);
  const [cameras, setCameras] = useState([]);

  // Camera state
  const totalCameras = 46;

  // Trạng thái AI
  const [aiStatus, setAiStatus] = useState(true);

  // Fetch cameras data
  useEffect(() => {
    const fetchCameras = async () => {
      try {
        const token = localStorage.getItem("token");
        const data = await fetchDataFromAPI("/api/cameras/streams/all", token);
        const cameraList = data.data.cameras || [];
        let activeCamerasList = cameraList.filter(
          (camera) => camera.connection_status === "online"
        );
        if (activeCamerasList.length === 0) {
          // Nếu không có camera online, hiển thị tất cả camera để debug
          activeCamerasList = cameraList;
        }
        setCameras(activeCamerasList);
      } catch (error) {
        console.error("Sidebar Error fetching cameras:", error);
      }
    };
    fetchCameras();
  }, []);

  // Hàm toggle submenu
  const handleSubmenuToggle = (itemText) => {
    setOpenSubmenus(prev => ({
      ...prev,
      [itemText]: !prev[itemText]
    }));
  };

  const handleCameraToggle = () => {
    setIsCameraListOpen(!isCameraListOpen);
  };

  const handleCameraSelect = (cameraId) => {

    // Gọi hàm từ SamplePage để mở luồng mới
    if (window.startCameraStream) {
      window.startCameraStream(cameraId.toString());
    }

    // Chuyển hướng nếu cần
    if (currentPath !== "/route-monitoring") {
      navigate("/route-monitoring");
    }
  };

  // Tính số camera đang hoạt động
  const activeCameras = cameras.length;

  // Helper function để check permission
  const hasPermission = (permissionCode) => {
    if (!user || !user.permissions) return false;
    return user.permissions.some(permission => permission.code === permissionCode);
  };

  // Helper function để check role
  const hasRole = (roleName) => {
    if (!user || !user.roles) return false;
    return user.roles.some(role => role.name === roleName);
  };

  // Filter menu items based on permissions (hiện tại hiển thị tất cả)
  const filterMenuItems = (items) => {
    return items.filter(item => {
      // Hiển thị tất cả menu items
      return true;
    });
  };

  // Lấy tên hiển thị từ user object
  const getDisplayName = () => {
    if (!user) return 'Đang tải...';
    
    // Ưu tiên: name -> username -> email
    if (user.name && user.name.trim()) {
      return user.name;
    }
    if (user.username && user.username.trim()) {
      return user.username;
    }
    if (user.email && user.email.trim()) {
      return user.email;
    }
    
    return 'Người dùng';
  };

  // Lấy avatar URL hoặc tạo initials
  const getAvatarContent = () => {
    if (user?.avatar) {
      return user.avatar;
    }
    
    // Tạo initials từ name hoặc username
    const name = user?.name || user?.username || user?.email || 'U';
    const initials = name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .substring(0, 2)
      .toUpperCase();
    
    return initials;
  };

  return (
    <Box sx={{
      width: SIDEBAR_WIDTH,
      minWidth: SIDEBAR_WIDTH,
      maxWidth: SIDEBAR_WIDTH,
      bgcolor: '#f7fafd',
      height: '100vh',
      borderRight: 'none',
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 1200,
      overflow: 'hidden',
      boxShadow: '4px 0 15px rgba(0, 0, 0, 0.1)',
    }}>
      {/* User Info */}
      <Box sx={{
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        pt: 2, 
        pb: 2, 
        mb: 1,
        bgcolor: '#fff', 
        borderRadius: 3, 
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)', 
        border: '1px solid #e3e3e3',
        mx: 1, 
        mt: 1,
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: 'linear-gradient(90deg, #1976d2, #42a5f5)'
        }
      }}>
        <Box sx={{ position: 'relative', mb: 1 }}>
          <Avatar 
            src={user?.avatar ? user.avatar : "/logo-user.png"}
            alt="avatar" 
            sx={{ 
              width: 70, 
              height: 70, 
              bgcolor: '#e0e0e0', 
              fontSize: 32, 
              border: '3px solid #1976d2',
              boxShadow: '0 4px 8px rgba(25, 118, 210, 0.3)',
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'scale(1.05)',
                boxShadow: '0 6px 12px rgba(25, 118, 210, 0.4)'
              }
            }} 
          >
            {!user?.avatar && getAvatarContent()}
          </Avatar>
          <Box sx={{
            position: 'absolute',
            bottom: 2,
            right: 2,
            width: 16,
            height: 16,
            borderRadius: '50%',
            bgcolor: '#4CAF50',
            border: '2px solid white',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }} />
        </Box>
        
        <Typography 
          variant="subtitle1" 
          fontWeight={700} 
          sx={{ 
            textAlign: 'center', 
            width: '100%', 
            fontSize: 16, 
            color: '#222', 
            mb: 0.5,
            wordBreak: 'break-word',
            px: 1
          }}
        >
          {getDisplayName()}
        </Typography>
        
        {/* Hiển thị role nếu có */}
        {user?.roles && user.roles.length > 0 && (
          <Chip 
            label={user.roles[0].name} 
            size="small" 
            sx={{ 
              bgcolor: '#e8f5e9', 
              color: '#2e7d32',
              fontWeight: 500,
              fontSize: 11,
              mb: 0.5
            }} 
          />
        )}
        
        <Chip 
          label="Đang hoạt động" 
          size="small" 
          sx={{ 
            bgcolor: '#e3f2fd', 
            color: '#1565c0',
            fontWeight: 500,
            fontSize: 11
          }} 
        />
      </Box>

      {/* Đồng hồ */}
      <Paper elevation={0} sx={{ 
        mx: 1, 
        mb: 1, 
        p: 1.5, 
        textAlign: 'center', 
        borderRadius: 3, 
        bgcolor: '#e3f2fd',
        border: '1px solid #bbdefb',
        transition: 'all 0.3s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: '0 4px 12px rgba(25, 118, 210, 0.15)'
        }
      }}>
        <Typography variant="body2" sx={{ 
          fontWeight: 500, 
          fontSize: 12, 
          color: '#1565c0',
          mb: 0.5
        }}>
          {time.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </Typography>
        <Typography variant="h6" sx={{ 
          fontFamily: 'monospace', 
          mt: 1, 
          fontWeight: 700, 
          fontSize: 18,
          color: '#0d47a1',
          textShadow: '0 1px 2px rgba(0,0,0,0.1)'
        }}>
          {time.toLocaleTimeString('vi-VN')}
        </Typography>
      </Paper>

      {/* Trạng thái AI */}
      <Paper elevation={0} sx={{ 
        mx: 1, 
        mb: 1, 
        p: 1.5, 
        display: 'flex', 
        alignItems: 'center', 
        borderRadius: 3, 
        bgcolor: aiStatus ? '#e8f5e9' : '#fafafa',
        border: `1px solid ${aiStatus ? '#c8e6c9' : '#e0e0e0'}`,
        transition: 'all 0.3s ease',
        '&:hover': {
          transform: 'translateY(-1px)',
          boxShadow: '0 3px 8px rgba(0,0,0,0.1)'
        }
      }}>
        <AiIcon sx={{ 
          color: aiStatus ? '#2e7d32' : '#757575', 
          mr: 1,
          transition: 'all 0.3s ease',
          animation: aiStatus ? 'pulse 2s infinite' : 'none',
          '@keyframes pulse': {
            '0%': { opacity: 1 },
            '50%': { opacity: 0.7 },
            '100%': { opacity: 1 }
          }
        }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="body2" sx={{ 
            fontWeight: 600, 
            fontSize: 13, 
            color: '#333',
            mb: 0.2
          }}>
            Trạng thái AI
          </Typography>
          <Typography variant="caption" sx={{ 
            color: aiStatus ? '#2e7d32' : '#757575',
            fontSize: 10,
            fontWeight: 500
          }}>
            {aiStatus ? 'Đang hoạt động' : 'Tạm dừng'}
          </Typography>
        </Box>
        <Switch 
          checked={aiStatus} 
          onChange={() => setAiStatus(!aiStatus)} 
          color="success" 
          size="small"
        />
      </Paper>

      {/* Progress camera */}
      <Paper elevation={0} sx={{ 
        mx: 1, 
        mb: 2, 
        p: 1.5, 
        borderRadius: 3, 
        bgcolor: '#fffde7',
        border: '1px solid #fff176',
        transition: 'all 0.3s ease',
        '&:hover': {
          transform: 'translateY(-1px)',
          boxShadow: '0 3px 8px rgba(255, 193, 7, 0.2)'
        }
      }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            mb: 1,
            cursor: "pointer",
            "&:hover": {
              "& .MuiTypography-root": {
                color: "#d84315",
              },
            },
          }}
          onClick={handleCameraToggle}
        >
          <CameraIcon sx={{ color: "#f57f17", mr: 1, fontSize: 18 }} />
          <Typography
            variant="caption"
            sx={{
              fontWeight: 600,
              fontSize: 12,
              color: "#e65100",
              flex: 1,
            }}
          >
            Các camera hoạt động
          </Typography>
          {isCameraListOpen ? <ExpandLess /> : <ExpandMore />}
        </Box>
        <LinearProgress 
          variant="determinate" 
          value={totalCameras === 0 ? 0 : (activeCameras / totalCameras) * 100} 
          sx={{ 
            my: 1, 
            height: 8, 
            borderRadius: 4, 
            bgcolor: '#fff8e1',
            '& .MuiLinearProgress-bar': {
              borderRadius: 4,
              background: 'linear-gradient(90deg, #ff9800, #ffc107)'
            }
          }} 
        />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="caption" sx={{ 
            fontWeight: 500, 
            fontSize: 11,
            color: '#e65100'
          }}>
            {activeCameras} / {totalCameras} camera
          </Typography>
          <Typography variant="caption" sx={{ 
            fontWeight: 600, 
            fontSize: 11,
            color: '#ff9800'
          }}>
            {totalCameras === 0 ? 0 : Math.round((activeCameras / totalCameras) * 100)}%
          </Typography>
        </Box>
        <Collapse in={isCameraListOpen} timeout="auto" unmountOnExit>
          <List dense sx={{ mt: 1, maxHeight: 200, overflowY: "auto" }}>
            {cameras.length > 0 ? (
              cameras.map((camera) => (
                <ListItem
                  key={camera.id}
                  button
                  onClick={() => handleCameraSelect(camera.id)}
                  sx={{
                    borderRadius: 2,
                    mb: 0.5,
                    pl: 2,
                    pr: 1,
                    py: 0.5,
                    transition: "all 0.3s ease",
                    "&:hover": {
                      bgcolor: "#f3e5f5",
                      transform: "translateX(4px)",
                      boxShadow: "0 2px 8px rgba(156, 39, 176, 0.2)",
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 24 }}>
                    <PlayIcon sx={{ fontSize: 16, color: "#4caf50" }} />
                  </ListItemIcon>
                  <ListItemText
                    primary={camera.name || `Camera ${camera.id}`}
                    secondary={`${camera.protocol?.toUpperCase()} - ${
                      camera.status
                    }`}
                    primaryTypographyProps={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "#333",
                    }}
                    secondaryTypographyProps={{
                      fontSize: 11,
                      color: "#666",
                    }}
                  />
                </ListItem>
              ))
            ) : (
              <ListItem>
                <ListItemText
                  primary="Không có camera nào hoạt động"
                  primaryTypographyProps={{
                    color: "#757575",
                    fontSize: 12,
                    textAlign: "center",
                  }}
                />
              </ListItem>
            )}
          </List>
        </Collapse>
      </Paper>

      {/* Menu */}
      <Box sx={{ 
        flex: 1, 
        overflowY: 'auto', 
        pt: 1, 
        px: 0.5, 
        pb: 1, 
        bgcolor: '#f7fafd',
        '&::-webkit-scrollbar': {
          width: 6
        },
        '&::-webkit-scrollbar-track': {
          background: '#f1f1f1',
          borderRadius: 3
        },
        '&::-webkit-scrollbar-thumb': {
          background: '#c1c1c1',
          borderRadius: 3,
          '&:hover': {
            background: '#a1a1a1'
          }
        }
      }}>
        {menuGroups.map((group, idx) => {
          const filteredItems = filterMenuItems([...group.items]);
          
          if (filteredItems.length === 0) return null;
          
          return (
            <List key={idx} dense sx={{ mb: 1 }}>
              {group.label && (
                <Typography variant="caption" sx={{ pl: 2, pt: 1 }}>{group.label}</Typography>
              )}
              {filteredItems.map(item => (
                <React.Fragment key={item.text}>
                  <ListItem
                    button
                    selected={currentPath === item.path || (item.children && item.children.some(child => currentPath === child.path))}
                    onClick={() => {
                      if (item.children) {
                        handleSubmenuToggle(item.text);
                      } else {
                        navigate(item.path);
                      }
                    }}
                    sx={{ 
                      borderRadius: 3, 
                      mb: 0.5, 
                      mx: 0.5, 
                      pl: 1.5, 
                      pr: 1,
                      py: 1,
                      transition: 'background 0.2s, color 0.2s, border 0.2s',
                      borderLeft: currentPath === item.path || (item.children && item.children.some(child => currentPath === child.path))
                        ? '4px solid #1976d2'
                        : '4px solid transparent',
                      backgroundColor: currentPath === item.path || (item.children && item.children.some(child => currentPath === child.path))
                        ? '#e0f2f1'
                        : 'transparent',
                      color: currentPath === item.path || (item.children && item.children.some(child => currentPath === child.path))
                        ? '#00796b'
                        : 'inherit',
                      boxShadow: currentPath === item.path || (item.children && item.children.some(child => currentPath === child.path))
                        ? '0 2px 8px rgba(0, 121, 107, 0.2)'
                        : 'none',
                      '&:hover': {
                        backgroundColor: '#e3f2fd',
                        color: '#1976d2',
                        borderLeft: '4px solid #1976d2',
                        boxShadow: '0 2px 8px rgba(25, 118, 210, 0.10)'
                      },
                      fontSize: 14 
                    }}
                  >
                    <ListItemIcon sx={{ 
                      minWidth: 36,
                      color: currentPath === item.path || (item.children && item.children.some(child => currentPath === child.path))
                        ? '#1976d2'
                        : 'inherit',
                      transition: 'color 0.2s'
                    }}>
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText 
                      primary={item.text} 
                      primaryTypographyProps={{ 
                        fontSize: 14,
                        fontWeight: 500
                      }} 
                    />
                    {item.children && (
                      <Box sx={{ 
                        transition: 'transform 0.3s ease',
                        transform: openSubmenus[item.text] ? 'rotate(180deg)' : 'rotate(0deg)'
                      }}>
                        <ExpandMore />
                      </Box>
                    )}
                  </ListItem>
                  
                  {/* Submenu */}
                  {item.children && (
                    <Collapse in={openSubmenus[item.text]} timeout="auto" unmountOnExit>
                      <List component="div" disablePadding>
                        {item.children.map(child => (
                          <ListItem
                            button
                            key={child.text}
                            selected={currentPath === child.path}
                            onClick={() => navigate(child.path)}
                            sx={{ 
                              borderRadius: 2, 
                              mb: 0.5, 
                              mx: 0.5, 
                              pl: 4, 
                              pr: 1,
                              py: 0.8,
                              transition: 'background 0.2s, color 0.2s, border 0.2s',
                              borderLeft: currentPath === child.path
                                ? '4px solid #1976d2'
                                : '4px solid transparent',
                              backgroundColor: currentPath === child.path
                                ? '#e0f2f1'
                                : 'transparent',
                              color: currentPath === child.path
                                ? '#00796b'
                                : 'inherit',
                              '&:hover': {
                                backgroundColor: '#f3e5f5',
                                color: '#7b1fa2',
                                borderLeft: '4px solid #7b1fa2',
                              },
                              fontSize: 13 
                            }}
                          >
                            <ListItemIcon sx={{ 
                              minWidth: 28,
                              color: currentPath === child.path
                                ? '#7b1fa2'
                                : 'inherit',
                              transition: 'color 0.2s'
                            }}>
                              {child.icon}
                            </ListItemIcon>
                            <ListItemText 
                              primary={child.text} 
                              primaryTypographyProps={{ 
                                fontSize: 13,
                                fontWeight: 400
                              }} 
                            />
                          </ListItem>
                        ))}
                      </List>
                    </Collapse>
                  )}
                </React.Fragment>
              ))}
            </List>
          );
        })}
      </Box>

      {/* Đăng xuất */}
      <Box sx={{ p: 1.5, pt: 0, pb: 2, mt: 'auto', bgcolor: '#ffebee' }}>
        <Button
          variant="outlined"
          color="error"
          size="large"
          startIcon={<LogoutIcon />}
          onClick={onLogout}
          fullWidth
          sx={{ 
            fontWeight: 700, 
            borderRadius: 3, 
            bgcolor: '#fff', 
            borderColor: '#ffcdd2', 
            color: '#d32f2f', 
            fontSize: 14,
            py: 1.2,
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': { 
              bgcolor: '#ffebee', 
              borderColor: '#e57373',
              transform: 'translateY(-2px)',
              boxShadow: '0 4px 12px rgba(211, 47, 47, 0.3)'
            }
          }}
        >
          ĐĂNG XUẤT
        </Button>
      </Box>
    </Box>
  );
}

export default Sidebar;