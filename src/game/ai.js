/**
 * BREACHPOINT — Bot AI (PRD §8)
 *
 * States   : PATROL/HOLD, INVESTIGATE, ENGAGE, RETREAT, PUSH
 * Difficulty: easy / normal / hard — reaction time, aim error, grenade usage
 * Navigation: three-pathfinding NavMesh + tagged cover points from the map data
 * Coordination: a per-team blackboard sharing last-known enemy positions so bots
 *               flank and regroup as a squad instead of reacting individually.
 */
import { DIFFICULTY, PHASE, TEAM, MOVE } from './config.js';
import { getWeapon, FIRE_MODE, UTILITY, WEAPONS } from './weapons.js';
import { COVER_POINTS, LANE_PUSH_POINTS, SPAWNS, inBuyZone, LEVEL, getPracticeRoutes } from './steelfall.js';
import { hasLineOfSight, castWorld } from './raycast.js';
import {
  world, eyePosition, headCenter, chestCenter, currentWeaponRuntime,
  segmentBlockedBySmoke, actorHeight,
} from './world.js';
import { findPath, clampToNav } from './navmesh.js';
import { fireWeapon, startReload, throwUtility, startHeal, computeSpread, canFire, randomConeDir } from './combat.js';
import { moveActor, ladderAt } from './movement.js';

export const AI_STATE = {
  HOLD: 'HOLD',
  PATROL: 'PATROL',
  INVESTIGATE: 'INVESTIGATE',
  ENGAGE: 'ENGAGE',
  RETREAT: 'RETREAT',
  PUSH: 'PUSH',
  BUY: 'BUY',
};

/** Shared team memory (PRD §8 "blackboard"). */
export const blackboard = {
  BLUE: { enemies: {}, claimedCover: {}, lastContact: -99, pushTimer: 0, lane: {} },
  RED: { enemies: {}, claimedCover: {}, lastContact: -99, pushTimer: 0, lane: {} },
};

export function resetBlackboard() {
  for (const t of ['BLUE', 'RED']) {
    blackboard[t] = { enemies: {}, claimedCover: {}, lastContact: -99, pushTimer: 0, lane: {} };
  }
}

const LANES = ['left', 'mid', 'right'];

export function createAI(entity, difficultyId) {
  const diff = DIFFICULTY[difficultyId] || DIFFICULTY.normal;
  return {
    diff,
    difficultyId,
    state: AI_STATE.HOLD,
    prevState: AI_STATE.HOLD,
    stateTime: 0,
    target: null, // enemy actor id
    targetLastSeen: -99,
    targetLastPos: null,
    reactionTimer: 0,
    firstShotTimer: 0,
    lastTargetSwitch: -99,
    acquiredAt: -99,
    fireTimer: 0,
    burstShots: 0,
    burstPause: 0,
    path: null,
    pathIndex: 0,
    pathGoal: null,
    repathAt: 0,
    dest: null,
    lane: LANES[Math.floor(Math.random() * 3)],
    coverPoint: null,
    coverUntil: 0,
    strafeDir: Math.random() > 0.5 ? 1 : -1,
    strafeTimer: 0,
    aimYaw: entity.yaw || 0,
    aimPitch: 0,
    aimNoise: [0, 0],
    aimNoiseTimer: 0,
    jitterTarget: [0, 0],
    blindUntil: -99,
    nextGrenadeCheck: 0,
    thinkTimer: 0,
    stuckTimer: 0,
    lastPos: [...entity.pos],
    wantCrouch: false,
    wantJump: false,
    holdSpot: null,
    peekTimer: 0,
    reloadIntent: false,
    buyDone: false,
    personality: entity.personality || 'balanced',
    role: entity.personality || 'balanced',
    ladderTimer: 0,
    pushAnchorIdx: 0,
    heardAt: null,
  };
}

// ------------------------------------------------------------------ perception
function canSee(bot, from, targetActor, diff) {
  if (!targetActor.alive) return false;
  const tc = chestCenter(targetActor);
  const th = headCenter(targetActor);
  const dist = Math.hypot(tc[0] - from[0], tc[1] - from[1], tc[2] - from[2]);
  if (dist > diff.viewDistance) return false;

  // FOV cone ~ 110 degrees horizontally
  const dir = [tc[0] - from[0], tc[1] - from[1], tc[2] - from[2]];
  const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const look = [
    -Math.sin(bot.aimYaw) * Math.cos(bot.aimPitch),
    Math.sin(bot.aimPitch),
    -Math.cos(bot.aimYaw) * Math.cos(bot.aimPitch),
  ];
  const dot = (dir[0] / dl) * look[0] + (dir[1] / dl) * look[1] + (dir[2] / dl) * look[2];
  if (dot < -0.15) return false; // behind
  const inFov = dot > 0.34 || dist < 6;
  if (!inFov) return false;

  // smoke blocks vision (PRD §7.3 — bots respect smoke)
  if (segmentBlockedBySmoke(from, tc)) return false;
  if (!hasLineOfSight(from, tc, 0.02) && !hasLineOfSight(from, th, 0.02)) return false;
  return true;
}

