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
  buy: 30, // PRD §4 — Buy Phase 30s
  combat: 120, // PRD §4 — Combat Phase 120s
  suddenDeath: 20, // PRD §4 — tie -> 20s sudden death
  roundEnd: 7, // PRD §4 — Round End 7s
  freezeIntro: 1.2, // small camera settle before buy phase opens
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
export const DIFFICULTY = {
  easy: {
    id: 'easy',
    label: 'Easy',
    reactionTime: [0.55, 0.95],
    aimError: 3.6, // degrees of cone the bot aims within
    aimSnap: 4.5, // deg/sec turn-to-target speed factor
    burstDiscipline: 0.55,
    grenadeChance: 0.05,
    hearingRange: 18,
    viewDistance: 46,
    preAimSkill: 0.15,
    strafeSkill: 0.3,
    headshotBias: 0.05,
  },
  normal: {
    id: 'normal',
    label: 'Normal',
    reactionTime: [0.3, 0.55],
    aimError: 1.9,
    aimSnap: 8,
    burstDiscipline: 0.75,
    grenadeChance: 0.22,
    hearingRange: 26,
    viewDistance: 60,
    preAimSkill: 0.45,
    strafeSkill: 0.6,
    headshotBias: 0.18,
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    reactionTime: [0.14, 0.28],
    aimError: 0.95,
    aimSnap: 13,
    burstDiscipline: 0.92,
    grenadeChance: 0.45,
    hearingRange: 34,
    viewDistance: 75,
    preAimSkill: 0.8,
    strafeSkill: 0.9,
    headshotBias: 0.35,
  },
};

export const GAME_MODES = [
  {
    id: 'normal',
    name: '3v3 vs AI',
    tag: 'NORMAL',
    difficulty: 'normal',
    blurb: 'Standard tactical match. Bots hold angles, trade, and rotate.',
    map: 'Steelfall',
  },
  {
    id: 'hard',
    name: '3v3 vs AI',
    tag: 'HARD',
    difficulty: 'hard',
    blurb: 'Near-human reaction times. Bots pre-aim, flank and use utility.',
    map: 'Steelfall',
  },
  {
    id: 'practice',
    name: 'Practice Range',
    tag: 'FREEPLAY',
    difficulty: 'easy',
    blurb: 'Infinite credits, unlimited buy, respawning targets. No round timer.',
    map: 'Steelfall',
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
