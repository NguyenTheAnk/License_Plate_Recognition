import React, { useState } from 'react';
import {
  Box, Typography, Paper, Grid, TextField, MenuItem, Select, InputLabel, FormControl, Button
} from '@mui/material';
// Nếu đã cài react-calendar hoặc fullcalendar-react thì import ở đây
// import CalendarComponent from 'react-calendar';

const WEEKDAYS = ['T2','T3','T4','T5','T6','T7','CN'];

function getDaysInMonth(month, year) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfWeek(month, year) {
  // 0: Sunday, 1: Monday, ...
  let d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1; // convert to Monday=0
}

function Calendar() {
  const [camera, setCamera] = useState('1910 S1 (Manual)');
  const [date, setDate] = useState('00:00:00 28/04/2025 - 23:59:59 04/05/2025');
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());

  // Tính số ngày và vị trí ngày đầu tiên trong tuần
  const daysInMonth = getDaysInMonth(month, year);
  const firstDay = getFirstDayOfWeek(month, year);
  const days = [];
  for (let i = 0; i < firstDay; i++) days.push('');
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  while (days.length % 7 !== 0) days.push('');

  const handlePrevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear(y => y - 1);
    } else {
      setMonth(m => m - 1);
    }
  };
  const handleNextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear(y => y + 1);
    } else {
      setMonth(m => m + 1);
    }
  };
  const handleToday = () => {
    setMonth(today.getMonth());
    setYear(today.getFullYear());
  };

  return (
    <Box sx={{ minHeight: '100vh', background: '#d3d3d3', p: 3 }}>
      <Grid container spacing={3} justifyContent="center">
        {/* Bộ lọc tìm kiếm */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2, borderBottom: '2px dashed #43a047', pb: 1 }}>
              Cài đặt tìm kiếm
            </Typography>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Camera</InputLabel>
              <Select
                value={camera}
                label="Camera"
                onChange={e => setCamera(e.target.value)}
              >
                <MenuItem value="1910 S1 (Manual)">1910 S1 (Manual)</MenuItem>
                <MenuItem value="1910 S1 Local (64)">1910 S1 Local (64)</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Ngày tháng"
              value={date}
              onChange={e => setDate(e.target.value)}
              fullWidth
              sx={{ mb: 2 }}
            />
            <Button variant="contained" color="success" fullWidth sx={{ fontWeight: 700, py: 1 }}>
              Làm mới
            </Button>
          </Paper>
        </Grid>
        {/* Card lịch */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2, borderRadius: 2, boxShadow: 3, minHeight: 500 }}>
            {/* Nếu đã cài thư viện lịch, thay thế Box này bằng component lịch thực tế */}
            <Box sx={{ width: '100%', height: 480, bgcolor: '#f4f6fa', borderRadius: 2, p: 2, overflow: 'auto' }}>
              {/* Header calendar */}
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Button variant="outlined" size="small" sx={{ minWidth: 36, mr: 1 }} onClick={handlePrevMonth}>{'<'}</Button>
                <Button variant="outlined" size="small" sx={{ minWidth: 36, mr: 2 }} onClick={handleNextMonth}>{'>'}</Button>
                <Button variant="outlined" size="small" sx={{ mr: 2 }} onClick={handleToday}>today</Button>
                <Typography variant="h5" fontWeight={700} sx={{ flex: 1, textAlign: 'center' }}>{`tháng ${month + 1} ${year}`}</Typography>
                <Button variant="outlined" size="small" sx={{ ml: 2 }}>month</Button>
                <Button variant="outlined" size="small">week</Button>
                <Button variant="outlined" size="small">day</Button>
                <Button variant="outlined" size="small">list</Button>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0, bgcolor: '#f4f6fa', borderRadius: 2 }}>
                {WEEKDAYS.map((d, i) => (
                  <Box key={i} sx={{ textAlign: 'center', fontWeight: 700, color: '#4caf50', py: 1, borderBottom: '1px solid #e0e0e0', bgcolor: '#f4f6fa' }}>{d}</Box>
                ))}
                {days.map((d, i) => (
                  <Box key={i} sx={{ textAlign: 'center', color: '#388e3c', py: 2, borderBottom: '1px solid #e0e0e0', borderRight: (i%7!==6)?'1px solid #e0e0e0':'none', bgcolor: (d === today.getDate() && month === today.getMonth() && year === today.getFullYear()) ? '#fffde7' : '#f4f6fa' }}>
                    {d}
                  </Box>
                ))}
              </Box>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

export default Calendar;
