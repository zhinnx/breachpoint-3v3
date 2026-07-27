/**
 * BREACHPOINT — Visual effects (PRD §13).
 *
 * Everything is pooled + instanced and driven straight from the `world` VFX
 * arrays, so no React re-render happens per bullet.
 *
 *   Muzzle flash    — additive sprite + short-lived point light
 *   Tracer          — thin stretched quad along the bullet path
 *   Impact          — sparks on metal, dust puff on concrete, decal
 *   Blood hit       — restrained particle burst (T-rated, per PRD)
 *   Explosion       — fireball, expanding shockwave ring, smoke puff
 *   Smoke grenade   — layered volumetric billboards, blocks LOS for ~15s
 */
import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { world } from '../game/world.js';
import { WEAPONS } from '../game/weapons.js';

// ------------------------------------------------------------------ shared textures
function makeRadial(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (stops) stops.forEach(([o, col]) => g.addColorStop(o, col));
  else { g.addColorStop(0, inner); g.addColorStop(1, outer); }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

function makeSmokeTex() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 26; i++) {
    const x = size / 2 + (Math.random() - 0.5) * size * 0.55;
    const y = size / 2 + (Math.random() - 0.5) * size * 0.55;
    const r = size * (0.12 + Math.random() * 0.26);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const v = 150 + Math.random() * 70;
    g.addColorStop(0, `rgba(${v},${v},${v + 6},0.4)`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // soften edges into a circular mask
  const mask = ctx.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - size / 2, y - size / 2) / (size / 2);
      const f = Math.max(0, 1 - Math.pow(d, 2.2));
      mask.data[(y * size + x) * 4 + 3] *= f;
    }
  }
  ctx.putImageData(mask, 0, 0);
  return new THREE.CanvasTexture(c);
}

let TEX = null;
function textures() {
  if (TEX) return TEX;
  TEX = {
    glow: makeRadial(),
    flash: makeRadial(null, null, [
      [0, 'rgba(255,255,240,1)'],
      [0.22, 'rgba(255,214,120,0.95)'],
      [0.55, 'rgba(255,140,40,0.42)'],
      [1, 'rgba(255,90,10,0)'],
    ]),
    spark: makeRadial('rgba(255,240,190,1)', 'rgba(255,150,40,0)'),
    smoke: makeSmokeTex(),
    dust: makeRadial('rgba(190,180,165,0.75)', 'rgba(170,160,145,0)'),
    blood: makeRadial('rgba(150,25,25,0.85)', 'rgba(110,15,15,0)'),
  };
  return TEX;
}

// ------------------------------------------------------------------ muzzle flashes
function MuzzleFlashes() {
  const T = textures();
  const N = 8;
  // Only a couple of dynamic lights: forward rendering recompiles/s  per
  // light, and muzzle flashes last ~60ms so 2 slots read identically to 8.
  const NLIGHTS = 2;
  const grp = useRef();
  const lights = useRef([]);

  useFrame(() => {
    const g = grp.current;
    if (!g) return;
    const list = world.muzzles;
    for (let i = 0; i < N; i++) {
      const child = g.children[i];
      const m = list[list.length - 1 - i];
      if (!m) { child.visible = false; if (lights.current[i]) lights.current[i].intensity = 0; continue; }
      const k = 1 - m.t / m.life;
      child.visible = true;
      child.position.set(m.pos[0], m.pos[1], m.pos[2]);
      const s = m.scale * (0.34 + k * 0.5);
      child.scale.setScalar(s);
      const spr = child.children[0];
      if (spr && spr.material) spr.material.opacity = k * 0.95;
      const li = i < NLIGHTS ? lights.current[i] : null;
      if (li) {
        li.position.set(m.pos[0], m.pos[1], m.pos[2]);
        li.intensity = k * 130 * m.scale;
      }
    }
  });

  return (
    <>
      <group ref={grp}>
        {Array.from({ length: N }).map((_, i) => (
          <group key={i} visible={false}>
            <sprite scale={[1, 1, 1]}>
              <spriteMaterial
                map={T.flash} transparent depthWrite={false}
                blending={THREE.AdditiveBlending} toneMapped={false} opacity={0}
              />
            </sprite>
          </group>
        ))}
      </group>
      {Array.from({ length: NLIGHTS }).map((_, i) => (
        <pointLight
          key={i}
          ref={(el) => { lights.current[i] = el; }}
          color="#ffb257"
          intensity={0}
          distance={14}
          decay={1.8}
        />
      ))}
    </>
  );
}

