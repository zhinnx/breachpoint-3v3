/**
 * BREACHPOINT — Procedural audio engine (PRD §12).
 *
 * No sample assets ship with the prototype, so every sound is synthesised at
 * runtime with the Web Audio API. Positional sources route through a PannerNode
 * (HRTF) exactly as PRD §12 requires, so players can locate gunfire/footsteps.
 *
 * Sound families implemented:
 *   gunfire   — per-category tonal profile (crack / boom / smg / rifle / dmr / sniper / lmg)
 *   reload    — mag-out, mag-in, bolt cycle, shotgun pump
 *   footsteps — metal (clangy), concrete (flat thud), gravel (crunch), wood
 *   grenades  — pin pull, bounce, explosion w/ echo, flash ring + ducking
 *   ui        — buy click, confirm, round horn, win/lose jingle, match fanfare
 *   ambient   — industrial hum bed + wind + sparse metal groans
 */

let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let duckGain = null;
let noiseBuffer = null;
let pinkBuffer = null;
let ambientNodes = null;
let started = false;
let muffleFilter = null;
let ringOsc = null;
let ringGain = null;

const listenerPos = [0, 0, 0];

export function isReady() {
  return started && ctx && ctx.state === 'running';
}

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC({ latencyHint: 'interactive' });

  master = ctx.createGain();
  master.gain.value = 0.8;

  // Global "deafened" low-pass used by flashbangs (PRD §12).
  muffleFilter = ctx.createBiquadFilter();
  muffleFilter.type = 'lowpass';
  muffleFilter.frequency.value = 20000;
  muffleFilter.Q.value = 0.6;

  duckGain = ctx.createGain();
  duckGain.gain.value = 1;

  sfxBus = ctx.createGain();
  sfxBus.gain.value = 1;
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.5;

  // Light bus compression keeps big explosions from clipping.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 24;
  comp.ratio.value = 8;
  comp.attack.value = 0.003;
  comp.release.value = 0.22;

  sfxBus.connect(duckGain);
  musicBus.connect(duckGain);
  duckGain.connect(muffleFilter);
  muffleFilter.connect(comp);
  comp.connect(master);
  master.connect(ctx.destination);

  // white noise
  const len = ctx.sampleRate * 2;
  noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const nd = noiseBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;

  // pink-ish noise (for wind/ambience)
  pinkBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const pd = pinkBuffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.0990460;
    b1 = 0.96300 * b1 + w * 0.2965164;
    b2 = 0.57000 * b2 + w * 1.0526913;
    pd[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
  }

  if (ctx.listener.forwardX) {
    ctx.listener.forwardX.value = 0;
    ctx.listener.forwardY.value = 0;
    ctx.listener.forwardZ.value = -1;
    ctx.listener.upX.value = 0;
    ctx.listener.upY.value = 1;
    ctx.listener.upZ.value = 0;
  }

  started = true;
  return ctx;
}

