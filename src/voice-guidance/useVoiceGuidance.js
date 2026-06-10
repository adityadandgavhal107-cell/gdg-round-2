/**
 * useVoiceGuidance.js
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook — connects RouteToSpeech + VoiceGuidanceService.
 *
 * Exposes:
 *   speakRoute(path, options)   — convert + enqueue full navigation sequence
 *   speakAlert(text)            — immediate priority alert (interrupts queue)
 *   replay()                   — repeat last spoken instruction
 *   stop()                     — silence everything
 *   isSupported                — boolean: browser supports SpeechSynthesis
 *
 * Designed so GuestApp.jsx only needs to swap out the three old
 * speakInstructions() calls for the new API — zero routing-logic changes.
 */

import { useCallback, useRef } from 'react';
import VoiceGuidanceService from './VoiceGuidanceService';
import { convertRouteToInstructions } from './RouteToSpeech';

/**
 * @param {object} [hookOptions]
 * @param {string} [hookOptions.guestName]     — passed to route converter for personalisation
 * @param {boolean} [hookOptions.isEvacuation] — adds urgency to the opener
 */
export function useVoiceGuidance(hookOptions = {}) {
  // Stable ref so callbacks never need to be re-created when options change
  const optionsRef = useRef(hookOptions);
  optionsRef.current = hookOptions;

  /**
   * Convert the route array → instructions → enqueue for sequential playback.
   * Safe to call multiple times; each call clears the previous queue first.
   *
   * @param {string[]} path
   * @param {object}   [callOptions]  — overrides hookOptions for this call
   */
  const speakRoute = useCallback((path, callOptions = {}) => {
    if (!VoiceGuidanceService.isSupported()) {
      console.warn('[useVoiceGuidance] SpeechSynthesis not supported in this browser.');
      return;
    }
    if (!Array.isArray(path) || path.length === 0) return;

    const mergedOptions = { ...optionsRef.current, ...callOptions };
    const instructions  = convertRouteToInstructions(path, mergedOptions);

    VoiceGuidanceService.stop();                 // clear any previous navigation
    VoiceGuidanceService.enqueue(instructions);  // queue full sequence
  }, []);

  /**
   * Immediately speak a priority alert, interrupting any ongoing speech.
   * Use for fire-detection or hazard-reroute announcements.
   *
   * @param {string} text
   */
  const speakAlert = useCallback((text) => {
    if (!VoiceGuidanceService.isSupported()) return;
    VoiceGuidanceService.speak(text);  // cancels queue, speaks immediately
  }, []);

  /** Repeat the most recently spoken instruction. */
  const replay = useCallback(() => {
    VoiceGuidanceService.replay();
  }, []);

  /** Stop all speech and clear the queue. */
  const stop = useCallback(() => {
    VoiceGuidanceService.stop();
  }, []);

  return {
    speakRoute,
    speakAlert,
    replay,
    stop,
    isSupported: VoiceGuidanceService.isSupported(),
  };
}