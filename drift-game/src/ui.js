// DOM screens: menu, garage, HUD, game over. Hebrew, RTL.
import { PLAYER_CARS, STAT_RANGE } from './cars.js';

const $ = (id) => document.getElementById(id);
const SWATCHES = ['#8c0b12', '#f1efe9', '#e8b10c', '#1f4fa8', '#d6281f', '#7d8a96', '#16181c', '#1f4fd1', '#1f8a5b', '#ff6a00', '#7a2fd0', '#e8c8a0'];
const fmt = (n) => Math.round(n).toLocaleString('he-IL');

export class UI {
  constructor(handlers) {
    this.h = handlers; // { onStart, onGarage, onBack, onCar, onColor, onCamPref, onMute, onCamToggle, onRetry, onMenu }
    this.screens = { menu: $('menu'), garage: $('garage'), hud: $('hud'), over: $('over') };
    this.touch = $('touch');

    $('btnStart').onclick = () => handlers.onStart();
    $('btnGarage').onclick = () => handlers.onGarage();
    $('btnCamPref').onclick = () => handlers.onCamPref();
    $('btnMuteMenu').onclick = () => handlers.onMute();
    $('btnQuality').onclick = () => handlers.onQuality();
    $('garageBack').onclick = () => handlers.onBack();
    $('garageStart').onclick = () => handlers.onStart();
    $('prevCar').onclick = () => handlers.onCar(-1);
    $('nextCar').onclick = () => handlers.onCar(1);
    $('btnCam').onclick = (e) => { e.currentTarget.blur(); handlers.onCamToggle(); };
    $('btnMute').onclick = (e) => { e.currentTarget.blur(); handlers.onMute(); };
    $('btnRetry').onclick = () => handlers.onRetry();
    $('btnMenu').onclick = () => handlers.onMenu();
    $('colorPick').addEventListener('input', (e) => handlers.onColor(e.target.value));

    const sw = $('swatches');
    for (const c of SWATCHES) {
      const b = document.createElement('button');
      b.className = 'swatch'; b.style.background = c; b.dataset.color = c;
      b.setAttribute('aria-label', `צבע ${c}`);
      b.onclick = () => handlers.onColor(c);
      sw.appendChild(b);
    }
    sw.appendChild(document.querySelector('.picker')); // custom colour sits in the same row
    this.popupTimer = 0;
  }

  show(name, touchControls) {
    for (const [k, el] of Object.entries(this.screens)) {
      el.hidden = !(k === name || (name === 'over' && k === 'hud'));
    }
    this.touch.hidden = !(name === 'hud' && touchControls);
  }

  setMenu({ carName, best }) {
    $('menuCar').textContent = carName;
    $('menuBest').textContent = fmt(best);
  }

  setCamPref(mode) {
    $('btnCamPref').textContent = `מצלמה: ${mode === 'first' ? 'גוף ראשון' : 'גוף שלישי'}`;
  }

  setQuality(label) {
    $('btnQuality').textContent = `איכות גרפיקה: ${label}`;
  }

  setMuted(m) {
    $('btnMuteMenu').textContent = `צליל: ${m ? 'כבוי' : 'פועל'}`;
    $('btnMute').classList.toggle('off', m);
  }

  setGarage(index, color) {
    const def = PLAYER_CARS[index];
    $('carName').textContent = def.name;
    $('carTag').textContent = def.tag;
    $('carCount').textContent = `${index + 1} מתוך ${PLAYER_CARS.length}`;
    const pct = (v, [a, b]) => `${Math.round(((v - a) / (b - a)) * 100)}%`;
    $('barTop').style.width = pct(def.topSpeed, STAT_RANGE.topSpeed);
    $('barAcc').style.width = pct(def.accel, STAT_RANGE.accel);
    $('barHan').style.width = pct(def.handling, STAT_RANGE.handling);
    $('valTop').textContent = `${def.topSpeed}`;
    $('valAcc').textContent = `${Math.round(def.accel * 10)}/10`;
    $('valHan').textContent = `${Math.round(def.handling * 10)}/10`;
    this.setColor(color);
  }

  setColor(color) {
    $('colorPick').value = color;
    for (const b of $('swatches').querySelectorAll('.swatch')) b.classList.toggle('on', b.dataset.color.toLowerCase() === color.toLowerCase());
  }

  hud({ speed, score, best, combo, comboFrac }) {
    $('hudSpeed').textContent = Math.round(speed);
    $('hudScore').textContent = fmt(score);
    $('hudBest').textContent = fmt(best);
    const c = $('combo');
    c.hidden = combo < 2;
    if (combo >= 2) {
      $('comboVal').textContent = `×${combo}`;
      $('comboBar').style.width = `${Math.max(0, comboFrac) * 100}%`;
    }
  }

  popup(text) {
    const p = $('popup');
    p.textContent = text;
    p.classList.remove('show');
    void p.offsetWidth; // restart the animation
    p.classList.add('show');
  }

  gameOver({ score, distance, nearMisses, best, record }) {
    $('overScore').textContent = fmt(score);
    $('overDist').textContent = `${fmt(distance)} מ׳`;
    $('overNear').textContent = fmt(nearMisses);
    $('overBest').textContent = fmt(best);
    $('newRecord').hidden = !record;
  }
}
