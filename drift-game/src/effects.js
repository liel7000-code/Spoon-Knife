// Effects in world space: tyre smoke, sparks (shader point sprites with per-
// particle size/alpha) and skid marks (instanced quads in a group that scrolls
// with the road). Everything is pooled; nothing is allocated while driving.
import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);

export class Particles {
  constructor(scene, { max, color, additive, grow, drag, gravity, soft }) {
    this.max = max; this.grow = grow; this.drag = drag; this.gravity = gravity;
    this.pos = new Float32Array(max * 3).fill(-999);
    this.vel = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    this.a0 = new Float32Array(max);
    this.head = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uScale: { value: 400 } },
      vertexShader: `attribute float aSize; attribute float aAlpha; varying float vA; uniform float uScale;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = aAlpha * smoothstep(0.8, 4.5, -mv.z); gl_PointSize = min(aSize * uScale / max(0.1, -mv.z), 420.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; varying float vA;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); float a = ${soft ? 'smoothstep(0.5, 0.0, d) * smoothstep(0.5, 0.25, d) * 1.6' : 'smoothstep(0.5, 0.15, d)'};
          if (a * vA < 0.003) discard; gl_FragColor = vec4(uColor, a * vA); }`,
      transparent: true, depthWrite: false, fog: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, size, life, alpha) {
    const i = this.head; this.head = (this.head + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.size[i] = size; this.life[i] = life; this.maxLife[i] = life; this.a0[i] = alpha;
  }

  update(dt, scroll) {
    const P = this.pos, V = this.vel, damp = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const o = i * 3;
      V[o + 1] -= this.gravity * dt;
      V[o] *= damp; V[o + 1] *= this.gravity ? 1 : damp; V[o + 2] *= damp;
      P[o] += V[o] * dt; P[o + 1] += V[o + 1] * dt; P[o + 2] += (V[o + 2] + scroll) * dt;
      if (P[o + 1] < 0.02) { P[o + 1] = 0.02; V[o + 1] *= -0.3; }
      const t = 1 - this.life[i] / this.maxLife[i];
      this.size[i] += this.grow * dt;
      this.alpha[i] = this.a0[i] * Math.min(1, t * 8) * (1 - t);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = true; a.aSize.needsUpdate = true; a.aAlpha.needsUpdate = true;
  }

  reset() { this.life.fill(0); this.alpha.fill(0); }
}

