// Player cars, built procedurally with lofted bodies (cross-sections along the
// length), so fenders, arches and the bubble cabin read like the real shapes.
// Each car: root Group { body Group (roll/pitch), 4 wheels, blob shadow }.
// Faces -Z, sits on y = 0.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { MAT, carPaint } from './materials.js';
import { curve, planShape, loft, range, mesh, addWheels, blobShadow, lerp, mergeStatic } from './parts.js';

const LINER = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1, side: THREE.DoubleSide });

const rbox = (w, h, d, r = 0.03) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));

/* ------------------------------------------------------------ body loft */
function bodySection(S) {
  return (z) => {
    const W = S.halfW * planShape(z, S.zF, S.zR, S.pF, S.pR);
    const top = S.top(z), crown = S.crown(z), belt = Math.max(S.belt(z), top + crown);
    const floor = S.floor(z), bulge = S.bulge(z) * (W / S.halfW);
    let rock = S.rocker(z), xIn = W * 0.93;
    for (const a of S.arches) {
      const dz = z - a.z;
      if (Math.abs(dz) < a.r) {
        const h = a.cy + Math.sqrt(a.r * a.r - dz * dz);
        if (h > rock) { rock = h; xIn = Math.min(xIn, a.inner); }
      }
    }
    rock = Math.min(rock, belt - 0.07);
    xIn = Math.max(0.02, Math.min(xIn, W * 0.93));
    const mid = lerp(rock, belt, S.lineHeight ?? 0.5);
    return [
      [0, floor], [xIn, floor], [xIn, rock], [W * 0.965, rock], [W, rock + 0.05],
      [W + bulge, mid], [W + bulge * 0.45, belt - 0.05], [W * 0.985, belt],
      [W * (1 - S.shoulder), belt + 0.03], [W * 0.62, top + crown * 0.85], [W * 0.3, top + crown], [0, top + crown],
    ];
  };
}

function cabinSection(S) {
  return (z) => {
    const base = S.top(z) - 0.03, roof = Math.max(base + 0.05, S.roof(z));
    const bw = S.cabBase(z), rw = S.cabRoof(z);
    const mid = lerp(base, roof, 0.55);
    return [[0, base - 0.05], [bw, base - 0.05], [bw, base + 0.02], [lerp(bw, rw, 0.45) + 0.015, mid], [rw, roof - 0.055], [rw * 0.55, roof - 0.008], [0, roof]];
  };
}

function roofSection(S) {
  return (z) => {
    const roof = S.roof(z), rw = S.cabRoof(z) + 0.004;
    return [[0, roof - 0.04], [rw, roof - 0.06], [rw + 0.002, roof - 0.05], [rw * 0.55, roof - 0.004], [0, roof + 0.004]];
  };
}

// dark wheel-well liners so the arches read as openings
function archLiners(body, S) {
  for (const a of S.arches) {
    const g = new THREE.CylinderGeometry(a.r - 0.01, a.r - 0.01, 0.27, 20, 1, true, 0, Math.PI);
    g.rotateZ(Math.PI / 2); // axle along x, open half on top
    for (const s of [-1, 1]) {
      const m = mesh(g, MAT.soot, s * (a.inner + 0.14), a.cy, a.z, false);
      m.material = LINER;
      body.add(m);
    }
  }
}

