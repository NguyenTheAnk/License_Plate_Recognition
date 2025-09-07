import React, { useState, useEffect } from "react";
import "./CameraConfigurationPage.css";
import { fetchDataFromAPI, editData } from "../../utils/auth";

const CameraConfigurationPage = ({ cameraId, onSave, onClose }) => {
  const [camera, setCamera] = useState({
    ke: "",
    mid: "",
    name: "",
    code: "",
    details: "",
    protocol: "rtsp",
    host: "0.0.0.0",
    path: "",
    port: 554,
    fps: 30,
    width: "",
    height: "",
    location_id: "",
    direction: "bidirectional",
    camera_type: "fixed",
    camera_role: "",
    monitoring_location_id: "",
    status: "offline",
    is_active: true,
    is_detect: true,
  });

  useEffect(() => {
    const fetchCameraData = async () => {
      if (cameraId) {
        try {
          const token = localStorage.getItem("token");
          const response = await fetchDataFromAPI(
            `/api/cameras/${cameraId}`,
            token
          );
          if (response?.success && response.data?.camera) {
            console.log("Camera data received:", response.data.camera);
            const { rtsp_url, recent_stats, ...cameraData } =
              response.data.camera;
            setCamera((prev) => ({
              ...prev,
              ...cameraData,
              port: parseInt(cameraData.port) || 554,
              fps: parseInt(cameraData.fps) || 30,
              width: parseInt(cameraData.width) || "",
              height: parseInt(cameraData.height) || "",
              location_id: parseInt(cameraData.location_id) || "",
              monitoring_location_id:
                parseInt(cameraData.monitoring_location_id) || "",
            }));
          } else {
            console.error("Lỗi khi lấy dữ liệu camera:", response);
            alert(
              `Lỗi khi tải dữ liệu: ${response?.message || "Vui lòng thử lại"}`
            );
          }
        } catch (error) {
          console.error("Lỗi khi gửi yêu cầu lấy dữ liệu:", error);
          alert(
            `Lỗi khi tải dữ liệu camera: ${
              error.message || "Vui lòng kiểm tra console"
            }`
          );
        }
      }
    };
    fetchCameraData();
  }, [cameraId]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setCamera((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async () => {
    try {
      const token = localStorage.getItem("token");
      const payload = {
        ke: camera.ke || null,
        mid: camera.mid || null,
        name: camera.name,
        code: camera.code,
        details: camera.details || null,
        protocol: camera.protocol,
        host: camera.host,
        path: camera.path || null,
        port: parseInt(camera.port) || 554,
        fps: parseInt(camera.fps) || 30,
        width: camera.width ? parseInt(camera.width) : null,
        height: camera.height ? parseInt(camera.height) : null,
        location_id: parseInt(camera.location_id) || null,
        direction: camera.direction,
        camera_type: camera.camera_type,
        camera_role: camera.camera_role || null,
        monitoring_location_id: parseInt(camera.monitoring_location_id) || null,
        status: camera.status,
        is_active: camera.is_active,
        is_detect: camera.is_detect,
      };

      const response = await editData(
        `/api/cameras/${cameraId}`,
        payload,
        token
      );
      if (response.success) {
        if (onSave) onSave(payload);
        alert("Cấu hình đã được lưu thành công!");
        if (onClose) onClose();
      } else {
        alert(`Lỗi khi lưu: ${response.message || "Vui lòng thử lại"}`);
      }
    } catch (error) {
      console.error("Lỗi khi gửi yêu cầu lưu:", error);
      alert(
        `Lỗi khi lưu cấu hình camera: ${
          error.response?.data?.message ||
          error.message ||
          "Vui lòng kiểm tra console"
        }`
      );
    }
  };

  const handleRefresh = () => {
    if (cameraId) {
      console.log("Làm mới dữ liệu cho camera ID:", cameraId);
      const fetchCameraData = async () => {
        try {
          const token = localStorage.getItem("token");
          const response = await fetchDataFromAPI(
            `/api/cameras/${cameraId}`,
            token
          );
          if (response?.success && response.data?.camera) {
            const { rtsp_url, recent_stats, ...cameraData } =
              response.data.camera;
            setCamera((prev) => ({
              ...prev,
              ...cameraData,
              port: parseInt(cameraData.port) || 554,
              fps: parseInt(cameraData.fps) || 30,
              width: parseInt(cameraData.width) || "",
              height: parseInt(cameraData.height) || "",
              location_id: parseInt(cameraData.location_id) || "",
              monitoring_location_id:
                parseInt(cameraData.monitoring_location_id) || "",
            }));
          } else {
            console.error(
              "Lỗi khi làm mới dữ liệu:",
              response?.message || "Không có dữ liệu camera"
            );
          }
        } catch (error) {
          console.error("Lỗi khi làm mới dữ liệu:", error);
        }
      };
      fetchCameraData();
    }
  };

  return (
    <div className="camera-config-container">
      <div className="config-section">
        <h3>Cấu hình camera: {camera.name || "Chưa đặt tên"}</h3>
        <hr />
        <div className="config-group">
          <label>Tên camera</label>
          <input
            type="text"
            name="name"
            value={camera.name || ""}
            onChange={handleChange}
            placeholder="Nhập tên camera"
          />
        </div>
        <div className="config-group">
          <label>Mã camera</label>
          <input
            type="text"
            name="code"
            value={camera.code || ""}
            onChange={handleChange}
            placeholder="Nhập mã camera"
          />
        </div>
        <div className="config-group">
          <label>Thông tin chi tiết</label>
          <input
            type="text"
            name="details"
            value={camera.details || ""}
            onChange={handleChange}
            placeholder="Nhập chi tiết"
          />
        </div>
        <div className="config-group">
          <label>Vị trí camera</label>
          <input
            type="number"
            name="location_id"
            value={camera.location_id || ""}
            onChange={handleChange}
            placeholder="ID vị trí"
          />
        </div>
        <button className="refresh-btn" onClick={handleRefresh}>
          Làm mới
        </button>
      </div>
      <div className="config-section">
        <h3>Thiết lập kết nối</h3>
        <hr />
        <div className="config-group">
          <label>Giao thức</label>
          <select
            name="protocol"
            value={camera.protocol || "rtsp"}
            onChange={handleChange}
          >
            <option value="rtsp">RTSP</option>
            <option value="http">HTTP</option>
          </select>
        </div>
        <div className="config-group">
          <label>Địa chỉ host</label>
          <input
            type="text"
            name="host"
            value={camera.host || "0.0.0.0"}
            onChange={handleChange}
            placeholder="Nhập địa chỉ host"
          />
        </div>
        <div className="config-group">
          <label>Đường dẫn stream</label>
          <input
            type="text"
            name="path"
            value={camera.path || ""}
            onChange={handleChange}
            placeholder="Nhập đường dẫn"
          />
        </div>
        <div className="config-group">
          <label>Cổng kết nối</label>
          <input
            type="number"
            name="port"
            value={camera.port || 554}
            onChange={handleChange}
            placeholder="Nhập cổng"
          />
        </div>
      </div>
      <div className="config-section">
        <h3>Cài đặt camera</h3>
        <hr />
        <div className="config-group">
          <label>Hướng giám sát</label>
          <select
            name="direction"
            value={camera.direction || "bidirectional"}
            onChange={handleChange}
          >
            <option value="bidirectional">Bidirectional</option>
            <option value="inbound">Inbound</option>
            <option value="outbound">Outbound</option>
            <option value="entry_only">Entry Only</option>
            <option value="exit_only">Exit Only</option>
          </select>
        </div>
        <div className="config-group">
          <label>Loại camera</label>
          <select
            name="camera_type"
            value={camera.camera_type || "fixed"}
            onChange={handleChange}
          >
            <option value="fixed">Fixed</option>
            <option value="ptz">PTZ</option>
            <option value="mobile">Mobile</option>
          </select>
        </div>
        <div className="config-group">
          <label>Vai trò camera</label>
          <select
            name="camera_role"
            value={camera.camera_role || ""}
            onChange={handleChange}
          >
            <option value="">Chọn vai trò</option>
            <option value="entry">Entry</option>
            <option value="exit">Exit</option>
            <option value="internal">Internal</option>
            <option value="overview">Overview</option>
          </select>
        </div>
        <div className="config-group">
          <label>Vị trí giám sát</label>
          <select
            name="monitoring_location_id"
            value={camera.monitoring_location_id || ""}
            onChange={handleChange}
          >
            <option value="">Chọn vị trí</option>
            <option value="1">Vị trí 1</option>
            <option value="2">Vị trí 2</option>
          </select>
        </div>
        <div className="config-group">
          <label>Trạng thái</label>
          <select
            name="status"
            value={camera.status || "offline"}
            onChange={handleChange}
          >
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>
        <div className="config-group">
          <label>Khung hình/giây (FPS)</label>
          <input
            type="number"
            name="fps"
            value={camera.fps || 30}
            onChange={handleChange}
            placeholder="Nhập FPS"
          />
        </div>
        <div className="config-group">
          <label>Độ phân giải chiều rộng</label>
          <input
            type="number"
            name="width"
            value={camera.width || ""}
            onChange={handleChange}
            placeholder="Chiều rộng"
          />
        </div>
        <div className="config-group">
          <label>Độ phân giải chiều cao</label>
          <input
            type="number"
            name="height"
            value={camera.height || ""}
            onChange={handleChange}
            placeholder="Chiều cao"
          />
        </div>

        <div className="config-group">
          <label>Trạng thái hoạt động</label>
          <input
            type="checkbox"
            name="is_active"
            checked={camera.is_active}
            onChange={handleChange}
          />
        </div>
        <div className="config-group">
          <label>Phát hiện biển số</label>
          <input
            type="checkbox"
            name="is_detect"
            checked={camera.is_detect}
            onChange={handleChange}
          />
        </div>
        <div className="config-group">
          <label>Khóa định danh</label>
          <input
            type="text"
            name="ke"
            value={camera.ke || ""}
            onChange={handleChange}
            placeholder="Nhập khóa"
          />
        </div>
        <div className="config-group">
          <label>Mã định danh</label>
          <input
            type="text"
            name="mid"
            value={camera.mid || ""}
            onChange={handleChange}
            placeholder="Nhập mã định danh"
          />
        </div>
        <button className="save-btn" onClick={handleSubmit}>
          Lưu
        </button>
      </div>
    </div>
  );
};

export default CameraConfigurationPage;