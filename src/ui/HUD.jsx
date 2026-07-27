/**
 * BREACHPOINT — In-match HUD (PRD §11).
 *
 *  - dynamic crosshair that blooms with movement/fire
 *  - HP + armor bar (bottom left), ammo counter (bottom right)
 *  - minimap with teammates + last-known enemy pings (top corner)
 *  - round timer + round-score dots (top centre) + MATCH POINT indicator
 *  - kill feed (top right), credits during buy phase
 *  - directional damage indicators, hit markers
 *  - full-screen flashbang blind, low-HP vignette, scope overlays
 */
import React, { useEffect, useRef, useState } from 'react';
import { useGame } from '../game/store.js';
import { PHASE, MATCH, TEAM_COLOR, TIMERS } from '../game/config.js';
import { getWeapon, UTILITY } from '../game/weapons.js';
import { world, currentWeaponRuntime, eyePosition } from '../game/world.js';
import { computeSpread } from '../game/combat.js';
import { PLAY, COVER_POINTS, brushes } from '../game/steelfall.js';

const fmtTime = (t) => {
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** rAF-driven values that must not trigger React re-renders. */
function useRaf(callback) {
  useEffect(() => {
    let id;
    const loop = () => { callback(); id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [callback]);
}

// ------------------------------------------------------------------ crosshair
function Crosshair() {
  const ref = useRef();
  const dotRef = useRef();
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
    const gap = Math.min(46, 4 + spread * 5.4);
    el.style.setProperty('--gap', `${gap}px`);
    const scoped = weapon.scope?.overlay && actor.ads > 0.86;
    el.style.opacity = scoped || !alive ? '0' : '1';
  });

  const combat = phase === PHASE.COMBAT || phase === PHASE.SUDDEN_DEATH;
  if (!combat) return null;

  return (
    <div className="crosshair" ref={ref} style={{ '--xh': color }}>
      <span className="xh-line xh-top" />
      <span className="xh-line xh-bottom" />
      <span className="xh-line xh-left" />
      <span className="xh-line xh-right" />
      <span className="xh-dot" ref={dotRef} />
    </div>
  );
}

// ------------------------------------------------------------------ hit markers
function HitMarkers() {
  const hitmarkers = useGame((s) => s.hitmarkers);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 60);
    return () => clearInterval(i);
  }, []);
  const active = hitmarkers.filter((h) => now - h.time < 340);
  if (!active.length) return null;
  const latest = active[active.length - 1];
  const age = (now - latest.time) / 340;
  return (
    <div
      className={`hitmarker ${latest.killed ? 'hm-kill' : latest.kind === 'head' ? 'hm-head' : ''}`}
      style={{ opacity: 1 - age, transform: `translate(-50%,-50%) scale(${1 + age * 0.5})` }}
    >
      <span /><span /><span /><span />
    </div>
  );
}

