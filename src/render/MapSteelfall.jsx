/**
 * BREACHPOINT — Steelfall renderer (PRD §9 + §13 atmospherics).
 *
 * Brushes are grouped per material and drawn with InstancedMesh so the whole
 * foundry costs a handful of draw calls. Rapier gets matching fixed cuboid
 * colliders. Lighting follows the PRD: sodium work lamps + blue moonlight
 * through broken skylights, floating dust, low haze.
 */
import React, { useMemo, useRef, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { brushes, SODIUM_LAMPS, MOON_SHAFTS, PLAY, WALL_H, COLLIDERS } from '../game/steelfall.js';
import { getMapMaterials } from './materials.js';

const box = new THREE.BoxGeometry(1, 1, 1);
const dummy = new THREE.Object3D();

/** One InstancedMesh per material bucket. */
function BrushLayer({ mat, list, material }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      dummy.position.set(b.c[0], b.c[1], b.c[2]);
      dummy.scale.set(Math.max(0.02, b.h[0] * 2), Math.max(0.02, b.h[1] * 2), Math.max(0.02, b.h[2] * 2));
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    // IMPORTANT: computeBoundingSphere() on an InstancedMesh only measures the
    // *source* geometry (a unit cube => r≈0.87 at the origin). Three.js would
    // then frustum-cull the entire foundry the moment the camera looks away
    // from world origin, leaving a near-black screen. Derive real bounds from
    // the instance AABBs instead.
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const b of list) {
      if (b.min[0] < minX) minX = b.min[0];
      if (b.min[1] < minY) minY = b.min[1];
      if (b.min[2] < minZ) minZ = b.min[2];
      if (b.max[0] > maxX) maxX = b.max[0];
      if (b.max[1] > maxY) maxY = b.max[1];
      if (b.max[2] > maxZ) maxZ = b.max[2];
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const radius = Math.hypot(maxX - cx, maxY - cy, maxZ - cz);
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, cy, cz), radius);
    mesh.boundingBox = new THREE.Box3(
      new THREE.Vector3(minX, minY, minZ),
      new THREE.Vector3(maxX, maxY, maxZ),
    );
    // computeBoundingSphere() is what three calls during culling; make it a no-op
    // so our correct bounds are never overwritten.
    mesh.computeBoundingSphere = () => mesh.boundingSphere;
  }, [list]);

  return (
    <instancedMesh
      ref={ref}
      args={[box, material, list.length]}
      castShadow={mat !== 'concreteFloor' && mat !== 'ceiling'}
      receiveShadow
      frustumCulled
    />
  );
}

/**
 * Lamp fixture geometry. Deliberately carries NO point light of its own:
 * 19 lamps + 8 skylights + muzzle flashes would put ~46 dynamic lights in a
 * forward-rendered scene, which explodes shader cost (and on weak/software
 * GPUs drags the frame time past the simulation's dt clamp, stalling the
 * match clock). Actual illumination comes from the pooled <LampLights/> rig.
 */
function Lamp({ pos }) {
  return (
    <group position={pos}>
      <mesh castShadow>
        <cylinderGeometry args={[0.26, 0.34, 0.2, 10]} />
        <meshStandardMaterial color="#2a2c2e" roughness={0.7} metalness={0.7} />
      </mesh>
      <mesh position={[0, -0.11, 0]}>
        <cylinderGeometry args={[0.24, 0.24, 0.03, 10]} />
        <meshStandardMaterial
          color="#ffcf8a" emissive="#ff9b30" emissiveIntensity={6.5} toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.5, 6]} />
        <meshStandardMaterial color="#3a3c3e" roughness={0.8} metalness={0.6} />
      </mesh>
      <sprite position={[0, -0.16, 0]} scale={[2.2, 2.2, 1]}>
        <spriteMaterial
          map={useGlowTexture()}
          color="#ff9a3c"
          transparent
          opacity={0.36}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
    </group>
  );
}

/**
 * Pooled sodium lighting: a small fixed set of point lights that re-target the
 * nearest lamps to the camera every frame. Cost stays constant no matter how
 * many fixtures the map has.
 */
function LampLights({ lamps, count = 7 }) {
  const refs = useRef([]);
  const order = useMemo(() => lamps.map((p, i) => ({ p, i, d: 0 })), [lamps]);

  useFrame(({ camera }) => {
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    for (const o of order) {
      const dx = o.p[0] - cx;
      const dy = o.p[1] - cy;
      const dz = o.p[2] - cz;
      o.d = dx * dx + dy * dy + dz * dz;
    }
    order.sort((a, b) => a.d - b.d);
    for (let i = 0; i < count; i++) {
      const l = refs.current[i];
      if (!l) continue;
      const o = order[i];
      if (!o) { l.intensity = 0; continue; }
      l.position.set(o.p[0], o.p[1] - 0.35, o.p[2]);
      // fade the furthest slot so lamps don't pop as the player moves
      const dist = Math.sqrt(o.d);
      l.intensity = 62 * Math.max(0, Math.min(1, (30 - dist) / 8));
    }
  });

  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <pointLight
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          color="#ff9a3c"
          intensity={0}
          distance={26}
          decay={1.7}
        />
      ))}
    </>
  );
}

let _glowTex = null;
function useGlowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}

