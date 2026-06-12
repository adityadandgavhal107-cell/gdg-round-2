import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import bus from './core/EventBus.js';
import HotelView3D from './views/HotelView3D.jsx';
import { hotelData, findRescuePath } from './data/hotel.js';
import webRTCManager from './core/WebRTCManager.js';
import config from './core/config.js';

/* ─────────────────────────────────────────────────────────────────────────
   DAFApp.jsx  —  matches LandingPage.jsx visual language
   Key changes vs original:
     • Incidents are persisted to localStorage (DAF_INCIDENTS_KEY) so they
       survive page refreshes.  They are ONLY removed when the room is
       explicitly resolved (clearZone) — never auto-dismissed.
     • On mount the app rehydrates from localStorage AND emits
       room:statusChange for every restored incident so the 3-D map colours
       up correctly.
     • A persistent "UNRESOLVED" banner replaces the previous AlertBanner
       that was only rendered when activeIncidents.length > 0 — it now stays
       visible until every incident has been cleared.
     • No <form> tags — button uses onClick, not onSubmit.
───────────────────────────────────────────────────────────────────────── */

const DAF_INCIDENTS_KEY = 'daf_active_incidents';

/* ── Persistence helpers ──────────────────────────────────────────────── */
function loadPersistedIncidents() {
  try {
    const raw = localStorage.getItem(DAF_INCIDENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Drop anything older than 24 h to prevent ghost incidents
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return parsed.filter(i => i._savedAt && i._savedAt >= cutoff);
  } catch {
    return [];
  }
}

function saveIncidents(incidents) {
  try {
    const stamped = incidents.map(i => ({ ...i, _savedAt: i._savedAt ?? Date.now() }));
    localStorage.setItem(DAF_INCIDENTS_KEY, JSON.stringify(stamped));
  } catch (e) {
    console.warn('[DAFApp] Could not persist incidents:', e);
  }
}

function removePersistedIncident(roomId) {
  try {
    const current = loadPersistedIncidents();
    const next = current.filter(i => String(i.roomId) !== String(roomId));
    localStorage.setItem(DAF_INCIDENTS_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

/* ─────────────────────────────────────────────────────────────────────── */

const OTP_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap');

  .daf-otp-root *, .daf-otp-root *::before, .daf-otp-root *::after {
    box-sizing: border-box; margin: 0; padding: 0;
  }

  .material-symbols-outlined {
    font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
    font-family: 'Material Symbols Outlined';
    font-style: normal; line-height: 1; display: inline-block;
    text-transform: none; letter-spacing: normal; word-wrap: normal;
    white-space: nowrap; direction: ltr;
    -webkit-font-smoothing: antialiased; vertical-align: middle;
  }

  .daf-otp-root {
    font-family: 'JetBrains Mono', monospace;
    background-color: #131314;
    color: #e3e3e3;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    overflow-x: hidden;
    position: relative;
  }

  .daf-canvas {
    position: fixed; top: 0; left: 0;
    width: 100%; height: 100%;
    z-index: 0; pointer-events: none; opacity: 0.35;
  }

  .daf-otp-header {
    position: relative; z-index: 10;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 2rem; height: 80px; flex-shrink: 0;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    background: rgba(19,19,20,0.90);
    backdrop-filter: blur(24px);
    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
  }
  .daf-otp-header-left { display: flex; align-items: center; gap: 1rem; }
  .daf-logo-word {
    font-weight: 900; letter-spacing: 0.25em;
    color: #00d2ff; font-size: 18px;
    font-family: 'JetBrains Mono', monospace;
  }
  .daf-logo-sub {
    color: #444746;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px; letter-spacing: 0.3em; font-weight: 600;
  }
  .daf-status-pill {
    display: flex; align-items: center; gap: 0.75rem;
    background: rgba(0,210,255,0.10);
    padding: 10px 20px; border-radius: 9999px;
    border: 1px solid rgba(0,210,255,0.20);
    box-shadow: 0 0 15px rgba(0,210,255,0.3);
  }
  .daf-status-dot {
    width: 10px; height: 10px; border-radius: 50%;
    background: #00d2ff;
    animation: daf-pulse 1.5s cubic-bezier(0.4,0,0.6,1) infinite;
  }
  @keyframes daf-pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
  .daf-status-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px; letter-spacing: 0.2em; font-weight: 700;
    color: #00d2ff; text-transform: uppercase;
  }

  .daf-otp-body {
    position: relative; z-index: 10;
    flex: 1; display: flex; align-items: center; justify-content: center;
    padding: 3rem 1.5rem;
  }

  .daf-otp-card {
    background: #1c1b1c;
    border: 1px solid rgba(255,255,255,0.05);
    border-radius: 1.25rem; overflow: hidden;
    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
    max-width: 460px; width: 100%;
    transition: border-color 0.3s;
  }
  .daf-otp-card:hover { border-color: rgba(0,210,255,0.3); }

  .daf-otp-bar {
    height: 10px;
    background: linear-gradient(90deg, #00d2ff, #0077ff);
    box-shadow: 0 0 15px rgba(0,210,255,0.4);
  }

  .daf-otp-inner {
    padding: 2.5rem;
    display: flex; flex-direction: column; gap: 2rem;
  }

  .daf-otp-top { text-align: center; display: flex; flex-direction: column; gap: 0.75rem; }
  .daf-otp-icon-wrap {
    width: 72px; height: 72px; border-radius: 50%;
    background: rgba(0,210,255,0.10);
    border: 1px solid rgba(0,210,255,0.25);
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 0.5rem;
    box-shadow: 0 0 20px rgba(0,210,255,0.1);
    transition: transform 0.3s;
  }
  .daf-otp-card:hover .daf-otp-icon-wrap { transform: scale(1.05); }
  .daf-otp-icon {
    font-size: 36px !important; color: #00d2ff;
    font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  }
  .daf-otp-title {
    font-family: 'Inter', sans-serif;
    font-size: 24px; font-weight: 700;
    color: #e3e3e3; text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  .daf-otp-subtitle {
    font-family: 'Inter', sans-serif;
    font-size: 15px; line-height: 1.6; font-weight: 400;
    color: rgba(196,199,197,1);
  }

  .daf-team-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
  }
  .daf-team-pill {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 14px; border-radius: 0.5rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px; font-weight: 700; letter-spacing: 0.15em;
    text-transform: uppercase;
    transition: background 0.2s, border-color 0.2s;
  }
  .daf-team-pill.active {
    background: rgba(0,210,255,0.08);
    border: 1px solid rgba(0,210,255,0.25);
    color: #00d2ff;
  }
  .daf-team-pill.inactive {
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.06);
    color: rgba(196,199,197,0.35);
  }
  .daf-team-dot {
    width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
  }
  .daf-team-dot.active { background: #00d2ff; box-shadow: 0 0 6px rgba(0,210,255,0.6); }
  .daf-team-dot.inactive { background: rgba(255,255,255,0.12); }

  .daf-otp-field { display: flex; flex-direction: column; gap: 8px; }
  .daf-otp-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px; font-weight: 700; letter-spacing: 0.25em;
    text-transform: uppercase; color: #00d2ff;
  }
  .daf-otp-input {
    width: 100%;
    background: #ffffff;
    border: 1px solid #444746;
    color: #000000;
    padding: 20px 24px;
    border-radius: 0.75rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 32px; font-weight: 700;
    text-align: center; letter-spacing: 18px;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .daf-otp-input:focus {
    outline: none;
    border-color: #00d2ff;
    box-shadow: 0 0 0 2px rgba(0,210,255,0.15);
  }
  .daf-otp-input.error {
    border-color: #ffb4ab;
    box-shadow: 0 0 0 2px rgba(255,180,171,0.15);
  }

  .daf-error {
    display: flex; align-items: center; gap: 6px;
    color: #ffb4ab;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
    background: rgba(255,180,171,0.08);
    border: 1px solid rgba(255,180,171,0.2);
    padding: 10px 14px; border-radius: 0.5rem;
  }

  .daf-info-box {
    background: rgba(0,210,255,0.05);
    border: 1px solid rgba(0,210,255,0.15);
    border-radius: 0.5rem;
    padding: 14px 16px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px; letter-spacing: 0.08em;
    color: rgba(196,199,197,0.65); line-height: 1.7;
  }
  .daf-info-box strong {
    color: #00d2ff; display: block;
    margin-bottom: 4px; font-size: 10px;
    letter-spacing: 0.2em; text-transform: uppercase;
  }

  .daf-otp-btn {
    width: 100%; padding: 20px;
    border-radius: 0.75rem; border: none;
    font-family: 'Inter', sans-serif;
    font-size: 18px; font-weight: 700;
    letter-spacing: 0.1em; text-transform: uppercase;
    cursor: pointer;
    background: #00d2ff; color: #003544;
    box-shadow: 0 20px 25px -5px rgba(0,210,255,0.2), 0 8px 10px -6px rgba(0,210,255,0.2);
    transition: opacity 0.2s, transform 0.1s;
    display: flex; align-items: center; justify-content: center; gap: 10px;
  }
  .daf-otp-btn:hover { opacity: 0.9; }
  .daf-otp-btn:active { transform: scale(0.97); }
  .daf-otp-btn:disabled { opacity: 0.6; cursor: not-allowed; }

  .daf-spinner {
    display: inline-block; width: 18px; height: 18px;
    border: 2px solid rgba(0,53,68,0.4);
    border-top-color: #003544;
    border-radius: 50%;
    animation: daf-spin 0.7s linear infinite;
  }
  @keyframes daf-spin { to { transform: rotate(360deg); } }

  @keyframes daf-fade-in {
    from { opacity: 0; transform: translateY(24px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .daf-otp-card { animation: daf-fade-in 0.5s cubic-bezier(0.4,0,0.2,1) forwards; }
`;

const TEAM_FALLBACK_CODES = {
  ALPHA:   '4821',
  BETA:    '9281',
  CHARLIE: '6512',
  DELTA:   '1104',
};

const TEAMS = ['ALPHA', 'BETA', 'CHARLIE', 'DELTA'];

function resolveTeamFromOtp(otp) {
  for (const team of TEAMS) {
    const stored = localStorage.getItem(`daf_otp_${team.toLowerCase()}`);
    if (stored && stored === otp) return team;
  }
  for (const team of TEAMS) {
    if (TEAM_FALLBACK_CODES[team] === otp) return team;
  }
  return null;
}

/* ── Particle Canvas ─────────────────────────────────────────────────── */
function OTPParticleCanvas() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    const particles = [];
    function resize() {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);
    function rnd(a, b) { return a + Math.random() * (b - a); }
    for (let i = 0; i < 60; i++) {
      particles.push({
        x: rnd(0, window.innerWidth), y: rnd(0, window.innerHeight),
        r: rnd(1, 2.5), dx: rnd(-0.3, 0.3), dy: rnd(-0.6, -0.15),
        alpha: rnd(0.2, 0.7),
        color: Math.random() > 0.5 ? '#00d2ff' : '#004a77',
      });
    }
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color; ctx.globalAlpha = p.alpha; ctx.fill();
        p.x += p.dx; p.y += p.dy;
        if (p.y < -10) { p.y = canvas.height + 10; p.x = rnd(0, canvas.width); }
        if (p.x < -10 || p.x > canvas.width + 10) p.x = rnd(0, canvas.width);
      });
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(raf); };
  }, []);
  return <canvas ref={canvasRef} className="daf-canvas" />;
}

/* ── OTP Login Screen ─────────────────────────────────────────────────── */
function OTPLoginScreen({ onAuthenticated }) {
  const [otp, setOtp]         = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = useCallback(() => {
    if (!otp.trim()) { setError('Enter your 4-digit team code.'); return; }
    setError('');
    setLoading(true);
    setTimeout(() => {
      const matched = resolveTeamFromOtp(otp.trim());
      setLoading(false);
      if (!matched) {
        setError('INVALID AUTHORIZATION CODE — Contact Command Admin.');
        return;
      }
      localStorage.setItem('daf_team', matched);
      onAuthenticated(matched);
    }, 600);
  }, [otp, onAuthenticated]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleLogin();
  }, [handleLogin]);

  return (
    <div className="daf-otp-root">
      <style>{OTP_STYLES}</style>
      <OTPParticleCanvas />

      <header className="daf-otp-header">
        <div className="daf-otp-header-left">
          <span className="daf-logo-word">FIREGUARD</span>
          <span className="daf-logo-sub">HMS</span>
        </div>
        <div className="daf-status-pill">
          <div className="daf-status-dot" />
          <span className="daf-status-label">DAF TACTICAL</span>
        </div>
      </header>

      <div className="daf-otp-body">
        <div className="daf-otp-card">
          <div className="daf-otp-bar" />
          <div className="daf-otp-inner">

            <div className="daf-otp-top">
              <div className="daf-otp-icon-wrap">
                <span className="material-symbols-outlined daf-otp-icon">local_fire_department</span>
              </div>
              <h1 className="daf-otp-title">DAF Tactical</h1>
              <p className="daf-otp-subtitle">
                Enter your 4-digit team authorization code to access the tactical command dashboard.
              </p>
            </div>

            <div className="daf-team-grid">
              {TEAMS.map(team => {
                const hasCode = !!localStorage.getItem(`daf_otp_${team.toLowerCase()}`);
                return (
                  <div key={team} className={`daf-team-pill ${hasCode ? 'active' : 'inactive'}`}>
                    <div className={`daf-team-dot ${hasCode ? 'active' : 'inactive'}`} />
                    {team}
                    <span style={{ marginLeft: 'auto', fontSize: 9, opacity: hasCode ? 1 : 0.5 }}>
                      {hasCode ? 'ACTIVE' : 'NO CODE'}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="daf-otp-field">
                <label className="daf-otp-label">Team Auth Code (4-digit OTP)</label>
                <input
                  className={`daf-otp-input${error ? ' error' : ''}`}
                  type="password"
                  maxLength={4}
                  value={otp}
                  autoFocus
                  placeholder="••••"
                  onChange={e => { setOtp(e.target.value); setError(''); }}
                  onKeyDown={handleKeyDown}
                />
              </div>

              {error && (
                <div className="daf-error">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>warning</span>
                  {error}
                </div>
              )}

              <div className="daf-info-box">
                <strong>Authentication Flow</strong>
                Codes are generated by the Command Admin under the DAF section.
                Each team (Alpha / Beta / Charlie / Delta) has a unique OTP
                valid for this session only.
              </div>

              <button
                className="daf-otp-btn"
                onClick={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="daf-spinner" />
                    AUTHENTICATING…
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                      shield_lock
                    </span>
                    INITIATE SESSION
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

/* ── PIP Camera ──────────────────────────────────────────────────────── */
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
      <video
        ref={videoRef} autoPlay playsInline muted
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

/* ── Persistent Alert Banner ─────────────────────────────────────────── */
/*  Unlike the original AlertBanner (which returned null when empty), this
    one is ALWAYS rendered but collapses gracefully when there are no active
    incidents. This prevents layout jump and makes it clear to the DAF
    operator that the system is watching.                                   */
function PersistentAlertBanner({ incidents }) {
  if (!incidents || incidents.length === 0) {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
        background: 'linear-gradient(90deg,rgba(0,40,20,0.95),rgba(0,60,30,0.95))',
        color: '#00ff88', padding: '6px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        fontWeight: 700, fontSize: 11, letterSpacing: 2,
        borderBottom: '1px solid rgba(0,255,136,0.2)',
      }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 8px #00ff88' }} />
        ALL ZONES CLEAR — SYSTEM NOMINAL
      </div>
    );
  }

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
          (+{incidents.length - 1} more active)
        </span>
      )}
      <span style={{ fontSize: 9, letterSpacing: 3, opacity: 0.7, marginLeft: 8 }}>
        AWAITING RESOLUTION
      </span>
      <span style={{ fontSize: 20 }}>{icon}</span>
    </div>
  );
}

/* ── normalisePathIds ────────────────────────────────────────────────── */
function normalisePathIds(rawPath) {
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
    console.warn(`[DAFApp] normalisePathIds: node "${sid}" not found in hotelData.graph`);
    return null;
  }).filter(Boolean);

  if (normalised.length < rawPath.length) {
    console.warn(
      `[DAFApp] Path trimmed ${rawPath.length} → ${normalised.length} nodes.`,
      '\nOriginal:', rawPath,
      '\nNormalised:', normalised,
      '\nSample graph keys:', Object.keys(graph).slice(0, 15),
    );
  }
  return normalised;
}

/* ─────────────────────────────────────────────────────────────────────────
   Main DAFApp
───────────────────────────────────────────────────────────────────────── */
export default function DAFApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [teamName, setTeamName]               = useState('');

  // ── Incident state: seeded from localStorage on mount ──────────────
  const [activeIncidents, setActiveIncidents]   = useState([]);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [rescuePath, setRescuePath]             = useState([]);
  const [distance, setDistance]                 = useState(0);
  const [isCalculating, setIsCalculating]       = useState(false);

  const [socketConnected, setSocketConnected] = useState(false);
  const [liveStreams, setLiveStreams]          = useState({});
  const [clearingRooms, setClearingRooms]     = useState({});
  const [pathVersion, setPathVersion]         = useState(0);

  const socketRef = useRef(null);

  /* ── Restore session ─────────────────────────────────────────────── */
  useEffect(() => {
    const savedTeam = localStorage.getItem('daf_team');
    if (savedTeam) { setTeamName(savedTeam); setIsAuthenticated(true); }
  }, []);

  /* ── Rehydrate persisted incidents after authentication ──────────── */
  useEffect(() => {
    if (!isAuthenticated) return;
    const persisted = loadPersistedIncidents();
    if (persisted.length === 0) return;

    setActiveIncidents(persisted);
    setSelectedIncident(persisted[0]);

    // Re-paint 3-D map rooms for each restored incident
    persisted.forEach(inc => {
      bus.emit('room:statusChange', { roomId: String(inc.roomId), status: inc.type });
    });
  }, [isAuthenticated]);

  const handleAuthenticated = useCallback((team) => {
    setTeamName(team);
    setIsAuthenticated(true);
  }, []);

  /* ── Socket + WebRTC ──────────────────────────────────────────────── */
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

    const _seen = new Set();

    function handleAlert(alert) {
      if (!alert || !alert.roomId) return;
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
        _savedAt: Date.now(),
      };

      setActiveIncidents(prev => {
        const exists = prev.find(i => i.roomId === roomId && i.type === alert.type);
        if (exists) return prev;
        const next = [newInc, ...prev];
        saveIncidents(next);            // ← persist immediately
        bus.emit('room:statusChange', { roomId, status: alert.type });
        return next;
      });

      setSelectedIncident(prev => prev ?? newInc);
    }

    socket.on('detection:alert', handleAlert);
    socket.on('alert:escalate',  handleAlert);

    // Server-side or Admin-side resolution
    socket.on('alert:resolved', ({ roomId }) => {
      removeIncident(String(roomId));
    });

    // Also listen to the local event bus (covers Admin resolving via AlertPanel
    // in the same browser tab as a DAF operator — unlikely but safe)
    const unsubBusResolved = bus.on('alert:resolved', ({ roomId }) => {
      if (roomId) removeIncident(String(roomId));
    });

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
      unsubBusResolved();
    };
  }, [isAuthenticated, teamName]);

  /* ── Remove incident (with animation) ───────────────────────────── */
  function removeIncident(roomId) {
    setClearingRooms(prev => ({ ...prev, [roomId]: true }));
    setTimeout(() => {
      setActiveIncidents(prev => {
        const next = prev.filter(i => i.roomId !== roomId);
        saveIncidents(next);            // ← persist the updated list
        return next;
      });
      setSelectedIncident(prev => prev?.roomId !== roomId ? prev : null);
      setClearingRooms(prev => { const n = { ...prev }; delete n[roomId]; return n; });
      removePersistedIncident(roomId); // belt-and-suspenders cleanup
      bus.emit('room:statusChange', { roomId, status: 'clear' });
    }, 400);
  }

  /* ── Clear Zone ──────────────────────────────────────────────────── */
  function clearZone(inc) {
    const roomId = String(inc.roomId);
    if (socketRef.current?.connected) {
      socketRef.current.emit('alert:resolved', { roomId, clearedBy: teamName });
    }
    bus.emit('alert:resolved', { roomId });
    removeIncident(roomId);
  }

  /* ── Navigation ──────────────────────────────────────────────────── */
  const startNavigation = useCallback((incident) => {
    if (!incident?.roomId) return;
    setIsCalculating(true);
    setSelectedIncident(incident);
    setTimeout(() => {
      const rawPath  = findRescuePath(String(incident.roomId), 'EXIT_LEFT') || [];
      const safePath = normalisePathIds(rawPath);

      console.log('[DAFApp] startNavigation — raw path:', rawPath);
      console.log('[DAFApp] startNavigation — normalised path:', safePath);

      setRescuePath(safePath);
      setDistance((safePath.length || 0) * 4.5);
      setPathVersion(v => v + 1);
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

  useEffect(() => {
    if (!selectedIncident && activeIncidents.length > 0) {
      setSelectedIncident(activeIncidents[0]);
    }
  }, [activeIncidents, selectedIncident]);

  /* ── Logout ──────────────────────────────────────────────────────── */
  const handleLogout = () => {
    localStorage.removeItem('daf_team');
    // NOTE: we intentionally do NOT clear DAF_INCIDENTS_KEY on logout —
    // the next team member who logs in should see the same unresolved alerts.
    setIsAuthenticated(false);
    setTeamName('');
    setActiveIncidents([]);
    setSelectedIncident(null);
    setRescuePath([]);
    setPathVersion(0);
  };

  const alertRoomIds = activeIncidents.map(i => String(i.roomId));

  /* ── OTP gate ────────────────────────────────────────────────────── */
  if (!isAuthenticated) {
    return <OTPLoginScreen onAuthenticated={handleAuthenticated} />;
  }

  /* ── Banner height offset: 44 px when alert, 30 px when clear ─── */
  const bannerHeight = activeIncidents.length > 0 ? 44 : 30;

  /* ── Tactical dashboard ──────────────────────────────────────────── */
  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      background: '#0a0505', color: '#fff', fontFamily: 'Inter, sans-serif',
    }}>
      {/* Always-present banner — red when alerts exist, green when clear */}
      <PersistentAlertBanner incidents={activeIncidents} />

      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        marginTop: bannerHeight,
        transition: 'margin-top 0.3s',
      }}>
        {isCalculating && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(255,45,45,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none', backdropFilter: 'blur(2px)',
          }}>
            <div style={{
              fontSize: 14, fontWeight: 900, color: '#ff2d2d',
              letterSpacing: 5, animation: 'blink 0.5s infinite',
            }}>
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
              {/* ⚠️  NO "Clear All" button on DAF side either — each incident
                   must be individually confirmed safe before clearing.        */}
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
                      transition: 'all 0.4s',
                      boxShadow: selectedIncident?.roomId === inc.roomId
                        ? '0 0 15px rgba(255,45,45,0.2)' : 'none',
                      animation: isClearing ? 'none' : 'incidentPulse 2s infinite',
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
                        color: inc.type === 'audio' ? '#000' : '#fff', flexShrink: 0,
                      }}>
                        {(inc.severity || 'HIGH').toUpperCase()}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 6, fontFamily: 'JetBrains Mono' }}>
                      SENSOR: {inc.type.toUpperCase()} / {Math.round((inc.confidence || 0.85) * 100)}% CONF
                    </div>

                    {/* Persist timestamp so DAF always knows when this was first triggered */}
                    {inc._savedAt && (
                      <div style={{ fontSize: 10, color: 'rgba(255,80,80,0.45)', marginTop: 4, fontFamily: 'JetBrains Mono' }}>
                        LOGGED {new Date(inc._savedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                    )}

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
                      <button
                        onClick={e => { e.stopPropagation(); clearZone(inc); }}
                        style={{
                          flex: 1, padding: '10px',
                          background: 'rgba(0,255,136,0.1)',
                          border: '1px solid rgba(0,255,136,0.35)',
                          borderRadius: 6, color: '#00ff88',
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
              key={`daf-map-v${pathVersion}`}
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
                  {rescuePath.join(' ➔ ')}
                </div>
                <button
                  onClick={() => clearZone(selectedIncident)}
                  style={{
                    width: '100%', marginTop: 16, padding: '10px',
                    background: 'rgba(0,255,136,0.1)',
                    border: '1px solid rgba(0,255,136,0.35)',
                    borderRadius: 6, color: '#00ff88',
                    fontSize: 11, fontWeight: 900, cursor: 'pointer', letterSpacing: 1,
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