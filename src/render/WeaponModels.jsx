/**
 * BREACHPOINT — Procedural weapon models.
 *
 * Final GLB assets aren't shipped with the prototype, so each weapon is built
 * from correctly-proportioned mid-poly primitives that follow PRD §7.2 to the
 * letter (materials, accent colours, scope construction, bipods, drum mags...).
 * They are drop-in replaceable: swap <WeaponModel> for a useGLTF() load later
 * and nothing else in the game needs to change.
 */
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { getGunMaterials } from './materials.js';
import { WEAPONS } from '../game/weapons.js';

function useGunMats(vis) {
  const { gmTex, gmNrm, woodTex } = getGunMaterials();
  return useMemo(() => ({
    body: new THREE.MeshStandardMaterial({
      color: vis.bodyColor, map: gmTex, normalMap: gmNrm,
      roughness: vis.roughness, metalness: vis.metalness,
      normalScale: new THREE.Vector2(0.5, 0.5),
    }),
    frame: new THREE.MeshStandardMaterial({
      color: vis.frameColor, map: gmTex, normalMap: gmNrm,
      roughness: Math.min(1, vis.roughness + 0.12), metalness: vis.metalness * 0.85,
      normalScale: new THREE.Vector2(0.4, 0.4),
    }),
    accent: new THREE.MeshStandardMaterial({
      color: vis.accentColor, emissive: vis.accentColor,
      emissiveIntensity: 0.5, roughness: 0.42, metalness: 0.5,
    }),
    dark: new THREE.MeshStandardMaterial({ color: '#101114', roughness: 0.72, metalness: 0.45 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#151517', roughness: 0.96, metalness: 0.02 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: '#8fb8d8', roughness: 0.05, metalness: 0.1,
      transmission: 0.55, thickness: 0.02, transparent: true, opacity: 0.55,
      clearcoat: 1, clearcoatRoughness: 0.05,
    }),
    wood: new THREE.MeshStandardMaterial({ color: '#4d3320', map: woodTex, roughness: 0.72, metalness: 0.04 }),
    steel: new THREE.MeshStandardMaterial({ color: '#9aa1a9', roughness: 0.28, metalness: 0.95 }),
    carbon: new THREE.MeshStandardMaterial({ color: '#1a1c1f', roughness: 0.35, metalness: 0.6 }),
  }), [vis, gmTex, gmNrm, woodTex]);
}

const B = ({ p = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0], m }) => (
  <mesh position={p} scale={s} rotation={r} material={m} castShadow>
    <boxGeometry args={[1, 1, 1]} />
  </mesh>
);
const C = ({ p = [0, 0, 0], r = [0, 0, 0], args, m }) => (
  <mesh position={p} rotation={r} material={m} castShadow>
    <cylinderGeometry args={args} />
  </mesh>
);

