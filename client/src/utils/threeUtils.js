import * as THREE from 'three';

// Hàm tạo text tại tọa độ bất kỳ
export const createTextAtPosition = (text, x, z, color = '#4CAF50', fontSize = 24) => {
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
};

// Hàm tạo text hiển thị thời gian phía trên camera
export const createTimeText = (cameraName, detectedAt, detectionCount, x, z) => {
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

// Hàm tạo đa giác
export const createPolygon = (points, color, yOffset = 0.02, name = "") => {
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
};

// Hàm tìm đường đi ngắn nhất giữa hai điểm
export const findShortestPath = (startPoint, endPoint, cities, graph) => {
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

            const distance = calculateDistance(currentNode, neighbor, cities);
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

// Tính khoảng cách Euclid giữa các thành phố
export const calculateDistance = (city1, city2, cities) => {
    const [x1, z1] = cities[city1];
    const [x2, z2] = cities[city2];
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(z2 - z1, 2));
};
