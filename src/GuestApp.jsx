import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import HotelView3D from './views/HotelView3D.jsx';
import NavigationView from './views/NavigationView.jsx';
import { hotelData, findEvacuationPath } from './data/hotel.js';
import { pathToSteps, buildAudioScript, localiseStep } from './core/pathToSteps.js';
import config from './core/config.js';
import bus from './core/EventBus.js';
import { useVoiceGuidance } from './voice-guidance/useVoiceGuidance';
import VoiceGuidanceService from './voice-guidance/VoiceGuidanceService';

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

  // ── Step-based POV navigation ──────────────────────────────────────────
  const [navSteps,    setNavSteps]    = useState([]);
  const [stepIndex,   setStepIndex]   = useState(0);
  const [voiceActive, setVoiceActive] = useState(false);
  const [language, setLanguage]       = useState('en');

  // ── FIX 2: Guest alert notifications ──────────────────────────────────
  const [guestAlerts, setGuestAlerts] = useState([]); // { id, roomId, type, ts }

  // Refs so the single socket closure always reads latest values
  const roomIdRef       = useRef(roomId);
  const guestProfileRef = useRef(guestProfile);
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);
  useEffect(() => { guestProfileRef.current = guestProfile; }, [guestProfile]);

  // ── applyHazard ────────────────────────────────────────────────────────
  const applyHazard = (id, type, intensity = 1.0) => {
    const sid = String(id);
    const busStatus = type === 'buffer' ? 'smoke' : type;
    roomHazardsRef.current = { ...roomHazardsRef.current, [sid]: { type, intensity } };
    setRoomHazards({ ...roomHazardsRef.current });
    bus.emit('room:statusChange', { roomId: sid, status: busStatus });
  };

  // ── clearHazard ────────────────────────────────────────────────────────
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
    Object.entries(roomHazardsRef.current).forEach(([id, { type }]) => {
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

        const name  = profile.name || profile.guest_name || profile.full_name || profile.first_name || 'Guest';
        const room  = String(profile.room || profile.room_id || profile.room_number || profile.roomId || '');
        const floor = profile.floor ?? (room ? Math.floor(Number(room) / 100) : '--');

        const rawCheckout =
          profile.checkOutDate || profile.check_out || profile.checkout ||
          profile.checkOut || profile.checkout_date || profile.check_out_date || null;

        const parseDateSafe = (str) => {
          if (!str) return null;
          if (str instanceof Date) return str;
          const s = String(str).trim();
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

  // ── WebSocket — created ONCE ───────────────────────────────────────────
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
    };

    socket.on('connect',    () => setSocketConnected(true));
    socket.on('disconnect', () => setSocketConnected(false));

    socket.on('hazards:init', (fullMap) => {
      roomHazardsRef.current = {};
      Object.entries(fullMap).forEach(([id, { type, intensity }]) => {
        const sid = String(id);
        const busStatus = type === 'buffer' ? 'smoke' : type;
        roomHazardsRef.current[sid] = { type, intensity };
        bus.emit('room:statusChange', { roomId: sid, status: busStatus });
      });
      setRoomHazards({ ...roomHazardsRef.current });
    });

    socket.on('hazards:update', (fullMap) => {
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
        bus.emit('room:statusChange', { roomId: id, status: 'clear' });
      });

      roomHazardsRef.current = newRef;
      setRoomHazards({ ...newRef });
    });

    // ── FIX 2: Listen for detection:alert and show guest notification ──
    socket.on('detection:alert', (alert) => {
      const { type, roomId: alertRoom } = alert;

      // Update hazard map (existing behaviour)
      if (type === 'fire' || type === 'smoke') {
        const sid = String(alertRoom);
        if (!roomHazardsRef.current[sid]) {
          const busStatus = type === 'buffer' ? 'smoke' : type;
          roomHazardsRef.current = {
            ...roomHazardsRef.current,
            [sid]: { type, intensity: alert.confidence || 1.0 },
          };
          setRoomHazards({ ...roomHazardsRef.current });
          bus.emit('room:statusChange', { roomId: sid, status: busStatus });
        }
      }

      // NEW: Show a guest-facing notification toast for any alert type
      const notifTypes = ['fire', 'smoke', 'security', 'medical', 'health'];
      if (notifTypes.includes(type) && alertRoom) {
        const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
        const normalizedType = type === 'health' ? 'medical' : type;
        setGuestAlerts(prev => [...prev.slice(-2), {
          id,
          roomId: String(alertRoom),
          type: normalizedType,
          source: alert.source || 'sensor',
          ts: Date.now(),
        }]);
        // Auto-dismiss after 8 seconds
        setTimeout(() => {
          setGuestAlerts(prev => prev.filter(a => a.id !== id));
        }, 8000);
      }
    });

    socket.on('alert:escalate', (data) => {
      if (data?.roomId) {
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
      const next = { ...roomHazardsRef.current };
      delete next[sid];
      roomHazardsRef.current = next;
      setRoomHazards({ ...next });
      bus.emit('room:statusChange', { roomId: sid, status: 'clear' });
      // Also dismiss any matching guest notification
      setGuestAlerts(prev => prev.filter(a => a.roomId !== sid));
    });

    return () => {
      socket.disconnect();
      delete window.triggerGuestSOS;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Voice guidance ─────────────────────────────────────────────────────
  const { speakRoute, speakAlert, replay } = useVoiceGuidance({
    guestName:    guestProfile?.name,
    isEvacuation: true,
  });

  // ── normalisePathIds ───────────────────────────────────────────────────
  const normalisePathIds = useCallback((rawPath) => {
    if (!rawPath || rawPath.length === 0) return [];
    const graph = hotelData.graph;
    if (!graph) return rawPath;

    const normalised = rawPath.map(id => {
      const sid = String(id);
      if (graph[sid]) return sid;
      const trimmed = sid.trim();
      if (graph[trimmed]) return trimmed;
      const padded = sid.padStart(4, '0');
      if (graph[padded]) return padded;
      const unpadded = String(parseInt(sid, 10));
      if (graph[unpadded]) return unpadded;
      console.warn(`[GuestApp] normalisePathIds: node "${sid}" not found in hotelData.graph`);
      return null;
    }).filter(Boolean);

    if (normalised.length < rawPath.length) {
      console.warn(
        `[GuestApp] Path trimmed from ${rawPath.length} to ${normalised.length} nodes.`,
        '\nOriginal:', rawPath,
        '\nNormalised:', normalised,
        '\nSample graph keys:', Object.keys(graph).slice(0, 15),
      );
    }
    return normalised;
  }, []);

  // ── Dijkstra path recalc whenever roomId or hazards change ────────────
  useEffect(() => {
    if (!roomId) return;

    const rawPath      = findEvacuationPath(roomId, roomHazards);
    const safePath     = normalisePathIds(rawPath);
    setPath(safePath);

    const steps = pathToSteps(safePath);
    setNavSteps(steps);
    setStepIndex(0);

    const fireRooms = Object.keys(roomHazards).filter(
      id => roomHazards[id].type === 'fire' || roomHazards[id].type === 'smoke'
    );

    if (fireRooms.length > 0) {
      if (fireRooms.includes(roomId)) {
        speakAlert('Emergency Alert. A hazard has been detected in your room. Please evacuate immediately!');
      } else if (safePath.length > 0) {
        speakAlert(
          'Attention. A hazard has been detected nearby. Your route has been updated to avoid the affected area. Please follow the revised directions.'
        );
      }
    }
  }, [roomId, roomHazards, normalisePathIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Find Exit button ───────────────────────────────────────────────────
  const handleGeneratePath = () => {
    if (!hotelData.graph[roomId]) {
      alert(`Invalid room ID "${roomId}". Available rooms: ${Object.keys(hotelData.graph).filter(k => hotelData.graph[k].type === 'guest').slice(0, 5).join(', ')}…`);
      return;
    }
    const rawPath  = findEvacuationPath(roomId, roomHazards);
    const safePath = normalisePathIds(rawPath);
    setPath(safePath);
    const steps = pathToSteps(safePath);
    setNavSteps(steps);
    setStepIndex(0);
    if (safePath.length > 0) {
      const script = buildAudioScript(safePath, guestProfile?.name, language);
      speakAlert(script);
    }
  };

  // ── Next step ─────────────────────────────────────────────────────────
  const handleNextStep = () => {
    setStepIndex(prev => Math.min(prev + 1, navSteps.length - 1));
  };

  // ── Speak current step ────────────────────────────────────────────────
  const handleSpeakPressed = () => {
    const step = navSteps[stepIndex];
    if (step) {
      const localStep = localiseStep(step, language);
      speakAlert(localStep.instruction);
      setVoiceActive(true);
      setTimeout(() => setVoiceActive(false), 4000);
    } else {
      speakAlert(buildAudioScript(path, guestProfile?.name, language));
    }
  };

  // ── Language toggle ────────────────────────────────────────────────────
  const handleLanguageToggle = useCallback(() => {
    setLanguage(prev => {
      const next = prev === 'en' ? 'hi' : 'en';
      VoiceGuidanceService.setLanguage(next);
      VoiceGuidanceService.speak(
        next === 'hi'
          ? 'भाषा हिंदी में बदल दी गई है।'
          : 'Language switched to English.'
      );
      return next;
    });
  }, []);

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

  // ── FIX 2: Alert notification config ──────────────────────────────────
  const alertNotifConfig = {
    fire:     { bg: 'rgba(239,68,68,0.18)',  border: 'rgba(239,68,68,0.55)',  icon: '🔥', label: 'FIRE ALERT',     textColor: '#fca5a5', pulse: 'rgba(239,68,68,0.4)' },
    smoke:    { bg: 'rgba(251,146,60,0.18)', border: 'rgba(251,146,60,0.55)', icon: '🌫️', label: 'SMOKE DETECTED', textColor: '#fdba74', pulse: 'rgba(251,146,60,0.4)' },
    security: { bg: 'rgba(139,92,246,0.18)', border: 'rgba(139,92,246,0.55)', icon: '🛡️', label: 'SECURITY ALERT', textColor: '#c4b5fd', pulse: 'rgba(139,92,246,0.4)' },
    medical:  { bg: 'rgba(59,130,246,0.18)', border: 'rgba(59,130,246,0.55)', icon: '⚕️', label: 'MEDICAL ALERT',  textColor: '#93c5fd', pulse: 'rgba(59,130,246,0.4)' },
  };

  const dismissAlert = (id) => setGuestAlerts(prev => prev.filter(a => a.id !== id));

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#0d0d1a',
      color: '#fff',
      fontFamily: "'Inter', sans-serif",
      overflow: 'hidden',
      position: 'relative',
    }}>

      {/* ── FIX 2: Guest alert notification toasts ─────────────────────── */}
      {guestAlerts.length > 0 && (
        <div style={{
          position: 'absolute',
          top: viewMode === 'pov' ? 40 : 12,
          left: 10,
          right: 10,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'none',
        }}>
          {guestAlerts.map(alert => {
            const c = alertNotifConfig[alert.type] || alertNotifConfig.fire;
            const isGuestTriggered = alert.source === 'guest_sos';
            return (
              <div
                key={alert.id}
                style={{
                  background: c.bg,
                  border: `1.5px solid ${c.border}`,
                  borderRadius: 16,
                  padding: '12px 14px',
                  backdropFilter: 'blur(16px)',
                  boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px ${c.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  animation: 'guestAlertIn 0.35s cubic-bezier(0.34,1.56,0.64,1)',
                  pointerEvents: 'all',
                }}
              >
                {/* Pulsing dot */}
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: c.border,
                  flexShrink: 0,
                  boxShadow: `0 0 0 0 ${c.pulse}`,
                  animation: 'alertDotPulse 1.4s ease-in-out infinite',
                }} />

                {/* Icon */}
                <span style={{ fontSize: 24, flexShrink: 0 }}>{c.icon}</span>

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: c.textColor,
                    letterSpacing: 2,
                    fontFamily: "'Rajdhani', sans-serif",
                    marginBottom: 3,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}>
                    {c.label}
                    {isGuestTriggered && (
                      <span style={{
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 10,
                        padding: '1px 6px',
                        fontSize: 8,
                        color: 'rgba(255,255,255,0.5)',
                        letterSpacing: 1,
                      }}>GUEST SOS</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 500, lineHeight: 1.4 }}>
                    {isGuestTriggered
                      ? `A guest in Room ${alert.roomId} triggered the alarm. Stay alert.`
                      : `Incident detected in Room ${alert.roomId}. Follow staff instructions.`
                    }
                  </div>
                </div>

                {/* Dismiss */}
                <button
                  onClick={() => dismissAlert(alert.id)}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    width: 28,
                    height: 28,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'rgba(255,255,255,0.5)',
                    fontSize: 14,
                    cursor: 'pointer',
                    flexShrink: 0,
                    transition: 'background 0.15s',
                  }}
                >✕</button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── FIX 1: UI Panel — compact in POV mode, full in map mode ──── */}
      {viewMode === 'pov' ? (
        /* POV mode: ultra-compact top bar — just one line of info */
        <div style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '5px 12px',
          background: 'rgba(13,13,26,0.95)',
          zIndex: 100,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          height: 34,
        }}>
          <div style={{
            fontSize: 10,
            color: '#64748b',
            fontFamily: "'Rajdhani', sans-serif",
            letterSpacing: 1,
            fontWeight: 600,
          }}>
            ROOM {roomId || '--'} · FLOOR {guestProfile?.floor ?? '--'}
          </div>

          {path.length > 0 && (
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1,
              fontFamily: "'Rajdhani', sans-serif",
              color: blockedRoomsList.length > 0 ? '#fb923c' : '#22c55e',
            }}>
              {path.length} STOPS
              {blockedRoomsList.length > 0 ? ` · ⚠ ${blockedRoomsList.length} HAZARD${blockedRoomsList.length > 1 ? 'S' : ''} AVOIDED` : ' · CLEAR'}
            </div>
          )}

          <button
            onClick={() => setViewMode('map')}
            style={{
              // A rich, multi-stop dark gradient that adds depth and mimics a premium metallic panel
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', 
              
              // An intense cyber-blue border that mimics a glowing circuit accent
              border: '1px solid #38bdf8', 
              borderRadius: 6,
              
              // Increased padding slightly for an easier, distinct interactive tap area
              padding: '3px 10px', 
              color: '#38bdf8', // Made the text itself match the neon blue theme for a uniform HUD element
              fontSize: 11, 
              fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 700,
              letterSpacing: '1.5px', 
              cursor: 'pointer',
              textTransform: 'uppercase',
              
              // Double layered shadow: crisp internal button depth + external neon atmospheric aura
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 15px rgba(56, 189, 248, 0.35)', 
              
              // Alignment flex to keep the new icon and text perfectly balanced
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              
              transition: 'all 0.2s ease-in-out',
            }}
            // Interactive hover style logic can be added, but this base makes it stand out immediately
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 22px rgba(56, 189, 248, 0.6)';
              e.currentTarget.style.background = 'linear-gradient(135deg, #27354d 0%, #111a2e 100%)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 15px rgba(56, 189, 248, 0.35)';
              e.currentTarget.style.background = 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)';
            }}
          >
            <span style={{ fontSize: '13px', filter: 'drop-shadow(0 0 4px #38bdf8)' }}>🗺️</span> MAP
          </button>
        </div>
      ) : (
        /* Normal map mode: full panel */
        <div style={{
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '10px 12px 8px',
          background: '#0d0d1a',
          zIndex: 100,
        }}>

          {/* Room input + Find Exit + view toggle */}
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

          {/* Evacuation route display */}
          {path.length > 0 && (
            <div style={{
              background: 'rgba(13, 13, 26, 0.9)',
              border: '1px solid rgba(255,255,255,0.08)',
              padding: '12px 14px',
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
                fontSize: '12px',
                lineHeight: 1.5,
                color: '#e2e8f0',
                fontWeight: 500,
                fontFamily: "'Inter', sans-serif",
                wordBreak: 'break-all',
              }}>
                {path.join(' ➔ ')}
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
      )}

      {/* ── 3D canvas ── */}
      <div style={{
        flex: 1,
        minHeight: 0,
        position: 'relative',
        overflow: 'hidden',
      }}>

        {/* Status badges — only show in map mode */}
        {viewMode !== 'pov' && (
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
        )}

        {viewMode === 'pov' && path.length > 0 ? (
          <NavigationView
            currentStep={localiseStep(navSteps[stepIndex] || null, language)}
            totalSteps={navSteps.length}
            stepIndex={stepIndex}
            onNext={handleNextStep}
            onSpeakPressed={handleSpeakPressed}
            voiceActive={voiceActive}
            dangerRooms={alertRooms}
            evacuationDone={stepIndex >= navSteps.length - 1 && navSteps.length > 0 && navSteps[navSteps.length - 1]?.label === 'EXIT'}
            language={language}
            onLanguageToggle={handleLanguageToggle}
          />
        ) : (
          <HotelView3D
            key={`guest-map-${path.join('-')}`}
            evacuationPath={path}
            viewMode={viewMode}
            focusRoomId={roomId}
            isGuest={true}
            alertRooms={alertRooms}
            roomStatuses={derivedRoomStatuses}
          />
        )}
      </div>

      {/* ── Keyframe animations ── */}
      <style>{`
        @keyframes guestAlertIn {
          from { opacity: 0; transform: translateY(-12px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes alertDotPulse {
          0%   { box-shadow: 0 0 0 0 rgba(239,68,68,0.6); }
          70%  { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
          100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
        }
      `}</style>
    </div>
  );
}