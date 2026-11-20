// WebAudio sound: layered sports engine (RPM based) with a turbo (spool whistle,
// blow-off valve, compressor flutter, exhaust pops on lift), tyre squeal, barrier
// scrape, wind, near-miss whoosh, crash, and a light generative music loop. Nothing is loaded
// from files; everything is synthesised.
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v === '1'; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v ? '1' : '0'); } catch (e) { /* ignore */ } },
};

export class EngineAudio {
  constructor() {
    this.ctx = null;
    this.muted = store.get('driftgame.muted', false);
    this.musicOn = store.get('driftgame.music', true);
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.6;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.musicOn ? 0.16 : 0; this.musicBus.connect(this.master);

    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const loopNoise = () => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };

    // engine: firing-order saw + sub square + 2nd harmonic + intake noise, through a soft drive
    const drive = ctx.createWaveShaper(), curve = new Float32Array(512);
    for (let i = 0; i < 512; i++) { const x = i / 256 - 1; curve[i] = Math.tanh(x * 3.2); }
    drive.curve = curve;
    this.engLP = ctx.createBiquadFilter(); this.engLP.type = 'lowpass'; this.engLP.Q.value = 2.5;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    drive.connect(this.engLP).connect(this.engGain).connect(this.sfx);
    const osc = (type, gain) => { const o = ctx.createOscillator(); o.type = type; const g = ctx.createGain(); g.gain.value = gain; o.connect(g).connect(drive); o.start(); return o; };
    this.o1 = osc('sawtooth', 0.5); this.o2 = osc('square', 0.35); this.o3 = osc('sawtooth', 0.18);
    const intake = loopNoise(), ibp = ctx.createBiquadFilter(); ibp.type = 'bandpass'; ibp.Q.value = 1.2;
    this.intakeBP = ibp; this.intakeGain = ctx.createGain(); this.intakeGain.gain.value = 0;
    intake.connect(ibp).connect(this.intakeGain).connect(this.sfx);

    // tyre squeal: narrow band noise + a wobbling tone
    const sq = loopNoise(), sbp = ctx.createBiquadFilter(); sbp.type = 'bandpass'; sbp.frequency.value = 1300; sbp.Q.value = 10;
    this.squealGain = ctx.createGain(); this.squealGain.gain.value = 0; this.squealBP = sbp;
    sq.connect(sbp).connect(this.squealGain).connect(this.sfx);
    // barrier scrape: gritty high band
    const sc = loopNoise(), shp = ctx.createBiquadFilter(); shp.type = 'highpass'; shp.frequency.value = 1800;
    this.scrapeGain = ctx.createGain(); this.scrapeGain.gain.value = 0;
    sc.connect(shp).connect(this.scrapeGain).connect(this.sfx);
    // wind
    const wn = loopNoise(), wbp = ctx.createBiquadFilter(); wbp.type = 'bandpass'; wbp.frequency.value = 500; wbp.Q.value = 0.5;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0; this.windBP = wbp;
    wn.connect(wbp).connect(this.windGain).connect(this.sfx);

    // turbo: compressor whine (two detuned tones through a resonant band) that rises with boost
    this.turboGain = ctx.createGain(); this.turboGain.gain.value = 0;
    const tbp = ctx.createBiquadFilter(); tbp.type = 'bandpass'; tbp.Q.value = 6; this.turboBP = tbp;
    this.t1 = ctx.createOscillator(); this.t1.type = 'sine';
    this.t2 = ctx.createOscillator(); this.t2.type = 'triangle';
    const t2g = ctx.createGain(); t2g.gain.value = 0.4;
    this.t1.connect(tbp); this.t2.connect(t2g).connect(tbp);
    tbp.connect(this.turboGain).connect(this.sfx);
    this.t1.start(); this.t2.start();
    // intake rush that comes with boost
    const rush = loopNoise(), rhp = ctx.createBiquadFilter(); rhp.type = 'highpass'; rhp.frequency.value = 2500;
    this.rushGain = ctx.createGain(); this.rushGain.gain.value = 0;
    rush.connect(rhp).connect(this.rushGain).connect(this.sfx);
    this.boost = 0; this.lastT = ctx.currentTime; this.prevThrottle = 0;

