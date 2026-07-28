/**
 * BREACHPOINT — Armory (breachpoint-ui-ux-prd.md §3.2).
 *
 * Rises from the bottom edge; the world stays visible behind it. Weapons are a
 * horizontal rack, like a physical armoury shelf, not a grid of web cards.
 * Copy stays imperative and consistent: the control says BUY, the confirmed
 * state says OWNED (PRD §5).
 */
import React, { useState } from 'react';
import { useGame } from '../game/store.js';
import { PHASE, ARMOR } from '../game/config.js';
import { PRIMARIES, SIDEARMS, UTILITY_LIST, getWeapon } from '../game/weapons.js';
import * as Audio from '../game/audio.js';

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
  const readyUp = useGame((s) => s.readyUp);

  const [tab, setTab] = useState('primary');

  if (!open || !entity) return null;

  const credits = entity.credits;
  const items = tab === 'primary' ? PRIMARIES
    : tab === 'sidearm' ? SIDEARMS
      : tab === 'utility' ? UTILITY_LIST
        : [ARMOR.light, ARMOR.heavy];

  const owned = (item) => {
    if (tab === 'armor') return entity.loadout.armor === item.id;
    if (tab === 'utility') return (entity.loadout.utility[item.id] || 0) >= item.maxCount;
    if (tab === 'sidearm') return entity.loadout.sidearm === item.id;
    return entity.loadout.primary === item.id;
  };

  const purchase = (item) => {
    let ok = false;
    if (tab === 'armor') ok = buyArmor(playerId, item.id);
    else if (tab === 'utility') ok = buyUtility(playerId, item.id);
    else ok = buyWeapon(playerId, item.id);
    if (!ok) Audio.playUI('ui_error');
  };

  const loadoutLine = [
    entity.loadout.primary ? getWeapon(entity.loadout.primary).name : 'NO PRIMARY',
    getWeapon(entity.loadout.sidearm).name,
    entity.loadout.armor === 'none' ? 'NO VEST' : ARMOR[entity.loadout.armor].label.toUpperCase(),
  ].join(' · ');

  return (
    <div className="buy">
      <div className="buy-head">
        <h2 className="buy-title">ARMORY</h2>
        <span className="label">
          {phase === PHASE.BUY ? 'DEPLOYMENT IN' : practice ? 'UNLIMITED' : 'IN SPAWN'}
        </span>
        <span className="buy-timer num">
          {phase === PHASE.BUY ? `${Math.ceil(phaseTime)}s` : '--'}
        </span>
        <div className="buy-cr">
          <span className="label">CREDITS</span>
          <b className="num">{practice ? 'MAX' : credits.toLocaleString('en-US')}</b>
        </div>
        {phase === PHASE.BUY && !practice && (
          <button
            type="button"
            className="btn btn-hot buy-ready"
            onClick={() => { readyUp(); toggleBuyMenu(false); Audio.playUI('ui_click'); }}
          >
            READY
          </button>
        )}
        <button
          type="button"
          className="close-btn"
          onClick={() => { toggleBuyMenu(false); Audio.playUI('ui_click'); }}
        >
          CLOSE
        </button>
      </div>

      <div className="buy-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'on' : ''}
            onClick={() => { setTab(t.id); Audio.playUI('ui_click'); }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rack">
        {items.map((item) => {
          const price = item.price;
          const afford = practice || credits >= price;
          const have = owned(item);
          const count = tab === 'utility' ? (entity.loadout.utility[item.id] || 0) : 0;
          const w = tab === 'primary' || tab === 'sidearm' ? item : null;

          return (
            <button
              key={item.id}
              type="button"
              className={`rack-item ${have ? 'owned' : ''} ${!afford ? 'poor' : ''}`}
              onClick={() => purchase(item)}
              disabled={!afford && !have}
            >
              <span className="ri-name">{item.name || item.label}</span>
              <span className="ri-cat">{item.category || (tab === 'armor' ? 'PROTECTION' : 'UTILITY')}</span>

              {w && (
                <span className="ri-spec">
                  <span>DMG <b className="num">{w.damage}</b></span>
                  <span>MAG <b className="num">{w.magazine}</b></span>
                </span>
              )}
              {tab === 'armor' && (
                <span className="ri-spec">
                  <span>BODY <b className="num">-{Math.round(item.bodyReduction * 100)}%</b></span>
                  {item.speedMul < 1 && <span>SPD <b className="num">-{Math.round((1 - item.speedMul) * 100)}%</b></span>}
                </span>
              )}
              {tab === 'utility' && (
                <span className="ri-spec"><span>MAX <b className="num">{item.maxCount}</b></span></span>
              )}

              <span className="ri-foot">
                {have && tab !== 'utility'
                  ? <span className="ri-owned">OWNED</span>
                  : <span className="ri-price num">{price === 0 ? 'FREE' : price.toLocaleString('en-US')}</span>}
                {tab === 'utility' && count > 0 && <span className="ri-n num">x{count}</span>}
              </span>
            </button>
          );
        })}
      </div>

      <div className="buy-foot">
        <span>TAP TO BUY · KIT CARRIES OVER IF YOU SURVIVE</span>
        <span className="buy-loadout">{loadoutLine}</span>
      </div>
    </div>
  );
}

export default BuyMenu;
