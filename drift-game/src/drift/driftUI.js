// Drift screens: track select, session select (with assists), HUD, pause, results, replay bar.
import { TRACKS, SESSIONS } from './trackData.js';
import { Track } from './track.js';
import { loadBests, bestKey } from './driftScoring.js';
import { fmtTime } from './driftGame.js';
import { TUNE_FIELDS } from './tune.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const ASSIST_HINT = {
  beginner: 'עוזר להיגוי הנגדי להחזיק את הזווית שבחרתם, והגה מוחלק למגע. הגז והזווית עדיין בידיים שלכם. מומלץ לטלפון.',
  pro: 'עזרה עדינה בהיגוי הנגדי בלבד. את רוב העבודה עושים אתם.',
  sim: 'בלי עזרים: היגוי, גז, בלם ובלם יד הם רק שלכם. ההגה עדיין מתיישר מעצמו כשעוזבים אותו, כמו במכונית אמיתית.',
};

export class DriftUI {
  constructor(handlers) {
    this.h = handlers;
    this.screens = { tracks: $('trackScreen'), sessions: $('sessionScreen'), tune: $('tuneScreen'), hud: $('dhud'), pause: $('dpause'), results: $('dover') };
    $('trackBack').onclick = () => handlers.onBack('tracks');
    $('sessionBack').onclick = () => handlers.onBack('sessions');
    $('sessionStart').onclick = () => handlers.onStart();
    $('dPause').onclick = (e) => { e.currentTarget.blur(); handlers.onPause(); };
    $('dCam').onclick = (e) => { e.currentTarget.blur(); handlers.onCam(); };
    $('dResume').onclick = () => handlers.onResume();
    $('dRestart').onclick = () => handlers.onStart();
    $('dEnd').onclick = () => handlers.onEnd();
    $('dQuit').onclick = () => handlers.onQuit();
    $('dRetry').onclick = () => handlers.onStart();
    $('dReplay').onclick = () => handlers.onReplay();
    $('dTracks').onclick = () => handlers.onTracks();
    $('dMenu').onclick = () => handlers.onQuit();
    $('replayExit').onclick = () => handlers.onReplayExit();
    for (const row of ['assistRow', 'assistRow2']) for (const b of document.querySelectorAll(`#${row} .seg`)) b.onclick = () => handlers.onAssist(b.dataset.assist);
    for (const b of document.querySelectorAll('.tog')) b.onclick = () => handlers.onToggle(b.dataset.tog);
    $('sessionTune').onclick = () => handlers.onTune();
    $('tuneBack').onclick = () => handlers.onTuneClose(false);
    $('tuneDone').onclick = () => handlers.onTuneClose(true);
    $('tuneReset').onclick = () => handlers.onTuneReset();
    $('dDebug').onclick = () => handlers.onDebug();
    this.last = {};
    this.previews = TRACKS.map(() => null);
  }

  hideAll() { for (const el of Object.values(this.screens)) el.hidden = true; $('replayBar').hidden = true; }
  show(name) {
    for (const [k, el] of Object.entries(this.screens)) el.hidden = !(k === name || ((name === 'pause' || name === 'results') && k === 'hud'));
    $('replayBar').hidden = name !== 'replay';
    if (name === 'replay') this.screens.hud.hidden = true;
  }

