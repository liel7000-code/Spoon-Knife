// Toyota Supra A80 (1993-2002), modelled from reference photos.
// Dimensions: 4.52 m long, 1.81 m wide, 1.27 m tall, 2.55 m wheelbase.
// Two styles: 'stock' (white hoop wing, champagne 5-spoke dished wheels) and
// 'tuned' (carbon GT wing on swan necks, carbon hood, black 6-spoke wheels,
// yellow calipers, lowered).
//
// Named parts: body, glass, wing, lights.front/rear, wheels (on the root).
import * as THREE from 'three';
import { MAT } from './materials.js';
import { curve, planShape, loft, range, mesh, addWheels, lerp, sweep, airfoil, roundedPlate } from './parts.js';
import { rbox, cabinSection, roofSection, archLiners, mirrors, addCockpit } from './carkit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ------------------------------------------------------------ materials */
// darker tint than the shared glass: the interior only shows faintly
const SUPRA_GLASS = new THREE.MeshPhysicalMaterial({ color: 0x010203, roughness: 0.06, transparent: true, opacity: 0.94, envMapIntensity: 0.14, specularIntensity: 0.6, depthWrite: false }); // low specular: dark tint even at grazing angles

const SM = {
  carbon: (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 8) {
      const odd = ((x + y) / 8) % 2;
      const grd = g.createLinearGradient(x, y, x + 8, y + 8);
      grd.addColorStop(0, odd ? '#2a2c30' : '#141517'); grd.addColorStop(1, odd ? '#16171a' : '#26282c');
      g.fillStyle = grd; g.fillRect(x, y, 8, 8);
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshPhysicalMaterial({ map: t, metalness: 0.35, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.04 });
  })(),
  champagne: new THREE.MeshStandardMaterial({ color: 0xcdb990, metalness: 1, roughness: 0.26 }),
  blackWheel: new THREE.MeshPhysicalMaterial({ color: 0x0d0e10, metalness: 0.6, roughness: 0.35, clearcoat: 0.6 }),
  caliperYellow: new THREE.MeshPhysicalMaterial({ color: 0xf2c80f, roughness: 0.3, clearcoat: 1 }),
  smoke: new THREE.MeshPhysicalMaterial({ color: 0x2a2c30, roughness: 0.08, clearcoat: 1, metalness: 0.4 }),
  // tinted outer lens over each lamp: makes the lamps read as smoked glass
  smokeLens: new THREE.MeshPhysicalMaterial({ color: 0x0a0a0c, roughness: 0.02, transparent: true, opacity: 0.55, clearcoat: 1, depthWrite: false }),
  smokedLens: new THREE.MeshPhysicalMaterial({ color: 0x2a0508, emissive: 0x5a0306, emissiveIntensity: 0.6, roughness: 0.08, clearcoat: 1 }),
  lampRed: new THREE.MeshStandardMaterial({ color: 0x5a0a0c, emissive: 0xff2016, emissiveIntensity: 0.9, roughness: 0.3 }),
  lampClear: new THREE.MeshPhysicalMaterial({ color: 0x3a3f48, emissive: 0x1a2030, emissiveIntensity: 0.3, roughness: 0.08, metalness: 0.4, clearcoat: 1 }),
  lampAmber: new THREE.MeshStandardMaterial({ color: 0x3a1a04, emissive: 0xff6a10, emissiveIntensity: 0.12, roughness: 0.15 }),
  chromeRing: new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 1, roughness: 0.15 }),
  housing: new THREE.MeshStandardMaterial({ color: 0x1b1d21, metalness: 0.9, roughness: 0.25 }),
  mesh: (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 64, 64);
    g.strokeStyle = '#2b2d31'; g.lineWidth = 3;
    for (let i = -64; i < 128; i += 10) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(14, 2);
    return new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.3, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide });
  })(),
  intercooler: (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 32;
    const g = c.getContext('2d');
    g.fillStyle = '#8b9096'; g.fillRect(0, 0, 128, 32);
    g.fillStyle = '#4a4e54'; for (let x = 0; x < 128; x += 3) g.fillRect(x, 0, 1, 32);
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(6, 1); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, metalness: 0.8, roughness: 0.4 });
  })(),
  seat: new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.75 }),
};

