// Hotel: 8 floors × 12 rooms = 96 rooms
// Room numbering: floor*100 + room (e.g., 101-112, 201-212, ... 801-812)
// Layout per floor: 6 rooms LEFT corridor (01-06) + 6 rooms RIGHT corridor (07-12)
//                   + 2 staircases (one each end) + 1 elevator (centre)

export const HOTEL_CONFIG = {
  floors:        8,
  roomsPerFloor: 12,
  roomWidth:     4,
  roomDepth:     5,
  roomHeight:    3.2,
  corridorWidth: 2.5,
  floorSpacing:  3.5,
};

// ── Utility ──────────────────────────────────────────────────────────────────
const pad = n => String(n).padStart(2, '0');

// ── Spatial helpers (also used by server.js) ─────────────────────────────────

/**
 * Returns same-floor horizontal neighbors only.
 * Left corridor  (01-06): neighbors within [01, 06]
 * Right corridor (07-12): neighbors within [07, 12]
 */
export function getSameFloorNeighbors(roomId) {
  const roomStr = String(roomId);
  if (roomStr.startsWith('STAIR') || roomStr.startsWith('EXIT')) return [];

  const floor   = parseInt(roomStr.slice(0, -2), 10);
  const roomNum = parseInt(roomStr.slice(-2),    10);
  if (isNaN(floor) || isNaN(roomNum)) return [];

  const p = n => `${floor}${String(n).padStart(2, '0')}`;
  const neighbors = [];

  if (roomNum >= 1 && roomNum <= 6) {
    if (roomNum > 1) neighbors.push(p(roomNum - 1));
    if (roomNum < 6) neighbors.push(p(roomNum + 1));
  } else if (roomNum >= 7 && roomNum <= 12) {
    if (roomNum > 7)  neighbors.push(p(roomNum - 1));
    if (roomNum < 12) neighbors.push(p(roomNum + 1));
  }
  return neighbors;
}

/**
 * Returns rooms directly above and below (same room number, adjacent floors).
 */
export function getVerticalNeighbors(roomId, maxFloors = 8) {
  const roomStr = String(roomId);
  if (roomStr.startsWith('STAIR') || roomStr.startsWith('EXIT')) return [];

  const floor   = parseInt(roomStr.slice(0, -2), 10);
  const roomNum = parseInt(roomStr.slice(-2),    10);
  if (isNaN(floor) || isNaN(roomNum)) return [];

  const p = (f, n) => `${f}${String(n).padStart(2, '0')}`;
  const neighbors = [];
  if (floor > 1)         neighbors.push(p(floor - 1, roomNum));
  if (floor < maxFloors) neighbors.push(p(floor + 1, roomNum));
  return neighbors;
}

/**
 * Full first-ring neighbors (horizontal + vertical).
 */
export function getFirstRingNeighbors(roomId) {
  return [
    ...getSameFloorNeighbors(roomId),
    ...getVerticalNeighbors(roomId),
  ];
}

/**
 * Second-ring: neighbors of first-ring, excluding the origin and first-ring itself.
 */
export function getSecondRingNeighbors(roomId) {
  const id = String(roomId);
  const firstRing = new Set(getFirstRingNeighbors(id));
  firstRing.add(id);

  const second = new Set();
  firstRing.forEach(n => {
    if (n === id) return;
    getFirstRingNeighbors(n).forEach(nn => {
      if (!firstRing.has(nn) && nn !== id) second.add(nn);
    });
  });
  return [...second];
}

// ── Hotel graph generation ────────────────────────────────────────────────────