// ------------------------------------------------------------------ damage direction (PRD §11)
function DamageIndicators() {
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
      // angle of the attacker relative to view
      const ang = Math.atan2(d.dir[0], d.dir[2]);
      const rel = ang - (actor.yaw + Math.PI);
      k.style.opacity = String(life * 0.85);
      k.style.transform = `rotate(${rel}rad)`;
    }
  });
  return (
    <div className="dmg-indicators" ref={ref}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="dmg-arc" style={{ opacity: 0 }}><span /></div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ minimap (PRD §11)
const MINI = 190;
function Minimap() {
  const canvasRef = useRef();
  const playerId = useGame((s) => s.playerId);
  const order = useGame((s) => s.order);
  const entities = useGame((s) => s.entities);
  const playerTeam = useGame((s) => s.playerTeam);

  // static geometry layer, drawn once
  const bgRef = useRef(null);
  useEffect(() => {
    const c = document.createElement('canvas');
    c.width = c.height = MINI;
    const ctx = c.getContext('2d');
    const W = PLAY.maxX - PLAY.minX;
    const H = PLAY.maxZ - PLAY.minZ;
    const sx = MINI / W;
    const sy = MINI / H;
    ctx.fillStyle = 'rgba(8,12,18,0.82)';
    ctx.fillRect(0, 0, MINI, MINI);
    for (const b of brushes) {
      if (!b.collide) continue;
      if (b.max[1] < 0.35) continue; // floors
      if (b.min[1] > 4.2) continue; // ceilings/pipes
      const x = (b.min[0] - PLAY.minX) * sx;
      const y = (b.min[2] - PLAY.minZ) * sy;
      const w = (b.max[0] - b.min[0]) * sx;
      const h = (b.max[2] - b.min[2]) * sy;
      const tall = b.max[1] > 3.6;
      ctx.fillStyle = tall ? 'rgba(120,132,150,0.55)' : 'rgba(96,108,124,0.4)';
      ctx.fillRect(x, y, Math.max(1, w), Math.max(1, h));
    }
    // spawn tints
    ctx.fillStyle = 'rgba(63,169,255,0.14)';
    ctx.fillRect(0, 0, MINI, (6 / H) * MINI);
    ctx.fillStyle = 'rgba(255,85,64,0.14)';
    ctx.fillRect(0, MINI - (6 / H) * MINI, MINI, (6 / H) * MINI);
    bgRef.current = c;
  }, []);

  useRaf(() => {
    const canvas = canvasRef.current;
    const bg = bgRef.current;
    if (!canvas || !bg) return;
    const ctx = canvas.getContext('2d');
    const W = PLAY.maxX - PLAY.minX;
    const H = PLAY.maxZ - PLAY.minZ;
    const sx = MINI / W;
    const sy = MINI / H;
    ctx.clearRect(0, 0, MINI, MINI);
    ctx.drawImage(bg, 0, 0);

    const px = (p) => (p[0] - PLAY.minX) * sx;
    const py = (p) => (p[2] - PLAY.minZ) * sy;

    // smoke volumes
    for (const s of world.smokes) {
      ctx.beginPath();
      ctx.fillStyle = `rgba(190,195,205,${0.22 * s.opacity})`;
      ctx.arc(px(s.pos), py(s.pos), s.radius * sx * Math.min(1, s.grow), 0, Math.PI * 2);
      ctx.fill();
    }

    const self = world.actors[playerId];

    // last known enemy pings (PRD §11)
    const now = world.time;
    for (const id of order) {
      const e = entities[id];
      const a = world.actors[id];
      if (!e || !a) continue;
      if (e.team === playerTeam) continue;
      if (!a.alive) continue;
      // Only ping enemies that recently fired or that a teammate can see.
      const recentlyFired = now - (a.lastFireTime || -99) < 2.6;
      let seen = false;
      for (const oid of order) {
        const o = world.actors[oid];
        const oe = entities[oid];
        if (!o || !oe || oe.team !== playerTeam || !o.alive) continue;
        const d = Math.hypot(o.pos[0] - a.pos[0], o.pos[2] - a.pos[2]);
        if (d < 26) { seen = true; break; }
      }
      if (!recentlyFired && !seen) continue;
      ctx.beginPath();
      ctx.fillStyle = recentlyFired ? 'rgba(255,85,64,0.95)' : 'rgba(255,140,110,0.5)';
      ctx.arc(px(a.pos), py(a.pos), 4, 0, Math.PI * 2);
      ctx.fill();
      if (recentlyFired) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255,85,64,0.5)';
        ctx.lineWidth = 1.5;
        const pulse = 5 + Math.sin(now * 6) * 2.5;
        ctx.arc(px(a.pos), py(a.pos), pulse, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // teammates
    for (const id of order) {
      const e = entities[id];
      const a = world.actors[id];
      if (!e || !a || e.team !== playerTeam || !a.alive) continue;
      if (id === playerId) continue;
      ctx.beginPath();
      ctx.fillStyle = '#3fa9ff';
      ctx.arc(px(a.pos), py(a.pos), 3.5, 0, Math.PI * 2);
      ctx.fill();
      // facing tick
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(63,169,255,0.8)';
      ctx.lineWidth = 1.6;
      ctx.moveTo(px(a.pos), py(a.pos));
      ctx.lineTo(px(a.pos) - Math.sin(a.yaw) * 8, py(a.pos) - Math.cos(a.yaw) * 8);
      ctx.stroke();
    }

    // self — triangle showing facing
    if (self && self.alive) {
      const x = px(self.pos);
      const y = py(self.pos);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-self.yaw + Math.PI);
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 6);
      ctx.lineTo(0, 3);
      ctx.lineTo(-5, 6);
      ctx.closePath();
      ctx.fillStyle = '#eafaff';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      // view cone
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-self.yaw + Math.PI);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 34, -Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62);
      ctx.closePath();
      ctx.fillStyle = 'rgba(234,250,255,0.09)';
      ctx.fill();
      ctx.restore();
    }
  });

  return (
    <div className="minimap">
      <canvas ref={canvasRef} width={MINI} height={MINI} />
      <div className="minimap-label">STEELFALL</div>
    </div>
  );
}

