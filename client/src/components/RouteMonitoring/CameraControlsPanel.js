import React from 'react';

const CameraControlsPanel = ({ onRefreshCameras }) => {
    return (
        <div className="camera-controls">
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Camera Controls</h3>
            <button
                className="refresh-btn"
                onClick={() => onRefreshCameras && onRefreshCameras()}
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
    );
};

export default CameraControlsPanel;