// ------------------------------------------------------------------ tracers
const tracerGeo = new THREE.PlaneGeometry(1, 1);
function Tracers() {
  const T = textures();
  const N = 48;
  const grp = useRef();
  const tmpA = useMemo(() => new THREE.Vector3(), []);
  const tmpB = useMemo(() => new THREE.Vector3(), []);

  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ffd79a',
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  }), []);

  useFrame(({ camera }) => {
    const g = grp.current;
    if (!g) return;
    const list = world.tracers;
    for (let i = 0; i < N; i++) {
      const child = g.children[i];
      const tr = list[list.length - 1 - i];
      if (!tr) { child.visible = false; continue; }
      const k = 1 - tr.t / tr.life;
      child.visible = true;
      tmpA.set(tr.from[0], tr.from[1], tr.from[2]);
      tmpB.set(tr.to[0], tr.to[1], tr.to[2]);
      const mid = tmpA.clone().add(tmpB).multiplyScalar(0.5);
      const len = tmpA.distanceTo(tmpB);
      child.position.copy(mid);
      child.lookAt(camera.position);
      // orient the quad along the bullet path
      const dir = tmpB.clone().sub(tmpA).normalize();
      const camDir = camera.position.clone().sub(mid).normalize();
      const right = dir.clone().cross(camDir).normalize();
      const up = right.clone().cross(dir).normalize();
      const m = new THREE.Matrix4().makeBasis(dir, up, right);
      child.quaternion.setFromRotationMatrix(m);
      child.scale.set(len, 0.035 * tr.thickness * (0.5 + k), 1);
      child.material.opacity = k * 0.85;
    }
  });

  return (
    <group ref={grp}>
      {Array.from({ length: N }).map((_, i) => (
        <mesh key={i} geometry={tracerGeo} material={mat.clone()} visible={false} frustumCulled={false} />
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ impacts (sparks / dust) + decals
function Impacts() {
  const T = textures();
  const N = 26;
  const grp = useRef();

  useFrame(() => {
    const g = grp.current;
    if (!g) return;
    const list = world.impacts;
    for (let i = 0; i < N; i++) {
      const child = g.children[i];
      const im = list[list.length - 1 - i];
      if (!im) { child.visible = false; continue; }
      const k = 1 - im.t / im.life;
      child.visible = true;
      child.position.set(
        im.pos[0] + im.normal[0] * 0.03,
        im.pos[1] + im.normal[1] * 0.03,
        im.pos[2] + im.normal[2] * 0.03,
      );
      const metal = im.surf === 'metal';
      const spark = child.children[0];
      const puff = child.children[1];
      spark.visible = metal;
      puff.visible = !metal;
      if (metal) {
        spark.scale.setScalar(0.22 + (1 - k) * 0.42);
        spark.material.opacity = k * 0.95;
      } else {
        puff.scale.setScalar(0.2 + (1 - k) * 0.75);
        puff.material.opacity = k * 0.55;
      }
    }
  });

  return (
    <group ref={grp}>
      {Array.from({ length: N }).map((_, i) => (
        <group key={i} visible={false}>
          <sprite>
            <spriteMaterial map={T.spark} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} color="#ffdda0" />
          </sprite>
          <sprite>
            <spriteMaterial map={T.dust} transparent depthWrite={false} color="#b7ae9c" />
          </sprite>
        </group>
      ))}
    </group>
  );
}

/** Persistent bullet holes. */
function Decals() {
  const N = 60;
  const grp = useRef();
  const geo = useMemo(() => new THREE.CircleGeometry(0.045, 8), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#0c0c0e', transparent: true, opacity: 0.8, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4,
  }), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const nrm = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const g = grp.current;
    if (!g) return;
    const list = world.decals;
    for (let i = 0; i < N; i++) {
      const child = g.children[i];
      const d = list[list.length - 1 - i];
      if (!d) { child.visible = false; continue; }
      child.visible = true;
      child.position.set(
        d.pos[0] + d.normal[0] * 0.012,
        d.pos[1] + d.normal[1] * 0.012,
        d.pos[2] + d.normal[2] * 0.012,
      );
      nrm.set(d.normal[0], d.normal[1], d.normal[2]);
      child.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm);
      const fade = Math.min(1, (d.life - d.t) / 3);
      child.material.opacity = 0.78 * fade;
      child.scale.setScalar(d.surf === 'metal' ? 0.85 : 1.15);
    }
  });

  return (
    <group ref={grp}>
      {Array.from({ length: N }).map((_, i) => (
        <mesh key={i} geometry={geo} material={mat.clone()} visible={false} />
      ))}
    </group>
  );
}

