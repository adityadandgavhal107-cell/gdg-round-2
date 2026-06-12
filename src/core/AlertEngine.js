import bus from './EventBus.js';

const THRESHOLDS = {
  audio:    { confidence: 0.12, severity: 'low'      },
  smoke:    { confidence: 0.40, severity: 'medium'   },
  fire:     { confidence: 0.40, severity: 'high'     },
  medical:  { confidence: 0.90, severity: 'critical' },
  health:   { confidence: 0.90, severity: 'critical' }, // alias — guest.html sends 'health'
  security: { confidence: 0.90, severity: 'high'     },
};

// One alert per room+type per DEDUP_MS window — covers all socket round-trips
const DEDUP_MS = 60_000; // 60 seconds

const STORAGE_KEY = 'fireguard_active_alerts';

let alertHistory = [];

// Key → { alert object, ts: timestamp }
let activeAlerts = {};

/* ── Persistence helpers ──────────────────────────────────────────────── */
function saveActiveAlerts() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(activeAlerts));
  } catch (e) {
    console.warn('[AlertEngine] Could not persist alerts:', e);
  }
}

function loadActiveAlerts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    // Restore into memory — skip anything older than 24 h to avoid stale phantom alerts
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    Object.entries(parsed).forEach(([key, entry]) => {
      if (entry.ts >= cutoff) {
        activeAlerts[key] = entry;
        alertHistory.unshift(entry);
      }
    });
    if (alertHistory.length > 100) alertHistory.length = 100;
  } catch (e) {
    console.warn('[AlertEngine] Could not load persisted alerts:', e);
  }
}

export function initAlertEngine() {
  if (initAlertEngine._initialized) return;
  initAlertEngine._initialized = true;

  // Restore persisted state first so any subscriber that calls getActiveAlerts()
  // immediately after init sees the correct list.
  loadActiveAlerts();

  bus.on('detection:raw', handleDetection);
}

function handleDetection(detection) {
  // ── 1. Normalize type ─────────────────────────────────────────────
  const rawType = detection.type || detection.alertType || detection.alert_type || '';
  const type = rawType === 'health' ? 'medical' : rawType;

  // ── 2. Normalize roomId — backends send it under different keys ───
  const roomId =
    detection.roomId        ||
    detection.room_id       ||
    detection.room          ||
    detection.location?.roomId ||
    'unknown';

  const floor =
    detection.floor         ||
    detection.location?.floor ||
    '—';

  // Confidence: guest SOS always sends 1.0; camera detections send 0–1
  const confidence =
    typeof detection.confidence === 'number'
      ? detection.confidence
      : 1.0;

  // ── 3. Threshold check ────────────────────────────────────────────
  const threshold = THRESHOLDS[type];
  if (!threshold || confidence < threshold.confidence) return;

  // ── 4. Dedup: one alert per room+type per window ──────────────────
  const dedupKey = `${roomId}__${type}`;
  const now = Date.now();

  if (activeAlerts[dedupKey] && (now - activeAlerts[dedupKey].ts) < DEDUP_MS) {
    console.debug(`[AlertEngine] Suppressed duplicate: ${dedupKey}`);
    return;
  }

  // ── 5. Build & store alert ────────────────────────────────────────
  const alert = {
    id:        `alert_${now}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date(now).toISOString(),
    type,
    confidence: Math.round(confidence * 100),
    location:  { roomId, floor },
    severity:  threshold.severity,
    status:    'active',
    affectedGuests: [],
  };

  // Stamp ts immediately — before any async/emit so re-entrant calls see it
  activeAlerts[dedupKey] = { ...alert, ts: now };
  alertHistory.unshift(alert);
  if (alertHistory.length > 100) alertHistory.pop();

  // Persist immediately so a refresh doesn't lose this alert
  saveActiveAlerts();

  // ── 6. Emit downstream events ─────────────────────────────────────
  bus.emit('alert:new', alert);

  bus.emit('room:statusChange', {
    roomId,
    status: type === 'fire'     ? 'fire'
          : type === 'smoke'    ? 'smoke'
          : type === 'medical'  ? 'medical'
          : type === 'security' ? 'security'
          : 'audio',
  });

  // DAF escalation — fire, smoke, medical, security all dispatch
  if (['fire', 'smoke', 'medical', 'security'].includes(type)) {
    bus.emit('alert:escalate', { roomId, type, severity: threshold.severity });
  }
}

export function resolveAlert(roomId) {
  // Remove all alert keys belonging to this room
  Object.keys(activeAlerts).forEach(key => {
    if (key.startsWith(roomId + '__')) delete activeAlerts[key];
  });

  // Mark matching history entries as resolved
  alertHistory = alertHistory.map(a =>
    a.location?.roomId === String(roomId)
      ? { ...a, status: 'resolved' }
      : a
  );

  // Persist the updated state (resolved alerts are gone from activeAlerts)
  saveActiveAlerts();

  bus.emit('room:statusChange', { roomId, status: 'clear' });

  // Emit alert:resolved with live active count so TopBar badge stays in sync
  bus.emit('alert:resolved', {
    roomId,
    remainingCount: Object.keys(activeAlerts).length,
  });
}

// Returns only currently active (unresolved) alerts
export function getActiveAlerts() {
  return Object.values(activeAlerts);
}

// Returns full history including resolved alerts
export function getAlertHistory() {
  return alertHistory;
}