// Drift-mode vehicle model: a planar single-track ("bicycle") model with a slip-angle tyre
// curve per axle, longitudinal weight transfer, rear-wheel drive with a friction circle
// (wheelspin eats lateral grip, which is what lets the rear step out), a handbrake that
// locks the rear, an optional clutch kick and three assist levels.
//
// Frame: x right, z towards the camera, y up. The car faces -z at yaw 0; yaw grows
// counter-clockwise (to the left). Local velocity: u forward, v to the left.
// beta = atan2(v, u) is the drift angle: the direction of travel relative to the nose.
import { DRIFT, driftTuningFor } from '../config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const G = DRIFT.gravity;

// tyre lateral grip curve: rises to the peak at x = slip / peakSlip = 1, then falls to slideGrip
function tyre(x) {
  const a = Math.abs(x);
  const f = a < 1 ? a * (2 - a) : Math.max(DRIFT.slideGrip, 1 - (a - 1) * 0.12);
  return f * Math.sign(x);
}

export class DriftPhysics {
  constructor(def) {
    this.def = def;
    const T = (this.T = driftTuningFor(def.id));
    this.m = T.mass;
    this.L = T.wb;
    this.a = T.wb * (1 - T.front); // CG -> front axle
    this.b = T.wb * T.front;       // CG -> rear axle
    this.I = this.m * this.a * this.b * 1.1 * T.inertia;
    this.power = T.power * 1000 * 0.65; // at the wheels, averaged over the rev range (drivetrain losses, torque curve)
    this.top = T.top / 3.6;
    this.assist = 'drift';
    this.reset(0, 0, 0, 0);
  }

  reset(x, z, yaw, y = 0) {
    this.x = x; this.z = z; this.y = y; this.yaw = yaw;
    this.u = 0; this.v = 0; this.r = 0;
    this.steer = 0; this.delta = 0; this.throttle = 0;
    this.ax = 0; this.ay = 0;
    this.kick = 0; this.wheelSpin = 0; this.rearSlip = 0; this.frontSlip = 0;
    this.gear = 1; this.rpm = 900;
    this.surface = 1; this.slope = 0;
    this.hand = false;
  }

  get speed() { return Math.hypot(this.u, this.v); }
  get beta() { return Math.abs(this.u) < 0.5 && Math.abs(this.v) < 0.5 ? 0 : Math.atan2(this.v, Math.abs(this.u)); }
  // world velocity
  get vx() { const s = Math.sin(this.yaw), c = Math.cos(this.yaw); return -s * this.u - c * this.v; }
  get vz() { const s = Math.sin(this.yaw), c = Math.cos(this.yaw); return -c * this.u + s * this.v; }

  clutchKick() { if (!this.hand) this.kick = DRIFT.clutchKick.time; }

  // inp: { steer -1..1 (+ = right), analog, gas, brake, hand } ; env: { grip, drag, slope }
  step(dt, inp, env = {}) {
    const D = DRIFT, T = this.T;
    // steering: positive input = right; the model's delta is positive to the left
    const target = -clamp(inp.steer || 0, -1, 1);
    if (inp.analog) this.steer += (target - this.steer) * (1 - Math.exp(-dt * 14));
    else {
      const rate = target === 0 ? D.steerReturn : Math.sign(target) !== Math.sign(this.steer) && this.steer !== 0 ? D.steerReturn * 1.4 : D.steerRate;
      this.steer += clamp(target - this.steer, -rate * dt, rate * dt);
    }
    const th = inp.gas ? 1 : 0;
    this.throttle += clamp(th - this.throttle, -D.throttleDrop * dt, D.throttleRate * dt);
    this.hand = !!inp.hand;
    this.surface = env.grip ?? 1;
    this.slope = env.slope ?? 0;
    if (this.kick > 0) this.kick -= dt;
    // two sub-steps per fixed step keep the stiff tyre forces stable
    const h = dt / 2;
    for (let k = 0; k < 2; k++) this.sub(h, inp, env);
    this.updateEngine(dt);
  }