// chrome italic script badge (e.g. "Supra") on a transparent plane
function scriptBadge(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 72;
  const g = c.getContext('2d');
  g.font = 'italic bold 52px "Brush Script MT", "Segoe Script", Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const grd = g.createLinearGradient(0, 10, 0, 62);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.5, '#9aa0a8'); grd.addColorStop(1, '#e8ecf0');
  g.fillStyle = grd; g.fillText(text, 128, 38);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, transparent: true, metalness: 0.8, roughness: 0.2, depthWrite: false });
}

function plateTexture(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; // 2x for a crisp plate
  const g = c.getContext('2d');
  g.scale(2, 2);
  g.fillStyle = '#f4f4f2'; g.fillRect(0, 0, 256, 64);
  g.strokeStyle = '#1a1a1a'; g.lineWidth = 3; g.strokeRect(3, 3, 250, 58);
  g.fillStyle = '#111'; g.font = 'bold 44px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 35);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: t, color: 0xc8c8c8, roughness: 0.5, metalness: 0.1 }); // not glaring white
}

// Toyota's three-ellipse emblem, facing +z
function emblem(scale = 1) {
  const g = new THREE.Group();
  // thin elliptical rings: tube thickness is given in metres, then the ring is stretched to rx/ry
  const ring = (rx, ry, t) => { const m = new THREE.Mesh(new THREE.TorusGeometry(1, t / rx, 6, 40), SM.chromeRing); m.scale.set(rx, ry, 0.006 / (t / rx)); return m; };
  g.add(ring(0.06, 0.04, 0.006), ring(0.036, 0.015, 0.005), ring(0.017, 0.032, 0.005));
  g.children[1].position.y = 0.018;
  g.scale.setScalar(scale);
  return g;
}

/* ----------------------------------------------------------- body shape */
// Profile curves measured from the side photo (z: front -2.26 .. rear +2.26)
const S = {
  zF: -2.26, zR: 2.26, halfW: 0.885, pF: 3.8, pR: 6.5,
  top: curve([[-2.26, 0.42], [-2.2, 0.52], [-2.08, 0.6], [-1.85, 0.645], [-1.36, 0.7], [-0.76, 0.79], [-0.5, 0.82], [1.6, 0.875], [1.8, 0.88], [2.0, 0.865], [2.14, 0.84], [2.22, 0.8], [2.26, 0.74]]),
  crown: curve([[-2.26, 0], [-2.0, -0.012], [-1.36, -0.028], [-0.8, -0.02], [-0.55, 0], [1.4, 0], [1.7, -0.022], [2.1, -0.015], [2.26, 0]]),
  belt: curve([[-2.26, 0.5], [-2.15, 0.6], [-1.8, 0.675], [-1.36, 0.725], [-0.76, 0.785], [0.0, 0.86], [0.6, 0.9], [1.0, 0.93], [1.4, 0.92], [2.0, 0.9], [2.26, 0.82]]),
  floor: curve([[-2.26, 0.2], [-2.1, 0.13], [-1.9, 0.12], [2.0, 0.14], [2.15, 0.2], [2.26, 0.28]]),
  rocker: curve([[-2.26, 0.22], [-2.05, 0.17], [2.0, 0.18], [2.15, 0.22], [2.26, 0.3]]),
  bulge: curve([[-2.26, 0], [-1.8, 0.016], [-1.36, 0.026], [-0.8, 0.006], [0.3, 0.004], [0.9, 0.02], [1.22, 0.044], [1.75, 0.038], [2.1, 0.02], [2.26, 0]]),
  arches: [{ z: -1.33, cy: 0.335, r: 0.39, inner: 0.62 }, { z: 1.22, cy: 0.335, r: 0.395, inner: 0.62 }],
  // bubble cabin, narrower than the body
  cabF: -0.8, cabR: 1.76, roofF: -0.1, roofR: 0.8,
  roof: curve([[-0.8, 0.8], [-0.6, 0.9], [-0.12, 1.235], [0.35, 1.27], [0.7, 1.24], [1.0, 1.16], [1.35, 1.05], [1.6, 0.95], [1.76, 0.89]]),
  cabBase: curve([[-0.8, 0.64], [-0.4, 0.72], [0.5, 0.745], [1.3, 0.72], [1.76, 0.6]]),
  cabRoof: curve([[-0.8, 0.6], [-0.12, 0.6], [0.4, 0.57], [0.9, 0.56], [1.76, 0.55]]),
};
S.top0 = S.top;
// cabin sits on the body top
S.cabTop = S.top;

