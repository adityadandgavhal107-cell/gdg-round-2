const NAV_ITEMS = [
  { id: 'hotel3d',   icon: '🏨', label: '3D Hotel Map' },
  { id: 'cameras',   icon: '📹', label: 'Live Cameras' },
  { id: 'guests',    icon: '👥', label: 'Guest Management' },
  { id: 'daf',       icon: '🚒', label: 'DAF Teams' },
];

export default function Sidebar({ activeView, onNavigate, alertCounts }) {
  return (
    <div className="sidebar">
      <div className="sidebar-section-label">Navigation</div>

      {NAV_ITEMS.map(item => (
        <div
          key={item.id}
          className={`nav-item${activeView === item.id ? ' active' : ''}`}
          onClick={() => onNavigate(item.id)}
        >
          <span className="nav-icon">{item.icon}</span>
          <span>{item.label}</span>
          {alertCounts?.[item.id] > 0 && (
            <span className="nav-badge">{alertCounts[item.id]}</span>
          )}
        </div>
      ))}

      <div className="sidebar-bottom">
        <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.6 }}>
          🔐 FireGuard HMS v1.0<br />
          <span style={{ color: 'var(--safe-green)' }}>● Live Mode</span>
        </div>
      </div>
    </div>
  );
}
