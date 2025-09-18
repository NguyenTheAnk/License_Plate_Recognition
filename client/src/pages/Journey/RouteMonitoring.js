import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import CameraViewer from '../../components/CameraViewer';
import CameraActionBar from '../ViewCamera/CameraActionBar';
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
  const selectedPathIndexRef = useRef(-1);
  const activeCamerasRef = useRef([]);

  // State để quản lý camera được chọn và hiển thị
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [isRecognizing, setIsRecognizing] = useState(false);

  // State cho CameraActionBar
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentQuality, setCurrentQuality] = useState('medium');
  const [recordingTimer, setRecordingTimer] = useState(0);
  const [recordingData, setRecordingData] = useState(null);

  // State cho tìm kiếm biển số xe
  const [searchPlateNumber, setSearchPlateNumber] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPlateRoute, setSelectedPlateRoute] = useState(null);

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
        setSelectedCamera({
          id: cameraData.id,
          name: cameraData.name,
          streamUrl: cameraData.streamUrl || `http://localhost:5000/api/cameras/${cameraData.id}/stream`,
          status: cameraData.status,
          location_name: cameraData.location_name,
          isUploadedVideo: false
        });
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

  // Hàm tìm kiếm biển số xe
  const handleSearchPlate = async (plateNumber) => {
    if (!plateNumber.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/plates/search-route?plate_number=${encodeURIComponent(plateNumber)}`, {
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
        setSearchResults(data.data);
        // Tự động vẽ đường đi nếu có kết quả
        if (data.data.length > 0) {
          drawPlateRoute(data.data, plateNumber);
        }
      } else {
        console.error('API error:', data.message);
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Lỗi khi tìm kiếm biển số xe:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
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
  const drawPlateRoute = (detections, plateNumber) => {
    if (!sceneRef.current || detections.length === 0) return;

    // Xóa đường đi cũ nếu có
    clearPlateRoute();

    // Sắp xếp theo thời gian
    const sortedDetections = detections.sort((a, b) => new Date(a.detected_at) - new Date(b.detected_at));

    // Lấy danh sách camera từ detections
    const cameraIds = [...new Set(sortedDetections.map(d => d.camera_id))];

    // Tìm vị trí camera trên map
    const routePoints = [];
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
      }
    });

    if (routePoints.length === 0) return;

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
      detections: sortedDetections
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
        const detectionInfo = point.detections.map(detection => ({
          time: new Date(detection.detected_at).toLocaleString(),
          confidence: (detection.confidence_score * 100).toFixed(1) + '%',
          rawText: detection.raw_plate_text,
          vehicleType: detection.detected_vehicle_type || 'Unknown'
        }));

        const infoText = `📍 Điểm ${index + 1}: ${point.cameraName}\n` +
          `🚗 Biển số: ${plateNumber}\n` +
          `📊 Số lần phát hiện: ${point.detections.length}\n` +
          `⏰ Thời gian: ${new Date(point.detections[0].detected_at).toLocaleString()}\n` +
          `🎯 Độ tin cậy: ${(point.detections[0].confidence_score * 100).toFixed(1)}%\n` +
          `🚙 Loại xe: ${point.detections[0].detected_vehicle_type || 'Unknown'}`;

        alert(infoText);
      };

      // Thêm tất cả marker vào scene
      sceneRef.current.add(marker);
      sceneRef.current.add(glowMarker);
      sceneRef.current.add(numberMarker);
    });

    // Lưu route để có thể xóa sau
    setSelectedPlateRoute({
      line: routeLine,
      markers: sceneRef.current.children.filter(child =>
        child.userData.type === 'routeMarker'
      )
    });

    // Bay đến điểm đầu tiên
    if (routePoints.length > 0) {
      const firstPoint = routePoints[0];
      const targetPosition = new THREE.Vector3(firstPoint.x, 30, firstPoint.y + 15);
      const targetLookAt = new THREE.Vector3(firstPoint.x, 0, firstPoint.y);
      animateCamera(targetPosition, targetLookAt);
    }
  };

  // Hàm xóa đường đi biển số xe
  const clearPlateRoute = () => {
    if (!sceneRef.current) return;

    // Xóa đường đi cũ
    const objectsToRemove = sceneRef.current.children.filter(child =>
      child.userData.type === 'plateRoute' ||
      child.userData.type === 'plateRouteGlow' ||
      child.userData.type === 'routeMarker' ||
      child.userData.type === 'routeMarkerGlow' ||
      child.userData.type === 'routeMarkerNumber'
    );

    objectsToRemove.forEach(obj => {
      sceneRef.current.remove(obj);
    });

    setSelectedPlateRoute(null);
  };

  // Handlers cho CameraActionBar - Implement đầy đủ như SamplePage
  const handleStartRecording = () => {
    console.log("🎥 Starting recording for camera:", selectedCamera?.name);

    try {
      const videoElement = document.getElementById(`video-${selectedCamera?.id}`);
      if (!videoElement) {
        console.error("Video element not found for camera:", selectedCamera?.id);
        alert("Không tìm thấy video element để ghi hình");
        return;
      }

      // Kiểm tra video đã sẵn sàng chưa
      if (videoElement.readyState < 2) {
        alert("Video chưa sẵn sàng để ghi hình. Vui lòng đợi video load xong.");
        return;
      }

      // Tạo MediaStream từ video element
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = videoElement.videoWidth || 640;
      canvas.height = videoElement.videoHeight || 480;

      const stream = canvas.captureStream(30); // 30 FPS

      // Kiểm tra browser có hỗ trợ MediaRecorder không
      if (!window.MediaRecorder) {
        alert("Trình duyệt không hỗ trợ ghi hình. Vui lòng sử dụng Chrome, Firefox hoặc Edge mới nhất.");
        return;
      }

      // Thử các format khác nhau
      let mimeType = 'video/webm;codecs=vp9';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'video/mp4';
          }
        }
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType
      });

      const chunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const fileExtension = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);

        // Tạo link download
        const a = document.createElement('a');
        a.href = url;
        a.download = `camera_${selectedCamera?.id}_${new Date().toISOString().replace(/[:.]/g, '-')}.${fileExtension}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log("✅ Recording saved successfully");
      };

      // Bắt đầu ghi hình
      mediaRecorder.start(1000); // Ghi mỗi 1 giây

      // Bắt đầu timer ghi hình
      const startTime = Date.now();
      const timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setRecordingTimer(elapsed);
      }, 1000);

      // Lưu recording data
      const recordingInfo = {
        isRecording: true,
        mediaRecorder,
        canvas,
        ctx,
        videoElement,
        interval: setInterval(() => {
          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        }, 1000 / 30), // 30 FPS
        timerInterval
      };

      setRecordingData(recordingInfo);
      setIsRecording(true);

      console.log("✅ Recording started successfully");

    } catch (error) {
      console.error("❌ Error starting recording:", error);
      alert("Lỗi khi bắt đầu ghi hình: " + error.message);
    }
  };

  const handleStopRecording = () => {
    console.log("🛑 Stopping recording for camera:", selectedCamera?.name);

    try {
      if (!recordingData || !recordingData.mediaRecorder) {
        console.error("No active recording found");
        return;
      }

      // Dừng MediaRecorder
      if (recordingData.mediaRecorder.state === 'recording') {
        recordingData.mediaRecorder.stop();
      }

      // Clear interval
      if (recordingData.interval) {
        clearInterval(recordingData.interval);
      }

      // Clear timer interval
      if (recordingData.timerInterval) {
        clearInterval(recordingData.timerInterval);
      }

      // Cleanup
      if (recordingData.canvas) {
        recordingData.canvas.remove();
      }

      // Reset state
      setRecordingData(null);
      setIsRecording(false);
      setRecordingTimer(0);

      console.log("✅ Recording stopped successfully");

    } catch (error) {
      console.error("❌ Error stopping recording:", error);
      alert("Lỗi khi dừng ghi hình: " + error.message);
    }
  };

  const handleSnapshot = () => {
    console.log("📸 Taking snapshot for camera:", selectedCamera?.name);

    try {
      const videoElement = document.getElementById(`video-${selectedCamera?.id}`);
      if (!videoElement) {
        console.error("Video element not found for camera:", selectedCamera?.id);
        alert("Không tìm thấy video element để chụp ảnh");
        return;
      }

      // Tạo canvas để chụp ảnh
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = videoElement.videoWidth || 640;
      canvas.height = videoElement.videoHeight || 480;

      // Vẽ frame hiện tại lên canvas
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

      // Tạo blob và download
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `snapshot_${selectedCamera?.id}_${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log("✅ Snapshot saved successfully");
      }, 'image/png');

    } catch (error) {
      console.error("❌ Error taking snapshot:", error);
      alert("Lỗi khi chụp ảnh: " + error.message);
    }
  };

  const handleToggleMute = () => {
    console.log("🔇 Toggling mute for camera:", selectedCamera?.name);

    try {
      const videoElement = document.getElementById(`video-${selectedCamera?.id}`);
      if (!videoElement) {
        console.error("Video element not found for camera:", selectedCamera?.id);
        return;
      }

      const newMutedState = !isMuted;
      videoElement.muted = newMutedState;
      setIsMuted(newMutedState);

      console.log("✅ Mute toggled successfully:", newMutedState);

    } catch (error) {
      console.error("❌ Error toggling mute:", error);
      alert("Lỗi khi thay đổi âm thanh: " + error.message);
    }
  };

  const handlePlayPause = () => {
    console.log("⏯️ Toggling play/pause for camera:", selectedCamera?.name);

    try {
      const videoElement = document.getElementById(`video-${selectedCamera?.id}`);
      if (!videoElement) {
        console.error("Video element not found for camera:", selectedCamera?.id);
        return;
      }

      const newPlayingState = videoElement.paused;

      if (newPlayingState) {
        videoElement.play();
      } else {
        videoElement.pause();
      }

      setIsPlaying(!newPlayingState);

      console.log("✅ Play/pause toggled successfully:", !newPlayingState);

    } catch (error) {
      console.error("❌ Error toggling play/pause:", error);
      alert("Lỗi khi phát/tạm dừng video: " + error.message);
    }
  };

  const handleQualitySettings = (quality) => {
    console.log("⚙️ Changing quality to:", quality);

    try {
      const qualities = {
        'low': { width: 640, height: 360, label: 'Low (360p)' },
        'medium': { width: 1280, height: 720, label: 'Medium (720p)' },
        'high': { width: 1920, height: 1080, label: 'High (1080p)' }
      };

      const selectedQuality = qualities[quality];
      if (!selectedQuality) {
        console.error("Invalid quality option:", quality);
        return;
      }

      setCurrentQuality(quality);

      // Lưu thông tin chất lượng vào localStorage
      localStorage.setItem(`quality_${selectedCamera?.id}`, quality);

      console.log("✅ Quality settings applied:", selectedQuality);

    } catch (error) {
      console.error("❌ Error changing quality:", error);
      alert("Lỗi khi thay đổi chất lượng: " + error.message);
    }
  };

  const handleSelectSource = () => {
    console.log("📁 Select source for camera:", selectedCamera?.name);

    // Nếu đang phát video đã upload, cho phép reset về camera gốc
    if (selectedCamera?.isUploadedVideo) {
      const resetToCamera = window.confirm(
        `Camera hiện tại đang phát video "${selectedCamera.name}".\n\n` +
        `Bạn có muốn:\n` +
        `• OK: Reset về stream camera gốc\n` +
        `• Cancel: Chọn video mới`
      );

      if (resetToCamera) {
        // Reset về camera gốc
        const originalCamera = cameraStateRef.current.allCameras.find(cam => cam.id === selectedCamera.id);
        if (originalCamera) {
          setSelectedCamera({
            id: originalCamera.id,
            name: originalCamera.displayName,
            streamUrl: originalCamera.streamUrl || `http://localhost:5000/api/cameras/${originalCamera.id}/stream`,
            status: originalCamera.connection_status,
            location_name: originalCamera.location_name,
            isUploadedVideo: false
          });
          alert(`Đã reset về stream camera gốc: ${originalCamera.displayName}`);
          return;
        }
      }
    }

    // Tạo input file ẩn để chọn video
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.style.display = 'none';

    input.onchange = async (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("video", file);

      try {
        const token = localStorage.getItem("token");
        const response = await fetch('/api/videos/upload-video', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: formData
        });

        const result = await response.json();

        if (result.success) {
          const fullUrl = `${window.location.origin}${result.data.url}`;

          // Cập nhật camera với video mới
          setSelectedCamera(prev => ({
            ...prev,
            streamUrl: fullUrl,
            name: file.name,
            isUploadedVideo: true
          }));

          console.log("✅ Video uploaded and will play for camera:", selectedCamera?.name);
          console.log("📹 Updated camera info:", {
            id: selectedCamera?.id,
            url: fullUrl,
            name: file.name
          });

          alert(`Video "${file.name}" đã được tải lên và sẽ phát cho camera ${selectedCamera?.name}`);

        } else {
          console.error("❌ Video upload failed:", result.message);
          alert("Tải video thất bại: " + (result.message || "Lỗi không xác định"));
        }
      } catch (error) {
        console.error("❌ Error uploading video:", error);
        alert("Tải video thất bại: " + (error.message || "Lỗi không xác định"));
      }

      // Cleanup
      document.body.removeChild(input);
    };

    // Thêm input vào DOM và trigger click
    document.body.appendChild(input);
    input.click();
  };

  const handleFullscreen = () => {
    console.log('🔍 Fullscreen for camera:', selectedCamera?.name);
    const video = document.getElementById(`video-${selectedCamera?.id}`);
    if (video && video.requestFullscreen) {
      video.requestFullscreen();
    }
  };

  useEffect(() => {
    // Khởi tạo scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    // Khởi tạo camera
    const camera = new THREE.PerspectiveCamera(75, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 1000);
    camera.position.set(50, 50, 50);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Khởi tạo renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    mountRef.current.appendChild(renderer.domElement);
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

    const houseMaterial = new THREE.MeshStandardMaterial({
      color: 0xA9A9A9,
      roughness: 0.7,
      metalness: 0.2
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
      const maxLength = Math.max(...pathLengthsRef.current);
      const shortestPathIndex = pathLengthsRef.current.indexOf(minLength);

      // Hiển thị đường đi trong 3D
      let colorIndex = 0;

      paths.forEach((path, index) => {
        const length = pathLengthsRef.current[index];
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
      if (mountRef.current) {
        const width = mountRef.current.clientWidth;
        const height = mountRef.current.clientHeight;

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
      if (mountRef.current && renderer.domElement && mountRef.current.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement);
      }

      // Cleanup recording timer
      if (window.recordingTimer) {
        clearInterval(window.recordingTimer);
        window.recordingTimer = null;
      }
    };
  }, []);

  // Cleanup recording data khi selectedCamera thay đổi
  useEffect(() => {
    return () => {
      // Cleanup recording data
      if (recordingData) {
        if (recordingData.mediaRecorder && recordingData.mediaRecorder.state === 'recording') {
          recordingData.mediaRecorder.stop();
        }
        if (recordingData.interval) {
          clearInterval(recordingData.interval);
        }
        if (recordingData.timerInterval) {
          clearInterval(recordingData.timerInterval);
        }
        if (recordingData.canvas) {
          recordingData.canvas.remove();
        }
        setRecordingData(null);
        setIsRecording(false);
        setRecordingTimer(0);
      }
    };
  }, [selectedCamera]);

  // Load quality settings từ localStorage khi camera được chọn
  useEffect(() => {
    if (selectedCamera?.id) {
      const savedQuality = localStorage.getItem(`quality_${selectedCamera.id}`);
      if (savedQuality) {
        setCurrentQuality(savedQuality);
      }
    }
  }, [selectedCamera?.id]);

  // Action bar cho CameraViewer sử dụng CameraActionBar
  const actionBar = ({ startRecognition, stopRecognition, isRecognizing, isProcessing, onForcePlay }) => (
    <CameraActionBar
      cameraName={selectedCamera?.name || "Camera"}
      cameraId={selectedCamera?.id}
      onFullscreen={handleFullscreen}
      onClose={() => setSelectedCamera(null)}
      onStartRecognize={startRecognition}
      onStopRecognize={stopRecognition}
      isRecognizing={isRecognizing}
      isProcessing={isProcessing}
      onStartRecording={handleStartRecording}
      onStopRecording={handleStopRecording}
      isRecording={isRecording}
      onSnapshot={handleSnapshot}
      onToggleMute={handleToggleMute}
      isMuted={isMuted}
      onPlayPause={handlePlayPause}
      isPlaying={isPlaying}
      onQualitySettings={handleQualitySettings}
      currentQuality={currentQuality}
      onSelectSource={handleSelectSource}
    />
  );

  return (
    <div className="route-monitoring-container" style={{ display: 'flex', height: '100vh' }}>
      {/* Bên trái - Map 3D */}
      <div style={{ flex: '0 0 60%', position: 'relative' }}>
        <div ref={mountRef} className="threejs-container" style={{ width: '100%', height: '100%' }} />

        {/* Panel điều khiển */}
        <div className="control-panel" style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          width: '300px',
          backgroundColor: 'rgba(94, 90, 90, 0.95)',
          padding: '15px',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ margin: '0 0 15px 0', fontSize: '18px' }}>Giám sát theo lộ trình</h2>

          <div className="plate-search-section" style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Tìm kiếm biển số xe</h3>
            <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
              <input
                type="text"
                placeholder="Nhập biển số xe (VD: 30A3-9054)"
                value={searchPlateNumber}
                onChange={(e) => setSearchPlateNumber(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleSearchPlate(searchPlateNumber);
                  }
                }}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '12px'
                }}
              />
              <button
                onClick={() => handleSearchPlate(searchPlateNumber)}
                disabled={isSearching || !searchPlateNumber.trim()}
                style={{
                  padding: '6px 12px',
                  backgroundColor: isSearching ? '#ccc' : '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isSearching ? 'not-allowed' : 'pointer',
                  fontSize: '12px'
                }}
              >
                {isSearching ? '⏳' : '🔍'}
              </button>
              <button
                onClick={clearPlateRoute}
                disabled={!selectedPlateRoute}
                style={{
                  padding: '6px 8px',
                  backgroundColor: selectedPlateRoute ? '#f44336' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: selectedPlateRoute ? 'pointer' : 'not-allowed',
                  fontSize: '12px'
                }}
              >
                🗑️
              </button>
            </div>

            {searchResults.length > 0 && (
              <div style={{ fontSize: '11px', color: '#666' }}>
                <p style={{ margin: '5px 0', fontWeight: 'bold', color: '#2196F3' }}>
                  ✅ Tìm thấy {searchResults.length} phát hiện
                </p>
                <p style={{ margin: '5px 0' }}>Biển số: <strong>{searchPlateNumber}</strong></p>
                <p style={{ margin: '5px 0' }}>
                  Thời gian: {new Date(searchResults[0].detected_at).toLocaleString()} - {new Date(searchResults[searchResults.length - 1].detected_at).toLocaleString()}
                </p>
                <p style={{ margin: '5px 0' }}>
                  Camera đã đi qua: {[...new Set(searchResults.map(r => r.camera_id))].length} camera
                </p>
                <p style={{ margin: '5px 0', fontSize: '10px', color: '#888' }}>
                  💡 Click vào các điểm màu cam trên map để xem chi tiết
                </p>
              </div>
            )}
          </div>

          <div className="camera-controls">
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Camera Controls</h3>
            <button
              className="refresh-btn"
              onClick={() => window.refreshCameras && window.refreshCameras()}
              style={{
                marginBottom: '10px',
                padding: '8px 16px',
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                marginRight: '10px'
              }}
            >
              🔄 Refresh Cameras
            </button>

            <div className="camera-status-legend" style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#bab8b8', borderRadius: '4px' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>Camera Status:</h4>
              <div style={{ display: 'flex', gap: '15px', fontSize: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <div style={{ width: '12px', height: '12px', backgroundColor: '#00ff00', borderRadius: '2px' }}></div>
                  <span>Online</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <div style={{ width: '12px', height: '12px', backgroundColor: '#ffaa00', borderRadius: '2px' }}></div>
                  <span>Maintenance</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <div style={{ width: '12px', height: '12px', backgroundColor: '#ff0000', borderRadius: '2px' }}></div>
                  <span>Offline</span>
                </div>
              </div>
            </div>

            <div className="camera-select-container" id="camera-buttons-container">
              {/* Camera select dropdown sẽ được tạo động từ API */}
            </div>
          </div>

          <div className="instructions" style={{ marginTop: '15px', fontSize: '12px' }}>
            <p style={{ margin: '5px 0' }}>↔ Di chuyển camera: Kéo chuột</p>
            <p style={{ margin: '5px 0' }}>↻ Xoay camera: Giữ chuột phải + kéo</p>
            <p style={{ margin: '5px 0' }}>Zoom: Cuộn chuột</p>
            <p style={{ margin: '5px 0', fontWeight: 'bold', color: '#2196F3' }}>📹 Click vào camera để xem</p>
            <p style={{ margin: '5px 0', fontWeight: 'bold', color: '#ff6b35' }}>🔶 Click vào điểm cam để xem chi tiết hành trình</p>
          </div>
        </div>
      </div>

      {/* Bên phải - Camera Viewer */}
      <div style={{
        flex: '0 0 40%',
        backgroundColor: '#f0f0f0',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '2px solid #ddd'
      }}>
        {selectedCamera ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{
              padding: '10px',
              backgroundColor: '#2196F3',
              color: 'white',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>
                📹 {selectedCamera.name} - {selectedCamera.location_name}
                {selectedCamera.isUploadedVideo && (
                  <span style={{
                    fontSize: '12px',
                    backgroundColor: '#ff9800',
                    color: 'white',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    marginLeft: '8px'
                  }}>
                    📁 Video Upload
                  </span>
                )}
              </h3>
              <button
                onClick={() => setSelectedCamera(null)}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  color: 'white',
                  padding: '5px 10px',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                ✕ Close
              </button>
            </div>
            <div style={{ flex: 1, padding: '10px' }}>
              <CameraViewer
                camera={selectedCamera}
                actionBar={actionBar}
                onClose={() => setSelectedCamera(null)}
                isRecognizing={isRecognizing}
                recordingTimer={recordingTimer}
                style={{
                  width: '100%',
                  height: '100%',
                  maxWidth: '100%',
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column'
                }}
              />
            </div>
          </div>
        ) : (
          <div style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            color: '#666'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>📹</div>
            <h3 style={{ margin: '0 0 10px 0' }}>Chọn camera để xem</h3>
            <p style={{ margin: 0, textAlign: 'center', maxWidth: '300px' }}>
              Click vào camera trên bản đồ 3D để hiển thị video stream
            </p>
          </div>
        )}
      </div>
    </div>
  );

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
};

export default RouteMonitoring;