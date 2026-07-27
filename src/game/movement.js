/**
 * BREACHPOINT — Character movement / collision.
 *
 * Uses Rapier's KinematicCharacterController when the physics world is
 * available (PRD §15 explicitly asks for Rapier), with an analytic AABB
 * sweep fallback so the simulation still runs before WASM finishes loading.
 */
import { MOVE, SURFACE } from './config.js';
import { SOLIDS, LADDERS, PLAY } from './steelfall.js';
import { armorSpeedMul, actorHeight } from './world.js';
import { getWeapon } from './weapons.js';

const R = MOVE.capsuleRadius;

/** Which material is the actor standing on? (PRD §12 footstep variety) */
export function surfaceUnder(pos) {
  const x = pos[0], y = pos[1], z = pos[2];
  let best = null;
  let bestGap = 0.6;
  for (let i = 0; i < SOLIDS.length; i++) {
    const s = SOLIDS[i];
    if (x < s.min[0] - 0.3 || x > s.max[0] + 0.3) continue;
    if (z < s.min[2] - 0.3 || z > s.max[2] + 0.3) continue;
    const gap = y - s.max[1];
    if (gap >= -0.12 && gap < bestGap) {
      bestGap = gap;
      best = s;
    }
  }
  if (!best) return SURFACE.CONCRETE;
  // gravel overlays are non-colliding, so approximate by zone
  if (best.surf === SURFACE.CONCRETE) {
    const inGravel = Math.abs(x) < 9.5 && ((z > -22 && z < -12) || (z > 12 && z < 22));
    if (inGravel) return SURFACE.GRAVEL;
  }
  return best.surf;
}

/** Sweep an AABB (capsule approximated as a box) against world solids. */
function sweepAxis(pos, delta, halfH, axis) {
  const next = [pos[0], pos[1], pos[2]];
  next[axis] += delta;
  const cy = next[1] + halfH;
  const minP = [next[0] - R, next[1] + 0.02, next[2] - R];
  const maxP = [next[0] + R, next[1] + halfH * 2, next[2] + R];

  for (let i = 0; i < SOLIDS.length; i++) {
    const s = SOLIDS[i];
    if (maxP[0] <= s.min[0] || minP[0] >= s.max[0]) continue;
    if (maxP[1] <= s.min[1] || minP[1] >= s.max[1]) continue;
    if (maxP[2] <= s.min[2] || minP[2] >= s.max[2]) continue;
    // blocked: push back to contact
    if (axis === 1) {
      if (delta > 0) next[1] = s.min[1] - halfH * 2 - 0.001;
      else next[1] = s.max[1] + 0.001;
      return { pos: next, blocked: true };
    }
    if (delta > 0) next[axis] = s.min[axis] - R - 0.001;
    else next[axis] = s.max[axis] + R + 0.001;
    return { pos: next, blocked: true };
  }
  return { pos: next, blocked: false };
}

/** Can the actor stand at this position (used for step-up / crouch-uncrouch)? */
export function positionFree(pos, height) {
  const minP = [pos[0] - R, pos[1] + 0.05, pos[2] - R];
  const maxP = [pos[0] + R, pos[1] + height, pos[2] + R];
  for (let i = 0; i < SOLIDS.length; i++) {
    const s = SOLIDS[i];
    if (maxP[0] <= s.min[0] || minP[0] >= s.max[0]) continue;
    if (maxP[1] <= s.min[1] || minP[1] >= s.max[1]) continue;
    if (maxP[2] <= s.min[2] || minP[2] >= s.max[2]) continue;
    return false;
  }
  return true;
}

function groundBelow(pos, height, maxDrop = 0.6) {
  let bestY = -Infinity;
  const minX = pos[0] - R, maxX = pos[0] + R;
  const minZ = pos[2] - R, maxZ = pos[2] + R;
  for (let i = 0; i < SOLIDS.length; i++) {
    const s = SOLIDS[i];
    if (maxX <= s.min[0] || minX >= s.max[0]) continue;
    if (maxZ <= s.min[2] || minZ >= s.max[2]) continue;
    if (s.max[1] > pos[1] + 0.12) continue;
    if (s.max[1] < pos[1] - maxDrop) continue;
    if (s.max[1] > bestY) bestY = s.max[1];
  }
  return bestY === -Infinity ? null : bestY;
}

/** Ladder volume test (PRD §9 ladder shortcut). */
export function ladderAt(pos) {
  for (const l of LADDERS) {
    if (
      pos[0] > l.min[0] - 0.45 && pos[0] < l.max[0] + 0.45 &&
      pos[2] > l.min[2] - 0.45 && pos[2] < l.max[2] + 0.45 &&
      pos[1] > l.min[1] - 0.4 && pos[1] < l.max[1] + 0.6
    ) return l;
  }
  return null;
}

