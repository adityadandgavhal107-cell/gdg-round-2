/**
 * VoiceGuidanceService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Premium hotel-grade Text-to-Speech engine with Hindi + English support.
 *
 * Responsibilities:
 *   • Owns the SpeechSynthesis lifecycle (cancel, speak, resume on iOS).
 *   • Manages a sequential instruction queue — no overlapping speech.
 *   • Configurable inter-instruction pause (default 700 ms).
 *   • Replay last instruction on demand.
 *   • Gracefully recovers from browser refresh / page-visibility changes.
 *   • Picks the best available English or Hindi voice.
 *   • Exposes a stable singleton so React, vanilla JS, and workers share it.
 *   • setLanguage('en' | 'hi') switches language and voice at runtime.
 *
 * Usage:
 *   import VoiceGuidanceService from './VoiceGuidanceService';
 *   VoiceGuidanceService.speak("Please proceed to the staircase on your left.");
 *   VoiceGuidanceService.setLanguage('hi');
 *   VoiceGuidanceService.speak("कृपया बाईं ओर सीढ़ियों की तरफ जाएं।");
 */

// ─── Configuration ────────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  rate:           0.90,   // Slightly slower; calm, warm pace
  pitch:          1.02,   // Barely above flat; human warmth, not robotic
  volume:         1.0,
  pauseBetweenMs: 650,    // Gap between consecutive queued instructions
  lang:           'en-IN', // India English as default — warm accent

  // Voice preference priority (matched against voice.name, case-insensitive)
  voicePreferenceEN: [
    'raveena',            // India English — warm female
    'veena',              // macOS India
    'heera',              // Microsoft India English
    'priya',              // various India TTS
    'samantha',           // macOS / iOS — the "Siri" voice
    'karen',              // Australian English — warm
    'google uk english female',
    'microsoft zira',     // Windows — clean female
    'microsoft aria',
    'google us english',
    'daniel',             // British English — professional
    'en-in',              // fallback: any en-IN voice
    'en-us',
  ],
  voicePreferenceHI: [
    'lekha',              // Google Hindi — clear female
    'google hindi',
    'hemant',             // Microsoft Hindi male
    'kalpana',            // Microsoft Hindi female
    'hindi',
    'hi-in',
  ],
};

// ─── Singleton factory ────────────────────────────────────────────────────────
function createVoiceGuidanceService(userConfig = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...userConfig };

  /** @type {SpeechSynthesisVoice | null} */
  let _voiceEN        = null;
  let _voiceHI        = null;
  let _voices         = [];
  let _queue          = [];          // string[]
  let _isPlaying      = false;
  let _lastInstruction = '';
  let _pauseTimer     = null;
  let _initialized    = false;
  let _language       = 'en';        // 'en' | 'hi'

  // ── Voice selection ──────────────────────────────────────────────────────
  function _loadVoices() {
    if (!window.speechSynthesis) return;
    _voices = window.speechSynthesis.getVoices();
    if (_voices.length === 0) return; // will be called again via onvoiceschanged

    const lower = (s) => s.toLowerCase();

    // Select best English voice
    _voiceEN = null;
    for (const pref of cfg.voicePreferenceEN) {
      const match = _voices.find(
        (v) =>
          lower(v.name).includes(pref) ||
          lower(v.lang).includes(pref)
      );
      if (match) { _voiceEN = match; break; }
    }
    if (!_voiceEN) {
      _voiceEN =
        _voices.find((v) => v.lang.startsWith('en-IN')) ||
        _voices.find((v) => v.lang.startsWith('en')) ||
        _voices[0] || null;
    }

    // Select best Hindi voice
    _voiceHI = null;
    for (const pref of cfg.voicePreferenceHI) {
      const match = _voices.find(
        (v) =>
          lower(v.name).includes(pref) ||
          lower(v.lang).includes(pref)
      );
      if (match) { _voiceHI = match; break; }
    }
    if (!_voiceHI) {
      // Fallback: use India English if no Hindi voice found
      _voiceHI = _voiceEN;
    }

    console.log(
      '[VoiceGuidance] EN voice:', _voiceEN?.name, '/', _voiceEN?.lang,
      '| HI voice:', _voiceHI?.name, '/', _voiceHI?.lang
    );
  }

  function _ensureInit() {
    if (_initialized || !window.speechSynthesis) return;
    _initialized = true;

    _loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = _loadVoices;
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    });

    window.addEventListener('beforeunload', () => {
      window.speechSynthesis?.cancel();
    });
  }

  // ── Core speak primitive ─────────────────────────────────────────────────
  function _speakNow(text) {
    if (!window.speechSynthesis || !text?.trim()) return;

    window.speechSynthesis.cancel();
    clearTimeout(_pauseTimer);

    const utterance      = new SpeechSynthesisUtterance(text.trim());
    const isHindi        = _language === 'hi';
    const selectedVoice  = isHindi ? _voiceHI : _voiceEN;
    const langCode       = isHindi ? 'hi-IN' : 'en-IN';

    utterance.rate   = isHindi ? 0.88 : cfg.rate;   // slightly slower for Hindi clarity
    utterance.pitch  = isHindi ? 1.0  : cfg.pitch;
    utterance.volume = cfg.volume;
    utterance.lang   = langCode;

    if (selectedVoice) utterance.voice = selectedVoice;

    _lastInstruction = text;

    utterance.onend = () => {
      _pauseTimer = setTimeout(_drainQueue, cfg.pauseBetweenMs);
    };

    utterance.onerror = (e) => {
      if (e.error !== 'interrupted') {
        console.warn('[VoiceGuidance] SpeechSynthesisUtterance error:', e.error);
      }
      _isPlaying = false;
      _pauseTimer = setTimeout(_drainQueue, cfg.pauseBetweenMs);
    };

    _isPlaying = true;
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
   * Switch language: 'en' or 'hi'.
   * Stops current speech, clears queue, and updates voice selection.
   */
  function setLanguage(lang) {
    _language = lang === 'hi' ? 'hi' : 'en';
    stop();
    console.log('[VoiceGuidance] Language set to:', _language);
  }

  /** Get current language. */
  function getLanguage() {
    return _language;
  }

  /**
   * Immediately cancel everything and speak `text`.
   * Use for urgent alerts (fire, reroute).
   */
  function speak(text) {
    _ensureInit();
    _queue     = [];
    _isPlaying = false;
    _speakNow(text);
  }

  /**
   * Add one or more instructions to the sequential queue.
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

  /** Repeat the most recently spoken instruction. */
  function replay() {
    if (_lastInstruction) {
      speak(_lastInstruction);
    }
  }

  /** Stop all speech and clear the queue. */
  function stop() {
    _queue     = [];
    _isPlaying = false;
    clearTimeout(_pauseTimer);
    window.speechSynthesis?.cancel();
  }

  /**
   * Dynamically update config at runtime.
   * @param {Partial<typeof DEFAULT_CONFIG>} patch
   */
  function configure(patch) {
    Object.assign(cfg, patch);
  }

  /** Returns true if the browser supports SpeechSynthesis. */
  function isSupported() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  return { speak, enqueue, replay, stop, configure, isSupported, setLanguage, getLanguage };
}

// Export singleton
const VoiceGuidanceService = createVoiceGuidanceService();
export default VoiceGuidanceService;
export { createVoiceGuidanceService }; // named export for testing / custom instances