// ------------------------------------------------------------------ PX-1
// "pistol polymer kompak, slide matte black, frame gunmetal, front sight
//  fiber-optic merah kecil, rel bawah barrel kosong"
function PX1({ mats }) {
  return (
    <group>
      <B p={[0, 0.012, -0.045]} s={[0.035, 0.048, 0.19]} m={mats.body} />
      <B p={[0, 0.04, -0.045]} s={[0.031, 0.012, 0.185]} m={mats.body} />
      <B p={[0, -0.022, -0.03]} s={[0.032, 0.03, 0.14]} m={mats.frame} />
      {/* underbarrel rail (empty, per PRD) */}
      <B p={[0, -0.036, -0.075]} s={[0.022, 0.008, 0.07]} m={mats.dark} />
      {[0, 1, 2].map((i) => (
        <B key={i} p={[0, -0.041, -0.055 - i * 0.018]} s={[0.02, 0.004, 0.006]} m={mats.dark} />
      ))}
      {/* grip, angled */}
      <B p={[0, -0.075, 0.028]} s={[0.03, 0.105, 0.05]} r={[0.2, 0, 0]} m={mats.frame} />
      <B p={[0, -0.075, 0.05]} s={[0.026, 0.09, 0.012]} r={[0.2, 0, 0]} m={mats.rubber} />
      {/* trigger guard */}
      <mesh position={[0, -0.036, -0.005]} material={mats.frame} castShadow>
        <torusGeometry args={[0.026, 0.005, 8, 16, Math.PI * 1.35]} />
      </mesh>
      <B p={[0, -0.03, -0.005]} s={[0.008, 0.022, 0.006]} m={mats.dark} />
      {/* barrel + muzzle */}
      <C p={[0, 0.012, -0.145]} r={[Math.PI / 2, 0, 0]} args={[0.011, 0.011, 0.03, 12]} m={mats.steel} />
      {/* fiber-optic front sight (red) */}
      <B p={[0, 0.052, -0.128]} s={[0.005, 0.012, 0.006]} m={mats.accent} />
      {/* rear sight */}
      <B p={[-0.011, 0.052, 0.03]} s={[0.006, 0.009, 0.007]} m={mats.dark} />
      <B p={[0.011, 0.052, 0.03]} s={[0.006, 0.009, 0.007]} m={mats.dark} />
      {/* mag base */}
      <B p={[0, -0.13, 0.033]} s={[0.031, 0.012, 0.05]} r={[0.2, 0, 0]} m={mats.dark} />
      {/* slide serrations */}
      {[0, 1, 2, 3].map((i) => (
        <B key={i} p={[0, 0.02, 0.02 + i * 0.011]} s={[0.036, 0.03, 0.003]} m={mats.dark} />
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ Wisp
// "sidearm otomatis mungil, foregrip lipat, brushed steel, indikator biru
//  menyala dekat laras (energy vent), snub compact"
function Wisp({ mats }) {
  return (
    <group>
      <B p={[0, 0.01, -0.06]} s={[0.038, 0.055, 0.22]} m={mats.body} />
      <B p={[0, 0.044, -0.06]} s={[0.03, 0.014, 0.2]} m={mats.frame} />
      {/* energy vent slots — glowing blue */}
      {[0, 1, 2].map((i) => (
        <B key={i} p={[0.02, 0.012, -0.115 + i * 0.026]} s={[0.003, 0.016, 0.014]} m={mats.accent} />
      ))}
      {[0, 1, 2].map((i) => (
        <B key={`l${i}`} p={[-0.02, 0.012, -0.115 + i * 0.026]} s={[0.003, 0.016, 0.014]} m={mats.accent} />
      ))}
      {/* folding foregrip (deployed) */}
      <B p={[0, -0.052, -0.115]} s={[0.02, 0.075, 0.024]} r={[0.12, 0, 0]} m={mats.frame} />
      <B p={[0, -0.088, -0.112]} s={[0.024, 0.012, 0.03]} m={mats.rubber} />
      {/* grip */}
      <B p={[0, -0.072, 0.03]} s={[0.032, 0.1, 0.048]} r={[0.16, 0, 0]} m={mats.frame} />
      <B p={[0, -0.072, 0.052]} s={[0.028, 0.086, 0.012]} r={[0.16, 0, 0]} m={mats.rubber} />
      <mesh position={[0, -0.034, -0.008]} material={mats.frame} castShadow>
        <torusGeometry args={[0.024, 0.005, 8, 16, Math.PI * 1.3]} />
      </mesh>
      {/* extended mag */}
      <B p={[0, -0.11, 0.028]} s={[0.03, 0.075, 0.045]} r={[0.16, 0, 0]} m={mats.dark} />
      {/* barrel */}
      <C p={[0, 0.012, -0.185]} r={[Math.PI / 2, 0, 0]} args={[0.009, 0.009, 0.05, 12]} m={mats.steel} />
      <C p={[0, 0.012, -0.2]} r={[Math.PI / 2, 0, 0]} args={[0.013, 0.013, 0.02, 12]} m={mats.dark} />
      <B p={[0, 0.056, -0.15]} s={[0.004, 0.01, 0.006]} m={mats.accent} />
    </group>
  );
}

// ------------------------------------------------------------------ Raptor-9
// "SMG kompak, stock terlipat di sisi body, housing magasin melengkung,
//  ejection port oranye, holo sight menyatu di top rail, olive-drab + grip hitam"
function Raptor9({ mats }) {
  return (
    <group>
      <B p={[0, 0, -0.1]} s={[0.05, 0.075, 0.3]} m={mats.body} />
      <B p={[0, 0.042, -0.1]} s={[0.03, 0.012, 0.28]} m={mats.dark} />
      {/* top rail slots */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <B key={i} p={[0, 0.05, -0.19 + i * 0.03]} s={[0.026, 0.005, 0.012]} m={mats.dark} />
      ))}
      {/* integrated holographic sight */}
      <group position={[0, 0.076, -0.05]}>
        <B p={[0, 0, 0]} s={[0.034, 0.03, 0.055]} m={mats.dark} />
        <mesh position={[0, 0.002, -0.026]} material={mats.glass}>
          <boxGeometry args={[0.026, 0.024, 0.003]} />
        </mesh>
        <mesh position={[0, 0.002, -0.024]}>
          <ringGeometry args={[0.002, 0.0035, 12]} />
          <meshBasicMaterial color="#ff3020" toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
        <B p={[0, -0.02, 0]} s={[0.03, 0.014, 0.04]} m={mats.frame} />
      </group>
      {/* ejection port — orange accent */}
      <B p={[0.026, 0.014, -0.05]} s={[0.004, 0.024, 0.06]} m={mats.accent} />
      {/* curved magazine housing + mag */}
      <B p={[0, -0.06, -0.045]} s={[0.032, 0.06, 0.06]} r={[-0.16, 0, 0]} m={mats.frame} />
      <B p={[0, -0.115, -0.03]} s={[0.03, 0.075, 0.05]} r={[-0.3, 0, 0]} m={mats.dark} />
      <B p={[0, -0.155, -0.008]} s={[0.032, 0.014, 0.052]} r={[-0.3, 0, 0]} m={mats.frame} />
      {/* pistol grip */}
      <B p={[0, -0.07, 0.06]} s={[0.033, 0.1, 0.05]} r={[0.24, 0, 0]} m={mats.frame} />
      <B p={[0, -0.07, 0.082]} s={[0.029, 0.088, 0.012]} r={[0.24, 0, 0]} m={mats.rubber} />
      <mesh position={[0, -0.034, 0.022]} material={mats.frame} castShadow>
        <torusGeometry args={[0.026, 0.005, 8, 16, Math.PI * 1.3]} />
      </mesh>
      {/* side-folded stock (PRD: terlipat di sisi body) */}
      <B p={[0.042, 0.0, 0.06]} s={[0.014, 0.03, 0.16]} m={mats.frame} />
      <B p={[0.042, 0.0, 0.145]} s={[0.02, 0.05, 0.03]} m={mats.rubber} />
      {/* barrel + handguard */}
      <B p={[0, 0.004, -0.24]} s={[0.036, 0.036, 0.09]} m={mats.frame} />
      {[0, 1, 2].map((i) => (
        <B key={i} p={[0.019, 0.004, -0.265 + i * 0.026]} s={[0.003, 0.016, 0.012]} m={mats.dark} />
      ))}
      <C p={[0, 0.004, -0.3]} r={[Math.PI / 2, 0, 0]} args={[0.0095, 0.0095, 0.05, 12]} m={mats.steel} />
      <C p={[0, 0.004, -0.325]} r={[Math.PI / 2, 0, 0]} args={[0.014, 0.014, 0.022, 12]} m={mats.dark} />
    </group>
  );
}

// ------------------------------------------------------------------ Breacher-12
// "pump-action, foregrip walnut gelap, laras panjang, port shell kanan,
//  receiver hitam bertekstur baret"
function Breacher12({ mats }) {
  return (
    <group>
      <B p={[0, 0, -0.08]} s={[0.055, 0.08, 0.28]} m={mats.body} />
      {/* shell ejection port, right side */}
      <B p={[0.029, 0.008, -0.04]} s={[0.005, 0.03, 0.075]} m={mats.dark} />
      <B p={[0.031, 0.008, -0.04]} s={[0.002, 0.024, 0.065]} m={mats.accent} />
      {/* long barrel */}
      <C p={[0, 0.022, -0.36]} r={[Math.PI / 2, 0, 0]} args={[0.017, 0.017, 0.4, 14]} m={mats.frame} />
      <C p={[0, 0.022, -0.565]} r={[Math.PI / 2, 0, 0]} args={[0.021, 0.021, 0.026, 14]} m={mats.dark} />
      {/* magazine tube under the barrel */}
      <C p={[0, -0.012, -0.33]} r={[Math.PI / 2, 0, 0]} args={[0.014, 0.014, 0.34, 12]} m={mats.frame} />
      {/* walnut pump foregrip */}
      <group position={[0, -0.005, -0.29]}>
        <B p={[0, 0, 0]} s={[0.05, 0.048, 0.14]} m={mats.wood} />
        {[0, 1, 2, 3, 4].map((i) => (
          <B key={i} p={[0, -0.02, -0.05 + i * 0.025]} s={[0.052, 0.012, 0.008]} m={mats.dark} />
        ))}
      </group>
      {/* stock */}
      <B p={[0, -0.03, 0.12]} s={[0.045, 0.07, 0.14]} r={[-0.08, 0, 0]} m={mats.wood} />
      <B p={[0, -0.06, 0.215]} s={[0.05, 0.1, 0.03]} r={[-0.12, 0, 0]} m={mats.rubber} />
      {/* grip area */}
      <B p={[0, -0.058, 0.04]} s={[0.036, 0.075, 0.05]} r={[0.3, 0, 0]} m={mats.wood} />
      <mesh position={[0, -0.038, -0.005]} material={mats.frame} castShadow>
        <torusGeometry args={[0.028, 0.006, 8, 16, Math.PI * 1.3]} />
      </mesh>
      {/* bead front sight */}
      <mesh position={[0, 0.046, -0.55]} material={mats.accent} castShadow>
        <sphereGeometry args={[0.0055, 8, 8]} />
      </mesh>
      <B p={[0, 0.038, -0.55]} s={[0.004, 0.012, 0.006]} m={mats.dark} />
    </group>
  );
}

// ------------------------------------------------------------------ Vanguard-7
// "carbine modern, polymer hitam aksen tan, stock adjustable, mag 30,
//  rel atas dengan iron sight default"
function Vanguard7({ mats }) {
  return (
    <group>
      <B p={[0, 0, -0.08]} s={[0.05, 0.08, 0.3]} m={mats.body} />
      <B p={[0, 0.046, -0.09]} s={[0.028, 0.012, 0.34]} m={mats.dark} />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <B key={i} p={[0, 0.054, -0.24 + i * 0.036]} s={[0.024, 0.006, 0.014]} m={mats.dark} />
      ))}
      {/* flip-up iron sights */}
      <group position={[0, 0.07, -0.24]}>
        <B p={[0, 0, 0]} s={[0.02, 0.028, 0.008]} m={mats.dark} />
        <mesh position={[0, 0.008, 0]} material={mats.frame}>
          <torusGeometry args={[0.009, 0.0018, 6, 14]} />
        </mesh>
      </group>
      <group position={[0, 0.07, 0.05]}>
        <B p={[-0.008, 0, 0]} s={[0.005, 0.022, 0.008]} m={mats.dark} />
        <B p={[0.008, 0, 0]} s={[0.005, 0.022, 0.008]} m={mats.dark} />
      </group>
      {/* handguard with tan accents */}
      <B p={[0, 0.006, -0.26]} s={[0.044, 0.05, 0.2]} m={mats.frame} />
      {[0, 1, 2, 3].map((i) => (
        <B key={i} p={[0.023, 0.006, -0.33 + i * 0.04]} s={[0.003, 0.026, 0.02]} m={mats.dark} />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <B key={`l${i}`} p={[-0.023, 0.006, -0.33 + i * 0.04]} s={[0.003, 0.026, 0.02]} m={mats.dark} />
      ))}
      {/* barrel + flash hider */}
      <C p={[0, 0.006, -0.4]} r={[Math.PI / 2, 0, 0]} args={[0.0105, 0.0105, 0.11, 12]} m={mats.steel} />
      <C p={[0, 0.006, -0.465]} r={[Math.PI / 2, 0, 0]} args={[0.016, 0.014, 0.05, 10]} m={mats.dark} />
      {/* 30-round mag */}
      <B p={[0, -0.085, -0.04]} s={[0.03, 0.13, 0.055]} r={[-0.1, 0, 0]} m={mats.dark} />
      <B p={[0, -0.152, -0.032]} s={[0.032, 0.014, 0.058]} r={[-0.1, 0, 0]} m={mats.frame} />
      {/* pistol grip */}
      <B p={[0, -0.072, 0.055]} s={[0.033, 0.1, 0.048]} r={[0.26, 0, 0]} m={mats.body} />
      <B p={[0, -0.072, 0.077]} s={[0.029, 0.088, 0.012]} r={[0.26, 0, 0]} m={mats.rubber} />
      <mesh position={[0, -0.036, 0.014]} material={mats.frame} castShadow>
        <torusGeometry args={[0.026, 0.005, 8, 16, Math.PI * 1.3]} />
      </mesh>
      {/* adjustable stock */}
      <B p={[0, 0.0, 0.115]} s={[0.024, 0.032, 0.13]} m={mats.dark} />
      <B p={[0, -0.012, 0.2]} s={[0.042, 0.075, 0.055]} m={mats.body} />
      <B p={[0, -0.012, 0.232]} s={[0.046, 0.085, 0.014]} m={mats.rubber} />
      {[0, 1, 2].map((i) => (
        <B key={i} p={[0, -0.02, 0.09 + i * 0.024]} s={[0.026, 0.006, 0.008]} m={mats.accent} />
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ Falcon-6 DMR
// "semi-auto marksman, scope 3x permanen: tabung aluminium anodized hitam,
//  2 ring clamp Picatinny, reticle duplex, pantulan lensa saat ADS"
function Falcon6({ mats, ads = 0 }) {
  return (
    <group>
      <B p={[0, 0, -0.06]} s={[0.05, 0.085, 0.34]} m={mats.body} />
      <B p={[0, 0.05, -0.08]} s={[0.028, 0.012, 0.38]} m={mats.dark} />
      {/* --- 3x scope assembly --- */}
      <group position={[0, 0.098, -0.09]}>
        {/* anodised aluminium tube */}
        <C p={[0, 0, 0]} r={[Math.PI / 2, 0, 0]} args={[0.019, 0.019, 0.24, 20]} m={mats.dark} />
        {/* objective bell */}
        <C p={[0, 0, -0.145]} r={[Math.PI / 2, 0, 0]} args={[0.027, 0.021, 0.055, 20]} m={mats.dark} />
        <mesh position={[0, 0, -0.171]}>
          <circleGeometry args={[0.025, 20]} />
          <meshPhysicalMaterial
            color="#5a86b8" roughness={0.04} metalness={0.2}
            transmission={0.4} transparent opacity={0.85}
            emissive="#183048" emissiveIntensity={0.4 + ads * 1.6}
          />
        </mesh>
        {/* eyepiece + rubber eyecup */}
        <C p={[0, 0, 0.135]} r={[Math.PI / 2, 0, 0]} args={[0.024, 0.021, 0.04, 18]} m={mats.dark} />
        <C p={[0, 0, 0.16]} r={[Math.PI / 2, 0, 0]} args={[0.026, 0.026, 0.018, 18]} m={mats.rubber} />
        {/* two Picatinny ring clamps (PRD: dipasang via 2 ring clamp) */}
        {[-0.06, 0.055].map((z, i) => (
          <group key={i} position={[0, 0, z]}>
            <mesh material={mats.frame} castShadow>
              <torusGeometry args={[0.0215, 0.005, 8, 18]} />
            </mesh>
            <B p={[0, -0.026, 0]} s={[0.03, 0.03, 0.016]} m={mats.frame} />
            <B p={[0.016, -0.02, 0]} s={[0.008, 0.008, 0.014]} m={mats.steel} />
          </group>
        ))}
        {/* elevation turret */}
        <C p={[0, 0.026, 0]} args={[0.012, 0.012, 0.018, 14]} m={mats.frame} />
      </group>
      {/* handguard / barrel */}
      <B p={[0, 0.004, -0.28]} s={[0.042, 0.05, 0.22]} m={mats.frame} />
      {[0, 1, 2, 3, 4].map((i) => (
        <B key={i} p={[0.022, 0.004, -0.36 + i * 0.04]} s={[0.003, 0.026, 0.02]} m={mats.dark} />
      ))}
      <C p={[0, 0.004, -0.44]} r={[Math.PI / 2, 0, 0]} args={[0.011, 0.011, 0.12, 12]} m={mats.steel} />
      <C p={[0, 0.004, -0.51]} r={[Math.PI / 2, 0, 0]} args={[0.017, 0.015, 0.045, 10]} m={mats.dark} />
      {/* 15-round mag */}
      <B p={[0, -0.08, -0.02]} s={[0.03, 0.115, 0.06]} r={[-0.08, 0, 0]} m={mats.dark} />
      <B p={[0, -0.14, -0.015]} s={[0.032, 0.012, 0.062]} r={[-0.08, 0, 0]} m={mats.frame} />
      {/* grip + stock */}
      <B p={[0, -0.072, 0.07]} s={[0.033, 0.1, 0.048]} r={[0.26, 0, 0]} m={mats.body} />
      <B p={[0, -0.072, 0.092]} s={[0.029, 0.088, 0.012]} r={[0.26, 0, 0]} m={mats.rubber} />
      <mesh position={[0, -0.036, 0.03]} material={mats.frame} castShadow>
        <torusGeometry args={[0.026, 0.005, 8, 16, Math.PI * 1.3]} />
      </mesh>
      <B p={[0, 0.0, 0.15]} s={[0.03, 0.05, 0.16]} m={mats.body} />
      <B p={[0, 0.03, 0.19]} s={[0.026, 0.03, 0.07]} m={mats.frame} />
      <B p={[0, -0.02, 0.245]} s={[0.044, 0.09, 0.016]} m={mats.rubber} />
    </group>
  );
}

// ------------------------------------------------------------------ Vantage .50
// "bolt-action, barrel shroud carbon-fiber, bipod terlipat, scope 6-10x besar:
//  tabung panjang + turret elevasi & windage sebagai mesh silinder terpisah,
//  eyecup karet matte, reticle mil-dot, glint lensa"
function Vantage50({ mats, ads = 0 }) {
  return (
    <group>
      <B p={[0, 0, -0.04]} s={[0.055, 0.09, 0.4]} m={mats.body} />
      <B p={[0, 0.052, -0.06]} s={[0.03, 0.014, 0.44]} m={mats.dark} />
      {/* --- big variable scope --- */}
      <group position={[0, 0.112, -0.075]}>
        <C p={[0, 0, 0]} r={[Math.PI / 2, 0, 0]} args={[0.022, 0.022, 0.3, 22]} m={mats.dark} />
        {/* objective bell */}
        <C p={[0, 0, -0.185]} r={[Math.PI / 2, 0, 0]} args={[0.034, 0.024, 0.07, 22]} m={mats.dark} />
        <mesh position={[0, 0, -0.219]}>
          <circleGeometry args={[0.032, 22]} />
          <meshPhysicalMaterial
            color="#6d9ccc" roughness={0.03} metalness={0.25}
            transmission={0.45} transparent opacity={0.9}
            emissive="#2a5c8c" emissiveIntensity={0.5 + ads * 2.4}
          />
        </mesh>
        {/* zoom ring */}
        <C p={[0, 0, 0.1]} r={[Math.PI / 2, 0, 0]} args={[0.026, 0.026, 0.03, 22]} m={mats.frame} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <B key={i}
            p={[Math.sin((i / 6) * Math.PI * 2) * 0.026, Math.cos((i / 6) * Math.PI * 2) * 0.026, 0.1]}
            s={[0.004, 0.004, 0.028]} m={mats.dark} />
        ))}
        {/* elevation + windage turrets as separate cylinders (PRD §7.2) */}
        <C p={[0, 0.031, -0.03]} args={[0.014, 0.015, 0.026, 16]} m={mats.frame} />
        <C p={[0, 0.045, -0.03]} args={[0.011, 0.011, 0.008, 16]} m={mats.steel} />
        <C p={[0.031, 0, -0.03]} r={[0, 0, Math.PI / 2]} args={[0.013, 0.014, 0.024, 16]} m={mats.frame} />
        <C p={[0.044, 0, -0.03]} r={[0, 0, Math.PI / 2]} args={[0.01, 0.01, 0.008, 16]} m={mats.steel} />
        {/* parallax knob */}
        <C p={[-0.03, 0, -0.03]} r={[0, 0, Math.PI / 2]} args={[0.012, 0.012, 0.02, 16]} m={mats.frame} />
        {/* rubber eyecup, matte textured */}
        <C p={[0, 0, 0.168]} r={[Math.PI / 2, 0, 0]} args={[0.03, 0.026, 0.045, 20]} m={mats.rubber} />
        <mesh position={[0, 0, 0.19]}>
          <circleGeometry args={[0.024, 18]} />
          <meshBasicMaterial color="#05070a" />
        </mesh>
        {/* mounting rings */}
        {[-0.09, 0.05].map((z, i) => (
          <group key={i} position={[0, 0, z]}>
            <mesh material={mats.frame} castShadow>
              <torusGeometry args={[0.0245, 0.0055, 8, 20]} />
            </mesh>
            <B p={[0, -0.03, 0]} s={[0.034, 0.032, 0.018]} m={mats.frame} />
          </group>
        ))}
      </group>
      {/* carbon-fibre barrel shroud */}
      <C p={[0, 0.004, -0.4]} r={[Math.PI / 2, 0, 0]} args={[0.026, 0.026, 0.32, 18]} m={mats.carbon} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} position={[0, 0.004, -0.29 - i * 0.045]} rotation={[Math.PI / 2, 0, 0]} material={mats.dark}>
          <torusGeometry args={[0.0265, 0.0025, 6, 18]} />
        </mesh>
      ))}
      <C p={[0, 0.004, -0.6]} r={[Math.PI / 2, 0, 0]} args={[0.014, 0.014, 0.12, 12]} m={mats.steel} />
      {/* big muzzle brake */}
      <C p={[0, 0.004, -0.68]} r={[Math.PI / 2, 0, 0]} args={[0.024, 0.022, 0.075, 14]} m={mats.dark} />
      {[0, 1, 2].map((i) => (
        <B key={i} p={[0.02, 0.004, -0.66 - i * 0.02]} s={[0.012, 0.02, 0.008]} m={mats.dark} />
      ))}
      {/* folded bipod under the barrel */}
      <group position={[0, -0.026, -0.44]}>
        <B p={[0, 0, 0]} s={[0.028, 0.02, 0.06]} m={mats.frame} />
        <B p={[0.014, -0.05, 0.03]} s={[0.008, 0.1, 0.008]} r={[0.55, 0, 0.12]} m={mats.frame} />
        <B p={[-0.014, -0.05, 0.03]} s={[0.008, 0.1, 0.008]} r={[0.55, 0, -0.12]} m={mats.frame} />
        <B p={[0.019, -0.096, 0.06]} s={[0.014, 0.012, 0.02]} m={mats.rubber} />
        <B p={[-0.019, -0.096, 0.06]} s={[0.014, 0.012, 0.02]} m={mats.rubber} />
      </group>
      {/* bolt handle, right side */}
      <group position={[0.035, 0.02, 0.09]}>
        <C p={[0, 0, 0]} r={[0, 0, Math.PI / 2]} args={[0.008, 0.008, 0.05, 10]} m={mats.steel} />
        <mesh position={[0.032, -0.014, 0]} material={mats.steel} castShadow>
          <sphereGeometry args={[0.014, 12, 12]} />
        </mesh>
      </group>
      {/* 5-round mag */}
      <B p={[0, -0.082, -0.02]} s={[0.034, 0.11, 0.07]} m={mats.dark} />
      {/* grip + skeleton stock */}
      <B p={[0, -0.075, 0.09]} s={[0.034, 0.105, 0.05]} r={[0.28, 0, 0]} m={mats.body} />
      <B p={[0, -0.075, 0.113]} s={[0.03, 0.092, 0.012]} r={[0.28, 0, 0]} m={mats.rubber} />
      <mesh position={[0, -0.038, 0.05]} material={mats.frame} castShadow>
        <torusGeometry args={[0.028, 0.005, 8, 16, Math.PI * 1.3]} />
      </mesh>
      <B p={[0, 0.005, 0.19]} s={[0.036, 0.075, 0.2]} m={mats.body} />
      <B p={[0, 0.005, 0.19]} s={[0.04, 0.04, 0.12]} m={mats.dark} />
      <B p={[0, 0.045, 0.24]} s={[0.03, 0.04, 0.07]} m={mats.frame} />
      <B p={[0, -0.01, 0.295]} s={[0.05, 0.1, 0.018]} m={mats.rubber} />
    </group>
  );
}

