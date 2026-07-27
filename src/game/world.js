/**
 * BREACHPOINT — Mutable runtime world.
 *
 * The zustand store holds *authoritative match state* (score, HP, credits).
 * This module holds *per-frame simulation state* (positions, velocities, weapon
 * timers, projectiles, VFX rings) which changes 60x/second and must never go
 * through React. The renderer reads these plain objects directly in useFrame.
 */
import { MOVE, COMBAT, ARMOR } from './config.js';
import { getWeapon } from './weapons.js';
import { groundHeightAt } from './raycast.js';

/** @typedef {{id:string, pos:number[], vel:number[], yaw:number, pitch:number}} Actor */

export const world = {
  time: 0,
  /** @type {Record<string, any>} */
  actors: {},
  actorList: [],
  projectiles: [], // live grenades
  smokes: [], // active smoke volumes (vision blockers)
  tracers: [],
  impacts: [],
  explosions: [],
  muzzles: [],
  bloodHits: [],
  decals: [],
  shells: [],
  flashEvents: [],
  camShake: 0,
  camShakeDecay: 6,
  localBlind: 0,
  localBlindMax: 1,
  hitmarkerTime: -10,
  hitmarkerKind: 'body',
  damageIndicators: [],
  paused: false,
  spectatorOf: null,
  aceCamActive: false,
};

let idc = 1;
const nid = () => `p${idc++}`;

/** Runtime weapon state per actor per weapon. */
function makeWeaponRuntime(weaponId) {
  const w = getWeapon(weaponId);
  return {
    id: weaponId,
    mag: w.magazine,
    reserve: w.reserve,
    cooldown: 0,
    reloading: false,
    reloadEnd: 0,
    shellReloadNext: 0,
    boltCycling: false,
    boltEnd: 0,
    recoilIndex: 0,
    lastShot: -99,
    triggerHeld: false,
    semiLatch: false,
  };
}

export function createActorRuntime(entity) {
  const a = {
    id: entity.id,
    team: entity.team,
    isPlayer: entity.isPlayer,
    isBot: entity.isBot,
    pos: [...entity.pos],
    prevPos: [...entity.pos],
    vel: [0, 0, 0],
    yaw: entity.yaw || 0,
    pitch: 0,
    desiredYaw: entity.yaw || 0,
    desiredPitch: 0,
    grounded: true,
    crouch: 0, // 0..1 blend
    wantCrouch: false,
    sprinting: false,
    height: MOVE.standHeight,
    onLadder: false,
    alive: true,
    hp: COMBAT.maxHP,
    // weapon runtime
    weapons: {},
    currentWeapon: entity.loadout.current || 'px1',
    ads: 0, // 0..1 blend
    wantAds: false,
    spread: 0,
    recoilPitch: 0,
    recoilYaw: 0,
    recoilVelP: 0,
    recoilVelY: 0,
    kickback: 0,
    viewBob: 0,
    stepPhase: 0,
    lastStepAt: 0,
    surface: 'concrete',
    // utility
    throwCharge: 0,
    pendingThrow: null,
    healing: 0,
    healUntil: 0,
    // ai
    ai: null,
    muzzleWorld: [0, 0, 0],
    lastFireTime: -99,
    lastNoiseAt: -99,
    scopeGlint: 0,
    deathTime: -99,
    deathYaw: 0,
    ragdoll: 0,
  };
  a.weapons[a.currentWeapon] = makeWeaponRuntime(a.currentWeapon);
  return a;
}

export function resetWorldActors(entities, order) {
  world.actors = {};
  world.actorList = [];
  for (const id of order) {
    const e = entities[id];
    const a = createActorRuntime(e);
    world.actors[id] = a;
    world.actorList.push(a);
  }
  world.projectiles.length = 0;
  world.smokes.length = 0;
  world.tracers.length = 0;
  world.impacts.length = 0;
  world.explosions.length = 0;
  world.muzzles.length = 0;
  world.decals.length = 0;
  world.shells.length = 0;
  world.damageIndicators.length = 0;
  world.camShake = 0;
  world.localBlind = 0;
}

