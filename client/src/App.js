import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Dashboard from './components/Dashboard';
import LiveView from './pages/LiveView';
import History from './components/History';
// import Settings from './components/Settings';
import Layout from './components/Layout';
import PrivateRoute from './components/PrivateRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Cameras from './pages/Cameras';
import Videos from './pages/Videos';
import Calendar from './pages/Calendar';
import Logs from './pages/Logs';
import Onvif from './pages/Onvif';
import Storage from './pages/Storage';
import Timelapse from './pages/Timelapse';
import Explore from './pages/Explore';
import UnitTypes from './pages/UnitTypes';
import Units from './pages/Units';
import CameraSettings from './pages/CameraSettings';
import AccountSettings from './pages/AccountSettings';
import SubAccountManager from './pages/SubAccountManager';
import axios from 'axios';

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

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) setUser({});
  }, []);

  const handleLogin = (userData) => setUser(userData);
  const handleLogout = async () => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        await axios.post('http://localhost:5000/api/logout', {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (e) {
        // Có thể bỏ qua lỗi logout
      }
    }
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <BrowserRouter>
      <ThemeProvider theme={lightTheme}>
        <CssBaseline />
        <Routes>
          <Route path="/login" element={<Login onLogin={handleLogin} />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/*"
            element={
              <PrivateRoute>
                <Layout handleLogout={handleLogout} user={user}>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/live" element={<LiveView />} />
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
                    <Route path="/units" element={<Units />} />
                  </Routes>
                </Layout>
              </PrivateRoute>
            }
          />
        </Routes>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App; 