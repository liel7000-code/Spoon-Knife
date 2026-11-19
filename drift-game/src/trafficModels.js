// Traffic vehicles: rounded-box bodies merged per material (few draw calls each),
// with tail/head lights, per-car indicators and slight colour variation.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { MAT, trafficPaint, indicatorMat } from './materials.js';
import { mergeGeometries, blobShadow } from './parts.js';

// half extents used by the OBB collision
export const TRAFFIC_TYPES = {
  hatch: { hw: 0.87, hl: 2.02 },
  sedan: { hw: 0.9, hl: 2.36 },
  suv: { hw: 0.96, hl: 2.38 },
  van: { hw: 1.0, hl: 2.66 },
  truck: { hw: 1.26, hl: 7.4 },
};

const PAINTS = ['#ecebe6', '#c4c8cc', '#8d939a', '#2b2d31', '#15171a', '#1f3557', '#7a1414', '#c9bb9b', '#2c4a38', '#5a4a3e', '#7b98b8', '#9a2d1b'];
const CARGO = ['#e8e8e3', '#d5dbe1', '#b8c3cd', '#e3d8c4', '#2f5d8a'];

const rb = (w, h, d, r = 0.1) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
const bx = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const at = (g, x, y, z, rx = 0) => { if (rx) g.rotateX(rx); return g.translate(x, y, z); };

function wheels(list, r, w = 0.22) {
  const tires = [], rims = [];
  for (const [x, z] of list) {
    tires.push(new THREE.CylinderGeometry(r, r, w, 18).rotateZ(Math.PI / 2).translate(x, r, z));
    const sx = Math.sign(x);
    rims.push(new THREE.CylinderGeometry(r * 0.6, r * 0.6, 0.02, 14).rotateZ(Math.PI / 2).translate(x + sx * (w / 2), r, z));
  }
  return { tires, rims };
}

// non-emissive bits share one vertex-coloured mesh, lamps share one unlit HDR mesh
const DETAIL_COLORS = { trim: [0.02, 0.02, 0.022], chrome: [0.75, 0.77, 0.8], plate: [0.85, 0.65, 0.05], tire: [0.018, 0.018, 0.018], rim: [0.55, 0.57, 0.6], refl: [0.9, 0.9, 0.9] };
const LIGHT_COLORS = { tail: [2.6, 0.08, 0.05], head: [3.2, 3.0, 2.6] };
const DETAILS = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 });
const LIGHTS = new THREE.MeshBasicMaterial({ vertexColors: true });
function tinted(groups, colors) {
  const out = [];
  for (const [key, rgb] of Object.entries(colors)) {
    for (const g0 of groups[key] || []) {
      const g = g0.index ? g0.toNonIndexed() : g0;
      const n = g.attributes.position.count, c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) c.set(rgb, i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      out.push(g);
    }
  }
  return out;
}

function finish(parts, { hw, hl }, paint, cargo) {
  const g = new THREE.Group();
  const indL = indicatorMat(), indR = indicatorMat();
  parts.details = tinted(parts, DETAIL_COLORS);
  parts.lights = tinted(parts, LIGHT_COLORS);
  for (const k of [...Object.keys(DETAIL_COLORS), ...Object.keys(LIGHT_COLORS)]) delete parts[k];
  const mats = { paint, glass: MAT.glass, details: DETAILS, lights: LIGHTS, indL, indR, cargo };
  for (const [key, geos] of Object.entries(parts)) {
    if (!geos.length) continue;
    const m = new THREE.Mesh(mergeGeometries(geos.map((x) => (x.index ? x.toNonIndexed() : x))), mats[key]);
    m.castShadow = key === 'paint' || key === 'cargo';
    if (key === 'glass') m.renderOrder = 2;
    if (key === 'indL' || key === 'indR') { m.visible = false; m.material.emissiveIntensity = 3; g.userData[key + 'Mesh'] = m; }
    g.add(m);
  }
  g.add(blobShadow(hw * 2, hl * 2));
  g.userData.paint = paint;
  g.userData.indL = indL;
  g.userData.indR = indR;
  g.userData.recolor = () => {
    const c = new THREE.Color(PAINTS[(Math.random() * PAINTS.length) | 0]);
    const hsl = {}; c.getHSL(hsl);
    c.setHSL(hsl.h + (Math.random() - 0.5) * 0.02, Math.min(1, hsl.s * (0.9 + Math.random() * 0.2)), Math.min(0.95, Math.max(0.04, hsl.l + (Math.random() - 0.5) * 0.06)));
    paint.color.copy(c);
    if (cargo) cargo.color.set(CARGO[(Math.random() * CARGO.length) | 0]);
  };
  return g;
}

