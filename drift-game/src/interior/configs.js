// Interior configuration per car (all fictional). Positions come from each car's cockpit dimensions
// (driver eye, dash height/depth, set in the car builders); these values add the character:
//   lockToLock: steering-wheel degrees from full left to full right (road cars ~900, drift cars quicker)
//   wheelR: rim radius m · spokes: 2 | 3 · shifter: 'h' (H-pattern) | 'seq' (sequential)
//   accent: stitching, 12 o'clock marker, gauge needles · leather / trim: colours · mark: brand-mark id
//   gaugeStyle: face colour · radio: fictional head-unit name
export const INTERIOR = {
  kaito: { lockToLock: 540, wheelR: 0.175, spokes: 3, shifter: 'h', accent: '#d0201a', leather: '#2f2c2b', trim: '#3d4048', mark: 'kaito', gaugeFace: '#0c0d10', radio: 'AURORA' },
  hoshi: { lockToLock: 600, wheelR: 0.17, spokes: 3, shifter: 'h', accent: '#f2c80f', leather: '#2b2b2e', trim: '#47484e', mark: 'hoshi', gaugeFace: '#101114', radio: 'AURORA' },
  shogun: { lockToLock: 720, wheelR: 0.18, spokes: 3, shifter: 'seq', accent: '#2f7bff', leather: '#25262b', trim: '#31343a', mark: 'shogun', gaugeFace: '#0a0b0e', radio: 'KESTREL' },
  valkor: { lockToLock: 900, wheelR: 0.185, spokes: 3, shifter: 'h', accent: '#3d7bd9', leather: '#39322e', trim: '#4a4744', mark: 'valkor', gaugeFace: '#0d0e11', radio: 'KESTREL' },
  adler: { lockToLock: 600, wheelR: 0.18, spokes: 2, shifter: 'h', accent: '#e02b2b', leather: '#282828', trim: '#37393d', mark: 'adler', gaugeFace: '#0b0b0d', radio: 'AURORA' },
  strassen: { lockToLock: 540, wheelR: 0.17, spokes: 3, shifter: 'h', accent: '#f2c80f', leather: '#47362b', trim: '#403c36', mark: 'strassen', gaugeFace: '#0e0d0c', radio: 'KESTREL' },
};
export const interiorFor = (id) => INTERIOR[id] || INTERIOR.kaito;

// player settings for the cockpit camera (settings screen), saved in localStorage
export const COCKPIT_DEFAULTS = { fov: 70, seatZ: 0, seatY: 0, head: 1, apex: true };
const KEY = 'driftgame.cockpit';
export function loadCockpitSettings() { try { return { ...COCKPIT_DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch (e) { return { ...COCKPIT_DEFAULTS }; } }
// one shared, live settings object (the settings screen edits it, both game modes read it every frame)
export const cockpitSettings = (() => { try { return { ...COCKPIT_DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch (e) { return { ...COCKPIT_DEFAULTS }; } })();
export function saveCockpitSettings(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage blocked */ } }
