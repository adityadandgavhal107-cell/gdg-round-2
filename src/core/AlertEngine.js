import bus from './EventBus.js';

// Severity thresholds — these should be ≤ the detector's own FIRE_THRESHOLD (0.45)
// so AlertEngine never silently drops real detections from the FireDetector pipeline.
const THRESHOLDS = {
  audio: { confidence: 0.12, severity: 'low' },
  smoke: { confidence: 0.40, severity: 'medium' },
  fire:  { confidence: 0.40, severity: 'high' },
};

let alertHistory = [];
let activeAlerts = {};

export function initAlertEngine() {
  bus.on('detection:raw', handleDetection);
}

function handleDetection(detection) {
  const { type, confidence, roomId, floor } = detection;
  const threshold = THRESHOLDS[type];
  if (!threshold || confidence < threshold.confidence) return;

  const alertId = `${roomId}_${type}`;
  const now = new Date().toISOString();

  // Prevent duplicate alerts within 10s
  if (activeAlerts[alertId] && (Date.now() - activeAlerts[alertId].ts) < 10000) return;

  const alert = {
    id: `alert_${Date.now()}`,
    timestamp: now,
    type,
    confidence: Math.round(confidence * 100),
    location: { roomId, floor },
    severity: threshold.severity,
    status: 'active',
    affectedGuests: [],
  };

  activeAlerts[alertId] = { ...alert, ts: Date.now() };
  alertHistory.unshift(alert);
  if (alertHistory.length > 100) alertHistory.pop();

  // Emit structured alert
  bus.emit('alert:new', alert);

  // Update room status on 3D model
  bus.emit('room:statusChange', { roomId, status: type === 'fire' ? 'fire' : type === 'smoke' ? 'smoke' : 'audio' });

  // Auto-escalate: if audio then smoke detected in same room → escalate to high
  if (type === 'smoke' || type === 'fire') {
    bus.emit('alert:escalate', { roomId, type, severity: threshold.severity });
  }
}

export function resolveAlert(roomId) {
  Object.keys(activeAlerts).forEach(key => {
    if (key.startsWith(roomId)) delete activeAlerts[key];
  });
  bus.emit('room:statusChange', { roomId, status: 'clear' });
  bus.emit('alert:resolved', { roomId });
}

export function getAlertHistory() {
  return alertHistory;
}

export function getActiveAlerts() {
  return Object.values(activeAlerts);
}
