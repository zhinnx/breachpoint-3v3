/**
 * BREACHPOINT — Fixed-step simulation driver.
 *
 * Runs the whole match tick: player input -> movement -> AI -> combat ->
 * projectiles -> transient VFX -> store sync. Rendering just reads the result.
 * This is the seam where an authoritative server would slot in later.
 */
import { PHASE, TIMERS, MOVE, TEAM } from './config.js';
import { getWeapon, FIRE_MODE } from './weapons.js';
import {
  world, resetWorldActors, respawnActor, syncActorFromEntity, currentWeaponRuntime,
  tickTransients, eyePosition, addDamageIndicator, addCamShake,
} from './world.js';
import { moveActor } from './movement.js';
import {
  fireWeapon, tickRecoil, tickReload, startReload, tickProjectiles,
  throwUtility, startHeal, tickHeal, cancelReload,
} from './combat.js';
import { tickBot, createAI, resetBlackboard, botBuy } from './ai.js';
import * as Audio from './audio.js';

const FIXED_DT = 1 / 60;
const MAX_STEPS = 5;

export class Simulation {
  constructor(store) {
    this.store = store;
    this.accum = 0;
    this.lastPhase = null;
    this.lastRound = -1;
    this.input = {
      forward: 0, right: 0, jump: false, sprint: false, crouch: false,
      fire: false, ads: false, reload: false, throwUtil: null, heal: false,
      switchTo: null,
    };
    this.mouseDelta = [0, 0];
    this.initialized = false;
    this.syncAccum = 0;
    this.hurtFlash = 0;
    this.prevHp = 100;
    this.transformBuffer = [];
  }

  /** Initialise runtime actors from the store's entities. */
  init() {
    const s = this.store;
    resetWorldActors(s.entities, s.order);
    resetBlackboard();
    world.time = 0;
    for (const id of s.order) {
      const e = s.entities[id];
      const a = world.actors[id];
      if (e.isBot) a.ai = createAI(e, e.difficulty || s.difficulty);
    }
    this.initialized = true;
    this.lastRound = s.round;
    this.lastPhase = s.phase;
    this.prevHp = 100;
  }

  /** Called when the store starts a new round. */
  onRoundReset() {
    const s = this.store;
    resetBlackboard();
    for (const id of s.order) {
      const e = s.entities[id];
      const a = world.actors[id];
      if (!a) continue;
      respawnActor(a, e);
      if (a.ai) {
        a.ai.state = 'HOLD';
        a.ai.target = null;
        a.ai.path = null;
        a.ai.pathGoal = null;
        a.ai.buyDone = false;
        a.ai.pushAnchorIdx = 0;
        a.ai.heardAt = null;
        a.ai.blindUntil = -99;
        a.ai.aimYaw = a.yaw;
        a.ai.aimPitch = 0;
        a.ai.coverUntil = 0;
      }
    }
    world.projectiles.length = 0;
    world.smokes.length = 0;
    world.tracers.length = 0;
    world.decals.length = 0;
    world.localBlind = 0;
    world.camShake = 0;
    this.prevHp = 100;
  }

  /** Main entry, called from useFrame. */
  update(dt) {
    const s = this.store;
    if (s.screen !== 'match') return;
    if (!this.initialized) this.init();

    if (s.round !== this.lastRound) {
      this.lastRound = s.round;
      this.onRoundReset();
    }
    if (s.phase !== this.lastPhase) {
      if ((this.lastPhase === PHASE.ROUND_END || this.lastPhase === PHASE.WARMUP) && s.phase === PHASE.BUY) {
        this.onRoundReset();
      }
      this.lastPhase = s.phase;
    }

    if (s.paused) return;

    // Phase timing must not depend on framerate. On very slow devices (or
    // software rasterizers) raw dt can be huge/erratic, so advance the round
    // clock from wall time instead of the render delta.
    const nowMs = performance.now();
    if (this._lastClock == null) this._lastClock = nowMs;
    const wallDt = Math.min(0.5, (nowMs - this._lastClock) / 1000);
    this._lastClock = nowMs;
    s.tickPhase(wallDt);

    this.accum += Math.min(dt, 0.25);
    let steps = 0;
    while (this.accum >= FIXED_DT && steps < MAX_STEPS) {
      this.step(FIXED_DT);
      this.accum -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS) this.accum = 0;

    // Push transforms into the store at ~15Hz (HUD/minimap only need that).
    this.syncAccum += dt;
    if (this.syncAccum > 1 / 15) {
      this.syncAccum = 0;
      this.flushTransforms();
    }
  }

  flushTransforms() {
    const buf = this.transformBuffer;
    buf.length = 0;
    for (const a of world.actorList) {
      buf.push({
        id: a.id, pos: [a.pos[0], a.pos[1], a.pos[2]], yaw: a.yaw, pitch: a.pitch,
        crouched: a.crouch > 0.5, sprinting: a.sprinting, vel: [a.vel[0], a.vel[1], a.vel[2]],
      });
    }
    this.store.syncTransforms(buf);
  }

