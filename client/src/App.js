import React, { useState, useEffect, createContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Dashboard from './components/Dashboard';
import Layout from './components/Layout';
import PrivateRoute from './components/PrivateRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import User from './pages/User/User';
import UserDetail from './pages/User/UserDetail';
import Roles from './pages/Roles';
import Permissions from './pages/Permissions';
import axios from 'axios';

// Tạo Context để chia sẻ data giữa các components
export const MyContext = createContext();

const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#f50057',
    },
    background: {
      default: '#f4f6fa',
      paper: '#fff',
    },
  },
});

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(null);

  useEffect(() => {
    // Khởi tạo user từ localStorage
    const initUser = () => {
      const storedToken = localStorage.getItem('token');
      const userData = localStorage.getItem('user');
      
      if (storedToken && userData) {
        try {
          const parsedUser = JSON.parse(userData);
          console.log('=== APP.JS DEBUG ===');
          console.log('Parsed user from localStorage:', parsedUser);
          setUser(parsedUser);
          setToken(storedToken);
        } catch (error) {
          console.error('Error parsing user data:', error);
          // Clear corrupted data
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          localStorage.removeItem('refreshToken');
          setUser(null);
          setToken(null);
        }
      } else {
        setUser(null);
        setToken(null);
      }
      setLoading(false);
    };

    initUser();
  }, []);

  const handleLogin = (userData, userToken) => {
    console.log('=== HANDLE LOGIN ===');
    console.log('User data received:', userData);
    console.log('Token received:', userToken);
    setUser(userData);
    setToken(userToken);
  };

  const handleLogout = async () => {
    const currentToken = localStorage.getItem('token');
    if (currentToken) {
      try {
        await axios.post('http://localhost:5000/api/auth/logout', {}, {
          headers: { Authorization: `Bearer ${currentToken}` }
        });
      } catch (e) {
        console.error('Logout API error:', e);
        // Có thể bỏ qua lỗi logout API
      }
    }
    
    // Clear all auth data
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('passwordExpired');
    
    setUser(null);
    setToken(null);
  };

  // Context value để chia sẻ với các components con
  const contextValue = {
    user,
    setUser,
    token,
    setToken,
    handleLogout,
    isLoggedIn: !!user && !!token
  };

  // Loading state
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#f4f6fa'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40,
            height: 40,
            border: '4px solid #f3f3f3',
            borderTop: '4px solid #1976d2',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }}></div>
          <div style={{ color: '#666', fontSize: 16 }}>Đang tải...</div>
        </div>
        <style>
          {`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    );
  }

  return (
    <MyContext.Provider value={contextValue}>
      <BrowserRouter>
        <ThemeProvider theme={lightTheme}>
          <CssBaseline />
          <Routes>
            <Route 
              path="/login" 
              element={
                user ? <Navigate to="/" replace /> : <Login onLogin={handleLogin} />
              } 
            />
            <Route 
              path="/register" 
              element={
                user ? <Navigate to="/" replace /> : <Register />
              } 
            />
            <Route
              path="/*"
              element={
                <PrivateRoute>
                  <Layout handleLogout={handleLogout} user={user}>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/user" element={<User />} />
                      <Route path="/user/:id/detailed" element={<UserDetail />} />
                      <Route path="/roles" element={<Roles />} />
                      <Route path="/permissions" element={<Permissions />} />
                      {/* <Route path="/live" element={<LiveView />} />
                      <Route path="/history" element={<History />} />
                      <Route path="/settings" element={<CameraSettings />} />
                      <Route path="/cameras" element={<Cameras />} />
                      <Route path="/videos" element={<Videos />} />
                      <Route path="/calendar" element={<Calendar />} />
                      <Route path="/logs" element={<Logs />} />
                      <Route path="/onvif" element={<Onvif />} />
                      <Route path="/storage" element={<Storage />} />
                      <Route path="/timelapse" element={<Timelapse />} />
                      <Route path="/explore" element={<Explore />} />
                      <Route path="/account-settings" element={<AccountSettings />} />
                      <Route path="/sub-accounts" element={<SubAccountManager />} />
                      <Route path="/unit-types" element={<UnitTypes />} />
                      <Route path="/units" element={<Units />} /> */}
                      
                      {/* Catch all route */}
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </Layout>
                </PrivateRoute>
              }
            />
          </Routes>
          
          {/* Toast Container để hiển thị notifications */}
          <ToastContainer
            position="top-right"
            autoClose={5000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="light"
          />
        </ThemeProvider>
      </BrowserRouter>
    </MyContext.Provider>
  );
}

export default App;