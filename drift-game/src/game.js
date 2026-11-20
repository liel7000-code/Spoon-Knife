// Game state: player physics, traffic, scoring, collisions and the crash sequence.
// update(dt) runs on a fixed timestep; frame(realDt) does visuals and rendering.
import * as THREE from 'three';
import { buildPlayerCar, PLAYER_CARS } from './cars.js';
import { Traffic, LANE_X } from './traffic.js';
import { CameraRig } from './camera.js';
import { CarPhysics, obbDistance, xExtent } from './physics.js';
import { maxAnisotropy } from './parts.js';
import { World, BARRIER_X, SUN_DIR } from './world.js';
import { Effects } from './effects.js';
import { Post } from './post.js';
import { CONFIG } from './config.js';
import { Scoring, EVENTS, submitRun } from './scoring.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
};

export class Game {
  constructor(renderer, { ui, audio, input, onGameOver, quality }) {
    this.renderer = renderer;
    this.ui = ui; this.audio = audio; this.input = input;
    this.onGameOver = onGameOver;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.05, 2500);
    this.rig = new CameraRig(this.camera);
    this.state = 'idle';
    this.timeScale = 1;
    this.best = store.get('driftgame.best', 0);
    this.quality = quality;
    this.world = new World(renderer, this.scene, quality);
    this.traffic = new Traffic(this.scene);
    this.fx = new Effects(this.scene);
    this.post = new Post(renderer, this.scene, this.camera);
    this.post.setQuality(quality);
    this.v3 = new THREE.Vector3();
    this.player = null;
    this.phys = null;
    this.pBox = { x: 0, z: 0, hw: 1, hl: 2, yaw: 0 };
    this.tBox = { x: 0, z: 0, hw: 1, hl: 2, yaw: 0 };
    this.scoring = new Scoring((kind, pts) => this.onScore(kind, pts));
    // exhaust flash lights: created once (adding/removing lights would recompile shaders)
    this.flash = [0, 1].map(() => { const l = new THREE.PointLight('#ff8a2a', 0, 7, 2); this.scene.add(l); return l; });
    this.flameT = 0; this.prevGas = false;
    maxAnisotropy(this.scene, renderer);
  }

  /* ------------------------------------------------------- lifecycle */
  start(defIndex, color, camMode, style = 'stock') {
    const def = (this.def = PLAYER_CARS[defIndex]);
    if (this.player) this.scene.remove(this.player);
    this.player = buildPlayerCar(def, color, style);
    this.player.traverse((o) => { if (o.isMesh && !o.userData.blob) o.castShadow = true; });
    maxAnisotropy(this.player, this.renderer);
    this.scene.add(this.player);
    // headlights: one shadowless spot for the light pool
    const body = this.player.userData.body;
    const spot = (this.headlight = new THREE.SpotLight('#fff0d0', 90, 80, 0.38, 0.55, 1.4));
    spot.position.set(0, 0.62, -def.length / 2 + 0.2);
    spot.target.position.set(0, 0, -30);
    spot.visible = this.quality.headlights || this.night;
    if (this.night) { spot.intensity = 320; spot.distance = 110; }
    body.add(spot, spot.target);
    // the spotlight alone lights the road; visible beam cones looked like grey wedges
    this.phys = new CarPhysics(def);
    this.phys.reset(LANE_X[1]);
    this.crashSpin = 0; this.crashVx = 0;
    this.time = 0; this.distance = 0; this.bonus = 0; this.nearMisses = 0;
    this.combo = 0; this.comboT = 0; this.difficulty = 0;
    this.scoring.reset();
    this.flameT = 0; this.prevGas = false;
    this.crashReal = 0; this.overShown = false; this.scrape = 0;
    this.timeScale = 1;
    this.traffic.reset();
    this.fx.reset();
    this.rig.setMode(camMode);
    this.rig.shake = 0;
    this.rig.startIntro();
    this.state = 'play';
  }

  stop() { this.state = 'idle'; }

  setTime(night) {
    this.night = night;
    this.world.setTime(night);
    this.traffic.night = night;
    for (const it of this.traffic.items) if (it.active) it.mesh.userData.setLightsOn(night || Math.random() < 0.35);
    this.renderer.toneMappingExposure = night ? 1.05 : 0.68;
    if (this.headlight) { this.headlight.intensity = night ? 320 : 90; this.headlight.distance = night ? 110 : 80; }
  }

  setQuality(q) {
    this.quality = q;
    this.world.setQuality(q);
    this.post.setQuality(q);
    if (this.headlight) this.headlight.visible = q.headlights;
  }

  get score() { return Math.floor(this.scoring.total); }

  toggleCamera() { return this.rig.toggle(); }

  // half extents of the player for collisions
  get phw() { return this.def.width / 2 - 0.04; }
  get phl() { return this.def.length / 2 - 0.08; }

  /* ------------------------------------------------- fixed-step logic */
  update(dt) {
    if (this.state === 'idle') return;
    const ph = this.phys, def = this.def;

    if (this.state === 'play') {
      this.time += dt;
      const top = def.topSpeed / 3.6;
      const baseSpeed = Math.min(top * 0.78, (115 + this.time * 1.4) / 3.6);
      const st = this.input.steering();
      ph.step(dt, { steerTarget: st.target, analog: st.analog, gas: this.input.gas, brake: this.input.brake, baseSpeed });
      this.barrier(dt);
      this.distance += ph.forward * dt;
      this.scoring.tick(dt, ph.speed * 3.6);
      this.difficulty = clamp((ph.speed * 3.6 - 110) / 170, 0, 1);
    } else if (this.state === 'crash') {
      ph.speed *= Math.exp(-1.3 * dt);
      ph.heading += this.crashSpin * dt; this.crashSpin *= Math.exp(-1.5 * dt);
      ph.x += this.crashVx * dt; this.crashVx *= Math.exp(-2.4 * dt);
      const lim = BARRIER_X - xExtent(this.phw, this.phl, ph.heading);
      if (Math.abs(ph.x) > lim) { ph.x = Math.sign(ph.x) * lim; this.crashVx *= -0.3; }
      ph.forward = ph.speed;
      ph.vx = 0;
    }
    if (this.scrape > 0) this.scrape -= dt;

    this.traffic.update(dt, ph.forward, this.difficulty, this.state === 'play');
    this.world.scroll(ph.forward * dt);
    this.fx.update(dt, ph.forward);
    if (this.state === 'play') this.checkTraffic();
    this.tyres(dt);
    this.exhaustFx(dt);
  }

  // backfire flames when the throttle is released at speed; a small flicker at full throttle near top speed
  exhaustFx(dt) {
    const ph = this.phys, ud = this.player && this.player.userData;
    const tips = ud && (ud.exhausts || (ud.exhaust ? [ud.exhaust] : []));
    const gas = this.state === 'play' && this.input.gas, kmh = ph.speed * 3.6;
    const brake = this.state === 'play' && this.input.brake;
    // lift-off (gas released) or a hard brake from high speed
    if (this.state === 'play' && ((this.prevGas && !gas && kmh > 90) || (brake && !this.prevBrake && kmh > 120))) this.flameT = rand(0.3, 0.6);
    this.prevGas = gas; this.prevBrake = brake;
    const yaw = -ph.heading, c = Math.cos(yaw), s = Math.sin(yaw), by = (ud && ud.body ? ud.body.position.y : 0);
    let flash = 0;
    if (tips && tips.length) {
      const burst = this.flameT > 0 && Math.random() < 0.55;          // crackle: bursts with gaps
      const flick = gas && kmh > this.def.topSpeed * 0.9 && Math.random() < dt * 24;
      tips.forEach((t, i) => {
        const x = ph.x + t.x * c + t.z * s, z = -t.x * s + t.z * c, y = t.y + by;
        if (burst) { this.fx.flame(x, y, z, s, c, ph.vx, 0.8 + this.flameT); flash = 1; }
        if (flick) this.fx.flicker(x, y, z, s, c, ph.vx);
        if (this.flash[i]) this.flash[i].position.set(x, y + 0.1, z + 0.25);
      });
    }
    if (this.flameT > 0) this.flameT -= dt;
    for (const l of this.flash) l.intensity = flash ? rand(6, 14) : l.intensity * Math.exp(-dt * 30);
  }

  // side barriers: scrape when brushing, crash when hit hard at an angle
  barrier(dt) {
    const ph = this.phys, B = CONFIG.barrier;
    const lim = BARRIER_X - xExtent(this.phw, this.phl, ph.heading);
    if (Math.abs(ph.x) <= lim) return;
    const s = Math.sign(ph.x);
    const into = ph.vx * s; // m/s toward the barrier
    if (into > B.crashNormalSpeed) { this.crash(null, s); return; }
    ph.x = s * lim;
    if (ph.velAng * s > 0) ph.velAng *= -0.2;
    if (ph.heading * s > 0) { ph.heading *= 0.55; ph.yawRate = -s * Math.abs(ph.yawRate) * 0.3; }
    ph.speed *= Math.exp(-B.scrapeDrag * dt);
    ph.steer = clamp(ph.steer - s * B.pushback, -1, 1);
    this.scrape = 0.12;
    if (Math.random() < 0.6) this.fx.spark(s * (BARRIER_X - 0.05), rand(0.3, 0.7), rand(-this.phl, this.phl) * 0.7, 2, 4, -ph.forward * 0.15);
  }

  // smoke + skid marks from the rear tyres while sliding (or spinning out)
  tyres(dt) {
    const ph = this.phys, G = CONFIG.grip;
    const sliding = this.state === 'crash' ? ph.speed > 6 : Math.abs(ph.slip) > G.skidThreshold && ph.speed > 12;
    const k = this.state === 'crash' ? 1 : clamp((Math.abs(ph.slip) - G.skidThreshold) / 0.08, 0, 1);
    const yaw = -ph.heading, c = Math.cos(yaw), s = Math.sin(yaw);
    const rz = this.def.length * 0.28, tx = this.def.width / 2 - 0.15;
    [-1, 1].forEach((side, w) => {
      const lx = side * tx;
      const x = ph.x + lx * c + rz * s, z = -lx * s + rz * c;
      this.fx.skid(w, x, z, sliding);
      if (sliding && Math.random() < dt * 60 * (0.25 + k * 0.6)) this.fx.puff(x, z, k, -ph.vx * 0.3);
    });
  }

  checkTraffic() {
    const ph = this.phys, N = CONFIG.nearMiss;
    const pb = this.pBox, tb = this.tBox;
    pb.x = ph.x; pb.z = 0; pb.hw = this.phw; pb.hl = this.phl; pb.yaw = -ph.heading;
    for (const it of this.traffic.items) {
      if (!it.active || it.crashed) continue;
      // broad phase
      if (Math.abs(it.z) > it.hl + pb.hl + 3 || Math.abs(it.x - ph.x) > it.hw + pb.hl + 2) {
        if (!it.scored && it.z - it.hl > pb.hl) {
          it.scored = true;
          this.passed(it);
        }
        continue;
      }
      tb.x = it.x; tb.z = it.z; tb.hw = it.hw; tb.hl = it.hl; tb.yaw = it.yaw;
      const d = obbDistance(pb, tb);
      if (d <= 0) { this.crash(it, 0); return; }
      if (d < it.minGap) { it.minGap = d; it.passSide = Math.sign(it.x - ph.x); }
    }
  }

  // a car has just been passed: overtake, near miss / close pass, or a lane split
  // (threading between two cars, one on each side, within a fraction of a second)
  passed(it) {
    const N = CONFIG.nearMiss, kmh = this.phys.speed * 3.6;
    it.passT = this.time;
    if (kmh >= CONFIG.score.minSpeed + 30) this.scoring.event('overtake');
    if (it.minGap < N.split) {
      for (const o of this.traffic.items) {
        if (o === it || !o.active || o.splitUsed || o.passT == null || this.time - o.passT > 0.4) continue;
        if (o.minGap < N.split && o.passSide === -it.passSide) { o.splitUsed = it.splitUsed = true; this.scoring.event('split'); return; }
      }
    }
    if (it.minGap < N.edge) this.scoring.event('close');
    else if (it.minGap < N.near) this.scoring.event('near');
  }

  onScore(kind, pts) {
    if (kind === 'slow') { this.ui.feed('מהירות נמוכה · המכפיל אופס', 'bad'); return; }
    if (EVENTS[kind].quiet) return;
    this.nearMisses += kind === 'overtake' ? 0 : 1;
    this.ui.feed(`${EVENTS[kind].label} \u2066+${pts.toLocaleString('he-IL')}\u2069`, kind);
    this.audio.nearMiss();
  }

  crash(it, wallSide) {
    const ph = this.phys;
    this.state = 'crash';
    this.crashReal = 0;
    if (it) {
      const side = Math.sign(ph.x - it.x) || 1;
      this.crashSpin = side * rand(2.0, 3.2) * (Math.random() < 0.5 ? 1 : -1);
      this.crashVx = side * rand(2, 4);
      it.crashed = true;
      it.spinV = -side * rand(0.8, 1.6);
      it.vx = -side * rand(1.5, 3);
      it.spd += ph.speed * 0.25;
      this.fx.spark((ph.x + it.x) / 2, 0.6, it.z > 0 ? it.z - it.hl : it.z + it.hl, 80, 7);
    } else {
      this.crashSpin = -wallSide * rand(2.5, 3.5);
      this.crashVx = -wallSide * rand(3, 5);
      ph.speed *= 0.6;
      this.fx.spark(wallSide * BARRIER_X, 0.6, -this.phl * 0.8, 80, 7);
    }
    this.rig.shake = 1.3;
    this.rig.startCrash(Math.sign(ph.x || 1));
    this.audio.crash();
    this.finalScore = this.score;
    this.isRecord = this.finalScore > this.best;
    if (this.isRecord) { this.best = this.finalScore; store.set('driftgame.best', this.best); }
    const sc = this.scoring;
    this.runStats = { splits: sc.counts.split, close: sc.counts.close, near: sc.counts.near, overtakes: sc.counts.overtake, topMult: sc.topMult, topSpeed: sc.topSpeed };
    this.rank = this.finalScore > 0 ? submitRun({ score: this.finalScore, car: this.def.name, mult: +sc.topMult.toFixed(1), speed: Math.round(sc.topSpeed), date: Date.now() }) : 0;
  }

  /* --------------------------------------------- per-frame visuals */
  frame(realDt) {
    if (this.state === 'idle' || !this.player) return;
    const ph = this.phys, car = this.player, def = this.def, ud = car.userData;

    if (this.state === 'crash') {
      this.crashReal += realDt;
      this.timeScale = this.crashReal < 0.85 ? 0.2 : Math.min(1, 0.2 + (this.crashReal - 0.85) * 1.1);
      if (this.crashReal > 1.8 && !this.overShown) {
        this.overShown = true;
        this.onGameOver({ score: this.finalScore, distance: this.distance, nearMisses: this.nearMisses, best: this.best, record: this.isRecord, rank: this.rank, ...this.runStats });
      }
    }
    car.position.set(ph.x, 0, 0);
    car.rotation.y = -ph.heading;

    const playing = this.state === 'play';
    if (ud.steerWheels) for (const w of ud.steerWheels) w.rotation.y = (w.userData.baseY || 0) - (playing ? ph.wheelAngle * 4 : 0);
    if (ud.steeringWheel) ud.steeringWheel.rotation.z = playing ? -ph.steer * 2.2 : 0;
    const spin = (ph.speed * realDt * this.timeScale) / (ud.wheelR || 0.33);
    if (ud.wheels) for (const w of ud.wheels) (w.userData.spin || w).rotation.x -= spin * (w.userData.sign || 1);

    const speedFrac = clamp(ph.speed / (def.topSpeed / 3.6), 0, 1);
    // suspension: pitch with acceleration, roll with cornering, a little road buzz
    const body = ud.body;
    if (body) {
      const k = 1 - Math.exp(-realDt * 6);
      const pitch = playing ? clamp(ph.longAccel * 0.0045, -0.035, 0.025) : 0;
      const roll = playing ? clamp(ph.latAccel * 0.0045, -0.06, 0.06) : 0; // lean out of the turn
      body.rotation.x += (pitch - body.rotation.x) * k;
      body.rotation.z += (roll - body.rotation.z) * k;
      this.buzz = (this.buzz || 0) + realDt * this.timeScale;
      body.position.y = (body.userData.baseY || 0) + (Math.sin(this.buzz * 41) * 0.6 + Math.sin(this.buzz * 23.7) * 0.4) * 0.0025 * speedFrac;
    }
    const braking = playing && this.input.brake;
    if (ud.tail) ud.tail.emissiveIntensity = braking ? 4.5 : this.night ? 1.6 : 0.55; // smoked look by day until you brake
    this.rpm = this.engineRpm(speedFrac);
    if (ud.setGauges) ud.setGauges(ph.speed * 3.6, this.rpm);
    this.rig.update(realDt, car, speedFrac);
    const cockpit = this.rig.mode === 'first' && !this.rig.crash;
    if (cockpit !== this.cockpitHud) { this.cockpitHud = cockpit; document.getElementById('hud').classList.toggle('cockpit', cockpit); }
    this.world.update(this.camera, car, realDt);

    this.ui.hud({
      speed: ph.speed * 3.6,
      score: playing ? this.score : this.finalScore,
      best: Math.max(this.best, playing ? this.score : 0),
      mult: this.scoring.mult,
      hold: this.scoring.hold,
      fast: playing && ph.speed * 3.6 >= CONFIG.score.minSpeed,
      rpm: this.rpm,
      gear: Math.min(6, Math.floor(speedFrac * 6) + 1),
    });
    const slip = playing ? clamp((Math.abs(ph.slip) - CONFIG.grip.skidThreshold * 0.6) / 0.08, 0, 1) : this.state === 'crash' && ph.speed > 5 ? 0.8 : 0;
    this.audio.update(speedFrac, this.input.gas ? 1 : 0.35, playing || this.state === 'crash', { rpm: this.rpm, slip, scrape: this.scrape > 0 ? 1 : 0 });
  }

  // simple 6-speed ladder shared with the gauges
  engineRpm(f) {
    const g = Math.min(5, Math.floor(f * 6)), within = f * 6 - g;
    return 900 + (g === 0 ? 0.15 + within * 0.75 : 0.45 + within * 0.5) * 7100;
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.setSize(w, h);
  }

  render(realDt) {
    const cam = this.camera;
    this.fx.setScale(this.renderer.domElement.height * 0.5 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
    const sf = this.phys ? clamp(this.phys.speed / (this.def.topSpeed / 3.6), 0, 1) : 0;
    const blur = clamp((sf - 0.35) / 0.65, 0, 1);
    let haze = null, hazeAmt = 0;
    const ex = this.player && this.player.userData.exhaust;
    if (ex && this.rig.mode === 'third' && this.state === 'play') {
      this.v3.copy(ex).applyMatrix4(this.player.userData.body.matrixWorld).project(cam);
      if (this.v3.z < 1) { haze = this.hazeUv || (this.hazeUv = new THREE.Vector2()); haze.set(this.v3.x * 0.5 + 0.5, this.v3.y * 0.5 + 0.5); hazeAmt = 0.6 + (this.input.gas ? 0.4 : 0); }
    }
    // sun rays when the sun is on screen; crash grade while slowed down
    let sun = null, sunAmt = 0;
    this.v3.copy(cam.position).addScaledVector(SUN_DIR, 1000).project(cam);
    if (this.v3.z < 1 && !this.night) {
      sun = this.sunUv || (this.sunUv = new THREE.Vector2());
      sun.set(this.v3.x * 0.5 + 0.5, this.v3.y * 0.5 + 0.5);
      sunAmt = clamp(1.4 - Math.max(Math.abs(this.v3.x), Math.abs(this.v3.y)), 0, 1);
    }
    const crash = this.state === 'crash' ? Math.min(1, this.crashReal * 2.5) * (this.overShown ? 0.6 : 1) : 0;
    this.post.render(realDt || 0.016, { speed: blur * blur, lines: blur, haze, hazeAmt, sun, sunAmt, crash });
  }
}
