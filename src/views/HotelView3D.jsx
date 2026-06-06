import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import bus from '../core/EventBus.js';
import { hotelData, HOTEL_CONFIG } from '../data/hotel.js';

const STATUS_COLORS = {
  clear:     { color: 0x5a5aaa, emissive: 0x222255, intensity: 0 },
  smoke:     { color: 0xff6b1a, emissive: 0xff4400, intensity: 0.5 },
  fire:      { color: 0xff2d2d, emissive: 0xff0000, intensity: 0.9 },
  evacuated: { color: 0x00ff88, emissive: 0x00cc66, intensity: 0.4 },
  audio:     { color: 0xffd700, emissive: 0xffaa00, intensity: 0.4 },
};

export default function HotelView3D({ onRoomClick, evacuationPath = [], viewMode = 'map', focusRoomId, isRescueMode = false, isGuest = false }) {
  const wrapRef = useRef(null);
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const labelRendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const roomMeshes = useRef({});
  const pathLineRef = useRef(null);
  const particleSystems = useRef({});
  const animRef = useRef(null);
  const initializedRef = useRef(false);

  const [roomStatuses, setRoomStatuses] = useState({});
  const [hoveredRoom, setHoveredRoom] = useState(null);

  useEffect(() => {
    // Re-draw evacuation path when prop changes (Evacuation or Rescue)
    if (sceneRef.current && hotelData.graph) {
      if (pathLineRef.current) {
        sceneRef.current.remove(pathLineRef.current);
        pathLineRef.current.geometry.dispose();
      }

      if (evacuationPath && evacuationPath.length > 0) {
        const points = [];
        evacuationPath.forEach(nodeId => {
          const node = hotelData.graph[nodeId];
          if (node && node.position) {
            let yOffset = HOTEL_CONFIG.roomHeight / 2;
            if (node.type === 'stairwell') yOffset += 0.5;
            points.push(new THREE.Vector3(node.position.x, node.position.y + yOffset, node.position.z));
          }
        });

        if (points.length > 1) {
          const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.1);
          const tubeGeom = new THREE.TubeGeometry(curve, points.length * 10, 0.25, 8, false);
          const pathColor = isRescueMode ? 0xff2d2d : 0x00ff88;
          const tubeMat = new THREE.MeshStandardMaterial({
            color: pathColor,
            emissive: pathColor,
            emissiveIntensity: 2.5,
            transparent: true,
            opacity: 0.9,
          });
          const tube = new THREE.Mesh(tubeGeom, tubeMat);
          sceneRef.current.add(tube);
          pathLineRef.current = tube;
        }
      }
    }
  }, [evacuationPath, isRescueMode]);

  // First person view transition
  useEffect(() => {
    if (!cameraRef.current || !controlsRef.current || !hotelData.graph) return;
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;

    if (viewMode === 'pov' && focusRoomId && hotelData.graph[focusRoomId]) {
      const room = hotelData.graph[focusRoomId];
      // Position camera inside the room
      cam.position.set(room.position.x, room.position.y + HOTEL_CONFIG.roomHeight / 2 + 1, room.position.z);
      // Look roughly towards the corridor (z=0) taking into account the room's x position
      ctrl.target.set(room.position.x, room.position.y + HOTEL_CONFIG.roomHeight / 2, 0);
      ctrl.minDistance = 0.1;
      ctrl.update();
    } else {
      // Map overview
      cam.position.set(30, 25, 40);
      ctrl.target.set(0, 12, 0);
      ctrl.minDistance = 15;
      ctrl.update();
    }
  }, [viewMode, focusRoomId]);

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const { width, height } = entry.contentRect;
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
      // Call the Three.js cleanup: removes event listeners, unsubscribes EventBus, stops animation
      if (mountRef.current?._cleanup) mountRef.current._cleanup();
      cancelAnimationFrame(animRef.current);
      if (mountRef.current) mountRef.current.innerHTML = '';
      rendererRef.current?.dispose();
      initializedRef.current = false;
    };
  }, []);

  // ── Pure decoration – zero impact on raycasting / room logic ──────
  function addEnvironment(scene) {
    // ── Ground plane ──────────────────────────────────────────────
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a2a1a, roughness: 0.95, metalness: 0 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.35;
    ground.receiveShadow = true;
    scene.add(ground);

    // ── Pavement / perimeter path ─────────────────────────────────
    const paveMat = new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.8 });
    // Front path (z positive side)
    const frontPath = new THREE.Mesh(new THREE.BoxGeometry(70, 0.12, 6), paveMat);
    frontPath.position.set(0, -0.3, 16);
    scene.add(frontPath);
    // Back path
    const backPath = new THREE.Mesh(new THREE.BoxGeometry(70, 0.12, 6), paveMat);
    backPath.position.set(0, -0.3, -16);
    scene.add(backPath);
    // Side paths
    const leftPath = new THREE.Mesh(new THREE.BoxGeometry(6, 0.12, 40), paveMat);
    leftPath.position.set(-36, -0.3, 0);
    scene.add(leftPath);
    const rightPath = new THREE.Mesh(new THREE.BoxGeometry(6, 0.12, 40), paveMat);
    rightPath.position.set(36, -0.3, 0);
    scene.add(rightPath);

    // ── Tree helper ───────────────────────────────────────────────
    function makeTree(x, z, height = 5, color = 0x2d6a2d) {
      const group = new THREE.Group();
      // Trunk
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.32, height * 0.38, 7),
        new THREE.MeshStandardMaterial({ color: 0x4a2f1a, roughness: 0.9 })
      );
      trunk.position.y = height * 0.19;
      trunk.castShadow = true;
      group.add(trunk);
      // Foliage – three stacked cones for depth
      const foliageMat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 });
      [[height * 0.55, height * 0.38, 0.9], [height * 0.7, height * 0.3, 0.75], [height * 0.88, height * 0.22, 0.55]].forEach(([y, h, r]) => {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(r * height * 0.18, h, 7), foliageMat);
        cone.position.y = y;
        cone.castShadow = true;
        group.add(cone);
      });
      group.position.set(x, -0.35, z);
      scene.add(group);
    }

    // Front row of trees
    for (let i = -3; i <= 3; i++) {
      makeTree(i * 9, 21, 5 + Math.random() * 2, i % 2 === 0 ? 0x2d7a2d : 0x1e5c1e);
    }
    // Back row
    for (let i = -3; i <= 3; i++) {
      makeTree(i * 9, -21, 5 + Math.random() * 2, i % 2 === 0 ? 0x26692a : 0x1a4a1a);
    }
    // Left & right clusters
    for (let i = -2; i <= 2; i++) {
      makeTree(-40, i * 9, 4 + Math.random() * 3, 0x2a6020);
      makeTree(40, i * 9, 4 + Math.random() * 3, 0x336a22);
    }
    // Corner accent trees
    [[-34, 19], [34, 19], [-34, -19], [34, -19]].forEach(([x, z]) => {
      makeTree(x, z, 6 + Math.random(), 0x245a24);
    });

    // ── Lamppost helper ───────────────────────────────────────────
    function makeLamppost(x, z) {
      const group = new THREE.Group();
      // Pole
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.12, 7, 6),
        new THREE.MeshStandardMaterial({ color: 0x2a2a3a, metalness: 0.7, roughness: 0.3 })
      );
      pole.position.y = 3.5;
      pole.castShadow = true;
      group.add(pole);
      // Arm
      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 1.2, 5),
        new THREE.MeshStandardMaterial({ color: 0x2a2a3a, metalness: 0.7 })
      );
      arm.rotation.z = Math.PI / 2;
      arm.position.set(0.6, 6.9, 0);
      group.add(arm);
      // Light globe
      const globe = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xfffde7, emissive: 0xffe57f, emissiveIntensity: 1.2, transparent: true, opacity: 0.92 })
      );
      globe.position.set(1.1, 6.9, 0);
      group.add(globe);
      group.position.set(x, -0.35, z);
      scene.add(group);
    }

    // Front & back lamp rows
    [-18, -9, 0, 9, 18].forEach(x => {
      makeLamppost(x, 13.5);
      makeLamppost(x, -13.5);
    });
    // Side lamps
    [-12, 0, 12].forEach(z => {
      makeLamppost(-33, z);
      makeLamppost(33, z);
    });

    // ── Bench helper ──────────────────────────────────────────────
    function makeBench(x, z, rotY = 0) {
      const group = new THREE.Group();
      const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.9 });
      const metalMat = new THREE.MeshStandardMaterial({ color: 0x3a3a4a, metalness: 0.6, roughness: 0.4 });
      // Seat
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.65), woodMat);
      seat.position.y = 0.5;
      group.add(seat);
      // Back
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 0.1), woodMat);
      back.position.set(0, 0.9, -0.28);
      group.add(back);
      // Legs
      [[-0.9, -0.28], [0.9, -0.28], [-0.9, 0.28], [0.9, 0.28]].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), metalMat);
        leg.position.set(lx, 0.25, lz);
        group.add(leg);
      });
      group.rotation.y = rotY;
      group.position.set(x, -0.35, z);
      scene.add(group);
    }

    makeBench(-12, 17, 0);
    makeBench(0,   17, 0);
    makeBench(12,  17, 0);
    makeBench(-12, -17, Math.PI);
    makeBench(0,   -17, Math.PI);
    makeBench(12,  -17, Math.PI);
    makeBench(-31, 6, Math.PI / 2);
    makeBench(-31, -6, Math.PI / 2);
    makeBench(31,  6, -Math.PI / 2);
    makeBench(31,  -6, -Math.PI / 2);

    // ── Distant skyline hints (simple box silhouettes) ────────────
    const skyMat = new THREE.MeshStandardMaterial({ color: 0x12121e, roughness: 1 });
    [
      [-70, 8, -60], [-55, 12, -65], [-80, 6, -50],
      [70, 10, -60], [58, 7, -65], [82, 14, -55],
      [-65, 5, 60],  [65, 9, 60],
    ].forEach(([bx, bh, bz]) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(6 + Math.random() * 4, bh, 6 + Math.random() * 4), skyMat);
      b.position.set(bx, bh / 2 - 0.35, bz);
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

    // WebGL renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // CSS2D label renderer
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(W, H);
    labelRenderer.domElement.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
    mount.appendChild(labelRenderer.domElement);
    labelRendererRef.current = labelRenderer;

    // Orbit controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 15;
    controls.maxDistance = 120;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.target.set(0, 12, 0);
    controls.update();
    controlsRef.current = controls;

    // Lighting
    scene.add(new THREE.AmbientLight(0x8899bb, 4));
    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.position.set(25, 40, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xaabbcc, 1.5);
    fill.position.set(-20, 10, -20);
    scene.add(fill);