/* --------------------------------------------------------------- gauges */
function gaugeTexture(max, step, red, label) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#0b0c0e'; g.beginPath(); g.arc(128, 128, 126, 0, 7); g.fill();
  g.strokeStyle = '#2a2c30'; g.lineWidth = 6; g.stroke();
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  const ang = (v) => a0 + (v / max) * (a1 - a0);
  if (red) { g.strokeStyle = '#d0201a'; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 104, ang(red), a1); g.stroke(); }
  g.fillStyle = '#f2f2ee'; g.strokeStyle = '#f2f2ee'; g.font = 'bold 22px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let v = 0; v <= max + 1e-6; v += step / 2) {
    const a = ang(v), major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
    g.lineWidth = major ? 4 : 2;
    g.beginPath(); g.moveTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112); g.lineTo(128 + Math.cos(a) * (major ? 94 : 102), 128 + Math.sin(a) * (major ? 94 : 102)); g.stroke();
    if (major) g.fillText(String(Math.round(v / (max > 100 ? 1 : 1))), 128 + Math.cos(a) * 74, 128 + Math.sin(a) * 74);
  }
  g.font = '15px Arial'; g.fillStyle = '#9aa1ad'; g.fillText(label, 128, 178);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function gauge(max, step, red, label, r) {
  const grp = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshStandardMaterial({ map: gaugeTexture(max, step, red, label), emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0.0, roughness: 0.6 }));
  face.material.emissiveMap = face.material.map; face.material.emissiveIntensity = 0.55;
  grp.add(face);
  const pivot = new THREE.Group(); pivot.position.z = 0.004;
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.004, r * 0.85, 0.002).translate(0, r * 0.38, 0), new THREE.MeshStandardMaterial({ color: 0xff3b1f, emissive: 0xff3b1f, emissiveIntensity: 1.6 }));
  pivot.add(needle);
  grp.add(pivot, mesh(new THREE.CircleGeometry(r * 0.12, 12).translate(0, 0, 0.006), MAT.satin, 0, 0, 0, false));
  // canvas angle (clockwise from +x) -> needle rotation (counter-clockwise from +y)
  grp.userData.set = (v) => { const a = Math.PI * 0.75 + (Math.min(v, max) / max) * Math.PI * 1.5; pivot.rotation.z = -(a + Math.PI / 2); };
  grp.userData.set(0);
  return grp;
}

/* --------------------------------------------------------------- cockpit */
function addCockpit(root, body, C) {
  const { eye, dashZ, dashY, maxKmh } = C;
  // tub so the glass shows a dark interior
  body.add(mesh(new THREE.BoxGeometry(1.4, 0.3, 1.9), MAT.interior, 0, dashY - 0.32, dashZ + 0.85, false));
  // driver-wrapped curved dashboard
  const dg = new THREE.BoxGeometry(1.46, 0.11, 0.4, 16, 1, 1);
  const p = dg.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); const u = (x - eye.x) / 0.8; p.setZ(i, p.getZ(i) + 0.1 * u * u); p.setY(i, p.getY(i) - 0.03 * u * u); }
  dg.computeVertexNormals();
  body.add(mesh(dg, MAT.interior, 0, dashY, dashZ, false));
  // binnacle hood over the gauges
  const hood = new THREE.CylinderGeometry(0.2, 0.2, 0.18, 16, 1, true, -Math.PI / 2, Math.PI);
  hood.rotateX(Math.PI / 2);
  const hm = mesh(hood, MAT.interior, eye.x, dashY + 0.09, dashZ + 0.07, false);
  hm.material = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.8, side: THREE.DoubleSide });
  hm.scale.y = 0.55; body.add(hm);
  // gauges facing the driver
  const tach = gauge(9, 1, 7.2, 'x1000 rpm', 0.075);
  tach.position.set(eye.x + 0.07, dashY + 0.085, dashZ + 0.15);
  tach.rotation.x = -0.25;
  const speedo = gauge(maxKmh, 40, 0, 'km/h', 0.06);
  speedo.position.set(eye.x - 0.1, dashY + 0.075, dashZ + 0.155);
  speedo.rotation.x = -0.25;
  tach.userData.dynamic = true; speedo.userData.dynamic = true;
  body.add(tach, speedo);
  // centre console + shifter
  body.add(mesh(new THREE.BoxGeometry(0.22, 0.24, 0.7), MAT.interior, 0, dashY - 0.2, dashZ + 0.45, false));
  body.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.1), MAT.chrome, 0.02, dashY - 0.03, dashZ + 0.7, false));
  // three-spoke steering wheel
  const col = new THREE.Group();
  col.position.set(eye.x, dashY - 0.1, dashZ + 0.36);
  col.rotation.x = -0.32;
  const wheel = new THREE.Group();
  wheel.add(mesh(new THREE.TorusGeometry(0.175, 0.02, 10, 36), MAT.leather, 0, 0, 0, false));
  for (const a of [0, Math.PI, -Math.PI / 2]) {
    const s = mesh(new THREE.BoxGeometry(0.15, 0.03, 0.012), MAT.satin, Math.cos(a) * 0.085, Math.sin(a) * 0.085, 0, false);
    s.rotation.z = a; wheel.add(s);
  }
  wheel.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16).rotateX(Math.PI / 2), MAT.satin, 0, 0, 0.004, false));
  col.add(wheel);
  col.userData.dynamic = true;
  body.add(col);
  // interior mirror (darkened glass) + headliner
  // interior mirror hangs just under the windscreen header; headliner follows the roof
  const mz = eye.z - 0.62;
  body.add(mesh(new THREE.BoxGeometry(0.2, 0.05, 0.015), MAT.mirror, 0, C.roof(mz) - 0.04, mz, false));
  const z0 = eye.z - 0.42, z1 = eye.z + 0.25;
  const liner = new THREE.Mesh(new THREE.PlaneGeometry(1.1, z1 - z0).rotateX(Math.PI / 2), MAT.interior);
  liner.material = new THREE.MeshStandardMaterial({ color: 0x4a4744, roughness: 0.95 }); // light headliner
  liner.position.set(0, C.roof(eye.z) - 0.025, (z0 + z1) / 2);
  body.add(liner);
  // seats
  for (const s of [-1, 1]) body.add(mesh(rbox(0.5, 0.62, 0.12, 0.05), MAT.leather, s * 0.37, dashY - 0.05, eye.z + 0.32, false));
  root.userData.steeringWheel = wheel;
  root.userData.eye = new THREE.Vector3(eye.x, eye.y, eye.z);
  root.userData.setGauges = (kmh, rpm) => { speedo.userData.set(kmh); tach.userData.set(rpm / 1000); };
}

