// Tunable settings. Everything that changes how the game feels lives here.
export const CONFIG = {
  steering: {
    rampUp: 2.6,          // keyboard steer input rise per second (0 -> 1 takes ~0.4 s)
    rampDown: 4.5,        // return-to-centre rate when the key is released
    reverse: 7,           // rate when flicking from one side to the other
    maxWheelAngle: 0.38,  // radians of front-wheel lock at walking pace
    falloffSpeed: 2.8,    // m/s; higher = less understeer at speed (wheel angle / (1 + v / falloff))
    centerAssist: 2.4,    // pulls the car back parallel to the road when hands are off (0 = none)
    maxHeading: 0.62,     // radians the car may point away from the road direction
    sensitivity: 1.0,     // global multiplier on steering
  },
  grip: {
    yawResponse: 9,       // how fast the yaw rate follows the steering (higher = sharper)
    maxLatAccel: 14,      // m/s^2 of cornering the tyres allow (caps yaw rate at speed)
    lateral: 8.5,         // how fast the velocity direction follows the heading (lower = more slide)
    slipSpeed: 42,        // m/s; above this the tyres let go progressively (more drift)
    scrub: 0.6,           // speed lost while sliding sideways
    skidThreshold: 0.03,  // slip angle (rad) where smoke and skid marks start
  },
  barrier: {
    crashNormalSpeed: 9,   // m/s into the barrier that counts as a crash instead of a scrape
    scrapeDrag: 1.6,       // speed lost per second while scraping
    pushback: 0.35,        // steering kick away from the barrier
  },
  nearMiss: { near: 1.0, edge: 0.45, split: 1.6, comboTime: 3 }, // metres between car edges
  score: {
    minSpeed: 120,   // km/h: below this nothing is scored
    speedRate: 0.4,  // points per second per km/h above (minSpeed - 30), times the multiplier
    maxMult: 10,
    decayDelay: 4,   // seconds without a risky move before the multiplier starts to fall
    decayRate: 0.35, // multiplier lost per second after that
    slowReset: 3,    // seconds below minSpeed that wipe the multiplier
  },
  traffic: {
    laneChangeChance: 0.05, // per car per second (grows with difficulty)
    signalTime: 1.5,        // seconds of indicator before moving
    changeTime: 2.8,        // seconds to cross one lane
    wobble: 0.12,           // metres of natural side-to-side drift
  },
};

// Per-car feel. Multipliers on the shared steering/grip settings above, plus exhaust character.
//   steer: wheel angle (quicker steering)   grip: lateral grip      lat: cornering limit (m/s^2 cap)
//   yaw: how fast the car rotates into a turn (lower = heavier, more stable)
//   flames / flameTime: backfire size and duration   exhaust: exhaust/engine loudness
export const CAR_TUNING = {
  kaito: { steer: 1.0, grip: 1.0, lat: 1.0, yaw: 1.0, flames: 1.0, flameTime: 1.0, exhaust: 1.0 },
  hoshi: { steer: 1.12, grip: 1.02, lat: 1.04, yaw: 1.15, flames: 1.0, flameTime: 0.9, exhaust: 0.9 },
  shogun: { steer: 0.95, grip: 1.06, lat: 1.0, yaw: 0.95, flames: 1.0, flameTime: 1.0, exhaust: 1.0 },
  valkor: { steer: 0.86, grip: 0.94, lat: 0.9, yaw: 0.78, flames: 1.0, flameTime: 1.0, exhaust: 1.1 },   // heavy, stable, fast
  adler: { steer: 0.95, grip: 0.95, lat: 0.95, yaw: 0.9, flames: 1.9, flameTime: 2.0, exhaust: 1.55 }, // loudest, biggest flames
  strassen: { steer: 1.32, grip: 1.12, lat: 1.16, yaw: 1.35, flames: 1.15, flameTime: 1.0, exhaust: 1.15 }, // lightest, sharpest
};
export const tuningFor = (id) => ({ steer: 1, grip: 1, lat: 1, yaw: 1, flames: 1, flameTime: 1, exhaust: 1, ...(CAR_TUNING[id] || {}) });

