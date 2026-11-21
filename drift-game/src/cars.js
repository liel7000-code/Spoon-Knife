// Player cars. All six are original fictional designs built in code.
// The Kaito Ryusei hero model lives in kaito.js; the Hoshi Kaze and the
// Shogun R4 are built here from the shared lofted-body kit (carkit.js).
// Each car: root Group { body Group (roll/pitch), 4 wheels, blob shadow }.
// Faces -Z, sits on y = 0.
import * as THREE from 'three';
import { MAT, carPaint } from './materials.js';
import { curve, mesh, addWheels, blobShadow, mergeStatic } from './parts.js';
import { rbox, lofted, mirrors, wing, addCockpit, brandMark } from './carkit.js';
import { buildKaito } from './kaito.js';
import { buildValkor, buildAdler, buildStrassen } from './moreCars.js';

/* ------------------------------------------------------------- the cars */
export const PLAYER_CARS = [
  {
    id: 'kaito', name: 'Kaito Ryusei',
    tag: 'הגיבורה: קופה GT יפנית בסגנון שנות ה-90, שש בשורה עם טורבו כפול ואף טריז נמוך.',
    topSpeed: 320, accel: 0.82, handling: 0.8,
    color: '#c4141c', length: 4.52, width: 1.81, styles: true,
    build(root, body, paint, style) { buildKaito(root, body, paint, style); },
  },
  {
    id: 'hoshi', name: 'Hoshi Kaze',
    tag: 'קופה ספורט קלה עם מנוע בסגנון רוטרי, גג בועה כפולה ומשקל נוצה.',
    topSpeed: 275, accel: 0.72, handling: 0.92,
    color: '#e8b10c', length: 4.3, width: 1.76,
    swatches: ['#e8b10c', '#b3121a'],
    build(root, body, paint) {
      const S = {
        zF: -2.15, zR: 2.15, halfW: 0.86, pF: 3.4, pR: 6.5, shoulder: 0.08, lineHeight: 0.5,
        top: curve([[-2.15, 0.42], [-2.05, 0.52], [-1.7, 0.6], [-1.0, 0.7], [-0.52, 0.79], [1.3, 0.86], [1.8, 0.895], [2.08, 0.9], [2.15, 0.84]]),
        crown: curve([[-2.15, 0], [-1.8, -0.035], [-0.7, -0.03], [-0.45, 0], [2.15, 0]]),
        belt: curve([[-2.15, 0.42], [-1.9, 0.6], [-1.24, 0.745], [-0.7, 0.745], [0.5, 0.8], [1.185, 0.87], [1.9, 0.895], [2.15, 0.85]]),
        floor: curve([[-2.15, 0.22], [-1.95, 0.13], [1.95, 0.13], [2.15, 0.28]]),
        rocker: curve([[-2.15, 0.28], [-1.9, 0.23], [1.95, 0.23], [2.15, 0.32]]),
        bulge: curve([[-2.15, 0], [-1.6, 0.02], [-1.24, 0.034], [-0.7, 0.01], [0.6, 0.008], [1.185, 0.036], [1.8, 0.016], [2.15, 0]]),
        arches: [{ z: -1.24, cy: 0.315, r: 0.37, inner: 0.6 }, { z: 1.185, cy: 0.315, r: 0.375, inner: 0.6 }],
        cabF: -0.54, cabR: 1.56, roofF: 0.05, roofR: 0.85,
        roof: curve([[-0.54, 0.8], [-0.42, 0.87], [0.12, 1.16], [0.4, 1.225], [0.7, 1.2], [1.1, 1.08], [1.56, 0.9]]),
        cabBase: curve([[-0.54, 0.62], [-0.2, 0.67], [0.7, 0.68], [1.56, 0.5]]),
        cabRoof: curve([[-0.54, 0.56], [0.3, 0.52], [1.0, 0.5], [1.56, 0.44]]),
      };
      lofted(root, body, S, paint);
      body.add(mesh(rbox(0.9, 0.14, 0.12, 0.06), MAT.plastic, 0, 0.3, -2.1, false));
      for (const s of [-1, 1]) {
        // fixed slim headlights set into the nose, angled with the fender line
        const hl = new THREE.Group();
        hl.position.set(s * 0.48, 0.5, -1.97); hl.rotation.set(-0.5, s * 0.45, s * 0.1);
        hl.add(mesh(rbox(0.26, 0.06, 0.05, 0.02), MAT.satin, 0, 0, 0, false));
        hl.add(mesh(rbox(0.21, 0.02, 0.02, 0.008), MAT.drl, 0, 0.012, -0.024, false));
        hl.add(mesh(new THREE.SphereGeometry(0.02, 10, 8), MAT.head, s * -0.06, -0.008, -0.022, false));
        const lens = mesh(rbox(0.27, 0.065, 0.055, 0.022), MAT.lens, 0, 0, -0.003, false); lens.renderOrder = 3; hl.add(lens);
        body.add(hl);
        body.add(mesh(rbox(0.16, 0.05, 0.05, 0.02), MAT.amber, s * 0.6, 0.36, -2.06, false));
      }
      const hm = brandMark('hoshi', 0.8); hm.rotation.y = Math.PI; hm.position.set(0, 0.45, -2.155); body.add(hm);
      mirrors(body, paint, 0.9, 0.9, -0.36);
      // trapezoid tail lamps at the corners, a body-colour panel between them
      for (const s of [-1, 1]) {
        const P = [[0.3, -0.045], [0.56, -0.055], [0.58, 0.045], [0.34, 0.055]].map(([x, y]) => new THREE.Vector2(s * x, y));
        const g = new THREE.ExtrudeGeometry(new THREE.Shape(s > 0 ? P : P.reverse()), { depth: 0.02, bevelEnabled: false });
        const lamp = mesh(g, MAT.tail, 0, 0.72, 2.145, false);
        lamp.rotation.y = s * 0.07; body.add(lamp);
      }
      const hr = brandMark('hoshi', 0.8); hr.position.set(0, 0.72, 2.15); body.add(hr);
      body.add(mesh(new THREE.BoxGeometry(0.5, 0.12, 0.02), MAT.plate, 0, 0.45, 2.16, false));
      for (const x of [0.42, 0.56]) body.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.14, 14).rotateX(Math.PI / 2), MAT.exhaust, x, 0.24, 2.12));
      root.userData.exhaust = new THREE.Vector3(0.5, 0.24, 2.2);
      root.userData.exhausts = [new THREE.Vector3(0.42, 0.24, 2.2), new THREE.Vector3(0.56, 0.24, 2.2)];
      // low lip spoiler on the deck edge instead of a raised wing
      body.add(mesh(rbox(1.4, 0.035, 0.16, 0.015), paint, 0, 0.915, 2.04));
      addWheels(root, { front: -1.24, rear: 1.185, track: 0.745, r: 0.315, rimR: 0.215, width: 0.235, spokes: 5, style: 'single', rimMat: MAT.bronze, caliper: MAT.caliperRed });
      addCockpit(root, body, { eye: { x: -0.36, y: 1.04, z: 0.62 }, dashZ: -0.22, dashY: 0.84, maxKmh: 280, roof: S.roof });
    },
  },
  {
    id: 'shogun', name: 'Shogun R4',
    tag: 'מכונת-על יפנית כבדה, הנעה כפולה, כנף ענקית ותאוצה אכזרית.',
    topSpeed: 305, accel: 0.9, handling: 0.74,
    color: '#1f4fa8', length: 4.6, width: 1.785,
    swatches: ['#1f4fa8', '#9aa3ab'],
    build(root, body, paint) {
      const S = {
        zF: -2.3, zR: 2.3, halfW: 0.865, pF: 8, pR: 11, shoulder: 0.035, lineHeight: 0.55,
        top: curve([[-2.3, 0.6], [-2.2, 0.72], [-1.9, 0.765], [-0.66, 0.87], [1.55, 0.975], [2.2, 0.99], [2.3, 0.94]]),
        crown: curve([[-2.3, 0], [-1.9, 0.008], [-0.7, 0.008], [2.3, 0.006]]),
        belt: curve([[-2.3, 0.6], [-2.15, 0.75], [-1.36, 0.8], [-0.6, 0.865], [0.6, 0.9], [1.3, 0.955], [2.2, 0.975], [2.3, 0.935]]),
        floor: curve([[-2.3, 0.2], [-2.1, 0.15], [2.1, 0.15], [2.3, 0.3]]),
        rocker: curve([[-2.3, 0.26], [-2.05, 0.24], [2.05, 0.24], [2.3, 0.34]]),
        bulge: curve([[-2.3, 0], [-1.7, 0.016], [-1.36, 0.026], [-0.8, 0.01], [0.6, 0.01], [1.3, 0.028], [1.9, 0.016], [2.3, 0]]),
        arches: [{ z: -1.36, cy: 0.34, r: 0.395, inner: 0.6 }, { z: 1.305, cy: 0.34, r: 0.395, inner: 0.6 }],
        cabF: -0.7, cabR: 1.78, roofF: -0.02, roofR: 1.2,
        roof: curve([[-0.7, 0.86], [-0.56, 0.95], [-0.05, 1.32], [0.3, 1.355], [0.95, 1.35], [1.35, 1.22], [1.78, 0.99]]),
        cabBase: curve([[-0.7, 0.67], [-0.3, 0.72], [1.0, 0.72], [1.78, 0.6]]),
        cabRoof: curve([[-0.7, 0.62], [0.0, 0.6], [1.0, 0.59], [1.78, 0.54]]),
      };
      lofted(root, body, S, paint);
      body.add(mesh(rbox(1.26, 0.22, 0.12, 0.04), MAT.plastic, 0, 0.38, -2.29, false));
      body.add(mesh(rbox(0.62, 0.08, 0.06, 0.02), MAT.plastic, 0, 0.6, -2.29, false));
      const sm = brandMark('shogun', 0.9); sm.rotation.y = Math.PI; sm.position.set(0, 0.6, -2.325); body.add(sm);
      body.add(mesh(new THREE.BoxGeometry(1.7, 0.02, 0.2), MAT.carbon, 0, 0.17, -2.26, false));
      for (const s of [-1, 1]) {
        // two stacked rectangular light bars per side
        const hl = new THREE.Group();
        hl.position.set(s * 0.52, 0.66, -2.21); hl.rotation.set(0, s * 0.28, s * -0.05);
        hl.add(mesh(rbox(0.32, 0.13, 0.06, 0.012), MAT.satin, 0, 0, 0, false));
        hl.add(mesh(rbox(0.27, 0.03, 0.02, 0.006), MAT.drl, 0, 0.035, -0.03, false));
        hl.add(mesh(rbox(0.27, 0.035, 0.02, 0.006), MAT.head, 0, -0.025, -0.03, false));
        const lens = mesh(rbox(0.33, 0.14, 0.065, 0.014), MAT.lens, 0, 0, -0.002, false); lens.renderOrder = 3; hl.add(lens);
        body.add(hl);
        body.add(mesh(rbox(0.1, 0.05, 0.04, 0.015), MAT.amber, s * 0.74, 0.4, -2.26, false));
        // slashed tail bars: three angled red strips per side
        for (let k = 0; k < 3; k++) {
          const bar = mesh(rbox(0.07, 0.15, 0.02, 0.008), MAT.tail, s * (0.36 + k * 0.13), 0.8, 2.3 - k * 0.006, false);
          bar.rotation.z = s * 0.45; body.add(bar);
        }
      }
      mirrors(body, paint, 0.93, 0.99, -0.5);
      body.add(mesh(new THREE.BoxGeometry(0.52, 0.12, 0.02), MAT.plate, 0, 0.52, 2.315, false));
      body.add(mesh(rbox(1.5, 0.14, 0.2, 0.04), MAT.carbon, 0, 0.28, 2.22, false));
      const sr = brandMark('shogun', 0.9); sr.position.set(0, 0.67, 2.315); body.add(sr);
      const ex = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 18).rotateX(Math.PI / 2), MAT.exhaust, 0.6, 0.28, 2.28);
      body.add(ex);
      root.userData.exhaust = new THREE.Vector3(0.6, 0.28, 2.38);
      root.userData.exhausts = [new THREE.Vector3(0.6, 0.28, 2.37)];
      wing(body, paint, { span: 1.7, chord: 0.36, y: 1.26, z: 2.06, upX: 0.58, upH: 0.28, deck: 0.98, mat: MAT.carbon });
      for (const s of [-1, 1]) { const ep = mesh(rbox(0.02, 0.22, 0.3, 0.01), MAT.carbon, s * 0.86, 1.22, 2.1, false); ep.rotation.x = 0.35; body.add(ep); }
      addWheels(root, { front: -1.36, rear: 1.305, track: 0.755, r: 0.34, rimR: 0.235, width: 0.255, spokes: 6, style: 'double', rimMat: MAT.gunmetal, caliper: MAT.caliperGold });
      addCockpit(root, body, { eye: { x: -0.37, y: 1.17, z: 0.58 }, dashZ: -0.36, dashY: 0.96, maxKmh: 320, roof: S.roof });
    },
  },
];
// three more original designs: a German-style super-sedan, a muscular V8 sedan and a widebody rear-engine coupe
PLAYER_CARS.push(
  {
    id: 'valkor', name: 'Valkor S5',
    tag: 'סדאן ארבע דלתות כבדה ויציבה, תאוצה מטורפת ומהירות מרבית גבוהה.',
    topSpeed: 310, accel: 0.95, handling: 0.6,
    color: '#1d5cc0', colors: ['#1d5cc0', '#121316', '#eef0f2', '#6e747b'],
    paint: { metalness: 0.7, roughness: 0.24 },
    length: 4.97, width: 1.9,
    build(root, body, paint) { buildValkor(root, body, paint); },
  },
  {
    id: 'adler', name: 'Adler V8 Sport',
    tag: 'גוף רחב מקדימה, האגזוז הרועם ביותר והלהבות הארוכות ביותר בשחרור גז.',
    topSpeed: 290, accel: 0.88, handling: 0.66,
    color: '#5f6368', colors: ['#5f6368', '#121316', '#eef0f2', '#b3121a'],
    paint: { matte: true },
    length: 4.75, width: 1.88,
    build(root, body, paint) { buildAdler(root, body, paint); },
  },
  {
    id: 'strassen', name: 'Strassen 9 Widebody',
    tag: 'קופה קלאסית עם מנוע אחורי וגוף רחב, נמוכה ורחבה. הקלה ביותר, ההיגוי החד ביותר.',
    topSpeed: 268, accel: 0.8, handling: 1.0,
    color: '#f2f1ec', colors: ['#f2f1ec', '#121316', '#f2c80f', '#2e6b3a'],
    length: 4.24, width: 1.95,
    build(root, body, paint) { buildStrassen(root, body, paint); },
  },
);