/* ------------------------------------------------------------ assembler */
function lofted(root, body, S, paint) {
  const b = mesh(loft(range(S.zF, S.zR, 110), bodySection(S)), paint);
  b.receiveShadow = true;
  body.add(b);
  const cab = mesh(loft(range(S.cabF, S.cabR, 48), cabinSection(S)), MAT.glass);
  cab.renderOrder = 2;
  body.add(cab);
  const roof = mesh(loft(range(S.roofF, S.roofR, 30), roofSection(S)), paint);
  roof.userData.roof = true;
  body.add(roof);
  archLiners(body, S);
}

function mirrors(body, paint, x, y, z) {
  for (const s of [-1, 1]) {
    body.add(mesh(rbox(0.07, 0.1, 0.17, 0.035), paint, s * x, y, z));
    body.add(mesh(new THREE.BoxGeometry(0.1, 0.025, 0.05), MAT.plastic, s * (x - 0.07), y - 0.03, z + 0.02, false));
    body.add(mesh(new THREE.BoxGeometry(0.055, 0.08, 0.005), MAT.mirror, s * x, y, z + 0.088, false));
  }
}

function ringLamp(body, r, x, y, z) {
  const ring = mesh(new THREE.TorusGeometry(r, r * 0.22, 8, 28), MAT.tail, x, y, z, false);
  body.add(ring);
  const inner = mesh(new THREE.CircleGeometry(r * 0.8, 24), MAT.tailDark, x, y, z - 0.004, false);
  body.add(inner);
  return ring;
}

