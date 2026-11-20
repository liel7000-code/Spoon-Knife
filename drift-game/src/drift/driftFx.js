// Drift effects in world space: thick tyre smoke (pooled soft sprites, density from slip
// and the quality level), skid marks (instanced decals in a ring buffer; marks fade with
// age and the oldest are recycled), sparks and exhaust flames.
import * as THREE from 'three';
import { Particles, Flames } from '../effects.js';

const rand = (a, b) => a + Math.random() * (b - a);

class Skids {
  constructor(scene, max) {
    this.max = max;
    const geo = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
    this.birth = new Float32Array(max).fill(-1e9);
    this.dark = new Float32Array(max);
    geo.setAttribute('aBirth', new THREE.InstancedBufferAttribute(this.birth, 1));
    geo.setAttribute('aDark', new THREE.InstancedBufferAttribute(this.dark, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uLife: { value: 70 }, uFog: { value: new THREE.Color() } },
      vertexShader: `attribute float aBirth; attribute float aDark; uniform float uTime; uniform float uLife; varying float vA;
        void main(){ float age = uTime - aBirth; vA = aDark * clamp(1.0 - age / uLife, 0.0, 1.0);
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: 'varying float vA; void main(){ if (vA < 0.01) discard; gl_FragColor = vec4(0.02, 0.02, 0.022, vA); }',
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, max);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.head = 0; this.o = new THREE.Object3D(); this.last = [null, null];
  }
  reset() { this.mesh.count = 0; this.head = 0; this.last = [null, null]; this.birth.fill(-1e9); this.mesh.geometry.attributes.aBirth.needsUpdate = true; }
  // continuous trail for wheel w; strength 0..1 sets how dark the rubber is
  add(w, x, y, z, on, strength, time) {
    const prev = this.last[w];
    if (!on) { this.last[w] = null; return; }
    if (prev) {
      const dx = x - prev[0], dz = z - prev[2], len = Math.hypot(dx, dz);
      if (len < 0.4) return;
      if (len < 3) {
        const o = this.o;
        o.position.set((x + prev[0]) / 2, (y + prev[1]) / 2 + 0.015, (z + prev[2]) / 2);
        o.rotation.set(0, Math.atan2(dx, dz), 0);
        o.scale.set(0.26, 1, len + 0.03);
        o.updateMatrix();
        const i = this.head;
        this.mesh.setMatrixAt(i, o.matrix);
        this.birth[i] = time; this.dark[i] = 0.25 + strength * 0.45;
        this.head = (this.head + 1) % this.max;
        this.mesh.count = Math.min(this.max, this.mesh.count + 1);
        this.mesh.instanceMatrix.needsUpdate = true;
        const g = this.mesh.geometry.attributes; g.aBirth.needsUpdate = true; g.aDark.needsUpdate = true;
      }
    }
    this.last[w] = [x, y, z];
  }
}

export class DriftFx {
  constructor(scene, quality) {
    this.scene = scene;
    this.time = 0;
    const smokeMax = { low: 220, medium: 480, high: 760 };
    this.smokeMax = smokeMax;
    // one big pool; quality only changes how much of it is emitted into
    this.smoke = new Particles(scene, { max: 760, color: '#d9d7d3', additive: false, grow: 2.6, drag: 1.4, gravity: 0, soft: true });
    this.smoke.points.frustumCulled = false;
    this.sparks = new Particles(scene, { max: 200, color: '#ffb04a', additive: true, grow: 0, drag: 0.4, gravity: 14, soft: false });
    this.sparks.points.frustumCulled = false;
    this.flames = new Flames(scene);
    this.skids = new Skids(scene, 1400);
    this.setQuality(quality);
  }
  setQuality(q) {
    this.density = q.scenery >= 1 ? 1 : q.scenery >= 0.8 ? 0.7 : 0.38;
    this.cap = q.scenery >= 1 ? 760 : q.scenery >= 0.8 ? 480 : 220;
  }
  setSmokeColor(c) { this.smoke.mat.uniforms.uColor.value.set(c); }
  setScale(px) { this.smoke.mat.uniforms.uScale.value = px; this.sparks.mat.uniforms.uScale.value = px; this.flames.mat.uniforms.uScale.value = px; }
  reset() { this.smoke.reset(); this.sparks.reset(); this.flames.reset(); this.skids.reset(); }

  // thick smoke from a sliding rear tyre; k = 0..1 slip intensity
  puff(x, y, z, k, vx, vz, dt) {
    const n = dt * 70 * this.density * (0.3 + k);
    let count = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
    while (count-- > 0) {
      // ring buffer limited to the quality cap
      const sm = this.smoke;
      if (sm.head >= this.cap) sm.head = 0;
      sm.emit(x + rand(-0.2, 0.2), y + 0.25, z + rand(-0.2, 0.2), vx * 0.25 + rand(-1.2, 1.2), rand(0.4, 1.6), vz * 0.25 + rand(-1.2, 1.2),
        rand(0.6, 1.0) + k * 0.5, rand(1.5, 3.0) + k * 1.2, 0.1 + k * 0.22);
    }
  }
  skid(w, x, y, z, on, strength) { this.skids.add(w, x, y, z, on, strength, this.time); }
  spark(x, y, z, n = 1, spread = 5) { for (let k = 0; k < n; k++) this.sparks.emit(x, y, z, rand(-spread, spread), rand(1, spread), rand(-spread, spread), rand(0.05, 0.1), rand(0.25, 0.7), 1); }
  flame(x, y, z, dx, dz, cvx, cvz, strength, amount) {
    const sp = 7 + Math.random() * 5, n = Math.round(4 * amount);
    for (let k = 0; k < n; k++) this.flames.emit(x, y, z, dx * sp + rand(-1.2, 1.2) + cvx, rand(-0.4, 0.9), dz * sp + rand(-1.2, 1.2) + cvz, rand(0.16, 0.3) * strength, rand(0.08, 0.2), Math.random() < 0.15 ? 0.6 : 0);
  }
  update(dt) {
    this.time += dt;
    this.skids.mat.uniforms.uTime.value = this.time;
    this.smoke.update(dt, 0);
    this.sparks.update(dt, 0);
    this.flames.update(dt);
  }
}
