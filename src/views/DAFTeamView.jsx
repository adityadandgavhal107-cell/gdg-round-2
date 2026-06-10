import { useState, useEffect } from 'react';
import bus from '../core/EventBus.js';

const TEAMS = [
  { id: 'alpha',   name: 'Alpha Squad',   members: ['Sgt. Ravi Kumar',   'Cpl. Amit Singh',  'Pfc. Neha Patel'],   specialization: 'Search & Rescue' },
  { id: 'beta',    name: 'Beta Squad',    members: ['Sgt. Priya Nair',   'Cpl. Arun Das',    'Pfc. Vijay Rao'],    specialization: 'Fire Suppression' },
  { id: 'charlie', name: 'Charlie Squad', members: ['Sgt. Mohan Sharma', 'Cpl. Deepa Iyer',  'Pfc. Suresh Menon'], specialization: 'Medical Evacuation' },
  { id: 'delta',   name: 'Delta Squad',   members: ['Sgt. Kiran Reddy',  'Cpl. Anita Joshi', 'Pfc. Rahul Gupta'],  specialization: 'Perimeter Control' },
];

function loadTeamCodes() {
  const codes = {};
  TEAMS.forEach(t => {
    codes[t.id] = localStorage.getItem(`daf_otp_${t.id}`) || '----';
  });
  return codes;
}

