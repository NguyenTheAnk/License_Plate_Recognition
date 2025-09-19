import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import CameraViewer from '../../components/CameraViewer';
import CameraActionBar from '../ViewCamera/CameraActionBar';
import PlateSearchPanel from '../../components/RouteMonitoring/PlateSearchPanel';
import CameraControlsPanel from '../../components/RouteMonitoring/CameraControlsPanel';
import InstructionsPanel from '../../components/RouteMonitoring/InstructionsPanel';
import { createTextAtPosition, createTimeText, createPolygon, findShortestPath, calculateDistance } from '../../utils/threeUtils';
import './RouteMonitoring.css';

const RouteMonitoring = () => {
    // Refs
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

    // State
    const [selectedCamera, setSelectedCamera] = useState(null);
    const [isRecognizing, setIsRecognizing] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isMuted, setIsMuted] = useState(true);
    const [isPlaying, setIsPlaying] = useState(true);
    const [currentQuality, setCurrentQuality] = useState('medium');
    const [recordingTimer, setRecordingTimer] = useState(0);
    const [recordingData, setRecordingData] = useState(null);
    const [searchPlateNumber, setSearchPlateNumber] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedPlateRoute, setSelectedPlateRoute] = useState(null);
    const [showTimeTexts, setShowTimeTexts] = useState(true);

    // Camera state
    const cameraStateRef = useRef({
        allCameras: [],
        activeCameras: []
    });

    // Constants
    const cities = {
        A: [-58, 72], B: [58, 72], C: [39.5, 72], D: [39.5, 64], E: [20, 56], E1: [20, 64],
        F: [59, 56], F1: [58, 64], G: [19, 42], H: [58, 42], K: [57, 5], I: [18, 14.7],
        J: [2, 14.7], L: [37, 6], M: [56, -8], N: [20, -13], O: [37, -7], P: [51.3, -28],
        Q: [31, -28], R: [31, -14], S: [1, -12], T: [1, -24], T1: [0.5, -28], U: [2, 17],
        V: [-32, 17], W: [-33.5, -16], Z: [-26, -24], X: [-55, -16], Y: [-33.5, -24],
        O5: [51, -58], O2: [-26, -39], O1: [-50, -39], O3: [-0.5, -40], O4: [-1, -59],
        O6: [34, 14], O7: [-41, -58.5], O8: [-1, -68], O9: [-32, 25]
    };

    const connections = [
        ['A', 'B'], ['A', 'C'], ['B', 'C'], ['E', 'E1'], ['F', 'F1'], ['E1', 'D'], ['F1', 'D'], ['E', 'F'],
        ['C', 'D'], ['E', 'G'], ['F', 'H'], ['G', 'H'], ['I', 'G'], ['K', 'H'], ['I', 'J'], ['L', 'K'],
        ['M', 'K'], ['O', 'L'], ['M', 'P'], ['O', 'M'], ['P', 'Q'], ['Q', 'R'], ['U', 'J'], ['R', 'S'],
        ['U', 'S'], ['S', 'T'], ['Q', 'T1'], ['U', 'V'], ['V', 'W'], ['W', 'X'], ['W', 'Y'], ['T1', 'O3'],
        ['T', 'S'], ['T', 'T1'], ['Y', 'Z'], ['T', 'Z'], ['P', 'O5'], ['Z', 'O2'], ['O1', 'O2'], ['O2', 'O3'],
        ['O4', 'O7'], ['O3', 'O4'], ['I', 'O6'], ['O6', 'L'], ['O4', 'O8'], ['V', 'O9']
    ];

    // Build graph
    const graph = {};
    Object.keys(cities).forEach(city => {
        graph[city] = [];
    });
    connections.forEach(([start, end]) => {
        graph[start].push(end);
        graph[end].push(start);
    });

    // API Functions
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
                cameraStateRef.current.allCameras = data.data.cameras;
                cameraStateRef.current.activeCameras = data.data.cameras;

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
            return [];
        }
    };

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
                console.log('✅ Search results:', data.data);
                console.log('📹 Ordered cameras:', data.orderedCameras);
                console.log(`🔢 Total: ${data.totalDetections} detections on ${data.totalCameras} cameras`);

                setSearchResults(data.data);
                if (data.data.length > 0) {
                    drawPlateRoute(data.data, plateNumber, data.orderedCameras);
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

    // Camera Functions
    const createCameraIcons = async () => {
        if (!sceneRef.current) return;

        // Clear old cameras
        activeCamerasRef.current.forEach(cameraData => {
            sceneRef.current.remove(cameraData.camera);
            sceneRef.current.remove(cameraData.light);
        });
        activeCamerasRef.current = [];

        // Get cameras from API
        const cameras = await getActiveCameras();
        createCameraSelect(cameras);

        cameras.forEach(cameraData => {
            let color = 0x00ffff;
            let lightColor = 0x00ffff;

            switch (cameraData.status) {
                case 'online':
                    color = 0x00ff00;
                    lightColor = 0x00ff00;
                    break;
                case 'maintenance':
                    color = 0xffaa00;
                    lightColor = 0xffaa00;
                    break;
                case 'offline':
                    color = 0xff0000;
                    lightColor = 0xff0000;
                    break;
            }

            const cameraGeometry = new THREE.CylinderGeometry(1, 1, 3, 16);
            const cameraMaterial = new THREE.MeshBasicMaterial({ color });

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

            camera.userData.onClick = () => {
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

            const pointLight = new THREE.PointLight(lightColor, 1, 10);
            pointLight.position.set(cameraData.x, 3, cameraData.y);
            sceneRef.current.add(pointLight);

            activeCamerasRef.current.push({
                camera,
                light: pointLight,
                cameraData: cameraData
            });
        });
    };

    const createCameraSelect = (cameras) => {
        const container = document.getElementById('camera-buttons-container');
        if (!container) return;

        container.innerHTML = '';

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

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Chọn camera để xem...';
        defaultOption.disabled = true;
        defaultOption.selected = true;
        select.appendChild(defaultOption);

        cameras.forEach(cameraData => {
            const option = document.createElement('option');
            option.value = cameraData.id;
            option.textContent = `${cameraData.name} (${cameraData.location_name}) - ${cameraData.status}`;
            option.style.color = getStatusColor(cameraData.status);
            select.appendChild(option);
        });

        select.addEventListener('change', (e) => {
            if (e.target.value) {
                flyToCamera(parseInt(e.target.value));
            }
        });

        container.appendChild(select);
    };

    const getStatusColor = (status) => {
        const colors = {
            online: '#00ff00',
            maintenance: '#ffaa00',
            offline: '#ff0000'
        };
        return colors[status] || '#00ffff';
    };

    const refreshCameras = async () => {
        await createCameraIcons();
    };

    const flyToCamera = (cameraId) => {
        const camera = activeCamerasRef.current.find(cam => cam.cameraData.id === cameraId);
        if (camera) {
            const { x, y } = camera.cameraData;
            const targetPosition = new THREE.Vector3(x, 30, y + 15);
            const targetLookAt = new THREE.Vector3(x, 0, y);
            animateCamera(targetPosition, targetLookAt);
        }
    };

    // Route Functions
    const drawPlateRoute = (detections, plateNumber, orderedCameras = null) => {
        if (!sceneRef.current || detections.length === 0) return;

        clearPlateRoute();

        let routePoints = [];

        if (orderedCameras && orderedCameras.length > 0) {
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
                    const allCamera = cameraStateRef.current.allCameras.find(cam => cam.id === parseInt(cameraData.camera_id));
                    if (allCamera && allCamera.mapX && allCamera.mapY) {
                        routePoints.push({
                            x: allCamera.mapX,
                            y: allCamera.mapY,
                            cameraId: cameraData.camera_id,
                            cameraName: cameraData.camera_name,
                            detections: cameraData.detections,
                            firstDetectedAt: cameraData.first_detected_at,
                            detectionCount: cameraData.detection_count
                        });
                    }
                }
            });
        } else {
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
                }
            });
        }

        if (routePoints.length === 0) return;

        // Create path
        const allPathPoints = [];

        for (let i = 0; i < routePoints.length - 1; i++) {
            const startPoint = routePoints[i];
            const endPoint = routePoints[i + 1];

            const pathPoints = findShortestPath(startPoint, endPoint, cities, graph);

            if (i === 0) {
                allPathPoints.push(...pathPoints);
            } else {
                allPathPoints.push(...pathPoints.slice(1));
            }
        }

        // Create route line
        const routeGeometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];

        allPathPoints.forEach((point, index) => {
            positions.push(point.x, 1.2, point.y);
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

        // Create markers and time texts
        routePoints.forEach((point, index) => {
            // Create marker
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

            // Add glow effect
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

            // Add number
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

            // Add click handler
            marker.userData.onClick = () => {
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

            // Create time text
            const timeText = showTimeTexts ? createTimeText(
                point.cameraName,
                point.detections[0].detected_at,
                point.detections.length,
                point.x,
                point.y
            ) : null;

            // Add to scene
            sceneRef.current.add(marker);
            sceneRef.current.add(glowMarker);
            sceneRef.current.add(numberMarker);
            if (timeText) {
                sceneRef.current.add(timeText);
            }
        });

        // Save route
        setSelectedPlateRoute({
            line: routeLine,
            markers: sceneRef.current.children.filter(child =>
                child.userData.type === 'routeMarker'
            )
        });

        // Fly to first point
        if (routePoints.length > 0) {
            const firstPoint = routePoints[0];
            const targetPosition = new THREE.Vector3(firstPoint.x, 30, firstPoint.y + 15);
            const targetLookAt = new THREE.Vector3(firstPoint.x, 0, firstPoint.y);
            animateCamera(targetPosition, targetLookAt);
        }
    };

    const clearPlateRoute = () => {
        if (!sceneRef.current) return;

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

        setSelectedPlateRoute(null);
    };

    // Animation
    const animateCamera = (targetPosition, targetLookAt) => {
        const startPosition = cameraRef.current.position.clone();
        const startLookAt = controlsRef.current.target.clone();

        const duration = 1000;
        const startTime = Date.now();

        function updateCamera() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            const ease = progress < 0.5
                ? 4 * progress * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 3) / 2;

            cameraRef.current.position.lerpVectors(startPosition, targetPosition, ease);

            const currentLookAt = new THREE.Vector3();
            currentLookAt.lerpVectors(startLookAt, targetLookAt, ease);
            controlsRef.current.target.copy(currentLookAt);
            controlsRef.current.update();

            if (progress < 1) {
                requestAnimationFrame(updateCamera);
            }
        }

        updateCamera();
    };

    // Handlers (simplified for brevity)
    const handleStartRecording = () => { /* Implementation */ };
    const handleStopRecording = () => { /* Implementation */ };
    const handleSnapshot = () => { /* Implementation */ };
    const handleToggleMute = () => { /* Implementation */ };
    const handlePlayPause = () => { /* Implementation */ };
    const handleQualitySettings = () => { /* Implementation */ };
    const handleSelectSource = () => { /* Implementation */ };
    const handleFullscreen = () => { /* Implementation */ };

    // Initialize scene
    useEffect(() => {
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a2e);
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(75, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 1000);
        camera.position.set(50, 50, 50);
        camera.lookAt(0, 0, 0);
        cameraRef.current = camera;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
        renderer.shadowMap.enabled = true;
        mountRef.current.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // Create ground
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

        // Create grass
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

        // Create residential areas (simplified)
        const residentialPoints = [[-32, 22], [-2, 22], [-1, -16], [-30, -16]];
        const residential = createPolygon(residentialPoints, 0x696969, 0.026, "residential");
        scene.add(residential);

        // Create roads
        const roadMaterial = new THREE.MeshStandardMaterial({
            color: 0x333333,
            roughness: 0.9,
            metalness: 0.1
        });

        connections.forEach(([start, end]) => {
            if (cities[start] && cities[end]) {
                const startPos = new THREE.Vector3(cities[start][0], 0.05, cities[start][1]);
                const endPos = new THREE.Vector3(cities[end][0], 0.05, cities[end][1]);

                const distance = startPos.distanceTo(endPos);
                const roadGeometry = new THREE.BoxGeometry(0.8, 0.1, distance);
                const road = new THREE.Mesh(roadGeometry, roadMaterial);
                road.castShadow = true;
                road.receiveShadow = true;

                const midpoint = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);
                road.position.copy(midpoint);

                const roadDirection = new THREE.Vector3().subVectors(endPos, startPos).normalize();
                const angle = Math.atan2(roadDirection.x, roadDirection.z);
                road.rotation.y = angle;

                scene.add(road);
            }
        });

        // Add text labels
        scene.add(createTextAtPosition("S1", 39, 50, "#000000", 32));
        scene.add(createTextAtPosition("S2", 28, 28, "#000000", 32));
        scene.add(createTextAtPosition("S3", 12, 25, "#000000", 32));
        scene.add(createTextAtPosition("S4", 48, 20, "#000000", 32));
        scene.add(createTextAtPosition("S5", 41, -15, "#000000", 32));
        scene.add(createTextAtPosition("S6", 11, -15, "#000000", 32));
        scene.add(createTextAtPosition("H3", 28, 3, "#000000", 32));

        // Setup controls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.screenSpacePanning = false;
        controls.minDistance = 30;
        controls.maxDistance = 150;
        controls.maxPolarAngle = Math.PI / 2 - 0.1;
        controlsRef.current = controls;

        // Setup lighting
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

        // Animation loop
        const animate = () => {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        };
        animate();

        // Initialize cameras
        createCameraIcons();

        // Handle resize
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
            if (mountRef.current && renderer.domElement && mountRef.current.contains(renderer.domElement)) {
                mountRef.current.removeChild(renderer.domElement);
            }
        };
    }, []);

    // Redraw route when showTimeTexts changes
    useEffect(() => {
        if (searchResults.length > 0 && searchPlateNumber) {
            drawPlateRoute(searchResults, searchPlateNumber);
        }
    }, [showTimeTexts]);

    // Action bar
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
            {/* Left side - 3D Map */}
            <div style={{ flex: '0 0 60%', position: 'relative' }}>
                <div ref={mountRef} className="threejs-container" style={{ width: '100%', height: '100%' }} />

                {/* Control Panel */}
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

                    <PlateSearchPanel
                        searchPlateNumber={searchPlateNumber}
                        setSearchPlateNumber={setSearchPlateNumber}
                        handleSearchPlate={handleSearchPlate}
                        clearPlateRoute={clearPlateRoute}
                        isSearching={isSearching}
                        searchResults={searchResults}
                        showTimeTexts={showTimeTexts}
                        setShowTimeTexts={setShowTimeTexts}
                    />

                    <CameraControlsPanel onRefreshCameras={refreshCameras} />
                    <InstructionsPanel />
                </div>
            </div>

            {/* Right side - Camera Viewer */}
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
};

export default RouteMonitoring;
