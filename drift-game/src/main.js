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
import { QUALITY, QUALITY_ORDER } from './config.js';

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
  quality: store.get('driftgame.quality', Input.isTouch() ? 'medium' : 'high'),
  style: store.get('driftgame.heroStyle', 'stock'),
  night: store.get('driftgame.night', false),
};
if (!QUALITY[settings.quality]) settings.quality = 'high';
// pixel ratio: device ratio capped at 2 (or the quality preset's cap); the adaptive
// fallback in the loop steps it down if the frame rate drops
let pixelRatio = 1;
const applyPixelRatio = () => { pixelRatio = Math.min(window.devicePixelRatio || 1, 2, QUALITY[settings.quality].pixelRatio); renderer.setPixelRatio(pixelRatio); };
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
  onStart: () => startRun(),
  onGarage: () => go('garage'),
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
    applyPixelRatio(); resize();
    game.setQuality(QUALITY[settings.quality]);
    showroom.setQuality(QUALITY[settings.quality]);
    ui.setQuality(QUALITY[settings.quality].label);
  },
  onCamToggle: () => toggleCam(),
  onRetry: () => startRun(),
  onMenu: () => { game.stop(); go('menu'); },
});

const game = new Game(renderer, {
  ui, audio, input, quality: QUALITY[settings.quality],
  onGameOver: (result) => { ui.gameOver(result); go('over'); },
});

function toggleCam() {
  if (game.state === 'idle') return;
  settings.cam = game.toggleCamera();
  store.set('driftgame.cam', settings.cam);
  ui.setCamPref(settings.cam);
}

input.onCamera = () => toggleCam();

function refreshMenu() {
  ui.setMenu({ carName: PLAYER_CARS[settings.car].name, best: game.best });
}

function go(name) {
  screen = name;
  ui.show(name === 'play' ? 'hud' : name, Input.isTouch());
  if (name === 'menu') refreshMenu();
  if (name === 'garage') ui.setGarage(settings.car, colorOf(settings.car), settings.style);
  for (const b of document.querySelectorAll('button')) b.blur();
}

function startRun() {
  audio.init();
  game.start(settings.car, colorOf(settings.car), settings.cam, styleOf(settings.car));
  acc = 0;
  go('play');
}

// keyboard shortcuts outside of play
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === 'enter' && (screen === 'menu' || screen === 'garage' || screen === 'over')) startRun();
  if (screen === 'garage' && (k === 'arrowleft' || k === 'arrowright')) ui.h.onCar(k === 'arrowright' ? 1 : -1);
  if (k === 'escape' && screen === 'garage') go('menu');
});

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  game.resize(w, h);
  showroom.setSize(w, h);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));
resize();

showCar();
showroom.setQuality(QUALITY[settings.quality]);
ui.setCamPref(settings.cam);
ui.setMuted(audio.muted);
ui.setMusic(audio.musicOn);
// browsers only allow sound after a gesture: start it (and the menu music) on the first click or key
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => audio.init(), { once: true });
ui.setQuality(QUALITY[settings.quality].label);
game.setTime(settings.night);
ui.setTime(settings.night);
go('menu');

// fixed-timestep simulation, variable-rate rendering
let last = performance.now();
let acc = 0;
// adaptive quality: under 40 FPS for 2 s in a row -> lower the pixel ratio a step (down to 1)
let avgDt = 1 / 60, slowFor = 0;
function adapt(dt) {
  if (document.hidden) return;
  avgDt += (dt - avgDt) * 0.1;
  slowFor = 1 / avgDt < 40 ? slowFor + dt : 0;
  if (slowFor > 2 && pixelRatio > 1) {
    pixelRatio = Math.max(1, pixelRatio - 0.25);
    renderer.setPixelRatio(pixelRatio);
    resize();
    slowFor = 0; avgDt = 1 / 50;
  }
}

function loop(now) {
  const realDt = Math.min(MAX_FRAME, (now - last) / 1000);
  last = now;
  adapt(realDt);
  if (screen === 'play' || screen === 'over') {
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
window.__drift = { game, settings, showroom, pixelRatio: () => pixelRatio };
window.__cars = PLAYER_CARS;

