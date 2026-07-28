/**
 * BREACHPOINT — Lobby (breachpoint-ui-ux-prd.md §3.1).
 *
 * Chrome is pinned to the screen edges over the live 3D scene. Nothing is
 * collected into a centred card, because that is the landing-page pattern the
 * PRD explicitly rejects. Wordmark left, callsign and credits on the top rail,
 * mode tabs bottom-left, amber PLAY chamfer bottom-right.
 */
import React, { useState, useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGame } from '../game/store.js';
import { GAME_MODES, ECONOMY } from '../game/config.js';
import { WEAPON_LIST, getWeapon } from '../game/weapons.js';
import { WeaponModel } from '../render/WeaponModels.jsx';
import { useDevice } from './useDevice.js';
import * as Audio from '../game/audio.js';

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
const IcoLocker = () => (
  <svg viewBox="0 0 24 24" {...S}><path d="M4 3h16v18H4zM12 3v18M7 8h2M15 8h2" /></svg>
);
const IcoGear = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
    <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3H9.8l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4.4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.06-.4.1-.8.1-1.2Z" />
  </svg>
);

/* ------------------------------------------------------------- showcase */
function SpinWeapon({ weaponId, speed = 0.24 }) {
  const ref = useRef();
  const t = useRef(0);
  useFrame((state, dt) => {
    if (!ref.current) return;
    t.current += dt * speed;
    ref.current.rotation.y = t.current;
    const e = state.clock.elapsedTime;
    ref.current.rotation.x = Math.sin(e * 0.33) * 0.05 - 0.06;
    ref.current.position.y = Math.sin(e * 0.6) * 0.014;
  });
  const spec = getWeapon(weaponId);
  return (
    <group ref={ref} scale={2.5 / Math.max(0.24, spec.visual.length)}>
      <WeaponModel weaponId={weaponId} ads={0} />
    </group>
  );
}

function ShowcaseScene({ weaponId }) {
  return (
    <>
      <color attach="background" args={['#161617']} />
      <fog attach="fog" args={['#161617', 7, 19]} />
      <ambientLight intensity={0.85} color="#9aa2ad" />
      <directionalLight position={[3, 4, 3]} intensity={3.2} color="#ffd9b0" castShadow />
      <directionalLight position={[-4, 1.5, -2]} intensity={1.5} color="#5c7fa8" />
      <pointLight position={[0, -1.6, 2]} intensity={26} distance={11} decay={1.7} color="#ff6b1a" />
      <spotLight position={[0, 5, 1]} angle={0.55} penumbra={1} intensity={40} color="#e8e4d8" />
      <SpinWeapon weaponId={weaponId} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.32, 0]} receiveShadow>
        <circleGeometry args={[5, 40]} />
        <meshStandardMaterial color="#1c1c1e" roughness={0.42} metalness={0.6} />
      </mesh>
      <gridHelper args={[18, 30, '#3a3d42', '#242528']} position={[0, -1.31, 0]} />
    </>
  );
}

/* --------------------------------------------------------------- locker */
function StatBar({ label, value, max, display }) {
  const pct = Math.max(4, Math.min(100, (value / max) * 100));
  return (
    <div className="statbar">
      <span className="sb-l">{label}</span>
      <span className="sb-track"><i style={{ width: `${pct}%` }} /></span>
      <span className="sb-v num">{display ?? value}</span>
    </div>
  );
}

