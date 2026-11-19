// World, player, scoring, collisions and the crash sequence.
// update(dt) runs on a fixed timestep; frame(realDt) handles visuals + render.
import * as THREE from 'three';
import { buildPlayerCar, PLAYER_CARS } from './cars.js';
import { Traffic, LANE_X, LANE_W } from './traffic.js';
import { CameraRig } from './camera.js';

const ROAD_W = LANE_W * 4 + 2.4; // 4 lanes + shoulders
const ROAD_LEN = 720;
const ROAD_Z = -ROAD_LEN / 2 + 70;
const DASH = 12; // metres per lane-marking period
const SEG = 30;
const SEG_N = 16;
const NEAR_MISS = 1.6; // metres of side clearance that counts as a near miss
const EDGE_MISS = 0.7; // ...and as a really close one
const COMBO_TIME = 3;
const SPARKS = 90;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
};

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function speckle(g, w, h, amount, alpha) {
  for (let i = 0; i < amount; i++) {
    const v = Math.random() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}

export class Game {
  constructor(renderer, { ui, audio, input, envMap, onGameOver }) {
    this.renderer = renderer;
    this.ui = ui; this.audio = audio; this.input = input;
    this.onGameOver = onGameOver;
    this.scene = new THREE.Scene();
    this.scene.environment = envMap;
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.05, 1500);
    this.rig = new CameraRig(this.camera);
    this.state = 'idle';
    this.timeScale = 1;
    this.best = store.get('driftgame.best', 0);
    this.buildWorld();
    this.traffic = new Traffic(this.scene);
    this.buildSparks();
    this.player = null;
  }

  /* ---------------------------------------------------------- world */
  buildWorld() {
    const s = this.scene;
    const horizon = new THREE.Color('#f0a477');
    s.fog = new THREE.Fog(horizon, 140, 430);

    // sky gradient dome
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1000, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { top: { value: new THREE.Color('#203a74') }, mid: { value: new THREE.Color('#7d6aa8') }, bottom: { value: horizon } },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;
          void main(){ float h = max(vP.y, 0.0);
            vec3 c = mix(bottom, mid, smoothstep(0.0, 0.18, h)); c = mix(c, top, smoothstep(0.18, 0.6, h));
            gl_FragColor = vec4(c, 1.0); }`,
      }),
    );
    sky.renderOrder = -10;
    s.add(sky);
    this.sky = sky;
    const sun = new THREE.Mesh(new THREE.CircleGeometry(38, 40), new THREE.MeshBasicMaterial({ color: '#ffe0a8', fog: false }));
    sun.position.set(-160, 70, -900);
    sun.lookAt(0, 0, 0);
    s.add(sun);
    this.sun = sun;

    s.add(new THREE.HemisphereLight('#b9c8ff', '#4a3a2c', 0.9));
    const dir = new THREE.DirectionalLight('#ffd2a6', 2.0);
    dir.position.set(-40, 50, -60);
    s.add(dir);

    // ground
    this.grassTex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#4c5e33'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 300; i++) {
        g.fillStyle = `rgba(${Math.random() < 0.5 ? '30,50,20' : '110,120,60'},${Math.random() * 0.25})`;
        g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 3 + Math.random() * 14, 0, 7); g.fill();
      }
      speckle(g, w, h, 2500, 0.12);
    });
    this.grassTex.wrapS = this.grassTex.wrapT = THREE.RepeatWrapping;
    this.grassTex.repeat.set(50, ROAD_LEN / 10);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, ROAD_LEN).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: this.grassTex, roughness: 1 }));
    ground.position.set(0, -0.02, ROAD_Z);
    s.add(ground);

    // road with lane markings
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.roadTex = canvasTex(512, 512, (g, w, h) => {
      const px = w / ROAD_W;
      g.fillStyle = '#34373c'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 9000, 0.18);
      // darker wheel tracks
      for (let l = 0; l < 4; l++) {
        const cx = (1.2 + LANE_W * (l + 0.5)) * px;
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect(cx - 1.1 * px, 0, 0.5 * px, h); g.fillRect(cx + 0.6 * px, 0, 0.5 * px, h);
      }
      g.fillStyle = '#4a4d52'; g.fillRect(0, 0, 1.2 * px, h); g.fillRect(w - 1.2 * px, 0, 1.2 * px, h);
      g.fillStyle = '#f2f2ee';
      g.fillRect(1.15 * px, 0, 0.16 * px, h);
      g.fillRect(w - 1.31 * px, 0, 0.16 * px, h);
      for (let k = 1; k < 4; k++) g.fillRect((1.2 + LANE_W * k) * px - 0.07 * px, 0, 0.14 * px, (3 / DASH) * h);
    });
    this.roadTex.wrapT = THREE.RepeatWrapping;
    this.roadTex.anisotropy = maxAniso;
    this.roadTex.repeat.set(1, ROAD_LEN / DASH);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, ROAD_LEN).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: this.roadTex, roughness: 0.85 }));
    road.position.set(0, 0, ROAD_Z);
    s.add(road);

    // guard rails (static; their posts scroll with the scenery)
    const railMat = new THREE.MeshStandardMaterial({ color: '#b8bdc4', metalness: 0.8, roughness: 0.35 });
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.32, ROAD_LEN), railMat);
      rail.position.set(sx * (ROAD_W / 2 + 0.45), 0.62, ROAD_Z);
      s.add(rail);
    }

    // scrolling scenery chunks
    const G = {
      post: new THREE.BoxGeometry(0.12, 0.7, 0.12),
      pole: new THREE.CylinderGeometry(0.09, 0.12, 9, 8),
      arm: new THREE.BoxGeometry(2.4, 0.1, 0.12),
      lamp: new THREE.BoxGeometry(0.7, 0.12, 0.3),
      trunk: new THREE.CylinderGeometry(0.18, 0.25, 2, 6),
      crown: new THREE.ConeGeometry(1.8, 5, 7),
      crown2: new THREE.IcosahedronGeometry(2.2, 0),
      bld: new THREE.BoxGeometry(1, 1, 1),
    };
    const M = {
      post: new THREE.MeshStandardMaterial({ color: '#8d939b', metalness: 0.6, roughness: 0.5 }),
      pole: new THREE.MeshStandardMaterial({ color: '#5d636c', metalness: 0.5, roughness: 0.5 }),
      lamp: new THREE.MeshStandardMaterial({ color: '#333', emissive: '#ffd9a0', emissiveIntensity: 2.2 }),
      trunk: new THREE.MeshStandardMaterial({ color: '#4a3526', roughness: 1 }),
      crowns: ['#2f5a2e', '#3c6b32', '#26472a', '#557a33'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true })),
      blds: ['#4a4f63', '#6a5f6e', '#3c4658', '#7b6f66', '#55617a'].map((c) => {
        const win = canvasTex(64, 128, (g, w, h) => {
          g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
          for (let y = 6; y < h - 4; y += 10) for (let x = 5; x < w - 4; x += 10) {
            if (Math.random() < 0.42) { g.fillStyle = Math.random() < 0.5 ? '#ffd27a' : '#ffe9b8'; g.fillRect(x, y, 5, 5); }
          }
        });
        return new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, emissive: '#ffffff', emissiveMap: win, emissiveIntensity: 0.9 });
      }),
    };
    this.segments = [];
    for (let i = 0; i < SEG_N; i++) {
      const seg = new THREE.Group();
      seg.position.z = 40 - i * SEG;
      for (const sx of [-1, 1]) {
        for (let k = 0; k < 4; k++) {
          const p = new THREE.Mesh(G.post, M.post);
          p.position.set(sx * (ROAD_W / 2 + 0.45), 0.35, -k * (SEG / 4));
          seg.add(p);
        }
        if (i % 2 === (sx > 0 ? 0 : 1)) {
          const pole = new THREE.Mesh(G.pole, M.pole); pole.position.set(sx * (ROAD_W / 2 + 1.4), 4.5, -SEG / 2); seg.add(pole);
          const arm = new THREE.Mesh(G.arm, M.pole); arm.position.set(sx * (ROAD_W / 2 + 0.3), 8.95, -SEG / 2); seg.add(arm);
          const lamp = new THREE.Mesh(G.lamp, M.lamp); lamp.position.set(sx * (ROAD_W / 2 - 0.8), 8.85, -SEG / 2); seg.add(lamp);
        }
        for (let k = 0; k < 4; k++) {
          const x = sx * rand(13, 46), z = -rand(0, SEG), sc = rand(0.7, 1.4);
          const trunk = new THREE.Mesh(G.trunk, M.trunk); trunk.position.set(x, 1 * sc, z); trunk.scale.setScalar(sc); seg.add(trunk);
          const round = Math.random() < 0.4;
          const crown = new THREE.Mesh(round ? G.crown2 : G.crown, M.crowns[(Math.random() * 4) | 0]);
          crown.position.set(x, (round ? 3.6 : 4.2) * sc, z); crown.scale.setScalar(sc); seg.add(crown);
        }
        if (Math.random() < 0.7) {
          const w = rand(14, 30), h = rand(14, 70), d = rand(14, 26);
          const b = new THREE.Mesh(G.bld, M.blds[(Math.random() * M.blds.length) | 0]);
          b.scale.set(w, h, d); b.position.set(sx * rand(62, 120), h / 2, -rand(0, SEG)); seg.add(b);
        }
      }
      s.add(seg);
      this.segments.push(seg);
    }
  }

  buildSparks() {
    const geo = new THREE.BufferGeometry();
    this.sparkPos = new Float32Array(SPARKS * 3).fill(-999);
    this.sparkVel = new Float32Array(SPARKS * 3);
    this.sparkLife = new Float32Array(SPARKS);
    geo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    this.sparks = new THREE.Points(geo, new THREE.PointsMaterial({
      color: '#ffb347', size: 0.16, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);
  }

  emitSparks(x, y, z) {
    for (let i = 0; i < SPARKS; i++) {
      this.sparkPos.set([x + rand(-0.4, 0.4), y + rand(0, 0.5), z + rand(-0.4, 0.4)], i * 3);
      this.sparkVel.set([rand(-7, 7), rand(2, 8), rand(-6, 6)], i * 3);
      this.sparkLife[i] = rand(0.4, 1.2);
    }
  }

  /* ------------------------------------------------------- lifecycle */
  start(defIndex, color, camMode) {
    const def = (this.def = PLAYER_CARS[defIndex]);
    if (this.player) this.scene.remove(this.player);
    this.player = buildPlayerCar(def, color);
    this.scene.add(this.player);
    this.p = { lane: 1, x: LANE_X[1], vx: 0, speed: 100 / 3.6, yaw: 0, roll: 0, spinV: 0, crashVx: 0 };
    this.time = 0; this.distance = 0; this.bonus = 0; this.nearMisses = 0;
    this.combo = 0; this.comboT = 0; this.difficulty = 0;
    this.crashReal = 0; this.overShown = false;
    this.timeScale = 1;
    this.traffic.reset();
    this.sparkPos.fill(-999); this.sparkLife.fill(0);
    this.rig.setMode(camMode);
    this.rig.shake = 0;
    this.state = 'play';
  }

  stop() { this.state = 'idle'; }

  get score() { return Math.floor(this.distance) + this.bonus; }

  lane(dir) {
    if (this.state !== 'play') return;
    this.p.lane = clamp(this.p.lane + dir, 0, 3);
  }

  toggleCamera() { return this.rig.toggle(); }

  /* ------------------------------------------------- fixed-step logic */
  update(dt) {
    if (this.state === 'idle') return;
    const p = this.p, def = this.def;
    const top = def.topSpeed / 3.6;

    if (this.state === 'play') {
      this.time += dt;
      // cruising speed creeps up over time; W/S push above or below it
      const base = Math.min(top * 0.8, (115 + this.time * 1.4) / 3.6);
      let target = base, rate;
      if (this.input.gas) { target = top; rate = 3 + def.accel * 9; }
      else if (this.input.brake) { target = Math.max(65 / 3.6, base * 0.55); rate = 14; }
      else rate = p.speed < base ? 2 + def.accel * 4 : 3;
      p.speed += clamp(target - p.speed, -rate * dt, rate * dt);

      const k = 4.5 + def.handling * 8;
      const nx = p.x + (LANE_X[p.lane] - p.x) * (1 - Math.exp(-k * dt));
      p.vx = (nx - p.x) / dt;
      p.x = nx;

      this.distance += p.speed * dt;
      if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
      this.difficulty = clamp((p.speed * 3.6 - 110) / 170, 0, 1);
    } else if (this.state === 'crash') {
      p.speed *= Math.exp(-1.3 * dt);
      p.yaw += p.spinV * dt; p.spinV *= Math.exp(-1.5 * dt);
      p.x += p.crashVx * dt; p.crashVx *= Math.exp(-2.4 * dt);
      p.x = clamp(p.x, -ROAD_W / 2 + 1, ROAD_W / 2 - 1);
      p.vx = 0;
    }

    this.traffic.update(dt, p.speed, this.difficulty, this.state === 'play');
    this.scroll(p.speed * dt);
    if (this.state === 'play') this.checkTraffic();
    this.updateSparks(dt, p.speed);
  }

  scroll(d) {
    this.roadDist = ((this.roadDist || 0) + d) % (DASH * 1000);
    this.roadTex.offset.y = (this.roadDist / DASH) % 1;
    this.grassTex.offset.y = (this.roadDist / 10) % 1;
    for (const seg of this.segments) {
      seg.position.z += d;
      if (seg.position.z > 40 + SEG) seg.position.z -= SEG * SEG_N;
    }
  }

  checkTraffic() {
    const p = this.p;
    const phw = this.def.width / 2 - 0.06, phl = this.def.length / 2 - 0.1;
    for (const it of this.traffic.items) {
      if (!it.active || it.crashed) continue;
      const overlapZ = Math.abs(it.z) < it.hl + phl;
      const gap = Math.abs(it.x - p.x) - (it.hw + phw);
      if (overlapZ) {
        if (gap < 0) { this.crash(it); return; }
        if (gap < it.minGap) it.minGap = gap;
      } else if (!it.scored && it.z - it.hl > phl) {
        it.scored = true;
        if (it.minGap < NEAR_MISS) this.nearMiss(it.minGap);
      }
    }
  }

  nearMiss(gap) {
    this.combo = this.comboT > 0 ? this.combo + 1 : 1;
    this.comboT = COMBO_TIME;
    const edge = gap < EDGE_MISS;
    const pts = (edge ? 300 : 100) * this.combo;
    this.bonus += pts;
    this.nearMisses++;
    this.ui.popup(`${edge ? 'על הקצה!' : 'כמעט!'} \u2066+${pts}\u2069`); // LTR-isolate the number
    this.audio.nearMiss();
  }

  crash(it) {
    const p = this.p;
    this.state = 'crash';
    this.crashReal = 0;
    const side = Math.sign(p.x - it.x) || 1;
    p.spinV = side * rand(2.2, 3.4) * (Math.random() < 0.5 ? 1 : -1);
    p.crashVx = side * rand(2, 4);
    it.crashed = true;
    it.spinV = -side * rand(0.8, 1.6);
    it.vx = -side * rand(1.5, 3);
    it.spd += p.speed * 0.25;
    this.rig.shake = 1.3;
    this.emitSparks((p.x + it.x) / 2, 0.7, it.z > 0 ? it.z - it.hl : it.z + it.hl);
    this.audio.crash();
    this.finalScore = this.score;
    this.isRecord = this.finalScore > this.best;
    if (this.isRecord) { this.best = this.finalScore; store.set('driftgame.best', this.best); }
  }

  updateSparks(dt, speed) {
    const P = this.sparkPos, V = this.sparkVel;
    let any = false;
    for (let i = 0; i < SPARKS; i++) {
      if (this.sparkLife[i] <= 0) continue;
      any = true;
      this.sparkLife[i] -= dt;
      const o = i * 3;
      V[o + 1] -= 14 * dt;
      P[o] += V[o] * dt; P[o + 1] += V[o + 1] * dt; P[o + 2] += (V[o + 2] + speed) * dt;
      if (P[o + 1] < 0.02) { P[o + 1] = 0.02; V[o + 1] *= -0.3; }
      if (this.sparkLife[i] <= 0) P[o + 1] = -999;
    }
    if (any) this.sparks.geometry.attributes.position.needsUpdate = true;
  }

  /* --------------------------------------------- per-frame visuals */
  frame(realDt) {
    if (this.state === 'idle' || !this.player) return;
    const p = this.p, car = this.player, def = this.def;
    const k = 1 - Math.exp(-realDt * 10);

    if (this.state === 'crash') {
      this.crashReal += realDt;
      this.timeScale = this.crashReal < 0.85 ? 0.2 : Math.min(1, 0.2 + (this.crashReal - 0.85) * 1.1);
      if (this.crashReal > 1.8 && !this.overShown) {
        this.overShown = true;
        this.onGameOver({ score: this.finalScore, distance: this.distance, nearMisses: this.nearMisses, best: this.best, record: this.isRecord });
      }
      car.rotation.y = p.yaw;
      p.roll += (0 - p.roll) * k;
    } else {
      p.yaw += (-p.vx * 0.045 - p.yaw) * k;
      p.roll += (p.vx * 0.02 - p.roll) * k;
      car.rotation.y = p.yaw;
    }
    car.position.set(p.x, 0, 0);
    car.rotation.z = p.roll;

    const ud = car.userData;
    const cockpit = this.rig.mode === 'first';
    for (const r of ud.roofs) r.visible = !cockpit;
    const steer = this.state === 'play' ? clamp(-p.vx * 0.07, -0.45, 0.45) : 0;
    for (const w of ud.steerWheels) w.rotation.y = steer;
    if (ud.steeringWheel) ud.steeringWheel.rotation.z = steer * 3;
    const spin = (p.speed * realDt * this.timeScale) / ud.wheelR;
    for (const w of ud.wheels) w.rotation.x -= spin;

    const speedFrac = clamp(p.speed / (def.topSpeed / 3.6), 0, 1);
    this.rig.update(realDt, car, speedFrac);

    this.ui.hud({
      speed: p.speed * 3.6,
      score: this.state === 'play' ? this.score : this.finalScore,
      best: Math.max(this.best, this.state === 'play' ? this.score : 0),
      combo: this.combo,
      comboFrac: this.comboT / COMBO_TIME,
    });
    this.audio.update(speedFrac, this.input.gas ? 1 : 0.35, this.state === 'play');

    // keep sky & sun centred on the camera
    this.sky.position.copy(this.camera.position);
    this.sun.position.set(this.camera.position.x - 160, 70, this.camera.position.z - 900);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
