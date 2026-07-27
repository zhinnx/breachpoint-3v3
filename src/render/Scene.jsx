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
import { getEnvMap } from './materials.js';

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

  return (
    <group>
      {order.map((id) => {
        if (id === playerId) return null;
        const entity = entities[id];
        const actor = world.actors[id];
        if (!entity || !actor) return null;
        return <Operator key={id} actor={actor} entity={entity} />;
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

function EnvSetup() {
  const { gl, scene } = useThree();
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.45;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    const env = getEnvMap(gl);
    scene.environment = env;
    // QA hook for headless render inspection.
    if (typeof window !== 'undefined') window.__BP_GL__ = { gl, scene };
  }, [gl, scene]);
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
  const fov = useGame((s) => s.settings.fov);
  const playerId = useGame((s) => s.playerId);
  const entity = useGame((s) => s.entities[s.playerId]);
  const actor = world.actors[playerId];

  return (
    <Canvas
      shadows
      dpr={quality === 'high' ? [1, 1.8] : quality === 'medium' ? [1, 1.35] : [0.75, 1]}
      gl={{
        antialias: quality !== 'low',
        powerPreference: 'high-performance',
        stencil: false,
        depth: true,
      }}
      camera={{ fov, near: 0.06, far: 220, position: [0, 1.7, -26] }}
      frameloop="always"
    >
      <EnvSetup />
      <SimulationDriver sim={sim} />
      <Physics gravity={[0, -22.5, 0]} timeStep="vary" paused={false}>
        <MapSteelfall quality={quality} />
      </Physics>
      <Actors />
      <LocalBody />
      <Effects />
      <Projectiles />
      <BuyZoneBarrier />
      {actor && entity && <PlayerCamera actor={actor} entity={entity} />}
      {actor && entity && entity.alive && <ViewModel actor={actor} entity={entity} />}
    </Canvas>
  );
}

export default Scene;