export function resumeAudio() {
  if (!ctx) initAudio();
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function setVolumes({ masterVolume, sfxVolume, musicVolume }) {
  if (!ctx) return;
  if (masterVolume != null) master.gain.value = masterVolume;
  if (sfxVolume != null) sfxBus.gain.value = sfxVolume;
  if (musicVolume != null) musicBus.gain.value = musicVolume;
}

/** Sync the WebAudio listener with the FPS camera. */
export function updateListener(pos, forward, up = [0, 1, 0]) {
  if (!ctx) return;
  listenerPos[0] = pos[0]; listenerPos[1] = pos[1]; listenerPos[2] = pos[2];
  const l = ctx.listener;
  const t = ctx.currentTime;
  if (l.positionX) {
    l.positionX.setTargetAtTime(pos[0], t, 0.02);
    l.positionY.setTargetAtTime(pos[1], t, 0.02);
    l.positionZ.setTargetAtTime(pos[2], t, 0.02);
    l.forwardX.setTargetAtTime(forward[0], t, 0.02);
    l.forwardY.setTargetAtTime(forward[1], t, 0.02);
    l.forwardZ.setTargetAtTime(forward[2], t, 0.02);
    l.upX.value = up[0]; l.upY.value = up[1]; l.upZ.value = up[2];
  } else if (l.setPosition) {
    l.setPosition(pos[0], pos[1], pos[2]);
    l.setOrientation(forward[0], forward[1], forward[2], up[0], up[1], up[2]);
  }
}

/** Create a spatialised destination node (PRD §12 PannerNode requirement). */
function panner(pos, refDist = 6, maxDist = 90, rolloff = 1.1) {
  const p = ctx.createPanner();
  p.panningModel = 'HRTF';
  p.distanceModel = 'inverse';
  p.refDistance = refDist;
  p.maxDistance = maxDist;
  p.rolloffFactor = rolloff;
  if (p.positionX) {
    p.positionX.value = pos[0];
    p.positionY.value = pos[1];
    p.positionZ.value = pos[2];
  } else p.setPosition(pos[0], pos[1], pos[2]);
  p.connect(sfxBus);
  return p;
}

function out(pos, opts) {
  if (pos) return panner(pos, opts?.refDist, opts?.maxDist, opts?.rolloff);
  const g = ctx.createGain();
  g.connect(sfxBus);
  return g;
}

function noiseSource(buffer = noiseBuffer, playbackRate = 1) {
  const s = ctx.createBufferSource();
  s.buffer = buffer;
  s.loop = true;
  s.playbackRate.value = playbackRate;
  return s;
}

function envGain(t0, peak, attack, decay) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  return g;
}

// ------------------------------------------------------------------ GUNFIRE
const GUN_PROFILES = {
  crack: { bodyFreq: 210, bodyDecay: 0.09, noiseHP: 1400, noiseDecay: 0.075, punch: 0.55, snapFreq: 2600 },
  smg: { bodyFreq: 190, bodyDecay: 0.075, noiseHP: 1200, noiseDecay: 0.07, punch: 0.6, snapFreq: 2200 },
  rifle: { bodyFreq: 132, bodyDecay: 0.13, noiseHP: 900, noiseDecay: 0.12, punch: 0.85, snapFreq: 1700 },
  dmr: { bodyFreq: 104, bodyDecay: 0.19, noiseHP: 700, noiseDecay: 0.17, punch: 0.95, snapFreq: 1500 },
  boom: { bodyFreq: 68, bodyDecay: 0.3, noiseHP: 320, noiseDecay: 0.28, punch: 1.25, snapFreq: 900 },
  sniper: { bodyFreq: 58, bodyDecay: 0.42, noiseHP: 420, noiseDecay: 0.34, punch: 1.5, snapFreq: 1200 },
  lmg: { bodyFreq: 118, bodyDecay: 0.16, noiseHP: 800, noiseDecay: 0.13, punch: 1.0, snapFreq: 1500 },
};

export function playGunshot({ profile = 'rifle', pitch = 1, gain = 0.6, pos = null, tail = 0.2, suppressed = false }) {
  if (!isReady()) return;
  const P = GUN_PROFILES[profile] || GUN_PROFILES.rifle;
  const t0 = ctx.currentTime;
  const dest = out(pos, { refDist: 8, maxDist: 140, rolloff: 0.9 });
  const vol = gain * (suppressed ? 0.45 : 1);

  // 1) low-end punch (body)
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(P.bodyFreq * pitch * 2.2, t0);
  osc.frequency.exponentialRampToValueAtTime(P.bodyFreq * pitch * 0.55, t0 + P.bodyDecay);
  const og = envGain(t0, vol * P.punch, 0.002, P.bodyDecay);
  osc.connect(og); og.connect(dest);
  osc.start(t0); osc.stop(t0 + P.bodyDecay + 0.05);

  // 2) noise burst (blast)
  const n = noiseSource(noiseBuffer, 1);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = P.noiseHP * pitch;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(P.snapFreq * pitch, t0);
  bp.frequency.exponentialRampToValueAtTime(Math.max(180, P.snapFreq * pitch * 0.3), t0 + P.noiseDecay);
  bp.Q.value = 0.8;
  const ng = envGain(t0, vol * 0.9, 0.001, P.noiseDecay);
  n.connect(hp); hp.connect(bp); bp.connect(ng); ng.connect(dest);
  n.start(t0); n.stop(t0 + P.noiseDecay + 0.06);

  // 3) mechanical action click
  const click = noiseSource(noiseBuffer, 1.6);
  const cf = ctx.createBiquadFilter();
  cf.type = 'bandpass';
  cf.frequency.value = 3400;
  cf.Q.value = 3;
  const cg = envGain(t0 + 0.012, vol * 0.18, 0.001, 0.03);
  click.connect(cf); cf.connect(cg); cg.connect(dest);
  click.start(t0 + 0.012); click.stop(t0 + 0.06);

  // 4) reverb tail (foundry echo) — cheap: filtered noise swell
  if (tail > 0.05) {
    const t = noiseSource(pinkBuffer, 0.7);
    const tf = ctx.createBiquadFilter();
    tf.type = 'lowpass';
    tf.frequency.setValueAtTime(2200, t0);
    tf.frequency.exponentialRampToValueAtTime(340, t0 + tail);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.0001, t0 + 0.02);
    tg.gain.exponentialRampToValueAtTime(vol * 0.3, t0 + 0.05);
    tg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05 + tail);
    t.connect(tf); tf.connect(tg); tg.connect(dest);
    t.start(t0 + 0.02); t.stop(t0 + tail + 0.15);
  }
}

