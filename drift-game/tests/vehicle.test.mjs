// Physics tests for src/physics/vehicle.js (no browser, no Three.js).
// Run: node tests/vehicle.test.mjs   (or npm run test:physics)
import { Vehicle } from '../src/physics/vehicle.js';
import { CAR_SPECS } from '../src/physics/carSpecs.js';

const DT = 1 / 120;
const flat = { sample(x, z, i, o) { o.y = 0; o.surface = 0; } };
const deg = (r) => (r * 180) / Math.PI;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let failures = 0;
const results = [];
function check(name, ok, detail) { results.push({ test: name, result: ok ? 'PASS' : 'FAIL', detail }); if (!ok) failures++; }

function car(id = 'kaito', level = 'sim') { const v = new Vehicle(CAR_SPECS[id]); v.assist.level = level; v.reset(0, 0, 0, 0); return v; }
function run(v, secs, fn, env = flat) {
  let maxBeta = 0, t = 0;
  for (let i = 0; i < secs / DT; i++, t += DT) { fn && fn(v, t); v.step(DT, env); maxBeta = Math.max(maxBeta, Math.abs(deg(v.beta))); }
  return maxBeta;
}
// cruise up to a speed on a straight (gentle speed control)
function cruise(v, kmh, secs = 8) { run(v, secs, (c) => { c.in.throttle = c.kmh < kmh ? 1 : 0; c.in.brake = c.kmh > kmh + 3 ? 0.4 : 0; c.in.steer = 0; }); }

/* ---------------------------------------------------------------- basics */
{
  const v = car(); cruise(v, 100, 12);
  check('straight-line launch stays straight', Math.abs(deg(v.yaw)) < 1.5 && Math.abs(v.vs) < 0.3, `yaw ${deg(v.yaw).toFixed(2)}°, side speed ${v.vs.toFixed(2)} m/s at ${v.kmh.toFixed(0)} km/h`);
  run(v, 6, (c) => { c.in.throttle = 0; c.in.brake = c.kmh > 0.5 ? 1 : 0; }); // release at a standstill (holding it selects reverse)
  run(v, 3, (c) => { c.in.brake = 0; });
  check('brakes to a stop and does not creep', v.kmh < 0.3, `${v.kmh.toFixed(2)} km/h after braking + 3 s`);
}
{
  const v = car(); cruise(v, 60, 8);
  const loads0 = v.wheels.map((w) => w.load);
  run(v, 1.5, (c) => { c.in.throttle = 0.25; c.in.steer = -0.25; });
  const outside = v.wheels[1].load + v.wheels[3].load, inside = v.wheels[0].load + v.wheels[2].load;
  check('weight moves to the outside wheels in a turn', outside > inside * 1.3, `left turn: outside ${outside.toFixed(0)} N vs inside ${inside.toFixed(0)} N (straight ${loads0.map((l) => l.toFixed(0)).join('/')})`);
  check('body rolls to the outside', v.roll > 0.005, `roll ${deg(v.roll).toFixed(2)}° (right side down)`);
}

/* ------------------------------------------------------- drift initiation */
// handbrake entry: turn in, pull the handbrake briefly, then gas
{
  const v = car(); cruise(v, 60, 7);
  const mb = run(v, 2.5, (c, t) => { c.in.steer = t < 0.9 ? -0.7 : -0.15; c.in.hand = t > 0.15 && t < 0.6 ? 1 : 0; c.in.throttle = t > 0.6 ? 1 : 0; });
  check('handbrake starts a drift (RWD)', mb > 20, `max drift angle ${mb.toFixed(0)}°`);
}
// clutch kick: steady in a corner, kick the clutch with full throttle
{
  const v = car(); cruise(v, 55, 7);
  const mb = run(v, 2.5, (c, t) => { c.in.steer = -0.5; c.in.throttle = 1; if (Math.abs(t - 0.3) < DT / 2) c.in.clutchKick = true; });
  const v2 = car(); cruise(v2, 55, 7);
  const base = run(v2, 0.6, (c) => { c.in.steer = -0.5; c.in.throttle = 0.35; });
  check('clutch kick starts a drift', mb > 20, `with kick ${mb.toFixed(0)}° (same corner on part throttle: ${base.toFixed(0)}°)`);
}
// power-over: low gear, steer in and floor it
{
  const v = car(); cruise(v, 45, 6);
  const mb = run(v, 2.0, (c) => { c.in.steer = -0.55; c.in.throttle = 1; });
  check('power-over starts a drift (RWD)', mb > 20, `max drift angle ${mb.toFixed(0)}°`);
}

