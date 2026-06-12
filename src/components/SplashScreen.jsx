import React, { useState, useEffect, useRef } from 'react';

/* ─────────────────────────────────────────────────────────────────────────
   SplashScreen.jsx  — redesigned to match LandingPage cyan/glass theme.
   Props:
     onComplete  () => void   — called when animation finishes
───────────────────────────────────────────────────────────────────────── */

const INITIALIZING_LABELS = [
  'INITIALIZING 3D CORE...',
  'CONNECTING SENSOR GRID...',
  'LINKING SATELLITE TELEMETRY...',
  'CALIBRATING THERMAL ANALYTICS...',
  'OPTIMIZING EVACUATION PATHS...',
  'SYNCHRONIZING SECURE TUNNELS...',
  'FIREGUARD SYSTEM READY.',
];

/* ── Particle canvas (same palette as LandingPage) ─────────────────── */
function SplashParticles() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;

    function resize() {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const particles = Array.from({ length: 55 }, () => ({
      x:     Math.random() * window.innerWidth,
      y:     Math.random() * window.innerHeight,
      r:     0.8 + Math.random() * 1.8,
      dx:    -0.2 + Math.random() * 0.4,
      dy:    -0.5 + Math.random() * 0.35,
      alpha: 0.15 + Math.random() * 0.5,
      color: Math.random() > 0.45 ? '#00d2ff' : '#004a77',
    }));

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
        p.x += p.dx;
        p.y += p.dy;
        if (p.y < -10) { p.y = canvas.height + 10; p.x = Math.random() * canvas.width; }
        if (p.x < -10 || p.x > canvas.width + 10) p.x = Math.random() * canvas.width;
      });
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    }
    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', top: 0, left: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none', opacity: 0.4,
      }}
    />
  );
}

