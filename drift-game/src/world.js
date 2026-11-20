// Highway world: golden-hour sky + sun, PBR asphalt, guard rails, signs and
// instanced scenery. Scenery lives in two long strips that leapfrog each other,
// so nothing is created or re-positioned per instance while driving.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { LANE_W } from './traffic.js';
import { mergeStatic } from './parts.js';

export const ROAD_W = LANE_W * 4 + 2.4;          // 4 lanes + 1.2 m shoulders
export const BARRIER_X = ROAD_W / 2 + 0.4;       // inner face of the guard rail
const ROAD_LEN = 760;
const ROAD_Z = -ROAD_LEN / 2 + 80;
const TEX_LEN = 24;                               // metres covered by one road texture tile
const STRIP = 480;                                // scenery strip length

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rand = (a, b) => a + rnd() * (b - a);

// sun ahead and to the left, low over the horizon
// late-afternoon sun behind the car (over the camera's shoulder) so the chase view sees the car lit
const SUN_ELEV = 16, SUN_AZ = 28;
export const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - SUN_ELEV), THREE.MathUtils.degToRad(SUN_AZ));

/* ---------------------------------------------------------- textures */
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

function roadTextures(maxAniso) {
  const W = 1024, H = 1536, px = W / ROAD_W, pz = H / TEX_LEN;
  const [cc, g] = canvas(W, H);         // colour
  const [hc, hg] = canvas(W, H);        // height (for the normal map)
  const [rc, rg] = canvas(W, H);        // roughness (green channel)
  g.fillStyle = '#3a3c3f'; g.fillRect(0, 0, W, H);
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, W, H);
  rg.fillStyle = 'rgb(0,232,0)'; rg.fillRect(0, 0, W, H);
  // aggregate: thousands of small stones
  for (let i = 0; i < 60000; i++) {
    const x = Math.random() * W, y = Math.random() * H, r = Math.random() * 1.8 + 0.4;
    const v = 45 + Math.random() * 40 | 0;
    g.fillStyle = `rgba(${v},${v},${v + 3},${0.35 + Math.random() * 0.4})`; g.fillRect(x, y, r, r);
    const hv = 128 + (Math.random() * 90 - 30) | 0;
    hg.fillStyle = `rgb(${hv},${hv},${hv})`; hg.fillRect(x, y, r + 0.5, r + 0.5);
  }
  // large-scale patches (resurfacing, stains)
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * W, y = Math.random() * H, r = 30 + Math.random() * 120;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = Math.random() < 0.6;
    grd.addColorStop(0, dark ? 'rgba(20,20,22,0.18)' : 'rgba(120,120,118,0.08)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // polished, darker wheel tracks in every lane (smoother -> lower roughness)
  for (let l = 0; l < 4; l++) {
    const cx = (1.2 + LANE_W * (l + 0.5)) * px;
    for (const off of [-0.85, 0.85]) {
      const x = cx + off * px;
      const grd = g.createLinearGradient(x - 0.4 * px, 0, x + 0.4 * px, 0);
      grd.addColorStop(0, 'rgba(10,10,12,0)'); grd.addColorStop(0.5, 'rgba(10,10,12,0.28)'); grd.addColorStop(1, 'rgba(10,10,12,0)');
      g.fillStyle = grd; g.fillRect(x - 0.4 * px, 0, 0.8 * px, H);
      rg.fillStyle = 'rgba(0,150,0,0.6)'; rg.fillRect(x - 0.25 * px, 0, 0.5 * px, H);
    }
    // oil drip line in the lane centre
    g.fillStyle = 'rgba(8,8,10,0.12)'; g.fillRect(cx - 0.18 * px, 0, 0.36 * px, H);
  }
  // old skid marks
  for (let i = 0; i < 5; i++) {
    const x0 = (1.5 + Math.random() * (ROAD_W - 3)) * px, y0 = Math.random() * H, len = (6 + Math.random() * 10) * pz, bend = (Math.random() - 0.5) * 1.5 * px;
    for (const off of [0, 1.55 * px]) {
      g.strokeStyle = 'rgba(12,12,14,0.35)'; g.lineWidth = 0.22 * px;
      g.beginPath(); g.moveTo(x0 + off, y0); g.quadraticCurveTo(x0 + off + bend, y0 + len / 2, x0 + off + bend * 0.4, y0 + len); g.stroke();
    }
  }
  // cracks
  g.strokeStyle = 'rgba(12,12,12,0.55)'; hg.strokeStyle = '#303030';
  for (let i = 0; i < 18; i++) {
    let x = Math.random() * W, y = Math.random() * H;
    g.lineWidth = hg.lineWidth = 1.2;
    g.beginPath(); hg.beginPath(); g.moveTo(x, y); hg.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += (Math.random() - 0.5) * 40; y += Math.random() * 30; g.lineTo(x, y); hg.lineTo(x, y); }
    g.stroke(); hg.stroke();
  }
  // expansion joint across the road (sealed groove)
  const jy = H * 0.62;
  g.fillStyle = '#121214'; g.fillRect(0, jy, W, 0.05 * pz);
  g.fillStyle = 'rgba(25,25,28,0.6)'; g.fillRect(0, jy - 0.18 * pz, W, 0.4 * pz);
  hg.fillStyle = '#202020'; hg.fillRect(0, jy, W, 0.05 * pz);
  rg.fillStyle = 'rgb(0,180,0)'; rg.fillRect(0, jy - 0.18 * pz, W, 0.4 * pz);
  // worn markings: paint, then chip it
  const paint = (x, y, w, h) => {
    g.fillStyle = '#e9e6dc'; g.fillRect(x, y, w, h);
    hg.fillStyle = '#a8a8a8'; hg.fillRect(x, y, w, h);
    rg.fillStyle = 'rgb(0,140,0)'; rg.fillRect(x, y, w, h);
    for (let i = 0; i < (w * h) / 9; i++) {
      const cx = x + Math.random() * w, cy = y + Math.random() * h;
      g.fillStyle = `rgba(58,60,63,${0.4 + Math.random() * 0.6})`; g.fillRect(cx, cy, 1 + Math.random() * 2.5, 1 + Math.random() * 2.5);
    }
  };
  paint(1.12 * px, 0, 0.16 * px, H);
  paint(W - 1.28 * px, 0, 0.16 * px, H);
  for (let k = 1; k < 4; k++) {
    const x = (1.2 + LANE_W * k) * px - 0.07 * px;
    for (const y0 of [0, 12]) paint(x, (y0 / TEX_LEN) * H, 0.14 * px, (3 / TEX_LEN) * H);
  }
  // normal map from the height canvas (Sobel)
  const hs = hg.getImageData(0, 0, W, H).data;
  const [nc, ng] = canvas(W, H);
  const nd = ng.createImageData(W, H);
  const hAt = (x, y) => hs[(((y + H) % H) * W + ((x + W) % W)) * 4] / 255;
  const strength = 2.2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (hAt(x + 1, y) - hAt(x - 1, y)) * strength, dy = (hAt(x, y + 1) - hAt(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1), o = (y * W + x) * 4;
      nd.data[o] = ((-dx / l) * 0.5 + 0.5) * 255; nd.data[o + 1] = ((dy / l) * 0.5 + 0.5) * 255; nd.data[o + 2] = (1 / l) * 255; nd.data[o + 3] = 255;
    }
  }
  ng.putImageData(nd, 0, 0);
  const make = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, ROAD_LEN / TEX_LEN);
    t.anisotropy = maxAniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: make(cc, true), normalMap: make(nc, false), roughnessMap: make(rc, false) };
}