export function syncActorFromEntity(actor, entity) {
  actor.alive = entity.alive;
  actor.hp = entity.hp;
  actor.team = entity.team;
  if (actor.currentWeapon !== entity.loadout.current) {
    actor.currentWeapon = entity.loadout.current;
    if (!actor.weapons[actor.currentWeapon]) {
      actor.weapons[actor.currentWeapon] = makeWeaponRuntime(actor.currentWeapon);
    }
    const wr = actor.weapons[actor.currentWeapon];
    wr.reloading = false;
    wr.boltCycling = false;
  }
}

export function ensureWeaponRuntime(actor, weaponId) {
  if (!actor.weapons[weaponId]) actor.weapons[weaponId] = makeWeaponRuntime(weaponId);
  return actor.weapons[weaponId];
}

export function currentWeaponRuntime(actor) {
  return ensureWeaponRuntime(actor, actor.currentWeapon);
}

/** Reset positions/ammo at round start. */
export function respawnActor(actor, entity) {
  actor.pos = [...entity.pos];
  actor.prevPos = [...entity.pos];
  actor.vel = [0, 0, 0];
  actor.yaw = entity.yaw || 0;
  actor.desiredYaw = actor.yaw;
  actor.pitch = 0;
  actor.desiredPitch = 0;
  actor.crouch = 0;
  actor.wantCrouch = false;
  actor.sprinting = false;
  actor.alive = true;
  actor.hp = entity.hp;
  actor.ads = 0;
  actor.wantAds = false;
  actor.spread = 0;
  actor.recoilPitch = 0;
  actor.recoilYaw = 0;
  actor.kickback = 0;
  actor.healing = 0;
  actor.onLadder = false;
  actor.weapons = {};
  actor.currentWeapon = entity.loadout.current || 'px1';
  const wr = ensureWeaponRuntime(actor, actor.currentWeapon);
  const ammo = entity.loadout.ammo[actor.currentWeapon];
  if (ammo) { wr.mag = ammo.mag; wr.reserve = ammo.reserve; }
  if (entity.loadout.sidearm) {
    const sr = ensureWeaponRuntime(actor, entity.loadout.sidearm);
    const sa = entity.loadout.ammo[entity.loadout.sidearm];
    if (sa) { sr.mag = sa.mag; sr.reserve = sa.reserve; }
  }
  actor.deathTime = -99;
  actor.ragdoll = 0;
}

// ------------------------------------------------------------------ hitboxes
/**
 * Actor hitbox model (PRD §6: head 4x, body 1x, limb 0.75x).
 * Head    : sphere at eye level
 * Body    : vertical capsule (torso+pelvis)
 * Limbs   : wider, shorter box around the body
 */
export function actorHeight(actor) {
  return MOVE.standHeight - (MOVE.standHeight - MOVE.crouchHeight) * actor.crouch;
}

export function eyePosition(actor) {
  const h = actorHeight(actor);
  return [actor.pos[0], actor.pos[1] + h + MOVE.eyeOffset, actor.pos[2]];
}

export function headCenter(actor) {
  const h = actorHeight(actor);
  return [actor.pos[0], actor.pos[1] + h - 0.14, actor.pos[2]];
}

export function chestCenter(actor) {
  const h = actorHeight(actor);
  return [actor.pos[0], actor.pos[1] + h * 0.62, actor.pos[2]];
}

const HEAD_R = 0.155;
const BODY_R = 0.29;
const LIMB_R = 0.46;

/**
 * Ray vs actor. Returns { t, zone } or null.
 * Head sphere first, then a body cylinder, then a limb cylinder.
 */