/** Restrained hit particles on player impacts (PRD §13 tasteful / rating T). */
function BloodHits() {
  const T = textures();
  const N = 14;
  const grp = useRef();
  useFrame(() => {
    const g = grp.current;
    if (!g) return;
    const list = world.bloodHits;
    for (let i = 0; i < N; i++) {
      const child = g.children[i];
      const b = list[list.length - 1 - i];
      if (!b) { child.visible = false; continue; }
      const k = 1 - b.t / b.life;
      child.visible = true;
      child.position.set(
        b.pos[0] + b.dir[0] * (1 - k) * 0.24,
        b.pos[1] + b.dir[1] * (1 - k) * 0.24 - (1 - k) * 0.08,
        b.pos[2] + b.dir[2] * (1 - k) * 0.24,
      );
      child.scale.setScalar(0.16 + (1 - k) * 0.3);
      child.material.opacity = k * 0.62;
    }
  });
  return (
    <group ref={grp}>
      {Array.from({ length: N }).map((_, i) => (
        <sprite key={i} visible={false}>
          <spriteMaterial map={T.blood} transparent depthWrite={false} color="#8e1616" />
        </sprite>
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ explosions
function Explosions() {
  const T = textures();
  const N = 6;
  const NLIGHTS = 2;
  const grp = useRef();
  const lights = useRef([]);

  useFrame(() => {
    const g = grp.current;
    if (!g) return;
    const list = world.explosions;
    for (let i = 0; i < N; i++) {
      const child = g.children[i];
      const e = list[list.length - 1 - i];
      const li = i < NLIGHTS ? lights.current[i] : null;
      if (!e) { child.visible = false; if (li) li.intensity = 0; continue; }
      const k = e.t / e.life; // 0 -> 1
      child.visible = true;
      child.position.set(e.pos[0], e.pos[1], e.pos[2]);

      const fire = child.children[0];
      const ring = child.children[1];
      const smoke = child.children[2];

      // fireball: fast bloom then collapse
      const fk = Math.max(0, 1 - k * 3.2);
      fire.visible = fk > 0;
      fire.scale.setScalar(e.radius * (0.35 + (1 - fk) * 0.9));
      fire.material.opacity = fk;

      // shockwave ring
      ring.visible = k < 0.55;
      ring.scale.setScalar(e.radius * (0.2 + k * 2.6));
      ring.material.opacity = Math.max(0, 0.5 - k * 0.95);

      // lingering smoke puff
      smoke.scale.setScalar(e.radius * (0.5 + k * 1.25));
      smoke.material.opacity = Math.max(0, 0.55 * (1 - k) - 0.06);

      if (li) {
        li.position.set(e.pos[0], e.pos[1] + 0.5, e.pos[2]);
        li.intensity = Math.max(0, (1 - k * 2.6)) * 260;
      }
    }
  });

  return (
    <>
      <group ref={grp}>
        {Array.from({ length: N }).map((_, i) => (
          <group key={i} visible={false}>
            <sprite>
              <spriteMaterial map={T.flash} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} color="#ffb257" />
            </sprite>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.72, 1, 28]} />
              <meshBasicMaterial color="#ffd9a0" transparent depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} toneMapped={false} />
            </mesh>
            <sprite>
              <spriteMaterial map={T.smoke} transparent depthWrite={false} color="#4a4a4a" />
            </sprite>
          </group>
        ))}
      </group>
      {Array.from({ length: NLIGHTS }).map((_, i) => (
        <pointLight key={i} ref={(el) => { lights.current[i] = el; }} color="#ff8a30" intensity={0} distance={30} decay={1.7} />
      ))}
    </>
  );
}

// ------------------------------------------------------------------ smoke grenades
/**
 * Layered billboards approximating a volumetric cloud. This is also a genuine
 * gameplay volume: world.segmentBlockedBySmoke() reads the same radii so bots
 * and hitscan LOS respect it (PRD §7.3, §13).
 */
function SmokeClouds() {
  const T = textures();
  const MAX = 4;
  const PUFFS = 16;
  const grp = useRef();

  useFrame((state) => {
    const g = grp.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < MAX; i++) {
      const cloud = g.children[i];
      const s = world.smokes[i];
      if (!s) { cloud.visible = false; continue; }
      cloud.visible = true;
      cloud.position.set(s.pos[0], s.pos[1], s.pos[2]);
      const r = s.radius * Math.min(1, s.grow);
      for (let p = 0; p < PUFFS; p++) {
        const puff = cloud.children[p];
        const a = (p / PUFFS) * Math.PI * 2 + s.seed;
        const layer = p % 3;
        const rad = r * (0.28 + (p % 5) * 0.16);
        puff.position.set(
          Math.cos(a + t * 0.09) * rad,
          -r * 0.35 + layer * r * 0.42 + Math.sin(t * 0.35 + p) * 0.09,
          Math.sin(a + t * 0.11) * rad,
        );
        const sc = r * (0.85 + (p % 4) * 0.14);
        puff.scale.setScalar(sc);
        puff.material.opacity = s.opacity * 0.42;
        puff.material.rotation = a * 0.4 + t * 0.05;
      }
    }
  });

  return (
    <group ref={grp}>
      {Array.from({ length: MAX }).map((_, i) => (
        <group key={i} visible={false}>
          {Array.from({ length: PUFFS }).map((__, p) => (
            <sprite key={p}>
              <spriteMaterial map={T.smoke} transparent depthWrite={false} opacity={0} color="#9aa0a6" />
            </sprite>
          ))}
        </group>
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ ejected shells
function Shells() {
  const N = 40;
  const grp = useRef();
  const geo = useMemo(() => new THREE.CylinderGeometry(0.006, 0.0065, 0.024, 6), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c9a227', roughness: 0.32, metalness: 0.95 }), []);

  useFrame(() => {
    const g = grp.current;
    if (!g) return;
    for (let i = 0; i < N; i++) {
      const child = g.children[i];
      const s = world.shells[i];
      if (!s) { child.visible = false; continue; }
      child.visible = true;
      child.position.set(s.pos[0], s.pos[1], s.pos[2]);
      child.rotation.set(s.rot[0], s.rot[1], s.rot[2]);
      const fade = Math.min(1, (s.life - s.t) / 0.5);
      child.scale.setScalar(fade);
    }
  });

  return (
    <group ref={grp}>
      {Array.from({ length: N }).map((_, i) => (
        <mesh key={i} geometry={geo} material={mat} visible={false} castShadow />
      ))}
    </group>
  );
}

/** Sniper scope glint — PRD §7.2: reveals a scoped Vantage .50 operator. */
function ScopeGlints() {
  const T = textures();
  const N = 6;
  const grp = useRef();
  useFrame(() => {
    const g = grp.current;
    if (!g) return;
    let i = 0;
    for (const a of world.actorList) {
      if (i >= N) break;
      const child = g.children[i];
      if (!a.alive || a.scopeGlint <= 0.02) { child.visible = false; i++; continue; }
      child.visible = true;
      const h = a.pos[1] + 1.55;
      const fw = [-Math.sin(a.yaw), 0, -Math.cos(a.yaw)];
      child.position.set(a.pos[0] + fw[0] * 0.35, h, a.pos[2] + fw[2] * 0.35);
      child.scale.setScalar(0.32 + a.scopeGlint * 0.5);
      child.material.opacity = a.scopeGlint * 0.85;
      i++;
    }
    for (; i < N; i++) g.children[i].visible = false;
  });
  return (
    <group ref={grp}>
      {Array.from({ length: N }).map((_, i) => (
        <sprite key={i} visible={false}>
          <spriteMaterial map={T.glow} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} color="#cfe8ff" />
        </sprite>
      ))}
    </group>
  );
}

export function Effects() {
  return (
    <group>
      <MuzzleFlashes />
      <Tracers />
      <Impacts />
      <Decals />
      <BloodHits />
      <Explosions />
      <SmokeClouds />
      <Shells />
      <ScopeGlints />
    </group>
  );
}

export default Effects;
