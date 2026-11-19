// Pooled AI traffic. All traffic flows at one shared speed, so rows keep their
// spacing. Each row leaves a "free lane" that moves at most one lane per row.
// AI lane changes never enter a row's free lane, so the guarantee survives them.
import * as THREE from 'three';
import { buildTraffic, TRAFFIC_TYPES } from './trafficModels.js';
import { CONFIG } from './config.js';

export const LANE_W = 3.6;
export const LANE_X = [-1.5, -0.5, 0.5, 1.5].map((v) => v * LANE_W);
export const SPAWN_Z = -300;
const DESPAWN_Z = 40;
const POOL = { sedan: 14, hatch: 10, suv: 9, van: 8, truck: 6 };

const rand = (a, b) => a + Math.random() * (b - a);
const smooth = (t) => t * t * (3 - 2 * t);

export class Traffic {
  constructor(scene) {
    this.items = [];
    for (const [type, n] of Object.entries(POOL)) {
      for (let i = 0; i < n; i++) {
        const mesh = buildTraffic(type);
        mesh.visible = false;
        scene.add(mesh);
        const { hw, hl } = TRAFFIC_TYPES[type];
        this.items.push({
          type, mesh, hw, hl, active: false,
          x: 0, z: 0, yaw: 0, spd: 0, lane: 0, free: 0,
          lc: 0, lcFrom: 0, lcTo: 0, lcT: 0, signal: 0,
          jitter: 0, wobPhase: 0, wobFreq: 1, vx: 0, spinV: 0,
          crashed: false, minGap: Infinity, scored: false,
        });
      }
    }
    this.time = 0;
    this.reset();
  }

  reset() {
    for (const it of this.items) this.release(it);
    this.prevFree = (Math.random() * 4) | 0;
    this.acc = 0;
    this.speed = 72 / 3.6;
    for (let z = -110; z > SPAWN_Z; z -= 50) this.spawnRow(z, 0);
    this.nextGap = 45;
  }

  release(it) {
    it.active = false; it.crashed = false; it.mesh.visible = false;
    this.setIndicators(it, 0, false);
  }

  acquire(type) {
    for (const it of this.items) if (!it.active && it.type === type) return it;
    for (const it of this.items) if (!it.active && it.type !== 'truck') return it;
    return null;
  }

  pickType(d) {
    const r = Math.random();
    if (r < 0.08 + d * 0.08) return 'truck';
    if (r < 0.22 + d * 0.1) return 'van';
    if (r < 0.42 + d * 0.1) return 'suv';
    if (r < 0.66) return 'hatch';
    return 'sedan';
  }

  spawnRow(z, d) {
    const free = Math.max(0, Math.min(3, this.prevFree + ((Math.random() * 3) | 0) - 1));
    this.prevFree = free;
    let count = 1;
    if (Math.random() < 0.3 + d * 0.5) count++;
    if (Math.random() < d * 0.7) count++;
    const lanes = [0, 1, 2, 3].filter((l) => l !== free).sort(() => Math.random() - 0.5).slice(0, count);
    for (const lane of lanes) {
      const it = this.acquire(this.pickType(d));
      if (!it) continue;
      Object.assign(it, {
        active: true, crashed: false, lane, free, lc: 0, signal: 0,
        jitter: rand(-0.15, 0.15), wobPhase: rand(0, 6.28), wobFreq: rand(0.25, 0.6),
        z: z - rand(0, 5), spd: this.speed, vx: 0, yaw: 0, spinV: 0,
        minGap: Infinity, scored: false,
      });
      it.x = LANE_X[lane] + it.jitter;
      it.mesh.userData.recolor();
      it.mesh.rotation.set(0, 0, 0);
      it.mesh.position.set(it.x, 0, it.z);
      it.mesh.visible = true;
    }
  }

  setIndicators(it, dir, on) {
    const ud = it.mesh.userData;
    if (!ud.indLMesh) return;
    // hidden when off: no draw call for the indicators of cars that are not signalling
    ud.indLMesh.visible = on && dir < 0;
    ud.indRMesh.visible = on && dir > 0;
  }

  // a car may move into `to` if it is not its row's free lane and nobody is nearby
  laneClear(it, to) {
    if (to < 0 || to > 3 || to === it.free) return false;
    for (const o of this.items) {
      if (o === it || !o.active) continue;
      const occupies = o.lane === to || (o.lc && o.lcTo === to);
      if (occupies && Math.abs(o.z - it.z) < it.hl + o.hl + 10) return false;
    }
    return true;
  }

  update(dt, playerForward, difficulty, spawning) {
    const T = CONFIG.traffic;
    this.time += dt;
    this.speed = (70 + difficulty * 28) / 3.6;
    const blink = (this.time % 0.7) < 0.38;
    for (const it of this.items) {
      if (!it.active) continue;
      const px = it.x;
      if (it.crashed) {
        it.spd *= Math.exp(-1.6 * dt);
        it.yaw += it.spinV * dt; it.spinV *= Math.exp(-1.2 * dt);
        it.x += it.vx * dt; it.vx *= Math.exp(-2 * dt);
      } else {
        it.spd = this.speed;
        // occasional lane change: signal first, then drift across smoothly
        if (!it.lc && spawning && it.z < -40 && Math.random() < (T.laneChangeChance + difficulty * 0.04) * dt) {
          const dir = Math.random() < 0.5 ? -1 : 1;
          const to = this.laneClear(it, it.lane + dir) ? it.lane + dir : this.laneClear(it, it.lane - dir) ? it.lane - dir : -1;
          if (to >= 0) { it.lc = 1; it.lcFrom = it.lane; it.lcTo = to; it.signal = T.signalTime; it.lcT = 0; }
        }
        let laneX = LANE_X[it.lane];
        if (it.lc === 1) {
          it.signal -= dt;
          if (it.signal <= 0) it.lc = 2;
        }
        if (it.lc === 2) {
          it.lcT += dt / T.changeTime;
          laneX = THREE.MathUtils.lerp(LANE_X[it.lcFrom], LANE_X[it.lcTo], smooth(Math.min(1, it.lcT)));
          if (it.lcT >= 1) { it.lane = it.lcTo; it.lc = 0; it.lcT = 0; }
        }
        this.setIndicators(it, it.lcTo - it.lcFrom, it.lc > 0 && blink);
        const wob = Math.sin(this.time * it.wobFreq + it.wobPhase) * T.wobble;
        it.x = laneX + it.jitter + wob;
        // nose follows the sideways motion (rotation.y < 0 points the nose right)
        const sideV = (it.x - px) / dt;
        it.yaw += (-Math.atan2(sideV, Math.max(1, it.spd)) - it.yaw) * Math.min(1, dt * 6);
      }
      it.z += (playerForward - it.spd) * dt;
      if (it.z > DESPAWN_Z || it.z < SPAWN_Z - 140) { this.release(it); continue; }
      it.mesh.position.set(it.x, 0, it.z);
      it.mesh.rotation.y = it.yaw;
    }
    if (!spawning) return;
    const rel = playerForward - this.speed;
    if (rel <= 0) return;
    this.acc += rel * dt;
    if (this.acc >= this.nextGap) {
      this.acc = 0;
      this.spawnRow(SPAWN_Z, difficulty);
      // a full lane change at speed takes ~1.3 s, so rows arrive at least ~1.6 s apart
      this.nextGap = 24 + rel * THREE.MathUtils.lerp(1.6, 1.38, difficulty) + rand(0, 10);
    }
  }
}