export const STAT_RANGE = { topSpeed: [220, 330], accel: [0.4, 1], handling: [0.4, 1] };

/* --------------------------------------------------------------- build */
export function buildPlayerCar(def, color, style = 'stock') {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  // light colours get a pearl coat
  const c = new THREE.Color(color), hsl = {}; c.getHSL(hsl);
  const paint = carPaint(color, def.paint ? def.paint : hsl.l > 0.75 ? { pearl: true, metalness: 0.25, roughness: 0.22 } : {});
  def.build(root, body, paint, style);
  root.add(blobShadow(def.width, def.length));
  root.userData.body = body;
  root.userData.paint = paint;
  root.userData.def = def;
  root.userData.roofs = [];
  body.traverse((o) => { if (o.userData.roof) root.userData.roofs.push(o); });
  // per-car tail-light material so braking can brighten it
  const tail = MAT.tail.clone();
  body.traverse((o) => { if (o.isMesh && o.material === MAT.tail) o.material = tail; });
  root.userData.tail = tail;
  // keep named parts (wing, light clusters, glass) as their own groups so they can be swapped/animated,
  // but merge static meshes inside each of them and in the body (one draw call per material)
  const parts = root.userData.parts;
  if (parts) {
    const named = [parts.wing, parts.lights.front, parts.lights.rear];
    for (const g of named) g.userData.dynamic = true;
    parts.glass.userData.dynamic = true;
    mergeStatic(body);
    for (const g of named) mergeStatic(g);
  } else mergeStatic(body);
  return root;
}
