import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import path from 'path';
import cron from 'node-cron'; // For 11:00 AM Automated Eviction Engine
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import {
  getFirstRingNeighbors,
  getSecondRingNeighbors,
} from './src/data/hotel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Enable JSON middleware parser for API routes if needed
app.use(express.json());

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// ── Arduino Serial Config ─────────────────────────────────────────────────────
const ARDUINO_COM_PORT  = 'COM3';   // ← your Arduino port
const ARDUINO_ROOM_ID   = '101';    // ← which room the real sensor monitors
const ARDUINO_BAUD_RATE = 9600;     // must match your Arduino sketch

// Tracks whether the Arduino serial port is currently open
let arduinoConnected = false;

/**
 * Parse a single line from the Arduino serial monitor.
 * Returns: 'fire' | 'smoke' | 'normal'
 */
function parseArduinoLine(line) {
  const l = line.trim();
  if (l.includes('FIRE DETECTED'))  return 'fire';
  if (l.includes('SMOKE DETECTED')) return 'smoke';
  return 'normal';
}

/**
 * Open the Arduino serial port and wire up the data pipeline.
 * Automatically retries every 5 seconds if the port is unavailable.
 */
function initArduinoSerial() {
  let port;

  try {
    port = new SerialPort({ path: ARDUINO_COM_PORT, baudRate: ARDUINO_BAUD_RATE });
  } catch (err) {
    console.error(`[ARDUINO] Failed to open ${ARDUINO_COM_PORT}:`, err.message);
    io.emit('arduino:status', { status: 'error', port: ARDUINO_COM_PORT });
    setTimeout(initArduinoSerial, 5000);
    return;
  }

  const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

  port.on('open', () => {
    arduinoConnected = true;
    console.log(`\n🔌 [ARDUINO] Serial port ${ARDUINO_COM_PORT} opened at ${ARDUINO_BAUD_RATE} baud`);
    console.log(`   Monitoring Room: ${ARDUINO_ROOM_ID}`);
    io.emit('arduino:status', { status: 'connected', port: ARDUINO_COM_PORT });
  });

  port.on('error', (err) => {
    arduinoConnected = false;
    console.error(`[ARDUINO] Port error on ${ARDUINO_COM_PORT}:`, err.message);
    io.emit('arduino:status', { status: 'error', port: ARDUINO_COM_PORT });
  });

  port.on('close', () => {
    arduinoConnected = false;
    console.warn(`[ARDUINO] Port ${ARDUINO_COM_PORT} closed — retrying in 5s…`);
    io.emit('arduino:status', { status: 'offline', port: ARDUINO_COM_PORT });
    setTimeout(initArduinoSerial, 5000);
  });

  parser.on('data', (rawLine) => {
    const line   = rawLine.trim();
    if (!line || line === '------------------------') return;

    const parsed = parseArduinoLine(line);
    const roomId = ARDUINO_ROOM_ID;

    // Broadcast raw line + parsed result to all connected clients for the live feed
    io.emit('arduino:reading', { raw: line, parsed, roomId });

    if (parsed === 'normal') return; // No hazard — nothing to propagate

    const ts = new Date().toISOString();
    console.log(`[ARDUINO] Room ${roomId}: ${parsed.toUpperCase()} — "${line}"`);

    // Reuse the exact same hazard functions used by detection:manual
    if (parsed === 'fire') {
      propagateFireHazards(roomId);
    } else if (parsed === 'smoke') {
      applyHazard(roomId, 'smoke', 0.75);
    }

    // Emit detection:alert for backward compatibility (AlertEngine listens)
    const alert = {
      id:         `arduino_${Date.now()}`,
      roomId,
      type:       parsed,
      timestamp:  ts,
      confidence: parsed === 'fire' ? 0.98 : 0.75,
      source:     'arduino_serial',
    };
    io.emit('detection:alert', alert);

    // Broadcast the updated full hazard map to all clients
    broadcastHazards();
  });
}

// ── Master Hazard State (Single Source of Truth) ──────────────────────────
// Shape: { [roomId]: { type: 'fire'|'smoke'|'buffer', intensity: number } }
const hazards = {};