function hearNoise(bot, actorPos, others, diff) {
  const now = world.time;
  let best = null;
  let bestScore = 0;
  for (const o of others) {
    if (!o.alive) continue;
    const dt = now - (o.lastNoiseAt || -99);
    const shotAge = now - (o.lastFireTime || -99);
    const d = Math.hypot(o.pos[0] - actorPos[0], o.pos[2] - actorPos[2]);
    // gunfire is loud
    if (shotAge < 0.6 && d < diff.hearingRange * 2.4) {
      const score = 2 / (1 + d * 0.05);
      if (score > bestScore) { bestScore = score; best = o; }
    }
    if (dt < 0.4 && d < diff.hearingRange * (o.noiseLevel || 0.6)) {
      const score = 1 / (1 + d * 0.08);
      if (score > bestScore) { bestScore = score; best = o; }
    }
  }
  return best;
}

// ------------------------------------------------------------------ tactical helpers
function coverScore(cp, botPos, threatPos, team, ai) {
  const d = Math.hypot(cp.pos[0] - botPos[0], cp.pos[2] - botPos[2]);
  if (d > 34) return -1;
  let score = 26 - d * 0.55;

  if (threatPos) {
    const cpEye = [cp.pos[0], cp.pos[1] + 1.3, cp.pos[2]];
    const exposed = hasLineOfSight(cpEye, [threatPos[0], threatPos[1] + 1.3, threatPos[2]]);
    // Cover that lets you SEE the threat is good for engaging, but too close is bad
    const dt = Math.hypot(cp.pos[0] - threatPos[0], cp.pos[2] - threatPos[2]);
    if (exposed) score += 9 - Math.abs(dt - 14) * 0.35;
    else score += 4;
    if (dt < 4) score -= 14;
  }
  if (cp.lane === ai.lane) score += 5;
  if (cp.high) score += 3.5;
  // don't stack on a teammate's claimed spot
  const claim = blackboard[team].claimedCover[cp.tag];
  if (claim && claim.id !== ai.ownerId && world.time - claim.at < 6) score -= 22;
  return score;
}

function pickCover(ai, actor, threatPos) {
  let best = null;
  let bestScore = -Infinity;
  for (const cp of COVER_POINTS) {
    const s = coverScore(cp, actor.pos, threatPos, actor.team, ai);
    if (s > bestScore) { bestScore = s; best = cp; }
  }
  if (best) {
    blackboard[actor.team].claimedCover[best.tag] = { id: actor.id, at: world.time };
  }
  return best;
}

/** Choose a spot to hold at round start based on team side + lane. */
function pickHoldSpot(ai, actor, swapped) {
  const ownSide = (actor.team === TEAM.BLUE) !== swapped ? -1 : 1; // -Z for blue by default
  const cands = COVER_POINTS.filter((cp) => {
    if (cp.lane !== ai.lane) return false;
    const onSide = Math.sign(cp.pos[2]) === ownSide || Math.abs(cp.pos[2]) < 8;
    return onSide && Math.abs(cp.pos[2]) < 23;
  });
  if (!cands.length) return COVER_POINTS[Math.floor(Math.random() * COVER_POINTS.length)];
  return cands[Math.floor(Math.random() * cands.length)];
}

// ------------------------------------------------------------------ navigation
function setDestination(ai, actor, dest) {
  if (!dest) return;
  const same = ai.pathGoal && Math.hypot(dest[0] - ai.pathGoal[0], dest[2] - ai.pathGoal[2]) < 1.2;
  if (same && ai.path && world.time < ai.repathAt) return;
  ai.pathGoal = [...dest];
  ai.repathAt = world.time + 1.4 + Math.random() * 0.6;
  const p = findPath(actor.pos, dest);
  if (p && p.length) {
    ai.path = p;
    ai.pathIndex = 0;
  } else {
    // fallback: direct steering
    ai.path = [dest];
    ai.pathIndex = 0;
  }
}

/** Follow the current path; returns a normalised desired move direction. */
function followPath(ai, actor, dt) {
  if (!ai.path || ai.pathIndex >= ai.path.length) return [0, 0];
  let wp = ai.path[ai.pathIndex];
  let dx = wp[0] - actor.pos[0];
  let dz = wp[2] - actor.pos[2];
  let d = Math.hypot(dx, dz);
  const dy = wp[1] - actor.pos[1];

  const arriveDist = ai.pathIndex === ai.path.length - 1 ? 0.85 : 1.1;
  while (d < arriveDist && Math.abs(dy) < 2.4) {
    ai.pathIndex++;
    if (ai.pathIndex >= ai.path.length) return [0, 0];
    wp = ai.path[ai.pathIndex];
    dx = wp[0] - actor.pos[0];
    dz = wp[2] - actor.pos[2];
    d = Math.hypot(dx, dz);
  }
  if (d < 0.001) return [0, 0];
  return [dx / d, dz / d];
}

