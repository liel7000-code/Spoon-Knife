// Keyboard, swipe and on-screen button input.
export class Input {
  constructor(canvas) {
    this.gas = false;
    this.brake = false;
    this.onLane = () => {};
    this.onCamera = () => {};
    this.keysHeld = new Set();
    this.touchHeld = { gas: false, brake: false };

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k)) e.preventDefault();
      if (e.target instanceof HTMLInputElement) return;
      this.keysHeld.add(k);
      this.sync();
      if (e.repeat) return;
      if (k === 'a' || k === 'arrowleft') this.onLane(-1);
      if (k === 'd' || k === 'arrowright') this.onLane(1);
      if (k === 'c') this.onCamera();
    });
    window.addEventListener('keyup', (e) => { this.keysHeld.delete(e.key.toLowerCase()); this.sync(); });
    window.addEventListener('blur', () => { this.keysHeld.clear(); this.sync(); });

    // swipe on the game canvas
    let sx = 0, sy = 0, tracking = false;
    canvas.addEventListener('pointerdown', (e) => { tracking = true; sx = e.clientX; sy = e.clientY; });
    canvas.addEventListener('pointermove', (e) => {
      if (!tracking) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 38 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        this.onLane(Math.sign(dx));
        tracking = false; // one lane per swipe
      }
    });
    const end = () => { tracking = false; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    // on-screen buttons
    document.querySelectorAll('#touch [data-act]').forEach((btn) => {
      const act = btn.dataset.act;
      const down = (e) => {
        e.preventDefault();
        btn.classList.add('on');
        if (act === 'left') this.onLane(-1);
        else if (act === 'right') this.onLane(1);
        else { this.touchHeld[act] = true; this.sync(); }
      };
      const up = (e) => {
        e.preventDefault();
        btn.classList.remove('on');
        if (act === 'gas' || act === 'brake') { this.touchHeld[act] = false; this.sync(); }
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
    });
  }

  sync() {
    const k = this.keysHeld;
    this.gas = k.has('w') || k.has('arrowup') || this.touchHeld.gas;
    this.brake = k.has('s') || k.has('arrowdown') || this.touchHeld.brake;
  }

  static isTouch() {
    return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  }
}
