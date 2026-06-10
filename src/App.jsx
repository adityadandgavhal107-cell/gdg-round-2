import { useState, useEffect, useCallback, useRef } from 'react';
import './index.css';
import TopBar from './components/TopBar.jsx';
import Sidebar from './components/Sidebar.jsx';
import AlertPanel from './components/AlertPanel.jsx';
import HotelView3D from './views/HotelView3D.jsx';
import CameraGrid from './views/CameraGrid.jsx';
import GuestDashboard from './views/GuestDashboard.jsx';
import DAFTeamView from './views/DAFTeamView.jsx';
import SplashScreen from './components/SplashScreen.jsx';
import LoginPortal from './views/LoginPortal.jsx';
import { io } from 'socket.io-client';
import bus from './core/EventBus.js';
import { findEvacuationPath } from './data/hotel.js';
import { initAlertEngine, resolveAlert, getActiveAlerts } from './core/AlertEngine.js';
import config from './core/config.js';

initAlertEngine();

const CAMERA_ALERT_TYPES = new Set(['fire', 'smoke', 'medical', 'security', 'audio']);
const _seenSocketEvents = new Set();

const _socketOriginatedResolves = new Set();

// ── DAF Resolved Toast ────────────────────────────────────────────────────────
function DAFToast({ toasts }) {
  if (toasts.length === 0) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 99999, display: 'flex', flexDirection: 'column', gap: 10,
      alignItems: 'center', pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'rgba(10,20,15,0.97)',
          border: '1px solid rgba(0,255,136,0.45)',
          borderRadius: 10, padding: '12px 20px',
          boxShadow: '0 0 30px rgba(0,255,136,0.15), 0 8px 32px rgba(0,0,0,0.8)',
          animation: t.exiting ? 'toastOut 0.35s ease forwards' : 'toastIn 0.35s ease forwards',
          minWidth: 300, maxWidth: 420,
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
            background: '#00ff88', boxShadow: '0 0 10px #00ff88',
            animation: 'pulse 1.2s ease-in-out infinite',
          }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: '#00ff88', letterSpacing: 1.5, marginBottom: 3 }}>
              ✓ DAF ZONE CLEARED
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontFamily: 'JetBrains Mono, monospace' }}>
              {t.msg}
            </div>
          </div>
          <div style={{ fontSize: 9, color: 'rgba(0,255,136,0.5)', fontWeight: 700, letterSpacing: 1, flexShrink: 0 }}>
            AUTO-RESOLVED
          </div>
        </div>
      ))}
      <style>{`
        @keyframes toastIn  { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes toastOut { from { opacity:1; transform:translateY(0);   } to { opacity:0; transform:translateY(16px); } }
        @keyframes pulse    { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
      `}</style>
    </div>
  );
}

// ── Logout Confirm Modal ──────────────────────────────────────────────────────
function LogoutModal({ onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99998,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16, padding: '32px 28px', width: 340, textAlign: 'center',
        boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
        animation: 'modalIn 0.2s ease',
      }}>
        <div style={{ fontSize: 36, marginBottom: 14 }}>🔐</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 8, letterSpacing: 0.5 }}>
          Sign out of Admin?
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 28, lineHeight: 1.6 }}>
          You'll need to log in again to access the HMS dashboard.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '12px', borderRadius: 10,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1, padding: '12px', borderRadius: 10,
              background: 'linear-gradient(135deg,#e53e3e,#c53030)', border: 'none',
              color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              letterSpacing: 0.5,
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
      <style>{`@keyframes modalIn { from { opacity:0; transform:scale(0.95); } to { opacity:1; transform:scale(1); } }`}</style>
    </div>
  );
}

