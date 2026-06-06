import { useState, useEffect } from 'react';
import { hotelData } from '../data/hotel.js';
import { initializeGuests, calculatePriority, PRIORITY_LABELS, SPECIAL_NEEDS_OPTIONS } from '../data/guests.js';
import bus from '../core/EventBus.js';

const NEEDS_LABELS = {
  none: 'None', wheelchair: '♿ Wheelchair', visual_impairment: '👁 Visual', hearing_impairment: '👂 Hearing',
  elderly: '👴 Elderly', children: '🧒 Children', medical: '🏥 Medical',
};

export default function GuestDashboard({ onHighlightRoom }) {
  const [guests, setGuests] = useState(initializeGuests());
  const [search, setSearch] = useState('');
  const [filterFloor, setFilterFloor] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [roomStatuses, setRoomStatuses] = useState({});
  const [form, setForm] = useState({
    name: '', age: '', roomId: '', contact: '', specialNeeds: [],
  });

  useEffect(() => {
    const unsub = bus.on('room:statusChange', ({ roomId, status }) => {
      setRoomStatuses(prev => ({ ...prev, [roomId]: status }));
    });
    return unsub;
  }, []);

  const allRooms = Object.keys(hotelData.rooms);
  const occupiedRooms = new Set(guests.map(g => g.roomId));
  const availableRooms = allRooms.filter(r => !occupiedRooms.has(r));

  function handleNeedToggle(need) {
    setForm(prev => ({
      ...prev,
      specialNeeds: prev.specialNeeds.includes(need)
        ? prev.specialNeeds.filter(n => n !== need)
        : [...prev.specialNeeds, need],
    }));
  }

  function handleCheckIn(e) {
    e.preventDefault();
    if (!form.name || !form.roomId) return;
    const newGuest = {
      id: `g${Date.now()}`,
      name: form.name,
      age: parseInt(form.age) || 30,
      roomId: form.roomId,
      contact: form.contact,
      specialNeeds: form.specialNeeds.length ? form.specialNeeds : ['none'],
      checkedIn: true,
      evacuated: false,
      alertSent: false,
    };
    newGuest.priority = calculatePriority(newGuest);
    setGuests(prev => [...prev, newGuest]);
    setForm({ name: '', age: '', roomId: '', contact: '', specialNeeds: [] });
    setShowForm(false);
    bus.emit('notification', { msg: `✅ ${newGuest.name} checked into Room ${newGuest.roomId}`, type: 'info' });
  }

  function markEvacuated(guestId) {
    setGuests(prev => prev.map(g => g.id === guestId ? { ...g, evacuated: true } : g));
  }

  const filtered = guests.filter(g => {
    const matchSearch = g.name.toLowerCase().includes(search.toLowerCase()) || g.roomId.includes(search);
    const matchFloor = filterFloor === 'all' || g.roomId[0] === filterFloor;
    const matchStatus = filterStatus === 'all'
      || (filterStatus === 'alert' && roomStatuses[g.roomId] === 'fire')
      || (filterStatus === 'evacuated' && g.evacuated)
      || (filterStatus === 'safe' && !g.evacuated && roomStatuses[g.roomId] !== 'fire');
    return matchSearch && matchFloor && matchStatus;
  });

  const alertedGuests = guests.filter(g => roomStatuses[g.roomId] === 'fire' || roomStatuses[g.roomId] === 'smoke');

  return (
    <div className="guest-view">
      {/* Header */}
      <div className="view-header">
        <div>
          <h2 className="view-title">👥 <span>Guest</span> Management</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 2 }}>
            {guests.length} guests · {alertedGuests.length} in affected zones · {guests.filter(g => g.evacuated).length} evacuated
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Cancel' : '+ Check In Guest'}
        </button>
      </div>

      {/* Alert Summary if any */}
      {alertedGuests.length > 0 && (
        <div style={{
          padding: '12px 16px', borderRadius: 'var(--radius-md)',
          background: 'var(--fire-red-dim)', border: '1px solid var(--fire-red)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 20 }}>🔥</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: 'var(--fire-red)', fontSize: 14 }}>
              {alertedGuests.length} guests in emergency zones
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {alertedGuests.sort((a, b) => a.priority - b.priority).slice(0, 3).map(g =>
                `${g.name} (P${g.priority} · R${g.roomId})`
              ).join(' · ')}
            </div>
          </div>
          <button
            className="btn-primary"
            style={{ fontSize: 12, padding: '6px 14px' }}
            onClick={() => alertedGuests.forEach(g => { if (!g.alertSent) bus.emit('notification', { msg: `📲 Alert sent to ${g.name}`, type: 'warning' }); })}
          >
            📲 Alert All
          </button>
        </div>
      )}

      {/* Check-In Form */}
      {showForm && (
        <div className="glass-card">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
            ➕ Guest Check-In
          </div>
          <form className="checkin-form" onSubmit={handleCheckIn}>
            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input className="form-input" placeholder="e.g. Priya Sharma" value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Age</label>
              <input className="form-input" type="number" placeholder="Age" min="1" max="120"
                value={form.age} onChange={e => setForm(p => ({ ...p, age: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Room Assignment *</label>
              <select className="form-select" value={form.roomId}
                onChange={e => setForm(p => ({ ...p, roomId: e.target.value }))} required>
                <option value="">— Select Room —</option>
                {[1,2,3,4,5,6,7,8].map(f => (
                  <optgroup key={f} label={`Floor ${f}`}>
                    {availableRooms.filter(r => r[0] === String(f)).map(r => (
                      <option key={r} value={r}>Room {r}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Contact Number</label>
              <input className="form-input" placeholder="Phone number" value={form.contact}
                onChange={e => setForm(p => ({ ...p, contact: e.target.value }))} />
            </div>
            <div className="form-group full-width">
              <label className="form-label">Special Needs</label>
              <div className="special-needs-grid">
                {SPECIAL_NEEDS_OPTIONS.filter(n => n !== 'none').map(need => (
                  <button key={need} type="button"
                    className={`need-tag${form.specialNeeds.includes(need) ? ' selected' : ''}`}
                    onClick={() => handleNeedToggle(need)}>
                    {NEEDS_LABELS[need]}
                  </button>
                ))}
              </div>
            </div>

            {form.name && form.age && (
              <div className="form-group full-width">
                <div style={{
                  padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                  fontSize: 12,
                }}>
                  Auto Priority: {(() => {
                    const mock = { age: parseInt(form.age) || 30, specialNeeds: form.specialNeeds.length ? form.specialNeeds : ['none'] };
                    const p = calculatePriority(mock);
                    const pl = PRIORITY_LABELS[p];
                    return <span style={{ color: pl.color, fontWeight: 700 }}>{pl.label}</span>;
                  })()}
                </div>
              </div>
            )}

            <div className="form-group full-width flex gap-2">
              <button type="submit" className="btn-primary">✅ Check In</button>
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="search-bar">
        <div className="search-input-wrap">
          <span className="search-icon">🔍</span>
          <input className="search-input" placeholder="Search by name or room..." value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={{ width: 'auto' }} value={filterFloor}
          onChange={e => setFilterFloor(e.target.value)}>
          <option value="all">All Floors</option>
          {[1,2,3,4,5,6,7,8].map(f => <option key={f} value={String(f)}>Floor {f}</option>)}
        </select>
        <select className="form-select" style={{ width: 'auto' }} value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Status</option>
          <option value="alert">⚠ In Alert Zone</option>
          <option value="evacuated">✅ Evacuated</option>
          <option value="safe">🛡 Safe</option>
        </select>
      </div>

      {/* Guest Table */}
      <div className="glass-card guest-table-wrapper">
        <table className="guest-table">
          <thead>
            <tr>
              <th>Guest</th>
              <th>Room</th>
              <th>Age</th>
              <th>Special Needs</th>
              <th>Priority</th>
              <th>Zone Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(g => {
              const pl = PRIORITY_LABELS[g.priority];
              const zoneStatus = g.evacuated ? 'evacuated' : (roomStatuses[g.roomId] || 'safe');
              return (
                <tr key={g.id} onClick={() => onHighlightRoom?.(g.roomId)}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{g.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{g.contact}</div>
                  </td>
                  <td>
                    <span className="mono" style={{ color: 'var(--accent-blue)' }}>
                      {g.roomId}
                    </span>
                  </td>
                  <td className="mono">{g.age}</td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {(g.specialNeeds || ['none']).map(n => (
                        <span key={n} style={{
                          fontSize: 10, padding: '2px 6px', borderRadius: 10,
                          background: n === 'none' ? 'rgba(255,255,255,0.05)' : 'rgba(255,45,45,0.1)',
                          color: n === 'none' ? 'var(--text-dim)' : 'var(--fire-red)',
                          border: `1px solid ${n === 'none' ? 'var(--border)' : 'rgba(255,45,45,0.3)'}`,
                        }}>
                          {NEEDS_LABELS[n] || n}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <span className="priority-badge" style={{ background: pl.bg, color: pl.color }}>
                      {pl.label}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge ${zoneStatus.includes('fire') || zoneStatus.includes('smoke') ? 'alert' : zoneStatus === 'evacuated' ? 'evacuated' : 'safe'}`}>
                      {zoneStatus === 'fire' ? '🔥 FIRE' : zoneStatus === 'smoke' ? '💨 SMOKE' : zoneStatus === 'evacuated' ? '✅ Evacuated' : '🛡 Safe'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {!g.evacuated && (
                        <button
                          className="btn-secondary"
                          style={{ padding: '4px 8px', fontSize: 11 }}
                          onClick={e => { e.stopPropagation(); markEvacuated(g.id); }}
                        >
                          ✅ Evacuated
                        </button>
                      )}
                      <button
                        className="btn-secondary"
                        style={{ padding: '4px 8px', fontSize: 11 }}
                        onClick={e => { e.stopPropagation(); onHighlightRoom?.(g.roomId); }}
                      >
                        🏨 Locate
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
            No guests match your search.
          </div>
        )}
      </div>
    </div>
  );
}
