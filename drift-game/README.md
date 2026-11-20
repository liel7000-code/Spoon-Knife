# Drift Game

A 3D driving game built with Vite and Three.js with two modes: **HIGHWAY** (an endless traffic-weaving
racer) and **DRIFT** (three closed drift tracks with angle-based scoring). All cars and tracks are original
fictional designs built in code; there are no external models, images or sound files. The UI is in Hebrew (RTL).

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints (http://localhost:5173). `npm run build` produces a static build in `dist/`.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Steer | A / D or ← / → (input ramps up and re-centres smoothly) | Drag the steering slider, or turn on "הטיה" to steer by tilting the phone |
| Accelerate / brake | W / S or ↑ / ↓ | ▲ ▼ |
| Toggle camera | C | "מצלמה" button |

## How it plays

- Free steering across four lanes of traffic. Cruising speed rises over time; W pushes to the car's top speed.
- **Scoring (traffic weaving):** points flow while you are above 120 km/h, scaled by your speed and a multiplier
  (up to ×10). The multiplier grows with risky moves and starts to bleed away after 4 s of playing it safe.
  Dropping under 120 km/h for 3 s wipes it.

  | Move | Points | Multiplier |
  | --- | --- | --- |
  | Overtake above 150 km/h | 20 × mult | +0.03 |
  | Near miss (edge to edge < 1.0 m) | 150 × mult | +0.25 |
  | Close pass (< 0.45 m) | 400 × mult | +0.6 |
  | Lane split (between two cars, both < 1.6 m, within 0.4 s) | 1200 × mult | +1.2 |

- Any collision ends the run. Runs go into a local top-10 leaderboard (menu → "טבלת שיאים").
- Rows of traffic always leave a free lane; AI lane changes never enter it, so there is always a way through.
- Brushing the guard rail scrapes; hitting it hard at an angle is a crash.
- Lighting: golden-hour sunset or a night city expressway (menu → "תאורה"). Cameras: chase, bumper, cockpit (C).

## Drift mode

Main menu → **DRIFT** → choose a car → choose a track → choose a session (and the drift assist level).

| Track | Level | Character |
| --- | --- | --- |
| Harbor Night | Beginner | Industrial port at night: long sweeping corners, wide road, containers, cranes, sodium street lights |
| Mountain Pass | Medium | Narrow mountain road at sunset with hairpins, guard rails, cliffs, trees and 34 m of climb |
| Neon Circuit | Hard | Closed city circuit: fast transitions, a chicane and a big final corner, neon walls and lit towers |

All three layouts, names and locations are fictional. Sessions: **Free Drift** (no clock; end it from the pause
menu), **Score Attack** (3 minutes) and **Time Trial** (3 laps; the fastest lap on each track is saved as a ghost).

| Action | Keyboard | Touch |
| --- | --- | --- |
| Steer | A / D or ← / → | ◀ ▶ (or "הטיה" for tilt steering; iOS asks for motion permission) |
| Gas / brake (reverse when stopped) | W / S or ↑ / ↓ | ▲ ▼ |
| Handbrake (locks the rear wheels) | Space | HAND BRAKE |
| Clutch kick (short burst of wheelspin) | Shift, or double-tap W | Double-tap ▲ |
| Reset onto the track | R (also automatic when stuck) | Pause → restart |
| Camera (chase / bumper / cockpit) | C | camera button |
| Pause | Esc | pause button |

**How to drift:** brake into the corner, turn in, then either pull the handbrake for a moment or give it full
throttle to break the rear loose. Steer the other way (counter-steer) to hold the angle and steer with the throttle:
more gas swings the rear wider, less gas tightens it. Flick from one corner into the next without straightening up
to link drifts.

**Physics** (`src/drift/driftPhysics.js`): a single-track model with a slip-angle tyre curve per axle, longitudinal
weight transfer, a friction circle on the driven rear axle (wheelspin eats lateral grip, which is what lets the rear
step out), a handbrake that locks the rear, the clutch kick, aero drag, slopes and a softer run-off surface. It runs
on the fixed 120 Hz logic step (two sub-steps), so it behaves the same at 30 and 60 FPS. Every car has its own mass,
power, front/rear grip, steering lock, wheelbase, weight split and yaw inertia in `DRIFT_TUNING` (`src/config.js`).

**Assists** (session screen or pause menu): **Full** (default on touch devices) holds the angle, corrects before a
spin, counter-steers and adds a little traction control on straights; **Counter-steer** only turns the front wheels
into the slide (default on desktop); **Off** is the raw model.

**Scoring** (`src/drift/driftScoring.js`): while sliding (angle ≥ 12°, speed ≥ 25 km/h) a drift collects
angle × speed × time. Linking into the opposite direction raises the multiplier (+0.5, up to ×5). Bonuses: clipping
zones +500 and clipping points +300 (once per lap each, marked with cones, poles and yellow hatching that turns green),
proximity to the wall, long drift (+1,000 every 5 s) and 360° (+2,000). Straightening up or slowing down banks the
drift; a wall hit or a spin-out loses it. Grades C/B/A/S per run (Score Attack thresholds and Time Trial par times
per track in `src/drift/trackData.js`); best score/lap per track, car and session are saved in localStorage.

**Ghost and replay:** in Time Trial the best lap on the track drives along as a translucent ghost. From the results
screen, **שידור חוזר** replays the last run from trackside TV cameras.

## Graphics

Golden-hour `Sky` with a PMREM environment map for reflections, a sun shadow that follows the player, ACES tone mapping,
clear-coat car paint, procedural asphalt with normal and roughness maps, bloom, speed blur, chromatic aberration,
vignette, speed lines, exhaust heat haze, tyre smoke, skid marks, sparks, headlights and brake lights.

Quality (menu → "איכות גרפיקה"): **High** = pixel ratio up to 2, 2048 shadows, full post-processing.
**Medium** (default on phones) = pixel ratio 1.5, 1024 shadows, post-processing without bloom.
**Low** = pixel ratio 1, no shadows, no post-processing, fewer trees.

## Tuning

Every gameplay number lives in `src/config.js`:

| Setting | What it does |
| --- | --- |
| `steering.sensitivity` | Global steering multiplier |
| `steering.falloffSpeed` | Higher = less understeer at speed |
| `steering.rampUp` / `rampDown` | Keyboard steering response and return-to-centre speed |
| `steering.centerAssist` | How strongly the car straightens up hands-off (0 = off) |
| `grip.maxLatAccel` | Cornering grip in m/s²; caps how fast you can change lanes at speed |
| `grip.lateral` / `grip.slipSpeed` | Lower = more slide/drift |
| `grip.skidThreshold` | Slip angle where smoke and skid marks start |
| `barrier.crashNormalSpeed` | Sideways speed into the rail that counts as a crash |
| `nearMiss.near` / `edge` | Near-miss distances in metres |
| `traffic.laneChangeChance` | How often AI cars change lane |
| `QUALITY` | What Low / Medium / High switch on and off |

## Cars

All six cars are original, fictional designs. None of them is a copy of a real car, and none carries a real logo,
badge or plate text: each make has its own simple brand mark built from basic shapes.

| Car | Top speed | Acceleration | Handling | Character |
| --- | --- | --- | --- | --- |
| Kaito Ryusei | 320 km/h | 8/10 | 8/10 | 90s-style Japanese GT coupe, balanced hero car; Stock or Tuned style |
| Hoshi Kaze | 275 km/h | 7/10 | 9/10 | Light rotary-style sports coupe, agile |
| Shogun R4 | 305 km/h | 9/10 | 7/10 | Heavy Japanese AWD supercar, grippy, strong launch |
| Valkor S5 | 310 km/h | 10/10 | 6/10 | German-style super-sedan, heavy and stable |
| Adler V8 Sport | 290 km/h | 9/10 | 7/10 | Muscular V8 sedan, loudest exhaust, biggest backfire flames |
| Strassen 9 Widebody | 268 km/h | 8/10 | 10/10 | Classic rear-engine widebody coupe, lightest, sharpest steering |

All cars are lofted from cross-sections (rounded panels, wheel arches, tinted glass cabins) with PBR paint
(matte on the Adler), multi-spoke alloys with brake discs and calipers, working head/tail/brake lights and a cockpit
with live gauges. Per-car feel (steering speed, grip, cornering limit, yaw response, flame size/duration, exhaust
loudness) lives in `CAR_TUNING` in `src/config.js`.

## Assets and licences

Every 3D model, texture, sound and the music are generated in code at runtime; the project ships no model, image or
audio files. The only third-party pieces are the SIL OFL fonts (self-hosted, bundled by Vite), three.js and Vite.
See [`ASSETS_LICENSES.md`](ASSETS_LICENSES.md) and the licence texts in [`licenses/`](licenses/).

## Code layout

| File | Role |
| --- | --- |
| `src/main.js` | Renderer, fixed-timestep loop (120 Hz logic, render every frame), screen flow, quality |
| `src/game.js` | Game state, barrier scrapes, OBB collisions, near misses, crash, car animation, effects hooks |
| `src/physics.js` | Player vehicle model and 2D oriented-bounding-box tests |
| `src/config.js` | All tunable numbers and quality presets |
| `src/cars.js` | Car list, Hoshi Kaze, Shogun R4 |
| `src/kaito.js` | Kaito Ryusei hero car (Stock / Tuned) |
| `src/moreCars.js` | Valkor S5, Adler V8 Sport, Strassen 9 Widebody |
| `src/carkit.js` | Shared lofted-body pieces, cockpit, mirrors, lamps, fictional brand marks |
| `src/parts.js` | Loft builder, wheels, blob shadows, static mesh merging |
| `src/materials.js` | Shared PBR materials |
| `src/trafficModels.js` | Hatchback, sedan, SUV, van, truck with trailer |
| `src/traffic.js` | Object pool, row spawner with the free-lane guarantee, AI weave and lane changes |
| `src/world.js` | Sky, sun, environment map, asphalt, rails, signs, instanced scenery strips |
| `src/effects.js` | Tyre smoke, sparks, skid marks |
| `src/post.js` | Bloom and the final speed/blur/vignette/haze pass |
| `src/camera.js` | Chase and cockpit cameras, speed FOV, shake |
| `src/ui.js`, `src/input.js`, `src/showroom.js`, `src/audio.js` | Screens, input, showroom, synthesized engine sound and music |
| `src/drift/trackData.js` | The three drift tracks (control points, width, theme, par times, grade thresholds) and sessions |
| `src/drift/track.js` | Centre-line sampling, position queries, road/run-off/kerb/wall meshes, baked lamp light, clip markers, minimap |
| `src/drift/scenery.js` | Track themes: sky, lights, walls, instanced scenery in chunks with near/far detail |
| `src/drift/driftPhysics.js` | Drift vehicle model and assists |
| `src/drift/driftScoring.js` | Drift scoring, grades, best scores |
| `src/drift/driftGame.js` | Drift session: walls, laps, clips, effects, cameras, ghost, replay |
| `src/drift/driftFx.js`, `src/drift/ghost.js`, `src/drift/driftUI.js` | Smoke and fading skid marks; ghost and replay; drift screens and HUD |
