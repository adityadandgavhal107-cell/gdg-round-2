import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import bus from './core/EventBus.js';
import HotelView3D from './views/HotelView3D.jsx';
import { findRescuePath } from './data/hotel.js';
import webRTCManager from './core/WebRTCManager.js';
import config from './core/config.js';

const TEAM_FALLBACK_CODES = {
  ALPHA:   '4821',
  BETA:    '9281',
  CHARLIE: '6512',
  DELTA:   '1104',
};

function resolveTeamFromOtp(otp) {
  const teams = ['ALPHA', 'BETA', 'CHARLIE', 'DELTA'];
  for (const team of teams) {
    const stored = localStorage.getItem(`daf_otp_${team.toLowerCase()}`);
    if (stored && stored === otp) return team;
  }
  for (const team of teams) {
    if (TEAM_FALLBACK_CODES[team] === otp) return team;
  }
  return null;
}

// ── PIP Camera ───────────────────────────────────────────────────────────────
function PIPCamera({ selectedIncident, liveStreams }) {
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
      background: '#000',
      border: `1px solid ${stream ? 'rgba(255,45,45,0.6)' : 'rgba(255,45,45,0.2)'}`,
      borderRadius: 12, overflow: 'hidden',
      boxShadow: stream
        ? '0 0 30px rgba(255,45,45,0.25), 0 20px 50px rgba(0,0,0,0.9)'
        : '0 20px 50px rgba(0,0,0,0.9)',
      zIndex: 100, transition: 'border-color 0.4s, box-shadow 0.4s',
    }}>
      <div style={{
        position: 'absolute', top: 10, left: 10, zIndex: 105, fontSize: 10,
        background: stream ? 'rgba(255,45,45,0.85)' : 'rgba(30,10,10,0.85)',
        color: '#fff', padding: '4px 8px', borderRadius: 4, fontWeight: 900,
        letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6,
        backdropFilter: 'blur(4px)',
      }}>
        <div style={{
          width: 6, height: 6,
          background: stream ? '#fff' : '#663333',
          borderRadius: '50%',
          animation: stream ? 'blink 1s infinite' : 'none',
        }} />
        {stream ? `LIVE: RM ${roomId}` : (roomId ? `NO SIGNAL — RM ${roomId}` : 'STANDBY')}
      </div>
      <video ref={videoRef} autoPlay playsInline muted
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: stream ? 'block' : 'none' }}
      />
      {!stream && (
        <div style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 10,
          background: 'repeating-linear-gradient(0deg,rgba(255,255,255,0.02) 0px,rgba(255,255,255,0.02) 1px,transparent 1px,transparent 4px)',
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

// ── Alert Banner ─────────────────────────────────────────────────────────────
function AlertBanner({ incidents }) {
  if (!incidents || incidents.length === 0) return null;
  const latest = incidents[0];
  const icon = latest.type === 'fire' ? '🔥' : latest.type === 'smoke' ? '💨' : '🔊';
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
      background: 'linear-gradient(90deg, #ff0000, #cc0000)',
      color: '#fff', padding: '10px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
      fontWeight: 900, fontSize: 14, letterSpacing: 2,
      animation: 'alertPulse 1s infinite',
      boxShadow: '0 4px 30px rgba(255,0,0,0.6)',
    }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      ⚠ ALERT: {latest.type.toUpperCase()} DETECTED — ROOM {latest.roomId}
      {incidents.length > 1 && (
        <span style={{ fontSize: 11, opacity: 0.85, marginLeft: 8 }}>
          (+{incidents.length - 1} more)
        </span>
      )}
      <span style={{ fontSize: 20 }}>{icon}</span>
    </div>
  );
}

