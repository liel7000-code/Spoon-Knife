// Three more original, fictional player cars built from the same lofted-body kit as the hero car:
//   - Valkor S5: a German-style four-door super-sedan
//   - Adler V8 Sport: a muscular V8 sedan with a wide front
//   - Strassen 9 Widebody: a classic rear-engine coupe with molded wide fenders
// Each wears our own fictional brand mark. Each car: body Group (rolls/pitches),
// wheels on the root, cockpit with live gauges, exhausts listed for the flames.
import * as THREE from 'three';
import { MAT } from './materials.js';
import { curve, planShape, loft, range, mesh, addWheels, lerp, sweep, airfoil, roundedPlate } from './parts.js';
import { rbox, cabinSection, roofSection, archLiners, mirrors, addCockpit, brandMark } from './carkit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ------------------------------------------------------------- materials */
const M = {
  glass: new THREE.MeshPhysicalMaterial({ color: 0x020304, roughness: 0.05, transparent: true, opacity: 0.93, envMapIntensity: 0.14, specularIntensity: 0.3, depthWrite: false }),
  grille: new THREE.MeshPhysicalMaterial({ color: 0x0b0c0e, metalness: 0.6, roughness: 0.25, clearcoat: 1 }),
  chromeSlat: new THREE.MeshStandardMaterial({ color: 0xd9dde2, metalness: 1, roughness: 0.12 }),
  ledStrip: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf4ff, emissiveIntensity: 3.2 }),
  housing: new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.85, roughness: 0.25 }),
  lens: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.2, depthWrite: false }),
  darkRed: new THREE.MeshPhysicalMaterial({ color: 0x3a0406, roughness: 0.1, clearcoat: 1 }),
  graphite: new THREE.MeshStandardMaterial({ color: 0x2c2f34, metalness: 1, roughness: 0.32 }),
  silver: new THREE.MeshStandardMaterial({ color: 0xc4c8ce, metalness: 1, roughness: 0.24 }),
  blackWheel: new THREE.MeshPhysicalMaterial({ color: 0x111215, metalness: 0.7, roughness: 0.32, clearcoat: 0.5 }),
  caliperBlue: new THREE.MeshPhysicalMaterial({ color: 0x1d4fb8, roughness: 0.3, clearcoat: 1 }),
  caliperYellow: new THREE.MeshPhysicalMaterial({ color: 0xf2c80f, roughness: 0.3, clearcoat: 1 }),
  stripe: new THREE.MeshPhysicalMaterial({ color: 0xd2261e, roughness: 0.3, clearcoat: 1 }),
};

/* ------------------------------------------------- smooth 16-point section */
// Same section as the hero car: rounded, with a character line, wheel arches cut out
// and rounded bumpers (tumblehome near the ends).
function section16(S) {
  return (z) => {
    const W = S.halfW * planShape(z, S.zF, S.zR, S.pF, S.pR);
    const top = S.top(z), crown = S.crown(z), belt = Math.max(S.belt(z), top + crown);
    const floor = S.floor(z), bulge = S.bulge(z) * (W / S.halfW);
    let rock = S.rocker(z), xIn = W * 0.93;
    for (const a of S.arches) {
      const dz = z - a.z;
      if (Math.abs(dz) < a.r) { const h = a.cy + Math.sqrt(a.r * a.r - dz * dz); if (h > rock) { rock = h; xIn = Math.min(xIn, a.inner); } }
    }
    rock = Math.min(rock, belt - 0.07);
    xIn = Math.max(0.02, Math.min(xIn, W * 0.93));
    const bt = belt + 0.03, cy = top + crown;
    const half = (S.zR - S.zF) / 2, mid = (S.zR + S.zF) / 2, zn = Math.abs(z - mid) / half;
    const e = (zn < 0.8 ? 0 : Math.min(1, (zn - 0.8) / 0.2)) * (z > mid ? S.endRear ?? 1 : S.endFront ?? 0.35);
    const lo = 1 - 0.16 * e * e, hi = 1 - 0.1 * e * e;
    const roll = (f) => cy + (bt - cy) * Math.pow(f / 0.9, S.flat ?? 2.5);
    return [
      [0, floor], [Math.min(xIn, W * 0.93 * lo), floor], [Math.min(xIn, W * 0.93 * lo), rock], [W * 0.955 * lo, rock], [W * 0.99 * lerp(lo, 1, 0.5), rock + 0.035],
      [W + bulge * 0.7, lerp(rock, belt, 0.25)], [W + bulge, lerp(rock, belt, 0.5)], [W * lerp(hi, 1, 0.3) + bulge * 0.6, lerp(rock, belt, 0.76)],
      [W * 0.99 * hi, belt - 0.025], [W * 0.955 * hi, belt + 0.012], [W * 0.9 * hi, bt],
      [W * 0.78, roll(0.78)], [W * 0.6, roll(0.6)], [W * 0.4, roll(0.4)], [W * 0.2, roll(0.2)], [0, cy],
    ];
  };
}

