import React, { useContext, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import CssBaseline from '@mui/material/CssBaseline';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Dashboard from './components/Dashboard';
import Layout from './components/Layout';
import PrivateRoute from './components/PrivateRoute';
import Login from './pages/Login and Register/Login';
import Register from './pages/Login and Register/Register';
import User from './pages/User/User';
import UserDetail from './pages/User/UserDetail';
import Roles from './pages/Roles and Permissions/Roles';
import Permissions from './pages/Roles and Permissions/Permissions';
import Cameras from './pages/Cameras';
import Search from './pages/Search/Search';
import SearchWhitelist from './pages/Search/SearchWhitelist';
import SearchBlacklist from './pages/Search/SearchBlacklist';
import SearchAccessControl from './pages/Search/SearchAccessControl';
import SearchCamera from './pages/Search/SearchCamera';
import SearchJourney from './pages/Search/SearchJourney';
import SearchLocation from './pages/Search/SearchLocation';
import SearchPlates from './pages/Search/SearchPlates';
import PlateRecognition from './pages/PlateRecognition/PlateRecognition';
import axios from 'axios';
import WhiteList from './components/WhiteList';
import BlackList from './components/BlackList';
import SamplePage from './pages/ViewCamera/SamplePage';
import CameraConfigurationPage from './pages/ViewCamera/CameraConfigurationPage';
import RouteMonitoring from './pages/Journey/RouteMonitoring';

export const MyContext = React.createContext();

// Context Provider Component
function MyContextProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Khởi tạo dữ liệu từ localStorage khi app load
  useEffect(() => {
    const initializeAuth = () => {
      try {
        const storedToken = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');
        
        if (storedToken && storedUser) {
          const parsedUser = JSON.parse(storedUser);
          setToken(storedToken);
          setUser(parsedUser);
          console.log('Auth initialized from localStorage:', { user: parsedUser, token: storedToken });
        }
      } catch (error) {
        console.error('Error initializing auth from localStorage:', error);
        // Clear corrupted data
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // Update localStorage when state changes
  useEffect(() => {
    if (token && user) {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }
  }, [token, user]);

  const contextValue = {
    user,
    setUser,
    token,
    setToken,
    loading
  };

  return (
    <MyContext.Provider value={contextValue}>
      {children}
    </MyContext.Provider>
  );
}

function AppContent() {
  const { user, setUser, token, setToken, loading } = useContext(MyContext);
  const navigate = useNavigate();

  const handleLogin = (userData, userToken) => {
    console.log('Login successful:', { userData, userToken });
    setUser(userData);
    setToken(userToken);
    // localStorage sẽ được update tự động thông qua useEffect
  };

  const handleLogout = async (skipApiCall = false) => {
    const currentToken = localStorage.getItem('token');
    
    // Chỉ gọi API logout nếu không skip và có token
    if (!skipApiCall && currentToken) {
      try {
        await axios.post('http://localhost:4000/api/auth/logout', {}, {
          headers: { Authorization: `Bearer ${currentToken}` }
        });
        console.log('Logout API call successful');
      } catch (error) {
        console.warn('Logout API call failed:', error);
        // Không throw error ở đây để vẫn có thể logout local
      }
    }

    // Clear all auth data
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('passwordExpired');
    
    setUser(null);
    setToken(null);
    
    console.log('Logout completed, redirecting to login');
    navigate('/login');
  };

  // Show loading spinner while initializing
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
    <>
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
                  <Route path="/cameras" element={<Cameras />} />
                  <Route path="/whitelist" element={<WhiteList />} />
                  <Route path="/blacklist" element={<BlackList />} />
                  <Route path="/roles" element={<Roles />} />
                  <Route path="/search" element={<Search />} />
                  <Route path="/search/whitelist" element={<SearchWhitelist />} />
                  <Route path="/search/blacklist" element={<SearchBlacklist />} />
                  <Route path="/search/history" element={<Search />} />
                  <Route path="/search/owner" element={<Search />} />
                  <Route path="/search/camera" element={<SearchCamera />} />
                  <Route path="/search/location" element={<SearchLocation />} />
                  <Route path="/search/journey" element={<SearchJourney />} />
                  <Route path="/search/plates" element={<SearchPlates />} />
                  <Route path="/search/access-control" element={<SearchAccessControl />} />
                  <Route path="/route-monitoring" element={<RouteMonitoring/>} />
                  <Route path="/plate-recognition" element={<SamplePage />} />
                  <Route path="/camera-config/:id" element={<CameraConfigurationPage />} />
                  <Route path="/permissions" element={<Permissions />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            </PrivateRoute>
          }
        />
      </Routes>
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
    </>
  );
}

function App() {
  return (
    <MyContextProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </MyContextProvider>
  );
}

export default App;