// ── Main DAFApp ───────────────────────────────────────────────────────────────
export default function DAFApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [teamName, setTeamName]               = useState('');
  const [otp, setOtp]                         = useState('');
  const [error, setError]                     = useState('');

  const [activeIncidents, setActiveIncidents] = useState([]);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [rescuePath, setRescuePath]           = useState([]);
  const [distance, setDistance]               = useState(0);
  const [isCalculating, setIsCalculating]     = useState(false);

  const [socketConnected, setSocketConnected] = useState(false);
  const [liveStreams, setLiveStreams]          = useState({});
  const [clearingRooms, setClearingRooms]     = useState({}); // roomId → true while animating out

  // Keep a socket ref so clearZone can emit without prop drilling
  const socketRef = useRef(null);

  useEffect(() => {
    const savedTeam = localStorage.getItem('daf_team');
    if (savedTeam) { setTeamName(savedTeam); setIsAuthenticated(true); }
  }, []);

  // ── Socket + WebRTC ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;

    const socket = io(config.socketUrl, { path: config.socketPath });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      socket.emit('daf:register', { team: teamName });
      socket.emit('admin:register');
    });
    socket.on('disconnect', () => setSocketConnected(false));

    // ── Dedup set for incoming socket alerts ──────────────────────────────
    const _seen = new Set();

    function handleAlert(alert) {
      if (!alert || !alert.roomId) return;

      // Only show fire/smoke/audio in DAF tactical view
      // (medical/security go to admin HMS only)
      if (!['fire', 'smoke', 'audio'].includes(alert.type)) return;

      const roomId = String(alert.roomId);
      const fp = `${alert.type}__${roomId}__${Math.floor(Date.now() / 1000)}`;
      if (_seen.has(fp)) return;
      _seen.add(fp);
      setTimeout(() => _seen.delete(fp), 5000);

      const newInc = {
        ...alert,
        roomId,
        id: `inc_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      };

      setActiveIncidents(prev => {
        const exists = prev.find(i => i.roomId === roomId && i.type === alert.type);
        if (exists) return prev;
        bus.emit('room:statusChange', { roomId, status: alert.type });
        return [newInc, ...prev];
      });

      setSelectedIncident(prev => prev ?? newInc);
    }

    socket.on('detection:alert', handleAlert);
    socket.on('alert:escalate',  handleAlert);

    // ── Listen for admin (or another DAF tab) resolving an alert ─────────
    socket.on('alert:resolved', ({ roomId }) => {
      removeIncident(String(roomId));
    });

    // WebRTC
    if (!webRTCManager.isConnected()) webRTCManager.connect();
    webRTCManager.onStream((roomId, stream) => {
      setLiveStreams(prev => ({ ...prev, [roomId]: stream }));
    });
    webRTCManager.onDisconnect((roomId) => {
      setLiveStreams(prev => { const n = { ...prev }; delete n[roomId]; return n; });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      webRTCManager.disconnect();
    };
  }, [isAuthenticated, teamName]);

  // ── Remove incident with fade animation ──────────────────────────────────
  function removeIncident(roomId) {
    setClearingRooms(prev => ({ ...prev, [roomId]: true }));

    setTimeout(() => {
      setActiveIncidents(prev => {
        const remaining = prev.filter(i => i.roomId !== roomId);
        return remaining;
      });
      setSelectedIncident(prev => {
        if (prev?.roomId !== roomId) return prev;
        // Auto-select next available incident, or null
        return null;
      });
      setClearingRooms(prev => { const n = { ...prev }; delete n[roomId]; return n; });

      // Clear the room highlight on the 3D map
      bus.emit('room:statusChange', { roomId, status: 'clear' });
    }, 400);
  }

  // ── Clear Zone — called from DAF incident card ────────────────────────────
  function clearZone(inc) {
    const roomId = String(inc.roomId);

    // 1. Tell the server — it will broadcast alert:resolved to ALL clients (admin + other DAF tabs)
    if (socketRef.current?.connected) {
      socketRef.current.emit('alert:resolved', { roomId, clearedBy: teamName });
    }

    // 2. Also emit locally so AlertEngine + HMS AlertPanel update instantly
    bus.emit('alert:resolved', { roomId });

    // 3. Animate out the card
    removeIncident(roomId);
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  const startNavigation = useCallback((incident) => {
    if (!incident?.roomId) return;
    setIsCalculating(true);
    setSelectedIncident(incident);
    setTimeout(() => {
      const path = findRescuePath(String(incident.roomId), 'EXIT_LEFT') || [];
      setRescuePath(path);
      setDistance((path.length || 0) * 4.5);
      setIsCalculating(false);
      bus.emit('notification', {
        msg: `📍 TACTICAL ROUTE GENERATED TO ROOM ${incident.roomId}`,
        type: 'warning',
      });
    }, 600);
  }, []);

  useEffect(() => {
    if (selectedIncident) startNavigation(selectedIncident);
  }, [selectedIncident?.id]); // eslint-disable-line

  // Auto-select next incident if selected one was cleared
  useEffect(() => {
    if (!selectedIncident && activeIncidents.length > 0) {
      setSelectedIncident(activeIncidents[0]);
    }
  }, [activeIncidents, selectedIncident]);

  // ── Login ─────────────────────────────────────────────────────────────────
  const handleLogin = (e) => {
    e.preventDefault();
    const matched = resolveTeamFromOtp(otp);
    if (!matched) { setError('INVALID AUTHORIZATION CODE'); return; }
    localStorage.setItem('daf_team', matched);
    setTeamName(matched);
    setError('');
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('daf_team');
    setIsAuthenticated(false);
    setTeamName('');
    setActiveIncidents([]);
    setSelectedIncident(null);
    setRescuePath([]);
  };

  const alertRoomIds = activeIncidents.map(i => String(i.roomId));

  // ── Login screen ──────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0a0505',
        backgroundImage: 'radial-gradient(circle at center, #1a0a0a 0%, #050000 100%)',
        color: '#fff', textAlign: 'center', fontFamily: 'Inter, sans-serif',
      }}>
        <div style={{
          padding: 40, width: 400,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,45,45,0.2)',
          borderRadius: 16,
          boxShadow: '0 0 40px rgba(255,0,0,0.1)',
        }}>
          <div style={{ fontSize: 50, marginBottom: 20 }}>🚒</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: 2, marginBottom: 8, color: '#ff2d2d' }}>
            DAF TACTICAL
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 30, textTransform: 'uppercase', letterSpacing: 1 }}>
            Authorized Personnel Only
          </p>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ textAlign: 'left' }}>
              <label style={{ fontSize: 10, color: '#ff2d2d', fontWeight: 800, marginBottom: 6, display: 'block', letterSpacing: 1 }}>
                TEAM AUTH CODE (4-DIGIT OTP)
              </label>
              <input
                type="password" maxLength={4} value={otp}
                onChange={e => setOtp(e.target.value)} autoFocus
                style={{
                  width: '100%', background: 'rgba(255,255,255,0.03)',
                  border: '1px solid #330000', padding: '16px', borderRadius: 8,
                  fontSize: 32, textAlign: 'center', letterSpacing: 16,
                  color: '#ff2d2d', fontFamily: 'JetBrains Mono, monospace',
                  boxSizing: 'border-box',
                }}
                placeholder="••••"
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 4 }}>
              {['ALPHA', 'BETA', 'CHARLIE', 'DELTA'].map(team => {
                const hasCode = !!localStorage.getItem(`daf_otp_${team.toLowerCase()}`);
                return (
                  <div key={team} style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 800,
                    background: hasCode ? 'rgba(0,255,136,0.05)' : 'rgba(255,45,45,0.05)',
                    border: `1px solid ${hasCode ? 'rgba(0,255,136,0.2)' : 'rgba(255,45,45,0.1)'}`,
                    color: hasCode ? '#00ff88' : 'rgba(255,255,255,0.2)',
                    letterSpacing: 1,
                  }}>
                    {team} {hasCode ? '● ACTIVE' : '○ NO CODE'}
                  </div>
                );
              })}
            </div>
            {error && <div style={{ fontSize: 11, color: '#ff2d2d', fontWeight: 700 }}>⚠️ {error}</div>}
            <button type="submit" style={{
              background: '#ff2d2d', color: '#fff', border: 'none', padding: '16px',
              borderRadius: 8, fontWeight: 800, letterSpacing: 1.5, cursor: 'pointer',
              marginTop: 10,
            }}>
              INITIATE SESSION
            </button>
          </form>
          <p style={{ marginTop: 24, fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>
            CODES GENERATED AT ADMIN CENTER → DAF SECTION
          </p>
        </div>
      </div>
    );
  }

  // ── Main tactical dashboard ───────────────────────────────────────────────
  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      background: '#0a0505', color: '#fff', fontFamily: 'Inter, sans-serif',
    }}>
      <AlertBanner incidents={activeIncidents} />

      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        marginTop: activeIncidents.length > 0 ? 44 : 0,
        transition: 'margin-top 0.3s',
      }}>
        {isCalculating && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(255,45,45,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
            backdropFilter: 'blur(2px)',
          }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#ff2d2d', letterSpacing: 5, animation: 'blink 0.5s infinite' }}>
              [[ RUNNING TACTICAL SCAN... ]]
            </div>
          </div>
        )}

        {/* Header */}
        <header style={{
          padding: '16px 24px', background: 'rgba(26,10,10,0.95)',
          borderBottom: '1px solid rgba(255,45,45,0.2)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 100,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 24 }}>🚒</div>
            <div>
              <h1 style={{ fontSize: 16, fontWeight: 900, margin: 0, letterSpacing: 1.5, color: '#ff2d2d' }}>
                DAF COMMAND CENTER
              </h1>
              <div style={{
                display: 'inline-block', marginTop: 3,
                padding: '2px 10px', borderRadius: 4,
                background: 'rgba(255,45,45,0.15)',
                border: '1px solid rgba(255,45,45,0.4)',
                fontSize: 10, fontWeight: 900, color: '#ff6666', letterSpacing: 2,
              }}>
                TEAM {teamName}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: socketConnected ? '#00ff88' : '#ff2d2d',
                  boxShadow: socketConnected ? '0 0 8px #00ff88' : 'none',
                }} />
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>
                  {socketConnected ? 'TACTICAL LINK ACTIVE' : 'LINK DISCONNECTED'}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            <div className="tactical-stat">
              <div className="label">ACTIVE FIRE</div>
              <div className="val">{activeIncidents.filter(i => i.type === 'fire').length}</div>
            </div>
            <div className="tactical-stat">
              <div className="label">ACTIVE SMOKE</div>
              <div className="val">{activeIncidents.filter(i => i.type === 'smoke').length}</div>
            </div>
            <div className="tactical-stat">
              <div className="label">EST. RANGE</div>
              <div className="val">{distance > 0 ? `${distance}M` : '---'}</div>
            </div>
            <button onClick={handleLogout} style={{
              padding: '6px 14px', background: 'transparent',
              border: '1px solid rgba(255,45,45,0.3)', borderRadius: 6,
              color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700,
              cursor: 'pointer', letterSpacing: 1,
            }}>
              LOGOUT
            </button>
          </div>
        </header>

        {/* Body */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Left: hazard list */}
          <aside style={{
            width: 340, background: '#110808',
            borderRight: '1px solid rgba(255,45,45,0.1)',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              padding: '16px 20px', fontSize: 12, fontWeight: 900,
              color: '#ff2d2d', borderBottom: '1px solid rgba(255,45,45,0.1)', letterSpacing: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>
                ⚠️ PRIORITY HAZARDS
                {activeIncidents.length > 0 && (
                  <span style={{
                    marginLeft: 8, background: '#ff2d2d', color: '#fff',
                    borderRadius: '50%', width: 18, height: 18, fontSize: 10,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 900,
                  }}>
                    {activeIncidents.length}
                  </span>
                )}
              </span>
              {/* Clear all button */}
              {activeIncidents.length > 0 && (
                <button
                  onClick={() => activeIncidents.forEach(i => clearZone(i))}
                  style={{
                    background: 'rgba(0,255,136,0.08)',
                    border: '1px solid rgba(0,255,136,0.25)',
                    borderRadius: 4, color: '#00ff88',
                    fontSize: 9, fontWeight: 800, padding: '3px 8px',
                    cursor: 'pointer', letterSpacing: 0.5,
                  }}
                >
                  ✓ CLEAR ALL
                </button>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {activeIncidents.length === 0 ? (
                <div style={{
                  textAlign: 'center', color: 'rgba(0,255,136,0.6)',
                  marginTop: 40, fontSize: 12, fontWeight: 700, letterSpacing: 1,
                }}>
                  <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.5 }}>✅</div>
                  ALL ZONES CLEAR
                </div>
              ) : activeIncidents.map(inc => {
                const isClearing = clearingRooms[inc.roomId];
                return (
                  <div
                    key={inc.id}
                    onClick={() => !isClearing && startNavigation(inc)}
                    style={{
                      padding: 14, borderRadius: 8,
                      background: selectedIncident?.roomId === inc.roomId
                        ? 'rgba(255,45,45,0.1)' : 'rgba(255,45,45,0.03)',
                      border: `1px solid ${selectedIncident?.roomId === inc.roomId ? '#ff2d2d' : 'rgba(255,45,45,0.25)'}`,
                      cursor: isClearing ? 'default' : 'pointer',
                      transition: 'all 0.2s',
                      boxShadow: selectedIncident?.roomId === inc.roomId
                        ? '0 0 15px rgba(255,45,45,0.2)' : 'none',
                      animation: isClearing ? 'none' : 'incidentPulse 2s infinite',
                      // Fade-out animation when clearing
                      opacity: isClearing ? 0 : 1,
                      transform: isClearing ? 'translateX(-20px)' : 'translateX(0)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: 0.5 }}>
                        {inc.type === 'fire' ? '🔥' : inc.type === 'smoke' ? '💨' : '🔊'} RM {inc.roomId}
                      </div>
                      <div style={{
                        fontSize: 9,
                        background: inc.type === 'fire' ? '#ff2d2d' : inc.type === 'smoke' ? '#ff8800' : '#ffd700',
                        padding: '3px 8px', borderRadius: 4, fontWeight: 900, letterSpacing: 0.5,
                        color: inc.type === 'audio' ? '#000' : '#fff',
                        flexShrink: 0,
                      }}>
                        {(inc.severity || 'HIGH').toUpperCase()}
                      </div>
                    </div>

                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 6, fontFamily: 'JetBrains Mono' }}>
                      SENSOR: {inc.type.toUpperCase()} / {Math.round((inc.confidence || 0.85) * 100)}% CONF
                    </div>

                    {/* Two action buttons: Navigate + Clear Zone */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                      <button
                        onClick={e => { e.stopPropagation(); startNavigation(inc); }}
                        style={{
                          flex: 1, padding: '10px',
                          background: selectedIncident?.roomId === inc.roomId ? '#fff' : '#ff2d2d',
                          border: 'none', borderRadius: 6,
                          color: selectedIncident?.roomId === inc.roomId ? '#ff2d2d' : '#fff',
                          fontSize: 11, fontWeight: 900, cursor: 'pointer', transition: '0.2s',
                        }}
                      >
                        {selectedIncident?.roomId === inc.roomId ? '✓ NAVIGATING' : 'NAVIGATE'}
                      </button>

                      {/* CLEAR ZONE — marks incident as resolved */}
                      <button
                        onClick={e => { e.stopPropagation(); clearZone(inc); }}
                        style={{
                          flex: 1, padding: '10px',
                          background: 'rgba(0,255,136,0.1)',
                          border: '1px solid rgba(0,255,136,0.35)',
                          borderRadius: 6,
                          color: '#00ff88',
                          fontSize: 11, fontWeight: 900, cursor: 'pointer', transition: '0.2s',
                          letterSpacing: 0.5,
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,255,136,0.2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,255,136,0.1)'}
                      >
                        ✓ CLEAR ZONE
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>

          {/* Center: 3D map */}
          <main style={{ flex: 1, position: 'relative' }}>
            <HotelView3D
              evacuationPath={rescuePath}
              isRescueMode={true}
              focusRoomId={selectedIncident?.roomId}
              alertRooms={alertRoomIds}
            />

            {/* Rescue HUD */}
            {selectedIncident && !isCalculating && (
              <div style={{
                position: 'absolute', top: 20, right: 20, width: 300,
                background: 'rgba(10,5,5,0.92)', border: '1px solid #ff2d2d', borderRadius: 12,
                padding: 20, backdropFilter: 'blur(10px)', zIndex: 10,
                boxShadow: '0 10px 40px rgba(0,0,0,0.8)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 900, color: '#ff2d2d', letterSpacing: 2 }}>📍 RESCUE HUD</div>
                  <div style={{ fontSize: 9, color: '#00ff88', fontWeight: 800 }}>LIVE PATH ACTIVE</div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>TARGET:</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>ROOM {selectedIncident.roomId}</div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>ESTIMATED DISTANCE:</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#ff2d2d' }}>{distance} METERS</div>
                </div>
                <div style={{ height: 1, background: 'rgba(255,45,45,0.15)', margin: '16px 0' }} />
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, fontFamily: 'JetBrains Mono', wordBreak: 'break-all' }}>
                  <span style={{ color: '#ff2d2d' }}>PATH &gt;&gt; </span>
                  {(rescuePath || []).join(' ➔ ')}
                </div>
                {/* HUD clear button */}
                <button
                  onClick={() => clearZone(selectedIncident)}
                  style={{
                    width: '100%', marginTop: 16, padding: '10px',
                    background: 'rgba(0,255,136,0.1)',
                    border: '1px solid rgba(0,255,136,0.35)',
                    borderRadius: 6, color: '#00ff88',
                    fontSize: 11, fontWeight: 900, cursor: 'pointer',
                    letterSpacing: 1,
                  }}
                >
                  ✓ CLEAR ZONE — MARK RESOLVED
                </button>
              </div>
            )}

            <PIPCamera selectedIncident={selectedIncident} liveStreams={liveStreams} />
          </main>
        </div>
      </div>

      <style>{`
        @keyframes blink          { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes alertPulse     { 0%,100%{opacity:1} 50%{opacity:0.85} }
        @keyframes incidentPulse  { 0%,100%{box-shadow:0 0 0 rgba(255,45,45,0)} 50%{box-shadow:0 0 12px rgba(255,45,45,0.3)} }

        .tactical-stat { padding: 4px 20px; border-left: 1px solid rgba(255,45,45,0.2); }
        .tactical-stat .label { font-size: 8px; color: rgba(255,255,255,0.3); font-weight: 900; letter-spacing: 1px; margin-bottom: 2px; }
        .tactical-stat .val   { font-size: 20px; font-weight: 900; color: #ff2d2d; font-family:'JetBrains Mono'; letter-spacing: 1px; }

        aside::-webkit-scrollbar       { width: 4px; }
        aside::-webkit-scrollbar-track { background: transparent; }
        aside::-webkit-scrollbar-thumb { background: #331111; border-radius: 2px; }
      `}</style>
    </div>
  );
}