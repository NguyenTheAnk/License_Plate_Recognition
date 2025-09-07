import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { MyContext } from './App';
import { useState, useEffect } from 'react';

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

function RootProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const userData = localStorage.getItem('user');
    if (storedToken && userData) {
      try {
        setUser(JSON.parse(userData));
        setToken(storedToken);
      } catch {
        setUser(null);
        setToken(null);
      }
    }
  }, []);
  return (
    <MyContext.Provider value={{ user, setUser, token, setToken }}>
      {children}
    </MyContext.Provider>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <RootProvider>
      <ThemeProvider theme={lightTheme}>
        <App />
      </ThemeProvider>
    </RootProvider>
  </React.StrictMode>
);