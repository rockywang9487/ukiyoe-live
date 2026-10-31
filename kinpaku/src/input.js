// Pointer, touch and device tilt, smoothed with critically damped springs.
// Outputs are in [-1, 1]: x to the right, y upward.

class Spring {
  constructor(halfLife) { this.v = 0; this.x = 0; this.k = halfLife; }
  step(target, dt) {
    // critically damped spring with the given half-life (seconds)
    const w = 1.6783 / Math.max(this.k, 1e-3);
    const e = Math.exp(-w * dt);
    const d = this.x - target;
    const j = this.v + w * d;
    this.x = target + (d + j * dt) * e;
    this.v = (this.v - w * j * dt) * e;
    return this.x;
  }
}

export class Input {
  constructor(el, { fixed = null, reduced = false } = {}) {
    this.el = el;
    this.fixed = fixed;
    this.reduced = reduced;
    this.raw = { x: 0, y: 0 };
    this.lastMove = -1e9;
    this.touched = false;
    this.eye = { x: new Spring(0.35), y: new Spring(0.35) };
    this.light = { x: new Spring(0.5), y: new Spring(0.5) };
    this.head = new Spring(0.45);
    this.headLag = new Spring(0.25);
    this.tilt = null;
    const move = (cx, cy) => {
      const r = el.getBoundingClientRect();
      this.raw.x = Math.max(-1, Math.min(1, ((cx - r.left) / r.width) * 2 - 1));
      this.raw.y = Math.max(-1, Math.min(1, 1 - ((cy - r.top) / r.height) * 2));
      this.lastMove = performance.now() / 1000;
      if (!this.touched) { this.touched = true; this.onFirstMove?.(); }
    };
    window.addEventListener('pointermove', (e) => move(e.clientX, e.clientY), { passive: true });
    window.addEventListener('pointerdown', (e) => move(e.clientX, e.clientY), { passive: true });
  }

  // Phones: lean the device to look around. iOS asks for permission once.
  async enableTilt() {
    const DOE = window.DeviceOrientationEvent;
    if (!DOE) return false;
    try {
      if (typeof DOE.requestPermission === 'function') {
        const res = await DOE.requestPermission();
        if (res !== 'granted') return false;
      }
    } catch { return false; }
    let base = null;
    window.addEventListener('deviceorientation', (e) => {
      if (e.beta == null || e.gamma == null) return;
      if (!base) base = { b: e.beta, g: e.gamma };
      this.tilt = {
        x: Math.max(-1, Math.min(1, (e.gamma - base.g) / 22)),
        y: Math.max(-1, Math.min(1, -(e.beta - base.b) / 22)),
      };
      this.lastMove = performance.now() / 1000;
    });
    return true;
  }

  update(dt, now) {
    let tx, ty;
    if (this.fixed) {
      [tx, ty] = this.fixed;
    } else if (this.tilt) {
      tx = this.tilt.x; ty = this.tilt.y;
    } else {
      tx = this.raw.x; ty = this.raw.y;
      // After a few idle seconds the view drifts on its own, slowly.
      const idle = Math.max(0, Math.min(1, (now - this.lastMove - 4) / 3));
      if (idle > 0) {
        const dx = 0.55 * Math.sin(now * 0.21) + 0.12 * Math.sin(now * 0.53 + 1.3);
        const dy = 0.35 * Math.sin(now * 0.17 + 0.8);
        tx = tx * (1 - idle) + dx * idle;
        ty = ty * (1 - idle) + dy * idle;
      }
    }
    const amp = this.reduced ? 0.3 : 1;
    this.eyeX = this.eye.x.step(tx * amp, dt);
    this.eyeY = this.eye.y.step(ty * amp, dt);
    this.lightX = this.light.x.step(tx, dt);
    this.lightY = this.light.y.step(ty, dt);
    // Takiyasha follows the cursor up and down, a beat behind it.
    this.headY = this.head.step(this.headLag.step(ty, dt), dt);
  }
}
