import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ThemeProvider theme={createTheme({
      palette: {
        mode: 'light',
        primary: {
          main: '#1976d2', // xanh dương đẹp
        },
        secondary: {
          main: '#f50057', // hồng
        },
        background: {
          default: '#f4f6fa', // nền sáng
          paper: '#fff',
        },
      },
    })}>
      <App />
    </ThemeProvider>
  </React.StrictMode>
); 