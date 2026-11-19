// Procedural low-poly cars, built only from Three.js primitives.
// Every car faces -Z (forward), sits on y = 0, and is centred on x = 0.
import * as THREE from 'three';

/* ----------------------------------------------------------- materials */
const MAT = {
  glass: new THREE.MeshStandardMaterial({ color: 0x0b121b, metalness: 0.7, roughness: 0.08 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.92 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xc3c8cf, metalness: 0.9, roughness: 0.28 }),
  darkRim: new THREE.MeshStandardMaterial({ color: 0x2a2d31, metalness: 0.8, roughness: 0.35 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.55, metalness: 0.2 }),
  carbon: new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.35, metalness: 0.5 }),
  head: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1cf, emissiveIntensity: 1.8 }),
  tail: new THREE.MeshStandardMaterial({ color: 0x4a0000, emissive: 0xff1a12, emissiveIntensity: 1.5 }),
  amber: new THREE.MeshStandardMaterial({ color: 0x553000, emissive: 0xff9a1a, emissiveIntensity: 1.0 }),
  interior: new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.8 }),
  gauge: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff7a2a, emissiveIntensity: 1.2 }),
};

const bodyMat = (color) => new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.3 });

/* ---------------------------------------------------------- geometry */
const tireGeo = new THREE.CylinderGeometry(1, 1, 0.26, 20).rotateZ(Math.PI / 2);
const rimGeo = new THREE.CylinderGeometry(0.64, 0.64, 0.27, 14).rotateZ(Math.PI / 2);
const spokeGeo = new THREE.BoxGeometry(0.275, 0.12, 1.1);
const boxCache = new Map();
function boxGeo(w, h, d) {
  const k = `${w}|${h}|${d}`;
  if (!boxCache.has(k)) boxCache.set(k, new THREE.BoxGeometry(w, h, d));
  return boxCache.get(k);
}
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}
function disc(r, depth, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, depth, 16).rotateX(Math.PI / 2), mat);
  m.position.set(x, y, z);
  return m;
}

// Side profile drawn in (length, height) and extruded across the car's width.
function profileMesh(draw, width, mat, bevel = 0.06) {
  const shape = new THREE.Shape();
  draw(shape);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, width - bevel * 2), bevelEnabled: true,
    bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10,
  });
  geo.rotateY(-Math.PI / 2); // shape x -> world z (front is -z)
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  geo.translate(-(bb.min.x + bb.max.x) / 2, 0, 0);
  return new THREE.Mesh(geo, mat);
}

function wheel(r, rimMat = MAT.rim) {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  const t = new THREE.Mesh(tireGeo, MAT.tire);
  const rim = new THREE.Mesh(rimGeo, rimMat);
  const s1 = new THREE.Mesh(spokeGeo, rimMat);
  const s2 = new THREE.Mesh(spokeGeo, rimMat); s2.rotation.x = Math.PI / 2;
  spin.add(t, rim, s1, s2);
  spin.scale.setScalar(r);
  g.add(spin);
  g.userData.spin = spin;
  return g;
}

function addWheels(group, { front, rear, track, r, rimMat }) {
  const wheels = [], steer = [];
  for (const [z, isFront] of [[front, true], [rear, false]]) {
    for (const side of [-1, 1]) {
      const w = wheel(r, rimMat);
      w.position.set(side * track, r, z);
      group.add(w);
      wheels.push(w.userData.spin);
      if (isFront) steer.push(w);
    }
  }
  group.userData.wheels = wheels;
  group.userData.steerWheels = steer;
  group.userData.wheelR = r;
}

/* ------------------------------------------------------- blob shadow */
let shadowTex = null;
function shadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 10, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)'); grad.addColorStop(0.6, 'rgba(0,0,0,0.45)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}
const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
export function makeShadow(w, l) {
  const m = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
  m.scale.set(w * 1.35, 1, l * 1.2);
  m.position.y = 0.02;
  m.renderOrder = -1;
  return m;
}

// roof panels are hidden in the cockpit view so they don't block the windscreen
const roof = (m) => { m.userData.roof = true; return m; };

