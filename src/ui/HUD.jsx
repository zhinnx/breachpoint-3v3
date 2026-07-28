/**
 * BREACHPOINT — In-match HUD.
 * Tactical Industrial HUD system (breachpoint-ui-ux-prd.md §3.3).
 *
 *   - Corner-bracket framing on every important readout (the signature).
 *   - Segmented meters, angular pips, chevron damage arcs — no smooth
 *     gradients, no soft glows, no rounded chrome.
 *   - The squad roster collapses to life pips on phones. Full callsigns under
 *     the score do not fit a 375px screen, which the user flagged directly.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useGame } from '../game/store.js';
import { PHASE, MATCH } from '../game/config.js';
import { getWeapon, UTILITY } from '../game/weapons.js';
import { world, currentWeaponRuntime } from '../game/world.js';
import { computeSpread } from '../game/combat.js';
import { PLAY, brushes } from '../game/steelfall.js';
import { useDevice } from './useDevice.js';

// Fill ramp for plates/pips; text ramp for type on dark (contrast-verified).
const TEAM_VAR = { BLUE: 'var(--steel-text)', RED: 'var(--oxide-text)' };
const TEAM_FILL = { BLUE: 'var(--steel)', RED: 'var(--oxide)' };
const TEAM_INK = { BLUE: 'var(--ink-on-steel)', RED: 'var(--ink-on-oxide)' };

const fmtTime = (t) => {
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** rAF loop for values that must not trigger React re-renders. */
function useRaf(cb) {
  useEffect(() => {
    let id;
    const loop = () => { cb(); id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [cb]);
}

/* ------------------------------------------------------------- crosshair */
function Crosshair() {
  const ref = useRef();
  const color = useGame((s) => s.settings.crosshairColor);
  const playerId = useGame((s) => s.playerId);
  const phase = useGame((s) => s.phase);
  const alive = useGame((s) => s.entities[s.playerId]?.alive);

  useRaf(() => {
    const el = ref.current;
    if (!el) return;
    const actor = world.actors[playerId];
    if (!actor) return;
    const weapon = getWeapon(actor.currentWeapon);
    const spread = computeSpread(actor, weapon);
    el.style.setProperty('--gap', `${Math.min(46, 4 + spread * 5.4)}px`);
    const scoped = weapon.scope?.overlay && actor.ads > 0.86;
    el.style.opacity = scoped || !alive ? '0' : '1';
  });

  if (phase !== PHASE.COMBAT && phase !== PHASE.SUDDEN_DEATH) return null;
  return (
    <div className="crosshair" ref={ref} style={{ '--xh-c': color }}>
      <span className="xh xh-t" />
      <span className="xh xh-b" />
      <span className="xh xh-l" />
      <span className="xh xh-r" />
      <span className="xh xh-d" />
    </div>
  );
}

function HitMarkers() {
  const hitmarkers = useGame((s) => s.hitmarkers);
  const [, force] = useState(0);
  useEffect(() => {
    const i = setInterval(() => force((n) => n + 1), 60);
    return () => clearInterval(i);
  }, []);
  const now = Date.now();
  const live = hitmarkers.filter((h) => now - h.time < 320);
  if (!live.length) return null;
  const last = live[live.length - 1];
  const age = (now - last.time) / 320;
  return (
    <div
      className={`hitmark ${last.killed ? 'kill' : last.kind === 'head' ? 'head' : ''}`}
      style={{ opacity: 1 - age, transform: `translate(-50%,-50%) scale(${1 + age * 0.45})` }}
    >
      <i /><i /><i /><i />
    </div>
  );
}

/** Damage direction: thin chevrons, not a rotating red glow (PRD §3.3). */
function DamageChevrons() {
  const ref = useRef();
  const playerId = useGame((s) => s.playerId);
  useRaf(() => {
    const el = ref.current;
    if (!el) return;
    const actor = world.actors[playerId];
    if (!actor) return;
    const kids = el.children;
    for (let i = 0; i < kids.length; i++) {
      const d = world.damageIndicators[i];
      const k = kids[i];
      if (!d) { k.style.opacity = '0'; continue; }
      const life = 1 - d.t / d.life;
      const ang = Math.atan2(d.dir[0], d.dir[2]) - (actor.yaw + Math.PI);
      k.style.opacity = String(life * 0.92);
      k.style.transform = `rotate(${ang}rad)`;
    }
  });
  return (
    <div className="dmg-ring" ref={ref}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="dmg-chev" style={{ opacity: 0 }}><i /></div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- minimap */
function Minimap() {
  const canvasRef = useRef();
  const bgRef = useRef(null);
  const playerId = useGame((s) => s.playerId);
  const order = useGame((s) => s.order);
  const entities = useGame((s) => s.entities);
  const playerTeam = useGame((s) => s.playerTeam);
  const dev = useDevice();
  const SIZE = dev.narrow ? 96 : 158;

  useEffect(() => {
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const ctx = c.getContext('2d');
    const W = PLAY.maxX - PLAY.minX;
    const H = PLAY.maxZ - PLAY.minZ;
    const sx = SIZE / W;
    const sy = SIZE / H;
    ctx.fillStyle = '#121212';
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (const b of brushes) {
      if (!b.collide || b.max[1] < 0.35 || b.min[1] > 4.2) continue;
      const x = (b.min[0] - PLAY.minX) * sx;
      const y = (b.min[2] - PLAY.minZ) * sy;
      const w = (b.max[0] - b.min[0]) * sx;
      const h = (b.max[2] - b.min[2]) * sy;
      ctx.fillStyle = b.max[1] > 3.6 ? 'rgba(138,141,145,0.5)' : 'rgba(138,141,145,0.28)';
      ctx.fillRect(x, y, Math.max(1, w), Math.max(1, h));
    }
    // spawn bands
    ctx.fillStyle = 'rgba(62,124,184,0.2)';
    ctx.fillRect(0, 0, SIZE, (6 / H) * SIZE);
    ctx.fillStyle = 'rgba(184,69,62,0.2)';
    ctx.fillRect(0, SIZE - (6 / H) * SIZE, SIZE, (6 / H) * SIZE);
    bgRef.current = c;
  }, [SIZE]);

  useRaf(() => {
    const canvas = canvasRef.current;
    const bg = bgRef.current;
    if (!canvas || !bg) return;
    const ctx = canvas.getContext('2d');
    const W = PLAY.maxX - PLAY.minX;
    const H = PLAY.maxZ - PLAY.minZ;
    const sx = SIZE / W;
    const sy = SIZE / H;
    const px = (p) => (p[0] - PLAY.minX) * sx;
    const py = (p) => (p[2] - PLAY.minZ) * sy;

    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(bg, 0, 0);

    for (const s of world.smokes) {
      ctx.beginPath();
      ctx.fillStyle = `rgba(180,180,180,${0.2 * s.opacity})`;
      ctx.arc(px(s.pos), py(s.pos), s.radius * sx * Math.min(1, s.grow), 0, Math.PI * 2);
      ctx.fill();
    }

    const self = world.actors[playerId];
    const now = world.time;

    // enemy pings: recent gunfire, or spotted by a living teammate
    for (const id of order) {
      const e = entities[id];
      const a = world.actors[id];
      if (!e || !a || e.team === playerTeam || !a.alive) continue;
      const fired = now - (a.lastFireTime || -99) < 2.6;
      let seen = false;
      for (const oid of order) {
        const o = world.actors[oid];
        const oe = entities[oid];
        if (!o || !oe || oe.team !== playerTeam || !o.alive) continue;
        if (Math.hypot(o.pos[0] - a.pos[0], o.pos[2] - a.pos[2]) < 26) { seen = true; break; }
      }
      if (!fired && !seen) continue;
      const x = px(a.pos);
      const y = py(a.pos);
      ctx.fillStyle = fired ? '#b8453e' : 'rgba(184,69,62,0.55)';
      ctx.fillRect(x - 3, y - 3, 6, 6);
      if (fired) {
        ctx.strokeStyle = 'rgba(184,69,62,0.5)';
        ctx.lineWidth = 1.2;
        const r = 5 + Math.sin(now * 6) * 2.5;
        ctx.strokeRect(x - r, y - r, r * 2, r * 2);
      }
    }

    // teammates
    for (const id of order) {
      const e = entities[id];
      const a = world.actors[id];
      if (!e || !a || e.team !== playerTeam || !a.alive || id === playerId) continue;
      const x = px(a.pos);
      const y = py(a.pos);
      ctx.fillStyle = '#3e7cb8';
      ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
      ctx.strokeStyle = 'rgba(62,124,184,0.75)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - Math.sin(a.yaw) * 8, y - Math.cos(a.yaw) * 8);
      ctx.stroke();
    }

    // self + view cone
    if (self && self.alive) {
      const x = px(self.pos);
      const y = py(self.pos);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-self.yaw + Math.PI);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, SIZE * 0.2, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6);
      ctx.closePath();
      ctx.fillStyle = 'rgba(232,228,216,0.1)';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 6);
      ctx.lineTo(0, 3);
      ctx.lineTo(-5, 6);
      ctx.closePath();
      ctx.fillStyle = '#e8e4d8';
      ctx.fill();
      ctx.restore();
    }
  });

  return (
    <div className="minimap brk">
      <canvas ref={canvasRef} width={SIZE} height={SIZE} />
      <div className="mm-tag">STEELFALL</div>
    </div>
  );
}

/* -------------------------------------------------------------- top bar */
function TopBar() {
  const phase = useGame((s) => s.phase);
  const phaseTime = useGame((s) => s.phaseTime);
  const score = useGame((s) => s.score);
  const round = useGame((s) => s.round);
  const playerTeam = useGame((s) => s.playerTeam);
  const practice = useGame((s) => s.practice);

  const enemy = playerTeam === 'BLUE' ? 'RED' : 'BLUE';
  const matchPoint =
    score[playerTeam] >= MATCH.matchPointAt || score[enemy] >= MATCH.matchPointAt;

  const tag = {
    [PHASE.WARMUP]: 'STANDBY',
    [PHASE.BUY]: 'BUY PHASE',
    [PHASE.COMBAT]: `ROUND ${round}`,
    [PHASE.SUDDEN_DEATH]: 'SUDDEN DEATH',
    [PHASE.ROUND_END]: 'ROUND OVER',
  }[phase] || `ROUND ${round}`;

  const crit = phase === PHASE.SUDDEN_DEATH || (phase === PHASE.COMBAT && phaseTime < 10);
  const warn = phase === PHASE.COMBAT && phaseTime < 30 && !crit;

  const Side = ({ team }) => (
    <div className="score-block" style={{ '--c': TEAM_FILL[team] }}>
      <span className="score-num num">{score[team]}</span>
      <span className="pips">
        {Array.from({ length: MATCH.roundsToWin }).map((_, i) => (
          <i key={i} className={i < score[team] ? 'pip on' : 'pip'} />
        ))}
      </span>
    </div>
  );

  return (
    <div className="hud-top">
      <Side team={playerTeam} />
      <div className="timer-block brk">
        <span className={`timer num ${crit ? 'crit' : warn ? 'warn' : ''}`}>
          {practice ? '--:--' : fmtTime(phaseTime)}
        </span>
        <span className="phase-tag">{tag}</span>
        {matchPoint && !practice && <span className="match-point">MATCH POINT</span>}
      </div>
      <Side team={enemy} />
    </div>
  );
}

/**
 * Squad strip. Life pips only on phones; callsigns appear when there is room.
 * This is the element the user called out as unusable on mobile.
 */
function Squad() {
  const order = useGame((s) => s.order);
  const entities = useGame((s) => s.entities);
  const playerTeam = useGame((s) => s.playerTeam);
  const playerId = useGame((s) => s.playerId);
  const dev = useDevice();

  const mates = order.map((id) => entities[id]).filter((e) => e && e.team === playerTeam);
  const foes = order.map((id) => entities[id]).filter((e) => e && e.team !== playerTeam);
  const compact = dev.narrow || dev.touch;

  const Unit = ({ e, team }) => (
    <span
      className={`sq-unit ${e.alive ? '' : 'down'} ${e.id === playerId ? 'self' : ''}`}
      style={{ '--c': TEAM_FILL[team] }}
      title={e.name}
    >
      {!compact && <b className="sq-name">{e.name}</b>}
    </span>
  );

  return (
    <div className="squad">
      <span className="squad-side">
        {mates.map((e) => <Unit key={e.id} e={e} team={playerTeam} />)}
      </span>
      <span className="squad-vs">VS</span>
      <span className="squad-side">
        {foes.map((e) => <Unit key={e.id} e={e} team={playerTeam === 'BLUE' ? 'RED' : 'BLUE'} />)}
      </span>
    </div>
  );
}

/* --------------------------------------------------------------- vitals */
function Vitals() {
  const entity = useGame((s) => s.entities[s.playerId]);
  if (!entity) return null;
  const hp = Math.max(0, Math.round(entity.hp));
  const low = hp <= 40;
  const crit = hp <= 20;
  const armor = entity.loadout.armor;
  const plates = armor === 'heavy' ? 3 : armor === 'light' ? 2 : 0;

  return (
    <div className="vitals">
      {plates > 0 && (
        <div className="armor-row">
          {Array.from({ length: 3 }).map((_, i) => (
            <span key={i} className={i < plates ? 'plate' : 'plate off'} />
          ))}
          <span className="armor-lbl">{armor === 'heavy' ? 'HEAVY' : 'LIGHT'}</span>
        </div>
      )}
      <div className="hp-row">
        <span className={`hp-num num ${crit ? 'crit' : low ? 'low' : ''}`}>{hp}</span>
        <div className="hp-meter brk">
          <i className={crit ? 'crit' : low ? 'low' : ''} style={{ width: `${hp}%` }} />
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- ammo */
function Ammo() {
  const entity = useGame((s) => s.entities[s.playerId]);
  const playerId = useGame((s) => s.playerId);
  const magRef = useRef();
  const resRef = useRef();
  const barRef = useRef();

  useRaf(() => {
    const actor = world.actors[playerId];
    if (!actor) return;
    const wr = currentWeaponRuntime(actor);
    const w = getWeapon(actor.currentWeapon);
    if (magRef.current) {
      magRef.current.textContent = String(wr.mag);
      magRef.current.classList.toggle('dry', wr.mag === 0);
    }
    if (resRef.current) resRef.current.textContent = String(wr.reserve);
    if (barRef.current) barRef.current.style.width = `${(wr.mag / w.magazine) * 100}%`;
  });

  if (!entity) return null;
  const w = getWeapon(entity.loadout.current);

  return (
    <div className="ammo">
      <div className="util-row">
        {['frag', 'flash', 'smoke', 'medkit'].map((u, i) => {
          const n = entity.loadout.utility[u] || 0;
          const color = { frag: '#4b5320', flash: '#c9ccd1', smoke: '#8e44ff', medkit: '#d33' }[u];
          return (
            <div key={u} className={`util-chip ${n > 0 ? 'has' : ''}`} title={UTILITY[u].name}>
              <span className="util-key">{u === 'medkit' ? 'F' : i + 3}</span>
              <span className="util-mark" style={{ background: color }} />
              <span className="util-n num">{n}</span>
            </div>
          );
        })}
      </div>
      <div className="ammo-name">{w.name}</div>
      <div className="ammo-line">
        <span className="mag num" ref={magRef}>0</span>
        <span className="slash">/</span>
        <span className="reserve num" ref={resRef}>0</span>
      </div>
      <div className="mag-meter"><i ref={barRef} /></div>
      <div className="slots">
        <span className={entity.loadout.current === entity.loadout.primary ? 'slot on' : 'slot'}>
          1 {entity.loadout.primary ? getWeapon(entity.loadout.primary).name : 'EMPTY'}
        </span>
        <span className={entity.loadout.current === entity.loadout.sidearm ? 'slot on' : 'slot'}>
          2 {getWeapon(entity.loadout.sidearm).name}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- killfeed */
function KillFeed() {
  const killfeed = useGame((s) => s.killfeed);
  return (
    <div className="killfeed">
      {killfeed.map((k) => (
        <div key={k.key} className={`kf-row ${k.killerIsPlayer || k.victimIsPlayer ? 'mine' : ''}`}>
          <span style={{ color: k.killerTeam ? TEAM_VAR[k.killerTeam] : 'var(--conc)' }}>
            {k.killer || 'WORLD'}
          </span>
          <span className="kf-w">
            {k.headshot && <b className="kf-hs">HS </b>}{k.weapon}
          </span>
          <span style={{ color: TEAM_VAR[k.victimTeam] }}>{k.victim}</span>
        </div>
      ))}
    </div>
  );
}

function CreditBadge() {
  const entity = useGame((s) => s.entities[s.playerId]);
  const phase = useGame((s) => s.phase);
  const practice = useGame((s) => s.practice);
  const dev = useDevice();
  if (!entity) return null;
  if (!(phase === PHASE.BUY || phase === PHASE.WARMUP || practice)) return null;
  return (
    <div className="credit-badge">
      <div className="cb-val num">{practice ? 'MAX' : entity.credits.toLocaleString('en-US')}</div>
      {!dev.touch && <div className="cb-hint">[B] ARMORY</div>}
    </div>
  );
}

/* ----------------------------------------------------------- scope + fx */
function ScopeOverlay() {
  const playerId = useGame((s) => s.playerId);
  const ref = useRef();
  const [kind, setKind] = useState(null);

  useRaf(() => {
    const actor = world.actors[playerId];
    if (!actor) { if (kind) setKind(null); return; }
    const w = getWeapon(actor.currentWeapon);
    const scoped = w.scope?.overlay && actor.ads > 0.86;
    const k = scoped ? w.scope.type : null;
    if (k !== kind) setKind(k);
    if (ref.current) {
      ref.current.style.opacity = scoped ? String(Math.min(1, (actor.ads - 0.86) / 0.1)) : '0';
      const sx = Math.sin(world.time * 1.3) * (1 - actor.crouch * 0.6) * 3;
      const sy = Math.cos(world.time * 0.9) * (1 - actor.crouch * 0.6) * 2.4;
      ref.current.style.transform = `translate(${sx}px, ${sy}px)`;
    }
  });

  if (!kind) return null;
  return (
    <div className="scope-ov" ref={ref}>
      <div className="scope-vig" />
      <div className="scope-lens">
        {kind === 'duplex' ? (
          <svg viewBox="0 0 400 400" className="reticle">
            <line x1="200" y1="0" x2="200" y2="140" stroke="#0c0c0c" strokeWidth="9" />
            <line x1="200" y1="260" x2="200" y2="400" stroke="#0c0c0c" strokeWidth="9" />
            <line x1="0" y1="200" x2="140" y2="200" stroke="#0c0c0c" strokeWidth="9" />
            <line x1="260" y1="200" x2="400" y2="200" stroke="#0c0c0c" strokeWidth="9" />
            <line x1="200" y1="140" x2="200" y2="192" stroke="#0c0c0c" strokeWidth="1.6" />
            <line x1="200" y1="208" x2="200" y2="260" stroke="#0c0c0c" strokeWidth="1.6" />
            <line x1="140" y1="200" x2="192" y2="200" stroke="#0c0c0c" strokeWidth="1.6" />
            <line x1="208" y1="200" x2="260" y2="200" stroke="#0c0c0c" strokeWidth="1.6" />
          </svg>
        ) : (
          <svg viewBox="0 0 400 400" className="reticle">
            <line x1="200" y1="18" x2="200" y2="382" stroke="#0c0c0c" strokeWidth="1.4" />
            <line x1="18" y1="200" x2="382" y2="200" stroke="#0c0c0c" strokeWidth="1.4" />
            {[-4, -3, -2, -1, 1, 2, 3, 4].map((i) => (
              <g key={i}>
                <circle cx={200 + i * 34} cy="200" r="2.6" fill="#0c0c0c" />
                <circle cx="200" cy={200 + i * 34} r="2.6" fill="#0c0c0c" />
              </g>
            ))}
            <line x1="200" y1="0" x2="200" y2="18" stroke="#0c0c0c" strokeWidth="7" />
            <line x1="200" y1="382" x2="200" y2="400" stroke="#0c0c0c" strokeWidth="7" />
            <line x1="0" y1="200" x2="18" y2="200" stroke="#0c0c0c" strokeWidth="7" />
            <line x1="382" y1="200" x2="400" y2="200" stroke="#0c0c0c" strokeWidth="7" />
          </svg>
        )}
      </div>
    </div>
  );
}

function ScreenFx() {
  const flashRef = useRef();
  const hurtRef = useRef();
  const healRef = useRef();
  const playerId = useGame((s) => s.playerId);
  const entity = useGame((s) => s.entities[s.playerId]);

  useRaf(() => {
    const actor = world.actors[playerId];
    if (flashRef.current) {
      const b = world.localBlind;
      const max = world.localBlindMax || 1;
      flashRef.current.style.opacity = String(Math.min(0.97, b / Math.max(0.3, max * 0.55)));
    }
    if (hurtRef.current && entity) {
      const hp = entity.alive ? entity.hp : 100;
      const t = hp < 45 ? (45 - hp) / 45 : 0;
      hurtRef.current.style.opacity = String(t * 0.7);
    }
    if (healRef.current && actor) {
      healRef.current.style.opacity = actor.healing > 0 ? '1' : '0';
      if (actor.healing > 0) {
        const bar = healRef.current.querySelector('i');
        if (bar) bar.style.width = `${(1 - actor.healing / 3) * 100}%`;
      }
    }
  });

  return (
    <>
      <div className="flash-ov" ref={flashRef} />
      <div className="hurt-ov" ref={hurtRef} />
      <div className="heal-ch" ref={healRef} style={{ opacity: 0 }}>
        <span>APPLYING MEDKIT</span>
        <div className="heal-bar"><i /></div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------- round banner */
function RoundBanner() {
  const phase = useGame((s) => s.phase);
  const roundWinner = useGame((s) => s.roundWinner);
  const reason = useGame((s) => s.roundEndReason);
  const playerTeam = useGame((s) => s.playerTeam);
  const score = useGame((s) => s.score);
  const recap = useGame((s) => s.lastRoundRecap);
  const matchWinner = useGame((s) => s.matchWinner);

  if (phase !== PHASE.ROUND_END) return null;
  const won = roundWinner === playerTeam;
  const draw = !roundWinner;

  return (
    <div className="round-banner">
      <div className={`rb ${draw ? '' : won ? 'win' : 'lose'}`}>
        <div className="rb-title">{draw ? 'ROUND DRAW' : won ? 'ROUND WON' : 'ROUND LOST'}</div>
        <div className="rb-why">{reason}</div>
        <div className="rb-score num">
          <span style={{ color: 'var(--steel)' }}>{score.BLUE}</span>
          <span style={{ color: 'var(--gun-hi)' }}>:</span>
          <span style={{ color: 'var(--oxide)' }}>{score.RED}</span>
        </div>
        <div className="rb-cr">+{won ? '3,000' : '2,000'} CREDITS</div>
        {matchWinner && <div className="match-point" style={{ marginTop: 12 }}>MATCH DECIDED</div>}
        {recap.length > 0 && (
          <div className="rb-recap">
            {recap.slice(0, 4).map((k) => (
              <div key={k.key} className="rb-line">
                <span style={{ color: k.killerTeam ? TEAM_VAR[k.killerTeam] : 'var(--conc)' }}>
                  {k.killer || 'WORLD'}
                </span>
                <span style={{ color: 'var(--gun-hi)' }}>{k.headshot ? 'HS' : '>'}</span>
                <span style={{ color: TEAM_VAR[k.victimTeam] }}>{k.victim}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DeathCard() {
  const entity = useGame((s) => s.entities[s.playerId]);
  const entities = useGame((s) => s.entities);
  const phase = useGame((s) => s.phase);
  if (!entity || entity.alive) return null;
  if (phase === PHASE.ROUND_END || phase === PHASE.MATCH_END) return null;
  const killer = entity.killedBy ? entities[entity.killedBy] : null;
  return (
    <div className="death">
      <div className="death-t">ELIMINATED</div>
      {killer && (
        <div className="death-by">
          BY <b style={{ color: TEAM_VAR[killer.team] }}>{killer.name}</b>
          <span className="num"> · {Math.round(killer.hp)} HP LEFT</span>
        </div>
      )}
      <div className="death-hint">SPECTATING</div>
    </div>
  );
}

function Fps() {
  const show = useGame((s) => s.settings.showFps);
  const ref = useRef();
  const frames = useRef(0);
  const last = useRef(performance.now());
  useRaf(() => {
    frames.current++;
    const now = performance.now();
    if (now - last.current > 500) {
      const fps = Math.round((frames.current * 1000) / (now - last.current));
      if (ref.current) ref.current.textContent = `${fps} FPS`;
      frames.current = 0;
      last.current = now;
    }
  });
  if (!show) return null;
  return <div className="fps num" ref={ref}>--</div>;
}

function PhaseHint() {
  const phase = useGame((s) => s.phase);
  const practice = useGame((s) => s.practice);
  const entity = useGame((s) => s.entities[s.playerId]);
  const dev = useDevice();
  if (!entity) return null;
  if (phase === PHASE.BUY) {
    return (
      <div className="phase-hint">
        <b>BUY PHASE</b> · SPAWN IS PROTECTED · {dev.touch ? 'TAP THE CRATE ICON TO EQUIP' : 'PRESS B TO EQUIP'}
      </div>
    );
  }
  if (phase === PHASE.SUDDEN_DEATH) {
    return <div className="phase-hint danger"><b>SUDDEN DEATH</b> · FIRST ELIMINATION TAKES THE ROUND</div>;
  }
  if (practice && phase === PHASE.COMBAT) {
    return <div className="phase-hint"><b>PRACTICE RANGE</b> · TARGETS RESPAWN · CREDITS UNLIMITED</div>;
  }
  return null;
}

export function HUD() {
  const screen = useGame((s) => s.screen);
  if (screen !== 'match') return null;
  return (
    <div className="hud">
      <TopBar />
      <Squad />
      <Minimap />
      <KillFeed />
      <CreditBadge />
      <Vitals />
      <Ammo />
      <Crosshair />
      <HitMarkers />
      <DamageChevrons />
      <ScopeOverlay />
      <ScreenFx />
      <RoundBanner />
      <DeathCard />
      <PhaseHint />
      <Fps />
    </div>
  );
}

export default HUD;
