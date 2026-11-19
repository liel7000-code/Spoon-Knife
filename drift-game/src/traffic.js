// Pooled AI traffic. All traffic drives in the player's direction at one shared
// speed, so rows keep their spacing and the "free lane" guarantee always holds.
import * as THREE from 'three';
import { buildTraffic, TRAFFIC_TYPES } from './cars.js';

export const LANE_W = 3.6;
export const LANE_X = [-1.5, -0.5, 0.5, 1.5].map((v) => v * LANE_W);
export const SPAWN_Z = -280;
const DESPAWN_Z = 30;
const POOL = { sedan: 16, hatch: 10, van: 9, truck: 7 };
const PAINT = ['#f2f2ee', '#c3c7cc', '#1d1f23', '#22365e', '#8c1c1c', '#53606e', '#c9b99a', '#2f4d3a', '#e0e2e4', '#6b6f75'];
const CARGO = ['#e9e9e4', '#d8dde3', '#b9c4cf', '#e6dccb'];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

export class Traffic {
  constructor(scene) {
    this.items = [];
    for (const [type, n] of Object.entries(POOL)) {
      for (let i = 0; i < n; i++) {
        const mesh = buildTraffic(type);
        mesh.visible = false;
        scene.add(mesh);
        const { hw, hl } = TRAFFIC_TYPES[type];
        this.items.push({ type, mesh, hw, hl, active: false, x: 0, z: 0, spd: 0, vx: 0, yaw: 0, spinV: 0, crashed: false, minGap: Infinity, scored: false });
      }
    }
    this.speed = 20;
    this.reset();
  }

  reset() {
    for (const it of this.items) this.release(it);
    this.prevFree = (Math.random() * 4) | 0;
    this.acc = 0;
    this.speed = 72 / 3.6;
    // a few sparse rows already on the road so the start is not empty
    for (let z = -110; z > SPAWN_Z; z -= 48) this.spawnRow(z, 0);
    this.nextGap = 45;
  }

  release(it) {
    it.active = false; it.crashed = false; it.mesh.visible = false;
  }

  acquire(type) {
    for (const it of this.items) if (!it.active && it.type === type) return it;
    for (const it of this.items) if (!it.active && it.type !== 'truck') return it;
    return null;
  }

  pickType(d) {
    const r = Math.random();
    if (r < 0.09 + d * 0.08) return 'truck';
    if (r < 0.28 + d * 0.08) return 'van';
    if (r < 0.52) return 'hatch';
    return 'sedan';
  }

  // One row of traffic. `free` walks at most one lane per row, so a car that
  // follows it never needs more than one lane change between rows.
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
      it.active = true; it.crashed = false;
      it.lane = lane;
      it.x = LANE_X[lane] + rand(-0.2, 0.2);
      it.z = z - rand(0, 5);
      it.spd = this.speed; it.vx = 0; it.yaw = 0; it.spinV = 0;
      it.minGap = Infinity; it.scored = false;
      it.mesh.userData.paint.color.set(pick(PAINT));
      if (it.mesh.userData.cargo) it.mesh.userData.cargo.color.set(pick(CARGO));
      it.mesh.rotation.set(0, 0, 0);
      it.mesh.visible = true;
      it.mesh.position.set(it.x, 0, it.z);
    }
  }

  update(dt, playerSpeed, difficulty, spawning) {
    this.speed = (70 + difficulty * 28) / 3.6;
    for (const it of this.items) {
      if (!it.active) continue;
      if (it.crashed) {
        it.spd *= Math.exp(-1.6 * dt);
        it.yaw += it.spinV * dt; it.spinV *= Math.exp(-1.2 * dt);
        it.x += it.vx * dt; it.vx *= Math.exp(-2 * dt);
      } else {
        it.spd = this.speed;
      }
      it.z += (playerSpeed - it.spd) * dt;
      if (it.z > DESPAWN_Z || it.z < SPAWN_Z - 120) { this.release(it); continue; }
      it.mesh.position.set(it.x, 0, it.z);
      it.mesh.rotation.y = it.yaw;
      const w = it.mesh.userData.wheels, r = it.mesh.userData.wheelR;
      for (let i = 0; i < w.length; i++) w[i].rotation.x -= (it.spd * dt) / r;
    }
    if (!spawning) return;
    const rel = playerSpeed - this.speed;
    if (rel <= 0) return;
    this.acc += rel * dt;
    if (this.acc >= this.nextGap) {
      this.acc = 0;
      this.spawnRow(SPAWN_Z, difficulty);
      // spacing scales with closing speed so a lane change always fits between rows
      this.nextGap = 18 + rel * THREE.MathUtils.lerp(1.35, 0.8, difficulty) + rand(0, 10);
    }
  }
}
