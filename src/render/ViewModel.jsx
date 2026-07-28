/**
 * BREACHPOINT — First-person view model (PRD §1, §6, §10).
 *
 * The weapon + gloved forearms are rendered on a dedicated overlay scene so the
 * gun never clips into walls. Handles:
 *   - hip vs ADS pose blending (PRD §6: scope rises to screen centre, FOV narrows)
 *   - recoil kickback + rotational punch
 *   - idle sway, walk bob, sprint pose, reload/bolt animations
 *   - shell-eject timing and the 3D scope reticle for Falcon-6 / Vantage .50
 */
import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree, createPortal } from '@react-three/fiber';
import { WeaponModel } from './WeaponModels.jsx';
import { FirstPersonArms } from './Operator.jsx';
import { world, currentWeaponRuntime } from '../game/world.js';
import { getWeapon, FIRE_MODE } from '../game/weapons.js';
import { useGame } from '../game/store.js';

/** Per-weapon hip and ADS transforms (metres / radians, camera space). */
const POSES = {
  px1: {
    hip: { p: [0.17, -0.16, -0.35], r: [0.02, -0.06, 0.0] },
    ads: { p: [0.0, -0.062, -0.24], r: [0, 0, 0] },
  },
  wisp: {
    hip: { p: [0.18, -0.17, -0.36], r: [0.02, -0.06, 0] },
    ads: { p: [0.0, -0.066, -0.26], r: [0, 0, 0] },
  },
  raptor9: {
    hip: { p: [0.2, -0.18, -0.4], r: [0.03, -0.07, 0.02] },
    ads: { p: [0.0, -0.098, -0.28], r: [0, 0, 0] },
  },
  breacher12: {
    hip: { p: [0.21, -0.19, -0.42], r: [0.03, -0.06, 0.02] },
    ads: { p: [0.0, -0.082, -0.3], r: [0, 0, 0] },
  },
  vanguard7: {
    hip: { p: [0.2, -0.185, -0.42], r: [0.03, -0.07, 0.02] },
    ads: { p: [0.0, -0.094, -0.3], r: [0, 0, 0] },
  },
  falcon6: {
    hip: { p: [0.21, -0.19, -0.44], r: [0.03, -0.07, 0.02] },
    ads: { p: [0.0, -0.128, -0.2], r: [0, 0, 0] },
  },
  vantage50: {
    hip: { p: [0.22, -0.2, -0.46], r: [0.03, -0.06, 0.02] },
    ads: { p: [0.0, -0.146, -0.16], r: [0, 0, 0] },
  },
  hailstorm: {
    hip: { p: [0.22, -0.2, -0.45], r: [0.03, -0.07, 0.02] },
    ads: { p: [0.0, -0.116, -0.32], r: [0, 0, 0] },
  },
};

const lerp = (a, b, t) => a + (b - a) * t;

