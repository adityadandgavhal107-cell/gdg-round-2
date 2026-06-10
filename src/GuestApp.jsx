import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import HotelView3D from './views/HotelView3D.jsx';
import { hotelData, findEvacuationPath } from './data/hotel.js';
import config from './core/config.js';
import bus from './core/EventBus.js';
import { useVoiceGuidance } from './voice-guidance/useVoiceGuidance';

export default function GuestApp() {
  const [roomId, setRoomId] = useState('');
  const [path, setPath] = useState([]);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [guestProfile, setGuestProfile] = useState(null);

  // Hazard map: { "104": { type: "fire", intensity: 1.0 }, ... }
  const [roomHazards, setRoomHazards] = useState({});
  // Ref mirror — always current inside closures
  const roomHazardsRef = useRef({});
  const [socketConnected, setSocketConnected] = useState(false);
  const [viewMode, setViewMode] = useState('map');

  // Refs so the single socket closure always reads latest values
  const roomIdRef       = useRef(roomId);
  const guestProfileRef = useRef(guestProfile);
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);
  useEffect(() => { guestProfileRef.current = guestProfile; }, [guestProfile]);

  // ── applyHazard: set a room on fire/smoke/buffer ──────────────────────
  const applyHazard = (id, type, intensity = 1.0) => {
    const sid = String(id);
    const busStatus = type === 'buffer' ? 'smoke' : type;
    roomHazardsRef.current = { ...roomHazardsRef.current, [sid]: { type, intensity } };
    setRoomHazards({ ...roomHazardsRef.current });
    bus.emit('room:statusChange', { roomId: sid, status: busStatus });
  };

  // ── clearHazard: mark a room safe ────────────────────────────────────
  const clearHazard = (id) => {
    const sid = String(id);
    const next = { ...roomHazardsRef.current };
    delete next[sid];
    roomHazardsRef.current = next;
    setRoomHazards({ ...next });
    bus.emit('room:statusChange', { roomId: sid, status: 'clear' });
  };

  // ── Re-broadcast all current hazards so HotelView3D repaints on tab open
  const replayHazardsOnBus = () => {
    const hazards = roomHazardsRef.current;
    Object.entries(hazards).forEach(([id, { type }]) => {
      const busStatus = type === 'buffer' ? 'smoke' : type;
      bus.emit('room:statusChange', { roomId: id, status: busStatus });
    });
  };

  useEffect(() => {
    window.__replayHazards = replayHazardsOnBus;
    return () => { delete window.__replayHazards; };
  }, []);

  useEffect(() => {
    const onMapOpen = () => {
      if (Object.keys(roomHazardsRef.current).length > 0) {
        setTimeout(replayHazardsOnBus, 300);
        setTimeout(replayHazardsOnBus, 900);
      }
    };
    window.addEventListener('evacmap:open', onMapOpen);
    window.addEventListener('resize', onMapOpen);
    return () => {
      window.removeEventListener('evacmap:open', onMapOpen);
      window.removeEventListener('resize', onMapOpen);
    };
  }, []);

  // ── Load guest profile ─────────────────────────────────────────────────
  useEffect(() => {
    const loadGuestProfile = () => {
      try {
        const raw = sessionStorage.getItem('guestProfile');
        if (!raw) {
          console.warn('[GuestApp] No guestProfile in sessionStorage.');
          return;
        }
        const profile = JSON.parse(raw);
        console.log('[GuestApp] Raw profile from API:', profile);

        const name  = profile.name || profile.guest_name || profile.full_name || profile.first_name || 'Guest';
        const room  = String(profile.room || profile.room_id || profile.room_number || profile.roomId || '');
        const floor = profile.floor ?? (room ? Math.floor(Number(room) / 100) : '--');

        const rawCheckout =
          profile.checkOutDate || profile.check_out || profile.checkout ||
          profile.checkOut || profile.checkout_date || profile.check_out_date || null;

        // Parse date string in a timezone-safe way.
        // "YYYY-MM-DD" strings are UTC midnight in JS — adding T00:00:00 forces
        // local-time parsing so toLocaleDateString never rolls back a day.
        const parseDateSafe = (str) => {
          if (!str) return null;
          // Already a Date object
          if (str instanceof Date) return str;
          const s = String(str).trim();
          // Pure ISO date "YYYY-MM-DD" — parse as local midnight to avoid UTC offset shift
          if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T00:00:00');
          return new Date(s);
        };

        const checkoutDate = parseDateSafe(rawCheckout);
        const checkoutDisplay =
          checkoutDate && !isNaN(checkoutDate)
            ? checkoutDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
            : '--';

        const rawCheckin =
          profile.checkInDate || profile.check_in || profile.checkin || profile.checkIn || null;
        let nights = profile.nights ?? profile.stay_nights ?? '--';
        if (nights === '--' && rawCheckin && rawCheckout) {
          const ci = parseDateSafe(rawCheckin);
          const co = parseDateSafe(rawCheckout);
          if (ci && co && !isNaN(ci) && !isNaN(co)) {
            nights = Math.round((co - ci) / 86400000);
          }
        }

        const normalised = { name, room, floor, nights, checkoutDate: checkoutDisplay };
        setGuestProfile(normalised);
        if (room) setRoomId(room);

        if (window.updateGuestProfile) {
          window.updateGuestProfile(normalised);
        } else {
          setTimeout(() => window.updateGuestProfile?.(normalised), 300);
        }
      } catch (err) {
        console.error('[GuestApp] Failed to parse guest profile:', err);
      }
    };
    loadGuestProfile();
  }, []);

  // ── Network offline tracker ────────────────────────────────────────────
  useEffect(() => {
    const on  = () => setIsOffline(false);
    const off = () => setIsOffline(true);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online',  on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // ── WebSocket — created ONCE, never recreated ─────────────────────────
  useEffect(() => {
    const socket = io(config.socketUrl, { path: config.socketPath });

    window.triggerGuestSOS = (type) => {
      const targetRoom = roomIdRef.current || guestProfileRef.current?.room || '000';
      socket.emit('detection:manual', {
        roomId:     targetRoom,
        type,
        confidence: 1.0,
        source:     'guest_sos',
      });
      console.log(`[Guest] SOS triggered: ${type} for Room ${targetRoom}`);
    };

    socket.on('connect', () => {
      console.log('[GUEST] Socket connected:', socket.id);
      setSocketConnected(true);
    });
    socket.on('disconnect', () => setSocketConnected(false));

    // ── hazards:init — full authoritative state on connect ────────────
    socket.on('hazards:init', (fullMap) => {
      console.log('[GUEST] hazards:init received:', fullMap);
      roomHazardsRef.current = {};
      Object.entries(fullMap).forEach(([id, { type, intensity }]) => {
        const sid = String(id);
        const busStatus = type === 'buffer' ? 'smoke' : type;
        roomHazardsRef.current[sid] = { type, intensity };
        bus.emit('room:statusChange', { roomId: sid, status: busStatus });
      });
      setRoomHazards({ ...roomHazardsRef.current });
    });

    // ── hazards:update — authoritative broadcast after every change ───
    socket.on('hazards:update', (fullMap) => {
      console.log('[GUEST] hazards:update received:', fullMap);

      const previousIds = new Set(Object.keys(roomHazardsRef.current));
      const newRef = {};

      Object.entries(fullMap).forEach(([id, { type, intensity }]) => {
        const sid = String(id);
        const busStatus = type === 'buffer' ? 'smoke' : type;
        newRef[sid] = { type, intensity };
        bus.emit('room:statusChange', { roomId: sid, status: busStatus });
        previousIds.delete(sid);
      });

      previousIds.forEach(id => {
        console.log(`[GUEST] hazards:update — clearing stale room ${id}`);
        bus.emit('room:statusChange', { roomId: id, status: 'clear' });
      });

      roomHazardsRef.current = newRef;
      setRoomHazards({ ...newRef });
    });

    // ── Legacy events — hazards:update is canonical, these are fallbacks
    socket.on('detection:alert', (alert) => {
      console.log('[GUEST] detection:alert received:', alert);
      if (alert.type === 'fire' || alert.type === 'smoke') {
        const sid = String(alert.roomId);
        if (!roomHazardsRef.current[sid]) {
          const busStatus = alert.type === 'buffer' ? 'smoke' : alert.type;
          roomHazardsRef.current = { ...roomHazardsRef.current, [sid]: { type: alert.type, intensity: alert.confidence || 1.0 } };
          setRoomHazards({ ...roomHazardsRef.current });
          bus.emit('room:statusChange', { roomId: sid, status: busStatus });
        }
      }
    });

    socket.on('alert:escalate', (data) => {
      console.log('[GUEST] alert:escalate received:', data);
      if (data && data.roomId) {
        const sid  = String(data.roomId);
        const type = data.type || 'fire';
        if (!roomHazardsRef.current[sid]) {
          const busStatus = type === 'buffer' ? 'smoke' : type;
          const intensity = data.intensity !== undefined ? data.intensity : 1.0;
          roomHazardsRef.current = { ...roomHazardsRef.current, [sid]: { type, intensity } };
          setRoomHazards({ ...roomHazardsRef.current });
          bus.emit('room:statusChange', { roomId: sid, status: busStatus });
        }
      }
    });

    socket.on('alert:resolved', ({ roomId: resolvedRoom }) => {
      if (!resolvedRoom) return;
      const sid = String(resolvedRoom);
      console.log(`[GUEST] alert:resolved — clearing room ${sid}`);
      const next = { ...roomHazardsRef.current };
      delete next[sid];
      roomHazardsRef.current = next;
      setRoomHazards({ ...next });
      bus.emit('room:statusChange', { roomId: sid, status: 'clear' });
    });

    return () => {
      socket.disconnect();
      delete window.triggerGuestSOS;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Voice guidance (Siri-like, hotel concierge quality) ───────────────
  // useVoiceGuidance wires RouteToSpeech + VoiceGuidanceService.
  // speakRoute  -> converts path[] -> natural instructions -> queued TTS
  // speakAlert  -> immediate priority speech (interrupts queue)
  // replay      -> repeat last instruction
  // The routing algorithm (findEvacuationPath) is NEVER touched here.
  const { speakRoute, speakAlert, replay } = useVoiceGuidance({
    guestName:    guestProfile?.name,
    isEvacuation: true,
  });

  // ── Dijkstra path recalc whenever roomId or hazards change ────────────
  useEffect(() => {
    if (roomId) {
      const dynamicPath = findEvacuationPath(roomId, roomHazards);
      setPath(dynamicPath);
    }

    const fireRooms = Object.keys(roomHazards).filter(
      id => roomHazards[id].type === 'fire' || roomHazards[id].type === 'smoke'
    );

    if (fireRooms.length > 0) {
      if (fireRooms.includes(roomId)) {
        speakAlert('Emergency Alert. A hazard has been detected in your room. Please evacuate immediately!');
      } else if (path.length > 0) {
        speakAlert(
          `Attention. A hazard has been detected nearby. Your route has been updated to avoid the affected area. Please follow the revised directions.`
        );
      }
    }
  }, [roomId, roomHazards]);

  // ── Find Exit button ───────────────────────────────────────────────────
  const handleGeneratePath = () => {
    if (!hotelData.graph[roomId]) { alert('Invalid room ID'); return; }
    const safePath = findEvacuationPath(roomId, roomHazards);
    setPath(safePath);
    if (safePath.length > 0) {
      // speakRoute converts the path array into natural instructions and
      // enqueues them sequentially. The routing algorithm is untouched.
      speakRoute(safePath, { isEvacuation: true });
    }
  };

  const blockedRoomsList = Object.keys(roomHazards).filter(
    id => roomHazards[id].type === 'fire' || roomHazards[id].type === 'buffer'
  );

  const alertRooms = Object.keys(roomHazards).filter(
    id => roomHazards[id].type === 'fire' || roomHazards[id].type === 'smoke'
  );

  const derivedRoomStatuses = {};
  Object.entries(roomHazards).forEach(([id, hazard]) => {
    derivedRoomStatuses[id] = hazard.type === 'buffer' ? 'smoke' : hazard.type;
  });

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#0d0d1a',
      color: '#fff',
      fontFamily: "'Inter', sans-serif",
      overflow: 'hidden',
    }}>

      {/* ── UI Panel: pinned to top, never overlaps 3D view ── */}
      <div style={{
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '10px 12px 8px',
        background: '#0d0d1a',
        zIndex: 100,
      }}>

        {/* Verify room + Find Exit + view toggle */}
        <div style={{
          background: 'rgba(13, 13, 26, 0.85)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '18px',
          padding: '14px',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}>
          <div>
            <label style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: '11px',
              fontWeight: 600,
              color: '#4a5568',
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              marginBottom: '6px',
              display: 'block',
            }}>
              Verify Location Room
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  color: '#fff',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  fontSize: '14px',
                  outline: 'none',
                  fontFamily: "'Inter', sans-serif",
                }}
                placeholder="e.g. 408"
              />
              <button
                onClick={handleGeneratePath}
                style={{
                  background: 'linear-gradient(135deg, #fc8181, #e53e3e)',
                  color: '#fff',
                  border: 'none',
                  padding: '0 22px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: '14px',
                  letterSpacing: '1px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(229,62,62,0.3)',
                }}
              >
                FIND EXIT
              </button>
            </div>
          </div>

          {path.length > 0 && (
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => setViewMode('map')}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: viewMode === 'map' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.02)',
                  color: viewMode === 'map' ? '#fff' : '#a0aec0',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontFamily: "'Rajdhani', sans-serif",
                  fontWeight: 600,
                  letterSpacing: '1px',
                  cursor: 'pointer',
                }}
              >
                🗺️ OVERVIEW MAP
              </button>
              <button
                onClick={() => setViewMode('pov')}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: viewMode === 'pov' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.02)',
                  color: viewMode === 'pov' ? '#fff' : '#a0aec0',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontFamily: "'Rajdhani', sans-serif",
                  fontWeight: 600,
                  letterSpacing: '1px',
                  cursor: 'pointer',
                }}
              >
                👁️ FIRST PERSON POV
              </button>
            </div>
          )}
        </div>

        {/* Safest evacuation route */}
        {path.length > 0 && (
          <div style={{
            background: 'rgba(13, 13, 26, 0.9)',
            border: '1px solid rgba(255,255,255,0.08)',
            padding: '14px',
            borderRadius: '16px',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 10px 25px rgba(0,0,0,0.4)',
          }}>
            <div style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: '11px',
              color: '#63b3ed',
              marginBottom: '6px',
              fontWeight: 700,
              letterSpacing: '1.5px',
            }}>
              SAFEST EVACUATION ROUTE:
            </div>
            <div style={{
              fontSize: '13px',
              lineHeight: 1.4,
              color: '#e2e8f0',
              fontWeight: 500,
              fontFamily: "'Inter', sans-serif",
              wordBreak: 'break-all',
            }}>
              {(path || []).join(' ➔ ')}
            </div>
            {blockedRoomsList.length > 0 && (
              <div style={{
                fontSize: '11px',
                color: '#fc8181',
                marginTop: '8px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                ⚠️ Hazards avoided: {blockedRoomsList.join(', ')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 3D canvas: fills all remaining height, fully pannable/zoomable ── */}
      <div style={{
        flex: 1,
        minHeight: 0,
        position: 'relative',
        overflow: 'hidden',
      }}>

        {/* Status badges — float top-right over the 3D map, no layout cost */}
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          display: 'flex',
          gap: '6px',
          zIndex: 200,
          pointerEvents: 'none',
        }}>
          <span style={{
            fontSize: '7px',
            background: '#e53e3e',
            color: '#fff',
            padding: '4px 10px',
            borderRadius: '20px',
            fontWeight: 700,
            fontFamily: "'Rajdhani', sans-serif",
            letterSpacing: '1px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}>
            {isOffline ? 'OFFLINE' : 'LIVE MAP'}
          </span>
          <span style={{
            fontSize: '7px',
            background: socketConnected ? 'rgba(72,187,120,0.2)' : 'rgba(229,62,62,0.2)',
            color: socketConnected ? '#68d391' : '#fc8181',
            border: socketConnected ? '1px solid rgba(72,187,120,0.4)' : '1px solid rgba(229,62,62,0.4)',
            padding: '4px 10px',
            borderRadius: '20px',
            fontWeight: 600,
            fontFamily: "'Rajdhani', sans-serif",
            letterSpacing: '0.5px',
            backdropFilter: 'blur(4px)',
          }}>
            {socketConnected ? 'TELEMETRY SYNCED' : 'RECONNECTING HUB'}
          </span>
        </div>

        <HotelView3D
          evacuationPath={path}
          viewMode={viewMode}
          focusRoomId={roomId}
          isGuest={true}
          alertRooms={alertRooms}
          roomStatuses={derivedRoomStatuses}
        />
      </div>

    </div>
  );
}