function surfaceY(sec, z, x) {
  const pts = sec(z).slice(10), ax = Math.abs(x);
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    if (ax <= x0 && ax >= x1) return lerp(y1, y0, (ax - x1) / (x0 - x1 || 1));
  }
  return pts[pts.length - 1][1];
}
// side surface x at a given z (character-line point)
const sideX = (sec, z) => sec(z)[6][0];
// end-face z for a given x (front if !rear)
function endZ(S, x, rear) {
  const f = Math.min(0.999, Math.abs(x) / S.halfW), p = rear ? S.pR : S.pF;
  const half = (S.zR - S.zF) / 2, mid = (S.zR + S.zF) / 2;
  return mid + (rear ? 1 : -1) * half * Math.pow(1 - Math.pow(f, p), 1 / p);
}

// faces forward (-z) after wrapping a +z-facing part; yaw turns it outward, pitch tilts it up
function facingFront(part, yaw, pitch) {
  const o = new THREE.Group(), i = new THREE.Group();
  o.rotation.y = Math.PI - yaw; i.rotation.x = -pitch;
  i.add(part); o.add(i);
  return o;
}

// body + tinted glass + painted roof + dark arch liners
function shell(root, body, S, paint) {
  const sec = section16(S);
  const b = mesh(loft(range(S.zF, S.zR, 240), sec), paint);
  b.name = 'body.shell'; b.receiveShadow = true;
  body.add(b);
  const glass = mesh(loft(range(S.cabF, S.cabR, 110), cabinSection(S)), M.glass);
  glass.name = 'glass'; glass.renderOrder = 2;
  body.add(glass);
  const roof = mesh(loft(range(S.roofF, S.roofR, 60), roofSection(S)), paint);
  roof.userData.roof = true; roof.name = 'body.roof';
  body.add(roof);
  archLiners(body, S);
  return sec;
}

// thin dark strips: door shut lines, window belt trim, pillar
function doorLines(body, sec, zs, yTop = 0.86) {
  for (const s of [-1, 1]) for (const z of zs) body.add(mesh(new THREE.BoxGeometry(0.004, yTop - 0.3, 0.004), MAT.plastic, s * (sideX(sec, z) + 0.002), (yTop + 0.3) / 2, z, false));
}
function beltTrim(body, S, z0, z1, mat = MAT.satin) {
  for (const s of [-1, 1]) {
    const pts = range(z0, z1, 24).map((z) => V(s * (S.cabBase(z) + 0.008), S.top(z) + 0.035, z));
    body.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.012, 6), mat, 0, 0, 0, false));
  }
}
function pillar(body, S, z, mat = MAT.satin) {
  for (const s of [-1, 1]) {
    const p = mesh(new THREE.BoxGeometry(0.022, (S.roof(z) - S.top(z)) * 0.95, 0.08), mat, s * (lerp(S.cabBase(z), S.cabRoof(z), 0.5) + 0.018), lerp(S.top(z), S.roof(z), 0.5), z, false);
    p.rotation.z = s * -0.28; body.add(p);
  }
}
function exhaustTip(body, x, y, z, r = 0.042, len = 0.12) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  g.add(mesh(new THREE.CylinderGeometry(r, r, len, 28, 1, true).rotateX(Math.PI / 2), MAT.chrome, 0, 0, 0, false));
  g.add(mesh(new THREE.TorusGeometry(r, r * 0.12, 8, 28), MAT.chrome, 0, 0, len / 2, false));
  g.add(mesh(new THREE.CircleGeometry(r * 0.88, 24), MAT.soot, 0, 0, len / 4, false));
  body.add(g);
  return V(x, y, z + len / 2 + 0.02);
}