export function rayActor(origin, dir, actor, maxT) {
  if (!actor.alive) return null;
  const h = actorHeight(actor);
  const baseY = actor.pos[1];
  const cx = actor.pos[0];
  const cz = actor.pos[2];

  // Broad phase: cylinder of radius LIMB_R
  const bt = rayCylinder(origin, dir, cx, cz, baseY, baseY + h + 0.05, LIMB_R, maxT);
  if (bt == null) return null;

  // Head sphere
  const hc = [cx, baseY + h - 0.14, cz];
  const ht = raySphere(origin, dir, hc, HEAD_R, maxT);

  // Body cylinder (shoulders -> hips)
  const bodyTop = baseY + h - 0.28;
  const bodyBot = baseY + h * 0.42;
  const bodyT = rayCylinder(origin, dir, cx, cz, bodyBot, bodyTop, BODY_R, maxT);

  // Limb cylinder (full height, wide)
  const limbT = bt;

  let best = null;
  if (ht != null) best = { t: ht, zone: 'head' };
  if (bodyT != null && (!best || bodyT < best.t)) best = { t: bodyT, zone: 'body' };
  if (limbT != null && (!best || limbT < best.t)) best = { t: limbT, zone: 'limb' };
  return best;
}

function raySphere(o, d, c, r, maxT) {
  const ox = o[0] - c[0], oy = o[1] - c[1], oz = o[2] - c[2];
  const b = ox * d[0] + oy * d[1] + oz * d[2];
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  let t = -b - s;
  if (t < 0) t = -b + s;
  if (t < 0 || t > maxT) return null;
  return t;
}

function rayCylinder(o, d, cx, cz, y0, y1, r, maxT) {
  const ox = o[0] - cx, oz = o[2] - cz;
  const a = d[0] * d[0] + d[2] * d[2];
  let tEnter = 0, tExit = maxT;
  if (a < 1e-8) {
    if (ox * ox + oz * oz > r * r) return null;
  } else {
    const b = 2 * (ox * d[0] + oz * d[2]);
    const c = ox * ox + oz * oz - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    const t1 = (-b - s) / (2 * a);
    const t2 = (-b + s) / (2 * a);
    tEnter = Math.max(tEnter, Math.min(t1, t2));
    tExit = Math.min(tExit, Math.max(t1, t2));
    if (tEnter > tExit) return null;
  }
  // clip against caps
  if (Math.abs(d[1]) > 1e-8) {
    const ty0 = (y0 - o[1]) / d[1];
    const ty1 = (y1 - o[1]) / d[1];
    const tlo = Math.min(ty0, ty1);
    const thi = Math.max(ty0, ty1);
    tEnter = Math.max(tEnter, tlo);
    tExit = Math.min(tExit, thi);
    if (tEnter > tExit) return null;
  } else if (o[1] < y0 || o[1] > y1) return null;

  if (tEnter < 0 || tEnter > maxT) return null;
  return tEnter;
}

