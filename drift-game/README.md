# Drift Game

An endless 3D highway traffic-dodging racer built with Vite and Three.js. Every car is built
from Three.js primitives; there are no external assets. The UI is in Hebrew (RTL).

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

## Custom Supra model (optional)

Put a glTF binary at `public/models/supra.glb`. It replaces the procedural Supra automatically: the model is scaled to
4.52 m, centred, turned to face forward, and nodes named like `wheel`, `tire` or `rim` spin (names with `front`, `FL`
or `FR` also steer). Without the file the procedural A80 is used.

## Cars

| Car | Top speed | Acceleration | Handling |
| --- | --- | --- | --- |
| Toyota Supra A80 | 320 km/h | 8/10 | 8/10 |
| Mazda RX-7 FD | 275 km/h | 7/10 | 10/10 |
| Nissan GT-R R34 | 305 km/h | 9/10 | 7/10 |

All three are lofted from cross-sections (rounded fenders, real wheel arches, bubble cabin) with PBR paint,
multi-spoke alloys with brake discs and calipers, and a cockpit with a three-spoke wheel and live speedometer and
tachometer.

## Code layout

| File | Role |
| --- | --- |
| `src/main.js` | Renderer, fixed-timestep loop (120 Hz logic, render every frame), screen flow, quality |
| `src/game.js` | Game state, barrier scrapes, OBB collisions, near misses, crash, car animation, effects hooks |
| `src/physics.js` | Player vehicle model and 2D oriented-bounding-box tests |
| `src/config.js` | All tunable numbers and quality presets |
| `src/cars.js` | Lofted Supra A80, RX-7 FD, GT-R R34, cockpit with gauges, optional GLB loader |
| `src/parts.js` | Loft builder, wheels, blob shadows, static mesh merging |
| `src/materials.js` | Shared PBR materials |
| `src/trafficModels.js` | Hatchback, sedan, SUV, van, truck with trailer |
| `src/traffic.js` | Object pool, row spawner with the free-lane guarantee, AI weave and lane changes |
| `src/world.js` | Sky, sun, environment map, asphalt, rails, signs, instanced scenery strips |
| `src/effects.js` | Tyre smoke, sparks, skid marks |
| `src/post.js` | Bloom and the final speed/blur/vignette/haze pass |
| `src/camera.js` | Chase and cockpit cameras, speed FOV, shake |
| `src/ui.js`, `src/input.js`, `src/showroom.js`, `src/audio.js` | Screens, input, showroom, engine sound |
