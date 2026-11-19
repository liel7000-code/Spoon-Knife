// DOM screens: menu, garage, HUD, game over. Hebrew, RTL.
import { PLAYER_CARS, STAT_RANGE } from './cars.js';

const $ = (id) => document.getElementById(id);
const SWATCHES = ['#8c0b12', '#f1efe9', '#e8b10c', '#1f4fa8', '#d6281f', '#7d8a96', '#16181c', '#1f4fd1', '#1f8a5b', '#ff6a00', '#7a2fd0', '#e8c8a0'];
const fmt = (n) => Math.round(n).toLocaleString('he-IL');

// tachometer geometry: 270 degree sweep, 0..9000 rpm
const G = { cx: 110, cy: 110, r: 86, a0: 135, a1: 405, max: 9000, red: 7200 };
const polar = (a, r) => { const t = (a * Math.PI) / 180; return [G.cx + Math.cos(t) * r, G.cy + Math.sin(t) * r]; };
const arc = (a0, a1, r = G.r) => {
  const [x0, y0] = polar(a0, r), [x1, y1] = polar(a1, r);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
};
const rpmAngle = (rpm) => G.a0 + (Math.min(rpm, G.max) / G.max) * (G.a1 - G.a0);

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
    $('btnMusic').onclick = () => handlers.onMusic();
    $('garageBack').onclick = () => handlers.onBack();
    $('garageStart').onclick = () => handlers.onStart();
    $('prevCar').onclick = () => handlers.onCar(-1);
    $('nextCar').onclick = () => handlers.onCar(1);
    $('btnCam').onclick = (e) => { e.currentTarget.blur(); handlers.onCamToggle(); };
    $('btnMute').onclick = (e) => { e.currentTarget.blur(); handlers.onMute(); };
    $('btnRetry').onclick = () => handlers.onRetry();
    $('btnMenu').onclick = () => handlers.onMenu();
    $('colorPick').addEventListener('input', (e) => handlers.onColor(e.target.value));
    for (const b of document.querySelectorAll('#styleRow .seg')) b.onclick = () => handlers.onStyle(b.dataset.style);

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
    // tachometer: static track, redline and ticks
    $('rpmTrack').setAttribute('d', arc(G.a0, G.a1));
    $('rpmRed').setAttribute('d', arc(rpmAngle(G.red), G.a1));
    let ticks = '';
    for (let k = 0; k <= 9; k++) {
      const a = rpmAngle(k * 1000), [x0, y0] = polar(a, G.r - 9), [x1, y1] = polar(a, G.r - 16), [tx, ty] = polar(a, G.r - 28);
      ticks += `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}"/><text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}">${k}</text>`;
    }
    $('rpmTicks').innerHTML = ticks;
    this.gauge = document.querySelector('.gauge');
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

  setMusic(on) {
    $('btnMusic').textContent = `מוזיקה: ${on ? 'פועלת' : 'כבויה'}`;
  }

  setQuality(label) {
    $('btnQuality').textContent = `איכות גרפיקה: ${label}`;
  }

  setMuted(m) {
    $('btnMuteMenu').textContent = `צליל: ${m ? 'כבוי' : 'פועל'}`;
    $('btnMute').classList.toggle('off', m);
  }

  setGarage(index, color, style) {
    const def = PLAYER_CARS[index];
    $('styleRow').hidden = !def.styles;
    for (const b of document.querySelectorAll('#styleRow .seg')) b.classList.toggle('on', b.dataset.style === style);
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

  hud({ speed, score, best, combo, comboFrac, rpm = 0, gear = 1 }) {
    $('hudSpeed').textContent = Math.round(speed);
    $('rpmArc').setAttribute('d', arc(G.a0, Math.max(G.a0 + 0.5, rpmAngle(rpm))));
    $('hudGear').textContent = gear;
    this.gauge.classList.toggle('redline', rpm > G.red + 500);
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
    // results count up with an ease-out
    const t0 = performance.now(), dur = 900;
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      $('overScore').textContent = fmt(score * e);
      $('overDist').textContent = `${fmt(distance * e)} מ׳`;
      $('overNear').textContent = fmt(nearMisses * e);
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    $('overBest').textContent = fmt(best);
    $('newRecord').hidden = !record;
  }
}
