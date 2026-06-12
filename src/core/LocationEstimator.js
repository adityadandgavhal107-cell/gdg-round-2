import bus from './EventBus.js';
import evacuationEngine from './EvacuationEngine.js';

class LocationEstimator {
  constructor() {
    this.estimates = new Map(); // guestId -> { guestId, estimatedRoom, confidence, lastConfirmed, method }
    
    // Periodically advance guests every 30 seconds as a fallback estimate
    this.intervalId = setInterval(() => {
      this._advanceActiveGuests();
    }, 30000);
  }

  initGuest(guestId, checkinRoom) {
    const estimate = {
      guestId,
      estimatedRoom: checkinRoom,
      confidence: 100,
      lastConfirmed: Date.now(),
      method: 'checkin'
    };
    this.estimates.set(guestId, estimate);
    bus.emit('location:update', estimate);
    return estimate;
  }

  updateFromVoice(guestId, roomId) {
    const estimate = {
      guestId,
      estimatedRoom: roomId,
      confidence: 95, // 95% confidence from voice confirmation
      lastConfirmed: Date.now(),
      method: 'verbal'
    };
    this.estimates.set(guestId, estimate);
    
    // Update the position in the evacuation engine so path is calculated from here
    evacuationEngine.updateGuestPosition(guestId, roomId);

    bus.emit('location:update', estimate);
    return estimate;
  }

  advanceAlongPath(guestId) {
    const est = this.estimates.get(guestId);
    if (!est) return;

    // Get the assigned path from the evacuation engine
    const path = evacuationEngine.getGuestPath(guestId);
    if (!path || path.length <= 1) return; // Already at exit or no path

    const currentIndex = path.indexOf(est.estimatedRoom);
    if (currentIndex !== -1 && currentIndex < path.length - 1) {
      const nextRoom = path[currentIndex + 1];
      
      // Advance position
      est.estimatedRoom = nextRoom;
      est.confidence = Math.max(0, est.confidence - 10); // uncertainty grows
      est.lastConfirmed = Date.now();
      est.method = 'inferred';

      // Update position in the evacuation engine
      evacuationEngine.updateGuestPosition(guestId, nextRoom);

      bus.emit('location:update', est);
    }
  }

  _advanceActiveGuests() {
    for (const [guestId, est] of this.estimates.entries()) {
      // Only advance if they are not already at safety / exit
      if (est.estimatedRoom !== 'EXIT_LEFT' && est.estimatedRoom !== 'EXIT_RIGHT') {
        const path = evacuationEngine.getGuestPath(guestId);
        // Only advance if they have an active evacuation path
        if (path && path.length > 0) {
          this.advanceAlongPath(guestId);
        }
      }
    }
  }

  getEstimate(guestId) {
    return this.estimates.get(guestId) || null;
  }

  getAllEstimates() {
    return Array.from(this.estimates.values());
  }

  destroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }
}

export const locationEstimator = new LocationEstimator();
export default locationEstimator;