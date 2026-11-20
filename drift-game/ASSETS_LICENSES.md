# Assets and licences

This file lists every piece of the Drift Game that was not written for this project, plus what was made in-house.

## Made for this project (no third-party rights)

| Asset | How it is made |
| --- | --- |
| All 3D car models (Kaito Ryusei, Hoshi Kaze, Shogun R4, Valkor S5, Adler V8 Sport, Strassen 9 Widebody) | Generated in code from lofted cross-sections and Three.js primitives (`src/kaito.js`, `src/cars.js`, `src/moreCars.js`, `src/carkit.js`, `src/parts.js`). Original fictional designs. |
| Brand marks and badges (the six fictional logos, "Ryusei" script, "KR-90" plate) | Drawn in code (`brandMark()` in `src/carkit.js`, canvas textures in `src/kaito.js`). Fictional makes, no real trademarks. |
| Traffic vehicles (hatchback, sedan, SUV, van, truck) | Generated in code (`src/trafficModels.js`). Generic, unbranded. |
| Road, asphalt, signs, scenery, sky, night city | Generated in code (`src/world.js`). Canvas textures and procedural noise. Sign place names are fictional. |
| Effects (smoke, sparks, skid marks, flames) | Generated in code (`src/effects.js`, `src/drift/driftFx.js`). |
| Drift tracks (Harbor Night, Mountain Pass, Neon Circuit): layouts, road, kerbs, walls, terrain, containers, cranes, trees, buildings, signs, start gantry, clip markers | Generated in code (`src/drift/`). Layouts, names and places are fictional; no real circuits, locations, sponsors or brands. Banners show only the fictional track names and generic words ("START · FINISH", "DRIFT"). |
| Engine, turbo, exhaust pops, tyre squeal, wind, crash sounds | Synthesized live with the Web Audio API (`src/audio.js`). No audio files. |
| Music | Generated live with the Web Audio API (`src/audio.js`). No audio files. |
| Post-processing shader (sun rays, blur, vignette, speed lines, haze) | Written for this project (`src/post.js`). |
| UI, HUD, icons | HTML/CSS/SVG written for this project (`index.html`, `src/style.css`, `src/ui.js`). |

The project contains **no** downloaded 3D models, image textures, HDRIs, sound files or music files. All textures are drawn at runtime on canvases (so there are no texture files to compress to KTX2).

## Third-party files

| Item | Source | Licence | Author | Where it ends up |
| --- | --- | --- | --- | --- |
| Rajdhani font (weights 500, 600, 700; Latin subset) | https://github.com/itfoundry/rajdhani via https://fontsource.org/fonts/rajdhani (npm `@fontsource/rajdhani` 5.3.0) | SIL Open Font License 1.1, see [`licenses/OFL-Rajdhani.txt`](licenses/OFL-Rajdhani.txt) | Indian Type Foundry | Self-hosted, bundled into the build by Vite |
| Heebo font (weights 400, 500, 700, 800; Latin and Hebrew subsets) | https://github.com/OdedEzer/heebo via https://fontsource.org/fonts/heebo (npm `@fontsource/heebo` 5.3.0) | SIL Open Font License 1.1, see [`licenses/OFL-Heebo.txt`](licenses/OFL-Heebo.txt) | Oded Ezer, The Heebo Project Authors | Self-hosted, bundled into the build by Vite |
| three.js 0.169.0, including the examples used (`Sky`, `RoomEnvironment`, `RoundedBoxGeometry`, `EffectComposer`, `RenderPass`, `ShaderPass`, `GTAOPass`, `UnrealBloomPass`, `BokehPass`, `OutputPass`, `BufferGeometryUtils`) | https://github.com/mrdoob/three.js (npm `three`) | MIT, see [`licenses/MIT-three.js.txt`](licenses/MIT-three.js.txt) | three.js authors | Bundled into the build |
| Vite 5 | https://github.com/vitejs/vite (npm `vite`) | MIT | Evan You and Vite contributors | Build tool only, not shipped |

No font, model, texture or sound is loaded from a CDN or any other server at runtime.