// ------------------------------------------------------------------ RELOAD / MECHANICAL
function mechClick({ pos, t, freq = 900, dur = 0.05, vol = 0.35, q = 4, rate = 1.2 }) {
  const dest = out(pos, { refDist: 3, maxDist: 30 });
  const n = noiseSource(noiseBuffer, rate);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = envGain(t, vol, 0.002, dur);
  n.connect(f); f.connect(g); g.connect(dest);
  n.start(t); n.stop(t + dur + 0.05);
  return dest;
}

export function playReload({ kind = 'mag', pos = null, duration = 2.0 }) {
  if (!isReady()) return;
  const t0 = ctx.currentTime;
  if (kind === 'bolt') {
    // sniper bolt cycle: back-click, extract rattle, forward-slam
    mechClick({ pos, t: t0, freq: 1500, dur: 0.07, vol: 0.4, rate: 0.9 });
    mechClick({ pos, t: t0 + 0.16, freq: 720, dur: 0.1, vol: 0.3, q: 2 });
    mechClick({ pos, t: t0 + 0.38, freq: 420, dur: 0.09, vol: 0.5, q: 1.6 });
    mechClick({ pos, t: t0 + 0.46, freq: 2400, dur: 0.04, vol: 0.25 });
    return;
  }
  if (kind === 'pump') {
    mechClick({ pos, t: t0, freq: 520, dur: 0.1, vol: 0.45, q: 1.8, rate: 0.8 });
    mechClick({ pos, t: t0 + 0.18, freq: 380, dur: 0.12, vol: 0.5, q: 1.4, rate: 0.7 });
    return;
  }
  if (kind === 'shell') {
    mechClick({ pos, t: t0, freq: 1100, dur: 0.06, vol: 0.3, q: 3 });
    mechClick({ pos, t: t0 + 0.12, freq: 640, dur: 0.07, vol: 0.28, q: 2 });
    return;
  }
  // standard magazine reload
  const d = Math.max(0.6, duration);
  mechClick({ pos, t: t0 + d * 0.06, freq: 1250, dur: 0.05, vol: 0.3, q: 3 }); // mag release
  mechClick({ pos, t: t0 + d * 0.3, freq: 460, dur: 0.12, vol: 0.26, q: 1.4, rate: 0.7 }); // mag drop
  mechClick({ pos, t: t0 + d * 0.68, freq: 700, dur: 0.09, vol: 0.42, q: 2 }); // mag seat
  mechClick({ pos, t: t0 + d * 0.88, freq: 2100, dur: 0.05, vol: 0.34, q: 4 }); // charging handle
}

export function playWeaponSwitch(pos) {
  if (!isReady()) return;
  const t0 = ctx.currentTime;
  mechClick({ pos, t: t0, freq: 1600, dur: 0.05, vol: 0.22, q: 4 });
  mechClick({ pos, t: t0 + 0.09, freq: 900, dur: 0.06, vol: 0.18, q: 3 });
}