// ------------------------------------------------------------------ top bar
function TopBar() {
  const phase = useGame((s) => s.phase);
  const phaseTime = useGame((s) => s.phaseTime);
  const score = useGame((s) => s.score);
  const round = useGame((s) => s.round);
  const playerTeam = useGame((s) => s.playerTeam);
  const practice = useGame((s) => s.practice);
  const swapped = useGame((s) => s.sidesSwapped);

  const enemyTeam = playerTeam === 'BLUE' ? 'RED' : 'BLUE';
  const matchPoint = score[playerTeam] >= MATCH.matchPointAt || score[enemyTeam] >= MATCH.matchPointAt;

  const phaseLabel = {
    [PHASE.WARMUP]: 'PREPARING',
    [PHASE.BUY]: 'BUY PHASE',
    [PHASE.COMBAT]: '',
    [PHASE.SUDDEN_DEATH]: 'SUDDEN DEATH',
    [PHASE.ROUND_END]: 'ROUND OVER',
  }[phase] || '';

  const urgent = phase === PHASE.COMBAT && phaseTime < 20;

  return (
    <div className="topbar">
      <div className="score-side score-own" style={{ '--c': TEAM_COLOR[playerTeam] }}>
        <div className="score-num">{score[playerTeam]}</div>
        <div className="score-dots">
          {Array.from({ length: MATCH.roundsToWin }).map((_, i) => (
            <span key={i} className={i < score[playerTeam] ? 'dot filled' : 'dot'} />
          ))}
        </div>
      </div>

      <div className="timer-block">
        <div className={`timer ${urgent ? 'urgent' : ''} ${phase === PHASE.SUDDEN_DEATH ? 'sudden' : ''}`}>
          {practice ? '∞' : fmtTime(phaseTime)}
        </div>
        <div className="phase-label">
          {phaseLabel || `ROUND ${round}`}
        </div>
        {matchPoint && !practice && (
          <div className="match-point">MATCH POINT</div>
        )}
        {swapped && <div className="swap-note">SIDES SWAPPED</div>}
      </div>

      <div className="score-side score-enemy" style={{ '--c': TEAM_COLOR[enemyTeam] }}>
        <div className="score-num">{score[enemyTeam]}</div>
        <div className="score-dots">
          {Array.from({ length: MATCH.roundsToWin }).map((_, i) => (
            <span key={i} className={i < score[enemyTeam] ? 'dot filled' : 'dot'} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ team strip
function TeamStatus() {
  const order = useGame((s) => s.order);
  const entities = useGame((s) => s.entities);
  const playerTeam = useGame((s) => s.playerTeam);
  const playerId = useGame((s) => s.playerId);

  const mates = order.map((id) => entities[id]).filter((e) => e.team === playerTeam);
  const foes = order.map((id) => entities[id]).filter((e) => e.team !== playerTeam);

  return (
    <div className="team-status">
      <div className="ts-group">
        {mates.map((e) => (
          <div key={e.id} className={`ts-pill ${e.alive ? '' : 'dead'} ${e.id === playerId ? 'self' : ''}`}>
            <span className="ts-name">{e.name}</span>
            <span className="ts-hpbar"><i style={{ width: `${e.alive ? e.hp : 0}%` }} /></span>
          </div>
        ))}
      </div>
      <div className="ts-vs">VS</div>
      <div className="ts-group ts-enemy">
        {foes.map((e) => (
          <div key={e.id} className={`ts-pill enemy ${e.alive ? '' : 'dead'}`}>
            <span className="ts-name">{e.name}</span>
            <span className="ts-dot" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ bottom left: HP / armor
function VitalsPanel() {
  const entity = useGame((s) => s.entities[s.playerId]);
  if (!entity) return null;
  const armorPct = entity.loadout.armor === 'heavy' ? 100 : entity.loadout.armor === 'light' ? 55 : 0;
  const low = entity.hp <= 35;
  return (
    <div className="vitals">
      <div className="v-row">
        <span className="v-label">HP</span>
        <div className={`v-bar hp ${low ? 'low' : ''}`}>
          <i style={{ width: `${Math.max(0, entity.hp)}%` }} />
        </div>
        <span className={`v-num ${low ? 'low' : ''}`}>{Math.max(0, Math.round(entity.hp))}</span>
      </div>
      {armorPct > 0 && (
        <div className="v-row">
          <span className="v-label">AR</span>
          <div className="v-bar ar"><i style={{ width: `${armorPct}%` }} /></div>
          <span className="v-num small">{entity.loadout.armor === 'heavy' ? 'HEAVY' : 'LIGHT'}</span>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ bottom right: ammo + utility
function AmmoPanel() {
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
    if (magRef.current) magRef.current.textContent = String(wr.mag);
    if (resRef.current) resRef.current.textContent = String(wr.reserve);
    if (barRef.current) {
      const pct = (wr.mag / w.magazine) * 100;
      barRef.current.style.width = `${pct}%`;
      barRef.current.style.background = pct < 25 ? '#ff5540' : pct < 55 ? '#ffbb33' : '#cfe6ff';
    }
  });

  if (!entity) return null;
  const w = getWeapon(entity.loadout.current);

  return (
    <div className="ammo-panel">
      <div className="util-row">
        {['frag', 'flash', 'smoke', 'medkit'].map((u, i) => {
          const count = entity.loadout.utility[u] || 0;
          return (
            <div key={u} className={`util-chip ${count > 0 ? 'has' : ''} u-${u}`} title={UTILITY[u].name}>
              <span className="util-key">{u === 'medkit' ? 'F' : String(i + 3)}</span>
              <span className="util-dot" />
              <span className="util-count">{count}</span>
            </div>
          );
        })}
      </div>
      <div className="weapon-name">{w.name}</div>
      <div className="ammo-line">
        <span className="mag" ref={magRef}>0</span>
        <span className="slash">/</span>
        <span className="reserve" ref={resRef}>0</span>
      </div>
      <div className="mag-bar"><i ref={barRef} /></div>
      <div className="weapon-slots">
        <span className={entity.loadout.current === entity.loadout.primary ? 'slot active' : 'slot'}>
          1 {entity.loadout.primary ? getWeapon(entity.loadout.primary).name : '—'}
        </span>
        <span className={entity.loadout.current === entity.loadout.sidearm ? 'slot active' : 'slot'}>
          2 {getWeapon(entity.loadout.sidearm).name}
        </span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ kill feed
function KillFeed() {
  const killfeed = useGame((s) => s.killfeed);
  const playerTeam = useGame((s) => s.playerTeam);
  return (
    <div className="killfeed">
      {killfeed.map((k) => (
        <div key={k.key} className={`kf-row ${k.killerIsPlayer || k.victimIsPlayer ? 'kf-self' : ''}`}>
          <span className="kf-killer" style={{ color: k.killerTeam ? TEAM_COLOR[k.killerTeam] : '#999' }}>
            {k.killer || 'WORLD'}
          </span>
          <span className="kf-weapon">
            {k.headshot && <b className="kf-hs">◎</b>}
            {k.weapon}
          </span>
          <span className="kf-victim" style={{ color: TEAM_COLOR[k.victimTeam] }}>{k.victim}</span>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ credits (buy phase)
function CreditsBadge() {
  const entity = useGame((s) => s.entities[s.playerId]);
  const phase = useGame((s) => s.phase);
  const practice = useGame((s) => s.practice);
  if (!entity) return null;
  const show = phase === PHASE.BUY || phase === PHASE.WARMUP || practice;
  if (!show) return null;
  return (
    <div className="credits-badge">
      <span className="cr-label">CREDITS</span>
      <span className="cr-value">{practice ? '∞' : entity.credits.toLocaleString()}</span>
      <span className="cr-hint">[B] BUY MENU</span>
    </div>
  );
}

// ------------------------------------------------------------------ scope overlays (PRD §7.2)
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
      // slight scope sway
      const swayX = Math.sin(world.time * 1.3) * (1 - actor.crouch * 0.6) * 3;
      const swayY = Math.cos(world.time * 0.9) * (1 - actor.crouch * 0.6) * 2.4;
      ref.current.style.transform = `translate(${swayX}px, ${swayY}px)`;
    }
  });

  if (!kind) return null;

  return (
    <div className="scope-overlay" ref={ref}>
      <div className="scope-vignette" />
      <div className="scope-lens">
        {kind === 'duplex' ? (
          <svg viewBox="0 0 400 400" className="reticle">
            {/* duplex: thick outer bars narrowing to a fine centre cross */}
            <line x1="200" y1="0" x2="200" y2="140" stroke="#0a0a0a" strokeWidth="9" />
            <line x1="200" y1="260" x2="200" y2="400" stroke="#0a0a0a" strokeWidth="9" />
            <line x1="0" y1="200" x2="140" y2="200" stroke="#0a0a0a" strokeWidth="9" />
            <line x1="260" y1="200" x2="400" y2="200" stroke="#0a0a0a" strokeWidth="9" />
            <line x1="200" y1="140" x2="200" y2="192" stroke="#0a0a0a" strokeWidth="1.6" />
            <line x1="200" y1="208" x2="200" y2="260" stroke="#0a0a0a" strokeWidth="1.6" />
            <line x1="140" y1="200" x2="192" y2="200" stroke="#0a0a0a" strokeWidth="1.6" />
            <line x1="208" y1="200" x2="260" y2="200" stroke="#0a0a0a" strokeWidth="1.6" />
            <circle cx="200" cy="200" r="1.6" fill="#0a0a0a" />
          </svg>
        ) : (
          <svg viewBox="0 0 400 400" className="reticle">
            {/* mil-dot for range estimation */}
            <line x1="200" y1="18" x2="200" y2="382" stroke="#0a0a0a" strokeWidth="1.4" />
            <line x1="18" y1="200" x2="382" y2="200" stroke="#0a0a0a" strokeWidth="1.4" />
            {[-4, -3, -2, -1, 1, 2, 3, 4].map((i) => (
              <g key={i}>
                <circle cx={200 + i * 34} cy="200" r="2.6" fill="#0a0a0a" />
                <circle cx="200" cy={200 + i * 34} r="2.6" fill="#0a0a0a" />
              </g>
            ))}
            <line x1="200" y1="0" x2="200" y2="18" stroke="#0a0a0a" strokeWidth="7" />
            <line x1="200" y1="382" x2="200" y2="400" stroke="#0a0a0a" strokeWidth="7" />
            <line x1="0" y1="200" x2="18" y2="200" stroke="#0a0a0a" strokeWidth="7" />
            <line x1="382" y1="200" x2="400" y2="200" stroke="#0a0a0a" strokeWidth="7" />
            <circle cx="200" cy="200" r="1.4" fill="#0a0a0a" />
          </svg>
        )}
        <div className="scope-glare" />
      </div>
      <div className="scope-ticks">
        <span className="tick-left" />
        <span className="tick-right" />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ screen effects
function ScreenEffects() {
  const flashRef = useRef();
  const vignetteRef = useRef();
  const healRef = useRef();
  const playerId = useGame((s) => s.playerId);
  const entity = useGame((s) => s.entities[s.playerId]);

  useRaf(() => {
    const actor = world.actors[playerId];
    // flashbang (PRD §13 — full-screen white flash + fade)
    if (flashRef.current) {
      const b = world.localBlind;
      const max = world.localBlindMax || 1;
      const v = Math.min(1, b / Math.max(0.3, max * 0.55));
      flashRef.current.style.opacity = String(Math.min(0.98, v));
    }
    // low HP vignette
    if (vignetteRef.current && entity) {
      const hp = entity.alive ? entity.hp : 100;
      const t = hp < 45 ? (45 - hp) / 45 : 0;
      const pulse = 1 + Math.sin(world.time * 3.4) * 0.12 * t;
      vignetteRef.current.style.opacity = String(t * 0.72 * pulse);
    }
    // medkit channel
    if (healRef.current && actor) {
      healRef.current.style.opacity = actor.healing > 0 ? '1' : '0';
      if (actor.healing > 0) {
        const pct = 1 - actor.healing / 3;
        healRef.current.querySelector('i').style.width = `${pct * 100}%`;
      }
    }
  });

  return (
    <>
      <div className="flash-overlay" ref={flashRef} />
      <div className="hurt-vignette" ref={vignetteRef} />
      <div className="heal-channel" ref={healRef} style={{ opacity: 0 }}>
        <span>APPLYING MEDKIT</span>
        <div className="heal-bar"><i /></div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ round banners
function RoundBanner() {
  const phase = useGame((s) => s.phase);
  const roundWinner = useGame((s) => s.roundWinner);
  const reason = useGame((s) => s.roundEndReason);
  const playerTeam = useGame((s) => s.playerTeam);
  const round = useGame((s) => s.round);
  const score = useGame((s) => s.score);
  const recap = useGame((s) => s.lastRoundRecap);
  const matchWinner = useGame((s) => s.matchWinner);

  if (phase !== PHASE.ROUND_END) return null;
  const won = roundWinner === playerTeam;
  const draw = !roundWinner;

  return (
    <div className="round-banner">
      <div className={`rb-card ${draw ? 'draw' : won ? 'win' : 'lose'}`}>
        <div className="rb-title">
          {draw ? 'ROUND DRAW' : won ? 'ROUND WON' : 'ROUND LOST'}
        </div>
        <div className="rb-reason">{reason}</div>
        <div className="rb-score">
          <span className="rb-blue">{score.BLUE}</span>
          <span className="rb-sep">—</span>
          <span className="rb-red">{score.RED}</span>
        </div>
        <div className="rb-credit">
          + {won ? '3,000' : '2,000'} CREDITS
        </div>
        {matchWinner && <div className="rb-match">MATCH DECIDED</div>}
        {recap.length > 0 && (
          <div className="rb-recap">
            {recap.slice(0, 5).map((k) => (
              <div key={k.key} className="rb-recap-row">
                <span style={{ color: k.killerTeam ? TEAM_COLOR[k.killerTeam] : '#888' }}>{k.killer || 'WORLD'}</span>
                <span className="rb-arrow">{k.headshot ? '◎' : '→'}</span>
                <span style={{ color: TEAM_COLOR[k.victimTeam] }}>{k.victim}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ death overlay
function DeathOverlay() {
  const entity = useGame((s) => s.entities[s.playerId]);
  const entities = useGame((s) => s.entities);
  const phase = useGame((s) => s.phase);
  if (!entity || entity.alive) return null;
  if (phase === PHASE.ROUND_END || phase === PHASE.MATCH_END) return null;
  const killer = entity.killedBy ? entities[entity.killedBy] : null;
  return (
    <div className="death-overlay">
      <div className="do-title">ELIMINATED</div>
      {killer && (
        <div className="do-killer">
          by <b style={{ color: TEAM_COLOR[killer.team] }}>{killer.name}</b>
          <span className="do-hp"> · {Math.round(killer.hp)} HP left</span>
        </div>
      )}
      <div className="do-hint">SPECTATING · round continues</div>
    </div>
  );
}

// ------------------------------------------------------------------ FPS counter
function FpsCounter() {
  const show = useGame((s) => s.settings.showFps);
  const ref = useRef();
  const frames = useRef(0);
  const last = useRef(performance.now());
  useRaf(() => {
    frames.current++;
    const now = performance.now();
    if (now - last.current > 500) {
      const fps = Math.round((frames.current * 1000) / (now - last.current));
      if (ref.current) {
        ref.current.textContent = `${fps} FPS · ${world.actorList.filter((a) => a.alive).length} alive · ${world.tracers.length}t`;
      }
      frames.current = 0;
      last.current = now;
    }
  });
  if (!show) return null;
  return <div className="fps-counter" ref={ref}>—</div>;
}

// ------------------------------------------------------------------ objective hint
function PhaseHint() {
  const phase = useGame((s) => s.phase);
  const practice = useGame((s) => s.practice);
  const entity = useGame((s) => s.entities[s.playerId]);
  if (!entity) return null;
  if (phase === PHASE.BUY) {
    return (
      <div className="phase-hint">
        <b>BUY PHASE</b> — you are invulnerable inside the spawn zone. Press <kbd>B</kbd> to open the shop.
      </div>
    );
  }
  if (phase === PHASE.SUDDEN_DEATH) {
    return <div className="phase-hint danger"><b>SUDDEN DEATH</b> — first elimination wins the round.</div>;
  }
  if (practice && phase === PHASE.COMBAT) {
    return <div className="phase-hint"><b>PRACTICE RANGE</b> — infinite credits, bots respawn. Press <kbd>Esc</kbd> to exit.</div>;
  }
  return null;
}

export function HUD() {
  const screen = useGame((s) => s.screen);
  if (screen !== 'match') return null;
  return (
    <div className="hud">
      <TopBar />
      <TeamStatus />
      <Minimap />
      <KillFeed />
      <CreditsBadge />
      <VitalsPanel />
      <AmmoPanel />
      <Crosshair />
      <HitMarkers />
      <DamageIndicators />
      <ScopeOverlay />
      <ScreenEffects />
      <RoundBanner />
      <DeathOverlay />
      <PhaseHint />
      <FpsCounter />
    </div>
  );
}

export default HUD;