// Track connected cameras: roomId -> socketId
const cameras = {};
// Track admin sockets
const admins = new Set();
// Track live checked-in hotel guests
let hotelGuests = [];

// ── Hazard severity ordering ──────────────────────────────────────────────
const SEVERITY = { fire: 3, smoke: 2, buffer: 1 };

// Start the Arduino serial bridge after all state variables are initialized
initArduinoSerial();

/**
 * Apply a hazard to a room. Never downgrades an existing higher-severity type.
 */
function applyHazard(roomId, type, intensity) {
  const id = String(roomId);
  const current = hazards[id];
  if (current && (SEVERITY[current.type] ?? 0) >= (SEVERITY[type] ?? 0)) return;
  hazards[id] = { type, intensity };
}

/**
 * Given a fire room, stamp fire on that room, smoke on first-ring neighbors,
 * and buffer on second-ring neighbors. Never downgrades existing hazards.
 */
function propagateFireHazards(fireRoomId) {
  const id = String(fireRoomId);

  applyHazard(id, 'fire', 1.0);

  getFirstRingNeighbors(id).forEach(n => applyHazard(n, 'smoke', 0.7));
  getSecondRingNeighbors(id).forEach(n => applyHazard(n, 'buffer', 0.35));
}

/**
 * Broadcast the full hazard map to every connected client.
 */
function broadcastHazards() {
  io.emit('hazards:update', hazards);
}

/**
 * Re-evaluate and clean up smoke/buffer zones after a fire room is resolved.
 * A smoke/buffer room is kept only if it still has a live fire source.
 */
function recomputeHazardsAfterResolution(resolvedFireId) {
  const id = String(resolvedFireId);
  delete hazards[id];

  const allNeighbors = [
    ...getFirstRingNeighbors(id),
    ...getSecondRingNeighbors(id),
  ];

  allNeighbors.forEach(nid => {
    const h = hazards[nid];
    if (!h || h.type === 'fire') return; // don't touch other fire rooms or missing

    if (h.type === 'smoke') {
      // Keep if still adjacent to a live fire room
      const stillHasFire = getFirstRingNeighbors(nid).some(
        nn => hazards[nn]?.type === 'fire',
      );
      if (!stillHasFire) delete hazards[nid];
    }

    if (h.type === 'buffer') {
      // Keep if still in the second ring of any live fire room
      const inSecondRingOfFire = Object.keys(hazards).some(fireId => {
        if (hazards[fireId]?.type !== 'fire') return false;
        return getSecondRingNeighbors(fireId).includes(nid);
      });
      if (!inSecondRingOfFire) delete hazards[nid];
    }
  });
}

// ==========================================
// ⏰ AUTOMATIC 11:00 AM GUEST EVICTION ENGINE
// ==========================================
/**
 * Cron pattern: 0 11 * * * -> Min 0, Hour 11, Every Day, Month, Week
 * Executes an eviction sweep on the hotel database precisely at 11:00 AM.
 */
cron.schedule('3 10 * * *', async () => {
  console.log('\n⏰ [EVICTION ENGINE] Executing automated 11:00 AM checkout sweep...');

  // Format target date structure into standard local comparison string (YYYY-MM-DD)
  const todayString = new Date().toLocaleDateString('en-CA'); // Outputs perfectly as YYYY-MM-DD

  const totalBefore = hotelGuests.length;

  // Filter out and retain guests whose checkout date is in the future
  hotelGuests = hotelGuests.filter(guest => guest.checkOutDate !== todayString);
  const totalEvicted = totalBefore - hotelGuests.length;

  if (totalEvicted > 0) {
    console.log(`🧹 [EVICTION ENGINE] Cleaned up ${totalEvicted} expired guest accounts due for check-out today (${todayString}).`);
    // Broadcast clean database state layout updates to all administrative displays and clients
    io.emit('guest:roster_update', hotelGuests);
  } else {
    console.log(`ℹ️ [EVICTION ENGINE] No matching departures found for date: ${todayString}.`);
  }

  // Also trigger auto-eviction on the FastAPI / SQLite backend
  try {
    const res = await fetch('http://localhost:8000/api/guests/auto-evict', { method: 'DELETE' });
    const data = await res.json();
    console.log(`🗄️  [EVICTION ENGINE] SQLite eviction: ${data.evicted} guest(s) removed for ${data.date}.`);
    // Notify all admin dashboards to re-fetch their guest lists
    io.emit('guests:auto_evicted', { count: data.evicted, date: data.date });
  } catch (err) {
    console.error('❌ [EVICTION ENGINE] Failed to reach FastAPI auto-evict endpoint:', err.message);
  }
});

