// Ghost car and instant replay. Runs are recorded at 20 Hz (position, yaw, steer, slip)
// into flat arrays; the best lap on each track is stored in localStorage and raced as a
// translucent ghost; the last run can be watched back from TV-style trackside cameras.
import * as THREE from 'three';

export const REC_HZ = 20;
const STRIDE = 7; // x, y, z, yaw, delta, slip(0..1), speed

export class Recorder {
  constructor(maxSeconds = 600) { this.max = maxSeconds * REC_HZ * STRIDE; this.reset(); }
  reset() { this.data = []; this.acc = 0; this.lapStart = 0; }
  get frames() { return this.data.length / STRIDE; }
  tick(dt, ph, slip) {
    this.acc += dt;
    while (this.acc >= 1 / REC_HZ) {
      this.acc -= 1 / REC_HZ;
      if (this.data.length >= this.max) return;
      this.data.push(+ph.x.toFixed(2), +ph.y.toFixed(2), +ph.z.toFixed(2), +ph.yaw.toFixed(3), +ph.delta.toFixed(3), +slip.toFixed(2), +ph.speed.toFixed(1));
    }
  }
  markLap() { this.lapStart = this.frames; }
  lapFrames() { return this.data.slice(this.lapStart * STRIDE); }
}

// pose at time t (seconds) from a recording, interpolated
export function sample(data, t, out = {}) {
  const n = data.length / STRIDE;
  if (n < 2) return null;
  const f = Math.min(n - 1.001, Math.max(0, t * REC_HZ)), i = Math.floor(f), k = f - i;
  const a = i * STRIDE, b = a + STRIDE;
  const L = (o) => data[a + o] + (data[b + o] - data[a + o]) * k;
  let dy = data[b + 3] - data[a + 3]; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  out.x = L(0); out.y = L(1); out.z = L(2); out.yaw = data[a + 3] + dy * k; out.delta = L(4); out.slip = L(5); out.speed = L(6);
  out.done = f >= n - 1.01;
  return out;
}
export const durationOf = (data) => data.length / STRIDE / REC_HZ;

const GHOST_KEY = 'driftgame.drift.ghost.';
export function loadGhost(track) {
  try { const g = JSON.parse(localStorage.getItem(GHOST_KEY + track)); return g && Array.isArray(g.data) ? g : null; } catch (e) { return null; }
}
export function saveGhost(track, ghost) { try { localStorage.setItem(GHOST_KEY + track, JSON.stringify(ghost)); } catch (e) { /* storage full or blocked */ } }

// translucent copy of a car mesh
export function ghostify(root) {
  const mat = new THREE.MeshBasicMaterial({ color: '#7fe8ff', transparent: true, opacity: 0.28, depthWrite: false });
  root.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = false; o.receiveShadow = false; } if (o.isLight) o.visible = false; });
  root.renderOrder = 5;
  return root;
}

// TV cameras: elevated points beside the track every ~70 m; the replay cuts to whichever is nearest ahead
export function tvCameras(track) {
  const cams = [], step = Math.max(1, Math.round(70 / (track.length / track.N)));
  for (let i = 0, k = 0; i < track.N; i += step, k++) {
    const sd = k % 2 ? 1 : -1, wall = sd > 0 ? track.wallL[i] : track.wallR[i];
    const p = track.at(i, sd * (wall + 6), 5 + (k % 3) * 2);
    cams.push({ p, i });
  }
  return cams;
}
