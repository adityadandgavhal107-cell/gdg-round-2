import { useState, useEffect } from 'react';
import bus from '../core/EventBus.js';
import { getActiveAlerts } from '../core/AlertEngine.js';

export default function TopBar({ activeView, alertCount }) {
  const [time, setTime] = useState(new Date());
  const [systemStatus, setSystemStatus] = useState('OPERATIONAL');
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsub = bus.on('notification', ({ msg, type }) => {
      setNotification({ msg, type });
      setTimeout(() => setNotification(null), 4000);
    });

    const alertUnsub = bus.on('alert:new', () => {
      setSystemStatus('EMERGENCY');
      setTimeout(() => {
        if (getActiveAlerts().length === 0) setSystemStatus('OPERATIONAL');
      }, 30000);
    });

    return () => { unsub(); alertUnsub(); };
  }, []);

  const isEmergency = systemStatus === 'EMERGENCY' || alertCount > 0;

  return (
    <div className="topbar">
      <div className="topbar-logo">
        <span className="logo-icon">🔥</span>
        <div className="logo-text">
          FireGuard <span>HMS</span>
        </div>
      </div>

      <div className="topbar-center">
        <div className="status-indicator">
          <span className={`status-dot${isEmergency ? ' alert' : ''}`} />
          <span className="mono" style={{ fontSize: 11 }}>
            {isEmergency ? '⚠ EMERGENCY ACTIVE' : '● SYSTEM NORMAL'}
          </span>
        </div>

        <div style={{
          padding: '4px 12px',
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 6,
          fontSize: 11,
          color: 'var(--text-dim)',
          fontFamily: 'JetBrains Mono, monospace',
          border: '1px solid var(--border)',
        }}>
          8F × 12R HOTEL · 96 ROOMS
        </div>

        {notification && (
          <div style={{
            padding: '5px 14px',
            background: notification.type === 'warning' ? 'var(--fire-red-dim)' : 'rgba(78,158,255,0.1)',
            border: `1px solid ${notification.type === 'warning' ? 'var(--fire-red)' : 'var(--accent-blue)'}`,
            borderRadius: 20,
            fontSize: 12,
            color: notification.type === 'warning' ? 'var(--fire-red)' : 'var(--accent-blue)',
            animation: 'slideInRight 0.3s ease',
          }}>
            {notification.msg}
          </div>
        )}
      </div>

      <div className="topbar-right">
        {alertCount > 0 && (
          <div className="alert-badge" style={{ animation: 'pulse-red 1s ease-in-out infinite' }}>
            <span>🔥</span>
            <span className="count">{alertCount}</span>
            <span>ALERTS</span>
          </div>
        )}

        <div className="time-display">
          {time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>

        <div style={{
          width: 32, height: 32,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--fire-red), var(--smoke-orange))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700, color: '#fff',
          cursor: 'pointer',
        }}>
          A
        </div>
      </div>
    </div>
  );
}