export function ViewModel({ actor, entity }) {
  const group = useRef();
  const weaponRoot = useRef();
  const { camera, scene } = useThree();

  // dedicated overlay scene so the viewmodel renders on top of the world
  const vmScene = useMemo(() => {
    const s = new THREE.Scene();
    return s;
  }, []);
  const vmCamera = useMemo(() => new THREE.PerspectiveCamera(58, 1, 0.01, 12), []);

  const sway = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const bobT = useRef(0);
  const lastYaw = useRef(0);
  const lastPitch = useRef(0);
  const reloadAnim = useRef(0);

  const { gl, size } = useThree();

  useFrame((state, dt) => {
    const g = group.current;
    if (!g || !actor || !entity) return;

    const weaponId = actor.currentWeapon;
    const weapon = getWeapon(weaponId);
    const pose = POSES[weaponId] || POSES.px1;
    const wr = currentWeaponRuntime(actor);
    const ads = actor.ads;

    // ---------------- sway from mouse movement
    const dYaw = actor.yaw - lastYaw.current;
    const dPitch = actor.pitch - lastPitch.current;
    lastYaw.current = actor.yaw;
    lastPitch.current = actor.pitch;
    const s = sway.current;
    s.vx += (-dYaw * 1.1 - s.x * 16) * dt * 8;
    s.vy += (dPitch * 0.95 - s.y * 16) * dt * 8;
    s.vx *= 0.86; s.vy *= 0.86;
    s.x += s.vx * dt * 6;
    s.y += s.vy * dt * 6;
    s.x = THREE.MathUtils.clamp(s.x, -0.026, 0.026);
    s.y = THREE.MathUtils.clamp(s.y, -0.026, 0.026);
    const swayMul = 1 - ads * 0.82;

    // ---------------- walk bob
    const speed = Math.hypot(actor.vel[0], actor.vel[2]);
    bobT.current += dt * (speed * 1.45 + 1.1);
    // Weapon bob was far too strong and read as the hands shaking violently.
    // Cut to roughly a third, and damp it further while aiming.
    const bobAmt = Math.min(1, speed / 4.4) * (1 - ads * 0.85) * (actor.grounded ? 1 : 0.12);
    const bobX = Math.sin(bobT.current) * 0.0052 * bobAmt;
    const bobY = Math.abs(Math.cos(bobT.current)) * 0.0045 * bobAmt;

    // ---------------- target pose
    let px = lerp(pose.hip.p[0], pose.ads.p[0], ads);
    let py = lerp(pose.hip.p[1], pose.ads.p[1], ads);
    let pz = lerp(pose.hip.p[2], pose.ads.p[2], ads);
    let rx = lerp(pose.hip.r[0], pose.ads.r[0], ads);
    let ry = lerp(pose.hip.r[1], pose.ads.r[1], ads);
    let rz = lerp(pose.hip.r[2], pose.ads.r[2], ads);

    // sprint pose: gun lowered and angled away
    const sprintAmt = actor.sprinting && speed > 2 ? 1 : 0;
    g.userData.sprintBlend = lerp(g.userData.sprintBlend || 0, sprintAmt, Math.min(1, dt * 9));
    const sb = g.userData.sprintBlend;
    px += sb * 0.06;
    py += sb * -0.09;
    pz += sb * 0.05;
    rx += sb * 0.42;
    ry += sb * 0.62;
    rz += sb * -0.32;

    // ---------------- reload / bolt animation
    const reloading = wr.reloading;
    const bolting = wr.boltCycling;
    const targetReload = reloading ? 1 : bolting ? 0.45 : 0;
    reloadAnim.current = lerp(reloadAnim.current, targetReload, Math.min(1, dt * 8));
    const ra = reloadAnim.current;
    if (ra > 0.01) {
      const cyc = Math.sin(world.time * (reloading ? 5.5 : 11)) * 0.5 + 0.5;
      py += -0.1 * ra - cyc * 0.05 * ra;
      pz += 0.04 * ra;
      rx += 0.5 * ra + cyc * 0.22 * ra;
      rz += 0.34 * ra;
      px += 0.03 * ra;
    }

    // ---------------- recoil kickback (translation + rotation)
    const kick = actor.kickback;
    pz += kick * (weapon.recoil.kickback * 5.5);
    py += kick * 0.012;
    rx += -actor.recoilPitch * 0.55 - kick * 0.14;
    ry += -actor.recoilYaw * 0.4;

    // ---------------- apply
    g.position.set(
      px + (s.x + bobX) * swayMul,
      py + (s.y + bobY) * swayMul,
      pz,
    );
    g.rotation.set(rx + s.y * 0.6 * swayMul, ry + s.x * 0.9 * swayMul, rz);

    // Viewmodel camera mirrors the main camera FOV narrowing on ADS,
    // but at a tighter base FOV so the gun reads large and detailed.
    vmCamera.fov = lerp(58, weapon.adsFov ? Math.max(30, weapon.adsFov * 0.82) : 42, ads);
    vmCamera.aspect = size.width / Math.max(1, size.height);
    vmCamera.updateProjectionMatrix();

    // hide the model entirely when fully scoped with an optic overlay
    const scoped = weapon.scope?.overlay && ads > 0.86;
    g.visible = !scoped;
  }, 1);

  /**
   * Manual render pass.
   *
   * CRITICAL: registering any useFrame with priority > 0 makes R3F hand the
   * render loop over to us — it stops drawing the main scene automatically.
   * So this callback must render BOTH the world and the weapon overlay, or the
   * screen goes black except for the gun. (Symptom when this is wrong: the
   * world only appears while the player is dead, i.e. when ViewModel unmounts.)
   */
  useFrame(({ gl: renderer, scene: mainScene, camera: mainCam }) => {
    renderer.autoClear = true;
    renderer.render(mainScene, mainCam);
    // Draw the viewmodel into a cleared depth buffer so the gun never clips
    // through walls, while keeping the colour buffer intact.
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(vmScene, vmCamera);
    renderer.autoClear = true;
  }, 2);

  const weaponId = actor?.currentWeapon || 'px1';
  const weapon = getWeapon(weaponId);

  return createPortal(
    <group>
      {/* dedicated viewmodel lighting so the gun always reads clearly */}
      <ambientLight intensity={0.65} color="#b9c6d8" />
      <directionalLight position={[0.6, 1.2, 0.8]} intensity={2.1} color="#fff0dc" />
      <directionalLight position={[-0.8, -0.3, 0.5]} intensity={0.7} color="#5f7fae" />
      <pointLight position={[0.2, 0.1, -0.4]} intensity={0.6} distance={2.4} color="#ffb877" />
      <group ref={group}>
        <group ref={weaponRoot}>
          <WeaponModel weaponId={weaponId} ads={actor?.ads || 0} />
          <FirstPersonArms team={entity?.team || 'BLUE'} weaponSpec={weapon} />
        </group>
      </group>
    </group>,
    vmScene,
  );
}

export default ViewModel;