export function playDryFire(pos) {
  if (!isReady()) return;
  mechClick({ pos, t: ctx.currentTime, freq: 2600, dur: 0.035, vol: 0.3, q: 6 });
}

// ------------------------------------------------------------------ FOOTSTEPS (PRD §12 per-surface)
const STEP_PROFILES = {
  metal: { freq: 1700, q: 2.2, decay: 0.12, vol: 0.32, ring: 2900, rate: 1.4 },
  concrete: { freq: 420, q: 1.1, decay: 0.07, vol: 0.24, ring: 0, rate: 0.9 },
  gravel: { freq: 3200, q: 0.7, decay: 0.1, vol: 0.26, ring: 0, rate: 1.8 },
  wood: { freq: 620, q: 1.6, decay: 0.09, vol: 0.24, ring: 0, rate: 1.0 },
  body: { freq: 300, q: 1, decay: 0.08, vol: 0.2, ring: 0, rate: 0.9 },
};

export function playFootstep({ surface = 'concrete', pos = null, intensity = 1 }) {
  if (!isReady()) return;
  const P = STEP_PROFILES[surface] || STEP_PROFILES.concrete;
  const t0 = ctx.currentTime;
  const dest = out(pos, { refDist: 2.5, maxDist: 34, rolloff: 1.5 });

  const n = noiseSource(noiseBuffer, P.rate * (0.9 + Math.random() * 0.2));
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = P.freq * (0.9 + Math.random() * 0.2);
  f.Q.value = P.q;
  const g = envGain(t0, P.vol * intensity, 0.003, P.decay);
  n.connect(f); f.connect(g); g.connect(dest);
  n.start(t0); n.stop(t0 + P.decay + 0.05);

  // metal catwalk gets a clangy resonant ring
  if (P.ring) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = P.ring * (0.95 + Math.random() * 0.1);
    const og = envGain(t0, P.vol * 0.35 * intensity, 0.002, P.decay * 2.2);
    o.connect(og); og.connect(dest);
    o.start(t0); o.stop(t0 + P.decay * 2.4 + 0.05);
  }
}

export function playJumpLand({ surface = 'concrete', pos = null }) {
  playFootstep({ surface, pos, intensity: 1.7 });
}

// ------------------------------------------------------------------ IMPACTS
export function playImpact({ surface = 'concrete', pos = null }) {
  if (!isReady()) return;
  const t0 = ctx.currentTime;
  const dest = out(pos, { refDist: 4, maxDist: 60, rolloff: 1.3 });
  const cfg = {
    metal: { f: 3600, q: 5, d: 0.12, v: 0.3, tone: 5200 },
    concrete: { f: 900, q: 1.2, d: 0.07, v: 0.22, tone: 0 },
    gravel: { f: 2600, q: 0.8, d: 0.08, v: 0.2, tone: 0 },
    wood: { f: 1200, q: 2, d: 0.08, v: 0.24, tone: 0 },
    body: { f: 260, q: 1.4, d: 0.09, v: 0.42, tone: 0 },
  }[surface] || { f: 900, q: 1.2, d: 0.07, v: 0.22, tone: 0 };

  const n = noiseSource(noiseBuffer, 1.4);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = cfg.f * (0.85 + Math.random() * 0.3);
  f.Q.value = cfg.q;
  const g = envGain(t0, cfg.v, 0.001, cfg.d);
  n.connect(f); f.connect(g); g.connect(dest);
  n.start(t0); n.stop(t0 + cfg.d + 0.04);

  if (cfg.tone) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(cfg.tone * (0.8 + Math.random() * 0.5), t0);
    o.frequency.exponentialRampToValueAtTime(1200, t0 + 0.09);
    const og = envGain(t0, 0.09, 0.001, 0.09);
    o.connect(og); og.connect(dest);
    o.start(t0); o.stop(t0 + 0.12);
  }
}

