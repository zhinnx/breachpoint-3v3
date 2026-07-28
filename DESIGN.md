# BREACHPOINT — Design contract

Locked visual system for every screen. Derived from `breachpoint-ui-ux-prd.md` (v1.0)
and the craft rules in `HOW_BEST_DESIGN.md`.

---

## Pre-flight scan (what existed before this pass)

Read before touching anything, per HOW_BEST_DESIGN §9.5.

| Signal | Found | Verdict |
|---|---|---|
| Fonts | `Rajdhani` + `JetBrains Mono`, `src/styles.css:17-18` | Partial. No display face, no body face. 2 roles doing 3 jobs. |
| Palette | `#3fa9ff` `#ff5540` `#39ff88` `#05070b`, `src/styles.css:8-16` | **Reject.** Neon blue/red/green on near-black. PRD bans neon. |
| Motion lib | none (CSS transitions only) | Keep. Motion-cut project. |
| Spacing | ad-hoc px values, no scale | **Reject.** Rebuild on 4pt named scale. |
| Framework | React 18 + Vite, plain CSS | Keep. |
| Touch input | **0 handlers** in `src/ui/useInput.js` | **Blocking.** Game is unplayable on mobile. |
| Breakpoints | **1** (`max-width: 900px`), `src/styles.css:843` | **Reject.** No real mobile layout. |
| `border-radius` | 14 uses | **Reject.** PRD §2 mandates chamfer. |
| `backdrop-filter` | 10 uses | **Reject.** PRD §6 bans glassmorphism. |
| `box-shadow` | 17 uses | **Reject.** PRD §2 mandates bevel, not blur. |
| `transition: all` | 10 uses | **Reject.** Banned in all four design repos. |

Conflict noted: `--disp: 'Rajdhani'` was used for headings *and* body, so the
type hierarchy was carried entirely by size. Rebuilt as three named roles.

---

## THESIS

A tactical optic, not a web page. Every panel is a bracket-framed readout on a
single sighting system; the 3D world stays visible through the frame instead of
being covered by a centred card. Rejects the SaaS-dashboard default this genre
keeps reaching for: rounded cards, soft shadows, blurred modals, neon accents.

## OWN-WORLD

Charcoal `#1A1A1A` ground, gunmetal `#3A3D42` panels, concrete `#8A8D91`
inactive, warm stencil off-white `#E8E4D8` text. One accent: hazard amber
`#FF6B1A`, held to roughly 3% of any viewport. Teams read desaturated steel
`#3E7CB8` and oxide `#B8453E`. Corners are chamfered with `clip-path`, depth
comes from 1px bevels, and panels carry a faint brushed-metal noise.

## STORY

The player reads state without leaving the fight: how much life, how much ammo,
who is alive, how long is left. Mobile gets the same read plus a full control
surface. Nothing decorative competes with those four answers.

## FIRST VIEWPORT

Lobby: 3D weapon showcase fills the frame; callsign bracket top-left, credits
top-right, mode tabs bottom-left, amber PLAY chamfer bottom-right. Nothing is
centred. Match: timer + round pips top-centre, minimap top-left, killfeed
top-right, health bottom-left, ammo bottom-right, controls bottom on touch.

## FORM

HUD Bracket Framing System is the one loud element. Every other treatment
(noise, hazard stripe, transitions) stays quiet so the brackets are what gets
remembered.

---

## Tokens

### Colour (PRD §1)

| Token | Value | Role |
|---|---|---|
| `--char` | `#1A1A1A` | base ground |
| `--gun` | `#3A3D42` | panel, border |
| `--conc` | `#8A8D91` | inactive, secondary text |
| `--stencil` | `#E8E4D8` | primary text (never pure white) |
| `--amber` | `#FF6B1A` | CTA, critical warning, match point — sparing |
| `--steel` | `#3E7CB8` | team blue |
| `--oxide` | `#B8453E` | team red |

Neutrals are tinted warm to match the amber anchor. No pure `#000` or `#fff`.

### Type — three roles (PRD §1)

| Role | Family | Used for |
|---|---|---|
| Display | Big Shoulders Display | headers, banners, PLAY, ALL CAPS |
| HUD numerals | Rajdhani | ammo, timer, score, HP — `tabular-nums` |
| Body | IBM Plex Sans | tooltips, weapon copy, settings labels |

Self-hosted `.woff2` with `font-display: swap`. Not linked from Google Fonts:
a network font request breaks offline PWA play, which the gameplay PRD requires.

### Space — 4pt named scale

`--s-1` 2 · `--s0` 4 · `--s1` 8 · `--s2` 12 · `--s3` 16 · `--s4` 24 · `--s5` 32
· `--s6` 48 · `--s7` 64. No arbitrary px.

### Motion

`--e-out: cubic-bezier(0.16, 1, 0.3, 1)` · `--e-back: cubic-bezier(0.34, 1.56, 0.64, 1)`
(overshoot, PRD §4) · `--t-micro: 90ms` · `--t-fast: 150ms` · `--t-mid: 240ms`.
Exit ≈ 75% of enter. Only `transform`, `opacity`, `clip-path`. Never `all`.
`prefers-reduced-motion` softens rather than disables.

### Z-index — named

`--z-world: 1` · `--z-hud: 20` · `--z-touch: 30` · `--z-panel: 40` ·
`--z-modal: 60` · `--z-toast: 80`.

---

## Component grammar (PRD §2)

- Chamfer via `clip-path: polygon(...)`. **Never** `border-radius`.
- Depth via 1px border + inset bevel. **Never** blurred drop-shadow.
- Brushed-metal noise on dark panels, not flat fill or glossy gradient.
- Avatars and MVP badge are hexagonal/angular, never circular.
- Health and progress are segmented ticks, never smooth gradient.
- Toggles are angular rocker switches, never iOS pills.
- Hazard stripe only on the loading bar and critical warnings.
- Corner brackets frame every important surface. This is the signature.

## Mobile (the reason for this pass)

- Left thumb: 8-direction virtual stick, drag-tracked 1:1, dead zone 12px.
- Right thumb: look. Drag anywhere on the right half rotates the camera.
- Right cluster: fire, ADS, reload, jump, crouch, weapon swap, utility.
- All touch targets ≥ 44px (HOW_BEST_DESIGN §11.4).
- Team roster collapses to a compact pip strip under the score — the user
  called this out specifically; full callsigns do not fit a 375px screen.
- Safe-area insets honoured for notch and home indicator.
- Layout switches on **pointer capability**, not width alone, so a small
  desktop window keeps mouse-and-keyboard controls.

## Verification gates

Before shipping: no `border-radius`, no `backdrop-filter`, no blurred
`box-shadow`, no `transition: all`, no neon, no circular avatar, no pure
`#fff`/`#000`, every interactive element has focus-visible + active + disabled,
contrast computed (not eyeballed) at 4.5:1 body / 3:1 large, and the layout
verified at 320 / 375 / 414 / 768 / 1280×800.
