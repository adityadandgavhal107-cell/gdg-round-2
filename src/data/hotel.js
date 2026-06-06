// Hotel: 8 floors × 12 rooms = 96 rooms
// Room numbering: floor*100 + room (e.g., 101-112, 201-212, ... 801-812)
// Layout per floor: 6 rooms left corridor, 6 rooms right corridor, 2 staircases, 1 elevator

export const HOTEL_CONFIG = {
  floors: 8,
  roomsPerFloor: 12,
  roomWidth: 4,
  roomDepth: 5,
  roomHeight: 3.2,
  corridorWidth: 2.5,
  floorSpacing: 3.5,
};

// Generate all rooms
export function generateHotelData() {
  const rooms = {};
  const floors = {};
  const specialNodes = {};

  const { roomWidth: rW, roomDepth: rD, roomHeight: rH, corridorWidth: cW, floorSpacing } = HOTEL_CONFIG;

  // 1. Generate Rooms
  for (let f = 1; f <= HOTEL_CONFIG.floors; f++) {
    floors[f] = { floorNumber: f, rooms: [], status: 'clear' };

    for (let r = 1; r <= 12; r++) {
      const roomId = `${f}${r < 10 ? '0' + r : r}`;
      const col = (r - 1) % 6;
      const side = r <= 6 ? -1 : 1;

      const pos = {
        x: (col - 2.5) * (rW + 0.3),
        y: (f - 1) * floorSpacing,
        z: side * (rD + cW / 2),
      };

      // Adjacent rooms (same floor horizontal neighbors)
      const adjacent = [];
      if (r > 1 && r <= 6) adjacent.push(`${f}${(r - 1) < 10 ? '0' + (r - 1) : (r - 1)}`);
      if (r < 6) adjacent.push(`${f}${(r + 1) < 10 ? '0' + (r + 1) : (r + 1)}`);
      if (r > 7) adjacent.push(`${f}${(r - 1) < 10 ? '0' + (r - 1) : (r - 1)}`);
      if (r < 12) adjacent.push(`${f}${(r + 1) < 10 ? '0' + (r + 1) : (r + 1)}`);

      // Staircase access points logic:
      // Rooms at ends (col 0 and col 5) connect to stairs
      if (col === 0) adjacent.push(`STAIR_${f}_L`);
      if (col === 5) adjacent.push(`STAIR_${f}_R`);

      rooms[roomId] = {
        roomId,
        floor: f,
        number: r,
        displayName: `${f}${r < 10 ? '0' + r : r}`,
        type: 'guest',
        position: pos,
        size: { w: rW, h: rH, d: rD },
        status: 'clear',
        adjacentRooms: adjacent,
      };
      
      floors[f].rooms.push(roomId);
    }
  }

  // 2. Generate Stairs
  for (let f = 1; f <= HOTEL_CONFIG.floors; f++) {
    // Left stair
    const stairL = `STAIR_${f}_L`;
    specialNodes[stairL] = {
      roomId: stairL,
      type: 'stairwell',
      floor: f,
      position: { x: -3.5 * (rW + 0.3), y: (f - 1) * floorSpacing, z: 0 },
      adjacentRooms: [
        `${f}01`, `${f}07` // connects to first rooms on left side
      ]
    };
    if (f > 1) specialNodes[stairL].adjacentRooms.push(`STAIR_${f - 1}_L`);
    if (f < HOTEL_CONFIG.floors) specialNodes[stairL].adjacentRooms.push(`STAIR_${f + 1}_L`);
    
    // Right stair
    const stairR = `STAIR_${f}_R`;
    specialNodes[stairR] = {
      roomId: stairR,
      type: 'stairwell',
      floor: f,
      position: { x: 3.5 * (rW + 0.3), y: (f - 1) * floorSpacing, z: 0 },
      adjacentRooms: [
        `${f}06`, `${f}12` // connects to last rooms on right side
      ]
    };
    if (f > 1) specialNodes[stairR].adjacentRooms.push(`STAIR_${f - 1}_R`);
    if (f < HOTEL_CONFIG.floors) specialNodes[stairR].adjacentRooms.push(`STAIR_${f + 1}_R`);
  }

  // 3. Generate Exits on Ground (Floor 1)
  const exits = {
    'EXIT_LEFT':  { roomId: 'EXIT_LEFT',  type: 'exit', position: { x: -3.5 * (rW + 0.3) - 2, y: 0, z: 0 }, adjacentRooms: ['STAIR_1_L'] },
    'EXIT_RIGHT': { roomId: 'EXIT_RIGHT', type: 'exit', position: { x:  3.5 * (rW + 0.3) + 2, y: 0, z: 0 }, adjacentRooms: ['STAIR_1_R'] },
  };

  // Bidirectional connections for Exits -> Ground Stairs
  specialNodes['STAIR_1_L'].adjacentRooms.push('EXIT_LEFT');
  specialNodes['STAIR_1_R'].adjacentRooms.push('EXIT_RIGHT');

  Object.assign(specialNodes, exits);

  // Merge nodes into single graph dictionary for easy lookup
  const graph = { ...rooms, ...specialNodes };

  return { rooms, floors, specialNodes, graph };
}

export const hotelData = generateHotelData();

// Pathfinding: Dijkstra/BFS to find shortest path from roomId to nearest exit
export function findEvacuationPath(startRoomId, blockedRooms = []) {
  const { graph } = hotelData;
  if (!graph[startRoomId]) return [];
  
  const queue = [[startRoomId, [startRoomId]]];
  const visited = new Set([startRoomId]);

  while (queue.length > 0) {
    const [current, path] = queue.shift();
    const node = graph[current];
    if (!node) continue;

    for (const neighbor of (node.adjacentRooms || [])) {
      if (visited.has(neighbor) || blockedRooms.includes(neighbor)) continue;
      
      const newPath = [...path, neighbor];
      const neighborNode = graph[neighbor];
      
      if (neighborNode && neighborNode.type === 'exit') {
        return newPath; // Found shortest path to an exit
      }
      
      visited.add(neighbor);
      queue.push([neighbor, newPath]);
    }
  }
  return []; // no path found
}

// Rescue Pathfinding: Dijkstra/BFS to find shortest path from an Entry point to a Target Room
export function findRescuePath(targetRoomId, entryPointId = 'EXIT_LEFT', blockedRooms = []) {
  const { graph } = hotelData;
  if (!graph[targetRoomId]) return [];
  if (!graph[entryPointId]) entryPointId = 'EXIT_LEFT';
  
  const queue = [[entryPointId, [entryPointId]]];
  const visited = new Set([entryPointId]);

  while (queue.length > 0) {
    const [current, path] = queue.shift();
    const node = graph[current];
    if (!node) continue;

    for (const neighbor of (node.adjacentRooms || [])) {
      if (visited.has(neighbor) || blockedRooms.includes(neighbor)) continue;
      
      const newPath = [...path, neighbor];
      if (neighbor === targetRoomId) {
        return newPath; 
      }
      
      visited.add(neighbor);
      queue.push([neighbor, newPath]);
    }
  }
  return []; // no path found
}
