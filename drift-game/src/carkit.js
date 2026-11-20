// Shared building blocks for the player cars: lofted body/cabin/roof sections,
// arch liners, cockpit with live gauges, mirrors, lamps and a basic wing.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { MAT } from './materials.js';
import { loft, range, mesh, lerp, planShape } from './parts.js';

const LINER = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1, side: THREE.DoubleSide });

export const rbox = (w, h, d, r = 0.03) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));

/* ------------------------------------------------------------ body loft */
export function bodySection(S) {
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

export function cabinSection(S) {
  return (z) => {
    const base = S.top(z) - 0.03, roof = Math.max(base + 0.05, S.roof(z));
    const bw = S.cabBase(z), rw = S.cabRoof(z);
    const mid = lerp(base, roof, 0.55);
    return [[0, base - 0.05], [bw, base - 0.05], [bw, base + 0.02], [lerp(bw, rw, 0.45) + 0.015, mid], [rw, roof - 0.055], [rw * 0.55, roof - 0.008], [0, roof]];
  };
}

export function roofSection(S) {
  return (z) => {
    const roof = S.roof(z), rw = S.cabRoof(z) + 0.004;
    return [[0, roof - 0.04], [rw, roof - 0.06], [rw + 0.002, roof - 0.05], [rw * 0.55, roof - 0.004], [0, roof + 0.004]];
  };
}

// dark wheel-well liners so the arches read as openings
export function archLiners(body, S) {
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
export function gaugeTexture(max, step, red, label) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#0b0c0e'; g.beginPath(); g.arc(128, 128, 126, 0, 7); g.fill();
  g.strokeStyle = '#2a2c30'; g.lineWidth = 6; g.stroke();
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  const ang = (v) => a0 + (v / max) * (a1 - a0);
  if (red) { g.strokeStyle = '#d0201a'; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 104, ang(red), a1); g.stroke(); }
  g.fillStyle = '#f2f2ee'; g.strokeStyle = '#f2f2ee'; g.font = '700 22px Rajdhani, Heebo, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let v = 0; v <= max + 1e-6; v += step / 2) {
    const a = ang(v), major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
    g.lineWidth = major ? 4 : 2;
    g.beginPath(); g.moveTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112); g.lineTo(128 + Math.cos(a) * (major ? 94 : 102), 128 + Math.sin(a) * (major ? 94 : 102)); g.stroke();
    if (major) g.fillText(String(Math.round(v / (max > 100 ? 1 : 1))), 128 + Math.cos(a) * 74, 128 + Math.sin(a) * 74);
  }
  g.font = '500 15px Rajdhani, Heebo, sans-serif'; g.fillStyle = '#9aa1ad'; g.fillText(label, 128, 178);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function gauge(max, step, red, label, r) {
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
export function addCockpit(root, body, C) {
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
export function lofted(root, body, S, paint) {
  const b = mesh(loft(range(S.zF, S.zR, 200), bodySection(S)), paint);
  b.receiveShadow = true;
  body.add(b);
  const cab = mesh(loft(range(S.cabF, S.cabR, 90), cabinSection(S)), MAT.glass);
  cab.renderOrder = 2;
  body.add(cab);
  const roof = mesh(loft(range(S.roofF, S.roofR, 56), roofSection(S)), paint);
  roof.userData.roof = true;
  body.add(roof);
  archLiners(body, S);
}

export function mirrors(body, paint, x, y, z, scale = 1) {
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(s * x, y, z);
    g.scale.setScalar(scale);
    g.add(mesh(rbox(0.07, 0.1, 0.17, 0.035), paint));
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.025, 0.05), MAT.plastic, -s * 0.07, -0.03, 0.02, false));
    g.add(mesh(new THREE.BoxGeometry(0.055, 0.08, 0.005), MAT.mirror, 0, 0, 0.088, false));
    body.add(g);
  }
}

export function ringLamp(body, r, x, y, z) {
  const ring = mesh(new THREE.TorusGeometry(r, r * 0.22, 8, 28), MAT.tail, x, y, z, false);
  body.add(ring);
  const inner = mesh(new THREE.CircleGeometry(r * 0.8, 24), MAT.tailDark, x, y, z - 0.004, false);
  body.add(inner);
  return ring;
}

export function wing(body, paint, { span, chord, y, z, upX, upH, deck, mat }) {
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

/* --------------------------------------------------- fictional brand marks */
// Small chrome logos for our own fictional makes, built from simple shapes.
// Each faces +z and is about 0.12 m wide.
const MARK_MAT = new THREE.MeshStandardMaterial({ color: 0xe3e6ea, metalness: 1, roughness: 0.15 });
const outline = (pts, w) => {
  // closed polyline -> thin extruded band
  const outer = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const hole = new THREE.Path(pts.map(([x, y]) => new THREE.Vector2(cx + (x - cx) * (1 - w), cy + (y - cy) * (1 - w))).reverse());
  outer.holes.push(hole);
  return new THREE.ExtrudeGeometry(outer, { depth: 0.005, bevelEnabled: false, curveSegments: 16 });
};
const solid = (pts) => new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), { depth: 0.006, bevelEnabled: false });
const circlePts = (r, n = 32) => Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * r, Math.sin((i / n) * Math.PI * 2) * r]);

export function brandMark(kind, scale = 1) {
  const g = new THREE.Group();
  const add = (geo) => g.add(new THREE.Mesh(geo, MARK_MAT));
  if (kind === 'kaito') { add(outline(circlePts(0.055), 0.18)); add(solid([[-0.03, -0.025], [0.035, 0], [-0.03, 0.025], [-0.012, 0]])); }
  else if (kind === 'hoshi') add(solid([[0, 0.06], [0.014, 0.014], [0.06, 0], [0.014, -0.014], [0, -0.06], [-0.014, -0.014], [-0.06, 0], [-0.014, 0.014]]));
  else if (kind === 'shogun') add(outline(Array.from({ length: 6 }, (_, i) => [Math.cos(i * Math.PI / 3) * 0.055, Math.sin(i * Math.PI / 3) * 0.045]), 0.22));
  else if (kind === 'valkor') { add(solid([[-0.06, 0.03], [-0.045, 0.03], [0, -0.025], [0.045, 0.03], [0.06, 0.03], [0, -0.04]])); }
  else if (kind === 'adler') { add(outline([[0, 0.05], [0.055, -0.04], [-0.055, -0.04]], 0.25)); add(solid([[-0.025, -0.008], [0.025, -0.008], [0.025, 0.002], [-0.025, 0.002]])); }
  else { add(outline([[-0.045, 0.045], [0.045, 0.045], [0.045, -0.01], [0, -0.05], [-0.045, -0.01]], 0.2)); add(solid([[-0.03, 0.006], [0.03, 0.006], [0.03, 0.014], [-0.03, 0.014]])); }
  g.scale.setScalar(scale);
  return g;
}