/** Bullet snapping past the player's head. */
export function playWhizz(pos) {
  if (!isReady()) return;
  const t0 = ctx.currentTime;
  const dest = out(pos, { refDist: 2, maxDist: 20, rolloff: 2 });
  const n = noiseSource(noiseBuffer, 2.4);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(4200, t0);
  f.frequency.exponentialRampToValueAtTime(1100, t0 + 0.12);
  f.Q.value = 6;
  const g = envGain(t0, 0.22, 0.008, 0.12);
  n.connect(f); f.connect(g); g.connect(dest);
  n.start(t0); n.stop(t0 + 0.18);
}

// ------------------------------------------------------------------ GRENADES
export function playPinPull(pos) {
  if (!isReady()) return;
  const t0 = ctx.currentTime;
  mechClick({ pos, t: t0, freq: 3200, dur: 0.05, vol: 0.3, q: 7 });
  mechClick({ pos, t: t0 + 0.1, freq: 1800, dur: 0.04, vol: 0.2, q: 5 });
}

export function playBounce(pos, surface = 'metal') {
  if (!isReady()) return;
  const t0 = ctx.currentTime;
  const dest = out(pos, { refDist: 3, maxDist: 40 });
  const o = ctx.createOscillator();
  o.type = 'triangle';
  const base = surface === 'metal' ? 780 : 260;
  o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.25), t0);
  o.frequency.exponentialRampToValueAtTime(base * 0.6, t0 + 0.1);
  const g = envGain(t0, 0.2, 0.002, 0.11);
  o.connect(g); g.connect(dest);
  o.start(t0); o.stop(t0 + 0.16);
  mechClick({ pos, t: t0, freq: surface === 'metal' ? 2600 : 900, dur: 0.04, vol: 0.16, q: 3 });
}

export function playExplosion(pos) {
  if (!isReady()) return;
  const t0 = ctx.currentTime;
  const dest = out(pos, { refDist: 12, maxDist: 160, rolloff: 0.8 });

  // sub boom
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(140, t0);
  o.frequency.exponentialRampToValueAtTime(28, t0 + 0.55);
  const og = envGain(t0, 1.5, 0.004, 0.6);
  o.connect(og); og.connect(dest);
  o.start(t0); o.stop(t0 + 0.75);

  // blast noise
  const n = noiseSource(noiseBuffer, 1);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(5200, t0);
  lp.frequency.exponentialRampToValueAtTime(240, t0 + 0.5);
  const ng = envGain(t0, 1.1, 0.002, 0.5);
  n.connect(lp); lp.connect(ng); ng.connect(dest);
  n.start(t0); n.stop(t0 + 0.7);

  // debris + echo tail (foundry reverb)
  const e = noiseSource(pinkBuffer, 0.6);
  const ef = ctx.createBiquadFilter();
  ef.type = 'bandpass';
  ef.frequency.setValueAtTime(1200, t0 + 0.1);
  ef.frequency.exponentialRampToValueAtTime(220, t0 + 1.4);
  ef.Q.value = 0.6;
  const eg = ctx.createGain();
  eg.gain.setValueAtTime(0.0001, t0 + 0.08);
  eg.gain.exponentialRampToValueAtTime(0.34, t0 + 0.18);
  eg.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.5);
  e.connect(ef); ef.connect(eg); eg.connect(dest);
  e.start(t0 + 0.08); e.stop(t0 + 1.6);
}

export function playSmokePop(pos) {
  if (!isReady()) return;
  const t0 = ctx.currentTime;
  const dest = out(pos, { refDist: 6, maxDist: 60 });
  const n = noiseSource(noiseBuffer, 0.8);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(1800, t0);
  f.frequency.exponentialRampToValueAtTime(500, t0 + 0.4);
  f.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.45, t0 + 0.03);
  g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.2);
  n.connect(f); f.connect(g); g.connect(dest);
  n.start(t0); n.stop(t0 + 3.4);
}

/**
 * Flashbang: bright crack + tinnitus ring + temporary muffling of everything
 * else (PRD §12 "dering + suara teredam sementara").
 */
