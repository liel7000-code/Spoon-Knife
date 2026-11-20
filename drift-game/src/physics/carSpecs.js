// Full physics configuration of every car in drift mode. Pure data (no Three.js).
// Wheel positions and radii match each car's 3D model (mesh z: front axle is negative).
//
//   mass kg · weightFront share of weight on the front axle · cgHeight m (centre of mass height)
//   frontZ/rearZ mesh z of the axles (wheelbase = rearZ - frontZ) · trackF/trackR half track m
//   wheelR m · wheelInertia kg m² · yawInertia scale on m·a·b
//   torque [[rpm, Nm], ...] · idle / redline / limiter rpm · torqueScale · engineBrake (share of max torque)
//   engineInertia kg m² · clutchTorque Nm · gears ratios · reverse · final · efficiency · shiftTime s
//   drive 'rwd' | 'awd' (rearSplit = share of torque to the rear) · diff { type 'open'|'lsd'|'locked', lock 0..1, preload Nm }
//   muF/muR tyre friction · peakAngle rad · peakRatio · shapeC/shapeE Magic Formula shape · loadSens · relax m
//   springF/springR N/m per wheel · bump/rebound N s/m · arbF/arbR N/m · travel m
//   lockDeg max steering lock · ackermann 0 (parallel) .. 1 (full) · steerRate rad/s
//   brakeTorque Nm (all wheels) · brakeBias front share · handbrakeTorque Nm (rear axle)
//   dragArea Cd·A m² · downforce Cl·A m² · downforceFront share
const BASE = {
  wheelInertia: 1.3, yawInertia: 1.05, torqueScale: 1, engineBrake: 0.16, engineInertia: 0.2, efficiency: 0.88, shiftTime: 0.14,
  drive: 'rwd', rearSplit: 1, diffFront: 'open', diffFrontLock: 0,
  peakAngle: 0.13, peakRatio: 0.11, shapeC: 1.45, shapeE: -0.4, loadSens: 0.14, relax: 0.35,
  bump: 3400, rebound: 5200, travel: 0.13,
  ackermann: 0.35, steerRate: 3.0,
  handbrakeTorque: 4200, dragArea: 0.66, downforce: 0.12, downforceFront: 0.45,
};

