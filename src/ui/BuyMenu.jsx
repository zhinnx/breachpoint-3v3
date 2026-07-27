/**
 * BREACHPOINT — Buy menu (PRD §4).
 * Categories: Weapons / Utility / Armor, with a rotatable 3D weapon preview
 * before purchase, live credit display and a buy-phase countdown.
 */
import React, { useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGame } from '../game/store.js';
import { PHASE, ARMOR } from '../game/config.js';
import { PRIMARIES, SIDEARMS, UTILITY_LIST, getWeapon, WEAPONS } from '../game/weapons.js';
import { WeaponModel } from '../render/WeaponModels.jsx';
import { UtilityModel } from '../render/Grenades.jsx';
import * as Audio from '../game/audio.js';

function Spinner({ children, scale = 1 }) {
  const ref = React.useRef();
  useFrame((state, dt) => {
    if (ref.current) {
      ref.current.rotation.y += dt * 0.55;
      ref.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.5) * 0.08 - 0.06;
    }
  });
  return <group ref={ref} scale={scale}>{children}</group>;
}

function Preview({ kind, id }) {
  const spec = kind === 'weapon' ? getWeapon(id) : null;
  const scale = spec ? 2.9 / Math.max(0.22, spec.visual.length) : 9;
  return (
    <Canvas camera={{ position: [0, 0.25, 3.4], fov: 34 }} dpr={[1, 1.5]}>
      <ambientLight intensity={0.5} color="#9db4d8" />
      <directionalLight position={[3, 3, 3]} intensity={2.6} color="#ffe2bd" />
      <directionalLight position={[-3, 1, -2]} intensity={1.4} color="#5b93ff" />
      <pointLight position={[0, -1.6, 1.6]} intensity={1.1} color="#ff8a3c" distance={7} />
      <Spinner scale={scale}>
        {kind === 'weapon' ? <WeaponModel weaponId={id} /> : <UtilityModel kind={id} />}
      </Spinner>
    </Canvas>
  );
}

const TABS = [
  { id: 'primary', label: 'PRIMARY' },
  { id: 'sidearm', label: 'SIDEARM' },
  { id: 'utility', label: 'UTILITY' },
  { id: 'armor', label: 'ARMOR' },
];

