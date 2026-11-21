// Entry point: renderer, fixed-timestep loop, screen flow.
// self-hosted SIL OFL fonts (Fontsource packages, licence texts in licenses/)
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
import '@fontsource/heebo/latin-400.css';
import '@fontsource/heebo/latin-500.css';
import '@fontsource/heebo/latin-700.css';
import '@fontsource/heebo/latin-800.css';
import '@fontsource/heebo/hebrew-400.css';
import '@fontsource/heebo/hebrew-500.css';
import '@fontsource/heebo/hebrew-700.css';
import '@fontsource/heebo/hebrew-800.css';
import './style.css';
import * as THREE from 'three';
import { PLAYER_CARS } from './cars.js';
import { Game } from './game.js';
import { Showroom } from './showroom.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { EngineAudio } from './audio.js';
import { QUALITY, QUALITY_ORDER, QUALITY_DOWN } from './config.js';
import { DriftGame } from './drift/driftGame.js';
import { DriftUI } from './drift/driftUI.js';
import { TRACKS } from './drift/trackData.js';
import { loadTune, saveTune, resetTune } from './drift/tune.js';
import { FLAKES } from './textures.js';

const STEP = 1 / 120; // fixed logic step (seconds)
const MAX_FRAME = 0.1;

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
};

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.68;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;


const settings = {
  car: store.get('driftgame.car', 0),
  colors: store.get('driftgame.colors', {}),
  cam: store.get('driftgame.cam', 'third'),
  quality: store.get('driftgame.quality', 'auto'),
  style: store.get('driftgame.heroStyle', 'stock'),
  night: store.get('driftgame.night', false),
  mode: 'highway',
  track: store.get('driftgame.track', 0),
  session: store.get('driftgame.session', 'attack'),
  assist: store.get('driftgame.assist2', null),
};
if (!TRACKS[settings.track]) settings.track = 0;
// drift assists: level (beginner / pro / sim) + traction control, ABS, manual gearbox. TC and ABS are off by
// default in drift mode (they fight a slide); older saves stored only a level name
if (!settings.assist || typeof settings.assist !== 'object') {
  const old = store.get('driftgame.assist', null);
  const level = { drift: 'beginner', counter: 'pro', off: 'sim' }[old] || (Input.isTouch() ? 'beginner' : 'pro');
  settings.assist = { level, tc: false, abs: false, manual: false };
}
const saveAssist = () => { store.set('driftgame.assist2', settings.assist); dui.setAssist(settings.assist); if (drift) drift.setAssist(settings.assist); document.getElementById('touch').classList.toggle('manual', !!settings.assist.manual); };
let tuneDraft = null;
if (!QUALITY[settings.quality] && settings.quality !== 'auto') settings.quality = 'auto';
// 'auto': start at a level that suits the device, step down when the frame rate stays low
let autoLevel = Input.isTouch() ? 'medium' : 'high';
const levelName = () => (settings.quality === 'auto' ? autoLevel : settings.quality);
const Q = () => QUALITY[levelName()];
const qualityLabel = () => (settings.quality === 'auto' ? `אוטומטית · ${QUALITY[autoLevel].label}` : Q().label);
// pixel ratio: device ratio capped at 2 (or the quality preset's cap); the adaptive
// fallback in the loop steps it down if the frame rate drops
let pixelRatio = 1;
const applyPixelRatio = () => { pixelRatio = Math.min(window.devicePixelRatio || 1, Q().pixelRatio); renderer.setPixelRatio(pixelRatio); };
applyPixelRatio();
if (!PLAYER_CARS[settings.car]) settings.car = 0;
const colorOf = (i) => settings.colors[PLAYER_CARS[i].id] || PLAYER_CARS[i].color;
const styleOf = (i) => (PLAYER_CARS[i].styles ? settings.style : 'stock');
const showCar = () => showroom.setCar(PLAYER_CARS[settings.car], colorOf(settings.car), styleOf(settings.car));

