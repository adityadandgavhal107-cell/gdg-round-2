import { useState, useEffect, useCallback, useRef } from 'react';
import './index.css';
import HotelView3D from './views/HotelView3D.jsx';
import CameraGrid from './views/CameraGrid.jsx';
import GuestDashboard from './views/GuestDashboard.jsx';
import DAFTeamView from './views/DAFTeamView.jsx';
import SensorSimPanel from './views/SensorSimPanel.jsx';
import AlertPanel from './components/AlertPanel.jsx';
import SplashScreen from './components/SplashScreen.jsx';
import LandingPage from './components/LandingPage.jsx';
import { io } from 'socket.io-client';
import bus from './core/EventBus.js';
import { findEvacuationPath } from './data/hotel.js';
import { initAlertEngine, resolveAlert, getActiveAlerts } from './core/AlertEngine.js';
import config from './core/config.js';

initAlertEngine();

const CAMERA_ALERT_TYPES = new Set(['fire', 'smoke', 'medical', 'security', 'audio']);
const _seenSocketEvents = new Set();
const _socketOriginatedResolves = new Set();

const FONT_LINK =
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap';

/* ─── Design tokens ─────────────────────────────────────────────────── */
const C = {
  primary:   'rgba(220,230,255,0.95)',
  secondary: 'rgba(160,180,220,0.70)',
  muted:     'rgba(120,140,180,0.50)',
  accent:    '#4fa3ff',
  accentDim: 'rgba(79,163,255,0.15)',
  glass:     'rgba(10,15,30,0.70)',
  glassBg:   'rgba(5,10,20,0.75)',
  border:    'rgba(100,150,255,0.15)',
  glow:      '0 0 20px rgba(100,150,255,0.20)',
};

const F = {
  display: "'Inter', sans-serif",
  mono:    "'JetBrains Mono', monospace",
};

const glassPanel = {
  background:           C.glass,
  backdropFilter:       'blur(20px) saturate(1.5)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
  border:               `1px solid ${C.border}`,
  borderRadius:         14,
  boxShadow:            C.glow,
};

const NAV_ITEMS = [
  { id: 'hotel3d',  label: '3D Hotel Map',    icon: '⬡' },
  { id: 'cameras',  label: 'Live Cameras',     icon: '◉' },
  { id: 'guests',   label: 'Guest Management', icon: '◈' },
  { id: 'daf',      label: 'DAF Teams',        icon: '◎' },
  { id: 'sensors',  label: 'Sensor Control',   icon: '◇' },
];