  /* ---------------------------------------------------------- pickers */
  renderTracks(carDef, selected) {
    $('trackCar').textContent = carDef.name;
    const list = $('trackList'), bests = loadBests();
    list.innerHTML = '';
    TRACKS.forEach((t, i) => {
      const prev = this.previews[i] || (this.previews[i] = new Track(t, { roadRes: 512, scenery: 0.5 }).minimap(100));
      const b = document.createElement('button');
      b.className = 'track-card'; b.dataset.theme = t.theme;
      const bs = bests[bestKey(t.id, carDef.id, 'attack')], bt = bests[bestKey(t.id, carDef.id, 'trial')], bf = bests[bestKey(t.id, carDef.id, 'free')];
      const best = [bs && `מתקפה ${fmt(bs.score)}`, bt && bt.lap && `הקפה ${fmtTime(bt.lap)}`, bf && `חופשי ${fmt(bf.score)}`].filter(Boolean).join(' · ');
      b.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="${prev.d}"/><circle r="3.4" cx="${prev.map(0, 0)[0].toFixed(1)}" cy="${prev.map(0, 0)[1].toFixed(1)}"/></svg>
        <span class="tc-name" dir="ltr">${t.name}</span><span class="tc-he">${t.he}</span>
        <span class="tc-level">${[1, 2, 3].map((k) => `<i class="${k <= t.level ? 'on' : ''}"></i>`).join('')} ${t.levelHe}</span>
        <p class="tc-blurb">${t.blurb}</p>
        <span class="tc-best" dir="rtl">${best ? 'שיאים עם הרכב הזה: ' + best : 'עוד אין שיא עם הרכב הזה'}</span>`;
      b.onclick = () => this.h.onTrack(i);
      list.appendChild(b);
      if (i === selected) setTimeout(() => b.focus(), 50);
    });
  }

  renderSessions(trackIndex, selected, assist) {
    const t = TRACKS[trackIndex];
    $('sessionTitle').textContent = t.name;
    const list = $('sessionList');
    list.innerHTML = '';
    for (const s of Object.values(SESSIONS)) {
      const b = document.createElement('button');
      b.className = 'session-btn' + (s.id === selected ? ' on' : '');
      b.innerHTML = `<b dir="ltr">${s.name}</b><span>${s.he} · ${s.blurb}</span>${s.id === 'trial' ? '<em>' + (localStorage.getItem('driftgame.drift.ghost.' + t.id) ? 'יש רוח רפאים של ההקפה הטובה ביותר' : 'ההקפה הטובה תישמר כרוח רפאים') + '</em>' : ''}`;
      b.onclick = () => this.h.onSession(s.id);
      list.appendChild(b);
    }
    this.setAssist(assist);
  }

  // a = { level, tc, abs, manual }
  setAssist(a) {
    for (const row of ['assistRow', 'assistRow2']) for (const b of document.querySelectorAll(`#${row} .seg`)) b.classList.toggle('on', b.dataset.assist === a.level);
    for (const b of document.querySelectorAll('.tog')) b.classList.toggle('on', !!a[b.dataset.tog]);
    $('assistHint').textContent = ASSIST_HINT[a.level] || '';
  }

  /* -------------------------------------------------------------- tuning */
  renderTune(carDef, tune) {
    $('tuneCar').textContent = carDef.name;
    const list = $('tuneList');
    list.innerHTML = '';
    for (const f of TUNE_FIELDS) {
      const row = document.createElement('label');
      row.className = 'tune-row';
      const fmtv = (v) => `${Number(v).toFixed(f.step < 1 ? (f.step < 0.1 ? 2 : 1) : 0)} ${f.unit}`;
      row.innerHTML = `<span class="tr-top"><span>${f.label}</span><b dir="ltr">${fmtv(tune[f.key])}</b></span>
        <input type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${tune[f.key]}" aria-label="${f.label}"><p>${f.help}</p>`;
      const input = row.querySelector('input'), out = row.querySelector('b');
      input.addEventListener('input', () => { out.textContent = fmtv(input.value); this.h.onTuneChange(f.key, Number(input.value)); });
      list.appendChild(row);
    }
  }

  /* --------------------------------------------------------------- HUD */
  minimap(m) { this.map = m; $('dMapPath').setAttribute('d', m.d); $('dMap').setAttribute('viewBox', `0 0 ${m.size} ${m.size}`); }

  reset({ session, bestScore, bestLap }) {
    this.last = {};
    this.session = session;
    $('dBest').textContent = session === 'trial' ? fmtTime(bestLap) : fmt(bestScore || 0);
    $('dTimeLbl').textContent = session === 'attack' ? 'TIME LEFT' : session === 'trial' ? 'LAP TIME' : 'TIME';
    $('dFeed').innerHTML = '';
    $('dPop').className = 'd-pop';
    $('dMapGhost').setAttribute('cx', -10);
  }

  set(id, v) { if (this.last[id] !== v) { this.last[id] = v; $(id).textContent = v; } }

  hud(s) {
    this.set('dScore', fmt(s.score));
    this.set('dChain', fmt(s.chain));
    this.set('dMult', `×${s.mult.toFixed(1)}`);
    const ang = Math.round(Math.min(s.angle, 99));
    this.set('dAngle', `${ang}°`);
    if (this.last.ang !== ang) { this.last.ang = ang; $('dAngleBar').style.width = `${Math.min(100, (ang / 70) * 100)}%`; }
    if (this.last.active !== s.active) { this.last.active = s.active; $('dChainBox').classList.toggle('on', s.active); }
    this.set('dSpeed', String(Math.round(s.kmh)));
    this.set('dGear', String(s.gear));
    const rp = Math.round(Math.min(1, s.rpm / (s.redline || 8000)) * 50);
    if (this.last.rp !== rp) { this.last.rp = rp; $('dRpm').style.width = `${rp * 2}%`; }
    this.set('dTime', this.session === 'trial' ? fmtTime(s.time) : fmtClock(s.time));
    this.set('dLap', s.laps ? `LAP ${Math.max(1, s.lap)}/${s.laps}${s.bestLap ? ' · BEST ' + fmtTime(s.bestLap) : ''}` : s.lap > 1 ? `LAP ${s.lap}` : '');
    const cd = s.countdown > 0 ? (s.countdown > 0.4 ? String(Math.ceil(s.countdown - 0.4)) : '') : '';
    if (this.last.cd !== cd) { this.last.cd = cd; $('dCount').hidden = !cd; $('dCount').textContent = cd; }
    if (this.map) {
      const [mx, mz] = this.map.map(s.x, s.z);
      const k = `${mx.toFixed(0)},${mz.toFixed(0)}`;
      if (this.last.map !== k) { this.last.map = k; const c = $('dMapCar'); c.setAttribute('cx', mx.toFixed(1)); c.setAttribute('cy', mz.toFixed(1)); }
      if (s.ghost) { const [gx, gz] = this.map.map(s.ghost.x, s.ghost.z); $('dMapGhost').setAttribute('cx', gx.toFixed(1)); $('dMapGhost').setAttribute('cy', gz.toFixed(1)); }
    }
  }

  popup(text, kind = 'info') {
    const p = $('dPop');
    p.textContent = text;
    p.className = 'd-pop ' + kind;
    void p.offsetWidth;
    p.classList.add('show');
  }

  feed(text, kind) {
    const f = $('dFeed'), d = document.createElement('div');
    d.className = kind; d.textContent = text; d.dir = 'ltr';
    f.prepend(d);
    while (f.children.length > 4) f.lastChild.remove();
    setTimeout(() => d.remove(), 1700);
  }

  replayTime(t, total) { this.set('replayTime', `${fmtClock(t)} / ${fmtClock(total)}`); }

  /* ----------------------------------------------------------- results */
  results(r) {
    const S = SESSIONS[r.session];
    $('resTitle').textContent = r.track.name;
    $('resSub').textContent = `${S.he} · ${r.car.name}`;
    const g = $('resGrade'); g.textContent = r.grade; g.className = `grade g-${r.grade}`;
    $('resRecord').hidden = !r.record;
    const trial = r.session === 'trial';
    $('resScoreLbl').textContent = trial ? 'ההקפה הטובה' : 'ניקוד';
    $('resScore').textContent = trial ? fmtTime(r.bestLap) : fmt(r.score);
    $('resBest').textContent = trial ? `ניקוד דריפט ${fmt(r.score)} · שיא ${fmtTime(r.best && r.best.lap)}` : `שיא ${fmt((r.best && r.best.score) || r.score)}`;
    const st = r.stats;
    const items = [
      ['הדריפט הטוב', fmt(st.best)], ['הדריפט הארוך', `${st.longest.toFixed(1)} ש׳`], ['זווית מרבית', `${Math.round(st.topAngle)}°`],
      ['נקודות חיתוך', fmt(st.clips)], ['חיבורים', fmt(st.links)], ['פגיעות בקיר', fmt(st.wallHits)],
    ];
    if (trial) items.push(['הקפות', r.laps.map((l) => fmtTime(l)).join(' · ') || '—']);
    else items.push(['זמן', fmtClock(r.time)]);
    if (st.n360) items.push(['360°', fmt(st.n360)]);
    $('resStats').innerHTML = items.map(([k, v]) => `<div><span class="lbl">${k}</span><b dir="ltr">${v}</b></div>`).join('');
  }
}

export function fmtClock(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
