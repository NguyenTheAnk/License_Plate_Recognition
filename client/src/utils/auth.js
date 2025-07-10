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
// SỬA trong file auth.js, hàm postData:
export const postData = async (url, requestData, token = null, isMultipart = false) => {
    try {
        console.log('postData called with:', { url, requestDataType: requestData.constructor.name, hasToken: !!token, isMultipart });
        
        let headers = {};
        let body;
        
        if (requestData instanceof FormData || isMultipart) {
            // KHÔNG set Content-Type cho FormData, browser sẽ tự động set với boundary
            if (token && token.trim() !== '') {
                headers['Authorization'] = `Bearer ${token}`;
            }
            body = requestData;
        } else {
            headers['Content-Type'] = 'application/json';
            if (token && token.trim() !== '') {
                headers['Authorization'] = `Bearer ${token}`;
            }
            body = JSON.stringify(requestData);
        }
        
        const response = await fetch(`${API_BASE_URL}/${cleanUrl(url)}`, {
            method: 'POST',
            headers,
            body
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
        console.error('postData error:', error);
        throw error;
    }
};

export const editData = async (url, requestData, token = null) => {
    try {
        console.log('editData called with:', { 
            url, 
            requestDataType: requestData.constructor.name,
            hasToken: !!token 
        });
        
        let headers = {};
        let body;
        
        // Nếu là FormData (có file)
        if (requestData instanceof FormData) {
            console.log('Processing FormData...');
            // KHÔNG set Content-Type, browser sẽ tự động set với boundary
            if (token && token.trim() !== '') {
                headers['Authorization'] = `Bearer ${token}`;
            }
            body = requestData;
            
            // Debug FormData content
            console.log('FormData content:');
            for (let [key, value] of requestData.entries()) {
                console.log(`${key}:`, value);
            }
        } else {
            console.log('Processing JSON data...');
            // Nếu là object (JSON)
            headers['Content-Type'] = 'application/json';
            if (token && token.trim() !== '') {
                headers['Authorization'] = `Bearer ${token}`;
            }
            body = JSON.stringify(requestData);
            console.log('JSON body:', body);
        }

        console.log('Request headers:', headers);
        console.log('Request URL:', `${API_BASE_URL}/${cleanUrl(url)}`);

        const response = await fetch(`${API_BASE_URL}/${cleanUrl(url)}`, {
            method: 'PUT',
            headers,
            body
        });

        console.log('Response status:', response.status);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));

        const data = await response.json();
        console.log('Response data:', data);

        if (!response.ok) {
            const error = new Error(data.message || `HTTP error! status: ${response.status}`);
            error.status = response.status;
            error.response = { status: response.status, data };
            throw error;
        }

        return data;
    } catch (error) {
        console.error('editData error:', error);
        
        // Enhanced error logging
        if (error.response) {
            console.error('Error response data:', error.response.data);
            console.error('Error response status:', error.response.status);
        }
        
        throw error;
    }
};

// Hàm xóa dữ liệu trên API (DELETE request) - FIXED VERSION
export const deleteData = async (url, tokenOrData = null, token = null) => {
    try {
        // Xử lý parameters - có thể là (url, token) hoặc (url, data, token)
        let requestData = null;
        let authToken = null;
        
        if (typeof tokenOrData === 'string') {
            // Trường hợp (url, token) - DELETE đơn giản
            authToken = tokenOrData;
        } else if (tokenOrData && typeof tokenOrData === 'object') {
            // Trường hợp (url, data, token) - DELETE với body
            requestData = tokenOrData;
            authToken = token;
        }
        
        console.log('deleteData called with:', { 
            url, 
            requestData, 
            hasToken: !!authToken,
            tokenLength: authToken ? authToken.length : 0
        });
        
        const headers = {};
        
        // Thêm Content-Type nếu có data
        if (requestData) {
            headers['Content-Type'] = 'application/json';
        }
        
        // Thêm Authorization header nếu có token
        if (authToken && authToken.trim() !== '') {
            headers['Authorization'] = `Bearer ${authToken}`;
        }

        const fetchOptions = {
            method: 'DELETE',
            headers
        };

        // Thêm body nếu có data
        if (requestData) {
            fetchOptions.body = JSON.stringify(requestData);
            console.log('Request body:', fetchOptions.body);
        }

        // SỬA: Xử lý URL để tránh double slash và đảm bảo format đúng
        let fullUrl = `${API_BASE_URL}/${cleanUrl(url)}`;
        
        console.log('DELETE Request Details:', {
            url: fullUrl,
            method: 'DELETE',
            headers: headers,
            hasBody: !!requestData,
            bodyContent: requestData
        });

        const response = await fetch(fullUrl, fetchOptions);
        
        console.log('DELETE Response Status:', response.status);
        console.log('DELETE Response Headers:', response.headers);

        // SỬA: Kiểm tra response content type trước khi parse JSON
        const contentType = response.headers.get('content-type');
        let data;
        
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            // Nếu không phải JSON, lấy text
            const textResponse = await response.text();
            console.log('Non-JSON response:', textResponse);
            data = { 
                success: false, 
                message: 'Server trả về response không phải JSON',
                raw_response: textResponse 
            };
        }
        
        console.log('DELETE Response Data:', data);
        
        if (!response.ok) {
            const error = new Error(data.message || `HTTP error! status: ${response.status}`);
            error.status = response.status;
            error.response = { status: response.status, data };
            throw error;
        }
        
        return data;
    } catch (error) {
        console.error('deleteData error details:', {
            message: error.message,
            status: error.status,
            response: error.response,
            stack: error.stack
        });
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