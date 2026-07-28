/**
 * BREACHPOINT — Authoritative match state (zustand).
 *
 * PRD §15 requires game-state to be separate from rendering so online
 * multiplayer can be layered on later. Everything here is plain data +
 * pure-ish reducers; the renderer only *reads* and dispatches intents.
 * Nothing in this file imports React or three.js.
 */
import { create } from 'zustand';
import {
  PHASE, TIMERS, MATCH, ECONOMY, COMBAT, TEAM, DIFFICULTY, GAME_MODES, KILLFEED_TTL,
} from './config.js';
import { WEAPONS, UTILITY, getWeapon, resolveDamage } from './weapons.js';
import { SPAWNS, inBuyZone, setActiveMap } from './steelfall.js';

let _uid = 1;
const uid = () => `e${_uid++}`;

const BOT_NAMES = {
  BLUE: ['VIPER', 'ECHO', 'KESTREL', 'ORACLE', 'MASON'],
  RED: ['HAVOC', 'RAVEN', 'CINDER', 'TALON', 'DRIFT'],
};

function pickNames(team, n, exclude = []) {
  const pool = BOT_NAMES[team].filter((x) => !exclude.includes(x));
  const out = [];
  for (let i = 0; i < n; i++) out.push(pool[i % pool.length]);
  return out;
}

/** Fresh per-entity loadout state. */
function freshLoadout(weaponId = 'px1') {
  const w = getWeapon(weaponId);
  return {
    primary: null,
    sidearm: 'px1',
    current: weaponId,
    armor: 'none',
    ammo: { [weaponId]: { mag: w.magazine, reserve: w.reserve } },
    utility: { frag: 0, flash: 0, smoke: 0, medkit: 0 },
  };
}

function makeEntity({ team, isPlayer = false, name, index, difficulty = 'normal', personality }) {
  return {
    id: uid(),
    name,
    team,
    isPlayer,
    isBot: !isPlayer,
    index,
    difficulty,
    personality: personality || 'balanced',
    alive: true,
    hp: COMBAT.maxHP,
    credits: ECONOMY.startingCredits,
    pos: [0, 0, 0],
    yaw: 0,
    pitch: 0,
    vel: [0, 0, 0],
    crouched: false,
    sprinting: false,
    loadout: freshLoadout('px1'),
    // per-match stats (PRD §14)
    stats: {
      kills: 0, deaths: 0, assists: 0, damage: 0,
      shotsFired: 0, shotsHit: 0, headshots: 0, roundsWon: 0, clutches: 0,
      moneySpent: 0, utilityThrown: 0,
    },
    recentDamagers: [], // {id, amount, time} for assist tracking
    blindUntil: 0,
    deafUntil: 0,
    lastDamageTime: -99,
    lastDamageDir: null,
    killedBy: null,
  };
}

const initialStats = () => ({
  kills: 0, deaths: 0, assists: 0, damage: 0,
  shotsFired: 0, shotsHit: 0, headshots: 0, roundsWon: 0, clutches: 0,
  moneySpent: 0, utilityThrown: 0,
});