// 16-point half section: rounded, muscular, with a character line at mid-height
function section(z) {
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
  const zn = Math.abs(z) / 2.26, e = (zn < 0.78 ? 0 : Math.min(1, (zn - 0.78) / 0.22)) * (z > 0 ? 1 : 0.35), lo = 1 - 0.16 * e * e, hi = 1 - 0.1 * e * e;
  const roll = (f) => cy + (bt - cy) * Math.pow(f / 0.9, 2.5); // flat centre, rolls up into the shoulder
  return [
    [0, floor], [Math.min(xIn, W * 0.93 * lo), floor], [Math.min(xIn, W * 0.93 * lo), rock], [W * 0.955 * lo, rock], [W * 0.99 * lerp(lo, 1, 0.5), rock + 0.035],
    [W + bulge * 0.7, lerp(rock, belt, 0.25)], [W + bulge, lerp(rock, belt, 0.5)], [W * lerp(hi, 1, 0.3) + bulge * 0.6, lerp(rock, belt, 0.76)],
    [W * 0.99 * hi, belt - 0.025], [W * 0.955 * hi, belt + 0.012], [W * 0.9 * hi, bt],
    [W * 0.78, roll(0.78)], [W * 0.6, roll(0.6)], [W * 0.4, roll(0.4)], [W * 0.2, roll(0.2)], [0, cy],
  ];
}

// height of the body's top surface at (x, z), from the section
export function surfaceY(z, x) {
  const pts = section(z).slice(10);
  const ax = Math.abs(x);
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    if (ax <= x0 && ax >= x1) return lerp(y1, y0, (ax - x1) / (x0 - x1 || 1));
  }
  return pts[pts.length - 1][1];
}
// rear / front surface z at (x, y) is approximated from the plan shape
function endZ(x, rear) {
  const W = S.halfW, f = Math.min(0.999, Math.abs(x) / W);
  const p = rear ? S.pR : S.pF, half = (S.zR - S.zF) / 2;
  const t = Math.pow(1 - Math.pow(f, p), 1 / p);
  return (rear ? 1 : -1) * half * t;
}

// wrap a +z-facing part so it faces forward (-z), turned outward by `yaw` and tilted up by `pitch`
function facingFront(part, yaw, pitch) {
  const outer = new THREE.Group(), inner = new THREE.Group();
  outer.rotation.y = Math.PI - yaw;
  inner.rotation.x = -pitch;
  inner.add(part); outer.add(inner);
  return outer;
}

