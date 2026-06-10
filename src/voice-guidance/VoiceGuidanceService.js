/**
 * VoiceGuidanceService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Premium hotel-grade Text-to-Speech engine.
 *
 * Responsibilities:
 *   • Owns the SpeechSynthesis lifecycle (cancel, speak, resume on iOS).
 *   • Manages a sequential instruction queue — no overlapping speech.
 *   • Configurable inter-instruction pause (default 700 ms).
 *   • Replay last instruction on demand.
 *   • Gracefully recovers from browser refresh / page-visibility changes.
 *   • Picks the best available English voice (prefers female, natural).
 *   • Exposes a stable singleton so React, vanilla JS, and workers share it.
 *
 * Usage:
 *   import VoiceGuidanceService from './VoiceGuidanceService';
 *   VoiceGuidanceService.speak("Please proceed to the staircase on your left.");
 *   VoiceGuidanceService.enqueue(["Step one", "Step two", "Step three"]);
 *   VoiceGuidanceService.replay();
 *   VoiceGuidanceService.stop();
 */

// ─── Configuration ────────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  rate:           0.88,   // Slightly slower than default; calm concierge pace
  pitch:          1.05,   // Barely above flat; warm, not robotic
  volume:         1.0,
  pauseBetweenMs: 700,    // Gap between consecutive queued instructions
  lang:           'en-US',

  // Voice preference priority (matched against voice.name, case-insensitive)
  voicePreference: [
    'samantha',       // macOS / iOS — the "Siri" voice
    'karen',          // Australian English — warm
    'moira',          // Irish English — clear
    'daniel',         // British English — professional
    'google uk english female',
    'google us english',
    'microsoft zira', // Windows — clean female
    'microsoft aria',
    'en-us',          // fallback: any en-US voice
    'en-gb',
  ],
};

// ─── Singleton factory ────────────────────────────────────────────────────────
function createVoiceGuidanceService(userConfig = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...userConfig };

  /** @type {SpeechSynthesisVoice | null} */
  let _selectedVoice  = null;
  let _voices         = [];
  let _queue          = [];          // string[]
  let _isPlaying      = false;
  let _lastInstruction = '';
  let _pauseTimer     = null;
  let _initialized    = false;

  // ── Voice selection ──────────────────────────────────────────────────────
  function _loadVoices() {
    if (!window.speechSynthesis) return;
    _voices = window.speechSynthesis.getVoices();
    if (_voices.length === 0) return; // will be called again via onvoiceschanged

    const lower = (s) => s.toLowerCase();

    // Try each preference in order
    for (const pref of cfg.voicePreference) {
      const match = _voices.find(
        (v) =>
          lower(v.name).includes(pref) ||
          lower(v.lang).includes(pref)
      );
      if (match) {
        _selectedVoice = match;
        break;
      }
    }

    // Ultimate fallback: first English voice, then first voice of any kind
    if (!_selectedVoice) {
      _selectedVoice =
        _voices.find((v) => v.lang.startsWith('en')) || _voices[0] || null;
    }

    console.log(
      '[VoiceGuidance] Selected voice:',
      _selectedVoice?.name,
      '/',
      _selectedVoice?.lang
    );
  }

  function _ensureInit() {
    if (_initialized || !window.speechSynthesis) return;
    _initialized = true;

    _loadVoices();
    // Chrome loads voices asynchronously
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = _loadVoices;
    }

    // iOS Safari pauses speechSynthesis when the page goes to background;
    // resume it when the user returns.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    });

    // On page unload, cancel any ongoing speech gracefully
    window.addEventListener('beforeunload', () => {
      window.speechSynthesis?.cancel();
    });
  }

  // ── Core speak primitive ─────────────────────────────────────────────────
  /**
   * Immediately speaks a single string, cancelling anything in progress.
   * Does NOT touch the queue.
   */
  function _speakNow(text) {
    if (!window.speechSynthesis || !text?.trim()) return;

    window.speechSynthesis.cancel(); // kill any current utterance
    clearTimeout(_pauseTimer);

    const utterance = new SpeechSynthesisUtterance(text.trim());
    utterance.rate   = cfg.rate;
    utterance.pitch  = cfg.pitch;
    utterance.volume = cfg.volume;
    utterance.lang   = cfg.lang;

    if (_selectedVoice) utterance.voice = _selectedVoice;

    _lastInstruction = text;

    utterance.onend = () => {
      // Small pause, then drain queue
      _pauseTimer = setTimeout(_drainQueue, cfg.pauseBetweenMs);
    };

    utterance.onerror = (e) => {
      // 'interrupted' fires when we cancel mid-speech — not a real error
      if (e.error !== 'interrupted') {
        console.warn('[VoiceGuidance] SpeechSynthesisUtterance error:', e.error);
      }
      _isPlaying = false;
      _pauseTimer = setTimeout(_drainQueue, cfg.pauseBetweenMs);
    };

    _isPlaying = true;

    // iOS 17+ quirk: speechSynthesis.speak() must be called from a user-gesture
    // context OR resumed if the page has been hidden. We optimistically speak
    // and let the visibilitychange handler resume if needed.
    window.speechSynthesis.speak(utterance);
  }

  // ── Queue management ─────────────────────────────────────────────────────
  function _drainQueue() {
    if (_queue.length === 0) {
      _isPlaying = false;
      return;
    }
    const next = _queue.shift();
    _speakNow(next);
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Immediately cancel everything and speak `text`.
   * Use for urgent alerts (fire, reroute).
   */
  function speak(text) {
    _ensureInit();
    _queue = [];           // flush pending queue
    _isPlaying = false;
    _speakNow(text);
  }

  /**
   * Add one or more instructions to the sequential queue.
   * If the queue is idle they begin immediately; otherwise they chain.
   * @param {string | string[]} items
   */
  function enqueue(items) {
    _ensureInit();
    const list = Array.isArray(items) ? items : [items];
    _queue.push(...list.filter(Boolean));

    if (!_isPlaying) {
      _drainQueue();
    }
  }

  /**
   * Speak the most recent instruction again.
   * Great for "Repeat" buttons or missed audio.
   */
  function replay() {
    if (_lastInstruction) {
      speak(_lastInstruction);
    }
  }

  /**
   * Stop all speech and clear the queue.
   */
  function stop() {
    _queue = [];
    _isPlaying = false;
    clearTimeout(_pauseTimer);
    window.speechSynthesis?.cancel();
  }

  /**
   * Dynamically update config (e.g. rate, pauseBetweenMs) at runtime.
   * @param {Partial<typeof DEFAULT_CONFIG>} patch
   */
  function configure(patch) {
    Object.assign(cfg, patch);
  }

  /**
   * Returns true if the browser supports SpeechSynthesis.
   */
  function isSupported() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  return { speak, enqueue, replay, stop, configure, isSupported };
}

// Export singleton
const VoiceGuidanceService = createVoiceGuidanceService();
export default VoiceGuidanceService;
export { createVoiceGuidanceService }; // named export for testing / custom instances