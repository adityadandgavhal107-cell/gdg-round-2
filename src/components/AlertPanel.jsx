import { useState, useEffect, useRef } from 'react';
import bus from '../core/EventBus.js';
import { getAlertHistory, resolveAlert } from '../core/AlertEngine.js';

const TYPE_ICONS = {
  fire:     '🔥',
  smoke:    '💨',
  audio:    '🔊',
  medical:  '⚕️',
  security: '🛡️',
};

const TYPE_LABELS = {
  fire:     'FIRE',
  smoke:    'SMOKE',
  audio:    'AUDIO',
  medical:  'MEDICAL',
  security: 'SECURITY',
};

const TYPE_CLASS = {
  fire:     'fire',
  smoke:    'smoke',
  audio:    'audio',
  medical:  'medical',
  security: 'security',
};

export default function AlertPanel({ onAlertClick }) {
  // Show ALL alerts from history; we only remove them when truly resolved.
  // We do NOT expose a "Clear All" button — clearing must go through the
  // resolve flow so the socket broadcast happens and DAF/Admin stay in sync.
  const [alerts, setAlerts] = useState([]);
  const [resolving, setResolving] = useState({}); // alertId → true while fading out
  const listRef = useRef(null);

  useEffect(() => {
    // Seed from in-memory history (which is already populated from localStorage
    // by initAlertEngine() at boot time)
    setAlerts(getAlertHistory().filter(a => a.status !== 'resolved'));

    const unsubNew = bus.on('alert:new', (alert) => {
      setAlerts(prev => {
        // avoid duplicates if the component re-mounts
        if (prev.find(a => a.id === alert.id)) return prev;
        return [alert, ...prev].slice(0, 50);
      });
    });

    // When anyone (Admin, DAF, or server) resolves an alert, remove it here
    const unsubResolved = bus.on('alert:resolved', ({ roomId }) => {
      setAlerts(prev => prev.filter(a => a.location?.roomId !== String(roomId)));
    });

    return () => { unsubNew(); unsubResolved(); };
  }, []);

  function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function handleResolve(e, alert) {
    e.stopPropagation();

    // Mark as fading
    setResolving(prev => ({ ...prev, [alert.id]: true }));

    // After fade animation (300 ms), remove from list + call engine
    // resolveAlert() internally calls bus.emit('alert:resolved') which also
    // removes it from any other mounted AlertPanel instance and from DAFApp.
    setTimeout(() => {
      resolveAlert(alert.location?.roomId);
      setAlerts(prev => prev.filter(a => a.id !== alert.id));
      setResolving(prev => { const n = { ...prev }; delete n[alert.id]; return n; });
    }, 300);
  }

  const activeCount = alerts.length;

  return (
    <div className="alert-panel">
      <div className="alert-panel-header">
        <span className="alert-panel-title">⚡ Live Alerts</span>
        <div className="flex gap-2 items-center">
          {/* Active count pill — red when non-zero so it's impossible to miss */}
          <span
            className="mono text-xs"
            style={activeCount > 0 ? {
              background: 'rgba(255,45,45,0.15)',
              border: '1px solid rgba(255,45,45,0.4)',
              color: '#ff4444',
              padding: '2px 8px',
              borderRadius: 10,
              fontWeight: 800,
            } : { color: 'var(--text-dim)' }}
          >
            {activeCount}
          </span>
          {/* ⚠️  NO "Clear All" button — alerts MUST be resolved individually
               so the socket broadcast propagates to DAF + Admin in sync.     */}
        </div>
      </div>

      <div className="alert-list" ref={listRef}>
        {alerts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-dim)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🛡️</div>
            <div style={{ fontSize: 13 }}>All systems normal</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>No active alerts</div>
          </div>
        )}

        {alerts.map((alert) => {
          const cls = TYPE_CLASS[alert.type] ?? 'audio';
          const isFading = resolving[alert.id];

          return (
            <div
              key={alert.id}
              className={`alert-item ${cls}`}
              onClick={() => onAlertClick?.(alert)}
              style={{
                opacity:   isFading ? 0 : 1,
                transform: isFading ? 'translateX(20px)' : 'translateX(0)',
                transition: 'opacity 0.3s ease, transform 0.3s ease',
                /* Persistent glow so the alert can never be visually ignored */
                boxShadow: '0 0 12px rgba(255,45,45,0.12)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div className={`alert-type-badge ${cls}`}>
                  <span>{TYPE_ICONS[alert.type] ?? '⚠️'}</span>
                  <span>{TYPE_LABELS[alert.type] ?? alert.type.toUpperCase()}</span>
                </div>

                {/* Resolve button — the ONLY way to remove an alert */}
                <button
                  onClick={e => handleResolve(e, alert)}
                  title="Mark as resolved"
                  style={{
                    background: 'rgba(0,255,136,0.08)',
                    border: '1px solid rgba(0,255,136,0.25)',
                    borderRadius: 4,
                    color: 'var(--safe-green)',
                    fontSize: 9,
                    fontWeight: 700,
                    padding: '2px 6px',
                    cursor: 'pointer',
                    letterSpacing: 0.5,
                    whiteSpace: 'nowrap',
                    transition: '0.15s',
                    flexShrink: 0,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,255,136,0.18)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,255,136,0.08)'}
                >
                  ✓ RESOLVE
                </button>
              </div>

              <div className="alert-room">Room {alert.location?.roomId || '—'}</div>
              <div className="alert-meta">
                <span>Floor {alert.location?.floor || '—'}</span>
                <span className={`alert-confidence ${cls}`}>{alert.confidence}%</span>
              </div>
              <div className="alert-meta" style={{ marginTop: 2 }}>
                <span>{formatTime(alert.timestamp)}</span>
                <span style={{ textTransform: 'capitalize', fontSize: 10 }}>{alert.severity}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}