/* ----------------------------------------------------------------- build */
export function buildSupra(root, body, paint, style = 'stock') {
  const tuned = style === 'tuned';
  const lights = { front: new THREE.Group(), rear: new THREE.Group() };
  lights.front.name = 'lights.front'; lights.rear.name = 'lights.rear';
  body.name = 'body';

  // --- body shell, cabin glass, roof
  const shell = mesh(loft(range(S.zF, S.zR, 240), section), paint);
  shell.name = 'body.shell'; shell.receiveShadow = true;
  body.add(shell);
  const glass = mesh(loft(range(S.cabF, S.cabR, 110), cabinSection(S)), MAT.glass);
  glass.name = 'glass'; glass.renderOrder = 2;
  glass.material = SUPRA_GLASS;
  body.add(glass);
  const roof = mesh(loft(range(S.roofF, S.roofR, 60), roofSection(S)), paint);
  roof.userData.roof = true; roof.name = 'body.roof';
  body.add(roof);
  archLiners(body, S);

  // black window surround along the belt + B-pillar
  for (const s of [-1, 1]) {
    const pts = [];
    for (const z of range(-0.75, 1.45, 24)) pts.push(V(s * (S.cabBase(z) + 0.006), S.top(z) + 0.03, z));
    const trim = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.012, 6), MAT.plastic, 0, 0, 0, false);
    body.add(trim);
    const bp = mesh(new THREE.BoxGeometry(0.02, 0.32, 0.07), MAT.satin, s * (lerp(S.cabBase(0.62), S.cabRoof(0.62), 0.5) + 0.02), lerp(S.top(0.62), S.roof(0.62), 0.5), 0.62, false);
    bp.rotation.z = s * -0.32; body.add(bp);
  }

  // carbon hood with a central vent (tuned)
  if (tuned) {
    const hood = mesh(loft(range(-2.02, -0.84, 40), (z) => {
      const W = S.halfW * planShape(z, S.zF, S.zR, S.pF, S.pR) * 0.62;
      const pts = [[0, surfaceY(z, 0) - 0.01], [W, surfaceY(z, W) - 0.01], [W, surfaceY(z, W) + 0.004]];
      for (const f of [0.75, 0.5, 0.25]) pts.push([W * f, surfaceY(z, W * f) + 0.005]);
      pts.push([0, surfaceY(z, 0) + 0.005]);
      return pts;
    }), SM.carbon);
    hood.name = 'body.hood'; body.add(hood);
    for (let k = 0; k < 6; k++) {
      const z = -1.5 + k * 0.05;
      const slat = mesh(new THREE.BoxGeometry(0.44, 0.012, 0.022), MAT.plastic, 0, surfaceY(z, 0) + 0.012, z, false);
      slat.rotation.x = -0.2; body.add(slat);
    }
  }

  /* ------------------------------------------------------------- front */
  const fz = (x) => endZ(x, false);
  // headlights: rounded-oval housings, 3 projectors, clear lens, swept back
  for (const s of [-1, 1]) {
    const hl = new THREE.Group();
    hl.add(mesh(roundedPlate(0.42, 0.19, 0.085, 0.05), SM.housing, 0, 0, 0, false));
    const r = [0.07, 0.048, 0.044], xs = [0.12, -0.02, -0.13];
    for (let k = 0; k < 3; k++) {
      const x = s * xs[k];
      hl.add(mesh(new THREE.TorusGeometry(r[k], 0.008, 6, 24), SM.chromeRing, x, 0, 0.034, false));
      hl.add(mesh(new THREE.SphereGeometry(r[k] * 0.72, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), MAT.head, x, 0, 0.03, false));
    }
    const lens = mesh(roundedPlate(0.43, 0.2, 0.09, 0.012, 0.005), MAT.lens, 0, 0, 0.05, false);
    lens.renderOrder = 3; hl.add(lens);
    const hlw = facingFront(hl, s * 0.2, 0.6);
    hlw.position.set(s * 0.53, 0.585, fz(0.53) + 0.045);
    lights.front.add(hlw);
    // amber indicator at the bumper corner, mesh vent below it
    const ind = new THREE.Group();
    ind.add(mesh(roundedPlate(0.16, 0.06, 0.025, 0.03), SM.lampAmber, 0, 0, 0.012, false));
    ind.add(mesh(roundedPlate(0.17, 0.08, 0.03, 0.02), MAT.plastic, 0, -0.085, -0.01, false));
    ind.add(mesh(new THREE.PlaneGeometry(0.15, 0.06), SM.mesh, 0, -0.085, 0.002, false));
    const indw = facingFront(ind, s * 0.55, 0.05);
    indw.position.set(s * 0.68, 0.37, fz(0.68) + 0.015);
    lights.front.add(indw);
    // side marker on the front fender
    const sm = mesh(roundedPlate(0.08, 0.03, 0.012, 0.01), SM.lampAmber, s * (section(-1.86)[6][0] - 0.004), 0.47, -1.86, false);
    sm.rotation.y = s * Math.PI / 2; lights.front.add(sm);
  }
  // wide lower intake with mesh and the intercooler behind it
  const intakeZ = fz(0.0) + 0.04;
  body.add(mesh(roundedPlate(1.06, 0.14, 0.06, 0.08), MAT.plastic, 0, 0.27, intakeZ - 0.02, false));
  body.add(mesh(new THREE.PlaneGeometry(0.98, 0.1), SM.intercooler, 0, 0.27, intakeZ + 0.005, false));
  body.add(mesh(new THREE.PlaneGeometry(1.0, 0.12), SM.mesh, 0, 0.27, intakeZ + 0.022, false));
  // plate + emblem
  const plateMat = plateTexture('MK4');
  const pf = mesh(new THREE.PlaneGeometry(0.52, 0.13).rotateY(Math.PI), plateMat, 0, 0.38, fz(0) - 0.012, false);
  body.add(pf);
  body.add(mesh(new THREE.BoxGeometry(0.56, 0.015, 0.03), MAT.plastic, 0, 0.465, fz(0) + 0.0, false));
  const ef = facingFront(emblem(0.75), 0, 0.85); ef.position.set(0, surfaceY(-2.17, 0) + 0.006, -2.17); body.add(ef);
  // carbon front splitter lip
  const lip = mesh(roundedPlate(1.62, 0.18, 0.08, 0.018, 0.005).rotateX(Math.PI / 2), SM.carbon, 0, 0.115, -2.09, true);
  lip.name = 'body.splitter'; body.add(lip);

  /* --------------------------------------------------------------- side */
  for (const s of [-1, 1]) {
    const sx = (z, y) => { const sec = section(z); return sec[6][0] + 0.004 + (y > 0.6 ? -0.01 : 0); };
    // slim vent behind the front wheel
    for (let k = 0; k < 3; k++) {
      const v = mesh(new THREE.BoxGeometry(0.012, 0.022, 0.16), MAT.plastic, s * sx(-0.8, 0.5), 0.45 + k * 0.04, -0.82, false);
      v.rotation.x = 0.35; body.add(v);
    }
    // scoop ahead of the rear wheel (as on the tuned car's side)
    const scoop = mesh(roundedPlate(0.22, 0.08, 0.035, 0.03), MAT.plastic, s * (sx(0.62, 0.35) - 0.005), 0.36, 0.62, false);
    scoop.rotation.y = s * Math.PI / 2; body.add(scoop);
    // door handle + door shut lines
    const dh = mesh(roundedPlate(0.13, 0.03, 0.012, 0.012), MAT.satin, s * (sx(0.3, 0.8) - 0.004), 0.79, 0.3, false);
    dh.rotation.y = s * Math.PI / 2; body.add(dh);
    for (const z of [-0.68, 0.55]) body.add(mesh(new THREE.BoxGeometry(0.004, 0.5, 0.004), MAT.plastic, s * (sx(z, 0.5) + 0.001), 0.52, z, false));
    // black side skirt
    const skirt = [];
    for (const z of range(-0.9, 0.78, 18)) { const sec = section(z); skirt.push(V(s * (sec[4][0] + 0.004), sec[4][1] - 0.005, z)); }
    body.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(skirt), 30, 0.022, 6), MAT.plastic, 0, 0, 0, false));
    // rear red side marker
    const rm = mesh(roundedPlate(0.07, 0.03, 0.012, 0.01), SM.lampRed, s * (section(1.98)[6][0] - 0.004), 0.45, 1.98, false);
    rm.rotation.y = s * Math.PI / 2; lights.rear.add(rm);
  }
  // fuel cap on the left rear quarter
  const fuel = mesh(new THREE.TorusGeometry(0.075, 0.004, 6, 28).rotateY(Math.PI / 2), MAT.plastic, -(section(1.0)[7][0] + 0.003), 0.74, 1.0, false);
  body.add(fuel);
  mirrors(body, paint, 0.95, 0.93, -0.55, 1.25);

  /* --------------------------------------------------------------- rear */
  const rz = (x) => endZ(x, true);
  // two pill-shaped smoked housings with 4 round lamps: amber, red, red, clear (outer -> inner)
  const tail = MAT.tail; // swapped for a per-car clone in buildPlayerCar, glows harder when braking
  for (const s of [-1, 1]) {
    const pill = new THREE.Group();
    pill.position.set(s * 0.47, 0.745, rz(0.47) - 0.012);
    pill.rotation.y = s * 0.16;
    pill.add(mesh(roundedPlate(0.54, 0.135, 0.067, 0.03), SM.smoke, 0, 0, 0, false));
    // smoked lenses: each lamp is a dark centre inside a glowing ring
    const kinds = [SM.lampAmber, SM.smokedLens, SM.smokedLens, SM.lampClear];
    const domes = [SM.lampAmber, tail, tail, SM.lampClear];
    for (let k = 0; k < 4; k++) {
      const x = s * (0.2 - k * 0.13);
      pill.add(mesh(new THREE.CircleGeometry(0.046, 28), kinds[k], x, 0, 0.026, false));
      const dome = mesh(new THREE.SphereGeometry(0.044, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), domes[k], x, 0, 0.026, false);
      dome.scale.z = 0.35; pill.add(dome);
      const lens = mesh(new THREE.SphereGeometry(0.0445, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), SM.smokeLens, x, 0, 0.027, false);
      lens.scale.z = 0.4; lens.renderOrder = 3; pill.add(lens);
      pill.add(mesh(new THREE.TorusGeometry(0.049, 0.004, 6, 24), SM.chromeRing, x, 0, 0.027, false));
    }
    lights.rear.add(pill);
  }
  // emblem, recessed plate, high-mount stop light, valance, exhaust
  const er = emblem(0.9); er.position.set(0, 0.745, rz(0) + 0.006); body.add(er);
  const badge = mesh(new THREE.PlaneGeometry(0.2, 0.055), scriptBadge('Supra'), 0.42, 0.815, rz(0.42) + 0.004, false);
  badge.rotation.y = 0.12; body.add(badge);
  // rear wiper lying on the fastback glass
  const wz = 1.5, wy = S.roof(wz) + 0.012, slope = Math.atan2(S.roof(wz - 0.1) - S.roof(wz + 0.1), 0.2);
  const wiper = new THREE.Group();
  wiper.position.set(0.02, wy, wz); wiper.rotation.x = -slope;
  const arm = mesh(new THREE.BoxGeometry(0.5, 0.008, 0.014), MAT.plastic, -0.22, 0.005, 0, false); arm.rotation.y = 0.18; wiper.add(arm);
  wiper.add(mesh(new THREE.BoxGeometry(0.46, 0.012, 0.01), MAT.satin, -0.24, 0.012, 0.02, false));
  wiper.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 12), MAT.plastic, 0, 0, 0, false));
  body.add(wiper);
  body.add(mesh(roundedPlate(0.6, 0.2, 0.03, 0.03), MAT.plastic, 0, 0.48, rz(0) + 0.0, false));
  body.add(mesh(new THREE.PlaneGeometry(0.52, 0.13), plateMat, 0, 0.48, rz(0) + 0.026, false));
  const hm = mesh(roundedPlate(0.34, 0.024, 0.01, 0.012), tail, 0, S.top(1.8) + 0.012, 1.8, false);
  hm.rotation.x = -1.2; lights.rear.add(hm);
  body.add(mesh(rbox(1.12, 0.1, 0.12, 0.04), MAT.plastic, 0, 0.24, 2.16, false));
  const ex = new THREE.Group();
  ex.position.set(-0.6, 0.22, 2.16);
  ex.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 28, 1, true).rotateX(Math.PI / 2), MAT.chrome, 0, 0, 0, false));
  ex.add(mesh(new THREE.TorusGeometry(0.05, 0.006, 8, 28), MAT.chrome, 0, 0, 0.08, false));
  ex.add(mesh(new THREE.CircleGeometry(0.044, 24), MAT.soot, 0, 0, 0.04, false));
  ex.name = 'exhaust';
  body.add(ex);
  root.userData.exhaust = new THREE.Vector3(-0.62, 0.2, 2.36);
  root.userData.exhausts = [new THREE.Vector3(-0.6, 0.22, 2.26)];
  root.userData.brakeExtra = [hm];

  /* --------------------------------------------------------------- wing */
  const wing = new THREE.Group();
  wing.name = 'wing';
  if (!tuned) {
    // stock hoop wing: one swept airfoil running deck -> up -> across -> down
    const deckY = S.top(1.9) - 0.02;
    const path = [V(-0.74, deckY, 1.86), V(-0.77, deckY + 0.13, 1.89), V(-0.76, deckY + 0.24, 1.93), V(-0.62, deckY + 0.29, 1.95), V(0, deckY + 0.3, 1.95),
      V(0.62, deckY + 0.29, 1.95), V(0.76, deckY + 0.24, 1.93), V(0.77, deckY + 0.13, 1.89), V(0.74, deckY, 1.86)];
    const g = sweep(path, V(0, 0, 1), (t) => { const mid = Math.min(1, Math.min(t, 1 - t) * 5); return airfoil(lerp(0.11, 0.3, Math.pow(mid, 1.5)), lerp(0.035, 0.055, mid)); }, 90);
    const w = mesh(g, paint); w.name = 'wing.blade';
    wing.add(w);
  } else {
    // GT wing: carbon blade + endplates on white swan-neck uprights
    const span = 1.5, y = S.top(1.98) + 0.33, z = 2.0;
    const blade = mesh(sweep([V(-span / 2, y, z), V(span / 2, y, z)], V(0, 0, 1), () => airfoil(0.34, 0.06), 6), SM.carbon);
    blade.rotation.x = -0.08; blade.name = 'wing.blade';
    wing.add(blade);
    for (const s of [-1, 1]) {
      const ep = mesh(roundedPlate(0.36, 0.15, 0.05, 0.01).rotateY(Math.PI / 2), SM.carbon, s * (span / 2 + 0.006), y - 0.015, z + 0.02);
      wing.add(ep);
      const x = s * 0.4, deck = S.top(1.86) - 0.02;
      const neck = sweep([V(x, deck, 1.84), V(x, deck + 0.14, 1.87), V(x, y + 0.07, 1.94), V(x, y + 0.09, 2.02), V(x, y + 0.03, 2.06)], V(1, 0, 0),
        (t) => { const h = lerp(0.11, 0.06, t); return [[-0.009, -h / 2], [0.009, -h / 2], [0.009, h / 2], [-0.009, h / 2]]; }, 30);
      wing.add(mesh(neck, paint));
    }
  }
  body.add(wing);
  body.add(lights.front, lights.rear);

  /* ------------------------------------------------------- wheels + cockpit */
  const wheelOpts = tuned
    ? { spokes: 6, style: 'wide', rimMat: SM.blackWheel, caliper: SM.caliperYellow }
    : { spokes: 5, style: 'dish', rimMat: SM.champagne, caliper: MAT.caliperRed };
  addWheels(root, { front: -1.33, rear: 1.22, track: 0.765, r: 0.335, rimR: 0.235, width: 0.255, sidewall: true, ...wheelOpts });
  root.userData.wheels.forEach((w, i) => { w.name = `wheel.${['FL', 'FR', 'RL', 'RR'][i]}`; });
  addCockpit(root, body, { eye: { x: -0.37, y: 1.08, z: 0.62 }, dashZ: -0.3, dashY: 0.9, maxKmh: 320, roof: S.roof });
  // black seats so they read through the tinted glass
  body.traverse((o) => { if (o.isMesh && o.material === MAT.leather) o.material = SM.seat; });
  // lowered stance for the tuned car
  body.userData.baseY = tuned ? -0.028 : 0;
  body.position.y = body.userData.baseY;
  if (tuned) for (const w of root.userData.wheels) w.position.y -= 0.0;
  root.userData.parts = { body, glass, wing, lights, wheels: root.userData.wheels };
}

export const SUPRA_STYLES = { stock: 'Stock White', tuned: 'Tuned' };