/* ------------------------------------------- cockpit (first person view) */
function addCockpit(group, { dashZ, dashY, eye }) {
  group.add(box(1.5, 0.1, 0.36, MAT.interior, 0, dashY, dashZ));
  group.add(box(0.26, 0.03, 0.03, MAT.gauge, eye.x, dashY + 0.055, dashZ + 0.12));
  const steer = new THREE.Group();      // tilted column
  const steerInner = new THREE.Group(); // turns with the steering
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 8, 24), MAT.interior);
  steerInner.add(ring, box(0.3, 0.035, 0.02, MAT.trim), box(0.035, 0.15, 0.02, MAT.trim, 0, -0.075, 0), box(0.08, 0.06, 0.04, MAT.amber));
  steer.add(steerInner);
  steer.position.set(eye.x, dashY + 0.02, dashZ + 0.3);
  steer.rotation.x = -0.35;
  group.add(steer);
  group.userData.steeringWheel = steerInner;
  group.userData.eye = new THREE.Vector3(eye.x, eye.y, eye.z);
}

/* ------------------------------------------------------- player cars */
export const PLAYER_CARS = [
  {
    id: 'supra', name: 'Toyota Supra',
    tag: 'שש בשורה, אף ארוך וכנף לולאה מאחור.',
    topSpeed: 285, accel: 0.72, handling: 0.66,
    color: '#d6281f', length: 4.52, width: 1.8,
    build(g, paint) {
      g.add(profileMesh((s) => {
        s.moveTo(-2.2, 0.3); s.lineTo(-2.28, 0.48);
        s.quadraticCurveTo(-2.3, 0.7, -1.94, 0.74);
        s.quadraticCurveTo(-1.2, 0.84, -0.62, 0.88);
        s.lineTo(1.55, 0.93);
        s.quadraticCurveTo(2.2, 0.95, 2.24, 0.72);
        s.lineTo(2.22, 0.3); s.lineTo(-2.2, 0.3);
      }, 1.8, paint));
      g.add(profileMesh((s) => {
        s.moveTo(-0.62, 0.86); s.quadraticCurveTo(-0.1, 1.23, 0.35, 1.26);
        s.lineTo(0.85, 1.25); s.quadraticCurveTo(1.45, 1.15, 1.72, 0.92); s.lineTo(-0.62, 0.86);
      }, 1.4, MAT.glass, 0.04));
      g.add(roof(box(1.3, 0.05, 0.55, paint, 0, 1.285, 0.6)));
      // oval headlights + mouth
      for (const sx of [-1, 1]) {
        const h = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), MAT.head);
        h.scale.set(0.24, 0.07, 0.14); h.position.set(sx * 0.6, 0.67, -2.1); h.rotation.y = sx * 0.25;
        g.add(h);
      }
      g.add(box(0.95, 0.13, 0.06, MAT.trim, 0, 0.42, -2.28));
      // round quad taillights on a dark band
      g.add(box(1.55, 0.2, 0.03, MAT.trim, 0, 0.74, 2.3));
      for (const x of [-0.78, -0.52, 0.52, 0.78]) g.add(disc(0.085, 0.04, MAT.tail, x, 0.74, 2.32));
      // hoop wing
      for (const sx of [-1, 1]) {
        const up = box(0.07, 0.34, 0.14, paint, sx * 0.7, 1.06, 1.98); up.rotation.x = 0.25; g.add(up);
      }
      g.add(box(1.56, 0.05, 0.32, paint, 0, 1.22, 2.04));
      addWheels(g, { front: -1.35, rear: 1.27, track: 0.8, r: 0.34 });
      addCockpit(g, { dashZ: -0.42, dashY: 0.92, eye: { x: -0.36, y: 1.19, z: 0.5 } });
    },
  },
  {
    id: 'rx7', name: 'Mazda RX-7',
    tag: 'מנוע רוטרי, פנסים קופצים ומשקל נוצה.',
    topSpeed: 255, accel: 0.62, handling: 0.95,
    color: '#f2b300', length: 4.3, width: 1.76,
    build(g, paint) {
      g.add(profileMesh((s) => {
        s.moveTo(-2.1, 0.28); s.lineTo(-2.16, 0.42);
        s.quadraticCurveTo(-2.14, 0.62, -1.78, 0.66);
        s.quadraticCurveTo(-0.9, 0.78, -0.5, 0.82);
        s.lineTo(1.5, 0.9);
        s.quadraticCurveTo(2.1, 0.92, 2.13, 0.66);
        s.lineTo(2.1, 0.28); s.lineTo(-2.1, 0.28);
      }, 1.76, paint));
      g.add(profileMesh((s) => {
        s.moveTo(-0.5, 0.8); s.quadraticCurveTo(0.0, 1.16, 0.45, 1.17);
        s.quadraticCurveTo(1.2, 1.15, 1.66, 0.89); s.lineTo(-0.5, 0.8);
      }, 1.34, MAT.glass, 0.04));
      g.add(roof(box(1.18, 0.04, 0.42, paint, 0, 1.185, 0.42)));
      // pop-up headlights, raised
      for (const sx of [-1, 1]) {
        const pod = box(0.42, 0.17, 0.3, paint, sx * 0.6, 0.78, -1.6); pod.rotation.x = -0.12; g.add(pod);
        g.add(box(0.36, 0.11, 0.02, MAT.head, sx * 0.6, 0.79, -1.76));
        g.add(box(0.3, 0.05, 0.03, MAT.amber, sx * 0.62, 0.42, -2.17));
      }
      g.add(box(1.1, 0.12, 0.05, MAT.trim, 0, 0.36, -2.18));
      // round taillights + smoked bar
      g.add(box(1.45, 0.14, 0.03, MAT.trim, 0, 0.72, 2.19));
      for (const sx of [-1, 1]) g.add(disc(0.1, 0.04, MAT.tail, sx * 0.6, 0.72, 2.21));
      // ducktail
      const duck = box(1.5, 0.04, 0.28, paint, 0, 0.95, 1.98); duck.rotation.x = -0.28; g.add(duck);
      addWheels(g, { front: -1.3, rear: 1.18, track: 0.79, r: 0.32 });
      addCockpit(g, { dashZ: -0.36, dashY: 0.86, eye: { x: -0.35, y: 1.1, z: 0.55 } });
    },
  },
  {
    id: 'gtr', name: 'Nissan GT-R',
    tag: 'הנעה כפולה, כנף ענקית ותאוצה אכזרית.',
    topSpeed: 315, accel: 0.95, handling: 0.74,
    color: '#7d8a96', length: 4.72, width: 1.9,
    build(g, paint) {
      g.add(profileMesh((s) => {
        s.moveTo(-2.3, 0.32); s.lineTo(-2.36, 0.6);
        s.quadraticCurveTo(-2.34, 0.8, -2.0, 0.84);
        s.lineTo(-0.7, 0.98); s.lineTo(1.75, 1.0); s.lineTo(2.33, 0.95);
        s.lineTo(2.36, 0.5); s.lineTo(2.3, 0.32); s.lineTo(-2.3, 0.32);
      }, 1.9, paint));
      g.add(profileMesh((s) => {
        s.moveTo(-0.7, 0.96); s.lineTo(-0.05, 1.36); s.lineTo(0.95, 1.37);
        s.quadraticCurveTo(1.6, 1.25, 1.95, 0.99); s.lineTo(-0.7, 0.96);
      }, 1.5, MAT.glass, 0.04));
      g.add(roof(box(1.42, 0.05, 0.85, paint, 0, 1.385, 0.45)));
      // boomerang headlights + big grille
      for (const sx of [-1, 1]) {
        const a = box(0.44, 0.06, 0.1, MAT.head, sx * 0.6, 0.8, -2.3); a.rotation.z = sx * 0.22; g.add(a);
        g.add(box(0.06, 0.2, 0.1, MAT.head, sx * 0.85, 0.72, -2.32));
      }
      g.add(box(1.0, 0.3, 0.06, MAT.trim, 0, 0.5, -2.42));
      // four ring taillights
      for (const x of [-0.78, -0.5, 0.5, 0.78]) {
        const t = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.026, 8, 18), MAT.tail);
        t.position.set(x, 0.8, 2.43); g.add(t);
        g.add(disc(0.06, 0.02, MAT.tail, x, 0.8, 2.42));
      }
      g.add(box(1.7, 0.1, 0.04, MAT.trim, 0, 0.5, 2.43));
      // big wing with endplates
      for (const sx of [-1, 1]) {
        g.add(box(0.06, 0.32, 0.18, MAT.carbon, sx * 0.62, 1.15, 2.02));
        g.add(box(0.04, 0.18, 0.42, MAT.carbon, sx * 0.9, 1.3, 2.06));
      }
      g.add(box(1.8, 0.06, 0.4, MAT.carbon, 0, 1.32, 2.06));
      addWheels(g, { front: -1.42, rear: 1.36, track: 0.85, r: 0.36, rimMat: MAT.darkRim });
      addCockpit(g, { dashZ: -0.52, dashY: 1.0, eye: { x: -0.38, y: 1.28, z: 0.45 } });
    },
  },
];
// stat ranges for the bars
export const STAT_RANGE = { topSpeed: [200, 330], accel: [0.4, 1], handling: [0.4, 1] };