export default function DAFTeamView() {
  const [teams, setTeams] = useState(
    TEAMS.map(t => ({ ...t, status: 'available', assignedRoom: null, dispatchTime: null, responseTime: null }))
  );
  const [activeIncidents, setActiveIncidents] = useState([]);
  const [log, setLog] = useState([]);
  // Per-team OTP codes (stored in localStorage as daf_otp_alpha, daf_otp_beta, etc.)
  const [teamCodes, setTeamCodes] = useState(loadTeamCodes);

  // ── Receive alerts via EventBus (from socket in parent) ───────────────────
  useEffect(() => {
    const unsub = bus.on('alert:escalate', ({ roomId, type, severity }) => {
      if (severity === 'high' || type === 'fire' || type === 'smoke' || type === 'audio') {
        setActiveIncidents(prev => {
          if (prev.find(i => i.roomId === roomId && i.type === type)) return prev;
          const incident = { id: `inc_${Date.now()}`, roomId, type, severity, time: new Date().toISOString(), teamId: null };
          addLog(`🚨 Incident reported — Room ${roomId} (${type.toUpperCase()})`);
          return [incident, ...prev];
        });
      }
    });

    // Also listen for detection:alert (direct socket events forwarded via bus)
    const unsubDirect = bus.on('detection:alert', ({ roomId, type, severity }) => {
      if (!['fire', 'smoke', 'audio'].includes(type)) return;
      setActiveIncidents(prev => {
        if (prev.find(i => String(i.roomId) === String(roomId) && i.type === type)) return prev;
        const incident = { id: `inc_${Date.now()}`, roomId: String(roomId), type, severity: severity || 'high', time: new Date().toISOString(), teamId: null };
        addLog(`🚨 Sensor alert — Room ${roomId} (${type.toUpperCase()})`);
        return [incident, ...prev];
      });
    });

    return () => { unsub(); unsubDirect(); };
  }, []);

  // ── Generate a unique OTP for a specific team ─────────────────────────────
  function generateTeamCode(teamId) {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    localStorage.setItem(`daf_otp_${teamId}`, code);
    setTeamCodes(prev => ({ ...prev, [teamId]: code }));
    const teamName = TEAMS.find(t => t.id === teamId)?.name;
    addLog(`🔑 New code for ${teamName}: ${code}`);
    bus.emit('notification', { msg: `🔑 ${teamName} OTP: ${code}`, type: 'success' });
  }

  function generateAllCodes() {
    const newCodes = {};
    TEAMS.forEach(t => {
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      localStorage.setItem(`daf_otp_${t.id}`, code);
      newCodes[t.id] = code;
    });
    setTeamCodes(newCodes);
    addLog('🔑 All team codes regenerated');
    bus.emit('notification', { msg: '🔑 All team OTPs refreshed', type: 'success' });
  }

  function addLog(msg) {
    setLog(prev => [{ msg, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 30));
  }

  function showPath(roomId) {
    bus.emit('daf:guide', { roomId });
    addLog(`📍 Navigation path generated to Room ${roomId}`);
    bus.emit('notification', { msg: `📍 Pathfinding guided to Room ${roomId}`, type: 'info' });
  }

  function dispatch(teamId, roomId) {
    const now = Date.now();
    setTeams(prev => prev.map(t =>
      t.id === teamId ? { ...t, status: 'dispatched', assignedRoom: roomId, dispatchTime: now } : t
    ));
    setActiveIncidents(prev => prev.map(i => i.roomId === roomId ? { ...i, teamId } : i));
    const teamName = TEAMS.find(t => t.id === teamId)?.name;
    addLog(`🚒 ${teamName} dispatched to Room ${roomId}`);
    bus.emit('notification', { msg: `🚒 ${teamName} dispatched to Room ${roomId}`, type: 'warning' });
    showPath(roomId);
    setTimeout(() => {
      setTeams(prev => prev.map(t =>
        t.id === teamId ? { ...t, status: 'on-scene', responseTime: Math.round((Date.now() - now) / 1000) } : t
      ));
      addLog(`✅ ${teamName} arrived at Room ${roomId}`);
    }, 30000);
  }

  function recallTeam(teamId) {
    setTeams(prev => prev.map(t =>
      t.id === teamId ? { ...t, status: 'available', assignedRoom: null, dispatchTime: null, responseTime: null } : t
    ));
    addLog(`↩️ ${TEAMS.find(t => t.id === teamId)?.name} returned to base`);
    bus.emit('daf:guide', { roomId: null });
  }

  const availableTeams = teams.filter(t => t.status === 'available');

  return (
    <div className="daf-view">
      <div className="view-header">
        <div>
          <h2 className="view-title">🚒 <span>DAF</span> Team Coordination</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 2 }}>
            {availableTeams.length} teams available · {activeIncidents.length} active incidents
          </p>
        </div>

        {/* Generate all codes button */}
        <button
          onClick={generateAllCodes}
          style={{
            padding: '10px 18px', background: 'var(--fire-red)', color: '#fff', border: 'none',
            borderRadius: 8, fontSize: 11, fontWeight: 900, cursor: 'pointer', letterSpacing: 1,
          }}
        >
          🔑 REGENERATE ALL CODES
        </button>

        <div style={{
          padding: '6px 14px', borderRadius: 8, fontSize: 12,
          background: availableTeams.length > 0 ? 'var(--safe-dim)' : 'var(--fire-red-dim)',
          border: `1px solid ${availableTeams.length > 0 ? 'var(--safe-green)' : 'var(--fire-red)'}`,
          color: availableTeams.length > 0 ? 'var(--safe-green)' : 'var(--fire-red)',
          fontWeight: 600,
        }}>
          {availableTeams.length > 0 ? `✅ ${availableTeams.length} Ready` : '⚠ All Deployed'}
        </div>
      </div>

      {/* ── Per-team OTP codes ──────────────────────────────────────────────── */}
      <div className="glass-card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14, color: 'var(--fire-red)' }}>
          🔑 Team Access Codes
          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-dim)', marginLeft: 10 }}>
            Share the correct code with each team — each code only unlocks that team's dashboard
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {TEAMS.map(t => (
            <div key={t.id} style={{
              padding: '12px 16px', borderRadius: 10,
              background: 'rgba(255,45,45,0.05)', border: '1px solid rgba(255,45,45,0.2)',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--fire-red)', letterSpacing: 1 }}>
                {t.name.toUpperCase()}
              </div>
              <div style={{
                fontSize: 28, fontWeight: 900, color: '#fff',
                fontFamily: 'JetBrains Mono', letterSpacing: 8,
                textShadow: '0 0 20px rgba(255,45,45,0.5)',
              }}>
                {teamCodes[t.id]}
              </div>
              <button
                onClick={() => generateTeamCode(t.id)}
                style={{
                  padding: '6px 10px', background: 'rgba(255,45,45,0.15)',
                  border: '1px solid rgba(255,45,45,0.4)', borderRadius: 6,
                  color: '#ff6666', fontSize: 10, fontWeight: 900, cursor: 'pointer',
                  letterSpacing: 1,
                }}
              >
                REFRESH CODE
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Active incidents ────────────────────────────────────────────────── */}
      {activeIncidents.length > 0 && (
        <div className="glass-card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14, color: 'var(--fire-red)' }}>
            🚨 Active Incidents ({activeIncidents.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeIncidents.map(incident => {
              const assignedTeam = teams.find(t => t.id === incident.teamId);
              const icon = incident.type === 'fire' ? '🔥' : incident.type === 'audio' ? '🔊' : '💨';
              return (
                <div key={incident.id} style={{
                  padding: '10px 14px', borderRadius: 8,
                  background: 'var(--fire-red-dim)', border: '1px solid rgba(255,45,45,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: 'var(--fire-red)' }}>
                      {icon} Room {incident.roomId} — {incident.type.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                      {assignedTeam
                        ? `Assigned: ${assignedTeam.name} (${assignedTeam.status})`
                        : 'No team assigned'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => showPath(incident.roomId)}
                      style={{
                        padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                        background: 'rgba(78,158,255,0.15)', border: '1px solid rgba(78,158,255,0.4)',
                        color: '#4e9eff', cursor: 'pointer',
                      }}
                    >📍 GUIDE</button>
                    {!incident.teamId && (
                      <select
                        className="form-select"
                        style={{ width: 'auto', fontSize: 12, background: 'var(--bg-app)', color: '#fff', border: '1px solid var(--border)' }}
                        defaultValue=""
                        onChange={e => { if (e.target.value) dispatch(e.target.value, incident.roomId); }}
                      >
                        <option value="">Dispatch Team →</option>
                        {availableTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Team cards ──────────────────────────────────────────────────────── */}
      <div className="daf-team-grid">
        {teams.map(team => (
          <div key={team.id} className={`daf-team-card ${team.status === 'dispatched' || team.status === 'on-scene' ? team.status : ''}`}>
            <div className="team-name">{team.name}</div>
            <div className={`team-status-badge ${team.status}`}>
              {team.status === 'available' ? '● Ready' : team.status === 'dispatched' ? '🚒 En Route' : '🏠 On Scene'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>{team.specialization}</div>
            <div className="team-members">{team.members.map(m => <div key={m}>👤 {m}</div>)}</div>
            {team.assignedRoom && (
              <div style={{ fontSize: 12, color: 'var(--smoke-orange)', marginBottom: 8 }}>
                📍 Assigned: Room {team.assignedRoom}
                {team.responseTime && <span style={{ color: 'var(--safe-green)', marginLeft: 8 }}>✅ {team.responseTime}s</span>}
              </div>
            )}
            {team.status === 'available' ? (
              activeIncidents.filter(i => !i.teamId).length > 0 ? (
                <select
                  className="form-select"
                  style={{ width: '100%', fontSize: 12, marginBottom: 8 }}
                  defaultValue=""
                  onChange={e => { if (e.target.value) dispatch(team.id, e.target.value); }}
                >
                  <option value="">Dispatch to Room →</option>
                  {activeIncidents.filter(i => !i.teamId).map(i => (
                    <option key={i.roomId} value={i.roomId}>Room {i.roomId}</option>
                  ))}
                </select>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', padding: '8px 0' }}>No active incidents</div>
              )
            ) : (
              <button
                className="team-dispatch-btn"
                style={{ background: 'rgba(255,255,255,0.1)' }}
                onClick={() => recallTeam(team.id)}
              >↩️ Recall</button>
            )}
          </div>
        ))}
      </div>

      {/* ── Activity log ────────────────────────────────────────────────────── */}
      <div className="glass-card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14, color: 'var(--text-secondary)' }}>📋 Activity Log</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
          {log.length === 0 && (
            <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>No activity yet.</div>
          )}
          {log.map((entry, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', fontSize: 12,
              color: 'var(--text-secondary)', padding: '4px 0', borderBottom: '1px solid var(--border)',
            }}>
              <span>{entry.msg}</span>
              <span className="mono text-dim" style={{ fontSize: 11 }}>{entry.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}