// Player cars. The Supra A80 hero model lives in supra.js; the RX-7 FD and the
// GT-R R34 are built here from the shared lofted-body kit (carkit.js).
// Each car: root Group { body Group (roll/pitch), 4 wheels, blob shadow }.
// Faces -Z, sits on y = 0.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MAT, carPaint } from './materials.js';
import { curve, mesh, addWheels, blobShadow, mergeStatic } from './parts.js';
import { rbox, lofted, mirrors, ringLamp, wing, addCockpit } from './carkit.js';
import { buildSupra } from './supra.js';

/* ------------------------------------------------------------- the cars */
export const PLAYER_CARS = [
  {
    id: 'supra', name: 'Toyota Supra A80',
    tag: 'הגיבורה: שש בשורה עם טורבו כפול, כנף גבוהה ואף ארוך ונמוך.',
    topSpeed: 320, accel: 0.82, handling: 0.8,
    color: '#c4141c', length: 4.52, width: 1.81, styles: true,
    build(root, body, paint, style) { buildSupra(root, body, paint, style); },
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
      root.userData.exhausts = [new THREE.Vector3(0.42, 0.24, 2.2), new THREE.Vector3(0.56, 0.24, 2.2)];
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
      root.userData.exhausts = [new THREE.Vector3(0.6, 0.28, 2.37)];
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
  // single-file builds have no models folder; skip the probe so nothing 404s
  if (location.protocol === 'file:' || window.__driftNoModels) return null;
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
export function buildPlayerCar(def, color, style = 'stock') {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  // light colours get a pearl coat (the Supra's default is pearl white)
  const c = new THREE.Color(color), hsl = {}; c.getHSL(hsl);
  const paint = carPaint(color, hsl.l > 0.75 ? { pearl: true, metalness: 0.25, roughness: 0.22 } : {});
  if (def.id === 'supra' && supraGLB) buildFromGLB(root, body, def);
  else def.build(root, body, paint, style);
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
  // keep named parts (wing, light clusters, glass) as their own groups so they can be swapped/animated,
  // but merge static meshes inside each of them and in the body (one draw call per material)
  const parts = root.userData.parts;
  if (parts) {
    const named = [parts.wing, parts.lights.front, parts.lights.rear];
    for (const g of named) g.userData.dynamic = true;
    parts.glass.userData.dynamic = true;
    mergeStatic(body);
    for (const g of named) mergeStatic(g);
  } else mergeStatic(body);
  return root;
}