/** Turn world-space direction into local forward/right for moveActor. */
function toLocalInput(actor, wx, wz) {
  const sy = Math.sin(actor.yaw);
  const cy = Math.cos(actor.yaw);
  // inverse of: wishX = -sy*f + cy*r ; wishZ = -cy*f - sy*r
  const f = -(wx * sy + wz * cy);
  const r = wx * cy - wz * sy;
  return { forward: Math.max(-1, Math.min(1, f)), right: Math.max(-1, Math.min(1, r)) };
}

// ------------------------------------------------------------------ buy logic (PRD §5 economy behaviour)
export function botBuy(entity, store, difficultyId) {
  const credits = entity.credits;
  const diff = DIFFICULTY[difficultyId] || DIFFICULTY.normal;
  const roll = Math.random();
  const has = entity.loadout.primary;

  // eco decision: if broke, save
  if (credits < 1400 && !has) {
    if (credits >= 500 && roll > 0.5) store.buyWeapon(entity.id, 'wisp');
    if (credits >= 400 && Math.random() > 0.5) store.buyArmor(entity.id, 'light');
    return;
  }

  const wishlist = [];
  if (diff.id === 'hard') {
    wishlist.push('vanguard7', 'falcon6', 'vantage50', 'raptor9', 'hailstorm', 'breacher12');
  } else {
    wishlist.push('vanguard7', 'raptor9', 'breacher12', 'falcon6', 'vantage50');
  }
  // personality bias
  if (entity.personality === 'entry') wishlist.unshift(roll > 0.5 ? 'raptor9' : 'breacher12');
  if (entity.personality === 'anchor') wishlist.unshift(roll > 0.55 ? 'falcon6' : 'vanguard7');
  if (entity.personality === 'flanker') wishlist.unshift(roll > 0.5 ? 'raptor9' : 'vanguard7');

  // Reserve credits for armor + utility
  const reserve = credits > 4200 ? 1700 : credits > 2600 ? 900 : 400;

  if (!has) {
    for (const wid of wishlist) {
      const w = WEAPONS[wid];
      if (!w) continue;
      if (credits - w.price >= reserve - 400) {
        if (store.buyWeapon(entity.id, wid)) break;
      }
    }
  }

  const after = store.entities[entity.id];
  // armor
  if (after.credits >= 1000 && after.loadout.armor !== 'heavy' && Math.random() > 0.25) {
    store.buyArmor(entity.id, 'heavy');
  } else if (after.credits >= 400 && after.loadout.armor === 'none') {
    store.buyArmor(entity.id, 'light');
  }

  // utility — hard bots buy more nades (PRD §8)
  const utilBudget = diff.id === 'hard' ? 1100 : diff.id === 'normal' ? 700 : 300;
  let spent = 0;
  const order = diff.id === 'hard'
    ? ['flash', 'frag', 'smoke', 'medkit']
    : ['frag', 'flash', 'smoke'];
  for (const u of order) {
    const cur = store.entities[entity.id];
    const item = UTILITY[u];
    if (spent + item.price > utilBudget) continue;
    if (cur.credits < item.price + 200) break;
    if (Math.random() > 0.35 && store.buyUtility(entity.id, u)) spent += item.price;
  }
}

// ------------------------------------------------------------------ main AI tick
/**
 * Practice-range target behaviour. Instead of fighting, these bots run drills
 * so the player can rehearse tracking: a walker, a sprinter, a zigzagger and a
 * strafer. They still shoot back occasionally so the range is not a shooting
 * gallery, but they never push.
 */
function tickPracticeTarget({ ai, actor, entity, store, dt }) {
  const routes = getPracticeRoutes();
  if (!routes.length) return false;

  if (!ai.drill) {
    // actor.index can be missing for late-created runtimes, so fall back to a
    // stable hash of the id rather than indexing with undefined.
    const seed = Number.isFinite(actor.index)
      ? actor.index
      : Math.abs([...String(actor.id)].reduce((h, c) => h + c.charCodeAt(0), 0));
    const r = routes[seed % routes.length] || routes[0];
    if (!r) return false;
    ai.drill = { mode: r.mode, points: r.points, idx: 0, dir: 1, t: 0 };
  }
  const d = ai.drill;
  if (!d || !d.points || !d.points.length) return false;
  d.t += dt;

  const target = d.points[d.idx] || d.points[0];
  let gx = target[0];
  let gz = target[2];

  // zigzag weaves perpendicular to the path so tracking is non-trivial
  if (d.mode === 'zigzag') {
    gx += Math.sin(d.t * 3.2) * 3.2;
  } else if (d.mode === 'strafe') {
    gx += Math.sin(d.t * 2.1) * 2.4;
  }

  const dx = gx - actor.pos[0];
  const dz = gz - actor.pos[2];
  const dist = Math.hypot(dx, dz);
  if (dist < 1.4) {
    d.idx += d.dir;
    if (d.idx >= d.points.length) { d.idx = d.points.length - 2; d.dir = -1; }
    if (d.idx < 0) { d.idx = 1; d.dir = 1; }
  }

  const inv = 1 / (dist || 1);
  const wx = dx * inv;
  const wz = dz * inv;

  // face travel direction, but glance toward the player so they read as alive
  const player = world.actors[store.playerId];
  if (player && player.alive && Math.sin(d.t * 0.6) > 0.2) {
    const px = player.pos[0] - actor.pos[0];
    const pz = player.pos[2] - actor.pos[2];
    ai.aimYaw = Math.atan2(-px, -pz);
  } else {
    ai.aimYaw = Math.atan2(-wx, -wz);
  }
  actor.yaw = ai.aimYaw;
  actor.pitch = 0;

  const li = toLocalInput(actor, wx, wz);
  const input = {
    forward: li.forward,
    right: li.right,
    jump: false,
    sprint: d.mode === 'run',
    crouch: false,
  };
  moveActor(actor, input, dt, entity);
  return true;
}