// lights + bumpers + plate common to passenger cars
function carDetails(P, W, L, { tailY, headY, bumperY = 0.42 }) {
  const hw = W / 2, hl = L / 2;
  for (const s of [-1, 1]) {
    P.tail.push(at(rb(0.44, 0.15, 0.06, 0.03), s * (hw - 0.3), tailY, hl - 0.01));
    (s < 0 ? P.indL : P.indR).push(at(rb(0.14, 0.1, 0.06, 0.02), s * (hw - 0.08), tailY, hl - 0.01));
    (s < 0 ? P.indL : P.indR).push(at(rb(0.14, 0.08, 0.06, 0.02), s * (hw - 0.1), headY - 0.02, -hl + 0.01));
    P.head.push(at(rb(0.36, 0.11, 0.06, 0.03), s * (hw - 0.34), headY, -hl + 0.01));
    P.glass.push(at(bx(0.06, 0.1, 0.16), s * (hw + 0.06), 1.0, -0.75)); // mirrors
  }
  P.trim.push(at(rb(W + 0.02, 0.18, 0.16, 0.06), 0, bumperY, hl - 0.04));
  P.trim.push(at(rb(W + 0.02, 0.18, 0.16, 0.06), 0, bumperY - 0.04, -hl + 0.04));
  P.trim.push(at(bx(W * 0.5, 0.12, 0.04), 0, bumperY + 0.08, -hl - 0.005)); // grille
  P.plate.push(at(bx(0.52, 0.12, 0.02), 0, bumperY + 0.14, hl + 0.005));
}

const empty = () => ({ paint: [], glass: [], trim: [], chrome: [], tail: [], head: [], plate: [], tire: [], rim: [], indL: [], indR: [], cargo: [], refl: [] });

