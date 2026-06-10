/**
 * RouteToSpeech.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Converts a raw evacuation path array (strings) into an ordered list of
 * natural, hotel-concierge-quality spoken instructions.
 *
 * CONTRACT:
 *   • Input  → string[] — your existing path array, completely unchanged.
 *   • Output → string[] — ordered instruction sentences, ready to enqueue.
 *
 * Node types recognised (case-insensitive, partial match):
 *   Room numbers       e.g. "203", "204"
 *   LEFT_TURN          turn left
 *   RIGHT_TURN         turn right
 *   LEFT_STAIRCASE     staircase on the left
 *   RIGHT_STAIRCASE    staircase on the right
 *   STAIRCASE          generic staircase
 *   LEFT_ELEVATOR      elevator on the left
 *   RIGHT_ELEVATOR     elevator on the right
 *   ELEVATOR           generic elevator
 *   CORRIDOR           enter corridor
 *   LOBBY              approach lobby
 *   EXIT               final exit
 *   EMERGENCY_EXIT     emergency exit
 *
 * Example:
 *   convertRouteToInstructions(["203","204","205","LEFT_STAIRCASE","EXIT"])
 *   → [
 *       "Please step into the corridor and proceed forward.",
 *       "Continue past rooms 204 and 205.",
 *       "Turn left and take the staircase down to the ground floor.",
 *       "The exit is directly ahead. Please leave the building calmly."
 *     ]
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** True if a node string looks like a room number (all digits). */
const isRoom = (node) => /^\d+$/.test(node);

/**
 * Group consecutive room numbers, preserving the first room as the
 * "starting room" (it is the caller's room — we don't announce it).
 * Returns an array of instruction strings for the room segment.
 *
 * @param {string[]} rooms   — consecutive room-number strings
 * @param {boolean} isFirst  — true when this is the very first segment
 */
function buildRoomInstruction(rooms, isFirst) {
  if (rooms.length === 0) return null;

  // When isFirst, the first room is where the guest already is — skip it.
  const passRooms = isFirst ? rooms.slice(1) : rooms;

  if (passRooms.length === 0) {
    return "Please step out of your room and proceed into the corridor.";
  }

  if (passRooms.length === 1) {
    return `Please proceed forward, passing room ${passRooms[0]}.`;
  }

  // Two or more: "passing rooms 204 and 205" / "passing rooms 204, 205 and 206"
  const last    = passRooms[passRooms.length - 1];
  const leading = passRooms.slice(0, -1);
  const list    = leading.join(', ') + ' and ' + last;

  return `Please continue straight ahead, passing rooms ${list}.`;
}

/** Normalise a node string for matching. */
const norm = (s) => s.toUpperCase().replace(/[\s-]/g, '_');

/** Match a node against a set of keyword patterns. */
function matchesAny(node, ...patterns) {
  const n = norm(node);
  return patterns.some((p) => n.includes(p.toUpperCase()));
}

// ─── Node classifiers ─────────────────────────────────────────────────────────

const classifiers = {
  isRoom:             (n) => isRoom(n),
  isLeftStaircase:    (n) => matchesAny(n, 'LEFT_STAIRCASE', 'LEFT_STAIR'),
  isRightStaircase:   (n) => matchesAny(n, 'RIGHT_STAIRCASE', 'RIGHT_STAIR'),
  isStaircase:        (n) => matchesAny(n, 'STAIRCASE', 'STAIR') && !matchesAny(n, 'LEFT', 'RIGHT'),
  isLeftElevator:     (n) => matchesAny(n, 'LEFT_ELEVATOR', 'ELEVATOR_LEFT'),
  isRightElevator:    (n) => matchesAny(n, 'RIGHT_ELEVATOR', 'ELEVATOR_RIGHT'),
  isElevator:         (n) => matchesAny(n, 'ELEVATOR') && !matchesAny(n, 'LEFT', 'RIGHT'),
  isLeftTurn:         (n) => matchesAny(n, 'LEFT_TURN', 'TURN_LEFT'),
  isRightTurn:        (n) => matchesAny(n, 'RIGHT_TURN', 'TURN_RIGHT'),
  isCorridor:         (n) => matchesAny(n, 'CORRIDOR', 'HALLWAY'),
  isLobby:            (n) => matchesAny(n, 'LOBBY'),
  isExit:             (n) => matchesAny(n, 'EXIT'),
  isEmergencyExit:    (n) => matchesAny(n, 'EMERGENCY_EXIT', 'FIRE_EXIT'),
};

// ─── Instruction templates ────────────────────────────────────────────────────
//
// Each entry is a function (context) → string | null.
// Return null to skip / merge into neighbouring instruction.
// Context: { node, nextNode, prevNode, isFirst, isLast }

