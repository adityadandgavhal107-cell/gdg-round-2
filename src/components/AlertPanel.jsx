import { useState, useEffect, useRef } from 'react';
import bus from '../core/EventBus.js';
import { getAlertHistory } from '../core/AlertEngine.js';

const TYPE_ICONS = { fire: '🔥', smoke: '💨', audio: '🔊' };
const TYPE_LABELS = { fire: 'FIRE', smoke: 'SMOKE', audio: 'AUDIO' };

export default function AlertPanel({ onAlertClick }) {
  const [alerts, setAlerts] = useState([]);
  const listRef = useRef(null);

  useEffect(() => {
    setAlerts(getAlertHistory());
    const unsub = bus.on('alert:new', (alert) => {
      setAlerts(prev => [alert, ...prev].slice(0, 50));
    });
    return unsub;
  }, []);

  function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function clearAll() { setAlerts([]); }

  return (
    <div className="alert-panel">
      <div className="alert-panel-header">
        <span className="alert-panel-title">⚡ Live Alerts</span>
        <div className="flex gap-2 items-center">
          <span className="mono text-xs text-dim">{alerts.length}</span>
          <button className="btn-secondary text-xs" style={{ padding: '3px 8px' }} onClick={clearAll}>Clear</button>
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

        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`alert-item ${alert.type}`}
            onClick={() => onAlertClick?.(alert)}
          >
            <div className={`alert-type-badge ${alert.type}`}>
              <span>{TYPE_ICONS[alert.type]}</span>
              <span>{TYPE_LABELS[alert.type] || alert.type.toUpperCase()}</span>
            </div>
            <div className="alert-room">Room {alert.location?.roomId || '—'}</div>
            <div className="alert-meta">
              <span>Floor {alert.location?.floor || '—'}</span>
              <span className={`alert-confidence ${alert.type}`}>{alert.confidence}%</span>
            </div>
            <div className="alert-meta" style={{ marginTop: 2 }}>
              <span>{formatTime(alert.timestamp)}</span>
              <span style={{ textTransform: 'capitalize', fontSize: 10 }}>{alert.severity}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