// ------------------------------------------------------------------ Hailstorm
// "LMG berat, drum magazine besar, chassis tebal, bipod terintegrasi,
//  laras tebal dengan heat-shield berventilasi"
function Hailstorm({ mats }) {
  return (
    <group>
      <B p={[0, 0, -0.06]} s={[0.07, 0.1, 0.36]} m={mats.body} />
      <B p={[0, 0.056, -0.08]} s={[0.032, 0.014, 0.4]} m={mats.dark} />
      {/* carry handle */}
      <B p={[0, 0.086, -0.14]} s={[0.02, 0.05, 0.016]} m={mats.frame} />
      <B p={[0, 0.086, 0.0]} s={[0.02, 0.05, 0.016]} m={mats.frame} />
      <B p={[0, 0.109, -0.07]} s={[0.024, 0.014, 0.16]} m={mats.frame} />
      {/* iron sight */}
      <B p={[0, 0.072, 0.06]} s={[0.018, 0.024, 0.008]} m={mats.dark} />
      {/* heat-shielded barrel with vents */}
      <C p={[0, 0.006, -0.36]} r={[Math.PI / 2, 0, 0]} args={[0.032, 0.032, 0.28, 18]} m={mats.frame} />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <B key={i} p={[0.032, 0.006, -0.47 + i * 0.036]} s={[0.006, 0.03, 0.018]} m={mats.dark} />
      ))}
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <B key={`l${i}`} p={[-0.032, 0.006, -0.47 + i * 0.036]} s={[0.006, 0.03, 0.018]} m={mats.dark} />
      ))}
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <B key={`t${i}`} p={[0, 0.038, -0.47 + i * 0.036]} s={[0.03, 0.006, 0.018]} m={mats.dark} />
      ))}
      <C p={[0, 0.006, -0.545]} r={[Math.PI / 2, 0, 0]} args={[0.015, 0.015, 0.1, 12]} m={mats.steel} />
      <C p={[0, 0.006, -0.605]} r={[Math.PI / 2, 0, 0]} args={[0.023, 0.02, 0.05, 12]} m={mats.dark} />
      {/* big drum magazine */}
      <group position={[0, -0.115, -0.02]}>
        <C p={[0, 0, 0]} r={[0, 0, Math.PI / 2]} args={[0.082, 0.082, 0.075, 24]} m={mats.dark} />
        <C p={[0.039, 0, 0]} r={[0, 0, Math.PI / 2]} args={[0.07, 0.07, 0.004, 24]} m={mats.accent} />
        <C p={[-0.039, 0, 0]} r={[0, 0, Math.PI / 2]} args={[0.07, 0.07, 0.004, 24]} m={mats.frame} />
        <C p={[0, 0, 0]} r={[0, 0, Math.PI / 2]} args={[0.026, 0.026, 0.08, 16]} m={mats.frame} />
        <B p={[0, 0.075, 0]} s={[0.04, 0.07, 0.05]} m={mats.frame} />
      </group>
      {/* integrated bipod, deployed */}
      <group position={[0, -0.03, -0.4]}>
        <B p={[0, 0, 0]} s={[0.03, 0.026, 0.05]} m={mats.frame} />
        <B p={[0.05, -0.075, 0.01]} s={[0.01, 0.16, 0.01]} r={[0.1, 0, 0.42]} m={mats.frame} />
        <B p={[-0.05, -0.075, 0.01]} s={[0.01, 0.16, 0.01]} r={[0.1, 0, -0.42]} m={mats.frame} />
        <B p={[0.086, -0.152, 0.017]} s={[0.024, 0.012, 0.03]} m={mats.rubber} />
        <B p={[-0.086, -0.152, 0.017]} s={[0.024, 0.012, 0.03]} m={mats.rubber} />
      </group>
      {/* grip + heavy stock */}
      <B p={[0, -0.078, 0.075]} s={[0.036, 0.105, 0.05]} r={[0.26, 0, 0]} m={mats.body} />
      <B p={[0, -0.078, 0.098]} s={[0.032, 0.092, 0.012]} r={[0.26, 0, 0]} m={mats.rubber} />
      <mesh position={[0, -0.04, 0.036]} material={mats.frame} castShadow>
        <torusGeometry args={[0.028, 0.006, 8, 16, Math.PI * 1.3]} />
      </mesh>
      <B p={[0, 0.0, 0.16]} s={[0.05, 0.08, 0.14]} m={mats.body} />
      <B p={[0, -0.014, 0.235]} s={[0.056, 0.1, 0.02]} m={mats.rubber} />
      <B p={[0, 0.042, 0.2]} s={[0.03, 0.03, 0.09]} m={mats.frame} />
    </group>
  );
}

