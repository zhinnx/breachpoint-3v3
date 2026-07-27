/**
 * BREACHPOINT — Input layer.
 * Pointer-lock mouse look + keyboard bindings, funnelled into sim.input.
 */
import { useEffect, useRef } from 'react';
import { useGame } from '../game/store.js';
import { PHASE } from '../game/config.js';
import * as Audio from '../game/audio.js';

export const KEYMAP = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  crouch: ['ControlLeft', 'KeyC'],
  sprint: ['ShiftLeft'],
  reload: ['KeyR'],
  buy: ['KeyB'],
  scoreboard: ['Tab'],
  primary: ['Digit1'],
  sidearm: ['Digit2'],
  frag: ['Digit3'],
  flash: ['Digit4'],
  smoke: ['Digit5'],
  medkit: ['KeyF'],
  pause: ['Escape'],
  toggleFps: ['F3'],
};

export function useInput(sim, canvasRef) {
  const keys = useRef(new Set());
  const store = useGame;

  useEffect(() => {
    if (!sim) return undefined;

    const isDown = (list) => list.some((k) => keys.current.has(k));

    const updateMove = () => {
      const s = store.getState();
      const input = sim.input;
      if (s.buyMenuOpen || s.paused) {
        input.forward = 0; input.right = 0; input.sprint = false; input.jump = false; input.fire = false;
        return;
      }
      input.forward = (isDown(KEYMAP.forward) ? 1 : 0) - (isDown(KEYMAP.back) ? 1 : 0);
      input.right = (isDown(KEYMAP.right) ? 1 : 0) - (isDown(KEYMAP.left) ? 1 : 0);
      input.jump = isDown(KEYMAP.jump);
      input.sprint = isDown(KEYMAP.sprint);
      input.crouch = isDown(KEYMAP.crouch);
    };

    const onKeyDown = (e) => {
      const s = store.getState();
      if (s.screen !== 'match') return;

      // Tab must not move focus
      if (e.code === 'Tab') e.preventDefault();
      if (e.code === 'Space') e.preventDefault();
      if (e.repeat) {
        if (!KEYMAP.scoreboard.includes(e.code)) return;
      }
      keys.current.add(e.code);

      if (KEYMAP.pause.includes(e.code)) {
        if (s.buyMenuOpen) {
          s.toggleBuyMenu(false);
        } else {
          s.setPaused(!s.paused);
          if (!s.paused) document.exitPointerLock?.();
        }
        return;
      }
      if (KEYMAP.scoreboard.includes(e.code)) { s.toggleScoreboard(true); return; }
      if (KEYMAP.buy.includes(e.code)) {
        const canBuyNow = s.phase === PHASE.BUY || s.phase === PHASE.WARMUP || s.practice;
        if (canBuyNow) {
          s.toggleBuyMenu();
          Audio.playUI('ui_click');
          if (!s.buyMenuOpen) document.exitPointerLock?.();
        }
        return;
      }
      if (s.paused || s.buyMenuOpen) return;

      if (KEYMAP.reload.includes(e.code)) sim.input.reload = true;
      if (KEYMAP.primary.includes(e.code)) sim.input.switchTo = 'primary';
      if (KEYMAP.sidearm.includes(e.code)) sim.input.switchTo = 'sidearm';
      if (KEYMAP.frag.includes(e.code)) sim.input.throwUtil = 'frag';
      if (KEYMAP.flash.includes(e.code)) sim.input.throwUtil = 'flash';
      if (KEYMAP.smoke.includes(e.code)) sim.input.throwUtil = 'smoke';
      if (KEYMAP.medkit.includes(e.code)) sim.input.heal = true;
      if (KEYMAP.toggleFps.includes(e.code)) s.setSetting('showFps', !s.settings.showFps);
      updateMove();
    };

    const onKeyUp = (e) => {
      keys.current.delete(e.code);
      const s = store.getState();
      if (KEYMAP.scoreboard.includes(e.code)) s.toggleScoreboard(false);
      updateMove();
    };

    const onMouseMove = (e) => {
      const s = store.getState();
      if (!s.pointerLocked || s.paused || s.buyMenuOpen) return;
      sim.mouseDelta[0] += e.movementX || 0;
      sim.mouseDelta[1] += e.movementY || 0;
    };

    const onMouseDown = (e) => {
      const s = store.getState();
      if (s.screen !== 'match' || s.paused || s.buyMenuOpen) return;
      if (!s.pointerLocked) return;
      if (e.button === 0) sim.input.fire = true;
      if (e.button === 2) sim.input.ads = s.settings.adsToggle ? !sim.input.ads : true;
    };

    const onMouseUp = (e) => {
      if (e.button === 0) sim.input.fire = false;
      if (e.button === 2 && !store.getState().settings.adsToggle) sim.input.ads = false;
    };

    const onContext = (e) => e.preventDefault();

    const onPointerLockChange = () => {
      const locked = !!document.pointerLockElement;
      store.getState().setPointerLocked(locked);
      if (!locked) {
        sim.input.fire = false;
        sim.input.ads = false;
        keys.current.clear();
        updateMove();
      }
    };

    const onBlur = () => {
      keys.current.clear();
      sim.input.fire = false;
      sim.input.ads = false;
      updateMove();
    };

    const onWheel = (e) => {
      const s = store.getState();
      if (s.screen !== 'match' || !s.pointerLocked) return;
      const p = s.entities[s.playerId];
      if (!p) return;
      const cur = p.loadout.current;
      const next = cur === p.loadout.primary ? 'sidearm' : 'primary';
      sim.input.switchTo = next;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('contextmenu', onContext);
    window.addEventListener('wheel', onWheel, { passive: true });
    document.addEventListener('pointerlockchange', onPointerLockChange);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('contextmenu', onContext);
      window.removeEventListener('wheel', onWheel);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      window.removeEventListener('blur', onBlur);
    };
  }, [sim, store]);
}

export function requestPointerLock(el) {
  if (!el) return;
  const target = el.querySelector?.('canvas') || el;
  target.requestPointerLock?.();
}
