// Drift mode: a free-roaming car on a closed track (the highway mode keeps the car at
// z = 0 and scrolls the world; here everything lives in world space).
// update(dt) runs on the shared fixed timestep (120 Hz); frame()/render() run per frame.
import * as THREE from 'three';
import { buildPlayerCar, PLAYER_CARS } from '../cars.js';
import { maxAnisotropy } from '../parts.js';
import { Post } from '../post.js';
import { tuningFor, DRIFT } from '../config.js';
import { DriftPhysics } from './driftPhysics.js';
import { Track } from './track.js';
import { THEMES } from './scenery.js';
import { DriftFx } from './driftFx.js';
import { DriftScoring, gradeFor, bestKey, saveBest, loadBests } from './driftScoring.js';
import { Recorder, sample, durationOf, loadGhost, saveGhost, ghostify, tvCameras } from './ghost.js';
import { TRACKS, SESSIONS } from './trackData.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const V = new THREE.Vector3(), V2 = new THREE.Vector3(), Q = new THREE.Quaternion();
const vibrate = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* not supported */ } };

export class DriftGame {
  constructor(renderer, { ui, audio, input, quality, onFinish }) {
    this.renderer = renderer;
    this.ui = ui; this.audio = audio; this.input = input; this.onFinish = onFinish;
    this.quality = quality;
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2400);
    this.state = 'idle';
    this.timeScale = 1;
    this.trackIndex = -1;
    this.q = {}; this.cq = {};
    this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3(); this.camYaw = 0;
    this.camMode = 'third';
    this.recorder = new Recorder();
  }

  /* --------------------------------------------------------- track */
  load(index) {
    if (index === this.trackIndex && this.scene) return;
    if (this.track) { this.track.dispose(); }
    const def = TRACKS[index];
    const scene = (this.scene = new THREE.Scene());
    const ctx = (this.ctx = { quality: this.quality, renderer: this.renderer, lightDir: new THREE.Vector3(0, 1, 0), exposure: 1, night: false });
    const track = (this.track = new Track(def, this.quality));
    const finish = THEMES[def.theme](track, scene, ctx); // adds lamps (baked into the road)
    track.buildSurface(this.renderer.capabilities.getMaxAnisotropy());
    this.scatter = finish();
    scene.add(track.group);
    // sun/moon: shadows from the car only, the shadow box follows the car
    const sun = (this.sun = ctx.sun);
    sun.shadow.camera.left = -12; sun.shadow.camera.right = 12; sun.shadow.camera.top = 12; sun.shadow.camera.bottom = -12;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 80; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
    // the two street lamps nearest the car light it for real (cheap, fixed count: no shader recompiles)
    this.lampLights = [0, 1].map(() => { const l = new THREE.PointLight(ctx.lampColor || '#ffb06a', 0, 30, 1.6); scene.add(l); return l; });
    this.flash = [0, 1].map(() => { const l = new THREE.PointLight('#ff8a2a', 0, 7, 2); scene.add(l); return l; });
    this.fx = new DriftFx(scene, this.quality);
    this.fx.setSmokeColor(ctx.night ? '#9fa3ad' : '#e2dcd4');
    // one post chain for all tracks: only the scene it renders is swapped
    if (!this.post) this.post = new Post(this.renderer, scene, this.camera);
    this.post.scene = scene; this.post.composer.passes[0].scene = scene; this.post.ao.scene = scene;
    this.post.setQuality(this.quality);
    this.tv = tvCameras(track);
    this.trackIndex = index;
    this.def = def;
    this.setQuality(this.quality);
    const s = this.renderer.getSize(new THREE.Vector2());
    this.resize(s.x, s.y);
  }

  /* ----------------------------------------------------- lifecycle */
  start({ carIndex, color, style, trackIndex, session, assist, cam }) {
    this.load(trackIndex);
    const carDef = (this.carDef = PLAYER_CARS[carIndex]);
    this.session = session; this.sessionDef = SESSIONS[session];
    this.carColor = color; this.carStyle = style;
    if (this.player) this.scene.remove(this.player);
    this.player = buildPlayerCar(carDef, color, style);
    this.player.traverse((o) => { if (o.isMesh && !o.userData.blob) o.castShadow = true; });
    maxAnisotropy(this.player, this.renderer);
    this.scene.add(this.player);
    // headlights on the night tracks
    const head = (this.headlight = new THREE.SpotLight('#fff0d0', this.ctx.night ? 260 : 0, 70, 0.5, 0.5, 1.4));
    head.position.set(0, 0.62, -carDef.length / 2 + 0.2); head.target.position.set(0, -1, -25);
    this.player.userData.body.add(head, head.target);
    this.ph = new DriftPhysics(carDef);
    this.ph.assist = assist;
    this.tune = tuningFor(carDef.id);
    this.audio.setProfile && this.audio.setProfile(this.tune);
    const sp = this.track.spawn(14);
    this.ph.reset(sp.x, sp.z, sp.yaw, sp.y);
    this.hint = sp.i;
    this.scoring = new DriftScoring((k, p, x) => this.onScore(k, p, x));
    this.fx.reset();
    this.time = 0; this.lap = 0; this.lapT = 0; this.bestLap = null; this.laps = [];
    this.half = false; this.prevS = this.track.query(sp.x, sp.z, sp.i).s;
    this.clipsHit = new Set(); for (const c of this.track.clips) this.track.setClipHit(c.id, false);
    this.stuck = 0; this.wrong = 0; this.scrape = 0; this.flameT = 0; this.prevGas = false; this.lastHit = 0;
    this.recorder.reset();
    // ghost: best lap on this track (time trial)
    if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null; }
    this.ghostData = session === 'trial' ? loadGhost(this.def.id) : null;
    if (this.ghostData) {
      const gi = Math.max(0, PLAYER_CARS.findIndex((c) => c.id === this.ghostData.car));
      this.ghost = ghostify(buildPlayerCar(PLAYER_CARS[gi], '#ffffff', 'stock'));
      this.ghost.visible = false;
      this.scene.add(this.ghost);
    }
    this.ghostT = 0;
    this.camMode = cam === 'first' ? 'first' : cam === 'bumper' ? 'bumper' : 'third';
    this.snapCam = true;
    this.countdown = 3.4;
    this.state = 'countdown';
    this.timeScale = 1;
    this.ui.minimap(this.track.minimap(110));
    this.bestRec = loadBests()[bestKey(this.def.id, carDef.id, session)] || null;
    this.ui.reset({ session, bestScore: this.bestRec ? this.bestRec.score || 0 : 0, bestLap: this.bestRec && this.bestRec.lap });
  }

  stop() { this.state = 'idle'; }
  pause() { if (this.state === 'play' || this.state === 'countdown') { this.resumeTo = this.state; this.state = 'paused'; } }
  resume() { if (this.state === 'paused') this.state = this.resumeTo || 'play'; }

  setAssist(a) { if (this.ph) this.ph.assist = a; }
  toggleCamera() { const o = ['third', 'bumper', 'first']; this.camMode = o[(o.indexOf(this.camMode) + 1) % o.length]; this.snapCam = true; return this.camMode; }

  setQuality(q) {
    this.quality = q;
    if (!this.scene) return;
    const r = this.renderer;
    if (r.shadowMap.enabled !== q.shadows) { r.shadowMap.enabled = q.shadows; this.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); }); }
    this.sun.castShadow = q.shadows;
    const size = Math.min(2048, q.shadowSize || 1024);
    if (q.shadows && this.sun.shadow.mapSize.x !== size) { this.sun.shadow.mapSize.set(size, size); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
    this.post.setQuality(q);
    this.fx.setQuality(q);
  }

  resize(w, h) {
    this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix();
    if (this.post) { this.post.setSize(w, h); }
  }

  /* -------------------------------------------------- fixed step */
  update(dt) {
    if (!this.ph || this.state === 'idle' || this.state === 'paused' || this.state === 'done' || this.state === 'replay') return;
    const ph = this.ph, inp = this.input, T = this.track;
    if (this.state === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) { this.state = 'play'; this.ui.popup('GO!', 'go'); }
      return;
    }
    this.time += dt; this.lapT += dt;
    if (inp.kickPending) { inp.kickPending = false; if (ph.speed > 4) { ph.clutchKick(); this.ui.feed('CLUTCH KICK', 'kick'); } }
    if (inp.resetPending) { inp.resetPending = false; this.respawn(); }
    const st = inp.steering();
    const q = T.query(ph.x, ph.z, this.hint, this.q); this.hint = q.i;
    const onRoad = Math.abs(q.lat) < T.width / 2 + 0.9;
    ph.step(dt, { steer: st.target, analog: st.analog, gas: inp.gas, brake: inp.brake, hand: inp.hand }, { grip: onRoad ? 1 : DRIFT.offroadGrip, drag: onRoad ? 0 : DRIFT.offroadDrag, slope: q.slope });
    this.walls(dt);
    const q2 = T.query(ph.x, ph.z, this.hint, this.q); this.hint = q2.i;
    ph.y = q2.y;
    this.progress(q2);
    const kmh = ph.speed * 3.6, beta = ph.beta;
    this.scoring.tick(dt, beta, kmh, this.proximity);
    this.clips(q2);
    // stuck / wrong way / respawn
    const fwd = -Math.sin(ph.yaw) * q2.tx - Math.cos(ph.yaw) * q2.tz;
    this.wrong = fwd < -0.4 && ph.speed > 4 ? this.wrong + dt : 0;
    if (this.wrong > 2.5) { this.ui.popup('WRONG WAY', 'bad'); this.wrong = -3; }
    this.stuck = ph.speed < 1.2 && (inp.gas || inp.brake) ? this.stuck + dt : 0;
    if (this.stuck > 3.5) this.respawn();
    // session end conditions
    if (this.session === 'attack' && this.time >= this.sessionDef.time) this.finish();
    // recording, ghost, effects
    const slipK = this.slipAmount();
    this.recorder.tick(dt, ph, slipK);
    this.ghostT += dt;
    this.tyres(dt, slipK);
    this.exhaustFx(dt);
    this.fx.update(dt);
    if (this.scrape > 0) this.scrape -= dt;
  }

  slipAmount() {
    const ph = this.ph;
    if (ph.speed < 3) return 0;
    const lat = clamp((Math.abs(ph.rearSlip) - 0.1) / 0.3, 0, 1);
    const spin = clamp(ph.wheelSpin / 6, 0, 1) * (ph.throttle > 0.5 ? 1 : 0);
    const hand = ph.hand && ph.speed > 4 ? 0.8 : 0;
    return Math.max(lat, spin, hand);
  }

  // car corners against the walls (offset curves either side of the centre line)
  walls() {
    const ph = this.ph, T = this.track, def = this.carDef;
    const hl = def.length / 2 - 0.12, hw = def.width / 2 - 0.06;
    const s = Math.sin(ph.yaw), c = Math.cos(ph.yaw);
    let worst = 0, prox = Infinity;
    for (const [lx, lz] of [[-hw, -hl], [hw, -hl], [-hw, hl], [hw, hl]]) {
      // local (lx, lz) -> world, rotation.y = yaw
      const x = ph.x + lx * c + lz * s, z = ph.z - lx * s + lz * c;
      const q = T.query(x, z, this.hint, this.cq);
      let depth = 0, nx = 0, nz = 0;
      if (q.lat > q.wallL) { depth = q.lat - q.wallL; nx = -q.nx; nz = -q.nz; }
      else if (q.lat < -q.wallR) { depth = -q.wallR - q.lat; nx = q.nx; nz = q.nz; }
      if (lz > 0) prox = Math.min(prox, Math.min(q.wallL - q.lat, q.wallR + q.lat));
      if (depth > 0) {
        const hit = ph.collide(nx, nz, depth + 0.002, x, z);
        worst = Math.max(worst, hit);
        this.scrape = 0.12;
        if (Math.random() < 0.7) this.fx.spark(x, ph.y + 0.4, z, 3, 3);
      }
    }
    this.proximity = prox;
    if (worst > 0 && this.time - this.lastHit > 0.35) {
      if (this.scoring.wall(worst)) {
        this.lastHit = this.time;
        this.audio.hit && this.audio.hit(Math.min(1, worst / 10));
        vibrate(worst > 7 ? 90 : 45);
        this.fx.spark(ph.x, ph.y + 0.5, ph.z, 24, 6);
        this.rigShake = Math.min(1, worst / 8);
      }
    }
  }

  // laps: the line is at s = 0; a lap counts only after passing the far side of the track
  progress(q) {
    const L = this.track.length;
    if (q.s > L * 0.4 && q.s < L * 0.6) this.half = true;
    if (this.prevS > L * 0.8 && q.s < L * 0.2) {
      if (this.lap === 0) { this.recorder.markLap(); this.lapT = 0; this.lap = 1; this.half = false; this.ghostT = 0; } // flying start
      else if (this.half) this.completeLap();
    }
    if (this.prevS < L * 0.2 && q.s > L * 0.8) this.half = false; // reversed over the line
    this.prevS = q.s;
  }

  completeLap() {
    const t = this.lapT;
    this.laps.push(t);
    const best = this.bestLap == null || t < this.bestLap;
    if (best) this.bestLap = t;
    this.ui.popup(`LAP ${this.lap}  ${fmtTime(t)}`, best ? 'good' : 'info');
    // ghost: keep the fastest lap on this track
    const old = loadGhost(this.def.id);
    if (!old || t < old.lap) saveGhost(this.def.id, { car: this.carDef.id, lap: t, data: this.recorder.lapFrames() });
    this.recorder.markLap();
    this.ghostT = 0;
    this.lap++; this.lapT = 0; this.half = false;
    this.clipsHit.clear(); for (const c of this.track.clips) this.track.setClipHit(c.id, false);
    if (this.session === 'trial' && this.laps.length >= this.sessionDef.laps) this.finish();
  }

  clips(q) {
    const sc = this.scoring;
    if (!sc.active) return;
    const T = this.track, ph = this.ph, w = T.width / 2, def = this.carDef;
    const s = Math.sin(ph.yaw), c = Math.cos(ph.yaw);
    for (const cl of T.clips) {
      if (this.clipsHit.has(cl.id)) continue;
      if (cl.type === 'zone') {
        // rear bumper inside the band along the outer edge
        const L = T.length, s0 = cl.s0, s1 = cl.s1 >= s0 ? cl.s1 : cl.s1 + L, ss = q.s < s0 - 5 ? q.s + L : q.s;
        if (ss < s0 || ss > s1) continue;
        for (const lx of [-def.width / 2, def.width / 2]) {
          const x = ph.x + lx * c + (def.length / 2) * s, z = ph.z - lx * s + (def.length / 2) * c;
          const cq = T.query(x, z, this.hint, this.cq);
          const d = cl.side * cq.lat;
          if (d > w - 2.8) { this.hitClip(cl); break; }
        }
      } else {
        let ds = Math.abs(q.s - cl.s); ds = Math.min(ds, T.length - ds);
        if (ds > 6) continue;
        // front bumper (or the car) close to the inner edge
        for (const lz of [-def.length / 2, 0]) {
          const x = ph.x + lz * s, z = ph.z + lz * c;
          const cq = T.query(x, z, this.hint, this.cq);
          if (cl.side * cq.lat > w - 2.4) { this.hitClip(cl); break; }
        }
      }
    }
  }

  hitClip(cl) {
    this.clipsHit.add(cl.id);
    this.track.setClipHit(cl.id, true);
    this.scoring.clip(cl.type);
  }

  respawn() {
    const T = this.track, i = this.hint;
    const p = T.at(i, 0);
    this.ph.reset(p.x, p.z, Math.atan2(-T.tx[i], -T.tz[i]), p.y);
    if (this.scoring.active) this.scoring.lose('reset');
    this.stuck = 0; this.snapCam = true;
    this.ui.popup('RESET', 'info');
  }

  onScore(kind, pts, extra) {
    const f = (n) => Math.round(n).toLocaleString('en-US');
    if (kind === 'bank') {
      if (pts >= 2500) this.ui.popup(pts >= 15000 ? `INSANE DRIFT! +${f(pts)}` : pts >= 7000 ? `GREAT DRIFT! +${f(pts)}` : `NICE DRIFT +${f(pts)}`, 'good');
      else if (pts > 0) this.ui.feed(`+${f(pts)}`, 'ok');
    } else if (kind === 'lose') {
      const label = extra === 'wall' ? 'WALL HIT!' : extra === 'spin' ? 'SPUN OUT!' : 'COMBO LOST';
      this.ui.popup(pts > 0 ? `${label}  −${f(pts)}` : label, 'bad');
      if (pts > 0 || extra !== 'reset') vibrate(extra === 'wall' ? 0 : 60);
    } else if (kind === 'clip') this.ui.popup(`${extra === 'zone' ? 'CLIP ZONE' : 'CLIP POINT'} +${f(pts)}`, 'clip');
    else if (kind === 'link') this.ui.feed(`LINK ×${pts.toFixed(1)}`, 'link');
    else if (kind === 'long') this.ui.feed(`LONG DRIFT +${f(pts)}`, 'ok');
    else if (kind === 'proximity') this.ui.feed(`PROXIMITY +${f(pts)}`, 'prox');
    else if (kind === '360') this.ui.popup(`360°! +${f(pts)}`, 'clip');
  }

  // rear tyre smoke + skid marks (front marks too when the fronts scrub)
  tyres(dt, k) {
    const ph = this.ph, def = this.carDef;
    const s = Math.sin(ph.yaw), c = Math.cos(ph.yaw);
    const rz = def.length * 0.3, tx = def.width / 2 - 0.15;
    const vx = ph.vx, vz = ph.vz;
    [-1, 1].forEach((side, w) => {
      const lx = side * tx;
      const x = ph.x + lx * c + rz * s, z = ph.z - lx * s + rz * c;
      const on = k > 0.08;
      this.fx.skid(w, x, ph.y, z, on, k);
      if (on && this.state === 'play') this.fx.puff(x, ph.y, z, k, vx, vz, dt);
    });
  }

  // backfire flames on lift-off from high revs
  exhaustFx(dt) {
    const ph = this.ph, ud = this.player.userData;
    const tips = ud.exhausts || (ud.exhaust ? [ud.exhaust] : []);
    const gas = this.input.gas;
    if (this.prevGas && !gas && ph.rpm > 5000) this.flameT = rand(0.3, 0.6) * this.tune.flameTime;
    if (this.input.hand && !this.prevHand && ph.speed > 12) this.flameT = Math.max(this.flameT, 0.25);
    this.prevGas = gas; this.prevHand = this.input.hand;
    const s = Math.sin(ph.yaw), c = Math.cos(ph.yaw), by = ud.body ? ud.body.position.y : 0;
    let flash = 0;
    if (tips.length && this.flameT > 0 && Math.random() < 0.55) {
      tips.forEach((t, i) => {
        const x = ph.x + t.x * c + t.z * s, z = ph.z - t.x * s + t.z * c, y = ph.y + t.y + by;
        this.fx.flame(x, y, z, s, c, ph.vx, ph.vz, (0.8 + this.flameT) * this.tune.flames, this.tune.flames);
        if (this.flash[i]) this.flash[i].position.set(x + s * 0.3, y + 0.1, z + c * 0.3);
        flash = 1;
      });
    }
    if (this.flameT > 0) this.flameT -= dt;
    for (const l of this.flash) l.intensity = flash ? rand(6, 14) : l.intensity * Math.exp(-dt * 30);
  }

  finish() {
    if (this.state === 'done') return;
    this.state = 'done';
    const score = this.scoring.finish();
    const stats = this.scoring.stats;
    const trackDef = this.def, carId = this.carDef.id;
    const grade = gradeFor(trackDef, this.session, { score, seconds: this.time, bestLap: this.bestLap });
    const rec = this.session === 'trial' ? { lap: this.bestLap, score } : { score };
    const key = bestKey(trackDef.id, carId, this.session);
    const record = (this.session === 'trial' ? this.bestLap != null : score > 0) && saveBest(key, rec);
    const best = loadBests()[key] || rec;
    this.replayData = this.recorder.data.slice();
    this.onFinish({ track: trackDef, session: this.session, car: this.carDef, score, grade, record, best, stats, time: this.time, laps: this.laps.slice(), bestLap: this.bestLap });
  }

  /* --------------------------------------------------- per frame */
  frame(realDt) {
    if (!this.ph || this.state === 'idle') return;
    const ph = this.ph, car = this.player, ud = car.userData;
    let pose = ph;
    if (this.state === 'replay') pose = this.replayFrame(realDt);
    car.position.set(pose.x, pose.y, pose.z);
    car.rotation.y = pose.yaw;
    // slope: pitch the whole car with the road
    const pitch = Math.atan(this.q.slope || 0);
    car.quaternion.setFromEuler(this.eul || (this.eul = new THREE.Euler()).set(0, pose.yaw, 0));
    Q.setFromAxisAngle(V.set(Math.cos(pose.yaw), 0, -Math.sin(pose.yaw)), pitch * 0.9);
    car.quaternion.premultiply(Q);
    const playing = this.state === 'play' || this.state === 'countdown';
    const delta = this.state === 'replay' ? pose.delta : ph.delta;
    if (ud.steerWheels) for (const w of ud.steerWheels) w.rotation.y = (w.userData.baseY || 0) + delta;
    if (ud.steeringWheel) ud.steeringWheel.rotation.z = delta * 4;
    const sp = this.state === 'replay' ? pose.speed : ph.u;
    const rimR = ud.wheelR || 0.33;
    if (ud.wheels) ud.wheels.forEach((w, i) => {
      const extra = i >= 2 && this.state !== 'replay' ? ph.wheelSpin : 0;
      (w.userData.spin || w).rotation.x -= ((sp + extra) * realDt * this.timeScale / rimR) * (w.userData.sign || 1);
    });
    // body roll / pitch from the accelerations
    const body = ud.body;
    if (body && this.state !== 'replay') {
      const k = 1 - Math.exp(-realDt * 7);
      body.rotation.x += (clamp(ph.ax * 0.006, -0.05, 0.04) - body.rotation.x) * k;
      body.rotation.z += (clamp(-ph.ay * 0.0065, -0.075, 0.075) - body.rotation.z) * k;
    }
    if (ud.tail) ud.tail.emissiveIntensity = playing && this.input.brake ? 4.5 : this.ctx.night ? 1.6 : 0.55;
    if (ud.setGauges) ud.setGauges(ph.speed * 3.6, ph.rpm);
    // ghost
    if (this.ghost && this.ghostData && this.state === 'play' && this.lap >= 1) {
      const g = sample(this.ghostData.data, this.ghostT, this.gs || (this.gs = {}));
      this.ghost.visible = !!g && !g.done && Math.hypot(g.x - ph.x, g.z - ph.z) > 3;
      if (g) { this.ghost.position.set(g.x, g.y, g.z); this.ghost.rotation.y = g.yaw; }
    } else if (this.ghost) this.ghost.visible = false;
    this.cameraUpdate(realDt, pose);
    // lights follow the car: shadow box, nearest lamps
    this.sun.target.position.set(pose.x, pose.y, pose.z);
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.ctx.lightDir, 40);
    this.lampT = (this.lampT || 0) - realDt;
    if (this.lampT <= 0 && this.ctx.night) {
      this.lampT = 0.15;
      const ls = this.track.lamps.filter((l) => l.radius > 12);
      let a = null, b = null, da = Infinity, db = Infinity;
      for (const l of ls) { const d = (l.x - pose.x) ** 2 + (l.z - pose.z) ** 2; if (d < da) { b = a; db = da; a = l; da = d; } else if (d < db) { b = l; db = d; } }
      [a, b].forEach((l, i) => { const L = this.lampLights[i]; if (l) { L.position.set(l.x, l.y - 0.4, l.z); L.color.copy(l.color); L.intensity = 90 * l.power; L.distance = l.radius * 1.3; } else L.intensity = 0; });
    }
    if (this.ctx.sky) this.ctx.sky.position.copy(this.camera.position);
    if (this.scatter) this.scatter.update(this.camera.position);
    // start lights
    if (this.track.startLights) {
      const n = this.state === 'countdown' ? Math.min(5, Math.floor((3.4 - this.countdown) / 0.6) + 1) : 0;
      this.track.startLights.forEach((l, i) => l.material.color.set(i < n ? '#ff2a1a' : this.state === 'play' && this.time < 1.5 ? '#2bff6a' : '#330606'));
    }
    // HUD + audio
    if (this.state !== 'replay') {
      const kmh = ph.speed * 3.6, sc = this.scoring;
      this.ui.hud({
        score: sc.total, chain: sc.live, active: sc.active, mult: sc.mult, angle: sc.angle, kmh, gear: ph.gear, rpm: ph.rpm,
        time: this.session === 'attack' ? Math.max(0, this.sessionDef.time - this.time) : this.session === 'trial' ? this.lapT : this.time,
        lap: this.session === 'trial' ? Math.min(this.lap, this.sessionDef.laps) : this.lap, laps: this.session === 'trial' ? this.sessionDef.laps : 0,
        bestLap: this.bestLap, countdown: this.state === 'countdown' ? this.countdown : 0,
        hand: this.input.hand, x: pose.x, z: pose.z,
        ghost: this.ghost && this.ghost.visible ? this.ghost.position : null,
      });
      const slip = this.slipAmount(), cd = this.state === 'countdown';
      const rpm = cd ? (this.input.gas ? 6800 : 1000) : ph.rpm, thr = cd ? (this.input.gas ? 1 : 0.2) : ph.throttle;
      this.audio.update(clamp(ph.speed / 60, 0, 1), playing ? thr : 0, playing, { rpm, slip: this.state === 'play' ? slip : 0, scrape: this.scrape > 0 ? 1 : 0 });
    } else this.audio.update(0, 0, false, {});
  }

  cameraUpdate(dt, pose) {
    const cam = this.camera, ph = this.ph, car = this.player;
    let fov = 60;
    if (this.state === 'replay') { this.tvCamera(dt, pose); return; }
    car.updateMatrixWorld();
    const travel = ph.speed > 3 ? ph.yaw + ph.beta : ph.yaw;
    if (this.camMode === 'third') {
      // chase camera that swings partly towards the direction of travel, so the drift angle shows
      const target = ph.yaw + clamp(ph.beta, -1.2, 1.2) * 0.55;
      let d = target - this.camYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.camYaw = this.snapCam ? target : this.camYaw + d * (1 - Math.exp(-dt * 4.5));
      const dist = 6.4 + clamp(ph.speed / 40, 0, 1) * 1.2, hgt = 2.45;
      V.set(pose.x + Math.sin(this.camYaw) * dist, pose.y + hgt, pose.z + Math.cos(this.camYaw) * dist);
      V2.set(pose.x - Math.sin(this.camYaw) * 4, pose.y + 0.9, pose.z - Math.cos(this.camYaw) * 4);
      const k = this.snapCam ? 1 : 1 - Math.exp(-dt * 10);
      this.camPos.lerp(V, k); this.camLook.lerp(V2, k);
      // stay above the road on slopes
      cam.position.copy(this.camPos);
      cam.up.set(0, 1, 0);
      cam.lookAt(this.camLook);
      fov = 58 + clamp(ph.speed / 50, 0, 1) * 12;
    } else {
      const frame = car.userData.body || car;
      const len = this.carDef.length;
      if (this.camMode === 'bumper') { V.set(0, 0.62, -len / 2 - 0.05); V2.set(0, 0.5, -len / 2 - 30); fov = 70; }
      else { const e = car.userData.eye; V.copy(e); V2.set(e.x, e.y - 0.3, e.z - 14); fov = 66; }
      cam.position.copy(V.applyMatrix4(frame.matrixWorld));
      cam.up.set(0, 1, 0).applyQuaternion(frame.getWorldQuaternion(Q));
      cam.lookAt(V2.applyMatrix4(frame.matrixWorld));
      this.camYaw = travel;
    }
    if (this.state === 'countdown' && this.countdown > 1.4) {
      // intro orbit while the lights come on
      const t = clamp((3.4 - this.countdown) / 2, 0, 1), a = pose.yaw + Math.PI * (0.8 - t * 0.8) + 0.4;
      const e = 1 - Math.pow(1 - t, 3);
      V.set(pose.x + Math.sin(a) * 7, pose.y + 1.6, pose.z + Math.cos(a) * 7);
      cam.position.lerpVectors(V, cam.position, e);
      cam.lookAt(pose.x, pose.y + 0.6, pose.z);
    }
    if (this.rigShake > 0.01) {
      cam.position.x += (Math.random() - 0.5) * this.rigShake * 0.3;
      cam.position.y += (Math.random() - 0.5) * this.rigShake * 0.3;
      this.rigShake *= Math.exp(-dt * 5);
    }
    this.snapCam = false;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * (1 - Math.exp(-dt * 4)); cam.updateProjectionMatrix(); }
  }

  /* ------------------------------------------------------- replay */
  startReplay() {
    if (!this.replayData || this.replayData.length < 14) return false;
    this.state = 'replay';
    this.replayT = 0; this.replayCam = null;
    this.fx.reset();
    if (this.ghost) this.ghost.visible = false;
    return true;
  }
  stopReplay() { this.state = 'done'; }

  replayFrame(dt) {
    this.replayT += dt;
    const p = sample(this.replayData, this.replayT, this.rp || (this.rp = {}));
    if (p.done) this.replayT = 0; // loop
    // smoke and marks from the recorded slip
    if (p.slip > 0.08) {
      const s = Math.sin(p.yaw), c = Math.cos(p.yaw), rz = this.carDef.length * 0.3, tx = this.carDef.width / 2 - 0.15;
      [-1, 1].forEach((side, w) => {
        const lx = side * tx, x = p.x + lx * c + rz * s, z = p.z - lx * s + rz * c;
        this.fx.puff(x, p.y, z, p.slip, 0, 0, dt);
        this.fx.skid(w, x, p.y, z, true, p.slip);
      });
    } else { this.fx.skid(0, 0, 0, 0, false, 0); this.fx.skid(1, 0, 0, 0, false, 0); }
    this.fx.update(dt);
    this.ui.replayTime(this.replayT, durationOf(this.replayData));
    return p;
  }

  tvCamera(dt, p) {
    const cam = this.camera;
    // nearest trackside camera, switching only when another one is clearly closer
    let best = this.replayCam, bd = best ? best.p.distanceTo(V.set(p.x, p.y, p.z)) : Infinity;
    for (const c of this.tv) { const d = c.p.distanceTo(V.set(p.x, p.y, p.z)); if (d < bd * 0.7) { bd = d; best = c; } }
    this.replayCam = best;
    cam.position.copy(best.p);
    cam.up.set(0, 1, 0);
    cam.lookAt(p.x, p.y + 0.7, p.z);
    const fov = clamp((2 * Math.atan(5.5 / Math.max(bd, 1)) * 180) / Math.PI, 10, 55);
    cam.fov += (fov - cam.fov) * (1 - Math.exp(-dt * 3)); cam.updateProjectionMatrix();
  }

  render(realDt) {
    if (!this.post) return;
    const cam = this.camera;
    this.fx.setScale((this.renderer.domElement.height * 0.5) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
    this.renderer.toneMappingExposure = this.ctx.exposure;
    const sf = this.ph ? clamp((this.ph.speed - 20) / 30, 0, 1) : 0;
    let sun = null, sunAmt = 0;
    if (!this.ctx.night && this.ctx.sunDir) {
      V.copy(cam.position).addScaledVector(this.ctx.sunDir, 1000).project(cam);
      if (V.z < 1) { sun = this.sunUv || (this.sunUv = new THREE.Vector2()); sun.set(V.x * 0.5 + 0.5, V.y * 0.5 + 0.5); sunAmt = clamp(1.4 - Math.max(Math.abs(V.x), Math.abs(V.y)), 0, 1) * 0.6; }
    }
    this.post.render(realDt || 0.016, { speed: this.state === 'replay' ? 0 : sf * sf * 0.35, lines: 0, sun, sunAmt, crash: 0 });
  }
}

export function fmtTime(t) {
  if (t == null) return '--:--.--';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}
