// WebAudio engine: two detuned oscillators through a low-pass, pitch follows
// speed through a simple 6-gear ladder. Plus a noise burst for crashes.
export class EngineAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem('driftgame.muted') === '1'; } catch (e) { /* storage blocked */ }
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass'; this.filter.frequency.value = 800; this.filter.Q.value = 2;
    this.engineGain = ctx.createGain(); this.engineGain.gain.value = 0;
    this.filter.connect(this.engineGain).connect(this.master);

    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = ctx.createOscillator(); this.o2.type = 'square';
    const g2 = ctx.createGain(); g2.gain.value = 0.45;
    this.o1.connect(this.filter); this.o2.connect(g2).connect(this.filter);
    this.o1.start(); this.o2.start();

    // wind noise rising with speed
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 0.6;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    src.connect(bp).connect(this.windGain).connect(this.master); src.start();
  }

  // speedFrac 0..1 of top speed, throttle 0..1
  update(speedFrac, throttle, running) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const gears = 6;
    const g = Math.min(gears - 1, Math.floor(speedFrac * gears));
    const within = speedFrac * gears - g;
    const rpm = g === 0 ? 0.25 + within * 0.7 : 0.42 + within * 0.55; // 0..1
    const f = 48 + rpm * 150;
    this.o1.frequency.setTargetAtTime(f, t, 0.03);
    this.o2.frequency.setTargetAtTime(f * 0.5 * 1.006, t, 0.03);
    this.filter.frequency.setTargetAtTime(350 + rpm * 900 + throttle * 900, t, 0.05);
    this.engineGain.gain.setTargetAtTime(running ? 0.16 + throttle * 0.1 : 0, t, 0.08);
    this.windGain.gain.setTargetAtTime(running ? speedFrac * speedFrac * 0.18 : 0, t, 0.2);
  }

  crash() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t); src.stop(t + 1.2);
  }

  nearMiss() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.5;
    bp.frequency.setValueAtTime(2200, t); bp.frequency.exponentialRampToValueAtTime(500, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t, Math.random()); src.stop(t + 0.45);
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('driftgame.muted', m ? '1' : '0'); } catch (e) { /* ignore */ }
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }
}
