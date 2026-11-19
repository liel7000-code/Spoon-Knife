// Analog steering input: keyboard (smoothed in physics), on-screen slider, device tilt.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Input {
  constructor() {
    this.gas = false;
    this.brake = false;
    this.onCamera = () => {};
    this.keysHeld = new Set();
    this.touchHeld = { gas: false, brake: false };
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
    });
    window.addEventListener('keyup', (e) => { this.keysHeld.delete(e.key.toLowerCase()); this.sync(); });
    window.addEventListener('blur', () => { this.keysHeld.clear(); this.sync(); });

    // gas / brake buttons
    document.querySelectorAll('#touch [data-act]').forEach((btn) => {
      const act = btn.dataset.act;
      const set = (on) => (e) => { e.preventDefault(); btn.classList.toggle('on', on); this.touchHeld[act] = on; this.sync(); };
      btn.addEventListener('pointerdown', set(true));
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(ev, set(false));
    });

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
    this.gas = k.has('w') || k.has('arrowup') || this.touchHeld.gas;
    this.brake = k.has('s') || k.has('arrowdown') || this.touchHeld.brake;
  }

  // { target: -1..1, analog: bool }
  steering() {
    if (this.sliderActive) return { target: this.slider, analog: true };
    if (this.tiltEnabled) return { target: Math.abs(this.tilt) < 0.04 ? 0 : this.tilt, analog: true };
    const k = this.keysHeld;
    let t = 0;
    if (k.has('a') || k.has('arrowleft')) t -= 1;
    if (k.has('d') || k.has('arrowright')) t += 1;
    return { target: t, analog: false };
  }

  static isTouch() {
    return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  }
}
