import axios from "axios";

// Hàm lấy dữ liệu từ API (GET request)
export const fetchDataFromAPI = async (url, token) => {
    try {
        const { data } = await axios.get(`http://localhost:5000/${url}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return data;
    } catch (error) {
        return error;
    }
};

export const uploadImage = async (url, formData, token) => {
    try {
        const { data } = await axios.post(`http://localhost:5000/${url}`, formData, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'multipart/form-data'
            }
        });
        return data;
    } catch (error) {
        console.error("Request failed:", error);
        return error.response ? error.response.data : { error: true, msg: error.message };
    }
};

export const postData = async (url, formData, token) => {
    try {
        const headers = {
            'Content-Type': 'application/json'
        };
        
        // Chỉ thêm Authorization header nếu có token
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`http://localhost:5000/${url}`, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(formData)
        });

        const data = await response.json();
        
        // Log để debug
        console.log('Response status:', response.status);
        console.log('Response data:', data);
        
        if (response.ok) {
            return data;
        } else {
            // Throw error với message từ server
            throw new Error(data.msg || data.message || `HTTP ${response.status}: Request failed`);
        }
    } catch (error) {
        console.error("Request failed:", error);
        throw error;
    }
};

// Hàm chỉnh sửa dữ liệu trên API (PUT request)
export const editData = async (url, updateData, token) => {
    try {
        const { data } = await axios.put(`http://localhost:5000/${url}`, updateData, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        return data;
    } catch (error) {
        console.error("Request failed:", error);
        return error.response ? error.response.data : { error: true, msg: error.message };
    }
};

// Hàm xóa dữ liệu trên API (DELETE request)
export const deleteData = async (url, token) => {
    try {
        const { data } = await axios.delete(`http://localhost:5000/${url}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return data;
    } catch (error) {
        console.error("Request failed:", error);
        return error.response ? error.response.data : { error: true, msg: error.message };
    }
};

// Hàm xóa ảnh từ API (DELETE request với payload)
export const deleteImages = async (url, image, token) => {
    try {
        const { data } = await axios.delete(`http://localhost:5000/${url}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            data: image
        });
        return data;
    } catch (error) {
        console.error("Request failed:", error);
        return error.response ? error.response.data : { error: true, msg: error.message };
    }
};