export function BuyMenu() {
  const open = useGame((s) => s.buyMenuOpen);
  const phase = useGame((s) => s.phase);
  const phaseTime = useGame((s) => s.phaseTime);
  const entity = useGame((s) => s.entities[s.playerId]);
  const playerId = useGame((s) => s.playerId);
  const practice = useGame((s) => s.practice);
  const buyWeapon = useGame((s) => s.buyWeapon);
  const buyArmor = useGame((s) => s.buyArmor);
  const buyUtility = useGame((s) => s.buyUtility);
  const toggleBuyMenu = useGame((s) => s.toggleBuyMenu);
  const canBuy = useGame((s) => s.canBuy);

  const [tab, setTab] = useState('primary');
  const [sel, setSel] = useState('vanguard7');

  if (!open || !entity) return null;

  const credits = entity.credits;
  const items = tab === 'primary' ? PRIMARIES
    : tab === 'sidearm' ? SIDEARMS
      : tab === 'utility' ? UTILITY_LIST
        : [ARMOR.light, ARMOR.heavy];

  const selKind = tab === 'utility' ? 'utility' : tab === 'armor' ? 'armor' : 'weapon';

  const doBuy = (item) => {
    let ok = false;
    if (tab === 'armor') ok = buyArmor(playerId, item.id);
    else if (tab === 'utility') ok = buyUtility(playerId, item.id);
    else ok = buyWeapon(playerId, item.id);
    if (!ok) Audio.playUI('ui_error');
  };

  const owned = (item) => {
    if (tab === 'armor') return entity.loadout.armor === item.id;
    if (tab === 'utility') return (entity.loadout.utility[item.id] || 0) >= item.maxCount;
    if (tab === 'sidearm') return entity.loadout.sidearm === item.id;
    return entity.loadout.primary === item.id;
  };

  const previewId = selKind === 'armor' ? null : sel;

  return (
    <div className="buymenu">
      <div className="bm-head">
        <div className="bm-title">
          <h2>ARMORY</h2>
          <span className="bm-phase">
            {phase === PHASE.BUY ? `BUY PHASE · ${Math.ceil(phaseTime)}s` : practice ? 'PRACTICE — UNLIMITED' : 'IN SPAWN ZONE'}
          </span>
        </div>
        <div className="bm-credits">
          <span className="bmc-label">CREDITS</span>
          <span className="bmc-val">{practice ? '∞' : credits.toLocaleString()}</span>
        </div>
        <button className="close-btn" onClick={() => { toggleBuyMenu(false); Audio.playUI('ui_click'); }}>✕ [B]</button>
      </div>

      <div className="bm-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'on' : ''}
            onClick={() => {
              setTab(t.id);
              Audio.playUI('ui_click');
              if (t.id === 'primary') setSel('vanguard7');
              if (t.id === 'sidearm') setSel('wisp');
              if (t.id === 'utility') setSel('frag');
              if (t.id === 'armor') setSel('light');
            }}
          >{t.label}</button>
        ))}
      </div>

      <div className="bm-body">
        <div className="bm-list">
          {items.map((item) => {
            const price = item.price;
            const affordable = practice || credits >= price;
            const own = owned(item);
            const count = tab === 'utility' ? (entity.loadout.utility[item.id] || 0) : 0;
            return (
              <button
                key={item.id}
                className={`bm-item ${sel === item.id ? 'sel' : ''} ${!affordable ? 'poor' : ''} ${own ? 'owned' : ''}`}
                onMouseEnter={() => { setSel(item.id); Audio.playUI('ui_hover'); }}
                onClick={() => { setSel(item.id); doBuy(item); }}
              >
                <div className="bi-main">
                  <span className="bi-name">{item.name || item.label}</span>
                  <span className="bi-cat">{item.category || (tab === 'armor' ? 'ARMOR' : 'UTILITY')}</span>
                </div>
                <div className="bi-right">
                  {tab === 'utility' && count > 0 && <span className="bi-count">×{count}</span>}
                  {own && tab !== 'utility' ? (
                    <span className="bi-owned">EQUIPPED</span>
                  ) : (
                    <span className="bi-price">{price === 0 ? 'FREE' : price.toLocaleString()}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="bm-preview">
          {previewId ? (
            <Preview kind={selKind} id={previewId} />
          ) : (
            <div className="bm-armor-vis">
              <div className={`armor-plate ${sel}`}>
                <div className="ap-carrier" />
                <div className="ap-trim" />
              </div>
            </div>
          )}
          <div className="bm-detail">
            {selKind === 'weapon' && (() => {
              const w = getWeapon(sel);
              return (
                <>
                  <h3>{w.name}</h3>
                  <div className="bd-cat">{w.category} · {w.fireMode.toUpperCase()}</div>
                  <div className="bd-stats">
                    <Stat l="DAMAGE" v={w.damage} />
                    <Stat l="RPM" v={w.rpm} />
                    <Stat l="MAG" v={w.magazine} />
                    <Stat l="RELOAD" v={`${w.reloadTime}s`} />
                    <Stat l="RANGE" v={`${w.farRange}m`} />
                    <Stat l="MOBILITY" v={`${Math.round(w.moveSpeedMul * 100)}%`} />
                  </div>
                  <div className="bd-note">
                    Headshot ×4 · Limb ×0.75
                    {w.scope?.overlay && ' · Scoped optic'}
                    {w.pellets > 1 && ` · ${w.pellets} pellets`}
                  </div>
                </>
              );
            })()}
            {selKind === 'utility' && (() => {
              const u = UTILITY_LIST.find((x) => x.id === sel);
              return (
                <>
                  <h3>{u.name}</h3>
                  <div className="bd-cat">UTILITY · MAX {u.maxCount}</div>
                  <p className="bd-desc">{u.desc}</p>
                </>
              );
            })()}
            {selKind === 'armor' && (() => {
              const a = sel === 'heavy' ? ARMOR.heavy : ARMOR.light;
              return (
                <>
                  <h3>{a.label}</h3>
                  <div className="bd-cat">ARMOR</div>
                  <p className="bd-desc">
                    Reduces body damage by {Math.round(a.bodyReduction * 100)}%.
                    {a.speedMul < 1 && ` Movement speed −${Math.round((1 - a.speedMul) * 100)}%.`}
                    {' '}Does not protect against headshots.
                  </p>
                </>
              );
            })()}
            <button
              className="bm-buy-btn"
              onClick={() => doBuy(items.find((i) => i.id === sel) || items[0])}
            >
              PURCHASE
            </button>
          </div>
        </div>
      </div>

      <div className="bm-foot">
        <span>Click an item to buy instantly · Weapons carry over if you survive the round</span>
        <span className="bm-loadout">
          {entity.loadout.primary ? getWeapon(entity.loadout.primary).name : 'NO PRIMARY'} ·
          {' '}{getWeapon(entity.loadout.sidearm).name} ·
          {' '}{entity.loadout.armor === 'none' ? 'NO VEST' : ARMOR[entity.loadout.armor].label}
        </span>
      </div>
    </div>
  );
}

function Stat({ l, v }) {
  return <div className="bd-stat"><span>{l}</span><b>{v}</b></div>;
}

export default BuyMenu;
