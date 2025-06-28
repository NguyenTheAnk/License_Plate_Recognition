import React, { useState } from 'react';
import { Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody, Button, TablePagination, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem } from '@mui/material';

const initialUnits = [
  { id: 1, name: 'Đơn vị A', type: 'Đội bảo vệ' },
  { id: 2, name: 'Đơn vị B', type: 'Đội kỹ thuật' },
  { id: 3, name: 'Đơn vị C', type: 'Đội vận hành' },
  { id: 4, name: 'Đơn vị D', type: 'Đội quản lý' },
  { id: 5, name: 'Đơn vị E', type: 'Đội hỗ trợ' },
  { id: 6, name: 'Đơn vị F', type: 'Đội kiểm tra' },
  { id: 7, name: 'Đơn vị G', type: 'Đội an ninh' },
  { id: 8, name: 'Đơn vị H', type: 'Đội cứu hộ' },
];
const unitTypes = [
  'Đội bảo vệ', 'Đội kỹ thuật', 'Đội vận hành', 'Đội quản lý', 'Đội hỗ trợ', 'Đội kiểm tra', 'Đội an ninh', 'Đội cứu hộ'
];

function Units() {
  const [units, setUnits] = useState(initialUnits);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [open, setOpen] = useState(false);
  const [editUnit, setEditUnit] = useState(null);
  const [unitName, setUnitName] = useState('');
  const [unitType, setUnitType] = useState(unitTypes[0]);

  const handleChangePage = (e, newPage) => setPage(newPage);
  const handleChangeRowsPerPage = e => { setRowsPerPage(+e.target.value); setPage(0); };

  const handleOpen = (unit = null) => {
    setEditUnit(unit);
    setUnitName(unit ? unit.name : '');
    setUnitType(unit ? unit.type : unitTypes[0]);
    setOpen(true);
  };
  const handleClose = () => setOpen(false);

  const handleSave = () => {
    if (editUnit) {
      setUnits(units.map(u => u.id === editUnit.id ? { ...u, name: unitName, type: unitType } : u));
    } else {
      setUnits([...units, { id: units.length + 1, name: unitName, type: unitType }]);
    }
    setOpen(false);
  };
  const handleDelete = id => setUnits(units.filter(u => u.id !== id));

  return (
    <Box sx={{ minHeight: '100vh', background: '#f4f6fa', p: 3 }}>
      <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3, maxWidth: 1500, mx: 'auto' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h5" fontWeight={700}>Quản lý đơn vị</Typography>
          <Button variant="contained" color="success" onClick={() => handleOpen()}>Thêm đơn vị</Button>
        </Box>
        <Table sx={{ minWidth: 700 }}>
          <TableHead>
            <TableRow sx={{ background: '#1976d2' }}>
              <TableCell sx={{ color: '#fff', fontWeight: 700, width: 80 }}>STT</TableCell>
              <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Tên đơn vị</TableCell>
              <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Loại đơn vị</TableCell>
              <TableCell sx={{ color: '#fff', fontWeight: 700, width: 180 }}>Hành động</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {units.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((unit, idx) => (
              <TableRow key={unit.id}>
                <TableCell>{page * rowsPerPage + idx + 1}</TableCell>
                <TableCell>{unit.name}</TableCell>
                <TableCell>{unit.type}</TableCell>
                <TableCell>
                  <Button size="small" color="info" variant="contained" sx={{ mr: 1 }} onClick={() => handleOpen(unit)}>Sửa</Button>
                  <Button size="small" color="error" variant="contained" onClick={() => handleDelete(unit.id)}>Xóa</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={units.length}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[5, 10, 20]}
        />
      </Paper>
      {/* Dialog thêm/sửa */}
      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>{editUnit ? 'Sửa đơn vị' : 'Thêm đơn vị'}</DialogTitle>
        <DialogContent>
          <TextField
            label="Tên đơn vị"
            value={unitName}
            onChange={e => setUnitName(e.target.value)}
            fullWidth
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            select
            label="Loại đơn vị"
            value={unitType}
            onChange={e => setUnitType(e.target.value)}
            fullWidth
          >
            {unitTypes.map(type => (
              <MenuItem key={type} value={type}>{type}</MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Hủy</Button>
          <Button onClick={handleSave} variant="contained" color="success">Lưu</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Units;
