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

export const QUALITY = {
  low: { label: 'נמוכה', pixelRatio: 1, shadows: false, shadowSize: 0, post: false, bloom: false, ao: false, clouds: false, scenery: 0.6, headlights: false },
  medium: { label: 'בינונית', pixelRatio: 1.5, shadows: true, shadowSize: 1024, post: true, bloom: true, ao: false, clouds: true, scenery: 0.85, headlights: true },
  high: { label: 'גבוהה', pixelRatio: 2, shadows: true, shadowSize: 2048, post: true, bloom: true, ao: true, clouds: true, scenery: 1, headlights: true },
};
export const QUALITY_ORDER = ['high', 'medium', 'low'];
