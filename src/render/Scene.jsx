/**
 * BREACHPOINT — Match scene root.
 * Wires the simulation loop into R3F, renders the map, actors, VFX and viewmodel.
 */
import React, { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { useGame } from '../game/store.js';
import { world } from '../game/world.js';
import { PHASE } from '../game/config.js';
import MapSteelfall from './MapSteelfall.jsx';
import Operator from './Operator.jsx';
import Effects from './Effects.jsx';
import Projectiles from './Grenades.jsx';
import ViewModel from './ViewModel.jsx';
import PlayerCamera from './PlayerCamera.jsx';
import { getEnvMap, setTextureTier } from './materials.js';
import { hasLineOfSight } from '../game/raycast.js';
import { getTier, DynamicResolution } from './quality.js';
import PostFX from './PostFX.jsx';

/** Drives the fixed-step simulation from the render loop. */
function SimulationDriver({ sim }) {
  useFrame((state, dt) => {
    sim.update(Math.min(dt, 0.1));
  }, -1);
  return null;
}

/** Third-person operators for everyone except the local player. */
function Actors() {
  const order = useGame((s) => s.order);
  const entities = useGame((s) => s.entities);
  const playerId = useGame((s) => s.playerId);
  const playerTeam = useGame((s) => s.entities[s.playerId]?.team);

  return (
    <group>
      {order.map((id) => {
        if (id === playerId) return null;
        const entity = entities[id];
        const actor = world.actors[id];
        if (!entity || !actor) return null;
        // Only teammates get an occlusion rim. Enemies must be found by
        // looking, not by seeing them through walls.
        return (
          <Operator
            key={id}
            actor={actor}
            entity={entity}
            isFriendly={entity.team === playerTeam}
          />
        );
      })}
    </group>
  );
}

/** Local player's body (visible only in the death cam). */
function LocalBody() {
  const playerId = useGame((s) => s.playerId);
  const entity = useGame((s) => s.entities[s.playerId]);
  const actor = world.actors[playerId];
  const ref = useRef();
  useFrame(() => {
    if (ref.current) ref.current.visible = !!(entity && !entity.alive);
  });
  if (!entity || !actor) return null;
  return (
    <group ref={ref} visible={false}>
      <Operator actor={actor} entity={entity} />
    </group>
  );
}

function EnvSetup({ quality }) {
  const { gl, scene } = useThree();
  const tier = getTier(quality);
  // Texture tier must be set before materials are first built.
  useMemo(() => setTextureTier(tier), [tier]);
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.45;
    gl.outputColorSpace = THREE.SRGBColorSpace;

    // Shadows are a real tier difference: off entirely on low (blob shadows
    // stand in), PCF at 1024 on medium, soft PCF at 2048 on high.
    gl.shadowMap.enabled = tier.shadows;
    gl.shadowMap.type = tier.shadowType === 'pcfsoft'
      ? THREE.PCFSoftShadowMap
      : tier.shadowType === 'pcf'
        ? THREE.PCFShadowMap
        : THREE.BasicShadowMap;
    gl.shadowMap.needsUpdate = true;

    // Image-based lighting drives the metal/PBR response. Low tier skips it
    // so those materials fall back to plain lambert-ish shading.
    scene.environment = tier.envMap ? getEnvMap(gl, tier.envResolution) : null;

    if (typeof window !== 'undefined') {
      window.__BP_GL__ = { gl, scene };
      window.__BP_LOS__ = hasLineOfSight;
    }
  }, [gl, scene, tier]);
  return null;
}

/**
 * Runtime resolution scaling (PRD §3.6). Watches median frame time and trims
 * the internal render resolution rather than letting the frame rate collapse.
 */
function DynamicRes({ quality, enabled }) {
  const { gl, size } = useThree();
  const tier = getTier(quality);
  const ctrl = useMemo(() => new DynamicResolution(tier.targetMs), [tier.targetMs]);
  const last = useRef(performance.now());

  useFrame(() => {
    if (!enabled) return;
    const now = performance.now();
    const dtMs = now - last.current;
    last.current = now;
    const next = ctrl.update(dtMs);
    if (next != null) {
      const base = Math.min(tier.dpr[1], window.devicePixelRatio || 1);
      gl.setPixelRatio(Math.max(tier.dpr[0] * 0.8, base * next));
    }
  });
  return null;
}

/**
 * Buy-phase "safe zone" visual: a translucent barrier plane at the spawn line
 * so the player can see where the protected area ends (PRD §4).
 */
function BuyZoneBarrier() {
  const phase = useGame((s) => s.phase);
  const playerTeam = useGame((s) => s.playerTeam);
  const swapped = useGame((s) => s.sidesSwapped);
  const active = phase === PHASE.BUY || phase === PHASE.WARMUP;
  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#4ea8ff', transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false,
  }), []);
  const ref = useRef();
  useFrame((state) => {
    if (ref.current) {
      ref.current.material.opacity = active ? 0.06 + Math.sin(state.clock.elapsedTime * 2) * 0.025 : 0;
      ref.current.visible = active;
    }
  });
  const side = (playerTeam === 'BLUE') !== swapped ? -1 : 1;
  return (
    <mesh ref={ref} position={[0, 4.75, 24 * side]} material={mat} visible={active}>
      <planeGeometry args={[50, 9.5]} />
    </mesh>
  );
}

export function Scene({ sim }) {
  const quality = useGame((s) => s.settings.quality);
  const dynamicRes = useGame((s) => s.settings.dynamicRes !== false);
  const fov = useGame((s) => s.settings.fov);
  const playerId = useGame((s) => s.playerId);
  const entity = useGame((s) => s.entities[s.playerId]);
  const actor = world.actors[playerId];

  return (
    <Canvas
      shadows={getTier(quality).shadows
        ? (getTier(quality).shadowType === 'pcfsoft' ? 'soft' : 'basic')
        : false}
      dpr={getTier(quality).dpr}
      gl={{
        antialias: getTier(quality).antialias,
        powerPreference: 'high-performance',
        stencil: false,
        depth: true,
      }}
      camera={{ fov, near: 0.06, far: 220, position: [0, 1.7, -26] }}
      frameloop="always"
    >
      <EnvSetup quality={quality} />
      <DynamicRes quality={quality} enabled={dynamicRes} />
      <SimulationDriver sim={sim} />
      <Physics gravity={[0, -22.5, 0]} timeStep="vary" paused={false}>
        <MapSteelfall quality={quality} />
      </Physics>
      {/* After the map so the occlusion rim tests against world depth. */}
      <Actors />
      <LocalBody />
      <Effects />
      <Projectiles />
      <BuyZoneBarrier />
      {actor && entity && <PlayerCamera actor={actor} entity={entity} />}
      <PostFX quality={quality} />
      {actor && entity && entity.alive && <ViewModel actor={actor} entity={entity} />}
    </Canvas>
  );
}

export default Scene;
