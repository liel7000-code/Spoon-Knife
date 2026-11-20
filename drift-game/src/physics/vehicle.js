// Simulation-style vehicle model for drift mode. Plain JavaScript, no Three.js: it can be
// tuned and unit-tested on its own (see tests/vehicle.test.mjs).
//
// Model
//   - Chassis: one rigid body. Planar motion (x, z, yaw) from the four tyre forces, drag and
//     downforce applied at their real positions; heave, pitch and roll of the sprung mass from
//     four raycast spring/damper struts and two anti-roll bars. Tyre forces act at the ground,
//     below the centre of mass, so braking pitches, accelerating squats and cornering rolls,
//     and the suspension decides how that weight moves between the wheels.
//   - Tyres: slip angle (lateral, with a short relaxation length) and slip ratio (longitudinal)
//     per wheel from the contact-patch velocity and the wheel spin; a simplified Pacejka Magic
//     Formula on the combined (normalised) slip, so a spinning or locked tyre loses lateral
//     grip; load sensitivity; per-surface grip.
//   - Wheels: own spin speed and inertia, integrated semi-implicitly (stable with stiff tyres).
//   - Drivetrain: torque curve, idle, rev limiter, engine braking, engine inertia, clutch with
//     slip (clutch kick), gearbox (auto or manual), open / LSD / locked differentials,
//     RWD or AWD with a torque split.
//   - Steering: Ackermann, speed-sensitive steering speed, self-aligning (the front wheels follow
//     the direction of travel when the player lets go), drift assist levels.
//   - Brakes with bias, handbrake on the rear, optional ABS and traction control.
//
// Frame: world x right, y up, z towards the camera. yaw = the mesh rotation.y; the car faces
// -z at yaw 0 and yaw grows to the left. Local velocity: vf forward, vs to the RIGHT.

const G = 9.81, RHO = 1.2, RPM = 60 / (2 * Math.PI);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const SURFACES = [
  { name: 'asphalt', grip: 1.0, rolling: 0.011 },
  { name: 'paint', grip: 0.9, rolling: 0.011 },
  { name: 'curb', grip: 0.86, rolling: 0.014 },
  { name: 'concrete', grip: 0.9, rolling: 0.013 },
  { name: 'dirt', grip: 0.62, rolling: 0.05 },
  { name: 'grass', grip: 0.55, rolling: 0.065 },
];
export const SURFACE = { ASPHALT: 0, PAINT: 1, CURB: 2, CONCRETE: 3, DIRT: 4, GRASS: 5 };

export const ASSIST_LEVELS = {
  // drift: how much counter-steer help · steerRate/align: steering speed and self-centring
  // spinGuard: eases the throttle once the drift angle gets very big (digital gas on a phone)
  beginner: { drift: 0.8, steerRate: 1.0, align: 1.25, spinGuard: 1 },
  pro: { drift: 0.35, steerRate: 1.2, align: 1.0, spinGuard: 0 },
  sim: { drift: 0, steerRate: 1.5, align: 1.0, spinGuard: 0 },
};

// default tune (the tuning screen edits these)
export const DEFAULT_TUNE = { pressure: 30, camberF: -3.5, camberR: -1.0, diffLock: null, brakeBias: null, lock: null, springF: 1, springR: 1 };

/* ----------------------------------------------------------- magic formula */
// normalised so the peak (=1) is at s = 1 for E = 0
function magic(s, C, E) {
  const B = Math.tan(Math.PI / (2 * C));
  const bs = B * s;
  return Math.sin(C * Math.atan(bs - E * (bs - Math.atan(bs))));
}

