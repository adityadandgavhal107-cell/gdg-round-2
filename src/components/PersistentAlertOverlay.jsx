/**
 * PersistentAlertOverlay.jsx
 *
 * A full-time alert strip that renders on BOTH the Admin dashboard and the
 * DAF tactical dashboard.  It is ALWAYS mounted — it never returns null.
 * When there are no unresolved alerts it shows a calm "ALL CLEAR" bar.
 * When alerts exist it shows a prominent, pulsing banner with every active
 * incident listed, plus individual RESOLVE buttons.
 *
 * Usage (identical in both App.jsx and DAFApp.jsx):
 *
 *   import PersistentAlertOverlay from './components/PersistentAlertOverlay.jsx';
 *
 *   // Inside the JSX, right after the opening wrapper div:
 *   <PersistentAlertOverlay
 *     incidents={activeIncidents}   // array of { roomId, type, severity, confidence, _savedAt }
 *     onResolve={(inc) => clearZone(inc)}   // called when the operator clicks RESOLVE
 *   />
 *
 * The component occupies a fixed top bar (height = BANNER_H px).  The
 * parent layout must offset its content by the same amount; the component
 * exports the constant OVERLAY_BANNER_H for that purpose.
 */

import { useState, useEffect, useRef } from 'react';

export const OVERLAY_BANNER_H = 52; // px — import this in the parent to set marginTop

const TYPE_META = {
  fire:     { icon: '🔥', label: 'FIRE',     accent: '#ff2d2d', glow: 'rgba(255,45,45,0.55)'  },
  smoke:    { icon: '💨', label: 'SMOKE',    accent: '#ff8800', glow: 'rgba(255,136,0,0.45)'  },
  audio:    { icon: '🔊', label: 'AUDIO',    accent: '#ffd700', glow: 'rgba(255,215,0,0.40)'  },
  medical:  { icon: '⚕️', label: 'MEDICAL',  accent: '#06b6d4', glow: 'rgba(6,182,212,0.45)'  },
  security: { icon: '🛡️', label: 'SECURITY', accent: '#8b5cf6', glow: 'rgba(139,92,246,0.45)' },
};

const MONO = "'JetBrains Mono', 'Courier New', monospace";
const SANS = "'Inter', system-ui, sans-serif";

/* ── tiny hook: blinking cursor tick ─────────────────────────────────── */
function useTick(ms = 600) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setOn(v => !v), ms);
    return () => clearInterval(id);
  }, [ms]);
  return on;
}