function wing(body, paint, { span, chord, y, z, upX, upH, deck, mat }) {
  const sh = new THREE.Shape();
  sh.moveTo(-chord / 2, 0);
  sh.bezierCurveTo(-chord / 2, 0.035, chord * 0.1, 0.05, chord / 2, 0.012);
  sh.lineTo(chord / 2, 0.0);
  sh.bezierCurveTo(chord * 0.1, 0.012, -chord / 2, -0.01, -chord / 2, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: span, bevelEnabled: false, curveSegments: 12 });
  g.rotateY(Math.PI / 2);
  g.translate(-span / 2, 0, 0);
  const blade = mesh(g, mat || paint, 0, y, z);
  blade.rotation.x = -0.06;
  body.add(blade);
  for (const s of [-1, 1]) {
    const up = mesh(rbox(0.05, upH, 0.16, 0.02), mat || paint, s * upX, deck + upH / 2, z + 0.02);
    up.rotation.x = 0.12;
    body.add(up);
  }
  return blade;
}

/* ------------------------------------------------------------- the cars */
export const PLAYER_CARS = [
  {
    id: 'supra', name: 'Toyota Supra A80',
    tag: 'הגיבורה: שש בשורה עם טורבו כפול, כנף גבוהה ואף ארוך ונמוך.',
    topSpeed: 320, accel: 0.82, handling: 0.8,
    color: '#8c0b12', pearl: false, length: 4.52, width: 1.81,
    swatches: ['#8c0b12', '#f1efe9'],
    build(root, body, paint) {
      const S = {
        zF: -2.26, zR: 2.26, halfW: 0.885, pF: 4.5, pR: 6, shoulder: 0.06, lineHeight: 0.55,
        top: curve([[-2.26, 0.5], [-2.15, 0.6], [-1.9, 0.67], [-1.2, 0.755], [-0.62, 0.835], [-0.4, 0.86], [1.45, 0.915], [1.75, 0.945], [2.08, 0.95], [2.26, 0.86]]),
        crown: curve([[-2.26, 0], [-1.9, -0.022], [-0.75, -0.022], [-0.45, 0], [1.6, 0], [2.0, 0.012], [2.26, 0]]),
        belt: curve([[-2.26, 0.5], [-2.1, 0.63], [-1.6, 0.715], [-1.3, 0.755], [-0.6, 0.8], [0.6, 0.845], [1.25, 0.9], [2.0, 0.925], [2.26, 0.88]]),
        floor: curve([[-2.26, 0.24], [-2.05, 0.14], [2.0, 0.14], [2.26, 0.3]]),
        rocker: curve([[-2.26, 0.3], [-2.0, 0.23], [2.0, 0.23], [2.26, 0.34]]),
        bulge: curve([[-2.26, 0], [-1.75, 0.012], [-1.3, 0.024], [-0.8, 0.008], [0.2, 0.004], [0.85, 0.016], [1.25, 0.03], [1.85, 0.014], [2.26, 0]]),
        arches: [{ z: -1.3, cy: 0.33, r: 0.385, inner: 0.62 }, { z: 1.25, cy: 0.33, r: 0.39, inner: 0.62 }],
        // fastback bubble cabin, narrower than the body
        cabF: -0.64, cabR: 1.64, roofF: 0.02, roofR: 0.98,
        roof: curve([[-0.64, 0.86], [-0.5, 0.93], [0.05, 1.19], [0.32, 1.265], [0.62, 1.255], [0.95, 1.185], [1.3, 1.06], [1.64, 0.955]]),
        cabBase: curve([[-0.64, 0.64], [-0.3, 0.705], [0.6, 0.715], [1.3, 0.67], [1.64, 0.52]]),
        cabRoof: curve([[-0.64, 0.6], [-0.3, 0.59], [0.3, 0.555], [0.95, 0.53], [1.64, 0.48]]),
      };
      lofted(root, body, S, paint);
      // nose: wide lower intake, fog lamps, slim upper slot
      body.add(mesh(rbox(1.08, 0.16, 0.12, 0.05), MAT.plastic, 0, 0.33, -2.205, false));
      body.add(mesh(rbox(0.5, 0.035, 0.05, 0.015), MAT.plastic, 0, 0.47, -2.245, false));
      for (const s of [-1, 1]) {
        body.add(mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.04, 16).rotateX(Math.PI / 2), MAT.fog, s * 0.43, 0.33, -2.27, false));
        body.add(mesh(rbox(0.12, 0.05, 0.05, 0.02), MAT.amber, s * 0.66, 0.42, -2.16, false));
        // swept-back projector headlights under a clear lens
        const hl = new THREE.Group();
        hl.position.set(s * 0.6, 0.63, -1.98);
        hl.rotation.set(-0.18, s * 0.42, 0);
        const lens = mesh(new THREE.SphereGeometry(1, 20, 12), MAT.lens, 0, 0, 0, false);
        lens.scale.set(0.15, 0.05, 0.27); lens.renderOrder = 3;
        const housing = mesh(new THREE.SphereGeometry(1, 16, 10), MAT.chrome, 0, -0.012, 0, false);
        housing.scale.set(0.14, 0.04, 0.26);
        hl.add(housing, lens);
        for (let k = 0; k < 3; k++) hl.add(mesh(new THREE.SphereGeometry(0.036, 12, 8), MAT.head, 0, 0.02, -0.15 + k * 0.1, false));
        hl.add(mesh(new THREE.BoxGeometry(0.012, 0.012, 0.36), MAT.drl, s * 0.1, 0.012, 0, false)); // light strip
        body.add(hl);
        // side vent behind the front wheel
        for (let k = 0; k < 3; k++) {
          const v = mesh(new THREE.BoxGeometry(0.02, 0.022, 0.2), MAT.plastic, s * 0.905, 0.5 + k * 0.035, -0.8, false);
          v.rotation.x = 0.25; body.add(v);
        }
      }
      mirrors(body, paint, 0.93, 0.97, -0.42);
      // rear: wide smooth panel, round clusters, smoked garnish, exhaust
      body.add(mesh(rbox(0.5, 0.09, 0.03, 0.02), MAT.tailDark, 0, 0.72, 2.262, false));
      for (const s of [-1, 1]) {
        ringLamp(body, 0.095, s * 0.5, 0.72, 2.252);
        ringLamp(body, 0.08, s * 0.3, 0.72, 2.262);
        body.add(mesh(new THREE.CircleGeometry(0.028, 12), MAT.reverse, s * 0.3, 0.72, 2.268, false));
      }
      body.add(mesh(new THREE.BoxGeometry(0.52, 0.12, 0.02), MAT.plate, 0, 0.5, 2.265, false));
      body.add(mesh(rbox(1.4, 0.12, 0.2, 0.04), MAT.plastic, 0, 0.27, 2.17, false));
      const ex = mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.16, 18).rotateX(Math.PI / 2), MAT.exhaust, 0.55, 0.26, 2.24);
      ex.scale.x = 1.35; body.add(ex);
      body.add(mesh(new THREE.CircleGeometry(0.05, 16), MAT.soot, 0.55, 0.26, 2.322, false).translateX(0));
      root.userData.exhaust = new THREE.Vector3(0.55, 0.26, 2.35);
      // iconic tall rear wing on two uprights, with the high-mount stop light
      const blade = wing(body, paint, { span: 1.62, chord: 0.34, y: 1.17, z: 2.0, upX: 0.62, upH: 0.24, deck: 0.94 });
      const hm = mesh(new THREE.BoxGeometry(0.4, 0.018, 0.02), MAT.tail, 0, 1.19, 2.17, false);
      body.add(hm);
      root.userData.brakeExtra = [hm];
      void blade;
      addWheels(root, { front: -1.3, rear: 1.25, track: 0.765, r: 0.33, rimR: 0.235, width: 0.245, spokes: 10, style: 'single', rimMat: MAT.alloy, caliper: MAT.caliperRed });
      addCockpit(root, body, { eye: { x: -0.37, y: 1.09, z: 0.62 }, dashZ: -0.3, dashY: 0.9, maxKmh: 320, roof: S.roof });
    },
  },
  {
    id: 'rx7', name: 'Mazda RX-7 FD',
    tag: 'מנוע רוטרי, פנסים קופצים, גג בועה כפולה ומשקל נוצה.',
    topSpeed: 275, accel: 0.72, handling: 0.96,
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
        // pop-up headlights, raised
        const pod = mesh(rbox(0.36, 0.15, 0.27, 0.03), paint, s * 0.58, 0.68, -1.55);
        pod.rotation.x = -0.12; body.add(pod);
        body.add(mesh(rbox(0.3, 0.1, 0.02, 0.02), MAT.head, s * 0.58, 0.69, -1.69, false));
        body.add(mesh(rbox(0.16, 0.05, 0.05, 0.02), MAT.amber, s * 0.6, 0.36, -2.06, false));
      }
      mirrors(body, paint, 0.9, 0.9, -0.36);
      // full-width smoked tail panel with round lamps
      body.add(mesh(rbox(1.5, 0.13, 0.04, 0.03), MAT.tailDark, 0, 0.72, 2.12, false));
      for (const s of [-1, 1]) { ringLamp(body, 0.075, s * 0.6, 0.72, 2.145); ringLamp(body, 0.06, s * 0.4, 0.72, 2.145); }
      body.add(mesh(new THREE.BoxGeometry(0.5, 0.12, 0.02), MAT.plate, 0, 0.45, 2.16, false));
      for (const x of [0.42, 0.56]) body.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.14, 14).rotateX(Math.PI / 2), MAT.exhaust, x, 0.24, 2.12));
      root.userData.exhaust = new THREE.Vector3(0.5, 0.24, 2.2);
      wing(body, paint, { span: 1.45, chord: 0.24, y: 1.0, z: 1.95, upX: 0.6, upH: 0.11, deck: 0.89 });
      addWheels(root, { front: -1.24, rear: 1.185, track: 0.745, r: 0.315, rimR: 0.215, width: 0.235, spokes: 5, style: 'single', rimMat: MAT.bronze, caliper: MAT.caliperRed });
      addCockpit(root, body, { eye: { x: -0.36, y: 1.04, z: 0.62 }, dashZ: -0.22, dashY: 0.84, maxKmh: 280, roof: S.roof });
    },
  },
  {
    id: 'gtr', name: 'Nissan GT-R R34',
    tag: 'הנעה כפולה, ארבעה פנסים עגולים, כנף ענקית ותאוצה אכזרית.',
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
      body.add(mesh(new THREE.BoxGeometry(0.1, 0.03, 0.01), MAT.chrome, 0, 0.6, -2.325, false));
      body.add(mesh(new THREE.BoxGeometry(1.7, 0.02, 0.2), MAT.carbon, 0, 0.17, -2.26, false));
      for (const s of [-1, 1]) {
        const hl = new THREE.Group();
        hl.position.set(s * 0.56, 0.66, -2.2); hl.rotation.set(0, s * 0.28, s * -0.05);
        hl.add(mesh(rbox(0.42, 0.1, 0.06, 0.02), MAT.satin, 0, 0, 0, false));
        const lens = mesh(rbox(0.43, 0.11, 0.065, 0.025), MAT.lens, 0, 0, -0.002, false); lens.renderOrder = 3; hl.add(lens);
        hl.add(mesh(new THREE.SphereGeometry(0.035, 12, 8), MAT.head, -s * 0.1, 0, -0.03, false));
        hl.add(mesh(new THREE.SphereGeometry(0.032, 12, 8), MAT.head, s * 0.06, 0, -0.03, false));
        body.add(hl);
        body.add(mesh(rbox(0.1, 0.05, 0.04, 0.015), MAT.amber, s * 0.74, 0.4, -2.26, false));
        ringLamp(body, 0.09, s * 0.42, 0.8, 2.305);
        ringLamp(body, 0.09, s * 0.67, 0.8, 2.29);
      }
      mirrors(body, paint, 0.93, 0.99, -0.5);
      body.add(mesh(new THREE.BoxGeometry(0.52, 0.12, 0.02), MAT.plate, 0, 0.52, 2.315, false));
      body.add(mesh(rbox(1.5, 0.14, 0.2, 0.04), MAT.carbon, 0, 0.28, 2.22, false));
      const ex = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 18).rotateX(Math.PI / 2), MAT.exhaust, 0.6, 0.28, 2.28);
      body.add(ex);
      root.userData.exhaust = new THREE.Vector3(0.6, 0.28, 2.38);
      wing(body, paint, { span: 1.7, chord: 0.36, y: 1.26, z: 2.06, upX: 0.58, upH: 0.28, deck: 0.98, mat: MAT.carbon });
      for (const s of [-1, 1]) body.add(mesh(rbox(0.02, 0.16, 0.42, 0.01), MAT.carbon, s * 0.86, 1.24, 2.06, false));
      addWheels(root, { front: -1.36, rear: 1.305, track: 0.755, r: 0.34, rimR: 0.235, width: 0.255, spokes: 6, style: 'double', rimMat: MAT.gunmetal, caliper: MAT.caliperGold });
      addCockpit(root, body, { eye: { x: -0.37, y: 1.17, z: 0.58 }, dashZ: -0.36, dashY: 0.96, maxKmh: 320, roof: S.roof });
    },
  },
];
export const STAT_RANGE = { topSpeed: [220, 330], accel: [0.4, 1], handling: [0.4, 1] };

