/**
 * BREACHPOINT — Weapon catalogue.
 * Stats are lifted verbatim from PRD §7.1; the `visual` block encodes PRD §7.2
 * so the procedural GLB-equivalent mesh builders stay faithful to the design doc.
 */

export const FIRE_MODE = {
  SEMI: 'semi',
  AUTO: 'auto',
  PUMP: 'pump',
  BOLT: 'bolt',
};

/**
 * Damage falloff: damage is scaled by lerp over [nearRange -> farRange] to farMul.
 * Recoil pattern: array of [horizontal, vertical] kicks in degrees, cycled per shot.
 */
export const WEAPONS = {
  px1: {
    id: 'px1',
    name: 'PX-1',
    category: 'Pistol',
    slot: 'sidearm',
    price: 0,
    isDefault: true,
    damage: 22, // PRD §7.1
    fireMode: FIRE_MODE.SEMI,
    rpm: 400,
    magazine: 12,
    reserve: 60,
    reloadTime: 1.5,
    pellets: 1,
    nearRange: 18,
    farRange: 40,
    farMul: 0.65,
    adsFov: 58,
    adsTime: 0.14,
    moveSpeedMul: 1.0,
    baseSpread: 0.42,
    recoil: { vertical: 1.15, horizontal: 0.38, recovery: 8.5, kickback: 0.024 },
    pattern: [[0, 1], [0.2, 1], [-0.25, 1], [0.35, 0.9], [-0.4, 0.9]],
    audio: { profile: 'crack', pitch: 1.28, gain: 0.5, tail: 0.14 },
    scope: null,
    tracer: 0.35,
    visual: {
      // PRD §7.2 — compact polymer pistol, matte black slide, gunmetal frame,
      // red fiber-optic front sight, empty underbarrel rail.
      bodyColor: '#1c1d20',
      frameColor: '#4a4e54',
      accentColor: '#ff2b2b',
      metalness: 0.62,
      roughness: 0.42,
      length: 0.2,
      style: 'pistol',
    },
  },
  wisp: {
    id: 'wisp',
    name: 'Wisp',
    category: 'Machine Pistol',
    slot: 'sidearm',
    price: 500,
    damage: 16,
    fireMode: FIRE_MODE.AUTO,
    rpm: 900, // "full-auto cepat"
    magazine: 20,
    reserve: 80,
    reloadTime: 1.8,
    pellets: 1,
    nearRange: 14,
    farRange: 32,
    farMul: 0.55,
    adsFov: 62,
    adsTime: 0.13,
    moveSpeedMul: 1.0,
    baseSpread: 0.62,
    recoil: { vertical: 0.86, horizontal: 0.5, recovery: 9.5, kickback: 0.016 },
    pattern: [[0, 1], [0.3, 1], [-0.35, 0.95], [0.5, 0.9], [-0.6, 0.85], [0.7, 0.8]],
    audio: { profile: 'crack', pitch: 1.45, gain: 0.4, tail: 0.1 },
    scope: null,
    tracer: 0.5,
    visual: {
      // PRD §7.2 — tiny auto sidearm, folding foregrip, brushed steel,
      // small glowing blue "energy vent" indicator near the barrel.
      bodyColor: '#8b9099',
      frameColor: '#33373d',
      accentColor: '#31d9ff',
      metalness: 0.85,
      roughness: 0.3,
      length: 0.26,
      style: 'machinepistol',
    },
  },
  raptor9: {
    id: 'raptor9',
    name: 'Raptor-9',
    category: 'SMG',
    slot: 'primary',
    price: 1500,
    damage: 26,
    fireMode: FIRE_MODE.AUTO,
    rpm: 780,
    magazine: 25,
    reserve: 100,
    reloadTime: 2.0,
    pellets: 1,
    nearRange: 20,
    farRange: 42,
    farMul: 0.6,
    adsFov: 56,
    adsTime: 0.17,
    moveSpeedMul: 0.98,
    baseSpread: 0.5,
    recoil: { vertical: 1.0, horizontal: 0.42, recovery: 8.2, kickback: 0.02 },
    pattern: [[0, 1], [0.15, 1], [-0.2, 1], [0.35, 0.95], [-0.45, 0.9], [0.55, 0.85], [-0.5, 0.8]],
    audio: { profile: 'smg', pitch: 1.2, gain: 0.5, tail: 0.12 },
    scope: { type: 'holo', magnification: 1.0 }, // fixed holo sight per PRD §7.2
    tracer: 0.6,
    visual: {
      // PRD §7.2 — compact SMG, side-folded stock, curved mag housing,
      // orange ejection-port accent, integrated holo sight, olive-drab + black grip.
      bodyColor: '#4a5238',
      frameColor: '#1b1c1a',
      accentColor: '#ff8a1e',
      metalness: 0.5,
      roughness: 0.55,
      length: 0.46,
      style: 'smg',
    },
  },
  breacher12: {
    id: 'breacher12',
    name: 'Breacher-12',
    category: 'Shotgun',
    slot: 'primary',
    price: 2000,
    damage: 90, // PRD §7.1 — 90 close, heavy drop-off
    fireMode: FIRE_MODE.PUMP,
    rpm: 75,
    magazine: 6,
    reserve: 24,
    reloadTime: 3.0, // PRD lists 3.0s per shell cycle -> modelled as full reload of the tube
    shellReload: true,
    shellReloadTime: 0.5,
    pellets: 9,
    pelletSpreadDeg: 3.4,
    nearRange: 7,
    farRange: 24,
    farMul: 0.16,
    adsFov: 64,
    adsTime: 0.2,
    moveSpeedMul: 0.94,
    baseSpread: 1.5,
    recoil: { vertical: 4.2, horizontal: 0.9, recovery: 5.4, kickback: 0.08 },
    pattern: [[0, 1], [0.4, 1], [-0.5, 1]],
    audio: { profile: 'boom', pitch: 0.7, gain: 0.85, tail: 0.4 },
    scope: null,
    tracer: 0.15,
    visual: {
      // PRD §7.2 — pump shotgun, dark walnut textured foregrip, long barrel,
      // visible right-side shell ejection port, scratched black receiver.
      bodyColor: '#242424',
      frameColor: '#4d3320',
      accentColor: '#c9a227',
      metalness: 0.55,
      roughness: 0.62,
      length: 0.62,
      style: 'shotgun',
    },
  },
  vanguard7: {
    id: 'vanguard7',
    name: 'Vanguard-7',
    category: 'Assault Rifle',
    slot: 'primary',
    price: 2900,
    damage: 34,
    fireMode: FIRE_MODE.AUTO,
    rpm: 640,
    magazine: 30,
    reserve: 120,
    reloadTime: 2.3,
    pellets: 1,
    nearRange: 30,
    farRange: 60,
    farMul: 0.78,
    adsFov: 52,
    adsTime: 0.2,
    moveSpeedMul: 0.95,
    baseSpread: 0.38,
    recoil: { vertical: 1.35, horizontal: 0.38, recovery: 7.0, kickback: 0.03 },
    pattern: [
      [0, 1], [0.1, 1.05], [-0.15, 1.05], [0.3, 1], [-0.35, 0.95], [0.5, 0.9],
      [-0.6, 0.85], [0.65, 0.8], [-0.7, 0.8], [0.6, 0.75],
    ],
    audio: { profile: 'rifle', pitch: 1.0, gain: 0.62, tail: 0.2 },
    scope: { type: 'iron', magnification: 1.0 },
    tracer: 0.7,
    visual: {
      // PRD §7.2 — modern carbine, black polymer with tan accents,
      // adjustable stock, 30-round mag, top rail with default iron sight.
      bodyColor: '#22242a',
      frameColor: '#9d7f4f',
      accentColor: '#c8cdd4',
      metalness: 0.55,
      roughness: 0.48,
      length: 0.6,
      style: 'rifle',
    },
  },
  falcon6: {
    id: 'falcon6',
    name: 'Falcon-6 DMR',
    category: 'Marksman Rifle',
    slot: 'primary',
    price: 3500,
    damage: 48,
    fireMode: FIRE_MODE.SEMI,
    rpm: 300,
    magazine: 15,
    reserve: 60,
    reloadTime: 2.5,
    pellets: 1,
    nearRange: 45,
    farRange: 85,
    farMul: 0.9,
    adsFov: 26, // 3x fixed scope
    adsTime: 0.26,
    moveSpeedMul: 0.92,
    baseSpread: 0.3,
    recoil: { vertical: 2.3, horizontal: 0.3, recovery: 6.0, kickback: 0.05 },
    pattern: [[0, 1], [0.15, 1], [-0.2, 1], [0.25, 0.95]],
    audio: { profile: 'dmr', pitch: 0.9, gain: 0.72, tail: 0.3 },
    scope: { type: 'duplex', magnification: 3.0, overlay: true },
    tracer: 0.85,
    visual: {
      // PRD §7.2 — permanent 3x scope: black anodised aluminium tube,
      // two Picatinny ring clamps, duplex reticle, subtle lens glare on ADS.
      bodyColor: '#2b2d31',
      frameColor: '#17181a',
      accentColor: '#7d848c',
      metalness: 0.68,
      roughness: 0.38,
      length: 0.72,
      style: 'dmr',
    },
  },
  vantage50: {
    id: 'vantage50',
    name: 'Vantage .50',
    category: 'Sniper Rifle',
    slot: 'primary',
    price: 4500,
    damage: 100, // one-shot body kill
    fireMode: FIRE_MODE.BOLT,
    rpm: 44,
    magazine: 5,
    reserve: 20,
    reloadTime: 3.5,
    boltTime: 1.25,
    pellets: 1,
    nearRange: 60,
    farRange: 120,
    farMul: 1.0,
    adsFov: 14, // 6x-10x variable
    adsFovAlt: 9,
    adsTime: 0.36,
    moveSpeedMul: 0.86,
    baseSpread: 0.22,
    recoil: { vertical: 5.5, horizontal: 0.5, recovery: 4.2, kickback: 0.11 },
    pattern: [[0, 1]],
    audio: { profile: 'sniper', pitch: 0.62, gain: 1.0, tail: 0.6 },
    scope: { type: 'mildot', magnification: 6.0, magnificationAlt: 10.0, overlay: true, glint: true },
    tracer: 1.0,
    visual: {
      // PRD §7.2 — bolt-action, carbon-fibre barrel shroud, folded bipod,
      // separate elevation/windage turret cylinders, matte rubber eyecup,
      // mil-dot reticle, lens glint that leaks the sniper's position.
      bodyColor: '#1e2024',
      frameColor: '#0f1012',
      accentColor: '#5c6570',
      metalness: 0.72,
      roughness: 0.35,
      length: 0.86,
      style: 'sniper',
    },
  },
  hailstorm: {
    id: 'hailstorm',
    name: 'Hailstorm',
    category: 'LMG',
    slot: 'primary',
    price: 5500,
    damage: 30,
    fireMode: FIRE_MODE.AUTO,
    rpm: 700,
    magazine: 75,
    reserve: 150,
    reloadTime: 4.0,
    pellets: 1,
    nearRange: 32,
    farRange: 65,
    farMul: 0.72,
    adsFov: 50,
    adsTime: 0.34,
    moveSpeedMul: 0.84,
    baseSpread: 0.72,
    recoil: { vertical: 1.15, horizontal: 0.62, recovery: 6.4, kickback: 0.028 },
    pattern: [
      [0, 1], [0.25, 1], [-0.3, 1], [0.45, 0.95], [-0.55, 0.9], [0.7, 0.9],
      [-0.8, 0.85], [0.9, 0.8], [-1.0, 0.8], [0.8, 0.75], [-0.7, 0.75], [0.5, 0.7],
    ],
    audio: { profile: 'lmg', pitch: 0.85, gain: 0.7, tail: 0.26 },
    scope: { type: 'iron', magnification: 1.0 },
    tracer: 0.9,
    visual: {
      // PRD §7.2 — heavy LMG, big drum magazine, thick chassis,
      // integrated bipod, heavy vented heat-shield barrel.
      bodyColor: '#2a2c2e',
      frameColor: '#141517',
      accentColor: '#8a5a2b',
      metalness: 0.7,
      roughness: 0.5,
      length: 0.78,
      style: 'lmg',
    },
  },
};