const audio = new EngineAudio();
const input = new Input();
const tiltBtn = document.getElementById('btnTilt');
tiltBtn.addEventListener('click', async () => {
  const on = await input.setTilt(!input.tiltEnabled); // asks for motion permission on iOS
  tiltBtn.setAttribute('aria-pressed', String(on));
  tiltBtn.parentElement.classList.toggle('tilting', on);
});
const showroom = new Showroom(renderer);
let screen = 'menu';

const ui = new UI({
  onStart: () => (settings.mode === 'drift' && screen === 'garage' ? go('tracks') : startRun()),
  onGarage: () => { settings.mode = 'highway'; go('garage'); },
  onBack: () => go('menu'),
  onCar: (dir) => {
    settings.car = (settings.car + dir + PLAYER_CARS.length) % PLAYER_CARS.length;
    store.set('driftgame.car', settings.car);
    showCar();
    ui.setGarage(settings.car, colorOf(settings.car), settings.style);
    refreshMenu();
  },
  onColor: (c) => {
    settings.colors[PLAYER_CARS[settings.car].id] = c;
    store.set('driftgame.colors', settings.colors);
    showroom.setColor(c);
    ui.setColor(c);
  },
  onTime: () => {
    settings.night = !settings.night;
    store.set('driftgame.night', settings.night);
    game.setTime(settings.night);
    ui.setTime(settings.night);
  },
  onCamPref: () => {
    const order = ['third', 'bumper', 'first'];
    settings.cam = order[(order.indexOf(settings.cam) + 1) % order.length];
    store.set('driftgame.cam', settings.cam);
    ui.setCamPref(settings.cam);
  },
  onMute: () => { audio.setMuted(!audio.muted); ui.setMuted(audio.muted); },
  onMusic: () => { audio.init(); audio.setMusic(!audio.musicOn); ui.setMusic(audio.musicOn); },
  onStyle: (st) => {
    settings.style = st;
    store.set('driftgame.heroStyle', st);
    showCar();
    ui.setGarage(settings.car, colorOf(settings.car), settings.style);
  },
  onQuality: () => {
    settings.quality = QUALITY_ORDER[(QUALITY_ORDER.indexOf(settings.quality) + 1) % QUALITY_ORDER.length];
    store.set('driftgame.quality', settings.quality);
    applyQuality();
  },
  onCamToggle: () => toggleCam(),
  onRetry: () => startRun(),
  onMenu: () => { game.stop(); go('menu'); },
});

const game = new Game(renderer, {
  ui, audio, input, quality: Q(),
  onGameOver: (result) => { ui.gameOver(result); go('over'); },
});

function toggleCam() {
  if (game.state === 'idle') return;
  settings.cam = game.toggleCamera();
  store.set('driftgame.cam', settings.cam);
  ui.setCamPref(settings.cam);
}

input.onCamera = () => toggleCam();

/* ------------------------------------------------------------- drift mode */
let drift = null;
const getDrift = () => drift || (drift = new DriftGame(renderer, {
  ui: dui, audio, input, quality: Q(),
  onFinish: (res) => { dui.results(res); go('dover'); },
}));
const dui = new DriftUI({
  onBack: (from) => go(from === 'sessions' ? 'tracks' : 'garage'),
  onTrack: (i) => { settings.track = i; store.set('driftgame.track', i); go('sessions'); },
  onSession: (id) => { settings.session = id; store.set('driftgame.session', id); dui.renderSessions(settings.track, id, settings.assist); },
  onAssist: (level) => { settings.assist = { ...settings.assist, level }; saveAssist(); },
  onToggle: (key) => { settings.assist = { ...settings.assist, [key]: !settings.assist[key] }; saveAssist(); },
  onTune: () => { tuneDraft = loadTune(PLAYER_CARS[settings.car].id); dui.renderTune(PLAYER_CARS[settings.car], tuneDraft); go('tune'); },
  onTuneChange: (k, v) => { tuneDraft[k] = v; },
  onTuneClose: (save) => { if (save && tuneDraft) saveTune(PLAYER_CARS[settings.car].id, tuneDraft); tuneDraft = null; go('sessions'); },
  onTuneReset: () => { tuneDraft = resetTune(PLAYER_CARS[settings.car].id); dui.renderTune(PLAYER_CARS[settings.car], tuneDraft); },
  onDebug: () => toggleDebug(),
  onStart: () => startDrift(),
  onPause: () => pauseDrift(),
  onResume: () => { drift.resume(); go('drift'); },
  onEnd: () => { drift.state = 'play'; drift.finish(); },
  onQuit: () => { if (drift) drift.stop(); leaveDrift(); go('menu'); },
  onReplay: () => { if (drift.startReplay()) go('replay'); },
  onReplayExit: () => { drift.stopReplay(); go('dover'); },
  onTracks: () => { drift.stop(); leaveDrift(); go('tracks'); },
  onCam: () => { settings.cam = drift.toggleCamera(); store.set('driftgame.cam', settings.cam); ui.setCamPref(settings.cam); },
});
document.getElementById('btnDrift').addEventListener('click', () => { settings.mode = 'drift'; go('garage'); });

