import React from 'react';
import './MonitorStatusPanel.css';

const MonitorStatusPanel = ({ cameras, monitorStates, onStatusChange }) => {
  const statusTexts = {
    0: "Disabled",
    1: "Starting", 
    2: "Watching",
    3: "Recording",
    4: "Restarting",
    5: "Stopped",
    6: "Idle", 
    7: "Died",
    8: "Stopping",
    9: "Started"
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 0: return '#6c757d'; // Disabled - gray
      case 1: return '#ffc107'; // Starting - yellow  
      case 2: return '#28a745'; // Watching - green
      case 3: return '#dc3545'; // Recording - red
      case 4: return '#fd7e14'; // Restarting - orange
      case 5: return '#6c757d'; // Stopped - gray
      case 6: return '#17a2b8'; // Idle - teal
      case 7: return '#e74c3c'; // Died - dark red
      case 8: return '#ffc107'; // Stopping - yellow
      case 9: return '#20c997'; // Started - light green
      default: return '#6c757d';
    }
  };

  const getStatusActions = (status) => {
    switch(status) {
      case 0: return ['Start', 'Enable'];
      case 1: return ['Stop'];
      case 2: return ['Stop', 'Restart', 'Record'];
      case 3: return ['Stop', 'Restart'];
      case 4: return ['Stop'];
      case 5: return ['Start', 'Restart'];
      case 6: return ['Start', 'Stop', 'Restart'];
      case 7: return ['Start', 'Restart'];
      case 8: return [];
      case 9: return ['Stop', 'Restart'];
      default: return [];
    }
  };

  return (
    <div className="monitor-status-panel">
      <h3>Monitor Status Overview</h3>
      <div className="status-grid">
        {cameras.map((camera) => {
          const status = monitorStates[camera.id] || 0;
          const actions = getStatusActions(status);
          
          return (
            <div key={camera.id} className="status-card">
              <div className="camera-info">
                <h4>{camera.name}</h4>
                <p>ID: {camera.id}</p>
              </div>
              
              <div 
                className="status-badge"
                style={{ 
                  backgroundColor: getStatusColor(status),
                  color: 'white'
                }}
              >
                {statusTexts[status]}
              </div>
              
              <div className="status-actions">
                {actions.map((action) => (
                  <button
                    key={action}
                    className={`action-button ${action.toLowerCase()}`}
                    onClick={() => onStatusChange(camera.id, action.toLowerCase())}
                  >
                    {action}
                  </button>
                ))}
              </div>
              
              <div className="status-details">
                <small>Last update: {new Date().toLocaleTimeString()}</small>
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="status-legend">
        <h4>Status Legend:</h4>
        <div className="legend-grid">
          {Object.entries(statusTexts).map(([code, text]) => (
            <div key={code} className="legend-item">
              <div 
                className="legend-color"
                style={{ backgroundColor: getStatusColor(parseInt(code)) }}
              ></div>
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MonitorStatusPanel;