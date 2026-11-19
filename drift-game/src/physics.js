// Player vehicle model and 2D oriented-bounding-box collision (x/z plane).
//
// Model: smoothed steer input -> front wheel angle (reduced with speed) -> target
// yaw rate (kinematic bicycle) -> heading. The velocity direction then follows the
// heading at a rate set by tyre grip, so at high speed the car slides a little.
import { CONFIG } from './config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const WHEELBASE = 2.55;

export class CarPhysics {
  constructor(def) {
    this.def = def;
    this.reset(0);
  }

  reset(x) {
    this.x = x;
    this.heading = 0;   // car nose angle vs road direction (+ = pointing right)
    this.velAng = 0;    // direction of travel vs road direction
    this.speed = 100 / 3.6;
    this.yawRate = 0;
    this.steer = 0;     // smoothed input, -1..1
    this.wheelAngle = 0;
    this.longAccel = 0;
    this.latAccel = 0;
    this.slip = 0;
    this.vx = 0;
    this.forward = this.speed;
  }

  step(dt, { steerTarget, analog, gas, brake, baseSpeed }) {
    const S = CONFIG.steering, G = CONFIG.grip, def = this.def;

    // input smoothing (analog sticks/tilt are already smooth, so follow them quickly)
    let rate;
    if (analog) rate = 10;
    else if (steerTarget === 0) rate = S.rampDown;
    else if (this.steer !== 0 && Math.sign(steerTarget) !== Math.sign(this.steer)) rate = S.reverse;
    else rate = S.rampUp;
    const d = steerTarget - this.steer;
    this.steer += clamp(d, -rate * dt, rate * dt);

    // speed: cruise target rises over time, W/S push above/below it
    const top = def.topSpeed / 3.6;
    let target = baseSpeed, r;
    if (gas) { target = top; r = 3 + def.accel * 9; }
    else if (brake) { target = Math.max(60 / 3.6, baseSpeed * 0.5); r = 15; }
    else r = this.speed < baseSpeed ? 2 + def.accel * 4 : 3;
    const prev = this.speed;
    this.speed += clamp(target - this.speed, -r * dt, r * dt);

    // steering geometry: less wheel angle at speed (understeer feel)
    const v = this.speed;
    const handling = 0.7 + def.handling * 0.6;
    this.wheelAngle = this.steer * S.maxWheelAngle * S.sensitivity * handling / (1 + v / S.falloffSpeed);
    let desiredYaw = (v * Math.tan(this.wheelAngle)) / WHEELBASE;
    // the tyres can only deliver so much sideways force: yaw rate <= aLat / v
    const yawCap = (G.maxLatAccel * (0.8 + def.handling * 0.4)) / Math.max(v, 5);
    desiredYaw = clamp(desiredYaw, -yawCap, yawCap);
    // hands-off: the car straightens up along the road
    desiredYaw -= this.heading * S.centerAssist * (1 - Math.abs(this.steer));
    this.yawRate += (desiredYaw - this.yawRate) * (1 - Math.exp(-G.yawResponse * dt));
    this.heading = clamp(this.heading + this.yawRate * dt, -S.maxHeading, S.maxHeading);

    // grip: travel direction chases the heading; weaker at high speed -> small drift
    const grip = G.lateral * (0.75 + def.handling * 0.5) / (1 + (v / G.slipSpeed) ** 2);
    this.velAng += (this.heading - this.velAng) * (1 - Math.exp(-grip * dt));
    this.slip = this.heading - this.velAng;
    this.speed -= Math.abs(this.slip) * v * G.scrub * dt;

    this.vx = v * Math.sin(this.velAng);
    this.forward = v * Math.cos(this.velAng);
    this.x += this.vx * dt;

    this.longAccel += ((this.speed - prev) / dt - this.longAccel) * (1 - Math.exp(-8 * dt));
    this.latAccel += (v * this.yawRate - this.latAccel) * (1 - Math.exp(-8 * dt));
  }
}

/* ------------------------------------------------------------------ OBB */
// Box: { x, z, hw, hl, yaw } where yaw is the mesh rotation.y.
// Local +x is the car's right, local +z its rear.
function corners(b, out) {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
  const ax = c * b.hw, az = -s * b.hw; // local x axis scaled
  const bx = s * b.hl, bz = c * b.hl;  // local z axis scaled
  out[0] = b.x + ax + bx; out[1] = b.z + az + bz;
  out[2] = b.x - ax + bx; out[3] = b.z - az + bz;
  out[4] = b.x - ax - bx; out[5] = b.z - az - bz;
  out[6] = b.x + ax - bx; out[7] = b.z + az - bz;
  return out;
}
const CA = new Float64Array(8), CB = new Float64Array(8);

function separated(ca, cb, axX, axZ) {
  let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
  for (let i = 0; i < 8; i += 2) {
    const pa = ca[i] * axX + ca[i + 1] * axZ, pb = cb[i] * axX + cb[i + 1] * axZ;
    if (pa < minA) minA = pa; if (pa > maxA) maxA = pa;
    if (pb < minB) minB = pb; if (pb > maxB) maxB = pb;
  }
  return maxA < minB || maxB < minA;
}

export function obbOverlap(a, b) {
  corners(a, CA); corners(b, CB);
  for (const yaw of [a.yaw, b.yaw]) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    if (separated(CA, CB, c, -s) || separated(CA, CB, s, c)) return false;
  }
  return true;
}

function pointSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  const qx = ax + dx * t - px, qz = az + dz * t - pz;
  return Math.sqrt(qx * qx + qz * qz);
}

// Distance between the two boxes' edges (0 when they touch or overlap).
export function obbDistance(a, b) {
  if (obbOverlap(a, b)) return 0;
  // obbOverlap filled CA/CB
  let best = Infinity;
  for (const [P, Q] of [[CA, CB], [CB, CA]]) {
    for (let i = 0; i < 8; i += 2) {
      for (let j = 0; j < 8; j += 2) {
        const k = (j + 2) % 8;
        const d = pointSeg(P[i], P[i + 1], Q[j], Q[j + 1], Q[k], Q[k + 1]);
        if (d < best) best = d;
      }
    }
  }
  return best;
}

// Half-extent of a box along the world x axis.
export function xExtent(hw, hl, yaw) {
  return Math.abs(Math.cos(yaw)) * hw + Math.abs(Math.sin(yaw)) * hl;
}