function startDrift() {
  audio.init();
  const d = getDrift();
  d.start({ carIndex: settings.car, color: colorOf(settings.car), style: styleOf(settings.car), trackIndex: settings.track, session: settings.session, assist: settings.assist, cam: settings.cam });
  resize();
  // compile every shader of the track during the countdown instead of stalling on the first frames
  if (renderer.compileAsync && renderer.extensions.has('KHR_parallel_shader_compile')) renderer.compileAsync(d.scene, d.camera).catch(() => {});
  acc = 0;
  go('drift');
}
function ui_tuneClose() { dui.h.onTuneClose(false); }
function toggleDebug() { if (drift) drift.setDebug(!drift.debug); }
input.onDebug = () => { if (screen === 'drift' || screen === 'dpause') toggleDebug(); };
function pauseDrift() { if (drift && (drift.state === 'play' || drift.state === 'countdown')) { drift.pause(); go('dpause'); } }
// back to the highway look (its exposure and shadow settings) when leaving drift mode
function leaveDrift() { game.setTime(settings.night); game.setQuality(Q()); }
const DRIFT_SCREENS = ['drift', 'dpause', 'dover', 'replay'];

function refreshMenu() {
  ui.setMenu({ carName: PLAYER_CARS[settings.car].name, best: game.best });
}

function go(name) {
  screen = name;
  const driftScreen = { tracks: 'tracks', sessions: 'sessions', tune: 'tune', drift: 'hud', dpause: 'pause', dover: 'results', replay: 'replay' }[name];
  ui.show(name === 'play' ? 'hud' : driftScreen ? '_none' : name, Input.isTouch());
  if (driftScreen) dui.show(driftScreen); else dui.hideAll();
  const touch = document.getElementById('touch');
  touch.classList.toggle('drift', name === 'drift');
  touch.classList.toggle('manual', !!settings.assist.manual);
  if (name === 'drift') touch.hidden = false;
  document.getElementById('garageStart').textContent = settings.mode === 'drift' ? 'המשך לבחירת מסלול' : 'התחל';
  if (name === 'tracks') dui.renderTracks(PLAYER_CARS[settings.car], settings.track);
  if (name === 'sessions') dui.renderSessions(settings.track, settings.session, settings.assist);
  if (name === 'menu') refreshMenu();
  if (name === 'garage') ui.setGarage(settings.car, colorOf(settings.car), settings.style);
  for (const b of document.querySelectorAll('button')) b.blur();
}

function startRun() {
  audio.init();
  settings.mode = 'highway';
  if (drift && drift.state !== 'idle') { drift.stop(); }
  leaveDrift();
  game.start(settings.car, colorOf(settings.car), settings.cam, styleOf(settings.car));
  acc = 0;
  go('play');
}

