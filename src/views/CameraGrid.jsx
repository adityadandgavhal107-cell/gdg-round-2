import { useState, useEffect, useRef } from 'react';
import bus from '../core/EventBus.js';
import { DetectionOverlay } from '../ai/DetectionOverlay.js';
import webRTCManager from '../core/WebRTCManager.js';

// Generate QR code data URL using Canvas
function generateQRText(roomId) {
  const url = `${window.location.origin}/cam.html?room=${roomId}`;
  return url;
}

function CameraTile({ roomId, stream, onExpand, alertStatus }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  useEffect(() => {
    if (!stream || !canvasRef.current || !videoRef.current) return;
    const overlay = new DetectionOverlay(canvasRef.current, videoRef.current);
    overlay.start(roomId);
    overlayRef.current = overlay;

    const handleResize = () => overlay.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      overlay.stop();
      window.removeEventListener('resize', handleResize);
    };
  }, [stream, roomId]);

  const hasFire  = alertStatus === 'fire';
  const hasSmoke = alertStatus === 'smoke';
  const hasAudio = alertStatus === 'audio';

  return (
    <div
      className={`camera-tile scanline${hasFire ? ' fire-alert' : hasAudio ? ' audio-alert' : ''}`}
      onClick={() => onExpand(roomId)}
      title={`Room ${roomId} — Click to expand`}
    >
      {stream ? (
        <>
          <video ref={videoRef} autoPlay playsInline muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 2 }} />
        </>
      ) : (
        <div className="no-camera-placeholder">
          <span className="placeholder-icon">📵</span>
          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Awaiting Camera</span>
          <span className="qr-hint">
            Open on phone:<br />
            <span style={{ color: 'var(--accent-blue)', fontFamily: 'JetBrains Mono, monospace', fontSize: 10 }}>
              /cam.html?room={roomId}
            </span>
          </span>
        </div>
      )}

      <div className="camera-label">Room {roomId}</div>
      <div className={`camera-status-dot${stream ? '' : ' offline'}`} />

      {hasFire && (
        <div style={{
          position: 'absolute', bottom: 8, left: 8, zIndex: 5,
          background: 'var(--fire-red-dim)', border: '1px solid var(--fire-red)',
          borderRadius: 4, padding: '2px 8px', fontSize: 11, color: 'var(--fire-red)',
          fontWeight: 700, fontFamily: 'JetBrains Mono, monospace',
          animation: 'pulse-red 1s ease-in-out infinite',
        }}>🔥 FIRE DETECTED</div>
      )}

      {hasAudio && (
        <div style={{
          position: 'absolute', bottom: 8, left: 8, zIndex: 5,
          background: 'rgba(255,215,0,0.1)', border: '1px solid #ffd700',
          borderRadius: 4, padding: '2px 8px', fontSize: 11, color: '#ffd700',
          fontWeight: 700, fontFamily: 'JetBrains Mono, monospace',
          animation: 'pulse-yellow 1.5s ease-in-out infinite',
        }}>🔊 ALARM SOUND</div>
      )}

      {hasSmoke && !hasFire && (
        <div style={{
          position: 'absolute', bottom: 8, left: 8, zIndex: 5,
          background: 'var(--smoke-dim)', border: '1px solid var(--smoke-orange)',
          borderRadius: 4, padding: '2px 8px', fontSize: 11, color: 'var(--smoke-orange)',
          fontWeight: 700, fontFamily: 'JetBrains Mono, monospace',
          animation: 'pulse-orange 2s ease-in-out infinite',
        }}>💨 SMOKE DETECTED</div>
      )}
    </div>
  );
}