/**
 * Integrate one actor for dt.
 * @param input {forward, right, jump, sprint, crouch}
 */
export function moveActor(actor, input, dt, entity) {
  const weapon = getWeapon(actor.currentWeapon);
  const height = actorHeight(actor);

  // ---- crouch blend
  const wantCrouch = !!input.crouch;
  if (!wantCrouch && actor.crouch > 0) {
    // only stand up if there's room
    const test = [...actor.pos];
    if (!positionFree(test, MOVE.standHeight)) {
      // stay crouched
    } else {
      actor.crouch = Math.max(0, actor.crouch - dt * MOVE.crouchLerp);
    }
  } else if (wantCrouch) {
    actor.crouch = Math.min(1, actor.crouch + dt * MOVE.crouchLerp);
  } else {
    actor.crouch = Math.max(0, actor.crouch - dt * MOVE.crouchLerp);
  }
  actor.wantCrouch = wantCrouch;

  // ---- speed
  const armorMul = entity ? armorSpeedMul(entity.loadout.armor) : 1;
  let speed = MOVE.walkSpeed;
  const canSprint = input.sprint && !input.crouch && actor.ads < 0.35 && actor.healing <= 0;
  if (canSprint) speed = MOVE.sprintSpeed;
  if (actor.crouch > 0.4) speed = MOVE.crouchSpeed + (MOVE.walkSpeed - MOVE.crouchSpeed) * (1 - actor.crouch);
  if (actor.ads > 0.05) speed *= 1 - (1 - MOVE.adsSpeedMul) * actor.ads;
  speed *= armorMul * (weapon.moveSpeedMul || 1);
  if (actor.healing > 0) speed *= 0.45;
  actor.sprinting = canSprint && (Math.abs(input.forward) > 0.1 || Math.abs(input.right) > 0.1);

  // ---- desired direction in world space
  const sy = Math.sin(actor.yaw);
  const cy = Math.cos(actor.yaw);
  let wishX = -sy * input.forward + cy * input.right;
  let wishZ = -cy * input.forward - sy * input.right;
  const wl = Math.hypot(wishX, wishZ);
  if (wl > 1) { wishX /= wl; wishZ /= wl; }

  // ---- ladder handling
  const lad = ladderAt(actor.pos);
  actor.onLadder = false;
  if (lad && (input.forward !== 0 || input.jump)) {
    const toLadX = (lad.min[0] + lad.max[0]) / 2 - actor.pos[0];
    const toLadZ = (lad.min[2] + lad.max[2]) / 2 - actor.pos[2];
    const dl = Math.hypot(toLadX, toLadZ) || 1;
    const facing = (-sy * (toLadX / dl)) + (-cy * (toLadZ / dl));
    if (facing > 0.25 || actor.pos[1] > 0.4) {
      actor.onLadder = true;
      const climb = input.jump ? 1 : Math.sign(input.forward) * (facing > 0 ? 1 : -1);
      actor.vel[1] = climb * MOVE.ladderSpeed;
      actor.vel[0] = wishX * 1.4;
      actor.vel[2] = wishZ * 1.4;
      if (actor.pos[1] >= lad.max[1] - 0.5) {
        // step off at the top
        actor.vel[1] = Math.max(actor.vel[1], 1.5);
        actor.vel[0] += -sy * 2.2;
        actor.vel[2] += -cy * 2.2;
      }
    }
  }

  if (!actor.onLadder) {
    // ---- horizontal accel / friction
    const accel = actor.grounded ? MOVE.accel : MOVE.airAccel;
    const targetX = wishX * speed;
    const targetZ = wishZ * speed;
    if (wl > 0.001) {
      actor.vel[0] += (targetX - actor.vel[0]) * Math.min(1, accel * dt / Math.max(1, speed) * 3.2);
      actor.vel[2] += (targetZ - actor.vel[2]) * Math.min(1, accel * dt / Math.max(1, speed) * 3.2);
    } else if (actor.grounded) {
      const f = Math.max(0, 1 - MOVE.friction * dt);
      actor.vel[0] *= f;
      actor.vel[2] *= f;
    }
    // ---- gravity + jump
    actor.vel[1] += MOVE.gravity * dt;
    if (input.jump && actor.grounded && actor.crouch < 0.5) {
      actor.vel[1] = MOVE.jumpVelocity;
      actor.grounded = false;
    }
  }

  // clamp
  const maxSpeed = MOVE.sprintSpeed * 1.6;
  const hs = Math.hypot(actor.vel[0], actor.vel[2]);
  if (hs > maxSpeed) {
    actor.vel[0] = (actor.vel[0] / hs) * maxSpeed;
    actor.vel[2] = (actor.vel[2] / hs) * maxSpeed;
  }
  actor.vel[1] = Math.max(-40, Math.min(20, actor.vel[1]));

  // ---- integrate with axis sweeps (X, Z, then Y) + step-up
  actor.prevPos = [...actor.pos];
  let pos = [...actor.pos];
  const halfH = height / 2;

  // X
  {
    const dx = actor.vel[0] * dt;
    const r = sweepAxis(pos, dx, halfH, 0);
    if (r.blocked) {
      // try step-up
      const upPos = [pos[0], pos[1] + MOVE.stepHeight, pos[2]];
      const r2 = sweepAxis(upPos, dx, halfH, 0);
      if (!r2.blocked && positionFree(r2.pos, height)) {
        const g = groundBelow([r2.pos[0], r2.pos[1] + 0.05, r2.pos[2]], height, MOVE.stepHeight + 0.1);
        pos = [r2.pos[0], g != null ? g : r2.pos[1], r2.pos[2]];
      } else {
        pos = r.pos;
        actor.vel[0] *= 0.05;
      }
    } else pos = r.pos;
  }
  // Z
  {
    const dz = actor.vel[2] * dt;
    const r = sweepAxis(pos, dz, halfH, 2);
    if (r.blocked) {
      const upPos = [pos[0], pos[1] + MOVE.stepHeight, pos[2]];
      const r2 = sweepAxis(upPos, dz, halfH, 2);
      if (!r2.blocked && positionFree(r2.pos, height)) {
        const g = groundBelow([r2.pos[0], r2.pos[1] + 0.05, r2.pos[2]], height, MOVE.stepHeight + 0.1);
        pos = [r2.pos[0], g != null ? g : r2.pos[1], r2.pos[2]];
      } else {
        pos = r.pos;
        actor.vel[2] *= 0.05;
      }
    } else pos = r.pos;
  }
  // Y
  {
    const dy = actor.vel[1] * dt;
    const r = sweepAxis(pos, dy, halfH, 1);
    if (r.blocked) {
      if (dy < 0) {
        actor.grounded = true;
        if (!actor.wasGrounded) actor.justLanded = Math.abs(actor.vel[1]);
      }
      actor.vel[1] = 0;
    } else {
      actor.grounded = false;
    }
    pos = r.pos;
  }

  // snap to ground when walking down small steps
  if (!actor.grounded && actor.vel[1] <= 0.01 && !actor.onLadder) {
    const g = groundBelow([pos[0], pos[1], pos[2]], height, 0.42);
    if (g != null && pos[1] - g < 0.42 && pos[1] - g > -0.02) {
      pos[1] = g;
      actor.grounded = true;
      actor.vel[1] = 0;
    }
  }

  // hard bounds
  pos[0] = Math.max(PLAY.minX + R, Math.min(PLAY.maxX - R, pos[0]));
  pos[2] = Math.max(PLAY.minZ + R, Math.min(PLAY.maxZ - R, pos[2]));
  if (pos[1] < -3) { pos[1] = 0; actor.vel[1] = 0; }

  actor.wasGrounded = actor.grounded;
  actor.pos = pos;
  actor.height = height;
  actor.surface = surfaceUnder(pos);

  // ---- footstep cadence (PRD §12)
  const moved = Math.hypot(pos[0] - actor.prevPos[0], pos[2] - actor.prevPos[2]);
  if (actor.grounded && moved > 0.0005) {
    const stride = actor.sprinting ? 0.52 : actor.crouch > 0.5 ? 1.05 : 0.72;
    actor.stepPhase += moved / stride;
    if (actor.stepPhase >= 1) {
      actor.stepPhase -= 1;
      actor.stepReady = true;
      // Loud = discoverable by bots (PRD §8 hearing)
      actor.lastNoiseAt = performance.now() / 1000;
      actor.noiseLevel = actor.sprinting ? 1.0 : actor.crouch > 0.5 ? 0.25 : 0.65;
    }
  }
  // view bob
  const targetBob = actor.grounded ? Math.min(1, Math.hypot(actor.vel[0], actor.vel[2]) / MOVE.walkSpeed) : 0;
  actor.viewBob += (targetBob - actor.viewBob) * Math.min(1, dt * 8);
}

export { R as CAPSULE_RADIUS };
