import React from 'react';

const PlateSearchPanel = ({
    searchPlateNumber,
    setSearchPlateNumber,
    handleSearchPlate,
    clearPlateRoute,
    isSearching,
    searchResults,
    showTimeTexts,
    setShowTimeTexts
}) => {
    return (
        <div className="plate-search-section" style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#000' }}>Tìm kiếm biển số xe</h3>
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
                    disabled={!searchResults.length}
                    style={{
                        padding: '6px 8px',
                        backgroundColor: searchResults.length ? '#f44336' : '#ccc',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: searchResults.length ? 'pointer' : 'not-allowed',
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
                    <p style={{ margin: '5px 0', fontSize: '10px', color: '#4CAF50' }}>
                        🗺️ Đường đi được vẽ theo thứ tự thời gian phát hiện
                    </p>
                </div>
            )}

            {/* Tùy chọn hiển thị thời gian */}
            <div style={{ marginTop: '10px', padding: '8px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={showTimeTexts}
                        onChange={(e) => setShowTimeTexts(e.target.checked)}
                        style={{ margin: 0 }}
                    />
                    <span style={{ color: '#000' }}>Hiển thị thời gian trên camera</span>
                </label>
            </div>
        </div>
    );
};

export default PlateSearchPanel;
