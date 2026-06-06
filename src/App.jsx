import { useState, useEffect, useCallback } from 'react';
import './index.css';
import TopBar from './components/TopBar.jsx';
import Sidebar from './components/Sidebar.jsx';
import AlertPanel from './components/AlertPanel.jsx';
import HotelView3D from './views/HotelView3D.jsx';
import CameraGrid from './views/CameraGrid.jsx';
import GuestDashboard from './views/GuestDashboard.jsx';
import DAFTeamView from './views/DAFTeamView.jsx';
import SplashScreen from './components/SplashScreen.jsx';
import { io } from 'socket.io-client';
import bus from './core/EventBus.js';
import { findEvacuationPath } from './data/hotel.js';
import { initAlertEngine } from './core/AlertEngine.js';
import config from './core/config.js';

// Init systems
initAlertEngine();

export default function App() {
  const [activeView, setActiveView] = useState('hotel3d');
  const [alertCount, setAlertCount] = useState(0);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [alertCounts, setAlertCounts] = useState({});
  const [evacuationPath, setEvacuationPath] = useState([]);
  const [isSplashComplete, setIsSplashComplete] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);

  useEffect(() => {
    // ── SOCKET.IO: Receive Real-time Detections from Cameras ──────────
    const socket = io(config.socketUrl, { path: config.socketPath });

    socket.on('connect', () => {
      setSocketConnected(true);
      socket.emit('admin:register');
      console.log('Admin Socket Connected');
    });

    socket.on('detection:alert', (alert) => {
      console.log('📡 RECEIVED DETECTION:', alert);
      window.DETECTION_LOG = window.DETECTION_LOG || [];
      window.DETECTION_LOG.unshift({ ts: new Date().toLocaleTimeString(), ...alert });
      // Route through local AlertEngine for processing & state
      bus.emit('detection:raw', alert);
    });

    socket.on('alert:escalate', (data) => {
      // Direct escalation from server (e.g. OpenAI/Python backend)
      bus.emit('detection:raw', { ...data, confidence: 0.9 });
    });

    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    const unsub = bus.on('alert:new', (alert) => {
      setAlertCount(prev => prev + 1);
      setAlertCounts(prev => ({
        ...prev,
        cameras: (prev.cameras || 0) + (alert.type === 'fire' || alert.type === 'smoke' ? 1 : 0),
        hotel3d: (prev.hotel3d || 0) + 1,
      }));
    });

    const unsubGuide = bus.on('daf:guide', ({ roomId }) => {
      if (!roomId) {
        setEvacuationPath([]);
        return;
      }
      const path = findEvacuationPath(roomId); // Find path to nearest exit
      setEvacuationPath(path);
      setActiveView('hotel3d'); // Switch to map to show path
    });

    return () => {
        unsub();
        unsubGuide();
    };
  }, []);

  const handleRoomClick = useCallback((roomId) => {
    setSelectedRoom(roomId);
    setActiveView('cameras');
  }, []);

  const handleHighlightRoom = useCallback((roomId) => {
    setSelectedRoom(roomId);
    setActiveView('hotel3d');
  }, []);

  const handleAlertClick = useCallback((alert) => {
    setSelectedRoom(alert.location?.roomId);
    setActiveView('hotel3d');
  }, []);

  const handleNavigate = useCallback((view) => {
    setActiveView(view);
    // Clear badge for this view
    setAlertCounts(prev => ({ ...prev, [view]: 0 }));
  }, []);

  return (
    <>
      {!isSplashComplete && (
        <SplashScreen onComplete={() => setIsSplashComplete(true)} />
      )}
      
      <div className="app-shell" style={{ opacity: isSplashComplete ? 1 : 0, transition: 'opacity 0.8s ease-in' }}>
        <div className="app-topbar">
          <TopBar activeView={activeView} alertCount={alertCount} />
        </div>

        <div className="app-sidebar">
          <Sidebar
            activeView={activeView}
            onNavigate={handleNavigate}
            alertCounts={alertCounts}
          />
        </div>

        <main className="app-main">
          {activeView === 'hotel3d' && (
            <HotelView3D onRoomClick={handleRoomClick} evacuationPath={evacuationPath} />
          )}
          {activeView === 'cameras' && (
            <CameraGrid selectedRoom={selectedRoom} />
          )}
          {activeView === 'guests' && (
            <GuestDashboard onHighlightRoom={handleHighlightRoom} />
          )}
          {activeView === 'daf' && (
            <DAFTeamView />
          )}
        </main>

        <div className="app-alerts">
          <AlertPanel onAlertClick={handleAlertClick} />
        </div>
      </div>
    </>
  );
}
