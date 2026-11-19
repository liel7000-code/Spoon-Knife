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
| Change lane | A / D or ← / → | Swipe left/right, or ◀ ▶ |
| Accelerate / brake | W / S or ↑ / ↓ | ▲ ▼ |
| Toggle camera | C | "מצלמה" button |

## How it plays

- Four lanes, one direction. Cruising speed rises over time; holding gas pushes to the car's top speed.
- Traffic density rises with your speed. Rows of traffic always leave a free lane, and that free lane moves at
  most one lane per row, with row spacing scaled to closing speed, so there is always a way through.
- Passing within 1.6 m of a car is a near miss (+100 × combo); within 0.7 m is "on the edge" (+300 × combo).
  The combo resets after 3 seconds without a near miss.
- Score = metres driven + near-miss bonuses. The best score is saved in localStorage.
- Any collision ends the run: camera shake, sparks, slow motion, then the results screen.

## Cars

| Car | Top speed | Acceleration | Handling |
| --- | --- | --- | --- |
| Toyota Supra | 285 km/h | 7/10 | 7/10 |
| Mazda RX-7 | 255 km/h | 6/10 | 10/10 |
| Nissan GT-R | 315 km/h | 10/10 | 7/10 |

## Code layout

| File | Role |
| --- | --- |
| `src/main.js` | Renderer, fixed-timestep loop (120 Hz logic, render every frame), screen flow |
| `src/game.js` | World (road, scenery, sky), player, scoring, AABB collisions, crash sequence |
| `src/cars.js` | Procedural player cars and traffic (sedan, hatchback, van, truck) |
| `src/traffic.js` | Object-pooled traffic and the row spawner with the free-lane guarantee |
| `src/camera.js` | Chase and cockpit cameras, speed FOV, crash shake |
| `src/ui.js` | Menu, garage, HUD, game-over screen |
| `src/input.js` | Keyboard, swipe and on-screen buttons |
| `src/showroom.js` | 3D showroom with the rotating car |
| `src/audio.js` | WebAudio engine sound (pitch follows speed), crash and near-miss sounds |
