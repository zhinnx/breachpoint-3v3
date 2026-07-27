/**
 * BREACHPOINT — Utility models + in-flight projectiles (PRD §7.3, §13).
 *
 * Frag  : olive-drab sphere with segmented fragmentation grooves, separate
 *         spoon lever + pin meshes.
 * Flash : light-grey cylinder with two vent slots.
 * Smoke : cylinder with a purple top cap (quick-recognition colour convention).
 */
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { world } from '../game/world.js';
import { UTILITY } from '../game/weapons.js';

function useUtilMats(kind) {
  return useMemo(() => {
    const u = UTILITY[kind] || UTILITY.frag;
    return {
      body: new THREE.MeshStandardMaterial({ color: u.color, roughness: 0.72, metalness: 0.32 }),
      cap: new THREE.MeshStandardMaterial({ color: u.capColor, roughness: 0.6, metalness: 0.4 }),
      metal: new THREE.MeshStandardMaterial({ color: '#9aa0a8', roughness: 0.32, metalness: 0.92 }),
      dark: new THREE.MeshStandardMaterial({ color: '#15171a', roughness: 0.8, metalness: 0.3 }),
    };
  }, [kind]);
}

export function FragModel() {
  const m = useUtilMats('frag');
  return (
    <group>
      {/* segmented body */}
      <mesh material={m.body} castShadow>
        <sphereGeometry args={[0.052, 14, 12]} />
      </mesh>
      {/* fragmentation grooves */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.03 + i * 0.02, 0]} material={m.dark}>
          <torusGeometry args={[0.0505 - Math.abs(i - 1.5) * 0.006, 0.0035, 6, 18]} />
        </mesh>
      ))}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={`v${i}`} rotation={[0, (i / 4) * Math.PI, 0]} material={m.dark}>
          <torusGeometry args={[0.0505, 0.003, 6, 18]} />
        </mesh>
      ))}
      {/* fuse assembly */}
      <mesh position={[0, 0.055, 0]} material={m.metal} castShadow>
        <cylinderGeometry args={[0.016, 0.019, 0.028, 12]} />
      </mesh>
      {/* spoon lever (separate mesh, per PRD) */}
      <mesh position={[0.02, 0.05, 0]} rotation={[0, 0, -0.12]} material={m.metal} castShadow>
        <boxGeometry args={[0.008, 0.062, 0.016]} />
      </mesh>
      {/* pull pin + ring */}
      <mesh position={[-0.021, 0.062, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.metal}>
        <torusGeometry args={[0.012, 0.0025, 6, 14]} />
      </mesh>
    </group>
  );
}

export function FlashModel() {
  const m = useUtilMats('flash');
  return (
    <group>
      <mesh material={m.body} castShadow>
        <cylinderGeometry args={[0.032, 0.032, 0.105, 14]} />
      </mesh>
      {/* two vent slots (PRD §7.3) */}
      <mesh position={[0.031, 0, 0]} material={m.dark}>
        <boxGeometry args={[0.006, 0.055, 0.03]} />
      </mesh>
      <mesh position={[-0.031, 0, 0]} material={m.dark}>
        <boxGeometry args={[0.006, 0.055, 0.03]} />
      </mesh>
      <mesh position={[0, 0.058, 0]} material={m.cap} castShadow>
        <cylinderGeometry args={[0.03, 0.032, 0.014, 14]} />
      </mesh>
      <mesh position={[0, 0.072, 0]} material={m.metal}>
        <cylinderGeometry args={[0.013, 0.015, 0.02, 10]} />
      </mesh>
      <mesh position={[0.018, 0.062, 0]} rotation={[0, 0, -0.1]} material={m.metal}>
        <boxGeometry args={[0.007, 0.055, 0.014]} />
      </mesh>
    </group>
  );
}

export function SmokeModel() {
  const m = useUtilMats('smoke');
  return (
    <group>
      <mesh material={m.body} castShadow>
        <cylinderGeometry args={[0.034, 0.034, 0.115, 14]} />
      </mesh>
      {/* purple top cap = quick recognition */}
      <mesh position={[0, 0.062, 0]} material={m.cap} castShadow>
        <cylinderGeometry args={[0.034, 0.034, 0.02, 14]} />
      </mesh>
      <mesh position={[0, 0.078, 0]} material={m.metal}>
        <cylinderGeometry args={[0.013, 0.015, 0.02, 10]} />
      </mesh>
      <mesh position={[0.019, 0.068, 0]} rotation={[0, 0, -0.1]} material={m.metal}>
        <boxGeometry args={[0.007, 0.055, 0.014]} />
      </mesh>
      {[0, 1].map((i) => (
        <mesh key={i} position={[0, -0.02 + i * 0.04, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.dark}>
          <torusGeometry args={[0.0345, 0.0028, 6, 16]} />
        </mesh>
      ))}
    </group>
  );
}

export function MedkitModel() {
  const white = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e8e8e8', roughness: 0.6, metalness: 0.05 }), []);
  const red = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d33', emissive: '#a11', emissiveIntensity: 0.3, roughness: 0.5 }), []);
  return (
    <group>
      <mesh material={white} castShadow>
        <boxGeometry args={[0.11, 0.075, 0.05]} />
      </mesh>
      <mesh position={[0, 0, 0.026]} material={red}>
        <boxGeometry args={[0.05, 0.014, 0.004]} />
      </mesh>
      <mesh position={[0, 0, 0.026]} material={red}>
        <boxGeometry args={[0.014, 0.05, 0.004]} />
      </mesh>
    </group>
  );
}

const MODELS = { frag: FragModel, flash: FlashModel, smoke: SmokeModel, medkit: MedkitModel };

export function UtilityModel({ kind }) {
  const M = MODELS[kind] || FragModel;
  return <M />;
}

/** Renders every live grenade currently in the air. */
export function Projectiles() {
  const groupRef = useRef();
  const pool = useRef([]);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const list = world.projectiles;
    // grow pool
    while (pool.current.length < list.length) {
      pool.current.push(null);
    }
    for (let i = 0; i < g.children.length; i++) {
      const child = g.children[i];
      const p = list[i];
      if (!p) { child.visible = false; continue; }
      child.visible = true;
      child.position.set(p.pos[0], p.pos[1], p.pos[2]);
      child.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
      // match the kind by toggling sub-groups
      for (let k = 0; k < child.children.length; k++) {
        child.children[k].visible = child.children[k].userData.kind === p.kind;
      }
    }
  });

  return (
    <group ref={groupRef}>
      {Array.from({ length: 12 }).map((_, i) => (
        <group key={i} visible={false}>
          <group userData={{ kind: 'frag' }}><FragModel /></group>
          <group userData={{ kind: 'flash' }}><FlashModel /></group>
          <group userData={{ kind: 'smoke' }}><SmokeModel /></group>
        </group>
      ))}
    </group>
  );
}

export default Projectiles;
