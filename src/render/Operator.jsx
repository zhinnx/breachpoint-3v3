/**
 * BREACHPOINT — Operator character model (PRD §10).
 *
 * Generic tactical operator: plate carrier with pouches, combat gloves, cargo
 * trousers, boots, helmet + balaclava. Team identity is read at a glance from
 * piping/armband accents (blue/cyan vs red/orange) exactly as PRD §10 requires.
 * Third-person full body; first-person shows forearms + gloves only.
 */
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getOperatorMaterials } from './materials.js';
import { WeaponSilhouette } from './WeaponModels.jsx';
import { MOVE } from '../game/config.js';

const B = ({ p, s, r, m, ...rest }) => (
  <mesh position={p} scale={s} rotation={r} material={m} castShadow receiveShadow {...rest}>
    <boxGeometry args={[1, 1, 1]} />
  </mesh>
);

/** Full third-person operator. Animated by the actor runtime. */
export function Operator({ actor, entity, isEnemy }) {
  const group = useRef();
  const hips = useRef();
  const torso = useRef();
  const head = useRef();
  const legL = useRef();
  const legR = useRef();
  const armL = useRef();
  const armR = useRef();
  const mats = getOperatorMaterials(entity.team);

  const walkPhase = useRef(0);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g || !actor) return;

    const dead = !actor.alive;
    g.visible = true;

    // position + facing
    g.position.set(actor.pos[0], actor.pos[1], actor.pos[2]);
    g.rotation.y = actor.yaw;

    const crouchAmt = actor.crouch || 0;
    const speed = Math.hypot(actor.vel[0], actor.vel[2]);
    const scaleY = 1 - crouchAmt * 0.28;

    if (dead) {
      // simple death slump (PRD §13 tasteful, T-rated)
      const t = Math.min(1, actor.ragdoll || 0);
      g.rotation.x = -t * Math.PI * 0.46;
      g.position.y = actor.pos[1] + t * 0.12;
      if (hips.current) hips.current.scale.y = 1;
      if (torso.current) torso.current.rotation.x = t * 0.3;
      if (armL.current) armL.current.rotation.x = t * 1.1;
      if (armR.current) armR.current.rotation.x = t * 0.8;
      if (legL.current) legL.current.rotation.x = -t * 0.4;
      if (legR.current) legR.current.rotation.x = t * 0.3;
      return;
    }
    g.rotation.x = 0;

    // walk cycle
    walkPhase.current += dt * (speed * 1.65 + 0.4);
    const swing = Math.sin(walkPhase.current) * Math.min(1, speed / MOVE.walkSpeed);
    const bounce = Math.abs(Math.cos(walkPhase.current)) * Math.min(1, speed / MOVE.walkSpeed) * 0.035;

    if (hips.current) {
      hips.current.position.y = crouchAmt * -0.3 + bounce;
      hips.current.scale.y = scaleY;
    }
    if (torso.current) {
      torso.current.rotation.x = crouchAmt * 0.42 + Math.min(0.32, speed * 0.03);
      torso.current.rotation.z = swing * 0.05;
    }
    if (head.current) {
      head.current.rotation.x = -(actor.pitch || 0) * 0.65 - crouchAmt * 0.2;
    }
    if (legL.current) legL.current.rotation.x = swing * 0.75 - crouchAmt * 0.5;
    if (legR.current) legR.current.rotation.x = -swing * 0.75 - crouchAmt * 0.5;
    if (armL.current) armL.current.rotation.x = -0.95 - crouchAmt * 0.15;
    if (armR.current) armR.current.rotation.x = -1.05 - crouchAmt * 0.15;
  });

  const weaponId = entity.loadout.current;

  return (
    <group ref={group}>
      <group ref={hips} position={[0, 0, 0]}>
        {/* ---------- legs: cargo trousers + boots ---------- */}
        <group ref={legL} position={[-0.11, 0.82, 0]}>
          <B p={[0, -0.2, 0]} s={[0.16, 0.42, 0.17]} m={mats.fatigues} />
          <B p={[0, -0.52, 0]} s={[0.15, 0.34, 0.16]} m={mats.fatigues} />
          {/* thigh cargo pocket */}
          <B p={[-0.085, -0.24, 0.01]} s={[0.02, 0.16, 0.13]} m={mats.vest} />
          <B p={[0, -0.71, 0.02]} s={[0.16, 0.11, 0.24]} m={mats.boots} />
        </group>
        <group ref={legR} position={[0.11, 0.82, 0]}>
          <B p={[0, -0.2, 0]} s={[0.16, 0.42, 0.17]} m={mats.fatigues} />
          <B p={[0, -0.52, 0]} s={[0.15, 0.34, 0.16]} m={mats.fatigues} />
          <B p={[0.085, -0.24, 0.01]} s={[0.02, 0.16, 0.13]} m={mats.vest} />
          <B p={[0, -0.71, 0.02]} s={[0.16, 0.11, 0.24]} m={mats.boots} />
        </group>

        {/* ---------- torso ---------- */}
        <group ref={torso} position={[0, 0.86, 0]}>
          <B p={[0, 0.2, 0]} s={[0.36, 0.44, 0.22]} m={mats.fatigues} />
          {/* plate carrier */}
          <B p={[0, 0.22, 0.005]} s={[0.39, 0.4, 0.25]} m={mats.vest} />
          {/* front pouches */}
          <B p={[-0.09, 0.14, 0.135]} s={[0.11, 0.14, 0.06]} m={mats.vest} />
          <B p={[0.09, 0.14, 0.135]} s={[0.11, 0.14, 0.06]} m={mats.vest} />
          <B p={[0, 0.3, 0.14]} s={[0.14, 0.1, 0.05]} m={mats.vest} />
          {/* radio on the back */}
          <B p={[-0.1, 0.3, -0.13]} s={[0.08, 0.13, 0.05]} m={mats.helmet} />
          <B p={[-0.1, 0.42, -0.13]} s={[0.012, 0.14, 0.012]} m={mats.helmet} />
          {/* team piping (PRD §10) */}
          <B p={[0, 0.4, 0.128]} s={[0.32, 0.022, 0.02]} m={mats.accent} />
          <B p={[0, 0.03, 0.128]} s={[0.3, 0.016, 0.02]} m={mats.accent} />
          <B p={[0, 0.4, -0.128]} s={[0.32, 0.022, 0.02]} m={mats.accent} />

          {/* ---------- arms ---------- */}
          <group ref={armL} position={[-0.235, 0.36, 0]}>
            <B p={[0, -0.12, 0]} s={[0.115, 0.28, 0.13]} m={mats.fatigues} />
            {/* armband — team colour */}
            <B p={[0, -0.02, 0]} s={[0.125, 0.06, 0.14]} m={mats.accent} />
            <B p={[0, -0.3, 0.09]} s={[0.1, 0.26, 0.12]} r={[0.6, 0, 0]} m={mats.fatigues} />
            <B p={[0, -0.4, 0.2]} s={[0.09, 0.11, 0.11]} m={mats.gloves} />
          </group>
          <group ref={armR} position={[0.235, 0.36, 0]}>
            <B p={[0, -0.12, 0]} s={[0.115, 0.28, 0.13]} m={mats.fatigues} />
            <B p={[0, -0.02, 0]} s={[0.125, 0.06, 0.14]} m={mats.accent} />
            <B p={[0, -0.3, 0.09]} s={[0.1, 0.26, 0.12]} r={[0.6, 0, 0]} m={mats.fatigues} />
            <B p={[0, -0.4, 0.2]} s={[0.09, 0.11, 0.11]} m={mats.gloves} />
            {/* weapon held in the right hand */}
            <group position={[-0.11, -0.42, 0.26]} rotation={[0.18, 0, 0]}>
              <WeaponSilhouette weaponId={weaponId} />
            </group>
          </group>

          {/* ---------- head ---------- */}
          <group ref={head} position={[0, 0.55, 0]}>
            {/* balaclava + generic face */}
            <B p={[0, 0, 0]} s={[0.19, 0.22, 0.2]} m={mats.gloves} />
            <B p={[0, 0.01, 0.093]} s={[0.115, 0.055, 0.03]} m={mats.skin} />
            {/* helmet */}
            <mesh position={[0, 0.075, -0.005]} material={mats.helmet} castShadow>
              <sphereGeometry args={[0.122, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
            </mesh>
            <B p={[0, 0.055, 0.098]} s={[0.2, 0.03, 0.07]} m={mats.helmet} />
            {/* NVG mount + team light */}
            <B p={[0, 0.12, 0.085]} s={[0.05, 0.035, 0.04]} m={mats.helmet} />
            <B p={[0.075, 0.055, 0.0]} s={[0.02, 0.02, 0.05]} m={mats.accent} />
            {/* eye visor slit */}
            <B p={[0, 0.02, 0.101]} s={[0.15, 0.035, 0.012]} m={mats.visor} />
          </group>
        </group>
      </group>
    </group>
  );
}

/**
 * First-person arms: forearms + gloves gripping the weapon (PRD §10).
 * Parented to the viewmodel so they inherit sway/bob.
 */
export function FirstPersonArms({ team, weaponSpec }) {
  const mats = getOperatorMaterials(team);
  const len = weaponSpec?.visual?.length || 0.4;
  const isPistol = weaponSpec?.slot === 'sidearm';

  return (
    <group>
      {/* right (trigger) hand + forearm */}
      <group position={[0.028, -0.075, 0.055]} rotation={[0.32, -0.06, 0.05]}>
        <mesh material={mats.gloves} castShadow>
          <boxGeometry args={[0.062, 0.075, 0.07]} />
        </mesh>
        <mesh position={[0, -0.02, 0.115]} rotation={[0.28, 0, 0]} material={mats.fatigues} castShadow>
          <boxGeometry args={[0.082, 0.085, 0.2]} />
        </mesh>
        <mesh position={[0, -0.008, 0.19]} rotation={[0.28, 0, 0]} material={mats.accent} castShadow>
          <boxGeometry args={[0.088, 0.03, 0.05]} />
        </mesh>
        {/* fingers wrapping the grip */}
        <mesh position={[-0.028, -0.008, -0.012]} material={mats.gloves} castShadow>
          <boxGeometry args={[0.022, 0.058, 0.048]} />
        </mesh>
      </group>

      {/* left (support) hand — forward on the handguard */}
      <group
        position={isPistol ? [-0.042, -0.062, 0.03] : [-0.045, -0.055, -len * 0.62]}
        rotation={isPistol ? [0.36, 0.28, -0.22] : [0.42, 0.14, -0.12]}
      >
        <mesh material={mats.gloves} castShadow>
          <boxGeometry args={[0.058, 0.07, 0.085]} />
        </mesh>
        <mesh position={[-0.012, -0.028, 0.13]} rotation={[0.36, 0.05, 0]} material={mats.fatigues} castShadow>
          <boxGeometry args={[0.078, 0.082, 0.21]} />
        </mesh>
        <mesh position={[-0.014, -0.016, 0.21]} rotation={[0.36, 0.05, 0]} material={mats.accent} castShadow>
          <boxGeometry args={[0.084, 0.028, 0.05]} />
        </mesh>
        <mesh position={[0.022, 0.006, -0.01]} material={mats.gloves} castShadow>
          <boxGeometry args={[0.02, 0.05, 0.06]} />
        </mesh>
      </group>
    </group>
  );
}

export default Operator;