export const WEAPON_LIST = Object.values(WEAPONS);
export const PRIMARIES = WEAPON_LIST.filter((w) => w.slot === 'primary');
export const SIDEARMS = WEAPON_LIST.filter((w) => w.slot === 'sidearm');

// ---------------------------------------------------------------- PRD §7.3 Utility
export const UTILITY = {
  frag: {
    id: 'frag',
    name: 'Frag Grenade',
    price: 400,
    maxCount: 2,
    fuse: 2.6,
    radius: 5, // PRD §7.3 — AoE ~5m with falloff from centre
    maxDamage: 110,
    minDamage: 18,
    color: '#4b5320',
    capColor: '#2f3417',
    throwSpeed: 15,
    desc: 'AoE radius ~5m, damage falls off from the centre.',
  },
  flash: {
    id: 'flash',
    name: 'Flashbang',
    price: 200,
    maxCount: 2,
    fuse: 1.7,
    radius: 12,
    blindDuration: 3.6, // PRD §7.3 — 3-4s blind + deafen
    color: '#c9ccd1',
    capColor: '#8d9298',
    throwSpeed: 16,
    desc: 'Blinds and deafens anyone looking at the burst for 3-4s.',
  },
  smoke: {
    id: 'smoke',
    name: 'Smoke Grenade',
    price: 300,
    maxCount: 2,
    fuse: 1.4,
    radius: 4.6,
    duration: 15, // PRD §7.3 — blocks sightlines ~15s, bots respect it
    color: '#7a7f86',
    capColor: '#8e44ff',
    throwSpeed: 14,
    desc: 'Blocks sightlines for ~15s. AI treats it as a hard vision blocker.',
  },
  medkit: {
    id: 'medkit',
    name: 'Medkit',
    price: 300,
    maxCount: 1,
    healAmount: 50, // PRD §7.3
    useTime: 3,
    color: '#e8e8e8',
    capColor: '#d33',
    desc: 'Restores 50 HP over a 3s channel. Cannot be used while sprinting.',
  },
};

