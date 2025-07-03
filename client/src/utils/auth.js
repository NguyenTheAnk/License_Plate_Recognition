// API configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

// Utility function to clean URL (remove extra slashes)
const cleanUrl = (url) => {
    return url.startsWith('/') ? url.slice(1) : url;
};

// Utility function to handle API errors - FIXED VERSION
const handleApiError = (error) => {
    console.error('API Error:', error);
    
    // KHÔNG tự động logout ở đây nữa
    // Để component xử lý việc logout dựa trên context
    // Chỉ log lỗi và throw để component xử lý
    
    if (error.response?.status === 401 || error.status === 401) {
        console.warn('401 Unauthorized - Token may be expired or invalid');
        // Không xóa token ở đây, để component xử lý
    }
    
    if (error.response?.status === 403 || error.status === 403) {
        console.warn('403 Forbidden - Insufficient permissions');
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
        console.log('fetchDataFromAPI called with:', { url, hasToken: !!token, options });
        
        const headers = {};
        if (token && token.trim() !== '') {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        let fullUrl = `${API_BASE_URL}/${cleanUrl(url)}`;
        if (options.params) {
            fullUrl += buildQueryString(options.params);
        }
        
        console.log('Making request to:', fullUrl);
        console.log('Request headers:', headers);
        
        const response = await fetch(fullUrl, {
            method: 'GET',
            headers
        });
        
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('API Error Response:', errorData);
            
            const error = new Error(errorData.message || `HTTP error! status: ${response.status}`);
            error.status = response.status;
            error.response = { status: response.status, data: errorData };
            
            throw error;
        }
        
        const data = await response.json();
        console.log('API Success Response:', data);
        return data;
    } catch (error) {
        console.error('fetchDataFromAPI error:', error);
        // Không gọi handleApiError để tránh auto-logout
        throw error;
    }
};

// Hàm upload ảnh (POST request với FormData)
export const uploadImage = async (url, formData, token) => {
    try {
        const headers = {};
        if (token && token.trim() !== '') {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${API_BASE_URL}/${cleanUrl(url)}`, {
            method: 'POST',
            headers,
            body: formData
        });

        const data = await response.json();
        
        if (!response.ok) {
            const error = new Error(data.message || `HTTP error! status: ${response.status}`);
            error.status = response.status;
            error.response = { status: response.status, data };
            throw error;
        }
        
        return data;
    } catch (error) {
        console.error('uploadImage error:', error);
        throw error;
    }
};

// Hàm gửi dữ liệu lên API (POST request) - Updated version
export const postData = async (url, requestData, token = null) => {
    try {
        console.log('postData called with:', { url, requestData, hasToken: !!token });
        
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
            error.response = { status: response.status, data };
            throw error;
        }
        
        return data;
    } catch (error) {
        console.error('postData error:', error);
        throw error;
    }
};

// Hàm chỉnh sửa dữ liệu trên API (PUT request) - Updated version
export const editData = async (url, requestData, token = null) => {
    try {
        console.log('editData called with:', { url, requestData, hasToken: !!token });
        
        const headers = {
            'Content-Type': 'application/json'
        };
        
        // Chỉ thêm Authorization header nếu có token
        if (token && token.trim() !== '') {
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
            error.response = { status: response.status, data };
            throw error;
        }
        
        return data;
    } catch (error) {
        console.error('editData error:', error);
        throw error;
    }
};

// Hàm xóa dữ liệu trên API (DELETE request) - Updated version
export const deleteData = async (url, token = null) => {
    try {
        console.log('deleteData called with:', { url, hasToken: !!token });
        
        const headers = {};
        
        // Chỉ thêm Authorization header nếu có token
        if (token && token.trim() !== '') {
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
            error.response = { status: response.status, data };
            throw error;
        }
        
        return data;
    } catch (error) {
        console.error('deleteData error:', error);
        throw error;
    }
};

// Hàm xóa ảnh từ API (DELETE request với payload) - Updated version
export const deleteImages = async (url, image, token) => {
    try {
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (token && token.trim() !== '') {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${API_BASE_URL}/${cleanUrl(url)}`, {
            method: 'DELETE',
            headers,
            body: JSON.stringify(image)
        });

        const data = await response.json();
        
        if (!response.ok) {
            const error = new Error(data.message || `HTTP error! status: ${response.status}`);
            error.status = response.status;
            error.response = { status: response.status, data };
            throw error;
        }
        
        return data;
    } catch (error) {
        console.error('deleteImages error:', error);
        throw error;
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

// Utility function to handle different types of errors - IMPROVED VERSION
export const handleErrorResponse = (error) => {
    console.log('handleErrorResponse called with:', error);
    
    let errorMessage = 'Đã xảy ra lỗi!';
    
    // Handle different error formats
    if (error?.response?.data?.message) {
        errorMessage = error.response.data.message;
    } else if (error?.message) {
        errorMessage = error.message;
    } else if (error?.msg) {
        errorMessage = error.msg;
    } else if (typeof error === 'string') {
        errorMessage = error;
    }
    
    // Handle specific HTTP status codes
    if (error?.status === 401 || error?.response?.status === 401) {
        errorMessage = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    } else if (error?.status === 403 || error?.response?.status === 403) {
        errorMessage = 'Bạn không có quyền truy cập chức năng này.';
    } else if (error?.status === 404 || error?.response?.status === 404) {
        errorMessage = 'Không tìm thấy dữ liệu.';
    } else if (error?.status === 500 || error?.response?.status === 500) {
        errorMessage = 'Lỗi máy chủ. Vui lòng thử lại sau.';
    }
    
    console.log('Error message:', errorMessage);
    return errorMessage;
};

// New function to check if error is unauthorized
export const isUnauthorizedError = (error) => {
    return error?.status === 401 || error?.response?.status === 401;
};

// New function to check if error is forbidden
export const isForbiddenError = (error) => {
    return error?.status === 403 || error?.response?.status === 403;
};