// Geometry helpers shared by the player cars and traffic.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAT } from './materials.js';

export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// Smooth piecewise curve through [z, value] keys (smoothstep between keys).
export function curve(keys) {
  return (z) => {
    if (z <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (z <= keys[i][0]) {
        const [z0, v0] = keys[i - 1], [z1, v1] = keys[i];
        return lerp(v0, v1, smooth((z - z0) / (z1 - z0)));
      }
    }
    return keys[keys.length - 1][1];
  };
}

// Plan-view superellipse: 1 in the middle, 0 at the tips.
export function planShape(z, zFront, zRear, pFront = 5, pRear = 6) {
  const mid = (zFront + zRear) / 2, half = (zRear - zFront) / 2;
  const t = Math.min(1, Math.abs((z - mid) / half));
  const p = z < mid ? pFront : pRear;
  return Math.pow(Math.max(0, 1 - Math.pow(t, p)), 1 / p);
}

/**
 * Loft a closed, left/right symmetric body.
 * stations: increasing z values. section(z) returns half-section points
 * [[x, y], ...] from bottom-centre (x=0) around the right side to top-centre (x=0).
 * Every section must have the same number of points.
 */
export function loft(stations, section) {
  const rings = [];
  for (const z of stations) {
    const half = section(z);
    const ring = half.map(([x, y]) => [x, y]);
    for (let i = half.length - 2; i >= 1; i--) ring.push([-half[i][0], half[i][1]]);
    rings.push({ z, ring });
  }
  const n = rings[0].ring.length;
  const pos = [];
  for (const { z, ring } of rings) for (const [x, y] of ring) pos.push(x, y, z);
  const idx = [];
  for (let s = 0; s < rings.length - 1; s++) {
    for (let j = 0; j < n; j++) {
      const a = s * n + j, b = s * n + ((j + 1) % n), c = (s + 1) * n + ((j + 1) % n), d = (s + 1) * n + j;
      idx.push(a, b, c, a, c, d);
    }
  }
  // end caps
  const cap = (s, front) => {
    const { z, ring } = rings[s];
    let cx = 0, cy = 0;
    for (const [, y] of ring) cy += y;
    cy /= ring.length;
    const ci = pos.length / 3;
    pos.push(cx, cy, z);
    for (let j = 0; j < n; j++) {
      const a = s * n + j, b = s * n + ((j + 1) % n);
      if (front) idx.push(ci, b, a); else idx.push(ci, a, b);
    }
  };
  cap(0, true);
  cap(rings.length - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Sweep a closed 2D profile along a smooth curve. `axis` stays fixed (the
 * profile's first coordinate); the second runs along the in-plane normal.
 * profile(t) returns counter-clockwise [[a, b], ...] (same count for every t).
 */
export function sweep(points, axis, profile, segs = 48) {
  const curveP = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const A = axis.clone().normalize(), N = new THREE.Vector3();
  const n = profile(0).length, pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, p = curveP.getPointAt(t), T = curveP.getTangentAt(t);
    N.crossVectors(A, T).normalize();
    for (const [a, b] of profile(t)) pos.push(p.x + A.x * a + N.x * b, p.y + A.y * a + N.y * b, p.z + A.z * a + N.z * b);
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < n; j++) {
    const a = i * n + j, b = i * n + ((j + 1) % n), c = (i + 1) * n + ((j + 1) % n), d = (i + 1) * n + j;
    idx.push(a, c, b, a, d, c);
  }
  for (const [ring, start] of [[0, true], [segs, false]]) {
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < n; j++) { cx += pos[(ring * n + j) * 3]; cy += pos[(ring * n + j) * 3 + 1]; cz += pos[(ring * n + j) * 3 + 2]; }
    const ci = pos.length / 3; pos.push(cx / n, cy / n, cz / n);
    for (let j = 0; j < n; j++) { const a = ring * n + j, b = ring * n + ((j + 1) % n); if (start) idx.push(ci, a, b); else idx.push(ci, b, a); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// counter-clockwise airfoil in (chord, thickness); leading edge at -chord/2
export function airfoil(chord, thick, k = 10) {
  const pts = [];
  for (let i = 0; i <= k; i++) { const u = 1 - i / k; pts.push([chord * (u - 0.5), thick * 0.6 * Math.sin(Math.PI * Math.pow(u, 0.7))]); }
  for (let i = 1; i < k; i++) { const u = i / k; pts.push([chord * (u - 0.5), -thick * 0.4 * Math.sin(Math.PI * Math.pow(u, 0.7))]); }
  return pts;
}

export function roundedRectShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// rounded-rect plate/housing facing +z, centred, `depth` deep with soft bevel
export function roundedPlate(w, h, r, depth, bevel = 0.008) {
  const g = new THREE.ExtrudeGeometry(roundedRectShape(w - bevel * 2, h - bevel * 2, Math.max(0.001, r - bevel)), { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  return g;
}

// give every texture under `root` the GPU's maximum anisotropic filtering (sharp at grazing angles)
export function maxAnisotropy(root, renderer) {
  const n = renderer.capabilities.getMaxAnisotropy();
  const keys = ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'metalnessMap', 'alphaMap'];
  root.traverse((o) => {
    for (const m of [].concat(o.material || [])) for (const k of keys) {
      const t = m[k];
      if (t && t.anisotropy !== n) { t.anisotropy = n; t.needsUpdate = true; }
    }
  });
}

export function range(a, b, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(lerp(a, b, i / (n - 1)));
  return out;
}

export function mesh(geo, mat, x = 0, y = 0, z = 0, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  return m;
}

const boxCache = new Map();
export function boxGeo(w, h, d) {
  const k = `${w}|${h}|${d}`;
  if (!boxCache.has(k)) boxCache.set(k, new THREE.BoxGeometry(w, h, d));
  return boxCache.get(k);
}
export const box = (w, h, d, mat, x, y, z) => mesh(boxGeo(w, h, d), mat, x, y, z);

// a round lamp facing +z (rear) or -z (front)
export function lamp(r, mat, x, y, z, facing = 1, depth = 0.04) {
  const g = new THREE.CylinderGeometry(r, r, depth, 20).rotateX(Math.PI / 2);
  const m = mesh(g, mat, x, y, z + facing * depth * 0.3, false);
  return m;
}

/* --------------------------------------------------------------- wheels */
const wheelCache = new Map();

function tireGeometry(r, rimR, w) {
  // rounded low-profile tyre section, lathed around the axle
  const pts = [];
  const sw = w / 2, rr = Math.min(0.045, (r - rimR) * 0.45);
  pts.push(new THREE.Vector2(rimR, -sw * 0.92));
  pts.push(new THREE.Vector2(r - rr, -sw));
  for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i / 10) * (Math.PI / 2); pts.push(new THREE.Vector2(r - rr + Math.cos(a) * rr, -sw + rr + Math.sin(a) * rr)); }
  for (let i = 0; i <= 10; i++) { const a = (i / 10) * (Math.PI / 2); pts.push(new THREE.Vector2(r - rr + Math.cos(a) * rr, sw - rr + Math.sin(a) * rr)); }
  pts.push(new THREE.Vector2(rimR, sw * 0.92));
  const g = new THREE.LatheGeometry(pts, 64);
  g.rotateZ(Math.PI / 2); // axle along x
  return g;
}

function spokeGeometry(rimR, w, spokes, style) {
  const parts = [];
  const face = w / 2 - (style === 'dish' ? 0.06 : 0.02); // dished wheels sit the spokes deeper
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const len = rimR - 0.05;
    const doubles = style === 'double' ? [-0.07, 0.07] : [0];
    for (const off of doubles) {
      // x = thickness along the axle, y = radial length, z = tangential width
      const s = new THREE.BoxGeometry(0.03, len, style === 'double' ? 0.03 : style === 'dish' ? 0.085 : style === 'wide' ? 0.06 : 0.046);
      s.translate(0, 0.05 + len / 2, 0);
      // taper: narrow at the rim
      const p = s.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const y = p.getY(k);
        p.setZ(k, p.getZ(k) * (1.25 - 0.5 * (y / rimR)));
      }
      s.rotateX(a + off);
      s.translate(face, 0, 0);
      parts.push(s);
    }
  }
  const hubR = style === 'dish' ? 0.085 : 0.055;
  const hub = new THREE.CylinderGeometry(hubR, hubR + 0.01, 0.06, 20).rotateZ(Math.PI / 2).translate(face, 0, 0);
  parts.push(hub);
  if (style === 'dish') {
    // polished dish: a cone from the rim lip down to the spoke face
    parts.push(new THREE.CylinderGeometry(rimR - 0.012, rimR - 0.045, 0.06, 32, 1, true).rotateZ(-Math.PI / 2).translate(w / 2 - 0.035, 0, 0));
  }
  return mergeGeometries(parts.map((p) => p.toNonIndexed()));
}

/**
 * Detailed wheel. Returns a Group (steer pivot) with userData.spin (rotating
 * part). The spokes face +x; mirror is handled by rotating left wheels.
 */
let sidewallTex = null;
function sidewallTexture() {
  if (sidewallTex) return sidewallTex;
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.translate(256, 256);
  g.fillStyle = 'rgba(150,150,150,0.55)'; g.font = '700 30px Rajdhani, Heebo, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const words = ['PERFORMANCE', '255/40 ZR18', 'RADIAL', 'TUBELESS'];
  for (let w = 0; w < 4; w++) {
    const text = words[w], a0 = (w / 4) * Math.PI * 2;
    for (let i = 0; i < text.length; i++) {
      g.save(); g.rotate(a0 + (i - text.length / 2) * 0.045); g.translate(0, -226); g.fillText(text[i], 0, 0); g.restore();
    }
  }
  g.strokeStyle = 'rgba(120,120,120,0.35)'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 246, 0, 7); g.stroke();
  sidewallTex = new THREE.CanvasTexture(c); sidewallTex.colorSpace = THREE.SRGBColorSpace;
  return sidewallTex;
}

