// API configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

// Utility function to clean URL (remove extra slashes)
const cleanUrl = (url) => {
    return url.startsWith('/') ? url.slice(1) : url;
};

// Utility function to handle API errors
const handleApiError = (error) => {
    console.error('API Error:', error);
    
    // Handle 401 unauthorized
    if (error.response?.status === 401 || error.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
    }
    
    return error;
};

// Thêm hàm buildQueryString để nối params vào URL
function buildQueryString(params) {
    if (!params) return '';
    const esc = encodeURIComponent;
    return (
        '?' +
        Object.keys(params)
            .map(k => esc(k) + '=' + esc(params[k]))
            .join('&')
    );
}

// Hàm lấy dữ liệu từ API (GET request) - Updated version
export const fetchDataFromAPI = async (url, token = null, options = {}) => {
    try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        let fullUrl = `${API_BASE_URL}/${cleanUrl(url)}`;
        if (options.params) {
            fullUrl += buildQueryString(options.params);
        }
        const response = await fetch(fullUrl, {
            method: 'GET',
            headers
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const error = new Error(errorData.message || `HTTP error! status: ${response.status}`);
            error.status = response.status;
            error.response = { data: errorData };
            throw error;
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        throw handleApiError(error);
    }
};

// Hàm upload ảnh (POST request với FormData)
export const uploadImage = async (url, formData, token) => {
    try {
        const headers = {
            'Authorization': `Bearer ${token}`
        };

        const response = await fetch(`${API_BASE_URL}/${cleanUrl(url)}`, {
            method: 'POST',
            headers,
            body: formData
        });

        const data = await response.json();
        
        if (!response.ok) {
            const error = new Error(data.message || `HTTP error! status: ${response.status}`);
            error.status = response.status;
            error.response = { data };
            throw error;
        }
        
        return data;
    } catch (error) {
        throw handleApiError(error);
    }
};

// Hàm gửi dữ liệu lên API (POST request) - Updated version
export const postData = async (url, requestData, token = null) => {
    try {
        const headers = {
            'Content-Type': 'application/json'
        };
        
        // Luôn thêm Authorization header nếu có token
        if (token && token.trim() !== '') {
            headers['Authorization'] = `Bearer ${token}`;
        }

        console.log('Request URL:', `${API_BASE_URL}/${cleanUrl(url)}`);
        console.log('Request Headers:', headers);
        console.log('Request Data:', requestData);

        const response = await fetch(`${API_BASE_URL}/${cleanUrl(url)}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestData)
        });

        const data = await response.json();
        console.log('Response Status:', response.status);
        console.log('Response Data:', data);
        
        if (!response.ok) {
            const error = new Error(data.message || `HTTP error! status: ${response.status}`);
            error.status = response.status;
            error.response = { data };
            throw error;
        }
        
        return data;
    } catch (error) {
        throw handleApiError(error);
    }
};

// Hàm chỉnh sửa dữ liệu trên API (PUT request) - Updated version
export const editData = async (url, requestData, token = null) => {
    try {
        const headers = {
            'Content-Type': 'application/json'
        };
        
        // Chỉ thêm Authorization header nếu có token
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${API_BASE_URL}/${cleanUrl(url)}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(requestData)
        });

        const data = await response.json();
        
        if (!response.ok) {
            const error = new Error(data.message || `HTTP error! status: ${response.status}`);
            error.status = response.status;
            error.response = { data };
            throw error;
        }
        
        return data;
    } catch (error) {
        throw handleApiError(error);
    }
};

// Hàm xóa dữ liệu trên API (DELETE request) - Updated version
export const deleteData = async (url, token = null) => {
    try {
        const headers = {};
        
        // Chỉ thêm Authorization header nếu có token
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${API_BASE_URL}/${cleanUrl(url)}`, {
            method: 'DELETE',
            headers
        });

        const data = await response.json();
        
        if (!response.ok) {
            const error = new Error(data.message || `HTTP error! status: ${response.status}`);
            error.status = response.status;
            error.response = { data };
            throw error;
        }
        
        return data;
    } catch (error) {
        throw handleApiError(error);
    }
};

// Hàm xóa ảnh từ API (DELETE request với payload) - Updated version
export const deleteImages = async (url, image, token) => {
    try {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };

        const response = await fetch(`${API_BASE_URL}/${cleanUrl(url)}`, {
            method: 'DELETE',
            headers,
            body: JSON.stringify(image)
        });

        const data = await response.json();
        
        if (!response.ok) {
            const error = new Error(data.message || `HTTP error! status: ${response.status}`);
            error.status = response.status;
            error.response = { data };
            throw error;
        }
        
        return data;
    } catch (error) {
        throw handleApiError(error);
    }
};

// Utility function to get auth headers (for backward compatibility)
export const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` })
    };
};

// Utility function to handle different types of errors
export const handleErrorResponse = (error) => {
    let errorMessage = 'Đã xảy ra lỗi!';
    
    if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
    } else if (error.message) {
        errorMessage = error.message;
    } else if (error.msg) {
        errorMessage = error.msg;
    }
    
    return errorMessage;
};