export const useGame = create((set, get) => ({
  // ---------------------------------------------------------------- meta
  screen: 'lobby', // lobby | loading | match | summary
  mode: GAME_MODES[0],
  difficulty: 'normal',
  practice: false,
  paused: false,
  pointerLocked: false,
  settings: {
    sensitivity: 1.0,
    fov: 82,
    masterVolume: 0.8,
    sfxVolume: 1.0,
    musicVolume: 0.5,
    invertY: false,
    showFps: false,
    quality: 'high',
    crosshairColor: '#39ff88',
    adsToggle: false,
  },
  profile: { name: 'OPERATOR', level: 1, xp: 0, lifetime: initialStats() },

  // ---------------------------------------------------------------- match
  phase: PHASE.WARMUP,
  phaseTime: 0,
  round: 1,
  score: { BLUE: 0, RED: 0 },
  playerTeam: TEAM.BLUE,
  sidesSwapped: false,
  entities: {}, // id -> entity
  order: [], // stable id order
  playerId: null,
  roundWinner: null,
  roundEndReason: '',
  matchWinner: null,
  killfeed: [],
  events: [], // transient VFX/SFX intents drained by the renderer
  hitmarkers: [],
  buyMenuOpen: false,
  scoreboardOpen: false,
  lastRoundRecap: [],
  matchStartTime: 0,
  clutchCandidate: null,
  mvpId: null,
  aceCam: null,
  loadingProgress: 0,

  // ---------------------------------------------------------------- lifecycle
  setScreen: (screen) => set({ screen }),
  setSetting: (k, v) => set((s) => ({ settings: { ...s.settings, [k]: v } })),
  setPointerLocked: (v) => set({ pointerLocked: v }),
  setPaused: (v) => set({ paused: v }),
  setLoadingProgress: (v) => set({ loadingProgress: v }),

  startMatch: (modeId) => {
    const mode = GAME_MODES.find((m) => m.id === modeId) || GAME_MODES[0];
    const difficulty = mode.difficulty;
    const practice = mode.id === 'practice';
    // Swap the active map BEFORE spawns are read: practice uses its own yard.
    setActiveMap(mode.mapId || 'dustline');
    const playerTeam = TEAM.BLUE;

    const entities = {};
    const order = [];

    const profileName = get().profile.name || 'OPERATOR';
    const player = makeEntity({ team: playerTeam, isPlayer: true, name: profileName, index: 0 });
    entities[player.id] = player;
    order.push(player.id);

    const allyNames = pickNames(TEAM.BLUE, 2);
    allyNames.forEach((n, i) => {
      const e = makeEntity({
        team: TEAM.BLUE, name: n, index: i + 1, difficulty,
        personality: i === 0 ? 'entry' : 'anchor',
      });
      entities[e.id] = e;
      order.push(e.id);
    });

    const foeNames = pickNames(TEAM.RED, 3);
    foeNames.forEach((n, i) => {
      const e = makeEntity({
        team: TEAM.RED, name: n, index: i, difficulty,
        personality: ['entry', 'anchor', 'flanker'][i % 3],
      });
      entities[e.id] = e;
      order.push(e.id);
    });

    if (practice) {
      for (const id of order) {
        entities[id].credits = 99000;
      }
    }

    set({
      screen: 'match',
      mode,
      difficulty,
      practice,
      playerTeam,
      playerId: player.id,
      entities,
      order,
      phase: PHASE.WARMUP,
      phaseTime: TIMERS.freezeIntro,
      round: 1,
      score: { BLUE: 0, RED: 0 },
      sidesSwapped: false,
      killfeed: [],
      events: [],
      hitmarkers: [],
      roundWinner: null,
      matchWinner: null,
      buyMenuOpen: false,
      scoreboardOpen: false,
      lastRoundRecap: [],
      matchStartTime: Date.now(),
      mvpId: null,
      aceCam: null,
      paused: false,
    });
    get().resetRoundEntities();

    // Practice range: no countdown, no buy phase, just start. The player also
    // begins with a rifle and full utility so there is nothing to wait for.
    if (practice) {
      const st = get();
      for (const id of st.order) {
        const e = st.entities[id];
        st.buyWeapon(id, e.isPlayer ? 'vanguard7' : 'raptor9');
      }
      set({ buyMenuOpen: false });
      get().setPhase(PHASE.COMBAT, 9999);
    }
  },

  returnToLobby: () => set({
    screen: 'lobby', phase: PHASE.WARMUP, entities: {}, order: [], playerId: null,
    paused: false, buyMenuOpen: false, scoreboardOpen: false, aceCam: null,
  }),

  /** Full per-round reset: HP, positions, ammo (PRD §6 HP resets each round). */
  resetRoundEntities: () => {
    const { entities, order, round, practice } = get();
    const swapped = round > MATCH.sideSwapAfterRound;
    const next = {};
    const perTeamIdx = { BLUE: 0, RED: 0 };
    for (const id of order) {
      const e = entities[id];
      const spawnTeam = swapped ? (e.team === TEAM.BLUE ? TEAM.RED : TEAM.BLUE) : e.team;
      const slot = SPAWNS[spawnTeam][perTeamIdx[e.team] % 3];
      perTeamIdx[e.team]++;
      const lo = e.loadout;
      // Keep purchased kit across rounds (PRD: credits carry over; kit persists like a
      // classic tactical shooter — you keep what you survived with, rebuy if you died).
      const keptPrimary = e.alive ? lo.primary : null;
      const keptArmor = e.alive ? lo.armor : 'none';
      const keptUtil = e.alive ? { ...lo.utility } : { frag: 0, flash: 0, smoke: 0, medkit: 0 };
      const startWeapon = keptPrimary || 'px1';
      const ammo = {};
      const pw = getWeapon(startWeapon);
      ammo[startWeapon] = { mag: pw.magazine, reserve: pw.reserve };
      if (startWeapon !== 'px1') ammo.px1 = { mag: WEAPONS.px1.magazine, reserve: WEAPONS.px1.reserve };
      if (lo.sidearm && !ammo[lo.sidearm]) {
        const sw = getWeapon(lo.sidearm);
        ammo[lo.sidearm] = { mag: sw.magazine, reserve: sw.reserve };
      }
      next[id] = {
        ...e,
        alive: true,
        hp: COMBAT.maxHP,
        pos: [slot.pos[0], slot.pos[1], slot.pos[2]],
        yaw: slot.yaw,
        pitch: 0,
        vel: [0, 0, 0],
        crouched: false,
        sprinting: false,
        blindUntil: 0,
        deafUntil: 0,
        recentDamagers: [],
        killedBy: null,
        lastDamageTime: -99,
        lastDamageDir: null,
        loadout: {
          ...lo,
          primary: keptPrimary,
          sidearm: lo.sidearm || 'px1',
          armor: keptArmor,
          current: startWeapon,
          ammo,
          utility: practice ? { frag: 2, flash: 2, smoke: 2, medkit: 1 } : keptUtil,
        },
      };
    }
    set({ entities: next, sidesSwapped: swapped });
  },

  // ---------------------------------------------------------------- phases
  setPhase: (phase, time) => {
    const t = time ?? {
      [PHASE.BUY]: TIMERS.buy,
      [PHASE.COMBAT]: TIMERS.combat,
      [PHASE.SUDDEN_DEATH]: TIMERS.suddenDeath,
      [PHASE.ROUND_END]: TIMERS.roundEnd,
      [PHASE.WARMUP]: TIMERS.freezeIntro,
    }[phase] ?? 0;
    set({ phase, phaseTime: t });
    if (phase === PHASE.BUY) set({ buyMenuOpen: true });
    if (phase === PHASE.COMBAT) set({ buyMenuOpen: false });
  },

  tickPhase: (dt) => {
    const s = get();
    if (s.paused || s.screen !== 'match') return;
    if (s.phase === PHASE.MATCH_END) return;
    const t = Math.max(0, s.phaseTime - dt);
    set({ phaseTime: t });

    // decay killfeed + hitmarkers
    if (s.killfeed.length) {
      const kf = s.killfeed.filter((k) => Date.now() - k.time < KILLFEED_TTL * 1000);
      if (kf.length !== s.killfeed.length) set({ killfeed: kf });
    }

    if (t > 0) return;

    switch (s.phase) {
      case PHASE.WARMUP:
        get().setPhase(PHASE.BUY);
        get().pushEvent({ type: 'sfx', sound: 'ui_round_start' });
        break;
      case PHASE.BUY:
        get().beginCombat();
        break;
      case PHASE.COMBAT: {
        if (s.practice) { set({ phaseTime: TIMERS.combat }); break; }
        // PRD §4 — time out: most players alive wins; tie -> sudden death
        const alive = get().aliveCount();
        if (alive.BLUE > alive.RED) get().endRound(TEAM.BLUE, 'TIME — MORE OPERATORS ALIVE');
        else if (alive.RED > alive.BLUE) get().endRound(TEAM.RED, 'TIME — MORE OPERATORS ALIVE');
        else get().setPhase(PHASE.SUDDEN_DEATH);
        break;
      }
      case PHASE.SUDDEN_DEATH: {
        // no first blood in sudden death -> defenders (fewer kills) lose the coin flip:
        // resolve by total damage this round; fall back to BLUE.
        const alive = get().aliveCount();
        if (alive.BLUE > alive.RED) get().endRound(TEAM.BLUE, 'SUDDEN DEATH — SURVIVORS');
        else if (alive.RED > alive.BLUE) get().endRound(TEAM.RED, 'SUDDEN DEATH — SURVIVORS');
        else get().endRound(null, 'SUDDEN DEATH — DRAW');
        break;
      }
      case PHASE.ROUND_END:
        get().nextRound();
        break;
      default:
        break;
    }
  },

  /** Player pressed READY during the buy phase: start the round immediately. */
  readyUp: () => {
    const s = get();
    if (s.phase !== PHASE.BUY && s.phase !== PHASE.WARMUP) return;
    set({ phaseTime: 0.35 });
  },

  beginCombat: () => {
    const { entities, order, practice } = get();
    const next = { ...entities };
    // PRD §4 — auto-equip free PX-1 if nothing bought
    for (const id of order) {
      const e = next[id];
      const lo = e.loadout;
      if (!lo.primary && lo.current !== 'px1') {
        next[id] = { ...e, loadout: { ...lo, current: 'px1' } };
      }
    }
    set({ entities: next, buyMenuOpen: false });
    get().setPhase(PHASE.COMBAT);
    get().pushEvent({ type: 'sfx', sound: 'ui_round_start' });
    if (practice) set({ phaseTime: TIMERS.combat });
  },

  aliveCount: () => {
    const { entities, order } = get();
    const c = { BLUE: 0, RED: 0 };
    for (const id of order) if (entities[id].alive) c[entities[id].team]++;
    return c;
  },

  /** Called after any death to check elimination victory (PRD §4). */
  checkRoundOver: () => {
    const s = get();
    if (s.practice) return;
    if (s.phase !== PHASE.COMBAT && s.phase !== PHASE.SUDDEN_DEATH) return;
    const alive = s.aliveCount();
    if (alive.BLUE === 0 && alive.RED === 0) { get().endRound(null, 'MUTUAL ELIMINATION'); return; }
    if (alive.BLUE === 0) { get().endRound(TEAM.RED, 'TEAM ELIMINATED'); return; }
    if (alive.RED === 0) { get().endRound(TEAM.BLUE, 'TEAM ELIMINATED'); return; }

    // PRD §14 — track clutch situations (1vX)
    if (!s.clutchCandidate) {
      for (const team of [TEAM.BLUE, TEAM.RED]) {
        const other = team === TEAM.BLUE ? TEAM.RED : TEAM.BLUE;
        if (alive[team] === 1 && alive[other] >= 2) {
          const lastId = s.order.find((id) => s.entities[id].alive && s.entities[id].team === team);
          set({ clutchCandidate: { id: lastId, versus: alive[other] } });
        }
      }
    }
  },

  endRound: (winner, reason) => {
    const s = get();
    if (s.phase === PHASE.ROUND_END || s.phase === PHASE.MATCH_END) return;
    const score = { ...s.score };
    if (winner) score[winner] += 1;

    // PRD §5 — economy payouts
    const next = { ...s.entities };
    for (const id of s.order) {
      const e = next[id];
      const won = winner && e.team === winner;
      const gain = winner == null ? ECONOMY.roundLoss : (won ? ECONOMY.roundWin : ECONOMY.roundLoss);
      const stats = { ...e.stats };
      if (won) stats.roundsWon += 1;
      // clutch credit
      if (won && s.clutchCandidate && s.clutchCandidate.id === id && e.alive) {
        stats.clutches += 1;
      }
      next[id] = {
        ...e,
        credits: s.practice ? 99000 : Math.min(ECONOMY.maxCredits, e.credits + gain),
        stats,
      };
    }

    const recap = s.killfeed.slice(0, 8);
    const matchOver = score.BLUE >= MATCH.roundsToWin || score.RED >= MATCH.roundsToWin
      || s.round >= MATCH.maxRounds;

    set({
      entities: next,
      score,
      roundWinner: winner,
      roundEndReason: reason || '',
      lastRoundRecap: recap,
      clutchCandidate: null,
    });

    get().pushEvent({
      type: 'sfx',
      sound: winner === s.playerTeam ? 'ui_round_win' : 'ui_round_lose',
    });

    if (matchOver) {
      const mw = score.BLUE > score.RED ? TEAM.BLUE : score.RED > score.BLUE ? TEAM.RED : null;
      set({ matchWinner: mw });
      get().setPhase(PHASE.ROUND_END, 4.5);
      setTimeout(() => {
        if (get().screen !== 'match') return;
        get().finishMatch();
      }, 4500);
    } else {
      get().setPhase(PHASE.ROUND_END);
    }
  },

  nextRound: () => {
    const s = get();
    const round = s.round + 1;
    if (round > MATCH.maxRounds) { get().finishMatch(); return; }
    set({ round, roundWinner: null, killfeed: [], aceCam: null });
    get().resetRoundEntities();
    get().setPhase(PHASE.BUY);
  },

  finishMatch: () => {
    const s = get();
    // PRD §14 — MVP = kills*100 + assists*50 + damage*0.5
    let best = null; let bestScore = -1;
    for (const id of s.order) {
      const e = s.entities[id];
      const sc = e.stats.kills * 100 + e.stats.assists * 50 + e.stats.damage * 0.5;
      if (sc > bestScore) { bestScore = sc; best = id; }
    }
    // persist lifetime stats
    const p = s.entities[s.playerId];
    const lifetime = { ...s.profile.lifetime };
    if (p) {
      for (const k of Object.keys(lifetime)) lifetime[k] += p.stats[k] || 0;
    }
    const xp = s.profile.xp + (p ? p.stats.kills * 25 + (s.matchWinner === s.playerTeam ? 200 : 80) : 0);
    set({
      phase: PHASE.MATCH_END,
      screen: 'summary',
      mvpId: best,
      profile: { ...s.profile, xp, level: 1 + Math.floor(xp / 1000), lifetime },
    });
    get().pushEvent({
      type: 'sfx',
      sound: s.matchWinner === s.playerTeam ? 'ui_match_win' : 'ui_match_lose',
    });
  },

  // ---------------------------------------------------------------- entity mutation
  patchEntity: (id, patch) => set((s) => {
    const e = s.entities[id];
    if (!e) return {};
    return { entities: { ...s.entities, [id]: { ...e, ...patch } } };
  }),

  /** Bulk positional sync from the simulation loop (avoids N store writes/frame). */
  syncTransforms: (list) => set((s) => {
    const next = { ...s.entities };
    let changed = false;
    for (const t of list) {
      const e = next[t.id];
      if (!e) continue;
      next[t.id] = { ...e, pos: t.pos, yaw: t.yaw, pitch: t.pitch, crouched: !!t.crouched, sprinting: !!t.sprinting, vel: t.vel || e.vel };
      changed = true;
    }
    return changed ? { entities: next } : {};
  }),

  /**
   * Core damage application (PRD §6).
   * Handles armor, headshots, assists, kill rewards and round-over checks.
   */
  applyDamage: ({ targetId, attackerId, weaponId, distance, hitZone, dirFromAttacker, amount, cause }) => {
    const s = get();
    const target = s.entities[targetId];
    if (!target || !target.alive) return 0;
    if (s.phase === PHASE.BUY || s.phase === PHASE.WARMUP || s.phase === PHASE.ROUND_END) return 0; // safe zone

    const weapon = weaponId ? getWeapon(weaponId) : null;
    let dmg = amount;
    if (dmg == null && weapon) {
      dmg = resolveDamage({ weapon, distance, hitZone, armor: target.loadout.armor });
    }
    dmg = Math.max(1, Math.round(dmg || 0));

    const hp = target.hp - dmg;
    const attacker = attackerId ? s.entities[attackerId] : null;
    const now = Date.now() / 1000;

    const nextEntities = { ...s.entities };

    // track damage contributions for assists
    const recent = [...target.recentDamagers.filter((d) => now - d.time < COMBAT.assistWindow)];
    if (attackerId && attackerId !== targetId) {
      const found = recent.find((d) => d.id === attackerId);
      if (found) found.amount += dmg;
      else recent.push({ id: attackerId, amount: dmg, time: now });
    }

    nextEntities[targetId] = {
      ...target,
      hp: Math.max(0, hp),
      recentDamagers: recent,
      lastDamageTime: now,
      lastDamageDir: dirFromAttacker || target.lastDamageDir,
    };

    if (attacker) {
      nextEntities[attackerId] = {
        ...attacker,
        stats: {
          ...attacker.stats,
          damage: attacker.stats.damage + Math.min(dmg, target.hp),
          shotsHit: attacker.stats.shotsHit + (cause === 'bullet' ? 1 : 0),
          headshots: attacker.stats.headshots + (hitZone === 'head' ? 1 : 0),
        },
      };
    }

    set({ entities: nextEntities });

    if (attackerId === s.playerId && targetId !== s.playerId) {
      get().addHitmarker(hitZone === 'head' ? 'head' : 'body', hp <= 0);
    }

    if (hp <= 0) {
      get().killEntity({ targetId, attackerId, weaponId, hitZone, cause });
    }
    return dmg;
  },

  killEntity: ({ targetId, attackerId, weaponId, hitZone, cause }) => {
    const s = get();
    const target = s.entities[targetId];
    if (!target || !target.alive) return;
    const now = Date.now() / 1000;
    const next = { ...s.entities };

    next[targetId] = {
      ...target,
      alive: false,
      hp: 0,
      killedBy: attackerId,
      stats: { ...target.stats, deaths: target.stats.deaths + 1 },
    };

    const attacker = attackerId && attackerId !== targetId ? s.entities[attackerId] : null;
    if (attacker) {
      const teamKill = attacker.team === target.team;
      next[attackerId] = {
        ...next[attackerId] || attacker,
        credits: s.practice ? 99000 : Math.min(
          ECONOMY.maxCredits,
          (next[attackerId] || attacker).credits + (teamKill ? 0 : ECONOMY.killReward),
        ),
        stats: {
          ...(next[attackerId] || attacker).stats,
          kills: (next[attackerId] || attacker).stats.kills + (teamKill ? -1 : 1),
        },
      };
      // assists (PRD §14)
      for (const d of target.recentDamagers) {
        if (d.id === attackerId || d.id === targetId) continue;
        if (now - d.time > COMBAT.assistWindow) continue;
        const a = next[d.id];
        if (!a || a.team === target.team) continue;
        next[d.id] = { ...a, stats: { ...a.stats, assists: a.stats.assists + 1 } };
      }
    }

    set({ entities: next });

    get().addKillfeed({
      killer: attacker ? attacker.name : null,
      killerTeam: attacker ? attacker.team : null,
      victim: target.name,
      victimTeam: target.team,
      weapon: weaponId ? getWeapon(weaponId).name : (cause || 'WORLD'),
      headshot: hitZone === 'head',
      killerIsPlayer: attackerId === s.playerId,
      victimIsPlayer: targetId === s.playerId,
    });

    get().pushEvent({
      type: 'death',
      id: targetId,
      pos: target.pos,
      team: target.team,
      byPlayer: attackerId === s.playerId,
    });

    // PRD §13 — Ace Cam: remember the last kill of the round from killer POV
    if (attacker) {
      set({ aceCam: { killerId: attackerId, victimId: targetId, at: Date.now(), pos: attacker.pos, victimPos: target.pos } });
    }

    if (s.practice && target.isBot) {
      // Practice range: bots respawn (PRD §3 "Practice Range" mode)
      setTimeout(() => {
        const st = get();
        if (st.screen !== 'match' || !st.practice) return;
        const e = st.entities[targetId];
        if (!e) return;
        const swapped = st.sidesSwapped;
        const spawnTeam = swapped ? (e.team === TEAM.BLUE ? TEAM.RED : TEAM.BLUE) : e.team;
        const slot = SPAWNS[spawnTeam][e.index % 3];
        get().patchEntity(targetId, {
          alive: true, hp: COMBAT.maxHP, pos: [...slot.pos], recentDamagers: [],
        });
      }, 3000);
      return;
    }

    get().checkRoundOver();
  },

  // ---------------------------------------------------------------- economy / buy (PRD §5, §4)
  canBuy: (id, price) => {
    const s = get();
    const e = s.entities[id];
    if (!e) return false;
    if (s.practice) return true;
    if (s.phase !== PHASE.BUY && s.phase !== PHASE.WARMUP) {
      // allow buying in the first seconds of combat only if still inside the buy zone
      if (!(s.phase === PHASE.COMBAT && inBuyZone(e.team, e.pos))) return false;
    }
    return e.credits >= price;
  },

  buyWeapon: (id, weaponId) => {
    const s = get();
    const e = s.entities[id];
    const w = getWeapon(weaponId);
    if (!e || !w) return false;
    if (!get().canBuy(id, w.price)) return false;
    if (e.loadout.primary === weaponId || (w.slot === 'sidearm' && e.loadout.sidearm === weaponId)) return false;

    const ammo = { ...e.loadout.ammo };
    ammo[weaponId] = { mag: w.magazine, reserve: w.reserve };
    const loadout = { ...e.loadout, ammo, current: weaponId };
    if (w.slot === 'primary') loadout.primary = weaponId;
    else loadout.sidearm = weaponId;

    get().patchEntity(id, {
      credits: s.practice ? 99000 : e.credits - w.price,
      loadout,
      stats: { ...e.stats, moneySpent: e.stats.moneySpent + w.price },
    });
    if (id === s.playerId) get().pushEvent({ type: 'sfx', sound: 'ui_buy' });
    return true;
  },

  buyArmor: (id, tier) => {
    const s = get();
    const e = s.entities[id];
    if (!e) return false;
    const price = tier === 'heavy' ? 1000 : 400;
    if (e.loadout.armor === tier) return false;
    if (!get().canBuy(id, price)) return false;
    get().patchEntity(id, {
      credits: s.practice ? 99000 : e.credits - price,
      loadout: { ...e.loadout, armor: tier },
      stats: { ...e.stats, moneySpent: e.stats.moneySpent + price },
    });
    if (id === s.playerId) get().pushEvent({ type: 'sfx', sound: 'ui_buy' });
    return true;
  },

  buyUtility: (id, utilId) => {
    const s = get();
    const e = s.entities[id];
    const u = UTILITY[utilId];
    if (!e || !u) return false;
    const have = e.loadout.utility[utilId] || 0;
    if (have >= u.maxCount) return false;
    if (!get().canBuy(id, u.price)) return false;
    get().patchEntity(id, {
      credits: s.practice ? 99000 : e.credits - u.price,
      loadout: { ...e.loadout, utility: { ...e.loadout.utility, [utilId]: have + 1 } },
      stats: { ...e.stats, moneySpent: e.stats.moneySpent + u.price },
    });
    if (id === s.playerId) get().pushEvent({ type: 'sfx', sound: 'ui_buy' });
    return true;
  },

  consumeUtility: (id, utilId) => {
    const e = get().entities[id];
    if (!e) return false;
    const have = e.loadout.utility[utilId] || 0;
    if (have <= 0) return false;
    get().patchEntity(id, {
      loadout: { ...e.loadout, utility: { ...e.loadout.utility, [utilId]: have - 1 } },
      stats: { ...e.stats, utilityThrown: e.stats.utilityThrown + 1 },
    });
    return true;
  },

  setAmmo: (id, weaponId, mag, reserve) => {
    const e = get().entities[id];
    if (!e) return;
    const ammo = { ...e.loadout.ammo, [weaponId]: { mag, reserve } };
    get().patchEntity(id, { loadout: { ...e.loadout, ammo } });
  },

  switchWeapon: (id, weaponId) => {
    const e = get().entities[id];
    if (!e) return;
    if (e.loadout.current === weaponId) return;
    if (weaponId !== e.loadout.primary && weaponId !== e.loadout.sidearm) return;
    get().patchEntity(id, { loadout: { ...e.loadout, current: weaponId } });
  },

  registerShot: (id) => {
    const e = get().entities[id];
    if (!e) return;
    get().patchEntity(id, { stats: { ...e.stats, shotsFired: e.stats.shotsFired + 1 } });
  },

  heal: (id, amount) => {
    const e = get().entities[id];
    if (!e || !e.alive) return;
    get().patchEntity(id, { hp: Math.min(COMBAT.maxHP, e.hp + amount) });
  },

  blind: (id, duration) => {
    const e = get().entities[id];
    if (!e || !e.alive) return;
    const now = Date.now() / 1000;
    get().patchEntity(id, {
      blindUntil: Math.max(e.blindUntil, now + duration),
      deafUntil: Math.max(e.deafUntil, now + duration * 0.85),
    });
  },

  // ---------------------------------------------------------------- UI plumbing
  toggleBuyMenu: (v) => set((s) => ({ buyMenuOpen: v ?? !s.buyMenuOpen })),
  toggleScoreboard: (v) => set((s) => ({ scoreboardOpen: v ?? !s.scoreboardOpen })),

  addKillfeed: (entry) => set((s) => ({
    killfeed: [{ ...entry, time: Date.now(), key: uid() }, ...s.killfeed].slice(0, 6),
  })),

  addHitmarker: (kind, killed) => set((s) => ({
    hitmarkers: [...s.hitmarkers.slice(-4), { kind, killed, time: Date.now(), key: uid() }],
  })),

  /** Renderer-facing event bus (VFX/SFX intents). Drained each frame. */
  pushEvent: (ev) => {
    const s = get();
    s.events.push({ ...ev, key: uid(), at: performance.now() });
    if (s.events.length > 128) s.events.splice(0, s.events.length - 128);
  },
  drainEvents: () => {
    const s = get();
    if (!s.events.length) return [];
    const out = s.events.slice();
    s.events.length = 0;
    return out;
  },

  // ---------------------------------------------------------------- selectors
  getPlayer: () => get().entities[get().playerId],
  teamOf: (team) => get().order.map((id) => get().entities[id]).filter((e) => e.team === team),
  isMatchPoint: () => {
    const s = get();
    return s.score.BLUE >= MATCH.matchPointAt || s.score.RED >= MATCH.matchPointAt;
  },
}));

export { PHASE, TEAM, DIFFICULTY };