  sub(dt, inp, env) {
    const D = DRIFT, A = D.assist, T = this.T, m = this.m, a = this.a, b = this.b, L = this.L;
    const u = this.u, v = this.v, r = this.r;
    const speed = Math.hypot(u, v);
    const beta = this.beta;
    const fwd = u >= 0 ? 1 : -1;

    // --- steering with assists
    let delta = this.steer * T.lock;
    if (this.assist !== 'off' && speed > 3 && u > 0) {
      // counter-steer: front wheels follow the direction of travel; the player's input adds on top
      const cs = clamp(beta * A.counterGain, -T.lock, T.lock);
      delta = clamp(delta * (1 - Math.min(1, Math.abs(beta) * 1.2) * 0.35) + cs * (1 - Math.abs(this.steer) * 0.5), -T.lock, T.lock);
    }
    this.delta = delta;

    // --- loads: static split plus longitudinal transfer
    const W = m * G, grip = this.surface;
    const xfer = (m * this.ax * T.cgH) / L;
    const Fzf = Math.max(W * 0.15, W * (b / L) - xfer);
    const Fzr = Math.max(W * 0.15, W * (a / L) + xfer);
    const latLoss = 1 - Math.min(0.12, (Math.abs(this.ay) / G) * 0.06); // lateral load transfer costs a little grip
    const capF = T.muF * Fzf * grip * latLoss, capR = T.muR * Fzr * grip * latLoss;

    // --- longitudinal: engine to the rear, brakes 60/40, handbrake locks the rear
    let throttle = this.throttle;
    if (this.assist === 'drift' && Math.abs(beta) > A.holdAngle + 0.15) throttle *= 0.55; // ease off before a spin
    else if (this.assist === 'counter' && Math.abs(beta) > 1.15) throttle *= 0.5;        // light spin protection
    let Fdrive = 0;
    const kick = this.kick > 0 ? D.clutchKick.boost : 1;
    if (!this.hand) {
      if (inp.brake && u < 1.0 && !inp.gas) Fdrive = -Math.min(this.power / 6, 5000) * (u > -15 / 3.6 ? 1 : 0); // reverse
      else Fdrive = throttle * Math.min(this.power / Math.max(Math.abs(u), 4), capR * 1.6) * kick * (u < this.top ? 1 : 0);
    }
    // traction control (assisted modes): with little steering and no slide yet, keep the drive
    // force under the rear grip so a fast bend does not snap; steering harder opens it up again,
    // so power oversteer stays available on purpose
    if (this.assist !== 'off' && Math.abs(beta) < 0.15 && this.kick <= 0 && Fdrive > 0) Fdrive = Math.min(Fdrive, capR * (0.78 + 0.75 * Math.abs(this.steer)));
    let Fbf = 0, Fbr = 0;
    if (inp.brake && u > 0.5) { const B = D.brakeG * W; Fbf = Math.min(B * 0.6, capF); Fbr = Math.min(B * 0.4, capR); }
    let Fxr, spin = 0;
    if (this.hand && Math.abs(u) > 0.5) Fxr = -Math.sign(u) * capR * 0.75;
    else {
      Fxr = Fdrive - Fbr * Math.sign(u);
      if (Math.abs(Fxr) > capR) { spin = Math.min(1, (Math.abs(Fxr) - capR) / capR + 0.15); Fxr = Math.sign(Fxr) * capR * 0.92; }
    }
    if (this.assist === 'drift' && Math.abs(beta) > 0.18 && throttle > 0.3 && speed > 8) Fxr += A.sustain * capR * throttle * 0.5; // keeps a slide alive
    this.wheelSpin += ((spin ? 1 : 0) * (4 + speed * 0.25) - this.wheelSpin) * Math.min(1, dt * 8);
    const Fxf = -Fbf * Math.sign(u);

    // --- lateral: slip angles, friction circle on each axle
    const uu = Math.max(Math.abs(u), 3);
    const alphaF = Math.atan2(v + a * r, uu) - delta * fwd;
    const alphaR = Math.atan2(v - b * r, uu);
    let latR = Math.sqrt(Math.max(0, capR * capR - Fxr * Fxr));
    if (this.hand) latR = Math.min(latR, capR * D.handbrakeGrip);
    if (spin) latR *= 1 - spin * 0.35;
    const latF = Math.sqrt(Math.max(0, capF * capF - Fxf * Fxf));
    const Fyf = -latF * tyre(alphaF / D.peakSlipF);
    const Fyr = -latR * tyre(alphaR / D.peakSlipR);
    this.frontSlip = alphaF; this.rearSlip = alphaR;

    // --- resistance, slope
    const drag = 0.5 * 1.2 * D.dragArea * u * Math.abs(u) + D.rolling * W * Math.sign(u) * Math.min(1, Math.abs(u));
    const offDrag = (1 - (env.grip ?? 1)) * (env.drag ?? 0) * W * 0.25 * Math.sign(u) * Math.min(1, Math.abs(u) / 3);
    const Fslope = -W * this.slope;

    // --- equations of motion
    const cd = Math.cos(delta), sd = Math.sin(delta);
    const fx = Fxr + Fxf * cd - Fyf * sd - drag - offDrag + Fslope;
    const fy = Fyr + Fyf * cd + Fxf * sd;
    let du = fx / m + v * r;
    let dv = fy / m - u * r;
    let dr = (a * (Fyf * cd + Fxf * sd) - b * Fyr) / this.I;
    // drift assist: correct the yaw when the angle goes past the hold angle, so it does not spin
    if (this.assist === 'drift' && speed > 5) {
      const over = Math.abs(beta) - A.holdAngle;
      if (over > 0) dr += Math.sign(beta) * over * A.yawDamp * 6 - r * Math.min(1, over * 3) * 2;
    }
    this.u += du * dt;
    this.v += dv * dt;
    this.r += dr * dt;

    // low speed: blend into the kinematic model (slip angles are meaningless near standstill)
    const k = clamp((speed - 1.5) / 4, 0, 1);
    if (k < 1) {
      const rk = (this.u * Math.tan(delta)) / L;
      this.r = rk + (this.r - rk) * k;
      this.v = this.r * b + (this.v - this.r * b) * k; // rear axle rolls without side slip
      if (!inp.gas && !inp.brake && speed < 0.6) { this.u *= 1 - Math.min(1, dt * 3); }
    }
    this.ax += (du - v * r - this.ax) * Math.min(1, dt * 10);
    this.ay += (this.u * this.r - this.ay) * Math.min(1, dt * 10);

    // --- integrate position
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    this.x += (-s * this.u - c * this.v) * dt;
    this.z += (-c * this.u + s * this.v) * dt;
    this.yaw += this.r * dt;
  }

