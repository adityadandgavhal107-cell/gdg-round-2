import { useState, useEffect, useRef } from 'react';
import { findEvacuationPath } from '../data/hotel.js';

// ── Sensor position layout ────────────────────────────────────────────────────
// 3 sensors per floor across 3 floors. One real (Arduino on COM3), rest simulated.
const ARDUINO_ROOM_ID = '101'; // Real sensor room — matches server.js config

const SENSOR_LAYOUT = [
  {
    floor: 1,
    sensors: [
      { roomId: '101', label: 'Center', isReal: true },
      { roomId: '106', label: 'East',   isReal: false },
      { roomId: '107', label: 'West',   isReal: false },
    ],
  },
  {
    floor: 2,
    sensors: [
      { roomId: '201', label: 'Center', isReal: false },
      { roomId: '206', label: 'East',   isReal: false },
      { roomId: '207', label: 'West',   isReal: false },
    ],
  },
  {
    floor: 3,
    sensors: [
      { roomId: '301', label: 'Center', isReal: false },
      { roomId: '306', label: 'East',   isReal: false },
      { roomId: '307', label: 'West',   isReal: false },
    ],
  },
];

const STATUS_META = {
  fire:   { label: '🔥 FIRE',   bg: 'rgba(255,45,45,0.18)',  border: '#ff2d2d', text: '#ff6666' },
  smoke:  { label: '💨 SMOKE',  bg: 'rgba(255,107,26,0.18)', border: '#ff6b1a', text: '#ff9966' },
  clear:  { label: '✅ CLEAR',  bg: 'rgba(0,255,136,0.12)',  border: '#00ff88', text: '#00ff88' },
  normal: { label: '🟢 NORMAL', bg: 'rgba(0,255,136,0.06)',  border: 'rgba(0,255,136,0.25)', text: 'rgba(0,255,136,0.6)' },
};

