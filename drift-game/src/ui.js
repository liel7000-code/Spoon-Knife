// DOM screens: menu, garage, HUD, game over. Hebrew, RTL.
import { PLAYER_CARS, STAT_RANGE } from './cars.js';
import { loadBoard } from './scoring.js';

const $ = (id) => document.getElementById(id);
const SWATCHES = ['#c4141c', '#f1efe9', '#e8b10c', '#1f4fa8', '#d6281f', '#7d8a96', '#16181c', '#1f4fd1', '#1f8a5b', '#ff6a00', '#7a2fd0', '#e8c8a0'];
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
    this.screens = { menu: $('menu'), garage: $('garage'), hud: $('hud'), over: $('over'), board: $('boardScreen') };
    this.touch = $('touch');

    $('btnStart').onclick = () => handlers.onStart();
    $('btnGarage').onclick = () => handlers.onGarage();
    $('btnCamPref').onclick = () => handlers.onCamPref();
    $('btnMuteMenu').onclick = () => handlers.onMute();
    $('btnQuality').onclick = () => handlers.onQuality();
    $('btnMusic').onclick = () => handlers.onMusic();
    $('btnTime').onclick = () => handlers.onTime();
    $('btnBoard').onclick = () => { this.renderBoard($('menuBoard'), 0); this.show('board'); };
    $('btnBoardBack').onclick = () => this.show('menu');
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

    this.buildSwatches(SWATCHES);
    this.popupTimer = 0;
    this.initGauge();
  }

  // colour swatches: each car can bring its own list (the custom picker stays at the end)
  buildSwatches(list) {
    const sw = $('swatches');
    if (this.swatchList === list) return;
    this.swatchList = list;
    for (const b of [...sw.querySelectorAll('.swatch')]) b.remove();
    const picker = sw.querySelector('.picker');
    for (const c of list) {
      const b = document.createElement('button');
      b.className = 'swatch'; b.style.background = c; b.dataset.color = c;
      b.setAttribute('aria-label', `צבע ${c}`);
      b.onclick = () => this.h.onColor(c);
      if (picker) sw.insertBefore(b, picker); else sw.appendChild(b);
    }
    if (!picker) sw.appendChild(document.querySelector('.picker')); // custom colour sits in the same row
  }

  // tachometer: static track, redline and ticks (built once)
  initGauge() {
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
    // on-screen arrows/pedals work with touch and mouse, so they show on every device while driving
    this.touch.hidden = name !== 'hud';
    void touchControls;
  }

  setMenu({ carName, best }) {
    $('menuCar').textContent = carName;
    $('menuBest').textContent = fmt(best);
  }

  setCamPref(mode) {
    $('btnCamPref').textContent = `מצלמה: ${{ third: 'מרדף', bumper: 'פגוש', first: 'תא נהג' }[mode] || 'מרדף'}`;
  }

  setTime(night) {
    $('btnTime').textContent = `תאורה: ${night ? 'לילה בעיר' : 'שקיעה'}`;
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
    this.buildSwatches(def.colors || SWATCHES);
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

  hud({ speed, score, best, mult = 1, hold = 0, fast = false, rpm = 0, gear = 1 }) {
    $('hudSpeed').textContent = Math.round(speed);
    $('rpmArc').setAttribute('d', arc(G.a0, Math.max(G.a0 + 0.5, rpmAngle(rpm))));
    $('hudGear').textContent = gear;
    this.gauge.classList.toggle('redline', rpm > G.red + 500);
    $('hudScore').textContent = fmt(score);
    $('hudBest').textContent = fmt(best);
    const m = $('mult');
    $('multVal').textContent = `×${mult.toFixed(1)}`;
    $('multBar').style.width = `${Math.round(hold * 100)}%`;
    m.classList.toggle('cold', !fast);
    if (mult > (this.lastMult || 1) + 0.01) { m.classList.add('bump'); clearTimeout(this.bumpT); this.bumpT = setTimeout(() => m.classList.remove('bump'), 160); }
    this.lastMult = mult;
  }

  // stacked event feed under the multiplier ("LANE SPLIT +1,200")
  feed(text, kind) {
    const f = $('feed');
    const d = document.createElement('div');
    d.className = kind; d.textContent = text;
    f.prepend(d);
    while (f.children.length > 4) f.lastChild.remove();
    setTimeout(() => d.remove(), 1700);
  }

  popup(text) {
    const p = $('popup');
    p.textContent = text;
    p.classList.remove('show');
    void p.offsetWidth; // restart the animation
    p.classList.add('show');
  }

  renderBoard(el, highlight) {
    const board = loadBoard();
    el.innerHTML = '';
    if (!board.length) { el.innerHTML = '<li class="board-empty">עוד אין ריצות. צא לכביש.</li>'; return; }
    const day = (t) => new Date(t).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
    board.forEach((r, i) => {
      const li = document.createElement('li');
      if (i + 1 === highlight) li.className = 'me';
      li.innerHTML = `<div><b dir="ltr">${fmt(r.score)}</b><br><span dir="ltr">${r.car} · ×${r.mult} · ${r.speed} km/h</span></div><span>${day(r.date)}</span>`;
      el.appendChild(li);
    });
  }

  gameOver({ score, distance, nearMisses, best, record, rank = 0, splits = 0, topMult = 1, topSpeed = 0 }) {
    $('overSplit').textContent = fmt(splits);
    $('overMult').textContent = `×${topMult.toFixed(1)}`;
    $('overSpeed').textContent = `${Math.round(topSpeed)} km/h`;
    $('overRank').textContent = rank ? `מקום ${rank} בטבלת השיאים` : '';
    this.renderBoard($('overBoard'), rank);
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