export const QUALITY = {
  low: { label: 'נמוכה', pixelRatio: 1.25, roadRes: 1024, shadows: false, shadowSize: 0, post: false, bloom: false, ao: false, clouds: false, scenery: 0.6, headlights: false },
  medium: { label: 'בינונית', pixelRatio: 2, roadRes: 1536, shadows: true, shadowSize: 2048, post: true, bloom: true, ao: false, clouds: true, scenery: 0.85, headlights: true },
  high: { label: 'גבוהה', pixelRatio: 2, roadRes: 2048, shadows: true, shadowSize: 2048, post: true, bloom: true, ao: true, clouds: true, scenery: 1, headlights: true },
};
export const QUALITY_ORDER = ['high', 'medium', 'low'];

/* ------------------------------------------------------------ drift mode */
// Drift physics per car (rear-wheel drive in drift mode, a deliberate choice for the
// Shogun too: its "drift setup" sends everything to the rear).
//   mass kg, power kW, muF/muR front/rear tyre friction, lock = max front-wheel angle (rad),
//   wb = wheelbase m, front = share of weight on the front axle, inertia = yaw inertia scale,
//   cgH = centre of gravity height m, top = top speed km/h
export const DRIFT_TUNING = {
  kaito: { mass: 1450, power: 330, muF: 1.02, muR: 1.08, lock: 0.66, wb: 2.55, front: 0.53, inertia: 1.0, cgH: 0.5, top: 240 },
  hoshi: { mass: 1250, power: 250, muF: 1.04, muR: 1.09, lock: 0.7, wb: 2.43, front: 0.5, inertia: 0.88, cgH: 0.46, top: 225 },
  shogun: { mass: 1560, power: 380, muF: 1.05, muR: 1.12, lock: 0.6, wb: 2.67, front: 0.55, inertia: 1.08, cgH: 0.52, top: 250 },
  valkor: { mass: 1830, power: 440, muF: 1.0, muR: 1.06, lock: 0.56, wb: 2.98, front: 0.53, inertia: 1.2, cgH: 0.54, top: 255 },
  adler: { mass: 1720, power: 400, muF: 1.0, muR: 1.03, lock: 0.6, wb: 2.84, front: 0.55, inertia: 1.12, cgH: 0.53, top: 245 },
  strassen: { mass: 1180, power: 290, muF: 1.0, muR: 1.07, lock: 0.72, wb: 2.27, front: 0.4, inertia: 0.82, cgH: 0.45, top: 230 },
};
export const driftTuningFor = (id) => ({ ...DRIFT_TUNING.kaito, ...(DRIFT_TUNING[id] || {}) });

export const DRIFT = {
  gravity: 9.81,
  peakSlipF: 0.13, peakSlipR: 0.11, // slip angle (rad) where a tyre gives its most grip
  slideGrip: 0.82,                  // fraction of peak grip left when fully sliding
  brakeG: 1.0,                      // brake force in g
  handbrakeGrip: 0.45,              // rear lateral grip while the handbrake locks the wheels
  dragArea: 0.72, rolling: 0.015,
  steerRate: 4.2, steerReturn: 6.5, // keyboard steering speed (lock fractions per second)
  throttleRate: 5, throttleDrop: 9,
  clutchKick: { time: 0.3, boost: 2.2 },
  offroadGrip: 0.62, offroadDrag: 0.9, // run-off surface
  assist: {
    counterGain: 1.05,  // counter-steer assist: front wheels follow the slide
    holdAngle: 0.62,    // drift assist: angle (rad) it tries not to go beyond
    yawDamp: 7,         // drift assist: correction strength past holdAngle
    sustain: 0.12,      // drift assist: extra drive that keeps a slide from dying
  },
  score: {
    minAngle: 12, minKmh: 25, rate: 0.12, // points per second = angle deg * km/h * rate * multiplier
    straightGrace: 0.75, slowGrace: 1.0,  // seconds before a straightened/slow drift ends
    linkMult: 0.5, maxMult: 5,
    zone: 500, point: 300, longEvery: 5, long: 1000, spin360: 2000,
    proximity: 1.3, proximityRate: 400, wallHit: 3.0,
  },
};
