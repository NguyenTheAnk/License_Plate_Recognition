import React from 'react';
import Sidebar from './Sidebar';
import { useNavigate, useLocation } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Box, IconButton, CssBaseline } from '@mui/material';

const SIDEBAR_WIDTH = 270;

function Layout({ children, handleLogout, user }) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <CssBaseline />
      <Sidebar user={user} onLogout={handleLogout} navigate={navigate} currentPath={location.pathname} />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <AppBar position="fixed" sx={{ zIndex: 1201, ml: `${SIDEBAR_WIDTH}px`, width: `calc(100% - ${SIDEBAR_WIDTH}px)` }}>
          <Toolbar>
            <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
              Hệ thống nhận diện biển số xe
            </Typography>
            <IconButton color="inherit" onClick={handleLogout}>
            </IconButton>
          </Toolbar>
        </AppBar>
        <Box component="main" sx={{ flex: 1, p: 3, mt: 8, ml: `${SIDEBAR_WIDTH}px` }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}

export default Layout; 