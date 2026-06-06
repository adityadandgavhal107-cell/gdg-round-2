import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import HotelView3D from './views/HotelView3D.jsx';
import { hotelData, findEvacuationPath } from './data/hotel.js';
import config from './core/config.js';

export default function GuestApp() {
  const [roomId, setRoomId] = useState('408');
  const [path, setPath] = useState([]);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Real-time hazards
  const [blockedRooms, setBlockedRooms] = useState([]);
  const [socketConnected, setSocketConnected] = useState(false);

  // POV Settings
  const [viewMode, setViewMode] = useState('map'); // 'map' | 'pov'

  // Network offline tracker
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // WebRTC Live Telemetry
  useEffect(() => {
    const socket = io(config.socketUrl, { path: config.socketPath });

    // Expose to window for guest.html SOS trigger
    window.triggerGuestSOS = (type) => {
      socket.emit('detection:manual', {
        roomId: roomId || '408', // using state roomId or default
        type: type,
        confidence: 1.0,
        source: 'guest_sos'
      });
      console.log(`[Guest] SOS triggered: ${type} for Room ${roomId}`);
    };

    socket.on('connect', () => setSocketConnected(true));
    socket.on('disconnect', () => setSocketConnected(false));

    // Listen for room fires directly from Admin relay
    socket.on('detection:alert', (alert) => {
      if (alert.type === 'fire' || alert.type === 'smoke') {
        const id = String(alert.roomId);
        setBlockedRooms(prev => prev.includes(id) ? prev : [...prev, id]);
      }
    });

    return () => {
      socket.disconnect();
      delete window.triggerGuestSOS;
    };
  }, [roomId]);

  // AI Voice Guidance
  const speakInstructions = (text) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel(); // Interrupt current speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1.1;
    window.speechSynthesis.speak(utterance);
  };

  // Recalculate path dynamically if hazards change
  useEffect(() => {
    if (path.length > 0) {
      handleGeneratePath();
      if (blockedRooms.length > 0) {
        speakInstructions(`⚠️ Attention. Hazard detected. Rerouting your path to avoid Room ${blockedRooms[blockedRooms.length - 1]}. Please follow updated directions.`);
      }
    } else if (blockedRooms.length > 0 && blockedRooms.includes(roomId)) {
      speakInstructions(`🚨 Emergency Alert. Hazard detected in your room. Please evacuate immediately!`);
    }
  }, [blockedRooms]);

  const handleGeneratePath = () => {
    if (!hotelData.graph[roomId]) {
      alert('Invalid room ID');
      return;
    }
    const safePath = findEvacuationPath(roomId, blockedRooms);
    setPath(safePath);
    if (safePath.length > 0) {
      speakInstructions(`Path found. Proceed to the nearest exit via rooms ${safePath.slice(1, 4).join(', ')}.`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#050508', color: '#fff', fontFamily: 'Inter, sans-serif' }}>

      {/* Header removed as guest.html has its own phone status bar */}

      {/* Controls */}
      <div style={{ padding: '12px 16px', gap: '8px', display: 'flex', flexDirection: 'column', background: '#0a0a0f', zIndex: 10, borderBottom: '1px solid #222' }}>
        <div>
          <label style={{ fontSize: '12px', color: '#888', marginBottom: '6px', display: 'block' }}>YOUR ROOM NUMBER</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              style={{ flex: 1, background: '#111', border: '1px solid #333', color: '#fff', padding: '10px', borderRadius: '8px', fontSize: '14px' }}
              placeholder="e.g. 408"
            />
            <button
              onClick={handleGeneratePath}
              style={{ background: '#00ff88', color: '#000', border: 'none', padding: '0 20px', borderRadius: '8px', fontWeight: 700, fontSize: '14px' }}
            >
              FIND EXIT
            </button>
          </div>
        </div>

        {/* View Toggles */}
        {path.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button
              onClick={() => setViewMode('map')}
              style={{ flex: 1, padding: '10px', background: viewMode === 'map' ? '#2a2a5a' : '#111', color: viewMode === 'map' ? '#fff' : '#888', border: '1px solid #333', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}
            >
              🗺️ OVERVIEW MAP
            </button>
            <button
              onClick={() => setViewMode('pov')}
              style={{ flex: 1, padding: '10px', background: viewMode === 'pov' ? '#2a2a5a' : '#111', color: viewMode === 'pov' ? '#fff' : '#888', border: '1px solid #333', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}
            >
              👁️ FIRST PERSON POV
            </button>
          </div>
        )}

        {/* Path Text */}
        {path.length > 0 && (
          <div style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', padding: '12px', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', color: '#00ff88', marginBottom: '4px', fontWeight: 600 }}>SAFEST ROUTE:</div>
            <div style={{ fontSize: '14px', lineHeight: 1.4, color: '#ccc' }}>
              {(path || []).join(' ➔ ')}
            </div>
            {blockedRooms.length > 0 && (
              <div style={{ fontSize: '12px', color: '#ff2d2d', marginTop: '6px', fontWeight: 600 }}>
                ⚠️ Rerouting around hazards: {blockedRooms.join(', ')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3D Map */}
      <div style={{ flex: 1, position: 'relative', display: 'flex' }}>
        <HotelView3D
          evacuationPath={path}
          viewMode={viewMode}
          focusRoomId={roomId}
          isGuest={true}
        />
      </div>

    </div>
  );
}
