/**
 * BREACHPOINT — Lobby / main menu (PRD §3).
 *
 *  - big PLAY button anchored bottom-right (primary CTA)
 *  - horizontally scrolling mode selector above it
 *  - 3D weapon showcase background, slowly rotating, click to inspect
 *  - profile icon top-left, credits display, settings, Loadout/Locker
 */
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGame } from '../game/store.js';
import { GAME_MODES, ECONOMY } from '../game/config.js';
import { WEAPON_LIST, WEAPONS, UTILITY_LIST, getWeapon } from '../game/weapons.js';
import { WeaponModel } from '../render/WeaponModels.jsx';
import { getEnvMap } from '../render/materials.js';
import * as Audio from '../game/audio.js';

// ------------------------------------------------------------------ 3D showcase
function ShowcaseWeapon({ weaponId, spin, onClick, inspect }) {
  const ref = useRef();
  const target = useRef(0);
  useFrame((state, dt) => {
    if (!ref.current) return;
    if (inspect) {
      target.current += dt * 0.32;
    } else {
      target.current += dt * (spin ? 0.22 : 0.1);
    }
    ref.current.rotation.y = target.current;
    const t = state.clock.elapsedTime;
    ref.current.position.y = Math.sin(t * 0.6) * 0.012;
    ref.current.rotation.z = Math.sin(t * 0.4) * 0.03;
    ref.current.rotation.x = Math.sin(t * 0.33) * 0.04 - 0.05;
  });
  const spec = getWeapon(weaponId);
  const scale = 2.55 / Math.max(0.24, spec.visual.length);
  return (
    <group ref={ref} onClick={onClick} scale={scale}>
      <WeaponModel weaponId={weaponId} ads={0} />
    </group>
  );
}

function ShowcaseScene({ weaponId, inspect, onClick }) {
  return (
    <>
      <color attach="background" args={['#05070c']} />
      <fog attach="fog" args={['#05070c', 6, 18]} />
      <ambientLight intensity={0.35} color="#8fa8d0" />
      <directionalLight position={[3, 4, 3]} intensity={2.6} color="#ffd9ae" castShadow />
      <directionalLight position={[-4, 1.5, -2]} intensity={1.5} color="#4d8cff" />
      <pointLight position={[0, -1.5, 2]} intensity={1.4} color="#ff7a2f" distance={9} />
      <spotLight position={[0, 5, 0]} angle={0.5} penumbra={1} intensity={2.2} color="#cfe4ff" />
      <ShowcaseWeapon weaponId={weaponId} spin inspect={inspect} onClick={onClick} />
      {/* floor reflection hint */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.3, 0]} receiveShadow>
        <circleGeometry args={[5, 40]} />
        <meshStandardMaterial color="#0a0d14" roughness={0.28} metalness={0.7} />
      </mesh>
      <gridHelper args={[16, 32, '#16324a', '#0d1a26']} position={[0, -1.29, 0]} />
    </>
  );
}