export function playFlashbang(pos, affectsListener = false, duration = 3.6) {
  if (!isReady()) return;
  const t0 = ctx.currentTime;
  const dest = out(pos, { refDist: 14, maxDist: 140, rolloff: 0.7 });

  const n = noiseSource(noiseBuffer, 1.5);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 900;
  const g = envGain(t0, 1.2, 0.001, 0.28);
  n.connect(hp); hp.connect(g); g.connect(dest);
  n.start(t0); n.stop(t0 + 0.4);

  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(320, t0);
  o.frequency.exponentialRampToValueAtTime(90, t0 + 0.25);
  const og = envGain(t0, 0.7, 0.002, 0.3);
  o.connect(og); og.connect(dest);
  o.start(t0); o.stop(t0 + 0.4);

  if (affectsListener) applyDeafen(duration);
}

/** Tinnitus + muffle applied to the local listener. */
export function applyDeafen(duration = 3.5) {
  if (!isReady()) return;
  const t0 = ctx.currentTime;
  muffleFilter.frequency.cancelScheduledValues(t0);
  muffleFilter.frequency.setValueAtTime(420, t0);
  muffleFilter.frequency.exponentialRampToValueAtTime(20000, t0 + duration);
  duckGain.gain.cancelScheduledValues(t0);
  duckGain.gain.setValueAtTime(0.32, t0);
  duckGain.gain.linearRampToValueAtTime(1, t0 + duration);

  if (ringOsc) { try { ringOsc.stop(); } catch { /* noop */ } }
  ringOsc = ctx.createOscillator();
  ringOsc.type = 'sine';
  ringOsc.frequency.value = 4400;
  ringGain = ctx.createGain();
  ringGain.gain.setValueAtTime(0.0001, t0);
  ringGain.gain.exponentialRampToValueAtTime(0.09, t0 + 0.05);
  ringGain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  const rg2 = ctx.createOscillator();
  rg2.type = 'sine';
  rg2.frequency.value = 6300;
  const rg2g = ctx.createGain();
  rg2g.gain.setValueAtTime(0.0001, t0);
  rg2g.gain.exponentialRampToValueAtTime(0.04, t0 + 0.05);
  rg2g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration * 0.8);
  ringOsc.connect(ringGain); ringGain.connect(master);
  rg2.connect(rg2g); rg2g.connect(master);
  ringOsc.start(t0); ringOsc.stop(t0 + duration + 0.1);
  rg2.start(t0); rg2.stop(t0 + duration + 0.1);
}

// ------------------------------------------------------------------ PLAYER FEEDBACK
export function playHitmarker(headshot = false, killed = false) {
  if (!isReady()) return;
  const t0 = ctx.currentTime;
  const g = ctx.createGain();
  g.connect(sfxBus);
  const o = ctx.createOscillator();
  o.type = 'square';
  const f = killed ? 1500 : headshot ? 1250 : 980;
  o.frequency.setValueAtTime(f, t0);
  o.frequency.exponentialRampToValueAtTime(f * 0.62, t0 + 0.07);
  const eg = envGain(t0, killed ? 0.24 : 0.16, 0.001, killed ? 0.12 : 0.06);
  o.connect(eg); eg.connect(g);
  o.start(t0); o.stop(t0 + 0.18);
  if (killed) {
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.setValueAtTime(f * 1.5, t0 + 0.05);
    const eg2 = envGain(t0 + 0.05, 0.18, 0.002, 0.14);
    o2.connect(eg2); eg2.connect(g);
    o2.start(t0 + 0.05); o2.stop(t0 + 0.24);
  }
}

export function playHurt() {
  if (!isReady()) return;
  const t0 = ctx.currentTime;
  const g = ctx.createGain();
  g.connect(sfxBus);
  const n = noiseSource(noiseBuffer, 0.6);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(700, t0);
  f.frequency.exponentialRampToValueAtTime(180, t0 + 0.22);
  const eg = envGain(t0, 0.32, 0.003, 0.22);
  n.connect(f); f.connect(eg); eg.connect(g);
  n.start(t0); n.stop(t0 + 0.3);
}

