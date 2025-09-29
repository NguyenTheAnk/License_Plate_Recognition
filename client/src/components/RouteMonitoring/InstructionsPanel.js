import React from 'react';

const InstructionsPanel = () => {
    return (
        <div className="instructions" style={{ marginTop: '15px', fontSize: '12px' }}>
            <p style={{ margin: '5px 0' }}>↔ Di chuyển camera: Kéo chuột</p>
            <p style={{ margin: '5px 0' }}>↻ Xoay camera: Giữ chuột phải + kéo</p>
            <p style={{ margin: '5px 0' }}>Zoom: Cuộn chuột</p>
            <p style={{ margin: '5px 0', fontWeight: 'bold', color: '#2196F3' }}>📹 Click vào camera để xem</p>
        </div>
    );
};

export default InstructionsPanel;