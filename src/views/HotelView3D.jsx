import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import bus from '../core/EventBus.js';
import { hotelData, HOTEL_CONFIG } from '../data/hotel.js';

const STATUS_COLORS = {
  clear:    { color: 0x5a5aaa, emissive: 0x222255, intensity: 0    },
  smoke:    { color: 0xff6b1a, emissive: 0xff4400, intensity: 0.5  },
  fire:     { color: 0xff2d2d, emissive: 0xff0000, intensity: 0.9  },
  buffer:   { color: 0xffd700, emissive: 0xffaa00, intensity: 0.55 },
  security: { color: 0x8b5cf6, emissive: 0x6d28d9, intensity: 0.8  },
  medical:  { color: 0x06b6d4, emissive: 0x0891b2, intensity: 0.8  },
  audio:    { color: 0xffd700, emissive: 0xffaa00, intensity: 0.4  },
  evacuated:{ color: 0x00ff88, emissive: 0x00cc66, intensity: 0.4  },
  alert:    { color: 0xff2d2d, emissive: 0xff0000, intensity: 0.9  },
};

const PARTICLE_COLORS = {
  fire:     0xff5500,
  smoke:    0xaaaaaa,
  security: 0x9f7aea,
  medical:  0x22d3ee,
};

const glass = {
  background: 'rgba(8, 8, 24, 0.72)',
  backdropFilter: 'blur(18px) saturate(1.4)',
  WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
  border: '1px solid rgba(120, 140, 255, 0.18)',
  borderRadius: 14,
};

const LEGEND_ITEMS = [
  { label: 'Clear',        color: 'rgba(90,90,180,0.6)',  border: '1px solid rgba(90,90,200,0.5)', glow: false },
  { label: 'Buffer Zone',  color: '#ffd700',               glow: true  },
  { label: 'Smoke',        color: '#ff6b1a',               glow: true  },
  { label: 'Fire / Alert', color: '#ff2d2d',               glow: true  },
  { label: 'Security',     color: '#8b5cf6',               glow: true  },
  { label: 'Medical',      color: '#06b6d4',               glow: true  },
  { label: 'Evacuated',    color: '#00ff88',               glow: true  },
];

