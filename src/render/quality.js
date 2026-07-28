/**
 * BREACHPOINT — Adaptive quality tiers.
 *
 * Implements the tier table and runtime scaling from
 * `breachpoint-mobile-optimization-prd.md` §3.6 and §4.
 *
 * Playtest complaint this addresses: "medium and high look the same, just
 * heavier". Previously the only differences were shadow-map size and pixel
 * ratio. Each tier now changes a distinct, visible set of render features:
 *
 *            | LOW              | MEDIUM             | HIGH
 *  ----------|------------------|--------------------|---------------------
 *  shadows   | off (blob only)  | 1024 PCF           | 2048 PCFSoft
 *  post      | none             | bloom + grade      | + SSAO + sharpen
 *  env/refl  | flat             | low-res env        | full PMREM env
 *  textures  | 256 (coarse)     | 512                | 1024 + aniso 8
 *  dust      | off              | 180                | 340
 *  pixelRatio| 0.7 - 1.0        | 1.0 - 1.35         | 1.0 - 2.0
 *
 * `dynamicRes` then trims the internal resolution at runtime when frame time
 * exceeds budget, so a struggling device keeps a stable frame rate instead of
 * stuttering (PRD §3.6).
 */

export const TIERS = {
  low: {
    id: 'low',
    label: 'LOW',
    dpr: [0.7, 1.0],
    antialias: false,
    shadows: false,
    shadowMapSize: 0,
    shadowType: 'basic',
    blobShadows: true,
    bloom: false,
    ssao: false,
    grade: false,
    envMap: false,
    envResolution: 0,
    // Deliberately coarse: fewer texels to sample and upload. The PRD calls
    // for a genuinely cheaper texture tier, not the same texture downscaled.
    textureSize: 256,
    textureDetail: 0.45,
    anisotropy: 1,
    dustCount: 0,
    maxDynamicLights: 3,
    lodBias: 0.55,
    targetMs: 33.3,
  },
  medium: {
    id: 'medium',
    label: 'MEDIUM',
    dpr: [1.0, 1.35],
    antialias: true,
    shadows: true,
    shadowMapSize: 1024,
    shadowType: 'pcf',
    blobShadows: false,
    bloom: true,
    ssao: false,
    grade: true,
    envMap: true,
    envResolution: 128,
    textureSize: 512,
    textureDetail: 0.8,
    anisotropy: 4,
    dustCount: 180,
    maxDynamicLights: 6,
    lodBias: 0.8,
    targetMs: 20.0,
  },
  high: {
    id: 'high',
    label: 'HIGH',
    dpr: [1.0, 2.0],
    antialias: true,
    shadows: true,
    shadowMapSize: 2048,
    shadowType: 'pcfsoft',
    blobShadows: false,
    bloom: true,
    ssao: true,
    grade: true,
    envMap: true,
    envResolution: 256,
    textureSize: 1024,
    textureDetail: 1.0,
    anisotropy: 8,
    dustCount: 340,
    maxDynamicLights: 8,
    lodBias: 1.0,
    targetMs: 16.6,
  },
};

export function getTier(id) {
  return TIERS[id] || TIERS.medium;
}

/**
 * Pick a starting tier from GPU/RAM signals (PRD §4).
 * This is only the initial guess; DynamicResolution corrects it at runtime.
 */
export function detectTier() {
  if (typeof navigator === 'undefined') return 'medium';

  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const coarse = typeof matchMedia !== 'undefined'
    && matchMedia('(pointer: coarse)').matches;

  let gpu = '';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '';
    }
  } catch {
    gpu = '';
  }
  const g = gpu.toLowerCase();

  // Software rasterisers can never sustain a high tier.
  if (/swiftshader|llvmpipe|software|basic render/.test(g)) return 'low';

  const weak = /adreno [1-5]\d{2}\b|mali-[tg]?[1-6]\d{1,2}\b|powervr (ge|g6)/.test(g);
  if (weak || mem <= 2 || cores <= 2) return 'low';

  const strong = /apple (a1[4-9]|m[1-9])|adreno (7\d\d|6[5-9]\d)|mali-g7[1-9]|rtx|radeon rx|geforce/.test(g);
  if (strong && mem >= 6) return 'high';

  // Unknown mobile GPU: start mid and let dynamic resolution decide.
  if (coarse) return mem >= 6 && cores >= 8 ? 'high' : 'medium';
  return mem >= 8 ? 'high' : 'medium';
}

/**
 * Dynamic resolution scaler (PRD §3.6).
 *
 * Samples frame time over a window and nudges a render scale between 0.6 and
 * 1.0. Adjustments are deliberately slow and hysteretic: reacting to a single
 * slow frame would make the image visibly pulse.
 */
export class DynamicResolution {
  constructor(targetMs) {
    this.targetMs = targetMs;
    this.scale = 1;
    this.samples = [];
    this.cooldown = 0;
    this.min = 0.6;
    this.max = 1;
  }

  setTarget(ms) {
    this.targetMs = ms;
  }

  /** @returns {number|null} a new scale to apply, or null when unchanged. */
  update(dtMs) {
    this.samples.push(dtMs);
    if (this.samples.length < 45) return null;

    // Median is robust against a single GC spike.
    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    this.samples.length = 0;

    if (this.cooldown > 0) { this.cooldown -= 1; return null; }

    const prev = this.scale;
    if (median > this.targetMs * 1.25) {
      this.scale = Math.max(this.min, this.scale - 0.1);
      this.cooldown = 2;
    } else if (median < this.targetMs * 0.7 && this.scale < this.max) {
      this.scale = Math.min(this.max, this.scale + 0.05);
      this.cooldown = 4;
    }
    return this.scale !== prev ? this.scale : null;
  }
}
