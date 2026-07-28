/**
 * BREACHPOINT — First-person camera rig.
 *
 * Reads directly from the simulation actor each frame (no React state) and
 * applies: eye height (crouch blend), recoil offset, camera shake, ADS FOV
 * narrowing (PRD §6), landing dip, and death-cam framing.
 */
import React, { useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { world, eyePosition, actorHeight } from '../game/world.js';
import { castWorld } from '../game/raycast.js';
import { getWeapon } from '../game/weapons.js';
import { MOVE, PHASE } from '../game/config.js';
import { useGame } from '../game/store.js';

const lerp = (a, b, t) => a + (b - a) * t;

export function PlayerCamera({ actor, entity }) {
  const { camera } = useThree();
  const shakeOffset = useRef(new THREE.Vector3());
  const bobT = useRef(0);
  const deadT = useRef(0);
  const spectateIdx = useRef(0);
  const settings = useGame((s) => s.settings);
  const phase = useGame((s) => s.phase);

  useFrame((state, dt) => {
    if (!actor || !entity) return;

    const weapon = getWeapon(actor.currentWeapon);

    if (!actor.alive) {
      // Death cam. Previously it snapped to a hard roll and could clip inside
      // geometry. Now it eases down, keeps a level horizon, and pulls back to
      // a safe distance before handing over to spectate.
      deadT.current += dt;
      const t = Math.min(1, deadT.current / 1.4);
      const ease = 1 - Math.pow(1 - t, 3);
      const h = actorHeight(actor);
      const eyeY = actor.pos[1] + lerp(h + MOVE.eyeOffset, 0.55, ease);
      camera.rotation.order = 'YXZ';
      camera.position.set(actor.pos[0], eyeY, actor.pos[2]);
      camera.rotation.set(
        lerp(actor.pitch, -0.22, ease),
        actor.deathYaw || actor.yaw,
        lerp(0, 0.12, ease),
        'YXZ',
      );

      if (deadT.current > 2.0) {
        const allies = world.actorList.filter((a) => a.alive && a.team === actor.team);
        if (allies.length) {
          const tgt = allies[spectateIdx.current % allies.length];
          const th = actorHeight(tgt);
          const fx = -Math.sin(tgt.yaw);
          const fz = -Math.cos(tgt.yaw);
          // Pull the chase camera in if a wall is behind the target.
          const eye = [tgt.pos[0], tgt.pos[1] + th + 0.5, tgt.pos[2]];
          const backDir = [-fx, 0, -fz];
          const hit = castWorld(eye, backDir, 3.0);
          const back = hit.hit ? Math.max(0.9, hit.t - 0.35) : 2.8;
          const desired = new THREE.Vector3(
            tgt.pos[0] - fx * back,
            tgt.pos[1] + th + 0.5,
            tgt.pos[2] - fz * back,
          );
          camera.position.lerp(desired, Math.min(1, dt * 4));
          const look = new THREE.Vector3(tgt.pos[0], tgt.pos[1] + th * 0.8, tgt.pos[2]);
          const m = new THREE.Matrix4().lookAt(camera.position, look, new THREE.Vector3(0, 1, 0));
          camera.quaternion.slerp(new THREE.Quaternion().setFromRotationMatrix(m), Math.min(1, dt * 5));
        }
      }
      camera.fov = lerp(camera.fov, settings.fov, Math.min(1, dt * 4));
      camera.updateProjectionMatrix();
      return;
    }
    deadT.current = 0;

    // ---- eye position with crouch blend
    const eye = eyePosition(actor);

    // ---- subtle head bob while walking
    const speed = Math.hypot(actor.vel[0], actor.vel[2]);
    bobT.current += dt * (speed * 1.85 + 1.2);
    const bobAmt = Math.min(1, speed / MOVE.walkSpeed) * (actor.grounded ? 1 : 0) * (1 - actor.ads * 0.85);
    // Playtest: the old bob read as violent. Roughly a third of the amplitude.
    const bobY = Math.abs(Math.sin(bobT.current)) * 0.008 * bobAmt;
    const bobX = Math.sin(bobT.current * 0.5) * 0.005 * bobAmt;

    // ---- camera shake (explosions, firing, landing)
    const sh = world.camShake;
    if (sh > 0.001) {
      const t = state.clock.elapsedTime * 34;
      shakeOffset.current.set(
        Math.sin(t * 1.7) * sh * 0.055,
        Math.cos(t * 2.3) * sh * 0.055,
        Math.sin(t * 1.1) * sh * 0.02,
      );
    } else {
      shakeOffset.current.multiplyScalar(0.86);
    }

    camera.position.set(
      eye[0] + bobX + shakeOffset.current.x,
      eye[1] + bobY + shakeOffset.current.y,
      eye[2] + shakeOffset.current.z,
    );

    // ---- orientation: aim + recoil + shake roll
    camera.rotation.order = 'YXZ';
    camera.rotation.y = actor.yaw + actor.recoilYaw;
    camera.rotation.x = actor.pitch + actor.recoilPitch + shakeOffset.current.y * 0.35;
    camera.rotation.z = Math.sin(bobT.current * 0.5) * 0.002 * bobAmt + shakeOffset.current.x * 0.28;

    // ---- FOV: narrows on ADS (PRD §6), widens slightly when sprinting
    const baseFov = settings.fov;
    const sprintFov = actor.sprinting && speed > 3 ? baseFov + 6 : baseFov;
    const targetFov = actor.ads > 0.01
      ? lerp(baseFov, weapon.adsFov || 55, actor.ads)
      : sprintFov;
    camera.fov = lerp(camera.fov, targetFov, Math.min(1, dt * 12));
    camera.near = 0.06;
    camera.updateProjectionMatrix();
  }, 0);

  return null;
}

export default PlayerCamera;