export default function SplashScreen({ onComplete }) {
  const [progress,   setProgress]   = useState(0);
  const [labelIndex, setLabelIndex] = useState(0);
  const [isFading,   setIsFading]   = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(timer);
          setTimeout(() => {
            setIsFading(true);
            setTimeout(onComplete, 600);
          }, 500);
          return 100;
        }
        return prev + 1;
      });
    }, 20); // ~2 s total

    const labelTimer = setInterval(() => {
      setLabelIndex(prev => Math.min(prev + 1, INITIALIZING_LABELS.length - 1));
    }, 280);

    return () => {
      clearInterval(timer);
      clearInterval(labelTimer);
    };
  }, [onComplete]);

  /* ── Keyframe styles injected once ── */
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@700;900&family=JetBrains+Mono:wght@400;700&display=swap');

    @keyframes fg-splash-scan {
      0%   { left: -120px; }
      100% { left: 110%; }
    }
    @keyframes fg-splash-fade-out {
      from { opacity: 1; }
      to   { opacity: 0; }
    }
    @keyframes fg-splash-glow-pulse {
      0%,100% { opacity: 0.06; }
      50%      { opacity: 0.13; }
    }
    @keyframes fg-splash-grid {
      from { background-position: 0 0; }
      to   { background-position: 40px 40px; }
    }
  `;

  return (
    <div
      style={{
        position:        'fixed',
        inset:           0,
        zIndex:          9999,
        background:      'linear-gradient(160deg, #060810 0%, #0a0d1a 50%, #050812 100%)',
        display:         'flex',
        flexDirection:   'column',
        alignItems:      'center',
        justifyContent:  'center',
        overflow:        'hidden',
        animation:       isFading ? 'fg-splash-fade-out 0.6s ease forwards' : 'none',
      }}
    >
      <style>{css}</style>

      {/* Particles */}
      <SplashParticles />

      {/* Radial cyan glow */}
      <div style={{
        position:   'absolute',
        width:      '140%',
        height:     '140%',
        background: 'radial-gradient(circle at 50% 48%, rgba(0,210,255,0.09) 0%, transparent 65%)',
        animation:  'fg-splash-glow-pulse 3s ease-in-out infinite',
        pointerEvents: 'none',
      }} />

      {/* Soft grid overlay */}
      <div style={{
        position:        'absolute',
        inset:           0,
        backgroundImage: 'linear-gradient(rgba(0,210,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0,210,255,0.025) 1px, transparent 1px)',
        backgroundSize:  '40px 40px',
        animation:       'fg-splash-grid 8s linear infinite',
        pointerEvents:   'none',
        opacity:         0.6,
      }} />

      {/* ── Logo ── */}
      <div style={{ position: 'relative', marginBottom: 72, textAlign: 'center', zIndex: 2 }}>
        {/* Top accent line */}
        <div style={{
          position:   'absolute',
          top:        -20,
          left:       '50%',
          transform:  'translateX(-50%)',
          width:      '60%',
          height:     1,
          background: 'linear-gradient(90deg, transparent, rgba(0,210,255,0.4), transparent)',
        }} />

        {/* Wordmark */}
        <div style={{
          fontFamily:   "'Inter', sans-serif",
          fontSize:     clampFont(),
          fontWeight:   900,
          letterSpacing: 10,
          color:        '#e3e3e3',
          textTransform: 'uppercase',
          lineHeight:   1,
        }}>
          FIRE<span style={{
            color:      '#00d2ff',
            textShadow: '0 0 30px rgba(0,210,255,0.6), 0 0 60px rgba(0,210,255,0.3)',
          }}>GUARD</span>
        </div>

        {/* Sub-label */}
        <div style={{
          marginTop:    12,
          fontFamily:   "'JetBrains Mono', monospace",
          fontSize:     11,
          fontWeight:   700,
          letterSpacing: 8,
          color:        'rgba(0,210,255,0.55)',
          textTransform: 'uppercase',
        }}>
          HOTEL MANAGEMENT SYSTEM
        </div>

        {/* Bottom accent line */}
        <div style={{
          position:   'absolute',
          bottom:     -20,
          left:       '50%',
          transform:  'translateX(-50%)',
          width:      '120%',
          height:     1,
          background: 'linear-gradient(90deg, transparent, rgba(0,210,255,0.35), transparent)',
        }} />
      </div>

      {/* ── Progress section ── */}
      <div style={{ width: 420, maxWidth: '82%', zIndex: 2 }}>

        {/* Label row */}
        <div style={{
          display:        'flex',
          justifyContent: 'space-between',
          alignItems:     'center',
          marginBottom:   10,
          fontFamily:     "'JetBrains Mono', monospace",
        }}>
          <span style={{
            fontSize:      10,
            letterSpacing: 2,
            color:         'rgba(0,210,255,0.65)',
            fontWeight:    500,
          }}>
            {INITIALIZING_LABELS[labelIndex]}
          </span>
          <span style={{
            fontSize:      11,
            fontWeight:    700,
            color:         '#00d2ff',
            letterSpacing: 1,
            textShadow:    '0 0 8px rgba(0,210,255,0.5)',
          }}>
            {Math.floor(progress)}%
          </span>
        </div>

        {/* Glass progress bar container */}
        <div style={{
          height:       6,
          background:   'rgba(0,210,255,0.07)',
          backdropFilter: 'blur(8px)',
          borderRadius: 4,
          overflow:     'hidden',
          position:     'relative',
          border:       '1px solid rgba(0,210,255,0.12)',
          boxShadow:    'inset 0 1px 4px rgba(0,0,0,0.4)',
        }}>
          {/* Fill */}
          <div style={{
            height:     '100%',
            width:      `${progress}%`,
            background: 'linear-gradient(90deg, #004a77, #00d2ff)',
            boxShadow:  '0 0 12px rgba(0,210,255,0.6), 0 0 4px rgba(0,210,255,0.9)',
            borderRadius: 4,
            transition: 'width 0.08s linear',
            position:   'relative',
          }}>
            {/* Bright leading edge */}
            <div style={{
              position:   'absolute',
              right:      0,
              top:        0,
              width:      12,
              height:     '100%',
              background: 'rgba(255,255,255,0.55)',
              borderRadius: 4,
              filter:     'blur(2px)',
            }} />
          </div>

          {/* Moving scan shimmer */}
          <div style={{
            position:   'absolute',
            top:        0,
            left:       '-120px',
            width:      120,
            height:     '100%',
            background: 'linear-gradient(90deg, transparent, rgba(0,210,255,0.35), transparent)',
            animation:  'fg-splash-scan 2.2s ease-in-out infinite',
          }} />
        </div>

        {/* Technical footer tags */}
        <div style={{
          marginTop:  22,
          display:    'flex',
          justifyContent: 'center',
          gap:        28,
          opacity:    0.28,
        }}>
          {['AUTH: SYSTEM_ADMIN', 'VER: 4.2.0', 'SIG: ENCRYPTED'].map(tag => (
            <span key={tag} style={{
              fontSize:      8,
              fontFamily:    "'JetBrains Mono', monospace",
              color:         '#00d2ff',
              letterSpacing: 1.5,
              textTransform: 'uppercase',
            }}>
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Corner decorations */}
      <CornerDec pos="bottom-left" />
      <CornerDec pos="bottom-right" />
    </div>
  );
}

function clampFont() {
  // SSR-safe: use 64px as the base; CSS clamp would need a stylesheet
  return 'clamp(40px, 7vw, 72px)';
}

function CornerDec({ pos }) {
  const isLeft = pos === 'bottom-left';
  return (
    <div style={{
      position:   'absolute',
      bottom:     36,
      [isLeft ? 'left' : 'right']: 36,
      display:    'flex',
      flexDirection: 'column',
      alignItems: isLeft ? 'flex-start' : 'flex-end',
      gap:        4,
      opacity:    0.18,
    }}>
      <div style={{ width: 90, height: 1, background: 'rgba(0,210,255,0.7)' }} />
      <div style={{ width: 40, height: 1, background: 'rgba(0,210,255,0.5)' }} />
    </div>
  );
}