export default function SensorSimPanel({ socket }) {
  // sensorStates: { [roomId]: 'normal' | 'fire' | 'smoke' | 'clear' }
  const [sensorStates, setSensorStates]       = useState({});
  const [arduinoStatus, setArduinoStatus]     = useState('connecting'); // connecting | connected | offline | error
  const [arduinoFeed, setArduinoFeed]         = useState([]);           // last 12 raw lines
  const [activePaths, setActivePaths]         = useState({});           // { [roomId]: string[] }
  const [activeHazards, setActiveHazards]     = useState({});           // server hazard map
  const [expandedFloors, setExpandedFloors]   = useState({ 1: true, 2: true, 3: true });

  const feedRef = useRef(null);

  // Web Serial API states/refs
  const [isWebConnected, setIsWebConnected]   = useState(false);
  const webPortRef = useRef(null);
  const webReaderRef = useRef(null);

  // Helper helper to parse Arduino serial messages
  const parseArduinoLine = (line) => {
    const l = line.trim();
    if (l.includes('FIRE DETECTED'))  return 'fire';
    if (l.includes('SMOKE DETECTED')) return 'smoke';
    return 'normal';
  };

  // ── Web Serial API Connection handlers ──────────────────────────────────────
  const connectWebSerial = async () => {
    if (!('serial' in navigator)) {
      alert('Web Serial API is not supported in this browser. Please use Chrome, Edge, or Opera.');
      return;
    }

    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600 });
      webPortRef.current = port;
      setIsWebConnected(true);
      setArduinoStatus('connected');

      const textDecoder = new TextDecoderStream();
      port.readable.pipeTo(textDecoder.writable).catch(err => {
        console.error('Web Serial stream pipe error:', err);
      });
      const reader = textDecoder.readable.getReader();
      webReaderRef.current = reader;

      let buffer = '';

      // Async read loop
      (async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += value;
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep partial line in buffer

            for (const line of lines) {
              const cleanLine = line.trim();
              if (!cleanLine || cleanLine === '------------------------') continue;

              const parsed = parseArduinoLine(cleanLine);
              const ts = new Date().toLocaleTimeString();

              // Update local feed state
              setArduinoFeed(prev => [{ ts, raw: cleanLine, parsed, roomId: ARDUINO_ROOM_ID }, ...prev].slice(0, 12));

              // Update UI visual state
              setSensorStates(prev => ({ ...prev, [ARDUINO_ROOM_ID]: parsed }));

              // Propagate hazard event via socket to backend
              if (socket?.connected) {
                if (parsed === 'fire') {
                  socket.emit('detection:manual', {
                    roomId: ARDUINO_ROOM_ID,
                    type: 'fire',
                    confidence: 0.98,
                    source: 'arduino_serial',
                  });
                } else if (parsed === 'smoke') {
                  socket.emit('detection:manual', {
                    roomId: ARDUINO_ROOM_ID,
                    type: 'smoke',
                    confidence: 0.75,
                    source: 'arduino_serial',
                  });
                } else {
                  socket.emit('alert:resolved', {
                    roomId: ARDUINO_ROOM_ID,
                    clearedBy: 'arduino_serial',
                  });
                  // Also set it back to normal locally
                  setSensorStates(prev => ({ ...prev, [ARDUINO_ROOM_ID]: 'normal' }));
                }
              }
            }
          }
        } catch (err) {
          console.error('Error in Web Serial read loop:', err);
        } finally {
          reader.releaseLock();
          try {
            await port.close();
          } catch (e) {
            console.error('Error closing serial port:', e);
          }
          webPortRef.current = null;
          webReaderRef.current = null;
          setIsWebConnected(false);
          setArduinoStatus('offline');
        }
      })();

    } catch (err) {
      console.error('Failed to open Web Serial port:', err);
      setArduinoStatus('error');
    }
  };

  const disconnectWebSerial = async () => {
    try {
      if (webReaderRef.current) {
        await webReaderRef.current.cancel();
      }
    } catch (err) {
      console.error('Error during Web Serial disconnect:', err);
    }
  };

  // Cleanup Web Serial on unmount
  useEffect(() => {
    return () => {
      if (webReaderRef.current) {
        webReaderRef.current.cancel().catch(() => {});
      }
    };
  }, []);

  // ── Socket listeners ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onArduinoStatus = ({ status, port }) => {
      // Ignore backend status if browser Web Serial connection is active
      if (webPortRef.current) return;
      setArduinoStatus(status);
    };

    const onArduinoReading = ({ raw, parsed, roomId }) => {
      // Ignore backend readings if browser Web Serial connection is active
      if (webPortRef.current) return;
      const ts = new Date().toLocaleTimeString();
      const line = { ts, raw, parsed, roomId };
      setArduinoFeed(prev => [line, ...prev].slice(0, 12));

      // Update the real sensor's visual state
      if (parsed === 'fire') {
        setSensorStates(prev => ({ ...prev, [roomId]: 'fire' }));
      } else if (parsed === 'smoke') {
        setSensorStates(prev => ({ ...prev, [roomId]: 'smoke' }));
      } else {
        setSensorStates(prev => ({ ...prev, [roomId]: 'normal' }));
      }
    };

    const onHazardsUpdate = (fullMap) => {
      setActiveHazards(fullMap);
      // Recompute evacuation paths for every active fire room
      const paths = {};
      Object.entries(fullMap).forEach(([roomId, { type }]) => {
        if (type === 'fire') {
          paths[roomId] = findEvacuationPath(roomId, fullMap);
        }
      });
      setActivePaths(paths);
    };

    const onHazardsInit = (fullMap) => {
      setActiveHazards(fullMap);
    };

    socket.on('arduino:status',  onArduinoStatus);
    socket.on('arduino:reading', onArduinoReading);
    socket.on('hazards:update',  onHazardsUpdate);
    socket.on('hazards:init',    onHazardsInit);

    // Request current status immediately
    socket.emit('arduino:request_status');

    return () => {
      socket.off('arduino:status',  onArduinoStatus);
      socket.off('arduino:reading', onArduinoReading);
      socket.off('hazards:update',  onHazardsUpdate);
      socket.off('hazards:init',    onHazardsInit);
    };
  }, [socket]);

  // ── Auto-scroll feed ────────────────────────────────────────────────────────
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = 0;
  }, [arduinoFeed]);

  // ── Trigger a simulated detection via socket ────────────────────────────────
  function triggerSensor(roomId, type) {
    if (!socket?.connected) return;

    if (type === 'clear') {
      socket.emit('alert:resolved', { roomId, clearedBy: 'sensor_sim' });
      setSensorStates(prev => ({ ...prev, [roomId]: 'normal' }));
      return;
    }

    socket.emit('detection:manual', {
      roomId,
      type,
      confidence: type === 'fire' ? 0.97 : 0.75,
      source: 'sensor_sim',
    });
    setSensorStates(prev => ({ ...prev, [roomId]: type }));
  }

  // ── Derived stats ───────────────────────────────────────────────────────────
  const fireCount  = Object.values(activeHazards).filter(h => h.type === 'fire').length;
  const smokeCount = Object.values(activeHazards).filter(h => h.type === 'smoke').length;
  const fireRooms  = Object.entries(activeHazards)
    .filter(([, h]) => h.type === 'fire')
    .map(([id]) => id);

  const statusDot = {
    connected:  { color: '#00ff88', label: 'Connected',  pulse: true  },
    connecting: { color: '#ffd700', label: 'Connecting…', pulse: true },
    offline:    { color: '#ff4444', label: 'Offline',    pulse: false },
    error:      { color: '#ff4444', label: 'Error',      pulse: false },
  }[arduinoStatus] || { color: '#888', label: 'Unknown', pulse: false };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 16,
      height: '100%', overflowY: 'auto', padding: '20px 24px',
      background: 'var(--bg-primary, #0a0a14)', color: '#fff',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 0.5, color: '#fff' }}>
            🔌 Sensor Control Panel
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>
            Real Arduino (COM3) + Simulated Nodes
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Web Serial Connect Button */}
          {('serial' in navigator) && (
            <button
              onClick={isWebConnected ? disconnectWebSerial : connectWebSerial}
              style={{
                background: isWebConnected ? 'rgba(255, 68, 68, 0.15)' : 'rgba(0, 180, 255, 0.15)',
                border: `1px solid ${isWebConnected ? '#ff4444' : '#00b4ff'}55`,
                color: isWebConnected ? '#ff4444' : '#00b4ff',
                borderRadius: 10,
                padding: '8px 14px',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                letterSpacing: 0.5,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = isWebConnected ? 'rgba(255, 68, 68, 0.25)' : 'rgba(0, 180, 255, 0.25)';
                e.currentTarget.style.borderColor = isWebConnected ? '#ff4444' : '#00b4ff';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = isWebConnected ? 'rgba(255, 68, 68, 0.15)' : 'rgba(0, 180, 255, 0.15)';
                e.currentTarget.style.borderColor = `${isWebConnected ? '#ff4444' : '#00b4ff'}55`;
              }}
            >
              {isWebConnected ? '🔌 Disconnect Web Serial' : '🔌 Connect Web Serial'}
            </button>
          )}

          {/* Arduino connection badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,255,255,0.05)',
            border: `1px solid ${statusDot.color}44`,
            borderRadius: 10, padding: '8px 14px',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: statusDot.color,
              boxShadow: `0 0 8px ${statusDot.color}`,
              display: 'inline-block',
              animation: statusDot.pulse ? 'sensorPulse 1.4s ease-in-out infinite' : 'none',
            }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: statusDot.color, letterSpacing: 1 }}>
              Arduino {statusDot.label}
            </span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: 8 }}>
              {isWebConnected ? 'Browser Web Serial' : 'COM3 · 9600 baud'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Hazard summary bar ────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap',
      }}>
        {[
          { label: '🔥 Fire Zones', count: fireCount, color: '#ff2d2d' },
          { label: '💨 Smoke Zones', count: smokeCount, color: '#ff6b1a' },
          { label: '✅ Safe Rooms', count: 96 - fireCount - smokeCount, color: '#00ff88' },
        ].map(({ label, count, color }) => (
          <div key={label} style={{
            flex: 1, minWidth: 100,
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${color}33`,
            borderRadius: 10, padding: '10px 14px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 20, fontWeight: 800, color }}>{count}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Sensor floor panels ───────────────────────────────────────────── */}
      {SENSOR_LAYOUT.map(({ floor, sensors }) => (
        <div key={floor} style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14, overflow: 'hidden',
        }}>
          {/* Floor header */}
          <div
            onClick={() => setExpandedFloors(p => ({ ...p, [floor]: !p[floor] }))}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', cursor: 'pointer',
              background: 'rgba(255,255,255,0.02)',
              borderBottom: expandedFloors[floor] ? '1px solid rgba(255,255,255,0.07)' : 'none',
              userSelect: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#a0a0cc', letterSpacing: 1.5 }}>
                FLOOR {floor}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 1,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 4, padding: '2px 6px',
                color: 'rgba(255,255,255,0.4)',
              }}>
                {sensors.length} SENSORS
              </span>
              {/* Show alert badge if any sensor on this floor is active */}
              {sensors.some(s => activeHazards[s.roomId]?.type === 'fire') && (
                <span style={{
                  fontSize: 10, fontWeight: 800,
                  background: '#ff2d2d', color: '#fff',
                  borderRadius: 4, padding: '2px 7px',
                  animation: 'sensorPulse 1s ease-in-out infinite',
                }}>🔥 FIRE</span>
              )}
            </div>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, transition: 'transform 0.2s', transform: expandedFloors[floor] ? 'rotate(180deg)' : 'none' }}>▼</span>
          </div>

          {/* Sensor rows */}
          {expandedFloors[floor] && (
            <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sensors.map(({ roomId, label, isReal }) => {
                const serverHazard = activeHazards[roomId];
                const displayState = sensorStates[roomId] || 'normal';
                const hazardType = serverHazard?.type || displayState;

                return (
                  <div key={roomId} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: hazardType === 'fire'  ? 'rgba(255,45,45,0.07)'
                              : hazardType === 'smoke' ? 'rgba(255,107,26,0.07)'
                              : 'rgba(255,255,255,0.02)',
                    border: hazardType === 'fire'  ? '1px solid rgba(255,45,45,0.3)'
                          : hazardType === 'smoke' ? '1px solid rgba(255,107,26,0.3)'
                          : '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 10, padding: '10px 12px',
                    transition: 'all 0.3s ease',
                  }}>
                    {/* Room ID + type badge */}
                    <div style={{ minWidth: 90, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#fff', fontFamily: 'JetBrains Mono, monospace' }}>
                          {roomId}
                        </span>
                        {isReal ? (
                          <span style={{
                            fontSize: 9, fontWeight: 700, letterSpacing: 0.8,
                            background: 'rgba(0,180,255,0.2)', color: '#00b4ff',
                            border: '1px solid rgba(0,180,255,0.4)',
                            borderRadius: 4, padding: '1px 5px',
                          }}>⚡ REAL</span>
                        ) : (
                          <span style={{
                            fontSize: 9, fontWeight: 700, letterSpacing: 0.8,
                            background: 'rgba(255,200,0,0.15)', color: '#ffcc00',
                            border: '1px solid rgba(255,200,0,0.3)',
                            borderRadius: 4, padding: '1px 5px',
                          }}>SIM</span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
                        {label} · Floor {floor}
                      </div>
                    </div>

                    {/* Live status pill */}
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                      <div style={{
                        fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
                        padding: '4px 10px', borderRadius: 20,
                        background: STATUS_META[hazardType]?.bg || STATUS_META.normal.bg,
                        border:     `1px solid ${STATUS_META[hazardType]?.border || STATUS_META.normal.border}`,
                        color:      STATUS_META[hazardType]?.text || STATUS_META.normal.text,
                        transition: 'all 0.3s ease',
                      }}>
                        {STATUS_META[hazardType]?.label || '🟢 NORMAL'}
                      </div>
                    </div>

                    {/* Control buttons */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[
                        { type: 'fire',  label: '🔥',  title: 'Trigger Fire',  active: '#ff2d2d', activeBg: 'rgba(255,45,45,0.25)'  },
                        { type: 'smoke', label: '💨',  title: 'Trigger Smoke', active: '#ff6b1a', activeBg: 'rgba(255,107,26,0.25)' },
                        { type: 'clear', label: '✅',  title: 'Clear / Reset', active: '#00ff88', activeBg: 'rgba(0,255,136,0.2)'   },
                      ].map(({ type, label, title, active, activeBg }) => {
                        const isActive = (type !== 'clear') && (hazardType === type);
                        return (
                          <button
                            key={type}
                            onClick={() => triggerSensor(roomId, type)}
                            title={`${isReal && type !== 'clear' ? '⚡ Override: ' : ''}${title} — Room ${roomId}`}
                            style={{
                              width: 36, height: 36, borderRadius: 8,
                              background: isActive ? activeBg : 'rgba(255,255,255,0.05)',
                              border:     `1px solid ${isActive ? active : 'rgba(255,255,255,0.1)'}`,
                              color:      isActive ? active : 'rgba(255,255,255,0.45)',
                              fontSize: 15, cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              boxShadow: isActive ? `0 0 10px ${active}55` : 'none',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = activeBg;
                              e.currentTarget.style.borderColor = active;
                              e.currentTarget.style.color = active;
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = isActive ? activeBg : 'rgba(255,255,255,0.05)';
                              e.currentTarget.style.borderColor = isActive ? active : 'rgba(255,255,255,0.1)';
                              e.currentTarget.style.color = isActive ? active : 'rgba(255,255,255,0.45)';
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {/* ── Live Arduino feed ──────────────────────────────────────────────── */}
      <div style={{
        background: 'rgba(0,0,0,0.4)',
        border: '1px solid rgba(0,180,255,0.2)',
        borderRadius: 14, overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid rgba(0,180,255,0.15)',
          background: 'rgba(0,180,255,0.05)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#00b4ff', letterSpacing: 1 }}>
              📡 LIVE ARDUINO FEED
            </span>
            <span style={{
              fontSize: 9, fontWeight: 700,
              background: 'rgba(0,180,255,0.15)',
              color: '#00b4ff',
              border: '1px solid rgba(0,180,255,0.3)',
              borderRadius: 3, padding: '1px 5px',
            }}>ROOM {ARDUINO_ROOM_ID}</span>
          </div>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Last 12 readings</span>
        </div>

        <div
          ref={feedRef}
          style={{
            maxHeight: 200, overflowY: 'auto',
            padding: '8px 0',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11,
          }}
        >
          {arduinoFeed.length === 0 ? (
            <div style={{ padding: '20px 16px', color: 'rgba(255,255,255,0.2)', textAlign: 'center', fontSize: 12 }}>
              {arduinoStatus === 'connected' ? '⏳ Waiting for readings…' : '🔌 Arduino not connected'}
            </div>
          ) : (
            arduinoFeed.map((entry, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'baseline', gap: 10,
                padding: '4px 16px',
                background: i === 0 ? 'rgba(255,255,255,0.04)' : 'transparent',
                borderLeft: `3px solid ${entry.parsed === 'fire' ? '#ff2d2d' : entry.parsed === 'smoke' ? '#ff6b1a' : 'rgba(0,255,136,0.3)'}`,
                transition: 'background 0.2s',
              }}>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', minWidth: 70 }}>{entry.ts}</span>
                <span style={{
                  color: entry.parsed === 'fire'  ? '#ff6666'
                       : entry.parsed === 'smoke' ? '#ffaa66'
                       : 'rgba(0,255,136,0.7)',
                  flex: 1,
                }}>
                  {entry.raw}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Active evacuation paths ────────────────────────────────────────── */}
      {fireRooms.length > 0 && (
        <div style={{
          background: 'rgba(255,45,45,0.06)',
          border: '1px solid rgba(255,45,45,0.25)',
          borderRadius: 14, padding: '14px 16px',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#ff6666', letterSpacing: 1, marginBottom: 10 }}>
            🗺️ DIJKSTRA EVACUATION PATHS
          </div>
          {fireRooms.map(roomId => {
            const path = activePaths[roomId] || [];
            return (
              <div key={roomId} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
                  From Room <span style={{ color: '#ff6666', fontWeight: 700 }}>{roomId}</span>:
                </div>
                {path.length > 1 ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4,
                    fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
                  }}>
                    {path.map((node, idx) => (
                      <span key={node} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{
                          padding: '2px 7px', borderRadius: 4,
                          background: node.startsWith('EXIT')  ? 'rgba(0,255,136,0.2)'
                                    : node.startsWith('STAIR') ? 'rgba(255,200,0,0.15)'
                                    : 'rgba(255,255,255,0.08)',
                          color: node.startsWith('EXIT')  ? '#00ff88'
                               : node.startsWith('STAIR') ? '#ffcc00'
                               : 'rgba(255,255,255,0.7)',
                          border: `1px solid ${
                            node.startsWith('EXIT')  ? 'rgba(0,255,136,0.3)'
                          : node.startsWith('STAIR') ? 'rgba(255,200,0,0.3)'
                          : 'rgba(255,255,255,0.1)'}`,
                        }}>
                          {node}
                        </span>
                        {idx < path.length - 1 && <span style={{ color: 'rgba(255,255,255,0.2)' }}>→</span>}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: '#ff4444' }}>⚠️ No safe path found — all routes blocked</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Global clear button ────────────────────────────────────────────── */}
      {(fireCount + smokeCount) > 0 && (
        <button
          onClick={() => {
            if (!socket?.connected) return;
            socket.emit('hazards:clear');
            setSensorStates({});
          }}
          style={{
            padding: '12px 20px', borderRadius: 10, cursor: 'pointer',
            background: 'rgba(0,255,136,0.1)',
            border: '1px solid rgba(0,255,136,0.35)',
            color: '#00ff88', fontSize: 13, fontWeight: 700, letterSpacing: 0.5,
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(0,255,136,0.2)';
            e.currentTarget.style.borderColor = 'rgba(0,255,136,0.6)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(0,255,136,0.1)';
            e.currentTarget.style.borderColor = 'rgba(0,255,136,0.35)';
          }}
        >
          ✅ Clear All Hazards
        </button>
      )}

      {/* ── Animations ────────────────────────────────────────────────────── */}
      <style>{`
        @keyframes sensorPulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px currentColor; }
          50%       { opacity: 0.5; box-shadow: 0 0 2px currentColor; }
        }
      `}</style>
    </div>
  );}