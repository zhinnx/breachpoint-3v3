/**
 * BREACHPOINT — Global tunables.
 * Every number here traces back to breachpoint-prd.md (PRD v1.0).
 * Section references are noted so balancing passes stay auditable.
 */

// ---------------------------------------------------------------- PRD §4 Round structure
export const PHASE = {
  WARMUP: 'WARMUP',
  BUY: 'BUY',
  COMBAT: 'COMBAT',
  SUDDEN_DEATH: 'SUDDEN_DEATH',
  ROUND_END: 'ROUND_END',
  MATCH_END: 'MATCH_END',
};

export const TIMERS = {
  // Playtest tuning. The PRD numbers (30s buy / 7s round end) meant 37s of
  // dead time between fights, which reads as the game being stuck. Buy is now
  // skippable via READY, and round end is trimmed to a beat that still lets
  // the banner land.
  buy: 15,
  combat: 120,
  suddenDeath: 20,
  roundEnd: 4,
  freezeIntro: 0.8,
};

export const MATCH = {
  maxRounds: 7, // PRD §1 / §16 — max 7 rounds
  roundsToWin: 4, // PRD §1 — first to 4
  matchPointAt: 3, // PRD §4 — show "MATCH POINT" when a team is on 3
  sideSwapAfterRound: 4, // PRD §2 — swap spawn sides after round 4
  teamSize: 3, // PRD §1 — 3v3
};

// ---------------------------------------------------------------- PRD §5 Economy
export const ECONOMY = {
  startingCredits: 8000,
  roundWin: 3000,
  roundLoss: 2000,
  killReward: 250,
  maxCredits: 9000, // keeps eco decisions meaningful across a 7-round match
};

// ---------------------------------------------------------------- PRD §6 Combat mechanics
export const COMBAT = {
  maxHP: 100,
  headshotMultiplier: 4.0,
  bodyMultiplier: 1.0,
  limbMultiplier: 0.75,
  assistWindow: 8, // seconds a damage contribution counts toward an assist
  respawnNever: true,
};

export const MOVE = {
  walkSpeed: 4.4,
  sprintSpeed: 6.5,
  crouchSpeed: 2.2,
  adsSpeedMul: 0.55,
  accel: 46,
  airAccel: 8,
  friction: 12,
  gravity: -22.5,
  jumpVelocity: 7.2,
  standHeight: 1.78,
  crouchHeight: 1.24,
  eyeOffset: -0.16, // eye sits slightly below the top of the capsule
  capsuleRadius: 0.32,
  stepHeight: 0.55,
  slopeLimitDeg: 52,
  crouchLerp: 9,
  ladderSpeed: 3.2,
};

/**
 * Aim assist. Deliberately weak: it nudges, it does not lock. `maxAngleDeg` is
 * the cone inside which help applies at all, and `pull` is the fraction of the
 * remaining angle closed per second while the target is inside that cone.
 * Touch gets more help than mouse because a thumb has far less precision.
 */
export const AIM_ASSIST = {
  enabled: true,
  mouse: { maxAngleDeg: 3.2, pull: 1.9, maxRange: 55, adsBonus: 1.25 },
  touch: { maxAngleDeg: 6.0, pull: 4.2, maxRange: 60, adsBonus: 1.35 },
  // Slow the look while crossing a target so the reticle does not skate past.
  frictionAngleDeg: 5.5,
  frictionMouse: 0.72,
  frictionTouch: 0.55,
};

// Accuracy penalties (PRD §6 — sprint worse, crouch better, airborne drastically worse)
export const ACCURACY = {
  baseSpreadDeg: 0.28,
  moveSpreadDeg: 1.85,
  sprintSpreadDeg: 3.4,
  airSpreadDeg: 7.5,
  crouchSpreadMul: 0.55,
  adsSpreadMul: 0.22,
  recoverPerSec: 7.5,
};

/**
 * Recoil stance modifiers. Firing from a planted stance is meaningfully more
 * controllable than firing on the move, and crouching is better still, so
 * holding an angle is rewarded over running and gunning.
 */
export const RECOIL_STANCE = {
  moving: 1.35,      // walking or strafing
  sprinting: 1.7,
  airborne: 2.1,
  standingStill: 0.82,
  crouchStill: 0.58, // planted + crouched: the most controllable stance
  adsBonus: 0.86,    // multiplies on top of the stance value
  stillSpeed: 0.6,   // below this m/s counts as planted
};

