// Track themes: sky, lighting, walls and scenery for Harbor Night, Mountain Pass and
// Neon Circuit. Repeated objects are InstancedMeshes split into chunks (so off-screen
// chunks are culled) with a near/far level of detail per chunk. Street-lamp light is
// baked into the road (see Track.bake); only the car and the nearest lamps use real lights.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bakedMaterial } from './track.js';
import { drawWithFont } from '../parts.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rand = (a, b) => a + rnd() * (b - a);
const pick = (arr) => arr[(rnd() * arr.length) | 0];
// cheap value noise
const hash2 = (x, z) => { const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return n - Math.floor(n); };
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
const fbm = (x, z) => vnoise(x, z) * 0.55 + vnoise(x * 2.1, z * 2.1) * 0.28 + vnoise(x * 4.3, z * 4.3) * 0.17;

/* ------------------------------------------------- chunked instances + LOD */
export class Scatter {
  constructor(group, cell = 150) { this.group = group; this.cell = cell; this.chunks = []; }
  // items: [{ x, y, z, ry, sx, sy, sz, color }]
  add(items, hi, lo = null, { lod = 160, far = 2000, cast = false } = {}) {
    const byCell = new Map();
    for (const it of items) {
      const k = Math.floor(it.x / this.cell) + ',' + Math.floor(it.z / this.cell);
      if (!byCell.has(k)) byCell.set(k, []);
      byCell.get(k).push(it);
    }
    const o = new THREE.Object3D(), col = new THREE.Color();
    const make = ([geo, mat], list) => {
      const m = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((t, i) => {
        o.position.set(t.x, t.y || 0, t.z); o.rotation.set(0, t.ry || 0, 0); o.scale.set(t.sx || 1, t.sy || t.sx || 1, t.sz || t.sx || 1);
        o.updateMatrix(); m.setMatrixAt(i, o.matrix);
        if (t.color) m.setColorAt(i, col.set(t.color));
      });
      m.castShadow = cast; m.receiveShadow = false;
      m.computeBoundingSphere();
      this.group.add(m);
      return m;
    };
    for (const list of byCell.values()) {
      let cx = 0, cz = 0; for (const t of list) { cx += t.x; cz += t.z; }
      this.chunks.push({ x: cx / list.length, z: cz / list.length, hi: make(hi, list), lo: lo ? make(lo, list) : null, lod, far });
    }
  }
  update(cam) {
    for (const c of this.chunks) {
      const d = Math.hypot(c.x - cam.x, c.z - cam.z);
      const near = d < c.lod || !c.lo;
      c.hi.visible = near && d < c.far;
      if (c.lo) c.lo.visible = !near && d < c.far;
    }
  }
}

/* ------------------------------------------------------------------- skies */
function nightSky(top, horizon, stars = true) {
  const g = new THREE.Group();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color(top) }, hor: { value: new THREE.Color(horizon) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 hor; varying vec3 vP; void main(){ float h = clamp(vP.y * 2.2, 0.0, 1.0); gl_FragColor = vec4(mix(hor, top, pow(h, 0.6)), 1.0); }',
    side: THREE.BackSide, depthWrite: false, fog: false,
  }));
  sky.renderOrder = -10; g.add(sky);
  if (stars) {
    const pos = [];
    for (let i = 0; i < 1400; i++) {
      const a = rnd() * Math.PI * 2, e = Math.asin(rand(0.08, 1));
      pos.push(Math.cos(a) * Math.cos(e) * 1700, Math.sin(e) * 1700, Math.sin(a) * Math.cos(e) * 1700);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const st = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#cfd8ff', size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8, depthWrite: false }));
    st.renderOrder = -9; g.add(st);
  }
  return g;
}

// environment map for car reflections: gradient sky + a few bright panels for highlights
function envFrom(renderer, top, bottom, panels) {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), new THREE.ShaderMaterial({
    uniforms: { a: { value: new THREE.Color(top) }, b: { value: new THREE.Color(bottom) } },
    vertexShader: 'varying float vY; void main(){ vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 a; uniform vec3 b; varying float vY; void main(){ gl_FragColor = vec4(mix(b, a, smoothstep(-0.2, 0.6, vY)), 1.0); }',
    side: THREE.BackSide,
  })));
  for (const [x, y, z, w, h, c] of panels) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(s, 0.02).texture;
  pm.dispose();
  return tex;
}