/* ------------------------------------------------------- holding a drift */
// a "skilled driver": counter-steer to keep the front tyres just inside the slide and
// modulate the throttle to keep the angle near 30°
function holdDrift(id, secs = 8, targetDeg = 30) {
  // enter in 2nd gear like a real driver: get up to speed, settle at ~58 km/h, handbrake entry
  const v = car(id); cruise(v, 75, 9);
  run(v, 2, (c) => { c.in.throttle = 0; c.in.brake = c.kmh > 58 ? 0.5 : 0; });
  run(v, 0.6, (c, t) => { c.in.brake = 0; c.in.steer = -0.7; c.in.hand = t < 0.35 ? 1 : 0; c.in.throttle = t > 0.35 ? 1 : 0; });
  const dir = Math.sign(v.beta) || -1, bt = dir * targetDeg * Math.PI / 180;
  let minB = 999, maxB = 0, sumKmh = 0, n = 0, integ = 0, pb = v.beta, side = 0;
  for (let i = 0; i < secs / DT; i++) {
    const b = v.beta, db = (b - pb) / DT; pb = b;
    const e = deg(Math.abs(b)) - targetDeg, de = dir * deg(db); // + = too much angle / angle growing
    // counter-steer: front wheels along the direction of travel, corrected by the angle error and its rate
    const free = Math.atan2(-(v.vs - v.w * v.a), Math.max(Math.abs(v.vf), 0.5));
    v.in.steer = clamp(-(free + (b - bt) * 0.8 + db * 0.25) / v.c.lock, -1, 1);
    v.in.analog = true; v.in.analogPedals = true; v.in.hand = 0;
    // throttle: more gas swings the rear out, less brings it back
    integ = clamp(integ + e * DT, -15, 15);
    v.in.throttle = clamp(0.45 - e * 0.06 - integ * 0.02 - de * 0.03, 0, 1);
    v.step(DT, flat);
    const a = deg(Math.abs(v.beta));
    if (i > 60) { minB = Math.min(minB, a); maxB = Math.max(maxB, a); if (a > 10) side++; }
    sumKmh += v.kmh; n++;
  }
  return { minB, maxB, avgKmh: sumKmh / n, sideways: side / (n - 61) };
}
for (const id of ['kaito', 'hoshi', 'valkor', 'adler', 'strassen']) {
  const r = holdDrift(id);
  check(`${id}: long drift held with counter-steer + throttle (8 s)`, r.maxB < 60 && r.sideways > 0.7, `no spin; angle ${r.minB.toFixed(0)}..${r.maxB.toFixed(0)}°, sideways (>10°) ${(r.sideways * 100).toFixed(0)}% of the time at ~${r.avgKmh.toFixed(0)} km/h`);
}

/* ------------------------------------------------------------ mistakes */
// too much throttle and no counter-steer -> spin
{
  const v = car(); cruise(v, 45, 6);
  const mb = run(v, 3, (c) => { c.in.steer = -0.6; c.in.throttle = 1; });
  check('too much throttle without counter-steer spins', mb > 90, `max drift angle ${mb.toFixed(0)}°`);
}
// counter-steer but far too little (wheel held straight) with full throttle -> still spins
{
  const v = car(); cruise(v, 50, 6);
  const mb = run(v, 3, (c, t) => { c.in.steer = t < 0.6 ? -0.6 : 0.05; c.in.analog = true; c.in.throttle = 1; });
  check('too little counter-steer spins', mb > 90, `max drift angle ${mb.toFixed(0)}°`);
}

/* ---------------------------------------------------------- AWD vs RWD */
{
  const powerOver = (id) => { const v = car(id); cruise(v, 45, 6); return run(v, 2.0, (c) => { c.in.steer = -0.55; c.in.throttle = 1; }); };
  const rwd = powerOver('kaito'), awd = powerOver('shogun');
  check('AWD car is harder to power-over than RWD', awd < rwd * 0.6, `same input: RWD ${rwd.toFixed(0)}°, AWD ${awd.toFixed(0)}°`);
}

/* ----------------------------------------------------------- all cars */
for (const id of Object.keys(CAR_SPECS)) {
  const v = car(id); cruise(v, 60, 7);
  const mb = run(v, 2.5, (c, t) => { c.in.steer = t < 0.9 ? -0.7 : -0.15; c.in.hand = t > 0.15 && t < 0.6 ? 1 : 0; c.in.throttle = t > 0.6 ? 1 : 0; });
  const fine = Number.isFinite(v.x + v.z + v.yaw);
  check(`${id}: handbrake entry kicks the rear out (no NaN)`, fine && mb > 20, `max angle ${mb.toFixed(0)}°, ${v.kmh.toFixed(0)} km/h`);
}

/* ------------------------------------------------- robustness, timing */
{
  const v = car(); cruise(v, 80, 8);
  v.step(5, flat); // huge dt (tab switch)
  check('huge time step is clamped (no explosion)', Number.isFinite(v.x) && v.kmh < 120, `${v.kmh.toFixed(0)} km/h after a 5 s step`);
  const t0 = performance.now(); const N = 120 * 20;
  run(v, 20, (c, t) => { c.in.steer = Math.sin(t) * 0.8; c.in.throttle = 1; c.in.hand = t % 3 < 0.3 ? 1 : 0; });
  const per = (performance.now() - t0) / N;
  check('physics cost per 120 Hz step', per < 0.25, `${(per * 1000).toFixed(1)} µs per step (4 substeps) = ${(per * 2).toFixed(3)} ms per 60 FPS frame`);
}

console.table(results);
if (failures) { console.log(`${failures} test(s) failed`); process.exit(1); } else console.log('all physics tests passed');
