import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import bus from './core/EventBus.js';
import HotelView3D from './views/HotelView3D.jsx';
import { findRescuePath } from './data/hotel.js';
import webRTCManager from './core/WebRTCManager.js';
import config from './core/config.js';

// ── PIP Camera Component ────────────────────────────────────────────────────
function PIPCamera({ selectedIncident, liveStreams, pipVideoRef }) {
  const videoRef = useRef(null);
  const roomId = selectedIncident?.roomId;
  const stream = roomId ? liveStreams[roomId] : null;

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (stream) {
      vid.srcObject = stream;
      vid.play().catch(() => {});
    } else {
      vid.srcObject = null;
    }
  }, [stream]);

  return (
    <div style={{
      position: 'absolute', bottom: 20, left: 20, width: 280, aspectRatio: '16/9',
      background: '#000', border: `1px solid ${stream ? 'rgba(255,45,45,0.6)' : 'rgba(255,45,45,0.2)'}`,
      borderRadius: 12, overflow: 'hidden',
      boxShadow: stream ? '0 0 30px rgba(255,45,45,0.25), 0 20px 50px rgba(0,0,0,0.9)' : '0 20px 50px rgba(0,0,0,0.9)',
      zIndex: 100, transition: 'border-color 0.4s, box-shadow 0.4s'
    }}>
      {/* Status badge */}
      <div style={{
        position: 'absolute', top: 10, left: 10, zIndex: 105, fontSize: 10,
        background: stream ? 'rgba(255,45,45,0.85)' : 'rgba(30,10,10,0.85)',
        color: '#fff', padding: '4px 8px', borderRadius: 4, fontWeight: 900,
        letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6,
        backdropFilter: 'blur(4px)'
      }}>
        <div style={{
          width: 6, height: 6, background: stream ? '#fff' : '#663333',
          borderRadius: '50%', animation: stream ? 'blink 1s infinite' : 'none'
        }} />
        {stream ? `LIVE: RM ${roomId}` : (roomId ? `NO SIGNAL — RM ${roomId}` : 'STANDBY')}
      </div>

      {/* Live video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: '100%', height: '100%', objectFit: 'cover',
          display: stream ? 'block' : 'none'
        }}
      />

      {/* No-signal fallback */}
      {!stream && (
        <div style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 10,
          background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 4px)'
        }}>
          <div style={{ fontSize: 28, opacity: 0.18 }}>📡</div>
          <div style={{ fontSize: 9, color: '#443333', fontWeight: 900, letterSpacing: 3 }}>
            {roomId ? 'CAMERA OFFLINE' : 'NO SIGNAL INPUT'}
          </div>
          {roomId && (
            <div style={{ fontSize: 9, color: '#553333', fontFamily: 'JetBrains Mono', marginTop: 2 }}>
              /cam.html?room={roomId}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const DAF_MASTER_CODE = '1337';

export default function DAFApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [activeIncidents, setActiveIncidents] = useState([]);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [rescuePath, setRescuePath] = useState([]);
  const [socketConnected, setSocketConnected] = useState(false);
  const [liveStreams, setLiveStreams] = useState({});

  useEffect(() => {
    if (!isAuthenticated) return;

    const socket = io(config.socketUrl, { path: config.socketPath });

    socket.on('connect', () => {
      setSocketConnected(true);
      socket.emit('admin:register'); // DAF acts as an admin for data
    });

    socket.on('detection:alert', (alert) => {
      if (!alert || !alert.roomId) return;
      if (['fire', 'smoke', 'audio'].includes(alert.type)) {
        setActiveIncidents(prev => {
          const idStr = String(alert.roomId);
          if (prev.find(i => String(i.roomId) === idStr && i.type === alert.type)) return prev;
          return [{ ...alert, roomId: idStr, id: `inc_${Date.now()}` }, ...prev];
        });
      }
    });

    socket.on('alert:escalate', (data) => {
      if (!data || !data.roomId) return;
      setActiveIncidents(prev => {
        const idStr = String(data.roomId);
        if (prev.find(i => String(i.roomId) === idStr && i.type === data.type)) return prev;
        return [{ ...data, roomId: idStr, id: `inc_${Date.now()}` }, ...prev];
      });
    });

    // WebRTC: receive live streams — guard against re-connecting on re-auth
    if (!webRTCManager.isConnected()) {
      webRTCManager.connect();
    }

    webRTCManager.onStream((roomId, stream) => {
      setLiveStreams(prev => ({ ...prev, [roomId]: stream }));
    });

    webRTCManager.onDisconnect((roomId) => {
      setLiveStreams(prev => { const n = { ...prev }; delete n[roomId]; return n; });
    });

    return () => {
      socket.disconnect();
      webRTCManager.disconnect();
    };
  }, [isAuthenticated]);

  const handleLogin = (e) => {
    e.preventDefault();
    const storedOtp = localStorage.getItem('daf_tactical_otp') || DAF_MASTER_CODE;
    if (otp === storedOtp) {
      setIsAuthenticated(true);
      setError('');
    } else {
      setError('INVALID AUTHORIZATION CODE');
    }
  };

  const [isCalculating, setIsCalculating] = useState(false);
  const [distance, setDistance] = useState(0);

  const startNavigation = useCallback((incident) => {
    if (!incident || !incident.roomId) return;
    setIsCalculating(true);
    setSelectedIncident(incident);

    // Artificial delay for "tactical scan" feel
    setTimeout(() => {
      const path = findRescuePath(String(incident.roomId), 'EXIT_LEFT') || [];
      setRescuePath(path);
      setDistance((path.length || 0) * 4.5); // 4.5 meters per node avg
      setIsCalculating(false);
      bus.emit('notification', { msg: `📍 TACTICAL ROUTE GENERATED TO ROOM ${incident.roomId}`, type: 'warning' });
    }, 600);
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="daf-login-gate" style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0a0505', backgroundImage: 'radial-gradient(circle at center, #1a0a0a 0%, #050000 100%)',
        color: '#fff', textAlign: 'center', fontFamily: 'Inter, sans-serif'
      }}>
        <div className="glass-card" style={{ padding: 40, width: 400, border: '1px solid rgba(255,45,45,0.2)', boxShadow: '0 0 40px rgba(255,0,0,0.1)' }}>
          <div style={{ fontSize: 50, marginBottom: 20 }}>🚒</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: 2, marginBottom: 8, color: '#ff2d2d' }}>DAF TACTICAL</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 30, textTransform: 'uppercase', letterSpacing: 1 }}>Authorized Personnel Only</p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ textAlign: 'left' }}>
              <label style={{ fontSize: 10, color: '#ff2d2d', fontWeight: 800, marginBottom: 6, display: 'block', letterSpacing: 1 }}>RESCUE AUTH CODE (OTP)</label>
              <input
                type="password"
                maxLength={4}
                value={otp}
                onChange={e => setOtp(e.target.value)}
                autoFocus
                style={{
                  width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid #330000',
                  padding: '16px', borderRadius: 8, fontSize: 32, textAlign: 'center',
                  letterSpacing: 16, color: '#ff2d2d', fontFamily: 'JetBrains Mono, monospace'
                }}
                placeholder="••••"
              />
            </div>
            {error && <div style={{ fontSize: 11, color: '#ff2d2d', fontWeight: 700 }}>⚠️ {error}</div>}
            <button type="submit" style={{
              background: '#ff2d2d', color: '#fff', border: 'none', padding: '16px',
              borderRadius: 8, fontWeight: 800, letterSpacing: 1.5, cursor: 'pointer', transition: '0.2s', marginTop: 10
            }}>INITIATE SESSION</button>
          </form>
          <p style={{ marginTop: 24, fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>CODE AVAILABLE AT ADMIN CENTER - DAF SECTION</p>
        </div>
      </div>
    );
  }

  return (
    <div className="daf-app" style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0a0505', color: '#fff', fontFamily: 'Inter, sans-serif' }}>

      {/* Tactical Scanning Overlay */}
      {isCalculating && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(255,45,45,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
          backdropFilter: 'blur(2px)'
        }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#ff2d2d', letterSpacing: 5, animation: 'blink 0.5s infinite' }}>
            [[ RUNNING TACTICAL SCAN... ]]
          </div>
        </div>
      )}

      {/* Tactical Header */}
      <header style={{
        padding: '16px 24px', background: 'rgba(26, 10, 10, 0.95)', borderBottom: '1px solid rgba(255,45,45,0.2)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 24 }}>🚒</div>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 900, margin: 0, letterSpacing: 1.5, color: '#ff2d2d' }}>DAF COMMAND CENTER</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: socketConnected ? '#00ff88' : '#ff2d2d', boxShadow: socketConnected ? '0 0 8px #00ff88' : 'none' }} />
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>
                {socketConnected ? 'TACTICAL LINK ACTIVE' : 'LINK DISCONNECTED'}
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          <div className="tactical-stat">
            <div className="label">ACTIVE FIRE</div>
            <div className="val">{(activeIncidents || []).filter(i => i.type === 'fire').length}</div>
          </div>
          <div className="tactical-stat">
            <div className="label">EST. RANGE</div>
            <div className="val">{distance > 0 ? `${distance}M` : '---'}</div>
          </div>
          <div className="tactical-stat">
            <div className="label">TEAMS ON-FLOOR</div>
            <div className="val">04</div>
          </div>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left Panel: Active Hazards */}
        <aside style={{ width: 340, background: '#110808', borderRight: '1px solid rgba(255,45,45,0.1)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 20px', fontSize: 12, fontWeight: 900, color: '#ff2d2d', borderBottom: '1px solid rgba(255,45,45,0.1)', letterSpacing: 1 }}>
            ⚠️ PRIORITY HAZARDS
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(!activeIncidents || activeIncidents.length === 0) ? (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)', marginTop: 40, fontSize: 12 }}>
                NO ACTIVE HAZARDS DETECTED
              </div>
            ) : (activeIncidents || []).map(inc => (
              <div key={inc.id} style={{
                padding: 14, borderRadius: 8, background: 'rgba(255,45,45,0.03)',
                border: `1px solid ${selectedIncident?.roomId === inc.roomId ? '#ff2d2d' : 'rgba(255,45,45,0.15)'}`,
                cursor: 'pointer', transition: '0.2s',
                boxShadow: selectedIncident?.roomId === inc.roomId ? '0 0 15px rgba(255,45,45,0.1)' : 'none'
              }} onClick={() => startNavigation(inc)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: 0.5 }}>{(inc.type || 'fire') === 'fire' ? '🔥' : '💨'} RM {inc.roomId || '??'}</div>
                  <div style={{ fontSize: 9, background: (inc.type || 'fire') === 'fire' ? '#ff2d2d' : '#ff8800', padding: '3px 8px', borderRadius: 4, fontWeight: 900, letterSpacing: 0.5 }}>{(inc.severity || 'high').toUpperCase()}</div>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 6, fontFamily: 'JetBrains Mono' }}>
                  SENSORS: {(inc.type || 'fire').toUpperCase()} / {Math.round((inc.confidence || 0.5) * 100)}% CONF
                </div>
                <button style={{
                  width: '100%', marginTop: 12, padding: '10px', background: selectedIncident?.roomId === inc.roomId ? '#fff' : '#ff2d2d',
                  border: 'none', borderRadius: 6, color: selectedIncident?.roomId === inc.roomId ? '#ff2d2d' : '#fff',
                  fontSize: 11, fontWeight: 900, cursor: 'pointer', transition: '0.2s'
                }}>
                  {selectedIncident?.roomId === inc.roomId ? 'NAVIGATING...' : 'NAVIGATE TO ZONE'}
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* Center: 3D Tactical Map */}
        <main style={{ flex: 1, position: 'relative' }}>
          <HotelView3D
            evacuationPath={rescuePath}
            isRescueMode={true}
            focusRoomId={selectedIncident?.roomId}
          />

          {/* Rescue HUD overlay */}
          {selectedIncident && !isCalculating && (
            <div style={{
              position: 'absolute', top: 20, right: 20, width: 300,
              background: 'rgba(10, 5, 5, 0.9)', border: '1px solid #ff2d2d', borderRadius: 12,
              padding: 20, backdropFilter: 'blur(10px)', zIndex: 10,
              boxShadow: '0 10px 40px rgba(0,0,0,0.8)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 900, color: '#ff2d2d', letterSpacing: 2 }}>📍 RESCUE HUD</div>
                <div style={{ fontSize: 9, color: '#00ff88', fontWeight: 800 }}>LIVE PATH ACTIVE</div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>TACTICAL TARGET:</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>ROOM {selectedIncident.roomId}</div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>ESTIMATED DISTANCE:</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#ff2d2d' }}>{distance} METERS</div>
              </div>
              <div style={{ height: 1, background: 'rgba(255,45,45,0.15)', margin: '16px 0' }} />
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, fontFamily: 'JetBrains Mono' }}>
                <span style={{ color: '#ff2d2d' }}>{'PATH >> '}</span> {(rescuePath || []).join(' ➔ ')}
              </div>
            </div>
          )}

          {/* PIP Camera — Live WebRTC Feed */}
          <PIPCamera
            selectedIncident={selectedIncident}
            liveStreams={liveStreams}
          />
        </main>
      </div>

      <style>{`
        @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }
        .tactical-stat { padding: 4px 20px; border-left: 1px solid rgba(255,45,45,0.2); }
        .tactical-stat .label { font-size: 8px; color: rgba(255,255,255,0.3); font-weight: 900; letter-spacing: 1px; margin-bottom: 2px; }
        .tactical-stat .val { font-size: 20px; font-weight: 900; color: #ff2d2d; font-family: 'JetBrains Mono'; letter-spacing: 1px; }
        
        .daf-login-gate input:focus {
           outline: none;
           border-color: #ff2d2d !important;
           box-shadow: 0 0 25px rgba(255,45,45,0.4);
        }
        
        aside::-webkit-scrollbar { width: 4px; }
        aside::-webkit-scrollbar-track { background: transparent; }
        aside::-webkit-scrollbar-thumb { background: #331111; border-radius: 2px; }
      `}</style>
    </div>
  );
}