// Grid
    const grid = new THREE.GridHelper(100, 50, 0x444466, 0x222244);
    grid.position.y = -0.3;
    scene.add(grid);

    // ── Build Hotel ────────────────────────────────────────────────
    Object.values(hotelData.graph).forEach(node => {
      if (node.type === 'guest') {
        // Main room box
        const geom = new THREE.BoxGeometry(rW - 0.15, rH - 0.1, rD - 0.15);
        const mat = new THREE.MeshStandardMaterial({
          color: STATUS_COLORS.clear.color,
          emissive: STATUS_COLORS.clear.emissive,
          emissiveIntensity: 0,
          transparent: true,
          opacity: 0.82,
          roughness: 0.25,
          metalness: 0.6,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(node.position.x, node.position.y + rH / 2, node.position.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { roomId: node.roomId, room: node };
        scene.add(mesh);
        roomMeshes.current[node.roomId] = mesh;

        // Edge wireframe
        const edges = new THREE.EdgesGeometry(geom);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x5a5aaa, transparent: true, opacity: 0.7 });
        mesh.add(new THREE.LineSegments(edges, lineMat));

        // Room number label
        if (node.floor <= 3) {
          const el = document.createElement('div');
          el.textContent = node.displayName;
          el.style.cssText = 'color:rgba(140,140,200,0.55);font-size:8px;font-family:JetBrains Mono,monospace;white-space:nowrap;';
          const obj = new CSS2DObject(el);
          obj.position.set(0, rH / 2 + 0.1, 0);
          mesh.add(obj);
        }
      } else if (node.type === 'stairwell') {
        // Build detailed individual stairs
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x181825, roughness: 0.8 });
        
        const numSteps = 10;
        const stepW = 2.8;
        const stepH = floorSpacing / numSteps;
        const stepD = 3.6 / numSteps;

        for(let i = 0; i < numSteps; i++) {
          const stepGeom = new THREE.BoxGeometry(stepW, stepH, stepD);
          const step = new THREE.Mesh(stepGeom, mat);
          
          // Slope the stairs upwards and inwards relative to the stairwell block
          const localY = (i * stepH) + stepH / 2;
          const localZ = -1.8 + (i * stepD) + stepD / 2;
          step.position.set(0, localY, localZ);
          group.add(step);
        }

        group.position.set(node.position.x, node.position.y, node.position.z);
        scene.add(group);

      } else if (node.type === 'exit') {
        const geom = new THREE.BoxGeometry(3, rH, 1);
        const mat = new THREE.MeshStandardMaterial({ color: 0x00ff88, emissive: 0x008844, emissiveIntensity: 0.5, transparent: true, opacity: 0.8 });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(node.position.x, node.position.y + rH / 2 + 0.5, node.position.z); // offset to attach properly
        scene.add(mesh);
      }
    });

    // Floor slabs
    for (let f = 1; f <= 8; f++) {
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(52, 0.18, 20),
        new THREE.MeshStandardMaterial({ color: 0x0c0c20, roughness: 0.9 })
      );
      slab.position.set(0, (f - 1) * floorSpacing - 0.12, 0);
      slab.receiveShadow = true;
      scene.add(slab);

      // Floor label
      const fl = document.createElement('div');
      fl.textContent = `FLOOR ${f}`;
      fl.style.cssText = 'color:rgba(80,80,140,0.9);font-size:10px;font-weight:700;font-family:JetBrains Mono,monospace;letter-spacing:2px;';
      const flObj = new CSS2DObject(fl);
      flObj.position.set(-30, (f - 1) * floorSpacing + 1, 0);
      scene.add(flObj);
    }

    // ── Environment (decorative only, never in meshList) ───────────
    addEnvironment(scene);

    // ── Raycaster ──────────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const meshList = Object.values(roomMeshes.current);

    function getMouseNDC(e) {
      const rect = mount.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function onMove(e) {
      getMouseNDC(e);
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(meshList);
      if (hits.length > 0) {
        setHoveredRoom(hits[0].object.userData.roomId);
        mount.style.cursor = 'pointer';
      } else {
        setHoveredRoom(null);
        mount.style.cursor = 'default';
      }
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
    renderer.domElement.addEventListener('click', onClick);

    // ── Fire particles ─────────────────────────────────────────────
    function addFireParticles(roomId) {
      if (particleSystems.current[roomId]) return;
      const pos = roomMeshes.current[roomId]?.position;
      if (!pos) return;
      const count = 100;
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
      const ps = new THREE.Points(geom, new THREE.PointsMaterial({ color: 0xff5500, size: 0.22, transparent: true, opacity: 0.85 }));
      ps.userData = { velocities, basePos: pos.clone(), rW, rH, rD };
      scene.add(ps);
      particleSystems.current[roomId] = ps;
    }

    function removeFireParticles(roomId) {
      const ps = particleSystems.current[roomId];
      if (!ps) return;
      scene.remove(ps);
      ps.geometry.dispose();
      delete particleSystems.current[roomId];
    }

    // ── Room status subscription ───────────────────────────────────
    const unsubStatus = bus.on('room:statusChange', ({ roomId, status }) => {
      const mesh = roomMeshes.current[roomId];
      if (!mesh) return;
      const cfg = STATUS_COLORS[status] || STATUS_COLORS.clear;
      mesh.material.color.setHex(cfg.color);
      mesh.material.emissive.setHex(cfg.emissive);
      mesh.material.emissiveIntensity = cfg.intensity;
      status === 'fire' ? addFireParticles(roomId) : removeFireParticles(roomId);
      setRoomStatuses(prev => ({ ...prev, [roomId]: status }));
    });

    // ── Animate ────────────────────────────────────────────────────
    let tick = 0;
    function animate() {
      animRef.current = requestAnimationFrame(animate);
      tick++;
      controls.update();

      // Pulsing emissive for fire/smoke rooms
      Object.values(roomMeshes.current).forEach(mesh => {
        const ei = mesh.material.emissiveIntensity;
        if (ei > 0.3) {
          mesh.material.emissiveIntensity = ei * 0.97 + (0.4 + 0.5 * Math.sin(tick * 0.07)) * 0.03 * (ei > 0.5 ? 1 : 0.5);
        }
      });

      // Animate particles
      Object.values(particleSystems.current).forEach(ps => {
        const pos = ps.geometry.attributes.position.array;
        const { velocities, basePos, rW, rH, rD } = ps.userData;
        velocities.forEach((v, i) => {
          pos[i * 3]     += v.vx;
          pos[i * 3 + 1] += v.vy;
          pos[i * 3 + 2] += v.vz;
          v.life += 0.012;
          if (v.life > 1) {
            pos[i * 3]     = basePos.x + (Math.random() - 0.5) * rW;
            pos[i * 3 + 1] = basePos.y + rH / 2;
            pos[i * 3 + 2] = basePos.z + (Math.random() - 0.5) * rD;
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

    // Cleanup function stored for later
    mountRef.current._cleanup = () => {
      renderer.domElement.removeEventListener('mousemove', onMove);
      renderer.domElement.removeEventListener('click', onClick);
      unsubStatus();
      cancelAnimationFrame(animRef.current);
      renderer.dispose();
    };
  }

  const fireCount = Object.values(roomStatuses).filter(s => s === 'fire').length;
  const smokeCount = Object.values(roomStatuses).filter(s => s === 'smoke').length;

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', background: '#0a0a0f' }}>
      {/* Three.js render target */}
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Legend */}
      {!isGuest && (
      <div className="hotel-legend">
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, letterSpacing: 1.5, textTransform: 'uppercase' }}>Status</div>
        {[
          { label: 'Clear',     color: '#1e1e3a', border: '#2a2a5e' },
          { label: 'Smoke',     color: '#ff6b1a' },
          { label: 'Fire',      color: '#ff2d2d' },
          { label: 'Audio',     color: '#ffd700' },
          { label: 'Evacuated', color: '#00ff88' },
        ].map(l => (
          <div key={l.label} className="legend-item">
            <div className="legend-dot" style={{ background: l.color, border: l.border ? `1px solid ${l.border}` : 'none', boxShadow: l.border ? 'none' : `0 0 6px ${l.color}` }} />
            <span>{l.label}</span>
          </div>
        ))}
      </div>
      )}

      {/* Stats panel */}
      {!isGuest && (
      <div className="hotel-info-panel">
        <div className="hotel-info-title">🏨 Hotel Overview</div>
        <div className="hotel-stats">
          <div className="hotel-stat"><span>Total Rooms</span><span className="hotel-stat-val mono">96</span></div>
          <div className="hotel-stat">
            <span>🔥 On Fire</span>
            <span className="hotel-stat-val mono" style={{ color: fireCount > 0 ? 'var(--fire-red)' : 'var(--text-secondary)' }}>{fireCount}</span>
          </div>
          <div className="hotel-stat">
            <span>💨 Smoke</span>
            <span className="hotel-stat-val mono" style={{ color: smokeCount > 0 ? 'var(--smoke-orange)' : 'var(--text-secondary)' }}>{smokeCount}</span>
          </div>
          <div className="hotel-stat">
            <span>✅ Clear</span>
            <span className="hotel-stat-val mono" style={{ color: 'var(--safe-green)' }}>{96 - fireCount - smokeCount}</span>
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