// PRD §7.3 — Armor
export const ARMOR = {
  none: { id: 'none', label: 'No Vest', bodyReduction: 0, speedMul: 1, price: 0 },
  light: { id: 'light', label: 'Light Vest', bodyReduction: 0.25, speedMul: 1, price: 400 },
  heavy: { id: 'heavy', label: 'Heavy Vest', bodyReduction: 0.4, speedMul: 0.95, price: 1000 },
};

// ---------------------------------------------------------------- Teams (PRD §10)
export const TEAM = { BLUE: 'BLUE', RED: 'RED' };
export const TEAM_COLOR = {
  BLUE: '#3fa9ff',
  RED: '#ff5540',
};
export const TEAM_COLOR_DIM = {
  BLUE: '#12496f',
  RED: '#6f2317',
};

// ---------------------------------------------------------------- PRD §8 Bot difficulty
/**
 * Bot difficulty.
 *
 * Retuned after playtest feedback of "enemy AI is auto-aim" and "shots come
 * from nowhere". Three concrete changes:
 *   1. viewDistance cut hard. It was 60-75m on a 76m map, so bots effectively
 *      saw the entire level and could open fire from off-screen.
 *   2. Longer reaction times, and a separate `targetSwitchDelay` so a bot
 *      cannot instantly snap onto a second target.
 *   3. `firstShotDelay` — a beat between acquiring and shooting, which is what
 *      makes a fight feel readable rather than instant.
 */
export const DIFFICULTY = {
  easy: {
    id: 'easy',
    label: 'Easy',
    reactionTime: [0.75, 1.25],
    firstShotDelay: [0.35, 0.6],
    targetSwitchDelay: 0.7,
    aimError: 4.6,
    aimSnap: 3.4,
    burstDiscipline: 0.45,
    grenadeChance: 0.04,
    hearingRange: 15,
    viewDistance: 26,
    preAimSkill: 0.08,
    strafeSkill: 0.28,
    headshotBias: 0.02,
    missBias: 0.5,
  },
  normal: {
    id: 'normal',
    label: 'Normal',
    reactionTime: [0.45, 0.8],
    firstShotDelay: [0.22, 0.4],
    targetSwitchDelay: 0.5,
    aimError: 2.9,
    aimSnap: 5.5,
    burstDiscipline: 0.62,
    grenadeChance: 0.16,
    hearingRange: 20,
    viewDistance: 34,
    preAimSkill: 0.3,
    strafeSkill: 0.55,
    headshotBias: 0.08,
    missBias: 0.32,
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    reactionTime: [0.26, 0.45],
    firstShotDelay: [0.12, 0.24],
    targetSwitchDelay: 0.32,
    aimError: 1.7,
    aimSnap: 8.5,
    burstDiscipline: 0.82,
    grenadeChance: 0.32,
    hearingRange: 26,
    viewDistance: 44,
    preAimSkill: 0.6,
    strafeSkill: 0.85,
    headshotBias: 0.18,
    missBias: 0.16,
  },
};

export const GAME_MODES = [
  {
    id: 'normal',
    name: '3v3 vs AI',
    tag: 'NORMAL',
    difficulty: 'normal',
    blurb: 'Standard tactical match. Bots hold angles, trade, and rotate.',
    map: 'Dustline',
    mapId: 'dustline',
  },
  {
    id: 'hard',
    name: '3v3 vs AI',
    tag: 'HARD',
    difficulty: 'hard',
    blurb: 'Near-human reaction times. Bots pre-aim, flank and use utility.',
    map: 'Dustline',
    mapId: 'dustline',
  },
  {
    id: 'practice',
    name: 'Practice Range',
    tag: 'FREEPLAY',
    difficulty: 'easy',
    blurb: 'Open range. Moving targets, no timers, unlimited credits.',
    map: 'Rangeyard',
    mapId: 'rangeyard',
  },
];

// ---------------------------------------------------------------- Rendering / physics groups
// Rapier interaction groups (index based, see @react-three/rapier interactionGroups()).
export const GROUP = {
  WORLD: 0,
  ACTOR: 1,
  PROP: 2,
  RAY_BULLET: 3,
  RAY_VISION: 4,
};

export const SURFACE = {
  METAL: 'metal',
  CONCRETE: 'concrete',
  GRAVEL: 'gravel',
  WOOD: 'wood',
  BODY: 'body',
};

export const KILLFEED_TTL = 6.5;
