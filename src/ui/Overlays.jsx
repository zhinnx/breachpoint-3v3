/**
 * BREACHPOINT — Scoreboard, pause, after-action report.
 * PRD §3.5: the summary reads as a military after-action report, and the MVP
 * badge is an angular hex plate rather than a glossy round medal.
 */
import React, { useEffect } from 'react';
import { useGame } from '../game/store.js';
import { MATCH } from '../game/config.js';
import { useDevice } from './useDevice.js';
import * as Audio from '../game/audio.js';

// Fill ramp for plates/pips; text ramp for type on dark (contrast-verified).
const TEAM_VAR = { BLUE: 'var(--steel-text)', RED: 'var(--oxide-text)' };
const TEAM_FILL = { BLUE: 'var(--steel)', RED: 'var(--oxide)' };
const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '--');
const mvpScore = (e) => e.stats.kills * 100 + e.stats.assists * 50 + e.stats.damage * 0.5;

function StatsTable({ rows, playerId }) {
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>OPERATOR</th>
          <th>K</th>
          <th>D</th>
          <th>A</th>
          <th>DMG</th>
          <th>HS</th>
          <th>SCORE</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((e) => (
          <tr key={e.id} className={`${e.id === playerId ? 'me' : ''} ${e.alive ? '' : 'down'}`}>
            <td>
              <span className="tag" style={{ background: TEAM_VAR[e.team] }} />
              {e.name}
              {e.isPlayer && <em>YOU</em>}
            </td>
            <td>{e.stats.kills}</td>
            <td>{e.stats.deaths}</td>
            <td>{e.stats.assists}</td>
            <td>{Math.round(e.stats.damage)}</td>
            <td>{pct(e.stats.headshots, e.stats.shotsHit)}</td>
            <td className="sc">{Math.round(mvpScore(e))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Scoreboard() {
  const open = useGame((s) => s.scoreboardOpen);
  const order = useGame((s) => s.order);
  const entities = useGame((s) => s.entities);
  const playerTeam = useGame((s) => s.playerTeam);
  const playerId = useGame((s) => s.playerId);
  const score = useGame((s) => s.score);
  const round = useGame((s) => s.round);

  if (!open) return null;
  const all = order.map((id) => entities[id]).filter(Boolean);
  const mates = all.filter((e) => e.team === playerTeam).sort((a, b) => mvpScore(b) - mvpScore(a));
  const foes = all.filter((e) => e.team !== playerTeam).sort((a, b) => mvpScore(b) - mvpScore(a));
  const enemy = playerTeam === 'BLUE' ? 'RED' : 'BLUE';

  return (
    <div className="scoreboard">
      <div className="sb-head">
        <span className="sb-map">STEELFALL</span>
        <span className="sb-sc num">
          <b style={{ color: TEAM_VAR[playerTeam] }}>{score[playerTeam]}</b>
          <span style={{ color: 'var(--gun-hi)' }}> : </span>
          <b style={{ color: TEAM_VAR[enemy] }}>{score[enemy]}</b>
        </span>
        <span className="label">ROUND {round} / {MATCH.maxRounds}</span>
      </div>
      <div className="sb-grp" style={{ '--c': TEAM_VAR[playerTeam] }}>
        <h3>FRIENDLY</h3>
        <StatsTable rows={mates} playerId={playerId} />
      </div>
      <div className="sb-grp" style={{ '--c': TEAM_VAR[enemy] }}>
        <h3>HOSTILE</h3>
        <StatsTable rows={foes} playerId={playerId} />
      </div>
    </div>
  );
}

export function PauseMenu({ onResume }) {
  const paused = useGame((s) => s.paused);
  const setPaused = useGame((s) => s.setPaused);
  const returnToLobby = useGame((s) => s.returnToLobby);
  const settings = useGame((s) => s.settings);
  const setSetting = useGame((s) => s.setSetting);
  const dev = useDevice();

  useEffect(() => { Audio.setVolumes(settings); },
    [settings.masterVolume, settings.sfxVolume, settings.musicVolume]);

  if (!paused) return null;

  return (
    <div className="pause">
      <div className="pause-card">
        <h2>PAUSED</h2>
        <div className="pause-rows">
          <label>
            SENSITIVITY <b className="num">{settings.sensitivity.toFixed(2)}</b>
            <input type="range" min="0.15" max="3" step="0.05" value={settings.sensitivity}
              onChange={(e) => setSetting('sensitivity', parseFloat(e.target.value))} />
          </label>
          <label>
            FIELD OF VIEW <b className="num">{settings.fov}</b>
            <input type="range" min="65" max="110" step="1" value={settings.fov}
              onChange={(e) => setSetting('fov', parseInt(e.target.value, 10))} />
          </label>
          <label>
            MASTER VOLUME <b className="num">{Math.round(settings.masterVolume * 100)}%</b>
            <input type="range" min="0" max="1" step="0.05" value={settings.masterVolume}
              onChange={(e) => setSetting('masterVolume', parseFloat(e.target.value))} />
          </label>
          <label>
            GRAPHICS
            <div className="rocker">
              {[{ v: 'low', l: 'LOW' }, { v: 'medium', l: 'MID' }, { v: 'high', l: 'HIGH' }].map((o) => (
                <button key={o.v} type="button" className={settings.quality === o.v ? 'on' : ''}
                  onClick={() => setSetting('quality', o.v)}>{o.l}</button>
              ))}
            </div>
          </label>
        </div>
        <div className="pause-acts">
          <button
            type="button"
            className="btn btn-hot"
            onClick={() => { setPaused(false); onResume?.(); Audio.playUI('ui_click'); }}
          >RESUME</button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => { Audio.playUI('ui_click'); Audio.stopAmbient(); returnToLobby(); }}
          >ABANDON MATCH</button>
        </div>
        {!dev.touch && <div className="pause-hint">CLICK THE SCREEN TO RECAPTURE THE MOUSE</div>}
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

  useEffect(() => { if (screen === 'summary') Audio.stopAmbient(); }, [screen]);
  if (screen !== 'summary') return null;

  const all = order.map((id) => entities[id]).filter(Boolean);
  const mates = all.filter((e) => e.team === playerTeam).sort((a, b) => mvpScore(b) - mvpScore(a));
  const foes = all.filter((e) => e.team !== playerTeam).sort((a, b) => mvpScore(b) - mvpScore(a));
  const enemy = playerTeam === 'BLUE' ? 'RED' : 'BLUE';
  const mvp = mvpId ? entities[mvpId] : null;
  const won = matchWinner === playerTeam;
  const me = entities[playerId];
  const clutches = all.filter((e) => e.stats.clutches > 0);

  const Recap = ({ l, v }) => (
    <div className="recap-item"><span>{l}</span><b className="num">{v}</b></div>
  );

  return (
    <div className={`summary ${won ? 'win' : matchWinner ? 'lose' : ''}`}>
      <div className="sum-head">
        <div className="sum-kicker">AFTER ACTION REPORT</div>
        <div className="sum-result">{matchWinner ? (won ? 'VICTORY' : 'DEFEAT') : 'DRAW'}</div>
        <div className="sum-score num">
          <span style={{ color: TEAM_VAR[playerTeam] }}>{score[playerTeam]}</span>
          <em>:</em>
          <span style={{ color: TEAM_VAR[enemy] }}>{score[enemy]}</span>
        </div>
        <div className="sum-mode">{mode.name} · {mode.tag} · STEELFALL</div>
      </div>

      {mvp && (
        <div className="mvp">
          <span className="mvp-hex">MVP</span>
          <span>
            <span className="mvp-name" style={{ color: TEAM_VAR[mvp.team] }}>{mvp.name}</span>
            <span className="mvp-line">
              <span>{mvp.stats.kills} KILLS</span>
              <span>{mvp.stats.assists} ASSISTS</span>
              <span>{Math.round(mvp.stats.damage)} DAMAGE</span>
              <span>{Math.round(mvpScore(mvp))} SCORE</span>
            </span>
          </span>
        </div>
      )}

      {clutches.length > 0 && (
        <div className="clutch">
          {clutches.map((c) => (
            <span key={c.id} className="clutch-item">
              <b style={{ color: TEAM_VAR[c.team] }}>{c.name}</b>
              <span>CLUTCH x{c.stats.clutches}</span>
            </span>
          ))}
        </div>
      )}

      <div className="sum-tables">
        <div className="sum-team" style={{ '--c': TEAM_VAR[playerTeam] }}>
          <h3>FRIENDLY</h3>
          <StatsTable rows={mates} playerId={playerId} />
        </div>
        <div className="sum-team" style={{ '--c': TEAM_VAR[enemy] }}>
          <h3>HOSTILE</h3>
          <StatsTable rows={foes} playerId={playerId} />
        </div>
      </div>

      {me && (
        <div className="recap">
          <h4>YOUR RECORD</h4>
          <div className="recap-grid">
            <Recap l="KILLS" v={me.stats.kills} />
            <Recap l="DEATHS" v={me.stats.deaths} />
            <Recap l="ASSISTS" v={me.stats.assists} />
            <Recap l="K/D" v={(me.stats.kills / Math.max(1, me.stats.deaths)).toFixed(2)} />
            <Recap l="DAMAGE" v={Math.round(me.stats.damage)} />
            <Recap l="HEADSHOT" v={pct(me.stats.headshots, me.stats.shotsHit)} />
            <Recap l="ACCURACY" v={pct(me.stats.shotsHit, me.stats.shotsFired)} />
            <Recap l="ROUNDS WON" v={me.stats.roundsWon} />
          </div>
        </div>
      )}

      <div className="sum-acts">
        <button type="button" className="btn btn-hot"
          onClick={() => { Audio.playUI('ui_click'); startMatch(mode.id); }}>REDEPLOY</button>
        <button type="button" className="btn btn-ghost"
          onClick={() => { Audio.playUI('ui_click'); returnToLobby(); }}>LOBBY</button>
      </div>
    </div>
  );
}

export default { Scoreboard, PauseMenu, PostMatch };