/* ── single incident pill ─────────────────────────────────────────────── */
function IncidentPill({ inc, onResolve, isResolving }) {
  const meta = TYPE_META[inc.type] || TYPE_META.fire;
  const tick = useTick(800);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '0 14px', height: '100%',
      borderLeft: `2px solid ${meta.accent}`,
      background: `linear-gradient(90deg, ${meta.accent}18 0%, transparent 100%)`,
      flexShrink: 0,
      opacity: isResolving ? 0 : 1,
      transform: isResolving ? 'translateY(-8px)' : 'translateY(0)',
      transition: 'opacity 0.35s, transform 0.35s',
    }}>
      {/* blinking dot */}
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: meta.accent,
        boxShadow: tick ? `0 0 10px ${meta.accent}` : 'none',
        flexShrink: 0,
        transition: 'box-shadow 0.3s',
      }} />

      {/* type badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        background: `${meta.accent}22`,
        border: `1px solid ${meta.accent}55`,
        borderRadius: 4,
        padding: '2px 8px',
      }}>
        <span style={{ fontSize: 12 }}>{meta.icon}</span>
        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: meta.accent, letterSpacing: 2 }}>
          {meta.label}
        </span>
      </div>

      {/* room */}
      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: '#fff', letterSpacing: 1 }}>
        RM {inc.roomId}
      </span>

      {/* severity */}
      <span style={{ fontFamily: MONO, fontSize: 9, color: 'rgba(255,255,255,0.45)', letterSpacing: 1 }}>
        {(inc.severity || 'HIGH').toUpperCase()}
      </span>

      {/* timestamp */}
      {inc._savedAt && (
        <span style={{ fontFamily: MONO, fontSize: 9, color: 'rgba(255,255,255,0.28)', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>
          {new Date(inc._savedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      )}

      {/* resolve button */}
      <button
        onClick={() => onResolve(inc)}
        style={{
          padding: '3px 10px',
          background: 'rgba(0,255,136,0.08)',
          border: '1px solid rgba(0,255,136,0.35)',
          borderRadius: 4,
          color: '#00ff88',
          fontFamily: MONO,
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: 1.5,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: 'background 0.15s',
          flexShrink: 0,
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,255,136,0.22)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,255,136,0.08)'}
      >
        ✓ RESOLVE
      </button>
    </div>
  );
}

/* ── main overlay ─────────────────────────────────────────────────────── */
export default function PersistentAlertOverlay({ incidents = [], onResolve }) {
  const [resolving, setResolving] = useState({});   // roomId → true while fading
  const scrollRef = useRef(null);
  const tick = useTick(500);

  // Auto-scroll the pill strip so all incidents stay visible
  useEffect(() => {
    if (!scrollRef.current || incidents.length <= 3) return;
    const el = scrollRef.current;
    let dir = 1;
    const interval = setInterval(() => {
      el.scrollLeft += dir * 1.5;
      if (el.scrollLeft >= el.scrollWidth - el.clientWidth) dir = -1;
      if (el.scrollLeft <= 0) dir = 1;
    }, 30);
    return () => clearInterval(interval);
  }, [incidents.length]);

  function handleResolve(inc) {
    setResolving(prev => ({ ...prev, [inc.roomId]: true }));
    setTimeout(() => {
      onResolve(inc);
      setResolving(prev => { const n = { ...prev }; delete n[inc.roomId]; return n; });
    }, 380);
  }

  const hasAlerts = incidents.length > 0;
  const fireCount = incidents.filter(i => i.type === 'fire').length;

  /* ─── ALL CLEAR bar ─────────────────────────────────────────────────── */
  if (!hasAlerts) {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
        height: OVERLAY_BANNER_H,
        background: 'rgba(0,18,10,0.97)',
        borderBottom: '1px solid rgba(0,255,136,0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        backdropFilter: 'blur(10px)',
      }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 10px #00ff88' }} />
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: '#00ff88', letterSpacing: 3 }}>
          ALL ZONES CLEAR — SYSTEM NOMINAL
        </span>
      </div>
    );
  }

  /* ─── ACTIVE ALERTS bar ─────────────────────────────────────────────── */
  return (
    <>
      <style>{`
        @keyframes pao-scan {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
        @keyframes pao-pulse-border {
          0%,100% { border-color: rgba(255,45,45,0.6); }
          50%     { border-color: rgba(255,45,45,1);   }
        }
        .pao-scroll::-webkit-scrollbar { display: none; }
        .pao-scroll { scrollbar-width: none; }
      `}</style>

      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
        height: OVERLAY_BANNER_H,
        background: '#0d0000',
        borderBottom: '2px solid',
        animation: 'pao-pulse-border 0.9s ease-in-out infinite',
        display: 'flex', alignItems: 'stretch',
        overflow: 'hidden',
        boxShadow: `0 4px 40px rgba(255,45,45,0.35)`,
      }}>

        {/* ── Left: incident count badge ─────────────────────────────── */}
        <div style={{
          width: 130, flexShrink: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          borderRight: '1px solid rgba(255,45,45,0.3)',
          background: 'rgba(255,45,45,0.12)',
          gap: 2, padding: '0 12px',
        }}>
          <div style={{
            fontFamily: MONO, fontSize: 22, fontWeight: 900,
            color: fireCount > 0 ? '#ff2d2d' : '#ff8800',
            lineHeight: 1,
            textShadow: tick ? `0 0 20px ${fireCount > 0 ? '#ff2d2d' : '#ff8800'}` : 'none',
            transition: 'text-shadow 0.3s',
          }}>
            {incidents.length}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 8, fontWeight: 800, color: 'rgba(255,100,100,0.7)', letterSpacing: 2 }}>
            ACTIVE ALERT{incidents.length !== 1 ? 'S' : ''}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 7, color: 'rgba(255,255,255,0.2)', letterSpacing: 1, marginTop: 2 }}>
            AWAITING RESOLUTION
          </div>
        </div>

        {/* ── Center: scrolling incident pills ──────────────────────── */}
        <div
          ref={scrollRef}
          className="pao-scroll"
          style={{
            flex: 1, display: 'flex', alignItems: 'stretch',
            overflowX: 'auto', overflowY: 'hidden',
            gap: 0,
          }}
        >
          {incidents.map(inc => (
            <IncidentPill
              key={inc.id || inc.roomId}
              inc={inc}
              onResolve={handleResolve}
              isResolving={!!resolving[inc.roomId]}
            />
          ))}
        </div>

        {/* ── Right: animated scan line label ───────────────────────── */}
        <div style={{
          width: 120, flexShrink: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          borderLeft: '1px solid rgba(255,45,45,0.2)',
          gap: 4, padding: '0 10px',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* scan shimmer */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,45,45,0.07) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
            animation: 'pao-scan 2s linear infinite',
            pointerEvents: 'none',
          }} />
          <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: 'rgba(255,80,80,0.7)', letterSpacing: 2, textAlign: 'center' }}>
            DAF + ADMIN
          </div>
          <div style={{ fontFamily: MONO, fontSize: 8, color: 'rgba(255,255,255,0.25)', letterSpacing: 1, textAlign: 'center' }}>
            RESOLVE TO CLEAR
          </div>
        </div>

      </div>
    </>
  );
}