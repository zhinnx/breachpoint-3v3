/**
 * BREACHPOINT — Scoreboard, pause menu, post-match summary (PRD §14).
 */
import React, { useMemo, useEffect } from 'react';
import { useGame } from '../game/store.js';
import { TEAM_COLOR, MATCH } from '../game/config.js';
import { getWeapon } from '../game/weapons.js';
import * as Audio from '../game/audio.js';

const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');
const mvpScore = (e) => e.stats.kills * 100 + e.stats.assists * 50 + e.stats.damage * 0.5;

function StatsTable({ rows, playerId, compact }) {
  return (
    <table className={`stats-table ${compact ? 'compact' : ''}`}>
      <thead>
        <tr>
          <th className="col-name">OPERATOR</th>
          <th>K</th>
          <th>D</th>
          <th>A</th>
          <th>DMG</th>
          <th>HS%</th>
          <th>ACC</th>
          <th>SCORE</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((e) => (
          <tr key={e.id} className={`${e.id === playerId ? 'me' : ''} ${e.alive ? '' : 'dead'}`}>
            <td className="col-name">
              <span className="tag" style={{ background: TEAM_COLOR[e.team] }} />
              {e.name}
              {e.isPlayer && <em> (YOU)</em>}
            </td>
            <td>{e.stats.kills}</td>
            <td>{e.stats.deaths}</td>
            <td>{e.stats.assists}</td>
            <td>{Math.round(e.stats.damage)}</td>
            <td>{pct(e.stats.headshots, e.stats.shotsHit)}</td>
            <td>{pct(e.stats.shotsHit, e.stats.shotsFired)}</td>
            <td className="col-score">{Math.round(mvpScore(e))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Scoreboard() {
  const openState = useGame((s) => s.scoreboardOpen);
  const order = useGame((s) => s.order);
  const entities = useGame((s) => s.entities);
  const playerTeam = useGame((s) => s.playerTeam);
  const playerId = useGame((s) => s.playerId);
  const score = useGame((s) => s.score);
  const round = useGame((s) => s.round);

  if (!openState) return null;

  const all = order.map((id) => entities[id]);
  const mates = all.filter((e) => e.team === playerTeam).sort((a, b) => mvpScore(b) - mvpScore(a));
  const foes = all.filter((e) => e.team !== playerTeam).sort((a, b) => mvpScore(b) - mvpScore(a));
  const enemyTeam = playerTeam === 'BLUE' ? 'RED' : 'BLUE';

  return (
    <div className="scoreboard">
      <div className="sb-head">
        <span className="sb-map">STEELFALL</span>
        <span className="sb-score">
          <b style={{ color: TEAM_COLOR[playerTeam] }}>{score[playerTeam]}</b>
          <span> — </span>
          <b style={{ color: TEAM_COLOR[enemyTeam] }}>{score[enemyTeam]}</b>
        </span>
        <span className="sb-round">ROUND {round} / {MATCH.maxRounds}</span>
      </div>
      <div className="sb-section" style={{ '--c': TEAM_COLOR[playerTeam] }}>
        <h3>YOUR TEAM</h3>
        <StatsTable rows={mates} playerId={playerId} />
      </div>
      <div className="sb-section" style={{ '--c': TEAM_COLOR[enemyTeam] }}>
        <h3>ENEMY TEAM</h3>
        <StatsTable rows={foes} playerId={playerId} />
      </div>
      <div className="sb-foot">HOLD [TAB]</div>
    </div>
  );
}

export function PauseMenu({ onResume }) {
  const paused = useGame((s) => s.paused);
  const setPaused = useGame((s) => s.setPaused);
  const returnToLobby = useGame((s) => s.returnToLobby);
  const settings = useGame((s) => s.settings);
  const setSetting = useGame((s) => s.setSetting);

  useEffect(() => {
    Audio.setVolumes(settings);
  }, [settings.masterVolume, settings.sfxVolume, settings.musicVolume]);

  if (!paused) return null;

  return (
    <div className="pause-menu">
      <div className="pm-card">
        <h2>PAUSED</h2>
        <div className="pm-quick">
          <label>SENSITIVITY <b>{settings.sensitivity.toFixed(2)}</b>
            <input type="range" min="0.15" max="3" step="0.05" value={settings.sensitivity}
              onChange={(e) => setSetting('sensitivity', parseFloat(e.target.value))} />
          </label>
          <label>FOV <b>{settings.fov}°</b>
            <input type="range" min="65" max="110" step="1" value={settings.fov}
              onChange={(e) => setSetting('fov', parseInt(e.target.value, 10))} />
          </label>
          <label>MASTER VOLUME <b>{Math.round(settings.masterVolume * 100)}%</b>
            <input type="range" min="0" max="1" step="0.05" value={settings.masterVolume}
              onChange={(e) => setSetting('masterVolume', parseFloat(e.target.value))} />
          </label>
          <label>QUALITY
            <div className="seg">
              {['low', 'medium', 'high'].map((q) => (
                <button key={q} className={settings.quality === q ? 'on' : ''}
                  onClick={() => setSetting('quality', q)}>{q.toUpperCase()}</button>
              ))}
            </div>
          </label>
        </div>
        <div className="pm-actions">
          <button className="pm-primary" onClick={() => { setPaused(false); onResume?.(); Audio.playUI('ui_click'); }}>
            RESUME
          </button>
          <button className="pm-secondary" onClick={() => { Audio.playUI('ui_click'); Audio.stopAmbient(); returnToLobby(); }}>
            ABANDON MATCH
          </button>
        </div>
        <div className="pm-hint">Click the screen to re-lock the mouse after resuming.</div>
      </div>
    </div>
  );
}

export function PostMatch() {
  const screen = useGame((s) => s.screen);
  const order = useGame((s) => s.order);
  const entities = useGame((s) => s.entities);
  const score = useGame((s) => s.score);
  const playerTeam = useGame((s) => s.playerTeam);
  const playerId = useGame((s) => s.playerId);
  const matchWinner = useGame((s) => s.matchWinner);
  const mvpId = useGame((s) => s.mvpId);
  const mode = useGame((s) => s.mode);
  const startMatch = useGame((s) => s.startMatch);
  const returnToLobby = useGame((s) => s.returnToLobby);

  useEffect(() => {
    if (screen === 'summary') Audio.stopAmbient();
  }, [screen]);

  if (screen !== 'summary') return null;

  const all = order.map((id) => entities[id]);
  const mates = all.filter((e) => e.team === playerTeam).sort((a, b) => mvpScore(b) - mvpScore(a));
  const foes = all.filter((e) => e.team !== playerTeam).sort((a, b) => mvpScore(b) - mvpScore(a));
  const enemyTeam = playerTeam === 'BLUE' ? 'RED' : 'BLUE';
  const mvp = mvpId ? entities[mvpId] : null;
  const won = matchWinner === playerTeam;
  const me = entities[playerId];

  const clutchPlayers = all.filter((e) => e.stats.clutches > 0);

  return (
    <div className={`postmatch ${won ? 'win' : matchWinner ? 'lose' : 'draw'}`}>
      <div className="pm-scan" />
      <div className="pmx-head">
        <div className="pmx-result">
          {matchWinner ? (won ? 'VICTORY' : 'DEFEAT') : 'DRAW'}
        </div>
        <div className="pmx-score">
          <span style={{ color: TEAM_COLOR[playerTeam] }}>{score[playerTeam]}</span>
          <em>—</em>
          <span style={{ color: TEAM_COLOR[enemyTeam] }}>{score[enemyTeam]}</span>
        </div>
        <div className="pmx-mode">{mode.name} · {mode.tag} · STEELFALL</div>
      </div>

      {mvp && (
        <div className="mvp-card">
          <div className="mvp-badge">MVP</div>
          <div className="mvp-name" style={{ color: TEAM_COLOR[mvp.team] }}>{mvp.name}</div>
          <div className="mvp-line">
            <span>{mvp.stats.kills} KILLS</span>
            <span>{mvp.stats.assists} ASSISTS</span>
            <span>{Math.round(mvp.stats.damage)} DMG</span>
            <span>{Math.round(mvpScore(mvp))} SCORE</span>
          </div>
        </div>
      )}

      {clutchPlayers.length > 0 && (
        <div className="clutch-strip">
          {clutchPlayers.map((c) => (
            <div key={c.id} className="clutch-item">
              <b style={{ color: TEAM_COLOR[c.team] }}>{c.name}</b>
              <span>CLUTCH ×{c.stats.clutches}</span>
            </div>
          ))}
        </div>
      )}

      <div className="pmx-tables">
        <div className="pmx-team" style={{ '--c': TEAM_COLOR[playerTeam] }}>
          <h3>YOUR TEAM</h3>
          <StatsTable rows={mates} playerId={playerId} />
        </div>
        <div className="pmx-team" style={{ '--c': TEAM_COLOR[enemyTeam] }}>
          <h3>ENEMY TEAM</h3>
          <StatsTable rows={foes} playerId={playerId} />
        </div>
      </div>

      {me && (
        <div className="personal-recap">
          <h4>YOUR PERFORMANCE</h4>
          <div className="pr-grid">
            <Recap l="KILLS" v={me.stats.kills} />
            <Recap l="DEATHS" v={me.stats.deaths} />
            <Recap l="ASSISTS" v={me.stats.assists} />
            <Recap l="K/D" v={(me.stats.kills / Math.max(1, me.stats.deaths)).toFixed(2)} />
            <Recap l="DAMAGE" v={Math.round(me.stats.damage)} />
            <Recap l="HEADSHOT %" v={pct(me.stats.headshots, me.stats.shotsHit)} />
            <Recap l="ACCURACY" v={pct(me.stats.shotsHit, me.stats.shotsFired)} />
            <Recap l="ROUNDS WON" v={me.stats.roundsWon} />
            <Recap l="CREDITS SPENT" v={me.stats.moneySpent.toLocaleString()} />
            <Recap l="UTILITY USED" v={me.stats.utilityThrown} />
          </div>
        </div>
      )}

      <div className="pmx-actions">
        <button className="pmx-primary" onClick={() => { Audio.playUI('ui_click'); startMatch(mode.id); }}>
          PLAY AGAIN
        </button>
        <button className="pmx-secondary" onClick={() => { Audio.playUI('ui_click'); returnToLobby(); }}>
          BACK TO LOBBY
        </button>
      </div>
    </div>
  );
}

function Recap({ l, v }) {
  return (
    <div className="pr-item">
      <span className="pr-label">{l}</span>
      <span className="pr-val">{v}</span>
    </div>
  );
}

export default { Scoreboard, PauseMenu, PostMatch };