/* --------------------------------------------------------------- config */
// spec (carSpecs.js) + tune -> numbers the simulation uses
export function buildConfig(spec, tune = {}) {
  const t = { ...DEFAULT_TUNE, ...tune };
  const c = { ...spec };
  c.lock = ((t.lock ?? spec.lockDeg) * Math.PI) / 180;
  c.brakeBias = t.brakeBias ?? spec.brakeBias;
  c.diffLock = t.diffLock ?? spec.diff.lock;
  // tyre pressure: best grip around 30 psi; softer = softer and less precise, harder = less grip
  const dp = t.pressure - 30;
  c.pressureGrip = 1 - 0.0022 * dp * dp;
  c.peakSlipScale = 1 - dp * 0.012; // lower pressure: peak at a larger slip angle (lazier tyre)
  // camber: some negative camber helps cornering grip and hurts traction/braking
  const camb = (deg) => { const a = Math.abs(deg); return { lat: 1 + 0.03 * Math.min(a, 3.5) - 0.045 * Math.max(0, a - 3.5), lon: 1 - 0.018 * a }; };
  c.camF = camb(t.camberF); c.camR = camb(t.camberR);
  c.kF = spec.springF * t.springF; c.kR = spec.springR * t.springR;
  // derived geometry
  c.wb = spec.rearZ - spec.frontZ;
  c.a = c.wb * (1 - spec.weightFront); // CG -> front axle
  c.b = c.wb - c.a;                     // CG -> rear axle
  c.cgZ = spec.frontZ + c.a;            // CG position in mesh z
  c.Iz = spec.mass * c.a * c.b * spec.yawInertia;
  c.Ip = spec.mass * (c.wb * c.wb + spec.cgHeight * spec.cgHeight) / 12 * 1.4;
  c.Ir = spec.mass * (spec.trackF * spec.trackF + spec.cgHeight * spec.cgHeight) / 12 * 1.2;
  c.maxTorque = Math.max(...spec.torque.map((p) => p[1]));
  c.idleW = spec.idle / RPM; c.redW = spec.redline / RPM; c.limW = spec.limiter / RPM;
  return c;
}

// torque curve lookup (rpm -> Nm), linear between points
function torqueAt(curve, rpm) {
  if (rpm <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    if (rpm <= curve[i][0]) { const [r0, t0] = curve[i - 1], [r1, t1] = curve[i]; return t0 + ((t1 - t0) * (rpm - r0)) / (r1 - r0); }
  }
  return curve[curve.length - 1][1];
}

/* -------------------------------------------------------------- vehicle */
export class Vehicle {
  constructor(spec, tune) {
    this.wheels = [0, 1, 2, 3].map((i) => ({
      i, front: i < 2, left: i % 2 === 0,
      S: 0, F: 0, mx: 0, mz: 0, R: spec.wheelR, I: spec.wheelInertia,
      omega: 0, angle: 0, x: 0, xs: 0, xv: 0, load: 0, contact: false,
      alpha: 0, kappa: 0, slip: 0, fx: 0, fy: 0, steer: 0, mu: 1,
      gY: 0, gV: 0, surface: 0, driven: false, T: 0, Ie: 0, f0: 0, k: 0, vd: 1, Tb: 0, vl: 0, vt: 0,
    }));
    this.in = { steer: 0, analog: false, analogPedals: false, throttle: 0, brake: 0, hand: 0, clutchKick: false, shiftUp: false, shiftDown: false };
    this.assist = { level: 'beginner', tc: false, abs: false };
    this.manual = false;
    this.substeps = 4;
    this.setSpec(spec, tune);
    this.reset(0, 0, 0, 0);
  }

  setSpec(spec, tune) {
    const c = (this.c = buildConfig(spec, tune));
    const ws = this.wheels;
    ws.forEach((w) => {
      const tr = w.front ? c.trackF : c.trackR;
      w.mx = w.left ? -tr : tr;                // mesh x
      w.mz = w.front ? c.frontZ : c.rearZ;     // mesh z
      w.S = w.mx;                              // local right
      w.F = -(w.mz - c.cgZ);                   // local forward from the CG
      w.R = c.wheelR; w.I = c.wheelInertia;
      w.driven = c.drive === 'awd' || (c.drive === 'rwd' ? !w.front : w.front);
      const k = w.front ? c.kF : c.kR;
      const share = (w.front ? c.b : c.a) / c.wb / 2;
      w.xs = (c.mass * G * share) / k; // static compression
      w.loadNom = c.mass * G * share;
    });
  }

