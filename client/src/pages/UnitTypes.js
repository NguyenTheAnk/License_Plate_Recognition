import React, { useState } from 'react';
import { Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody, Button, TablePagination, Dialog, DialogTitle, DialogContent, DialogActions, TextField } from '@mui/material';

const initialTypes = [
  { id: 1, name: 'Đội bảo vệ' },
  { id: 2, name: 'Đội kỹ thuật' },
  { id: 3, name: 'Đội vận hành' },
  { id: 4, name: 'Đội quản lý' },
  { id: 5, name: 'Đội hỗ trợ' },
  { id: 6, name: 'Đội kiểm tra' },
  { id: 7, name: 'Đội an ninh' },
  { id: 8, name: 'Đội cứu hộ' },
];

function UnitTypes() {
  const [types, setTypes] = useState(initialTypes);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [open, setOpen] = useState(false);
  const [editType, setEditType] = useState(null);
  const [typeName, setTypeName] = useState('');

  const handleChangePage = (e, newPage) => setPage(newPage);
  const handleChangeRowsPerPage = e => { setRowsPerPage(+e.target.value); setPage(0); };

  const handleOpen = (type = null) => {
    setEditType(type);
    setTypeName(type ? type.name : '');
    setOpen(true);
  };
  const handleClose = () => setOpen(false);

  const handleSave = () => {
    if (editType) {
      setTypes(types.map(t => t.id === editType.id ? { ...t, name: typeName } : t));
    } else {
      setTypes([...types, { id: types.length + 1, name: typeName }]);
    }
    setOpen(false);
  };
  const handleDelete = id => setTypes(types.filter(t => t.id !== id));

  return (
    <Box sx={{ minHeight: '100vh', background: '#f4f6fa', p: 3 }}>
      <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3, maxWidth: 1500, mx: 'auto' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h5" fontWeight={700}>Quản lý loại đơn vị</Typography>
          <Button variant="contained" color="success" onClick={() => handleOpen()}>Thêm loại đơn vị</Button>
        </Box>
        <Table sx={{ minWidth: 600 }}>
          <TableHead>
            <TableRow sx={{ background: '#1976d2' }}>
              <TableCell sx={{ color: '#fff', fontWeight: 700, width: 80 }}>STT</TableCell>
              <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Tên loại đơn vị</TableCell>
              <TableCell sx={{ color: '#fff', fontWeight: 700, width: 180 }}>Hành động</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {types.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((type, idx) => (
              <TableRow key={type.id}>
                <TableCell>{page * rowsPerPage + idx + 1}</TableCell>
                <TableCell>{type.name}</TableCell>
                <TableCell>
                  <Button size="small" color="info" variant="contained" sx={{ mr: 1 }} onClick={() => handleOpen(type)}>Sửa</Button>
                  <Button size="small" color="error" variant="contained" onClick={() => handleDelete(type.id)}>Xóa</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={types.length}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[5, 10, 20]}
        />
      </Paper>
      {/* Dialog thêm/sửa */}
      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>{editType ? 'Sửa loại đơn vị' : 'Thêm loại đơn vị'}</DialogTitle>
        <DialogContent>
          <TextField
            label="Tên loại đơn vị"
            value={typeName}
            onChange={e => setTypeName(e.target.value)}
            fullWidth
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Hủy</Button>
          <Button onClick={handleSave} variant="contained" color="success">Lưu</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default UnitTypes;