export default function CameraGrid({ selectedRoom, onRoomAlert }) {
  const [streams, setStreams] = useState({});
  const [roomStatuses, setRoomStatuses] = useState({});
  const [expandedRoom, setExpandedRoom] = useState(null);
  const [activeRooms, setActiveRooms] = useState([]);

  // Default show some rooms (connected or placeholders for active floors)
  const displayRooms = activeRooms.length > 0
    ? activeRooms
    : ['101', '102', '201', '301', '401', '501'];

  useEffect(() => {
    // Initialize WebRTC manager — guard against re-connecting on every tab switch
    if (!webRTCManager.isConnected()) {
      webRTCManager.connect();
    }

    webRTCManager.onStream((roomId, stream) => {
      setStreams(prev => ({ ...prev, [roomId]: stream }));
      setActiveRooms(prev => prev.includes(roomId) ? prev : [...prev, roomId]);
    });

    webRTCManager.onDisconnect((roomId) => {
      setStreams(prev => { const n = { ...prev }; delete n[roomId]; return n; });
    });

    // Room status updates
    const unsubStatus = bus.on('room:statusChange', ({ roomId, status }) => {
      setRoomStatuses(prev => ({ ...prev, [roomId]: status }));
      if (status === 'fire' || status === 'smoke') {
        setActiveRooms(prev => prev.includes(roomId) ? prev : [...prev, roomId]);
        onRoomAlert?.(roomId, status);
      }
    });

    return () => {
      unsubStatus();
      webRTCManager.disconnect();
    };
  }, []);

  // When admin clicks room in 3D view, add it to active rooms
  useEffect(() => {
    if (selectedRoom && !activeRooms.includes(selectedRoom)) {
      setActiveRooms(prev => [...prev, selectedRoom]);
    }
  }, [selectedRoom]);

  const connectedCount = Object.keys(streams).length;

  return (
    <div className="camera-grid-view">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="view-title">📹 <span>Live</span> Camera Feeds</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 4 }}>
            {connectedCount} live · {displayRooms.length - connectedCount} awaiting
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <div style={{
            padding: '6px 12px',
            background: connectedCount > 0 ? 'var(--safe-dim)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${connectedCount > 0 ? 'var(--safe-green)' : 'var(--border)'}`,
            borderRadius: 8, fontSize: 12, fontFamily: 'JetBrains Mono, monospace',
            color: connectedCount > 0 ? 'var(--safe-green)' : 'var(--text-dim)',
          }}>
            {connectedCount > 0 ? '● ' : '○ '}{connectedCount} Connected
          </div>

          <div style={{
            padding: '4px 10px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--border)',
            borderRadius: 8, fontSize: 11, color: 'var(--text-dim)',
          }}>
            📱 Connect phone → <span style={{ fontFamily: 'JetBrains Mono', color: 'var(--accent-blue)' }}>/cam.html?room=XXX</span>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="camera-grid">
        {displayRooms.map(roomId => (
          <CameraTile
            key={roomId}
            roomId={roomId}
            stream={streams[roomId] || null}
            alertStatus={roomStatuses[roomId]}
            onExpand={setExpandedRoom}
          />
        ))}
      </div>

      {/* Expanded Modal */}
      {expandedRoom && (
        <div className="modal-overlay" onClick={() => setExpandedRoom(null)}>
          <div
            style={{ width: '80vw', maxWidth: 900, background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-bright)', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header">
              <span className="modal-title">📹 Room {expandedRoom} — Live Feed</span>
              <button className="modal-close" onClick={() => setExpandedRoom(null)}>✕</button>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ position: 'relative', background: '#000', borderRadius: 8, overflow: 'hidden', aspectRatio: '16/9' }}>
                {streams[expandedRoom] ? (
                  <video
                    autoPlay playsInline muted
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    ref={v => { if (v && streams[expandedRoom]) { v.srcObject = streams[expandedRoom]; v.play(); } }}
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--text-dim)' }}>
                    <span style={{ fontSize: 48 }}>📵</span>
                    <span>No camera connected for Room {expandedRoom}</span>
                    <span style={{ fontSize: 12, color: 'var(--accent-blue)', fontFamily: 'JetBrains Mono' }}>
                      {window.location.origin}/cam.html?room={expandedRoom}
                    </span>
                  </div>
                )}
              </div>

              {/* Detection info */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 12 }}>
                {[
                  { label: 'YOLOv8 Smoke', value: roomStatuses[expandedRoom] === 'smoke' ? '⚠ DETECTED' : '✓ Clear', alert: roomStatuses[expandedRoom] === 'smoke' },
                  { label: 'OpenCV Fire', value: roomStatuses[expandedRoom] === 'fire' ? '🔥 DETECTED' : '✓ Clear', alert: roomStatuses[expandedRoom] === 'fire' },
                  { label: 'YAMNet Audio', value: roomStatuses[expandedRoom] === 'audio' ? '🔊 DETECTED' : '✓ Clear', alert: roomStatuses[expandedRoom] === 'audio' },
                ].map(({ label, value, alert }) => (
                  <div key={label} style={{
                    padding: '10px 14px', borderRadius: 8,
                    background: alert ? 'var(--fire-red-dim)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${alert ? 'var(--fire-red)' : 'var(--border)'}`,
                  }}>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: alert ? 'var(--fire-red)' : 'var(--safe-green)', fontFamily: 'JetBrains Mono' }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
