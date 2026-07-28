/**
 * BREACHPOINT — Firing, ballistics, recoil, reload and utility resolution.
 * Implements PRD §6 (combat mechanics) and §7 (weapon behaviour).
 */
import { ACCURACY, MOVE, PHASE, SURFACE, RECOIL_STANCE, AIM_ASSIST } from './config.js';
import { getWeapon, FIRE_MODE, fireInterval, resolveDamage } from './weapons.js';
import { UTILITY } from './weapons.js';
import { castWorld, resolveSphere, hasLineOfSight } from './raycast.js';
import {
  world, currentWeaponRuntime, ensureWeaponRuntime, eyePosition, rayActor,
  spawnTracer, spawnImpact, spawnBlood, spawnMuzzle, spawnShell, spawnExplosion,
  spawnSmoke, addCamShake, actorHeight, headCenter, chestCenter, spawnDamageNumber,
} from './world.js';
import * as Audio from './audio.js';

let nidc = 1;
const nid = () => `g${nidc++}`;

// ------------------------------------------------------------------ spread model (PRD §6)
export function computeSpread(actor, weapon) {
  const speed = Math.hypot(actor.vel[0], actor.vel[2]);
  let spread = ACCURACY.baseSpreadDeg + weapon.baseSpread;

  if (!actor.grounded) {
    spread += ACCURACY.airSpreadDeg; // PRD §6 — jump-shooting heavily punished
  } else if (actor.sprinting && speed > 0.5) {
    spread += ACCURACY.sprintSpreadDeg;
  } else if (speed > 0.4) {
    spread += ACCURACY.moveSpreadDeg * Math.min(1, speed / MOVE.walkSpeed);
  }

  if (actor.crouch > 0.5 && speed < 0.6) spread *= ACCURACY.crouchSpreadMul;
  if (actor.ads > 0.5) spread *= ACCURACY.adsSpreadMul + (1 - actor.ads) * 0.4;

  spread += actor.spread; // accumulated bloom from firing
  return spread;
}