const BUILDERS = {
  px1: PX1,
  wisp: Wisp,
  raptor9: Raptor9,
  breacher12: Breacher12,
  vanguard7: Vanguard7,
  falcon6: Falcon6,
  vantage50: Vantage50,
  hailstorm: Hailstorm,
};

/** Public weapon model. `scale` lets the third-person view shrink it. */
export function WeaponModel({ weaponId, ads = 0, scale = 1 }) {
  const spec = WEAPONS[weaponId] || WEAPONS.px1;
  const mats = useGunMats(spec.visual);
  const Builder = BUILDERS[weaponId] || PX1;
  return (
    <group scale={scale}>
      <Builder mats={mats} ads={ads} />
    </group>
  );
}

/** Simplified silhouette for distant third-person actors (perf). */
export function WeaponSilhouette({ weaponId }) {
  const spec = WEAPONS[weaponId] || WEAPONS.px1;
  const mats = useGunMats(spec.visual);
  const len = spec.visual.length;
  return (
    <group>
      <mesh position={[0, 0, -len * 0.4]} material={mats.body} castShadow>
        <boxGeometry args={[0.05, 0.08, len]} />
      </mesh>
      <mesh position={[0, -0.06, -len * 0.1]} material={mats.dark} castShadow>
        <boxGeometry args={[0.03, 0.1, 0.05]} />
      </mesh>
      {spec.slot === 'primary' && (
        <mesh position={[0, 0.0, len * 0.3]} material={mats.frame} castShadow>
          <boxGeometry args={[0.04, 0.06, 0.16]} />
        </mesh>
      )}
    </group>
  );
}

export default WeaponModel;