  reset(x, z, yaw, groundY = 0) {
    const c = this.c;
    this.x = x; this.z = z; this.yaw = yaw;      // CG position (planar) and heading
    this.Y = groundY + c.cgHeight; this.Yv = 0;  // CG height
    this.pitch = 0; this.pv = 0; this.roll = 0; this.rv = 0;
    this.vf = 0; this.vs = 0; this.w = 0;
    this.delta = 0; this.thr = 0; this.brk = 0;
    this.gear = 1; this.shiftT = 0; this.kickT = 0; this.cutT = 0; this.revT = 0;
    this.we = c.idleW; this.clutchLocked = false; this.engage = 0;
    this.af = 0; this.as = 0; // smoothed accelerations (local)
    this.tcCut = 0;
    for (const w of this.wheels) { w.omega = 0; w.angle = 0; w.x = w.xs; w.xv = 0; w.alpha = 0; w.kappa = 0; w.slip = 0; w.fx = w.fy = 0; w.gY = groundY; w.gV = 0; w.load = w.loadNom; w.contact = true; }
    this.grounded = false;
  }

  /* ------------------------------------------------------------ outputs */
  get speed() { return Math.hypot(this.vf, this.vs); }
  get kmh() { return this.speed * 3.6; }
  // drift angle: direction of travel relative to the nose (+ = travelling to the left of the nose)
  // full range -180..180°: past 90° the car is going backwards relative to its nose (a spin)
  get beta() { return this.speed < 0.6 ? 0 : Math.atan2(-this.vs, this.vf); }
  get vx() { const s = Math.sin(this.yaw), c = Math.cos(this.yaw); return -s * this.vf + c * this.vs; }
  get vz() { const s = Math.sin(this.yaw), c = Math.cos(this.yaw); return -c * this.vf - s * this.vs; }
  get rpm() { return this.we * RPM; }
  get rootX() { return this.x - this.c.cgZ * Math.sin(this.yaw); }
  get rootZ() { return this.z - this.c.cgZ * Math.cos(this.yaw); }
  get rootY() { return this.Y - this.c.cgHeight; }

