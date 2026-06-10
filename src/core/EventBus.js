/**
 * EventBus — Single-instance pub/sub for cross-component communication.
 *
 * Original API (unchanged):
 *   bus.on(event, cb)    → subscribe, returns unsub fn
 *   bus.off(event, cb)   → unsubscribe
 *   bus.emit(event, data)→ publish
 *   bus.once(event, cb)  → subscribe once
 *
 * New features added (non-breaking):
 *   bus.onAny(cb)                  → wildcard listener — fired for every event
 *   bus.offAny(cb)                 → remove wildcard listener
 *   bus.enableHistory(maxPerEvent) → turn on per-event ring-buffer replay
 *   bus.replay(event, cb)          → subscribe + immediately replay buffered history
 *   bus.clearHistory(event?)       → wipe history for one event, or all events
 *   bus.namespace(prefix)          → returns a scoped bus proxy (prefixes all events)
 *   bus.listenerCount(event)       → number of current listeners for an event
 */

class EventBus {
  constructor() {
    // ── Original state ────────────────────────────────────────────────────
    this.listeners = {};

    // ── New: wildcard listeners ───────────────────────────────────────────
    this._anyListeners = [];

    // ── New: history ring-buffer ──────────────────────────────────────────
    this._historyEnabled = false;
    this._historyMax     = 20;          // default ring-buffer depth per event
    this._history        = {};          // { [event]: Array<{ data, ts }> }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Original API — DO NOT MODIFY THESE THREE METHODS
  // ─────────────────────────────────────────────────────────────────────────

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  emit(event, data) {
    // ── New: record to history ring-buffer ────────────────────────────────
    if (this._historyEnabled) {
      if (!this._history[event]) this._history[event] = [];
      this._history[event].push({ data, ts: Date.now() });
      if (this._history[event].length > this._historyMax) {
        this._history[event].shift();
      }
    }

    // ── Original: fire named listeners ───────────────────────────────────
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }

    // ── New: fire wildcard listeners ──────────────────────────────────────
    if (this._anyListeners.length > 0) {
      this._anyListeners.forEach(cb => cb(event, data));
    }
  }

  once(event, callback) {
    const unsub = this.on(event, (data) => {
      callback(data);
      unsub();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // New: Wildcard listeners
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Subscribe to ALL events. Callback receives (eventName, data).
   * @param {function} callback
   * @returns {function} unsubscribe
   */
  onAny(callback) {
    this._anyListeners.push(callback);
    return () => this.offAny(callback);
  }

  /**
   * Remove a wildcard listener.
   * @param {function} callback
   */
  offAny(callback) {
    this._anyListeners = this._anyListeners.filter(cb => cb !== callback);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // New: History / Replay
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Enable per-event ring-buffer history so late subscribers can replay
   * past emissions. Call this once, early in app bootstrap.
   *
   * @param {number} [maxPerEvent=20]  Max stored emissions per event name.
   */
  enableHistory(maxPerEvent = 20) {
    this._historyEnabled = true;
    this._historyMax     = maxPerEvent;
  }

  /**
   * Subscribe to an event AND immediately replay all buffered history entries
   * to the callback (oldest-first). Useful for components that mount after
   * the first emission (e.g. HotelView3D mounting after fire alerts arrive).
   *
   * @param {string}   event
   * @param {function} callback
   * @returns {function} unsubscribe
   */
  replay(event, callback) {
    // 1. Replay existing history synchronously
    const past = this._history[event] || [];
    past.forEach(({ data }) => {
      try { callback(data); } catch (e) { console.error('[EventBus.replay] Error in replay callback:', e); }
    });

    // 2. Subscribe for future emissions
    return this.on(event, callback);
  }

  /**
   * Clear history for a specific event, or all events if called with no args.
   * @param {string} [event]
   */
  clearHistory(event) {
    if (event) {
      delete this._history[event];
    } else {
      this._history = {};
    }
  }

  /**
   * Returns a snapshot of buffered history for an event (read-only copy).
   * @param {string} event
   * @returns {Array<{ data: any, ts: number }>}
   */
  getHistory(event) {
    return [...(this._history[event] || [])];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // New: Namespaced proxy
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Returns a lightweight proxy that automatically prefixes all event names
   * with `${prefix}:`.  Useful for feature modules that want to avoid naming
   * collisions without importing a separate bus instance.
   *
   * Example:
   *   const hazardBus = bus.namespace('hazard');
   *   hazardBus.emit('update', data);   // fires 'hazard:update' on the root bus
   *   hazardBus.on('update', cb);       // listens to 'hazard:update' on root bus
   *
   * @param {string} prefix
   * @returns {{ on, off, emit, once, replay }}
   */
  namespace(prefix) {
    const ns  = (event) => `${prefix}:${event}`;
    const self = this;
    return {
      on:     (event, cb)   => self.on(ns(event), cb),
      off:    (event, cb)   => self.off(ns(event), cb),
      emit:   (event, data) => self.emit(ns(event), data),
      once:   (event, cb)   => self.once(ns(event), cb),
      replay: (event, cb)   => self.replay(ns(event), cb),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // New: Utility
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Returns the number of active subscribers for a given event.
   * @param {string} event
   * @returns {number}
   */
  listenerCount(event) {
    return (this.listeners[event] || []).length;
  }
}

// ── Enable history by default (depth = 50 per event) so HotelView3D can
//    replay hazard:update / room:statusChange events that fired while it
//    was unmounted or not yet mounted. ──────────────────────────────────────
const bus = new EventBus();
bus.enableHistory(50);

export { bus };
export default bus;