export function playHeal() {
  if (!isReady()) return;
  const t0 = ctx.currentTime;
  const g = ctx.createGain(); g.connect(sfxBus);
  [520, 660, 880].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const eg = envGain(t0 + i * 0.11, 0.13, 0.02, 0.2);
    o.connect(eg); eg.connect(g);
    o.start(t0 + i * 0.11); o.stop(t0 + i * 0.11 + 0.3);
  });
}

// ------------------------------------------------------------------ UI (PRD §12)
export function playUI(name) {
  if (!isReady()) return;
  const t0 = ctx.currentTime;
  const g = ctx.createGain();
  g.connect(musicBus);

  const tone = (freq, at, dur, vol = 0.15, type = 'square') => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const eg = envGain(t0 + at, vol, 0.008, dur);
    o.connect(eg); eg.connect(g);
    o.start(t0 + at); o.stop(t0 + at + dur + 0.05);
  };

  switch (name) {
    case 'ui_click':
      tone(1400, 0, 0.03, 0.09, 'square');
      break;
    case 'ui_hover':
      tone(2000, 0, 0.02, 0.04, 'sine');
      break;
    case 'ui_buy':
      tone(880, 0, 0.05, 0.12);
      tone(1320, 0.06, 0.07, 0.12);
      break;
    case 'ui_error':
      tone(200, 0, 0.09, 0.14, 'sawtooth');
      tone(150, 0.09, 0.12, 0.12, 'sawtooth');
      break;
    case 'ui_round_start': {
      // industrial start horn (PRD §12 "sirine/horn mulai ronde")
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(180, t0);
      o.frequency.linearRampToValueAtTime(240, t0 + 0.5);
      o.frequency.linearRampToValueAtTime(150, t0 + 1.4);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1400;
      const eg = ctx.createGain();
      eg.gain.setValueAtTime(0.0001, t0);
      eg.gain.exponentialRampToValueAtTime(0.26, t0 + 0.12);
      eg.gain.setValueAtTime(0.26, t0 + 1.0);
      eg.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.7);
      o.connect(lp); lp.connect(eg); eg.connect(g);
      o.start(t0); o.stop(t0 + 1.8);
      break;
    }
    case 'ui_round_win':
      [523.25, 659.25, 783.99].forEach((f, i) => tone(f, i * 0.1, 0.28, 0.15, 'triangle'));
      break;
    case 'ui_round_lose':
      [392, 329.6, 261.6].forEach((f, i) => tone(f, i * 0.13, 0.34, 0.14, 'triangle'));
      break;
    case 'ui_match_win':
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.12, 0.5, 0.17, 'triangle'));
      [261.6, 329.6, 392, 523.25].forEach((f, i) => tone(f, i * 0.12, 0.5, 0.1, 'sawtooth'));
      break;
    case 'ui_match_lose':
      [392, 349.2, 293.7, 220].forEach((f, i) => tone(f, i * 0.18, 0.6, 0.13, 'triangle'));
      break;
    case 'ui_countdown':
      tone(1000, 0, 0.06, 0.1);
      break;
    case 'ui_matchpoint':
      tone(1200, 0, 0.1, 0.12);
      tone(1600, 0.12, 0.16, 0.12);
      break;
    default:
      tone(900, 0, 0.04, 0.08);
  }
}

