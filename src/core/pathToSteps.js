/**
 * pathToSteps.js
 * ──────────────────────────────────────────────────────────────────────────
 * Converts a raw Dijkstra evacuation path array into a small list of
 * high-level "checkpoint" steps shown one at a time in the 1st-person view.
 *
 * Rules:
 *  • A run of consecutive guest-room numbers on the SAME floor is collapsed
 *    into ONE step: "Run through the corridor of floor X …"
 *  • Staircase nodes (STAIR_F_L / STAIR_F_R) produce ONE step describing the
 *    descent and which side (East = right, West = left).
 *  • Exit nodes produce the final "You have reached the exit" step.
 *
 * Output: Array of { label, instruction, labelHi, instructionHi, floor, side }
 */

/** Extract floor from a path node string. */
function nodeFloor(node) {
  if (/^\d+$/.test(node)) return parseInt(node.slice(0, -2), 10);
  const m = node.match(/STAIR_(\d+)_/);
  return m ? parseInt(m[1], 10) : null;
}

/** True if node is a plain guest-room number. */
const isRoom = (n) => /^\d{3,4}$/.test(n);

/** True if node is a staircase. */
const isStair = (n) => /^STAIR_/.test(n);

/** True if node is an exit. */
const isExit  = (n) => /^EXIT_/.test(n);

/**
 * Map staircase side → cardinal direction label.
 *   _L (left) side of building = West staircase
 *   _R (right) side            = East staircase
 */
function staircaseSide(node) {
  if (node.endsWith('_L')) return 'West';
  if (node.endsWith('_R')) return 'East';
  return 'nearest';
}

function staircaseSideHi(node) {
  if (node.endsWith('_L')) return 'पश्चिम';
  if (node.endsWith('_R')) return 'पूर्व';
  return 'नजदीकी';
}

/**
 * Convert the raw path to ordered display steps.
 *
 * @param  {string[]} path — raw evacuation path from findEvacuationPath()
 * @param  {string}   [lang] — 'en' | 'hi' (default 'en')
 * @returns {{ label: string, instruction: string, labelHi: string, instructionHi: string, floor: number|null, side: string|null }[]}
 */