// ─────────────────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);
  socket.onAny((event, ...args) => {
    console.log('[SOCKET EVENT]', event, args);
  });

  // ── 1. Send current hazard state immediately ──────────────────────────
  socket.emit('hazards:init', hazards);

  // ── Camera registration ───────────────────────────────────────────────
  socket.on('camera:register', ({ roomId }) => {
    cameras[roomId] = socket.id;
    socket.roomId = roomId;
    socket.isCamera = true;
    console.log(`Camera registered for room ${roomId}`);
    admins.forEach(adminId => {
      io.to(adminId).emit('camera:available', { roomId, socketId: socket.id });
    });
  });

  // ── Arduino status request (called by SensorSimPanel on mount) ───────
  socket.on('arduino:request_status', () => {
    socket.emit('arduino:status', {
      status: arduinoConnected ? 'connected' : 'offline',
      port:   ARDUINO_COM_PORT,
    });
  });

  // ── Admin registration ────────────────────────────────────────────────
  socket.on('admin:register', () => {
    admins.add(socket.id);
    socket.isAdmin = true;
    console.log(`Admin registered: ${socket.id}`);
    socket.emit('camera:list', cameras);
    // Send current hazard state to new admin
    socket.emit('hazards:init', hazards);
    // Send immediate sync layout of current guests to admin on launch
    socket.emit('guest:roster_update', hotelGuests);
  });

  // ── WebRTC signaling ──────────────────────────────────────────────────
  socket.on('webrtc:offer', ({ targetId, offer, roomId }) =>
    io.to(targetId).emit('webrtc:offer', { from: socket.id, offer, roomId }),
  );
  socket.on('webrtc:answer', ({ targetId, answer }) =>
    io.to(targetId).emit('webrtc:answer', { from: socket.id, answer }),
  );
  socket.on('webrtc:ice', ({ targetId, candidate }) =>
    io.to(targetId).emit('webrtc:ice', { from: socket.id, candidate }),
  );

  // ── Fire/Smoke detection from camera / manual trigger ─────────────────
  socket.on('detection:manual', (data) => {
    const confidence = data.confidence ?? 0.95;
    const roomId = String(data.roomId);
    const type = data.type || 'fire';

    console.log(`[DETECTION] Room ${roomId}: ${type} (${Math.round(confidence * 100)}%)`);
    console.log('EMITTING TO ALL CLIENTS', data.roomId, data.type);

    if (type === 'fire' || (type === 'smoke' && confidence > 0.4)) {
      propagateFireHazards(roomId);
    } else {
      applyHazard(roomId, type, confidence);
    }
  
  // Server-side — when detection:manual is received
  socket.on('detection:manual', (data) => {
    // Broadcast to ALL sockets (guests included), not just admin room
    io.emit('detection:alert', {
      roomId:     data.roomId,
      type:       data.type,
      confidence: data.confidence,
      source:     data.source,
      ts:         Date.now(),
    });
  });
  
  
    // Legacy alert events — kept for backward compatibility with older listeners
    const alert = {
      id: `det_${Date.now()}`,
      roomId,
      type,
      timestamp: new Date().toISOString(),
      confidence,
      source: data.source || 'camera_client',
    };
    io.emit('detection:alert', alert);

    const severity = confidence > 0.8 ? 'high' : 'medium';
    io.emit('alert:escalate', {
      roomId,
      type,
      severity,
      intensity: confidence,
      source: 'automated',
    });

    // Authoritative hazard broadcast — all clients use this as truth
    broadcastHazards();

    console.log('[HAZARDS] Current state:', JSON.stringify(hazards));
  });

  // ── Internal spread event from fireSpread.js ──────────────────────────
  socket.on('spread:fire', ({ roomId }) => {
    propagateFireHazards(String(roomId));
    broadcastHazards();
    console.log(`[SPREAD] Fire spread to ${roomId}`);
  });

  // ── Alert resolved ────────────────────────────────────────────────────
  socket.on('alert:resolved', ({ roomId, clearedBy }) => {
    if (!roomId) return;
    const id = String(roomId);
    console.log(`[RESOLVED] Room ${id} cleared by ${clearedBy || 'unknown'}`);

    recomputeHazardsAfterResolution(id);
    broadcastHazards();

    // Legacy broadcast for older listeners
    socket.broadcast.emit('alert:resolved', { roomId: id, clearedBy });
    console.log('[HAZARDS] After resolution:', JSON.stringify(hazards));
  });

  // ── Admin: force-set hazard (testing / manual override) ───────────────
  socket.on('hazard:set', ({ roomId, type, intensity }) => {
    if (!socket.isAdmin) return;
    if (type === 'fire') {
      propagateFireHazards(String(roomId));
    } else {
      applyHazard(String(roomId), type, intensity ?? 1.0);
    }
    broadcastHazards();
  });

  // ── Admin: clear all hazards ───────────────────────────────────────────
  socket.on('hazards:clear', () => {
    if (!socket.isAdmin) return;
    Object.keys(hazards).forEach(k => delete hazards[k]);
    broadcastHazards();
    console.log('[HAZARDS] All hazards cleared by admin');
  });

  // ── Guest Registration Layer ──────────────────────────────────────────
  socket.on('guest:register_checkin', (guestFormPayload) => {
    try {
      const checkIn = new Date(guestFormPayload.checkInDate);
      const checkOut = new Date(guestFormPayload.checkOutDate);

      // Math parsing calculation to isolate staying nights count metrics
      const timeDiff = checkOut.getTime() - checkIn.getTime();
      const calculatedNights = Math.ceil(timeDiff / (1000 * 3600 * 24));

      const finalGuestRecord = {
        id: `guest_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        name: guestFormPayload.name,
        age: parseInt(guestFormPayload.age) || null,
        roomId: String(guestFormPayload.roomId),
        contact: guestFormPayload.contact || '',
        specialNeeds: guestFormPayload.specialNeeds || [],
        checkInDate: guestFormPayload.checkInDate,
        checkOutDate: guestFormPayload.checkOutDate,
        nights: calculatedNights > 0 ? calculatedNights : 1, // Fallback guard to 1 night
        checkedInAt: new Date().toISOString(),
      };

      hotelGuests.push(finalGuestRecord);
      console.log(`➕ [CHECK-IN REST] Guest '${finalGuestRecord.name}' registered to Room ${finalGuestRecord.roomId} for ${finalGuestRecord.nights} nights.`);

      // Broadcast update loop across active pipeline channels
      io.emit('guest:roster_update', hotelGuests);

      // Send individual execution acknowledgement block trace
      socket.emit('guest:checkin_success', finalGuestRecord);
    } catch (err) {
      console.error('❌ Error handling guest registration check-in:', err);
      socket.emit('guest:checkin_error', { message: 'Failed processing database stay intervals.' });
    }
  });

  // ── Fetch complete guest profile allocations on demand ────────────────
  socket.on('guest:request_roster', () => {
    socket.emit('guest:roster_update', hotelGuests);
  });

  // ── Disconnect ────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    if (socket.isCamera && socket.roomId) {
      delete cameras[socket.roomId];
      admins.forEach(adminId =>
        io.to(adminId).emit('camera:disconnected', { roomId: socket.roomId }),
      );
    }
    if (socket.isAdmin) admins.delete(socket.id);
    console.log('Disconnected:', socket.id);
  });
});

// ── Fallback: return a clear 404 for any non-socket HTTP request ─────────────
// Without this, Express returns an empty response (0 B) for unmatched routes,
// which causes socket.io's XHR polling transport to stall and show 0 B in DevTools.
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', hint: 'This is the FireGuard signaling server.' });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🔥 FireGuard Signaling Server running on port ${PORT}`);
  console.log(`   Admin:  http://localhost:5173`);
  console.log(`   Camera: http://<your-ip>:5173/cam\n`);
});