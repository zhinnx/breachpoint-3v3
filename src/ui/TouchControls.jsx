/**
 * BREACHPOINT — Touch control surface.
 *
 * The game shipped with zero touch handlers, so phones could load it but not
 * play it. This adds the full control set:
 *
 *   left thumb   virtual stick, tracked 1:1 from wherever the thumb lands
 *   right thumb  free look, drag anywhere in the right half
 *   right cluster fire / ADS / jump / crouch / reload / weapon swap
 *   left edge    sprint
 *   right rail   frag, flash, smoke, medkit
 *   top right    buy, scoreboard, pause
 *
 * Design notes (breachpoint-ui-ux-prd.md §2, HOW_BEST_DESIGN §3.1-3.3):
 *   - Pointer Events with setPointerCapture, so a drag survives leaving bounds.
 *   - Response fires on pointer DOWN, never on click. Waiting for a tap to
 *     complete feels dead in an FPS.
 *   - Each finger is tracked by pointerId, so movement, aim and fire work
 *     simultaneously without stealing each other's input.
 *   - Writes straight into sim.input — the same struct the keyboard fills — so
 *     the simulation never learns there are two input methods.
 *   - Icons are stencil-style line silhouettes, not rounded UI glyphs.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useGame } from '../game/store.js';
import { PHASE } from '../game/config.js';
import { world } from '../game/world.js';
import * as Audio from '../game/audio.js';

const STICK_RADIUS = 62;
const DEAD_ZONE = 12;
const LOOK_SENS = 0.0038;

/* ----------------------------------------------------------------- icons */
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

const IcoFire = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <circle cx="12" cy="12" r="7" />
    <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
  </svg>
);
const IcoAds = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M3 8V4h4M21 8V4h-4M3 16v4h4M21 16v4h-4" />
    <path d="M12 9v6M9 12h6" />
  </svg>
);
const IcoJump = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M12 20V5" />
    <path d="M6 11l6-6 6 6" />
  </svg>
);
const IcoCrouch = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M12 4v15" />
    <path d="M6 13l6 6 6-6" />
  </svg>
);
const IcoReload = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M20 5v6h-6" />
    <path d="M19.5 11a8 8 0 1 0-1.9 6.3" />
  </svg>
);
const IcoSwap = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M4 8h13l-3-3M20 16H7l3 3" />
  </svg>
);
const IcoSprint = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M4 12h8M6 7h9M6 17h9" />
    <path d="M15 5l4 7-4 7" />
  </svg>
);
const IcoBuy = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M4 7h16l-1.5 11H5.5L4 7Z" />
    <path d="M9 7V5h6v2" />
  </svg>
);
const IcoBoard = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M4 5h16v14H4zM4 10h16M10 10v9" />
  </svg>
);
const IcoPause = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M9 5v14M15 5v14" />
  </svg>
);

/** Distinct silhouettes: colour alone was unreadable at thumb size. */
const IcoFrag = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M12 21a6 6 0 0 0 6-6c0-3-2-5-4-7l-2-2-2 2c-2 2-4 4-4 7a6 6 0 0 0 6 6Z" />
    <path d="M12 4V2M10 3h4" />
  </svg>
);
const IcoFlash = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M9 8h6v9a3 3 0 0 1-3 3 3 3 0 0 1-3-3V8Z" />
    <path d="M10 8V5h4v3M12 3v2" />
    <path d="M4 12h2M18 12h2M6 7l1.5 1.5M18 7l-1.5 1.5" />
  </svg>
);
const IcoSmoke = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M9 9h6v9a3 3 0 0 1-3 3 3 3 0 0 1-3-3V9Z" />
    <path d="M9 9V6h6v3" />
    <path d="M6 5c1.5 0 1.5-2 3-2M15 3c1.5 0 1.5 2 3 2" />
  </svg>
);
const IcoMed = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M4 7h16v12H4zM8 7V5h8v2" />
    <path d="M12 10v6M9 13h6" />
  </svg>
);
const UTIL_ICON = { frag: IcoFrag, flash: IcoFlash, smoke: IcoSmoke, medkit: IcoMed };
const UTIL_TINT = { frag: '#7d8a4a', flash: '#e8e4d8', smoke: '#a97fe0', medkit: '#e0736a' };