export function buildTraffic(type) {
  const P = empty();
  const paint = trafficPaint('#cccccc');
  let cargo = null;
  if (type === 'sedan') {
    const W = 1.8, L = 4.72;
    P.paint.push(at(rb(W, 0.6, L, 0.16), 0, 0.62, 0));
    P.paint.push(at(rb(W - 0.06, 0.12, 1.3, 0.06), 0, 0.92, -1.62, 0.08)); // hood
    P.paint.push(at(rb(W - 0.06, 0.12, 1.0, 0.06), 0, 0.94, 1.8));         // trunk
    P.glass.push(at(rb(1.58, 0.48, 2.25, 0.16), 0, 1.16, 0.2));
    P.paint.push(at(rb(1.52, 0.06, 1.55, 0.03), 0, 1.415, 0.25));
    carDetails(P, W, L, { tailY: 0.82, headY: 0.74 });
    const w = wheels([[-0.8, -1.42], [0.8, -1.42], [-0.8, 1.38], [0.8, 1.38]], 0.33);
    P.tire.push(...w.tires); P.rim.push(...w.rims);
  } else if (type === 'hatch') {
    const W = 1.74, L = 4.04;
    P.paint.push(at(rb(W, 0.62, L, 0.17), 0, 0.62, 0));
    P.paint.push(at(rb(W - 0.06, 0.12, 1.05, 0.06), 0, 0.93, -1.45, 0.1));
    P.glass.push(at(rb(1.54, 0.54, 2.35, 0.16), 0, 1.2, 0.48));
    P.paint.push(at(rb(1.48, 0.06, 1.85, 0.03), 0, 1.475, 0.5));
    carDetails(P, W, L, { tailY: 0.92, headY: 0.76 });
    const w = wheels([[-0.77, -1.25], [0.77, -1.25], [-0.77, 1.28], [0.77, 1.28]], 0.31);
    P.tire.push(...w.tires); P.rim.push(...w.rims);
  } else if (type === 'suv') {
    const W = 1.9, L = 4.75;
    P.paint.push(at(rb(W, 0.82, L, 0.18), 0, 0.82, 0));
    P.glass.push(at(rb(1.74, 0.62, 2.95, 0.15), 0, 1.5, 0.3));
    P.paint.push(at(rb(1.68, 0.07, 2.6, 0.03), 0, 1.82, 0.32));
    for (const s of [-1, 1]) P.chrome.push(at(bx(0.04, 0.05, 2.3), s * 0.7, 1.87, 0.3)); // roof rails
    P.trim.push(at(rb(W + 0.03, 0.3, L * 0.98, 0.1), 0, 0.5, 0)); // cladding
    carDetails(P, W, L, { tailY: 1.05, headY: 0.92, bumperY: 0.55 });
    const w = wheels([[-0.84, -1.45], [0.84, -1.45], [-0.84, 1.42], [0.84, 1.42]], 0.38, 0.25);
    P.tire.push(...w.tires); P.rim.push(...w.rims);
  } else if (type === 'van') {
    const W = 2.0, L = 5.3;
    P.paint.push(at(rb(W, 1.95, L, 0.22), 0, 1.3, 0.06));
    P.paint.push(at(rb(W - 0.04, 0.6, 0.9, 0.2), 0, 0.72, -2.25)); // nose
    P.glass.push(at(bx(1.8, 0.62, 0.05), 0, 1.72, -2.12, -0.35));
    for (const s of [-1, 1]) P.glass.push(at(bx(0.02, 0.48, 1.9), s * 1.005, 1.72, -1.1));
    P.trim.push(at(bx(0.02, 1.6, 0.02), 0, 1.3, L / 2 + 0.065)); // rear door split
    for (const s of [-1, 1]) {
      P.tail.push(at(rb(0.16, 0.5, 0.06, 0.03), s * 0.88, 1.0, L / 2 + 0.05));
      (s < 0 ? P.indL : P.indR).push(at(rb(0.16, 0.14, 0.06, 0.03), s * 0.88, 1.36, L / 2 + 0.05));
      (s < 0 ? P.indL : P.indR).push(at(rb(0.14, 0.08, 0.06, 0.02), s * 0.88, 0.8, -2.72));
      P.head.push(at(rb(0.34, 0.14, 0.06, 0.03), s * 0.62, 0.86, -2.71));
      P.trim.push(at(bx(0.07, 0.22, 0.14), s * 1.06, 1.55, -1.95));
    }
    P.trim.push(at(rb(W + 0.02, 0.2, 0.16, 0.06), 0, 0.42, L / 2 + 0.06));
    P.trim.push(at(rb(W + 0.02, 0.22, 0.16, 0.06), 0, 0.42, -2.68));
    P.plate.push(at(bx(0.52, 0.12, 0.02), 0, 0.62, L / 2 + 0.07));
    const w = wheels([[-0.86, -1.75], [0.86, -1.75], [-0.86, 1.7], [0.86, 1.7]], 0.37, 0.23);
    P.tire.push(...w.tires); P.rim.push(...w.rims);
  } else {
    // articulated truck: cab-over tractor + box trailer, 14.8 m
    cargo = trafficPaint('#e8e8e3');
    P.paint.push(at(rb(2.45, 2.65, 2.2, 0.16), 0, 1.98, -6.2));
    P.glass.push(at(bx(2.2, 0.95, 0.05), 0, 2.5, -7.31));
    for (const s of [-1, 1]) {
      P.glass.push(at(bx(0.02, 0.7, 0.9), s * 1.23, 2.5, -6.65));
      P.trim.push(at(bx(0.08, 0.4, 0.12), s * 1.34, 2.55, -7.15)); // mirrors
      P.head.push(at(rb(0.36, 0.14, 0.06, 0.03), s * 0.85, 0.95, -7.31));
      (s < 0 ? P.indL : P.indR).push(at(rb(0.14, 0.1, 0.06, 0.02), s * 1.1, 0.95, -7.31));
      P.tail.push(at(rb(0.3, 0.16, 0.06, 0.03), s * 1.0, 0.78, 7.36));
      (s < 0 ? P.indL : P.indR).push(at(rb(0.14, 0.16, 0.06, 0.03), s * 0.72, 0.78, 7.36));
    }
    P.trim.push(at(rb(2.4, 0.42, 0.25, 0.08), 0, 0.72, -7.2));                // bumper
    P.trim.push(at(bx(1.0, 0.7, 0.04), 0, 1.25, -7.31));                      // grille
    P.trim.push(at(bx(1.9, 0.45, 3.6), 0, 0.78, -5.2));                       // chassis
    P.cargo.push(at(rb(2.52, 3.0, 10.6, 0.06), 0, 2.45, 1.95));
    P.trim.push(at(bx(2.3, 0.35, 10.2), 0, 0.82, 1.95));                       // trailer chassis
    P.trim.push(at(bx(2.3, 0.12, 0.1), 0, 0.55, 7.32));                        // underride bar
    P.refl.push(at(bx(2.4, 0.06, 0.02), 0, 1.06, 7.27));                       // reflective strip
    for (const s of [-1, 1]) P.refl.push(at(bx(0.02, 0.06, 10.2), s * 1.265, 1.06, 1.95));
    P.plate.push(at(bx(0.52, 0.12, 0.02), 0, 0.95, 7.27));
    const list = [];
    for (const z of [-6.6, -4.4, 4.7, 5.75, 6.8]) list.push([-1.02, z], [1.02, z]);
    const w = wheels(list, 0.52, 0.3);
    P.tire.push(...w.tires); P.rim.push(...w.rims);
  }
  return finish(P, TRAFFIC_TYPES[type], paint, cargo);
}