function randomConeDir(dir, spreadDeg) {
  if (spreadDeg <= 0.0001) return dir;
  const rad = (spreadDeg * Math.PI) / 180;
  // build orthonormal basis
  const up = Math.abs(dir[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const rx = dir[1] * up[2] - dir[2] * up[1];
  const ry = dir[2] * up[0] - dir[0] * up[2];
  const rz = dir[0] * up[1] - dir[1] * up[0];
  const rl = Math.hypot(rx, ry, rz) || 1;
  const ux = rx / rl, uy = ry / rl, uz = rz / rl;
  const vx = dir[1] * uz - dir[2] * uy;
  const vy = dir[2] * ux - dir[0] * uz;
  const vz = dir[0] * uy - dir[1] * ux;

  // gaussian-ish falloff inside the cone
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * Math.tan(rad);
  const ox = Math.cos(a) * r;
  const oy = Math.sin(a) * r;
  const nx = dir[0] + ux * ox + vx * oy;
  const ny = dir[1] + uy * ox + vy * oy;
  const nz = dir[2] + uz * ox + vz * oy;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

/**
 * Aim assist. Two mild effects, both off unless a target is already close to
 * the reticle:
 *   pull     rotates the view a little toward the nearest visible enemy
 *   friction slows the look while sweeping across a target
 * It never locks on: `pull` closes only a fraction of the remaining angle, and
 * only inside a few degrees.
 */
export function applyAimAssist(actor, dt, isTouch) {
  if (!AIM_ASSIST.enabled || !actor.alive) return 1;
  const cfg = isTouch ? AIM_ASSIST.touch : AIM_ASSIST.mouse;
  const eye = eyePosition(actor);
  const face = aimDirection(actor);

  let best = null;
  let bestAng = Infinity;
  for (const other of world.actorList) {
    if (!other.alive || other.team === actor.team || other.id === actor.id) continue;
    const c = chestCenter(other);
    const dx = c[0] - eye[0];
    const dy = c[1] - eye[1];
    const dz = c[2] - eye[2];
    const dist = Math.hypot(dx, dy, dz);
    if (dist > cfg.maxRange || dist < 0.6) continue;
    const inv = 1 / dist;
    const dot = (dx * inv) * face[0] + (dy * inv) * face[1] + (dz * inv) * face[2];
    if (dot <= 0) continue;
    const ang = Math.acos(Math.min(1, dot)) * 180 / Math.PI;
    if (ang > AIM_ASSIST.frictionAngleDeg) continue;
    if (!hasLineOfSight(eye, c, 0.05)) continue;
    if (ang < bestAng) { bestAng = ang; best = { actor: other, c, dist }; }
  }
  if (!best) return 1;

  const adsBoost = actor.ads > 0.5 ? cfg.adsBonus : 1;

  // magnetism
  if (bestAng <= cfg.maxAngleDeg) {
    const dx = best.c[0] - eye[0];
    const dy = best.c[1] - eye[1];
    const dz = best.c[2] - eye[2];
    const hyp = Math.hypot(dx, dz) || 0.0001;
    const wantYaw = Math.atan2(-dx, -dz);
    const wantPitch = Math.atan2(dy, hyp);
    let dyaw = wantYaw - actor.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const dpitch = wantPitch - actor.pitch;
    // Falls off toward the edge of the cone so it never feels like a snap.
    const strength = (1 - bestAng / cfg.maxAngleDeg) * cfg.pull * adsBoost;
    const k = Math.min(0.5, strength * dt);
    actor.yaw += dyaw * k;
    actor.pitch = Math.max(-1.5, Math.min(1.5, actor.pitch + dpitch * k));
  }

  // friction: returned so the input layer can scale raw look delta
  const fr = isTouch ? AIM_ASSIST.frictionTouch : AIM_ASSIST.frictionMouse;
  const t = 1 - Math.min(1, bestAng / AIM_ASSIST.frictionAngleDeg);
  return 1 - (1 - fr) * t;
}

export function aimDirection(actor) {
  const yaw = actor.yaw + actor.recoilYaw;
  const pitch = actor.pitch + actor.recoilPitch;
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}

// ------------------------------------------------------------------ ammo helpers
export function canFire(actor, wr, weapon) {
  if (!actor.alive) return false;
  if (wr.cooldown > 0) return false;
  if (wr.reloading) return false;
  if (wr.boltCycling) return false;
  if (wr.mag <= 0) return false;
  if (actor.healing > 0) return false;
  if (weapon.fireMode === FIRE_MODE.SEMI || weapon.fireMode === FIRE_MODE.PUMP || weapon.fireMode === FIRE_MODE.BOLT) {
    if (wr.semiLatch) return false;
  }
  return true;
}

export function startReload(actor, entity, store) {
  const wr = currentWeaponRuntime(actor);
  const weapon = getWeapon(actor.currentWeapon);
  if (wr.reloading || wr.boltCycling) return false;
  if (wr.mag >= weapon.magazine) return false;
  if (wr.reserve <= 0) return false;
  wr.reloading = true;
  wr.reloadEnd = world.time + weapon.reloadTime;
  if (weapon.shellReload) {
    wr.shellReloadNext = world.time + weapon.shellReloadTime;
    wr.reloadEnd = world.time + weapon.shellReloadTime * (weapon.magazine - wr.mag);
  }
  const kind = weapon.shellReload ? 'shell' : (weapon.fireMode === FIRE_MODE.BOLT ? 'bolt' : 'mag');
  Audio.playReload({
    kind: weapon.shellReload ? 'pump' : kind,
    pos: actor.isPlayer ? null : actor.pos,
    duration: weapon.reloadTime,
  });
  return true;
}

export function tickReload(actor, store) {
  const wr = currentWeaponRuntime(actor);
  const weapon = getWeapon(actor.currentWeapon);
  if (wr.boltCycling && world.time >= wr.boltEnd) {
    wr.boltCycling = false;
  }
  if (!wr.reloading) return;

  if (weapon.shellReload) {
    // Breacher-12: shell-by-shell (PRD §7.1 "3.0 dtk/shell" cycle)
    if (world.time >= wr.shellReloadNext) {
      if (wr.mag < weapon.magazine && wr.reserve > 0) {
        wr.mag += 1;
        wr.reserve -= 1;
        Audio.playReload({ kind: 'shell', pos: actor.isPlayer ? null : actor.pos });
        wr.shellReloadNext = world.time + weapon.shellReloadTime;
      }
      if (wr.mag >= weapon.magazine || wr.reserve <= 0) {
        wr.reloading = false;
        Audio.playReload({ kind: 'pump', pos: actor.isPlayer ? null : actor.pos });
        store.setAmmo(actor.id, actor.currentWeapon, wr.mag, wr.reserve);
      }
    }
    return;
  }

  if (world.time >= wr.reloadEnd) {
    const need = weapon.magazine - wr.mag;
    const take = Math.min(need, wr.reserve);
    wr.mag += take;
    wr.reserve -= take;
    wr.reloading = false;
    wr.recoilIndex = 0;
    store.setAmmo(actor.id, actor.currentWeapon, wr.mag, wr.reserve);
  }
}

/** Interrupt a reload (weapon swap / death). */
export function cancelReload(actor) {
  const wr = currentWeaponRuntime(actor);
  wr.reloading = false;
}

// ------------------------------------------------------------------ FIRE
/**
 * Fire one shot. Fully deterministic given RNG draw.
 * @returns {boolean} whether a shot was actually discharged
 */
export function fireWeapon({ actor, entity, store, phase, aimOverride, forcedTarget }) {
  const weapon = getWeapon(actor.currentWeapon);
  const wr = ensureWeaponRuntime(actor, actor.currentWeapon);

  if (!canFire(actor, wr, weapon)) {
    if (wr.mag <= 0 && !wr.reloading && wr.cooldown <= 0) {
      if (actor.isPlayer) Audio.playDryFire(null);
      wr.cooldown = 0.25;
      // auto-reload convenience
      startReload(actor, entity, store);
    }
    return false;
  }
  if (phase !== PHASE.COMBAT && phase !== PHASE.SUDDEN_DEATH) return false;

  wr.mag -= 1;
  wr.cooldown = fireInterval(weapon);
  wr.lastShot = world.time;
  actor.lastFireTime = world.time;
  if (weapon.fireMode !== FIRE_MODE.AUTO) wr.semiLatch = true;
  if (weapon.fireMode === FIRE_MODE.BOLT) {
    wr.boltCycling = true;
    wr.boltEnd = world.time + (weapon.boltTime || 1.2);
    setTimeout(() => Audio.playReload({ kind: 'bolt', pos: actor.isPlayer ? null : actor.pos }), 220);
  }
  if (weapon.fireMode === FIRE_MODE.PUMP) {
    wr.boltCycling = true;
    wr.boltEnd = world.time + 0.62;
    setTimeout(() => Audio.playReload({ kind: 'pump', pos: actor.isPlayer ? null : actor.pos }), 200);
  }

  store.registerShot(actor.id);

  const origin = eyePosition(actor);
  const baseDir = aimOverride || aimDirection(actor);
  const spread = computeSpread(actor, weapon);

  // muzzle position roughly 0.5m forward, slightly down-right of the eye
  const muzzle = [
    origin[0] + baseDir[0] * 0.55,
    origin[1] + baseDir[1] * 0.55 - 0.08,
    origin[2] + baseDir[2] * 0.55,
  ];
  actor.muzzleWorld = muzzle;
  spawnMuzzle(muzzle, baseDir, weapon.id === 'breacher12' ? 1.7 : weapon.id === 'vantage50' ? 1.5 : 1, weapon.id);
  spawnShell(muzzle, baseDir, weapon.category);

  Audio.playGunshot({
    profile: weapon.audio.profile,
    pitch: weapon.audio.pitch,
    gain: weapon.audio.gain,
    tail: weapon.audio.tail,
    pos: actor.isPlayer ? null : muzzle,
  });

  if (actor.isPlayer) {
    addCamShake(weapon.recoil.kickback * 3.4);
  }

  const pellets = weapon.pellets || 1;
  for (let p = 0; p < pellets; p++) {
    let dir = baseDir;
    const coneDeg = pellets > 1
      ? Math.max(spread, weapon.pelletSpreadDeg || 2.5)
      : spread;
    dir = randomConeDir(baseDir, coneDeg);
    resolveBullet({ actor, entity, store, origin, dir, weapon, isPellet: pellets > 1 });
  }

  // recoil impulse (PRD §6 — unique per-weapon pattern)
  applyRecoil(actor, weapon, wr);

  // accumulated bloom
  actor.spread = Math.min(6.5, actor.spread + weapon.baseSpread * 0.55 + 0.12);

  return true;
}

/**
 * Stance multiplier for recoil. Firing planted, and especially planted while
 * crouched, is markedly more controllable than firing on the move.
 */
export function recoilStanceMul(actor) {
  const speed = Math.hypot(actor.vel[0], actor.vel[2]);
  const still = speed < RECOIL_STANCE.stillSpeed;
  let m;
  if (!actor.grounded) m = RECOIL_STANCE.airborne;
  else if (actor.sprinting && speed > 0.5) m = RECOIL_STANCE.sprinting;
  else if (!still) m = RECOIL_STANCE.moving;
  else if (actor.crouch > 0.5) m = RECOIL_STANCE.crouchStill;
  else m = RECOIL_STANCE.standingStill;
  if (actor.ads > 0.5) m *= RECOIL_STANCE.adsBonus;
  return m;
}

function applyRecoil(actor, weapon, wr) {
  const pat = weapon.pattern[wr.recoilIndex % weapon.pattern.length];
  wr.recoilIndex += 1;
  const stance = recoilStanceMul(actor);
  const adsDamp = 1 - actor.ads * 0.32;
  const crouchDamp = 1 - actor.crouch * 0.14;
  const v = (weapon.recoil.vertical * pat[1]) * adsDamp * crouchDamp * stance;
  const h = (weapon.recoil.horizontal * pat[0]) * adsDamp * crouchDamp * stance;
  actor.recoilVelP += (v * Math.PI) / 180 * 12;
  actor.recoilVelY += (h * Math.PI) / 180 * 12;
  actor.kickback = Math.min(1, actor.kickback + weapon.recoil.kickback * 8);
}

/** Recoil recovery + spread decay, run every frame. */
export function tickRecoil(actor, dt) {
  const weapon = getWeapon(actor.currentWeapon);
  const rec = weapon.recoil.recovery;
  actor.recoilPitch += actor.recoilVelP * dt;
  actor.recoilYaw += actor.recoilVelY * dt;
  actor.recoilVelP -= actor.recoilVelP * Math.min(1, dt * 18);
  actor.recoilVelY -= actor.recoilVelY * Math.min(1, dt * 18);
  // pull back toward zero
  actor.recoilPitch -= actor.recoilPitch * Math.min(1, dt * rec * 0.55);
  actor.recoilYaw -= actor.recoilYaw * Math.min(1, dt * rec * 0.55);
  actor.kickback -= actor.kickback * Math.min(1, dt * 9);

  const since = world.time - actor.lastFireTime;
  if (since > 0.12) {
    actor.spread = Math.max(0, actor.spread - ACCURACY.recoverPerSec * dt);
  }
  const wr = currentWeaponRuntime(actor);
  if (wr.cooldown > 0) wr.cooldown = Math.max(0, wr.cooldown - dt);
}

/** Trace a single bullet against actors + world and apply damage. */
function resolveBullet({ actor, entity, store, origin, dir, weapon, isPellet }) {
  const maxDist = weapon.farRange * 2.2;
  const worldHit = castWorld(origin, dir, maxDist);
  let closestT = worldHit.hit ? worldHit.t : maxDist;
  let hitActor = null;
  let hitZone = null;

  for (const other of world.actorList) {
    if (other.id === actor.id) continue;
    if (!other.alive) continue;
    const r = rayActor(origin, dir, other, closestT);
    if (r && r.t < closestT) {
      closestT = r.t;
      hitActor = other;
      hitZone = r.zone;
    }
  }

  const endPoint = [
    origin[0] + dir[0] * closestT,
    origin[1] + dir[1] * closestT,
    origin[2] + dir[2] * closestT,
  ];

  // tracer (PRD §13 — thin tracers, mostly for full-auto)
  if (!isPellet || Math.random() < 0.4) {
    spawnTracer(origin, endPoint, weapon.id, weapon.tracer);
  }

  if (hitActor) {
    const dmgDir = [
      hitActor.pos[0] - actor.pos[0],
      0,
      hitActor.pos[2] - actor.pos[2],
    ];
    const dl = Math.hypot(dmgDir[0], dmgDir[2]) || 1;
    dmgDir[0] /= dl; dmgDir[2] /= dl;

    spawnBlood(endPoint, dir);
    Audio.playImpact({ surface: SURFACE.BODY, pos: endPoint });

    const dealt = store.applyDamage({
      targetId: hitActor.id,
      attackerId: actor.id,
      weaponId: weapon.id,
      distance: closestT,
      hitZone,
      dirFromAttacker: dmgDir,
      cause: 'bullet',
    });

    // Floating damage number, only for the local player's own hits.
    if (actor.isPlayer && dealt > 0) {
      spawnDamageNumber(endPoint, dealt, hitZone === 'head', !hitActor.alive);
    }
  } else if (worldHit.hit) {
    spawnImpact(worldHit.point, worldHit.normal, worldHit.surf);
    Audio.playImpact({ surface: worldHit.surf, pos: worldHit.point });
  }

  // whizz-by for the local player
  const localId = store.playerId;
  if (localId && actor.id !== localId) {
    const local = world.actors[localId];
    if (local && local.alive) {
      const ep = eyePosition(local);
      const ax = ep[0] - origin[0], ay = ep[1] - origin[1], az = ep[2] - origin[2];
      const proj = ax * dir[0] + ay * dir[1] + az * dir[2];
      if (proj > 0 && proj < closestT + 2) {
        const px = origin[0] + dir[0] * proj, py = origin[1] + dir[1] * proj, pz = origin[2] + dir[2] * proj;
        const d = Math.hypot(px - ep[0], py - ep[1], pz - ep[2]);
        if (d > 0.45 && d < 2.4) Audio.playWhizz([px, py, pz]);
      }
    }
  }
}

// ------------------------------------------------------------------ GRENADES (PRD §7.3, §13)
export function throwUtility({ actor, store, utilId, power = 1 }) {
  const u = UTILITY[utilId];
  if (!u) return false;
  if (!store.consumeUtility(actor.id, utilId)) return false;

  const origin = eyePosition(actor);
  const dir = aimDirection(actor);
  const speed = u.throwSpeed * (0.55 + power * 0.65);
  const p = {
    key: nid(),
    kind: utilId,
    owner: actor.id,
    ownerTeam: actor.team,
    pos: [origin[0] + dir[0] * 0.6, origin[1] + dir[1] * 0.6, origin[2] + dir[2] * 0.6],
    vel: [
      dir[0] * speed + actor.vel[0] * 0.4,
      dir[1] * speed + 3.1,
      dir[2] * speed + actor.vel[2] * 0.4,
    ],
    rot: [0, 0, 0],
    spin: [(Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12],
    fuse: u.fuse,
    t: 0,
    resting: 0,
    exploded: false,
  };
  world.projectiles.push(p);
  Audio.playPinPull(actor.isPlayer ? null : actor.pos);
  return true;
}

export function tickProjectiles(dt, store, phase) {
  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const p = world.projectiles[i];
    p.t += dt;
    p.vel[1] += -19 * dt;
    p.pos[0] += p.vel[0] * dt;
    p.pos[1] += p.vel[1] * dt;
    p.pos[2] += p.vel[2] * dt;

    const res = resolveSphere(p.pos, p.vel, 0.13, 0.4, 0.68);
    p.pos = res.pos;
    if (res.bounced) {
      const spd = Math.hypot(res.vel[0], res.vel[1], res.vel[2]);
      if (spd > 1.6) Audio.playBounce(p.pos, 'metal');
      p.spin = [p.spin[0] * 0.7, p.spin[1] * 0.7, p.spin[2] * 0.7];
    }
    p.vel = res.vel;
    if (res.grounded) {
      p.vel[0] *= 1 - Math.min(1, dt * 3.2);
      p.vel[2] *= 1 - Math.min(1, dt * 3.2);
    }
    p.rot[0] += p.spin[0] * dt;
    p.rot[1] += p.spin[1] * dt;
    p.rot[2] += p.spin[2] * dt;

    if (p.t >= p.fuse && !p.exploded) {
      p.exploded = true;
      detonate(p, store, phase);
      world.projectiles.splice(i, 1);
    } else if (p.t > 12) {
      world.projectiles.splice(i, 1);
    }
  }
}

function detonate(p, store, phase) {
  const u = UTILITY[p.kind];
  if (p.kind === 'frag') {
    spawnExplosion(p.pos, u.radius);
    Audio.playExplosion(p.pos);
    const localId = store.playerId;
    for (const a of world.actorList) {
      if (!a.alive) continue;
      const c = chestCenter(a);
      const dist = Math.hypot(c[0] - p.pos[0], c[1] - p.pos[1], c[2] - p.pos[2]);
      if (dist > u.radius * 1.35) continue;
      // line of sight check so walls actually protect you
      if (!hasLineOfSight(p.pos, c, 0.05)) continue;
      const f = Math.max(0, 1 - dist / (u.radius * 1.15));
      const dmg = u.minDamage + (u.maxDamage - u.minDamage) * f * f;
      const dir = [c[0] - p.pos[0], 0, c[2] - p.pos[2]];
      const dl = Math.hypot(dir[0], dir[2]) || 1;
      store.applyDamage({
        targetId: a.id,
        attackerId: p.owner,
        weaponId: null,
        amount: dmg,
        hitZone: 'body',
        dirFromAttacker: [dir[0] / dl, 0, dir[2] / dl],
        cause: 'FRAG',
      });
      if (a.id === localId) addCamShake(1.2 * f);
    }
    return;
  }

  if (p.kind === 'flash') {
    const localId = store.playerId;
    world.flashEvents.push({ pos: [...p.pos], t: 0 });
    for (const a of world.actorList) {
      if (!a.alive) continue;
      const e = eyePosition(a);
      const dist = Math.hypot(e[0] - p.pos[0], e[1] - p.pos[1], e[2] - p.pos[2]);
      if (dist > u.radius * 1.6) continue;
      if (!hasLineOfSight(p.pos, e, 0.05)) continue;
      // facing check: looking at the flash = full blind
      const toFlash = [p.pos[0] - e[0], p.pos[1] - e[1], p.pos[2] - e[2]];
      const tl = Math.hypot(toFlash[0], toFlash[1], toFlash[2]) || 1;
      const look = aimDirection(a);
      const dot = (toFlash[0] / tl) * look[0] + (toFlash[1] / tl) * look[1] + (toFlash[2] / tl) * look[2];
      const facing = Math.max(0, dot);
      const distFactor = Math.max(0.2, 1 - dist / (u.radius * 1.6));
      const strength = facing * distFactor;
      if (strength < 0.14) continue;
      const dur = u.blindDuration * strength;
      store.blind(a.id, dur);
      if (a.id === localId) {
        world.localBlind = Math.max(world.localBlind, dur);
        world.localBlindMax = Math.max(0.6, dur);
        Audio.applyDeafen(dur);
      }
      if (a.ai) a.ai.blindUntil = world.time + dur;
    }
    Audio.playFlashbang(p.pos, false);
    spawnExplosion(p.pos, 1.2);
    return;
  }

  if (p.kind === 'smoke') {
    spawnSmoke(p.pos, u.radius, u.duration);
    Audio.playSmokePop(p.pos);
  }
}

/** Medkit channel (PRD §7.3 — 3s, cannot sprint). */
export function startHeal(actor, store) {
  const e = store.entities[actor.id];
  if (!e) return false;
  if ((e.loadout.utility.medkit || 0) <= 0) return false;
  if (e.hp >= 100) return false;
  if (actor.sprinting) return false;
  if (actor.healing > 0) return false;
  if (!store.consumeUtility(actor.id, 'medkit')) return false;
  actor.healing = UTILITY.medkit.useTime;
  actor.healUntil = world.time + UTILITY.medkit.useTime;
  return true;
}

export function tickHeal(actor, dt, store) {
  if (actor.healing <= 0) return;
  if (actor.sprinting) { actor.healing = 0; return; } // PRD §7.3 — cancelled by sprint
  actor.healing = Math.max(0, actor.healing - dt);
  if (actor.healing <= 0) {
    store.heal(actor.id, UTILITY.medkit.healAmount);
    if (actor.isPlayer) Audio.playHeal();
  }
}

export { randomConeDir };
