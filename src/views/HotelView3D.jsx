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

  // ── KEY FIX: store applyStatus in a ref so the [] bus effect always
  //    calls the CURRENT version — even after initScene populates roomMeshes.
  //    Without this, the bus.replay([]) closure captures the first-render
  //    applyStatus which sees an empty roomMeshes.current.
  const applyStatusRef = useRef(null);

  // ── applyStatus ────────────────────────────────────────────────────────
  function applyStatus(roomId, status) {
    const id   = String(roomId);
    const mesh = roomMeshes.current[id];

    if (!mesh) {
      // Queue for when initScene builds the meshes
      pendingRef.current.push({ roomId: id, status });
      return;
    }

    console.log(`[HOTEL3D] applyStatus — room ${id}: ${status} — mesh found, painting`);

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

  // ── Keep the ref always pointing to the latest applyStatus ────────────
  // This runs on every render so the ref is always fresh.
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

  // ── Sync roomStatusesProp → local state + meshes on prop change ──────────
  useEffect(() => {
    setRoomStatuses(prev => ({ ...prev, ...roomStatusesProp }));
    Object.entries(roomStatusesProp).forEach(([roomId, status]) => {
      applyStatus(String(roomId), status);
    });
  }, [roomStatusesProp]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Whenever roomStatuses state changes, re-apply all non-clear entries ──
  useEffect(() => {
    Object.entries(roomStatuses).forEach(([roomId, status]) => {
      if (status && status !== 'clear') {
        applyStatus(String(roomId), status);
      }
    });
  }, [roomStatuses]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Bus listeners — use applyStatusRef.current so we ALWAYS call the
  //    latest applyStatus regardless of when this effect was registered. ──
  useEffect(() => {
    const unsubStatus = bus.replay('room:statusChange', ({ roomId, status }) => {
      console.log(`[HOTEL3D] bus room:statusChange — room ${roomId}: ${status}`);
      // Call via ref: always the latest version with current roomMeshes
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

  // ── alertRooms prop → highlight red ──────────────────────────────────────
  useEffect(() => {
    alertRooms.forEach(roomId => applyStatus(String(roomId), 'fire'));
  }, [alertRooms]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Evacuation path tube ─────────────────────────────────────────────────
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

  // ── Camera focus / POV mode ──────────────────────────────────────────────
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

  // ── Scene init / resize observer ─────────────────────────────────────────
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
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a2a1a, roughness: 0.95 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.35;
    ground.receiveShadow = true;
    scene.add(ground);

    const paveMat = new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.8 });
    [[0,-0.3,16,70,0.12,6],[0,-0.3,-16,70,0.12,6],[-36,-0.3,0,6,0.12,40],[36,-0.3,0,6,0.12,40]].forEach(([x,y,z,w,h,d]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), paveMat);
      m.position.set(x,y,z);
      scene.add(m);
    });

    function makeTree(x, z, height = 5, color = 0x2d6a2d) {
      const group = new THREE.Group();
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.32, height * 0.38, 7),
        new THREE.MeshStandardMaterial({ color: 0x4a2f1a, roughness: 0.9 })
      );
      trunk.position.y = height * 0.19;
      group.add(trunk);
      const foliageMat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
      [[height*0.55,height*0.38,0.9],[height*0.7,height*0.3,0.75],[height*0.88,height*0.22,0.55]].forEach(([y,h,r]) => {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(r * height * 0.18, h, 7), foliageMat);
        cone.position.y = y;
        group.add(cone);
      });
      group.position.set(x, -0.35, z);
      scene.add(group);
    }
    for (let i = -3; i <= 3; i++) makeTree(i*9,  21, 5+Math.random()*2, i%2===0 ? 0x2d7a2d : 0x1e5c1e);
    for (let i = -3; i <= 3; i++) makeTree(i*9, -21, 5+Math.random()*2, i%2===0 ? 0x26692a : 0x1a4a1a);
    for (let i = -2; i <= 2; i++) {
      makeTree(-40, i*9, 4+Math.random()*3, 0x2a6020);
      makeTree( 40, i*9, 4+Math.random()*3, 0x336a22);
    }

    const skyMat = new THREE.MeshStandardMaterial({ color: 0x12121e, roughness: 1 });
    [[-70,8,-60],[-55,12,-65],[-80,6,-50],[70,10,-60],[58,7,-65],[82,14,-55],[-65,5,60],[65,9,60]].forEach(([bx,bh,bz]) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(6+Math.random()*4,bh,6+Math.random()*4), skyMat);
      b.position.set(bx, bh/2-0.35, bz);
      scene.add(b);
    });
  }

  function initScene(W, H) {
    const mount = mountRef.current;
    const { roomWidth: rW, roomDepth: rD, roomHeight: rH, floorSpacing } = HOTEL_CONFIG;

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
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xaabbcc, 1.5);
    fill.position.set(-20, 10, -20);
    scene.add(fill);

    const grid = new THREE.GridHelper(100, 50, 0x444466, 0x222244);
    grid.position.y = -0.3;
    scene.add(grid);

    Object.values(hotelData.graph).forEach(node => {
      if (node.type === 'guest') {
        const geom = new THREE.BoxGeometry(rW - 0.15, rH - 0.1, rD - 0.15);
        const mat  = new THREE.MeshStandardMaterial({
          color:            STATUS_COLORS.clear.color,
          emissive:         STATUS_COLORS.clear.emissive,
          emissiveIntensity: 0,
          transparent: true, opacity: 0.82,
          roughness: 0.25, metalness: 0.6,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(node.position.x, node.position.y + rH / 2, node.position.z);
        mesh.castShadow    = true;
        mesh.receiveShadow = true;
        mesh.userData      = { roomId: node.roomId, room: node };
        scene.add(mesh);
        roomMeshes.current[node.roomId] = mesh;

        mesh.add(new THREE.LineSegments(
          new THREE.EdgesGeometry(geom),
          new THREE.LineBasicMaterial({ color: 0x5a5aaa, transparent: true, opacity: 0.7 })
        ));

        if (node.floor <= 3) {
          const el = document.createElement('div');
          el.textContent  = node.displayName;
          el.style.cssText = 'color:rgba(140,140,200,0.55);font-size:8px;font-family:JetBrains Mono,monospace;white-space:nowrap;';
          const obj = new CSS2DObject(el);
          obj.position.set(0, rH / 2 + 0.1, 0);
          mesh.add(obj);
        }

      } else if (node.type === 'stairwell') {
        const group   = new THREE.Group();
        const mat     = new THREE.MeshStandardMaterial({ color: 0x181825, roughness: 0.8 });
        const numSteps = 10;
        const stepH    = floorSpacing / numSteps;
        const stepD    = 3.6 / numSteps;
        for (let i = 0; i < numSteps; i++) {
          const step = new THREE.Mesh(new THREE.BoxGeometry(2.8, stepH, stepD), mat);
          step.position.set(0, i * stepH + stepH / 2, -1.8 + i * stepD + stepD / 2);
          group.add(step);
        }
        group.position.set(node.position.x, node.position.y, node.position.z);
        scene.add(group);

      } else if (node.type === 'exit') {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(3, rH, 1),
          new THREE.MeshStandardMaterial({
            color: 0x00ff88, emissive: 0x008844, emissiveIntensity: 0.5,
            transparent: true, opacity: 0.8,
          })
        );
        mesh.position.set(node.position.x, node.position.y + rH / 2 + 0.5, node.position.z);
        scene.add(mesh);
      }
    });

    for (let f = 1; f <= 8; f++) {
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(52, 0.18, 20),
        new THREE.MeshStandardMaterial({ color: 0x0c0c20, roughness: 0.9 })
      );
      slab.position.set(0, (f - 1) * floorSpacing - 0.12, 0);
      slab.receiveShadow = true;
      scene.add(slab);

      const fl = document.createElement('div');
      fl.textContent   = `FLOOR ${f}`;
      fl.style.cssText = 'color:rgba(80,80,140,0.9);font-size:10px;font-weight:700;font-family:JetBrains Mono,monospace;letter-spacing:2px;';
      const flObj = new CSS2DObject(fl);
      flObj.position.set(-30, (f - 1) * floorSpacing + 1, 0);
      scene.add(flObj);
    }

    addEnvironment(scene);

    // ── Flush pending queue after meshes are ready ────────────────────────
    // Use applyStatusRef.current so we call the definitive latest applyStatus.
    const mergedFlush = new Map();

    // 1. Prop snapshot (lowest priority)
    Object.entries(roomStatusesProp).forEach(([id, status]) => {
      mergedFlush.set(String(id), status);
    });

    // 2. Pending bus events (higher priority — they are newer)
    pendingRef.current.forEach(({ roomId, status }) => {
      mergedFlush.set(String(roomId), status);
    });
    pendingRef.current = [];

    // 3. Apply all via the ref so we always use the current applyStatus
    console.log('[HOTEL3D] initScene flush — entries:', mergedFlush.size);
    mergedFlush.forEach((status, id) => {
      console.log(`[HOTEL3D] initScene flush — painting room ${id}: ${status}`);
      applyStatusRef.current(id, status);
    });

    // 4. Also apply current roomStatuses state (catches updates via setRoomStatuses
    //    whose applyStatus call found no mesh yet)
    Object.entries(roomStatuses).forEach(([id, status]) => {
      if (status && status !== 'clear' && !mergedFlush.has(String(id))) {
        console.log(`[HOTEL3D] initScene state flush — painting room ${id}: ${status}`);
        applyStatusRef.current(String(id), status);
      }
    });

    // ── Raycaster ─────────────────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const mouse     = new THREE.Vector2();
    const meshList  = Object.values(roomMeshes.current);

    function getMouseNDC(e) {
      const rect = mount.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    }
    function onMove(e) {
      getMouseNDC(e);
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(meshList);
      setHoveredRoom(hits.length > 0 ? hits[0].object.userData.roomId : null);
      mount.style.cursor = hits.length > 0 ? 'pointer' : 'default';
    }
    function onClick(e) {
      getMouseNDC(e);
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(meshList);
      if (hits.length > 0) {
        const { roomId, room } = hits[0].object.userData;
        onRoomClick?.(roomId, room);
      }
    }
    renderer.domElement.addEventListener('mousemove', onMove);
    renderer.domElement.addEventListener('click',     onClick);

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
      renderer.domElement.removeEventListener('mousemove', onMove);
      renderer.domElement.removeEventListener('click',     onClick);
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

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', background: '#0a0a0f' }}>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />

      {!isGuest && (
        <div className="hotel-legend">
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, letterSpacing: 1.5, textTransform: 'uppercase' }}>Status</div>
          {[
            { label: 'Clear',        color: '#1e1e3a', border: '#2a2a5e' },
            { label: 'Buffer Zone',  color: '#ffd700' },
            { label: 'Smoke',        color: '#ff6b1a' },
            { label: 'Fire / Alert', color: '#ff2d2d' },
            { label: 'Security',     color: '#8b5cf6' },
            { label: 'Medical',      color: '#06b6d4' },
            { label: 'Evacuated',    color: '#00ff88' },
          ].map(l => (
            <div key={l.label} className="legend-item">
              <div className="legend-dot" style={{
                background:  l.color,
                border:      l.border ? `1px solid ${l.border}` : 'none',
                boxShadow:   l.border ? 'none' : `0 0 6px ${l.color}`,
              }} />
              <span>{l.label}</span>
            </div>
          ))}
        </div>
      )}

      {!isGuest && (
        <div className="hotel-info-panel">
          <div className="hotel-info-title">🏨 Hotel Overview</div>
          <div className="hotel-stats">
            <div className="hotel-stat"><span>Total Rooms</span><span className="hotel-stat-val mono">96</span></div>
            <div className="hotel-stat">
              <span>🔥 On Fire</span>
              <span className="hotel-stat-val mono" style={{ color: (fireCount+alertCount)>0 ? 'var(--fire-red)' : 'var(--text-secondary)' }}>{fireCount+alertCount}</span>
            </div>
            <div className="hotel-stat">
              <span>💨 Smoke</span>
              <span className="hotel-stat-val mono" style={{ color: smokeCount>0 ? 'var(--smoke-orange)' : 'var(--text-secondary)' }}>{smokeCount}</span>
            </div>
            <div className="hotel-stat">
              <span>🟡 Buffer</span>
              <span className="hotel-stat-val mono" style={{ color: bufferCount>0 ? '#ffd700' : 'var(--text-secondary)' }}>{bufferCount}</span>
            </div>
            <div className="hotel-stat">
              <span>🔒 Security</span>
              <span className="hotel-stat-val mono" style={{ color: securityCount>0 ? '#8b5cf6' : 'var(--text-secondary)' }}>{securityCount}</span>
            </div>
            <div className="hotel-stat">
              <span>🏥 Medical</span>
              <span className="hotel-stat-val mono" style={{ color: medicalCount>0 ? '#06b6d4' : 'var(--text-secondary)' }}>{medicalCount}</span>
            </div>
            <div className="hotel-stat">
              <span>✅ Clear</span>
              <span className="hotel-stat-val mono" style={{ color: 'var(--safe-green)' }}>{96 - affectedCount}</span>
            </div>
          </div>
          {hoveredRoom && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 12 }}>
              <span style={{ color: 'var(--text-secondary)' }}>📍 </span>
              <span style={{ color: '#fff', fontWeight: 700 }}>Room {hoveredRoom}</span>
              <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 2 }}>Click to open camera</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}