/** Volumetric-ish god ray cones from broken skylights (PRD §9, §13). */
function MoonShaft({ pos, radius, height }) {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#9dc0ff',
    transparent: true,
    opacity: 0.055,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }), []);
  return (
    <group position={[pos[0], pos[1] - height / 2, pos[2]]}>
      <mesh material={mat} rotation={[0, Math.random() * 3, 0]}>
        <cylinderGeometry args={[radius * 0.42, radius, height, 12, 1, true]} />
      </mesh>
      <mesh material={mat} scale={[0.6, 1, 0.6]}>
        <cylinderGeometry args={[radius * 0.42, radius, height, 10, 1, true]} />
      </mesh>
    </group>
  );
}

/** Floating dust motes in light shafts (PRD §13 atmospherics). */
function DustMotes({ count = 900 }) {
  const ref = useRef();
  const { positions, speeds } = useMemo(() => {
    const p = new Float32Array(count * 3);
    const s = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      p[i * 3] = PLAY.minX + Math.random() * (PLAY.maxX - PLAY.minX);
      p[i * 3 + 1] = 0.2 + Math.random() * 8.5;
      p[i * 3 + 2] = PLAY.minZ + Math.random() * (PLAY.maxZ - PLAY.minZ);
      s[i] = 0.08 + Math.random() * 0.22;
    }
    return { positions: p, speeds: s };
  }, [count]);

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return g;
  }, [positions]);

  useFrame((state, dt) => {
    const arr = geo.attributes.position.array;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      arr[i3 + 1] += speeds[i] * dt * 0.55;
      arr[i3] += Math.sin(t * 0.24 + i) * dt * 0.06;
      arr[i3 + 2] += Math.cos(t * 0.19 + i * 0.7) * dt * 0.06;
      if (arr[i3 + 1] > 9.2) arr[i3 + 1] = 0.15;
    }
    geo.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref} geometry={geo} frustumCulled={false}>
      <pointsMaterial
        size={0.035}
        color="#cbd8ee"
        transparent
        opacity={0.42}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/** Thin ground haze layer (PRD §13). */
function GroundHaze() {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#5f6a7d',
    transparent: true,
    opacity: 0.05,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }), []);
  return (
    <group>
      {[0.5, 1.3].map((y, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} material={mat}>
          <planeGeometry args={[PLAY.maxX * 2, PLAY.maxZ * 2]} />
        </mesh>
      ))}
    </group>
  );
}

export function MapSteelfall({ quality = 'high' }) {
  const materials = getMapMaterials();
  const { scene } = useThree();

  // group brushes by material
  const buckets = useMemo(() => {
    const m = new Map();
    for (const b of brushes) {
      if (!m.has(b.mat)) m.set(b.mat, []);
      m.get(b.mat).push(b);
    }
    return [...m.entries()];
  }, []);

  // Fog gives the foundry depth and hides the far wall seams.
  useLayoutEffect(() => {
    scene.fog = new THREE.FogExp2('#131a26', 0.0085);
    scene.background = new THREE.Color('#0b111b');
    return () => { scene.fog = null; };
  }, [scene]);

  const lamps = quality === 'low' ? SODIUM_LAMPS.filter((_, i) => i % 2 === 0) : SODIUM_LAMPS;
  const shafts = quality === 'low' ? MOON_SHAFTS.slice(0, 4) : MOON_SHAFTS;

  return (
    <group>
      {/* ---------------- geometry ---------------- */}
      {buckets.map(([mat, list]) => (
        <BrushLayer key={mat} mat={mat} list={list} material={materials[mat] || materials.concreteWall} />
      ))}

      {/* ---------------- collision (Rapier fixed bodies) ---------------- */}
      <RigidBody type="fixed" colliders={false} friction={0.9} restitution={0}>
        {COLLIDERS.map((b) => (
          <CuboidCollider
            key={b.id}
            args={[Math.max(0.01, b.h[0]), Math.max(0.01, b.h[1]), Math.max(0.01, b.h[2])]}
            position={[b.c[0], b.c[1], b.c[2]]}
          />
        ))}
      </RigidBody>

      {/* ---------------- lighting (PRD §9) ---------------- */}
      <ambientLight intensity={0.62} color="#6b7d99" />
      <hemisphereLight color="#5f80b5" groundColor="#3a2c20" intensity={1.15} />
      {/* cold moonlight key */}
      <directionalLight
        position={[-24, 34, -18]}
        intensity={1.75}
        color="#9fbdff"
        castShadow={quality !== 'low'}
        shadow-mapSize-width={quality === 'high' ? 1536 : 1024}
        shadow-mapSize-height={quality === 'high' ? 1536 : 1024}
        shadow-camera-left={-34}
        shadow-camera-right={34}
        shadow-camera-top={34}
        shadow-camera-bottom={-34}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-bias={-0.0012}
        shadow-normalBias={0.035}
      />
      {/* warm bounce from the foundry floor */}
      <directionalLight position={[18, 12, 22]} intensity={0.55} color="#ff9c4a" />

      {lamps.map((p, i) => <Lamp key={i} pos={p} />)}
      <LampLights lamps={lamps} count={quality === 'low' ? 4 : quality === 'medium' ? 6 : 7} />
      {shafts.map((s, i) => <MoonShaft key={i} {...s} />)}

      {/* smelter core glow (mid tower) */}
      <pointLight position={[0, 2.4, 0]} color="#ff5a12" intensity={55} distance={18} decay={1.7} />

      {/* ---------------- atmospherics (PRD §13) ---------------- */}
      {quality !== 'low' && <DustMotes count={quality === 'high' ? 520 : 260} />}
      <GroundHaze />
    </group>
  );
}

export default MapSteelfall;