export function generateHotelData() {
  const rooms        = {};
  const floors       = {};
  const specialNodes = {};

  const {
    roomWidth: rW, roomDepth: rD, roomHeight: rH,
    corridorWidth: cW, floorSpacing,
  } = HOTEL_CONFIG;

  // ── 1. Rooms ─────────────────────────────────────────────────────────────
  for (let f = 1; f <= HOTEL_CONFIG.floors; f++) {
    floors[f] = { floorNumber: f, rooms: [], status: 'clear' };

    for (let r = 1; r <= 12; r++) {
      const roomId = `${f}${pad(r)}`;
      const col  = r <= 6 ? (r - 1) : (r - 7);
      const side = r <= 6 ? -1 : 1;

      const pos = {
        x: (col - 2.5) * (rW + 0.3),
        y: (f - 1) * floorSpacing,
        z: side * (rD + cW / 2),
      };

      const adjacent = [];

      if (r >= 1 && r <= 6) {
        if (r > 1) adjacent.push(`${f}${pad(r - 1)}`);
        if (r < 6) adjacent.push(`${f}${pad(r + 1)}`);
      } else {
        if (r > 7)  adjacent.push(`${f}${pad(r - 1)}`);
        if (r < 12) adjacent.push(`${f}${pad(r + 1)}`);
      }

      // Staircase connections at corridor ends
      if (r === 1)  adjacent.push(`STAIR_${f}_L`);
      if (r === 7)  adjacent.push(`STAIR_${f}_L`);
      if (r === 6)  adjacent.push(`STAIR_${f}_R`);
      if (r === 12) adjacent.push(`STAIR_${f}_R`);

      rooms[roomId] = {
        roomId,
        floor:         f,
        number:        r,
        displayName:   roomId,
        type:          'guest',
        position:      pos,
        size:          { w: rW, h: rH, d: rD },
        status:        'clear',
        adjacentRooms: adjacent,
      };

      floors[f].rooms.push(roomId);
    }
  }

  // ── 2. Stairwells ─────────────────────────────────────────────────────────
  for (let f = 1; f <= HOTEL_CONFIG.floors; f++) {
    const stairL = `STAIR_${f}_L`;
    specialNodes[stairL] = {
      roomId:   stairL,
      type:     'stairwell',
      side:     'left',
      floor:    f,
      position: { x: -3.5 * (rW + 0.3), y: (f - 1) * floorSpacing, z: 0 },
      adjacentRooms: [`${f}${pad(1)}`, `${f}${pad(7)}`],
    };
    if (f > 1)                      specialNodes[stairL].adjacentRooms.push(`STAIR_${f - 1}_L`);
    if (f < HOTEL_CONFIG.floors)    specialNodes[stairL].adjacentRooms.push(`STAIR_${f + 1}_L`);

    const stairR = `STAIR_${f}_R`;
    specialNodes[stairR] = {
      roomId:   stairR,
      type:     'stairwell',
      side:     'right',
      floor:    f,
      position: { x: 3.5 * (rW + 0.3), y: (f - 1) * floorSpacing, z: 0 },
      adjacentRooms: [`${f}${pad(6)}`, `${f}${pad(12)}`],
    };
    if (f > 1)                      specialNodes[stairR].adjacentRooms.push(`STAIR_${f - 1}_R`);
    if (f < HOTEL_CONFIG.floors)    specialNodes[stairR].adjacentRooms.push(`STAIR_${f + 1}_R`);
  }

  // ── 3. Ground-floor exits ─────────────────────────────────────────────────
  const exits = {
    EXIT_LEFT: {
      roomId:        'EXIT_LEFT',
      type:          'exit',
      position:      { x: -3.5 * (rW + 0.3) - 2, y: 0, z: 0 },
      adjacentRooms: ['STAIR_1_L'],
    },
    EXIT_RIGHT: {
      roomId:        'EXIT_RIGHT',
      type:          'exit',
      position:      { x: 3.5 * (rW + 0.3) + 2, y: 0, z: 0 },
      adjacentRooms: ['STAIR_1_R'],
    },
  };

  specialNodes['STAIR_1_L'].adjacentRooms.push('EXIT_LEFT');
  specialNodes['STAIR_1_R'].adjacentRooms.push('EXIT_RIGHT');
  Object.assign(specialNodes, exits);

  const graph = { ...rooms, ...specialNodes };
  return { rooms, floors, specialNodes, graph };
}

export const hotelData = generateHotelData();

// ── Hazard cost table ─────────────────────────────────────────────────────────
//
// FIRE   → Infinity  : completely impassable; Dijkstra skips these edges entirely.
// SMOKE  → high cost : strongly avoided; traversable only if no other route exists.
// BUFFER → medium    : mildly avoided.
// ─────────────────────────────────────────────────────────────────────────────
const HAZARD_COST = {
  fire:   Infinity,
  smoke:  500,
  buffer: 80,
};

// ── Stairwell danger inference ────────────────────────────────────────────────
//
// Stairwell nodes (STAIR_F_L / STAIR_F_R) are never directly in roomHazards
// because the server only tracks guest rooms. But a stairwell is dangerous
// when ANY of its guest-room neighbors on the same floor are on fire.
//
// This function builds a synthetic hazard map that includes stairwells,
// without mutating the original roomHazards object.
//
// A stairwell gets:
//   'fire'  if any adjacent guest room on that floor is on fire
//   'smoke' if any adjacent guest room on that floor has smoke (and no fire)
//
// This ensures Dijkstra avoids routing guests through a burning stairwell
// entrance even when the fire room itself is not on the direct path.
// ─────────────────────────────────────────────────────────────────────────────
function buildAugmentedHazards(roomHazards) {
  const { graph } = hotelData;
  const augmented = { ...roomHazards };

  Object.keys(graph).forEach(nodeId => {
    const node = graph[nodeId];
    if (node.type !== 'stairwell') return;

    let worstType = null;

    for (const neighborId of (node.adjacentRooms || [])) {
      const neighbor = graph[neighborId];
      // Only look at guest rooms on the same floor as this stairwell node
      if (!neighbor || neighbor.type !== 'guest') continue;
      if (neighbor.floor !== node.floor) continue;

      const h = roomHazards[neighborId];
      if (!h) continue;

      if (h.type === 'fire') {
        worstType = 'fire';
        break; // fire is worst — no need to check further
      }
      if (h.type === 'smoke' && worstType !== 'fire') {
        worstType = 'smoke';
      }
    }

    if (worstType) {
      // Only add/upgrade — never downgrade an existing stairwell hazard
      const existing = augmented[nodeId];
      const existingSeverity = existing?.type === 'fire' ? 2 : existing?.type === 'smoke' ? 1 : 0;
      const newSeverity      = worstType === 'fire' ? 2 : 1;
      if (newSeverity > existingSeverity) {
        augmented[nodeId] = {
          type:      worstType,
          intensity: worstType === 'fire' ? 1.0 : 0.7,
        };
      }
    }
  });

  return augmented;
}