  // 6-speed automatic driven by rear wheel speed (wheelspin revs the engine)
  updateEngine(dt) {
    const ratios = [0.3, 0.46, 0.6, 0.73, 0.86, 1.0];
    const ws = Math.max(0, this.u) + this.wheelSpin;
    const rpmFor = (g) => 1000 + (ws / (this.top * ratios[g - 1])) * 7000;
    let rpm = rpmFor(this.gear);
    if (rpm > 7600 && this.gear < 6) this.gear++;
    else if (this.gear > 1 && rpmFor(this.gear - 1) < 6200) this.gear--;
    rpm = Math.min(8300, rpmFor(this.gear));
    if (this.hand || this.throttle < 0.05) rpm = Math.max(900, rpm);
    this.rpm += (rpm - this.rpm) * Math.min(1, dt * 12);
  }

  // push out of a wall: n = unit normal pointing back into the track, depth m, contact point (px, pz)
  collide(nx, nz, depth, px, pz, restitution = 0.25, friction = 0.35) {
    this.x += nx * depth; this.z += nz * depth;
    const vx = this.vx, vz = this.vz;
    const rx = px - this.x, rz = pz - this.z;
    // velocity of the contact point: yaw rate w about +y gives w x r = (w*rz, -w*rx)
    const w = this.r;
    const pvx = vx + w * rz, pvz = vz - w * rx;
    const vn = pvx * nx + pvz * nz; // < 0: moving into the wall
    if (vn >= 0) return 0;
    const rn = rx * nz - rz * nx; // lever arm for the yaw response
    const invM = 1 / this.m, invI = (rn * rn) / this.I;
    const j = (-(1 + restitution) * vn) / (invM + invI);
    // tangential friction
    const tx = -nz, tz = nx;
    const vt = pvx * tx + pvz * tz;
    const jt = clamp(-vt / (invM + (rx * tz - rz * tx) ** 2 / this.I), -friction * j, friction * j);
    const ix = nx * j + tx * jt, iz = nz * j + tz * jt;
    const nvx = vx + ix * invM, nvz = vz + iz * invM;
    // angular impulse: torque about +y from impulse at r: rz*ix - rx*iz
    this.r += (rz * ix - rx * iz) / this.I;
    // back to local velocity
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    this.u = -s * nvx - c * nvz;
    this.v = -c * nvx + s * nvz;
    return -vn;
  }
}