/** Hold-style button: engages on pointerdown, releases on up/cancel. */
function HoldButton({ cls, onDown, onUp, children, label, active, disabled, count }) {
  const [down, setDown] = useState(false);
  const idRef = useRef(null);

  const press = (e) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    idRef.current = e.pointerId;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDown(true);
    onDown?.();
  };
  const release = (e) => {
    if (idRef.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    idRef.current = null;
    setDown(false);
    onUp?.();
  };

  return (
    <button
      type="button"
      className={`tbtn ${cls} ${down ? 'down' : ''} ${active ? 'lit' : ''} ${disabled ? 'off' : ''}`}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={label}
      aria-pressed={active ? 'true' : undefined}
      disabled={disabled}
    >
      {children}
      {count != null && <span className="tbtn-count">{count}</span>}
    </button>
  );
}

export function TouchControls({ sim }) {
  const phase = useGame((s) => s.phase);
  const paused = useGame((s) => s.paused);
  const buyOpen = useGame((s) => s.buyMenuOpen);
  const practice = useGame((s) => s.practice);
  const playerId = useGame((s) => s.playerId);
  const entity = useGame((s) => s.entities[s.playerId]);
  const setPaused = useGame((s) => s.setPaused);
  const toggleBuy = useGame((s) => s.toggleBuyMenu);
  const toggleScore = useGame((s) => s.toggleScoreboard);

  const stickZone = useRef(null);
  const stickEl = useRef(null);
  const knobEl = useRef(null);
  const [stickOn, setStickOn] = useState(false);
  const stickId = useRef(null);
  const stickOrigin = useRef([0, 0]);
  const lookId = useRef(null);
  const lookLast = useRef([0, 0]);

  const [ads, setAds] = useState(false);
  const [sprint, setSprint] = useState(false);
  const [crouch, setCrouch] = useState(false);

  const canAct = phase === PHASE.COMBAT || phase === PHASE.SUDDEN_DEATH;
  const alive = entity?.alive;

  /* --------------------------------------------------- movement stick */
  const stickDown = useCallback((e) => {
    if (stickId.current !== null) return;
    e.preventDefault();
    stickId.current = e.pointerId;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    stickOrigin.current = [x, y];
    setStickOn(true);
    if (stickEl.current) {
      stickEl.current.style.left = `${x}px`;
      stickEl.current.style.top = `${y}px`;
    }
    if (knobEl.current) {
      knobEl.current.style.transform = 'translate(0px, 0px)';
    }
  }, []);

  const stickMove = useCallback((e) => {
    if (stickId.current !== e.pointerId) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    let dx = (e.clientX - rect.left) - stickOrigin.current[0];
    let dy = (e.clientY - rect.top) - stickOrigin.current[1];
    const dist = Math.hypot(dx, dy);

    if (dist > STICK_RADIUS) {
      dx = (dx / dist) * STICK_RADIUS;
      dy = (dy / dist) * STICK_RADIUS;
    }
    if (knobEl.current) {
      knobEl.current.style.transform = `translate(${dx}px, ${dy}px)`;
    }
    if (dist < DEAD_ZONE) {
      sim.input.forward = 0;
      sim.input.right = 0;
      return;
    }
    // Screen-down is world-backward.
    sim.input.forward = Math.max(-1, Math.min(1, -dy / STICK_RADIUS));
    sim.input.right = Math.max(-1, Math.min(1, dx / STICK_RADIUS));
  }, [sim]);

  const stickUp = useCallback((e) => {
    if (stickId.current !== e.pointerId) return;
    e.preventDefault();
    stickId.current = null;
    setStickOn(false);
    sim.input.forward = 0;
    sim.input.right = 0;
    if (knobEl.current) knobEl.current.style.transform = 'translate(0px, 0px)';
  }, [sim]);

  /* --------------------------------------------- fire: hold AND drag-aim */
  const fireId = useRef(null);
  const fireLast = useRef([0, 0]);
  const [firing, setFiring] = useState(false);

  const fireDown = useCallback((e) => {
    if (fireId.current !== null) return;
    e.preventDefault();
    e.stopPropagation();
    fireId.current = e.pointerId;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    fireLast.current = [e.clientX, e.clientY];
    setFiring(true);
    sim.input.fire = true;
  }, [sim]);

  const fireMove = useCallback((e) => {
    if (fireId.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    const dx = e.clientX - fireLast.current[0];
    const dy = e.clientY - fireLast.current[1];
    fireLast.current = [e.clientX, e.clientY];
    // Slightly lower gain than the look pad: this thumb is also holding the
    // trigger, so it needs finer control, not faster turning.
    const sens = LOOK_SENS * 1000 * (ads ? 0.5 : 0.82);
    sim.mouseDelta[0] += dx * sens * 0.28;
    sim.mouseDelta[1] += dy * sens * 0.28;
  }, [sim, ads]);

  const fireUp = useCallback((e) => {
    if (fireId.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    fireId.current = null;
    setFiring(false);
    sim.input.fire = false;
  }, [sim]);

  /* ------------------------------------------------------- look drag */
  const lookDown = useCallback((e) => {
    if (lookId.current !== null) return;
    e.preventDefault();
    lookId.current = e.pointerId;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    lookLast.current = [e.clientX, e.clientY];
  }, []);

  const lookMove = useCallback((e) => {
    if (lookId.current !== e.pointerId) return;
    e.preventDefault();
    const dx = e.clientX - lookLast.current[0];
    const dy = e.clientY - lookLast.current[1];
    lookLast.current = [e.clientX, e.clientY];
    const sens = LOOK_SENS * 1000 * (ads ? 0.55 : 1);
    sim.mouseDelta[0] += dx * sens * 0.28;
    sim.mouseDelta[1] += dy * sens * 0.28;
  }, [sim, ads]);

  const lookUp = useCallback((e) => {
    if (lookId.current !== e.pointerId) return;
    e.preventDefault();
    lookId.current = null;
  }, []);

  /* --------------------------------------------- keep sim flags synced */
  useEffect(() => { sim.input.ads = ads; }, [ads, sim]);
  useEffect(() => { sim.input.sprint = sprint; }, [sprint, sim]);
  useEffect(() => { sim.input.crouch = crouch; }, [crouch, sim]);

  /**
   * Release everything when control is taken away.
   *
   * BUG THIS FIXES: opening the shop or settings mid-drag unmounted the touch
   * layer while `stickId`/`lookId` still held a pointerId. Those ids were never
   * cleared, so on return every new touch was rejected by the
   * `if (stickId.current !== null) return` guard and the joystick was dead for
   * the rest of the match. Every captured pointer must be dropped here.
   */
  useEffect(() => {
    if (canAct && alive && !paused && !buyOpen) return;
    sim.input.fire = false;
    sim.input.forward = 0;
    sim.input.right = 0;
    sim.input.jump = false;
    stickId.current = null;
    lookId.current = null;
    fireId.current = null;
    setStickOn(false);
    setFiring(false);
    setSprint(false);
    setAds(false);
    if (knobEl.current) knobEl.current.style.transform = 'translate(0px, 0px)';
  }, [canAct, alive, paused, buyOpen, sim]);

  // Same reset when the control surface itself unmounts, and a global
  // pointercancel guard for the browser yanking capture away (scroll, alt-tab,
  // incoming call). Without this a lost pointerup strands the stick again.
  useEffect(() => {
    const release = () => {
      stickId.current = null;
      lookId.current = null;
      fireId.current = null;
      sim.input.forward = 0;
      sim.input.right = 0;
      sim.input.fire = false;
      setStickOn(false);
      setFiring(false);
      if (knobEl.current) knobEl.current.style.transform = 'translate(0px, 0px)';
    };
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    return () => {
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', release);
      release();
    };
  }, [sim]);

  const hidden = paused || buyOpen;
  const util = entity?.loadout?.utility || {};
  const showCombat = canAct && alive && !hidden;

  return (
    <div className="touch-layer" aria-hidden={hidden ? 'true' : undefined}>
      {/* system row is available in every phase */}
      {!hidden && (
        <div className="touch-sys">
          {(phase === PHASE.BUY || phase === PHASE.WARMUP || practice) && (
            <HoldButton
              cls="" label="Open buy menu"
              onDown={() => { Audio.playUI('ui_click'); toggleBuy(true); }}
            ><IcoBuy /></HoldButton>
          )}
          <HoldButton
            cls="" label="Scoreboard"
            onDown={() => toggleScore(true)}
            onUp={() => toggleScore(false)}
          ><IcoBoard /></HoldButton>
          <HoldButton
            cls="" label="Pause"
            onDown={() => { Audio.playUI('ui_click'); setPaused(true); }}
          ><IcoPause /></HoldButton>
        </div>
      )}

      {showCombat && (
        <>
          {/* left: movement */}
          <div
            ref={stickZone}
            className="stick-zone"
            onPointerDown={stickDown}
            onPointerMove={stickMove}
            onPointerUp={stickUp}
            onPointerCancel={stickUp}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div
              ref={stickEl}
              className="stick"
              style={{ opacity: stickOn ? 1 : 0.34, left: '128px', top: 'calc(100% - 128px)' }}
            >
              <div ref={knobEl} className="stick-knob" style={{ left: '50%', top: '50%' }} />
              {!stickOn && <span className="stick-hint">MOVE</span>}
            </div>
          </div>

          {/* right: look */}
          <div
            className="look-zone"
            onPointerDown={lookDown}
            onPointerMove={lookMove}
            onPointerUp={lookUp}
            onPointerCancel={lookUp}
            onContextMenu={(e) => e.preventDefault()}
          />

          {/* action cluster */}
          {/* Fire is not a plain button: once held, dragging the same finger
              keeps shooting AND steers the camera, which is how mobile
              shooters let you track a target while firing. */}
          <button
            type="button"
            className={`tbtn tbtn-fire ${firing ? 'down' : ''}`}
            aria-label="Fire"
            onPointerDown={fireDown}
            onPointerMove={fireMove}
            onPointerUp={fireUp}
            onPointerCancel={fireUp}
            onContextMenu={(e) => e.preventDefault()}
          ><IcoFire /></button>

          <HoldButton
            cls="tbtn-ads" label="Aim down sight" active={ads}
            onDown={() => setAds((v) => !v)}
          ><IcoAds /></HoldButton>

          <HoldButton
            cls="tbtn-jump" label="Jump"
            onDown={() => { sim.input.jump = true; }}
            onUp={() => { sim.input.jump = false; }}
          ><IcoJump /></HoldButton>

          <HoldButton
            cls="tbtn-crouch" label="Crouch" active={crouch}
            onDown={() => setCrouch((v) => !v)}
          ><IcoCrouch /></HoldButton>

          <HoldButton
            cls="tbtn-reload" label="Reload"
            onDown={() => { sim.input.reload = true; }}
          ><IcoReload /></HoldButton>

          <HoldButton
            cls="tbtn-swap" label="Swap weapon"
            onDown={() => {
              const cur = entity?.loadout?.current;
              sim.input.switchTo = cur === entity?.loadout?.primary ? 'sidearm' : 'primary';
            }}
          ><IcoSwap /></HoldButton>

          <HoldButton
            cls="tbtn-sprint" label="Sprint" active={sprint}
            onDown={() => setSprint((v) => !v)}
          ><IcoSprint /></HoldButton>

          {/* utility rail */}
          <div className="util-dock">
            {['frag', 'flash', 'smoke'].map((u) => {
              const Ico = UTIL_ICON[u];
              return (
                <HoldButton
                  key={u}
                  cls="" label={u}
                  disabled={!util[u]}
                  count={util[u] || 0}
                  onDown={() => { if (util[u]) sim.input.throwUtil = u; }}
                >
                  <span style={{ color: UTIL_TINT[u], display: 'flex' }}><Ico /></span>
                </HoldButton>
              );
            })}
            <HoldButton
              cls="" label="medkit"
              disabled={!util.medkit}
              count={util.medkit || 0}
              onDown={() => { if (util.medkit) sim.input.heal = true; }}
            >
              <span style={{ color: UTIL_TINT.medkit, display: 'flex' }}><IcoMed /></span>
            </HoldButton>
          </div>
        </>
      )}
    </div>
  );
}

export default TouchControls;