/* ------------------------------------------------------- optional GLB */
let supraGLB = null;
export async function loadSupraGLB() {
  try {
    const res = await fetch('models/supra.glb', { method: 'HEAD' });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || type.includes('html')) return null; // dev servers answer missing files with index.html
    const gltf = await new GLTFLoader().loadAsync('models/supra.glb');
    supraGLB = gltf.scene;
    return supraGLB;
  } catch (e) {
    return null;
  }
}

function buildFromGLB(root, body, def) {
  const model = supraGLB.clone(true);
  let box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  if (size.x > size.z) model.rotation.y = Math.PI / 2;  // long axis along z
  model.rotation.y += Math.PI;                            // glTF faces +z, our cars face -z
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  const s = def.length / Math.max(box.max.z - box.min.z, 1e-3);
  model.scale.multiplyScalar(s);
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  const c = box.getCenter(new THREE.Vector3());
  model.position.sub(new THREE.Vector3(c.x, box.min.y, c.z));
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  body.add(model);
  // wheel detection by node name
  const wheels = [], steer = [];
  model.traverse((o) => {
    if (!/wheel|tyre|tire|rim/i.test(o.name)) return;
    let p = o.parent; while (p) { if (wheels.includes(p)) return; p = p.parent; }
    wheels.push(o);
    if (/front|(^|[_\s.-])f[_\s.-]?(l|r)\b|(l|r)[_\s.-]?f\b|fl|fr/i.test(o.name)) steer.push(o);
  });
  root.userData.wheels = wheels;
  root.userData.steerWheels = steer;
  root.userData.wheelR = 0.33;
  for (const w of steer) w.userData.baseY = w.rotation.y;
  const h = box.max.y - box.min.y;
  root.userData.eye = new THREE.Vector3(-0.37, h * 0.82, 0.3);
  root.userData.exhaust = new THREE.Vector3(0.5, 0.26, def.length / 2 + 0.1);
}

/* --------------------------------------------------------------- build */
export function buildPlayerCar(def, color) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const paint = carPaint(color, { pearl: color.toLowerCase() === '#f1efe9' });
  if (def.id === 'supra' && supraGLB) buildFromGLB(root, body, def);
  else def.build(root, body, paint);
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
  mergeStatic(body); // ~90 parts -> one mesh per material
  return root;
}