/* ================================================================= Valkor S5 */
export function buildValkor(root, body, paint) {
  const S = {
    zF: -2.485, zR: 2.485, halfW: 0.925, pF: 4.2, pR: 7, endFront: 0.4, endRear: 0.5, flat: 3,
    top: curve([[-2.485, 0.6], [-2.42, 0.68], [-2.25, 0.75], [-1.6, 0.83], [-0.95, 0.92], [-0.7, 0.95], [1.4, 1.0], [1.75, 1.02], [2.25, 1.03], [2.42, 0.99], [2.485, 0.9]]),
    crown: curve([[-2.485, 0], [-2.1, -0.012], [-1.0, -0.012], [-0.75, 0], [1.6, 0.004], [2.485, 0]]),
    belt: curve([[-2.485, 0.6], [-2.3, 0.73], [-1.55, 0.83], [-0.95, 0.9], [0.5, 0.97], [1.42, 1.0], [2.3, 1.015], [2.485, 0.93]]),
    floor: curve([[-2.485, 0.24], [-2.3, 0.14], [2.3, 0.15], [2.485, 0.3]]),
    rocker: curve([[-2.485, 0.28], [-2.25, 0.2], [2.3, 0.21], [2.485, 0.34]]),
    bulge: curve([[-2.485, 0], [-1.95, 0.014], [-1.555, 0.026], [-1.0, 0.008], [0.6, 0.008], [1.425, 0.028], [2.0, 0.014], [2.485, 0]]),
    arches: [{ z: -1.555, cy: 0.355, r: 0.4, inner: 0.66 }, { z: 1.425, cy: 0.355, r: 0.405, inner: 0.66 }],
    cabF: -1.0, cabR: 1.78, roofF: -0.22, roofR: 1.22,
    roof: curve([[-1.0, 0.92], [-0.82, 1.0], [-0.22, 1.405], [0.3, 1.45], [0.95, 1.44], [1.25, 1.38], [1.55, 1.2], [1.78, 1.04]]),
    cabBase: curve([[-1.0, 0.7], [-0.5, 0.77], [1.2, 0.77], [1.78, 0.64]]),
    cabRoof: curve([[-1.0, 0.62], [-0.2, 0.64], [1.1, 0.62], [1.78, 0.55]]),
  };
  const sec = shell(root, body, S, paint);
  const fz = (x) => endZ(S, x, false), rz = (x) => endZ(S, x, true);
  beltTrim(body, S, -0.9, 1.62, M.grille);
  pillar(body, S, 0.42, M.grille);
  doorLines(body, sec, [-0.86, 0.42, 1.32], 0.92);
  // one wide trapezoid grille with horizontal bars, brand mark in the middle
  {
    const g = new THREE.Group();
    const tz = new THREE.Shape([new THREE.Vector2(-0.36, -0.08), new THREE.Vector2(0.36, -0.08), new THREE.Vector2(0.3, 0.08), new THREE.Vector2(-0.3, 0.08)]);
    g.add(mesh(new THREE.ExtrudeGeometry(tz, { depth: 0.03, bevelEnabled: false }), M.grille, 0, 0, -0.01, false));
    for (let i = -2; i <= 2; i++) g.add(mesh(new THREE.BoxGeometry(0.62 - Math.abs(i) * 0.02, 0.01, 0.012), MAT.satin, 0, i * 0.03, 0.026, false));
    const mk = brandMark('valkor', 0.9); mk.position.z = 0.03; g.add(mk);
    const gw = facingFront(g, 0, 0.18); gw.position.set(0, 0.62, fz(0) + 0.012); body.add(gw);
  }
  // thin headlights with arrow-shaped (chevron) LED daytime lights
  for (const s of [-1, 1]) {
    const h = new THREE.Group();
    h.add(mesh(roundedPlate(0.44, 0.09, 0.03, 0.02), M.housing, 0, 0, 0, false));
    for (const d of [-1, 1]) { const c = mesh(new THREE.BoxGeometry(0.11, 0.009, 0.01), M.ledStrip, s * (0.11 + d * 0.04), d * 0.013, 0.024, false); c.rotation.z = d * s * 0.5; h.add(c); }
    h.add(mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.01, 16).rotateX(Math.PI / 2), MAT.head, s * -0.08, 0, 0.022, false));
    h.add(mesh(roundedPlate(0.45, 0.095, 0.03, 0.01, 0.004), M.lens, 0, 0, 0.03, false));
    h.rotation.z = s * -0.08;
    const hw = facingFront(h, s * 0.32, 0.35); hw.position.set(s * 0.6, 0.69, fz(0.6) + 0.03); body.add(hw);
    // big lower intakes
    const intake = facingFront(mesh(roundedPlate(0.36, 0.17, 0.05, 0.06), M.grille, 0, 0, 0, false), s * 0.25, 0.05);
    intake.position.set(s * 0.6, 0.36, fz(0.6) + 0.02); body.add(intake);
    // one vertical air outlet behind each front wheel
    body.add(mesh(rbox(0.012, 0.16, 0.05, 0.005), M.grille, s * (sideX(sec, -1.0) + 0.004), 0.55, -1.0, false));
  }
  const ci = facingFront(mesh(roundedPlate(0.5, 0.1, 0.04, 0.06), M.grille, 0, 0, 0, false), 0, 0.05); ci.position.set(0, 0.32, fz(0) - 0.0); body.add(ci);
  body.add(mesh(roundedPlate(1.7, 0.16, 0.06, 0.016, 0.004).rotateX(Math.PI / 2), MAT.carbon, 0, 0.16, -2.38, false));
  mirrors(body, paint, 1.0, 1.0, -0.72, 1.15);
  // rear: one continuous light bar across the trunk, lip spoiler, diffuser, quad tips
  body.add(mesh(roundedPlate(1.56, 0.07, 0.03, 0.02), M.darkRed, 0, 0.9, rz(0) - 0.035, false));
  body.add(mesh(new THREE.BoxGeometry(1.5, 0.014, 0.01), MAT.tail, 0, 0.9, rz(0) - 0.015, false));
  for (const s of [-1, 1]) { const e = mesh(roundedPlate(0.16, 0.07, 0.03, 0.02), M.darkRed, s * 0.74, 0.9, rz(0.74) - 0.04, false); e.rotation.y = s * 0.5; body.add(e); }
  const vr = brandMark('valkor', 0.9); vr.position.set(0, 0.73, rz(0) + 0.004); body.add(vr);
  body.add(mesh(roundedPlate(1.2, 0.05, 0.12, 0.02).rotateX(-Math.PI / 2.2), paint, 0, S.top(2.38) + 0.02, 2.36));
  body.add(mesh(roundedPlate(1.4, 0.14, 0.05, 0.05), MAT.carbon, 0, 0.26, rz(0) - 0.03, false));
  body.add(mesh(new THREE.BoxGeometry(0.52, 0.12, 0.02), MAT.plate, 0, 0.56, rz(0) + 0.005, false));
  const tips = [];
  for (const s of [-1, 1]) for (const x of [0.5, 0.63]) tips.push(exhaustTip(body, s * x, 0.25, rz(x) - 0.06, 0.04));
  root.userData.exhausts = tips; root.userData.exhaust = tips[0];
  addWheels(root, { front: -1.555, rear: 1.425, track: 0.8, r: 0.355, rimR: 0.255, width: 0.27, spokes: 10, style: 'double', rimMat: M.graphite, caliper: M.caliperBlue, sidewall: true });
  addCockpit(root, body, { eye: { x: -0.38, y: 1.18, z: 0.5 }, dashZ: -0.5, dashY: 1.0, maxKmh: 330, roof: S.roof });
}

