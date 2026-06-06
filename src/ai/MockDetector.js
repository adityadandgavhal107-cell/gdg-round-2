import bus from '../core/EventBus.js';
import { hotelData } from '../data/hotel.js';

// MockDetector generates realistic detections for demo purposes
// Can be replaced by real WebSocket events from Python AI pipeline

let detectionInterval = null;
let activeRoomIds = []; // Rooms we're "watching"

const DETECTION_TYPES = ['fire', 'smoke', 'audio'];

// Bounding box proportions (% of video frame)
function randomBBox() {
  const x = 0.1 + Math.random() * 0.5;
  const y = 0.1 + Math.random() * 0.4;
  const w = 0.15 + Math.random() * 0.25;
  const h = 0.15 + Math.random() * 0.25;
  return { x, y, w, h };
}

export function startMockDetector(roomIds = []) {
  activeRoomIds = roomIds;
  if (detectionInterval) clearInterval(detectionInterval);

  detectionInterval = setInterval(() => {
    if (activeRoomIds.length === 0) return;
    // Only randomly detect every ~5s per room on average
    if (Math.random() > 0.3) return;

    const roomId = activeRoomIds[Math.floor(Math.random() * activeRoomIds.length)];
    const type = pickDetectionType();
    const confidence = 0.65 + Math.random() * 0.34;
    const floor = parseInt(roomId[0]) || 1;

    const detection = {
      type,
      confidence,
      roomId,
      floor,
      bbox: randomBBox(),
      timestamp: new Date().toISOString(),
      modelSource: type === 'fire' ? 'OpenCV' : type === 'smoke' ? 'YOLOv8' : 'YAMNet',
    };

    bus.emit('detection:raw', detection);
    bus.emit('detection:overlay', detection); // For canvas rendering
  }, 1500);
}

function pickDetectionType() {
  const r = Math.random();
  if (r < 0.15) return 'fire';
  if (r < 0.40) return 'smoke';
  return 'audio';
}

export function stopMockDetector() {
  if (detectionInterval) clearInterval(detectionInterval);
  detectionInterval = null;
}

export function addWatchedRoom(roomId) {
  if (!activeRoomIds.includes(roomId)) activeRoomIds.push(roomId);
}

export function removeWatchedRoom(roomId) {
  activeRoomIds = activeRoomIds.filter(id => id !== roomId);
}

export function triggerManualDetection(roomId, type = 'fire') {
  const floor = parseInt(roomId[0]) || 1;
  bus.emit('detection:raw', {
    type,
    confidence: 0.97,
    roomId,
    floor,
    bbox: randomBBox(),
    timestamp: new Date().toISOString(),
    modelSource: type === 'fire' ? 'OpenCV' : type === 'smoke' ? 'YOLOv8' : 'YAMNet',
    manual: true,
  });
}