  // ground samples for each wheel; env.sample(x, z, wheelIndex, out) fills out.y, out.surface
  sampleGround(env, dt) {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw), rx = this.rootX, rz = this.rootZ, out = this.gs || (this.gs = { y: 0, surface: 0 });
    let first = !this.grounded;
    for (const w of this.wheels) {
      const wx = rx + w.mx * c + w.mz * s, wz = rz - w.mx * s + w.mz * c;
      out.y = 0; out.surface = 0;
      env.sample(wx, wz, w.i, out);
      w.gV = first ? 0 : clamp((out.y - w.gY) / dt, -6, 6);
      w.gY = out.y; w.surface = out.surface;
      w.wx = wx; w.wz = wz;
    }
    if (first) { this.Y = (this.wheels[0].gY + this.wheels[1].gY + this.wheels[2].gY + this.wheels[3].gY) / 4 + this.c.cgHeight; this.grounded = true; }
  }

  /* ---------------------------------------------------------------- step */
  step(dtIn, env) {
    const dt = Math.min(dtIn, 1 / 30);
    this.sampleGround(env, dt);
    this.controls(dt);
    const n = this.substeps, h = dt / n;
    for (let k = 0; k < n; k++) this.sub(h);
    // guard: never let a numerical blow-up reach the game
    if (!Number.isFinite(this.x + this.z + this.yaw + this.vf + this.vs + this.w + this.Y + this.we)) this.recover();
  }

  recover() {
    const { x, z, yaw } = this.safe || { x: 0, z: 0, yaw: 0 };
    this.reset(Number.isFinite(x) ? x : 0, Number.isFinite(z) ? z : 0, Number.isFinite(yaw) ? yaw : 0, this.wheels[0].gY || 0);
  }

  /* -------------------------------------------------------- driver inputs */
  controls(dt) {
    const c = this.c, inp = this.in, A = ASSIST_LEVELS[this.assist.level] || ASSIST_LEVELS.pro;
    this.safe = this.safe || {}; this.safe.x = this.x; this.safe.z = this.z; this.safe.yaw = this.yaw;
    const speed = this.speed;
    // --- gearbox (auto: shift on road speed, so wheelspin does not upshift)
    if (this.shiftT > 0) this.shiftT -= dt;
    const groundRpm = (g) => (Math.abs(this.vf) / c.wheelR) * c.gears[g - 1] * c.final * RPM;
    const reverse = this.gear === -1;
    let throttleIn = reverse ? inp.brake : inp.throttle, brakeIn = reverse ? inp.throttle : inp.brake;
    if (this.manual) {
      if (inp.shiftUp) { inp.shiftUp = false; if (this.gear < c.gears.length) this.shift(this.gear === -1 ? 1 : this.gear + 1); }
      if (inp.shiftDown) { inp.shiftDown = false; if (this.gear > 1) this.shift(this.gear - 1); else if (this.gear === 1 && speed < 1.5) this.shift(-1); }
    } else if (this.shiftT <= 0 && this.gear > 0 && !(speed > 5 && Math.abs(this.beta) > 0.2)) { // hold the gear while sliding
      if (this.gear < c.gears.length && groundRpm(this.gear) > c.redline * 0.96) this.shift(this.gear + 1);
      // like a drift driver: 2nd is the lowest gear while rolling (1st only to pull away)
      else if (this.gear > 2 && groundRpm(this.gear - 1) < c.redline * 0.5) this.shift(this.gear - 1);
      else if (this.gear === 2 && speed < 4) this.shift(1);
    }
    // automatic reverse: hold brake at a standstill; gas at a standstill selects first
    if (!this.manual) {
      if (this.gear > 0 && speed < 0.8 && inp.brake > 0.5 && inp.throttle < 0.1) { this.revT += dt; if (this.revT > 0.3) { this.gear = -1; this.revT = 0; } }
      else if (this.gear === -1 && speed < 0.8 && inp.throttle > 0.5) { this.gear = 1; }
      else this.revT = 0;
      if (this.gear === -1) { throttleIn = inp.brake; brakeIn = inp.throttle; }
    }
    // --- pedals: digital keys/touch ramp in and out
    if (inp.analogPedals) this.thr = clamp(throttleIn, 0, 1); // analog pedals follow directly
    else this.thr += clamp(throttleIn - this.thr, -10 * dt, 6 * dt);
    this.brk += clamp(brakeIn - this.brk, -10 * dt, 7 * dt);
    if (inp.clutchKick) { inp.clutchKick = false; if (this.gear !== 0) this.kickT = 0.16; }
    if (this.kickT > 0) this.kickT -= dt;

    // --- steering
    const vfa = Math.max(Math.abs(this.vf), 0.5);
    // where the front axle is travelling, relative to the car (+ = left): the "free" steering angle
    const free = clamp(Math.atan2(-(this.vs - this.w * this.a), vfa), -c.lock, c.lock);
    const rawTarget = -clamp(inp.steer, -1, 1) * c.lock;
    let target = rawTarget;
    // the assist only helps in a real slide: angle past ~9 degrees and the rear tyres past their grip peak
    const rearSlide = (Math.abs(this.wheels[2].alpha) + Math.abs(this.wheels[3].alpha)) / 2 > c.peakAngle * 0.9;
    const sliding = speed > 5 && Math.abs(this.beta) > 0.16 && rearSlide;
    if (A.drift > 0 && sliding) {
      // drift assist: steer towards zero front slip (the counter-steer that holds the slide),
      // the player's input still moves the angle around it
      const assisted = clamp(free + rawTarget * 0.55, -c.lock, c.lock);
      target = rawTarget + (assisted - rawTarget) * A.drift;
    }
    const released = Math.abs(inp.steer) < 0.02;
    if (inp.analog) this.delta += (target - this.delta) * (1 - Math.exp(-dt * 16));
    else if (released && !(A.drift > 0 && sliding)) {
      // self-aligning torque: let go and the front wheels swing to the direction of travel
      const align = (2.5 + speed * 0.32) * A.align;
      this.delta += (free - this.delta) * (1 - Math.exp(-dt * align));
    } else {
      const rate = (c.steerRate * A.steerRate) / (1 + speed / 28);
      this.delta += clamp(target - this.delta, -rate * dt, rate * dt);
    }
    this.delta = clamp(this.delta, -c.lock, c.lock);
    // Ackermann: inside wheel turns more
    const ws = this.wheels, d = this.delta;
    if (Math.abs(d) < 1e-4) { ws[0].steer = ws[1].steer = d; }
    else {
      const R = c.wb / Math.tan(Math.abs(d)), half = c.trackF, ack = c.ackermann;
      const inner = Math.atan(c.wb / (R - half)), outer = Math.atan(c.wb / (R + half));
      const din = Math.abs(d) + (inner - Math.abs(d)) * ack, dout = Math.abs(d) + (outer - Math.abs(d)) * ack;
      // turning left (d > 0): the left wheel (0) is inside
      ws[0].steer = Math.sign(d) * (d > 0 ? din : dout);
      ws[1].steer = Math.sign(d) * (d > 0 ? dout : din);
    }
    ws[2].steer = ws[3].steer = 0;
  }

  shift(g) {
    if (g === this.gear) return;
    this.gear = g;
    this.shiftT = this.c.shiftTime;
    this.clutchLocked = false;
  }

  /* --------------------------------------------------------------- substep */
  sub(h) {
    const c = this.c, ws = this.wheels;
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);

    // --- suspension: compression from the body pose and the ground under each wheel
    let fzSum = 0, mPitch = 0, mRoll = 0;
    for (const w of ws) {
      const mount = this.Y + this.pitch * w.F - this.roll * w.S;
      w.x = w.xs - (mount - c.cgHeight - w.gY);
      w.xv = -(this.Yv + this.pv * w.F - this.rv * w.S) + w.gV;
    }
    for (const w of ws) {
      const other = ws[w.i ^ 1];
      w.contact = w.x > 0;
      if (!w.contact) { w.load = 0; continue; }
      const k = w.front ? c.kF : c.kR, arb = w.front ? c.arbF : c.arbR;
      let f = k * Math.min(w.x, c.travel) + (w.x > c.travel ? (w.x - c.travel) * k * 12 : 0);
      f += w.xv * (w.xv > 0 ? c.bump : c.rebound);
      f += arb * (w.x - Math.max(0, other.x));
      w.load = Math.max(0, f);
      fzSum += w.load;
      mPitch += w.load * w.F;
      mRoll -= w.load * w.S;
    }

    // --- aero
    const speed = Math.hypot(this.vf, this.vs);
    const down = 0.5 * RHO * c.downforce * this.vf * this.vf;
    const downF = down * c.downforceFront, downR = down - downF;
    // downforce pushes the body down (heave/pitch below), the springs pass it to the tyres

    // --- tyre kinematics and forces at the current wheel speeds
    const engineRatio = this.gear === 0 || this.shiftT > 0 ? 0 : (this.gear > 0 ? c.gears[this.gear - 1] : -c.reverse) * c.final;
    let nDriven = 0, omegaDriven = 0;
    for (const w of ws) {
      // velocity of the contact patch (local), then into the wheel frame
      const vfp = this.vf + this.w * w.S, vsp = this.vs - this.w * w.F;
      const cs = Math.cos(w.steer), sn = Math.sin(w.steer);
      const vl = vfp * cs - vsp * sn, vt = vfp * sn + vsp * cs; // long (fwd), lateral (right)
      w.vl = vl; w.vt = vt;
      const surf = SURFACES[w.surface] || SURFACES[0];
      // relaxation length: slip angle builds up over ~0.3 m of rolling (stable at low speed)
      const target = Math.atan2(vt, Math.max(Math.abs(vl), 0.3));
      w.alpha += (target - w.alpha) * Math.min(1, ((Math.abs(vl) + 1.5) * h) / c.relax);
      const vd = Math.max(Math.abs(vl), 2.5);
      w.vd = vd;
      w.kappa = (w.omega * w.R - vl) / vd;
      // grip: tyre friction x surface x pressure x camber, with load sensitivity
      const muBase = (w.front ? c.muF : c.muR) * surf.grip * c.pressureGrip;
      const cam = w.front ? c.camF : c.camR;
      const sens = clamp(1 - c.loadSens * (w.load / w.loadNom - 1), 0.7, 1.25);
      w.muY = muBase * cam.lat * sens; w.muX = muBase * cam.lon * sens;
      w.Tb = 0;
      if (w.driven) { nDriven++; omegaDriven += w.omega; }
    }
    this.tyres(false);

    // --- drivetrain torque at the wheels
    const inp = this.in;
    let thr = this.thr;
    if (this.cutT > 0) { this.cutT -= h; thr = 0; }
    // beginner spin guard: past ~45 degrees of drift the throttle is eased so a full-throttle phone player
    // does not spin; the angle is still the player's (steering is untouched)
    const AL = ASSIST_LEVELS[this.assist.level];
    if (AL && AL.spinGuard && speed > 5) {
      const b = Math.abs(Math.atan2(-this.vs, this.vf));
      if (b > 0.78) thr *= clamp(1 - (b - 0.78) * 3.5, 0.12, 1);
      if (b > 0.6) { const spin = Math.max(ws[2].kappa, ws[3].kappa); if (spin > 0.6) thr *= clamp(1.6 - spin, 0.1, 1); }
    }
    // traction control: trim the throttle when a driven wheel spins
    if (this.assist.tc) {
      let spin = 0; for (const w of ws) if (w.driven && speed > 2) spin = Math.max(spin, w.kappa);
      this.tcCut += ((spin > c.peakRatio * 1.4 ? 1 : 0) - this.tcCut) * Math.min(1, h * 25);
      thr *= 1 - 0.85 * this.tcCut;
    }
    const rpm = this.we * RPM;
    if (this.we > c.limW) this.cutT = 0.05; // rev limiter: fuel cut
    let Te = thr * torqueAt(c.torque, rpm) * c.torqueScale - (1 - thr) * c.engineBrake * c.maxTorque * (rpm / c.redline);
    if (this.we < c.idleW) Te += (c.idleW - this.we) * 3 + 20; // idle control
    const omegaT = nDriven ? (omegaDriven / nDriven) * engineRatio : 0; // transmission input speed
    // clutch: auto engagement at launch, open while shifting or kicking
    let engageTarget = 1;
    if (engineRatio === 0 || this.kickT > 0) engageTarget = 0;
    else if (Math.abs(omegaT) < c.idleW * 1.15) engageTarget = clamp((this.we - c.idleW) / (2200 / RPM), 0.04, 1) * (thr > 0.05 || speed > 1 ? 1 : 0.02);
    this.engage += clamp(engageTarget - this.engage, -h * 30, h * (this.kickT > 0 ? 30 : 12));
    if (this.clutchLocked && (this.engage < 0.98 || (Math.abs(omegaT) < c.idleW * 0.92 && thr < 0.1) || engineRatio === 0)) this.clutchLocked = false;
    if (!this.clutchLocked && this.engage >= 0.98 && Math.abs(this.we - omegaT) < 12 && engineRatio !== 0) this.clutchLocked = true;
    let Tin = 0, reflect = 0;
    if (this.clutchLocked) {
      Tin = Te * engineRatio * c.efficiency;
      reflect = (c.engineInertia * engineRatio * engineRatio) / Math.max(1, nDriven);
    } else {
      // slipping clutch: torque from the speed difference, limited by the clutch capacity
      const dW = this.we - omegaT;
      const cap = c.clutchTorque * this.engage;
      const Tc = clamp(dW * (c.engineInertia / h) * 0.5, -cap, cap);
      this.we += ((Te - Tc) / c.engineInertia) * h;
      Tin = Tc * engineRatio * c.efficiency;
    }

    // --- distribute through the differentials and integrate the wheel speeds
    for (const w of ws) w.Ie = w.I / h + (w.driven ? reflect / h : 0) + (w.k * w.R * w.R) / w.vd;
    // brakes (+ ABS) and handbrake
    const bf = this.brk * c.brakeTorque * c.brakeBias, br = this.brk * c.brakeTorque * (1 - c.brakeBias);
    for (const w of ws) {
      let tb = w.front ? bf : br;
      if (this.assist.abs && tb > 0 && w.kappa < -c.peakRatio * 1.3 && speed > 3) tb *= 0.25;
      if (!w.front && inp.hand) tb += c.handbrakeTorque;
      w.Tb = tb / 2;
    }
    if (c.drive === 'awd') {
      this.axle(ws[0], ws[1], Tin * (1 - c.rearSplit), c.diffFront, c.diffFrontLock);
      this.axle(ws[2], ws[3], Tin * c.rearSplit, c.diff.type, this.c.diffLock);
    } else if (c.drive === 'rwd') {
      this.axle(ws[2], ws[3], Tin, c.diff.type, this.c.diffLock);
      this.axle(ws[0], ws[1], 0, 'open', 0);
    } else {
      this.axle(ws[0], ws[1], Tin, c.diff.type, this.c.diffLock);
      this.axle(ws[2], ws[3], 0, 'open', 0);
    }
    if (this.clutchLocked && nDriven) {
      let o = 0; for (const w of ws) if (w.driven) o += w.omega;
      this.we = Math.max(c.idleW * 0.6, (o / nDriven) * engineRatio);
    }
    this.we = clamp(this.we, c.idleW * 0.5, c.limW * 1.04);

    // --- tyre forces with the new wheel speeds (longitudinal from the linearised update)
    this.tyres(true);

    // --- forces on the chassis
    let Ff = 0, Fs = 0, Mz = 0, FfGround = 0, FsGround = 0;
    for (const w of ws) {
      if (!w.contact) continue;
      const cs = Math.cos(w.steer), sn = Math.sin(w.steer);
      const surf = SURFACES[w.surface] || SURFACES[0];
      const roll = -surf.rolling * w.load * clamp(w.vl / 1.5, -1, 1);
      const fx = w.fx + roll, fy = w.fy;
      const ff = fx * cs + fy * sn, fs = -fx * sn + fy * cs;
      Ff += ff; Fs += fs;
      Mz += ff * w.S - fs * w.F;
    }
    FfGround = Ff; FsGround = Fs;
    // aerodynamic drag at the CG, against the velocity
    if (speed > 0.01) { const dr = 0.5 * RHO * c.dragArea * speed; Ff -= dr * this.vf; Fs -= dr * this.vs; }
    // low-speed lateral damping: kills creeping when (nearly) stopped
    if (speed < 1.2) { const k = (1 - speed / 1.2) * c.mass * 6; Fs -= this.vs * k; Mz -= this.w * c.Iz * 6 * (1 - speed / 1.2); if (this.thr < 0.05 && Math.abs(this.vf) < 0.4) Ff -= this.vf * k; }

    // --- integrate the planar motion (semi-implicit)
    const m = c.mass;
    const af = Ff / m, as = Fs / m;
    // body frame rotating at w: d(vf)/dt = Ff/m - w*vs, d(vs)/dt = Fs/m + w*vf
    const vf0 = this.vf;
    this.vf += (af - this.w * this.vs) * h;
    this.vs += (as + this.w * vf0) * h;
    this.w += (Mz / c.Iz) * h;
    this.x += (-sinY * this.vf + cosY * this.vs) * h;
    this.z += (-cosY * this.vf - sinY * this.vs) * h;
    this.yaw += this.w * h;
    this.af += (af - this.af) * Math.min(1, h * 12);
    this.as += (as - this.as) * Math.min(1, h * 12);

    // --- sprung mass: heave, pitch, roll (tyre forces act at the ground, below the CG)
    const hcg = c.cgHeight;
    this.Yv += ((fzSum - m * G - down) / m) * h;
    this.pv += ((mPitch + FfGround * hcg - downF * this.a + downR * this.b) / c.Ip) * h;
    this.rv += ((mRoll - FsGround * hcg) / c.Ir) * h;
    // a little structural damping keeps the body from ringing
    this.pv *= 1 - h * 0.8; this.rv *= 1 - h * 0.8;
    this.Y += this.Yv * h; this.pitch += this.pv * h; this.roll += this.rv * h;
    this.pitch = clamp(this.pitch, -0.12, 0.12); this.roll = clamp(this.roll, -0.14, 0.14);
    // never sink through the ground
    let minClear = Infinity; for (const w of ws) minClear = Math.min(minClear, this.Y - w.gY);
    if (minClear < 0.12) { this.Y += 0.12 - minClear; if (this.Yv < 0) this.Yv = 0; }

    // wheel rotation angle for the visuals
    for (const w of ws) w.angle += w.omega * h;
  }

  get a() { return this.c.a; }
  get b() { return this.c.b; }

  // tyre forces. final=false: forces at the current spin + slope for the implicit update;
  // final=true: longitudinal force consistent with the updated spin
  tyres(final) {
    const c = this.c;
    for (const w of this.wheels) {
      if (!w.contact || w.load <= 0) { w.fx = w.fy = 0; w.k = 0; w.f0 = 0; w.slip = 0; continue; }
      const pa = c.peakAngle * c.peakSlipScale, pr = c.peakRatio;
      const kap = final ? (w.omega * w.R - w.vl) / w.vd : w.kappa;
      w.kappa = kap;
      const sx = kap / pr, sy = Math.tan(w.alpha) / Math.tan(pa);
      const s = Math.hypot(sx, sy);
      w.slip = s;
      const Dx = w.muX * w.load, Dy = w.muY * w.load;
      let fx, fy;
      if (s < 1e-6) { fx = 0; fy = 0; }
      else {
        const f = magic(s, c.shapeC, c.shapeE);
        fx = (Dx * f * sx) / s;
        fy = (-Dy * f * sy) / s;
      }
      if (!final) {
        // slope dFx/dkappa for the semi-implicit wheel update (never negative)
        const e = 0.01, sx2 = (kap + e) / pr, s2 = Math.hypot(sx2, sy);
        const fx2 = (Dx * magic(s2, c.shapeC, c.shapeE) * sx2) / s2;
        w.k = Math.max(0, (fx2 - fx) / e);
        w.f0 = fx;
      }
      w.fx = clamp(fx, -Dx, Dx);
      w.fy = fy;
    }
  }

  // one axle through its differential: open (equal torque), locked (equal speed) or a
  // clutch-type LSD (locking torque = preload + lock x input torque)
  axle(L, R, Tin, type, lock) {
    const solve = (w, T) => {
      // semi-implicit: d(omega) = (T - R*F0) / (I/h + k R^2 / vd)
      let o = w.omega + (T - w.R * w.f0) / w.Ie;
      const db = w.Tb / w.Ie;
      if (db > 0) o = Math.abs(o) <= db ? 0 : o - Math.sign(o) * db;
      return o;
    };
    const fL = L.R * L.f0, fR = R.R * R.f0;
    // torque to the left wheel that would make both wheels end at the same speed
    const A = L.Ie, B = R.Ie;
    const TlLock = (R.omega - L.omega + (Tin - fR) / B + fL / A) / (1 / A + 1 / B);
    let cap = 0;
    if (type === 'locked') cap = Infinity;
    else if (type === 'lsd') cap = this.c.diff.preload + lock * Math.abs(Tin);
    const Tl = Tin / 2 + clamp(TlLock - Tin / 2, -cap, cap);
    const Tr = Tin - Tl;
    L.T = Tl; R.T = Tr;
    L.omega = solve(L, Tl); R.omega = solve(R, Tr);
  }

  /* --------------------------------------------------------- collisions */
  // wall contact: n = unit normal back into the track (world x/z), depth m, contact point (px, pz)
  collide(nx, nz, depth, px, pz, restitution = 0.25, friction = 0.35) {
    this.x += nx * depth; this.z += nz * depth;
    const vx = this.vx, vz = this.vz, w = this.w;
    const rx = px - this.x, rz = pz - this.z;
    const pvx = vx + w * rz, pvz = vz - w * rx;
    const vn = pvx * nx + pvz * nz;
    if (vn >= 0) return 0;
    const m = this.c.mass, I = this.c.Iz;
    const rn = rz * nx - rx * nz;
    const j = (-(1 + restitution) * vn) / (1 / m + (rn * rn) / I);
    const tx = -nz, tz = nx, vt = pvx * tx + pvz * tz, rt = rz * tx - rx * tz;
    const jt = clamp(-vt / (1 / m + (rt * rt) / I), -friction * j, friction * j);
    const ix = nx * j + tx * jt, iz = nz * j + tz * jt;
    const nvx = vx + ix / m, nvz = vz + iz / m;
    this.w += (rz * ix - rx * iz) / I;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    this.vf = -s * nvx - c * nvz;
    this.vs = c * nvx - s * nvz;
    // the wheels follow the new road speed (no huge slip spike after a hit)
    for (const wh of this.wheels) { const rolling = this.vf / wh.R; wh.omega += (rolling - wh.omega) * 0.5; }
    return -vn;
  }
}