  step(dt) {
    const s = this.store;
    const phase = s.phase;
    const playerId = s.playerId;
    const swapped = s.sidesSwapped;

    world.time += dt;

    for (const a of world.actorList) {
      const e = s.entities[a.id];
      if (!e) continue;
      syncActorFromEntity(a, e);

      if (!a.alive) {
        if (a.deathTime < 0) {
          a.deathTime = world.time;
          a.deathYaw = a.yaw;
          cancelReload(a);
        }
        a.ragdoll = Math.min(1, a.ragdoll + dt * 3.2);
        continue;
      }
      a.deathTime = -99;
      a.ragdoll = 0;

      tickRecoil(a, dt);
      tickReload(a, s);
      tickHeal(a, dt, s);

      if (a.isPlayer) this.stepPlayer(a, e, dt, phase);
      else if (a.ai) {
        tickBot({ ai: a.ai, actor: a, entity: e, store: s, dt, phase, swapped });
      }

      // footstep audio for whoever just stepped (PRD §12 positional footsteps)
      if (a.stepReady) {
        a.stepReady = false;
        Audio.playFootstep({
          surface: a.surface,
          pos: a.isPlayer ? null : a.pos,
          intensity: a.isPlayer ? 0.55 : (a.sprinting ? 1 : 0.8),
        });
      }
      if (a.justLanded) {
        if (a.justLanded > 5) {
          Audio.playJumpLand({ surface: a.surface, pos: a.isPlayer ? null : a.pos });
          if (a.isPlayer) addCamShake(Math.min(0.5, a.justLanded * 0.03));
        }
        a.justLanded = 0;
      }
    }

    tickProjectiles(dt, s, phase);
    tickTransients(dt);

    // decay local blind (PRD §13 flash fade)
    if (world.localBlind > 0) world.localBlind = Math.max(0, world.localBlind - dt);

    // sniper scope glint (PRD §7.2 — Vantage .50 lens reveals position)
    for (const a of world.actorList) {
      if (!a.alive) { a.scopeGlint = 0; continue; }
      const w = getWeapon(a.currentWeapon);
      a.scopeGlint = (w.scope?.glint && a.ads > 0.6) ? Math.min(1, a.scopeGlint + dt * 4) : Math.max(0, a.scopeGlint - dt * 3);
    }
  }

  // ------------------------------------------------------------------ player
  stepPlayer(actor, entity, dt, phase) {
    const s = this.store;
    const input = this.input;
    const weapon = getWeapon(actor.currentWeapon);
    const wr = currentWeaponRuntime(actor);
    const canAct = phase === PHASE.COMBAT || phase === PHASE.SUDDEN_DEATH;

    // --- look (mouse deltas accumulated by the input layer)
    const sens = s.settings.sensitivity * 0.0022;
    const adsSens = 1 - actor.ads * 0.55;
    actor.yaw -= this.mouseDelta[0] * sens * adsSens;
    const pitchDelta = this.mouseDelta[1] * sens * adsSens * (s.settings.invertY ? -1 : 1);
    actor.pitch = Math.max(-1.5, Math.min(1.5, actor.pitch - pitchDelta));
    this.mouseDelta[0] = 0;
    this.mouseDelta[1] = 0;

    // --- ADS blend (PRD §6)
    const wantAds = input.ads && !actor.sprinting && actor.healing <= 0 && canAct;
    actor.wantAds = wantAds;
    const adsSpeed = 1 / Math.max(0.05, weapon.adsTime);
    actor.ads += ((wantAds ? 1 : 0) - actor.ads) * Math.min(1, dt * adsSpeed * 2.4);
    if (actor.ads < 0.001) actor.ads = 0;

    // --- weapon switch
    if (input.switchTo) {
      const target = input.switchTo === 'primary' ? entity.loadout.primary : entity.loadout.sidearm;
      if (target && target !== actor.currentWeapon) {
        cancelReload(actor);
        s.switchWeapon(actor.id, target);
        Audio.playWeaponSwitch(null);
      }
      input.switchTo = null;
    }

    // --- reload
    if (input.reload) {
      input.reload = false;
      startReload(actor, entity, s);
    }

    // --- heal
    if (input.heal) {
      input.heal = false;
      if (canAct) startHeal(actor, s);
    }

    // --- utility throw
    if (input.throwUtil && canAct) {
      const util = input.throwUtil;
      input.throwUtil = null;
      throwUtility({ actor, store: s, utilId: util, power: 1 });
    }

    // --- fire
    if (canAct && input.fire) {
      const auto = weapon.fireMode === FIRE_MODE.AUTO;
      if (auto || !wr.semiLatch) {
        fireWeapon({ actor, entity, store: s, phase });
      }
    }
    if (!input.fire) wr.semiLatch = false;

    // --- movement
    moveActor(actor, {
      forward: input.forward,
      right: input.right,
      jump: input.jump,
      sprint: input.sprint,
      crouch: input.crouch,
    }, dt, entity);

    // --- damage feedback
    if (entity.hp < this.prevHp) {
      const dmg = this.prevHp - entity.hp;
      Audio.playHurt();
      addCamShake(Math.min(0.9, dmg * 0.02));
      if (entity.lastDamageDir) addDamageIndicator(entity.lastDamageDir);
    }
    this.prevHp = entity.hp;

    // --- audio listener follows the eye (PRD §12 spatial audio)
    const eye = eyePosition(actor);
    const cp = Math.cos(actor.pitch + actor.recoilPitch);
    const fwd = [
      -Math.sin(actor.yaw + actor.recoilYaw) * cp,
      Math.sin(actor.pitch + actor.recoilPitch),
      -Math.cos(actor.yaw + actor.recoilYaw) * cp,
    ];
    Audio.updateListener(eye, fwd);
  }

  /** Buy-phase helper: let bots purchase immediately when the phase starts. */
  triggerBotBuys() {
    const s = this.store;
    for (const id of s.order) {
      const e = s.entities[id];
      if (!e.isBot) continue;
      botBuy(e, s, e.difficulty || s.difficulty);
    }
  }
}

export { FIXED_DT };
