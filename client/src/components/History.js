import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import axios from 'axios';

function History() {
  const [plates, setPlates] = useState([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlates();
    const interval = setInterval(fetchPlates, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchPlates = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/plates');
      setPlates(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching plates:', error);
      setLoading(false);
    }
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`http://localhost:5000/api/plates/${id}`);
      fetchPlates();
    } catch (error) {
      console.error('Error deleting plate:', error);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        History
      </Typography>
      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer sx={{ maxHeight: 440 }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Plate Number</TableCell>
                <TableCell>Timestamp</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Image</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {plates
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((plate) => (
                  <TableRow hover key={plate.id}>
                    <TableCell>{plate.plate_number}</TableCell>
                    <TableCell>
                      {new Date(plate.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={plate.alert ? 'Alert' : 'Normal'}
                        color={plate.alert ? 'error' : 'success'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {plate.image_path && (
                        <img
                          src={`http://localhost:5000/${plate.image_path}`}
                          alt="Plate"
                          style={{ width: 100, height: 50, objectFit: 'cover' }}
                        />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="View Details">
                        <IconButton size="small">
                          <SearchIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          onClick={() => handleDelete(plate.id)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[10, 25, 100]}
          component="div"
          count={plates.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </Paper>
    </Box>
  );
}

export default History; 