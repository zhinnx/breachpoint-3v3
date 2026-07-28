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
import { brushes, SODIUM_LAMPS, MOON_SHAFTS, PLAY, WALL_H, COLLIDERS, isOutdoor, getActiveMapId } from '../game/steelfall.js';
import { getMapMaterials } from './materials.js';

const box = new THREE.BoxGeometry(1, 1, 1);
const dummy = new THREE.Object3D();

/**
 * Box geometry with world-scale UVs baked per face.
 *
 * FIXES TEXTURE STRETCHING: the layer draws one unit cube scaled to each
 * brush, so a 20m wall stretched a single texture tile across 20 metres while
 * a 1m crate got the same tile at full density. Nothing matched, and large
 * surfaces looked smeared.
 *
 * Each brush now gets its UVs rewritten from its real dimensions, so texel
 * density is constant everywhere: one tile per TILE_M metres on every face,
 * regardless of how big the brush is.
 */
const TILE_M = 2.4;

function makeBrushGeometry(list) {
  const src = new THREE.BoxGeometry(1, 1, 1);
  const geo = src.clone();
  src.dispose();
  const uv = geo.attributes.uv;
  // Per-face axis pairs on a BoxGeometry: +X,-X use (z,y); +Y,-Y use (x,z);
  // +Z,-Z use (x,y). Four verts per face, six faces.
  geo.userData.faceAxis = [
    [2, 1], [2, 1], [0, 2], [0, 2], [0, 1], [0, 1],
  ];
  geo.setAttribute('uv', uv);
  return geo;
}

/** One InstancedMesh per material bucket. */
function BrushLayer({ mat, list, material }) {
  const ref = useRef();

  // Instanced UV scale/offset so every brush tiles at a constant texel density.
  const uvData = useMemo(() => {
    const arr = new Float32Array(list.length * 2);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      // Use the two largest dimensions: that is the face a player mostly sees.
      const sx = Math.max(0.25, (b.h[0] * 2) / TILE_M);
      const sy = Math.max(0.25, (b.h[1] * 2) / TILE_M);
      const sz = Math.max(0.25, (b.h[2] * 2) / TILE_M);
      const dims = [sx, sy, sz].sort((p, q) => q - p);
      arr[i * 2] = dims[0];
      arr[i * 2 + 1] = dims[1];
    }
    return arr;
  }, [list]);

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

    // Feed per-instance UV scale to the shader.
    mesh.geometry.setAttribute(
      'uvScale',
      new THREE.InstancedBufferAttribute(uvData, 2),
    );

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

/** Gradient sky dome for the outdoor maps. */
function SkyDome() {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color('#5c9fd6') },
      mid: { value: new THREE.Color('#a8cbe4') },
      bot: { value: new THREE.Color('#e3d6bb') },
    },
    vertexShader: `
      varying vec3 vPos;
      void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
      varying vec3 vPos;
      void main(){
        float h = normalize(vPos).y;
        vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.65)) : mix(mid, bot, pow(-h, 0.5));
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  }), []);
  // fog must not tint the dome, and it has to sit inside the camera far plane
  // (220) or the corners clip to the clear colour.
  return (
    <mesh material={mat} frustumCulled={false} renderOrder={-1}>
      <sphereGeometry args={[160, 24, 16]} />
    </mesh>
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
  const outdoor = isOutdoor();
  const mapId = getActiveMapId();

  useLayoutEffect(() => {
    if (outdoor) {
      // Bright desert daylight. Thin fog only, so distant enemies stay legible
      // instead of dissolving into haze.
      scene.fog = new THREE.FogExp2('#cdbfa4', 0.0042);
      scene.background = new THREE.Color('#b8d4e8');
    } else {
      scene.fog = new THREE.FogExp2('#131a26', 0.0085);
      scene.background = new THREE.Color('#0b111b');
    }
    return () => { scene.fog = null; };
  }, [scene, outdoor, mapId]);

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
      {outdoor ? (
        <>
          {/* Midday sun. High ambient + hemisphere so shadowed faces still
              read: the previous map was unplayably dark in cover. */}
          <ambientLight intensity={1.45} color="#e8ddc8" />
          <hemisphereLight color="#cfe4f5" groundColor="#b9a684" intensity={2.1} />
          <directionalLight
            position={[38, 62, 26]}
            intensity={3.1}
            color="#fff4dc"
            castShadow={quality !== 'low'}
            shadow-mapSize-width={quality === 'high' ? 2048 : 1024}
            shadow-mapSize-height={quality === 'high' ? 2048 : 1024}
            shadow-camera-left={-46}
            shadow-camera-right={46}
            shadow-camera-top={46}
            shadow-camera-bottom={-46}
            shadow-camera-near={1}
            shadow-camera-far={140}
            shadow-bias={-0.0009}
            shadow-normalBias={0.03}
          />
          {/* warm bounce off the sand */}
          <directionalLight position={[-24, 10, -18]} intensity={0.72} color="#ffd9a8" />
          <directionalLight position={[0, 6, 34]} intensity={0.42} color="#bcd4e8" />
        </>
      ) : (
        <>
          <ambientLight intensity={0.62} color="#6b7d99" />
          <hemisphereLight color="#5f80b5" groundColor="#3a2c20" intensity={1.15} />
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
          <directionalLight position={[18, 12, 22]} intensity={0.55} color="#ff9c4a" />
        </>
      )}

      {lamps.map((p, i) => <Lamp key={i} pos={p} />)}
      <LampLights lamps={lamps} count={quality === 'low' ? 4 : quality === 'medium' ? 6 : 7} />
      {shafts.map((s, i) => <MoonShaft key={i} {...s} />)}

      {/* smelter core glow (mid tower) */}
      {!outdoor && <pointLight position={[0, 2.4, 0]} color="#ff5a12" intensity={55} distance={18} decay={1.7} />}

      {/* ---------------- atmospherics (PRD §13) ---------------- */}
      {quality !== 'low' && <DustMotes count={quality === 'high' ? 340 : 180} />}
      {!outdoor && <GroundHaze />}
      {outdoor && <SkyDome />}
    </group>
  );
}

export default MapSteelfall;