/* ============================================================ Adler V8 Sport */
export function buildAdler(root, body, paint) {
  const S = {
    zF: -2.375, zR: 2.375, halfW: 0.9, pF: 4, pR: 7, endFront: 0.4, endRear: 0.55, flat: 3,
    top: curve([[-2.375, 0.6], [-2.3, 0.68], [-2.1, 0.75], [-1.5, 0.83], [-0.88, 0.91], [-0.65, 0.94], [1.15, 0.99], [1.4, 1.005], [2.15, 1.015], [2.32, 0.97], [2.375, 0.88]]),
    crown: curve([[-2.375, 0], [-2.0, -0.02], [-1.0, -0.02], [-0.7, 0], [2.375, 0]]),
    belt: curve([[-2.375, 0.6], [-2.2, 0.74], [-1.545, 0.84], [-0.88, 0.9], [0.5, 0.96], [1.3, 0.99], [2.2, 1.0], [2.375, 0.91]]),
    floor: curve([[-2.375, 0.24], [-2.2, 0.14], [2.2, 0.15], [2.375, 0.3]]),
    rocker: curve([[-2.375, 0.27], [-2.15, 0.2], [2.2, 0.21], [2.375, 0.34]]),
    // widebody front: strong flare over the front wheels
    bulge: curve([[-2.375, 0], [-2.0, 0.026], [-1.545, 0.046], [-1.0, 0.016], [0.6, 0.008], [1.295, 0.03], [1.9, 0.014], [2.375, 0]]),
    arches: [{ z: -1.545, cy: 0.345, r: 0.4, inner: 0.65 }, { z: 1.295, cy: 0.345, r: 0.4, inner: 0.65 }],
    cabF: -0.92, cabR: 1.66, roofF: -0.16, roofR: 1.14,
    roof: curve([[-0.92, 0.9], [-0.74, 0.98], [-0.16, 1.37], [0.35, 1.41], [0.9, 1.4], [1.18, 1.33], [1.45, 1.15], [1.66, 1.01]]),
    cabBase: curve([[-0.92, 0.68], [-0.5, 0.75], [1.1, 0.75], [1.66, 0.63]]),
    cabRoof: curve([[-0.92, 0.6], [-0.16, 0.62], [1.0, 0.61], [1.66, 0.55]]),
  };
  const sec = shell(root, body, S, paint);
  const fz = (x) => endZ(S, x, false), rz = (x) => endZ(S, x, true);
  beltTrim(body, S, -0.82, 1.52, MAT.chrome);
  pillar(body, S, 0.4, M.grille);
  doorLines(body, sec, [-0.8, 0.4, 1.24], 0.91);
  // twin power bulges on the hood
  for (const s of [-1, 1]) {
    const bul = loft(range(-2.0, -1.0, 30), (z) => {
      const x0 = s * 0.24, w = 0.11 * Math.sin(Math.PI * Math.min(1, (z + 2.0) / 1.0)) + 0.02, y = surfaceY(sec, z, 0.24);
      return [[0, y - 0.01], [w, y - 0.01], [w, y + 0.004], [w * 0.5, y + 0.022], [0, y + 0.026]].map(([x, yy]) => [x, yy]);
    });
    const m = mesh(bul, paint, s * 0.24, 0, 0); body.add(m);
  }
  // hexagonal honeycomb grille crossed by one thick body-colour blade with our brand mark
  const g = new THREE.Group();
  g.add(mesh(roundedPlate(0.7, 0.24, 0.06, 0.03), M.grille, 0, 0, 0, false));
  const hexGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.01, 6).rotateX(Math.PI / 2);
  for (let r = -2; r <= 2; r++) for (let c = -7; c <= 7; c++) g.add(mesh(hexGeo, MAT.satin, c * 0.042 + (r & 1) * 0.021, r * 0.04, 0.024, false));
  g.add(mesh(rbox(0.7, 0.04, 0.03, 0.012), paint, 0, 0.0, 0.035, false));
  const am = brandMark('adler', 0.8); am.position.set(0, 0, 0.052); g.add(am);
  const gw = facingFront(g, 0, 0.12); gw.position.set(0, 0.6, fz(0) + 0.025); body.add(gw);
  // split headlights: a slim LED brow on top, a separate square projector pod below it
  for (const s of [-1, 1]) {
    const h = new THREE.Group();
    h.add(mesh(roundedPlate(0.42, 0.045, 0.025, 0.015), M.housing, 0, 0.03, 0, false));
    h.add(mesh(new THREE.BoxGeometry(0.38, 0.012, 0.01), M.ledStrip, 0, 0.03, 0.022, false));
    h.add(mesh(roundedPlate(0.13, 0.07, 0.03, 0.012), M.housing, s * 0.12, -0.04, 0, false));
    h.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.012, 16).rotateX(Math.PI / 2), MAT.head, s * 0.12, -0.04, 0.022, false));
    h.add(mesh(roundedPlate(0.43, 0.13, 0.025, 0.01, 0.004), M.lens, 0, -0.005, 0.03, false));
    h.rotation.z = s * -0.1;
    const hw = facingFront(h, s * 0.36, 0.38); hw.position.set(s * 0.58, 0.69, fz(0.58) + 0.03); body.add(hw);
    const intake = facingFront(mesh(roundedPlate(0.3, 0.15, 0.04, 0.05), M.grille, 0, 0, 0, false), s * 0.3, 0.05);
    intake.position.set(s * 0.6, 0.34, fz(0.6) + 0.02); body.add(intake);
  }
  const lowerG = facingFront(mesh(roundedPlate(0.8, 0.11, 0.04, 0.05), M.grille, 0, 0, 0, false), 0, 0.05); lowerG.position.set(0, 0.3, fz(0)); body.add(lowerG);
  body.add(mesh(roundedPlate(1.64, 0.15, 0.06, 0.016, 0.004).rotateX(Math.PI / 2), MAT.carbon, 0, 0.17, -2.27, false));
  mirrors(body, paint, 0.98, 0.98, -0.66, 1.1);
  // rear: C-shaped bracket tail lights, small trunk spoiler, finned diffuser, quad round tips
  for (const s of [-1, 1]) {
    const t = new THREE.Group();
    t.add(mesh(roundedPlate(0.4, 0.12, 0.03, 0.03), M.darkRed, 0, 0, 0, false));
    // C bracket: top bar, bottom bar and the outer upright, open towards the middle
    t.add(mesh(new THREE.BoxGeometry(0.32, 0.014, 0.01), MAT.tail, s * 0.02, 0.04, 0.02, false));
    t.add(mesh(new THREE.BoxGeometry(0.32, 0.014, 0.01), MAT.tail, s * 0.02, -0.04, 0.02, false));
    t.add(mesh(new THREE.BoxGeometry(0.014, 0.094, 0.01), MAT.tail, s * 0.175, 0, 0.02, false));
    t.position.set(s * 0.6, 0.88, rz(0.6) - 0.04); t.rotation.y = s * 0.45; body.add(t);
  }
  body.add(mesh(roundedPlate(1.1, 0.045, 0.1, 0.02).rotateX(-Math.PI / 2.3), paint, 0, S.top(2.28) + 0.02, 2.27));
  body.add(mesh(roundedPlate(1.36, 0.16, 0.05, 0.05), MAT.carbon, 0, 0.25, rz(0) - 0.035, false));
  const ar = brandMark('adler', 0.85); ar.position.set(0, 0.76, rz(0) + 0.004); body.add(ar);
  for (let i = -3; i <= 3; i++) body.add(mesh(new THREE.BoxGeometry(0.012, 0.12, 0.1), MAT.carbon, i * 0.1, 0.22, rz(0) - 0.02, false));
  body.add(mesh(new THREE.BoxGeometry(0.52, 0.12, 0.02), MAT.plate, 0, 0.54, rz(0) + 0.005, false));
  const tips = [];
  for (const s of [-1, 1]) for (const x of [0.46, 0.6]) tips.push(exhaustTip(body, s * x, 0.24, rz(x) - 0.06, 0.045));
  root.userData.exhausts = tips; root.userData.exhaust = tips[0];
  addWheels(root, { front: -1.545, rear: 1.295, track: 0.79, r: 0.345, rimR: 0.245, width: 0.265, spokes: 5, style: 'double', rimMat: M.silver, caliper: MAT.caliperRed, sidewall: true });
  addCockpit(root, body, { eye: { x: -0.37, y: 1.14, z: 0.48 }, dashZ: -0.48, dashY: 0.98, maxKmh: 320, roof: S.roof });
}