// ------------------------------------------------------------------ locker
function Locker({ onClose }) {
  const [sel, setSel] = useState('vanguard7');
  const w = getWeapon(sel);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="locker" onClick={(e) => e.stopPropagation()}>
        <div className="locker-head">
          <h2>LOCKER</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="locker-body">
          <div className="locker-list">
            {WEAPON_LIST.map((it) => (
              <button
                key={it.id}
                className={`locker-item ${sel === it.id ? 'active' : ''}`}
                onMouseEnter={() => Audio.playUI('ui_hover')}
                onClick={() => { setSel(it.id); Audio.playUI('ui_click'); }}
              >
                <span className="li-name">{it.name}</span>
                <span className="li-cat">{it.category}</span>
                <span className="li-price">{it.price === 0 ? 'FREE' : it.price.toLocaleString()}</span>
              </button>
            ))}
          </div>
          <div className="locker-preview">
            <Canvas camera={{ position: [0, 0.3, 3.6], fov: 34 }} dpr={[1, 1.6]}>
              <ambientLight intensity={0.45} color="#96b0d8" />
              <directionalLight position={[3, 3, 3]} intensity={2.4} color="#ffe0b8" />
              <directionalLight position={[-3, 1, -2]} intensity={1.3} color="#5590ff" />
              <ShowcaseWeapon weaponId={sel} spin inspect />
            </Canvas>
            <div className="locker-stats">
              <h3>{w.name}</h3>
              <div className="ls-cat">{w.category}</div>
              <StatBar label="DAMAGE" value={w.damage} max={100} />
              <StatBar label="FIRE RATE" value={w.rpm} max={900} />
              <StatBar label="MAGAZINE" value={w.magazine} max={75} />
              <StatBar label="RELOAD" value={5 - w.reloadTime} max={5} display={`${w.reloadTime}s`} />
              <StatBar label="RANGE" value={w.farRange} max={120} />
              <div className="ls-meta">
                <span>MODE: <b>{w.fireMode.toUpperCase()}</b></span>
                <span>PRICE: <b>{w.price === 0 ? 'FREE' : w.price.toLocaleString()}</b></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBar({ label, value, max, display }) {
  const pct = Math.max(3, Math.min(100, (value / max) * 100));
  return (
    <div className="statbar">
      <span className="sb-label">{label}</span>
      <div className="sb-track"><i style={{ width: `${pct}%` }} /></div>
      <span className="sb-val">{display ?? value}</span>
    </div>
  );
}

// ------------------------------------------------------------------ settings
function Settings({ onClose }) {
  const settings = useGame((s) => s.settings);
  const setSetting = useGame((s) => s.setSetting);

  useEffect(() => {
    Audio.setVolumes(settings);
  }, [settings.masterVolume, settings.sfxVolume, settings.musicVolume]);

  const Row = ({ label, children }) => (
    <div className="set-row"><span>{label}</span><div>{children}</div></div>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="locker-head">
          <h2>SETTINGS</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="set-body">
          <Row label={`SENSITIVITY — ${settings.sensitivity.toFixed(2)}`}>
            <input type="range" min="0.15" max="3" step="0.05" value={settings.sensitivity}
              onChange={(e) => setSetting('sensitivity', parseFloat(e.target.value))} />
          </Row>
          <Row label={`FIELD OF VIEW — ${settings.fov}°`}>
            <input type="range" min="65" max="110" step="1" value={settings.fov}
              onChange={(e) => setSetting('fov', parseInt(e.target.value, 10))} />
          </Row>
          <Row label={`MASTER VOLUME — ${Math.round(settings.masterVolume * 100)}%`}>
            <input type="range" min="0" max="1" step="0.05" value={settings.masterVolume}
              onChange={(e) => setSetting('masterVolume', parseFloat(e.target.value))} />
          </Row>
          <Row label={`SFX VOLUME — ${Math.round(settings.sfxVolume * 100)}%`}>
            <input type="range" min="0" max="1" step="0.05" value={settings.sfxVolume}
              onChange={(e) => setSetting('sfxVolume', parseFloat(e.target.value))} />
          </Row>
          <Row label={`MUSIC / UI — ${Math.round(settings.musicVolume * 100)}%`}>
            <input type="range" min="0" max="1" step="0.05" value={settings.musicVolume}
              onChange={(e) => setSetting('musicVolume', parseFloat(e.target.value))} />
          </Row>
          <Row label="GRAPHICS QUALITY">
            <div className="seg">
              {['low', 'medium', 'high'].map((q) => (
                <button key={q} className={settings.quality === q ? 'on' : ''}
                  onClick={() => setSetting('quality', q)}>{q.toUpperCase()}</button>
              ))}
            </div>
          </Row>
          <Row label="AIM DOWN SIGHT">
            <div className="seg">
              <button className={!settings.adsToggle ? 'on' : ''} onClick={() => setSetting('adsToggle', false)}>HOLD</button>
              <button className={settings.adsToggle ? 'on' : ''} onClick={() => setSetting('adsToggle', true)}>TOGGLE</button>
            </div>
          </Row>
          <Row label="INVERT Y AXIS">
            <div className="seg">
              <button className={!settings.invertY ? 'on' : ''} onClick={() => setSetting('invertY', false)}>OFF</button>
              <button className={settings.invertY ? 'on' : ''} onClick={() => setSetting('invertY', true)}>ON</button>
            </div>
          </Row>
          <Row label="SHOW FPS">
            <div className="seg">
              <button className={!settings.showFps ? 'on' : ''} onClick={() => setSetting('showFps', false)}>OFF</button>
              <button className={settings.showFps ? 'on' : ''} onClick={() => setSetting('showFps', true)}>ON</button>
            </div>
          </Row>
          <Row label="CROSSHAIR COLOUR">
            <div className="swatches">
              {['#39ff88', '#ffffff', '#00e5ff', '#ffd400', '#ff3b6b'].map((c) => (
                <button key={c} style={{ background: c }}
                  className={settings.crosshairColor === c ? 'sw on' : 'sw'}
                  onClick={() => setSetting('crosshairColor', c)} />
              ))}
            </div>
          </Row>
        </div>
        <div className="set-foot">
          <div className="keybinds">
            <h4>CONTROLS</h4>
            <div className="kb-grid">
              <span><kbd>W A S D</kbd> Move</span>
              <span><kbd>Shift</kbd> Sprint</span>
              <span><kbd>Ctrl</kbd> Crouch</span>
              <span><kbd>Space</kbd> Jump / Climb</span>
              <span><kbd>LMB</kbd> Fire</span>
              <span><kbd>RMB</kbd> Aim</span>
              <span><kbd>R</kbd> Reload</span>
              <span><kbd>1 / 2</kbd> Weapons</span>
              <span><kbd>3 4 5</kbd> Frag / Flash / Smoke</span>
              <span><kbd>F</kbd> Medkit</span>
              <span><kbd>B</kbd> Buy menu</span>
              <span><kbd>Tab</kbd> Scoreboard</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ lobby root
export function Lobby() {
  const startMatch = useGame((s) => s.startMatch);
  const profile = useGame((s) => s.profile);
  const [modeIdx, setModeIdx] = useState(0);
  const [showLocker, setShowLocker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [inspect, setInspect] = useState(false);
  const [showcase, setShowcase] = useState('vanguard7');
  const scrollerRef = useRef();

  useEffect(() => {
    Audio.initAudio();
    Audio.startLobbyBed();
    return () => Audio.stopLobbyBed();
  }, []);

  // rotate the showcased weapon periodically
  useEffect(() => {
    if (inspect) return undefined;
    const pool = ['vanguard7', 'vantage50', 'raptor9', 'breacher12', 'falcon6', 'hailstorm'];
    const i = setInterval(() => {
      setShowcase((cur) => pool[(pool.indexOf(cur) + 1) % pool.length]);
    }, 7000);
    return () => clearInterval(i);
  }, [inspect]);

  const mode = GAME_MODES[modeIdx];

  const play = () => {
    Audio.resumeAudio();
    Audio.playUI('ui_click');
    Audio.stopLobbyBed();
    startMatch(mode.id);
  };

  return (
    <div className="lobby">
      <div className="lobby-3d">
        <Canvas camera={{ position: [0, 0.35, 4.6], fov: 38 }} dpr={[1, 1.6]} shadows>
          <ShowcaseScene weaponId={showcase} inspect={inspect} onClick={() => setInspect((v) => !v)} />
        </Canvas>
      </div>

      <div className="lobby-scanlines" />
      <div className="lobby-grid-overlay" />

      {/* ---------- top bar ---------- */}
      <div className="lobby-top">
        <div className="profile-chip" onClick={() => Audio.playUI('ui_click')}>
          <div className="pc-avatar">{profile.name.slice(0, 2)}</div>
          <div className="pc-meta">
            <span className="pc-name">{profile.name}</span>
            <span className="pc-level">LEVEL {profile.level} · {profile.xp} XP</span>
          </div>
        </div>

        <div className="lobby-title-block">
          <h1 className="lobby-title">BREACH<span>POINT</span></h1>
          <div className="lobby-sub">TACTICAL 3v3 · ELIMINATION</div>
        </div>

        <div className="lobby-top-right">
          <div className="credit-chip">
            <span className="cc-icon">◈</span>
            <span className="cc-val">{ECONOMY.startingCredits.toLocaleString()}</span>
          </div>
          <button className="icon-btn" title="Locker" onClick={() => { setShowLocker(true); Audio.playUI('ui_click'); }}>▤</button>
          <button className="icon-btn" title="Settings" onClick={() => { setShowSettings(true); Audio.playUI('ui_click'); }}>⚙</button>
        </div>
      </div>

      {/* ---------- weapon showcase caption ---------- */}
      <div className="showcase-caption">
        <div className="sc-name">{getWeapon(showcase).name}</div>
        <div className="sc-cat">{getWeapon(showcase).category}</div>
        <button className="sc-inspect" onClick={() => { setInspect((v) => !v); Audio.playUI('ui_click'); }}>
          {inspect ? '■ STOP INSPECT' : '▶ INSPECT'}
        </button>
      </div>

      {/* ---------- mode selector (horizontal scroll, PRD §3) ---------- */}
      <div className="mode-row" ref={scrollerRef}>
        {GAME_MODES.map((m, i) => (
          <button
            key={m.id}
            className={`mode-card ${i === modeIdx ? 'active' : ''}`}
            onMouseEnter={() => Audio.playUI('ui_hover')}
            onClick={() => { setModeIdx(i); Audio.playUI('ui_click'); }}
          >
            <div className="mc-tag">{m.tag}</div>
            <div className="mc-name">{m.name}</div>
            <div className="mc-map">{m.map}</div>
            <div className="mc-blurb">{m.blurb}</div>
          </button>
        ))}
      </div>

      {/* ---------- PLAY CTA (bottom right, most prominent) ---------- */}
      <button className="play-btn" onClick={play} onMouseEnter={() => Audio.playUI('ui_hover')}>
        <span className="pb-label">PLAY</span>
        <span className="pb-sub">{mode.tag} · {mode.map}</span>
        <span className="pb-glow" />
      </button>

      <div className="lobby-foot">
        <span>PWA · OFFLINE READY</span>
        <span>·</span>
        <span>MAP: STEELFALL</span>
        <span>·</span>
        <span>FIRST TO 4 ROUNDS</span>
      </div>

      {showLocker && <Locker onClose={() => setShowLocker(false)} />}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default Lobby;