// r: broad light/dark variation, g: resurfacing patches, b: damp (shinier) areas
function macroTexture() {
  const [c, g] = canvas(256, 512);
  const img = g.createImageData(256, 512);
  const noise = (x, y, s) => { const n = Math.sin(x * 12.9898 / s + y * 78.233 / s) * 43758.5453; return n - Math.floor(n); };
  const smoothNoise = (x, y, s) => {
    const xi = Math.floor(x / s), yi = Math.floor(y / s), xf = x / s - xi, yf = y / s - yi;
    const a = noise(xi, yi, 1), b = noise(xi + 1, yi, 1), cc = noise(xi, yi + 1, 1), d = noise(xi + 1, yi + 1, 1);
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + cc * (1 - u) * v + d * u * v;
  };
  for (let y = 0; y < 512; y++) for (let x = 0; x < 256; x++) {
    const o = (y * 256 + x) * 4;
    const r = 0.55 * smoothNoise(x, y, 64) + 0.3 * smoothNoise(x, y, 24) + 0.15 * smoothNoise(x, y, 8);
    const b = Math.max(0, smoothNoise(x + 99, y, 48) - 0.55) * 2.2;
    img.data[o] = r * 255; img.data[o + 1] = 0; img.data[o + 2] = Math.min(1, b) * 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // rectangular resurfacing patches in the green channel
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) {
    const w = 30 + Math.random() * 120, h = 20 + Math.random() * 90;
    g.fillStyle = `rgba(0,${120 + Math.random() * 100 | 0},0,1)`;
    g.fillRect(Math.random() * (256 - w), Math.random() * (512 - h), w, h);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  return t;
}

// soft cumulus layer (alpha) for the sky dome
function cloudTexture() {
  const [c, g] = canvas(1024, 256);
  g.clearRect(0, 0, 1024, 256);
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * 1024, y = 40 + Math.random() * 170, r = 14 + Math.random() * 46;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.32)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
    // wrap around horizontally so the dome has no seam
    if (x < r) { g.fillStyle = grd; g.save(); g.translate(1024, 0); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function grassTexture() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#5a6a36'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 500; i++) {
    const cols = ['74,88,44', '96,104,52', '66,76,38', '120,112,64'];
    g.fillStyle = `rgba(${cols[i % 4]},${Math.random() * 0.35})`;
    g.beginPath(); g.arc(Math.random() * 512, Math.random() * 512, 4 + Math.random() * 26, 0, 7); g.fill();
  }
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '40,52,24' : '150,150,90'},0.25)`; g.fillRect(Math.random() * 512, Math.random() * 512, 1, 3); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function gravelTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#6b6258'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) { const v = 70 + Math.random() * 80 | 0; g.fillStyle = `rgba(${v},${v - 6},${v - 12},0.6)`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function signTexture(lines, bg = '#0f6b3c', w = 512, h = 256) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#f2f2ee'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
  g.fillStyle = '#f2f2ee'; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach(([text, size], i) => { g.font = `bold ${size}px Arial, sans-serif`; g.fillText(text, w / 2, h * ((i + 1) / (lines.length + 1))); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function speedSign(v) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill();
  g.fillStyle = '#d0201a'; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.arc(128, 128, 96, 0, 7, true); g.fill();
  g.fillStyle = '#111'; g.font = 'bold 92px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(v), 128, 134);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function windowTexture() {
  const [c, g] = canvas(128, 256);
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 256);
  for (let y = 6; y < 250; y += 12) for (let x = 6; x < 124; x += 12) {
    if (Math.random() < 0.38) { g.fillStyle = Math.random() < 0.5 ? '#ffcf7a' : '#fff0c8'; g.fillRect(x, y, 6, 7); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------- world */
export class World {
  constructor(renderer, scene, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.dist = 0;

    // sky and sun
    const sky = (this.sky = new Sky());
    sky.scale.setScalar(2000);
    const u = sky.material.uniforms;
    u.turbidity.value = 12; u.rayleigh.value = 3.6; u.mieCoefficient.value = 0.012; u.mieDirectionalG.value = 0.92;
    u.sunPosition.value.copy(SUN_DIR);
    scene.add(sky);
    // reflections for paint and glass come from the same sky
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envSky = new Sky(); envSky.scale.setScalar(10);
    envSky.material.uniforms.turbidity.value = 12;
    envSky.material.uniforms.rayleigh.value = 3.6; envSky.material.uniforms.mieCoefficient.value = 0.012;
    envSky.material.uniforms.mieDirectionalG.value = 0.92; envSky.material.uniforms.sunPosition.value.copy(SUN_DIR);
    envScene.add(envSky);
    const groundEnv = new THREE.Mesh(new THREE.CircleGeometry(9, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2b2722 }));
    groundEnv.position.y = -0.4; envScene.add(groundEnv);
    scene.environment = pmrem.fromScene(envScene, 0.02).texture;
    scene.environmentIntensity = 1.0;
    pmrem.dispose();

    scene.fog = new THREE.Fog(new THREE.Color('#c9b2a0'), 150, 560);
    this.hemi = new THREE.HemisphereLight('#9fb0dc', '#5a4636', 1.5);
    scene.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight('#ffd6a8', 4.6));
    sun.shadow.camera.left = -26; sun.shadow.camera.right = 26; sun.shadow.camera.top = 34; sun.shadow.camera.bottom = -34;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 220;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3;
    scene.add(sun, sun.target);

    this.buildBackdrop();
    this.buildRoad();
    this.strips = [this.buildStrip(0), this.buildStrip(1)];
    this.strips[0].position.z = 60;
    this.strips[1].position.z = 60 - STRIP;
    this.setQuality(quality);
  }

  // distant mountain ridges (atmospheric perspective) + drifting cloud dome; both ride with the camera
  buildBackdrop() {
    const horizon = new THREE.Color('#d7a582'), far = new THREE.Color('#8a7f8f'), near = new THREE.Color('#4d5149');
    this.backdrop = new THREE.Group();
    const layers = [[1450, 120, 0.25], [1100, 90, 0.55], [800, 60, 0.85]];
    layers.forEach(([R, H, k], li) => {
      const seg = 260, pos = [], col = [], idx = [];
      const cTop = far.clone().lerp(near, k).lerp(horizon, 0.35 * (1 - k));
      const cBot = cTop.clone().lerp(horizon, 0.55);
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const n = Math.sin(a * 5 + li) * 0.35 + Math.sin(a * 13 + li * 2) * 0.25 + Math.sin(a * 31 + li * 5) * 0.12 + Math.sin(a * 71) * 0.05;
        const h = H * (0.45 + 0.55 * Math.abs(n)) * (Math.abs(Math.sin(a)) > 0.25 ? 1 : 0.35); // lower straight ahead/behind
        pos.push(Math.sin(a) * R, -20, Math.cos(a) * R, Math.sin(a) * R, h, Math.cos(a) * R);
        col.push(cBot.r, cBot.g, cBot.b, cTop.r, cTop.g, cTop.b);
        if (i < seg) { const o = i * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
      m.renderOrder = -5;
      this.backdrop.add(m);
    });
    this.cloudTex = cloudTexture();
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(1700, 48, 12, 0, Math.PI * 2, 0, Math.PI * 0.42),
      new THREE.MeshBasicMaterial({ map: this.cloudTex, color: '#ffd8b8', transparent: true, depthWrite: false, fog: false, side: THREE.BackSide }));
    clouds.renderOrder = -6;
    this.clouds = clouds;
    this.backdrop.add(clouds);
    this.scene.add(this.backdrop);
  }

  buildRoad() {
    const s = this.scene, aniso = this.renderer.capabilities.getMaxAnisotropy();
    this.road = roadTextures(aniso);
    const roadMat = new THREE.MeshStandardMaterial({ ...this.road, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.8, 0.8) });
    // large-scale variation (patches, darker/lighter stretches, damp sheen) so the 24 m tile never reads as repeating
    const macro = macroTexture();
    roadMat.onBeforeCompile = (sh) => {
      sh.uniforms.macroMap = { value: macro };
      sh.fragmentShader = 'uniform sampler2D macroMap;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', '#include <map_fragment>\n vec4 mac = texture2D(macroMap, vec2(vMapUv.x * 0.8 + 0.1, vMapUv.y * 0.09));\n diffuseColor.rgb *= mix(0.78, 1.14, mac.r) * mix(1.0, 0.72, mac.g);')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor *= mix(1.0, 0.55, mac.b);');
    };
    this.roadMat = roadMat;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, ROAD_LEN).rotateX(-Math.PI / 2), roadMat);
    road.position.set(0, 0, ROAD_Z);
    road.receiveShadow = true;
    s.add(road);

    this.grass = grassTexture();
    this.grass.repeat.set(60, ROAD_LEN / 10);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, ROAD_LEN).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: this.grass, roughness: 1 }));
    ground.position.set(0, -0.03, ROAD_Z);
    ground.receiveShadow = true;
    s.add(ground);
    this.gravel = gravelTexture();
    this.gravel.repeat.set(1, ROAD_LEN / 4);
    for (const sx of [-1, 1]) {
      const verge = new THREE.Mesh(new THREE.PlaneGeometry(2.6, ROAD_LEN).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: this.gravel, roughness: 1 }));
      verge.position.set(sx * (ROAD_W / 2 + 1.3), -0.01, ROAD_Z);
      verge.receiveShadow = true;
      s.add(verge);
    }

    // W-beam guard rail, reflective galvanised steel
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.bezierCurveTo(0.09, 0.02, 0.09, 0.13, 0, 0.155);
    sh.bezierCurveTo(0.09, 0.18, 0.09, 0.29, 0, 0.31);
    sh.lineTo(-0.02, 0.31); sh.lineTo(-0.02, 0); sh.lineTo(0, 0);
    const railGeo = new THREE.ExtrudeGeometry(sh, { depth: ROAD_LEN, bevelEnabled: false, curveSegments: 6, steps: 1 });
    this.railMat = new THREE.MeshStandardMaterial({ color: '#c4c9cf', metalness: 0.95, roughness: 0.32 });
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, this.railMat);
      rail.scale.x = -sx; // bulge faces the road
      rail.position.set(sx * (BARRIER_X + 0.02), 0.5, ROAD_Z - ROAD_LEN / 2);
      rail.castShadow = true; rail.receiveShadow = true;
      s.add(rail);
    }
  }

  // one strip of instanced scenery, z in [-STRIP, 0] (strip-local)
  buildStrip(k) {
    seed = 1000 + k * 7919;
    const grp = new THREE.Group();
    const inst = (geo, mat, list, { cast = true, colors = null } = {}) => {
      const m = new THREE.InstancedMesh(geo, mat, list.length);
      const o = new THREE.Object3D();
      list.forEach((t, i) => {
        o.position.set(t[0], t[1], t[2]); o.rotation.set(0, t[3] || 0, 0); o.scale.set(t[4] || 1, t[5] || t[4] || 1, t[6] || t[4] || 1);
        o.updateMatrix(); m.setMatrixAt(i, o.matrix);
        if (colors) m.setColorAt(i, colors[i]);
      });
      m.castShadow = cast; m.receiveShadow = true;
      m.computeBoundingSphere();
      m.userData.full = list.length;
      grp.add(m);
      return m;
    };
    const X = BARRIER_X + 0.15;
    // guard-rail posts with reflectors every 4 m
    const posts = [], refl = [];
    for (let z = 0; z > -STRIP; z -= 4) for (const sx of [-1, 1]) { posts.push([sx * (X + 0.08), 0.42, z]); if (z % 20 === 0) refl.push([sx * (BARRIER_X - 0.01), 0.75, z, 0]); }
    inst(new THREE.BoxGeometry(0.1, 0.84, 0.1), new THREE.MeshStandardMaterial({ color: '#8f959c', metalness: 0.8, roughness: 0.45 }), posts);
    inst(new THREE.BoxGeometry(0.04, 0.08, 0.08), new THREE.MeshStandardMaterial({ color: '#ff9b2a', emissive: '#ff7a10', emissiveIntensity: 1.2, metalness: 0.3, roughness: 0.3 }), refl, { cast: false });
    // lamp posts every 60 m, alternating sides
    const poles = [], arms = [], heads = [];
    for (let z = -20, i = 0; z > -STRIP; z -= 60, i++) {
      const sx = i % 2 ? 1 : -1;
      poles.push([sx * (X + 1.1), 5, z]);
      arms.push([sx * (X - 0.3), 9.95, z]);
      heads.push([sx * (X - 1.5), 9.85, z]);
    }
    const poleMat = new THREE.MeshStandardMaterial({ color: '#6f757d', metalness: 0.7, roughness: 0.4 });
    inst(new THREE.CylinderGeometry(0.09, 0.14, 10, 10), poleMat, poles);
    inst(new THREE.BoxGeometry(2.8, 0.1, 0.12), poleMat, arms);
    inst(new THREE.BoxGeometry(0.75, 0.14, 0.32), new THREE.MeshStandardMaterial({ color: '#2b2d30', emissive: '#ffd59a', emissiveIntensity: 2.6 }), heads, { cast: false });
    // trees in clusters behind the verge
    const trunks = [], cones = [], rounds = [], cColors = [], rColors = [];
    const greens = ['#3e5a2c', '#4b6a33', '#36502a', '#5d7536', '#6f6a35'].map((c) => new THREE.Color(c));
    for (let i = 0; i < 260; i++) {
      const sx = rnd() < 0.5 ? -1 : 1, x = sx * rand(14, 70), z = -rand(0, STRIP), sc = rand(0.75, 1.5);
      trunks.push([x, 1.1 * sc, z, 0, sc]);
      const col = greens[(rnd() * greens.length) | 0];
      if (rnd() < 0.45) { cones.push([x, 4.3 * sc, z, rnd() * 6, sc]); cColors.push(col); }
      else { rounds.push([x, 3.7 * sc, z, rnd() * 6, sc, sc * rand(0.85, 1.15)]); rColors.push(col); }
    }
    inst(new THREE.CylinderGeometry(0.17, 0.26, 2.2, 6), new THREE.MeshStandardMaterial({ color: '#4a3726', roughness: 1 }), trunks);
    const leaf = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true });
    inst(new THREE.ConeGeometry(1.8, 5.2, 7), leaf, cones, { colors: cColors });
    inst(new THREE.IcosahedronGeometry(2.3, 0), leaf, rounds, { colors: rColors });
    // buildings far back
    const blds = [], bColors = [];
    const bcol = ['#596072', '#7c6f6a', '#4a5466', '#8c7d70', '#66718a', '#9a8e80'].map((c) => new THREE.Color(c));
    for (let i = 0; i < 26; i++) {
      const sx = rnd() < 0.5 ? -1 : 1, w = rand(14, 32), h = rand(14, 80), d = rand(14, 28);
      blds.push([sx * rand(85, 170), h / 2, -rand(0, STRIP), 0, w, h, d]);
      bColors.push(bcol[(rnd() * bcol.length) | 0]);
    }
    inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, emissive: '#ffffff', emissiveMap: windowTexture(), emissiveIntensity: 0.55 }), blds, { cast: false, colors: bColors });

    // concrete overpass crossing the highway
    const concrete = new THREE.MeshStandardMaterial({ color: '#a8a39b', roughness: 0.9, metalness: 0 });
    const bz = -STRIP * (k === 0 ? 0.32 : 0.78), bw = 60;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(bw, 1.3, 13), concrete); deck.position.set(0, 7.4, bz); deck.castShadow = true; deck.receiveShadow = true; grp.add(deck);
    for (const zz of [-6.3, 6.3]) { const par = new THREE.Mesh(new THREE.BoxGeometry(bw, 1.0, 0.35), concrete); par.position.set(0, 8.5, bz + zz); par.castShadow = true; grp.add(par); }
    for (const sx of [-1, 1]) for (const px of [X + 2.5, X + 14]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(1.2, 6.8, 9), concrete); pier.position.set(sx * px, 3.4, bz); pier.castShadow = true; pier.receiveShadow = true; grp.add(pier);
    }
    // overhead gantry with direction signs, plus roadside signs
    const steel = new THREE.MeshStandardMaterial({ color: '#7e858d', metalness: 0.85, roughness: 0.4 });
    const gz = -STRIP * 0.55;
    for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7.4, 0.4), steel); p.position.set(sx * (X + 0.6), 3.7, gz); p.castShadow = true; grp.add(p); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2 * X + 1.6, 0.5, 0.5), steel); beam.position.set(0, 7.1, gz); beam.castShadow = true; grp.add(beam);
    const signs = k === 0
      ? [[['תל אביב', 54], ['24 ק״מ', 44]], [['חיפה', 54], ['87 ק״מ', 44]], [['יציאה 12', 50], ['ראשון לציון', 40]]]
      : [[['ירושלים', 54], ['62 ק״מ', 44]], [['נתב״ג', 54], ['18 ק״מ', 44]], [['יציאה 14', 50], ['רחובות', 40]]];
    signs.forEach((lines, i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.1), new THREE.MeshStandardMaterial({ map: signTexture(lines, i === 2 ? '#1a4fa0' : '#0f6b3c'), roughness: 0.5, metalness: 0.1 }));
      m.position.set((i - 1) * 4.6, 6.0, gz + 0.27);
      m.castShadow = true;
      grp.add(m);
      const back = new THREE.Mesh(new THREE.BoxGeometry(4.3, 2.2, 0.08), steel); back.position.set((i - 1) * 4.6, 6.0, gz + 0.22); grp.add(back);
    });
    const side = (tex, w, h, x, z, round) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8), steel); post.position.set(x, 1.3, z); post.castShadow = true; grp.add(post);
      const m = new THREE.Mesh(round ? new THREE.CircleGeometry(w / 2, 32) : new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
      m.position.set(x, 2.6 + h / 2 - 0.2, z + 0.06); m.castShadow = true; grp.add(m);
    };
    side(speedSign(k === 0 ? 110 : 120), 1.0, 1.0, X + 1.6, -STRIP * 0.2, true);
    side(signTexture([['מחלף ' + (k === 0 ? 'גלילות' : 'השבעה'), 46], ['2 ק״מ', 40]], '#1a4fa0'), 2.6, 1.3, X + 1.8, -STRIP * 0.85);
    side(speedSign(k === 0 ? 110 : 120), 1.0, 1.0, -(X + 1.6), -STRIP * 0.4, true);
    mergeStatic(grp); // gantry, posts and sign backs -> one mesh per material
    this.scene.add(grp);
    return grp;
  }

  setQuality(q) {
    this.quality = q;
    const r = this.renderer;
    const shadows = q.shadows;
    if (r.shadowMap.enabled !== shadows) {
      r.shadowMap.enabled = shadows;
      this.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    }
    this.sun.castShadow = shadows;
    if (shadows && this.sun.shadow.mapSize.x !== q.shadowSize) {
      this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    if (this.clouds) this.clouds.visible = q.clouds;
    for (const strip of this.strips) {
      for (const m of strip.children) if (m.isInstancedMesh) m.count = Math.max(1, Math.round(m.userData.full * (m.userData.full > 40 ? q.scenery : 1)));
    }
  }

  scroll(d) {
    this.dist = (this.dist + d) % (TEX_LEN * 10000);
    const ty = (this.dist / TEX_LEN) % 1;
    this.road.map.offset.y = ty; this.road.normalMap.offset.y = ty; this.road.roughnessMap.offset.y = ty;
    this.grass.offset.y = (this.dist / 10) % 1;
    this.gravel.offset.y = (this.dist / 4) % 1;
    for (const s of this.strips) {
      s.position.z += d;
      if (s.position.z > STRIP + 60) s.position.z -= STRIP * 2;
    }
  }

  // sky follows the camera; the shadow box follows the player
  update(camera, player, dt = 0.016) {
    this.sky.position.copy(camera.position);
    this.backdrop.position.set(camera.position.x, 0, camera.position.z);
    this.cloudTex.offset.x += dt * 0.0009; // clouds drift slowly
    const px = player ? player.position.x : 0;
    this.sun.target.position.set(px * 0.5, 0, -14);
    this.sun.position.copy(this.sun.target.position).addScaledVector(SUN_DIR, 120);
  }
}