/* ─── DAF Toast ─────────────────────────────────────────────────────── */
function DAFToast({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div style={{ position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',zIndex:99999,display:'flex',flexDirection:'column',gap:10,alignItems:'center',pointerEvents:'none' }}>
      {toasts.map(t => (
        <div key={t.id} style={{ display:'flex',alignItems:'center',gap:12,background:'rgba(10,20,15,0.97)',border:'1px solid rgba(0,255,136,0.45)',borderRadius:10,padding:'12px 20px',boxShadow:'0 0 30px rgba(0,255,136,0.15),0 8px 32px rgba(0,0,0,0.8)',animation:t.exiting?'toastOut 0.35s ease forwards':'toastIn 0.35s ease forwards',minWidth:300,maxWidth:420 }}>
          <div style={{ width:10,height:10,borderRadius:'50%',flexShrink:0,background:'#00ff88',boxShadow:'0 0 10px #00ff88',animation:'pulse 1.2s ease-in-out infinite' }} />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10,fontWeight:800,color:'#00ff88',letterSpacing:2,marginBottom:3,fontFamily:F.display,textTransform:'uppercase' }}>✓ DAF Zone Cleared</div>
            <div style={{ fontSize:12,color:'rgba(255,255,255,0.75)',fontFamily:F.mono }}>{t.msg}</div>
          </div>
          <div style={{ fontSize:9,color:'rgba(0,255,136,0.5)',fontWeight:700,letterSpacing:1,flexShrink:0,fontFamily:F.mono }}>AUTO-RESOLVED</div>
        </div>
      ))}
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}@keyframes toastOut{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(16px)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}

/* ─── Logout Modal ──────────────────────────────────────────────────── */
function LogoutModal({ onConfirm, onCancel }) {
  return (
    <div style={{ position:'fixed',inset:0,zIndex:99998,background:'rgba(0,0,0,0.80)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center' }}>
      <div style={{ ...glassPanel,padding:'36px 32px',width:360,textAlign:'center',animation:'modalIn 0.2s ease' }}>
        <div style={{ width:56,height:56,borderRadius:'50%',border:'2px solid rgba(255,45,45,0.4)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 18px',background:'rgba(255,45,45,0.08)',boxShadow:'0 0 20px rgba(255,45,45,0.15)' }}>
          <span style={{ fontSize:24 }}>⏻</span>
        </div>
        <div style={{ fontSize:16,fontWeight:700,color:C.primary,marginBottom:10,letterSpacing:1,fontFamily:F.display,textTransform:'uppercase' }}>Sign Out</div>
        <div style={{ fontSize:13,color:C.muted,marginBottom:28,lineHeight:1.7,fontFamily:F.mono }}>You'll need to authenticate again to access the HMS command center.</div>
        <div style={{ display:'flex',gap:10 }}>
          <button onClick={onCancel} style={{ flex:1,padding:12,borderRadius:10,background:'rgba(255,255,255,0.04)',border:`1px solid ${C.border}`,color:C.secondary,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:F.display,letterSpacing:0.5,textTransform:'uppercase' }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex:1,padding:12,borderRadius:10,background:'linear-gradient(135deg,rgba(255,45,45,0.8),rgba(180,20,20,0.8))',border:'1px solid rgba(255,45,45,0.4)',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:F.display,letterSpacing:0.5,textTransform:'uppercase',boxShadow:'0 0 20px rgba(255,45,45,0.3)' }}>Confirm</button>
        </div>
      </div>
      <style>{`@keyframes modalIn{from{opacity:0;transform:scale(0.93)}to{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );
}

/* ─── Sidebar (Admin only) ──────────────────────────────────────────── */
function Sidebar({ activeView, onNavigate, alertCounts, onSignOut }) {
  const [hovered, setHovered] = useState(null);
  return (
    <aside style={{ width:260,height:'100%',display:'flex',flexDirection:'column',background:'rgba(5,8,20,0.92)',backdropFilter:'blur(24px)',borderRight:'1px solid rgba(100,150,255,0.12)',boxShadow:'4px 0 40px rgba(0,0,50,0.6)',zIndex:100,flexShrink:0,overflow:'hidden' }}>
      <div style={{ padding:'28px 22px 22px',borderBottom:'1px solid rgba(100,150,255,0.10)' }}>
        <div style={{ display:'flex',alignItems:'center',gap:12,marginBottom:6 }}>
          <div style={{ width:42,height:42,borderRadius:10,background:'linear-gradient(135deg,rgba(79,163,255,0.25),rgba(100,50,255,0.15))',border:'1px solid rgba(79,163,255,0.35)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 0 16px rgba(79,163,255,0.20)',fontSize:20 }}>⬡</div>
          <div>
            <div style={{ fontFamily:F.display,fontSize:14,fontWeight:800,color:C.primary,letterSpacing:3,lineHeight:1.2,textTransform:'uppercase' }}>FireGuard</div>
            <div style={{ fontFamily:F.mono,fontSize:9,fontWeight:500,color:C.muted,letterSpacing:3 }}>HMS · v4.1</div>
          </div>
        </div>
        <div style={{ display:'flex',alignItems:'center',gap:6,marginTop:10,paddingTop:10,borderTop:'1px solid rgba(100,150,255,0.08)' }}>
          <div style={{ width:6,height:6,borderRadius:'50%',background:'#00ff88',boxShadow:'0 0 8px #00ff88',animation:'blink 2s ease-in-out infinite' }} />
          <span style={{ fontFamily:F.mono,fontSize:10,color:'rgba(0,255,136,0.7)',letterSpacing:1.5 }}>SYSTEM ONLINE</span>
        </div>
      </div>

      <div style={{ padding:'18px 22px 8px' }}>
        <span style={{ fontFamily:F.display,fontSize:9,fontWeight:700,color:C.muted,letterSpacing:3,textTransform:'uppercase' }}>Navigation</span>
      </div>

      <nav style={{ flex:1,padding:'0 12px',overflowY:'auto' }}>
        {NAV_ITEMS.map(item => {
          const isActive  = activeView === item.id;
          const isHovered = hovered === item.id;
          const count     = alertCounts[item.id] || 0;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              onMouseEnter={() => setHovered(item.id)}
              onMouseLeave={() => setHovered(null)}
              style={{ width:'100%',display:'flex',alignItems:'center',gap:12,padding:'11px 14px',marginBottom:4,borderRadius:10,border:'none',cursor:'pointer',background:isActive?'linear-gradient(90deg,rgba(79,163,255,0.18),rgba(79,163,255,0.06))':isHovered?'rgba(79,163,255,0.07)':'transparent',borderLeft:isActive?'2px solid rgba(79,163,255,0.8)':'2px solid transparent',transition:'all 0.18s ease',boxShadow:isActive?'0 0 20px rgba(79,163,255,0.10)':'none' }}
            >
              <span style={{ fontSize:15,color:isActive?C.accent:isHovered?'rgba(140,180,255,0.9)':C.muted,filter:isActive?'drop-shadow(0 0 6px rgba(79,163,255,0.8))':'none',transition:'all 0.18s ease',width:18,textAlign:'center',flexShrink:0 }}>{item.icon}</span>
              <span style={{ fontFamily:F.display,fontSize:12,fontWeight:isActive?700:500,color:isActive?C.primary:isHovered?C.secondary:C.muted,letterSpacing:0.5,flex:1,textAlign:'left',transition:'all 0.18s ease' }}>{item.label}</span>
              {count > 0 && (
                <span style={{ minWidth:18,height:18,borderRadius:9,background:'rgba(255,45,45,0.9)',color:'#fff',fontSize:10,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 5px',boxShadow:'0 0 10px rgba(255,45,45,0.5)',fontFamily:F.mono }}>{count}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div style={{ padding:'12px 12px 20px',borderTop:'1px solid rgba(100,150,255,0.10)' }}>
        <div style={{ display:'flex',alignItems:'center',gap:10,padding:'10px 14px',marginBottom:8,borderRadius:10,background:'rgba(79,163,255,0.05)',border:'1px solid rgba(100,150,255,0.10)' }}>
          <div style={{ width:32,height:32,borderRadius:'50%',background:'linear-gradient(135deg,rgba(79,163,255,0.4),rgba(100,50,255,0.3))',border:'1px solid rgba(79,163,255,0.4)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,boxShadow:'0 0 10px rgba(79,163,255,0.2)',flexShrink:0 }}>A</div>
          <div>
            <div style={{ fontFamily:F.display,fontSize:12,fontWeight:700,color:C.secondary,letterSpacing:1,textTransform:'uppercase' }}>Admin</div>
            <div style={{ fontFamily:F.mono,fontSize:9,color:C.muted }}>Supervisor · L5</div>
          </div>
        </div>
        <button
          onClick={onSignOut}
          style={{ width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:'10px 14px',borderRadius:10,background:'rgba(255,30,30,0.05)',border:'1px solid rgba(255,45,45,0.18)',color:'rgba(255,100,100,0.6)',fontSize:11,fontWeight:700,letterSpacing:1,cursor:'pointer',fontFamily:F.display,textTransform:'uppercase',transition:'all 0.18s ease' }}
          onMouseEnter={e => { e.currentTarget.style.background='rgba(255,30,30,0.12)'; e.currentTarget.style.borderColor='rgba(255,45,45,0.45)'; e.currentTarget.style.color='rgba(255,100,100,0.9)'; }}
          onMouseLeave={e => { e.currentTarget.style.background='rgba(255,30,30,0.05)'; e.currentTarget.style.borderColor='rgba(255,45,45,0.18)'; e.currentTarget.style.color='rgba(255,100,100,0.6)'; }}
        >
          <span style={{ fontSize:14 }}>⏻</span>
          Sign Out
        </button>
      </div>
      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </aside>
  );
}

/* ─── Top Status Bar ─────────────────────────────────────────────────── */
function TopBar({ alertCount, roleLabel, onSignOut }) {
  const [clock, setClock] = useState('');
  useEffect(() => {
    const tick = () => {
      const n = new Date();
      setClock(n.toLocaleTimeString('en-US', { hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit' }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const stats = [
    { icon:'⬡', label:'FLOORS', value:'8' },
    { icon:'◈', label:'HOTELS', value:'1' },
    { icon:'⬛', label:'ROOMS',  value:'96' },
  ];

  return (
    <header style={{ height:54,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 20px',background:C.glassBg,backdropFilter:'blur(20px)',borderBottom:`1px solid ${C.border}`,boxShadow:'0 2px 20px rgba(0,0,30,0.6)',zIndex:200,flexShrink:0 }}>
      <div style={{ display:'flex',alignItems:'center',gap:16 }}>
        <div style={{ display:'flex',alignItems:'center',gap:8,padding:'5px 14px',borderRadius:20,background:'rgba(0,255,136,0.08)',border:'1px solid rgba(0,255,136,0.20)',boxShadow:'0 0 12px rgba(0,255,136,0.08)' }}>
          <div style={{ width:7,height:7,borderRadius:'50%',background:'#00ff88',boxShadow:'0 0 8px #00ff88',animation:'pulse 1.8s ease-in-out infinite' }} />
          <span style={{ fontFamily:F.display,fontSize:10,fontWeight:700,color:'rgba(0,255,136,0.9)',letterSpacing:2,textTransform:'uppercase' }}>System Normal</span>
        </div>
        {alertCount > 0 && (
          <div style={{ display:'flex',alignItems:'center',gap:8,padding:'5px 14px',borderRadius:20,background:'rgba(255,45,45,0.08)',border:'1px solid rgba(255,45,45,0.30)',boxShadow:'0 0 12px rgba(255,45,45,0.12)' }}>
            <div style={{ width:7,height:7,borderRadius:'50%',background:'#ff2d2d',boxShadow:'0 0 8px #ff2d2d',animation:'pulse 0.8s ease-in-out infinite' }} />
            <span style={{ fontFamily:F.display,fontSize:10,fontWeight:700,color:'rgba(255,80,80,0.9)',letterSpacing:1,textTransform:'uppercase' }}>{alertCount} Alert{alertCount>1?'s':''}</span>
          </div>
        )}
        {roleLabel && (
          <div style={{ padding:'5px 14px',borderRadius:20,background:'rgba(0,210,255,0.08)',border:'1px solid rgba(0,210,255,0.20)' }}>
            <span style={{ fontFamily:F.mono,fontSize:10,fontWeight:700,color:'rgba(0,210,255,0.9)',letterSpacing:2,textTransform:'uppercase' }}>{roleLabel}</span>
          </div>
        )}
      </div>

      <div style={{ display:'flex',alignItems:'center',gap:2 }}>
        {stats.map(s => (
          <div key={s.label} style={{ display:'flex',alignItems:'center',gap:6,padding:'4px 14px',borderRadius:6,background:'rgba(79,163,255,0.04)',border:'1px solid rgba(100,150,255,0.08)' }}>
            <span style={{ fontSize:10,color:C.muted }}>{s.icon}</span>
            <span style={{ fontFamily:F.display,fontSize:9,fontWeight:600,color:C.muted,letterSpacing:1.5,textTransform:'uppercase' }}>{s.label}</span>
            <span style={{ fontFamily:F.mono,fontSize:14,fontWeight:700,color:C.accent,letterSpacing:1,textShadow:'0 0 10px rgba(79,163,255,0.5)' }}>{s.value}</span>
          </div>
        ))}
      </div>

      <div style={{ display:'flex',alignItems:'center',gap:16 }}>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontFamily:F.mono,fontSize:18,fontWeight:700,color:C.primary,letterSpacing:3,textShadow:'0 0 10px rgba(79,163,255,0.3)',lineHeight:1 }}>{clock}</div>
          <div style={{ fontFamily:F.mono,fontSize:9,color:C.muted,letterSpacing:2,marginTop:2 }}>{new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}).toUpperCase()}</div>
        </div>
        {onSignOut && (
          <button
            onClick={onSignOut}
            title="Sign Out"
            style={{ width:34,height:34,borderRadius:'50%',background:'linear-gradient(135deg,rgba(79,163,255,0.35),rgba(100,50,255,0.25))',border:'1.5px solid rgba(79,163,255,0.45)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,boxShadow:'0 0 14px rgba(79,163,255,0.25)',cursor:'pointer',color:C.primary }}
          >⏻</button>
        )}
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </header>
  );
}

/* ─── Guest Portal Shell ─────────────────────────────────────────────── */
function GuestPortal({ onLogout }) {
  return (
    <div style={{ display:'flex',flexDirection:'column',width:'100vw',height:'100vh',overflow:'hidden',background:'linear-gradient(135deg,#020408 0%,#050a1a 40%,#020612 100%)',fontFamily:F.display }}>
      <TopBar alertCount={0} roleLabel="GUEST SAFETY HUB" onSignOut={onLogout} />
      <main style={{ flex:1,overflow:'auto',padding:'32px' }}>
        <GuestDashboard onHighlightRoom={() => {}} />
      </main>
    </div>
  );
}

/* ─── DAF Portal Shell ───────────────────────────────────────────────── */
function DAFPortal({ onLogout }) {
  return (
    <div style={{ display:'flex',flexDirection:'column',width:'100vw',height:'100vh',overflow:'hidden',background:'linear-gradient(135deg,#020408 0%,#050a1a 40%,#020612 100%)',fontFamily:F.display }}>
      <TopBar alertCount={0} roleLabel="DAF TACTICAL UPLINK" onSignOut={onLogout} />
      <main style={{ flex:1,overflow:'auto',padding:'32px' }}>
        <DAFTeamView />
      </main>
    </div>
  );
}

/* ─── Admin Dashboard ────────────────────────────────────────────────── */
function AdminDashboard({ onLogout }) {
  const [activeView, setActiveView]     = useState('hotel3d');
  const [alertCount, setAlertCount]     = useState(0);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [alertCounts, setAlertCounts]   = useState({});
  const [evacuationPath, setEvacuationPath] = useState([]);
  const [dafToasts, setDafToasts]       = useState([]);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [roomStatuses, setRoomStatuses] = useState({});
  const [liveAlerts, setLiveAlerts]     = useState([]);
  const socketRef = useRef(null);

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

  function handleLogoutConfirm() {
    setShowLogoutModal(false);
    if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
    onLogout();
  }

  useEffect(() => {
    const socket = io(config.socketUrl, { path: config.socketPath });
    socketRef.current = socket;
    socket.on('connect', () => { socket.emit('admin:register'); });

    socket.on('hazards:init', (fullMap) => {
      Object.entries(fullMap).forEach(([roomId, { type }]) => {
        const id = String(roomId);
        setRoomStatuses(prev => ({ ...prev, [id]: type }));
        bus.emit('room:statusChange', { roomId: id, status: type });
      });
    });

    socket.on('hazards:update', (fullMap) => {
      setRoomStatuses(prev => {
        const next = { ...prev };
        Object.entries(fullMap).forEach(([roomId, { type }]) => {
          const id = String(roomId);
          next[id] = type;
          bus.emit('room:statusChange', { roomId: id, status: type });
        });
        Object.keys(next).forEach(id => {
          if (!fullMap[id] && next[id] !== 'clear') {
            next[id] = 'clear';
            bus.emit('room:statusChange', { roomId: id, status: 'clear' });
          }
        });
        return next;
      });
    });

    socket.on('detection:alert', (payload) => {
      const roomId = payload.roomId || payload.room_id || payload.room || payload.location?.roomId || 'unknown';
      const type   = payload.type || payload.alertType || payload.alert_type || '';
      const bucket = Math.floor(Date.now() / 1000);
      const fp     = `${type}__${roomId}__${bucket}`;
      if (_seenSocketEvents.has(fp)) return;
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
  }, []);

  useEffect(() => {
    const unsubNew = bus.on('alert:new', (alert) => {
      const active = getActiveAlerts();
      setAlertCount(active.length);
      setLiveAlerts([...active]);
      setAlertCounts(prev => ({
        ...prev,
        cameras: (prev.cameras || 0) + (CAMERA_ALERT_TYPES.has(alert.type) ? 1 : 0),
        hotel3d: (prev.hotel3d || 0) + 1,
      }));
    });

    const unsubResolved = bus.on('alert:resolved', ({ roomId }) => {
      const active = getActiveAlerts();
      setAlertCount(active.length);
      setLiveAlerts([...active]);
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
      if (roomId) setRoomStatuses(prev => ({ ...prev, [String(roomId)]: 'clear' }));
    });

    return () => { unsubNew(); unsubResolved(); unsubGuide(); unsubStatus(); unsubClear(); };
  }, []);

  const handleRoomClick     = useCallback((roomId) => { setSelectedRoom(roomId); setActiveView('cameras'); }, []);
  const handleHighlightRoom = useCallback((roomId) => { setSelectedRoom(roomId); setActiveView('hotel3d'); }, []);
  const handleAlertClick    = useCallback((alert)  => { setSelectedRoom(alert.location?.roomId); setActiveView('hotel3d'); }, []);
  const handleNavigate      = useCallback((view)   => { setActiveView(view); setAlertCounts(prev => ({ ...prev, [view]: 0 })); }, []);

  return (
    <div style={{ display:'flex',flexDirection:'column',width:'100vw',height:'100vh',overflow:'hidden',background:'linear-gradient(135deg,#020408 0%,#050a1a 40%,#020612 100%)',fontFamily:F.display }}>
      <TopBar alertCount={alertCount} />

      <div style={{ flex:1,display:'flex',overflow:'hidden',minHeight:0 }}>
        <Sidebar
          activeView={activeView}
          onNavigate={handleNavigate}
          alertCounts={alertCounts}
          onSignOut={() => setShowLogoutModal(true)}
        />

        <main style={{ flex:1,position:'relative',overflow:'hidden',minWidth:0 }}>
          {activeView === 'hotel3d' && (
            <HotelView3D
              onRoomClick={handleRoomClick}
              evacuationPath={evacuationPath}
              roomStatuses={roomStatuses}
            />
          )}
          {activeView === 'cameras' && <CameraGrid selectedRoom={selectedRoom} />}
          {activeView === 'guests'  && <GuestDashboard onHighlightRoom={handleHighlightRoom} />}
          {activeView === 'daf'     && <DAFTeamView />}
          {activeView === 'sensors' && <SensorSimPanel socket={socketRef.current} />}
        </main>

        <aside style={{ width:260,height:'100%',display:'flex',flexDirection:'column',background:'rgba(5,8,20,0.88)',backdropFilter:'blur(20px)',borderLeft:'1px solid rgba(100,150,255,0.15)',boxShadow:'-4px 0 40px rgba(0,0,50,0.5)',zIndex:100,flexShrink:0,overflow:'hidden' }}>
          <div style={{ padding:'16px 16px 12px',borderBottom:'1px solid rgba(100,150,255,0.12)',flexShrink:0 }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
              <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                <div style={{ width:7,height:7,borderRadius:'50%',background:alertCount>0?'#ff2d2d':'#00ff88',boxShadow:alertCount>0?'0 0 8px #ff2d2d':'0 0 8px #00ff88',animation:alertCount>0?'alertBlink 0.9s ease-in-out infinite':'none' }} />
                <span style={{ fontFamily:F.display,fontSize:11,fontWeight:700,color:'rgba(220,230,255,0.95)',letterSpacing:1.5,textTransform:'uppercase' }}>Live Alerts</span>
              </div>
              {alertCount > 0 && (
                <span style={{ padding:'2px 8px',borderRadius:10,background:'rgba(255,45,45,0.15)',border:'1px solid rgba(255,45,45,0.35)',fontFamily:F.mono,fontSize:11,fontWeight:800,color:'#ff4444' }}>{alertCount}</span>
              )}
            </div>
          </div>

          <div style={{ flex:1,overflow:'hidden',display:'flex',flexDirection:'column' }}>
            <AlertPanel onAlertClick={handleAlertClick} />
          </div>

          <div style={{ borderTop:'1px solid rgba(100,150,255,0.12)',padding:'14px 16px',flexShrink:0 }}>
            <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:11 }}>
              <span style={{ fontSize:13 }}>🏨</span>
              <span style={{ fontFamily:F.display,fontSize:10,fontWeight:700,color:'rgba(200,215,255,0.9)',letterSpacing:1.5,textTransform:'uppercase' }}>Overview</span>
            </div>
            {[
              { label:'Total Rooms', value:96,                                                                              color:'rgba(160,160,255,0.9)', bar:null      },
              { label:'On Fire',     value:Object.values(roomStatuses).filter(s=>s==='fire').length,                        color:'#ff4444',               bar:'#ff2d2d' },
              { label:'Smoke',       value:Object.values(roomStatuses).filter(s=>s==='smoke').length,                       color:'#ff8c42',               bar:'#ff6b1a' },
              { label:'Buffer',      value:Object.values(roomStatuses).filter(s=>s==='buffer').length,                      color:'#ffd700',               bar:'#ffd700' },
              { label:'Security',    value:Object.values(roomStatuses).filter(s=>s==='security').length,                    color:'#a78bfa',               bar:'#8b5cf6' },
              { label:'Medical',     value:Object.values(roomStatuses).filter(s=>s==='medical').length,                     color:'#22d3ee',               bar:'#06b6d4' },
              { label:'Clear',       value:96-Object.values(roomStatuses).filter(s=>s&&s!=='clear').length,                 color:'#00ff88',               bar:'#00ff88' },
            ].map((s,i,arr) => (
              <div key={s.label} style={{ display:'flex',alignItems:'center',gap:8,padding:'4px 0',borderBottom:i<arr.length-1?'1px solid rgba(255,255,255,0.035)':'none' }}>
                {s.bar ? <div style={{ width:7,height:7,borderRadius:2,flexShrink:0,background:s.bar,boxShadow:`0 0 5px ${s.bar}88` }} /> : <div style={{ width:7,height:7,flexShrink:0 }} />}
                <span style={{ fontFamily:F.display,fontSize:11,color:'rgba(150,170,220,0.55)',flex:1,whiteSpace:'nowrap' }}>{s.label}</span>
                {s.bar && s.value > 0 && (
                  <div style={{ width:32,height:3,borderRadius:2,background:'rgba(255,255,255,0.05)',overflow:'hidden',flexShrink:0 }}>
                    <div style={{ height:'100%',width:`${Math.min(100,(s.value/96)*100*6)}%`,background:s.bar,borderRadius:2,transition:'width 0.4s ease' }} />
                  </div>
                )}
                <span style={{ fontFamily:F.mono,fontSize:12,fontWeight:700,color:s.color,minWidth:20,textAlign:'right' }}>{s.value}</span>
              </div>
            ))}
          </div>
          <style>{`@keyframes alertBlink{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
        </aside>
      </div>

      {showLogoutModal && <LogoutModal onConfirm={handleLogoutConfirm} onCancel={() => setShowLogoutModal(false)} />}
      <DAFToast toasts={dafToasts} />
    </div>
  );
}

/* ─── Root App ───────────────────────────────────────────────────────── */
export default function App() {
  const [isSplashComplete, setIsSplashComplete] = useState(false);
  // null | 'admin' | 'guest' | 'daf'
  const [currentRole, setCurrentRole] = useState(null);

  useEffect(() => {
    if (!document.querySelector('link[href*="Inter"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = FONT_LINK;
      document.head.appendChild(link);
    }
  }, []);

  // 1. Splash
  if (!isSplashComplete) {
    return <SplashScreen onComplete={() => setIsSplashComplete(true)} />;
  }

  // 2. Landing / Login (shown when no role is set)
  if (!currentRole) {
    return (
      <LandingPage
        onAdminAuthSuccess={() => setCurrentRole('admin')}
        onGuestAuthSuccess={() => setCurrentRole('guest')}
        onDafAuthSuccess={() => setCurrentRole('daf')}
      />
    );
  }

  // 3. Role-specific dashboards
  const handleLogout = () => setCurrentRole(null);

  if (currentRole === 'admin') return <AdminDashboard onLogout={handleLogout} />;
  if (currentRole === 'guest') return <GuestPortal    onLogout={handleLogout} />;
  if (currentRole === 'daf')   return <DAFPortal      onLogout={handleLogout} />;

  return null;
}