export function pathToSteps(path, lang = 'en') {
  if (!Array.isArray(path) || path.length === 0) return [];

  const steps = [];
  let i = 0;

  while (i < path.length) {
    const node = path[i];

    // ── Room run: collapse consecutive rooms on the same floor ───────
    if (isRoom(node)) {
      const floor = nodeFloor(node);
      // Collect all consecutive room nodes on the same floor
      while (i < path.length && isRoom(path[i]) && nodeFloor(path[i]) === floor) {
        i++;
      }

      // Determine which staircase side they're heading toward (peek ahead)
      let side   = null;
      let sideHi = null;
      for (let j = i; j < path.length; j++) {
        if (isStair(path[j])) {
          side   = staircaseSide(path[j]);
          sideHi = staircaseSideHi(path[j]);
          break;
        }
        if (isExit(path[j])) break;
      }

      const instruction = side
        ? `Run through the corridor of Floor ${floor} and head toward the ${side}-side staircase.`
        : `Run through the corridor of Floor ${floor} toward the exit.`;

      const instructionHi = side
        ? `मंजिल ${floor} के गलियारे से दौड़ते हुए ${sideHi} तरफ की सीढ़ियों की ओर जाएं।`
        : `मंजिल ${floor} के गलियारे से निकास की ओर जाएं।`;

      steps.push({
        label:         `FLOOR ${floor} — CORRIDOR`,
        instruction,
        labelHi:       `मंजिल ${floor} — गलियारा`,
        instructionHi,
        floor,
        side,
      });
      continue; // i already advanced past the run
    }

    // ── Staircase node ───────────────────────────────────────────────
    if (isStair(node)) {
      const floor  = nodeFloor(node);
      const side   = staircaseSide(node);
      const sideHi = staircaseSideHi(node);

      const nextIsStair = i + 1 < path.length && isStair(path[i + 1]);
      const nextIsRoom  = i + 1 < path.length && isRoom(path[i + 1]);
      const nextFloor   = nextIsStair || nextIsRoom ? nodeFloor(path[i + 1]) : null;

      let instruction;
      let instructionHi;

      if (nextFloor && nextFloor < floor) {
        instruction   = `Take the ${side}-side staircase down from Floor ${floor} to Floor ${nextFloor}.`;
        instructionHi = `${sideHi} तरफ की सीढ़ियों से मंजिल ${floor} से मंजिल ${nextFloor} तक नीचे जाएं।`;
      } else if (floor === 1) {
        instruction   = `Take the ${side}-side staircase to the Ground Floor exit.`;
        instructionHi = `${sideHi} तरफ की सीढ़ियों से भूतल निकास तक जाएं।`;
      } else {
        instruction   = `Descend the ${side}-side staircase toward the exit.`;
        instructionHi = `${sideHi} तरफ की सीढ़ियों से नीचे निकास की ओर जाएं।`;
      }

      steps.push({
        label:         `STAIRCASE — ${side.toUpperCase()} SIDE`,
        instruction,
        labelHi:       `सीढ़ियाँ — ${sideHi} तरफ`,
        instructionHi,
        floor,
        side,
      });
      i++;
      continue;
    }

    // ── Exit node ────────────────────────────────────────────────────
    if (isExit(node)) {
      const side   = node.includes('LEFT') ? 'West' : node.includes('RIGHT') ? 'East' : '';
      const sideHi = node.includes('LEFT') ? 'पश्चिम' : node.includes('RIGHT') ? 'पूर्व' : '';

      steps.push({
        label:         'EXIT',
        instruction:   `You have reached the ${side ? side + '-side ' : ''}emergency exit. Push the door open and assemble at the designated muster point outside.`,
        labelHi:       'निकास',
        instructionHi: `आप ${sideHi ? sideHi + ' तरफ के ' : ''}आपातकालीन निकास पर पहुंच गए हैं। दरवाज़ा खोलें और बाहर निर्धारित मस्टर पॉइंट पर इकट्ठा हों।`,
        floor: 1,
        side,
      });
      i++;
      continue;
    }

    // Unknown node — skip
    i++;
  }

  return steps;
}

/**
 * Return the correct label/instruction based on language.
 *
 * @param  {{ label, instruction, labelHi, instructionHi }} step
 * @param  {string} lang — 'en' | 'hi'
 * @returns {{ label: string, instruction: string }}
 */
export function localiseStep(step, lang = 'en') {
  if (!step) return null;
  return {
    ...step,
    label:       lang === 'hi' ? (step.labelHi       || step.label)       : step.label,
    instruction: lang === 'hi' ? (step.instructionHi || step.instruction) : step.instruction,
  };
}

/**
 * Build a single-sentence audio guidance script from the steps array.
 *
 * @param  {string[]} path — raw evacuation path
 * @param  {string}   [guestName]
 * @param  {string}   [lang] — 'en' | 'hi'
 * @returns {string}
 */
export function buildAudioScript(path, guestName, lang = 'en') {
  const steps = pathToSteps(path, lang);
  if (steps.length === 0) {
    return lang === 'hi'
      ? 'कृपया प्रकाशित निकास संकेतों का पालन करते हुए निकासी करें।'
      : 'Please follow the illuminated exit signs to evacuate.';
  }

  if (lang === 'hi') {
    const firstName = guestName ? `, ${guestName.split(' ')[0]}` : '';
    const intro     = `ध्यान दें${firstName}। कृपया तुरंत निकासी शुरू करें। `;
    const body      = steps.map(s => s.instructionHi || s.instruction).join(' ');
    const closing   = ' शांत रहें और लिफ्ट का उपयोग न करें।';
    return intro + body + closing;
  }

  const name    = guestName ? `, ${guestName.split(' ')[0]}` : '';
  const intro   = `Attention${name}. Please evacuate immediately. `;
  const body    = steps.map(s => s.instruction).join(' ');
  const closing = ' Remain calm and do not use the elevator.';
  return intro + body + closing;
}