/**
 * Hazard-aware Dijkstra.
 *
 * Key behaviour:
 *   - Fire nodes are NEVER entered (the edge to them is skipped, not just costly).
 *   - Smoke nodes have a high but finite cost scaled by intensity.
 *   - The start node is never penalised (you're already there).
 *   - Stairwell danger is inferred from adjacent guest-room hazards via
 *     buildAugmentedHazards(), so a burning stairwell entrance is avoided
 *     even though stairwells are not tracked in the server's roomHazards map.
 *
 * @param {string}   startId
 * @param {function} goalFn        (nodeId, node) → boolean
 * @param {Object}   roomHazards   { [roomId]: { type, intensity } }
 * @returns {string[]} path from start to goal, or []
 */
function dijkstra(startId, goalFn, roomHazards = {}) {
  const { graph } = hotelData;
  if (!graph[startId]) return [];

  // Support legacy plain-array hazard format
  if (Array.isArray(roomHazards)) {
    const converted = {};
    roomHazards.forEach(id => {
      converted[String(id)] = { type: 'fire', intensity: 1.0 };
    });
    roomHazards = converted;
  }

  // ── Augment hazards to include inferred stairwell danger ──────────────
  const hazards = buildAugmentedHazards(roomHazards);

  const dist     = {};
  const previous = {};
  const visited  = new Set();

  Object.keys(graph).forEach(id => { dist[id] = Infinity; });
  dist[startId] = 0;

  const queue = new Set(Object.keys(graph));

  while (queue.size > 0) {
    // Pick the unvisited node with the smallest tentative distance
    let current = null;
    let minDist = Infinity;
    queue.forEach(id => {
      if (dist[id] < minDist) { minDist = dist[id]; current = id; }
    });

    if (current === null || dist[current] === Infinity) break;

    queue.delete(current);
    visited.add(current);

    const node = graph[current];
    if (!node) continue;

    if (goalFn(current, node)) {
      // Reconstruct path
      const path = [current];
      let c = current;
      while (previous[c]) { path.unshift(previous[c]); c = previous[c]; }
      return path;
    }

    for (const neighborId of (node.adjacentRooms || [])) {
      if (visited.has(neighborId)) continue;

      const hazard = hazards[neighborId];

      // ── Fire (real or inferred on stairwell): completely impassable ────
      if (hazard && hazard.type === 'fire') continue;

      let weight = 1;

      if (hazard) {
        if (hazard.type === 'smoke') {
          const intensity = hazard.intensity ?? 1.0;
          weight = 1 + Math.round(intensity * (HAZARD_COST.smoke - 1));
        } else if (hazard.type === 'buffer') {
          weight = HAZARD_COST.buffer;
        }
      }

      const alt = dist[current] + weight;
      if (alt < dist[neighborId]) {
        dist[neighborId]     = alt;
        previous[neighborId] = current;
      }
    }
  }

  return [];
}

/**
 * Evacuation pathfinding: guest room → nearest safe exit.
 *
 * Dijkstra automatically reroutes to the alternate staircase when the primary
 * path is blocked by fire — including when the stairwell entrance itself is
 * adjacent to a fire room (inferred via buildAugmentedHazards).
 *
 * @param {string} startRoomId
 * @param {Object} roomHazards  { [roomId]: { type, intensity } }
 * @returns {string[]} evacuation path
 */
export function findEvacuationPath(startRoomId, roomHazards = {}) {
  return dijkstra(
    String(startRoomId),
    (_id, node) => node.type === 'exit',
    roomHazards,
  );
}

/**
 * Rescue pathfinding: entry point → target room.
 *
 * @param {string} targetRoomId
 * @param {string} [entryPointId='EXIT_LEFT']
 * @param {Object} roomHazards
 * @returns {string[]} rescue path
 */
export function findRescuePath(targetRoomId, entryPointId = 'EXIT_LEFT', roomHazards = {}) {
  const { graph } = hotelData;
  if (!graph[String(targetRoomId)]) return [];
  if (!graph[String(entryPointId)]) entryPointId = 'EXIT_LEFT';

  return dijkstra(
    String(entryPointId),
    (id) => id === String(targetRoomId),
    roomHazards,
  );
}