// Exhaust flames: additive point sprites with a heat ramp (white-yellow -> orange
// -> red -> gone). Fixed pool, ring-buffer recycling, no allocations per frame.
export class Flames {
  constructor(scene, max = 240) {
    this.max = max; this.head = 0;
    this.pos = new Float32Array(max * 3).fill(-999);
    this.vel = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.heat = new Float32Array(max);
    this.blue = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aHeat', new THREE.BufferAttribute(this.heat, 1));
    g.setAttribute('aBlue', new THREE.BufferAttribute(this.blue, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: `attribute float aSize; attribute float aHeat; attribute float aBlue; varying float vH; varying float vB; uniform float uScale;
        void main(){ vH = aHeat; vB = aBlue; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vH; varying float vB;
        void main(){
          float d = length(gl_PointCoord - 0.5); float core = smoothstep(0.5, 0.0, d);
          vec3 hot = vec3(1.0, 0.95, 0.65), mid = vec3(1.0, 0.48, 0.08), cool = vec3(0.7, 0.08, 0.02);
          vec3 col = vH > 0.5 ? mix(mid, hot, (vH - 0.5) * 2.0) : mix(cool, mid, vH * 2.0);
          col = mix(col, vec3(0.35, 0.55, 1.0), vB * (1.0 - d * 1.6));
          float a = core * smoothstep(0.0, 0.25, vH);
          if (a < 0.004) discard;
          gl_FragColor = vec4(col * (1.2 + vH * 1.8), a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, size, life, blue = 0) {
    const i = this.head; this.head = (this.head + 1) % this.max; // recycle the oldest
    const o = i * 3;
    this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z;
    this.vel[o] = vx; this.vel[o + 1] = vy; this.vel[o + 2] = vz;
    this.size[i] = size; this.life[i] = life; this.maxLife[i] = life; this.heat[i] = 1; this.blue[i] = blue;
  }

  // flames ride with the car (the car stays at z = 0 while the world scrolls), so no road scroll here
  update(dt) {
    const P = this.pos, V = this.vel, damp = Math.exp(-dt * 7);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.heat[i] = 0; continue; }
      this.life[i] -= dt;
      const o = i * 3;
      P[o] += V[o] * dt; P[o + 1] += V[o + 1] * dt; P[o + 2] += V[o + 2] * dt;
      V[o] *= damp; V[o + 1] = V[o + 1] * damp + 1.5 * dt; V[o + 2] *= damp;
      this.size[i] *= 1 + dt * 3;
      this.heat[i] = Math.max(0, this.life[i] / this.maxLife[i]);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = true; a.aSize.needsUpdate = true; a.aHeat.needsUpdate = true; a.aBlue.needsUpdate = true;
  }

  reset() { this.life.fill(0); this.heat.fill(0); }
}

const SKIDS = 700;
export class Effects {
  constructor(scene) {
    this.smoke = new Particles(scene, { max: 260, color: '#d8d6d2', additive: false, grow: 2.2, drag: 1.6, gravity: 0, soft: true });
    this.sparks = new Particles(scene, { max: 220, color: '#ffb04a', additive: true, grow: 0, drag: 0.4, gravity: 14, soft: false });
    this.flames = new Flames(scene);
    // skid marks
    this.skidGroup = new THREE.Group();
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.skidMesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), SKIDS);
    this.skidMesh.count = 0;
    this.skidMesh.frustumCulled = false;
    this.skidMesh.renderOrder = 1;
    this.skidGroup.add(this.skidMesh);
    scene.add(this.skidGroup);
    this.skidHead = 0;
    this.o = new THREE.Object3D();
    this.last = [null, null];
  }

  setScale(px) { this.smoke.mat.uniforms.uScale.value = px; this.sparks.mat.uniforms.uScale.value = px; this.flames.mat.uniforms.uScale.value = px; }

  // one backfire puff out of an exhaust tip; (dx, dz) is the car's backward direction
  flame(x, y, z, dx, dz, carVx, strength = 1, amount = 1) {
    const sp = 7 + Math.random() * 5;
    const n = Math.round(4 * amount); // bigger flamethrowers (the Adler) emit more per pop, still from the fixed pool
    for (let k = 0; k < n; k++) {
      this.flames.emit(x, y, z, dx * sp + rand(-1.2, 1.2) + carVx, rand(-0.4, 0.9), dz * sp + rand(-1.2, 1.2),
        rand(0.16, 0.3) * strength, rand(0.08, 0.2), Math.random() < 0.15 ? 0.6 : 0);
    }
  }

  // small blue/orange flicker at full throttle near top speed
  flicker(x, y, z, dx, dz, carVx) {
    this.flames.emit(x, y, z, dx * 4 + carVx, rand(-0.2, 0.3), dz * 4, rand(0.07, 0.12), rand(0.04, 0.08), Math.random() < 0.6 ? 1 : 0.2);
  }

  reset() {
    this.smoke.reset(); this.sparks.reset(); this.flames.reset();
    this.skidMesh.count = 0; this.skidHead = 0; this.skidGroup.position.z = 0; this.last = [null, null];
  }

  spark(x, y, z, n = 1, spread = 6, vz = 0) {
    for (let k = 0; k < n; k++) this.sparks.emit(x, y, z, rand(-spread, spread), rand(1.5, spread), rand(-spread, spread) + vz, rand(0.05, 0.11), rand(0.25, 0.8), 1);
  }

  puff(x, z, intensity, vx = 0) {
    this.smoke.emit(x + rand(-0.15, 0.15), 0.25, z + rand(-0.1, 0.1), vx + rand(-1, 1), rand(0.3, 1.2), rand(-1, 1), rand(0.5, 0.9), rand(1.2, 2.2), 0.22 + intensity * 0.3);
  }

  // continuous skid trail for wheel `w` (0 = left rear, 1 = right rear)
  skid(w, x, z, on) {
    const lz = z - this.skidGroup.position.z;
    const prev = this.last[w];
    if (!on) { this.last[w] = null; return; }
    if (prev) {
      const dx = x - prev[0], dz = lz - prev[1], len = Math.hypot(dx, dz);
      if (len < 0.35) return;
      const o = this.o;
      o.position.set((x + prev[0]) / 2, 0.012, (lz + prev[1]) / 2);
      o.rotation.set(0, Math.atan2(dx, dz), 0);
      o.scale.set(0.23, 1, len + 0.02);
      o.updateMatrix();
      this.skidMesh.setMatrixAt(this.skidHead, o.matrix);
      this.skidHead = (this.skidHead + 1) % SKIDS;
      this.skidMesh.count = Math.min(SKIDS, this.skidMesh.count + 1);
      this.skidMesh.instanceMatrix.needsUpdate = true;
    }
    this.last[w] = [x, lz];
  }

  update(dt, scroll) {
    this.smoke.update(dt, scroll);
    this.sparks.update(dt, scroll);
    this.flames.update(dt);
    this.skidGroup.position.z += scroll * dt;
  }
}
