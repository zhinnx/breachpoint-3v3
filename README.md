# BREACHPOINT

**A 3v3 round-based tactical FPS that runs entirely in the browser — installable as a PWA and fully playable offline against AI bots.**

Built to the `breachpoint-prd.md` spec (v1.0): lobby → buy phase → combat → round economy → post-match summary, with a hand-designed foundry map, eight weapons, utility, and a coordinated bot AI.

![Steelfall mid lane](tests/shot-tower-look.png)

---

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static production build -> dist/
npm run preview  # serve the production build
```

Deploy to Vercel: the repo ships `vercel.json` (framework `vite`, output `dist`). Import the repo and deploy — no extra configuration.

---

## Controls

| Input | Action |
|---|---|
| `W A S D` | Move |
| `Shift` | Sprint (louder, worse accuracy) |
| `Ctrl` / `C` | Crouch (quieter, better accuracy) |
| `Space` | Jump · climb ladder |
| `LMB` | Fire |
| `RMB` | Aim down sight |
| `R` | Reload |
| `1` / `2` | Primary / sidearm |
| `3` `4` `5` | Frag / Flash / Smoke |
| `F` | Medkit |
| `B` | Buy menu |
| `Tab` | Scoreboard |
| `Esc` | Pause |

---

## Match rules (PRD §1–§5)

- **Format** — 3v3: you + 2 AI teammates vs 3 AI opponents.
- **Match** — max 7 rounds, first team to **4 round wins** takes the match.
- **Buy phase** — 30s, invulnerable inside the spawn zone. No purchase → free PX-1.
- **Combat phase** — 120s. Round ends on total elimination; on timeout the team with more survivors wins; a tie triggers 20s sudden death.
- **Sides swap** after round 4.
- **Economy** — 8,000 starting credits · +3,000 round win · +2,000 round loss · +250 per kill. Credits carry across rounds, so eco rounds and comebacks work.
- **Damage** — 100 HP. Headshot ×4, body ×1, limb ×0.75. Light vest −25% body damage, heavy vest −40% (−5% speed). Armor never reduces headshot damage.

## Arsenal (PRD §7)

| Weapon | Class | Price | Body dmg | Fire | Mag | Reload |
|---|---|--:|--:|---|--:|--:|
| PX-1 | Pistol (default) | Free | 22 | Semi | 12 | 1.5s |
| Wisp | Machine Pistol | 500 | 16 | Full-auto | 20 | 1.8s |
| Raptor-9 | SMG | 1,500 | 26 | Full-auto | 25 | 2.0s |
| Breacher-12 | Shotgun | 2,000 | 90 (close) | Pump | 6 | 3.0s |
| Vanguard-7 | Assault Rifle | 2,900 | 34 | Full-auto | 30 | 2.3s |
| Falcon-6 | Marksman Rifle | 3,500 | 48 | Semi | 15 | 2.5s |
| Vantage .50 | Sniper Rifle | 4,500 | 100 | Bolt | 5 | 3.5s |
| Hailstorm | LMG | 5,500 | 30 | Full-auto | 75 | 4.0s |

Utility: Frag (400) · Flashbang (200) · Smoke (300) · Medkit (300) · Light Vest (400) · Heavy Vest (1,000).

Each weapon has a unique recoil pattern, range falloff and ADS behaviour. The Vantage .50's scope emits a **lens glint** that can reveal your position.

---

## Architecture

Game state is deliberately decoupled from rendering (PRD §15) so online multiplayer can be added later without a rewrite.

```
src/
├── game/                 ← pure simulation, no React and no three.js imports
│   ├── config.js         Tunables: timers, economy, movement, difficulty
│   ├── weapons.js        Weapon/utility catalogue + damage resolution
│   ├── steelfall.js      Map authored as data (brushes, spawns, cover points)
│   ├── raycast.js        Spatial-hash AABB raycasting (hitscan, LOS, grenades)
│   ├── navmesh.js        Runtime NavMesh bake → three-pathfinding
│   ├── movement.js       Capsule character controller + per-surface footsteps
│   ├── combat.js         Firing, spread, recoil, reloads, grenade detonation
│   ├── ai.js             Bot FSM + team blackboard + tactical utility use
│   ├── world.js          Per-frame runtime state (never touches React)
│   ├── simulation.js     Fixed-step 60Hz driver
│   ├── store.js          zustand: authoritative match state
│   └── audio.js          Procedural Web Audio SFX (spatialised via PannerNode)
├── render/
│   ├── Scene.jsx         R3F canvas, Rapier physics, scene assembly
│   ├── MapSteelfall.jsx  Instanced map geometry, pooled lighting, atmospherics
│   ├── WeaponModels.jsx  Procedural PBR weapon models (one per PRD §7.2 spec)
│   ├── Operator.jsx      Team-coloured operator + first-person arms
│   ├── ViewModel.jsx     Weapon viewmodel, ADS blending, render passes
│   ├── PlayerCamera.jsx  FPS camera: recoil, shake, ADS FOV, death cam
│   ├── Effects.jsx       Muzzle flashes, tracers, impacts, explosions, smoke
│   ├── Grenades.jsx      Utility models + live projectiles
│   └── materials.js      Procedurally generated PBR textures & normal maps
├── ui/
│   ├── Lobby.jsx         Menu, 3D weapon showcase, locker, settings
│   ├── HUD.jsx           Crosshair, vitals, ammo, minimap, killfeed, scopes
│   ├── BuyMenu.jsx       Armory with rotatable 3D previews
│   ├── Overlays.jsx      Scoreboard, pause, post-match summary + MVP
│   └── useInput.js       Pointer lock, keybinds
└── App.jsx               Screen routing + boot sequence
```

**Tech:** React 18 · Three.js · @react-three/fiber · @react-three/drei · @react-three/rapier (WASM physics) · zustand · three-pathfinding · Vite · vite-plugin-pwa.

### Bot AI (PRD §8)

States: `HOLD · PATROL · INVESTIGATE · ENGAGE · RETREAT · PUSH`. Bots path over a baked NavMesh, claim tagged cover points, and share last-known enemy positions through a **per-team blackboard** so they flank and regroup as a squad. They respect smoke as a hard vision blocker, get blinded by flashbangs, and — on Hard — pre-aim angles and throw utility tactically. Difficulty scales reaction time, aim error, burst discipline and grenade usage.

### Assets

Final art isn't shipped; everything is **generated procedurally at runtime** so the whole game is playable end-to-end:

- Weapons/characters are mid-poly primitive assemblies built to each PRD §7.2 / §10 description (scope tubes with separate turrets, folded bipods, drum mags, team piping).
- Textures (rust, concrete, plate, grating, gravel, wood) are painted on canvas with derived **normal maps**, then shaded through the standard PBR pipeline.
- All audio is synthesised with the Web Audio API — per-category gunfire, surface-dependent footsteps, bolt/pump cycles, explosions with echo, flashbang tinnitus + ducking, UI stings and an industrial ambient bed.

Swapping in real `.glb` assets later is a drop-in change behind the same component API.

---

## Tests

```bash
node tests/run.mjs        # headless full-match simulation (logic, no renderer)
node tests/browser.mjs    # real production build in headless Chrome
node tests/shots.mjs      # capture gameplay screenshots
```

`tests/run.mjs` plays a complete 7-round match with no renderer and asserts navigation, raycasting, economy, kills, round flow and MVP selection. `tests/browser.mjs` drives the real build — lobby → buy a weapon through the UI → combat → scoreboard → pause → lobby — and fails on any console error.

### Notable bugs found and fixed by these tests

1. **NavMesh fragmented into 8 islands** → `findPath()` returned `null`, so bots fell back to blind steering. Per-region grids with fractional origins produced vertices that never welded. Fixed by baking one global integer lattice with per-component averaged corner heights. Now 1 connected region; 500/500 random paths resolve.
2. **Blocked staircase** — an overturned cart was authored on top of Stair A, severing the only ground→tower link. Found by probing walkable heights column by column.
3. **Black screen** — registering a `useFrame` with `priority > 0` makes R3F stop rendering the main scene automatically; the manual pass drew only the viewmodel. Fixed by rendering both scenes in the priority pass.
4. **Whole map frustum-culled** — `computeBoundingSphere()` on an `InstancedMesh` measures only the source geometry (a unit cube), so the foundry vanished whenever the camera looked away from the origin. Fixed by deriving real bounds from instance AABBs.
5. **Frame-rate-dependent round clock** — the phase timer used render delta, so a slow GPU stalled the match. Now driven by wall time.
6. **Bots hit ~97% of shots** — the aim vector was blended too strongly toward the exact hitbox, making `aimError` irrelevant. Added a per-shot error cone scaled by range/movement/spray; accuracy now lands in a human 10–46% band.

---

## License

Prototype built from the BREACHPOINT design document. All names are working titles.