function Locker({ onClose }) {
  const [sel, setSel] = useState('vanguard7');
  const w = getWeapon(sel);
  return (
    <div className="scrim" onPointerDown={onClose}>
      <div className="sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 className="sheet-title">LOCKER</h2>
          <button type="button" className="close-btn" onClick={onClose}>CLOSE</button>
        </div>
        <div className="sheet-body">
          <div className="lk-list">
            {WEAPON_LIST.map((it) => (
              <button
                key={it.id}
                type="button"
                className={`lk-item ${sel === it.id ? 'on' : ''}`}
                onClick={() => { setSel(it.id); Audio.playUI('ui_click'); }}
              >
                <span className="lk-name">{it.name}</span>
                <span className="lk-cat">{it.category}</span>
                <span className="lk-price num">{it.price === 0 ? 'FREE' : it.price.toLocaleString('en-US')}</span>
              </button>
            ))}
          </div>
          <div className="lk-view">
            <div className="lk-canvas">
              <Canvas camera={{ position: [0, 0.3, 3.6], fov: 34 }} dpr={[1, 1.6]}>
                <ambientLight intensity={0.8} color="#98a2ae" />
                <directionalLight position={[3, 3, 3]} intensity={3} color="#ffe0bd" />
                <directionalLight position={[-3, 1, -2]} intensity={1.4} color="#5c7fa8" />
                <SpinWeapon weaponId={sel} speed={0.4} />
              </Canvas>
            </div>
            <div className="lk-stats">
              <h3>{w.name}</h3>
              <div className="lk-sub">{w.category} · {w.fireMode.toUpperCase()}</div>
              <StatBar label="DAMAGE" value={w.damage} max={100} />
              <StatBar label="FIRE RATE" value={w.rpm} max={900} />
              <StatBar label="MAGAZINE" value={w.magazine} max={75} />
              <StatBar label="RELOAD" value={5 - w.reloadTime} max={5} display={`${w.reloadTime}s`} />
              <StatBar label="RANGE" value={w.farRange} max={120} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- settings */
function Settings({ onClose }) {
  const settings = useGame((s) => s.settings);
  const setSetting = useGame((s) => s.setSetting);
  const dev = useDevice();

  useEffect(() => { Audio.setVolumes(settings); },
    [settings.masterVolume, settings.sfxVolume, settings.musicVolume]);

  const Row = ({ label, children }) => (
    <div className="set-row"><span>{label}</span><div>{children}</div></div>
  );
  const Rocker = ({ opts, value, onPick }) => (
    <div className="rocker">
      {opts.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          className={value === o.v ? 'on' : ''}
          onClick={() => { onPick(o.v); Audio.playUI('ui_click'); }}
        >{o.l}</button>
      ))}
    </div>
  );

  return (
    <div className="scrim" onPointerDown={onClose}>
      <div className="sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 className="sheet-title">SETTINGS</h2>
          <button type="button" className="close-btn" onClick={onClose}>CLOSE</button>
        </div>
        <div className="sheet-body" style={{ flexDirection: 'column' }}>
          <div className="set-body">
            <Row label={`SENSITIVITY · ${settings.sensitivity.toFixed(2)}`}>
              <input type="range" min="0.15" max="3" step="0.05" value={settings.sensitivity}
                onChange={(e) => setSetting('sensitivity', parseFloat(e.target.value))} />
            </Row>
            <Row label={`FIELD OF VIEW · ${settings.fov}`}>
              <input type="range" min="65" max="110" step="1" value={settings.fov}
                onChange={(e) => setSetting('fov', parseInt(e.target.value, 10))} />
            </Row>
            <Row label={`MASTER VOLUME · ${Math.round(settings.masterVolume * 100)}%`}>
              <input type="range" min="0" max="1" step="0.05" value={settings.masterVolume}
                onChange={(e) => setSetting('masterVolume', parseFloat(e.target.value))} />
            </Row>
            <Row label={`SFX VOLUME · ${Math.round(settings.sfxVolume * 100)}%`}>
              <input type="range" min="0" max="1" step="0.05" value={settings.sfxVolume}
                onChange={(e) => setSetting('sfxVolume', parseFloat(e.target.value))} />
            </Row>
            <Row label={`UI VOLUME · ${Math.round(settings.musicVolume * 100)}%`}>
              <input type="range" min="0" max="1" step="0.05" value={settings.musicVolume}
                onChange={(e) => setSetting('musicVolume', parseFloat(e.target.value))} />
            </Row>
            <Row label="GRAPHICS">
              <Rocker
                opts={[{ v: 'low', l: 'LOW' }, { v: 'medium', l: 'MID' }, { v: 'high', l: 'HIGH' }]}
                value={settings.quality} onPick={(v) => setSetting('quality', v)}
              />
            </Row>
            {!dev.touch && (
              <Row label="AIM MODE">
                <Rocker
                  opts={[{ v: false, l: 'HOLD' }, { v: true, l: 'TOGGLE' }]}
                  value={settings.adsToggle} onPick={(v) => setSetting('adsToggle', v)}
                />
              </Row>
            )}
            <Row label="INVERT Y">
              <Rocker
                opts={[{ v: false, l: 'OFF' }, { v: true, l: 'ON' }]}
                value={settings.invertY} onPick={(v) => setSetting('invertY', v)}
              />
            </Row>
            <Row label="FPS COUNTER">
              <Rocker
                opts={[{ v: false, l: 'OFF' }, { v: true, l: 'ON' }]}
                value={settings.showFps} onPick={(v) => setSetting('showFps', v)}
              />
            </Row>
            <Row label="RETICLE">
              <div className="swatches">
                {['#39ff88', '#e8e4d8', '#ff6b1a', '#3e7cb8', '#d9a521'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Reticle ${c}`}
                    style={{ background: c }}
                    className={settings.crosshairColor === c ? 'sw on' : 'sw'}
                    onClick={() => setSetting('crosshairColor', c)}
                  />
                ))}
              </div>
            </Row>
          </div>
          {!dev.touch && (
            <div className="keys">
              <h4 className="label">CONTROLS</h4>
              <div className="key-grid">
                <span><kbd>WASD</kbd> Move</span>
                <span><kbd>SHIFT</kbd> Sprint</span>
                <span><kbd>CTRL</kbd> Crouch</span>
                <span><kbd>SPACE</kbd> Jump</span>
                <span><kbd>LMB</kbd> Fire</span>
                <span><kbd>RMB</kbd> Aim</span>
                <span><kbd>R</kbd> Reload</span>
                <span><kbd>1 2</kbd> Weapons</span>
                <span><kbd>3 4 5</kbd> Utility</span>
                <span><kbd>F</kbd> Medkit</span>
                <span><kbd>B</kbd> Armory</span>
                <span><kbd>TAB</kbd> Scores</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- root */
export function Lobby() {
  const startMatch = useGame((s) => s.startMatch);
  const profile = useGame((s) => s.profile);
  const [modeIdx, setModeIdx] = useState(0);
  const [showLocker, setShowLocker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showcase, setShowcase] = useState('vanguard7');
  const dev = useDevice();

  useEffect(() => {
    Audio.initAudio();
    Audio.startLobbyBed();
    return () => Audio.stopLobbyBed();
  }, []);

  useEffect(() => {
    const pool = ['vanguard7', 'vantage50', 'raptor9', 'breacher12', 'falcon6', 'hailstorm'];
    const i = setInterval(() => {
      setShowcase((cur) => pool[(pool.indexOf(cur) + 1) % pool.length]);
    }, 7000);
    return () => clearInterval(i);
  }, []);

  const mode = GAME_MODES[modeIdx];
  const w = getWeapon(showcase);
  const idx = String(WEAPON_LIST.findIndex((x) => x.id === showcase) + 1).padStart(2, '0');

  const play = () => {
    Audio.resumeAudio();
    Audio.playUI('ui_click');
    Audio.stopLobbyBed();
    startMatch(mode.id);
  };

  return (
    <div className="lobby">
      <div className="lobby-3d">
        <Canvas camera={{ position: [0, 0.35, 4.6], fov: 38 }} dpr={[1, 1.7]} shadows>
          <ShowcaseScene weaponId={showcase} />
        </Canvas>
      </div>
      <div className="lobby-vig" />
      <div className="lobby-scan" />

      <div className="lobby-top">
        <div className="callsign brk">
          <span className="cs-hex">{profile.name.slice(0, 2)}</span>
          <span className="cs-meta">
            <span className="cs-name">{profile.name}</span>
            <span className="cs-rank">LEVEL {profile.level} · {profile.xp} XP</span>
          </span>
        </div>
        <div className="lobby-tr">
          <div className="credits-chip">
            <span className="label">CREDITS</span>
            <span className="cc-val num">{ECONOMY.startingCredits.toLocaleString('en-US')}</span>
          </div>
          <button type="button" className="icon-btn" aria-label="Locker"
            onClick={() => { setShowLocker(true); Audio.playUI('ui_click'); }}><IcoLocker /></button>
          <button type="button" className="icon-btn" aria-label="Settings"
            onClick={() => { setShowSettings(true); Audio.playUI('ui_click'); }}><IcoGear /></button>
        </div>
      </div>

      <div className="lobby-mark">
        <h1 className="lm-title">BREACH<span>POINT</span></h1>
        <div className="lm-rule" />
        <div className="lm-sub">TACTICAL 3V3 · ELIMINATION</div>
      </div>

      {!dev.narrow && (
        <div className="showcase brk">
          <div className="sc-idx">WPN {idx} / {String(WEAPON_LIST.length).padStart(2, '0')}</div>
          <div className="sc-name">{w.name}</div>
          <div className="sc-cat">{w.category}</div>
          <div className="sc-stats">
            <div className="sc-stat"><span>DAMAGE</span><i style={{ '--v': `${w.damage}%` }} /></div>
            <div className="sc-stat"><span>RATE</span><i style={{ '--v': `${(w.rpm / 900) * 100}%` }} /></div>
            <div className="sc-stat"><span>MAG</span><i style={{ '--v': `${(w.magazine / 75) * 100}%` }} /></div>
            <div className="sc-stat"><span>RANGE</span><i style={{ '--v': `${(w.farRange / 120) * 100}%` }} /></div>
          </div>
        </div>
      )}

      <div className="mode-rail">
        {GAME_MODES.map((m, i) => (
          <button
            key={m.id}
            type="button"
            className={`mode-tab ${i === modeIdx ? 'on' : ''}`}
            onClick={() => { setModeIdx(i); Audio.playUI('ui_click'); }}
          >
            <span className="mt-tag">{m.tag}</span>
            <span className="mt-name">{m.name}</span>
            <span className="mt-blurb">{m.blurb}</span>
          </button>
        ))}
      </div>

      <button type="button" className="play-btn" onClick={play}>
        <span className="pb-label">PLAY</span>
        <span className="pb-sub">{mode.tag} · {mode.map.toUpperCase()}</span>
      </button>

      <div className="lobby-foot">
        <span>OFFLINE READY</span>
        <span>FIRST TO 4 ROUNDS</span>
      </div>

      {showLocker && <Locker onClose={() => setShowLocker(false)} />}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default Lobby;