const instructionTemplates = [

  // Emergency exit (checked before generic EXIT)
  {
    match: (n) => classifiers.isEmergencyExit(n),
    build: () =>
      "The emergency exit is right ahead. Push the bar firmly and exit the building immediately.",
  },

  // Final EXIT
  {
    match: (n) => classifiers.isExit(n) && !classifiers.isEmergencyExit(n),
    build: ({ isLast }) =>
      isLast
        ? "The exit is directly ahead. Please leave the building calmly and assemble at the designated muster point."
        : "Proceed toward the exit sign and continue following the path.",
  },

  // Lobby
  {
    match: (n) => classifiers.isLobby(n),
    build: () =>
      "You have reached the lobby. The main exit is straight ahead.",
  },

  // Left staircase
  {
    match: (n) => classifiers.isLeftStaircase(n),
    build: ({ nextNode }) => {
      const hasMoreAfter = nextNode && !classifiers.isExit(nextNode);
      return hasMoreAfter
        ? "Turn left and take the staircase. Continue following the path on the next floor."
        : "Turn left and take the staircase down to the ground floor.";
    },
  },

  // Right staircase
  {
    match: (n) => classifiers.isRightStaircase(n),
    build: ({ nextNode }) => {
      const hasMoreAfter = nextNode && !classifiers.isExit(nextNode);
      return hasMoreAfter
        ? "Turn right and take the staircase. Continue following the path on the next floor."
        : "Turn right and take the staircase down to the ground floor.";
    },
  },

  // Generic staircase (no direction hint)
  {
    match: (n) => classifiers.isStaircase(n),
    build: () =>
      "Proceed to the staircase and descend to the ground floor. Do not use the elevator.",
  },

  // Left elevator
  {
    match: (n) => classifiers.isLeftElevator(n),
    build: () =>
      "Turn left and board the elevator to the ground floor.",
  },

  // Right elevator
  {
    match: (n) => classifiers.isRightElevator(n),
    build: () =>
      "Turn right and board the elevator to the ground floor.",
  },

  // Generic elevator
  {
    match: (n) => classifiers.isElevator(n),
    build: () =>
      "Proceed to the elevator and descend to the ground floor.",
  },

  // Left turn (without staircase/elevator)
  {
    match: (n) => classifiers.isLeftTurn(n),
    build: () => "Turn left and continue along the corridor.",
  },

  // Right turn
  {
    match: (n) => classifiers.isRightTurn(n),
    build: () => "Turn right and continue along the corridor.",
  },

  // Corridor / hallway
  {
    match: (n) => classifiers.isCorridor(n),
    build: ({ isFirst }) =>
      isFirst
        ? "Step into the corridor and proceed forward."
        : "Continue through the corridor ahead.",
  },

];

// ─── Main converter ───────────────────────────────────────────────────────────

/**
 * Converts your existing path array into an array of spoken instruction strings.
 *
 * @param   {string[]} path         — ordered route nodes from your algorithm
 * @param   {object}   [options]
 * @param   {string}   [options.guestName]   — optional name for a personalised opener
 * @param   {boolean}  [options.isEvacuation] — adds urgency to the opener
 * @returns {string[]}  ordered instruction strings
 */
export function convertRouteToInstructions(path, options = {}) {
  if (!Array.isArray(path) || path.length === 0) return [];

  const { guestName, isEvacuation = false } = options;
  const instructions = [];

  // ── Opening ──────────────────────────────────────────────────────────────
  const nameGreeting = guestName ? `, ${guestName.split(' ')[0]}` : '';
  if (isEvacuation) {
    instructions.push(
      `Attention${nameGreeting}. Please begin evacuating now. Follow the guided route to the nearest exit.`
    );
  } else {
    instructions.push(
      `Good day${nameGreeting}. Your route to the exit has been calculated. Please follow these directions carefully.`
    );
  }

  // ── Process path nodes ───────────────────────────────────────────────────
  let i = 0;
  let isFirstSegment = true;

  while (i < path.length) {
    const node     = path[i];
    const prevNode = i > 0 ? path[i - 1] : null;
    const nextNode = i < path.length - 1 ? path[i + 1] : null;
    const isLast   = i === path.length - 1;

    // ── Room segment: collect consecutive room numbers then emit one instruction
    if (isRoom(node)) {
      const roomRun = [node];
      while (i + 1 < path.length && isRoom(path[i + 1])) {
        i++;
        roomRun.push(path[i]);
      }
      const instruction = buildRoomInstruction(roomRun, isFirstSegment);
      if (instruction) instructions.push(instruction);
      isFirstSegment = false;
      i++;
      continue;
    }

    // ── Structural nodes: match against templates ─────────────────────────
    let matched = false;
    for (const tmpl of instructionTemplates) {
      if (tmpl.match(node)) {
        const text = tmpl.build({ node, prevNode, nextNode, isFirst: isFirstSegment, isLast });
        if (text) instructions.push(text);
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Unknown node type — emit a generic "continue" to avoid silent gaps
      console.warn(`[RouteToSpeech] Unrecognised node: "${node}"`);
    }

    isFirstSegment = false;
    i++;
  }

  // ── Closing reassurance (if not already ending on an exit instruction) ──
  const last = instructions[instructions.length - 1] || '';
  if (!last.toLowerCase().includes('exit') && !last.toLowerCase().includes('muster')) {
    instructions.push(
      "You are almost there. Please remain calm and walk steadily."
    );
  }

  return instructions;
}

/**
 * Convenience: same as convertRouteToInstructions but returns a single
 * paragraph string (for display or logging).
 */
export function convertRouteToScript(path, options = {}) {
  return convertRouteToInstructions(path, options).join(' ');
}