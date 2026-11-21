// A drift track built from a closed Catmull-Rom centre line: sampled every ~2 m into
// arrays (position, tangent, left normal, curvature, elevation, wall offsets). The road,
// run-off, kerbs and walls are ribbons/extrusions along those samples. Light from street
// lamps and ambient occlusion are baked into vertex attributes (no real lights).
import * as THREE from 'three';
import { drawWithFont } from '../parts.js';
import { asphaltDetail } from '../textures.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

/* ------------------------------------------------------------ baked light */
// Adds the per-vertex `baked` light (RGB) as emitted light times the surface colour, so
// lamp pools light the asphalt without any real light sources.
export function bakedMaterial(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute vec3 baked;\nvarying vec3 vBaked;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vBaked = baked;');
    sh.fragmentShader = 'varying vec3 vBaked;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * vBaked;');
  };
  mat.customProgramCacheKey = () => 'baked';
  return mat;
}

/* ---------------------------------------------------------------- textures */
function asphaltTexture(res, theme, width) {
  const W = res, H = res, [c, g] = canvas(W, H);
  const base = theme === 'neon' ? '#2a2b30' : theme === 'harbor' ? '#34363a' : '#3c3d40';
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  for (let i = 0; i < res * res * 0.06; i++) {
    const v = 40 + Math.random() * 45 | 0;
    g.fillStyle = `rgba(${v},${v},${v + 4},${0.3 + Math.random() * 0.4})`;
    g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 1.6, 1 + Math.random() * 1.6);
  }
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * W, y = Math.random() * H, r = 20 + Math.random() * res * 0.12;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, Math.random() < 0.6 ? 'rgba(10,10,12,0.16)' : 'rgba(140,140,140,0.06)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // rubber laid down by earlier drifts, in the middle of the road
  for (let i = 0; i < 14; i++) {
    const x = W * (0.25 + Math.random() * 0.5);
    g.strokeStyle = 'rgba(8,8,10,0.22)'; g.lineWidth = res * 0.012;
    g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (Math.random() - 0.5) * W * 0.3, H * 0.3, x + (Math.random() - 0.5) * W * 0.3, H * 0.7, x, H); g.stroke();
  }
  // edge lines (u = 0 and 1 are the road edges)
  const line = Math.max(2, (0.18 / width) * W);
  g.fillStyle = theme === 'neon' ? '#e8e6de' : '#e4ddc8';
  g.fillRect(line * 0.6, 0, line, H); g.fillRect(W - line * 1.6, 0, line, H);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function stripeTexture(a, b, n = 2) {
  const [c, g] = canvas(16, 64);
  for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(0, (i * 64) / n, 16, 64 / n); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function hatchTexture() {
  const [c, g] = canvas(64, 64);
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 9;
  for (let k = -64; k < 128; k += 22) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 64, 64); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function checkerTexture() {
  const [c, g] = canvas(128, 32);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#f2f2f2'; g.fillRect(x * 16, y * 16, 16, 16); }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function bannerTexture(title, sub, theme) {
  const [c, g] = canvas(1024, 160);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return drawWithFont('700 80px Rajdhani', () => {
    const bg = g.createLinearGradient(0, 0, 1024, 0);
    const cols = theme === 'neon' ? ['#12081f', '#2a0d3a'] : theme === 'harbor' ? ['#0c141e', '#18263a'] : ['#2a1a12', '#3a2416'];
    bg.addColorStop(0, cols[0]); bg.addColorStop(1, cols[1]);
    g.fillStyle = bg; g.fillRect(0, 0, 1024, 160);
    g.fillStyle = theme === 'neon' ? '#ff3fd2' : '#ff5a1f'; g.fillRect(0, 0, 1024, 8); g.fillRect(0, 152, 1024, 8);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f4f4f0'; g.font = 'italic 700 78px Rajdhani, Heebo, sans-serif'; g.fillText(title.toUpperCase(), 512, 70);
    g.fillStyle = '#ffc23d'; g.font = '600 30px Rajdhani, Heebo, sans-serif'; g.fillText(sub, 512, 126);
  }, t);
}

/* ------------------------------------------------------------------ track */
export class Track {
  constructor(def, quality) {
    this.def = def;
    this.quality = quality;
    this.group = new THREE.Group();
    this.width = def.width;
    this.sample();
    this.makeWalls();
    this.makeKerbs();
    this.makeClips();
    this.lamps = []; // { x, y, z, color, radius, power } filled in by the scenery before baking
  }

  /* --------------------------------------------------------- centre line */
  sample() {
    const d = this.def, n = d.pts.length;
    const pts = d.pts.map(([x, z], i) => {
      const y = d.climb ? d.climb * (0.5 - 0.5 * Math.cos((i / n) * Math.PI * 2)) + Math.sin(i * 1.7) * d.climb * 0.08 : 0;
      return new THREE.Vector3(x, y, z);
    });
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    const flatLen = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p.x, 0, p.z)), true, 'centripetal').getLength();
    const N = (this.N = Math.round(flatLen / 2));
    const P = curve.getSpacedPoints(N);
    this.px = new Float32Array(N); this.pz = new Float32Array(N); this.py = new Float32Array(N);
    this.tx = new Float32Array(N); this.tz = new Float32Array(N); this.nx = new Float32Array(N); this.nz = new Float32Array(N);
    this.s = new Float32Array(N); this.k = new Float32Array(N); this.slope = new Float32Array(N);
    for (let i = 0; i < N; i++) { this.px[i] = P[i].x; this.pz[i] = P[i].z; this.py[i] = P[i].y; }
    let acc = 0;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N, h = (i - 1 + N) % N;
      let tx = this.px[j] - this.px[h], tz = this.pz[j] - this.pz[h];
      const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      this.tx[i] = tx; this.tz[i] = tz;
      this.nx[i] = tz; this.nz[i] = -tx; // left of the driving direction
      this.s[i] = acc;
      const seg = Math.hypot(this.px[j] - this.px[i], this.pz[j] - this.pz[i]);
      this.slope[i] = (this.py[j] - this.py[h]) / Math.max(0.1, Math.hypot(this.px[j] - this.px[h], this.pz[j] - this.pz[h]));
      acc += seg;
    }
    this.length = acc;
    // curvature (+ = turning left), smoothed over ~16 m
    const raw = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 3 + N) % N, b = (i + 3) % N;
      const cross = this.tx[a] * this.tz[b] - this.tz[a] * this.tx[b];
      const dot = this.tx[a] * this.tx[b] + this.tz[a] * this.tz[b];
      raw[i] = -Math.atan2(cross, dot) / 12;
    }
    for (let i = 0; i < N; i++) { let sum = 0; for (let k = -4; k <= 4; k++) sum += raw[(i + k + N) % N]; this.k[i] = sum / 9; }
    // bounding box
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < N; i++) { x0 = Math.min(x0, this.px[i]); x1 = Math.max(x1, this.px[i]); z0 = Math.min(z0, this.pz[i]); z1 = Math.max(z1, this.pz[i]); y0 = Math.min(y0, this.py[i]); y1 = Math.max(y1, this.py[i]); }
    this.box = { x0, x1, z0, z1, y0, y1 };
    // spatial hash for nearest-sample lookups
    this.cell = 24;
    this.hash = new Map();
    for (let i = 0; i < N; i++) {
      const key = this.key(this.px[i], this.pz[i]);
      if (!this.hash.has(key)) this.hash.set(key, []);
      this.hash.get(key).push(i);
    }
  }

  key(x, z) { return Math.floor(x / this.cell) * 100003 + Math.floor(z / this.cell); }

  // kerb runs on the corners (the physics reads this map, the meshes are built from it)
  makeKerbs() {
    const N = this.N, th = 1 / 110;
    this.kerb = new Uint8Array(N);
    this.kerbRuns = [];
    let i = 0;
    while (i < N) {
      if (Math.abs(this.k[i]) < th) { i++; continue; }
      const a = i; while (i < N && Math.abs(this.k[i]) >= th) i++;
      if (i - a < 4) continue;
      const i0 = Math.max(0, a - 2), i1 = Math.min(N - 1, i + 2);
      this.kerbRuns.push([i0, i1]);
      for (let k = i0; k <= i1; k++) this.kerb[k] = 1;
    }
  }

  // what is under a wheel: { y, surface } (surface ids match physics/vehicle.js SURFACE)
  surfaceAt(x, z, hint, out, q) {
    const r = this.query(x, z, hint, q), w = this.width / 2, a = Math.abs(r.lat);
    out.y = r.y;
    if (a <= w - 0.32) out.surface = 0;                        // asphalt
    else if (a <= w - 0.1) out.surface = 1;                    // painted edge line
    else if (this.kerb[r.i] && a <= w + 0.9) {                 // kerb: grippy-ish and bumpy
      out.surface = 2;
      out.y += 0.022 + 0.018 * Math.abs(Math.sin(r.s * Math.PI));
    } else out.surface = this.def.theme === 'mountain' ? 4 : 3; // run-off: dirt / concrete
    return r.i;
  }

  // wall offsets: base run-off plus extra room on the outside of corners
  makeWalls() {
    const d = this.def, N = this.N, base = d.width / 2 + d.runoff;
    const extra = d.theme === 'mountain' ? 1.2 : 5;
    this.wallL = new Float32Array(N); this.wallR = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let kk = 0; for (let k = -10; k <= 10; k++) kk += this.k[(i + k + N) % N]; kk /= 21;
      const out = clamp(Math.abs(kk) * 140, 0, 1) * extra;
      this.wallL[i] = base + (kk < 0 ? out : 0); // turning right: outside is on the left
      this.wallR[i] = base + (kk > 0 ? out : 0);
    }
    this.maxWall = base + extra;
  }

  /* ------------------------------------------------------------- queries */
  nearest(x, z, hint = -1) {
    let best = -1, bd = Infinity;
    const scan = (i) => { const dx = x - this.px[i], dz = z - this.pz[i], d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } };
    if (hint >= 0) {
      for (let k = -24; k <= 24; k++) scan((hint + k + this.N) % this.N);
      if (bd < 30 * 30) return best;
    }
    // spatial hash: 3x3 cells, then 5x5, then everything
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    for (const r of [1, 2]) {
      for (let ix = cx - r; ix <= cx + r; ix++) for (let iz = cz - r; iz <= cz + r; iz++) {
        const list = this.hash.get(ix * 100003 + iz);
        if (list) for (const i of list) scan(i);
      }
      if (best >= 0 && bd <= (r * this.cell) ** 2) return best;
    }
    for (let i = 0; i < this.N; i++) scan(i);
    return best;
  }

  // projection onto the centre line: { i, s, lat (+ = left), y, slope, tx, tz, nx, nz, wallL, wallR }
  query(x, z, hint = -1, out = {}) {
    const N = this.N;
    let i = this.nearest(x, z, hint);
    // pick the segment the point projects onto
    const j = (i + 1) % N, h = (i - 1 + N) % N;
    const along = (x - this.px[i]) * this.tx[i] + (z - this.pz[i]) * this.tz[i];
    let a = i, b = j;
    if (along < 0) { a = h; b = i; }
    const sx = this.px[b] - this.px[a], sz = this.pz[b] - this.pz[a], sl = Math.hypot(sx, sz) || 1;
    const t = clamp(((x - this.px[a]) * sx + (z - this.pz[a]) * sz) / (sl * sl), 0, 1);
    const lerp = (arr) => arr[a] + (arr[b] - arr[a]) * t;
    const cx = this.px[a] + sx * t, cz = this.pz[a] + sz * t;
    const nx = lerp(this.nx), nz = lerp(this.nz), nl = Math.hypot(nx, nz) || 1;
    out.i = i; out.a = a; out.t = t;
    out.nx = nx / nl; out.nz = nz / nl; out.tx = -out.nz; out.tz = out.nx;
    out.lat = (x - cx) * out.nx + (z - cz) * out.nz;
    let s = this.s[a] + (b === 0 ? this.length - this.s[a] : this.s[b] - this.s[a]) * t;
    out.s = s % this.length;
    out.y = lerp(this.py); out.slope = lerp(this.slope);
    out.wallL = lerp(this.wallL); out.wallR = lerp(this.wallR);
    out.k = lerp(this.k);
    return out;
  }

  // world position of (sample i, lateral offset), y on the road surface
  at(i, lat, y = 0, out = new THREE.Vector3()) {
    return out.set(this.px[i] + this.nx[i] * lat, this.py[i] + y, this.pz[i] + this.nz[i] * lat);
  }

  // spawn pose a little before the start line
  spawn(back = 14) {
    const i = (this.N - Math.round(back / (this.length / this.N))) % this.N;
    return { x: this.px[i], z: this.pz[i], y: this.py[i], yaw: Math.atan2(-this.tx[i], -this.tz[i]), i };
  }

  /* ------------------------------------------------------- clip markers */
  // corners -> inner clipping point at the apex, outer clipping zone on the entry
  makeClips() {
    const N = this.N, w = this.width / 2, th = 1 / 85;
    const clips = [];
    let i0 = 0; while (Math.abs(this.k[i0]) > th && i0 < N) i0++;
    for (let n = 0, i = i0; n < N; ) {
      if (Math.abs(this.k[i % N]) <= th) { i++; n++; continue; }
      const start = i, sign = Math.sign(this.k[i % N]);
      let apex = i, peak = 0;
      while (n < N && Math.abs(this.k[i % N]) > th && Math.sign(this.k[i % N]) === sign) { if (Math.abs(this.k[i % N]) > peak) { peak = Math.abs(this.k[i % N]); apex = i; } i++; n++; }
      const end = i, len = (end - start) * (this.length / N);
      if (len < 14) continue;
      const side = sign; // +1: left turn, the inside is on the left
      clips.push({ type: 'point', i: apex % N, side, s: this.s[apex % N] });
      if (len >= 22) {
        const zs = start, ze = Math.min(apex, start + Math.round(30 / (this.length / N)));
        if (ze - zs >= 5) clips.push({ type: 'zone', i0: zs % N, i1: ze % N, side: -side, s0: this.s[zs % N], s1: this.s[ze % N] });
      }
    }
    clips.forEach((c, k) => { c.id = k; c.edge = w; });
    this.clips = clips;
  }

  /* ------------------------------------------------------------ geometry */
  // ribbon between lateral offsets (a[i] -> b[i]) with `cols` columns; returns geometry with uv, color, baked
  ribbon(latA, latB, cols, { y = 0.0, yB = null, vScale = 1 / 8, uFlip = false, i0 = 0, i1 = this.N, closed = true } = {}) {
    const N = this.N, count = closed ? N + 1 : i1 - i0 + 1, pos = [], uv = [], idx = [];
    for (let r = 0; r < count; r++) {
      const i = (i0 + r) % N;
      const sv = closed ? (r === N ? this.length : this.s[i]) : this.s[i] - this.s[i0 % N] + (this.s[i] < this.s[i0 % N] ? this.length : 0);
      const A = typeof latA === 'function' ? latA(i) : latA, B = typeof latB === 'function' ? latB(i) : latB;
      for (let c = 0; c <= cols; c++) {
        const f = c / cols, lat = A + (B - A) * f;
        const yy = yB == null ? y : y + (yB - y) * f;
        pos.push(this.px[i] + this.nx[i] * lat, this.py[i] + yy, this.pz[i] + this.nz[i] * lat);
        uv.push(uFlip ? 1 - f : f, sv * vScale);
      }
      if (r < count - 1) for (let c = 0; c < cols; c++) {
        const o = r * (cols + 1) + c, o2 = o + cols + 1;
        idx.push(o, o2, o + 1, o + 1, o2, o2 + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    // winding: make the surface face up
    g.computeVertexNormals();
    const nrm = g.attributes.normal;
    if (nrm.count && nrm.getY(0) < 0) { for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
    return g;
  }

  // a profile [[dLat, dy], ...] swept along one side (side +1 left, -1 right) at offset off(i)
  extrude(profile, side, off, { vScale = 1 / 4 } = {}) {
    const N = this.N, P = profile.length, pos = [], uv = [], idx = [];
    for (let r = 0; r <= N; r++) {
      const i = r % N, o = off(i), sv = (r === N ? this.length : this.s[i]) * vScale;
      for (let p = 0; p < P; p++) {
        const lat = side * (o + profile[p][0]);
        pos.push(this.px[i] + this.nx[i] * lat, this.py[i] + profile[p][1], this.pz[i] + this.nz[i] * lat);
        uv.push(p / (P - 1), sv);
      }
      if (r < N) for (let p = 0; p < P - 1; p++) {
        const a = r * P + p, b = a + P;
        if (side > 0) idx.push(a, b, a + 1, a + 1, b, b + 1); else idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // per-vertex baked light from the lamps + darkening near the walls (ambient occlusion)
  bake(geo, { ao = 0, aoNear = 1.5 } = {}) {
    const p = geo.attributes.position, n = p.count;
    const baked = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const lamps = this.lamps;
    const tmp = {};
    let hint = -1;
    for (let v = 0; v < n; v++) {
      const x = p.getX(v), y = p.getY(v), z = p.getZ(v);
      let r = 0, g = 0, b = 0;
      for (const L of lamps) {
        const dx = x - L.x, dz = z - L.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > L.radius * L.radius) continue;
        const h = Math.max(0.5, L.y - y), r2 = Math.max(2.5, d2 + h * h);
        const f = Math.min(1.4, (L.power * h) / Math.pow(r2, 1.5) * 40 * (1 - Math.sqrt(d2) / L.radius));
        r += L.color.r * f; g += L.color.g * f; b += L.color.b * f;
      }
      baked[v * 3] = r; baked[v * 3 + 1] = g; baked[v * 3 + 2] = b;
      let c = 1;
      if (ao) {
        const q = this.query(x, z, hint, tmp); hint = q.i;
        const dl = (q.lat > 0 ? q.wallL : q.wallR) - Math.abs(q.lat);
        c = 1 - ao * (1 - smoothstep(0, aoNear, dl));
      }
      col[v * 3] = col[v * 3 + 1] = col[v * 3 + 2] = c;
    }
    geo.setAttribute('baked', new THREE.BufferAttribute(baked, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  }

  // road, run-off, kerbs, start line, clip markers (walls and scenery come from the theme)
  buildSurface(maxAniso = 4) {
    const d = this.def, w = d.width / 2, q = this.quality;
    const res = q.roadRes >= 2048 ? 1024 : q.roadRes >= 1536 ? 1024 : 512;
    const roadTex = asphaltTexture(res, d.theme, d.width);
    roadTex.anisotropy = maxAniso;
    roadTex.repeat.set(1, 1);
    const roadMat = bakedMaterial(new THREE.MeshStandardMaterial({ map: roadTex, vertexColors: true, roughness: d.theme === 'neon' ? 0.5 : 0.85, metalness: 0 }));
    if (q.normalMaps) {
      // aggregate relief + roughness (rubbered lines slicker, paint smooth); Neon's surface is damp and glossy
      const det = asphaltDetail(roadTex.image);
      const mk = (c) => { const t = new THREE.CanvasTexture(c); t.wrapS = roadTex.wrapS; t.wrapT = roadTex.wrapT; t.repeat.copy(roadTex.repeat); t.anisotropy = maxAniso; return t; };
      roadMat.normalMap = mk(det.normalCanvas); roadMat.normalScale = new THREE.Vector2(0.9, 0.9);
      roadMat.roughnessMap = mk(det.roughnessCanvas); roadMat.roughness = d.theme === 'neon' ? 0.62 : 1;
    }
    const road = new THREE.Mesh(this.bake(this.ribbon(-w, w, 6, { vScale: 1 / d.width }), { ao: 0.25, aoNear: 3 }), roadMat);
    road.receiveShadow = true; road.name = 'road';
    this.group.add(road);
    this.roadMat = roadMat;

    // run-off
    const runCol = { harbor: '#4a4b4c', mountain: '#5d564c', neon: '#232329' }[d.theme];
    const runTex = asphaltTexture(256, d.theme, 40);
    const runMat = bakedMaterial(new THREE.MeshStandardMaterial({ color: runCol, map: runTex, vertexColors: true, roughness: 0.95 }));
    for (const side of [1, -1]) {
      const geo = this.ribbon(side * w, (i) => side * (side > 0 ? this.wallL[i] : this.wallR[i]), 2, { y: -0.015, vScale: 1 / 6 });
      const m = new THREE.Mesh(this.bake(geo, { ao: 0.45, aoNear: 1.2 }), runMat);
      m.receiveShadow = true; this.group.add(m);
    }

    // kerbs on the corners: red/white blocks just outside the white line
    const kerbTex = stripeTexture('#c8261c', '#efefea');
    const kerbMat = bakedMaterial(new THREE.MeshStandardMaterial({ map: kerbTex, vertexColors: true, roughness: 0.6 }));
    for (const side of [1, -1]) {
      for (const [i0, i1] of this.kerbRuns) {
        const geo = this.ribbon(side * (w - 0.15), side * (w + 0.9), 2, { y: 0.02, yB: 0.045, vScale: 1 / 2, i0, i1, closed: false });
        const m = new THREE.Mesh(this.bake(geo), kerbMat); m.receiveShadow = true; this.group.add(m);
      }
    }

    // start / finish: chequered band + banner gantry
    const chk = checkerTexture(); chk.repeat.set(d.width / 2, 1);
    const sf = new THREE.Mesh(this.ribbon(-w, w, 1, { y: 0.012, i0: 0, i1: 1, closed: false, vScale: 1 }), new THREE.MeshStandardMaterial({ map: chk, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.group.add(sf);
    const steel = new THREE.MeshStandardMaterial({ color: '#2b2e33', metalness: 0.7, roughness: 0.4 });
    const gantry = new THREE.Group();
    const span = Math.max(this.wallL[0], this.wallR[0]) * 2 + 1;
    for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7.2, 0.5), steel); p.position.set(sx * span / 2, 4.1, 0); p.scale.y = 8.2 / 7.2; gantry.add(p); }
    const bw = Math.min(14, span * 0.6), bh = bw * 0.156;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(span + 0.6, bh + 0.3, 0.5), steel); beam.position.y = 8.2; gantry.add(beam);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshBasicMaterial({ map: bannerTexture(d.name, 'START · FINISH', d.theme), toneMapped: false }));
    banner.position.set(0, 8.2, 0.27); banner.material.color.setScalar(0.85); gantry.add(banner);
    const back = banner.clone(); back.rotation.y = Math.PI; back.position.z = -0.27; gantry.add(back);
    // start lights
    this.startLights = [];
    for (let k = 0; k < 5; k++) {
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.22, 18), new THREE.MeshBasicMaterial({ color: '#330606' }));
      l.position.set((k - 2) * 0.6, 8.2 - bh / 2 - 0.45, 0.27); gantry.add(l); this.startLights.push(l);
      const l2 = l.clone(); l2.material = l.material; l2.rotation.y = Math.PI; l2.position.z = -0.27; gantry.add(l2);
    }
    gantry.position.set(this.px[0], this.py[0], this.pz[0]);
    gantry.rotation.y = Math.atan2(-this.tx[0], -this.tz[0]);
    gantry.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    this.group.add(gantry);

    // clip markers
    this.buildClipMarkers();
  }

  buildClipMarkers() {
    const hatch = hatchTexture();
    const coneGeo = new THREE.ConeGeometry(0.22, 0.7, 10).translate(0, 0.35, 0);
    const cones = [], poles = [];
    this.clipMeshes = [];
    for (const c of this.clips) {
      const w = this.width / 2;
      if (c.type === 'zone') {
        const inner = c.side * (w - 2.8), outer = c.side * (w + 0.2);
        const tex = hatch.clone(); tex.needsUpdate = true; tex.repeat.set(2, 1);
        const mat = new THREE.MeshBasicMaterial({ map: tex, color: '#ffc23d', transparent: true, opacity: 0.38, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
        const m = new THREE.Mesh(this.ribbon(inner, outer, 1, { y: 0.02, i0: c.i0, i1: c.i1 >= c.i0 ? c.i1 : c.i1 + this.N, closed: false, vScale: 1 / 3 }), mat);
        m.renderOrder = 2;
        this.group.add(m); this.clipMeshes[c.id] = mat;
        // cones on the zone edge, just outside the road
        const step = 3, len = c.i1 >= c.i0 ? c.i1 - c.i0 : c.i1 + this.N - c.i0;
        for (let k = 0; k <= len; k += step) { const i = (c.i0 + k) % this.N; cones.push(this.at(i, c.side * (w + 1.1))); }
      } else {
        const p = this.at(c.i, c.side * (w + 0.9));
        poles.push(p);
        const mat = new THREE.MeshBasicMaterial({ color: '#ffc23d', transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
        const disc = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.25, 28).rotateX(-Math.PI / 2), mat);
        disc.position.copy(this.at(c.i, c.side * (w - 1.1), 0.025)); disc.renderOrder = 2;
        this.group.add(disc); this.clipMeshes[c.id] = mat;
      }
    }
    const inst = (geo, mat, list, sy = 1) => {
      if (!list.length) return;
      const m = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D();
      list.forEach((p, i) => { o.position.copy(p); o.scale.set(1, sy, 1); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
      m.computeBoundingSphere();
      this.group.add(m);
    };
    inst(coneGeo, new THREE.MeshStandardMaterial({ map: stripeTexture('#ff6a1a', '#f4f4f0', 4), roughness: 0.6, emissive: '#ff5a10', emissiveIntensity: 0.15 }), cones);
    const poleTex = stripeTexture('#ffc23d', '#161616', 8); poleTex.repeat.set(1, 1);
    inst(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 10).translate(0, 1.3, 0), new THREE.MeshStandardMaterial({ map: poleTex, roughness: 0.5, emissive: '#ffc23d', emissiveIntensity: 0.25 }), poles);
  }

  // clip marker feedback: flash green when scored, reset each lap
  setClipHit(id, hit) {
    const m = this.clipMeshes[id];
    if (m) { m.color.set(hit ? '#3ddc84' : '#ffc23d'); m.opacity = hit ? 0.6 : (this.clips[id].type === 'zone' ? 0.38 : 0.5); }
  }

  // minimap: normalised SVG path + transform for world -> map coordinates
  minimap(size = 100) {
    const b = this.box, w = b.x1 - b.x0, h = b.z1 - b.z0, sc = (size - 8) / Math.max(w, h);
    const ox = (size - w * sc) / 2 - b.x0 * sc, oz = (size - h * sc) / 2 - b.z0 * sc;
    let d = '';
    for (let i = 0; i < this.N; i += 2) d += (i ? 'L' : 'M') + (this.px[i] * sc + ox).toFixed(1) + ' ' + (this.pz[i] * sc + oz).toFixed(1);
    return { d: d + 'Z', map: (x, z) => [x * sc + ox, z * sc + oz], size };
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) [].concat(o.material).forEach((m) => { for (const k of ['map', 'emissiveMap', 'roughnessMap', 'normalMap']) if (m[k]) m[k].dispose(); m.dispose(); });
    });
  }
}
