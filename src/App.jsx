/**
 * BREACHPOINT — Application root.
 * Owns the Simulation instance and switches between lobby / match / summary.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from './game/store.js';
import { PHASE } from './game/config.js';
import { Simulation } from './game/simulation.js';
import { buildNavMesh, navStats } from './game/navmesh.js';
import { MAP_META } from './game/steelfall.js';
import Scene from './render/Scene.jsx';
import HUD from './ui/HUD.jsx';
import BuyMenu from './ui/BuyMenu.jsx';
import Lobby from './ui/Lobby.jsx';
import { Scoreboard, PauseMenu, PostMatch } from './ui/Overlays.jsx';
import { useInput, requestPointerLock } from './ui/useInput.js';
import * as Audio from './game/audio.js';

function LoadingScreen({ progress, detail }) {
  return (
    <div className="loading">
      <div className="ld-logo">BREACH<span>POINT</span></div>
      <div className="ld-bar"><i style={{ width: `${progress}%` }} /></div>
      <div className="ld-detail">{detail}</div>
      <div className="ld-tips">
        <b>TIP</b> Crouching tightens your spread. Jump-shooting wrecks it.
      </div>
    </div>
  );
}

export default function App() {
  const screen = useGame((s) => s.screen);
  const phase = useGame((s) => s.phase);
  const paused = useGame((s) => s.paused);
  const buyMenuOpen = useGame((s) => s.buyMenuOpen);
  const pointerLocked = useGame((s) => s.pointerLocked);
  const settings = useGame((s) => s.settings);
  const playerId = useGame((s) => s.playerId);

  const simRef = useRef(null);
  if (!simRef.current) simRef.current = new Simulation(useGame.getState());
  const sim = simRef.current;

  const containerRef = useRef();
  const [booted, setBooted] = useState(false);
  const [bootMsg, setBootMsg] = useState('BAKING NAVMESH…');
  const [bootPct, setBootPct] = useState(8);

  // keep the sim's store reference fresh (zustand store object is stable,
  // but we read state through getState so just bind once)
  useEffect(() => {
    sim.store = new Proxy({}, {
      get(_, prop) {
        const st = useGame.getState();
        const v = st[prop];
        return typeof v === 'function' ? v.bind(st) : v;
      },
    });
  }, [sim]);

  // Expose sim internals for automated visual/QA tooling (harmless in prod,
  // and useful for debugging a live build).
  useEffect(() => {
    window.__BP_STORE__ = useGame;
    window.__BP_SIM__ = sim;
  }, [sim]);

  // ---- boot: build navmesh + warm audio
  useEffect(() => {
    let alive = true;
    const run = async () => {
      setBootMsg('BAKING NAVMESH…');
      setBootPct(15);
      await new Promise((r) => setTimeout(r, 40));
      buildNavMesh();
      const ns = navStats();
      if (!alive) return;
      setBootPct(58);
      setBootMsg(`NAVMESH: ${ns.polys} POLYS · ${ns.groups} REGIONS`);
      await new Promise((r) => setTimeout(r, 60));
      setBootPct(82);
      setBootMsg(`STEELFALL: ${MAP_META.solidCount} COLLIDERS · ${MAP_META.coverCount} COVER POINTS`);
      await new Promise((r) => setTimeout(r, 80));
      if (!alive) return;
      setBootPct(100);
      setBootMsg('READY');
      await new Promise((r) => setTimeout(r, 140));
      if (alive) setBooted(true);
    };
    run();
    return () => { alive = false; };
  }, []);

  useInput(sim, containerRef);

  // ---- audio lifecycle
  useEffect(() => {
    Audio.setVolumes(settings);
  }, [settings.masterVolume, settings.sfxVolume, settings.musicVolume]);

  useEffect(() => {
    if (screen === 'match') {
      Audio.initAudio();
      Audio.resumeAudio();
      Audio.startAmbient();
      sim.initialized = false;
    } else {
      Audio.stopAmbient();
    }
  }, [screen, sim]);

  // ---- drain store events into audio (round horns, buy clicks, jingles)
  useEffect(() => {
    let raf;
    const loop = () => {
      const evs = useGame.getState().drainEvents();
      for (const ev of evs) {
        if (ev.type === 'sfx') Audio.playUI(ev.sound);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---- hit marker audio hook
  useEffect(() => {
    let last = 0;
    const unsub = useGame.subscribe((s) => {
      const hm = s.hitmarkers[s.hitmarkers.length - 1];
      if (hm && hm.time !== last) {
        last = hm.time;
        Audio.playHitmarker(hm.kind === 'head', hm.killed);
      }
    });
    return unsub;
  }, []);

  // ---- pointer lock management
  useEffect(() => {
    if (screen !== 'match') return;
    if (paused || buyMenuOpen) {
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }, [paused, buyMenuOpen, screen]);

  const onCanvasClick = () => {
    const s = useGame.getState();
    if (s.screen !== 'match' || s.paused || s.buyMenuOpen) return;
    if (!document.pointerLockElement) {
      Audio.resumeAudio();
      requestPointerLock(containerRef.current);
    }
  };

  if (!booted) return <LoadingScreen progress={bootPct} detail={bootMsg} />;

  return (
    <div className="app" ref={containerRef} onClick={onCanvasClick}>
      {screen === 'lobby' && <Lobby />}

      {screen === 'match' && (
        <>
          <Scene sim={sim} />
          <HUD />
          <BuyMenu />
          <Scoreboard />
          <PauseMenu onResume={() => requestPointerLock(containerRef.current)} />
          {!pointerLocked && !paused && !buyMenuOpen && (
            <div className="click-to-play">
              <div className="ctp-card">
                <div className="ctp-title">CLICK TO ENGAGE</div>
                <div className="ctp-sub">Mouse look will be captured · [Esc] to release</div>
              </div>
            </div>
          )}
        </>
      )}

      {screen === 'summary' && <PostMatch />}
    </div>
  );
}
