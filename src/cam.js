import { io } from 'socket.io-client';
import config from './core/config.js';

const STUN_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// Parse room ID from URL
const params = new URLSearchParams(window.location.search);
const roomId = params.get('room') || 'unknown';

// DOM refs
const video   = document.getElementById('cam-video');
const roomBadge  = document.getElementById('room-badge');
const statusPill = document.getElementById('status-pill');
const statusText = document.getElementById('status-text');
const waitingState = document.getElementById('waiting-state');
const btnStart = document.getElementById('btn-start');
const btnStop  = document.getElementById('btn-stop');
const btnSwitch = document.getElementById('btn-switch');
const btnTorch  = document.getElementById('btn-torch');
const scanLine  = document.getElementById('scan-line');
const camFrame  = document.getElementById('cam-frame');

roomBadge.textContent = `📹 Room ${roomId}`;
document.title = `FireGuard Cam — Room ${roomId}`;

let localStream = null;
let socket = null;
let pc = null;
let facingMode = 'environment';
let torchOn = false;

// DETECTION SETTINGS
const AUDIO_THRESHOLD = 0.15; // Normalized energy  (audio alarm detection)
// Fire/smoke video thresholds are now internal to the FireDetector (FIRE_THRESHOLD = 0.45)

function setStatus(state, msg) {
  statusPill.className = `status-pill ${state}`;
  statusText.textContent = msg;
}

// Keep screen awake
let wakeLock = null;
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch (_) {}
}

async function startCamera() {
  try {
    setStatus('connecting', 'Requesting camera...');
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
      audio: true,
    });
    video.srcObject = localStream;
    video.play();

    waitingState.style.display = 'none';
    scanLine.style.display = 'block';
    camFrame.style.display = 'block';
    btnStop.style.display = 'block';
    btnSwitch.style.display = 'block';
    btnTorch.style.display = 'block';

    await requestWakeLock();
    connectToSignaling();
    
    // Start advanced analysis
    startAudioAnalysis();
    startVideoAnalysis();
  } catch (err) {
    setStatus('error', `Camera error: ${err.message}`);
    console.error(err);
  }
}

function connectToSignaling() {
  setStatus('connecting', 'Connecting to admin...');
  socket = io(config.socketUrl, { path: config.socketPath });

  socket.on('connect', () => {
    setStatus('streaming', `Live — Room ${roomId}`);
    socket.emit('camera:register', { roomId });
  });

  socket.on('disconnect', () => {
    setStatus('error', 'Disconnected');
  });

  // Admin sent us an offer
  socket.on('webrtc:offer', async ({ from, offer }) => {
    console.log(`[WEBRTC] Offer received from ${from}`);
    if (pc) pc.close();
    pc = new RTCPeerConnection(STUN_CONFIG);

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        console.log(`[WEBRTC] Sending ICE candidate to ${from}`);
        socket.emit('webrtc:ice', { targetId: from, candidate });
      }
    };

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log(`[WEBRTC] Sending answer to ${from}`);
      socket.emit('webrtc:answer', { targetId: from, answer });
    } catch (e) { console.error('Answer error', e); }
  });

  socket.on('webrtc:ice', async ({ candidate }) => {
    try { if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
    catch (e) { console.warn('ICE error', e); }
  });
}

// ── Audio Analysis (FFT for Alarm Detection) ────────────────────────
let audioCtx = null;
let analyser = null;
let audioInterval = null;

function startAudioAnalysis() {
  if (audioCtx) return;
  
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioCtx.createMediaStreamSource(localStream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);

  const freqData = new Uint8Array(analyser.frequencyBinCount);
  const sampleRate = audioCtx.sampleRate;

  audioInterval = setInterval(() => {
    analyser.getByteFrequencyData(freqData);

    // Fire alarm frequency range from Python script: 2000Hz - 4000Hz
    let totalEnergy = 0;
    let count = 0;

    for (let i = 0; i < freqData.length; i++) {
        const freq = i * (sampleRate / analyser.fftSize);
        if (freq >= 2000 && freq <= 4000) {
            totalEnergy += freqData[i];
            count++;
        }
    }

    const avgEnergy = count > 0 ? totalEnergy / (count * 255) : 0;

    if (avgEnergy > AUDIO_THRESHOLD) {
        triggerLocalAlert('audio', avgEnergy);
    }
  }, 1000);
}

// ── FireDetector — Production multi-cue engine (ported from Python) ──────────
//   Stage 1 : HSV dual-range color mask  (fire hues: red / orange / yellow)
//   Stage 2 : YCrCb chroma analysis      (Cr > Cb dominance = flame glow)
//   Stage 3 : Contour geometry scoring   (area, convexity, circularity)
//   Stage 4 : Temporal flicker analysis  (frame-over-frame mask delta)
//   Stage 5 : Weighted confidence fusion → verdict  (threshold 0.45)
// ─────────────────────────────────────────────────────────────────────────────