export const UTILITY_LIST = Object.values(UTILITY);

export function getWeapon(id) {
  return WEAPONS[id] || WEAPONS.px1;
}

/** Seconds between shots. */
export function fireInterval(weapon) {
  if (weapon.fireMode === FIRE_MODE.BOLT) return Math.max(60 / weapon.rpm, weapon.boltTime || 1.2);
  return 60 / weapon.rpm;
}

/** Range-scaled damage (PRD §6 damage model + per-weapon drop-off). */
export function damageAtRange(weapon, distance) {
  const { nearRange, farRange, farMul, damage } = weapon;
  if (distance <= nearRange) return damage;
  if (distance >= farRange) return damage * farMul;
  const t = (distance - nearRange) / Math.max(0.001, farRange - nearRange);
  return damage * (1 + (farMul - 1) * t);
}

/**
 * PRD §6 — Headshot 4x, Body 1x, Limb 0.75x.
 * Armor cuts body damage but never headshot damage.
 */
export function resolveDamage({ weapon, distance, hitZone, armor }) {
  const base = damageAtRange(weapon, distance);
  let mul = 1;
  if (hitZone === 'head') mul = 4.0;
  else if (hitZone === 'limb') mul = 0.75;
  let dmg = base * mul;
  if (hitZone !== 'head' && armor && armor !== 'none') {
    const red = armor === 'heavy' ? 0.4 : 0.25;
    dmg *= 1 - red;
  }
  return Math.max(1, Math.round(dmg));
}
