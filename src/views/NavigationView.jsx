import React, { useEffect, useRef, useState } from 'react';

/**
 * NavigationView — Guest-facing 1st-person corridor evacuation POV.
 *
 * Props:
 *  currentStep      {object}  { label, instruction, floor, side }
 *  totalSteps       {number}
 *  stepIndex        {number}
 *  onNext           {func}    called when guest presses "Next"
 *  onSpeakPressed   {func}
 *  voiceActive      {bool}
 *  dangerRooms      {string[]}
 *  evacuationDone   {bool}
 *  language         {string}  'en' | 'hi'
 *  onLanguageToggle {func}
 */
export default function NavigationView({
  currentStep = null,
  totalSteps = 1,
  stepIndex = 0,
  onNext,
  onSpeakPressed,
  voiceActive = false,
  dangerRooms = [],
  evacuationDone = false,
  language = 'en',
  onLanguageToggle,
}) {
  const canvasRef = useRef(null);
  const animRef   = useRef(null);
  const tick      = useRef(0);
  const walkRef   = useRef(0);   // walk cycle 0–1
  const stepChangeRef = useRef(stepIndex);
  const [agentPulsing, setAgentPulsing] = useState(false);

  // ── Derive corridor context from step ─────────────────────────────────
  const floor    = currentStep?.floor ?? 4;
  const floorStr = String(floor);

  const leftRooms  = [`${floorStr}02`, `${floorStr}03`, `${floorStr}04`];
  const rightRooms = [`${floorStr}08`, `${floorStr}09`, `${floorStr}10`];

  const isRoomDangerous = (id) => dangerRooms.includes(String(id));

  // Trigger walk animation on step change
  useEffect(() => {
    stepChangeRef.current = stepIndex;
    walkRef.current = 0;
  }, [stepIndex]);

  // ── Canvas corridor renderer ───────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function draw() {
      const ctx = canvas.getContext('2d');
      const W   = canvas.width;
      const H   = canvas.height;

      tick.current += 1;
      const t = tick.current;

      // Walk cycle: smooth forward zoom
      walkRef.current = Math.min(walkRef.current + 0.012, 1);
      const walkPhase = walkRef.current;

      // Camera bob (gentle up/down sway simulating walking)
      const bobY = walkPhase < 1 ? Math.sin(walkPhase * Math.PI * 4) * 3 : 0;

      // ── Sky / hallway depth gradient background ─────────────────────
      const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0,   '#2a2218');
      bgGrad.addColorStop(0.4, '#3d3020');
      bgGrad.addColorStop(1,   '#1a1408');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // ── Vanishing point (with bob) ────────────────────────────────
      const vpX = W / 2;
      const vpY = H * 0.40 + bobY;

      // ── Ceiling ──────────────────────────────────────────────────
      const ceilY = H * 0.10;
      const ceilGrad = ctx.createLinearGradient(0, 0, 0, ceilY + 30);
      ceilGrad.addColorStop(0, '#1c1710');
      ceilGrad.addColorStop(1, '#2e2518');
      ctx.fillStyle = ceilGrad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(W, 0);
      ctx.lineTo(vpX, vpY);
      ctx.closePath();
      ctx.fill();

      // ── Floor ────────────────────────────────────────────────────
      const floorY = H * 0.60;
      const floorGrad = ctx.createLinearGradient(0, floorY, 0, H);
      floorGrad.addColorStop(0, '#4a3d2e');
      floorGrad.addColorStop(0.5, '#3a2f22');
      floorGrad.addColorStop(1, '#221c13');
      ctx.fillStyle = floorGrad;
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.lineTo(W, H);
      ctx.lineTo(vpX, vpY);
      ctx.lineTo(0, floorY);
      ctx.closePath();
      ctx.fill();

      // ── Floor tile grid ───────────────────────────────────────────
      ctx.save();
      ctx.strokeStyle = 'rgba(90,72,50,0.4)';
      ctx.lineWidth = 0.8;
      // Perspective tiles along floor
      const tileCount = 10;
      for (let ti = 1; ti <= tileCount; ti++) {
        const tRatio = ti / tileCount;
        const fy = vpY + (H - vpY) * tRatio;
        const fw = (W / 2) * tRatio;
        ctx.beginPath();
        ctx.moveTo(vpX - fw, fy);
        ctx.lineTo(vpX + fw, fy);
        ctx.stroke();
      }
      // Vertical tile lines
      for (let ti = -4; ti <= 4; ti++) {
        const offset = (ti / 4) * (W / 2);
        ctx.beginPath();
        ctx.moveTo(vpX + offset * 0.2, vpY);
        ctx.lineTo(vpX + offset, H);
        ctx.stroke();
      }
      ctx.restore();

      // ── Left wall ─────────────────────────────────────────────────
      const wallLGrad = ctx.createLinearGradient(0, 0, W * 0.4, 0);
      wallLGrad.addColorStop(0, '#3d3020');
      wallLGrad.addColorStop(1, '#2e2518');
      ctx.fillStyle = wallLGrad;
      ctx.beginPath();
      ctx.moveTo(0, ceilY);
      ctx.lineTo(vpX, vpY);
      ctx.lineTo(0, floorY);
      ctx.closePath();
      ctx.fill();

      // ── Right wall ────────────────────────────────────────────────
      const wallRGrad = ctx.createLinearGradient(W, 0, W * 0.6, 0);
      wallRGrad.addColorStop(0, '#3d3020');
      wallRGrad.addColorStop(1, '#2e2518');
      ctx.fillStyle = wallRGrad;
      ctx.beginPath();
      ctx.moveTo(W, ceilY);
      ctx.lineTo(vpX, vpY);
      ctx.lineTo(W, floorY);
      ctx.closePath();
      ctx.fill();

      // Wall baseboard
      ctx.strokeStyle = 'rgba(100,80,50,0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, floorY);
      ctx.lineTo(vpX, vpY);
      ctx.lineTo(W, floorY);
      ctx.stroke();

      // ── Ceiling cornice ────────────────────────────────────────────
      ctx.strokeStyle = 'rgba(100,80,50,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, ceilY);
      ctx.lineTo(vpX, vpY);
      ctx.lineTo(W, ceilY);
      ctx.stroke();

      // ── Back wall ─────────────────────────────────────────────────
      const bwW = W * 0.16;
      const bwH = (floorY - ceilY) * 0.65;
      const bwX = vpX - bwW / 2;
      const bwY = vpY - bwH * 0.45;
      const bwGrad = ctx.createRadialGradient(vpX, vpY, 0, vpX, vpY, bwW);
      bwGrad.addColorStop(0, '#5a4830');
      bwGrad.addColorStop(1, '#3a2e1e');
      ctx.fillStyle = bwGrad;
      ctx.fillRect(bwX, bwY, bwW, bwH);
      ctx.strokeStyle = '#1a1510';
      ctx.lineWidth = 2;
      ctx.strokeRect(bwX, bwY, bwW, bwH);

      // ── Ceiling lights (fluorescent tubes) ────────────────────────
      const lightCount = 5;
      for (let li = 0; li < lightCount; li++) {
        const ratio = (li + 1) / (lightCount + 1);
        // Map perspective: closer lights are wider apart
        const perspRatio = Math.pow(ratio, 0.7);
        const lx = vpX;
        const ly = ceilY + (vpY - ceilY) * perspRatio;
        const lw = W * 0.06 * (1 - perspRatio * 0.8);
        const flicker = 0.85 + 0.15 * Math.sin(t * 0.15 + li);
        const lightAlpha = 0.7 * flicker;

        // Glow effect
        const glowGrad = ctx.createRadialGradient(lx, ly, 0, lx, ly, lw * 4);
        glowGrad.addColorStop(0, `rgba(255,240,200,${lightAlpha * 0.35})`);
        glowGrad.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = glowGrad;
        ctx.fillRect(lx - lw * 4, ly - lw * 4, lw * 8, lw * 8);

        // Tube
        ctx.fillStyle = `rgba(255,245,220,${lightAlpha})`;
        ctx.beginPath();
        ctx.roundRect(lx - lw, ly - 3, lw * 2, 5, 2);
        ctx.fill();
      }

      // ── Emergency EXIT sign (far end) ─────────────────────────────
      const signW = bwW * 0.7;
      const signH = 14;
      const signX = vpX - signW / 2;
      const signY = bwY - signH - 4;
      const signGlow = 0.7 + 0.3 * Math.abs(Math.sin(t * 0.08));
      ctx.fillStyle = `rgba(0,200,83,${signGlow})`;
      ctx.beginPath();
      ctx.roundRect(signX, signY, signW, signH, 3);
      ctx.fill();
      ctx.font = `bold ${Math.max(7, signW * 0.25)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText('EXIT ▶', vpX, signY + signH / 2);

      // ── Door helper ───────────────────────────────────────────────
      function drawDoor(pts, label, danger, doorIndex) {
        const [x1, y1, x2, y2, x3, y3, x4, y4] = pts;

        // Door frame (dark wood)
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.lineTo(x4, y4);
        ctx.closePath();

        if (danger) {
          const pulse = 0.25 + 0.5 * Math.abs(Math.sin(t * 0.07));
          const dangerGrad = ctx.createLinearGradient(x1, y1, x3, y3);
          dangerGrad.addColorStop(0, `rgba(255,45,45,${pulse})`);
          dangerGrad.addColorStop(1, `rgba(180,0,0,${pulse * 0.6})`);
          ctx.fillStyle = dangerGrad;
        } else {
          // Dark wood door
          const doorGrad = ctx.createLinearGradient(x1, y1, x2, y2);
          doorGrad.addColorStop(0, 'rgba(50,35,15,0.9)');
          doorGrad.addColorStop(0.5, 'rgba(70,50,25,0.85)');
          doorGrad.addColorStop(1, 'rgba(45,30,12,0.9)');
          ctx.fillStyle = doorGrad;
        }
        ctx.fill();

        // Door outline / frame
        ctx.strokeStyle = danger ? 'rgba(255,80,80,0.8)' : 'rgba(90,65,30,0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Door panel inset (decorative lines)
        if (!danger) {
          const midX = (x1 + x2) / 2;
          const topY = (y1 + y2) / 2;
          const botY = (y4 + y3) / 2;
          const panelInset = Math.abs(x2 - x1) * 0.12;
          ctx.strokeStyle = 'rgba(100,75,35,0.5)';
          ctx.lineWidth = 1;
          // Upper panel
          ctx.beginPath();
          ctx.roundRect(
            Math.min(x1, x2) + panelInset,
            topY - (topY - y1) * 0.5,
            Math.abs(x2 - x1) - panelInset * 2,
            (topY - y1) * 0.6,
            2
          );
          ctx.stroke();
        }

        // Door number plate
        const numX = (x1 + x2 + x3 + x4) / 4;
        const numY = (y1 + y2 + y3 + y4) / 4;
        const plateW = Math.max(28, Math.abs(x2 - x1) * 0.55);
        const plateH = 16;

        ctx.fillStyle = danger ? 'rgba(200,0,0,0.85)' : 'rgba(30,22,10,0.9)';
        ctx.beginPath();
        ctx.roundRect(numX - plateW / 2, numY - plateH / 2, plateW, plateH, 4);
        ctx.fill();
        ctx.strokeStyle = danger ? '#ff6060' : 'rgba(180,140,60,0.8)';
        ctx.lineWidth = 1;
        ctx.stroke();

        const fontSize = Math.max(8, plateW * 0.32);
        ctx.font = `700 ${fontSize}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = danger ? '#ffaaaa' : '#d4a855';
        ctx.fillText(label, numX, numY);

        // Door knob
        const knobX = doorIndex % 2 === 0 ? numX + plateW * 0.55 : numX - plateW * 0.55;
        const knobY = numY + plateH;
        const knobR  = Math.max(3, plateW * 0.08);
        ctx.beginPath();
        ctx.arc(knobX, knobY, knobR, 0, Math.PI * 2);
        ctx.fillStyle = danger ? 'rgba(255,100,100,0.8)' : 'rgba(210,168,68,0.9)';
        ctx.fill();

        // Danger flame
        if (danger) {
          ctx.font = `${Math.max(10, Math.abs(x2-x1) * 0.4)}px serif`;
          ctx.textAlign = 'center';
          ctx.fillStyle = `rgba(255,150,0,${0.6 + 0.4 * Math.abs(Math.sin(t * 0.1))})`;
          ctx.fillText('🔥', numX, numY - plateH - 5);
        }
      }

      // ── Door panels — Left wall ─────────────────────────────────
      const leftDoors = [
        [0, ceilY, W*0.17, ceilY+(vpY-ceilY)*0.25, W*0.17, floorY+(H-floorY)*0.15, 0, floorY, leftRooms[0]],
        [W*0.19, ceilY+(vpY-ceilY)*0.28, W*0.32, ceilY+(vpY-ceilY)*0.45, W*0.32, floorY+(H-floorY)*0.08, W*0.19, floorY+(H-floorY)*0.05, leftRooms[1]],
        [W*0.34, ceilY+(vpY-ceilY)*0.48, W*0.43, ceilY+(vpY-ceilY)*0.60, W*0.43, floorY+(H-floorY)*0.03, W*0.34, floorY+(H-floorY)*0.02, leftRooms[2]],
      ];

      leftDoors.forEach((pts, i) => {
        drawDoor(pts, pts[8], isRoomDangerous(pts[8]), i);
      });

      // ── Door panels — Right wall ────────────────────────────────
      const rightDoors = [
        [W, ceilY, W*0.83, ceilY+(vpY-ceilY)*0.25, W*0.83, floorY+(H-floorY)*0.15, W, floorY, rightRooms[0]],
        [W*0.81, ceilY+(vpY-ceilY)*0.28, W*0.68, ceilY+(vpY-ceilY)*0.45, W*0.68, floorY+(H-floorY)*0.08, W*0.81, floorY+(H-floorY)*0.05, rightRooms[1]],
        [W*0.66, ceilY+(vpY-ceilY)*0.48, W*0.57, ceilY+(vpY-ceilY)*0.60, W*0.57, floorY+(H-floorY)*0.03, W*0.66, floorY+(H-floorY)*0.02, rightRooms[2]],
      ];

      rightDoors.forEach((pts, i) => {
        drawDoor(pts, pts[8], isRoomDangerous(pts[8]), i);
      });

      // ── Smoke/haze if danger rooms nearby ──────────────────────
      const anyDanger = [...leftRooms, ...rightRooms].some(r => isRoomDangerous(r));
      if (anyDanger) {
        const hazeAlpha = 0.08 + 0.06 * Math.sin(t * 0.04);
        const hazeGrad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W*0.8);
        hazeGrad.addColorStop(0, `rgba(200,100,0,0)`);
        hazeGrad.addColorStop(0.5, `rgba(200,80,0,${hazeAlpha})`);
        hazeGrad.addColorStop(1, `rgba(180,50,0,${hazeAlpha * 2})`);
        ctx.fillStyle = hazeGrad;
        ctx.fillRect(0, 0, W, H);
      }

      // ── Navigation arrow ────────────────────────────────────────
      if (!evacuationDone) {
        const arrowBob = Math.sin(t * 0.08) * 6;
        const arrowX   = vpX;
        const arrowY   = H * 0.76 + arrowBob;
        const arrowW   = W * 0.09;
        const arrowH   = H * 0.13;
        const arrowAlpha = 0.7 + 0.3 * Math.abs(Math.sin(t * 0.07));

        // Arrow glow
        const arrowGlow = ctx.createRadialGradient(arrowX, arrowY, 0, arrowX, arrowY, arrowW * 2);
        arrowGlow.addColorStop(0, `rgba(0,200,83,${arrowAlpha * 0.4})`);
        arrowGlow.addColorStop(1, 'rgba(0,200,83,0)');
        ctx.fillStyle = arrowGlow;
        ctx.fillRect(arrowX - arrowW*2, arrowY - arrowW*2, arrowW*4, arrowW*4);

        ctx.fillStyle = `rgba(0,200,83,${arrowAlpha})`;
        ctx.beginPath();
        ctx.moveTo(arrowX,             arrowY - arrowH * 0.55);
        ctx.lineTo(arrowX - arrowW,    arrowY + arrowH * 0.45);
        ctx.lineTo(arrowX - arrowW * 0.38, arrowY + arrowH * 0.15);
        ctx.lineTo(arrowX - arrowW * 0.38, arrowY + arrowH * 0.45);
        ctx.lineTo(arrowX + arrowW * 0.38, arrowY + arrowH * 0.45);
        ctx.lineTo(arrowX + arrowW * 0.38, arrowY + arrowH * 0.15);
        ctx.lineTo(arrowX + arrowW,    arrowY + arrowH * 0.45);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,255,100,0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // ── Walk-forward overlay vignette when stepping ─────────────
      if (walkPhase < 0.8) {
        const vigAlpha = (1 - walkPhase / 0.8) * 0.25;
        const vigGrad = ctx.createRadialGradient(W/2, H/2, W*0.1, W/2, H/2, W*0.7);
        vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
        vigGrad.addColorStop(1, `rgba(0,0,0,${vigAlpha})`);
        ctx.fillStyle = vigGrad;
        ctx.fillRect(0, 0, W, H);
      }

      animRef.current = requestAnimationFrame(draw);
    }

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width  = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);

    draw();
    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
    };
  }, [dangerRooms, floor]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Waveform bars ─────────────────────────────────────────────────────
  const waveCount = 20;

  const isHindi = language === 'hi';

  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      height:        '100%',
      width:         '100%',
      background:    '#0d0d0a',
      userSelect:    'none',
      position:      'relative',
      fontFamily:    'Inter, sans-serif',
      overflow:      'hidden',
    }}>

      <style>{`
        @keyframes wave-bar {
          0%,100% { height: 4px;  opacity: 0.5; }
          50%      { height: 30px; opacity: 1; }
        }
        @keyframes next-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(0,200,83,0.7); }
          50%      { box-shadow: 0 0 0 12px rgba(0,200,83,0); }
        }
        @keyframes evac-done {
          0%,100% { opacity: 0.85; transform: scale(1); }
          50%      { opacity: 1;   transform: scale(1.02); }
        }
        @keyframes lang-pop {
          0%   { transform: scale(0.9); opacity: 0.7; }
          60%  { transform: scale(1.08); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes agent-think {
          0%,100% { box-shadow: 0 0 0 0 rgba(255,214,0,0.5); }
          50%      { box-shadow: 0 0 0 10px rgba(255,214,0,0); }
        }
        @keyframes runner-bob {
          0%,100% { transform: translateY(0px); }
          50%      { transform: translateY(-6px); }
        }
        @keyframes danger-pulse {
          0%,100% { opacity: 0.7; }
          50%      { opacity: 1; }
        }
      `}</style>

      {/* ── Header ─────────────────────────────────────────────── */}
      <header style={{
        background:     evacuationDone
          ? 'linear-gradient(135deg,#00C853,#00a845)'
          : 'linear-gradient(135deg,#1a0f00,#2d1a00)',
        borderBottom:   evacuationDone ? 'none' : '2px solid rgba(0,200,83,0.4)',
        height:         52,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '0 14px',
        flexShrink:     0,
        zIndex:         10,
        boxShadow:      evacuationDone
          ? '0 3px 20px rgba(0,200,83,0.5)'
          : '0 3px 16px rgba(0,0,0,0.6)',
      }}>
        {/* Left: step indicator */}
        <div style={{
          fontSize:      10,
          fontWeight:    700,
          color:         evacuationDone ? '#000' : '#00C853',
          letterSpacing: 1.5,
          fontFamily:    'Rajdhani, sans-serif',
          minWidth:      60,
        }}>
          {evacuationDone ? '✅ SAFE' : `STEP ${stepIndex + 1}/${totalSteps}`}
        </div>

        {/* Center: title */}
        <h1 style={{
          margin:        0,
          fontSize:      15,
          fontWeight:    900,
          letterSpacing: 2.5,
          color:         evacuationDone ? '#000' : '#fff',
          textAlign:     'center',
        }}>
          {evacuationDone
            ? (isHindi ? '✅ निकासी हुई' : '✅ EVACUATED')
            : (isHindi ? '🚨 निकासी मार्ग' : '🚨 EVACUATION ROUTE')}
        </h1>

        {/* Right: Language toggle */}
        <button
          onClick={onLanguageToggle}
          title={isHindi ? 'Switch to English' : 'हिंदी में बदलें'}
          style={{
            background:    isHindi
              ? 'linear-gradient(135deg,#ff9933,#138808)'
              : 'linear-gradient(135deg,#012169,#c8102e)',
            border:        '2px solid rgba(255,255,255,0.3)',
            borderRadius:  20,
            padding:       '4px 10px',
            color:         '#fff',
            fontSize:      10,
            fontWeight:    800,
            letterSpacing: 0.5,
            cursor:        'pointer',
            display:       'flex',
            alignItems:    'center',
            gap:           4,
            flexShrink:    0,
            minWidth:      52,
            justifyContent: 'center',
            animation:     'lang-pop 0.3s ease',
            boxShadow:     '0 2px 8px rgba(0,0,0,0.4)',
          }}
        >
          {isHindi ? '🇮🇳 HI' : '🇬🇧 EN'}
        </button>
      </header>

      {/* ── Canvas corridor POV ─────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
        />

        {/* Instruction overlay card */}
        {currentStep && !evacuationDone && (
          <div style={{
            position:       'absolute',
            bottom:         12,
            left:           10,
            right:          10,
            background:     'rgba(5,3,0,0.88)',
            border:         '1px solid rgba(0,200,83,0.5)',
            borderRadius:   16,
            padding:        '12px 14px',
            backdropFilter: 'blur(12px)',
            boxShadow:      '0 4px 24px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,200,83,0.15)',
          }}>
            {/* Step label */}
            <div style={{
              fontSize:      9,
              fontWeight:    700,
              color:         '#00C853',
              letterSpacing: 2,
              marginBottom:  5,
              fontFamily:    'Rajdhani, sans-serif',
              display:       'flex',
              alignItems:    'center',
              gap:           6,
            }}>
              <span style={{
                background:   '#00C853',
                color:        '#000',
                borderRadius: 4,
                padding:      '1px 5px',
                fontSize:     8,
              }}>
                {currentStep.label}
              </span>
              {isHindi && <span style={{ color: '#ffd600', fontSize: 8 }}>हिंदी</span>}
            </div>
            {/* Instruction */}
            <div style={{
              fontSize:   13,
              lineHeight: 1.6,
              color:      '#f0ece0',
              fontWeight: 500,
            }}>
              {currentStep.instruction}
            </div>
          </div>
        )}

        {/* Evacuation done overlay */}
        {evacuationDone && (
          <div style={{
            position:       'absolute',
            inset:          0,
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
            background:     'rgba(0,10,3,0.78)',
            animation:      'evac-done 1.8s ease-in-out infinite',
            backdropFilter: 'blur(4px)',
          }}>
            <div style={{
              fontSize:  72,
              animation: 'runner-bob 1s ease-in-out infinite',
              filter:    'drop-shadow(0 0 20px rgba(0,200,83,0.7))',
            }}>🏃</div>
            <div style={{
              fontSize:      24,
              fontWeight:    900,
              color:         '#00C853',
              letterSpacing: 3,
              marginTop:     8,
              fontFamily:    'Rajdhani, sans-serif',
              textShadow:    '0 0 20px rgba(0,200,83,0.8)',
            }}>
              {isHindi ? 'आप बाहर निकल गए' : 'YOU HAVE EXITED'}
            </div>
            <div style={{
              fontSize:   12,
              color:      '#8ab89a',
              marginTop:  10,
              textAlign:  'center',
              lineHeight: 1.6,
              maxWidth:   200,
            }}>
              {isHindi
                ? 'मस्टर पॉइंट पर जाएं और आगे के निर्देशों की प्रतीक्षा करें।'
                : 'Proceed to the muster point and await further instructions.'}
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer style={{
        background:     'linear-gradient(135deg,#0d0b05,#181410)',
        borderTop:      '2px solid rgba(0,200,83,0.35)',
        flexShrink:     0,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '0 12px',
        height:         70,
        zIndex:         10,
        gap:            10,
      }}>

        {/* Agent avatar */}
        <div style={{
          width:          46,
          height:         46,
          borderRadius:   '50%',
          background:     voiceActive
            ? 'linear-gradient(135deg,#ffd600,#ff9500)'
            : 'linear-gradient(135deg,#2a2210,#3d3318)',
          border:         `2px solid ${voiceActive ? '#ffd600' : 'rgba(180,140,50,0.4)'}`,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          flexShrink:     0,
          boxShadow:      voiceActive
            ? '0 0 16px rgba(255,214,0,0.6)'
            : '0 0 8px rgba(0,0,0,0.5)',
          animation:      voiceActive ? 'agent-think 1s ease-in-out infinite' : 'none',
          transition:     'all 0.3s ease',
          overflow:       'hidden',
        }}>
          {/* Human-like agent face */}
          <svg viewBox="0 0 40 40" width="36" height="36">
            {/* Head */}
            <ellipse cx="20" cy="19" rx="11" ry="13" fill={voiceActive ? '#ffdf60' : '#d4a855'}/>
            {/* Hair */}
            <ellipse cx="20" cy="9" rx="11" ry="6" fill={voiceActive ? '#8b6914' : '#5a3e10'}/>
            {/* Eyes */}
            <ellipse cx="16" cy="17" rx="2.2" ry="2.5" fill="#fff"/>
            <ellipse cx="24" cy="17" rx="2.2" ry="2.5" fill="#fff"/>
            <circle cx="16.5" cy="17.5" r="1.3" fill="#1a1200"/>
            <circle cx="24.5" cy="17.5" r="1.3" fill="#1a1200"/>
            {/* Blink / speaking mouth */}
            {voiceActive
              ? <path d="M14.5 24 Q20 28 25.5 24" stroke="#8b4513" strokeWidth="2" fill="rgba(200,80,50,0.6)" strokeLinecap="round"/>
              : <path d="M15.5 24 Q20 26.5 24.5 24" stroke="#8b4513" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
            }
            {/* Speaker badge */}
            {voiceActive && (
              <circle cx="33" cy="8" r="5" fill="#00C853"/>
            )}
            {voiceActive && (
              <text x="33" y="11" textAnchor="middle" fontSize="6" fill="#fff">🔊</text>
            )}
          </svg>
        </div>

        {/* Waveform */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          gap:            2.5,
          height:         40,
          flex:           1,
          justifyContent: 'center',
        }}>
          {[...Array(waveCount)].map((_, i) => {
            const delay  = `${i * 0.04}s`;
            const active = voiceActive;
            const hue    = 120 + (i % 5) * 8;
            return (
              <div
                key={i}
                style={{
                  width:          2.5,
                  minHeight:      3,
                  maxHeight:      32,
                  background:     active
                    ? `hsl(${hue}, 80%, ${50 + i % 3 * 10}%)`
                    : 'rgba(100,80,30,0.3)',
                  borderRadius:   2,
                  animation:      active ? `wave-bar 0.6s ease-in-out infinite` : 'none',
                  animationDelay: delay,
                  height:         active ? undefined : 4,
                  transition:     'background 0.3s',
                }}
              />
            );
          })}
        </div>

        {/* Right: Next + Speak */}
        <div style={{
          display:       'flex',
          flexDirection: 'column',
          alignItems:    'flex-end',
          gap:           5,
          flexShrink:    0,
        }}>
          {/* NEXT checkpoint */}
          {!evacuationDone && onNext && (
            <button
              onClick={onNext}
              style={{
                background:    'linear-gradient(135deg,#001a08,#002d10)',
                color:         '#00C853',
                border:        '1.5px solid #00C853',
                borderRadius:  24,
                padding:       '5px 14px',
                fontWeight:    800,
                fontSize:      11,
                fontFamily:    'Rajdhani, sans-serif',
                letterSpacing: 1.5,
                cursor:        'pointer',
                animation:     'next-pulse 2s ease-in-out infinite',
                whiteSpace:    'nowrap',
                boxShadow:     '0 2px 8px rgba(0,200,83,0.25)',
              }}
            >
              {isHindi ? 'आगे ▶' : 'NEXT ▶'}
            </button>
          )}

          {/* TAP TO SPEAK */}
          <button
            onClick={onSpeakPressed}
            style={{
              background:    voiceActive
                ? 'linear-gradient(135deg,#1a0e00,#2d1a00)'
                : 'linear-gradient(135deg,#0d0b05,#1a1608)',
              border:        `1.5px solid ${voiceActive ? '#ffd600' : 'rgba(180,140,50,0.4)'}`,
              borderRadius:  24,
              padding:       '4px 12px',
              color:         voiceActive ? '#ffd600' : '#c8a84d',
              fontWeight:    700,
              fontSize:      10,
              fontFamily:    'Rajdhani, sans-serif',
              letterSpacing: 1.2,
              cursor:        'pointer',
              display:       'flex',
              alignItems:    'center',
              gap:           5,
              whiteSpace:    'nowrap',
              transition:    'all 0.2s',
              boxShadow:     voiceActive ? '0 0 12px rgba(255,214,0,0.3)' : 'none',
            }}
          >
            <span style={{ fontSize: 12 }}>🎙️</span>
            <span>{isHindi ? 'बोलें' : 'TAP TO SPEAK'}</span>
          </button>
        </div>
      </footer>
    </div>
  );
}