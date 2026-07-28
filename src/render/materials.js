/**
 * BREACHPOINT — Shared PBR materials + procedurally generated maps.
 *
 * PRD §15 calls for a detailed/realistic look via PBR (base color, roughness,
 * metallic, normal) on optimised mid-poly meshes rather than literal high-poly.
 * Final texture assets aren't shipped with the prototype, so the maps here are
 * generated on canvas at load time (rust, scratched metal, concrete, grating)
 * and fed through the standard MeshStandardMaterial PBR pipeline.
 */
import * as THREE from 'three';

const cache = new Map();

function canvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function toTexture(c, repeat = 1, srgb = false) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Fractal value noise painted into a canvas. */
function noiseCanvas(size, octaves, base, contrast, tint) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const grid = [];
  for (let o = 0; o < octaves; o++) {
    const n = 4 << o;
    const g = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) g[i] = Math.random();
    grid.push({ n, g });
  }
  const sample = (layer, x, y) => {
    const { n, g } = layer;
    const fx = x * n, fy = y * n;
    const x0 = Math.floor(fx) % n, y0 = Math.floor(fy) % n;
    const x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
    const tx = fx - Math.floor(fx), ty = fy - Math.floor(fy);
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = g[y0 * n + x0], b = g[y0 * n + x1];
    const cc = g[y1 * n + x0], d = g[y1 * n + x1];
    return (a * (1 - sx) + b * sx) * (1 - sy) + (cc * (1 - sx) + d * sx) * sy;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0, amp = 1, tot = 0;
      for (let o = 0; o < octaves; o++) {
        v += sample(grid[o], x / size, y / size) * amp;
        tot += amp;
        amp *= 0.5;
      }
      v /= tot;
      v = base + (v - 0.5) * contrast;
      v = Math.max(0, Math.min(1, v));
      const i = (y * size + x) * 4;
      img.data[i] = Math.round(v * 255 * (tint ? tint[0] : 1));
      img.data[i + 1] = Math.round(v * 255 * (tint ? tint[1] : 1));
      img.data[i + 2] = Math.round(v * 255 * (tint ? tint[2] : 1));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Derive a tangent-space normal map from a height/greyscale canvas. */
function normalFromHeight(src, strength = 2.2) {
  const size = src.width;
  const sctx = src.getContext('2d');
  const sdata = sctx.getImageData(0, 0, size, size).data;
  const out = canvas(size);
  const octx = out.getContext('2d');
  const img = octx.createImageData(size, size);
  const h = (x, y) => {
    const xx = (x + size) % size;
    const yy = (y + size) % size;
    return sdata[(yy * size + xx) * 4] / 255;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h(x - 1, y) - h(x + 1, y)) * strength;
      const dy = (h(x, y - 1) - h(x, y + 1)) * strength;
      let nx = dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * size + x) * 4;
      img.data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      img.data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      img.data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

// ------------------------------------------------------------------ surface generators
function rustCanvas(size = 256) {
  const c = noiseCanvas(size, 5, 0.42, 0.85, [1, 1, 1]);
  const ctx = c.getContext('2d');
  // rust blotches
  ctx.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 4 + Math.random() * 30;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const shade = Math.random();
    g.addColorStop(0, `rgba(${120 + shade * 60}, ${52 + shade * 35}, ${24 + shade * 16}, 0.55)`);
    g.addColorStop(1, 'rgba(90,40,18,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // vertical streaks
  ctx.globalAlpha = 0.24;
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size;
    const w = 1 + Math.random() * 3;
    const hgt = 20 + Math.random() * 120;
    const y = Math.random() * size;
    const g = ctx.createLinearGradient(0, y, 0, y + hgt);
    g.addColorStop(0, 'rgba(80,38,16,0.7)');
    g.addColorStop(1, 'rgba(60,30,12,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, hgt);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return c;
}

function concreteCanvas(size = 256) {
  const c = noiseCanvas(size, 5, 0.55, 0.35);
  const ctx = c.getContext('2d');
  // pitting
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 400; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 0.6 + Math.random() * 2.4;
    ctx.fillStyle = Math.random() > 0.5 ? '#2a2a2a' : '#8a8a8a';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // cracks
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = '#1d1d1d';
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    let x = Math.random() * size;
    let y = Math.random() * size;
    ctx.moveTo(x, y);
    ctx.lineWidth = 0.5 + Math.random();
    for (let k = 0; k < 8; k++) {
      x += (Math.random() - 0.5) * 40;
      y += (Math.random() - 0.5) * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return c;
}

function metalPlateCanvas(size = 256) {
  const c = noiseCanvas(size, 4, 0.6, 0.22);
  const ctx = c.getContext('2d');
  // panel seams
  ctx.strokeStyle = 'rgba(30,30,34,0.8)';
  ctx.lineWidth = 2;
  const cells = 2;
  for (let i = 1; i < cells; i++) {
    const p = (size / cells) * i;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
  }
  // rivets
  ctx.fillStyle = 'rgba(200,200,205,0.35)';
  const step = size / 8;
  for (let x = step / 2; x < size; x += step) {
    for (let y = step / 2; y < size; y += step) {
      if ((Math.round(x / step) + Math.round(y / step)) % 3) continue;
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // scratches
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = '#d8d8dd';
  for (let i = 0; i < 60; i++) {
    ctx.beginPath();
    const x = Math.random() * size, y = Math.random() * size;
    ctx.lineWidth = Math.random() * 0.9;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 22);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return c;
}

function grateCanvas(size = 256) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1b1d20';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#6e747c';
  ctx.lineWidth = 5;
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const p = (size / n) * i;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
  }
  ctx.lineWidth = 3;
  for (let i = 0; i <= n / 2; i++) {
    const p = (size / (n / 2)) * i;
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
  }
  ctx.globalAlpha = 0.25;
  ctx.drawImage(noiseCanvas(size, 4, 0.5, 0.5), 0, 0);
  ctx.globalAlpha = 1;
  return c;
}

function gravelCanvas(size = 256) {
  const c = noiseCanvas(size, 6, 0.4, 0.7);
  const ctx = c.getContext('2d');
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const r = 0.8 + Math.random() * 2.6;
    const v = 40 + Math.random() * 90;
    ctx.fillStyle = `rgb(${v},${v * 0.96},${v * 0.9})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + Math.random() * 0.6), Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

function woodCanvas(size = 256) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#6b4a2a';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 220; i++) {
    const y = Math.random() * size;
    ctx.strokeStyle = `rgba(${40 + Math.random() * 60},${25 + Math.random() * 40},${10 + Math.random() * 20},${0.15 + Math.random() * 0.3})`;
    ctx.lineWidth = 0.5 + Math.random() * 2.2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= size; x += 16) {
      ctx.lineTo(x, y + Math.sin(x * 0.06 + i) * 2.4);
    }
    ctx.stroke();
  }
  // plank divisions
  ctx.strokeStyle = 'rgba(20,12,6,0.65)';
  ctx.lineWidth = 3;
  for (let i = 1; i < 4; i++) {
    const y = (size / 4) * i;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
  }
  return c;
}

function gunmetalCanvas(size = 128) {
  const c = noiseCanvas(size, 4, 0.55, 0.28);
  const ctx = c.getContext('2d');
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = '#f0f0f5';
  for (let i = 0; i < 80; i++) {
    ctx.beginPath();
    const y = Math.random() * size;
    ctx.lineWidth = Math.random() * 0.7;
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (Math.random() - 0.5) * 6);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return c;
}

// ------------------------------------------------------------------ material factory
function make(name, builder) {
  if (cache.has(name)) return cache.get(name);
  const m = builder();
  cache.set(name, m);
  return m;
}

export function getMapMaterials() {
  return make('mapMaterials', () => {
    const rust = rustCanvas(256);
    const concrete = concreteCanvas(256);
    const plate = metalPlateCanvas(256);
    const grate = grateCanvas(256);
    const gravel = gravelCanvas(256);
    const wood = woodCanvas(256);

    const rustTex = toTexture(rust, 1, true);
    const rustNrm = toTexture(normalFromHeight(rust, 2.6));
    const concreteTex = toTexture(concrete, 1, true);
    const concreteNrm = toTexture(normalFromHeight(concrete, 1.6));
    const plateTex = toTexture(plate, 1, true);
    const plateNrm = toTexture(normalFromHeight(plate, 3.2));
    const grateTex = toTexture(grate, 1, true);
    const grateNrm = toTexture(normalFromHeight(grate, 3.4));
    const gravelTex = toTexture(gravel, 1, true);
    const gravelNrm = toTexture(normalFromHeight(gravel, 2.8));
    const woodTex = toTexture(wood, 1, true);
    const woodNrm = toTexture(normalFromHeight(wood, 2.0));

    const mk = (opts) => new THREE.MeshStandardMaterial({ ...opts });

    return {
      rustWall: mk({ color: '#6e5a4a', map: rustTex, normalMap: rustNrm, roughness: 0.92, metalness: 0.35, normalScale: new THREE.Vector2(1.1, 1.1) }),
      concreteWall: mk({ color: '#c4b89f', map: concreteTex, normalMap: concreteNrm, roughness: 0.96, metalness: 0.02 }),
      concreteFloor: mk({ color: '#6d6d69', map: concreteTex, normalMap: concreteNrm, roughness: 0.94, metalness: 0.03 }),
      gravel: mk({ color: '#5d5a53', map: gravelTex, normalMap: gravelNrm, roughness: 1.0, metalness: 0.0 }),
      metalPlate: mk({ color: '#7c8189', map: plateTex, normalMap: plateNrm, roughness: 0.58, metalness: 0.8 }),
      metalGrate: mk({ color: '#5b6068', map: grateTex, normalMap: grateNrm, roughness: 0.66, metalness: 0.85 }),
      crateWood: mk({ color: '#a87a44', map: woodTex, normalMap: woodNrm, roughness: 0.85, metalness: 0.05 }),
      crateMetal: mk({ color: '#5c6a55', map: plateTex, normalMap: plateNrm, roughness: 0.68, metalness: 0.7 }),
      machine: mk({ color: '#6e747c', map: plateTex, normalMap: plateNrm, roughness: 0.55, metalness: 0.88 }),
      pipe: mk({ color: '#6b625a', map: rustTex, normalMap: rustNrm, roughness: 0.72, metalness: 0.72 }),
      barrel: mk({ color: '#9a6b40', map: rustTex, normalMap: rustNrm, roughness: 0.8, metalness: 0.55 }),
      railing: mk({ color: '#a6adb6', roughness: 0.5, metalness: 0.9 }),
      ceiling: mk({ color: '#3d4148', map: plateTex, normalMap: plateNrm, roughness: 0.8, metalness: 0.6 }),
      hazard: mk({ color: '#ff7b1c', emissive: '#ff5500', emissiveIntensity: 1.6, roughness: 0.5, metalness: 0.3 }),

      // ---- daylight map palette (Dustline / Rangeyard) ----
      // Pale, high-albedo surfaces so dark operator silhouettes pop against
      // them. The old map's problem was low-albedo walls in low light.
      sandFloor: mk({ color: '#c9b795', map: gravelTex, normalMap: gravelNrm, roughness: 0.96, metalness: 0.0 }),
      plaster: mk({ color: '#d8cbb0', map: concreteTex, normalMap: concreteNrm, roughness: 0.94, metalness: 0.02 }),
      stone: mk({ color: '#b9ac93', map: concreteTex, normalMap: concreteNrm, roughness: 0.95, metalness: 0.02 }),
      metalDeck: mk({ color: '#9aa0a6', map: plateTex, normalMap: plateNrm, roughness: 0.58, metalness: 0.72 }),
      container: mk({ color: '#7d8a6a', map: plateTex, normalMap: plateNrm, roughness: 0.7, metalness: 0.55 }),
      canopy: mk({ color: '#b6a488', map: plateTex, normalMap: plateNrm, roughness: 0.86, metalness: 0.3 }),
      target: mk({ color: '#d94f2b', roughness: 0.7, metalness: 0.1 }),
    };
  });
}

export function getGunMaterials() {
  return make('gunMaterials', () => {
    const gm = gunmetalCanvas(128);
    const gmTex = toTexture(gm, 1, true);
    const gmNrm = toTexture(normalFromHeight(gm, 1.4));
    const wood = woodCanvas(128);
    const woodTex = toTexture(wood, 1, true);
    return { gmTex, gmNrm, woodTex };
  });
}

let _envTex = null;
export function getEnvMap(renderer) {
  if (_envTex) return _envTex;
  // Small procedural environment: dark foundry with warm lamps + cool skylights.
  const size = 128;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, '#1a2436');
  g.addColorStop(0.45, '#2a2620');
  g.addColorStop(1, '#0d0c0b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * size;
    const y = size * (0.18 + Math.random() * 0.3);
    const r = 5 + Math.random() * 14;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(255,176,80,0.95)');
    rg.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 6; i++) {
    const x = Math.random() * size;
    const y = size * (0.02 + Math.random() * 0.12);
    const r = 8 + Math.random() * 16;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(150,190,255,0.8)');
    rg.addColorStop(1, 'rgba(90,140,255,0)');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  if (renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    _envTex = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
    tex.dispose();
  } else {
    _envTex = tex;
  }
  return _envTex;
}

/** Team-tinted operator materials (PRD §10). */
export function getOperatorMaterials(team) {
  return make(`op-${team}`, () => {
    const accent = team === 'BLUE' ? '#3fa9ff' : '#ff5540';
    const plate = metalPlateCanvas(128);
    const plateTex = toTexture(plate, 1, true);
    const plateNrm = toTexture(normalFromHeight(plate, 1.8));
    return {
      fatigues: new THREE.MeshStandardMaterial({ color: '#33372f', roughness: 0.92, metalness: 0.03 }),
      vest: new THREE.MeshStandardMaterial({ color: '#23262a', map: plateTex, normalMap: plateNrm, roughness: 0.78, metalness: 0.18 }),
      accent: new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.55, roughness: 0.5, metalness: 0.2 }),
      gloves: new THREE.MeshStandardMaterial({ color: '#1c1e21', roughness: 0.85, metalness: 0.06 }),
      skin: new THREE.MeshStandardMaterial({ color: '#b58b6b', roughness: 0.72, metalness: 0.0 }),
      helmet: new THREE.MeshStandardMaterial({ color: '#2b2f33', roughness: 0.62, metalness: 0.35 }),
      boots: new THREE.MeshStandardMaterial({ color: '#161719', roughness: 0.88, metalness: 0.08 }),
      visor: new THREE.MeshStandardMaterial({ color: '#0d1116', roughness: 0.18, metalness: 0.9 }),
    };
  });
}

/**
 * Team outline material. Renders behind geometry (depthTest false) so the
 * silhouette shows through the environment, which is what makes enemies
 * findable on a busy map.
 */
export function getOutlineMaterial(team) {
  return make(`outline-${team}`, () => new THREE.MeshBasicMaterial({
    color: team === 'BLUE' ? '#3fa9ff' : '#ff3b2f',
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.55,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }));
}

export function disposeMaterialCache() {
  cache.clear();
}