export function buildPlayerCar(def, color) {
  const g = new THREE.Group();
  const paint = bodyMat(color);
  def.build(g, paint);
  g.add(makeShadow(def.width, def.length));
  g.userData.paint = paint;
  g.userData.def = def;
  g.userData.roofs = g.children.filter((c) => c.userData.roof);
  return g;
}

/* -------------------------------------------------------------- traffic */
// half extents for AABB collisions
export const TRAFFIC_TYPES = {
  sedan: { hw: 0.9, hl: 2.3 },
  hatch: { hw: 0.86, hl: 1.98 },
  van: { hw: 1.0, hl: 2.65 },
  truck: { hw: 1.25, hl: 5.8 },
};

function trafficLights(g, hw, y, zBack, zFront, tall = false) {
  for (const sx of [-1, 1]) {
    g.add(box(0.32, tall ? 0.34 : 0.13, 0.04, MAT.tail, sx * (hw - 0.22), y, zBack));
    g.add(box(0.3, 0.12, 0.04, MAT.head, sx * (hw - 0.24), y - 0.05, zFront));
  }
}

export function buildTraffic(type) {
  const g = new THREE.Group();
  const paint = bodyMat('#cccccc');
  let cargo = null;
  if (type === 'sedan') {
    g.add(box(1.78, 0.58, 4.55, paint, 0, 0.6, 0));
    g.add(box(1.58, 0.48, 2.3, MAT.glass, 0, 1.12, 0.2));
    g.add(box(1.6, 0.06, 1.9, paint, 0, 1.38, 0.25));
    trafficLights(g, 0.89, 0.72, 2.28, -2.28);
    addWheels(g, { front: -1.45, rear: 1.4, track: 0.8, r: 0.33 });
  } else if (type === 'hatch') {
    g.add(box(1.7, 0.6, 3.9, paint, 0, 0.6, 0));
    g.add(box(1.52, 0.52, 2.3, MAT.glass, 0, 1.15, 0.4));
    g.add(box(1.54, 0.06, 2.0, paint, 0, 1.43, 0.5));
    trafficLights(g, 0.85, 0.78, 1.96, -1.96);
    addWheels(g, { front: -1.25, rear: 1.25, track: 0.76, r: 0.31 });
  } else if (type === 'van') {
    g.add(box(1.98, 1.75, 5.2, paint, 0, 1.2, 0.05));
    const ws = box(1.8, 0.6, 0.05, MAT.glass, 0, 1.6, -2.56); ws.rotation.x = 0.25; g.add(ws);
    g.add(box(1.7, 0.08, 0.05, MAT.trim, 0, 0.45, 2.66));
    trafficLights(g, 0.99, 0.9, 2.66, -2.6, true);
    addWheels(g, { front: -1.7, rear: 1.65, track: 0.86, r: 0.36 });
  } else {
    // truck: coloured cab + box trailer
    g.add(box(2.4, 2.3, 2.3, paint, 0, 1.65, -4.55));
    g.add(box(2.2, 0.9, 0.05, MAT.glass, 0, 2.2, -5.71));
    g.add(box(2.42, 0.4, 2.32, MAT.trim, 0, 0.55, -4.55));
    cargo = new THREE.MeshStandardMaterial({ color: '#e9e9e4', roughness: 0.6, metalness: 0.1 });
    g.add(box(2.5, 2.9, 8.6, cargo, 0, 2.15, 1.2));
    g.add(box(2.3, 0.3, 8.4, MAT.trim, 0, 0.55, 1.2));
    trafficLights(g, 1.25, 0.95, 5.52, -5.73, true);
    addWheels(g, { front: -4.8, rear: 4.2, track: 1.02, r: 0.5, rimMat: MAT.darkRim });
    for (const sx of [-1, 1]) { const w = wheel(0.5, MAT.darkRim); w.position.set(sx * 1.02, 0.5, 3.0); g.add(w); }
  }
  const { hw, hl } = TRAFFIC_TYPES[type];
  g.add(makeShadow(hw * 2, hl * 2));
  g.userData.paint = paint;
  g.userData.cargo = cargo;
  return g;
}