export function buildWheel({ r = 0.33, rimR = 0.23, width = 0.245, spokes = 10, style = 'single', rimMat = MAT.alloy, caliper = MAT.caliperRed, sidewall = false }) {
  const key = `${r}|${rimR}|${width}|${spokes}|${style}`;
  if (!wheelCache.has(key)) {
    const ni = (g) => (g.index ? g.toNonIndexed() : g);
    wheelCache.set(key, {
      // rubber + dark rim barrel + backing disc share one mesh; lip + spokes share another
      tire: mergeGeometries([tireGeometry(r, rimR, width), new THREE.CylinderGeometry(rimR, rimR, width * 0.9, 56, 1, true).rotateZ(Math.PI / 2),
        new THREE.CircleGeometry(rimR - 0.01, 56).rotateY(Math.PI / 2).translate(-width * 0.2, 0, 0)].map(ni)),
      rim: mergeGeometries([new THREE.TorusGeometry(rimR - 0.006, 0.012, 6, 32).rotateY(Math.PI / 2).translate(width / 2 - 0.012, 0, 0), spokeGeometry(rimR, width, spokes, style)].map(ni)),
      disc: new THREE.CylinderGeometry(rimR * 0.82, rimR * 0.82, 0.028, 28).rotateZ(Math.PI / 2).translate(width * 0.05, 0, 0),
      caliper: new THREE.BoxGeometry(0.06, 0.12, 0.2).translate(width * 0.12, rimR * 0.62, 0.0),
    });
  }
  const G = wheelCache.get(key);
  const pivot = new THREE.Group();
  const spin = new THREE.Group();
  spin.add(mesh(G.tire, MAT.tire), mesh(G.rim, rimMat), mesh(G.disc, MAT.disc, 0, 0, 0, false));
  const cal = mesh(G.caliper, caliper, 0, 0, 0, false);
  cal.rotation.x = -0.6; // sits at the top-rear of the disc
  pivot.add(spin, cal);
  if (sidewall) {
    // lettering decal on the outer sidewall (RingGeometry UVs are planar, so the canvas maps straight on)
    const ring = new THREE.Mesh(new THREE.RingGeometry(rimR + 0.012, r - 0.012, 48, 1).rotateY(Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: sidewallTexture(), transparent: true, roughness: 0.8, depthWrite: false }));
    ring.position.x = width / 2 + 0.003;
    ring.scale.setScalar(1);
    spin.add(ring);
  }
  pivot.userData.spin = spin;
  return pivot;
}

