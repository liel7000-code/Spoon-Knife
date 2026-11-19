// Entry point: renderer, fixed-timestep loop, screen flow.
import './style.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PLAYER_CARS } from './cars.js';
import { Game } from './game.js';
import { Showroom } from './showroom.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { EngineAudio } from './audio.js';

const STEP = 1 / 120; // fixed logic step (seconds)
const MAX_FRAME = 0.1;

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
};

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const pmrem = new THREE.PMREMGenerator(renderer);
const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const settings = {
  car: store.get('driftgame.car', 0),
  colors: store.get('driftgame.colors', {}),
  cam: store.get('driftgame.cam', 'third'),
};
if (!PLAYER_CARS[settings.car]) settings.car = 0;
const colorOf = (i) => settings.colors[PLAYER_CARS[i].id] || PLAYER_CARS[i].color;

const audio = new EngineAudio();
const input = new Input(canvas);
const showroom = new Showroom(envMap);
let screen = 'menu';

const ui = new UI({
  onStart: () => startRun(),
  onGarage: () => go('garage'),
  onBack: () => go('menu'),
  onCar: (dir) => {
    settings.car = (settings.car + dir + PLAYER_CARS.length) % PLAYER_CARS.length;
    store.set('driftgame.car', settings.car);
    showroom.setCar(PLAYER_CARS[settings.car], colorOf(settings.car));
    ui.setGarage(settings.car, colorOf(settings.car));
    refreshMenu();
  },
  onColor: (c) => {
    settings.colors[PLAYER_CARS[settings.car].id] = c;
    store.set('driftgame.colors', settings.colors);
    showroom.setColor(c);
    ui.setColor(c);
  },
  onCamPref: () => {
    settings.cam = settings.cam === 'third' ? 'first' : 'third';
    store.set('driftgame.cam', settings.cam);
    ui.setCamPref(settings.cam);
  },
  onMute: () => { audio.setMuted(!audio.muted); ui.setMuted(audio.muted); },
  onCamToggle: () => toggleCam(),
  onRetry: () => startRun(),
  onMenu: () => { game.stop(); go('menu'); },
});

const game = new Game(renderer, {
  ui, audio, input, envMap,
  onGameOver: (result) => { ui.gameOver(result); go('over'); },
});

function toggleCam() {
  if (game.state === 'idle') return;
  settings.cam = game.toggleCamera();
  store.set('driftgame.cam', settings.cam);
  ui.setCamPref(settings.cam);
}

input.onLane = (dir) => game.lane(dir);
input.onCamera = () => toggleCam();

function refreshMenu() {
  ui.setMenu({ carName: PLAYER_CARS[settings.car].name, best: game.best });
}

function go(name) {
  screen = name;
  ui.show(name === 'play' ? 'hud' : name, Input.isTouch());
  if (name === 'menu') refreshMenu();
  if (name === 'garage') ui.setGarage(settings.car, colorOf(settings.car));
  for (const b of document.querySelectorAll('button')) b.blur();
}

function startRun() {
  audio.init();
  game.start(settings.car, colorOf(settings.car), settings.cam);
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
}
window.addEventListener('resize', resize);
resize();

showroom.setCar(PLAYER_CARS[settings.car], colorOf(settings.car));
ui.setCamPref(settings.cam);
ui.setMuted(audio.muted);
go('menu');

// fixed-timestep simulation, variable-rate rendering
let last = performance.now();
let acc = 0;
function loop(now) {
  const realDt = Math.min(MAX_FRAME, (now - last) / 1000);
  last = now;
  if (screen === 'play' || screen === 'over') {
    acc += realDt * game.timeScale;
    let steps = 0;
    while (acc >= STEP && steps < 24) { game.update(STEP); acc -= STEP; steps++; }
    game.frame(realDt);
    game.render();
  } else {
    showroom.render(renderer, realDt, screen);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

document.addEventListener('visibilitychange', () => { last = performance.now(); });
// for automated checks
window.__drift = { game, settings };
