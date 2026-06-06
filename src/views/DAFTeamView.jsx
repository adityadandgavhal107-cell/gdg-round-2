import { useState, useEffect } from 'react';
import bus from '../core/EventBus.js';

const TEAMS = [
  { id: 'alpha', name: 'Alpha Squad', members: ['Sgt. Ravi Kumar', 'Cpl. Amit Singh', 'Pfc. Neha Patel'], specialization: 'Search & Rescue' },
  { id: 'bravo', name: 'Bravo Squad', members: ['Sgt. Priya Nair', 'Cpl. Arun Das', 'Pfc. Vijay Rao'], specialization: 'Fire Suppression' },
  { id: 'charlie', name: 'Charlie Squad', members: ['Sgt. Mohan Sharma', 'Cpl. Deepa Iyer', 'Pfc. Suresh Menon'], specialization: 'Medical Evacuation' },
  { id: 'delta', name: 'Delta Squad', members: ['Sgt. Kiran Reddy', 'Cpl. Anita Joshi', 'Pfc. Rahul Gupta'], specialization: 'Perimeter Control' },
];

export default function DAFTeamView() {
  const [teams, setTeams] = useState(TEAMS.map(t => ({ ...t, status: 'available', assignedRoom: null, dispatchTime: null, responseTime: null })));
  const [activeIncidents, setActiveIncidents] = useState([]);
  const [log, setLog] = useState([]);
  const [tacticalCode, setTacticalCode] = useState(localStorage.getItem('daf_tactical_otp') || '----');

  useEffect(() => {
    const unsub = bus.on('alert:escalate', ({ roomId, type, severity }) => {
      if (severity === 'high' || type === 'fire' || type === 'audio') {
        setActiveIncidents(prev => {
          if (prev.find(i => i.roomId === roomId && i.type === type)) return prev;
          const incident = { id: `inc_${Date.now()}`, roomId, type, severity, time: new Date().toISOString(), teamId: null };
          addLog(`🚨 Incident reported — Room ${roomId} (${type.toUpperCase()})`);
          return [incident, ...prev];
        });
      }
    });
    return unsub;
  }, []);

  function generateTacticalCode() {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    localStorage.setItem('daf_tactical_otp', code);
    setTacticalCode(code);
    addLog(`🔑 New Tactical Access Code generated: ${code}`);
    bus.emit('notification', { msg: `🔑 Tactical OTP Updated: ${code}`, type: 'success' });
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
    setActiveIncidents(prev => prev.map(i =>
      i.roomId === roomId ? { ...i, teamId } : i
    ));
    addLog(`🚒 ${TEAMS.find(t => t.id === teamId)?.name} dispatched to Room ${roomId}`);
    bus.emit('notification', { msg: `🚒 ${TEAMS.find(t => t.id === teamId)?.name} dispatched to Room ${roomId}`, type: 'warning' });
    showPath(roomId);
    setTimeout(() => {
      setTeams(prev => prev.map(t =>
        t.id === teamId ? { ...t, status: 'on-scene', responseTime: Math.round((Date.now() - now) / 1000) } : t
      ));
      addLog(`✅ ${TEAMS.find(t => t.id === teamId)?.name} arrived at Room ${roomId}`);
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
        
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '8px 16px', background: 'rgba(255,45,45,0.05)', border: '1px solid rgba(255,45,45,0.2)',
          borderRadius: 12,
        }}>
          <div>
             <div style={{ fontSize: 9, fontWeight: 900, color: 'var(--fire-red)', letterSpacing: 1 }}>TACTICAL ACCESS OTP</div>
             <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', fontFamily: 'JetBrains Mono', letterSpacing: 4 }}>{tacticalCode}</div>
          </div>
          <button 
            onClick={generateTacticalCode}
            style={{
              padding: '8px 12px', background: 'var(--fire-red)', color: '#fff', border: 'none',
              borderRadius: 6, fontSize: 10, fontWeight: 900, cursor: 'pointer'
            }}
          >GENERATE NEW</button>
        </div>

        <div className="flex gap-2">
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
      </div>

      {activeIncidents.length > 0 && (
        <div className="glass-card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14, color: 'var(--fire-red)' }}>
            🚨 Active Incidents
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
                      {assignedTeam ? `Assigned: ${assignedTeam.name} (${assignedTeam.status})` : 'No team assigned'}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button 
                      onClick={() => showPath(incident.roomId)}
                      style={{
                        padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                        background: 'rgba(78,158,255,0.15)', border: '1px solid rgba(78,158,255,0.4)',
                        color: '#4e9eff', cursor: 'pointer'
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
                <select className="form-select" style={{ width: '100%', fontSize: 12, marginBottom: 8 }} defaultValue="" onChange={e => { if (e.target.value) dispatch(team.id, e.target.value); }}>
                  <option value="">Dispatch to Room →</option>
                  {activeIncidents.filter(i => !i.teamId).map(i => <option key={i.roomId} value={i.roomId}>Room {i.roomId}</option>)}
                </select>
              ) : <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', padding: '8px 0' }}>No active incidents</div>
            ) : <button className="team-dispatch-btn" style={{ background: 'rgba(255,255,255,0.1)' }} onClick={() => recallTeam(team.id)}>↩️ Recall</button>}
          </div>
        ))}
      </div>

      <div className="glass-card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14, color: 'var(--text-secondary)' }}>📋 Activity Log</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
          {log.map((entry, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
              <span>{entry.msg}</span>
              <span className="mono text-dim" style={{ fontSize: 11 }}>{entry.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
