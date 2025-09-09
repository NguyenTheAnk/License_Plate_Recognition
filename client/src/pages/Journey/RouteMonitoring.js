import React, { useEffect, useRef } from 'react';
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
  const selectedPathIndexRef = useRef(-1);
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

    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';

    // Tạo mặt đất
    const planeGeometry = new THREE.PlaneGeometry(120, 100, 50, 50);
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

    // Vị trí các thành phố
    const cities = {
      Arad: [-30, -10],
      Bucharest: [30, 0],
      Craiova: [0, -40],
      Dobreta: [-10, -40],
      Eforie: [50, -20],
      Fagaras: [20, 20],
      Giurgiu: [30, -30],
      Hirsova: [50, 0],
      Kyoto: [0, -10],
      Iasi: [40, 30],
      Lugoj: [-20, -20],
      Mehadia: [-10, -20],
      Neamt: [30, 30],
      Oradea: [-30, 20],
      Pitesti: [20, 0],
      Rimnicu_Vilcea: [0, 10],
      Sibiu: [0, 20],
      Timisoara: [-30, -40],
      Urziceni: [40, 0],
      Vaslui: [40, 20],
      Zerind: [-30, 10]
    };

    // Kết nối đường đi
    const connections = [
      ['Arad', 'Timisoara'], ['Arad', 'Zerind'],
      ['Bucharest', 'Fagaras'], ['Bucharest', 'Giurgiu'], ['Bucharest', 'Pitesti'],
      ['Bucharest', 'Urziceni'], ['Craiova', 'Dobreta'], ['Craiova', 'Pitesti'],
      ['Craiova', 'Rimnicu_Vilcea'], ['Dobreta', 'Mehadia'], ['Eforie', 'Hirsova'],
      ['Fagaras', 'Sibiu'], ['Hirsova', 'Urziceni'], ['Iasi', 'Neamt'],
      ['Iasi', 'Vaslui'], ['Lugoj', 'Mehadia'], ['Lugoj', 'Timisoara'],
      ['Oradea', 'Zerind'], ['Oradea', 'Sibiu'], ['Pitesti', 'Rimnicu_Vilcea'],
      ['Rimnicu_Vilcea', 'Sibiu'], ['Urziceni', 'Vaslui'], 
      ['Kyoto', 'Arad'], ['Kyoto', 'Sibiu']
    ];

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

        // Thêm nhà dọc theo đường
        const perpendicular = new THREE.Vector3(-roadDirection.z, 0, roadDirection.x);
        const houseCount = Math.floor(distance / 8);
        
        for (let i = 0; i < houseCount; i++) {
          const t = (i + 0.5 + Math.random() * 0.3) / houseCount;
          const basePos = startPos.clone().lerp(endPos, t);

          // Bên trái
          const leftPos = basePos.clone().add(perpendicular.clone().multiplyScalar(1.5 + Math.random() * 0.5));
          const leftHouseHeight = 1.5 + Math.random() * 1.5;
          const leftHouseGeometry = new THREE.BoxGeometry(1.2, leftHouseHeight, 1.2);
          const leftHouse = new THREE.Mesh(leftHouseGeometry, houseMaterial);
          leftHouse.castShadow = true;
          leftHouse.receiveShadow = true;
          leftHouse.position.set(leftPos.x, leftHouseHeight/2, leftPos.z);
          leftHouse.rotation.y = Math.random() * Math.PI;
          scene.add(leftHouse);

          // Bên phải
          const rightPos = basePos.clone().add(perpendicular.clone().multiplyScalar(-1.5 - Math.random() * 0.5));
          const rightHouseHeight = 1.5 + Math.random() * 1.5;
          const rightHouseGeometry = new THREE.BoxGeometry(1.2, rightHouseHeight, 1.2);
          const rightHouse = new THREE.Mesh(rightHouseGeometry, houseMaterial);
          rightHouse.castShadow = true;
          rightHouse.receiveShadow = true;
          rightHouse.position.set(rightPos.x, rightHouseHeight/2, rightPos.z);
          rightHouse.rotation.y = Math.random() * Math.PI;
          scene.add(rightHouse);
        }
      }
    });

    // Xây dựng đồ thị cho tìm đường
    const graph = {};
    Object.keys(cities).forEach(city => {
      graph[city] = [];
    });
    connections.forEach(([start, end]) => {
      graph[start].push(end);
      graph[end].push(start);
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

    // Tính khoảng cách Euclid giữa các thành phố
    const calculateDistance = (city1, city2) => {
      const [x1, z1] = cities[city1];
      const [x2, z2] = cities[city2];
      return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(z2 - z1, 2));
    };

    // Tính độ dài đường đi
    const calculatePathLength = (path) => {
      let length = 0;
      for (let i = 0; i < path.length - 1; i++) {
        length += calculateDistance(path[i], path[i+1]);
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

    // Tạo camera tại Neamt và Eforie
    const createCameraIcons = () => {
      const cameraGeometry = new THREE.CylinderGeometry(1, 1, 3, 16);
      const cameraMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff });
      
      // Camera tại Neamt
      const cameraNeamt = new THREE.Mesh(cameraGeometry, cameraMaterial);
      cameraNeamt.position.set(cities.Neamt[0], 2, cities.Neamt[1]);
      cameraNeamt.rotation.x = Math.PI / 2;
      scene.add(cameraNeamt);
      
      // Camera tại Eforie
      const cameraEforie = new THREE.Mesh(cameraGeometry, cameraMaterial);
      cameraEforie.position.set(cities.Eforie[0], 2, cities.Eforie[1]);
      cameraEforie.rotation.x = Math.PI / 2;
      scene.add(cameraEforie);
      
      // Thêm ánh sáng cho camera
      const pointLightNeamt = new THREE.PointLight(0x00ffff, 1, 10);
      pointLightNeamt.position.set(cities.Neamt[0], 3, cities.Neamt[1]);
      scene.add(pointLightNeamt);
      
      const pointLightEforie = new THREE.PointLight(0x00ffff, 1, 10);
      pointLightEforie.position.set(cities.Eforie[0], 3, cities.Eforie[1]);
      scene.add(pointLightEforie);
    };

    // Tìm đường đi khi component được mount
    allPathsRef.current = findAllPaths('Sibiu', 'Zerind');
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

    // Ánh sáng
    const ambientLight = new THREE.AmbientLight(0x404040, 0.8);
    scene.add(ambientLight);
    
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
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (mountRef.current && renderer.domElement && mountRef.current.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="route-monitoring-container">
      <div ref={mountRef} className="threejs-container" />
      
      {/* Panel điều khiển */}
      <div className="control-panel">
        <h2>Giám sát theo lộ trình</h2>
        
        <div className="camera-buttons">
          <button className="camera-btn" onClick={() => flyCameraToCity('Neamt')}>
            Camera vào (Neamt)
          </button>
          <button className="camera-btn" onClick={() => flyCameraToCity('Eforie')}>
            Camera ra (Eforie)
          </button>
        </div>
        
        <div className="instructions">
          <p>↔ Di chuyển camera: Kéo chuột</p>
          <p>↻ Xoay camera: Giữ chuột phải + kéo</p>
          <p>Zoom: Cuộn chuột</p>
        </div>
      </div>
    </div>
  );

  // Hàm bay camera đến thành phố
  function flyCameraToCity(cityName) {
    const cities = {
      Neamt: [30, 30],
      Eforie: [50, -20]
    };
    
    if (cities[cityName]) {
      const [x, z] = cities[cityName];
      const targetPosition = new THREE.Vector3(x, 30, z + 15);
      const targetLookAt = new THREE.Vector3(x, 0, z);
      
      animateCamera(targetPosition, targetLookAt);
    }
  }

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