export default function App() {
  const [activeView, setActiveView]                     = useState('hotel3d');
  const [alertCount, setAlertCount]                     = useState(0);
  const [selectedRoom, setSelectedRoom]                 = useState(null);
  const [alertCounts, setAlertCounts]                   = useState({});
  const [evacuationPath, setEvacuationPath]             = useState([]);
  const [isSplashComplete, setIsSplashComplete]         = useState(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [dafToasts, setDafToasts]                       = useState([]);
  const [showLogoutModal, setShowLogoutModal]           = useState(false);
  const [roomStatuses, setRoomStatuses]                 = useState({});

  const socketRef = useRef(null);

  // ── Toast helper ──────────────────────────────────────────────────────────
  function showDAFToast(roomId, clearedBy) {
    const id = `toast_${Date.now()}`;
    const team = clearedBy && clearedBy !== 'admin' ? ` by Team ${clearedBy}` : '';
    const msg = `Room ${roomId} marked safe${team} — alert auto-resolved`;
    setDafToasts(prev => [...prev, { id, msg, exiting: false }]);
    setTimeout(() => {
      setDafToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
      setTimeout(() => setDafToasts(prev => prev.filter(t => t.id !== id)), 350);
    }, 3800);
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  function handleLogoutConfirm() {
    setShowLogoutModal(false);
    setIsAdminAuthenticated(false);
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }

  // ── Socket ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdminAuthenticated) return;

    const socket = io(config.socketUrl, { path: config.socketPath });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('admin:register');
      console.log('Admin Socket Connected');
    });

    // ── NEW: authoritative full hazard map on initial connect ─────────────
    socket.on('hazards:init', (fullMap) => {
      console.log('[APP] hazards:init received:', fullMap);
      Object.entries(fullMap).forEach(([roomId, { type }]) => {
        const id = String(roomId);
        console.log(`[APP] hazards:init — room ${id}: ${type}`);
        setRoomStatuses(prev => ({ ...prev, [id]: type }));
        bus.emit('room:statusChange', { roomId: id, status: type });
      });
    });

    // ── NEW: authoritative full hazard map broadcast after every change ───
    socket.on('hazards:update', (fullMap) => {
      console.log('[APP] hazards:update received:', fullMap);
      setRoomStatuses(prev => {
        const next = { ...prev };
        // Apply every room in the server map
        Object.entries(fullMap).forEach(([roomId, { type }]) => {
          const id = String(roomId);
          console.log(`[APP] hazards:update — room ${id}: ${type}`);
          next[id] = type;
          bus.emit('room:statusChange', { roomId: id, status: type });
        });
        // Clear rooms no longer in server map
        Object.keys(next).forEach(id => {
          if (!fullMap[id] && next[id] !== 'clear') {
            console.log(`[APP] hazards:update — clearing stale room ${id}`);
            next[id] = 'clear';
            bus.emit('room:statusChange', { roomId: id, status: 'clear' });
          }
        });
        return next;
      });
    });

    socket.on('detection:alert', (payload) => {
      console.log('📡 RECEIVED DETECTION:', payload);
      const roomId = payload.roomId || payload.room_id || payload.room || payload.location?.roomId || 'unknown';
      const type   = payload.type || payload.alertType || payload.alert_type || '';
      const bucket = Math.floor(Date.now() / 1000);
      const fp     = `${type}__${roomId}__${bucket}`;
      if (_seenSocketEvents.has(fp)) { console.debug('[App] Duplicate socket event suppressed:', fp); return; }
      _seenSocketEvents.add(fp);
      setTimeout(() => _seenSocketEvents.delete(fp), 5000);
      window.DETECTION_LOG = window.DETECTION_LOG || [];
      window.DETECTION_LOG.unshift({ ts: new Date().toLocaleTimeString(), ...payload });
      bus.emit('detection:raw', payload);
    });

    socket.on('alert:resolved', ({ roomId, clearedBy }) => {
      if (!roomId) return;
      const rid = String(roomId);
      _socketOriginatedResolves.add(rid);
      resolveAlert(rid);
      setTimeout(() => _socketOriginatedResolves.delete(rid), 100);
      if (clearedBy !== 'admin') showDAFToast(rid, clearedBy);
    });

    return () => { socket.disconnect(); socketRef.current = null; };
  }, [isAdminAuthenticated]);

  // ── Bus listeners ─────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubNew = bus.on('alert:new', (alert) => {
      setAlertCount(getActiveAlerts().length);
      setAlertCounts(prev => ({
        ...prev,
        cameras: (prev.cameras || 0) + (CAMERA_ALERT_TYPES.has(alert.type) ? 1 : 0),
        hotel3d: (prev.hotel3d || 0) + 1,
      }));
    });

    const unsubResolved = bus.on('alert:resolved', ({ roomId }) => {
      setAlertCount(getActiveAlerts().length);
      if (roomId && !_socketOriginatedResolves.has(String(roomId))) {
        if (socketRef.current?.connected) {
          socketRef.current.emit('alert:resolved', { roomId, clearedBy: 'admin' });
        }
      }
    });

    const unsubGuide = bus.on('daf:guide', ({ roomId }) => {
      if (!roomId) { setEvacuationPath([]); return; }
      setEvacuationPath(findEvacuationPath(roomId));
      setActiveView('hotel3d');
    });

    const unsubStatus = bus.on('room:statusChange', ({ roomId, status }) => {
      setRoomStatuses(prev => ({ ...prev, [String(roomId)]: status }));
    });

    const unsubClear = bus.on('alert:resolved', ({ roomId }) => {
      if (roomId) {
        setRoomStatuses(prev => ({ ...prev, [String(roomId)]: 'clear' }));
      }
    });

    return () => { unsubNew(); unsubResolved(); unsubGuide(); unsubStatus(); unsubClear(); };
  }, []);

  const handleRoomClick     = useCallback((roomId) => { setSelectedRoom(roomId); setActiveView('cameras'); }, []);
  const handleHighlightRoom = useCallback((roomId) => { setSelectedRoom(roomId); setActiveView('hotel3d'); }, []);
  const handleAlertClick    = useCallback((alert)  => { setSelectedRoom(alert.location?.roomId); setActiveView('hotel3d'); }, []);
  const handleNavigate      = useCallback((view)   => { setActiveView(view); setAlertCounts(prev => ({ ...prev, [view]: 0 })); }, []);

  if (!isSplashComplete)     return <SplashScreen onComplete={() => setIsSplashComplete(true)} />;
  if (!isAdminAuthenticated) return <LoginPortal onAdminLoginSuccess={() => setIsAdminAuthenticated(true)} />;

  return (
    <div className="app-shell" style={{ opacity: 1, transition: 'opacity 0.8s ease-in' }}>
      <div className="app-topbar">
        <TopBar activeView={activeView} alertCount={alertCount} />
      </div>
      <div className="app-sidebar">
        <Sidebar activeView={activeView} onNavigate={handleNavigate} alertCounts={alertCounts} />
      </div>
      <main className="app-main">
        {activeView === 'hotel3d'  && (
          <HotelView3D
            onRoomClick={handleRoomClick}
            evacuationPath={evacuationPath}
            roomStatuses={roomStatuses}
          />
        )}
        {activeView === 'cameras'  && <CameraGrid selectedRoom={selectedRoom} />}
        {activeView === 'guests'   && <GuestDashboard onHighlightRoom={handleHighlightRoom} />}
        {activeView === 'daf'      && <DAFTeamView />}
      </main>
      <div className="app-alerts">
        <AlertPanel onAlertClick={handleAlertClick} />
      </div>

      {/* ── Logout button — fixed bottom-left corner ── */}
      <button
        onClick={() => setShowLogoutModal(true)}
        title="Sign out of Admin HMS"
        style={{
          position: 'fixed', bottom: 20, left: 20, zIndex: 9990,
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '8px 14px', borderRadius: 8,
          background: 'rgba(20,10,10,0.92)',
          border: '1px solid rgba(255,45,45,0.25)',
          color: 'rgba(255,255,255,0.45)', fontSize: 11,
          fontWeight: 700, letterSpacing: 0.8, cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          transition: 'border-color 0.2s, color 0.2s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = 'rgba(255,45,45,0.6)';
          e.currentTarget.style.color = '#ff6666';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'rgba(255,45,45,0.25)';
          e.currentTarget.style.color = 'rgba(255,255,255,0.45)';
        }}
      >
        <span style={{ fontSize: 13 }}>⏻</span>
        SIGN OUT
      </button>

      {showLogoutModal && (
        <LogoutModal
          onConfirm={handleLogoutConfirm}
          onCancel={() => setShowLogoutModal(false)}
        />
      )}

      <DAFToast toasts={dafToasts} />
    </div>
  );
}