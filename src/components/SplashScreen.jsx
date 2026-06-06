import React, { useState, useEffect } from 'react';

const INITIALIZING_LABELS = [
  'INITIALIZING 3D CORE...',
  'CONNECTING SENSOR GRID...',
  'LINKING SATELLITE TELEMETRY...',
  'CALIBRATING THERMAL ANALYTICS...',
  'OPTIMIZING EVACUATION PATHS...',
  'SYNCHRONIZING SECURE TUNNELS...',
  'FIREGUARD SYSTEM READY.'
];

export default function SplashScreen({ onComplete }) {
  const [progress, setProgress] = useState(0);
  const [labelIndex, setLabelIndex] = useState(0);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(timer);
          setTimeout(() => {
            setIsFading(true);
            setTimeout(onComplete, 600); // Wait for CSS animation
          }, 500);
          return 100;
        }
        return prev + 1;
      });
    }, 20); // ~3 seconds total

    const labelTimer = setInterval(() => {
      setLabelIndex(prev => (prev < INITIALIZING_LABELS.length - 1 ? prev + 1 : prev));
    }, 450);

    return () => {
      clearInterval(timer);
      clearInterval(labelTimer);
    };
  }, [onComplete]);

  return (
    <div className={`splash-screen ${isFading ? 'splash-fade-out' : ''}`} style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: '#0a0a0f',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden'
    }}>
      {/* Background Decorative Elements */}
      <div style={{
        position: 'absolute',
        width: '150%',
        height: '150%',
        background: 'radial-gradient(circle at center, rgba(255, 45, 45, 0.05) 0%, transparent 70%)',
        opacity: 0.5,
        pointerEvents: 'none'
      }} />

      {/* Central Logo Area */}
      <div style={{ position: 'relative', marginBottom: 60, textAlign: 'center' }}>
        <div style={{ 
          fontSize: 64, 
          fontWeight: 900, 
          letterSpacing: 8, 
          color: '#fff',
          textTransform: 'uppercase',
          animation: 'flicker 2s infinite'
        }}>
          FIRE<span style={{ color: '#ff2d2d' }}>GUARD</span>
        </div>
        <div style={{
          position: 'absolute',
          bottom: -20,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '120%',
          height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(255,45,45,0.5), transparent)'
        }} />
      </div>

      {/* Systematic Progress Section */}
      <div style={{ width: 400, maxWidth: '80%' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          marginBottom: 8,
          fontFamily: 'JetBrains Mono, monospace' 
        }}>
          <div className="system-initializing" style={{ fontSize: 9 }}>
            {INITIALIZING_LABELS[labelIndex]}
          </div>
          <div style={{ color: '#ff2d2d', fontSize: 10, fontWeight: 900 }}>
            {Math.floor(progress)}%
          </div>
        </div>

        {/* Progress Bar Container */}
        <div style={{
          height: 4,
          background: 'rgba(255,255,255,0.05)',
          borderRadius: 2,
          overflow: 'hidden',
          position: 'relative',
          border: '1px solid rgba(255,255,255,0.02)'
        }}>
          <div style={{
            height: '100%',
            width: `${progress}%`,
            background: 'linear-gradient(90deg, #ff2d2d, #ff6b1a)',
            boxShadow: '0 0 10px rgba(255, 45, 45, 0.5)',
            transition: 'width 0.1s linear'
          }} />
          
          {/* Shine effect on bar */}
          <div style={{
            position: 'absolute',
            top: 0,
            width: 100,
            height: '100%',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
            animation: 'bar-shine 2s infinite linear'
          }} />
        </div>

        {/* Technical Footer Labels */}
        <div style={{
          marginTop: 20,
          display: 'flex',
          justifyContent: 'center',
          gap: 20,
          opacity: 0.3
        }}>
          {['AUTH: SYSTEM_ADMIN', 'VER: 1.0.4RC', 'SIG: ENCRYPTED'].map(tag => (
            <div key={tag} style={{ fontSize: 8, fontFamily: 'JetBrains Mono, monospace', color: '#fff', letterSpacing: 1 }}>
              {tag}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Corner Decorations */}
      <div style={{
        position: 'absolute',
        bottom: 40,
        left: 40,
        width: 100,
        height: 1,
        background: 'rgba(255,255,255,0.1)'
      }} />
      <div style={{
        position: 'absolute',
        bottom: 40,
        right: 40,
        width: 100,
        height: 1,
        background: 'rgba(255,255,255,0.1)'
      }} />
    </div>
  );
}