// ------------------------------------------------------------------ AMBIENT (PRD §12)
export function startAmbient() {
  if (!isReady() || ambientNodes) return;
  const t0 = ctx.currentTime;
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(0.0001, t0);
  bus.gain.exponentialRampToValueAtTime(0.5, t0 + 3);
  bus.connect(sfxBus);

  // deep industrial hum
  const hum = ctx.createOscillator();
  hum.type = 'sawtooth';
  hum.frequency.value = 47;
  const humLp = ctx.createBiquadFilter();
  humLp.type = 'lowpass';
  humLp.frequency.value = 160;
  const humG = ctx.createGain();
  humG.gain.value = 0.13;
  hum.connect(humLp); humLp.connect(humG); humG.connect(bus);
  hum.start(t0);

  const hum2 = ctx.createOscillator();
  hum2.type = 'sine';
  hum2.frequency.value = 93;
  const hum2G = ctx.createGain();
  hum2G.gain.value = 0.045;
  hum2.connect(hum2G); hum2G.connect(bus);
  hum2.start(t0);

  // slow LFO breathing on the hum
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.07;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 0.05;
  lfo.connect(lfoG); lfoG.connect(humG.gain);
  lfo.start(t0);

  // wind through broken skylights
  const wind = noiseSource(pinkBuffer, 0.35);
  const windF = ctx.createBiquadFilter();
  windF.type = 'bandpass';
  windF.frequency.value = 480;
  windF.Q.value = 0.55;
  const windG = ctx.createGain();
  windG.gain.value = 0.1;
  wind.connect(windF); windF.connect(windG); windG.connect(bus);
  wind.start(t0);

  const windLfo = ctx.createOscillator();
  windLfo.type = 'sine';
  windLfo.frequency.value = 0.045;
  const windLfoG = ctx.createGain();
  windLfoG.gain.value = 0.06;
  windLfo.connect(windLfoG); windLfoG.connect(windG.gain);
  windLfo.start(t0);

  // sparse metal groans
  const groanTimer = setInterval(() => {
    if (!isReady()) return;
    if (Math.random() > 0.42) return;
    const gt = ctx.currentTime;
    const pos = [(Math.random() - 0.5) * 40, 4 + Math.random() * 4, (Math.random() - 0.5) * 50];
    const dest = out(pos, { refDist: 10, maxDist: 90 });
    const o = ctx.createOscillator();
    o.type = 'sine';
    const base = 90 + Math.random() * 130;
    o.frequency.setValueAtTime(base, gt);
    o.frequency.linearRampToValueAtTime(base * (0.7 + Math.random() * 0.5), gt + 1.8);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, gt);
    og.gain.exponentialRampToValueAtTime(0.06, gt + 0.6);
    og.gain.exponentialRampToValueAtTime(0.0001, gt + 2.4);
    o.connect(og); og.connect(dest);
    o.start(gt); o.stop(gt + 2.6);
  }, 5200);

  ambientNodes = { bus, nodes: [hum, hum2, lfo, wind, windLfo], groanTimer };
}

export function stopAmbient() {
  if (!ambientNodes) return;
  const t0 = ctx.currentTime;
  ambientNodes.bus.gain.cancelScheduledValues(t0);
  ambientNodes.bus.gain.setValueAtTime(ambientNodes.bus.gain.value, t0);
  ambientNodes.bus.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.8);
  clearInterval(ambientNodes.groanTimer);
  const nodes = ambientNodes.nodes;
  setTimeout(() => {
    nodes.forEach((n) => { try { n.stop(); } catch { /* noop */ } });
  }, 900);
  ambientNodes = null;
}

/** Lobby music bed: slow menacing pad. */
let lobbyNodes = null;
export function startLobbyBed() {
  if (!isReady() || lobbyNodes) return;
  const t0 = ctx.currentTime;
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(0.0001, t0);
  bus.gain.exponentialRampToValueAtTime(0.32, t0 + 2.5);
  bus.connect(musicBus);
  const nodes = [];
  [55, 82.4, 110, 164.8].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = i % 2 ? 'sine' : 'sawtooth';
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320 + i * 90;
    const g = ctx.createGain();
    g.gain.value = 0.07 / (i * 0.5 + 1);
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.05 + i * 0.017;
    const lg = ctx.createGain();
    lg.gain.value = 0.035;
    lfo.connect(lg); lg.connect(g.gain);
    o.connect(lp); lp.connect(g); g.connect(bus);
    o.start(t0); lfo.start(t0);
    nodes.push(o, lfo);
  });
  lobbyNodes = { bus, nodes };
}

export function stopLobbyBed() {
  if (!lobbyNodes) return;
  const t0 = ctx.currentTime;
  lobbyNodes.bus.gain.cancelScheduledValues(t0);
  lobbyNodes.bus.gain.setValueAtTime(lobbyNodes.bus.gain.value, t0);
  lobbyNodes.bus.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
  const nodes = lobbyNodes.nodes;
  setTimeout(() => nodes.forEach((n) => { try { n.stop(); } catch { /* noop */ } }), 800);
  lobbyNodes = null;
}

export function getContext() { return ctx; }
