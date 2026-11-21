// Detailed, animated car interior for the first-person (cockpit) camera. Built on demand the first
// time the cockpit view is used and attached to the car body, so it rolls and pitches with the
// suspension. Everything is generated in code (no files). Coordinates are the car mesh's: x right,
// y up, z towards the rear (the car faces -z); left-hand drive, the driver sits at eye.x < 0.
//
// Animated: steering wheel (steering ratio, counter-steer visible), gloved hands and two-bone arms
// that follow the rim and shuffle hand-over-hand at big angles, H-pattern / sequential shifter
// with the right hand reaching over, a leather boot that bends with the lever, a hydraulic
// handbrake, damped gauge needles, shift lights, gear display, boost and temperature gauges,
// warning lights, pedals and feet, night glow; plus the driver's head (g-forces, vibration,
// look-to-apex) for the camera.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAT } from '../materials.js';
import { mergeStatic, drawWithFont } from '../parts.js';
import { rbox, brandMark } from '../carkit.js';
import { interiorFor } from './configs.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const UP = new THREE.Vector3(0, 1, 0);

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function ctex(c, srgb = true) { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }

/* ------------------------------------------------------------------ textures */
// leather: fine pebbled grain (normal map) + stitched line for the steering rim
function leatherNormal() {
  const S = 256, [c, g] = canvas(S, S), img = g.createImageData(S, S), h = new Float32Array(S * S);
  for (let i = 0; i < 2600; i++) { const x = Math.random() * S | 0, y = Math.random() * S | 0, r = 1 + Math.random() * 2.5; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const d = Math.hypot(dx, dy); if (d < r) h[((y + dy + S) % S) * S + ((x + dx + S) % S)] += (1 - d / r) * 0.5; } }
  const H = (x, y) => h[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 1.4, dy = (H(x, y + 1) - H(x, y - 1)) * 1.4, l = Math.hypot(dx, dy, 1), o = (y * S + x) * 4;
    img.data[o] = ((-dx / l) * 0.5 + 0.5) * 255; img.data[o + 1] = ((dy / l) * 0.5 + 0.5) * 255; img.data[o + 2] = (1 / l) * 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = ctex(c, false); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// steering rim colour: leather with two rows of contrast stitching along the inside (torus v = tube angle)
function rimTexture(leather, accent) {
  const [c, g] = canvas(1024, 64);
  g.fillStyle = leather; g.fillRect(0, 0, 1024, 64);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`; g.fillRect(Math.random() * 1024, Math.random() * 64, 2, 2); }
  g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 46, 1024, 2); // seam
  g.fillStyle = accent;
  for (let x = 0; x < 1024; x += 8) { g.fillRect(x, 42, 5, 2); g.fillRect(x + 4, 50, 5, 2); }
  const t = ctex(c); t.wrapS = THREE.RepeatWrapping;
  return t;
}

/* -------------------------------------------------------------------- gauges */
// sharp analogue dial drawn at high resolution; needle is a separate mesh
function dialTexture({ max, step, minor = 2, red = 0, label = '', unit = '', face = '#0c0d10', accent = '#d0201a', size = 1024, a0 = Math.PI * 0.75, sweep = Math.PI * 1.5, fmt = (v) => String(v), min = 0 }) {
  const [c, g] = canvas(size, size), S = size / 512;
  const t = ctex(c);
  const draw = () => {
    g.setTransform(S, 0, 0, S, 0, 0);
    g.clearRect(0, 0, 512, 512);
    const grd = g.createRadialGradient(256, 230, 20, 256, 256, 256);
    grd.addColorStop(0, '#1a1c21'); grd.addColorStop(1, face);
    g.fillStyle = grd; g.beginPath(); g.arc(256, 256, 252, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3a3d44'; g.lineWidth = 6; g.stroke();
    const ang = (v) => a0 + ((v - min) / (max - min)) * sweep;
    if (red) { g.strokeStyle = 'rgba(210,32,26,0.95)'; g.lineWidth = 22; g.beginPath(); g.arc(256, 256, 205, ang(red), a0 + sweep); g.stroke(); }
    g.lineCap = 'round';
    const n = Math.round((max - min) / step) * minor;
    for (let k = 0; k <= n; k++) {
      const v = min + (k / minor) * step, a = ang(v), major = k % minor === 0;
      g.strokeStyle = v >= red && red ? '#ff5a4a' : '#e8e8e2'; g.lineWidth = major ? 7 : 3;
      const r0 = major ? 176 : 190;
      g.beginPath(); g.moveTo(256 + Math.cos(a) * r0, 256 + Math.sin(a) * r0); g.lineTo(256 + Math.cos(a) * 218, 256 + Math.sin(a) * 218); g.stroke();
      if (major) { g.fillStyle = '#f2f2ec'; g.font = '700 46px Rajdhani, Heebo, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(fmt(v), 256 + Math.cos(a) * 138, 256 + Math.sin(a) * 138); }
    }
    g.fillStyle = '#9aa1ad'; g.font = '600 30px Rajdhani, Heebo, sans-serif'; g.textAlign = 'center';
    if (label) g.fillText(label, 256, 350);
    if (unit) { g.fillStyle = accent; g.font = '700 26px Rajdhani, Heebo, sans-serif'; g.fillText(unit, 256, 392); }
  };
  return drawWithFont('700 46px Rajdhani', draw, t);
}

function needleGeometry(len, w) {
  const s = new THREE.Shape([new THREE.Vector2(-w, -len * 0.18), new THREE.Vector2(w, -len * 0.18), new THREE.Vector2(w * 0.35, len), new THREE.Vector2(-w * 0.35, len)]);
  return new THREE.ShapeGeometry(s);
}

class Dial {
  constructor(parent, opts, r, x, y, z, tilt, needleMat) {
    this.o = { min: 0, a0: Math.PI * 0.75, sweep: Math.PI * 1.5, ...opts };
    this.g = new THREE.Group(); this.g.position.set(x, y, z); this.g.rotation.x = tilt;
    this.faceMat = new THREE.MeshStandardMaterial({ map: dialTexture({ ...this.o, size: opts.size || 1024 }), emissive: '#ffffff', roughness: 0.55, metalness: 0 });
    this.faceMat.emissiveMap = this.faceMat.map; this.faceMat.emissiveIntensity = 0.25;
    this.g.add(new THREE.Mesh(new THREE.CircleGeometry(r, 48), this.faceMat));
    // bezel + glass
    const bez = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, r * 0.045, 8, 48), MAT.chrome); this.g.add(bez);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(r * 1.0, 40), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.03, transparent: true, opacity: 0.08, depthWrite: false }));
    glass.position.z = r * 0.12; this.g.add(glass);
    this.pivot = new THREE.Group(); this.pivot.position.z = r * 0.04;
    this.pivot.add(new THREE.Mesh(needleGeometry(r * 0.82, r * 0.035), needleMat));
    this.g.add(this.pivot, new THREE.Mesh(new THREE.CircleGeometry(r * 0.1, 20).translate(0, 0, r * 0.06), MAT.satin));
    parent.add(this.g);
    this.v = this.o.min; this.vel = 0;
    this.set(this.o.min, 1);
  }
  // critically damped needle: no overshoot jitter, a little lag like a real gauge
  set(target, dt) {
    const o = this.o, k = 60, c = 2 * Math.sqrt(k);
    this.vel += (k * (target - this.v) - c * this.vel) * dt; this.v += this.vel * dt;
    if (dt >= 1) { this.v = target; this.vel = 0; }
    const f = clamp((this.v - o.min) / (o.max - o.min), -0.02, 1.02);
    const a = o.a0 + f * o.sweep; // canvas angle, clockwise from +x
    this.pivot.rotation.z = -(a + Math.PI / 2);
  }
}

/* ----------------------------------------------------------------- the hand */
// gloved hand in "grip space": x = along the thing held (tangent), y = outward from it, z = towards the driver
function handGeometry(glove, accent) {
  const parts = [];
  const paint = (geo, color) => { const cc = new THREE.Color(color), n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); const g2 = geo.index ? geo.toNonIndexed() : geo; g2.deleteAttribute('uv'); parts.push(g2); };
  paint(rbox(0.085, 0.032, 0.085, 0.014).translate(0, 0.036, 0.012), glove);                  // back of the hand / palm
  paint(new THREE.TorusGeometry(0.03, 0.0125, 8, 14, Math.PI * 1.25).rotateY(Math.PI / 2).rotateX(-0.2).translate(-0.012, 0, -0.004), glove); // fingers wrapped round
  paint(new THREE.TorusGeometry(0.03, 0.0115, 8, 14, Math.PI * 1.2).rotateY(Math.PI / 2).rotateX(-0.25).translate(0.016, 0, -0.004), glove);
  paint(new THREE.CapsuleGeometry(0.011, 0.04, 4, 8).rotateZ(Math.PI / 2).translate(0.03, 0.012, 0.03), glove);              // thumb on the driver side
  paint(new THREE.CylinderGeometry(0.036, 0.034, 0.05, 12).rotateX(Math.PI / 2).translate(0, 0.05, 0.06), accent);              // cuff
  return mergeGeometries(parts);
}

/* -------------------------------------------------------------- the cockpit */
export class Cockpit {
  // dims: { eye, dashY, dashZ, roof } from the car builder; opts: { id, redline, maxKmh, gears, hydro, quality }
  constructor(root, dims, opts) {
    this.root = root; this.body = root.userData.body || root;
    const cfg = (this.cfg = interiorFor(opts.id));
    this.opts = opts;
    const E = (this.E = new THREE.Vector3(dims.eye.x, dims.eye.y, dims.eye.z));
    const g = (this.group = new THREE.Group());
    g.name = 'interior';
    this.static = new THREE.Group(); this.static.userData.dynamic = true; g.add(this.static);
    const texSize = opts.quality && !opts.quality.post ? 512 : 1024;
    // shared materials
    const nrm = leatherNormal();
    this.leather = new THREE.MeshStandardMaterial({ color: cfg.leather, roughness: 0.62, normalMap: nrm, normalScale: new THREE.Vector2(0.4, 0.4) });
    this.leather.normalMap.repeat.set(6, 6);
    this.soft = new THREE.MeshStandardMaterial({ color: cfg.trim, roughness: 0.88, normalMap: nrm, normalScale: new THREE.Vector2(0.15, 0.15) }); // soft-touch dash plastic
    this.hard = new THREE.MeshStandardMaterial({ color: '#141518', roughness: 0.5, metalness: 0.1 });
    this.alu = new THREE.MeshStandardMaterial({ color: '#b9bcc2', metalness: 1, roughness: 0.32 });
    this.carpet = new THREE.MeshStandardMaterial({ color: '#101113', roughness: 1 });
    this.accentMat = new THREE.MeshStandardMaterial({ color: cfg.accent, roughness: 0.4, emissive: cfg.accent, emissiveIntensity: 0.15 });
    this.cabinMats = [this.leather, this.soft, this.hard, this.carpet];
    const needleMat = new THREE.MeshStandardMaterial({ color: cfg.accent, emissive: cfg.accent, emissiveIntensity: 1.4, side: THREE.DoubleSide });
    this.needleMat = needleMat;

    // ---- key reference points (body space)
    const dashTop = dims.dashY + 0.06, dashRear = dims.dashZ + 0.2, dashFront = dims.dashZ - 0.28;
    this.Wc = new THREE.Vector3(E.x, E.y - 0.31, E.z - 0.46);    // steering wheel centre
    this.tilt = -0.32;                                            // column rake
    this.R = cfg.wheelR;
    const consoleTop = E.y - 0.5;
    this.shiftBase = new THREE.Vector3(E.x + 0.415, consoleTop + 0.02, E.z - 0.16);
    this.hbBase = new THREE.Vector3(E.x + 0.47, consoleTop + 0.02, E.z + 0.06);
    this.shoulders = [new THREE.Vector3(E.x - 0.21, E.y - 0.33, E.z + 0.1), new THREE.Vector3(E.x + 0.21, E.y - 0.33, E.z + 0.1)];

    this.buildDash(dashTop, dashRear, dashFront, dims);
    this.buildCluster(dashTop, dashRear, texSize);
    this.buildWheel();
    this.buildConsole(consoleTop, dashTop, dashRear);
    this.buildShifter();
    if (opts.hydro) this.buildHandbrake();
    this.buildDoorsSeats(consoleTop);
    this.buildPedals();
    this.buildArms();
    mergeStatic(this.static);

    this.body.add(g);
    g.visible = false;
    // cabin box (body space) cut out of the body paint in the cockpit view: inside = behind every plane
    const zF = dashFront - 0.04, zR = E.z + 0.8, yT = E.y - 0.1;
    this.clipLocal = [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), -0.72), new THREE.Plane(new THREE.Vector3(-1, 0, 0), -0.72),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), -zR), new THREE.Plane(new THREE.Vector3(0, 0, -1), zF),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -yT),
    ];
    this.clipWorld = this.clipLocal.map((p) => p.clone());
    // animation state
    this.rot = 0; this.hands = [{ off: 0, vis: Math.PI }, { off: 0, vis: 0 }];
    this.rhBlend = 0; this.rhTarget = 'wheel'; this.hbBlend = 0; this.hbPull = 0;
    this.lever = { c: 0, d: 0 }; this.shiftAnim = null; this.lastGear = null;
    this.hd = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, roll: 0, yaw: 0, pitch: 0 };
    this.t = 0; this.temps = { water: 52, oil: 48 }; this.boost = 0;
    this.pedal = { gas: 0, brake: 0, clutch: 0 };
    this.tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(), e: new THREE.Vector3(), f: new THREE.Vector3(), m: new THREE.Matrix4(), q: new THREE.Quaternion(), q2: new THREE.Quaternion() };
  }

  // The lofted body shell is closed at sill height, so from the driver's eye you would look down onto
  // paint. While the cockpit is shown, the body paint is clipped away inside the cabin box (all five
  // planes must agree: clipIntersection), so you look into the cabin tub instead.
  setVisible(on) {
    this.group.visible = on;
    const paint = this.root.userData.paint;
    if (!paint) return;
    const want = on ? this.clipWorld : null;
    if (paint.clippingPlanes !== want) { paint.clippingPlanes = want; paint.clipIntersection = true; paint.needsUpdate = true; }
    if (on) this.updateClip();
  }
  updateClip() {
    this.body.updateWorldMatrix(true, false); // parents first: the car moved this frame
    this.clipLocal.forEach((p, i) => this.clipWorld[i].copy(p).applyMatrix4(this.body.matrixWorld));
  }
  dispose() { this.body.remove(this.group); this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }

  /* -------------------------------------------------------------- building */
  add(geo, mat, x = 0, y = 0, z = 0, parent = this.static) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; }

  buildDash(top, rear, front, dims) {
    // full-width dashboard: a profile swept across the cabin (soft-touch top, padded face over the knees)
    const s = new THREE.Shape();
    s.moveTo(front, top - 0.02); s.lineTo(rear - 0.06, top); s.quadraticCurveTo(rear + 0.02, top - 0.005, rear + 0.03, top - 0.06);
    s.quadraticCurveTo(rear + 0.06, top - 0.2, rear - 0.02, top - 0.36); s.lineTo(front, top - 0.38); s.lineTo(front, top - 0.02);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 1.38, bevelEnabled: false, curveSegments: 10 });
    geo.rotateY(-Math.PI / 2).translate(0.69, 0, 0);
    this.add(geo, this.soft);
    // dark trim strip + aluminium inlay across the dash face
    this.add(new THREE.BoxGeometry(1.3, 0.035, 0.012), this.hard, 0.04, top - 0.12, rear + 0.035);
    this.add(new THREE.BoxGeometry(0.62, 0.006, 0.004), this.alu, 0.33, top - 0.1, rear + 0.042);
    // binnacle hood over the instruments (driver side)
    const hood = new THREE.CylinderGeometry(0.22, 0.22, 0.2, 24, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(1, 0.48, 1);
    this.add(hood, new THREE.MeshStandardMaterial({ color: this.cfg.trim, roughness: 0.9, side: THREE.DoubleSide }), this.E.x, this.Wc.y + 0.135, rear + 0.075);
    // instrument pod: a box that carries the cluster out of the dash towards the driver
    this.add(rbox(0.46, 0.2, 0.16, 0.03), this.soft, this.E.x, this.Wc.y + 0.11, rear + 0.0);
    // closed cabin tub seen from inside (so the inside of the body panels never shows): carpet floor,
    // side walls up to the window line, firewall under the dash and a rear bulkhead
    const fy = this.E.y - 0.8, beltY = this.E.y - 0.17, z0 = front - 0.02, z1 = this.E.z + 0.75;
    const tubMat = new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.95, side: THREE.BackSide });
    this.cabinMats.push(tubMat);
    this.add(new THREE.BoxGeometry(1.46, beltY - fy, z1 - z0).translate(0, (beltY - fy) / 2, 0).toNonIndexed(), tubMat, 0, fy, (z0 + z1) / 2);
    this.add(new THREE.PlaneGeometry(1.4, 1.6).rotateX(-Math.PI / 2), this.carpet, 0, fy + 0.005, this.E.z - 0.4);
    this.add(new THREE.BoxGeometry(0.26, 0.2, 1.1), this.carpet, 0.02, this.E.y - 0.72, this.E.z - 0.45);
    // interior mirror on the windscreen header
    const my = dims.roof ? dims.roof(this.E.z - 0.62) - 0.06 : this.E.y + 0.12;
    this.add(rbox(0.24, 0.065, 0.025, 0.012), this.hard, 0.02, my, this.E.z - 0.64);
    this.add(new THREE.PlaneGeometry(0.22, 0.05), MAT.mirror, 0.02, my, this.E.z - 0.627);
    this.add(new THREE.CylinderGeometry(0.008, 0.008, 0.06), this.hard, 0.02, my + 0.05, this.E.z - 0.66);
    // A-pillar trims (inside)
    for (const sd of [-1, 1]) { const p = this.add(rbox(0.06, 0.55, 0.05, 0.02), this.soft, sd * 0.66, top + 0.2, front + 0.18); p.rotation.x = 0.85; p.rotation.z = sd * 0.12; }
  }

  buildCluster(top, rear, texSize) {
    const E = this.E, cfg = this.cfg, o = this.opts;
    const cz = rear + 0.085, cy = this.Wc.y + 0.115, tilt = -0.18;
    // panel behind the dials
    this.add(new THREE.PlaneGeometry(0.42, 0.17).rotateX(tilt), this.hard, E.x, cy, cz - 0.01);
    const red = o.redline / 1000, maxR = Math.ceil((o.limiter || o.redline + 600) / 1000);
    this.tach = new Dial(this.group, { max: maxR, step: 1, minor: 4, red, label: 'RPM', unit: 'x1000', face: cfg.gaugeFace, accent: cfg.accent, size: texSize }, 0.07, E.x + 0.075, cy, cz, tilt, this.needleMat);
    const vmax = o.maxKmh || 300;
    this.speedo = new Dial(this.group, { max: vmax, step: vmax > 280 ? 40 : 20, minor: 2, label: 'KM/H', face: cfg.gaugeFace, accent: cfg.accent, size: texSize }, 0.062, E.x - 0.088, cy - 0.004, cz + 0.002, tilt, this.needleMat);
    // small gauges: boost (bar), water and oil temperature
    const small = { face: cfg.gaugeFace, accent: cfg.accent, size: 512, a0: Math.PI * 0.85, sweep: Math.PI * 1.3 };
    this.boostG = new Dial(this.group, { ...small, min: -1, max: 1.5, step: 0.5, minor: 2, label: 'BOOST', unit: 'bar', fmt: (v) => v.toFixed(1) }, 0.03, E.x + 0.2, cy + 0.01, cz + 0.004, tilt, this.needleMat);
    this.waterG = new Dial(this.group, { ...small, min: 40, max: 130, step: 30, minor: 3, red: 115, label: 'WATER', unit: '°C' }, 0.026, E.x - 0.2, cy + 0.03, cz + 0.004, tilt, this.needleMat);
    this.oilG = new Dial(this.group, { ...small, min: 40, max: 150, step: 50, minor: 2, red: 130, label: 'OIL', unit: '°C' }, 0.026, E.x - 0.2, cy - 0.035, cz + 0.004, tilt, this.needleMat);
    // shift lights: green, green, yellow, yellow, red, red, red (all flash at the limiter)
    this.shiftLights = [];
    const cols = ['#24ff4a', '#24ff4a', '#ffd21f', '#ffd21f', '#ff2a1a', '#ff2a1a', '#ff2a1a'];
    cols.forEach((col, i) => {
      const m = new THREE.MeshStandardMaterial({ color: '#111', emissive: col, emissiveIntensity: 0 });
      const led = new THREE.Mesh(new THREE.CircleGeometry(0.0065, 14).rotateX(tilt), m);
      led.position.set(E.x + (i - 3) * 0.022, cy + 0.085, cz + 0.006); this.group.add(led);
      this.shiftLights.push(m);
    });
    // gear indicator (digital) between the dials
    const [gc, gg] = canvas(128, 160);
    this.gearCanvas = { c: gc, g: gg };
    this.gearTex = ctex(gc);
    this.gearMat = new THREE.MeshStandardMaterial({ map: this.gearTex, emissive: '#ffffff', emissiveMap: this.gearTex, emissiveIntensity: 1.1, roughness: 0.4 });
    const gd = new THREE.Mesh(new THREE.PlaneGeometry(0.028, 0.035).rotateX(tilt), this.gearMat);
    gd.position.set(E.x - 0.006, cy + 0.035, cz + 0.008); this.group.add(gd);
    this.drawGear('N');
    // warning lights: handbrake, traction control, low fuel
    this.warn = {};
    [['hand', '#ff3020', 'P'], ['tc', '#ffb020', 'TC'], ['fuel', '#ffb020', 'FUEL']].forEach(([k, col, txt], i) => {
      const [c, g2] = canvas(128, 64); const t = ctex(c);
      drawWithFont('700 40px Rajdhani', () => { g2.clearRect(0, 0, 128, 64); g2.fillStyle = '#000'; g2.fillRect(0, 0, 128, 64); g2.strokeStyle = col; g2.lineWidth = 5; g2.beginPath(); g2.arc(64, 32, 26, 0, 7); g2.stroke(); g2.fillStyle = col; g2.font = `700 ${txt.length > 2 ? 18 : 32}px Rajdhani, sans-serif`; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText(txt, 64, 34); }, t);
      const m = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0, map: t });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.024, 0.012).rotateX(tilt), m);
      p.position.set(E.x + (i - 1) * 0.03, cy - 0.072, cz + 0.006); this.group.add(p);
      this.warn[k] = m;
    });
    this.glowMats = [this.tach.faceMat, this.speedo.faceMat, this.boostG.faceMat, this.waterG.faceMat, this.oilG.faceMat];
  }

  drawGear(txt) {
    const { c, g } = this.gearCanvas;
    g.fillStyle = '#05070a'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = txt === 'R' ? '#ff5a4a' : txt === 'N' ? '#ffd21f' : '#7cf7ff';
    g.font = '700 130px Rajdhani, Heebo, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(txt), 64, 86);
    this.gearTex.needsUpdate = true;
  }

  buildWheel() {
    const cfg = this.cfg, R = this.R;
    // column (fixed) with the paddle shifters, then the rotating wheel
    this.col = new THREE.Group(); this.col.position.copy(this.Wc); this.col.rotation.x = this.tilt;
    this.group.add(this.col);
    this.add(new THREE.CylinderGeometry(0.035, 0.045, 0.3, 16).rotateX(Math.PI / 2).translate(0, 0, -0.17), this.hard, 0, 0, 0, this.col);
    for (const sd of [-1, 1]) {
      const p = this.add(rbox(0.035, 0.12, 0.008, 0.004), MAT.carbon, sd * 0.12, 0.02, -0.045, this.col);
      p.rotation.z = sd * 0.25;
    }
    this.wheel = new THREE.Group(); this.col.add(this.wheel);
    const rimMat = new THREE.MeshStandardMaterial({ map: rimTexture(cfg.leather, cfg.accent), roughness: 0.6, normalMap: this.leather.normalMap, normalScale: new THREE.Vector2(0.35, 0.35) });
    rimMat.map.repeat.set(1, 1);
    this.add(new THREE.TorusGeometry(R, 0.017, 14, 72), rimMat, 0, 0, 0, this.wheel);
    // 12 o'clock centre marker
    this.add(new THREE.TorusGeometry(R, 0.0175, 14, 6, 0.16).rotateZ(Math.PI / 2 - 0.08), this.accentMat, 0, 0, 0, this.wheel);
    // spokes (brushed aluminium on a leather-wrapped core), centre pad with the fictional brand mark
    const spokeAngles = cfg.spokes === 2 ? [0, Math.PI] : [0, Math.PI, -Math.PI / 2];
    for (const a of spokeAngles) {
      const sp = this.add(rbox(R - 0.035, 0.032, 0.016, 0.008), this.hard, Math.cos(a) * (R / 2 + 0.01), Math.sin(a) * (R / 2 + 0.01), -0.008, this.wheel);
      sp.rotation.z = a;
      const ins = this.add(new THREE.BoxGeometry(R - 0.06, 0.008, 0.004), this.alu, Math.cos(a) * (R / 2 + 0.01), Math.sin(a) * (R / 2 + 0.01), 0.0, this.wheel);
      ins.rotation.z = a;
    }
    this.add(rbox(0.11, 0.09, 0.04, 0.02), this.leather, 0, -0.005, -0.004, this.wheel);
    const mk = brandMark(cfg.mark, 0.55); mk.position.set(0, 0, 0.018); this.wheel.add(mk);
  }

  buildConsole(top, dashTop, dashRear) {
    const E = this.E, cx = E.x + 0.415;
    // centre stack from the dash down to the tunnel, console between the seats
    this.add(rbox(0.26, 0.3, 0.2, 0.03), this.soft, cx, top + 0.18, dashRear + 0.02);
    this.add(rbox(0.22, 0.12, 0.62, 0.03), this.soft, cx, top - 0.05, E.z - 0.02);
    // radio / screen (fictional brand)
    const [c, g] = canvas(512, 256), t = ctex(c);
    drawWithFont('700 64px Rajdhani', () => {
      g.fillStyle = '#04060a'; g.fillRect(0, 0, 512, 256);
      g.fillStyle = '#7cf7ff'; g.font = '700 64px Rajdhani, sans-serif'; g.fillText('FM 98.4', 24, 96);
      g.fillStyle = '#9aa1ad'; g.font = '600 30px Rajdhani, sans-serif'; g.fillText(`${this.cfg.radio} SOUND`, 26, 150);
      for (let i = 0; i < 18; i++) { g.fillStyle = i < 12 ? '#3ddc84' : '#ffc23d'; g.fillRect(26 + i * 24, 200 - i * 2, 16, 26 + i * 2); }
    }, t);
    this.screenMat = new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.6, roughness: 0.2 });
    this.add(new THREE.PlaneGeometry(0.18, 0.09), this.screenMat, cx, dashTop - 0.13, dashRear + 0.124);
    // AC vents: two centre, one at each end of the dash
    const vent = (x, w) => { this.add(rbox(w, 0.05, 0.02, 0.008), this.hard, x, dashTop - 0.065, dashRear + 0.036); for (let k = 0; k < 4; k++) this.add(new THREE.BoxGeometry(w - 0.01, 0.003, 0.012), this.alu, x, dashTop - 0.082 + k * 0.011, dashRear + 0.044); };
    vent(cx - 0.06, 0.08); vent(cx + 0.06, 0.08); vent(-0.6, 0.1); vent(0.62, 0.1);
    // buttons (climate + hazard), knobs
    const btns = [];
    for (let r = 0; r < 2; r++) for (let k = 0; k < 5; k++) btns.push(rbox(0.024, 0.014, 0.01, 0.003).translate(cx - 0.06 + k * 0.03, dashTop - 0.205 - r * 0.024, dashRear + 0.122));
    this.btnMat = new THREE.MeshStandardMaterial({ color: '#1c1d21', roughness: 0.4, emissive: this.cfg.accent, emissiveIntensity: 0 });
    this.add(mergeGeometries(btns), this.btnMat);
    for (const sd of [-1, 1]) this.add(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 20).rotateX(Math.PI / 2), this.alu, cx + sd * 0.1, dashTop - 0.25, dashRear + 0.12);
    // cup holders behind the shifter
    for (const k of [0, 1]) { this.add(new THREE.CylinderGeometry(0.037, 0.037, 0.005, 20), this.hard, cx + 0.04 - k * 0.0, top + 0.012, E.z + 0.18 + k * 0.08); this.add(new THREE.TorusGeometry(0.037, 0.004, 6, 20).rotateX(Math.PI / 2), this.alu, cx + 0.04, top + 0.015, E.z + 0.18 + k * 0.08); }
  }

  buildShifter() {
    const b = this.shiftBase;
    // trim ring + leather boot (vertices follow the lever every frame) + lever + knob
    this.add(new THREE.TorusGeometry(0.06, 0.008, 8, 24).rotateX(Math.PI / 2), this.alu, b.x, b.y, b.z);
    this.lev = new THREE.Group(); this.lev.position.copy(b); this.group.add(this.lev);
    const L = (this.levLen = 0.2);
    this.add(new THREE.CylinderGeometry(0.008, 0.009, L, 10).translate(0, L / 2, 0), this.alu, 0, 0, 0, this.lev);
    const seq = this.cfg.shifter === 'seq';
    const knob = seq ? rbox(0.045, 0.07, 0.04, 0.012).translate(0, L + 0.02, 0) : new THREE.SphereGeometry(0.026, 20, 14).scale(1, 0.9, 1.05).translate(0, L + 0.01, 0);
    this.add(knob, seq ? this.hard : this.leather, 0, 0, 0, this.lev);
    if (!seq) {
      // shift pattern engraved on the knob top
      const [c, g] = canvas(128, 128), t = ctex(c);
      drawWithFont('700 24px Rajdhani', () => {
        g.fillStyle = '#16171a'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#d8d8d2'; g.lineWidth = 4; g.fillStyle = '#d8d8d2'; g.font = '700 22px Rajdhani, sans-serif'; g.textAlign = 'center';
        g.beginPath(); for (const x of [24, 52, 80, 108]) { g.moveTo(x, 34); g.lineTo(x, 94); } g.moveTo(24, 64); g.lineTo(108, 64); g.stroke();
        [['R', 24, 26], ['1', 52, 26], ['2', 52, 114], ['3', 80, 26], ['4', 80, 114], ['5', 108, 26], ['6', 108, 114]].forEach(([s, x, y]) => g.fillText(s, x, y));
      }, t);
      const cap = this.add(new THREE.CircleGeometry(0.02, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }), 0, L + 0.035, 0, this.lev);
      cap.rotation.y = Math.PI;
    }
    // boot: rings from the base to the lever, deformed each frame
    const rings = 7, seg = 18, pos = new Float32Array((rings + 1) * seg * 3), idx = [];
    for (let r = 0; r < rings; r++) for (let s = 0; s < seg; s++) { const a = r * seg + s, b2 = r * seg + ((s + 1) % seg), c = a + seg, d = b2 + seg; idx.push(a, c, b2, b2, c, d); }
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); bg.setIndex(idx);
    this.boot = { geo: bg, rings, seg };
    const bootMesh = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ color: this.cfg.leather, roughness: 0.75, side: THREE.DoubleSide }));
    bootMesh.frustumCulled = false;
    this.group.add(bootMesh);
    this.cabinMats.push(bootMesh.material);
  }

  buildHandbrake() {
    const b = this.hbBase;
    this.add(rbox(0.06, 0.06, 0.12, 0.015), this.alu, b.x, b.y + 0.02, b.z);
    this.hb = new THREE.Group(); this.hb.position.set(b.x, b.y + 0.04, b.z + 0.03); this.group.add(this.hb);
    // hydraulic lever: tall, slightly forward, with a ribbed grip
    this.add(new THREE.CylinderGeometry(0.011, 0.013, 0.34, 10).translate(0, 0.17, 0), this.alu, 0, 0, 0, this.hb);
    this.add(new THREE.CylinderGeometry(0.019, 0.019, 0.11, 14).translate(0, 0.3, 0), this.hard, 0, 0, 0, this.hb);
    for (let k = 0; k < 4; k++) this.add(new THREE.TorusGeometry(0.019, 0.003, 6, 14).rotateX(Math.PI / 2).translate(0, 0.26 + k * 0.025, 0), this.accentMat, 0, 0, 0, this.hb);
    this.hb.rotation.x = -0.2;
  }

  buildDoorsSeats(top) {
    const E = this.E;
    for (const sd of [-1, 1]) {
      const x = sd * 0.69;
      this.add(rbox(0.08, 0.42, 1.0, 0.04), this.soft, x, E.y - 0.45, E.z - 0.15);           // door card
      this.add(rbox(0.1, 0.05, 0.4, 0.02), this.leather, x - sd * 0.04, E.y - 0.38, E.z - 0.05); // armrest
      this.add(rbox(0.02, 0.035, 0.12, 0.01), MAT.chrome, x - sd * 0.045, E.y - 0.24, E.z - 0.32); // handle
      for (let k = 0; k < 2; k++) this.add(rbox(0.025, 0.01, 0.03, 0.004), this.hard, x - sd * 0.06, E.y - 0.352, E.z - 0.13 + k * 0.045); // window switches
      this.add(new THREE.CylinderGeometry(0.055, 0.055, 0.01, 20).rotateZ(Math.PI / 2), this.hard, x - sd * 0.04, E.y - 0.6, E.z - 0.4); // speaker grille
    }
    // bucket seats: base, back, side bolsters (the passenger one is visible, the driver's frames the view)
    for (const sx of [E.x, -E.x]) {
      this.add(rbox(0.5, 0.1, 0.5, 0.04), this.leather, sx, top - 0.06, E.z + 0.12);
      const back = this.add(rbox(0.5, 0.7, 0.1, 0.04), this.leather, sx, top + 0.3, E.z + 0.42); back.rotation.x = -0.2;
      for (const sd of [-1, 1]) { const bol = this.add(rbox(0.07, 0.6, 0.16, 0.03), this.leather, sx + sd * 0.22, top + 0.27, E.z + 0.34); bol.rotation.x = -0.2; }
    }
  }

  buildPedals() {
    const E = this.E, y = E.y - 0.5, z = E.z - 0.98;
    this.pedals = {};
    [['clutch', -0.14, 0.055], ['brake', -0.01, 0.075], ['gas', 0.12, 0.045]].forEach(([k, dx, w]) => {
      const p = new THREE.Group(); p.position.set(E.x + dx, y, z); this.group.add(p);
      this.add(new THREE.BoxGeometry(0.012, 0.22, 0.012).translate(0, -0.11, 0), this.alu, 0, 0, 0, p);
      const pad = this.add(rbox(w, k === 'gas' ? 0.12 : 0.07, 0.014, 0.006).translate(0, -0.24, -0.006), this.alu, 0, 0, 0, p);
      pad.rotation.x = -0.25;
      this.pedals[k] = p;
    });
    // feet (race boots): right foot on the gas, moves to the brake; left foot on the clutch / dead pedal
    const boot = mergeGeometries([rbox(0.08, 0.06, 0.26, 0.025).translate(0, 0, 0), rbox(0.075, 0.12, 0.08, 0.025).translate(0, 0.07, 0.1)].map((gg) => (gg.index ? gg.toNonIndexed() : gg)));
    const bootMat = new THREE.MeshStandardMaterial({ color: '#191a1d', roughness: 0.7 });
    this.feet = [new THREE.Mesh(boot, bootMat), new THREE.Mesh(boot, bootMat)];
    for (const f of this.feet) { f.rotation.x = -0.45; this.group.add(f); }
  }

  buildArms() {
    const suit = new THREE.MeshStandardMaterial({ color: '#23262d', roughness: 0.85, normalMap: this.leather.normalMap, normalScale: new THREE.Vector2(0.2, 0.2) });
    const hand = handGeometry('#17181b', this.cfg.accent);
    const handMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 });
    const seg = (r0, r1) => new THREE.CylinderGeometry(r1, r0, 1, 12, 1).translate(0, 0.5, 0);
    this.arms = [0, 1].map(() => {
      const upper = new THREE.Mesh(seg(0.043, 0.037), suit), fore = new THREE.Mesh(seg(0.036, 0.03), suit), h = new THREE.Mesh(hand, handMat);
      this.group.add(upper, fore, h);
      return { upper, fore, hand: h, wrist: new THREE.Vector3(), elbow: new THREE.Vector3(), q: new THREE.Quaternion() };
    });
    this.cabinMats.push(suit);
  }

  /* --------------------------------------------------------------- animation */
  // rim point (body space) for a rim angle measured in the wheel plane (0 = 3 o'clock, CCW positive)
  rimPoint(a, out, r = this.R) {
    const x = Math.cos(a) * r, y = Math.sin(a) * r, t = this.tilt;
    return out.set(this.Wc.x + x, this.Wc.y + y * Math.cos(t), this.Wc.z + y * Math.sin(t));
  }
  // grip orientation on the rim: x = tangent, y = outward, z = towards the driver
  rimBasis(a, q) {
    const t = this.tilt, T = this.tmp;
    const n = T.c.set(0, -Math.sin(t), Math.cos(t));            // wheel normal (towards the driver)
    const out = T.d.set(Math.cos(a), Math.sin(a) * Math.cos(t), Math.sin(a) * Math.sin(t));
    const tan = T.e.crossVectors(n, out).normalize();
    T.m.makeBasis(tan, out, n);
    return q.setFromRotationMatrix(T.m);
  }

  // s: { wheelFrac (-1..1, + = left lock), gear (number | 'R' | 'N'), rpm, kmh, throttle, brake, clutch, hand,
  //      tc, night, accLat (m/s2, + right), accLong (+ forward), beta, steerIn }
  update(dt, s) {
    if (!this.group.visible) return;
    this.updateClip();
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const T = this.tmp, cfg = this.cfg, o = this.opts;
    // ---- steering wheel: road-wheel fraction x half the lock-to-lock angle
    const target = s.wheelFrac * ((cfg.lockToLock / 2) * Math.PI) / 180;
    this.rot = damp(this.rot, target, 30, dt);
    this.wheel.rotation.z = this.rot;
    // ---- gear changes -> shifter animation (the right hand goes over first)
    const gear = s.gear;
    if (this.lastGear == null) { this.lastGear = gear; this.setLever(gear); this.drawGear(gear); }
    if (gear !== this.lastGear && gear !== 'N') {
      this.shiftAnim = { t: 0, from: { ...this.lever }, to: this.slot(gear), up: (Number(gear) || 0) > (Number(this.lastGear) || 0) };
      this.drawGear(gear);
      this.lastGear = gear;
    } else if (gear === 'N' && this.lastGear !== 'N' && !this.shiftAnim) this.drawGear(this.lastGear);
    let wantLever = 0, clutch = s.clutch ? 1 : 0;
    if (this.shiftAnim) {
      const A = this.shiftAnim; A.t += dt;
      const u = clamp((A.t - 0.1) / 0.22, 0, 1);
      if (cfg.shifter === 'seq') {
        const p = Math.sin(u * Math.PI); this.lever.c = 0; this.lever.d = (A.up ? 1 : -1) * p * 0.8;
      } else this.pathLever(A.from, A.to, smooth(u));
      wantLever = A.t < 0.42 ? 1 : 0;
      clutch = A.t < 0.38 ? 1 : clutch;
      if (A.t > 0.55) this.shiftAnim = null;
    }
    this.applyLever();
    this.updateBoot();
    // ---- handbrake: the hand goes to the lever, then pulls it
    const wantHb = s.hand && this.hb ? 1 : 0;
    this.hbBlend = damp(this.hbBlend, wantHb, wantHb ? 16 : 10, dt);
    if (this.hb) { this.hbPull = damp(this.hbPull, wantHb && this.hbBlend > 0.6 ? 1 : 0, 18, dt); this.hb.rotation.x = -0.2 + this.hbPull * 0.55; }
    this.rhBlend = damp(this.rhBlend, wantLever && !wantHb ? 1 : 0, 14, dt);
    // ---- hands on the rim, hand-over-hand past ~100 degrees
    this.hands.forEach((h, i) => {
      const base = i === 0 ? Math.PI : 0;
      let rel = this.rot + h.off;
      while (rel > 1.75) { h.off -= (2 * Math.PI) / 3; rel = this.rot + h.off; }
      while (rel < -1.75) { h.off += (2 * Math.PI) / 3; rel = this.rot + h.off; }
      const tgt = base + rel;
      h.lift = Math.min(0.07, Math.abs(tgt - h.vis) * 0.06);
      h.vis = damp(h.vis, tgt, h.lift > 0.004 ? 11 : 40, dt);
    });
    this.poseArm(0, this.hands[0].vis, this.hands[0].lift, 0, 0);
    this.poseArm(1, this.hands[1].vis, this.hands[1].lift, this.rhBlend, this.hbBlend);
    // ---- gauges
    this.tach.set(s.rpm / 1000, dt);
    this.speedo.set(s.kmh, dt);
    this.boost = damp(this.boost, s.throttle > 0.3 ? clamp((s.rpm - 2500) / 3500, 0, 1) * 1.3 * s.throttle : -0.6, s.throttle > 0.3 ? 2.2 : 5, dt);
    this.boostG.set(this.boost, dt);
    this.temps.water = damp(this.temps.water, 86 + s.throttle * 4, 0.04, dt);
    this.temps.oil = damp(this.temps.oil, 92 + (s.rpm / o.redline) * 14, 0.03, dt);
    this.waterG.set(this.temps.water, dt); this.oilG.set(this.temps.oil, dt);
    const f = s.rpm / o.redline, flash = f > 0.985 && Math.sin(this.t * 40) > 0;
    this.shiftLights.forEach((m, i) => { const on = f > 0.8 + i * 0.03; m.emissiveIntensity = f > 0.985 ? (flash ? 3 : 0.2) : on ? 2.4 : 0.04; });
    this.warn.hand.emissiveIntensity = s.hand ? 1.6 : 0.03;
    this.warn.tc.emissiveIntensity = s.tc ? 1.2 : 0.03;
    this.warn.fuel.emissiveIntensity = 1.0; // decorative: always a little low on fuel
    // ---- night: gauges and buttons glow, a soft wash of light in the cabin
    const nightK = s.night ? 1 : 0;
    for (const m of this.glowMats) m.emissiveIntensity = 0.22 + nightK * 0.55;
    this.btnMat.emissiveIntensity = nightK * 0.35; this.screenMat.emissiveIntensity = 0.5 + nightK * 0.4;
    for (const m of this.cabinMats) { m.emissive.set(s.night ? '#1d1a16' : '#000000'); m.emissiveIntensity = 1; }
    // ---- pedals + feet
    this.pedal.gas = damp(this.pedal.gas, s.throttle, 20, dt);
    this.pedal.brake = damp(this.pedal.brake, s.brake, 20, dt);
    this.pedal.clutch = damp(this.pedal.clutch, clutch, 25, dt);
    this.pedals.gas.rotation.x = this.pedal.gas * 0.32; this.pedals.brake.rotation.x = this.pedal.brake * 0.22; this.pedals.clutch.rotation.x = this.pedal.clutch * 0.4;
    const footOn = (f2, pedal, k) => { pedal.updateMatrix(); T.a.set(0, -0.24, 0.07).applyMatrix4(pedal.matrix); f2.position.copy(T.a); f2.position.y += 0.03 + k; };
    footOn(this.feet[1], this.pedal.brake > 0.05 ? this.pedals.brake : this.pedals.gas, 0);
    footOn(this.feet[0], this.pedals.clutch, this.pedal.clutch > 0.05 ? 0 : 0.05);
  }

  // H-pattern: R and 1/2 on the left, 3/4 in the middle, 5/6 on the right; forward = odd gears
  slot(gear) {
    if (this.cfg.shifter === 'seq') return { c: 0, d: 0 };
    if (gear === 'R') return { c: -2, d: -1 };
    const n = Number(gear) || 0;
    if (!n) return { c: 0, d: 0 };
    return { c: Math.floor((n - 1) / 2) - 1, d: n % 2 ? -1 : 1 };
  }
  setLever(gear) { const s = this.slot(gear); this.lever.c = s.c; this.lever.d = s.d; this.applyLever(); this.updateBoot(); }
  // the knob follows the gate: out of the slot to neutral, across, into the new slot
  pathLever(a, b, u) {
    if (u < 1 / 3) { this.lever.c = a.c; this.lever.d = a.d * (1 - smooth(u * 3)); }
    else if (u < 2 / 3) { this.lever.c = a.c + (b.c - a.c) * smooth(u * 3 - 1); this.lever.d = 0; }
    else { this.lever.c = b.c; this.lever.d = b.d * smooth(u * 3 - 2); }
  }
  applyLever() { this.lev.rotation.set(this.lever.d * 0.24, 0, -this.lever.c * 0.13); }
  knobPoint(out) { this.lev.updateMatrix(); return out.set(0, this.levLen + 0.01, 0).applyMatrix4(this.lev.matrix); }

  updateBoot() {
    const { geo, rings, seg } = this.boot, p = geo.attributes.position.array, b = this.shiftBase, T = this.tmp;
    this.lev.updateMatrix();
    for (let r = 0; r <= rings; r++) {
      const f = r / rings, h = f * 0.11;
      T.a.set(0, h, 0).applyMatrix4(this.lev.matrix);                     // point on the lever at this height
      const cx = b.x + (T.a.x - b.x) * f, cy = b.y + h * 0.95, cz = b.z + (T.a.z - b.z) * f;
      const rad = 0.058 * (1 - f) + 0.014 * f + Math.sin(f * Math.PI * rings) * 0.004 * (1 - f); // pleats
      for (let s2 = 0; s2 < seg; s2++) { const a = (s2 / seg) * Math.PI * 2, o = (r * seg + s2) * 3; p[o] = cx + Math.cos(a) * rad; p[o + 1] = cy; p[o + 2] = cz + Math.sin(a) * rad; }
    }
    geo.attributes.position.needsUpdate = true; geo.computeVertexNormals();
  }

  // place hand i (0 left, 1 right) and solve its arm; rb/hb blend the right hand to the shifter / handbrake
  poseArm(i, rimAngle, lift, rb, hb) {
    const A = this.arms[i], T = this.tmp, wrist = A.wrist;
    // grip on the rim
    this.rimPoint(rimAngle, T.b);
    this.rimBasis(rimAngle, A.q);
    T.a.set(0, -Math.sin(this.tilt), Math.cos(this.tilt)).multiplyScalar(lift); T.b.add(T.a); // lift off while regripping
    if (rb > 0.001 || hb > 0.001) {
      // knob grip: palm on top of the knob; handbrake grip: hand around the vertical grip
      const k = hb > rb ? hb : rb;
      if (hb > rb) {
        // around the vertical grip: x = lever axis, y = to the right, z = axis x right (no allocations)
        this.hb.updateMatrix(); T.c.set(0, 0.3, 0).applyMatrix4(this.hb.matrix);
        const r = this.hb.rotation.x; T.e.set(0, Math.cos(r), Math.sin(r)); T.d.set(1, 0, 0); T.f.crossVectors(T.e, T.d);
        T.q2.setFromRotationMatrix(T.m.makeBasis(T.e, T.d, T.f));
      } else { this.knobPoint(T.c); T.c.y += 0.02; T.q2.setFromRotationMatrix(T.m.makeBasis(T.e.set(1, 0, 0), T.d.set(0, 1, 0), T.f.set(0, 0, 1))); }
      const arc = Math.sin(k * Math.PI) * 0.06; // hand travels in an arc, not through the dash
      T.b.lerp(T.c, smooth(k)); T.b.y += arc;
      A.q.slerp(T.q2, smooth(k));
    }
    A.hand.position.copy(T.b); A.hand.quaternion.copy(A.q);
    // wrist: behind the hand, towards the driver
    T.a.set(0, 0.05, 0.075).applyQuaternion(A.q); wrist.copy(T.b).add(T.a);
    // two-bone IK: elbow out to the side and down
    const S = this.shoulders[i], L1 = 0.31, L2 = 0.3;
    const dir = T.c.subVectors(wrist, S); let d = dir.length(); dir.normalize();
    d = Math.min(d, L1 + L2 - 0.005);
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const pole = T.d.set(i === 0 ? -1 : 1, -0.9, 0.15); pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const E2 = A.elbow.copy(S).addScaledVector(dir, a).addScaledVector(pole, h);
    T.e.copy(S).addScaledVector(dir, d); // reachable wrist
    this.seg(A.upper, S, E2); this.seg(A.fore, E2, T.e);
  }
  seg(m, a, b) {
    const T = this.tmp; T.a.subVectors(b, a); const len = T.a.length();
    m.position.copy(a); m.quaternion.setFromUnitVectors(UP, T.a.multiplyScalar(1 / Math.max(len, 1e-4))); m.scale.set(1, len, 1);
  }

  /* --------------------------------------------------------------- the head */
  // camera pose in body space: driver eye + seat settings + head motion; writes pos and look target
  head(dt, s, set, pos, look) {
    const H = this.hd, k = set.head ?? 1;
    dt = Math.min(dt, 0.05);
    // lateral g pushes the head to the outside, braking forward, accelerating back (spring-damped, ~2.5 Hz)
    const tx = clamp(-s.accLat * 0.0055, -0.07, 0.07) * k, tz = clamp(s.accLong * 0.005, -0.06, 0.05) * k, ty = -Math.abs(s.accLat) * 0.0008 * k;
    const w = 15, c = 2 * Math.sqrt(w * w) * 0.9;
    H.vx += (w * w * (tx - H.x) - c * H.vx) * dt; H.x += H.vx * dt;
    H.vz += (w * w * (tz - H.z) - c * H.vz) * dt; H.z += H.vz * dt;
    H.vy += (w * w * (ty - H.y) - c * H.vy) * dt; H.y += H.vy * dt;
    H.roll = damp(H.roll, clamp(s.accLat * 0.0035, -0.06, 0.06) * k, 6, dt);
    // look towards where the car is going while drifting
    H.yaw = damp(H.yaw, set.apex ? clamp(s.beta * 0.45 + s.steerIn * 0.08, -0.5, 0.5) : 0, 3, dt);
    H.pitch = damp(H.pitch, s.lookDown ? -0.8 : 0, 6, dt);
    // engine and road vibration (very small)
    const vib = (Math.sin(this.t * (s.rpm / 60) * Math.PI) * 0.00035 * (s.rpm / this.opts.redline) + (Math.sin(this.t * 53) * 0.5 + Math.sin(this.t * 31.7) * 0.5) * 0.0006 * Math.min(1, s.kmh / 160)) * k;
    const ld = -H.pitch / 0.8; // looking down: lean a little forward and to the right, past the wheel
    pos.set(this.E.x + H.x + ld * 0.1, this.E.y + set.seatY + H.y + vib - ld * 0.06, this.E.z + set.seatZ + H.z - ld * 0.06);
    const cy = Math.cos(H.pitch);
    look.set(pos.x - Math.sin(H.yaw) * cy * 10, pos.y + Math.sin(H.pitch) * 10 - 0.9, pos.z - Math.cos(H.yaw) * cy * 10);
    return H.roll;
  }
}