export const CAR_SPECS = {
  // 90s GT coupe, twin-turbo inline six, LSD: the balanced all-rounder
  kaito: {
    ...BASE, mass: 1480, weightFront: 0.53, cgHeight: 0.48, frontZ: -1.33, rearZ: 1.22, trackF: 0.765, trackR: 0.765, wheelR: 0.335,
    torque: [[1000, 300], [2000, 390], [3000, 480], [4000, 550], [5000, 565], [6000, 540], [7000, 480], [7600, 420]],
    idle: 850, redline: 7200, limiter: 7500, clutchTorque: 850,
    gears: [3.55, 2.2, 1.52, 1.16, 0.94, 0.79], reverse: 3.4, final: 3.9,
    diff: { type: 'lsd', lock: 0.55, preload: 80 },
    muF: 1.06, muR: 1.08, springF: 52000, springR: 46000, arbF: 26000, arbR: 12000,
    lockDeg: 52, brakeTorque: 6200, brakeBias: 0.66,
  },
  // light, high-revving rotary-style coupe: nimble, needs revs, easy to flick
  hoshi: {
    ...BASE, mass: 1260, weightFront: 0.5, cgHeight: 0.45, frontZ: -1.24, rearZ: 1.185, trackF: 0.745, trackR: 0.745, wheelR: 0.315,
    wheelInertia: 1.1, yawInertia: 0.95, engineInertia: 0.15,
    torque: [[1000, 170], [3000, 240], [5000, 290], [6500, 310], [7500, 300], [8500, 265], [9000, 240]],
    idle: 1000, redline: 8500, limiter: 8800, clutchTorque: 520,
    gears: [3.48, 2.02, 1.39, 1.07, 0.85, 0.72], reverse: 3.2, final: 4.4,
    diff: { type: 'lsd', lock: 0.5, preload: 60 },
    muF: 1.06, muR: 1.07, springF: 46000, springR: 42000, arbF: 22000, arbR: 11000,
    lockDeg: 55, brakeTorque: 5200, brakeBias: 0.64,
  },
  // heavy AWD supercar, 40/60 split: huge traction, pushes wide, hard to keep sideways
  shogun: {
    ...BASE, mass: 1640, weightFront: 0.55, cgHeight: 0.5, frontZ: -1.36, rearZ: 1.305, trackF: 0.755, trackR: 0.755, wheelR: 0.34,
    wheelInertia: 1.5, yawInertia: 1.12,
    torque: [[1000, 340], [2500, 500], [4000, 590], [5500, 590], [6500, 520], [7300, 460]],
    idle: 850, redline: 7000, limiter: 7300, clutchTorque: 900,
    gears: [3.83, 2.36, 1.69, 1.31, 1.0, 0.79], reverse: 3.5, final: 3.7,
    drive: 'awd', rearSplit: 0.6, diffFront: 'open',
    diff: { type: 'lsd', lock: 0.35, preload: 60 },
    muF: 1.1, muR: 1.1, springF: 60000, springR: 54000, arbF: 30000, arbR: 18000,
    lockDeg: 46, brakeTorque: 7400, brakeBias: 0.64, downforce: 0.2,
  },
  // German-style super-sedan: heavy, long, lots of torque, lazy to rotate but very stable
  valkor: {
    ...BASE, mass: 1850, weightFront: 0.53, cgHeight: 0.52, frontZ: -1.555, rearZ: 1.425, trackF: 0.8, trackR: 0.8, wheelR: 0.355,
    wheelInertia: 1.6, yawInertia: 1.15, engineInertia: 0.24,
    torque: [[1000, 420], [2000, 640], [3500, 740], [5500, 740], [6500, 650], [7000, 590]],
    idle: 750, redline: 6900, limiter: 7100, clutchTorque: 1150,
    gears: [4.0, 2.6, 1.7, 1.27, 1.0, 0.82], reverse: 3.6, final: 3.15,
    diff: { type: 'lsd', lock: 0.45, preload: 100 },
    muF: 1.05, muR: 1.07, springF: 62000, springR: 58000, arbF: 30000, arbR: 16000,
    lockDeg: 48, brakeTorque: 8200, brakeBias: 0.65, dragArea: 0.7,
  },
  // muscular V8 sedan with a welded (locked) diff: loud, loose, wants to go sideways
  adler: {
    ...BASE, mass: 1720, weightFront: 0.55, cgHeight: 0.5, frontZ: -1.545, rearZ: 1.295, trackF: 0.79, trackR: 0.79, wheelR: 0.345,
    wheelInertia: 1.5, yawInertia: 1.08, engineInertia: 0.23,
    torque: [[1000, 380], [2500, 600], [4000, 680], [5500, 650], [6500, 560], [7200, 500]],
    idle: 750, redline: 7000, limiter: 7200, clutchTorque: 1050,
    gears: [3.8, 2.4, 1.62, 1.22, 1.0, 0.82], reverse: 3.5, final: 3.3,
    diff: { type: 'locked', lock: 1, preload: 0 },
    muF: 1.04, muR: 1.04, springF: 58000, springR: 52000, arbF: 32000, arbR: 14000,
    lockDeg: 50, brakeTorque: 7600, brakeBias: 0.67,
  },
  // classic rear-engine widebody: light, 40/60 weight, short wheelbase, pendulum effect
  strassen: {
    ...BASE, mass: 1210, weightFront: 0.4, cgHeight: 0.44, frontZ: -1.3, rearZ: 0.97, trackF: 0.82, trackR: 0.853, wheelR: 0.315,
    wheelInertia: 1.1, yawInertia: 0.9, engineInertia: 0.17,
    torque: [[1000, 220], [3000, 300], [5000, 360], [6500, 365], [7500, 345], [8200, 320]],
    idle: 900, redline: 8000, limiter: 8300, clutchTorque: 620,
    gears: [3.5, 2.12, 1.5, 1.17, 0.94, 0.79], reverse: 3.3, final: 4.1,
    diff: { type: 'lsd', lock: 0.6, preload: 70 },
    muF: 1.05, muR: 1.1, springF: 44000, springR: 54000, arbF: 24000, arbR: 10000,
    lockDeg: 54, brakeTorque: 5600, brakeBias: 0.58, downforce: 0.16, downforceFront: 0.35,
  },
};

export const specFor = (id) => CAR_SPECS[id] || CAR_SPECS.kaito;