/* ---------------------------------------------------------------- textures */
function concreteTexture(base = '#8d8b86', stripe = null) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) { const v = (Math.random() * 40 - 20) | 0; g.fillStyle = `rgba(${128 + v},${128 + v},${128 + v},0.18)`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(40,36,30,0.12)'; g.fillRect(0, Math.random() * 256, 256, 1 + Math.random() * 3); }
  if (stripe) { // hazard band along the top of the barrier (u = across the profile)
    for (let y = 0; y < 256; y += 32) { g.fillStyle = stripe; g.fillRect(150, y, 70, 16); g.fillStyle = '#1b1b1b'; g.fillRect(150, y + 16, 70, 16); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function containerTexture() {
  const [c, g] = canvas(256, 64);
  g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, 256, 64);
  for (let x = 0; x < 256; x += 6) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x, 0, 2, 64); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 3, 0, 1, 64); }
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, 256, 3); g.fillRect(0, 61, 256, 3);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(90,50,20,${Math.random() * 0.15})`; g.fillRect(Math.random() * 256, Math.random() * 64, 4 + Math.random() * 20, 2 + Math.random() * 8); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function windowsTexture(cols = ['#ffcf7a', '#fff0c8'], lit = 0.4) {
  const [c, g] = canvas(64, 128);
  g.fillStyle = '#000'; g.fillRect(0, 0, 64, 128);
  for (let y = 4; y < 124; y += 8) for (let x = 3; x < 61; x += 7) if (Math.random() < lit) { g.fillStyle = pick(cols); g.fillRect(x, y, 4, 5); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function groundTexture(base, speck, n = 6000) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < n; i++) { g.fillStyle = speck(); g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function artTexture(hueA, hueB, label) {
  const [c, g] = canvas(512, 192);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return drawWithFont('italic 700 74px Rajdhani', () => {
    const grd = g.createLinearGradient(0, 0, 512, 192); grd.addColorStop(0, hueA); grd.addColorStop(1, hueB);
    g.fillStyle = '#07060c'; g.fillRect(0, 0, 512, 192);
    g.strokeStyle = grd; g.lineWidth = 10; g.strokeRect(12, 12, 488, 168);
    for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(40 + k * 18, 160); g.lineTo(120 + k * 18, 40); g.stroke(); }
    g.fillStyle = grd; g.font = 'italic 700 74px Rajdhani, Heebo, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, 320, 98);
  }, t);
}

/* ----------------------------------------------------------- shared parts */
// street lamp along the track: returns item lists for instancing and adds baked lamps
function streetLamps(track, { every = 34, height = 9, color = '#ffb46a', power = 1, side = 'alt', offset = 1.4, radius = 24 }) {
  const poles = [], arms = [], heads = [];
  const step = Math.max(1, Math.round(every / (track.length / track.N)));
  for (let i = 0, k = 0; i < track.N; i += step, k++) {
    const sides = side === 'both' ? [1, -1] : [k % 2 ? 1 : -1];
    for (const sd of sides) {
      const wall = sd > 0 ? track.wallL[i] : track.wallR[i];
      const base = track.at(i, sd * (wall + offset)), head = track.at(i, sd * (wall - 1.2), height - 0.15);
      const ry = Math.atan2(-track.tx[i], -track.tz[i]);
      poles.push({ x: base.x, y: base.y + height / 2, z: base.z });
      arms.push({ x: (base.x + head.x) / 2, y: base.y + height - 0.05, z: (base.z + head.z) / 2, ry });
      heads.push({ x: head.x, y: head.y, z: head.z, ry });
      track.lamps.push({ x: head.x, y: head.y, z: head.z, ground: base.y, color: new THREE.Color(color), radius, power });
    }
  }
  return { poles, arms, heads, height, armLen: offset + 1.2 };
}

function addLampMeshes(scatter, L, { poleColor = '#5c6168', emissive = '#ffb46a', intensity = 4 }) {
  const steel = new THREE.MeshStandardMaterial({ color: poleColor, metalness: 0.6, roughness: 0.45 });
  scatter.add(L.poles, [new THREE.CylinderGeometry(0.1, 0.16, L.height, 8), steel], [new THREE.CylinderGeometry(0.12, 0.12, L.height, 4), steel], { lod: 220 });
  scatter.add(L.arms, [new THREE.BoxGeometry(0.12, 0.1, L.armLen + 0.2).rotateY(Math.PI / 2), steel], null, { lod: 220, far: 300 });
  const headMat = new THREE.MeshStandardMaterial({ color: '#202124', emissive, emissiveIntensity: intensity });
  scatter.add(L.heads, [new THREE.BoxGeometry(0.8, 0.16, 0.36), headMat], null, { far: 600 });
}

// a lamp pool decal under each lamp: soft additive glow on the road (night only)
function lampGlow(scatter, track, color, size = 15, opacity = 0.32) {
  const [c, g] = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const items = track.lamps.filter((l) => l.ground != null).map((l) => ({ x: l.x, y: l.ground + 0.06, z: l.z }));
  scatter.add(items, [new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), mat], null, { far: 260 });
}

/* ================================================================== HARBOR */
function harbor(track, scene, ctx) {
  const { quality: q, renderer } = ctx, g = track.group, sc = new Scatter(g);
  seed = 11;
  scene.fog = new THREE.Fog('#0b1220', 60, 520);
  scene.add(nightSky('#04070f', '#1d2a3f'));
  scene.environment = envFrom(renderer, '#0b1424', '#151515', [[0, 6, 8, 6, 1, '#ffb46a'], [7, 5, -5, 5, 1, '#ffb46a'], [-8, 4, 2, 4, 1, '#9fc0ff']]);
  scene.environmentIntensity = 0.7;
  const hemi = new THREE.HemisphereLight('#4a5a7e', '#1a1814', 0.9);
  const moon = new THREE.DirectionalLight('#9fb4ff', 0.55);
  ctx.lightDir.set(-0.4, 0.8, 0.45).normalize();
  scene.add(hemi);
  ctx.sun = moon;
  ctx.exposure = 1.25; ctx.night = true; ctx.lampColor = '#ffb06a';
  // lamps first: they are baked into the road
  const L = streetLamps(track, { every: 24, height: 9, color: '#ffb06a', power: 1.6, radius: 26, side: 'both' });
  // yard light masts a little further out
  const b = track.box;
  for (let k = 0; k < 7; k++) {
    const i = Math.floor((k + 0.5) / 7 * track.N), sd = k % 2 ? 1 : -1;
    const p = track.at(i, sd * (track.maxWall + 14), 24);
    track.lamps.push({ x: p.x, y: p.y, z: p.z, color: new THREE.Color('#cfe0ff'), radius: 45, power: 1.6 });
  }
  return () => {
    // ground: concrete apron
    const conc = groundTexture('#3f4042', () => `rgba(${90 + Math.random() * 40 | 0},${90 + Math.random() * 40 | 0},${90 + Math.random() * 40 | 0},0.25)`); conc.repeat.set(120, 120);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: conc, roughness: 0.9, color: '#6a6a6a' }));
    ground.position.set((b.x0 + b.x1) / 2, -0.06, (b.z0 + b.z1) / 2); ground.receiveShadow = true; g.add(ground);
    // water beyond the quay on the east side
    const quayX = b.x1 + track.maxWall + 45;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(1400, 2000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#06121c', roughness: 0.12, metalness: 0.3 }));
    water.position.set(quayX + 700, -1.6, 0); g.add(water);
    const quay = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 2000), new THREE.MeshStandardMaterial({ color: '#5a5650', roughness: 0.9 }));
    quay.position.set(quayX, -0.8, 0); g.add(quay);
    // jersey barriers
    const barTex = concreteTexture('#9a978f', '#e8b40c'); barTex.repeat.set(1, 1);
    const barMat = bakedMaterial(new THREE.MeshStandardMaterial({ map: barTex, vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
    const jersey = [[0, 0], [0.03, 0.26], [0.16, 0.5], [0.2, 0.84], [0.42, 0.84], [0.46, 0.5], [0.59, 0.26], [0.62, 0]];
    for (const sd of [1, -1]) g.add(new THREE.Mesh(track.bake(track.extrude(jersey, sd, (i) => (sd > 0 ? track.wallL[i] : track.wallR[i]))), barMat));
    addLampMeshes(sc, L, { emissive: '#ffb06a', intensity: 5 });
    lampGlow(sc, track, '#ff9c4a');
    // container yards: grid-aligned stacks away from the track
    const contMat = new THREE.MeshStandardMaterial({ map: containerTexture(), roughness: 0.7, metalness: 0.3 });
    const contLo = new THREE.MeshLambertMaterial({ color: '#bbbbbb' });
    const colors = ['#1f4f8a', '#8a2a1f', '#2e6b3a', '#c46a1a', '#6b6f75', '#b8b2a6', '#245c6b', '#7a5a2a'];
    const conts = [], dens = q.scenery;
    const geo = new THREE.BoxGeometry(12.2, 2.6, 2.44);
    for (let x = b.x0 - 140; x < quayX - 50; x += 13.2) for (let z = b.z0 - 140; z < b.z1 + 140; z += 2.6) {
      const row = Math.floor((z - b.z0) / 2.6);
      if (row % 7 === 6) continue; // aisle
      const qn = track.query(x, z, -1);
      const out = qn.lat > 0 ? qn.lat - qn.wallL : -qn.lat - qn.wallR; // metres beyond the wall
      if (out < 9 || rnd() > dens) continue;
      const h = 1 + Math.floor(vnoise(x / 60, z / 60) * 4.5 * rnd());
      for (let lv = 0; lv < h; lv++) conts.push({ x, y: 1.3 + lv * 2.62, z, color: pick(colors) });
    }
    sc.add(conts, [geo, contMat], [geo, contLo], { lod: 150, cast: false });
    // ship-to-shore cranes along the quay
    const crane = craneGeometry();
    const cranes = [];
    for (let z = b.z0 - 60; z < b.z1 + 60; z += 85) cranes.push({ x: quayX - 6, z, ry: Math.PI / 2 });
    sc.add(cranes, [crane, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 })], null, { far: 1600 });
    // distant city skyline across the water
    skyline(g, quayX + 600, 0, '#0a0f18', ['#ffcf7a', '#9fc8ff'], 0.3);
    return sc;
  };
}

function craneGeometry() {
  const parts = [], col = (geo, c) => { const cc = new THREE.Color(c); const n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(geo); };
  for (const sx of [-8, 8]) for (const sz of [-6, 6]) col(new THREE.BoxGeometry(1.2, 40, 1.2).translate(sx, 20, sz), '#b8312a');
  col(new THREE.BoxGeometry(18, 2, 2).translate(0, 40, -6), '#d8d8d8');
  col(new THREE.BoxGeometry(18, 2, 2).translate(0, 40, 6), '#d8d8d8');
  col(new THREE.BoxGeometry(3, 2.6, 110).translate(0, 44, 20), '#cfcfcf');
  col(new THREE.BoxGeometry(5, 4, 5).translate(0, 47, -4), '#e8e8e8');
  col(new THREE.BoxGeometry(1, 16, 1).translate(0, 54, -10), '#b8312a');
  for (const sx of [-8, 8]) col(new THREE.BoxGeometry(1.4, 1, 14).translate(sx, 0.5, 0), '#333333');
  return mergeGeometries(parts);
}

function skyline(g, cx, cz, color, winCols, lit) {
  const mat = new THREE.MeshBasicMaterial({ color, map: windowsTexture(winCols, lit), fog: false });
  mat.map.repeat.set(3, 6);
  const parts = [];
  for (let i = 0; i < 70; i++) {
    const w = rand(20, 60), h = rand(30, 160), d = rand(20, 50);
    parts.push(new THREE.BoxGeometry(w, h, d).translate(cx + rand(-150, 150), h / 2 - 2, cz + rand(-900, 900)));
  }
  const m = new THREE.Mesh(mergeGeometries(parts), mat);
  m.material.color.set('#ffffff');
  m.material.map.colorSpace = THREE.SRGBColorSpace;
  m.renderOrder = -5;
  g.add(m);
}

/* ================================================================ MOUNTAIN */
function mountain(track, scene, ctx) {
  const { quality: q, renderer } = ctx, g = track.group, sc = new Scatter(g);
  seed = 23;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(82), THREE.MathUtils.degToRad(215));
  const sky = new Sky(); sky.scale.setScalar(1800);
  const u = sky.material.uniforms;
  u.turbidity.value = 9; u.rayleigh.value = 2.6; u.mieCoefficient.value = 0.01; u.mieDirectionalG.value = 0.93; u.sunPosition.value.copy(sunDir);
  scene.add(sky); ctx.sky = sky;
  scene.fog = new THREE.Fog('#d7a07a', 160, 900);
  // reflections from the same sky
  const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene(), es2 = new Sky(); es2.scale.setScalar(10);
  Object.assign(es2.material.uniforms.turbidity, { value: 9 }); es2.material.uniforms.rayleigh.value = 2.6; es2.material.uniforms.sunPosition.value.copy(sunDir);
  es.add(es2);
  const gr = new THREE.Mesh(new THREE.CircleGeometry(9, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#3a3226' })); gr.position.y = -0.3; es.add(gr);
  scene.environment = pm.fromScene(es, 0.02).texture; pm.dispose();
  scene.environmentIntensity = 0.9;
  scene.add(new THREE.HemisphereLight('#a8b8e0', '#5a4532', 1.1));
  const sun = new THREE.DirectionalLight('#ffbe8a', 3.6);
  ctx.sun = sun; ctx.lightDir.copy(sunDir); ctx.exposure = 0.62; ctx.night = false;
  ctx.sunDir = sunDir;
  return () => {
    const b = track.box, M = 300;
    // terrain heightfield: road level near the track, a cliff on one side and a drop on the other
    const res = q.scenery >= 1 ? 170 : q.scenery >= 0.8 ? 130 : 96;
    const W = b.x1 - b.x0 + M * 2, H = b.z1 - b.z0 + M * 2, x0 = b.x0 - M, z0 = b.z0 - M;
    const geo = new THREE.PlaneGeometry(W, H, res, res).rotateX(-Math.PI / 2);
    const p = geo.attributes.position, n = p.count;
    const heights = new Float32Array(n), tmp = {};
    const mid = (b.y0 + b.y1) / 2;
    for (let v = 0; v < n; v++) {
      const x = p.getX(v) + x0 + W / 2, z = p.getZ(v) + z0 + H / 2;
      const qn = track.query(x, z, -1, tmp);
      const i = qn.i, dist = Math.hypot(x - track.px[i], z - track.pz[i]);
      const wall = qn.lat > 0 ? qn.wallL : qn.wallR;
      const cliffSide = Math.sin(qn.s / 95 + 1.3) > 0 ? 1 : -1;
      const up = Math.sign(qn.lat || 1) === cliffSide;
      const e = smoothstep(wall + 1.5, wall + 40, dist);
      let h = qn.y - 0.35 + (up ? 1 : -0.7) * e * (14 + 26 * fbm(x / 70, z / 70));
      const far = smoothstep(90, 280, dist);
      h = h * (1 - far) + (mid + 10 + fbm(x / 160, z / 160) * 120 - 40) * far;
      if (dist < wall + 1.5) h = qn.y - 0.35;
      heights[v] = h;
      p.setXYZ(v, x, h, z);
    }
    geo.computeVertexNormals();
    // baked sun light + grass/rock by slope
    const nrm = geo.attributes.normal, colors = new Float32Array(n * 3);
    const grass = new THREE.Color('#56632f'), dry = new THREE.Color('#8a7a4e'), rock = new THREE.Color('#6f645a'), c = new THREE.Color();
    for (let v = 0; v < n; v++) {
      const ny = nrm.getY(v), lit = Math.max(0, nrm.getX(v) * sunDir.x + ny * sunDir.y + nrm.getZ(v) * sunDir.z);
      c.copy(grass).lerp(dry, fbm(p.getX(v) / 40, p.getZ(v) / 40)).lerp(rock, smoothstep(0.82, 0.6, ny));
      const k = 0.28 + lit * 1.05;
      colors[v * 3] = c.r * k * 1.08; colors[v * 3 + 1] = c.g * k; colors[v * 3 + 2] = c.b * k * 0.9;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const terrain = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true }));
    g.add(terrain);
    const hAt = (x, z) => {
      const fx = clamp((x - x0) / W * res, 0, res - 1e-3), fz = clamp((z - z0) / H * res, 0, res - 1e-3);
      const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, r1 = res + 1;
      const h00 = heights[iz * r1 + ix], h10 = heights[iz * r1 + ix + 1], h01 = heights[(iz + 1) * r1 + ix], h11 = heights[(iz + 1) * r1 + ix + 1];
      return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
    };
    // guard rails on both sides + posts
    const railMat = bakedMaterial(new THREE.MeshStandardMaterial({ color: '#c3c8ce', metalness: 0.85, roughness: 0.35, vertexColors: true, side: THREE.DoubleSide }));
    const wbeam = [[0, 0.5], [0.07, 0.56], [0.03, 0.64], [0.07, 0.72], [0, 0.78]];
    for (const sd of [1, -1]) g.add(new THREE.Mesh(track.bake(track.extrude(wbeam, sd, (i) => (sd > 0 ? track.wallL[i] : track.wallR[i]))), railMat));
    const posts = [];
    for (let i = 0; i < track.N; i += 2) for (const sd of [1, -1]) { const pp = track.at(i, sd * ((sd > 0 ? track.wallL[i] : track.wallR[i]) + 0.14)); posts.push({ x: pp.x, y: pp.y + 0.2, z: pp.z, ry: Math.atan2(-track.tx[i], -track.tz[i]) }); }
    const postMat = new THREE.MeshStandardMaterial({ color: '#8d939a', metalness: 0.7, roughness: 0.5 });
    sc.add(posts, [new THREE.BoxGeometry(0.1, 1.2, 0.14), postMat], null, { lod: 120, far: 180 });
    // pines and broadleaf trees on the gentler slopes
    const pine = treeGeometry('pine'), pineLo = new THREE.ConeGeometry(2.4, 9, 4).translate(0, 5, 0);
    const leafy = treeGeometry('round'), leafyLo = new THREE.IcosahedronGeometry(3, 0).translate(0, 5, 0);
    const tmat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const tlo = new THREE.MeshLambertMaterial({ color: '#3f5a2c', flatShading: true });
    const pines = [], rounds = [], count = Math.round(2600 * q.scenery);
    for (let k = 0, tries = 0; k < count && tries < count * 6; tries++) {
      const x = rand(x0 + 20, x0 + W - 20), z = rand(z0 + 20, z0 + H - 20);
      const qn = track.query(x, z, -1, tmp);
      const dist = Math.abs(qn.lat) - (qn.lat > 0 ? qn.wallL : qn.wallR);
      if (dist < 4 || (dist < 40 && rnd() < 0.3)) continue;
      const y = hAt(x, z), y2 = hAt(x + 2, z), y3 = hAt(x, z + 2);
      if (Math.hypot(y2 - y, y3 - y) > 2.2) continue; // too steep
      const s = rand(0.7, 1.4), col = new THREE.Color().setHSL(rand(0.22, 0.3), rand(0.25, 0.45), rand(0.55, 0.8));
      (rnd() < 0.65 ? pines : rounds).push({ x, y: y - 0.2, z, ry: rnd() * 6, sx: s, sy: s * rand(0.85, 1.2), color: col });
      k++;
    }
    sc.add(pines, [pine, tmat], [pineLo, tlo], { lod: 170, far: 900 });
    sc.add(rounds, [leafy, tmat], [leafyLo, tlo], { lod: 170, far: 900 });
    // distant ridges
    ridges(g, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, mid);
    // rock outcrops near the cliff faces
    const rocks = [];
    for (let i = 0; i < track.N; i += 9) {
      const cliffSide = Math.sin(track.s[i] / 95 + 1.3) > 0 ? 1 : -1, wall = cliffSide > 0 ? track.wallL[i] : track.wallR[i];
      const pp = track.at(i, cliffSide * (wall + rand(4, 9)));
      rocks.push({ x: pp.x, y: hAt(pp.x, pp.z) - 0.6, z: pp.z, ry: rnd() * 6, sx: rand(1.4, 3), sy: rand(1, 2.4), sz: rand(1.4, 3), color: '#8a8076' });
    }
    sc.add(rocks, [new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true })], null, { far: 500 });
    return sc;
  };
}

function treeGeometry(kind) {
  const parts = [];
  const paint = (geo, c) => { const cc = new THREE.Color(c), n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); geo.deleteAttribute('uv'); parts.push(geo.index ? geo.toNonIndexed() : geo); };
  paint(new THREE.CylinderGeometry(0.18, 0.28, 2.4, 6).translate(0, 1.2, 0), '#5a4330');
  if (kind === 'pine') { paint(new THREE.ConeGeometry(2.4, 5, 8).translate(0, 4, 0), '#3d5a2e'); paint(new THREE.ConeGeometry(1.8, 4, 8).translate(0, 6.4, 0), '#46663a'); paint(new THREE.ConeGeometry(1.1, 3, 8).translate(0, 8.4, 0), '#4f7040'); }
  else { paint(new THREE.IcosahedronGeometry(2.6, 1).translate(0, 4.6, 0), '#5d7a36'); paint(new THREE.IcosahedronGeometry(1.8, 1).translate(1.1, 5.6, 0.6), '#6b8a40'); }
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
}

function ridges(g, cx, cz, base) {
  const layers = [[1450, 260, 0.2, '#8b7d8e'], [1150, 200, 0.5, '#6f6670'], [900, 150, 0.85, '#58544f']];
  layers.forEach(([R, H, k, c], li) => {
    const seg = 220, pos = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const nn = Math.abs(Math.sin(a * 4 + li) * 0.4 + Math.sin(a * 11 + li * 2) * 0.3 + Math.sin(a * 27 + li) * 0.15);
      pos.push(cx + Math.sin(a) * R, base - 60, cz + Math.cos(a) * R, cx + Math.sin(a) * R, base + H * (0.4 + nn), cz + Math.cos(a) * R);
      if (i < seg) { const o = i * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, fog: false }));
    m.renderOrder = -5; g.add(m);
  });
}

/* ==================================================================== NEON */
function neon(track, scene, ctx) {
  const { quality: q, renderer } = ctx, g = track.group, sc = new Scatter(g);
  seed = 37;
  scene.fog = new THREE.Fog('#120a22', 80, 600);
  scene.add(nightSky('#050310', '#2a1238'));
  scene.environment = envFrom(renderer, '#0a0618', '#0c0c10', [[0, 3, 9, 8, 0.6, '#3ff0ff'], [8, 3, -4, 8, 0.6, '#ff3fd2'], [-7, 6, -3, 4, 3, '#ffffff']]);
  scene.environmentIntensity = 0.8;
  scene.add(new THREE.HemisphereLight('#3a2a6a', '#120c18', 0.6));
  const moon = new THREE.DirectionalLight('#c9b8ff', 0.5);
  ctx.sun = moon; ctx.lightDir.set(0.3, 0.85, -0.4).normalize(); ctx.exposure = 1.05; ctx.night = true; ctx.lampColor = '#dff2ff';
  // tall light towers (white) + neon glow along the walls (coloured, low)
  const L = streetLamps(track, { every: 52, height: 14, color: '#e6f0ff', power: 1.5, side: 'alt', offset: 2.5, radius: 32 });
  for (let i = 0; i < track.N; i += 5) for (const sd of [1, -1]) {
    const wall = sd > 0 ? track.wallL[i] : track.wallR[i], p = track.at(i, sd * (wall - 0.05), 1.15);
    track.lamps.push({ x: p.x, y: p.y, z: p.z, color: new THREE.Color(sd > 0 ? '#2fd8ff' : '#ff3fc8'), radius: 6, power: 0.05 });
  }
  return () => {
    const b = track.box;
    const asphalt = groundTexture('#18171d', () => `rgba(${60 + Math.random() * 40 | 0},${60 + Math.random() * 40 | 0},${70 + Math.random() * 40 | 0},0.22)`); asphalt.repeat.set(140, 140);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.75, color: '#555' }));
    ground.position.set((b.x0 + b.x1) / 2, -0.06, (b.z0 + b.z1) / 2); ground.receiveShadow = true; g.add(ground);
    // concrete walls with a neon tube along the top
    const wallTex = concreteTexture('#55545c'); wallTex.repeat.set(1, 1);
    const wallMat = bakedMaterial(new THREE.MeshStandardMaterial({ map: wallTex, vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }));
    const profile = [[0, 0], [0, 1.1], [0.35, 1.1], [0.35, 0]];
    for (const sd of [1, -1]) {
      g.add(new THREE.Mesh(track.bake(track.extrude(profile, sd, (i) => (sd > 0 ? track.wallL[i] : track.wallR[i]))), wallMat));
      const tube = new THREE.Mesh(track.extrude([[-0.03, 1.02], [-0.03, 1.13]], sd, (i) => (sd > 0 ? track.wallL[i] : track.wallR[i])),
        new THREE.MeshBasicMaterial({ color: sd > 0 ? '#2fd8ff' : '#ff3fc8', toneMapped: false, side: THREE.DoubleSide }));
      tube.material.color.multiplyScalar(2.2);
      g.add(tube);
    }
    addLampMeshes(sc, { ...L, height: 14 }, { emissive: '#e6f0ff', intensity: 6, poleColor: '#3c3f46' });
    lampGlow(sc, track, '#b8d4ff', 18, 0.18);
    // city blocks around the circuit, windows lit
    const winMat = new THREE.MeshStandardMaterial({ color: '#1a1a22', roughness: 0.6, metalness: 0.3, emissive: '#ffffff', emissiveMap: windowsTexture(['#ffcf7a', '#9fdcff', '#ff9fe6', '#fff0c8'], 0.28), emissiveIntensity: 0.9 });
    winMat.emissiveMap.repeat.set(1, 2);
    const winLo = new THREE.MeshBasicMaterial({ color: '#2a2438' });
    const blds = [], tmp = {};
    for (let k = 0, tries = 0; k < 240 * q.scenery && tries < 4000; tries++) {
      const x = rand(b.x0 - 260, b.x1 + 260), z = rand(b.z0 - 260, b.z1 + 260);
      const qn = track.query(x, z, -1, tmp);
      const out = Math.abs(qn.lat) - (qn.lat > 0 ? qn.wallL : qn.wallR);
      if (out < 26) continue;
      const w = rand(16, 34), d = rand(16, 34), h = rand(18, 40) + (out > 120 ? rand(20, 110) : 0);
      blds.push({ x, y: h / 2, z, sx: w, sy: h, sz: d, ry: Math.round(rnd() * 4) * Math.PI / 2, color: new THREE.Color().setHSL(rand(0.6, 0.8), 0.15, rand(0.5, 0.8)) });
      k++;
    }
    const box = new THREE.BoxGeometry(1, 1, 1);
    sc.add(blds, [box, winMat], [box, winLo], { lod: 320, far: 1400 });
    // neon arches over the track
    const archMats = ['#2fd8ff', '#ff3fc8', '#b46cff'].map((c) => { const m = new THREE.MeshBasicMaterial({ color: c, toneMapped: false }); m.color.multiplyScalar(2); return m; });
    [0.22, 0.5, 0.78].forEach((f, k) => {
      const i = Math.floor(f * track.N), span = track.wallL[i] + track.wallR[i];
      const a = new THREE.Group();
      for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.35, 7, 0.35), archMats[k]); p.position.set(sx * (span / 2 + 0.6), 3.5, 0); a.add(p); }
      const top = new THREE.Mesh(new THREE.BoxGeometry(span + 1.6, 0.35, 0.35), archMats[k]); top.position.y = 7; a.add(top);
      const c = track.at(i, (track.wallL[i] - track.wallR[i]) / 2);
      a.position.copy(c); a.rotation.y = Math.atan2(-track.tx[i], -track.tz[i]);
      g.add(a);
      track.lamps.push({ x: c.x, y: c.y + 6, z: c.z, color: archMats[k].color.clone().multiplyScalar(0.5), radius: 16, power: 0.6 });
    });
    // grandstand along the start straight + art panels (fictional, no sponsors)
    const gi = Math.floor(track.N * 0.04), gs = new THREE.Group();
    const seat = new THREE.MeshStandardMaterial({ color: '#2a2d36', roughness: 0.8 });
    const seatsCol = new THREE.MeshStandardMaterial({ color: '#7a2fd0', roughness: 0.7 });
    for (let r = 0; r < 8; r++) { const s = new THREE.Mesh(new THREE.BoxGeometry(70, 0.5, 1.2), r % 2 ? seat : seatsCol); s.position.set(0, 0.5 + r * 0.9, r * 1.2); gs.add(s); }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(72, 0.4, 12), seat); roof.position.set(0, 10, 4); gs.add(roof);
    const pa = track.at(gi, -(track.wallR[gi] + 3));
    gs.position.copy(pa); gs.rotation.y = Math.atan2(-track.tx[gi], -track.tz[gi]) + Math.PI / 2;
    g.add(gs);
    const arts = [['#2fd8ff', '#b46cff', 'NEON CIRCUIT'], ['#ff3fc8', '#ffc23d', 'DRIFT'], ['#3ddc84', '#2fd8ff', 'NIGHT RUN']];
    for (let k = 0; k < 6; k++) {
      const i = Math.floor(((k + 0.3) / 6) * track.N), sd = k % 2 ? 1 : -1, wall = sd > 0 ? track.wallL[i] : track.wallR[i];
      const [a, bb, label] = arts[k % 3];
      const m = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.75), new THREE.MeshBasicMaterial({ map: artTexture(a, bb, label), toneMapped: false }));
      m.material.color.setScalar(1.3);
      const pp = track.at(i, sd * (wall + 1.5), 3.4); m.position.copy(pp);
      m.lookAt(track.at(i, 0, 3.4)); // face the track, readable from the road
      g.add(m);
    }
    skyline(g, b.x0 - 700, (b.z0 + b.z1) / 2, '#120a1e', ['#ff9fe6', '#9fdcff', '#ffcf7a'], 0.35);
    skyline(g, b.x1 + 700, (b.z0 + b.z1) / 2, '#120a1e', ['#ff9fe6', '#9fdcff', '#ffcf7a'], 0.35);
    return sc;
  };
}

export const THEMES = { harbor, mountain, neon };