/** Adds 4 wheels to `root`. Front wheels go in userData.steerWheels. */
export function addWheels(root, { front, rear, track, r, ...opts }) {
  const wheels = [], steer = [];
  for (const [z, isFront] of [[front, true], [rear, false]]) {
    for (const side of [-1, 1]) {
      const w = buildWheel({ r, ...opts });
      w.position.set(side * track, r, z);
      if (side < 0) w.rotation.y = Math.PI; // spokes face outward on the left too
      w.userData.sign = side < 0 ? -1 : 1;
      w.userData.baseY = w.rotation.y;
      root.add(w);
      wheels.push(w);
      if (isFront) steer.push(w);
    }
  }
  root.userData.wheels = wheels;
  root.userData.steerWheels = steer;
  root.userData.wheelR = r;
}

/* ----------------------------------------------------------- blob shadow */
let blobTex = null;
export function blobShadow(w, l) {
  if (!blobTex) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,0.7)'); grad.addColorStop(0.55, 'rgba(0,0,0,0.4)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
  m.scale.set(w * 1.3, 1, l * 1.12);
  m.position.y = 0.015;
  m.renderOrder = -1;
  m.userData.blob = true;
  return m;
}

/**
 * Merge every static mesh under `group` that shares a material into one mesh
 * (fewer draw calls). Meshes under an object flagged userData.dynamic or
 * userData.roof, and textured meshes, are left alone.
 */
export function mergeStatic(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map(), remove = [], m4 = new THREE.Matrix4();
  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || o.material.map) return;
    for (let p = o; p && p !== group; p = p.parent) if (p.userData.dynamic || p.userData.roof) return;
    const key = `${o.material.uuid}|${o.castShadow}|${o.renderOrder}`;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    g.applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld));
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, ro: o.renderOrder, geos: [] });
    buckets.get(key).geos.push(g);
    remove.push(o);
  });
  for (const o of remove) o.parent.remove(o);
  for (const b of buckets.values()) {
    const m = new THREE.Mesh(mergeGeometries(b.geos), b.mat);
    m.castShadow = b.cast; m.receiveShadow = true; m.renderOrder = b.ro;
    group.add(m);
  }
  return buckets.size;
}

export { mergeGeometries };

// Canvas text uses the bundled web fonts, which load lazily: draw now with the fallback,
// then redraw once the font is ready and re-upload the texture.
export function drawWithFont(font, draw, tex) {
  draw();
  if (typeof document !== 'undefined' && document.fonts && document.fonts.load) {
    document.fonts.load(font).then(() => { draw(); tex.needsUpdate = true; }).catch(() => {});
  }
  return tex;
}
