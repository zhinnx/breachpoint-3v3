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

**Desktop**

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
| `B` | Armory |
| `Tab` | Scoreboard |
| `Esc` | Pause |

**Mobile** — full touch control surface, no keyboard needed:

| Zone | Action |
|---|---|
| Left thumb | Virtual stick, tracked 1:1 from wherever the thumb lands |
| Right thumb | Free look, drag anywhere in the open right area |
| Right cluster | Fire · aim · jump · crouch · reload · weapon swap |
| Left edge | Sprint toggle |
| Utility rail | Frag · flash · smoke · medkit, with live counts |
| Top right | Armory · scoreboard · pause |

Layout switches on **pointer capability**, not width, so a narrow desktop window
keeps mouse-and-keyboard controls and a large tablet still gets touch.

## Maps

| Map | Used by | Notes |
|---|---|---|
| **Dustline** | Normal / Hard | Outdoor daylight, 68 x 76 m. Three lanes: walled west compound, open mid plaza with a two-storey platform, east container yard. |
| **Rangeyard** | Practice | Flat open training yard. No timers, no buy phase, unlimited credits. Targets run walk / sprint / zigzag / strafe drills. |

Maps are data modules behind a live registry (`src/game/mapRegistry.js`), so the
raycaster, navmesh and renderer all follow a switch automatically.

## Match rules (PRD §1–§5)

- **Format** — 3v3: you + 2 AI teammates vs 3 AI opponents.
- **Match** — max 7 rounds, first team to **4 round wins** takes the match.
- **Buy phase** — 15s, invulnerable inside the spawn zone, skippable with **READY**. No purchase → free PX-1.
- **Combat phase** — 120s. Round ends on total elimination; on timeout the team with more survivors wins; a tie triggers 20s sudden death.
- **Sides swap** after round 4.
- **Between rounds** — HP always resets to 100. Your weapon carries over if you
  survived; if you died you respawn with the free PX-1 and must rebuy.
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

**Recoil is stance-aware**: firing while planted is easier to control than on
the move, and crouching while planted is the most stable of all
(`RECOIL_STANCE` in `src/game/config.js`). Firing mid-air is the worst.

**Aim assist** is on by default and deliberately weak: it nudges toward a
nearby visible enemy and adds a little look friction while crossing one, but it
never locks. Touch gets slightly more help than mouse.

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

**Design system:** see `DESIGN.md`. Tactical Industrial HUD — charcoal ground,
gunmetal panels, one hazard-amber accent held to ~3% of the viewport, chamfered
`clip-path` geometry (never `border-radius`), 1px bevels (never blurred drop
shadows), segmented meters, and a corner-bracket framing system as the
signature element. Three self-hosted type roles: Big Shoulders Display for
headers, Rajdhani for HUD numerals, IBM Plex Sans for body.

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
node tests/run.mjs         # headless full-match simulation (logic, no renderer)
node tests/browser.mjs     # real production build in headless Chrome
node tests/contrast.mjs    # WCAG contrast for every token pair
node tests/responsive.mjs  # 7 device profiles, touch input, collision gate
node tests/shots-ui.mjs    # capture UI screenshots
```

`tests/responsive.mjs` emulates real devices with touch enabled and asserts the
things that decide whether a phone can actually play: touch controls mount,
every target clears 44px, the stick/fire/look inputs genuinely reach the
simulation, no HUD readout sits under a control, and no horizontal scroll at any
width from 320 to 1920.

`tests/run.mjs` plays a complete 7-round match with no renderer and asserts navigation, raycasting, economy, kills, round flow and MVP selection. `tests/browser.mjs` drives the real build — lobby → buy a weapon through the UI → combat → scoreboard → pause → lobby — and fails on any console error.

### Notable bugs found and fixed by these tests

1. **NavMesh fragmented into 8 islands** → `findPath()` returned `null`, so bots fell back to blind steering. Per-region grids with fractional origins produced vertices that never welded. Fixed by baking one global integer lattice with per-component averaged corner heights. Now 1 connected region; 500/500 random paths resolve.
2. **Blocked staircase** — an overturned cart was authored on top of Stair A, severing the only ground→tower link. Found by probing walkable heights column by column.
3. **Black screen** — registering a `useFrame` with `priority > 0` makes R3F stop rendering the main scene automatically; the manual pass drew only the viewmodel. Fixed by rendering both scenes in the priority pass.
4. **Whole map frustum-culled** — `computeBoundingSphere()` on an `InstancedMesh` measures only the source geometry (a unit cube), so the foundry vanished whenever the camera looked away from the origin. Fixed by deriving real bounds from instance AABBs.
5. **Frame-rate-dependent round clock** — the phase timer used render delta, so a slow GPU stalled the match. Now driven by wall time.
6. **Mobile was unplayable** — the game loaded on phones but shipped with zero
   touch handlers and a single breakpoint, so there was no way to move, aim or
   shoot. Added a full touch control surface plus per-orientation layouts.
7. **Three contrast failures** caught by computing WCAG ratios rather than
   eyeballing them: team red on panel (2.96 vs 3.0 required) and both
   team-colour text ramps. Fixed by splitting each team colour into a dark
   fill ramp and a lighter text ramp.
8. **"Enemy AI is auto-aim" / "shots from nowhere"** — bot `viewDistance` was
   60-75m on a 76m map, so bots could see and open fire from anywhere on the
   level. Cut to 26/34/44m by difficulty, added a `firstShotDelay` between
   acquiring and firing, a `targetSwitchDelay` so bots cannot instantly snap to
   a second target, and a `missBias` that sends a fraction of shots wide.
9. **Map too dark** — replaced the enclosed night foundry with an outdoor
   daylight map, and added red/blue team outline shells so operators are
   visible against any background.
10. **Camera and weapon shake** — view bob and weapon sway were roughly 3x too
   strong; both reduced and damped further while aiming.
11. **Fire button could not aim** — the mobile fire control is now a drag
   surface: hold to shoot, slide the same thumb to steer.
12. **Bots hit ~97% of shots** — the aim vector was blended too strongly toward the exact hitbox, making `aimError` irrelevant. Added a per-shot error cone scaled by range/movement/spray; accuracy now lands in a human 10–46% band.

---

## License

Prototype built from the BREACHPOINT design document. All names are working titles.
