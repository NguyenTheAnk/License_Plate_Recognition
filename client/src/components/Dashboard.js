import React, { useState, useEffect } from 'react';
import { 
  Box, Grid, Paper, Typography, Avatar, CircularProgress, Alert, 
  Chip, LinearProgress, Fade,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  List, ListItem, ListItemText, ListItemIcon, Divider
} from '@mui/material';
import { 
  Tooltip, Legend, Bar, XAxis, YAxis, 
  ResponsiveContainer, Line, AreaChart, Area, ComposedChart, CartesianGrid,
  LineChart
} from 'recharts';
import {
  Videocam, DirectionsCar, EventNote, CheckCircle,
  Speed, Timeline, BarChart as BarChartIcon, Notifications
} from '@mui/icons-material';


// API Base URL
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dashboardData, setDashboardData] = useState({
    summary: [],
    eventStats: [],
    lineData: [],
    camBarData: [],
    // New data for enhanced dashboard
    hourlyStats: [],
    weeklyTrends: [],
    monthlyStats: [],
    topPlates: [],
    recentDetections: [],
    systemHealth: {},
    performanceMetrics: {},
    locationStats: [],
    alerts: [],
    // Enhanced charts data
    timeSeriesData: [],
    heatmapData: [],
    speedAnalysis: [],
    alertTrends: [],
    efficiencyMetrics: {},
    hourlyPerformance: []
  });

  // Process raw API data into dashboard format (legacy - not used anymore)
  /*
  const processDashboardData = React.useCallback((cameraData, detectionData, journeyData, accessData) => {
    const cameraStats = cameraData.data?.overall || {};
    const detections = detectionData.data?.detections || detectionData.detections || [];
    const journeys = Array.isArray(journeyData) ? journeyData : [];

    // Summary cards
    const summary = [
      { 
        label: 'Tổng số camera', 
        value: cameraStats.total_cameras || 0, 
        icon: <Videocam fontSize="large" />, 
        color: '#1976d2' 
      },
      { 
        label: 'Đang hoạt động', 
        value: cameraStats.online_cameras || 0, 
        icon: <CheckCircle fontSize="large" />, 
        color: '#43a047' 
      },
      { 
        label: 'Số lộ trình', 
        value: journeys.length, 
        icon: <EventNote fontSize="large" />, 
        color: '#ffa000' 
      },
      { 
        label: 'Xe nhận diện (7 ngày)', 
        value: detections.length, 
        icon: <DirectionsCar fontSize="large" />, 
        color: '#d32f2f' 
      },
    ];

    // Weekly detection data (last 7 days)
    const eventStats = generateWeeklyStats(detections);

    // Hourly detection data (today) - use this for both lineData and hourlyStats
    const hourlyStats = generateHourlyStats(detections);
    const lineData = hourlyStats; // Use the same data

    // Camera detection counts
    const camBarData = generateCameraStats(detections, cameraData.data?.top_detection_cameras || []);
    const weeklyTrends = generateWeeklyTrends(detections);
    const monthlyStats = generateMonthlyStats(detections);
    const topPlates = generateTopPlates(detections);
    const recentDetections = generateRecentDetections(detections);
    const systemHealth = generateSystemHealth(cameraStats, detections);
    const performanceMetrics = generatePerformanceMetrics(detections);
    const locationStats = generateLocationStats(detections, cameraData.data?.by_location || []);
    const alerts = generateAlerts(cameraStats, detections);
    
    // Enhanced charts data
    const timeSeriesData = generateTimeSeriesData(detections);
    const heatmapData = generateHeatmapData(detections);
    const speedAnalysis = generateSpeedAnalysis(detections);
    const alertTrends = generateAlertTrends(detections);
    const efficiencyMetrics = generateEfficiencyMetrics(detections, cameraStats);

    return {
      summary,
      eventStats,
      lineData,
      camBarData,
      hourlyStats,
      weeklyTrends,
      monthlyStats,
      topPlates,
      recentDetections,
      systemHealth,
      performanceMetrics,
      locationStats,
      alerts,
      timeSeriesData,
      heatmapData,
      speedAnalysis,
      alertTrends,
      efficiencyMetrics
    };
  }, []);
  */

  // Process new API data format
  const processNewDashboardData = React.useCallback((apiData) => {
    const { summary, performance, daily_stats, hourly_stats, top_cameras, top_plates, recent_detections, location_stats, time_series_data, hourly_performance } = apiData || {};

    // Summary cards
    const summaryCards = [
      { 
        label: 'Tổng số camera', 
        value: summary.total_cameras || 0, 
        icon: <Videocam fontSize="large" />, 
        color: '#1976d2' 
      },
      { 
        label: 'Đang hoạt động', 
        value: summary.online_cameras || 0, 
        icon: <CheckCircle fontSize="large" />, 
        color: '#43a047' 
      },
      { 
        label: 'Số lộ trình', 
        value: summary.total_journeys || 0, 
        icon: <EventNote fontSize="large" />, 
        color: '#ffa000' 
      },
      { 
        label: 'Xe nhận diện (7 ngày)', 
        value: summary.total_detections || 0, 
        icon: <DirectionsCar fontSize="large" />, 
        color: '#d32f2f' 
      },
    ];

    // Weekly stats from daily_stats
    const weeklyStats = daily_stats.map(stat => ({
      name: new Date(stat.date).toLocaleDateString('vi-VN', { weekday: 'short' }),
      xe: stat.detections,
      suKien: Math.floor(stat.detections * 0.1)
    }));

    // Hourly stats - ensure we have 24 hours of data
    const hourlyData = Array.from({ length: 24 }, (_, i) => {
      const hourData = hourly_stats.find(h => h.hour === `${i}h`);
      return {
        hour: `${i}h`,
        xe: hourData?.detections || 0
      };
    });

    // Camera bar data
    const cameraBarData = top_cameras.slice(0, 5).map(camera => ({
      camera: camera.name,
      xe: camera.detections
    }));

    // Performance metrics
    const performanceMetrics = {
      totalDetections: performance.total_detections || 0,
      avgConfidence: parseFloat(performance.avg_confidence || 0),
      highConfidence: performance.high_confidence || 0,
      mediumConfidence: performance.medium_confidence || 0,
      lowConfidence: performance.low_confidence || 0,
      accuracyRate: parseFloat(performance.accuracy_rate || 0),
      whitelistMatches: performance.whitelist_matches || 0,
      blacklistMatches: performance.blacklist_matches || 0,
      minConfidence: parseFloat(performance.min_confidence || 0),
      maxConfidence: parseFloat(performance.max_confidence || 0),
      confidenceStddev: parseFloat(performance.confidence_stddev || 0),
      uniquePlates: performance.unique_plates || 0,
      whitelistRate: performance.total_detections > 0 ? ((performance.whitelist_matches || 0) / performance.total_detections * 100).toFixed(1) : 0,
      blacklistRate: performance.total_detections > 0 ? ((performance.blacklist_matches || 0) / performance.total_detections * 100).toFixed(1) : 0
    };

    // System health
    const systemHealth = {
      healthScore: summary.total_cameras > 0 ? Math.round((summary.online_cameras / summary.total_cameras) * 100) : 0,
      totalCameras: summary.total_cameras || 0,
      onlineCameras: summary.online_cameras || 0,
      offlineCameras: summary.offline_cameras || 0,
      status: summary.online_cameras / summary.total_cameras >= 0.9 ? 'Excellent' : 
              summary.online_cameras / summary.total_cameras >= 0.7 ? 'Good' : 
              summary.online_cameras / summary.total_cameras >= 0.5 ? 'Fair' : 'Poor',
      lastUpdate: new Date().toLocaleString('vi-VN')
    };

    // Efficiency metrics
    const efficiencyMetrics = {
      accuracyRate: performance.accuracy_rate || 0,
      verificationRate: 0, // Not available in current API
      whitelistRate: 0, // Not available in current API
      blacklistRate: 0, // Not available in current API
      totalCameras: summary.total_cameras || 0,
      onlineCameras: summary.online_cameras || 0,
      offlineCameras: summary.offline_cameras || 0
    };

    // Recent detections
    const recentDetections = recent_detections.map(detection => ({
      id: detection.id,
      plate: detection.plate_number,
      time: new Date(detection.detected_at).toLocaleString('vi-VN'),
      confidence: Math.round(parseFloat(detection.confidence_score || 0) * 100),
      camera: detection.camera_name || 'Unknown',
      location: detection.location_name || 'Unknown'
    }));

    // Top plates
    const topPlates = top_plates.map(plate => ({
      plate: plate.plate,
      count: plate.count
    }));

    // Time series data - use real data from API
    const timeSeriesData = time_series_data ? time_series_data.map(stat => ({
      time: stat.time,
      detections: stat.detections,
      highConfidence: stat.highConfidence,
      whitelist: stat.whitelist,
      blacklist: stat.blacklist
    })) : Array.from({ length: 24 }, (_, i) => ({
      time: `${i}:00`,
      detections: 0,
      highConfidence: 0,
      whitelist: 0,
      blacklist: 0
    }));

    // Alerts
    const alerts = [];
    if (summary.offline_cameras > 0) {
      alerts.push({
        id: 1,
        type: 'warning',
        message: `${summary.offline_cameras} camera đang offline`,
        timestamp: new Date().toLocaleString('vi-VN')
      });
    }
    if (performance.low_confidence > 0) {
      alerts.push({
        id: 2,
        type: 'error',
        message: `${performance.low_confidence} phát hiện có độ tin cậy thấp`,
        timestamp: new Date().toLocaleString('vi-VN')
      });
    }

    return {
      summary: summaryCards,
      eventStats: weeklyStats,
      lineData: hourlyData,
      camBarData: cameraBarData,
      hourlyStats: hourlyData,
      weeklyTrends: weeklyStats.map(stat => ({
        day: stat.name,
        detections: stat.xe,
        uniquePlates: Math.floor(stat.xe * 0.8), // Estimate
        avgConfidence: 0.75, // Default
        efficiency: Math.min(100, Math.floor(stat.xe * 0.8 / Math.max(stat.xe, 1) * 100))
      })),
      monthlyStats: [], // Not available in current API
      topPlates: topPlates,
      recentDetections: recentDetections,
      systemHealth: systemHealth,
      performanceMetrics: performanceMetrics,
      locationStats: location_stats.map(location => ({
        name: location.name,
        detections: location.detection_count,
        cameras: location.camera_count,
        efficiency: location.camera_count > 0 ? Math.round((location.detection_count / location.camera_count) * 100) / 100 : 0
      })),
      alerts: alerts,
      timeSeriesData: timeSeriesData,
      heatmapData: [], // Not available in current API
      speedAnalysis: [], // Not available in current API
      alertTrends: [], // Not available in current API
      efficiencyMetrics: efficiencyMetrics,
      hourlyPerformance: hourly_performance || []
    };
  }, []);

  // Fetch dashboard data
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Check if user is authenticated
        const token = localStorage.getItem('token');
        if (!token) {
          throw new Error('Bạn cần đăng nhập để xem dashboard');
        }

        // Fetch dashboard statistics from new API
        const dashboardResponse = await fetch(`${API_BASE_URL}/dashboard/stats`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        if (!dashboardResponse.ok) {
          throw new Error(`Dashboard API error: ${dashboardResponse.status}`);
        }
        const dashboardApiData = await dashboardResponse.json();

        console.log('Dashboard API data:', dashboardApiData);

        // Process the new API data format
        const processedData = processNewDashboardData(dashboardApiData.data);
        console.log('Processed dashboard data:', processedData);
        setDashboardData(processedData);

      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        
        // Fallback to mock data if API fails
        if (err.message.includes('Bạn cần đăng nhập')) {
          setError(err.message);
        } else {
          console.warn('API not available, using fallback data');
          setDashboardData({
            summary: [
              { label: 'Tổng số camera', value: 0, icon: <Videocam fontSize="large" />, color: '#1976d2' },
              { label: 'Đang hoạt động', value: 0, icon: <CheckCircle fontSize="large" />, color: '#43a047' },
              { label: 'Số lộ trình', value: 0, icon: <EventNote fontSize="large" />, color: '#ffa000' },
              { label: 'Xe nhận diện (7 ngày)', value: 0, icon: <DirectionsCar fontSize="large" />, color: '#d32f2f' },
            ],
            eventStats: [],
            lineData: [],
            camBarData: [],
            // Add missing properties for fallback data
            hourlyStats: [],
            weeklyTrends: [],
            monthlyStats: [],
            topPlates: [],
            recentDetections: [],
            systemHealth: {
              healthScore: 0,
              totalCameras: 0,
              onlineCameras: 0,
              offlineCameras: 0,
              status: 'Unknown',
              lastUpdate: 'N/A'
            },
            performanceMetrics: {
              totalDetections: 0,
              avgConfidence: 0,
              highConfidence: 0,
              mediumConfidence: 0,
              lowConfidence: 0,
              accuracyRate: 0
            },
            locationStats: [],
            alerts: [],
            timeSeriesData: [],
            heatmapData: [],
            speedAnalysis: [],
            alertTrends: [],
            efficiencyMetrics: {
              accuracyRate: 0,
              verificationRate: 0,
              whitelistRate: 0,
              blacklistRate: 0,
              totalCameras: 0,
              onlineCameras: 0,
              offlineCameras: 0
            }
          });
        }
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [processNewDashboardData]);

  // Generate weekly statistics (legacy - not used anymore)
  /*
  const generateWeeklyStats = (detections) => {
    const days = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
    const today = new Date();
    const weeklyData = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayDetections = detections.filter(d => 
        d.detected_at && d.detected_at.startsWith(dateStr)
      );

      weeklyData.push({
        name: days[6 - i],
        xe: dayDetections.length,
        suKien: Math.floor(dayDetections.length * 0.1) // Approximate events
      });
    }

    return weeklyData;
  };
  */

  // Generate hourly statistics for today (legacy - not used anymore)
  /*
  const generateHourlyStats = (detections) => {
    const today = new Date().toISOString().split('T')[0];
    const hourlyData = [];
    
    for (let hour = 6; hour <= 17; hour++) {
      const hourDetections = detections.filter(d => {
        if (!d.detected_at) return false;
        const detectionDate = new Date(d.detected_at);
        const detectionHour = detectionDate.getHours();
        return detectionDate.toISOString().split('T')[0] === today && detectionHour === hour;
      });

      hourlyData.push({
        hour: `${hour}h`,
        xe: hourDetections.length
      });
    }

    console.log('Generated hourly stats:', hourlyData);
    return hourlyData;
  };

  // Generate camera statistics
  const generateCameraStats = (detections, topCameras) => {
    const cameraCounts = {};
    
    detections.forEach(detection => {
      if (detection.camera_id) {
        cameraCounts[detection.camera_id] = (cameraCounts[detection.camera_id] || 0) + 1;
      }
    });

    return topCameras.slice(0, 5).map(camera => ({
      camera: camera.name || `Cam ${camera.id}`,
      xe: cameraCounts[camera.id] || 0
    }));
  };

  // Generate weekly trends
  const generateWeeklyTrends = (detections) => {
    const days = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
    const today = new Date();
    const weeklyData = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayDetections = detections.filter(d => 
        d.detected_at && d.detected_at.startsWith(dateStr)
      );

      const uniquePlates = new Set(dayDetections.map(d => d.plate_number)).size;
      const avgConfidence = dayDetections.length > 0 
        ? dayDetections.reduce((sum, d) => {
            const confidence = d.confidence_score || 
              (d.detection_confidence && d.ocr_confidence ? (d.detection_confidence + d.ocr_confidence) / 2 : 0);
            return sum + confidence;
          }, 0) / dayDetections.length 
        : 0;

      weeklyData.push({
        day: days[6 - i],
        detections: dayDetections.length,
        uniquePlates,
        avgConfidence: Math.round(avgConfidence * 100) / 100,
        efficiency: Math.min(100, Math.round((uniquePlates / Math.max(dayDetections.length, 1)) * 100))
      });
    }

    return weeklyData;
  };

  // Generate monthly statistics
  const generateMonthlyStats = (detections) => {
    const months = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];
    const monthlyData = [];

    for (let i = 0; i < 12; i++) {
      const monthDetections = detections.filter(d => {
        if (!d.detected_at) return false;
        const date = new Date(d.detected_at);
        return date.getMonth() === i;
      });

      monthlyData.push({
        month: months[i],
        detections: monthDetections.length,
        uniquePlates: new Set(monthDetections.map(d => d.plate_number)).size,
        avgConfidence: monthDetections.length > 0 
          ? Math.round((monthDetections.reduce((sum, d) => {
              const confidence = d.confidence_score || 
                (d.detection_confidence && d.ocr_confidence ? (d.detection_confidence + d.ocr_confidence) / 2 : 0);
              return sum + confidence;
            }, 0) / monthDetections.length) * 100) / 100
          : 0
      });
    }

    return monthlyData;
  };

  // Generate top plates
  const generateTopPlates = (detections) => {
    const plateCounts = {};
    
    detections.forEach(detection => {
      if (detection.plate_number) {
        plateCounts[detection.plate_number] = (plateCounts[detection.plate_number] || 0) + 1;
      }
    });

    return Object.entries(plateCounts)
      .map(([plate, count]) => ({ plate, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  };

  // Generate recent detections
  const generateRecentDetections = (detections) => {
    return detections
      .sort((a, b) => new Date(b.detected_at) - new Date(a.detected_at))
      .slice(0, 10)
      .map(detection => ({
        id: detection.id,
        plate: detection.plate_number,
        time: new Date(detection.detected_at).toLocaleString('vi-VN'),
        confidence: Math.round(((detection.confidence_score || 
          (detection.detection_confidence && detection.ocr_confidence ? 
            (detection.detection_confidence + detection.ocr_confidence) / 2 : 0)) * 100)),
        camera: detection.camera_name || 'Unknown',
        location: detection.location_name || 'Unknown'
      }));
  };

  // Generate system health
  const generateSystemHealth = (cameraStats, detections) => {
    const totalCameras = cameraStats.total_cameras || 0;
    const onlineCameras = cameraStats.online_cameras || 0;
    const offlineCameras = cameraStats.offline_cameras || 0;
    
    const healthScore = totalCameras > 0 ? Math.round((onlineCameras / totalCameras) * 100) : 0;
    
    return {
      healthScore,
      totalCameras,
      onlineCameras,
      offlineCameras,
      status: healthScore >= 90 ? 'Excellent' : healthScore >= 70 ? 'Good' : healthScore >= 50 ? 'Fair' : 'Poor',
      lastUpdate: new Date().toLocaleString('vi-VN')
    };
  };

  // Generate performance metrics
  const generatePerformanceMetrics = (detections) => {
    const totalDetections = detections.length;
    
    // Debug: Log confidence scores to see what we're working with
    console.log('Sample detections confidence scores:', detections.slice(0, 5).map(d => ({
      id: d.id,
      detection_confidence: d.detection_confidence,
      ocr_confidence: d.ocr_confidence,
      combined_confidence: d.detection_confidence && d.ocr_confidence ? (d.detection_confidence + d.ocr_confidence) / 2 : null
    })));
    
    // Calculate combined confidence from detection_confidence and ocr_confidence
    const avgConfidence = totalDetections > 0 
      ? detections.reduce((sum, d) => {
          // Use confidence_score if available, otherwise calculate from detection_confidence and ocr_confidence
          const confidence = d.confidence_score || 
            (d.detection_confidence && d.ocr_confidence ? (d.detection_confidence + d.ocr_confidence) / 2 : 0);
          return sum + confidence;
        }, 0) / totalDetections 
      : 0;
    
    const highConfidence = detections.filter(d => {
      const confidence = d.confidence_score || 
        (d.detection_confidence && d.ocr_confidence ? (d.detection_confidence + d.ocr_confidence) / 2 : 0);
      return confidence >= 0.8;
    }).length;
    
    const mediumConfidence = detections.filter(d => {
      const confidence = d.confidence_score || 
        (d.detection_confidence && d.ocr_confidence ? (d.detection_confidence + d.ocr_confidence) / 2 : 0);
      return confidence >= 0.5 && confidence < 0.8;
    }).length;
    
    const lowConfidence = detections.filter(d => {
      const confidence = d.confidence_score || 
        (d.detection_confidence && d.ocr_confidence ? (d.detection_confidence + d.ocr_confidence) / 2 : 0);
      return confidence < 0.5;
    }).length;

    console.log('Performance metrics:', {
      totalDetections,
      avgConfidence,
      highConfidence,
      mediumConfidence,
      lowConfidence
    });

    return {
      totalDetections,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      highConfidence,
      mediumConfidence,
      lowConfidence,
      accuracyRate: totalDetections > 0 ? Math.round((highConfidence / totalDetections) * 100) : 0
    };
  };

  // Generate location statistics
  const generateLocationStats = (detections, locations) => {
    const locationCounts = {};
    
    detections.forEach(detection => {
      if (detection.location_id) {
        locationCounts[detection.location_id] = (locationCounts[detection.location_id] || 0) + 1;
      }
    });

    return locations.map(location => ({
      name: location.location_name,
      detections: locationCounts[location.id] || 0,
      cameras: location.camera_count || 0,
      efficiency: location.camera_count > 0 ? Math.round(((locationCounts[location.id] || 0) / location.camera_count) * 100) / 100 : 0
    })).sort((a, b) => b.detections - a.detections);
  };


  // Generate alerts
  const generateAlerts = (cameraStats, detections) => {
    const alerts = [];
    
    // Camera offline alert
    const offlineCameras = cameraStats.offline_cameras || 0;
    if (offlineCameras > 0) {
      alerts.push({
        id: 1,
        type: 'warning',
        message: `${offlineCameras} camera đang offline`,
        timestamp: new Date().toLocaleString('vi-VN')
      });
    }

    // Low confidence alert
    const lowConfidenceDetections = detections.filter(d => {
      const confidence = d.confidence_score || 
        (d.detection_confidence && d.ocr_confidence ? (d.detection_confidence + d.ocr_confidence) / 2 : 0);
      return confidence < 0.5;
    }).length;
    if (lowConfidenceDetections > 0) {
      alerts.push({
        id: 2,
        type: 'error',
        message: `${lowConfidenceDetections} phát hiện có độ tin cậy thấp`,
        timestamp: new Date().toLocaleString('vi-VN')
      });
    }

    // High detection volume alert
    const todayDetections = detections.filter(d => {
      const today = new Date().toISOString().split('T')[0];
      return d.detected_at && d.detected_at.startsWith(today);
    }).length;
    
    if (todayDetections > 1000) {
      alerts.push({
        id: 3,
        type: 'info',
        message: `Hôm nay có ${todayDetections} phát hiện - Lưu lượng cao`,
        timestamp: new Date().toLocaleString('vi-VN')
      });
    }

    return alerts;
  };


  // Generate time series data for detailed analysis
  const generateTimeSeriesData = (detections) => {
    const today = new Date();
    const data = [];
    
    console.log('Generating time series data for', detections.length, 'detections');
    
    for (let i = 23; i >= 0; i--) {
      const hour = new Date(today);
      hour.setHours(hour.getHours() - i);
      
      const hourDetections = detections.filter(d => {
        if (!d.detected_at) return false;
        const detectionDate = new Date(d.detected_at);
        const detectionHour = detectionDate.getHours();
        return detectionDate.toISOString().split('T')[0] === hour.toISOString().split('T')[0] && detectionHour === hour.getHours();
      });

      const highConfidence = hourDetections.filter(d => {
        const confidence = d.confidence_score || 
          (d.detection_confidence && d.ocr_confidence ? (d.detection_confidence + d.ocr_confidence) / 2 : 0);
        return confidence >= 0.8;
      }).length;

      data.push({
        time: hour.getHours() + ':00',
        detections: hourDetections.length,
        highConfidence: highConfidence,
        whitelist: hourDetections.filter(d => d.is_whitelist_match).length,
        blacklist: hourDetections.filter(d => d.is_blacklist_match).length
      });
    }

    console.log('Time series data:', data);
    return data;
  };

  // Generate heatmap data for hourly patterns
  const generateHeatmapData = (detections) => {
    const data = [];
    const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const dayDetections = detections.filter(d => {
          if (!d.detected_at) return false;
          const date = new Date(d.detected_at);
          return date.getDay() === day && date.getHours() === hour;
        });

        data.push({
          day: days[day],
          hour: hour,
          value: dayDetections.length,
          detections: dayDetections.length
        });
      }
    }

    return data;
  };

  // Generate speed analysis data
  const generateSpeedAnalysis = (detections) => {
    const speeds = detections
      .filter(d => d.vehicle_speed && d.vehicle_speed > 0)
      .map(d => d.vehicle_speed);

    if (speeds.length === 0) return [];

    const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    const maxSpeed = Math.max(...speeds);
    const minSpeed = Math.min(...speeds);

    return [
      { metric: 'Tốc độ TB', value: avgSpeed.toFixed(1), unit: 'km/h', color: '#4caf50' },
      { metric: 'Tốc độ Max', value: maxSpeed.toFixed(1), unit: 'km/h', color: '#f44336' },
      { metric: 'Tốc độ Min', value: minSpeed.toFixed(1), unit: 'km/h', color: '#2196f3' }
    ];
  };

  // Generate alert trends
  const generateAlertTrends = (detections) => {
    const today = new Date();
    const trends = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayDetections = detections.filter(d => 
        d.detected_at && d.detected_at.startsWith(dateStr)
      );

      trends.push({
        date: dateStr,
        whitelist: dayDetections.filter(d => d.is_whitelist_match).length,
        blacklist: dayDetections.filter(d => d.is_blacklist_match).length,
        alerts: dayDetections.filter(d => d.alert_triggered).length
      });
    }

    return trends;
  };
  */

  // Generate efficiency metrics (legacy - not used anymore)
  /*
  const generateEfficiencyMetrics = (detections, cameraStats) => {
    const totalDetections = detections.length;
    const highConfidenceDetections = detections.filter(d => {
      const confidence = d.confidence_score || 
        (d.detection_confidence && d.ocr_confidence ? (d.detection_confidence + d.ocr_confidence) / 2 : 0);
      return confidence >= 0.8;
    }).length;
    const verifiedDetections = detections.filter(d => d.is_verified).length;
    const whitelistMatches = detections.filter(d => d.is_whitelist_match).length;
    const blacklistMatches = detections.filter(d => d.is_blacklist_match).length;

    return {
      accuracyRate: totalDetections > 0 ? ((highConfidenceDetections / totalDetections) * 100).toFixed(1) : 0,
      verificationRate: totalDetections > 0 ? ((verifiedDetections / totalDetections) * 100).toFixed(1) : 0,
      whitelistRate: totalDetections > 0 ? ((whitelistMatches / totalDetections) * 100).toFixed(1) : 0,
      blacklistRate: totalDetections > 0 ? ((blacklistMatches / totalDetections) * 100).toFixed(1) : 0,
      totalCameras: cameraStats.total_cameras || 0,
      onlineCameras: cameraStats.online_cameras || 0,
      offlineCameras: cameraStats.offline_cameras || 0
    };
  };
  */


  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      minHeight: '100vh', 
      background: '#f5f5f5', 
      p: 3,
      '& .pulse': {
        animation: 'pulse 2s infinite'
      },
      '@keyframes pulse': {
        '0%': { opacity: 1 },
        '50%': { opacity: 0.5 },
        '100%': { opacity: 1 }
      }
    }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box>
            <Typography variant="h4" fontWeight={700} sx={{ mb: 1, color: '#1976d2' }}>
              Dashboard Thống Kê Hệ Thống
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Tổng quan hoạt động hệ thống nhận diện biển số xe
            </Typography>
          </Box>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* Card tổng quan với animation */}
        {dashboardData.summary.map((item, idx) => (
          <Grid item xs={12} sm={6} md={3} key={item.label}>
            <Fade in={true} timeout={500 + idx * 100}>
              <Paper sx={{ 
                p: 4, 
                display: 'flex', 
                alignItems: 'center', 
                gap: 3, 
                borderRadius: 4, 
                boxShadow: 6,
                background: `linear-gradient(135deg, ${item.color}20, ${item.color}08)`,
                border: `2px solid ${item.color}40`,
                transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                height: 140,
                position: 'relative',
                overflow: 'hidden',
                '&:hover': {
                  transform: 'translateY(-8px) scale(1.02)',
                  boxShadow: `0 20px 40px ${item.color}30`,
                  border: `2px solid ${item.color}60`,
                  '&::before': {
                    opacity: 1
                  }
                },
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: `linear-gradient(45deg, ${item.color}15, transparent)`,
                  opacity: 0,
                  transition: 'opacity 0.3s ease'
                }
              }}>
                <Avatar sx={{ 
                  bgcolor: item.color, 
                  width: 64, 
                  height: 64,
                  boxShadow: `0 8px 20px ${item.color}50`,
                  transition: 'all 0.3s ease',
                  zIndex: 1
                }}>
                  {item.icon}
                </Avatar>
                <Box sx={{ zIndex: 1, flex: 1 }}>
                  <Typography variant="h3" fontWeight={800} color={item.color} sx={{
                    textShadow: `0 2px 4px ${item.color}30`,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.1
                  }}>
                    {item.value.toLocaleString()}
                  </Typography>
                  <Typography variant="body1" color="text.secondary" fontWeight={600} sx={{
                    fontSize: '0.95rem',
                    letterSpacing: '0.02em',
                    mt: 0.5
                  }}>
                    {item.label}
                  </Typography>
                </Box>
              </Paper>
            </Fade>
          </Grid>
        ))}


        {/* Performance Metrics */}
        <Grid item xs={12} md={6}>
          <Fade in={true} timeout={1200}>
            <Paper sx={{ 
              p: 4, 
              borderRadius: 4, 
              boxShadow: 6, 
              minHeight: 700,
              background: 'linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%)',
              border: '1px solid #e8f5e8',
              position: 'relative',
              overflow: 'visible',
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'linear-gradient(45deg, rgba(46, 125, 50, 0.05), transparent)',
                opacity: 0.5,
                pointerEvents: 'none'
              }
            }}>
              <Typography variant="h6" fontWeight={700} sx={{ 
                mb: 2, 
                display: 'flex', 
                alignItems: 'center', 
                gap: 1,
                color: '#2e7d32',
                position: 'relative',
                zIndex: 1
              }}>
                <Speed color="primary" />
                Hiệu Suất Hệ Thống
              </Typography>
              
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">Độ chính xác</Typography>
                  <Typography variant="body2" fontWeight={700}>
                    {dashboardData.performanceMetrics?.accuracyRate || 0}%
                  </Typography>
                </Box>
                <LinearProgress 
                  variant="determinate" 
                  value={dashboardData.performanceMetrics?.accuracyRate || 0}
                  sx={{ height: 8, borderRadius: 4 }}
                />
              </Box>

              <Grid container spacing={1.5}>
                <Grid item xs={4}>
                  <Box sx={{ textAlign: 'center', p: 1.5, bgcolor: '#e3f2fd', borderRadius: 2 }}>
                    <Typography variant="h6" color="info.main" fontWeight={700}>
                      {dashboardData.performanceMetrics?.highConfidence || 0}
                    </Typography>
                    <Typography variant="caption">Cao (≥80%)</Typography>
                  </Box>
                </Grid>
                <Grid item xs={4}>
                  <Box sx={{ textAlign: 'center', p: 1.5, bgcolor: '#fff3e0', borderRadius: 2 }}>
                    <Typography variant="h6" color="warning.main" fontWeight={700}>
                      {dashboardData.performanceMetrics?.mediumConfidence || 0}
                    </Typography>
                    <Typography variant="caption">Trung bình</Typography>
                  </Box>
                </Grid>
                <Grid item xs={4}>
                  <Box sx={{ textAlign: 'center', p: 1.5, bgcolor: '#ffebee', borderRadius: 2 }}>
                    <Typography variant="h6" color="error.main" fontWeight={700}>
                      {dashboardData.performanceMetrics?.lowConfidence || 0}
                    </Typography>
                    <Typography variant="caption">Thấp (&lt;50%)</Typography>
                  </Box>
                </Grid>
              </Grid>

              <Box sx={{ mt: 2, p: 1.5, bgcolor: '#f5f5f5', borderRadius: 2 }}>
                <Grid container spacing={1.5}>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Tổng phát hiện: <strong>{dashboardData.performanceMetrics?.totalDetections || 0}</strong>
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Biển số duy nhất: <strong>{dashboardData.performanceMetrics?.uniquePlates || 0}</strong>
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Độ tin cậy TB: <strong>{((dashboardData.performanceMetrics?.avgConfidence || 0) * 100).toFixed(1)}%</strong>
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Khoảng tin cậy: <strong>{((dashboardData.performanceMetrics?.minConfidence || 0) * 100).toFixed(1)}% - {((dashboardData.performanceMetrics?.maxConfidence || 0) * 100).toFixed(1)}%</strong>
                    </Typography>
                  </Grid>
                </Grid>
              </Box>

              {/* Thông tin whitelist/blacklist */}
              <Box sx={{ mt: 1.5, p: 1.5, bgcolor: '#e8f5e8', borderRadius: 2 }}>
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1, color: '#2e7d32' }}>
                  Phân loại phát hiện
                </Typography>
                <Grid container spacing={1.5}>
                  <Grid item xs={4}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h6" color="success.main" fontWeight={700}>
                        {dashboardData.performanceMetrics?.whitelistMatches || 0}
                      </Typography>
                      <Typography variant="caption">Whitelist ({dashboardData.performanceMetrics?.whitelistRate || 0}%)</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={4}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h6" color="error.main" fontWeight={700}>
                        {dashboardData.performanceMetrics?.blacklistMatches || 0}
                      </Typography>
                      <Typography variant="caption">Blacklist ({dashboardData.performanceMetrics?.blacklistRate || 0}%)</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={4}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h6" color="info.main" fontWeight={700}>
                        {((dashboardData.performanceMetrics?.totalDetections || 0) - (dashboardData.performanceMetrics?.whitelistMatches || 0) - (dashboardData.performanceMetrics?.blacklistMatches || 0))}
                      </Typography>
                      <Typography variant="caption">Khác</Typography>
                    </Box>
                  </Grid>
                </Grid>
              </Box>

              {/* Biểu đồ xu hướng hiệu suất theo thời gian */}
              <Box sx={{ mt: 1.5, p: 1.5, bgcolor: '#f5f5f5', borderRadius: 2 }}>
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5, color: '#2e7d32' }}>
                  Xu hướng hiệu suất 24h
                </Typography>
                <Box sx={{ height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dashboardData.hourlyPerformance || []} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                      <XAxis 
                        dataKey="hour" 
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => `${value}h`}
                      />
                      <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                          border: '1px solid #ccc',
                          borderRadius: '8px',
                          fontSize: '12px'
                        }}
                        formatter={(value, name) => {
                          if (name === 'avg_confidence') return [`${(value * 100).toFixed(1)}%`, 'Độ tin cậy TB'];
                          return [value, name];
                        }}
                      />
                      <Legend />
                      <Line 
                        yAxisId="left"
                        type="monotone" 
                        dataKey="detections" 
                        stroke="#1976d2" 
                        strokeWidth={3}
                        name="Số phát hiện"
                        dot={{ fill: '#1976d2', strokeWidth: 2, r: 4 }}
                      />
                      <Line 
                        yAxisId="right"
                        type="monotone" 
                        dataKey="avg_confidence" 
                        stroke="#ff9800" 
                        strokeWidth={3}
                        name="Độ tin cậy TB"
                        dot={{ fill: '#ff9800', strokeWidth: 2, r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              </Box>

              {/* Biểu đồ phân bố độ tin cậy */}
              <Box sx={{ mt: 1.5, p: 1.5, bgcolor: '#e3f2fd', borderRadius: 2 }}>
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5, color: '#1976d2' }}>
                  Phân bố độ tin cậy
                </Typography>
                <Box sx={{ height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={[
                      { 
                        name: 'Cao (≥80%)', 
                        value: dashboardData.performanceMetrics?.highConfidence || 0, 
                        color: '#4caf50',
                        percentage: dashboardData.performanceMetrics?.totalDetections > 0 
                          ? ((dashboardData.performanceMetrics?.highConfidence || 0) / dashboardData.performanceMetrics?.totalDetections * 100).toFixed(1)
                          : 0
                      },
                      { 
                        name: 'Trung bình (50-80%)', 
                        value: dashboardData.performanceMetrics?.mediumConfidence || 0, 
                        color: '#ff9800',
                        percentage: dashboardData.performanceMetrics?.totalDetections > 0 
                          ? ((dashboardData.performanceMetrics?.mediumConfidence || 0) / dashboardData.performanceMetrics?.totalDetections * 100).toFixed(1)
                          : 0
                      },
                      { 
                        name: 'Thấp (<50%)', 
                        value: dashboardData.performanceMetrics?.lowConfidence || 0, 
                        color: '#f44336',
                        percentage: dashboardData.performanceMetrics?.totalDetections > 0 
                          ? ((dashboardData.performanceMetrics?.lowConfidence || 0) / dashboardData.performanceMetrics?.totalDetections * 100).toFixed(1)
                          : 0
                      }
                    ]} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                          border: '1px solid #ccc',
                          borderRadius: '8px',
                          fontSize: '12px'
                        }}
                        formatter={(value, name, props) => {
                          if (name === 'value') return [value, 'Số lượng'];
                          if (name === 'percentage') return [`${props.payload.percentage}%`, 'Tỷ lệ'];
                          return [value, name];
                        }}
                      />
                      <Legend />
                      <Bar yAxisId="left" dataKey="value" fill="#1976d2" radius={[4, 4, 0, 0]} name="Số lượng" />
                      <Line yAxisId="right" type="monotone" dataKey="percentage" stroke="#ff9800" strokeWidth={3} name="Tỷ lệ (%)" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </Box>
              </Box>

              {/* Thống kê chi tiết */}
              <Box sx={{ mt: 1.5, p: 1.5, bgcolor: '#f8f9fa', borderRadius: 2 }}>
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5, color: '#6c757d' }}>
                  Thống kê chi tiết
                </Typography>
                <Grid container spacing={1.5}>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Độ lệch chuẩn: <strong>{((dashboardData.performanceMetrics?.confidenceStddev || 0) * 100).toFixed(2)}%</strong>
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Tỷ lệ duy nhất: <strong>{dashboardData.performanceMetrics?.totalDetections > 0 ? ((dashboardData.performanceMetrics?.uniquePlates || 0) / dashboardData.performanceMetrics?.totalDetections * 100).toFixed(1) : 0}%</strong>
                    </Typography>
                  </Grid>
                </Grid>
              </Box>
            </Paper>
          </Fade>
        </Grid>


        <Grid item xs={12} md={6}>
          <Fade in={true} timeout={1600}>
            <Paper sx={{ 
              p: 3, 
              borderRadius: 3, 
              boxShadow: 4, 
              height: 450,
              background: 'linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%)',
              border: '1px solid #e8f5e8'
            }}>
              <Typography variant="h6" fontWeight={700} sx={{ 
                mb: 3, 
                display: 'flex', 
                alignItems: 'center', 
                gap: 1,
                color: '#2e7d32'
              }}>
                <BarChartIcon color="primary" />
                Xu Hướng Tuần
              </Typography>
              <ResponsiveContainer width="100%" height={350}>
                <ComposedChart data={dashboardData.weeklyTrends} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis 
                    dataKey="day" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#666' }}
                  />
                  <YAxis 
                    yAxisId="left" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#666' }}
                  />
                  <YAxis 
                    yAxisId="right" 
                    orientation="right" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#666' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      borderRadius: 8, 
                      border: '1px solid #e0e0e0',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      backgroundColor: '#ffffff'
                    }}
                    labelStyle={{ fontWeight: 600 }}
                  />
                  <Legend 
                    verticalAlign="top" 
                    height={36}
                    wrapperStyle={{ paddingBottom: 10 }}
                  />
                  <Bar 
                    yAxisId="left" 
                    dataKey="detections" 
                    fill="url(#barGradient)" 
                    name="Phát hiện" 
                    radius={[6, 6, 0, 0]}
                    maxBarSize={40}
                  />
                  <Line 
                    yAxisId="right" 
                    type="monotone" 
                    dataKey="efficiency" 
                    stroke="#ff6b6b" 
                    strokeWidth={4} 
                    name="Hiệu suất %"
                    dot={{ fill: '#ff6b6b', strokeWidth: 2, r: 6 }}
                    activeDot={{ r: 8, stroke: '#ff6b6b', strokeWidth: 2 }}
                  />
                  <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#8884d8" stopOpacity={0.3}/>
                    </linearGradient>
                  </defs>
                </ComposedChart>
              </ResponsiveContainer>
            </Paper>
          </Fade>
        </Grid>

        {/* Enhanced Charts Row 2 */}
        <Grid item xs={12} md={6}>
          <Fade in={true} timeout={1800}>
            <Paper sx={{ 
              p: 3, 
              borderRadius: 3, 
              boxShadow: 4, 
              height: 450,
              background: 'linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%)',
              border: '1px solid #fff3e0'
            }}>
              <Typography variant="h6" fontWeight={700} sx={{ 
                mb: 3, 
                display: 'flex', 
                alignItems: 'center', 
                gap: 1,
                color: '#f57c00'
              }}>
                <Timeline color="primary" />
                Phát Hiện Theo Giờ (Hôm Nay)
              </Typography>
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={dashboardData.hourlyStats} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis 
                    dataKey="hour" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#666' }}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#666' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      borderRadius: 8, 
                      border: '1px solid #e0e0e0',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      backgroundColor: '#ffffff'
                    }}
                    labelStyle={{ fontWeight: 600 }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="xe" 
                    stroke="#1976d2" 
                    fill="url(#areaGradient)" 
                    strokeWidth={4}
                    dot={{ fill: '#1976d2', strokeWidth: 2, r: 6 }}
                    activeDot={{ r: 8, stroke: '#1976d2', strokeWidth: 2 }}
                  />
                  <defs>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1976d2" stopOpacity={0.8}/>
                      <stop offset="50%" stopColor="#1976d2" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#1976d2" stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                </AreaChart>
              </ResponsiveContainer>
            </Paper>
          </Fade>
        </Grid>




        {/* Data Tables Row */}
        <Grid item xs={12} md={6}>
          <Fade in={true} timeout={2800}>
            <Paper sx={{ p: 3, borderRadius: 3, boxShadow: 4, height: 400 }}>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <DirectionsCar color="primary" />
                Top Biển Số Phát Hiện
              </Typography>
              <TableContainer sx={{ maxHeight: 300 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Biển số</TableCell>
                      <TableCell align="right">Số lần</TableCell>
                      <TableCell align="right">%</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {dashboardData.topPlates.slice(0, 8).map((plate, index) => (
                      <TableRow key={plate.plate} hover>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip 
                              label={index + 1} 
                              size="small" 
                              color={index < 3 ? 'primary' : 'default'}
                              sx={{ minWidth: 24, height: 24 }}
                            />
                            <Typography variant="body2" fontWeight={500}>
                              {plate.plate}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={600}>
                            {plate.count}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" color="text.secondary">
                            {(dashboardData.performanceMetrics?.totalDetections || 0) > 0 
                              ? Math.round((plate.count / (dashboardData.performanceMetrics?.totalDetections || 1)) * 100)
                              : 0}%
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Fade>
        </Grid>

        {/* Real-time Trends Chart */}
        <Grid item xs={12} md={6}>
          <Fade in={true} timeout={3000}>
            <Paper sx={{ 
              p: 3, 
              borderRadius: 3, 
              boxShadow: 4, 
              height: 400,
              background: 'linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%)',
              border: '1px solid #e3f2fd'
            }}>
              <Typography variant="h6" fontWeight={700} sx={{ 
                mb: 3, 
                display: 'flex', 
                alignItems: 'center', 
                gap: 1,
                color: '#1976d2'
              }}>
                <Timeline color="primary" />
                Xu Hướng Thời Gian Thực
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dashboardData.timeSeriesData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis 
                    dataKey="time" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#666' }}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#666' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      borderRadius: 8, 
                      border: '1px solid #e0e0e0',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      backgroundColor: '#ffffff'
                    }}
                    labelStyle={{ fontWeight: 600 }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="detections" 
                    stroke="#1976d2" 
                    strokeWidth={3}
                    name="Tổng phát hiện"
                    dot={{ fill: '#1976d2', strokeWidth: 2, r: 4 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="highConfidence" 
                    stroke="#4caf50" 
                    strokeWidth={2}
                    name="Độ tin cậy cao"
                    dot={{ fill: '#4caf50', strokeWidth: 2, r: 3 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="whitelist" 
                    stroke="#ff9800" 
                    strokeWidth={2}
                    name="WhiteList"
                    dot={{ fill: '#ff9800', strokeWidth: 2, r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Paper>
          </Fade>
        </Grid>

        {/* Recent Detections */}
        <Grid item xs={12} md={6}>
          <Fade in={true} timeout={3200}>
            <Paper sx={{ p: 3, borderRadius: 3, boxShadow: 4, height: 400 }}>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <EventNote color="primary" />
                Phát Hiện Gần Đây
              </Typography>
              <List sx={{ maxHeight: 300, overflow: 'auto' }}>
                {dashboardData.recentDetections.slice(0, 6).map((detection, index) => (
                  <React.Fragment key={detection.id}>
                    <ListItem sx={{ px: 0 }}>
                      <ListItemIcon>
                        <Avatar sx={{ 
                          width: 32, 
                          height: 32, 
                          bgcolor: detection.confidence >= 80 ? 'success.main' : 
                                  detection.confidence >= 50 ? 'warning.main' : 'error.main'
                        }}>
                          {detection.confidence}
                        </Avatar>
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" fontWeight={600}>
                              {detection.plate}
                            </Typography>
                            <Chip 
                              label={`${detection.confidence}%`} 
                              size="small" 
                              color={detection.confidence >= 80 ? 'success' : 
                                    detection.confidence >= 50 ? 'warning' : 'error'}
                            />
                          </Box>
                        }
                        secondary={
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              {detection.camera} • {detection.location}
                            </Typography>
                            <Typography variant="caption" display="block" color="text.secondary">
                              {detection.time}
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItem>
                    {index < 5 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            </Paper>
          </Fade>
        </Grid>

        {/* Alerts and Notifications */}
        {dashboardData.alerts.length > 0 && (
          <Grid item xs={12}>
            <Fade in={true} timeout={2600}>
              <Paper sx={{ p: 3, borderRadius: 3, boxShadow: 4 }}>
                <Typography variant="h6" fontWeight={700} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Notifications color="primary" />
                  Thông Báo & Cảnh Báo
                </Typography>
                <Grid container spacing={2}>
                  {dashboardData.alerts.map((alert) => (
                    <Grid item xs={12} sm={6} md={4} key={alert.id}>
                      <Alert 
                        severity={alert.type} 
                        sx={{ 
                          borderRadius: 2,
                          '& .MuiAlert-message': {
                            width: '100%'
                          }
                        }}
                      >
                        <Typography variant="body2" fontWeight={500}>
                          {alert.message}
                        </Typography>
                        <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                          {alert.timestamp}
                        </Typography>
                      </Alert>
                    </Grid>
                  ))}
                </Grid>
              </Paper>
            </Fade>
          </Grid>
        )}


      </Grid>
    </Box>
  );
}

export default Dashboard; 

// Add CSS animations
const styles = `
  @keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
  }
  
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  @keyframes slideInRight {
    from {
      opacity: 0;
      transform: translateX(30px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  
  .dashboard-card {
    animation: fadeInUp 0.6s ease-out;
  }
  
  .dashboard-chart {
    animation: slideInRight 0.8s ease-out;
  }
  
  .live-indicator {
    animation: pulse 2s infinite;
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
} 