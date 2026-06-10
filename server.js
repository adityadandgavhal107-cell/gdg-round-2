import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import path from 'path';
import cron from 'node-cron'; // For 11:00 AM Automated Eviction Engine
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

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🔥 FireGuard Signaling Server running on port ${PORT}`);
  console.log(`   Admin:  http://localhost:5173`);
  console.log(`   Camera: http://<your-ip>:5173/cam\n`);
});