// keyboard shortcuts outside of play
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === 'enter' && (screen === 'menu' || screen === 'over')) startRun();
  else if (k === 'enter' && screen === 'garage') ui.h.onStart();
  else if (k === 'enter' && (screen === 'sessions' || screen === 'dover')) startDrift();
  if (screen === 'garage' && (k === 'arrowleft' || k === 'arrowright')) ui.h.onCar(k === 'arrowright' ? 1 : -1);
  if (k === 'escape' && screen === 'garage') go('menu');
  else if (k === 'escape' && screen === 'tracks') go('garage');
  else if (k === 'escape' && screen === 'sessions') go('tracks');
  else if (k === 'escape' && screen === 'tune') ui_tuneClose();
  else if (k === 'escape' && screen === 'drift') pauseDrift();
  else if (k === 'escape' && screen === 'dpause') { drift.resume(); go('drift'); }
  else if (k === 'escape' && screen === 'replay') { drift.stopReplay(); go('dover'); }
});

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  game.resize(w, h);
  if (drift) drift.resize(w, h);
  showroom.setSize(w, h);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));
resize();

showCar();
FLAKES.uFlake.value = Q().flakes ? 0.12 : 0;
showroom.setQuality(Q());
ui.setCamPref(settings.cam);
ui.setMuted(audio.muted);
ui.setMusic(audio.musicOn);
// browsers only allow sound after a gesture: start it (and the menu music) on the first click or key
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => audio.init(), { once: true });
ui.setQuality(qualityLabel());
game.setTime(settings.night);
ui.setTime(settings.night);
go('menu');

// fixed-timestep simulation, variable-rate rendering
let last = performance.now();
let acc = 0;
// adaptive quality: under 40 FPS for 2 s in a row -> lower the pixel ratio a step (down to 1)
let avgDt = 1 / 60, slowFor = 0;
// target 60 FPS: under 45 FPS for 2 s -> lower the pixel ratio a step; in Auto, once the pixel ratio is down
// to 1, drop a whole quality level (Ultra -> High -> Medium -> Low)
function adapt(dt) {
  if (document.hidden) return;
  avgDt += (dt - avgDt) * 0.1;
  slowFor = 1 / avgDt < 45 ? slowFor + dt : 0;
  if (slowFor > 2 && pixelRatio > 1) {
    pixelRatio = Math.max(1, pixelRatio - 0.25);
    renderer.setPixelRatio(pixelRatio);
    resize();
    slowFor = 0; avgDt = 1 / 50;
  } else if (slowFor > 3 && settings.quality === 'auto' && autoLevel !== 'low') {
    autoLevel = QUALITY_DOWN[autoLevel];
    applyQuality(false);
    slowFor = 0; avgDt = 1 / 50;
  }
}

function applyQuality(resetRatio = true) {
  FLAKES.uFlake.value = Q().flakes ? 0.12 : 0;
  if (resetRatio) applyPixelRatio();
  resize();
  game.setQuality(Q());
  if (drift) drift.setQuality(Q());
  showroom.setQuality(Q());
  ui.setQuality(qualityLabel());
}

function loop(now) {
  const realDt = Math.min(MAX_FRAME, (now - last) / 1000);
  last = now;
  adapt(realDt);
  if (DRIFT_SCREENS.includes(screen) && drift) {
    acc += realDt;
    let steps = 0;
    while (acc >= STEP && steps < 24) { drift.update(STEP); acc -= STEP; steps++; }
    if (steps >= 24) acc = 0; // lag spike: drop the backlog instead of fast-forwarding
    drift.alpha = acc / STEP;  // render between the last two physics steps
    drift.frame(realDt);
    drift.render(realDt);
  } else if (screen === 'play' || screen === 'over') {
    acc += realDt * game.timeScale;
    let steps = 0;
    while (acc >= STEP && steps < 24) { game.update(STEP); acc -= STEP; steps++; }
    game.frame(realDt);
    game.render(realDt);
  } else {
    showroom.render(renderer, realDt, screen);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

document.addEventListener('visibilitychange', () => { last = performance.now(); });
// for automated checks
window.__drift = { game, settings, showroom, pixelRatio: () => pixelRatio, get drift() { return drift; }, startDrift, go };
window.__cars = PLAYER_CARS;

// leaving the tab pauses a drift session
document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'drift') pauseDrift(); });