const W  = 160, H = 120;           // analysis resolution
const TOTAL_PX = W * H;

let analysisCanvas = document.createElement('canvas');
let analysisCtx    = analysisCanvas.getContext('2d', { willReadFrequently: true });
let analysisInterval = null;

// Mask history for flicker (keep last 5 frames)
const MASK_HISTORY_MAX = 5;
const maskHistory = [];

// ── helpers ──────────────────────────────────────────────────────────────────

/** RGB → [H°, S 0-255, V 0-255] */
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 255, v * 255];
}

/** RGB → [Y, Cr, Cb] */
function rgbToYCrCb(r, g, b) {
  const Y  =  0.299 * r + 0.587 * g + 0.114 * b;
  const Cr = (r - Y) * 0.713 + 128;
  const Cb = (b - Y) * 0.564 + 128;
  return [Y, Cr, Cb];
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

// ── Stage 1 : Color score + fire mask ────────────────────────────────────────

/**
 * Returns { colorScore, fireMask, firePixels }
 * fireMask : Uint8Array length TOTAL_PX  (255 = fire-hue pixel, 0 = not)
 *
 * Fire HSV ranges (mirrored from Python):
 *   range1 : H[ 0°,18°]  S[120,255]  V[ 70,255]   ← red wrap-around
 *   range2 : H[18°,35°]  S[120,255]  V[ 70,255]   ← orange → yellow
 */
function computeColorMask(pixelData) {
  const fireMask  = new Uint8Array(TOTAL_PX);
  let   firePixels = 0;

  for (let i = 0, p = 0; i < pixelData.length; i += 4, p++) {
    const [h, s, v] = rgbToHsv(pixelData[i], pixelData[i+1], pixelData[i+2]);
    const inRange1  = (h >=  0 && h <= 18 && s >= 120 && v >= 70);
    const inRange2  = (h > 18 && h <= 35 && s >= 120 && v >= 70);
    if (inRange1 || inRange2) { fireMask[p] = 255; firePixels++; }
  }

  // Sigmoid-like score: 4% coverage → ~0.6, 15% → ~0.95
  const ratio      = firePixels / TOTAL_PX;
  const colorScore = clamp01(1 - 1 / (1 + Math.pow(ratio / 0.04, 1.5)));
  return { colorScore, fireMask, firePixels };
}

// ── Stage 2 : YCrCb chroma score ─────────────────────────────────────────────

/**
 * Among fire-masked pixels, what fraction satisfies Cr > 135 AND Cb < 120 AND Cr > Cb?
 * (mirrors Python _CR_MIN=135, _CB_MAX=120)
 */
function computeYCrCbScore(pixelData, fireMask) {
  let total = 0, passing = 0;
  for (let i = 0, p = 0; i < pixelData.length; i += 4, p++) {
    if (!fireMask[p]) continue;
    const [, Cr, Cb] = rgbToYCrCb(pixelData[i], pixelData[i+1], pixelData[i+2]);
    total++;
    if (Cr > 135 && Cb < 120 && Cr > Cb) passing++;
  }
  if (!total) return 0;
  return clamp01((passing / total) * 1.4);   // ×1.4 booster, capped at 1
}

// ── Stage 3 : Contour geometry score ─────────────────────────────────────────

/**
 * Lightweight connected-component analysis on the fire mask.
 * Scores each blob by area, pseudo-convexity, circularity, and aspect ratio.
 *
 * Returns aggregate score (0-1).
 */
function computeContourScore(fireMask) {
  // Fast row-scan blob finder (union-find is overkill for 160×120)
  // We use a minimal flood-fill via a queue.
  const visited = new Uint8Array(TOTAL_PX);
  const blobs   = [];
  const MIN_AREA = 60; // Increased sensitivity for screen detection

  for (let startP = 0; startP < TOTAL_PX; startP++) {
    if (!fireMask[startP] || visited[startP]) continue;

    // BFS flood-fill
    const queue = [startP];
    visited[startP] = 1;
    const pixels = [];

    while (queue.length) {
      const p    = queue.shift();
      const px   = p % W, py = (p / W) | 0;
      pixels.push([px, py]);

      // Guard edges to prevent row-wrap false connections
      const left  = px > 0     ? p - 1 : -1;
      const right = px < W - 1 ? p + 1 : -1;
      const up    = p - W;
      const down  = p + W;

      for (const n of [left, right, up, down]) {
        if (n >= 0 && n < TOTAL_PX && fireMask[n] && !visited[n]) {
          visited[n] = 1;
          queue.push(n);
        }
      }
    }

    if (pixels.length < MIN_AREA) continue;

    // Bounding box
    let minX = W, maxX = 0, minY = H, maxY = 0;
    for (const [px, py] of pixels) {
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    const bboxArea  = bw * bh;
    const blobArea  = pixels.length;

    // Pseudo-convexity = blob area / bounding-box area  (mirrors Python convexity concept)
    const convexity    = blobArea / Math.max(bboxArea, 1);

    // Circularity: 4π·A / P²  (estimate perimeter from bounding box)
    const perimeter    = 2 * (bw + bh);
    const circularity  = (4 * Math.PI * blobArea) / Math.max(perimeter * perimeter, 1);

    // Aspect ratio (width / height)
    const aspect       = bw / Math.max(bh, 1);

    // Score sub-cues — widened upper bounds for large fire blobs
    // that fill more of the bounding box (higher convexity) or frame (higher circularity)
    const sConvex  = (convexity > 0.20 && convexity < 0.99) ? 1.0 : 0.0;
    const sCirc    = (circularity > 0.05 && circularity < 0.90) ? 1.0 : 0.3;
    const sAspect  = clamp01(1 - Math.abs(aspect - 0.8) / 2.0);  // fire can be wide
    const sArea    = clamp01(Math.log1p(blobArea) / Math.log1p(5000));

    const blobScore = sConvex * 0.35 + sCirc * 0.30 + sAspect * 0.15 + sArea * 0.20;
    blobs.push(blobScore);
  }

  if (!blobs.length) return 0;
  const maxScore  = Math.max(...blobs);
  const meanScore = blobs.reduce((a, b) => a + b, 0) / blobs.length;
  return clamp01(maxScore * 0.6 + meanScore * 0.4);
}

// ── Stage 4 : Temporal flicker score ─────────────────────────────────────────

/**
 * Compares current fire mask against the most recent stored mask.
 * Fire flickers (high diff); static objects stay constant (low diff).
 */
function computeFlickerScore(currentMask) {
  if (maskHistory.length < 2) return 0;
  const prev      = maskHistory[maskHistory.length - 1];
  let   changed   = 0;
  let   union     = 0;
  for (let i = 0; i < TOTAL_PX; i++) {
    if (currentMask[i] !== prev[i]) changed++;
    if (currentMask[i] || prev[i])  union++;
  }
  const ratio = changed / Math.max(union, 1);
  // Very static (ratio < 0.05) → 0; high flicker (ratio 0.05-0.55) → up to 1
  if (ratio < 0.05) return 0;
  return clamp01((ratio - 0.05) / 0.50);
}

// ── Stage 5 : Fused confidence ────────────────────────────────────────────────

const FIRE_WEIGHTS    = { color: 0.45, ycrcb: 0.10, contour: 0.30, flicker: 0.15 };
const FIRE_THRESHOLD  = 0.38;

// Separate smoke detection (unchanged from original logic)
function computeSmokePixels(pixelData) {
  let smokePixels = 0;
  for (let i = 0; i < pixelData.length; i += 4) {
    const [, s, v] = rgbToHsv(pixelData[i], pixelData[i+1], pixelData[i+2]);
    if (s < 50 && v > 100 && v < 220) smokePixels++;
  }
  return smokePixels;
}

// ── Main analysis loop ────────────────────────────────────────────────────────

function startVideoAnalysis() {
  analysisCanvas.width  = W;
  analysisCanvas.height = H;

  analysisInterval = setInterval(() => {
    if (!video.videoWidth) return; // Run locally even if socket is disconnected

    analysisCtx.drawImage(video, 0, 0, W, H);
    const frame = analysisCtx.getImageData(0, 0, W, H);
    const data  = frame.data;

    // ── Stage 1 : Color mask ─────────────────────────────────────────
    const { colorScore, fireMask, firePixels } = computeColorMask(data);

    // ── Stage 2 : YCrCb chroma ───────────────────────────────────────
    const ycrcbScore = computeYCrCbScore(data, fireMask);

    // ── Stage 3 : Contour geometry ───────────────────────────────────
    const contourScore = computeContourScore(fireMask);

    // ── Stage 4 : Temporal flicker ───────────────────────────────────
    const flickerScore = computeFlickerScore(fireMask);

    // Update mask history (ring buffer)
    maskHistory.push(fireMask.slice());
    if (maskHistory.length > MASK_HISTORY_MAX) maskHistory.shift();

    // ── Stage 5 : Fuse ───────────────────────────────────────────────
    const confidence =
      FIRE_WEIGHTS.color   * colorScore   +
      FIRE_WEIGHTS.ycrcb   * ycrcbScore   +
      FIRE_WEIGHTS.contour * contourScore  +
      FIRE_WEIGHTS.flicker * flickerScore;

    if (confidence >= FIRE_THRESHOLD) {
      console.log(
        `[FireDetector] 🔥 FIRE  conf=${(confidence*100).toFixed(1)}%` +
        ` | color=${(colorScore*100).toFixed(0)}%` +
        ` ycrcb=${(ycrcbScore*100).toFixed(0)}%` +
        ` contour=${(contourScore*100).toFixed(0)}%` +
        ` flicker=${(flickerScore*100).toFixed(0)}%` +
        ` | pixels=${firePixels}/${TOTAL_PX}`
      );
      
      // Update local UI immediately for user feedback
      document.body.style.background = '#2a0a0a';
      roomBadge.style.background = '#ff2d2d';
      roomBadge.style.color = '#fff';
      roomBadge.textContent = `🔥 FIRE DETECTED`;

      if (socket && socket.connected) {
        triggerLocalAlert('fire', confidence);
      }
    } else {
      // Reset local UI
      document.body.style.background = '#0a0a0f';
      roomBadge.style.background = 'rgba(78,158,255,0.1)';
      roomBadge.style.color = '#4e9eff';
      roomBadge.textContent = `📹 Room ${roomId}`;
      // Fall-through: check smoke with original heuristic
      const smokePixels  = computeSmokePixels(data);
      const smokeProb    = (smokePixels / TOTAL_PX) * 100;
      if (smokeProb > 15.0) {
        console.log(`[FireDetector] 💨 SMOKE  prob=${smokeProb.toFixed(1)}%`);
        triggerLocalAlert('smoke', smokeProb / 100);
      }
    }
  }, 400);
}

let lastAlertTime = { fire: 0, audio: 0, smoke: 0 };

function triggerLocalAlert(type, value) {
  const now = Date.now();
  if (now - lastAlertTime[type] < 8000) return; // 8s cooldown
  lastAlertTime[type] = now;

  console.log(`🚨 ${type.toUpperCase()} DETECTED:`, value);

  // Visual feedback locally
  const color = type === 'fire' ? '#ff2d2d' : type === 'smoke' ? '#ff8800' : '#ffd700';
  camFrame.style.borderColor = color;
  scanLine.style.background = `linear-gradient(90deg, transparent, ${color}cc, transparent)`;

  setTimeout(() => {
    camFrame.style.borderColor = 'rgba(78,158,255,0.6)';
    scanLine.style.background = 'linear-gradient(90deg, transparent, rgba(78,158,255,0.6), transparent)';
  }, 3000);

  // Send to server only if socket is active
  // NOTE: value is already a 0-1 confidence score from the new FireDetector engine
  if (socket && socket.connected) {
    socket.emit('detection:manual', {
      roomId,
      type,
      confidence: Math.min(0.99, value),   // already 0-1 — no division needed
      floor: parseInt(roomId.charAt(0)) || 1
    });
  }
}

function stopStream() {
  if (audioInterval) clearInterval(audioInterval);
  if (analysisInterval) clearInterval(analysisInterval);
  if (audioCtx) audioCtx.close();
  
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  if (socket) socket.disconnect();
  if (pc) pc.close();
  
  video.srcObject = null;
  waitingState.style.display = 'flex';
  scanLine.style.display = 'none';
  camFrame.style.display = 'none';
  btnStop.style.display = 'none';
  btnSwitch.style.display = 'none';
  btnTorch.style.display = 'none';
  setStatus('waiting', 'Stream stopped');
  if (wakeLock) { wakeLock.release(); wakeLock = null; }
}

async function switchCamera() {
  facingMode = facingMode === 'environment' ? 'user' : 'environment';
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  localStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
    audio: true,
  });
  video.srcObject = localStream;
  if (pc) {
    const senders = pc.getSenders();
    localStream.getTracks().forEach(track => {
      const sender = senders.find(s => s.track?.kind === track.kind);
      if (sender) sender.replaceTrack(track);
    });
  }
}

async function toggleTorch() {
  const track = localStream?.getVideoTracks()[0];
  if (!track) return;
  try {
    torchOn = !torchOn;
    await track.applyConstraints({ advanced: [{ torch: torchOn }] });
    btnTorch.textContent = torchOn ? '🔦 On' : '🔦';
  } catch (_) {}
}

btnStart.addEventListener('click', startCamera);
btnStop.addEventListener('click', stopStream);
btnSwitch.addEventListener('click', switchCamera);
btnTorch.addEventListener('click', toggleTorch);

if (roomId !== 'unknown') {
  setStatus('waiting', `Ready for Room ${roomId}`);
}