export default function HotelView3D({
  onRoomClick,
  evacuationPath  = [],
  viewMode        = 'map',
  focusRoomId,
  isRescueMode    = false,
  isGuest         = false,
  alertRooms      = [],
  roomStatuses: roomStatusesProp = {},
}) {
  const wrapRef          = useRef(null);
  const mountRef         = useRef(null);
  const sceneRef         = useRef(null);
  const rendererRef      = useRef(null);
  const labelRendererRef = useRef(null);
  const cameraRef        = useRef(null);
  const controlsRef      = useRef(null);
  const roomMeshes       = useRef({});
  const pathLineRef      = useRef(null);
  const particleSystems  = useRef({});
  const animRef          = useRef(null);
  const initializedRef   = useRef(false);
  const pendingRef       = useRef([]);

  const [roomStatuses, setRoomStatuses] = useState(() => ({ ...roomStatusesProp }));
  const [hoveredRoom,  setHoveredRoom]  = useState(null);
  const [overviewExpanded, setOverviewExpanded] = useState(true);

  const applyStatusRef = useRef(null);

  function applyStatus(roomId, status) {
    const id   = String(roomId);
    const mesh = roomMeshes.current[id];
    if (!mesh) {
      pendingRef.current.push({ roomId: id, status });
      return;
    }
    const cfg = STATUS_COLORS[status] || STATUS_COLORS.clear;
    mesh.material.color.setHex(cfg.color);
    mesh.material.emissive.setHex(cfg.emissive);
    mesh.material.emissiveIntensity = cfg.intensity;
    if (status === 'clear') {
      removeParticles(id);
    } else if (PARTICLE_COLORS[status]) {
      addParticles(id, PARTICLE_COLORS[status]);
    } else {
      removeParticles(id);
    }
  }

  applyStatusRef.current = applyStatus;

  function addParticles(roomId, particleColor = 0xff5500) {
    if (particleSystems.current[roomId]) {
      particleSystems.current[roomId].material.color.setHex(particleColor);
      return;
    }
    const scene = sceneRef.current;
    if (!scene) return;
    const mesh = roomMeshes.current[String(roomId)];
    if (!mesh) return;
    const pos = mesh.position;
    const { roomWidth: rW, roomDepth: rD, roomHeight: rH } = HOTEL_CONFIG;
    const count     = 120;
    const positions = new Float32Array(count * 3);
    const velocities = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3]     = pos.x + (Math.random() - 0.5) * rW;
      positions[i * 3 + 1] = pos.y + rH / 2;
      positions[i * 3 + 2] = pos.z + (Math.random() - 0.5) * rD;
      velocities.push({
        vx: (Math.random() - 0.5) * 0.04,
        vy: 0.06 + Math.random() * 0.1,
        vz: (Math.random() - 0.5) * 0.04,
        life: Math.random(),
      });
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const ps = new THREE.Points(geom, new THREE.PointsMaterial({
      color: particleColor, size: 0.22, transparent: true, opacity: 0.85,
    }));
    ps.userData = { velocities, basePos: pos.clone(), rW, rH, rD };
    scene.add(ps);
    particleSystems.current[roomId] = ps;
  }

  function removeParticles(roomId) {
    const ps = particleSystems.current[roomId];
    if (!ps) return;
    sceneRef.current?.remove(ps);
    ps.geometry.dispose();
    delete particleSystems.current[roomId];
  }

  useEffect(() => {
    setRoomStatuses(prev => ({ ...prev, ...roomStatusesProp }));
    Object.entries(roomStatusesProp).forEach(([roomId, status]) => {
      applyStatus(String(roomId), status);
    });
  }, [roomStatusesProp]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    Object.entries(roomStatuses).forEach(([roomId, status]) => {
      if (status && status !== 'clear') applyStatus(String(roomId), status);
    });
  }, [roomStatuses]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unsubStatus = bus.replay('room:statusChange', ({ roomId, status }) => {
      applyStatusRef.current(String(roomId), status);
      setRoomStatuses(prev => ({ ...prev, [String(roomId)]: status }));
    });
    const unsubResolved = bus.on('alert:resolved', ({ roomId }) => {
      if (!roomId) return;
      applyStatusRef.current(String(roomId), 'clear');
      setRoomStatuses(prev => ({ ...prev, [String(roomId)]: 'clear' }));
    });
    return () => { unsubStatus(); unsubResolved(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    alertRooms.forEach(roomId => applyStatus(String(roomId), 'fire'));
  }, [alertRooms]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sceneRef.current || !hotelData.graph) return;
    if (pathLineRef.current) {
      sceneRef.current.remove(pathLineRef.current);
      pathLineRef.current.geometry.dispose();
      pathLineRef.current = null;
    }
    if (evacuationPath && evacuationPath.length > 1) {
      const points = [];
      evacuationPath.forEach(nodeId => {
        const node = hotelData.graph[nodeId];
        if (node?.position) {
          const yOff = node.type === 'stairwell' ? HOTEL_CONFIG.roomHeight / 2 + 0.5 : HOTEL_CONFIG.roomHeight / 2;
          points.push(new THREE.Vector3(node.position.x, node.position.y + yOff, node.position.z));
        }
      });
      if (points.length > 1) {
        const curve    = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.1);
        const tubeGeom = new THREE.TubeGeometry(curve, points.length * 10, 0.25, 8, false);
        const pathColor = isRescueMode ? 0xff2d2d : 0x00ff88;
        const tube = new THREE.Mesh(tubeGeom, new THREE.MeshStandardMaterial({
          color: pathColor, emissive: pathColor, emissiveIntensity: 2.5,
          transparent: true, opacity: 0.9,
        }));
        sceneRef.current.add(tube);
        pathLineRef.current = tube;
      }
    }
  }, [evacuationPath, isRescueMode]);

  useEffect(() => {
    if (!cameraRef.current || !controlsRef.current || !hotelData.graph) return;
    const cam  = cameraRef.current;
    const ctrl = controlsRef.current;
    if (viewMode === 'pov' && focusRoomId && hotelData.graph[focusRoomId]) {
      const room = hotelData.graph[focusRoomId];
      cam.position.set(room.position.x, room.position.y + HOTEL_CONFIG.roomHeight / 2 + 1, room.position.z);
      ctrl.target.set(room.position.x, room.position.y + HOTEL_CONFIG.roomHeight / 2, 0);
      ctrl.minDistance = 0.1;
      ctrl.update();
    } else {
      cam.position.set(30, 25, 40);
      ctrl.target.set(0, 12, 0);
      ctrl.minDistance = 15;
      ctrl.update();
    }
  }, [viewMode, focusRoomId]);

  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width === 0 || height === 0) return;
      if (!initializedRef.current) {
        initializedRef.current = true;
        initScene(width, height);
      } else {
        if (cameraRef.current) {
          cameraRef.current.aspect = width / height;
          cameraRef.current.updateProjectionMatrix();
        }
        rendererRef.current?.setSize(width, height);
        labelRendererRef.current?.setSize(width, height);
      }
    });
    if (wrapRef.current) observer.observe(wrapRef.current);
    return () => {
      observer.disconnect();
      if (mountRef.current?._cleanup) mountRef.current._cleanup();
      cancelAnimationFrame(animRef.current);
      if (mountRef.current) mountRef.current.innerHTML = '';
      rendererRef.current?.dispose();
      initializedRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function addEnvironment(scene) {
    const mats = {
      ground:     new THREE.MeshStandardMaterial({ color: 0x1a1d33, roughness: 0.95, metalness: 0.05 }),
      plaza:      new THREE.MeshStandardMaterial({ color: 0x20254a, roughness: 0.7,  metalness: 0.15 }),
      tile:       new THREE.MeshStandardMaterial({ color: 0x262c52, roughness: 0.6,  metalness: 0.2  }),
      asphalt:    new THREE.MeshStandardMaterial({ color: 0x161a30, roughness: 0.95, metalness: 0.0  }),
      concrete:   new THREE.MeshStandardMaterial({ color: 0x1c2138, roughness: 0.85, metalness: 0.08 }),
      poleMetal:  new THREE.MeshStandardMaterial({ color: 0x2a2e44, roughness: 0.35, metalness: 0.92 }),
      trunk:      new THREE.MeshStandardMaterial({ color: 0x2e1a0e, roughness: 0.95 }),
      foliage0:   new THREE.MeshStandardMaterial({ color: 0x1a5218, roughness: 0.88 }),
      foliage1:   new THREE.MeshStandardMaterial({ color: 0x154a14, roughness: 0.88 }),
      foliage2:   new THREE.MeshStandardMaterial({ color: 0x123e10, roughness: 0.88 }),
      palmLeaf:   new THREE.MeshStandardMaterial({ color: 0x1e5e1c, roughness: 0.85, side: THREE.DoubleSide }),
      water:      new THREE.MeshStandardMaterial({ color: 0x2a3a6a, roughness: 0.1, metalness: 0.8, transparent: true, opacity: 0.88 }),
      city:       new THREE.MeshStandardMaterial({ color: 0x171a30, roughness: 1.0 }),
      cityGlow:   new THREE.MeshStandardMaterial({ color: 0x232a4a, emissive: 0x1a2255, emissiveIntensity: 0.7 }),
      stripe:     new THREE.MeshStandardMaterial({ color: 0x252b48, roughness: 1 }),
      canopy:     new THREE.MeshStandardMaterial({ color: 0x1c2138, roughness: 0.4,  metalness: 0.7, transparent: true, opacity: 0.88 }),
      entrance:   new THREE.MeshStandardMaterial({ color: 0x1a2440, roughness: 0.3,  metalness: 0.6 }),
      marble:     new THREE.MeshStandardMaterial({ color: 0x222942, roughness: 0.25, metalness: 0.4 }),
      accentLight:new THREE.MeshStandardMaterial({ color: 0x6699ff, emissive: 0x3366dd, emissiveIntensity: 1.2 }),
    };

    const groundGeom = new THREE.PlaneGeometry(500, 500);
    const groundMesh = new THREE.Mesh(groundGeom, mats.ground);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -0.4;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    const grid = new THREE.GridHelper(400, 100, 0x262c52, 0x1d2240);
    grid.position.y = -0.38;
    grid.material.transparent = true;
    grid.material.opacity = 0.55;
    scene.add(grid);

    const plazaGeom = new THREE.BoxGeometry(90, 0.25, 60);
    const plaza = new THREE.Mesh(plazaGeom, mats.plaza);
    plaza.position.set(0, -0.28, 0);
    plaza.receiveShadow = true;
    scene.add(plaza);

    const tileMat = mats.tile;
    const tileGeom = new THREE.BoxGeometry(88, 0.04, 0.3);
    for (let i = -4; i <= 4; i++) {
      const tile = new THREE.Mesh(tileGeom, tileMat);
      tile.position.set(0, -0.15, i * 6.5);
      scene.add(tile);
    }
    const tileGeom2 = new THREE.BoxGeometry(0.3, 0.04, 58);
    for (let i = -5; i <= 5; i++) {
      const tile = new THREE.Mesh(tileGeom2, tileMat);
      tile.position.set(i * 8, -0.15, 0);
      scene.add(tile);
    }

    const roadGeoms = [
      { x: 0,   z:  36,  w: 110, d: 12 },
      { x: 0,   z: -36,  w: 110, d: 12 },
      { x: -56, z:   0,  w: 12,  d: 60 },
      { x:  56, z:   0,  w: 12,  d: 60 },
    ];
    roadGeoms.forEach(({ x, z, w, d }) => {
      const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, d), mats.asphalt);
      r.position.set(x, -0.31, z);
      r.receiveShadow = true;
      scene.add(r);
    });

    const drivewayMat = mats.asphalt;
    const driveGeom = new THREE.BoxGeometry(18, 0.22, 14);
    const driveway = new THREE.Mesh(driveGeom, drivewayMat);
    driveway.position.set(0, -0.31, 22);
    scene.add(driveway);

    const armGeom = new THREE.BoxGeometry(18, 0.22, 4);
    [-10, 10].forEach(x => {
      const arm = new THREE.Mesh(armGeom, drivewayMat);
      arm.position.set(x, -0.31, 33);
      scene.add(arm);
    });

    const dashGeom = new THREE.BoxGeometry(4, 0.01, 0.22);
    for (let i = -6; i <= 6; i++) {
      const d1 = new THREE.Mesh(dashGeom, mats.stripe);
      d1.position.set(i * 9, -0.18,  36);
      scene.add(d1);
      const d2 = new THREE.Mesh(dashGeom, mats.stripe);
      d2.position.set(i * 9, -0.18, -36);
      scene.add(d2);
    }
    const dashGeom2 = new THREE.BoxGeometry(0.22, 0.01, 4);
    for (let i = -3; i <= 3; i++) {
      const d3 = new THREE.Mesh(dashGeom2, mats.stripe);
      d3.position.set(-56, -0.18, i * 8);
      scene.add(d3);
      const d4 = new THREE.Mesh(dashGeom2, mats.stripe);
      d4.position.set( 56, -0.18, i * 8);
      scene.add(d4);
    }

    const swGeom1 = new THREE.BoxGeometry(90, 0.18, 4);
    const sw1 = new THREE.Mesh(swGeom1, mats.concrete);
    sw1.position.set(0, -0.32, 30.5);
    scene.add(sw1);
    const sw2 = sw1.clone();
    sw2.position.set(0, -0.32, -30.5);
    scene.add(sw2);

    const podiumGeom = new THREE.BoxGeometry(48, 1.4, 8);
    const podium = new THREE.Mesh(podiumGeom, mats.marble);
    podium.position.set(0, -0.05, 12.5);
    podium.receiveShadow = true;
    podium.castShadow    = true;
    scene.add(podium);

    for (let s = 0; s < 4; s++) {
      const stepGeom = new THREE.BoxGeometry(22 - s * 2, 0.28, 1.1);
      const step = new THREE.Mesh(stepGeom, mats.marble);
      step.position.set(0, -0.4 + s * 0.28, 17 - s * 1.1);
      scene.add(step);
    }

    const canopyRoofGeom = new THREE.BoxGeometry(24, 0.35, 9);
    const canopyRoof = new THREE.Mesh(canopyRoofGeom, mats.canopy);
    canopyRoof.position.set(0, 7.5, 19.5);
    canopyRoof.castShadow = true;
    scene.add(canopyRoof);

    const colGeom = new THREE.CylinderGeometry(0.22, 0.28, 7.8, 8);
    [[-10, 15.5], [10, 15.5], [-10, 23.5], [10, 23.5]].forEach(([cx, cz]) => {
      const col = new THREE.Mesh(colGeom, mats.poleMetal);
      col.position.set(cx, 3.5, cz);
      col.castShadow = true;
      scene.add(col);
    });

    const canopyGlowGeom = new THREE.BoxGeometry(22, 0.08, 0.12);
    const canopyGlowMat = new THREE.MeshStandardMaterial({
      color: 0x99bbff, emissive: 0x6688ee, emissiveIntensity: 1.5, transparent: true, opacity: 0.9,
    });
    for (let i = -3; i <= 3; i++) {
      const strip = new THREE.Mesh(canopyGlowGeom, canopyGlowMat);
      strip.position.set(0, 7.3, 15.5 + i * 1.3);
      scene.add(strip);
    }

    const lobbyGlassMat = new THREE.MeshStandardMaterial({
      color: 0x2a3a66, emissive: 0x18244a, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.75, roughness: 0.05, metalness: 0.8,
    });
    const lobbyFrameMat = new THREE.MeshStandardMaterial({ color: 0x32395e, roughness: 0.3, metalness: 0.9 });

    const lobbyH = 6.5;
    for (let p = -4; p <= 4; p++) {
      if (p === 0) continue;
      const panel = new THREE.Mesh(new THREE.BoxGeometry(4.2, lobbyH, 0.12), lobbyGlassMat);
      panel.position.set(p * 4.6, lobbyH / 2, 16.6);
      scene.add(panel);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.12, lobbyH, 0.18), lobbyFrameMat);
      frame.position.set(p * 4.6 + 2.15, lobbyH / 2, 16.6);
      scene.add(frame);
    }
    [1.5, 3.5, 5.5].forEach(fy => {
      const hframe = new THREE.Mesh(new THREE.BoxGeometry(42, 0.12, 0.18), lobbyFrameMat);
      hframe.position.set(0, fy, 16.6);
      scene.add(hframe);
    });

    const archCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-4, 0, 0),
      new THREE.Vector3(0, 3.5, 0),
      new THREE.Vector3(4, 0, 0)
    );
    const archPoints = archCurve.getPoints(16);
    const archGeom = new THREE.BufferGeometry().setFromPoints(archPoints);
    const archLine = new THREE.Line(archGeom, new THREE.LineBasicMaterial({ color: 0x6688dd, linewidth: 2 }));
    archLine.position.set(0, 1.5, 16.65);
    scene.add(archLine);

    const signMat = new THREE.MeshStandardMaterial({ color: 0xccddff, emissive: 0x88aaff, emissiveIntensity: 2.0 });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(14, 0.6, 0.15), signMat);
    sign.position.set(0, 7.8, 16.55);
    scene.add(sign);
    const signLight = new THREE.PointLight(0x6688ff, 1.8, 10);
    signLight.position.set(0, 7.8, 17.5);
    scene.add(signLight);

    const podiumBaseMat = new THREE.MeshStandardMaterial({ color: 0x1b1f38, roughness: 0.6, metalness: 0.35 });
    const podiumBase = new THREE.Mesh(new THREE.BoxGeometry(66, 2.5, 26), podiumBaseMat);
    podiumBase.position.set(0, 1.0, 0);
    podiumBase.castShadow    = true;
    podiumBase.receiveShadow = true;
    scene.add(podiumBase);

    const podiumTrimMat = new THREE.MeshStandardMaterial({ color: 0x4466cc, emissive: 0x3355cc, emissiveIntensity: 1.0 });
    const podiumTrim = new THREE.Mesh(new THREE.BoxGeometry(66, 0.12, 26), podiumTrimMat);
    podiumTrim.position.set(0, 2.26, 0);
    scene.add(podiumTrim);

    const wingMat = new THREE.MeshStandardMaterial({ color: 0x191d36, roughness: 0.65, metalness: 0.3 });
    [-30, 30].forEach(wx => {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(8, 1.8, 20), wingMat);
      wing.position.set(wx, 0.7, 0);
      wing.castShadow = true;
      scene.add(wing);

      const wingGlass = new THREE.Mesh(new THREE.BoxGeometry(7.5, 1.6, 0.12), lobbyGlassMat);
      wingGlass.position.set(wx, 0.7, 10.05);
      scene.add(wingGlass);
      const wingGlass2 = wingGlass.clone();
      wingGlass2.position.set(wx, 0.7, -10.05);
      scene.add(wingGlass2);

      const wStrip = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.08, 0.12), podiumTrimMat);
      wStrip.position.set(wx, 1.62, 10.06);
      scene.add(wStrip);
    });

    const curveMat = new THREE.MeshStandardMaterial({ color: 0x1d2440, roughness: 0.4, metalness: 0.7 });
    const curveGeom = new THREE.CylinderGeometry(6, 6.5, 0.4, 24, 1, false, -Math.PI * 0.5, Math.PI);
    const curveDome = new THREE.Mesh(curveGeom, curveMat);
    curveDome.position.set(0, 2.5, 14);
    curveDome.rotation.y = Math.PI / 2;
    curveDome.castShadow = true;
    scene.add(curveDome);

    const poolGeom = new THREE.BoxGeometry(10, 0.3, 5);
    [-20, 20].forEach(px => {
      const pool = new THREE.Mesh(poolGeom, mats.water);
      pool.position.set(px, -0.26, 22);
      scene.add(pool);

      const rimMat = new THREE.MeshStandardMaterial({ color: 0x222942, roughness: 0.4, metalness: 0.5 });
      const rim = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.18, 5.5), rimMat);
      rim.position.set(px, -0.32, 22);
      scene.add(rim);

      const poolLight = new THREE.PointLight(0x3355cc, 0.8, 6);
      poolLight.position.set(px, 0.2, 22);
      scene.add(poolLight);
    });

    const fountainBaseMat = new THREE.MeshStandardMaterial({ color: 0x1d2440, roughness: 0.35, metalness: 0.65 });
    const fountainBase = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3, 0.6, 16), fountainBaseMat);
    fountainBase.position.set(0, -0.15, 22);
    scene.add(fountainBase);

    const fountainBowl = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.22, 8, 24), fountainBaseMat);
    fountainBowl.rotation.x = Math.PI / 2;
    fountainBowl.position.set(0, 0.25, 22);
    scene.add(fountainBowl);

    const fountainPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 2.0, 8), mats.poleMetal);
    fountainPillar.position.set(0, 1.05, 22);
    scene.add(fountainPillar);

    const fountainLight = new THREE.PointLight(0x4466ff, 1.5, 8);
    fountainLight.position.set(0, 1.5, 22);
    scene.add(fountainLight);

    function makePalm(x, z, height, seed) {
      const rng = n => Math.abs((Math.sin(seed * 91.3 + n * 233.7) * 43758.5453) % 1);
      const group = new THREE.Group();
      const trunkH = height * 0.75;
      const segments = 6;
      let curY = 0;
      for (let s = 0; s < segments; s++) {
        const t  = s / segments;
        const r0 = 0.14 * (1 - t * 0.5);
        const r1 = 0.14 * (1 - (t + 1 / segments) * 0.5);
        const segH = trunkH / segments;
        const seg  = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, segH, 7), mats.trunk);
        const lean = rng(s + 1) * 0.07 - 0.03;
        seg.position.set(lean * s * 0.5, curY + segH / 2, 0);
        seg.rotation.z = lean;
        seg.castShadow = true;
        group.add(seg);
        curY += segH;
      }
      const frondCount = 8;
      const topY = trunkH;
      for (let fi = 0; fi < frondCount; fi++) {
        const angle = (fi / frondCount) * Math.PI * 2;
        const frondGeom = new THREE.ConeGeometry(height * 0.18 * (0.7 + rng(fi * 7) * 0.6), height * 0.3, 4);
        const frond = new THREE.Mesh(frondGeom, mats.palmLeaf);
        frond.position.set(Math.cos(angle) * height * 0.06, topY + height * 0.04, Math.sin(angle) * height * 0.06);
        frond.rotation.z = Math.PI / 2 - 0.5 - rng(fi) * 0.4;
        frond.rotation.y = angle;
        frond.castShadow = true;
        group.add(frond);
      }
      group.position.set(x, -0.4, z);
      return group;
    }

    function makeOrnamentalTree(x, z, height, seed) {
      const rng = n => Math.abs((Math.sin(seed * 73.1 + n * 177.3) * 43758.5453) % 1);
      const group = new THREE.Group();
      const trunkH = height * 0.22;
      const trunk  = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.18, trunkH, 6), mats.trunk);
      trunk.position.y = trunkH * 0.5;
      trunk.castShadow = true;
      group.add(trunk);
      const layerMats = [mats.foliage0, mats.foliage1, mats.foliage2];
      [[0.0, 0.42, 0.16], [0.3, 0.34, 0.13], [0.56, 0.26, 0.10]].forEach(([t, hFrac, rFrac], li) => {
        const cH   = height * hFrac * (0.85 + rng(li)      * 0.30);
        const cR   = height * rFrac * (0.80 + rng(li + 10) * 0.40);
        const yPos = trunkH + height * (0.18 + t * 0.58);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(cR, cH, 7), layerMats[li]);
        cone.position.set((rng(li + 5) - 0.5) * 0.1, yPos, (rng(li + 8) - 0.5) * 0.1);
        cone.rotation.y = rng(li + 20) * Math.PI * 2;
        cone.castShadow = true;
        group.add(cone);
      });
      group.position.set(x, -0.4, z);
      return group;
    }

    function makeTopiary(x, z, height, seed) {
      const rng = n => Math.abs((Math.sin(seed * 61.3 + n * 199.7) * 43758.5453) % 1);
      const group = new THREE.Group();
      const trunkH = height * 0.45;
      const trunk  = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, trunkH, 6), mats.trunk);
      trunk.position.y = trunkH * 0.5;
      trunk.castShadow = true;
      group.add(trunk);
      const sphereMat = new THREE.MeshStandardMaterial({ color: 0x1d5a20, roughness: 0.85 });
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(height * 0.28, 10, 8), sphereMat);
      sphere.position.y = trunkH + height * 0.28;
      sphere.castShadow = true;
      group.add(sphere);
      for (let s = 0; s < 4; s++) {
        const angle = (s / 4) * Math.PI * 2 + rng(s) * 0.5;
        const smallR = height * (0.14 + rng(s + 5) * 0.08);
        const smallSphere = new THREE.Mesh(
          new THREE.SphereGeometry(smallR, 8, 6),
          new THREE.MeshStandardMaterial({ color: 0x205226, roughness: 0.88 })
        );
        smallSphere.position.set(
          Math.cos(angle) * height * 0.2,
          trunkH + height * 0.18 + rng(s + 10) * height * 0.15,
          Math.sin(angle) * height * 0.2
        );
        group.add(smallSphere);
      }
      group.position.set(x, -0.4, z);
      return group;
    }

    function makeShrub(x, z, size, seed) {
      const rng = n => Math.abs((Math.sin(seed * 53.1 + n * 155.7) * 43758.5453) % 1);
      const group = new THREE.Group();
      const shrubMat = new THREE.MeshStandardMaterial({ color: 0x1c3a20, roughness: 0.9 });
      for (let b = 0; b < 4; b++) {
        const bR = size * (0.4 + rng(b) * 0.6);
        const bush = new THREE.Mesh(new THREE.SphereGeometry(bR, 7, 5), shrubMat);
        bush.position.set((rng(b + 1) - 0.5) * size * 1.2, size * 0.5 * rng(b + 3), (rng(b + 2) - 0.5) * size * 1.2);
        bush.scale.y = 0.6;
        group.add(bush);
      }
      group.position.set(x, -0.35, z);
      return group;
    }

    [[-14, 28], [-8, 30], [8, 30], [14, 28]].forEach(([x, z], i) => scene.add(makePalm(x, z, 5.5 + i * 0.3, i * 7 + 1)));
    [[-14,-26], [-8,-28], [8,-28], [14,-26]].forEach(([x, z], i) => scene.add(makePalm(x, z, 5.2 + i * 0.25, i * 11 + 5)));
    for (let i = 0; i < 5; i++) scene.add(makePalm(-42, -16 + i * 8, 4.5 + (i % 3) * 0.7, i * 13 + 9));
    for (let i = 0; i < 5; i++) scene.add(makePalm( 42, -16 + i * 8, 4.5 + (i % 3) * 0.7, i * 17 + 13));

    const ornPositions = [
      [-32, 32], [-22, 34], [22, 34], [32, 32],
      [-38, 20], [-38, 8], [-38, -4], [-38,-16], [-38,-24],
      [ 38, 20], [ 38, 8], [ 38, -4], [ 38,-16], [ 38,-24],
      [-28,-32], [-18,-34], [0,-35], [18,-34], [28,-32],
      [-50, 30], [-52, 15], [-52, 0], [-52,-14], [-50,-28],
      [ 50, 30], [ 52, 15], [ 52, 0], [ 52,-14], [ 50,-28],
    ];
    ornPositions.forEach(([x, z], i) => scene.add(makeOrnamentalTree(x, z, 4.0 + (i % 4) * 0.6, i * 19 + 3)));

    const topiaryPos = [[-25, 20], [-25, 25], [25, 20], [25, 25], [-30, 6], [-30,-6], [30, 6], [30,-6]];
    topiaryPos.forEach(([x, z], i) => scene.add(makeTopiary(x, z, 2.5 + (i % 3) * 0.4, i * 23 + 7)));

    const shrubPos = [
      [-20, 16], [-10, 16], [0, 16], [10, 16], [20, 16],
      [-20,-14], [-10,-14], [0,-14], [10,-14], [20,-14],
      [-30, 2], [-30,-2], [30, 2], [30,-2],
    ];
    shrubPos.forEach(([x, z], i) => scene.add(makeShrub(x, z, 0.9 + (i % 3) * 0.25, i * 31 + 11)));

    function makeLuxuryLight(x, z, rotY = 0) {
      const group = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.4, 8), mats.poleMetal);
      base.position.y = 0.2;
      group.add(base);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 6.2, 7), mats.poleMetal);
      pole.position.y = 3.5;
      pole.castShadow = true;
      group.add(pole);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 1.2, 6), mats.poleMetal);
      neck.position.set(0.55, 6.5, 0);
      neck.rotation.z = -0.35;
      group.add(neck);
      const headMat = new THREE.MeshStandardMaterial({
        color: 0x5a6c99, emissive: 0xccddff, emissiveIntensity: 0.6,
        transparent: true, opacity: 0.88, roughness: 0.1, metalness: 0.5,
      });
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), headMat);
      head.position.set(1.1, 6.8, 0);
      group.add(head);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.18, 0.22, 8), mats.poleMetal);
      cap.position.set(1.1, 7.12, 0);
      group.add(cap);
      const light = new THREE.PointLight(0xbbccee, 1.6, 22);
      light.position.set(1.1, 6.6, 0);
      group.add(light);
      group.position.set(x, -0.4, z);
      group.rotation.y = rotY;
      return group;
    }

    [-36, -22, -8, 8, 22, 36].forEach(x => {
      scene.add(makeLuxuryLight(x, 30.5, Math.PI));
      scene.add(makeLuxuryLight(x, -30.5, 0));
    });
    [-20, -8, 4, 16].forEach(z => {
      scene.add(makeLuxuryLight(-50, z, Math.PI / 2));
      scene.add(makeLuxuryLight( 50, z, -Math.PI / 2));
    });

    function makeBollard(x, z) {
      const group = new THREE.Group();
      const bollardMat = new THREE.MeshStandardMaterial({ color: 0x2a2e44, roughness: 0.3, metalness: 0.95 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.85, 7), bollardMat);
      body.position.y = 0.42;
      group.add(body);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), bollardMat);
      cap.position.y = 0.9;
      group.add(cap);
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 7),
        new THREE.MeshStandardMaterial({ color: 0x7799ff, emissive: 0x5577ff, emissiveIntensity: 2.0 }));
      glow.position.y = 0.65;
      group.add(glow);
      const l = new THREE.PointLight(0x5577ff, 0.5, 3.5);
      l.position.y = 0.7;
      group.add(l);
      group.position.set(x, -0.4, z);
      return group;
    }

    for (let i = -3; i <= 3; i++) {
      scene.add(makeBollard(-10, 18 + i * 2.5));
      scene.add(makeBollard( 10, 18 + i * 2.5));
    }

    function makeBench(x, z, rotY = 0) {
      const group = new THREE.Group();
      const benchMat = new THREE.MeshStandardMaterial({ color: 0x282e4c, roughness: 0.4, metalness: 0.7 });
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.55), benchMat);
      seat.position.y = 0.55;
      group.add(seat);
      [[-0.9, 0], [0.9, 0]].forEach(([lx]) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.5), benchMat);
        leg.position.set(lx, 0.27, 0);
        group.add(leg);
      });
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 0.1), benchMat);
      back.position.set(0, 0.88, -0.22);
      back.rotation.x = -0.1;
      group.add(back);
      group.position.set(x, -0.38, z);
      group.rotation.y = rotY;
      return group;
    }

    [[-35, 18, 0], [35, 18, Math.PI], [-35, -16, 0], [35, -16, Math.PI]].forEach(([x, z, ry]) => {
      scene.add(makeBench(x, z, ry));
    });

    function makePlanter(x, z) {
      const group = new THREE.Group();
      const planterMat = new THREE.MeshStandardMaterial({ color: 0x232944, roughness: 0.35, metalness: 0.6 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.4), planterMat);
      box.position.y = 0.45;
      group.add(box);
      const rim = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 1.5), planterMat);
      rim.position.y = 0.94;
      group.add(rim);
      const soil = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 1.2),
        new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 1 }));
      soil.position.y = 0.92;
      group.add(soil);
      const tMat = new THREE.MeshStandardMaterial({ color: 0x224428, roughness: 0.88 });
      const tSphere = new THREE.Mesh(new THREE.SphereGeometry(0.36, 8, 6), tMat);
      tSphere.position.y = 1.42;
      group.add(tSphere);
      const tStalk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.55, 6), mats.trunk);
      tStalk.position.y = 1.12;
      group.add(tStalk);
      group.position.set(x, -0.4, z);
      return group;
    }

    [[-5, 16.5], [5, 16.5], [-5,-14.5], [5,-14.5],
     [-38, 12], [38, 12], [-38,-10], [38,-10]].forEach(([x, z]) => {
      scene.add(makePlanter(x, z));
    });

    [-1, 1].forEach(side => {
      const bay = new THREE.Mesh(new THREE.BoxGeometry(32, 0.18, 20), mats.asphalt);
      bay.position.set(side * 68, -0.33, 0);
      bay.receiveShadow = true;
      scene.add(bay);
      for (let sp = -3; sp <= 3; sp++) {
        const spLine = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.01, 5), mats.stripe);
        spLine.position.set(side * 68 + sp * 4.2, -0.22, 0);
        scene.add(spLine);
        const spLine2 = spLine.clone();
        spLine2.position.set(side * 68 + sp * 4.2, -0.22, 10);
        scene.add(spLine2);
        const spLine3 = spLine.clone();
        spLine3.position.set(side * 68 + sp * 4.2, -0.22, -10);
        scene.add(spLine3);
      }
    });

    const skylineData = [
      [-180, 11, -110,  8, 7], [-160, 14, -130,  8, 8], [-140, 20, -140, 10, 9],
      [-110, 26, -150, 12, 10], [-130, 16, -170,  9, 8],
      [ -80, 22, -160, 11, 10], [ -50, 30, -175, 13, 11], [ -20, 16, -185,  9, 9],
      [  20, 24, -183, 12, 10], [  50, 28, -172, 14, 11], [  80, 13, -158,  8, 8],
      [ 110, 20, -148, 10, 9], [ 130, 16, -168,  9, 8], [ 140, 25, -138, 12, 10],
      [ 160, 15, -128,  9, 8], [ 180,  9, -110,  7, 7],
    ];

    skylineData.forEach(([bx, bh, bz, bw, bd], idx) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mats.city);
      b.position.set(bx, bh / 2 - 0.4, bz);
      scene.add(b);
      const winRows = Math.floor(bh / 3);
      for (let wr = 0; wr < winRows; wr++) {
        const winAlpha = 0.3 + Math.abs(Math.sin(idx * 7.3 + wr * 3.1)) * 0.7;
        const winMat = new THREE.MeshStandardMaterial({
          color: 0x2a3a66, emissive: 0x1c2c5c, emissiveIntensity: winAlpha * 0.6,
          transparent: true, opacity: winAlpha * 0.8,
        });
        const winPanel = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.65, 0.28, 0.06), winMat);
        winPanel.position.set(bx, bh * (0.22 + wr / (winRows + 1)), bz + bd / 2 + 0.04);
        scene.add(winPanel);
      }
      if (idx % 3 === 0) {
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3, 4), mats.poleMetal);
        ant.position.set(bx, bh + 1.5, bz);
        scene.add(ant);
        const antLight = new THREE.Mesh(new THREE.SphereGeometry(0.1, 5, 4),
          new THREE.MeshStandardMaterial({ color: 0xff5555, emissive: 0xff2222, emissiveIntensity: 2.5 }));
        antLight.position.set(bx, bh + 3.2, bz);
        scene.add(antLight);
      }
    });

    const starCount = 2000;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const phi   = Math.acos(2 * Math.random() - 1);
      const theta = 2 * Math.PI * Math.random();
      const r     = 220 + Math.random() * 60;
      starPositions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 20;
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeom = new THREE.BufferGeometry();
    starGeom.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(starGeom, new THREE.PointsMaterial({
      color: 0xeef4ff, size: 0.35, transparent: true, opacity: 0.8, sizeAttenuation: true,
    }));
    scene.add(stars);

    const ambientGroundLights = [[-20, 0], [0, 0], [20, 0], [-20, -8], [20, -8]];
    ambientGroundLights.forEach(([x, z]) => {
      const gl = new THREE.PointLight(0x4466cc, 0.5, 12);
      gl.position.set(x, 0.5, z);
      scene.add(gl);
    });
  }

  function initScene(W, H) {
    const mount = mountRef.current;
    const { roomWidth: rW, roomDepth: rD, roomHeight: rH, floorSpacing } = HOTEL_CONFIG;

    // ── PODIUM HEIGHT — lifts all room floors above ground/parking ──────────
    // Floor 1 rooms (101-1xx) will start at PODIUM_HEIGHT instead of ground,
    // making them fully visible from the default camera angle.
    const PODIUM_HEIGHT = floorSpacing;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e1e32);
    scene.fog = new THREE.FogExp2(0x1e1e32, 0.006);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 500);
    camera.position.set(30, 25, 40);
    camera.lookAt(0, 10, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    renderer.toneMapping       = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(W, H);
    labelRenderer.domElement.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
    mount.appendChild(labelRenderer.domElement);
    labelRendererRef.current = labelRenderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping  = true;
    controls.dampingFactor  = 0.06;
    controls.minDistance    = 15;
    controls.maxDistance    = 120;
    controls.maxPolarAngle  = Math.PI / 2.1;
    controls.target.set(0, 12, 0);
    controls.update();
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0x8899bb, 4));

    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.position.set(25, 40, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left   = -60;
    sun.shadow.camera.right  =  60;
    sun.shadow.camera.top    =  60;
    sun.shadow.camera.bottom = -60;
    sun.shadow.bias = -0.0003;
    scene.add(sun);

    const fill = new THREE.DirectionalLight(0xaabbcc, 1.5);
    fill.position.set(-20, 10, -20);
    scene.add(fill);

    const glassFacadeMat = new THREE.MeshStandardMaterial({
      color: 0xdde8ff, emissive: 0x000000, emissiveIntensity: 0,
      transparent: true, opacity: 0.10, roughness: 0.05, metalness: 0.25,
    });
    const glassDarkMat = new THREE.MeshStandardMaterial({
      color: 0xcfe0ff, emissive: 0x000000, emissiveIntensity: 0,
      transparent: true, opacity: 0.13, roughness: 0.06, metalness: 0.25,
    });
    const glassAccentMat = new THREE.MeshStandardMaterial({
      color: 0xe8f0ff, emissive: 0x4488ff, emissiveIntensity: 0.08,
      transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0.2,
    });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1c2138, roughness: 0.25, metalness: 0.9 });
    const slabMat  = new THREE.MeshStandardMaterial({ color: 0x181c33, roughness: 0.8,  metalness: 0.3 });
    const ledMat   = new THREE.MeshStandardMaterial({ color: 0x6699ff, emissive: 0x3366ff, emissiveIntensity: 1.4 });
    const ledWarmMat = new THREE.MeshStandardMaterial({ color: 0x99bbff, emissive: 0x6688dd, emissiveIntensity: 1.0 });

    // ── ROOM MESHES — Y offset by PODIUM_HEIGHT ───────────────────────────
    Object.values(hotelData.graph).forEach(node => {
      if (node.type === 'guest') {
        const geom = new THREE.BoxGeometry(rW - 0.15, rH - 0.1, rD - 0.15);
        const mat  = new THREE.MeshStandardMaterial({
          color:             STATUS_COLORS.clear.color,
          emissive:          STATUS_COLORS.clear.emissive,
          emissiveIntensity: 0,
          transparent:       true,
          opacity:           0.82,
          roughness:         0.25,
          metalness:         0.6,
        });
        const mesh = new THREE.Mesh(geom, mat);
        // ▶ CHANGED: + PODIUM_HEIGHT lifts Floor 1 rooms above ground level
        mesh.position.set(node.position.x, node.position.y + rH / 2 + PODIUM_HEIGHT, node.position.z);
        mesh.castShadow    = true;
        mesh.receiveShadow = true;
        mesh.userData      = { roomId: node.roomId, room: node };
        scene.add(mesh);
        roomMeshes.current[node.roomId] = mesh;

        mesh.add(new THREE.LineSegments(
          new THREE.EdgesGeometry(geom),
          new THREE.LineBasicMaterial({ color: 0x5a5aaa, transparent: true, opacity: 0.7 })
        ));

        const el = document.createElement('div');
        el.textContent   = node.displayName;
        el.style.cssText = 'color:rgba(140,140,200,0.55);font-size:8px;font-family:JetBrains Mono,monospace;white-space:nowrap;';
        const obj = new CSS2DObject(el);
        obj.position.set(0, rH / 2 + 0.1, 0);
        mesh.add(obj);

      } else if (node.type === 'stairwell') {
        const group   = new THREE.Group();
        const mat     = new THREE.MeshStandardMaterial({ color: 0x181825, roughness: 0.75, metalness: 0.3 });
        const numSteps = 10;
        const stepH    = floorSpacing / numSteps;
        const stepD    = 3.6 / numSteps;
        for (let i = 0; i < numSteps; i++) {
          const step = new THREE.Mesh(new THREE.BoxGeometry(2.8, stepH, stepD), mat);
          step.position.set(0, i * stepH + stepH / 2, -1.8 + i * stepD + stepD / 2);
          group.add(step);
        }
        // ▶ CHANGED: + PODIUM_HEIGHT
        group.position.set(node.position.x, node.position.y + PODIUM_HEIGHT, node.position.z);
        scene.add(group);

      } else if (node.type === 'exit') {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(3, rH, 1),
          new THREE.MeshStandardMaterial({
            color: 0x00ff88, emissive: 0x008844, emissiveIntensity: 0.5,
            transparent: true, opacity: 0.8,
          })
        );
        // ▶ CHANGED: + PODIUM_HEIGHT
        mesh.position.set(node.position.x, node.position.y + rH / 2 + 0.5 + PODIUM_HEIGHT, node.position.z);
        scene.add(mesh);
      }
    });

    // ── FLOOR ASSEMBLY — each fy shifted up by PODIUM_HEIGHT ─────────────
    const buildingW = 52;
    const buildingD = 20;

    for (let f = 1; f <= 8; f++) {
      // ▶ CHANGED: + PODIUM_HEIGHT shifts all floor slabs, columns, glass panels
      const fy = (f - 1) * floorSpacing + PODIUM_HEIGHT;
      const isAccentFloor = f === 1 || f === 4 || f === 8;

      const slab = new THREE.Mesh(new THREE.BoxGeometry(buildingW + 1.2, 0.22, buildingD + 1.2), slabMat);
      slab.position.set(0, fy - 0.12, 0);
      slab.receiveShadow = true;
      slab.castShadow    = true;
      scene.add(slab);

      const slabLed = new THREE.Mesh(new THREE.BoxGeometry(buildingW, 0.06, 0.1), isAccentFloor ? ledMat : ledWarmMat);
      slabLed.position.set(0, fy - 0.24, buildingD / 2 + 0.05);
      scene.add(slabLed);
      const slabLedB = slabLed.clone();
      slabLedB.position.set(0, fy - 0.24, -buildingD / 2 - 0.05);
      scene.add(slabLedB);
      const slabLedS = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, buildingD), isAccentFloor ? ledMat : ledWarmMat);
      slabLedS.position.set(buildingW / 2 + 0.05, fy - 0.24, 0);
      scene.add(slabLedS);
      const slabLedS2 = slabLedS.clone();
      slabLedS2.position.set(-buildingW / 2 - 0.05, fy - 0.24, 0);
      scene.add(slabLedS2);

      const colH = floorSpacing + 0.1;
      const colGeom = new THREE.BoxGeometry(0.38, colH, 0.38);
      const colPositions = [
        [-buildingW / 2, 0], [-buildingW / 4, 0], [0, 0], [buildingW / 4, 0], [buildingW / 2, 0],
      ];
      colPositions.forEach(([cx]) => {
        [-buildingD / 2, buildingD / 2].forEach(cz => {
          const col = new THREE.Mesh(colGeom, frameMat);
          col.position.set(cx, fy + colH / 2 - 0.11, cz);
          col.castShadow = true;
          scene.add(col);
        });
      });

      const spandrelGeom = new THREE.BoxGeometry(buildingW + 0.5, 0.32, 0.32);
      const spF = new THREE.Mesh(spandrelGeom, frameMat);
      spF.position.set(0, fy + 0.12, buildingD / 2);
      scene.add(spF);
      const spB = new THREE.Mesh(spandrelGeom, frameMat);
      spB.position.set(0, fy + 0.12, -buildingD / 2);
      scene.add(spB);

      const panelW = (buildingW - 0.5) / 6;
      for (let p = 0; p < 6; p++) {
        const px = -buildingW / 2 + 0.25 + p * panelW + panelW / 2;
        const pMat = (p + f) % 3 === 0 ? glassAccentMat : (p % 2 === 0 ? glassFacadeMat : glassDarkMat);
        const panel = new THREE.Mesh(new THREE.BoxGeometry(panelW - 0.4, rH * 0.88, 0.10), pMat);
        panel.position.set(px, fy + rH / 2, buildingD / 2 + 0.06);
        panel.castShadow = true;
        scene.add(panel);
        const panelBk = panel.clone();
        panelBk.position.set(px, fy + rH / 2, -buildingD / 2 - 0.06);
        scene.add(panelBk);
        const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.12, rH, 0.15), frameMat);
        mullion.position.set(px - panelW / 2, fy + rH / 2, buildingD / 2 + 0.06);
        scene.add(mullion);
        const mullionBk = mullion.clone();
        mullionBk.position.set(px - panelW / 2, fy + rH / 2, -buildingD / 2 - 0.06);
        scene.add(mullionBk);
      }

      const sideW = buildingD / 3;
      for (let s = 0; s < 3; s++) {
        const sz = -buildingD / 2 + s * sideW + sideW / 2;
        const sMat = (s + f) % 2 === 0 ? glassFacadeMat : glassDarkMat;
        const sidePanel = new THREE.Mesh(new THREE.BoxGeometry(0.10, rH * 0.88, sideW - 0.4), sMat);
        sidePanel.position.set(buildingW / 2 + 0.06, fy + rH / 2, sz);
        scene.add(sidePanel);
        const sidePanelL = sidePanel.clone();
        sidePanelL.position.set(-buildingW / 2 - 0.06, fy + rH / 2, sz);
        scene.add(sidePanelL);
      }

      // ▶ Floor label — positioned at fy which already includes PODIUM_HEIGHT
      const fl = document.createElement('div');
      fl.textContent   = `FLOOR ${f}`;
      fl.style.cssText = 'color:rgba(80,80,140,0.9);font-size:10px;font-weight:700;font-family:JetBrains Mono,monospace;letter-spacing:2px;';
      const flObj = new CSS2DObject(fl);
      flObj.position.set(-30, fy + 1, 0);
      scene.add(flObj);
    }

    // ── ROOFTOP — also shifted by PODIUM_HEIGHT ───────────────────────────
    // ▶ CHANGED: + PODIUM_HEIGHT
    const roofY = 8 * floorSpacing + PODIUM_HEIGHT;
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x181c33, roughness: 0.7, metalness: 0.4 });

    const roofSlab = new THREE.Mesh(new THREE.BoxGeometry(buildingW + 2, 0.45, buildingD + 2), roofMat);
    roofSlab.position.set(0, roofY + 0.22, 0);
    roofSlab.castShadow = true;
    scene.add(roofSlab);

    const parapetMat = new THREE.MeshStandardMaterial({ color: 0x181825, roughness: 0.5, metalness: 0.6 });
    const parapetH = 1.2;
    [
      { w: buildingW + 2, d: 0.5, x: 0,               z: (buildingD + 2) / 2 + 0.25 },
      { w: buildingW + 2, d: 0.5, x: 0,               z: -(buildingD + 2) / 2 - 0.25 },
      { w: 0.5,           d: buildingD + 2, x: (buildingW + 2) / 2 + 0.25, z: 0 },
      { w: 0.5,           d: buildingD + 2, x: -(buildingW + 2) / 2 - 0.25, z: 0 },
    ].forEach(({ w, d, x, z }) => {
      const par = new THREE.Mesh(new THREE.BoxGeometry(w, parapetH, d), parapetMat);
      par.position.set(x, roofY + 0.5 + parapetH / 2, z);
      par.castShadow = true;
      scene.add(par);
    });

    const roofLedMat = new THREE.MeshStandardMaterial({ color: 0x6699ff, emissive: 0x4477ff, emissiveIntensity: 1.8 });
    const roofLedF = new THREE.Mesh(new THREE.BoxGeometry(buildingW + 2, 0.06, 0.1), roofLedMat);
    roofLedF.position.set(0, roofY + 0.48, (buildingD + 2) / 2 + 0.05);
    scene.add(roofLedF);
    const roofLedB = roofLedF.clone();
    roofLedB.position.set(0, roofY + 0.48, -(buildingD + 2) / 2 - 0.05);
    scene.add(roofLedB);
    const roofLedL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, buildingD + 2), roofLedMat);
    roofLedL.position.set((buildingW + 2) / 2 + 0.05, roofY + 0.48, 0);
    scene.add(roofLedL);
    const roofLedR = roofLedL.clone();
    roofLedR.position.set(-(buildingW + 2) / 2 - 0.05, roofY + 0.48, 0);
    scene.add(roofLedR);

    const hvacMat = new THREE.MeshStandardMaterial({ color: 0x1c2138, roughness: 0.7, metalness: 0.5 });
    [[-15, -4], [0, -4], [15, -4], [-8, 4], [8, 4]].forEach(([hx, hz]) => {
      const hvac = new THREE.Mesh(new THREE.BoxGeometry(4, 1.6, 2.5), hvacMat);
      hvac.position.set(hx, roofY + 0.7 + 0.8, hz);
      hvac.castShadow = true;
      scene.add(hvac);
    });

    const antMat = new THREE.MeshStandardMaterial({ color: 0x2a2e44, roughness: 0.3, metalness: 0.95 });
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 5.5, 6), antMat);
    antenna.position.set(0, roofY + 0.7 + 2.75, 0);
    scene.add(antenna);

    const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.18, 7, 5),
      new THREE.MeshStandardMaterial({ color: 0xff5555, emissive: 0xff2222, emissiveIntensity: 3.0 }));
    antennaTip.position.set(0, roofY + 0.7 + 5.6, 0);
    scene.add(antennaTip);

    const antennaLight = new THREE.PointLight(0xff3333, 1.5, 8);
    antennaLight.position.set(0, roofY + 0.7 + 5.5, 0);
    scene.add(antennaLight);

    // ── STRUCTURAL PODIUM / FOUNDATION BASE ────────────────────────────────
    // This architectural base elevates the hotel above ground/parking level.
    // Floor 1 rooms sit directly on top of this podium, making 101–1xx fully
    // visible from the default camera angle even when fire/smoke alerts fire.
    const podiumFoundationMat = new THREE.MeshStandardMaterial({
      color: 0x141828,
      roughness: 0.75,
      metalness: 0.45,
    });
    const podiumFoundationTrimMat = new THREE.MeshStandardMaterial({
      color: 0x3355aa,
      emissive: 0x2244aa,
      emissiveIntensity: 0.9,
    });

    // Main podium body fills the full PODIUM_HEIGHT beneath Floor 1
    const podiumBody = new THREE.Mesh(
      new THREE.BoxGeometry(buildingW + 2, PODIUM_HEIGHT - 0.2, buildingD + 2),
      podiumFoundationMat
    );
    podiumBody.position.set(0, (PODIUM_HEIGHT - 0.2) / 2 - 0.1, 0);
    podiumBody.castShadow    = true;
    podiumBody.receiveShadow = true;
    scene.add(podiumBody);

    // Podium top cap — distinct surface reads as a finished floor
    const podiumTopMat = new THREE.MeshStandardMaterial({
      color: 0x1a2040,
      roughness: 0.55,
      metalness: 0.5,
    });
    const podiumTop = new THREE.Mesh(
      new THREE.BoxGeometry(buildingW + 2.4, 0.2, buildingD + 2.4),
      podiumTopMat
    );
    podiumTop.position.set(0, PODIUM_HEIGHT - 0.2, 0);
    podiumTop.receiveShadow = true;
    scene.add(podiumTop);

    // Podium LED trim — front
    const podLedF = new THREE.Mesh(
      new THREE.BoxGeometry(buildingW + 2, 0.07, 0.1),
      podiumFoundationTrimMat
    );
    podLedF.position.set(0, PODIUM_HEIGHT - 0.08, (buildingD + 2) / 2 + 0.06);
    scene.add(podLedF);

    // Podium LED trim — back
    const podLedB = podLedF.clone();
    podLedB.position.set(0, PODIUM_HEIGHT - 0.08, -(buildingD + 2) / 2 - 0.06);
    scene.add(podLedB);

    // Podium LED trim — sides
    const podLedSide = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.07, buildingD + 2),
      podiumFoundationTrimMat
    );
    podLedSide.position.set((buildingW + 2) / 2 + 0.06, PODIUM_HEIGHT - 0.08, 0);
    scene.add(podLedSide);
    const podLedSideR = podLedSide.clone();
    podLedSideR.position.set(-(buildingW + 2) / 2 - 0.06, PODIUM_HEIGHT - 0.08, 0);
    scene.add(podLedSideR);

    // Podium decorative columns — front face
    const podColMat = new THREE.MeshStandardMaterial({ color: 0x1c2138, roughness: 0.3, metalness: 0.85 });
    for (let pc = -5; pc <= 5; pc++) {
      const pcol = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, PODIUM_HEIGHT - 0.15, 0.28),
        podColMat
      );
      pcol.position.set(pc * (buildingW / 11), (PODIUM_HEIGHT - 0.15) / 2 - 0.05, (buildingD + 2) / 2);
      pcol.castShadow = true;
      scene.add(pcol);
      const pcolBk = pcol.clone();
      pcolBk.position.z = -(buildingD + 2) / 2;
      scene.add(pcolBk);
    }

    // Podium lobby glass panels (front face — ground-level service/lobby)
    const podiumGlassMat = new THREE.MeshStandardMaterial({
      color: 0x2a3a6a,
      emissive: 0x111f44,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.55,
      roughness: 0.05,
      metalness: 0.7,
    });
    for (let pg = -4; pg <= 4; pg++) {
      const pgPanel = new THREE.Mesh(
        new THREE.BoxGeometry(buildingW / 11 - 0.32, PODIUM_HEIGHT * 0.58, 0.10),
        podiumGlassMat
      );
      pgPanel.position.set(
        pg * (buildingW / 11),
        PODIUM_HEIGHT * 0.38,
        (buildingD + 2) / 2 + 0.05
      );
      scene.add(pgPanel);
    }

    // ── ENVIRONMENT ───────────────────────────────────────────────────────
    addEnvironment(scene);

    // ── FLUSH PENDING STATUS UPDATES ─────────────────────────────────────
    const mergedFlush = new Map();
    Object.entries(roomStatusesProp).forEach(([id, status]) => mergedFlush.set(String(id), status));
    pendingRef.current.forEach(({ roomId, status }) => mergedFlush.set(String(roomId), status));
    pendingRef.current = [];
    mergedFlush.forEach((status, id) => applyStatusRef.current(id, status));
    Object.entries(roomStatuses).forEach(([id, status]) => {
      if (status && status !== 'clear' && !mergedFlush.has(String(id))) applyStatusRef.current(String(id), status);
    });

    // ── RAYCASTER / INTERACTION ───────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const mouse     = new THREE.Vector2();
    const meshList  = Object.values(roomMeshes.current);
    let mouseDownPos = { x: 0, y: 0 };
    const DRAG_THRESHOLD = 5;

    function getMouseNDC(e) {
      const rect = mount.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    }
    function onMouseDown(e) { mouseDownPos = { x: e.clientX, y: e.clientY }; }
    function onMove(e) {
      getMouseNDC(e);
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(meshList);
      setHoveredRoom(hits.length > 0 ? hits[0].object.userData.roomId : null);
      mount.style.cursor = hits.length > 0 ? 'pointer' : 'default';
    }
    function onClick(e) {
      const dx = e.clientX - mouseDownPos.x;
      const dy = e.clientY - mouseDownPos.y;
      if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) return;
      getMouseNDC(e);
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(meshList);
      if (hits.length > 0) {
        const { roomId, room } = hits[0].object.userData;
        onRoomClick?.(roomId, room);
      }
    }
    renderer.domElement.addEventListener('mousemove',  onMove);
    renderer.domElement.addEventListener('mousedown',  onMouseDown);
    renderer.domElement.addEventListener('click',      onClick);

    // ── ANIMATION LOOP ────────────────────────────────────────────────────
    let tick = 0;
    function animate() {
      animRef.current = requestAnimationFrame(animate);
      tick++;
      controls.update();

      Object.values(roomMeshes.current).forEach(mesh => {
        const ei = mesh.material.emissiveIntensity;
        if (ei > 0.3) {
          mesh.material.emissiveIntensity =
            ei * 0.97 + (0.4 + 0.5 * Math.sin(tick * 0.07)) * 0.03 * (ei > 0.5 ? 1 : 0.5);
        }
      });

      Object.values(particleSystems.current).forEach(ps => {
        const pos = ps.geometry.attributes.position.array;
        const { velocities, basePos, rW: psRW, rH: psRH, rD: psRD } = ps.userData;
        velocities.forEach((v, i) => {
          pos[i * 3]     += v.vx;
          pos[i * 3 + 1] += v.vy;
          pos[i * 3 + 2] += v.vz;
          v.life += 0.012;
          if (v.life > 1) {
            pos[i * 3]     = basePos.x + (Math.random() - 0.5) * psRW;
            pos[i * 3 + 1] = basePos.y + psRH / 2;
            pos[i * 3 + 2] = basePos.z + (Math.random() - 0.5) * psRD;
            v.life = 0;
          }
        });
        ps.geometry.attributes.position.needsUpdate = true;
        ps.material.opacity = 0.55 + 0.4 * Math.abs(Math.sin(tick * 0.09));
      });

      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
    }
    animate();

    mountRef.current._cleanup = () => {
      renderer.domElement.removeEventListener('mousemove',  onMove);
      renderer.domElement.removeEventListener('mousedown',  onMouseDown);
      renderer.domElement.removeEventListener('click',      onClick);
      cancelAnimationFrame(animRef.current);
      renderer.dispose();
    };
  }

  const fireCount     = Object.values(roomStatuses).filter(s => s === 'fire').length;
  const smokeCount    = Object.values(roomStatuses).filter(s => s === 'smoke').length;
  const bufferCount   = Object.values(roomStatuses).filter(s => s === 'buffer').length;
  const securityCount = Object.values(roomStatuses).filter(s => s === 'security').length;
  const medicalCount  = Object.values(roomStatuses).filter(s => s === 'medical').length;
  const alertCount    = alertRooms.length;
  const affectedCount = fireCount + smokeCount + bufferCount + securityCount + medicalCount + alertCount;
  const clearCount    = 96 - affectedCount;

  const overviewStats = [
    { label: 'Total Rooms', value: 96,              color: 'rgba(160,160,255,0.9)', bar: null },
    { label: 'On Fire',     value: fireCount + alertCount, color: '#ff4444', bar: '#ff2d2d' },
    { label: 'Smoke',       value: smokeCount,       color: '#ff8c42', bar: '#ff6b1a' },
    { label: 'Buffer',      value: bufferCount,      color: '#ffd700', bar: '#ffd700' },
    { label: 'Security',    value: securityCount,    color: '#a78bfa', bar: '#8b5cf6' },
    { label: 'Medical',     value: medicalCount,     color: '#22d3ee', bar: '#06b6d4' },
    { label: 'Clear',       value: clearCount,       color: '#00ff88', bar: '#00ff88' },
  ];

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', background: '#0a0a0f' }}>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />

      {!isGuest && (
        <div style={{ position: 'absolute', top: 16, right: 16, ...glass, padding: '14px 16px', minWidth: 160, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid rgba(120,140,255,0.15)' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#7c8fff', boxShadow: '0 0 8px #7c8fff' }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'rgba(180,190,255,0.7)', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase' }}>STATUS</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {LEGEND_ITEMS.map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <div style={{ width: 11, height: 11, borderRadius: 3, flexShrink: 0, background: item.color, border: item.border || 'none', boxShadow: item.glow ? `0 0 7px ${item.color}88` : 'none' }} />
                <span style={{ fontSize: 12, color: 'rgba(200, 210, 255, 0.75)', fontFamily: 'JetBrains Mono, monospace', letterSpacing: 0.3 }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isGuest && hoveredRoom && (
        <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', ...glass, padding: '9px 18px', display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'none', zIndex: 10, animation: 'fadeUp 0.18s ease' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#7c8fff', boxShadow: '0 0 8px #7c8fff' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(220,225,255,0.95)', fontFamily: 'JetBrains Mono, monospace', letterSpacing: 0.5 }}>Room {hoveredRoom}</span>
          <span style={{ fontSize: 11, color: 'rgba(140,155,220,0.55)', fontFamily: 'JetBrains Mono, monospace' }}>· click to open cameras</span>
        </div>
      )}

      {!isGuest && (
        <div style={{ position: 'absolute', bottom: 20, left: 20, ...glass, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, zIndex: 10, pointerEvents: 'none' }}>
          <svg width="28" height="28" viewBox="0 0 28 28">
            <polygon points="14,2 17,14 14,12 11,14" fill="rgba(255,80,80,0.9)" />
            <polygon points="14,26 11,14 14,16 17,14" fill="rgba(160,170,220,0.5)" />
            <circle cx="14" cy="14" r="2.5" fill="rgba(200,210,255,0.8)" />
          </svg>
          <div>
            <div style={{ fontSize: 9, color: 'rgba(160,170,220,0.5)', fontFamily: 'JetBrains Mono, monospace', letterSpacing: 1.5, marginBottom: 1 }}>ORIENTATION</div>
            <div style={{ fontSize: 10, color: 'rgba(200,210,255,0.7)', fontFamily: 'JetBrains Mono, monospace' }}>Drag · Scroll · Click</div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateX(-50%) translateY(6px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0);   }
        }
      `}</style>
    </div>
  );
}