export function tickBot({ ai, actor, entity, store, dt, phase, swapped }) {
  ai.ownerId = actor.id;
  ai.stateTime += dt;
  ai.thinkTimer -= dt;
  const diff = ai.diff;
  const bb = blackboard[actor.team];
  const enemyTeam = actor.team === TEAM.BLUE ? TEAM.RED : TEAM.BLUE;
  const eye = eyePosition(actor);

  const input = { forward: 0, right: 0, jump: false, sprint: false, crouch: false };

  // Practice range: run movement drills rather than fight.
  if (store.practice) {
    if (tickPracticeTarget({ ai, actor, entity, store, dt })) return;
  }

  // ---------------- buy phase behaviour: stay in spawn, face out
  if (phase === PHASE.BUY || phase === PHASE.WARMUP) {
    if (!ai.buyDone) {
      ai.buyDone = true;
      setTimeout(() => {
        if (store.phase === PHASE.BUY || store.phase === PHASE.WARMUP) {
          const e = store.entities[actor.id];
          if (e) botBuy(e, store, ai.difficultyId);
        }
      }, 400 + Math.random() * 4000);
      // choose lane, spread the team across lanes
      const used = Object.values(bb.lane).filter((v) => world.time - v.at < 40).map((v) => v.lane);
      const free = LANES.filter((l) => !used.includes(l));
      ai.lane = free.length ? free[Math.floor(Math.random() * free.length)] : LANES[Math.floor(Math.random() * 3)];
      bb.lane[actor.id] = { lane: ai.lane, at: world.time };
      ai.holdSpot = pickHoldSpot(ai, actor, swapped);
      ai.state = AI_STATE.HOLD;
      ai.path = null;
      ai.pushAnchorIdx = 0;
    }
    // idle scanning in the safe zone
    ai.aimYaw += Math.sin(world.time * 0.6 + actor.pos[0]) * dt * 0.35;
    ai.aimPitch = Math.sin(world.time * 0.4) * 0.05;
    actor.yaw = ai.aimYaw;
    actor.pitch = ai.aimPitch;
    moveActor(actor, input, dt, entity);
    return;
  }

  if (phase !== PHASE.COMBAT && phase !== PHASE.SUDDEN_DEATH) {
    moveActor(actor, input, dt, entity);
    return;
  }

  ai.buyDone = false;

  // ---------------- perception
  const enemies = world.actorList.filter((a) => a.team === enemyTeam && a.alive);
  const allies = world.actorList.filter((a) => a.team === actor.team && a.alive && a.id !== actor.id);

  const blinded = world.time < ai.blindUntil;
  let visible = null;
  let visibleDist = Infinity;
  if (!blinded) {
    for (const e of enemies) {
      if (!canSee(ai, eye, e, diff)) continue;
      const d = Math.hypot(e.pos[0] - actor.pos[0], e.pos[1] - actor.pos[1], e.pos[2] - actor.pos[2]);
      if (d < visibleDist) { visibleDist = d; visible = e; }
    }
  }

  // share intel through the blackboard (PRD §8 team coordination)
  if (visible) {
    bb.enemies[visible.id] = { pos: [...visible.pos], at: world.time, by: actor.id, confirmed: true };
    bb.lastContact = world.time;
    ai.targetLastSeen = world.time;
    ai.targetLastPos = [...visible.pos];
    const switchOk = world.time - ai.lastTargetSwitch > (diff.targetSwitchDelay || 0.5);
    if (!ai.target || (ai.target !== visible.id && switchOk)) {
      ai.target = visible.id;
      ai.acquiredAt = world.time;
      ai.lastTargetSwitch = world.time;
      // Reaction delay before the bot even starts tracking (PRD §8).
      const [lo, hi] = diff.reactionTime;
      ai.reactionTimer = lo + Math.random() * (hi - lo);
      if (Math.random() < diff.preAimSkill) ai.reactionTimer *= 0.7;
      // A second beat between "tracking you" and "firing", so engagements
      // start readably instead of the player dying to an instant burst.
      const [flo, fhi] = diff.firstShotDelay || [0.2, 0.35];
      ai.firstShotTimer = flo + Math.random() * (fhi - flo);
    }
  } else if (ai.target) {
    const t = world.actors[ai.target];
    if (!t || !t.alive) { ai.target = null; ai.path = null; }
  }

  // hearing (PRD §8 investigate)
  if (!visible && !blinded) {
    const heard = hearNoise(ai, actor.pos, enemies, diff);
    if (heard) {
      const known = bb.enemies[heard.id];
      if (!known || world.time - known.at > 1.2) {
        bb.enemies[heard.id] = { pos: [...heard.pos], at: world.time, by: actor.id, confirmed: false };
      }
      ai.heardAt = [...heard.pos];
    }
  }

  // freshest team intel
  let intel = null;
  for (const id of Object.keys(bb.enemies)) {
    const e = bb.enemies[id];
    const target = world.actors[id];
    if (!target || !target.alive) { delete bb.enemies[id]; continue; }
    if (world.time - e.at > 12) continue;
    if (!intel || e.at > intel.at) intel = { ...e, id };
  }

  // ---------------- state selection
  const aliveOwn = allies.length + 1;
  const aliveFoe = enemies.length;
  const hpFrac = entity.hp / 100;
  const prev = ai.state;

  if (visible) {
    if (hpFrac < 0.3 && aliveFoe >= aliveOwn && Math.random() < 0.02) ai.state = AI_STATE.RETREAT;
    else ai.state = AI_STATE.ENGAGE;
  } else if (ai.state === AI_STATE.ENGAGE && world.time - ai.targetLastSeen < 3.2) {
    // keep pressure briefly after losing sight
    ai.state = AI_STATE.ENGAGE;
  } else if (hpFrac < 0.28 && world.time - (actor.lastHurtAt || -99) < 4) {
    ai.state = AI_STATE.RETREAT;
  } else if (intel && world.time - intel.at < 8) {
    ai.state = aliveOwn > aliveFoe ? AI_STATE.PUSH : AI_STATE.INVESTIGATE;
  } else if (ai.heardAt) {
    ai.state = AI_STATE.INVESTIGATE;
  } else {
    // no info: after a while, push to take space
    const elapsed = 120 - store.phaseTime;
    if (aliveOwn > aliveFoe || elapsed > 35) ai.state = AI_STATE.PUSH;
    else ai.state = AI_STATE.HOLD;
  }

  if (ai.state !== prev) {
    ai.prevState = prev;
    ai.stateTime = 0;
    ai.path = null;
    ai.repathAt = 0;
  }

  // ---------------- act
  let desiredDir = [0, 0];
  let wantSprint = false;
  let wantCrouch = false;
  let lookAt = null;

  switch (ai.state) {
    case AI_STATE.HOLD: {
      if (!ai.holdSpot || world.time > ai.coverUntil) {
        ai.holdSpot = pickHoldSpot(ai, actor, swapped);
        ai.coverUntil = world.time + 6 + Math.random() * 8;
      }
      const sp = ai.holdSpot.pos;
      const d = Math.hypot(sp[0] - actor.pos[0], sp[2] - actor.pos[2]);
      if (d > 1.6) {
        setDestination(ai, actor, sp);
        desiredDir = followPath(ai, actor, dt);
        wantSprint = d > 9;
      } else {
        // scan the likely approach
        const scanZ = (actor.team === TEAM.BLUE) !== swapped ? 1 : -1;
        const scanTarget = [sp[0] + Math.sin(world.time * 0.35 + ai.strafeDir) * 8, 1.5, sp[2] + scanZ * 16];
        lookAt = scanTarget;
        wantCrouch = ai.holdSpot.high ? false : Math.sin(world.time * 0.5) > 0.6;
      }
      break;
    }

    case AI_STATE.INVESTIGATE: {
      const goal = intel ? intel.pos : ai.heardAt;
      if (goal) {
        const d = Math.hypot(goal[0] - actor.pos[0], goal[2] - actor.pos[2]);
        if (d > 2.2) {
          setDestination(ai, actor, goal);
          desiredDir = followPath(ai, actor, dt);
          wantSprint = d > 12 && hpFrac > 0.5;
          lookAt = [goal[0], goal[1] + 1.5, goal[2]];
        } else {
          ai.heardAt = null;
          if (intel && world.time - intel.at > 6) delete bb.enemies[intel.id];
          ai.state = AI_STATE.PUSH;
        }
      } else ai.state = AI_STATE.PUSH;
      break;
    }

    case AI_STATE.ENGAGE: {
      const t = visible || (ai.target ? world.actors[ai.target] : null);
      if (!t || !t.alive) { ai.target = null; break; }
      const tPos = visible ? chestCenter(t) : (ai.targetLastPos ? [ai.targetLastPos[0], ai.targetLastPos[1] + 1.2, ai.targetLastPos[2]] : null);
      lookAt = tPos;
      const dist = Math.hypot(t.pos[0] - actor.pos[0], t.pos[2] - actor.pos[2]);
      const weapon = getWeapon(actor.currentWeapon);
      const idealRange = weapon.nearRange * 0.75;

      if (!visible && world.time - ai.targetLastSeen > 1.3) {
        // lost them: reposition toward last known
        setDestination(ai, actor, ai.targetLastPos || t.pos);
        desiredDir = followPath(ai, actor, dt);
        break;
      }

      // strafe + hold angle (PRD §8 strafe/cover)
      ai.strafeTimer -= dt;
      if (ai.strafeTimer <= 0) {
        ai.strafeTimer = 0.5 + Math.random() * 1.1;
        ai.strafeDir *= Math.random() > 0.35 ? -1 : 1;
      }
      const toT = [t.pos[0] - actor.pos[0], 0, t.pos[2] - actor.pos[2]];
      const tl = Math.hypot(toT[0], toT[2]) || 1;
      const fx = toT[0] / tl, fz = toT[2] / tl;
      const sx = -fz, sz = fx;

      const strafeAmt = diff.strafeSkill * ai.strafeDir;
      let moveX = sx * strafeAmt;
      let moveZ = sz * strafeAmt;

      // range management
      if (dist > idealRange * 1.5 && weapon.category !== 'Sniper Rifle' && weapon.category !== 'Marksman Rifle') {
        moveX += fx * 0.85; moveZ += fz * 0.85;
      } else if (dist < idealRange * 0.45) {
        moveX -= fx * 0.7; moveZ -= fz * 0.7;
      }

      // seek cover when hurt or reloading
      const wr = currentWeaponRuntime(actor);
      if ((hpFrac < 0.45 || wr.reloading) && world.time > ai.coverUntil) {
        const cp = pickCover(ai, actor, t.pos);
        if (cp) {
          ai.coverPoint = cp;
          ai.coverUntil = world.time + 4;
          setDestination(ai, actor, cp.pos);
        }
      }
      if (ai.coverPoint && world.time < ai.coverUntil) {
        const cd = Math.hypot(ai.coverPoint.pos[0] - actor.pos[0], ai.coverPoint.pos[2] - actor.pos[2]);
        if (cd > 1.4) {
          desiredDir = followPath(ai, actor, dt);
          wantSprint = cd > 7;
          break;
        }
      }

      const ml = Math.hypot(moveX, moveZ) || 1;
      desiredDir = [moveX / ml, moveZ / ml];
      // crouch for accuracy at range (PRD §6 crouch improves accuracy)
      wantCrouch = dist > 16 && Math.random() < 0.02 ? !ai.wantCrouch : ai.wantCrouch;
      if (dist > 22 && diff.id !== 'easy') wantCrouch = true;
      break;
    }

    case AI_STATE.RETREAT: {
      const threat = visible || (intel ? world.actors[intel.id] : null);
      const away = threat
        ? [actor.pos[0] - (threat.pos[0] - actor.pos[0]), 0, actor.pos[2] - (threat.pos[2] - actor.pos[2])]
        : null;
      const spawnSide = (actor.team === TEAM.BLUE) !== swapped ? SPAWNS.BLUE[0].pos : SPAWNS.RED[0].pos;
      const goal = away || spawnSide;
      setDestination(ai, actor, [goal[0], 0, goal[2]]);
      desiredDir = followPath(ai, actor, dt);
      wantSprint = true;
      if (threat) lookAt = chestCenter(threat);
      // heal if we broke contact
      if (!visible && entity.loadout.utility.medkit > 0 && actor.healing <= 0 && hpFrac < 0.6) {
        startHeal(actor, store);
      }
      if (hpFrac > 0.62 || ai.stateTime > 7) ai.state = AI_STATE.HOLD;
      break;
    }

    case AI_STATE.PUSH:
    default: {
      const side = (actor.team === TEAM.BLUE) !== swapped ? 'BLUE' : 'RED';
      const anchors = LANE_PUSH_POINTS[side][ai.lane] || LANE_PUSH_POINTS[side].mid;
      let anchor = anchors[Math.min(ai.pushAnchorIdx, anchors.length - 1)];
      const d = Math.hypot(anchor[0] - actor.pos[0], anchor[2] - actor.pos[2]);
      if (d < 2.6) {
        ai.pushAnchorIdx = Math.min(ai.pushAnchorIdx + 1, anchors.length - 1);
        anchor = anchors[ai.pushAnchorIdx];
      }
      setDestination(ai, actor, anchor);
      desiredDir = followPath(ai, actor, dt);
      wantSprint = hpFrac > 0.55 && Math.hypot(desiredDir[0], desiredDir[1]) > 0.1 && Math.random() > 0.25;
      if (intel) lookAt = [intel.pos[0], intel.pos[1] + 1.4, intel.pos[2]];
      break;
    }
  }

  // ---------------- aiming
  let targetYaw = ai.aimYaw;
  let targetPitch = ai.aimPitch;
  if (lookAt) {
    const dx = lookAt[0] - eye[0];
    const dy = lookAt[1] - eye[1];
    const dz = lookAt[2] - eye[2];
    const hd = Math.hypot(dx, dz) || 0.001;
    targetYaw = Math.atan2(-dx, -dz);
    targetPitch = Math.atan2(dy, hd);
  } else if (desiredDir[0] || desiredDir[1]) {
    targetYaw = Math.atan2(-desiredDir[0], -desiredDir[1]);
    targetPitch *= 0.9;
  }

  // aim wobble scaled by difficulty (PRD §8 aim accuracy)
  ai.aimNoiseTimer -= dt;
  if (ai.aimNoiseTimer <= 0) {
    ai.aimNoiseTimer = 0.12 + Math.random() * 0.22;
    const e = (diff.aimError * Math.PI) / 180;
    ai.jitterTarget = [(Math.random() - 0.5) * 2 * e, (Math.random() - 0.5) * 2 * e * 0.7];
  }
  ai.aimNoise[0] += (ai.jitterTarget[0] - ai.aimNoise[0]) * Math.min(1, dt * 7);
  ai.aimNoise[1] += (ai.jitterTarget[1] - ai.aimNoise[1]) * Math.min(1, dt * 7);

  const snap = diff.aimSnap * (visible ? 1 : 0.5);
  let dyaw = targetYaw + ai.aimNoise[0] - ai.aimYaw;
  while (dyaw > Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  ai.aimYaw += dyaw * Math.min(1, dt * snap);
  ai.aimPitch += (targetPitch + ai.aimNoise[1] - ai.aimPitch) * Math.min(1, dt * snap);
  ai.aimPitch = Math.max(-1.35, Math.min(1.35, ai.aimPitch));

  actor.yaw = ai.aimYaw;
  actor.pitch = ai.aimPitch;

  // blinded bots flail (PRD §7.3 flashbang affects AI too)
  if (blinded) {
    actor.yaw += Math.sin(world.time * 9) * 0.06;
    actor.pitch += Math.cos(world.time * 7) * 0.03;
    desiredDir = [desiredDir[0] * 0.25, desiredDir[1] * 0.25];
  }

  // ---------------- shooting
  const weapon = getWeapon(actor.currentWeapon);
  const wr = currentWeaponRuntime(actor);

  if (wr.mag <= 0 && !wr.reloading) {
    startReload(actor, entity, store);
  } else if (!visible && wr.mag < weapon.magazine * 0.35 && !wr.reloading && world.time - ai.targetLastSeen > 2.5) {
    startReload(actor, entity, store);
  }

  if (visible && !blinded) {
    ai.reactionTimer -= dt;
    if (ai.reactionTimer <= 0) ai.firstShotTimer -= dt;
    const aimed = Math.abs(dyaw) < (visibleDist > 25 ? 0.035 : 0.075);
    if (ai.reactionTimer <= 0 && ai.firstShotTimer <= 0 && aimed && !wr.reloading) {
      // ADS for accuracy at range
      actor.wantAds = visibleDist > 12 || weapon.scope?.overlay;
      // burst discipline
      ai.burstPause -= dt;
      const autoWeapon = weapon.fireMode === FIRE_MODE.AUTO;
      const maxBurst = autoWeapon
        ? Math.max(2, Math.round((1 - diff.burstDiscipline) * 12 + 3))
        : 1;
      if (ai.burstPause <= 0) {
        // aim assist toward hitbox: bots shoot straight along their view,
        // accuracy emerges from aimError + weapon spread
        const zoneRoll = Math.random();
        const t = visible;
        const aimPoint = zoneRoll < diff.headshotBias ? headCenter(t) : chestCenter(t);
        const adx = aimPoint[0] - eye[0];
        const ady = aimPoint[1] - eye[1];
        const adz = aimPoint[2] - eye[2];
        const al = Math.hypot(adx, ady, adz) || 1;
        // blend true aim with the bot's noisy facing
        const face = [
          -Math.sin(actor.yaw) * Math.cos(actor.pitch),
          Math.sin(actor.pitch),
          -Math.cos(actor.yaw) * Math.cos(actor.pitch),
        ];
        // Blend the bot's (noisy) facing toward the true hitbox only partially —
        // a high blend makes diff.aimError meaningless and bots hit ~100%.
        // Deliberate imperfection. `missBias` pushes a fraction of shots wide
        // on purpose so a bot reads as a person rather than a turret.
        const intentionalMiss = Math.random() < (diff.missBias ?? 0.3);
        const blend = intentionalMiss
          ? 0.05
          : 0.18 + diff.preAimSkill * 0.22;
        const dir = [
          face[0] * (1 - blend) + (adx / al) * blend,
          face[1] * (1 - blend) + (ady / al) * blend,
          face[2] * (1 - blend) + (adz / al) * blend,
        ];
        const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
        let shotDir = [dir[0] / dl, dir[1] / dl, dir[2] / dl];

        // Per-shot error cone: widens with range, movement and spraying so
        // bots miss believably instead of laser-beaming.
        const rangeF = Math.min(2.2, 0.5 + visibleDist / 26);
        const moveF = 1 + Math.min(1.2, Math.hypot(actor.vel[0], actor.vel[2]) / 4);
        const sprayF = 1 + Math.min(1.5, ai.burstShots * 0.16);
        let coneDeg = diff.aimError * rangeF * moveF * sprayF;
        if (intentionalMiss) coneDeg *= 2.4;
        shotDir = randomConeDir(shotDir, coneDeg);

        const fired = fireWeapon({ actor, entity, store, phase, aimOverride: shotDir });
        if (fired) {
          ai.burstShots++;
          if (ai.burstShots >= maxBurst) {
            ai.burstShots = 0;
            ai.burstPause = autoWeapon
              ? 0.14 + (1 - diff.burstDiscipline) * 0.5 + Math.random() * 0.2
              : (weapon.fireMode === FIRE_MODE.SEMI ? 0.12 + Math.random() * 0.22 : 0.05);
          }
        }
      }
    }
  } else {
    actor.wantAds = false;
    wr.semiLatch = false;
    ai.burstShots = 0;
  }
  // semi-auto latch release so bots can re-pull the trigger
  if (weapon.fireMode !== FIRE_MODE.AUTO && wr.cooldown <= 0.01) wr.semiLatch = false;

  // ---------------- grenades (PRD §8 — hard bots use utility tactically)
  ai.nextGrenadeCheck -= dt;
  if (ai.nextGrenadeCheck <= 0) {
    ai.nextGrenadeCheck = 1.4 + Math.random() * 2.2;
    if (Math.random() < diff.grenadeChance && phase === PHASE.COMBAT) {
      const util = entity.loadout.utility;
      const tgtPos = visible ? visible.pos : (intel && world.time - intel.at < 5 ? intel.pos : null);
      if (tgtPos) {
        const gd = Math.hypot(tgtPos[0] - actor.pos[0], tgtPos[2] - actor.pos[2]);
        if (gd > 6 && gd < 26) {
          // don't frag teammates
          const friendlyNear = allies.some((a) => Math.hypot(a.pos[0] - tgtPos[0], a.pos[2] - tgtPos[2]) < 6);
          const savedYaw = actor.yaw;
          const savedPitch = actor.pitch;
          // lob arc: aim above the target
          const dx = tgtPos[0] - actor.pos[0];
          const dz = tgtPos[2] - actor.pos[2];
          actor.yaw = Math.atan2(-dx, -dz);
          actor.pitch = Math.min(0.75, 0.12 + gd * 0.016);
          if (util.flash > 0 && !visible && Math.random() > 0.35) {
            throwUtility({ actor, store, utilId: 'flash', power: Math.min(1, gd / 22) });
          } else if (util.frag > 0 && !friendlyNear) {
            throwUtility({ actor, store, utilId: 'frag', power: Math.min(1, gd / 24) });
          } else if (util.smoke > 0 && hpFrac < 0.5) {
            throwUtility({ actor, store, utilId: 'smoke', power: Math.min(1, gd / 22) });
          }
          actor.yaw = savedYaw;
          actor.pitch = savedPitch;
        }
      }
    }
  }

  // heal when safe
  if (!visible && hpFrac < 0.55 && entity.loadout.utility.medkit > 0 && actor.healing <= 0
      && world.time - ai.targetLastSeen > 5 && Math.random() < 0.01) {
    startHeal(actor, store);
  }

  // ---------------- ADS blend
  const wantAds = actor.wantAds && !actor.sprinting;
  const adsSpeed = 1 / Math.max(0.05, weapon.adsTime);
  actor.ads += ((wantAds ? 1 : 0) - actor.ads) * Math.min(1, dt * adsSpeed * 2.2);

  // ---------------- convert steering to input
  if (desiredDir[0] || desiredDir[1]) {
    const li = toLocalInput(actor, desiredDir[0], desiredDir[1]);
    input.forward = li.forward;
    input.right = li.right;
  }
  input.sprint = wantSprint && !visible;
  input.crouch = wantCrouch && !wantSprint;

  // ladder climbing
  const lad = ladderAt(actor.pos);
  if (lad && ai.pathGoal && ai.pathGoal[1] > actor.pos[1] + 1.2) {
    input.jump = true;
    input.forward = 1;
  }

  // stuck detection -> repath / jump
  const moved = Math.hypot(actor.pos[0] - ai.lastPos[0], actor.pos[2] - ai.lastPos[2]);
  if ((input.forward || input.right) && moved < 0.012) {
    ai.stuckTimer += dt;
    if (ai.stuckTimer > 0.55) {
      ai.stuckTimer = 0;
      ai.path = null;
      ai.repathAt = 0;
      // sidestep + hop
      input.right = Math.random() > 0.5 ? 1 : -1;
      input.jump = Math.random() > 0.6;
      // nudge destination to a nav-valid point
      if (ai.pathGoal) ai.pathGoal = clampToNav(ai.pathGoal);
    }
  } else {
    ai.stuckTimer = Math.max(0, ai.stuckTimer - dt);
  }
  ai.lastPos = [...actor.pos];

  moveActor(actor, input, dt, entity);
}
