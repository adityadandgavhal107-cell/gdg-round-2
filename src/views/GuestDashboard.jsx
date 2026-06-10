import { useState, useEffect } from 'react';
import { hotelData } from '../data/hotel.js';
import { calculatePriority, PRIORITY_LABELS, SPECIAL_NEEDS_OPTIONS } from '../data/guests.js';
import bus from '../core/EventBus.js';

const NEEDS_LABELS = {
  none: 'None', wheelchair: '♿ Wheelchair', visual_impairment: '👁 Visual', hearing_impairment: '👂 Hearing',
  elderly: '👴 Elderly', children: '🧒 Children', medical: '🏥 Medical',
};

export default function GuestDashboard({ onHighlightRoom }) {
  const [guests, setGuests] = useState([]);
  const [search, setSearch] = useState('');
  const [filterFloor, setFilterFloor] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [roomStatuses, setRoomStatuses] = useState({});

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const [form, setForm] = useState({
    name: '', age: '', roomId: '', contact: '', specialNeeds: [],
    checkInDate: today, checkOutDate: tomorrow,
  });

  const API_BASE_URL = 'http://localhost:8000/api';

  useEffect(() => {
    fetchGuests();
    const unsub = bus.on('room:statusChange', ({ roomId, status }) => {
      setRoomStatuses(prev => ({ ...prev, [roomId]: status }));
    });
    return unsub;
  }, []);

  const fetchGuests = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/guests`);
      if (!response.ok) throw new Error('Database registry synchronization failed.');
      const data = await response.json();
      const adaptedGuests = data.map(g => ({
        id: g.id,
        name: g.full_name,
        age: g.age,
        roomId: g.room_assignment,
        contact: g.contact_number,
        specialNeeds: g.special_needs ? g.special_needs.split(',') : ['none'],
        checkedIn: true,
        evacuated: g.is_evacuated,
        alertSent: false,
        priority: g.priority,
        checkInDate: g.check_in_date,
        checkOutDate: g.check_out_date,
        nights: g.nights,
      }));
      setGuests(adaptedGuests);
    } catch (error) {
      console.error('Error fetching guests from database:', error);
    }
  };

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

  async function handleCheckIn(e) {
    e.preventDefault();
    if (!form.name || !form.roomId) return;
    const specialNeedsPayload = form.specialNeeds.length ? form.specialNeeds.join(',') : 'none';
    try {
      const response = await fetch(`${API_BASE_URL}/guests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          full_name: form.name,
          age: parseInt(form.age) || 30,
          room_assignment: form.roomId,
          contact_number: form.contact || 'N/A',
          special_needs: specialNeedsPayload,
          check_in_date: form.checkInDate,
          check_out_date: form.checkOutDate,
        }),
      });
      if (!response.ok) {
        const err = await response.json();
        console.error('Backend validation error details:', err);
        alert(err.detail || 'Could not verify database reservation.');
        return;
      }
      const savedGuest = await response.json();
      const UI_NewGuest = {
        id: savedGuest.id,
        name: savedGuest.full_name,
        age: savedGuest.age,
        roomId: savedGuest.room_assignment,
        contact: savedGuest.contact_number,
        specialNeeds: savedGuest.special_needs.split(','),
        checkedIn: true,
        evacuated: savedGuest.is_evacuated,
        alertSent: false,
        priority: savedGuest.priority,
        checkInDate: savedGuest.check_in_date,
        checkOutDate: savedGuest.check_out_date,
        nights: savedGuest.nights,
      };
      setGuests(prev => [...prev, UI_NewGuest]);
      const resetToday = new Date().toISOString().split('T')[0];
      const resetTomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      setForm({ name: '', age: '', roomId: '', contact: '', specialNeeds: [], checkInDate: resetToday, checkOutDate: resetTomorrow });
      setShowForm(false);
      bus.emit('notification', { msg: `✅ ${UI_NewGuest.name} checked into Room ${UI_NewGuest.roomId}`, type: 'info' });
    } catch (error) {
      console.error('Database connection error during check-in:', error);
      alert('Backend server is unreachable. Check your terminal execution logs.');
    }
  }

  async function markEvacuated(guestId) {
    const cleanId = typeof guestId === 'string' ? guestId.replace('g', '') : guestId;
    try {
      const response = await fetch(`${API_BASE_URL}/guests/${cleanId}/evacuate`, { method: 'PATCH' });
      if (!response.ok) throw new Error('Could not update status row on backend.');
      setGuests(prev => prev.map(g => g.id === guestId ? { ...g, evacuated: true } : g));
      bus.emit('notification', { msg: `🏃‍♂️ Status updated: Guest marked evacuated`, type: 'info' });
    } catch (error) {
      console.error('Error syncing status alteration with backend:', error);
      setGuests(prev => prev.map(g => g.id === guestId ? { ...g, evacuated: true } : g));
    }
  }

  async function handleCheckoutGuest(guestId) {
    if (!window.confirm('Are you sure you want to checkout this guest? This will permanently erase their record from HMS.')) return;
    try {
      const response = await fetch(`${API_BASE_URL}/guests/${guestId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete resource entry from database.');
      setGuests(prev => prev.filter(g => g.id !== guestId));
      bus.emit('notification', { msg: `🚪 Guest checked out safely`, type: 'info' });
    } catch (error) {
      console.error('Error during database checkout:', error);
      alert('Failed to connect to backend server for entry deletion.');
    }
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

      {/* Alert Summary */}
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
            onClick={() => alertedGuests.forEach(g => {
              if (!g.alertSent) bus.emit('notification', { msg: `📲 Alert sent to ${g.name}`, type: 'warning' });
            })}
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
            <div className="form-group">
              <label className="form-label">Check-In Date</label>
              <input
                className="form-input"
                type="date"
                value={form.checkInDate}
                min={today}
                onChange={e => {
                  const newCheckIn = e.target.value;
                  const checkOut = form.checkOutDate < newCheckIn
                    ? new Date(new Date(newCheckIn).getTime() + 86400000).toISOString().split('T')[0]
                    : form.checkOutDate;
                  setForm(p => ({ ...p, checkInDate: newCheckIn, checkOutDate: checkOut }));
                }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Check-Out Date</label>
              <input
                className="form-input"
                type="date"
                value={form.checkOutDate}
                min={form.checkInDate
                  ? new Date(new Date(form.checkInDate).getTime() + 86400000).toISOString().split('T')[0]
                  : tomorrow}
                onChange={e => setForm(p => ({ ...p, checkOutDate: e.target.value }))}
              />
              {form.checkInDate && form.checkOutDate && (
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-dim)' }}>
                  {(() => {
                    const n = Math.max(1, Math.round((new Date(form.checkOutDate) - new Date(form.checkInDate)) / 86400000));
                    return `🌙 ${n} night${n !== 1 ? 's' : ''}`;
                  })()}
                </div>
              )}
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
                    return <span style={{ color: pl?.color || 'var(--text)', fontWeight: 700 }}>{pl?.label || `Priority ${p}`}</span>;
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
              <th>Stay</th>
              <th>Age</th>
              <th>Special Needs</th>
              <th>Priority</th>
              <th>Zone Status</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
              <th style={{ textAlign: 'center', width: '80px' }}>Check-out</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(g => {
              const zoneStatus = g.evacuated ? 'evacuated' : (roomStatuses[g.roomId] || 'safe');

              const getPriorityStyles = (priorityStr) => {
                const normalized = String(priorityStr).toLowerCase();
                if (normalized.includes('p1') || normalized.includes('critical')) {
                  return { bg: 'rgba(255,45,45,0.15)', color: '#ff4d4d', label: 'P1 – Critical' };
                }
                if (normalized.includes('p2') || normalized.includes('high')) {
                  return { bg: 'rgba(255,140,0,0.15)', color: '#ff9f43', label: 'P2 – High' };
                }
                if (normalized.includes('p3') || normalized.includes('medium')) {
                  return { bg: 'rgba(255,215,0,0.15)', color: '#f1c40f', label: 'P3 – Medium' };
                }
                return { bg: 'rgba(46,204,113,0.15)', color: '#2ecc71', label: 'P4 – Standard' };
              };

              const badgeStyle = getPriorityStyles(g.priority);

              return (
                <tr key={g.id} onClick={() => onHighlightRoom?.(g.roomId)}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{g.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{g.contact}</div>
                  </td>
                  <td>
                    <span className="mono" style={{ color: 'var(--accent-blue)' }}>{g.roomId}</span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{g.nights ?? '—'}n</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{g.checkOutDate ?? ''}</div>
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
                    <span className="priority-badge" style={{
                      background: badgeStyle.bg,
                      color: badgeStyle.color,
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontWeight: '700',
                      fontSize: '12px',
                      display: 'inline-block',
                    }}>
                      {badgeStyle.label}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge ${
                      zoneStatus.includes('fire') || zoneStatus.includes('smoke')
                        ? 'alert'
                        : zoneStatus === 'evacuated'
                        ? 'evacuated'
                        : 'safe'
                    }`}>
                      {zoneStatus === 'fire' ? '🔥 FIRE'
                        : zoneStatus === 'smoke' ? '💨 SMOKE'
                        : zoneStatus === 'evacuated' ? '✅ Evacuated'
                        : '🛡 Safe'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '8px', width: '100%' }}>
                      {!g.evacuated && (
                        <button
                          className="btn-secondary"
                          style={{ padding: '6px 12px', fontSize: 11, whiteSpace: 'nowrap' }}
                          onClick={e => { e.stopPropagation(); markEvacuated(g.id); }}
                        >
                          ✅ Evacuated
                        </button>
                      )}
                      <button
                        className="btn-secondary"
                        style={{ padding: '6px 12px', fontSize: 11, whiteSpace: 'nowrap' }}
                        onClick={e => { e.stopPropagation(); onHighlightRoom?.(g.roomId); }}
                      >
                        🏨 Locate
                      </button>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      className="btn-secondary"
                      title="Checkout / Delete Guest"
                      style={{
                        padding: '6px 14px',
                        fontSize: '11px',
                        fontWeight: '800',
                        color: '#ff4d4d',
                        borderColor: '#ff4d4d',
                        background: 'rgba(255,77,77,0.1)',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        display: 'inline-block',
                        margin: '0 auto',
                      }}
                      onClick={e => { e.stopPropagation(); handleCheckoutGuest(g.id); }}
                    >
                      C/O
                    </button>
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