// ------------------------------------------------------------------ smoke vision blocking (PRD §7.3, §13)
/** Does the segment a->b pass through an active smoke cloud? */
export function segmentBlockedBySmoke(a, b) {
  if (!world.smokes.length) return false;
  for (const s of world.smokes) {
    if (s.opacity < 0.25) continue;
    const r = s.radius * Math.min(1, s.grow);
    // distance from segment to sphere centre
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len2 = dx * dx + dy * dy + dz * dz;
    if (len2 < 1e-6) continue;
    let t = ((s.pos[0] - a[0]) * dx + (s.pos[1] - a[1]) * dy + (s.pos[2] - a[2]) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a[0] + dx * t, py = a[1] + dy * t, pz = a[2] + dz * t;
    const d = Math.hypot(px - s.pos[0], py - s.pos[1], pz - s.pos[2]);
    if (d < r * 0.82) return true;
  }
  return false;
}

// ------------------------------------------------------------------ transient VFX helpers
export function spawnTracer(from, to, weaponId, thickness = 1) {
  world.tracers.push({
    key: nid(), from: [...from], to: [...to], t: 0, life: 0.09 + thickness * 0.03, weaponId, thickness,
  });
  if (world.tracers.length > 90) world.tracers.shift();
}

export function spawnImpact(point, normal, surf) {
  world.impacts.push({ key: nid(), pos: [...point], normal: [...normal], surf, t: 0, life: 0.42 });
  if (world.impacts.length > 70) world.impacts.shift();
  world.decals.push({ key: nid(), pos: [...point], normal: [...normal], surf, t: 0, life: 14 });
  if (world.decals.length > 90) world.decals.shift();
}

export function spawnBlood(point, dir) {
  world.bloodHits.push({ key: nid(), pos: [...point], dir: [...dir], t: 0, life: 0.34 });
  if (world.bloodHits.length > 40) world.bloodHits.shift();
}

export function spawnMuzzle(pos, dir, scale = 1, weaponId = 'px1') {
  world.muzzles.push({ key: nid(), pos: [...pos], dir: [...dir], t: 0, life: 0.06, scale, weaponId });
  if (world.muzzles.length > 24) world.muzzles.shift();
}

export function spawnShell(pos, dir, kind = 'rifle') {
  const side = [dir[2], 0, -dir[0]];
  world.shells.push({
    key: nid(),
    pos: [pos[0], pos[1], pos[2]],
    vel: [side[0] * 2.4 + (Math.random() - 0.5), 2.2 + Math.random(), side[2] * 2.4 + (Math.random() - 0.5)],
    rot: [Math.random() * 6, Math.random() * 6, Math.random() * 6],
    spin: [(Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18],
    t: 0, life: 2.4, kind,
  });
  if (world.shells.length > 40) world.shells.shift();
}

export function spawnExplosion(pos, radius) {
  world.explosions.push({ key: nid(), pos: [...pos], radius, t: 0, life: 1.0 });
  if (world.explosions.length > 10) world.explosions.shift();
}

export function spawnSmoke(pos, radius, duration) {
  world.smokes.push({
    key: nid(), pos: [...pos], radius, t: 0, life: duration, grow: 0, opacity: 0,
    seed: Math.random() * 100,
  });
}

export function addCamShake(amount) {
  world.camShake = Math.min(1.6, world.camShake + amount);
}

export function addDamageIndicator(dir) {
  world.damageIndicators.push({ key: nid(), dir: [...dir], t: 0, life: 1.2 });
  if (world.damageIndicators.length > 8) world.damageIndicators.shift();
}

/** Advance all transient VFX. Called once per frame from the sim loop. */
export function tickTransients(dt) {
  const step = (arr) => {
    for (let i = arr.length - 1; i >= 0; i--) {
      arr[i].t += dt;
      if (arr[i].t >= arr[i].life) arr.splice(i, 1);
    }
  };
  step(world.tracers);
  step(world.impacts);
  step(world.muzzles);
  step(world.bloodHits);
  step(world.decals);
  step(world.explosions);
  step(world.damageIndicators);

  // shells fall with gravity
  for (let i = world.shells.length - 1; i >= 0; i--) {
    const s = world.shells[i];
    s.t += dt;
    s.vel[1] += -18 * dt;
    s.pos[0] += s.vel[0] * dt;
    s.pos[1] += s.vel[1] * dt;
    s.pos[2] += s.vel[2] * dt;
    const g = groundHeightAt(s.pos[0], s.pos[2], s.pos[1] + 2);
    if (s.pos[1] < g + 0.02) {
      s.pos[1] = g + 0.02;
      s.vel[1] *= -0.34;
      s.vel[0] *= 0.6;
      s.vel[2] *= 0.6;
      if (Math.abs(s.vel[1]) < 0.4) s.vel[1] = 0;
    }
    s.rot[0] += s.spin[0] * dt;
    s.rot[1] += s.spin[1] * dt;
    s.rot[2] += s.spin[2] * dt;
    if (s.t >= s.life) world.shells.splice(i, 1);
  }

  // smokes expand then dissipate (PRD §13)
  for (let i = world.smokes.length - 1; i >= 0; i--) {
    const s = world.smokes[i];
    s.t += dt;
    s.grow = Math.min(1, s.t / 1.1);
    const fadeIn = Math.min(1, s.t / 0.7);
    const fadeOut = Math.max(0, Math.min(1, (s.life - s.t) / 2.2));
    s.opacity = fadeIn * fadeOut;
    if (s.t >= s.life) world.smokes.splice(i, 1);
  }

  world.camShake = Math.max(0, world.camShake - world.camShakeDecay * dt * (0.5 + world.camShake));
  world.time += dt;
}

export function armorSpeedMul(armorId) {
  return (ARMOR[armorId] || ARMOR.none).speedMul;
}

// QA hook: lets headless tooling inspect/reposition actors.
if (typeof window !== 'undefined') window.__BP_WORLD__ = world;