/* ======================================================= Strassen 9 Widebody */
export function buildStrassen(root, body, paint) {
  // our own classic rear-engine coupe: wedge nose, notched squarer roofline,
  // louvered rear glass, molded wide fenders and a louvered ducktail
  const S = {
    zF: -2.12, zR: 2.12, halfW: 0.84, pF: 4.4, pR: 6, endFront: 0.5, endRear: 0.7, flat: 2.6,
    top: curve([[-2.12, 0.46], [-2.05, 0.56], [-1.8, 0.62], [-1.2, 0.68], [-0.7, 0.75], [-0.55, 0.78], [1.2, 0.8], [1.6, 0.78], [1.95, 0.72], [2.08, 0.64], [2.12, 0.56]]),
    // nearly flat hood: the lamps sit in the nose, not on raised fenders
    crown: curve([[-2.12, 0], [-1.9, -0.015], [-1.2, -0.02], [-0.7, -0.005], [-0.5, 0], [1.4, 0.02], [2.12, 0]]),
    belt: curve([[-2.12, 0.46], [-1.95, 0.64], [-1.4, 0.74], [-0.7, 0.78], [0.6, 0.8], [1.15, 0.84], [1.7, 0.82], [2.0, 0.74], [2.12, 0.6]]),
    floor: curve([[-2.12, 0.18], [-1.95, 0.1], [1.95, 0.1], [2.12, 0.2]]),
    rocker: curve([[-2.12, 0.2], [-1.9, 0.13], [1.9, 0.13], [2.12, 0.22]]),
    bulge: curve([[-2.12, 0], [-1.7, 0.03], [-1.3, 0.045], [-0.8, 0.012], [0.5, 0.012], [1.0, 0.05], [1.5, 0.05], [2.12, 0]]),
    arches: [{ z: -1.3, cy: 0.31, r: 0.37, inner: 0.6 }, { z: 0.97, cy: 0.31, r: 0.38, inner: 0.6 }],
    cabF: -0.6, cabR: 1.9, roofF: 0.0, roofR: 1.12,
    roof: curve([[-0.6, 0.77], [-0.45, 0.86], [-0.05, 1.13], [0.3, 1.18], [0.95, 1.18], [1.15, 1.13], [1.35, 1.0], [1.9, 0.86]]),
    cabBase: curve([[-0.6, 0.6], [-0.3, 0.66], [0.8, 0.67], [1.5, 0.62], [1.9, 0.5]]),
    cabRoof: curve([[-0.6, 0.56], [0.0, 0.56], [0.8, 0.55], [1.5, 0.5], [1.9, 0.44]]),
  };
  const sec = shell(root, body, S, paint);
  const fz = (x) => endZ(S, x, false), rz = (x) => endZ(S, x, true);
  pillar(body, S, 0.62, MAT.chrome);
  beltTrim(body, S, -0.52, 1.6, MAT.chrome);
  doorLines(body, sec, [-0.6, 0.62], 0.8);
  // simple livery stripe over the nose, roof and engine lid
  const band = (z0, z1, yAt) => loft(range(z0, z1, 60), (z) => { const y = yAt(z); return [[0, y - 0.004], [0.11, y - 0.006], [0.11, y + 0.001], [0.05, y + 0.003], [0, y + 0.003]]; });
  for (const g of [band(-2.02, S.cabF - 0.02, (z) => surfaceY(sec, z, 0) + 0.005), band(S.roofF + 0.04, S.roofR - 0.04, (z) => S.roof(z) + 0.008), band(S.cabR + 0.02, 2.04, (z) => surfaceY(sec, z, 0) + 0.005)])
    body.add(mesh(g, M.stripe, 0, 0, 0, false));
  // rounded-rectangle headlights recessed into the nose, with a short LED brow
  for (const s of [-1, 1]) {
    const h = new THREE.Group();
    h.add(mesh(roundedPlate(0.3, 0.1, 0.03, 0.03), M.housing, 0, 0, 0, false));
    h.add(mesh(new THREE.BoxGeometry(0.24, 0.01, 0.01), M.ledStrip, 0, 0.032, 0.024, false));
    for (const x of [-0.07, 0.07]) h.add(mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.01, 18).rotateX(Math.PI / 2), MAT.head, x, -0.01, 0.022, false));
    h.add(mesh(roundedPlate(0.31, 0.105, 0.03, 0.03, 0.004), M.lens, 0, 0, 0.03, false));
    const hw = facingFront(h, s * 0.35, 0.6); hw.position.set(s * 0.56, 0.5, fz(0.56) + 0.04); body.add(hw);
    const ind = facingFront(mesh(roundedPlate(0.14, 0.06, 0.025, 0.02), MAT.amber, 0, 0, 0, false), s * 0.3, 0.05);
    ind.position.set(s * 0.6, 0.36, fz(0.6) + 0.015); body.add(ind);
  }
  const sm = facingFront(brandMark('strassen', 0.85), 0, 0.5); sm.position.set(0, surfaceY(sec, -1.98, 0) + 0.006, -1.98); body.add(sm);
  const oval = facingFront(mesh(roundedPlate(0.5, 0.09, 0.045, 0.04), M.grille, 0, 0, 0, false), 0, 0.05); oval.position.set(0, 0.3, fz(0)); body.add(oval);
  // front lip splitter + side skirts
  body.add(mesh(roundedPlate(1.6, 0.2, 0.08, 0.02, 0.005).rotateX(Math.PI / 2), MAT.carbon, 0, 0.12, -2.03, true));
  for (const s of [-1, 1]) body.add(mesh(rbox(0.06, 0.07, 1.5, 0.025), MAT.carbon, s * 0.84, 0.15, -0.15));
  mirrors(body, paint, 0.86, 0.86, -0.32, 1.0);
  // molded wide fenders: smooth arch lips blended into the body (no bolts, no separate kit)
  const flare = (zc, r, wx, out) => {
    for (const s of [-1, 1]) {
      const pts = [];
      for (let k = 0; k <= 20; k++) { const a = Math.PI * (1.1 - k * 1.2 / 20); pts.push(V(s * wx, 0.31 + Math.sin(a) * (r + 0.04), zc + Math.cos(a) * (r + 0.04))); }
      const g = sweep(pts, V(1, 0, 0), () => [[-s * 0.04, -0.07], [s * out * 0.7, -0.04], [s * out, 0.0], [s * out * 0.7, 0.03], [-s * 0.04, 0.07]].map(([a, b]) => (s < 0 ? [a, -b] : [a, b])), 50);
      body.add(mesh(g, paint));
    }
  };
  flare(-1.3, 0.37, 0.8, 0.07);
  flare(0.97, 0.38, 0.84, 0.11);
  // louvered rear glass: horizontal slats over the back window
  for (let k = 0; k < 7; k++) {
    const z = 1.42 + k * 0.065, y = S.roof(z) + 0.012, w = S.cabRoof(z) * 2 - 0.04;
    const l = mesh(new THREE.BoxGeometry(w, 0.008, 0.05), MAT.satin, 0, y, z, false); l.rotation.x = -0.3; body.add(l);
  }
  // separate rectangular tail lamps with a ribbed dark panel between them
  for (const s of [-1, 1]) {
    body.add(mesh(roundedPlate(0.3, 0.09, 0.03, 0.015), M.darkRed, s * 0.56, 0.66, rz(0.56) - 0.04, false));
    body.add(mesh(new THREE.BoxGeometry(0.26, 0.03, 0.012), MAT.tail, s * 0.56, 0.665, rz(0.56) - 0.022, false));
  }
  body.add(mesh(roundedPlate(0.76, 0.08, 0.025, 0.01), MAT.satin, 0, 0.66, rz(0) - 0.045, false));
  for (let k = -5; k <= 5; k++) body.add(mesh(new THREE.BoxGeometry(0.008, 0.06, 0.012), MAT.plastic, k * 0.065, 0.66, rz(0) - 0.03, false));
  const sr = brandMark('strassen', 0.85); sr.position.set(0, 0.55, rz(0) - 0.01); body.add(sr);
  // louvered ducktail engine lid (no raised wing)
  const duckY = S.top(1.92) + 0.035;
  body.add(mesh(roundedPlate(1.24, 0.045, 0.24, 0.02).rotateX(-Math.PI / 2.5), paint, 0, duckY, 1.94));
  for (let k = -4; k <= 4; k++) body.add(mesh(new THREE.BoxGeometry(0.012, 0.02, 0.16), MAT.plastic, k * 0.1, S.top(1.7) + 0.012, 1.7, false));
  body.add(mesh(new THREE.BoxGeometry(0.46, 0.11, 0.02), MAT.plate, 0, 0.42, rz(0) - 0.01, false));
  // rear engine: twin tips low at the rear centre
  const tips = [exhaustTip(body, -0.07, 0.17, rz(0) - 0.05, 0.038, 0.1), exhaustTip(body, 0.07, 0.17, rz(0) - 0.05, 0.038, 0.1)];
  root.userData.exhausts = tips; root.userData.exhaust = tips[0];
  // wide dished wheels, slight negative camber, low stance
  addWheels(root, { front: -1.3, rear: 0.97, track: 0.82, r: 0.315, rimR: 0.23, width: 0.3, spokes: 6, style: 'dish', rimMat: M.silver, caliper: M.caliperYellow, sidewall: true });
  root.userData.wheels.forEach((w, i) => { w.position.x *= i >= 2 ? 1.04 : 1; w.rotation.z = (w.position.x > 0 ? -1 : 1) * 0.06 * (w.userData.sign || 1); });
  body.userData.baseY = -0.02;
  body.position.y = body.userData.baseY;
  addCockpit(root, body, { eye: { x: -0.36, y: 0.98, z: 0.5 }, dashZ: -0.3, dashY: 0.8, maxKmh: 300, roof: S.roof });
}
