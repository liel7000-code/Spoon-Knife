// Steering input: keyboard and on-screen arrows (both smoothed in physics), device
// tilt, and an analog slider path (kept for analog/automated input).
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Input {
  constructor() {
    this.gas = false;
    this.brake = false;
    this.onCamera = () => {};
    this.keysHeld = new Set();
    this.touchHeld = { gas: false, brake: false, left: false, right: false, hand: false };
    this.hand = false;
    this.kickPending = false;   // drift: clutch kick (Shift, or a quick double tap on the gas)
    this.resetPending = false;  // drift: put the car back on the track (R)
    this.lastGasUp = -1;
    this.slider = 0;          // -1..1 from the on-screen slider
    this.sliderActive = false;
    this.tilt = 0;            // -1..1 from the gyroscope
    this.tiltEnabled = false;
    this.tiltZero = null;

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k)) e.preventDefault();
      if (e.target instanceof HTMLInputElement) return;
      this.keysHeld.add(k);
      this.sync();
      if (!e.repeat && k === 'c') this.onCamera();
      if (!e.repeat && k === 'shift') this.kickPending = true;
      if (!e.repeat && k === 'r') this.resetPending = true;
    });
    window.addEventListener('keyup', (e) => { this.keysHeld.delete(e.key.toLowerCase()); this.sync(); });
    window.addEventListener('blur', () => { this.keysHeld.clear(); this.sync(); });

    // gas / brake buttons
    // on-screen buttons (arrows, gas, brake). Each tracks its own set of pointers, so
    // several fingers can hold different buttons at once (e.g. right arrow + gas).
    document.querySelectorAll('#touch [data-act]').forEach((btn) => {
      const act = btn.dataset.act, pointers = new Set();
      const update = () => { const on = pointers.size > 0; btn.classList.toggle('on', on); this.touchHeld[act] = on; this.sync(); };
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); pointers.add(e.pointerId); update(); });
      const release = (e) => { if (pointers.delete(e.pointerId)) update(); };
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture']) btn.addEventListener(ev, release);
      btn.addEventListener('contextmenu', (e) => e.preventDefault()); // long-press menu on phones
    });
    // safety net: a finger lifted anywhere releases anything it was holding
    window.addEventListener('pointerup', (e) => document.querySelectorAll('#touch [data-act]').forEach((b) => b.dispatchEvent(new PointerEvent('pointercancel', { pointerId: e.pointerId }))));

    // steering slider: drag the knob, it springs back to centre on release
    const pad = document.getElementById('steerPad');
    const knob = document.getElementById('steerKnob');
    if (pad) {
      const move = (e) => {
        const r = pad.getBoundingClientRect();
        this.slider = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
        knob.style.transform = `translateX(${this.slider * (r.width / 2 - 30)}px)`;
      };
      pad.addEventListener('pointerdown', (e) => { e.preventDefault(); pad.setPointerCapture(e.pointerId); this.sliderActive = true; move(e); });
      pad.addEventListener('pointermove', (e) => { if (this.sliderActive) move(e); });
      const end = () => { this.sliderActive = false; this.slider = 0; knob.style.transform = 'translateX(0)'; };
      pad.addEventListener('pointerup', end);
      pad.addEventListener('pointercancel', end);
    }

    window.addEventListener('deviceorientation', (e) => {
      if (!this.tiltEnabled || e.gamma == null) return;
      const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      // portrait: left/right tilt is gamma; landscape: it is beta
      let raw = angle === 90 ? e.beta : angle === -90 || angle === 270 ? -e.beta : e.gamma;
      if (this.tiltZero == null) this.tiltZero = raw;
      this.tilt = clamp((raw - this.tiltZero) / 22, -1, 1);
    });
  }

  // Must be called from a user gesture (iOS asks for permission).
  async setTilt(on) {
    if (on && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') on = false;
      } catch (e) { on = false; }
    }
    this.tiltEnabled = on;
    this.tiltZero = null;
    this.tilt = 0;
    return on;
  }

  sync() {
    const k = this.keysHeld;
    const gas = k.has('w') || k.has('arrowup') || this.touchHeld.gas;
    const now = performance.now() / 1000;
    if (gas && !this.gas && now - this.lastGasUp < 0.22) this.kickPending = true; // double tap = clutch kick
    if (!gas && this.gas) this.lastGasUp = now;
    this.gas = gas;
    this.brake = k.has('s') || k.has('arrowdown') || this.touchHeld.brake;
    this.hand = k.has(' ') || this.touchHeld.hand;
  }

  // { target: -1..1, analog: bool }
  steering() {
    if (this.sliderActive) return { target: this.slider, analog: true };
    if (this.tiltEnabled) return { target: Math.abs(this.tilt) < 0.04 ? 0 : this.tilt, analog: true };
    const k = this.keysHeld;
    let t = 0;
    if (k.has('a') || k.has('arrowleft') || this.touchHeld.left) t -= 1;
    if (k.has('d') || k.has('arrowright') || this.touchHeld.right) t += 1;
    return { target: t, analog: false };
  }

  static isTouch() {
    return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  }
}
