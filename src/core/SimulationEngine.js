import bus from './EventBus.js';

// Fire spread simulation: once a room catches fire, neighbors spread over time
const SPREAD_INTERVAL = 8000; // ms per spread step
const SPREAD_CHANCE = 0.35;   // 35% chance each step

let spreadTimers = {};

export function triggerFireInRoom(roomId, hotelRooms) {
  bus.emit('detection:raw', {
    type: 'fire',
    confidence: 0.96,
    roomId,
    floor: parseInt(roomId[0]),
    timestamp: new Date().toISOString(),
  });
  scheduleSpread(roomId, hotelRooms);
}

function scheduleSpread(roomId, hotelRooms) {
  if (spreadTimers[roomId]) return; // already spreading
  spreadTimers[roomId] = setTimeout(() => {
    const room = hotelRooms[roomId];
    if (!room) return;
    room.adjacentRooms.forEach(neighborId => {
      if (hotelRooms[neighborId] && hotelRooms[neighborId].status !== 'fire' && Math.random() < SPREAD_CHANCE) {
        // First show as smoke, then fire
        bus.emit('detection:raw', {
          type: 'smoke',
          confidence: 0.88,
          roomId: neighborId,
          floor: parseInt(neighborId[0]),
          timestamp: new Date().toISOString(),
        });
        setTimeout(() => {
          triggerFireInRoom(neighborId, hotelRooms);
        }, 4000);
      }
    });
    delete spreadTimers[roomId];
  }, SPREAD_INTERVAL);
}

export function stopSpread() {
  Object.values(spreadTimers).forEach(t => clearTimeout(t));
  spreadTimers = {};
}
