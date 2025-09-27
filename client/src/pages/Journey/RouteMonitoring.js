import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import './RouteMonitoring.css';

const RouteMonitoring = () => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const pathMeshesRef = useRef([]);
  const allPathsRef = useRef([]);
  const pathLengthsRef = useRef([]);
  const activeCamerasRef = useRef([]);

  // State để quản lý camera được chọn và hiển thị
  const [selectedCameraInfo, setSelectedCameraInfo] = useState(null);
  const [showCameraInfo, setShowCameraInfo] = useState(false);


  // State cho tìm kiếm biển số xe
  const [searchPlateNumber, setSearchPlateNumber] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showTimeTexts, setShowTimeTexts] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startDateDisplay, setStartDateDisplay] = useState('');
  const [endDateDisplay, setEndDateDisplay] = useState('');
  
  // State cho UI/UX cải thiện
  const [selectedDetection, setSelectedDetection] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchHistory, setSearchHistory] = useState([]);
  const [favoritePlates, setFavoritePlates] = useState([]);

  // Biến để lưu trạng thái camera thực tế từ API
  const cameraStateRef = useRef({
    allCameras: [],
    activeCameras: []
  });


  // Vị trí các thành phố (cần di chuyển ra ngoài để có thể sử dụng)
  const cities = {
    A: [-58, 72],
    B: [58, 72],
    C: [39.5, 72],
    D: [39.5, 64],
    E: [20, 56],
    E1: [20, 64],
    F: [59, 56],
    F1: [58, 64],
    G: [19, 42],
    H: [58, 42],
    K: [57, 5],
    I: [18, 14.7],
    J: [2, 14.7],
    L: [37, 6],
    M: [56, -8],
    N: [20, -13],
    O: [37, -7],
    P: [51.3, -28],
    Q: [31, -28],
    R: [31, -14],
    S: [1, -12],
    T: [1, -24],
    T1: [0.5, -28],
    U: [2, 17],
    V: [-32, 17],
    W: [-33.5, -16],
    Z: [-26, -24],
    X: [-55, -16],
    Y: [-33.5, -24],
    O5: [51, -58],
    O2: [-26, -39],
    O1: [-50, -39],
    O3: [-0.5, -40],
    O4: [-1, -59],
    O6: [34, 14],
    O7: [-41, -58.5],
    O8: [-1, -68],
    O9: [-32, 25]
  };

  // Kết nối đường đi (từ bản đồ mới)
  const connections = [
    ['A', 'B'], ['A', 'C'], ['B', 'C'], ['E', 'E1'],
    ['F', 'F1'], ['E1', 'D'], ['F1', 'D'], ['E', 'F'],
    ['C', 'D'], ['E', 'G'], ['F', 'H'], ['G', 'H'],
    ['I', 'G'], ['K', 'H'], ['I', 'J'], ['L', 'K'],
    ['M', 'K'], ['O', 'L'], ['M', 'P'], ['O', 'M'],
    ['P', 'Q'], ['Q', 'R'], ['U', 'J'], ['R', 'S'],
    ['U', 'S'], ['S', 'T'], ['Q', 'T1'], ['U', 'V'],
    ['V', 'W'], ['W', 'X'], ['W', 'Y'], ['T1', 'O3'],
    ['T', 'S'], ['T', 'T1'], ['Y', 'Z'], ['T', 'Z'],
    ['P', 'O5'], ['Z', 'O2'], ['O1', 'O2'], ['O2', 'O3'],
    ['O4', 'O7'], ['O3', 'O4'], ['I', 'O6'], ['O6', 'L'],
    ['O4', 'O8'], ['V', 'O9']
  ];

  // Xây dựng đồ thị cho tìm đường
  const graph = {};
  Object.keys(cities).forEach(city => {
    graph[city] = [];
  });
  connections.forEach(([start, end]) => {
    graph[start].push(end);
    graph[end].push(start);
  });

  // Tính khoảng cách Euclid giữa các thành phố
  const calculateDistance = (city1, city2) => {
    const [x1, z1] = cities[city1];
    const [x2, z2] = cities[city2];
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(z2 - z1, 2));
  };

  // Hàm lấy danh sách camera từ API thực tế
  const getActiveCameras = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/cameras/route-monitoring', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        // Cập nhật trạng thái camera
        cameraStateRef.current.allCameras = data.data.cameras;
        cameraStateRef.current.activeCameras = data.data.cameras;

        // Trả về danh sách camera với tọa độ để hiển thị
        return data.data.cameras.map(camera => ({
          id: camera.id,
          name: camera.displayName,
          x: camera.mapX,
          y: camera.mapY,
          status: camera.connection_status,
          location_name: camera.location_name
        }));
      } else {
        console.error('API error:', data.message);
        return [];
      }
    } catch (error) {
      console.error('Lỗi khi lấy danh sách camera:', error);
      return []; // Trả về mảng rỗng nếu có lỗi
    }
  };

  // Tạo camera tại các vị trí thực tế từ API
  const createCameraIcons = async () => {
    if (!sceneRef.current) return;

    // Xóa các camera cũ trước khi tạo mới
    activeCamerasRef.current.forEach(cameraData => {
      sceneRef.current.remove(cameraData.camera);
      sceneRef.current.remove(cameraData.light);
    });
    activeCamerasRef.current = [];

    // Lấy danh sách camera từ API
    const cameras = await getActiveCameras();

    // Tạo camera select dropdown cho UI
    createCameraSelect(cameras);

    cameras.forEach(cameraData => {
      // Chọn màu sắc dựa trên trạng thái camera
      let color = 0x00ffff; // Mặc định cyan
      let lightColor = 0x00ffff;

      switch (cameraData.status) {
        case 'online':
          color = 0x00ff00; // Xanh lá
          lightColor = 0x00ff00;
          break;
        case 'maintenance':
          color = 0xffaa00; // Vàng cam
          lightColor = 0xffaa00;
          break;
        case 'offline':
          color = 0xff0000; // Đỏ
          lightColor = 0xff0000;
          break;
        default:
          color = 0x00ffff; // Cyan (cho các trạng thái khác)
          lightColor = 0x00ffff;
      }

      const cameraGeometry = new THREE.CylinderGeometry(1, 1, 3, 16);
      const cameraMaterial = new THREE.MeshBasicMaterial({ color });

      // Tạo camera icon tại vị trí thực tế
      const camera = new THREE.Mesh(cameraGeometry, cameraMaterial);
      camera.position.set(cameraData.x, 2, cameraData.y);
      camera.rotation.x = Math.PI / 2;
      camera.userData = {
        id: cameraData.id,
        name: cameraData.name,
        status: cameraData.status,
        location_name: cameraData.location_name,
        streamUrl: cameraData.streamUrl || `http://localhost:5000/api/cameras/${cameraData.id}/stream`
      };

      // Thêm click handler cho camera
      camera.userData.onClick = () => {
        console.log('Camera clicked:', cameraData);
        handleCameraClick(cameraData.id);
      };

      sceneRef.current.add(camera);

      // Thêm ánh sáng cho camera
      const pointLight = new THREE.PointLight(lightColor, 1, 10);
      pointLight.position.set(cameraData.x, 3, cameraData.y);
      sceneRef.current.add(pointLight);

      // Lưu vào ref để có thể xóa sau này
      activeCamerasRef.current.push({
        camera,
        light: pointLight,
        cameraData: cameraData
      });
    });
  };

  // Tạo camera select dropdown cho UI
  const createCameraSelect = (cameras) => {
    const container = document.getElementById('camera-buttons-container');
    if (!container) return;

    // Xóa nội dung cũ
    container.innerHTML = '';

    // Tạo select element
    const select = document.createElement('select');
    select.id = 'camera-select';
    select.style.cssText = `
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      background-color: white;
      font-size: 14px;
      cursor: pointer;
      margin-bottom: 10px;
    `;

    // Thêm option mặc định
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Chọn camera để xem...';
    defaultOption.disabled = true;
    defaultOption.selected = true;
    select.appendChild(defaultOption);

    // Thêm các option cho từng camera
    cameras.forEach(cameraData => {
      const option = document.createElement('option');
      option.value = cameraData.id;
      option.textContent = `${cameraData.name} (${cameraData.location_name}) - ${cameraData.status}`;
      option.style.color = getStatusColor(cameraData.status);
      select.appendChild(option);
    });

    // Thêm event listener cho select
    select.addEventListener('change', (e) => {
      if (e.target.value) {
        flyToCamera(parseInt(e.target.value));
      }
    });

    container.appendChild(select);
  };

  // Hàm lấy màu sắc theo trạng thái
  const getStatusColor = (status, hover = false) => {
    const colors = {
      online: hover ? '#00cc00' : '#00ff00',
      maintenance: hover ? '#e69900' : '#ffaa00',
      offline: hover ? '#cc0000' : '#ff0000'
    };
    return colors[status] || '#00ffff';
  };

  // Hàm để refresh camera (tải lại từ API)
  const refreshCameras = async () => {
    await createCameraIcons();
  };

  // Hàm để bay đến camera cụ thể
  const flyToCamera = (cameraId) => {
    const camera = activeCamerasRef.current.find(cam => cam.cameraData.id === cameraId);
    if (camera) {
      const { x, y } = camera.cameraData;
      const targetPosition = new THREE.Vector3(x, 30, y + 15);
      const targetLookAt = new THREE.Vector3(x, 0, y);
      animateCamera(targetPosition, targetLookAt);
    }
  };

  // Hàm tìm kiếm biển số xe với cải thiện
  const handleSearchPlate = async (plateNumber) => {
    if (!plateNumber.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setIsLoading(true);
    
    try {
      const token = localStorage.getItem('token');

      // Xây dựng URL với tham số thời gian
      const params = new URLSearchParams({
        plate_number: plateNumber.trim()
      });

      // Thêm start_date nếu có
      if (startDate) {
        params.append('start_date', startDate);
      }

      // Thêm end_date nếu có
      if (endDate) {
        params.append('end_date', endDate);
      }

      console.log('🔍 Searching for plate:', plateNumber);
      console.log('📅 Date range:', { startDate, endDate });
      console.log('🌐 API URL:', `/api/plate-routes/search-route?${params.toString()}`);

      const response = await fetch(`/api/plate-routes/search-route?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Error:', response.status, errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ API Response:', data);

      if (data.success) {
        const detections = data.data || [];
        console.log('📊 Detections received:', detections.length);
        
        // Debug: Kiểm tra cấu trúc dữ liệu
        if (detections.length > 0) {
          console.log('🔍 Sample detection data:', detections[0]);
          console.log('🔍 Available fields:', Object.keys(detections[0]));
          console.log('🔍 Confidence fields:', {
            confidence: detections[0].confidence,
            confidence_score: detections[0].confidence_score,
            confidence_level: detections[0].confidence_level,
            accuracy: detections[0].accuracy,
            score: detections[0].score,
            detected_at: detections[0].detected_at,
            camera_name: detections[0].camera_name
          });
          
          // Test confidence score function
          const testConfidence = getConfidenceScore(detections[0]);
          console.log('🔍 Calculated confidence score:', testConfidence, '->', Math.round(testConfidence * 100) + '%');
        }
        
        setSearchResults(detections);
        
        // Thêm vào lịch sử tìm kiếm
        const newSearchHistory = [
          { 
            plateNumber: plateNumber.trim(), 
            timestamp: new Date(), 
            resultCount: detections.length 
          },
          ...searchHistory.filter(item => item.plateNumber !== plateNumber.trim())
        ].slice(0, 10); // Giữ tối đa 10 lịch sử
        setSearchHistory(newSearchHistory);
        
        // Tự động vẽ đường đi nếu có kết quả
        if (detections.length > 0) {
          console.log('🗺️ Drawing route with', detections.length, 'detections');
          console.log('📹 Ordered cameras:', data.orderedCameras);
          drawPlateRoute(detections, plateNumber.trim(), data.orderedCameras);
        } else {
          console.log('❌ No detections found, clearing route');
          clearPlateRoute();
        }
      } else {
        console.error('❌ API returned error:', data.message);
        setSearchResults([]);
        clearPlateRoute();
      }
    } catch (error) {
      console.error('❌ Error searching for plate:', error);
      setSearchResults([]);
      clearPlateRoute();
      
      // Hiển thị thông báo lỗi cho user
      alert(`Lỗi khi tìm kiếm biển số xe: ${error.message}`);
    } finally {
      setIsSearching(false);
      setIsLoading(false);
    }
  };

  // Hàm thêm vào danh sách yêu thích
  const toggleFavorite = (plateNumber) => {
    if (favoritePlates.includes(plateNumber)) {
      setFavoritePlates(favoritePlates.filter(p => p !== plateNumber));
    } else {
      setFavoritePlates([...favoritePlates, plateNumber]);
    }
  };


  // Hàm để refresh toàn bộ (reset tất cả)
  const refreshAll = async () => {
    console.log('Reset button clicked - Resetting all data...');
    
    // Reset thông tin tìm kiếm
    setSearchPlateNumber('');
    setSearchResults([]);
    setStartDate('');
    setEndDate('');
    setStartDateDisplay('');
    setEndDateDisplay('');
    setIsSearching(false);
    setShowTimeTexts(true);
    
    // Reset camera selection
    setSelectedCameraInfo(null);
    setShowCameraInfo(false);
    
    // Refresh camera trên bản đồ
    await createCameraIcons();
    
    // Xóa đường đi cũ
    clearPlateRoute();
    
    console.log('Reset completed successfully!');
  };

  // Hàm lấy thông tin camera và biển số đã phát hiện
  const getCameraInfo = async (cameraId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/plate-recognitions?camera_id=${cameraId}&limit=1000`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        // Tìm tên camera từ danh sách camera đã load
        const cameraData = cameraStateRef.current.allCameras.find(cam => cam.id === parseInt(cameraId));
        const cameraName = cameraData ? cameraData.displayName : `Camera ${cameraId}`;
        
        console.log('📹 Camera info loaded:', {
          cameraId,
          cameraName,
          detectionsCount: data.data ? data.data.length : 0
        });
        
        setSelectedCameraInfo({
          cameraId: cameraId,
          cameraName: cameraName,
          detections: data.data || [],
          totalDetections: data.data ? data.data.length : 0
        });
        setShowCameraInfo(true);
      } else {
        console.error('API error:', data.message);
        setSelectedCameraInfo(null);
      }
    } catch (error) {
      console.error('Lỗi khi lấy thông tin camera:', error);
      setSelectedCameraInfo(null);
    }
  };

  // Hàm xử lý click camera
  const handleCameraClick = (cameraId) => {
    getCameraInfo(cameraId);
  };



  // Hàm xử lý date focus
  const handleDateFocus = (e, type) => {
    if (type === 'start' && startDate) {
      e.target.value = startDate;
    } else if (type === 'end' && endDate) {
      e.target.value = endDate;
    }
  };

  // Hàm xử lý date blur
  const handleDateBlur = (e, type) => {
    if (type === 'start') {
      if (startDateDisplay) {
        e.target.value = startDateDisplay;
      }
    } else {
      if (endDateDisplay) {
        e.target.value = endDateDisplay;
      }
    }
  };

  // Hàm xử lý calendar click - hiển thị ngay dưới icon
  const handleCalendarClick = (type, event) => {
    console.log('📅 Calendar click triggered for:', type);
    
    // Lấy vị trí của button được click
    const buttonRect = event.target.getBoundingClientRect();
    console.log('📅 Button position:', buttonRect);
    
    // Tạo input date thực tế
    const input = document.createElement('input');
    input.type = 'date';
    input.style.position = 'fixed';
    input.style.top = `${buttonRect.bottom + 5}px`; // Ngay dưới button
    input.style.left = `${buttonRect.left}px`; // Cùng vị trí với button
    input.style.zIndex = '9999';
    input.style.opacity = '0.01'; // Gần như trong suốt nhưng vẫn có thể tương tác
    input.style.width = '1px';
    input.style.height = '1px';
    input.style.border = 'none';
    input.style.outline = 'none';
    input.style.pointerEvents = 'auto';
    
    // Thiết lập giá trị hiện tại nếu có
    if (type === 'start' && startDate) {
      input.value = startDate;
      console.log('📅 Setting start date value:', startDate);
    } else if (type === 'end' && endDate) {
      input.value = endDate;
      console.log('📅 Setting end date value:', endDate);
    }
    
    // Thêm vào body
    document.body.appendChild(input);
    console.log('📅 Input added to DOM at position:', input.style.top, input.style.left);
    
    // Xử lý khi chọn ngày
    const handleDateChange = (e) => {
      const value = e.target.value;
      console.log('📅 Date selected:', value);
      if (value) {
        if (type === 'start') {
          setStartDate(value);
          const date = new Date(value);
          setStartDateDisplay(date.toLocaleDateString('vi-VN'));
          console.log('📅 Start date updated:', value, '->', date.toLocaleDateString('vi-VN'));
        } else {
          setEndDate(value);
          const date = new Date(value);
          setEndDateDisplay(date.toLocaleDateString('vi-VN'));
          console.log('📅 End date updated:', value, '->', date.toLocaleDateString('vi-VN'));
        }
      }
      cleanup();
    };
    
    // Xử lý khi hủy
    const handleCancel = () => {
      console.log('📅 Date picker cancelled');
      cleanup();
    };
    
    // Cleanup function
    const cleanup = () => {
      input.removeEventListener('change', handleDateChange);
      input.removeEventListener('cancel', handleCancel);
      input.removeEventListener('blur', handleCancel);
      if (document.body.contains(input)) {
        document.body.removeChild(input);
        console.log('📅 Input removed from DOM');
      }
    };
    
    // Thêm event listeners
    input.addEventListener('change', handleDateChange);
    input.addEventListener('cancel', handleCancel);
    input.addEventListener('blur', handleCancel);
    
    // Trigger date picker
    setTimeout(() => {
      try {
        // Focus trước
        input.focus();
        console.log('📅 Focus triggered');
        
        // Sau đó click
        setTimeout(() => {
          input.click();
          console.log('📅 Click triggered');
          
          // Cuối cùng thử showPicker
          setTimeout(() => {
            if (input.showPicker && typeof input.showPicker === 'function') {
              try {
                input.showPicker();
                console.log('📅 showPicker() called');
              } catch (error) {
                console.log('📅 showPicker() failed:', error.message);
              }
            }
          }, 100);
        }, 100);
        
      } catch (error) {
        console.error('📅 Error triggering date picker:', error);
      }
    }, 100);
    
    // Cleanup sau 30 giây để tránh memory leak
    setTimeout(cleanup, 30000);
  };

  // Hàm lấy chi tiết theo ngày với cải thiện
  const getDailyDetails = useCallback(() => {
    if (!searchResults || searchResults.length === 0) return [];
    
    const groupedByDate = {};
    
    searchResults.forEach(detection => {
      const date = new Date(detection.detected_at).toLocaleDateString('vi-VN');
      if (!groupedByDate[date]) {
        groupedByDate[date] = {};
      }
      
      const cameraId = detection.camera_id;
      if (!groupedByDate[date][cameraId]) {
        groupedByDate[date][cameraId] = {
          cameraId: cameraId,
          cameraName: detection.camera_name || `Camera ${cameraId}`,
          detections: []
        };
      }
      
      groupedByDate[date][cameraId].detections.push(detection);
    });
    
    return Object.entries(groupedByDate).map(([date, cameras]) => ({
      date,
      cameras: Object.values(cameras)
    }));
  }, [searchResults]);

  // Hàm helper để lấy confidence score
  const getConfidenceScore = (detection) => {
    // Thử nhiều field có thể có confidence
    const confidence = detection.confidence_score || 
                      detection.confidence || 
                      detection.confidence_level ||
                      detection.accuracy ||
                      detection.score ||
                      0;
    
    // Nếu confidence là số từ 0-1, nhân với 100
    if (confidence <= 1 && confidence > 0) {
      return confidence;
    }
    
    // Nếu confidence là số từ 0-100, chia cho 100
    if (confidence > 1 && confidence <= 100) {
      return confidence / 100;
    }
    
    // Mặc định trả về 0.8 (80%) nếu không tìm thấy
    return confidence || 0.8;
  };


  // Hàm tìm đường đi ngắn nhất giữa hai điểm trên map
  const findShortestPath = (startPoint, endPoint) => {
    // Tìm điểm gần nhất với startPoint và endPoint trong đồ thị
    let startNode = null;
    let endNode = null;
    let minStartDist = Infinity;
    let minEndDist = Infinity;

    Object.keys(cities).forEach(cityKey => {
      const cityPos = cities[cityKey];
      const startDist = Math.sqrt(Math.pow(startPoint.x - cityPos[0], 2) + Math.pow(startPoint.y - cityPos[1], 2));
      const endDist = Math.sqrt(Math.pow(endPoint.x - cityPos[0], 2) + Math.pow(endPoint.y - cityPos[1], 2));

      if (startDist < minStartDist) {
        minStartDist = startDist;
        startNode = cityKey;
      }
      if (endDist < minEndDist) {
        minEndDist = endDist;
        endNode = cityKey;
      }
    });

    if (!startNode || !endNode || startNode === endNode) {
      return [startPoint, endPoint]; // Trả về đường thẳng nếu không tìm thấy đường đi
    }

    // Sử dụng thuật toán Dijkstra để tìm đường đi ngắn nhất
    const distances = {};
    const previous = {};
    const unvisited = new Set();
    const visited = new Set();

    // Khởi tạo distances
    Object.keys(cities).forEach(city => {
      distances[city] = city === startNode ? 0 : Infinity;
      unvisited.add(city);
    });

    while (unvisited.size > 0) {
      // Tìm node có distance nhỏ nhất
      let currentNode = null;
      let minDistance = Infinity;
      for (const node of unvisited) {
        if (distances[node] < minDistance) {
          minDistance = distances[node];
          currentNode = node;
        }
      }

      if (currentNode === null || currentNode === endNode) break;

      unvisited.delete(currentNode);
      visited.add(currentNode);

      // Cập nhật distances cho các neighbor
      const neighbors = graph[currentNode] || [];
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;

        const distance = calculateDistance(currentNode, neighbor);
        const newDistance = distances[currentNode] + distance;

        if (newDistance < distances[neighbor]) {
          distances[neighbor] = newDistance;
          previous[neighbor] = currentNode;
        }
      }
    }

    // Tạo đường đi từ endNode về startNode
    const path = [];
    let current = endNode;
    while (current !== undefined) {
      path.unshift(current);
      current = previous[current];
    }

    // Chuyển đổi path thành tọa độ
    const pathPoints = path.map(cityKey => {
      const cityPos = cities[cityKey];
      return { x: cityPos[0], y: cityPos[1] };
    });

    return pathPoints;
  };

  // Hàm vẽ đường đi của biển số xe
  const drawPlateRoute = (detections, plateNumber, orderedCameras = null) => {
    if (!sceneRef.current || detections.length === 0) return;

    // Xóa đường đi cũ nếu có
    clearPlateRoute();

    // Sử dụng orderedCameras từ backend nếu có, nếu không thì tự tính toán
    let routePoints = [];

    if (orderedCameras && orderedCameras.length > 0) {

      // Sử dụng dữ liệu camera đã được sắp xếp từ backend
      orderedCameras.forEach(cameraData => {
        const camera = activeCamerasRef.current.find(cam => cam.cameraData.id === parseInt(cameraData.camera_id));
        if (camera) {
          routePoints.push({
            x: camera.cameraData.x,
            y: camera.cameraData.y,
            cameraId: cameraData.camera_id,
            cameraName: cameraData.camera_name,
            detections: cameraData.detections,
            firstDetectedAt: cameraData.first_detected_at,
            detectionCount: cameraData.detection_count
          });
        } else {
          console.warn(`❌ Camera với ID ${cameraData.camera_id} (${cameraData.camera_name}) không tìm thấy trên map. Có thể camera chưa có tọa độ hoặc chưa được load.`);

          // Thử tìm camera trong allCameras
          const allCamera = cameraStateRef.current.allCameras.find(cam => cam.id === parseInt(cameraData.camera_id));
          if (allCamera) {
            console.log(`🔍 Found camera in allCameras:`, allCamera);
            if (allCamera.mapX && allCamera.mapY) {
              console.log(`📍 Camera has coordinates: (${allCamera.mapX}, ${allCamera.mapY})`);
              // Thêm camera với tọa độ từ allCameras
              routePoints.push({
                x: allCamera.mapX,
                y: allCamera.mapY,
                cameraId: cameraData.camera_id,
                cameraName: cameraData.camera_name,
                detections: cameraData.detections,
                firstDetectedAt: cameraData.first_detected_at,
                detectionCount: cameraData.detection_count
              });
            } else {
              console.warn(`⚠️ Camera ${cameraData.camera_id} không có tọa độ map (mapX: ${allCamera.mapX}, mapY: ${allCamera.mapY})`);
            }
          } else {
            console.error(`🚫 Camera ${cameraData.camera_id} không tồn tại trong cả activeCameras và allCameras`);
          }
        }
      });
    } else {
      console.log('⚠️ No ordered cameras from backend, calculating manually...');

      // Fallback: tự tính toán như cũ
      const sortedDetections = detections.sort((a, b) => new Date(a.detected_at) - new Date(b.detected_at));
      const cameraIds = [...new Set(sortedDetections.map(d => d.camera_id))];

      cameraIds.forEach(cameraId => {
        const camera = activeCamerasRef.current.find(cam => cam.cameraData.id === parseInt(cameraId));
        if (camera) {
          routePoints.push({
            x: camera.cameraData.x,
            y: camera.cameraData.y,
            cameraId: cameraId,
            cameraName: camera.cameraData.name,
            detections: sortedDetections.filter(d => d.camera_id === cameraId)
          });
        } else {
          console.warn(`Camera với ID ${cameraId} không tìm thấy trên map.`);
        }
      });
    }

    if (routePoints.length === 0) {
      console.error('❌ No valid route points found!');
      return;
    }

    // Tạo đường đi theo các con đường thực tế
    const allPathPoints = [];

    for (let i = 0; i < routePoints.length - 1; i++) {
      const startPoint = routePoints[i];
      const endPoint = routePoints[i + 1];

      // Tìm đường đi ngắn nhất giữa hai điểm
      const pathPoints = findShortestPath(startPoint, endPoint);

      // Thêm các điểm vào đường đi tổng thể
      if (i === 0) {
        allPathPoints.push(...pathPoints);
      } else {
        // Bỏ qua điểm đầu để tránh trùng lặp
        allPathPoints.push(...pathPoints.slice(1));
      }
    }

    // Tạo geometry cho đường đi
    const routeGeometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];

    allPathPoints.forEach((point, index) => {
      positions.push(point.x, 1.2, point.y); // Y = 1.2 để đường đi nổi trên mặt đất

      // Màu sắc theo thứ tự thời gian (gradient từ xanh đến đỏ)
      const color = new THREE.Color();
      color.setHSL(index / Math.max(allPathPoints.length - 1, 1) * 0.7, 1, 0.5);
      colors.push(color.r, color.g, color.b);
    });

    routeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    routeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const routeMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      linewidth: 8,
      transparent: true,
      opacity: 0.9
    });

    const routeLine = new THREE.Line(routeGeometry, routeMaterial);
    routeLine.userData = {
      type: 'plateRoute',
      plateNumber: plateNumber,
      detections: detections
    };

    sceneRef.current.add(routeLine);

    // Thêm hiệu ứng sáng cho đường đi
    const glowGeometry = new THREE.BufferGeometry();
    const glowPositions = [];
    const glowColors = [];

    allPathPoints.forEach((point, index) => {
      glowPositions.push(point.x, 1.1, point.y);
      const color = new THREE.Color();
      color.setHSL(index / Math.max(allPathPoints.length - 1, 1) * 0.7, 1, 0.8);
      glowColors.push(color.r, color.g, color.b);
    });

    glowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(glowPositions, 3));
    glowGeometry.setAttribute('color', new THREE.Float32BufferAttribute(glowColors, 3));

    const glowMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      linewidth: 12,
      transparent: true,
      opacity: 0.3
    });

    const glowLine = new THREE.Line(glowGeometry, glowMaterial);
    glowLine.userData = {
      type: 'plateRouteGlow',
      plateNumber: plateNumber
    };

    sceneRef.current.add(glowLine);

    // Tạo các điểm đánh dấu tại mỗi camera
    routePoints.forEach((point, index) => {
      // Marker chính
      const markerGeometry = new THREE.SphereGeometry(0.8, 16, 16);
      const markerMaterial = new THREE.MeshBasicMaterial({
        color: 0xff6b35,
        transparent: true,
        opacity: 0.9
      });

      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.set(point.x, 2, point.y);
      marker.userData = {
        type: 'routeMarker',
        cameraId: point.cameraId,
        cameraName: point.cameraName,
        detections: point.detections,
        plateNumber: plateNumber
      };

      // Thêm hiệu ứng sáng cho marker
      const glowGeometry = new THREE.SphereGeometry(1.2, 16, 16);
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0xff6b35,
        transparent: true,
        opacity: 0.3
      });

      const glowMarker = new THREE.Mesh(glowGeometry, glowMaterial);
      glowMarker.position.set(point.x, 2, point.y);
      glowMarker.userData = {
        type: 'routeMarkerGlow',
        cameraId: point.cameraId
      };

      // Thêm số thứ tự
      const numberGeometry = new THREE.SphereGeometry(0.3, 8, 8);
      const numberMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9
      });

      const numberMarker = new THREE.Mesh(numberGeometry, numberMaterial);
      numberMarker.position.set(point.x, 2.5, point.y);
      numberMarker.userData = {
        type: 'routeMarkerNumber',
        index: index + 1
      };

      // Thêm click handler cho marker
      marker.userData.onClick = () => {
        console.log('Route marker clicked:', point);

        // Hiển thị thông tin chi tiết về detections tại camera này
        // const detectionInfo = point.detections.map(detection => ({
        //   time: new Date(detection.detected_at).toLocaleString(),
        //   confidence: (detection.confidence_score * 100).toFixed(1) + '%',
        //   rawText: detection.raw_plate_text,
        //   vehicleType: detection.detected_vehicle_type || 'Unknown'
        // }));

        const firstDetection = point.detections[0];
        const lastDetection = point.detections[point.detections.length - 1];
        const avgConfidence = (point.detections.reduce((sum, d) => sum + d.confidence_score, 0) / point.detections.length * 100).toFixed(1);

        let infoText = `📍 Điểm ${index + 1}: ${point.cameraName}\n` +
          `🚗 Biển số: ${plateNumber}\n` +
          `📊 Số lần phát hiện: ${point.detections.length}\n` +
          `⏰ Thời gian đầu: ${new Date(firstDetection.detected_at).toLocaleString()}\n`;

        if (point.detections.length > 1) {
          infoText += `⏰ Thời gian cuối: ${new Date(lastDetection.detected_at).toLocaleString()}\n`;
        }

        infoText += `🎯 Độ tin cậy TB: ${avgConfidence}%\n` +
          `🚙 Loại xe: ${firstDetection.detected_vehicle_type || 'Unknown'}`;

        if (point.detectionCount && point.firstDetectedAt) {
          infoText += `\n🕒 Lần đầu phát hiện: ${new Date(point.firstDetectedAt).toLocaleString()}`;
        }

        alert(infoText);
      };

      // Tạo text hiển thị thời gian phía trên camera (nếu được bật)
      const timeText = showTimeTexts ? createTimeText(
        point.cameraName,
        point.detections[0].detected_at,
        point.detections.length,
        point.x, // X coordinate
        point.y  // Z coordinate (tọa độ thứ 2)
      ) : null;

      if (timeText) {
      } else {
        console.log(`❌ Failed to create time text for camera ${point.cameraId}`);
      }

      // Thêm tất cả marker vào scene
      sceneRef.current.add(marker);
      sceneRef.current.add(glowMarker);
      sceneRef.current.add(numberMarker);
      if (timeText) {
        sceneRef.current.add(timeText);
      }
    });

    // Lưu route để có thể xóa sau
    // setSelectedPlateRoute({
    //   line: routeLine,
    //   markers: sceneRef.current.children.filter(child =>
    //     child.userData.type === 'routeMarker'
    //   )
    // });

    // Debug: Kiểm tra tất cả time text trong scene
    const timeTextsInScene = sceneRef.current.children.filter(child =>
      child.userData.type === 'routeTimeText'
    );
    timeTextsInScene.forEach((text, index) => {
    });

    // Bay đến điểm đầu tiên
    if (routePoints.length > 0) {
      const firstPoint = routePoints[0];
      const targetPosition = new THREE.Vector3(firstPoint.x, 30, firstPoint.y + 15);
      const targetLookAt = new THREE.Vector3(firstPoint.x, 0, firstPoint.y);
      animateCamera(targetPosition, targetLookAt);
    }
  };

  // Hàm tạo text hiển thị thời gian phía trên camera
  const createTimeText = (cameraName, detectedAt, detectionCount, x, z) => {
    try {
      // Format thời gian
      const date = new Date(detectedAt);
      const timeStr = date.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      // Tạo text hiển thị (rút gọn tên camera nếu quá dài)
      const shortCameraName = cameraName.length > 15 ? cameraName.substring(0, 15) + '...' : cameraName;
      const displayText = `${shortCameraName}\n${timeStr}\n(${detectionCount} lần)`;

      // Tạo canvas cho text
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      // Kích thước canvas dựa trên text
      const fontSize = 16;
      const lineHeight = fontSize + 4;
      const lines = displayText.split('\n');
      const maxLineWidth = Math.max(...lines.map(line => line.length * fontSize * 0.6));

      canvas.width = maxLineWidth + 20;
      canvas.height = lines.length * lineHeight + 10;

      // Vẽ background
      context.fillStyle = 'rgba(0, 0, 0, 0.8)';
      context.fillRect(0, 0, canvas.width, canvas.height);

      // Vẽ border
      context.strokeStyle = '#00ff00';
      context.lineWidth = 2;
      context.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

      // Vẽ text
      context.fillStyle = '#ffffff';
      context.font = `bold ${fontSize}px Arial`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';

      lines.forEach((line, index) => {
        const yPos = (index + 1) * lineHeight - lineHeight / 2 + 5;
        context.fillText(line, canvas.width / 2, yPos);
      });

      // Tạo texture từ canvas
      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;

      // Tạo material
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.9
      });

      // Tạo sprite (giống như createTextAtPosition)
      const sprite = new THREE.Sprite(material);
      sprite.position.set(x, 6, z); // Y = 6 để cao hơn camera, Z = tọa độ thứ 2
      sprite.scale.set(canvas.width / 10, canvas.height / 5, 1); // Giống như createTextAtPosition
      sprite.center.set(0.5, 0.5);

      // Lưu thông tin vào userData
      sprite.userData = {
        type: 'routeTimeText',
        cameraName: cameraName,
        detectedAt: detectedAt,
        detectionCount: detectionCount
      };

      return sprite;
    } catch (error) {
      console.error(`❌ Error creating time text for ${cameraName}:`, error);
      return null;
    }
  };

  // Hàm xóa đường đi biển số xe
  const clearPlateRoute = () => {
    if (!sceneRef.current) return;

    // Xóa đường đi cũ (bao gồm cả time text)
    const objectsToRemove = sceneRef.current.children.filter(child =>
      child.userData.type === 'plateRoute' ||
      child.userData.type === 'plateRouteGlow' ||
      child.userData.type === 'routeMarker' ||
      child.userData.type === 'routeMarkerGlow' ||
      child.userData.type === 'routeMarkerNumber' ||
      child.userData.type === 'routeTimeText'
    );

    objectsToRemove.forEach(obj => {
      sceneRef.current.remove(obj);
    });

  };


  useEffect(() => {
    const mountElement = mountRef.current;
    if (!mountElement) return;

    // Khởi tạo scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    // Khởi tạo camera
    const camera = new THREE.PerspectiveCamera(75, mountElement.clientWidth / mountElement.clientHeight, 0.1, 1000);
    camera.position.set(50, 50, 50);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Khởi tạo renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountElement.clientWidth, mountElement.clientHeight);
    renderer.shadowMap.enabled = true;
    mountElement.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Đảm bảo canvas có thể tương tác
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.position = 'relative';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.pointerEvents = 'auto';
    renderer.domElement.style.cursor = 'grab';

    // Tạo mặt đất
    const planeGeometry = new THREE.PlaneGeometry(120, 150, 50, 50);
    const planeMaterial = new THREE.MeshStandardMaterial({
      color: 0x228B22,
      roughness: 0.8,
      metalness: 0.2
    });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    scene.add(plane);

    // Tạo hiệu ứng cỏ
    const grassGeometry = new THREE.PlaneGeometry(120, 100, 50, 50);
    const grassMaterial = new THREE.MeshStandardMaterial({
      color: 0x32CD32,
      roughness: 0.9,
      transparent: true,
      opacity: 0.3
    });
    const grass = new THREE.Mesh(grassGeometry, grassMaterial);
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = 0.02;
    scene.add(grass);

    // Tạo các đa giác (hồ nước, công viên, v.v.)
    function createPolygon(points, color, yOffset = 0.02, name = "") {
      const shape = new THREE.Shape();

      // Bắt đầu từ điểm đầu tiên
      shape.moveTo(points[0][0], points[0][1]);

      // Thêm các điểm tiếp theo
      for (let i = 1; i < points.length; i++) {
        shape.lineTo(points[i][0], points[i][1]);
      }

      // Đóng hình
      shape.lineTo(points[0][0], points[0][1]);

      const geometry = new THREE.ShapeGeometry(shape);
      const material = new THREE.MeshStandardMaterial({
        color: color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = yOffset;
      mesh.receiveShadow = true;

      if (name) {
        mesh.name = name;
      }

      return mesh;
    }

    // Tạo khu dân cư
    const residentialPoints = [
      [-32, 22], [-2, 22], [-1, -16], [-30, -16]
    ];
    const residential = createPolygon(residentialPoints, 0x696969, 0.026, "residential");
    scene.add(residential);

    const residentialPoints1 = [
      [56, -44], [21, -44], [21, -55], [56, -55]
    ];
    const residential1 = createPolygon(residentialPoints1, 0x696969, 0.026, "residential1");
    scene.add(residential1);

    const residentialPoints2 = [
      [56, -8], [38, -8], [38, -16], [20, -16], [21, -40], [56, -40],
    ];
    const residential2 = createPolygon(residentialPoints2, 0x696969, 0.026, "residential2");
    scene.add(residential2);

    const residentialPoints3 = [
      [55, 6], [55, -4], [38, -4], [38, 6],
    ];
    const residential3 = createPolygon(residentialPoints3, 0x696969, 0.026, "residential3");
    scene.add(residential3);

    const residentialPoints4 = [
      [50, 26], [33, 26], [33, 12], [3, 11], [3, -13], [36, -13], [36, 10], [54, 10],
    ];
    const residential4 = createPolygon(residentialPoints4, 0x696969, 0.026, "residential4");
    scene.add(residential4);

    const residentialPoints5 = [
      [29, 26], [2, 26], [2, 14], [29, 16],
    ];
    const residential5 = createPolygon(residentialPoints5, 0x696969, 0.026, "residential5");
    scene.add(residential5);

    const residentialPoints6 = [
      [49, 70], [0, 65], [2, 29], [49, 29],
    ];
    const residential6 = createPolygon(residentialPoints6, 0x696969, 0.026, "residential6");
    scene.add(residential6);

    const residentialPoints7 = [
      [-2, 39], [-25, 38], [-25, 26], [-1, 26],
    ];
    const residential7 = createPolygon(residentialPoints7, 0x696969, 0.026, "residential7");
    scene.add(residential7);

    const residentialPoints8 = [
      [-3, 58], [-54, 57], [-54, 40], [-2, 41],
    ];
    const residential8 = createPolygon(residentialPoints8, 0x696969, 0.026, "residential8");
    scene.add(residential8);

    const residentialPoints9 = [
      [-29, 38], [-55, 38], [-55, 18], [-36, 18], [-36, 26], [-29, 26],
    ];
    const residential9 = createPolygon(residentialPoints9, 0x696969, 0.026, "residential9");
    scene.add(residential9);

    const residentialPoints10 = [
      [-35, 15], [-55, 15], [-55, -25], [-34, -25],
    ];
    const residential10 = createPolygon(residentialPoints10, 0x696969, 0.026, "residential10");
    scene.add(residential10);

    const residentialPoints11 = [
      [16, -16], [4, -16], [4, -18], [-30, -18], [-30, -25], [16, -25]
    ];
    const residential11 = createPolygon(residentialPoints11, 0x696969, 0.026, "residential11");
    scene.add(residential11);





    // Hàm tạo text tại tọa độ bất kỳ
    function createTextAtPosition(text, x, z, color = '#4CAF50', fontSize = 24) {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      // Kích thước canvas dựa trên độ dài text
      const textWidth = text.length * fontSize * 0.6;
      canvas.width = textWidth + 40;
      canvas.height = fontSize + 20;

      // Xóa nền
      context.clearRect(0, 0, canvas.width, canvas.height);

      // Vẽ text
      context.fillStyle = color;
      context.font = `bold ${fontSize}px Arial`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(text, canvas.width / 2, canvas.height / 2);

      // Tạo texture từ canvas
      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true
      });

      // Tạo sprite
      const sprite = new THREE.Sprite(material);
      sprite.position.set(x, 3, z);
      sprite.scale.set(textWidth / 10, fontSize / 5, 1);
      sprite.center.set(0.5, 0);

      return sprite;
    }

    // Vật liệu đường đi
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.9,
      metalness: 0.1
    });


    // Tạo đường đi và nhà
    connections.forEach(([start, end]) => {
      if (cities[start] && cities[end]) {
        const startPos = new THREE.Vector3(cities[start][0], 0.05, cities[start][1]);
        const endPos = new THREE.Vector3(cities[end][0], 0.05, cities[end][1]);

        // Tạo đường đi
        const distance = startPos.distanceTo(endPos);
        const roadGeometry = new THREE.BoxGeometry(0.8, 0.1, distance);
        const road = new THREE.Mesh(roadGeometry, roadMaterial);
        road.castShadow = true;
        road.receiveShadow = true;

        const midpoint = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);
        road.position.copy(midpoint);

        // Căn chỉnh đường đi với hướng
        const roadDirection = new THREE.Vector3().subVectors(endPos, startPos).normalize();
        const angle = Math.atan2(roadDirection.x, roadDirection.z);
        road.rotation.y = angle;

        scene.add(road);

      }
    });

    // Thuật toán DFS để tìm tất cả đường đi
    const findAllPaths = (start, end, visited = new Set(), path = [start], allPaths = []) => {
      if (start === end) {
        allPaths.push([...path]);
        return allPaths;
      }
      visited.add(start);
      for (const neighbor of graph[start]) {
        if (!visited.has(neighbor)) {
          path.push(neighbor);
          findAllPaths(neighbor, end, visited, path, allPaths);
          path.pop();
        }
      }
      visited.delete(start);
      return allPaths;
    };

    // Tính độ dài đường đi
    const calculatePathLength = (path) => {
      let length = 0;
      for (let i = 0; i < path.length - 1; i++) {
        length += calculateDistance(path[i], path[i + 1]);
      }
      return length;
    };

    // Màu sắc cho các đường đi
    const pathColors = [
      0x0000ff, // Blue
      0x800080, // Purple
      0xffa500, // Orange
      0x00ffff, // Cyan
      0xff00ff, // Magenta
      0x008000, // Green
      0xffc0cb  // Pink
    ];

    // Hiển thị đường đi trong 3D
    const visualizePaths = (paths) => {
      // Xóa các đường đi hiện có
      pathMeshesRef.current.forEach(segments => {
        segments.forEach(segment => {
          scene.remove(segment);
        });
      });
      pathMeshesRef.current = [];

      if (paths.length === 0) return;

      // Tính độ dài đường đi và tìm đường ngắn nhất
      pathLengthsRef.current = paths.map(path => calculatePathLength(path));
      const minLength = Math.min(...pathLengthsRef.current);
      const shortestPathIndex = pathLengthsRef.current.indexOf(minLength);

      // Hiển thị đường đi trong 3D
      let colorIndex = 0;

      paths.forEach((path, index) => {
        const color = (index === shortestPathIndex) ? 0xff0000 : pathColors[colorIndex++ % pathColors.length];
        const yOffset = 0.15 + index * 0.1;

        const pathSegments = [];

        for (let i = 0; i < path.length - 1; i++) {
          const start = path[i];
          const end = path[i + 1];

          if (cities[start] && cities[end]) {
            const startPos = new THREE.Vector3(cities[start][0], yOffset, cities[start][1]);
            const endPos = new THREE.Vector3(cities[end][0], yOffset, cities[end][1]);

            const distance = startPos.distanceTo(endPos);
            const pathGeometry = new THREE.BoxGeometry(0.4, 0.1, distance);
            const pathMaterial = new THREE.MeshStandardMaterial({
              color,
              roughness: 0.9,
              metalness: 0.1,
              emissive: (index === shortestPathIndex) ? 0x440000 : 0x000000
            });

            const pathRoad = new THREE.Mesh(pathGeometry, pathMaterial);
            pathRoad.castShadow = true;
            pathRoad.receiveShadow = true;
            pathRoad.visible = true;

            const midpoint = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);
            pathRoad.position.copy(midpoint);

            const pathDirection = new THREE.Vector3().subVectors(endPos, startPos).normalize();
            const angle = Math.atan2(pathDirection.x, pathDirection.z);
            pathRoad.rotation.y = angle;

            scene.add(pathRoad);
            pathSegments.push(pathRoad);
          }
        }

        pathMeshesRef.current.push(pathSegments);
      });
    };

    // Hàm cập nhật camera (có thể gọi từ bên ngoài)
    window.updateCameras = async () => {
      await createCameraIcons();
    };

    // Hàm refresh camera (có thể gọi từ bên ngoài)
    window.refreshCameras = refreshCameras;

    // Tìm đường đi khi component được mount
    allPathsRef.current = findAllPaths('A', 'B');
    visualizePaths(allPathsRef.current);
    createCameraIcons();

    // Điều khiển camera
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 30;
    controls.maxDistance = 150;
    controls.maxPolarAngle = Math.PI / 2 - 0.1;
    controlsRef.current = controls;

    // Thêm raycasting để xử lý click trên camera
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseClick = (event) => {
      // Chỉ xử lý click nếu không phải từ control panel
      const controlPanel = document.querySelector('.control-panel');
      if (controlPanel && controlPanel.contains(event.target)) {
        console.log('Click from control panel, ignoring');
        return; // Bỏ qua click từ control panel
      }

      // Tính toán vị trí chuột
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Tạo ray từ camera
      raycaster.setFromCamera(mouse, camera);

      // Kiểm tra intersection với camera objects và route markers
      const allClickableObjects = [
        ...activeCamerasRef.current.map(cam => cam.camera),
        ...sceneRef.current.children.filter(child =>
          child.userData.type === 'routeMarker' ||
          child.userData.type === 'routeMarkerGlow' ||
          child.userData.type === 'routeMarkerNumber'
        )
      ];

      const intersects = raycaster.intersectObjects(allClickableObjects);

      if (intersects.length > 0) {
        const clickedObject = intersects[0].object;
        if (clickedObject.userData.onClick) {
          clickedObject.userData.onClick();
        }
      }
    };

    renderer.domElement.addEventListener('click', onMouseClick);

    // Ánh sáng
    const ambientLight = new THREE.AmbientLight(0x404040, 0.8);
    scene.add(ambientLight);

    scene.add(createTextAtPosition("S1", 39, 50, "#000000", 32));
    scene.add(createTextAtPosition("S2", 28, 28, "#000000", 32));
    scene.add(createTextAtPosition("S3", 12, 25, "#000000", 32));
    scene.add(createTextAtPosition("S4", 48, 20, "#000000", 32));
    scene.add(createTextAtPosition("S5", 41, -15, "#000000", 32));
    scene.add(createTextAtPosition("S6", 11, -15, "#000000", 32));
    scene.add(createTextAtPosition("H3", 28, 3, "#000000", 32));
    // Tạo text "Đường Hoàng Quốc Việt" dọc theo đoạn A-B
    function createTextAlongPath(text, startCity, endCity, fontSize = 25) {
      if (!cities[startCity] || !cities[endCity]) return null;

      const startPos = new THREE.Vector3(cities[startCity][0], 0, cities[startCity][1]);
      const endPos = new THREE.Vector3(cities[endCity][0], 0, cities[endCity][1]);

      // Tính điểm giữa
      const midpoint = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);

      // Tính góc xoay dựa trên hướng đường
      const direction = new THREE.Vector3().subVectors(endPos, startPos).normalize();
      const angle = Math.atan2(direction.x, direction.z);

      // Tạo canvas cho text
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      const textWidth = text.length * fontSize * 0.6;
      canvas.width = textWidth + 40;
      canvas.height = fontSize + 20;

      // Xóa nền
      context.clearRect(0, 0, canvas.width, canvas.height);

      // Vẽ text
      context.fillStyle = '#000000';
      context.font = `bold ${fontSize}px Arial`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(text, canvas.width / 2, canvas.height / 2);

      // Tạo texture từ canvas
      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true
      });

      // Tạo sprite
      const sprite = new THREE.Sprite(material);
      sprite.position.set(midpoint.x, 2, midpoint.z);
      sprite.scale.set(textWidth / 8, fontSize / 4, 1);
      sprite.center.set(0.5, 0.5);
      sprite.rotation.y = angle; // Xoay theo hướng đường

      return sprite;
    }

    // Thêm text "Đường Hoàng Quốc Việt" dọc theo đoạn A-B
    const roadText = createTextAlongPath("Đường Hoàng Quốc Việt", "A", "B", 25);
    if (roadText) {
      scene.add(roadText);
    }

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(20, 40, 20);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    const pointLight = new THREE.PointLight(0xffaa00, 0.5, 100);
    pointLight.position.set(0, 20, 0);
    scene.add(pointLight);

    // Vòng lặp animation
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Xử lý thay đổi kích thước cửa sổ
    const handleResize = () => {
      if (mountElement) {
        const width = mountElement.clientWidth;
        const height = mountElement.clientHeight;

        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      }
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('click', onMouseClick);
      if (mountElement && renderer.domElement && mountElement.contains(renderer.domElement)) {
        mountElement.removeChild(renderer.domElement);
      }

    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  // Vẽ lại route khi showTimeTexts thay đổi
  useEffect(() => {
    if (searchResults.length > 0 && searchPlateNumber) {
      // Vẽ lại route với cài đặt hiển thị thời gian mới
      drawPlateRoute(searchResults, searchPlateNumber);
    }
  }, [showTimeTexts]); // eslint-disable-line react-hooks/exhaustive-deps



  // Hàm animate camera
  function animateCamera(targetPosition, targetLookAt) {
    const startPosition = cameraRef.current.position.clone();
    const startLookAt = controlsRef.current.target.clone();

    const duration = 1000; // ms
    const startTime = Date.now();

    function updateCamera() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease in-out function
      const ease = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      // Interpolate position
      cameraRef.current.position.lerpVectors(startPosition, targetPosition, ease);

      // Interpolate look-at target
      const currentLookAt = new THREE.Vector3();
      currentLookAt.lerpVectors(startLookAt, targetLookAt, ease);
      controlsRef.current.target.copy(currentLookAt);
      controlsRef.current.update();

      if (progress < 1) {
        requestAnimationFrame(updateCamera);
      }
    }

    updateCamera();
  }

  return (
    <div className="route-monitoring-container" style={{ display: 'flex', height: '100vh', backgroundColor: '#f5f7fa' }}>
      {/* Bên trái - Map 3D */}
      <div style={{ flex: '0 0 70%', position: 'relative', backgroundColor: '#1a1a2e' }}>
        <div ref={mountRef} className="threejs-container" style={{ width: '100%', height: '100%' }} />

        {/* Loading overlay */}
        {isLoading && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              backgroundColor: 'white',
              padding: '20px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
            }}>
              <div style={{
                width: '20px',
                height: '20px',
                border: '2px solid #f3f3f3',
                borderTop: '2px solid #007bff',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}></div>
              <span style={{ color: '#333', fontWeight: '500' }}>Đang tải dữ liệu...</span>
            </div>
          </div>
        )}

        {/* Map controls */}
        <div style={{
          position: 'absolute',
          top: '15px',
          right: '15px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          zIndex: 100
        }}>

          {/* Map info */}
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            padding: '12px',
            borderRadius: '8px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            minWidth: '200px'
          }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#333' }}>🗺️ Thông tin bản đồ</h4>
            <p style={{ margin: '2px 0', fontSize: '12px', color: '#666' }}>• Click camera để xem thông tin</p>
            <p style={{ margin: '2px 0', fontSize: '12px', color: '#666' }}>• Kéo chuột để xoay bản đồ</p>
            <p style={{ margin: '2px 0', fontSize: '12px', color: '#666' }}>• Scroll để zoom in/out</p>
            <p style={{ margin: '2px 0', fontSize: '12px', color: '#666' }}>• Tìm kiếm biển số để vẽ lộ trình</p>
          </div>
        </div>

      </div>

      {/* Bên phải - Control Panel */}
      <div style={{ flex: '0 0 30%', display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff', borderLeft: '1px solid #e9ecef' }}>
        {/* Header */}
        <div style={{ 
          backgroundColor: '#007bff', 
          padding: '16px',
          color: 'white'
        }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🔍 Tìm kiếm biển số xe
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', opacity: 0.9 }}>
            Tìm kiếm và theo dõi lộ trình di chuyển của phương tiện
          </p>
        </div>

        {/* Content area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            <div>
            {/* Search form */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#333', fontWeight: '600' }}>
                  Thông tin tìm kiếm
            </h3>
            <button
              onClick={refreshAll}
              style={{
                    padding: '8px 12px',
                    backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                    borderRadius: '6px',
                cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseOver={(e) => e.target.style.backgroundColor = '#5a6268'}
                  onMouseOut={(e) => e.target.style.backgroundColor = '#6c757d'}
                >
                  🔄 Reset
                </button>
              </div>

              {/* Biển số xe input */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '14px', color: '#333', marginBottom: '8px', display: 'block', fontWeight: '600' }}>
                  🚗 Biển số xe:
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={searchPlateNumber}
                    onChange={(e) => setSearchPlateNumber(e.target.value)}
                    placeholder="Ví dụ: 30A-12345, 88A-410.10..."
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      border: '2px solid #e9ecef',
                      borderRadius: '8px',
                      fontSize: '14px',
                      backgroundColor: 'white',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#007bff';
                      e.target.style.boxShadow = '0 0 0 3px rgba(0,123,255,0.1)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#e9ecef';
                      e.target.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
                    }}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleSearchPlate(searchPlateNumber);
                      }
                    }}
                  />
                  <button
                    onClick={() => handleSearchPlate(searchPlateNumber)}
                    disabled={isSearching || !searchPlateNumber.trim()}
                    style={{
                      padding: '12px 20px',
                      backgroundColor: isSearching || !searchPlateNumber.trim() ? '#ccc' : '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: isSearching || !searchPlateNumber.trim() ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                      minWidth: '120px'
                    }}
                    onMouseOver={(e) => {
                      if (!isSearching && searchPlateNumber.trim()) {
                        e.target.style.backgroundColor = '#218838';
                        e.target.style.transform = 'translateY(-1px)';
                        e.target.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (!isSearching && searchPlateNumber.trim()) {
                        e.target.style.backgroundColor = '#28a745';
                        e.target.style.transform = 'translateY(0)';
                        e.target.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                      }
                    }}
                  >
                    {isSearching ? '⏳ Đang tìm...' : '🔍 Tìm kiếm'}
                  </button>
                </div>
                </div>

              {/* Khoảng thời gian */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '14px', color: '#333', marginBottom: '8px', display: 'block', fontWeight: '600' }}>
                  📅 Khoảng thời gian:
                </label>

                {/* Quick date buttons */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <button
                    onClick={() => {
                      const today = new Date();
                      const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
                      setStartDate(sevenDaysAgo.toISOString().split('T')[0]);
                      setEndDate(today.toISOString().split('T')[0]);
                      setStartDateDisplay(sevenDaysAgo.toLocaleDateString('vi-VN'));
                      setEndDateDisplay(today.toLocaleDateString('vi-VN'));
                    }}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#17a2b8',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontWeight: '500',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseOver={(e) => {
                      e.target.style.backgroundColor = '#138496';
                      e.target.style.transform = 'translateY(-1px)';
                    }}
                    onMouseOut={(e) => {
                      e.target.style.backgroundColor = '#17a2b8';
                      e.target.style.transform = 'translateY(0)';
                    }}
                  >
                    📅 7 ngày qua
                  </button>
                  <button
                    onClick={() => {
                      setStartDate('');
                      setEndDate('');
                      setStartDateDisplay('');
                      setEndDateDisplay('');
                    }}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#6c757d',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontWeight: '500',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseOver={(e) => {
                      e.target.style.backgroundColor = '#5a6268';
                      e.target.style.transform = 'translateY(-1px)';
                    }}
                    onMouseOut={(e) => {
                      e.target.style.backgroundColor = '#6c757d';
                      e.target.style.transform = 'translateY(0)';
                    }}
                  >
                    🗑️ Xóa lọc
            </button>
          </div>

          {/* Date range inputs */}
                <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                  Từ ngày:
                </label>
                 <div style={{ position: 'relative' }}>
                   <input
                     type="text"
                     value={startDateDisplay}
                     placeholder="dd/mm/yyyy"
                     onChange={(e) => setStartDateDisplay(e.target.value)}
                        onFocus={(e) => {
                          handleDateFocus(e, 'start');
                          e.target.style.borderColor = '#007bff';
                          e.target.style.boxShadow = '0 0 0 3px rgba(0,123,255,0.1)';
                        }}
                        onBlur={(e) => {
                          handleDateBlur(e, 'start');
                          e.target.style.borderColor = '#e9ecef';
                          e.target.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
                        }}
                     style={{
                       width: '100%',
                          padding: '10px 40px 10px 12px',
                          border: '2px solid #e9ecef',
                          borderRadius: '6px',
                          fontSize: '13px',
                          backgroundColor: 'white',
                          transition: 'all 0.2s ease',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                     }}
                   />
                   <button
                     type="button"
                     onClick={(e) => handleCalendarClick('start', e)}
                     style={{
                       position: 'absolute',
                          right: '8px',
                       top: '50%',
                       transform: 'translateY(-50%)',
                       background: 'none',
                       border: 'none',
                       cursor: 'pointer',
                          fontSize: '16px',
                          color: '#007bff',
                          padding: '4px',
                          borderRadius: '4px',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseOver={(e) => {
                          e.target.style.backgroundColor = '#f8f9fa';
                          e.target.style.transform = 'translateY(-50%) scale(1.1)';
                        }}
                        onMouseOut={(e) => {
                          e.target.style.backgroundColor = 'transparent';
                          e.target.style.transform = 'translateY(-50%) scale(1)';
                     }}
                   >
                     📅
                   </button>
                 </div>
              </div>
              <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                  Đến ngày:
                </label>
                 <div style={{ position: 'relative' }}>
                   <input
                     type="text"
                     value={endDateDisplay}
                     placeholder="dd/mm/yyyy"
                     onChange={(e) => setEndDateDisplay(e.target.value)}
                        onFocus={(e) => {
                          handleDateFocus(e, 'end');
                          e.target.style.borderColor = '#007bff';
                          e.target.style.boxShadow = '0 0 0 3px rgba(0,123,255,0.1)';
                        }}
                        onBlur={(e) => {
                          handleDateBlur(e, 'end');
                          e.target.style.borderColor = '#e9ecef';
                          e.target.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
                        }}
                     style={{
                       width: '100%',
                          padding: '10px 40px 10px 12px',
                          border: '2px solid #e9ecef',
                          borderRadius: '6px',
                          fontSize: '13px',
                          backgroundColor: 'white',
                          transition: 'all 0.2s ease',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                     }}
                   />
                   <button
                     type="button"
                     onClick={(e) => handleCalendarClick('end', e)}
                     style={{
                       position: 'absolute',
                          right: '8px',
                       top: '50%',
                       transform: 'translateY(-50%)',
                       background: 'none',
                       border: 'none',
                       cursor: 'pointer',
                          fontSize: '16px',
                          color: '#007bff',
                          padding: '4px',
                          borderRadius: '4px',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseOver={(e) => {
                          e.target.style.backgroundColor = '#f8f9fa';
                          e.target.style.transform = 'translateY(-50%) scale(1.1)';
                        }}
                        onMouseOut={(e) => {
                          e.target.style.backgroundColor = 'transparent';
                          e.target.style.transform = 'translateY(-50%) scale(1)';
                     }}
                   >
                     📅
                   </button>
                 </div>
              </div>
            </div>
          </div>

                {/* Display options */}
              <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer' }}>
              <input
                      type="checkbox"
                      checked={showTimeTexts}
                      onChange={(e) => setShowTimeTexts(e.target.checked)}
                    style={{ 
                      margin: 0, 
                      transform: 'scale(1.2)',
                      accentColor: '#007bff'
                    }}
                  />
                  <span style={{ color: '#333', fontWeight: '500' }}>⏰ Hiển thị thời gian trên camera</span>
                  </label>
                </div>

                {/* Search history */}
                {searchHistory.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '14px', color: '#333', marginBottom: '10px', fontWeight: '600' }}>
                      📚 Lịch sử tìm kiếm
                    </h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {searchHistory.slice(0, 5).map((item, index) => (
                        <button
                          key={index}
                          onClick={() => {
                            setSearchPlateNumber(item.plateNumber);
                            handleSearchPlate(item.plateNumber);
                          }}
                style={{
                          padding: '6px 12px',
                            backgroundColor: '#e9ecef',
                            color: '#495057',
                  border: 'none',
                          borderRadius: '16px',
                          fontSize: '12px',
                            cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          fontWeight: '500'
                          }}
                          onMouseOver={(e) => {
                            e.target.style.backgroundColor = '#007bff';
                            e.target.style.color = 'white';
                          e.target.style.transform = 'translateY(-1px)';
                          }}
                          onMouseOut={(e) => {
                            e.target.style.backgroundColor = '#e9ecef';
                            e.target.style.color = '#495057';
                          e.target.style.transform = 'translateY(0)';
                          }}
                        >
                          {item.plateNumber} ({item.resultCount})
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            {/* Search results summary */}
            {searchResults.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <div style={{ 
                  padding: '12px', 
                  backgroundColor: '#e8f5e8', 
                  borderRadius: '8px', 
                  border: '1px solid #c8e6c9',
                  marginBottom: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '14px', color: '#2e7d32', fontWeight: '600' }}>
                ✅ Tìm thấy {searchResults.length} phát hiện
                    </h4>
                    <button
                      onClick={() => toggleFavorite(searchPlateNumber)}
                      style={{
                        background: 'none',
                        border: 'none',
                        fontSize: '16px',
                        cursor: 'pointer',
                        color: favoritePlates.includes(searchPlateNumber) ? '#ffc107' : '#ccc'
                      }}
                    >
                      {favoritePlates.includes(searchPlateNumber) ? '⭐' : '☆'}
                    </button>
                  </div>
                  
                  <div style={{ fontSize: '12px', color: '#2e7d32' }}>
                    <div style={{ marginBottom: '4px' }}>
                      <strong>Biển số:</strong> {searchPlateNumber}
                    </div>
                    <div style={{ marginBottom: '4px' }}>
                      <strong>📅 Thời gian:</strong> {
                        startDate && endDate
                     ? `Từ ${new Date(startDate).toLocaleDateString('vi-VN')} đến ${new Date(endDate).toLocaleDateString('vi-VN')}`
                     : startDate
                       ? `Từ ${new Date(startDate).toLocaleDateString('vi-VN')}`
                       : endDate
                         ? `Đến ${new Date(endDate).toLocaleDateString('vi-VN')}`
                         : 'Tất cả thời gian'
                   }
                    </div>
                    <div style={{ marginBottom: '4px' }}>
                      <strong>📊 Thống kê:</strong> {getDailyDetails().length} ngày hoạt động, {[...new Set(searchResults.map(r => r.camera_id))].length} camera
                    </div>
                    <div style={{ fontSize: '11px', color: '#4caf50', fontWeight: '500' }}>
                🗺️ Đường đi được vẽ trên bản đồ
                    </div>
                  </div>
                </div>
            </div>
          )}

            {/* Daily Details */}
            {getDailyDetails().length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <div style={{ marginBottom: '12px' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', color: '#333', fontWeight: '600' }}>
                📊 Chi tiết theo ngày
              </h4>
                </div>
                
              <div style={{ 
                  maxHeight: '400px', 
                overflowY: 'auto', 
                  border: '1px solid #e9ecef', 
                  borderRadius: '8px',
                  backgroundColor: 'white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}>
                {getDailyDetails().map((dayData, dayIndex) => (
                    <div key={dayIndex} style={{ borderBottom: '1px solid #f1f3f4' }}>
                    <div style={{ 
                        padding: '12px 16px', 
                      backgroundColor: '#f8f9fa', 
                        fontWeight: '600', 
                        fontSize: '13px',
                        color: '#495057',
                      position: 'sticky',
                      top: 0,
                        zIndex: 1,
                        borderBottom: '1px solid #e9ecef'
                    }}>
                      📅 {dayData.date} ({dayData.cameras.length} camera)
                    </div>
                    {dayData.cameras.map((cameraData, cameraIndex) => (
                        <div key={cameraIndex} style={{ padding: '12px 16px', borderBottom: '1px solid #f8f9fa' }}>
                          <div style={{ 
                            fontSize: '12px', 
                            fontWeight: '600', 
                            color: '#007bff', 
                            marginBottom: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}>
                            📹 {cameraData.cameraName}
                            <span style={{ 
                              backgroundColor: '#e3f2fd', 
                              color: '#1976d2', 
                              padding: '2px 6px', 
                              borderRadius: '10px', 
                              fontSize: '10px',
                              fontWeight: '500'
                            }}>
                              {cameraData.detections.length} lần
                            </span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {cameraData.detections.map((detection, detectionIndex) => (
                            <span
                              key={detectionIndex}
                              style={{
                                  padding: '4px 8px',
                                  backgroundColor: '#e8f5e8',
                                  color: '#2e7d32',
                                borderRadius: '12px',
                                  fontSize: '11px',
                                  fontWeight: '500',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease'
                                }}
                                onMouseOver={(e) => {
                                  e.target.style.backgroundColor = '#c8e6c9';
                                  e.target.style.transform = 'scale(1.05)';
                                }}
                                onMouseOut={(e) => {
                                  e.target.style.backgroundColor = '#e8f5e8';
                                  e.target.style.transform = 'scale(1)';
                                }}
                                onClick={() => setSelectedDetection(detection)}
                            >
                              {new Date(detection.detected_at).toLocaleTimeString('vi-VN', { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                                })} ({Math.round(getConfidenceScore(detection) * 100)}%)
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

            {/* Camera Info Panel */}
            {showCameraInfo && selectedCameraInfo && (
              <div style={{ marginTop: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', color: '#333', fontWeight: '600' }}>
                📹 Thông tin Camera
              </h4>
                  <button
                    onClick={() => setShowCameraInfo(false)}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '16px',
                      cursor: 'pointer',
                      color: '#666'
                    }}
                  >
                    ✕
                  </button>
                </div>
                
              <div style={{ 
                  border: '1px solid #e9ecef', 
                  borderRadius: '8px',
                  backgroundColor: 'white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                  <div style={{ 
                    padding: '12px 16px', 
                    backgroundColor: '#f8f9fa', 
                    fontWeight: '600', 
                    fontSize: '13px', 
                    color: '#495057',
                    borderBottom: '1px solid #e9ecef',
                    borderRadius: '8px 8px 0 0'
                  }}>
                  📹 {selectedCameraInfo.cameraName || `Camera ${selectedCameraInfo.cameraId}`}
                </div>
                  <div style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
                      Tổng số phát hiện: <strong style={{ color: '#007bff' }}>{selectedCameraInfo.totalDetections}</strong>
                  </div>
                  {selectedCameraInfo.detections.length > 0 && (
                    <div>
                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
                        Biển số đã phát hiện:
                      </div>
                        <div style={{ 
                          display: 'flex', 
                          flexWrap: 'wrap', 
                          gap: '6px',
                          maxHeight: '300px',
                          overflowY: 'auto',
                          padding: '8px',
                          backgroundColor: '#f8f9fa',
                          borderRadius: '6px',
                          border: '1px solid #e9ecef'
                        }}>
                        {selectedCameraInfo.detections.map((detection, index) => (
                          <span
                            key={index}
                            style={{
                                padding: '4px 8px',
                              backgroundColor: '#e8f5e8',
                              color: '#2e7d32',
                              borderRadius: '12px',
                                fontSize: '11px',
                                fontWeight: '500',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                flexShrink: 0
                              }}
                              onMouseOver={(e) => {
                                e.target.style.backgroundColor = '#c8e6c9';
                                e.target.style.transform = 'scale(1.05)';
                              }}
                              onMouseOut={(e) => {
                                e.target.style.backgroundColor = '#e8f5e8';
                                e.target.style.transform = 'scale(1)';
                              }}
                            >
                              {detection.plate_number} ({Math.round(getConfidenceScore(detection) * 100)}%)
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

            {/* Detection Detail Modal */}
            {selectedDetection && (
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000
              }}>
                <div style={{
                  backgroundColor: 'white',
                  padding: '20px',
                  borderRadius: '12px',
                  maxWidth: '500px',
                  width: '90%',
                  maxHeight: '80vh',
                  overflowY: 'auto',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', color: '#333', fontWeight: '600' }}>
                      📋 Chi tiết phát hiện
                    </h3>
                    <button
                      onClick={() => setSelectedDetection(null)}
                      style={{
                        background: 'none',
                        border: 'none',
                        fontSize: '20px',
                        cursor: 'pointer',
                        color: '#666'
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  
                  <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
                    <div style={{ marginBottom: '8px' }}>
                      <strong>Biển số:</strong> {selectedDetection.plate_number}
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      <strong>Thời gian:</strong> {new Date(selectedDetection.detected_at).toLocaleString('vi-VN')}
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      <strong>Camera:</strong> {selectedDetection.camera_name || `Camera ${selectedDetection.camera_id}`}
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      <strong>Độ tin cậy:</strong> {Math.round(getConfidenceScore(selectedDetection) * 100)}%
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      <strong>Loại xe:</strong> {selectedDetection.detected_vehicle_type || 'Unknown'}
                    </div>
                    {selectedDetection.raw_plate_text && (
                      <div style={{ marginBottom: '8px' }}>
                        <strong>Text gốc:</strong> {selectedDetection.raw_plate_text}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RouteMonitoring;