    this.startMusic();
  }

  // blow-off valve: a sharp "pssshh" plus compressor flutter ("stu-tu-tu") as the throttle closes
  blowOff(amount) {
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(3200, t); bp.frequency.exponentialRampToValueAtTime(900, t + 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * amount, t + 0.015); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    src.connect(bp).connect(g).connect(this.sfx); src.start(t, Math.random()); src.stop(t + 0.55);
    // flutter: low noise chopped at ~22 Hz, slowing down
    const fl = ctx.createBufferSource(); fl.buffer = this.noise;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const chop = ctx.createGain(); chop.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.setValueAtTime(24, t); lfo.frequency.linearRampToValueAtTime(12, t + 0.35);
    const depth = ctx.createGain(); depth.gain.value = 0.5; lfo.connect(depth).connect(chop.gain);
    const fg = ctx.createGain(); fg.gain.setValueAtTime(0.55 * amount, t + 0.03); fg.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    fl.connect(lp).connect(chop).connect(fg).connect(this.sfx);
    fl.start(t + 0.03, Math.random()); fl.stop(t + 0.42); lfo.start(t + 0.03); lfo.stop(t + 0.42);
  }

  // exhaust pop/crackle on the overrun
  pop() {
    const ctx = this.ctx, t = ctx.currentTime + Math.random() * 0.04;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 350 + Math.random() * 700; bp.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35 + Math.random() * 0.3, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    src.connect(bp).connect(g).connect(this.sfx); src.start(t, Math.random()); src.stop(t + 0.09);
  }

  // speedFrac 0..1, rpm, throttle 0..1, slip 0..1, scrape 0/1
  update(speedFrac, throttle, running, { rpm = 1000, slip = 0, scrape = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, on = running ? 1 : 0;
    const f = (rpm / 60) * 3; // inline-six firing frequency
    this.o1.frequency.setTargetAtTime(f, t, 0.02);
    this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.02);
    this.o3.frequency.setTargetAtTime(f * 2.01, t, 0.02);
    this.engLP.frequency.setTargetAtTime(380 + throttle * 1900 + rpm * 0.22, t, 0.04);
    this.engGain.gain.setTargetAtTime(on * (0.12 + throttle * 0.12), t, 0.06);
    this.intakeBP.frequency.setTargetAtTime(400 + rpm * 0.25, t, 0.05);
    this.intakeGain.gain.setTargetAtTime(on * throttle * 0.06 * (rpm / 8000), t, 0.08);
    this.squealGain.gain.setTargetAtTime(on * Math.min(1, slip) * 0.22, t, 0.06);
    this.squealBP.frequency.setTargetAtTime(1100 + slip * 500 + Math.sin(t * 14) * 60, t, 0.05);
    this.scrapeGain.gain.setTargetAtTime(on * scrape * 0.18, t, 0.03);
    this.windGain.gain.setTargetAtTime(on * speedFrac * speedFrac * 0.2, t, 0.2);
    this.windBP.frequency.setTargetAtTime(350 + speedFrac * 900, t, 0.3);

    // turbo boost: builds with throttle above ~2500 rpm (with lag), collapses when you lift
    const dt = Math.min(0.1, t - this.lastT); this.lastT = t;
    const rpmK = Math.min(1, Math.max(0, (rpm - 2500) / 4500));
    const target = on * (throttle > 0.6 ? rpmK : 0);
    this.boost += (target - this.boost) * (target > this.boost ? 1 - Math.exp(-dt * 1.6) : 1 - Math.exp(-dt * 9));
    if (on && this.prevThrottle > 0.6 && throttle <= 0.6) { this.liftT = t; if (this.boost > 0.35) this.blowOff(Math.min(1, this.boost + 0.2)); }
    // crackle only in the second or so after lifting off, not while cruising
    if (on && throttle <= 0.6 && rpm > 3800 && t - (this.liftT ?? -9) < 1.3 && Math.random() < dt * 10) this.pop();
    this.prevThrottle = throttle;
    const whine = 1800 + this.boost * 3600 + rpm * 0.12;
    this.t1.frequency.setTargetAtTime(whine, t, 0.05);
    this.t2.frequency.setTargetAtTime(whine * 1.51, t, 0.05);
    this.turboBP.frequency.setTargetAtTime(whine, t, 0.05);
    this.turboGain.gain.setTargetAtTime(this.boost * this.boost * 0.09, t, 0.05);
    this.rushGain.gain.setTargetAtTime(this.boost * 0.05, t, 0.08);
  }

  crash() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(2500, t); lp.frequency.exponentialRampToValueAtTime(200, t + 1.2);
    const g = ctx.createGain(); g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    src.connect(lp).connect(g).connect(this.sfx); src.start(t); src.stop(t + 1.5);
    const boom = ctx.createOscillator(); boom.frequency.setValueAtTime(90, t); boom.frequency.exponentialRampToValueAtTime(35, t + 0.5);
    const bg = ctx.createGain(); bg.gain.setValueAtTime(0.8, t); bg.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    boom.connect(bg).connect(this.sfx); boom.start(t); boom.stop(t + 0.7);
  }

  nearMiss() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(2400, t); bp.frequency.exponentialRampToValueAtTime(450, t + 0.4);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    src.connect(bp).connect(g).connect(this.sfx); src.start(t, Math.random()); src.stop(t + 0.5);
  }

  /* --------------------------------------------------------------- music */
  // 96 bpm loop: warm pad chords, a plucked bass line and soft hats (A minor, i-VI-III-VII)
  startMusic() {
    const ctx = this.ctx, beat = 60 / 96;
    const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
    const bass = [45, 41, 36, 43];
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    let next = ctx.currentTime + 0.2, step = 0;
    const play = (time, freq, dur, type, gain, cutoff) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, time); g.gain.exponentialRampToValueAtTime(gain, time + Math.min(0.08, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      o.connect(f).connect(g).connect(this.musicBus); o.start(time); o.stop(time + dur + 0.05);
    };
    const hat = (time) => {
      const s = ctx.createBufferSource(); s.buffer = this.noise;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.12, time); g.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
      s.connect(hp).connect(g).connect(this.musicBus); s.start(time, Math.random()); s.stop(time + 0.06);
    };
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      while (next < ctx.currentTime + 0.3) {
        const bar = Math.floor(step / 8) % 4, inBar = step % 8;
        if (inBar === 0) for (const n of chords[bar]) play(next, hz(n), beat * 4, 'triangle', 0.18, 1400);
        if (inBar % 2 === 0) play(next, hz(bass[bar] + (inBar === 6 ? 12 : 0)), beat * 0.45, 'sawtooth', 0.32, 600);
        if (inBar % 2 === 1) hat(next);
        next += beat / 2; step++;
      }
    }, 100);
  }

  setMusic(on) {
    this.musicOn = on;
    store.set('driftgame.music', on);
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(on ? 0.16 : 0, this.ctx.currentTime, 0.3);
  }

  setMuted(m) {
    this.muted = m;
    store.set('driftgame.muted', m);
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.05);
  }
}
