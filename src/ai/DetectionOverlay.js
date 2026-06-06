import bus from '../core/EventBus.js';

// Renders AI detection bounding boxes onto a canvas overlaid on a <video> element
export class DetectionOverlay {
  constructor(canvas, videoEl) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.videoEl = videoEl;
    this.detections = [];
    this.animFrame = null;
    this.unsubscribe = null;
  }

  start(roomId) {
    this.unsubscribe = bus.on('detection:overlay', (det) => {
      if (det.roomId === roomId) {
        this.detections.push({ ...det, expiry: Date.now() + 2500 });
      }
    });
    this.#renderLoop();
  }

  stop() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    if (this.unsubscribe) this.unsubscribe();
    this.detections = [];
  }

  #renderLoop() {
    this.animFrame = requestAnimationFrame(() => this.#renderLoop());
    const now = Date.now();
    this.detections = this.detections.filter(d => d.expiry > now);

    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);

    this.detections.forEach(det => {
      const color = det.type === 'fire' ? '#ff2d2d' : det.type === 'smoke' ? '#ff6b1a' : '#ffd700';
      const label = `${det.modelSource || det.type.toUpperCase()} ${Math.round(det.confidence * 100)}%`;
      const { x, y, w, h } = det.bbox || { x: 0.2, y: 0.2, w: 0.3, h: 0.3 };

      const px = x * width;
      const py = y * height;
      const pw = w * width;
      const ph = h * height;

      // Glow effect
      this.ctx.shadowColor = color;
      this.ctx.shadowBlur = 12;

      // Bounding box
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(px, py, pw, ph);

      // Corner accents
      const cs = 10;
      this.ctx.lineWidth = 3;
      [[px, py], [px + pw, py], [px, py + ph], [px + pw, py + ph]].forEach(([cx, cy], i) => {
        this.ctx.beginPath();
        this.ctx.moveTo(cx + (i % 2 === 0 ? cs : -cs), cy);
        this.ctx.lineTo(cx, cy);
        this.ctx.lineTo(cx, cy + (i < 2 ? cs : -cs));
        this.ctx.stroke();
      });

      // Label background
      this.ctx.shadowBlur = 0;
      this.ctx.fillStyle = color + 'cc';
      const textW = this.ctx.measureText(label).width + 12;
      this.ctx.fillRect(px, py - 22, textW, 20);

      // Label text
      this.ctx.fillStyle = '#fff';
      this.ctx.font = 'bold 11px JetBrains Mono, monospace';
      this.ctx.fillText(label, px + 6, py - 7);
    });
  }

  resize() {
    if (!this.videoEl) return;
    this.canvas.width = this.videoEl.videoWidth || this.videoEl.clientWidth;
    this.canvas.height = this.videoEl.videoHeight || this.videoEl.clientHeight;
  }
}
