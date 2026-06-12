import bus from './EventBus.js';
import { findBestEvacuationTarget } from '../data/hotel.js';

class EvacuationEngine {
  constructor() {
    this.guests = new Map(); // guestId -> { currentRoom, assignedPath, mode, lastUpdate }
    this.blockedRooms = {}; // roomId -> status ('fire' | 'smoke' | 'down')

    this._initListeners();
  }

  _initListeners() {
    // Listen to room status changes from AlertEngine or elsewhere
    bus.on('room:statusChange', ({ roomId, status }) => {
      const oldStatus = this.blockedRooms[roomId];
      if (status === 'clear') {
        delete this.blockedRooms[roomId];
      } else {
        this.blockedRooms[roomId] = status;
      }

      if (oldStatus !== status) {
        this._handleHazardChange(roomId, status);
      }
    });

    // Listen to sensor:down events
    bus.on('sensor:down', ({ roomId }) => {
      const oldStatus = this.blockedRooms[roomId];
      this.blockedRooms[roomId] = 'down';

      if (oldStatus !== 'down') {
        this._handleHazardChange(roomId, 'down');
      }
    });
  }

  _handleHazardChange(changedRoomId, newStatus) {
    console.log(`[EvacuationEngine] Hazard change in Room ${changedRoomId}: ${newStatus}`);
    
    // For every guest whose assigned path passes through the changed room
    for (const [guestId, guest] of this.guests.entries()) {
      if (guest.assignedPath && guest.assignedPath.includes(changedRoomId)) {
        const currentRoom = guest.currentRoom;

        // Recalculate safest path (exit or refuge fallback)
        const result = findBestEvacuationTarget(currentRoom, this.blockedRooms);
        guest.assignedPath = result?.path ?? [];
        guest.mode = result?.mode ?? 'exit';
        guest.lastUpdate = Date.now();

        console.log(`[EvacuationEngine] Recalculated path for guest ${guestId} (mode: ${guest.mode}): ${guest.assignedPath.join(' ➔ ')}`);

        // Emit evacuation:pathUpdate event
        bus.emit('evacuation:pathUpdate', {
          guestId,
          newPath: result.path,
          mode: result.mode,
          reason: `Hazard detected in room ${changedRoomId} (status: ${newStatus}). Route recalculated.`
        });
      }
    }
  }

  assignGuestPath(guestId, fromRoom) {
    const result = findBestEvacuationTarget(fromRoom, this.blockedRooms);
    this.guests.set(guestId, {
      currentRoom: fromRoom,
      assignedPath: result?.path ?? [],
      mode: result?.mode ?? 'exit',
      lastUpdate: Date.now()
    });
    return { path: result?.path ?? [], mode: result?.mode ?? 'exit' };
  }

  updateGuestPosition(guestId, roomId) {
    const guest = this.guests.get(guestId);
    if (!guest) {
      // If guest not found, assign initial path from this room
      this.assignGuestPath(guestId, roomId);
      return;
    }

    guest.currentRoom = roomId;
    guest.lastUpdate = Date.now();

    // Check if the guest is still on their assigned path
    const index = guest.assignedPath.indexOf(roomId);
    if (index !== -1) {
      // Guest is on the path, slice the path from their current position onward
      guest.assignedPath = guest.assignedPath.slice(index);
    } else {
      // Guest went off path, recalculate path from their new position
      const result = findBestEvacuationTarget(roomId, this.blockedRooms);
      guest.assignedPath = result?.path ?? [];
      guest.mode = result?.mode ?? 'exit';

      bus.emit('evacuation:pathUpdate', {
        guestId,
        newPath: result.path,
        mode: result.mode,
        reason: `Guest moved off path to room ${roomId}. Route recalculated.`
      });
    }
  }

  getGuestPath(guestId) {
    return this.guests.get(guestId)?.assignedPath || null;
  }

  getActiveGuests() {
    return Array.from(this.guests.entries()).map(([guestId, data]) => ({
      guestId,
      ...data
    }));
  }
}

export const evacuationEngine = new EvacuationEngine();
export default evacuationEngine;