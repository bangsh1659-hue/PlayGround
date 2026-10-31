export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.lookX = 0;
    this.lookY = 0;
    this.mouseLeft = false;
    this.mouseRight = false;
    this.locked = false;
    this.enabled = false;
    this.isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.mobileMove = { x: 0, y: 0 };
    this.mobileFire = false;
    this.mobileSprint = false;
    this.mobileLook = { x: 0, y: 0 };
    this.onAction = null;
    this.onJump = null;
    this.onPause = null;
    this.onMute = null;

    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!e.repeat) {
        this.pressed.add(e.code);
        if (e.code === 'KeyM' && this.onMute) this.onMute();
        if (e.code === 'Escape' && this.onPause) this.onPause();
        if (e.code === 'KeyF' && this.onAction) this.onAction();
        if (e.code === 'Space' && this.onJump) this.onJump();
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseLeft = false; this.mouseRight = false; });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.lookX += e.movementX;
      this.lookY += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.button === 0) this.mouseLeft = true;
      if (e.button === 2) this.mouseRight = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseLeft = false;
      if (e.button === 2) this.mouseRight = false;
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      if (was && !this.locked && this.enabled && this.onPause) this.onPause(true);
    });
    this.canvas.addEventListener('click', () => {
      if (this.enabled && !this.isTouch && !this.locked) this.requestLock();
    });

    this.setupTouch();
  }

  requestLock() {
    if (this.isTouch) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (_) { /* ignore */ }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  consume(code) {
    if (this.pressed.has(code)) { this.pressed.delete(code); return true; }
    return false;
  }

  consumeLook() {
    const x = this.lookX, y = this.lookY;
    this.lookX = 0; this.lookY = 0;
    return { x, y };
  }

  get forward() { return (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) - this.mobileMove.y; }
  get strafe() { return (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0) + this.mobileMove.x; }
  get sprint() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.mobileSprint; }
  get fire() { return this.mouseLeft || this.mobileFire; }
  get aim() { return this.mouseRight; }

  clearFrame() { this.pressed.clear(); this.mobileLook.x = 0; this.mobileLook.y = 0; }

  setupTouch() {
    const joy = document.getElementById('joystick');
    const knob = document.getElementById('joystick-knob');
    let joyId = null;
    const resetJoy = () => {
      joyId = null;
      this.mobileMove.x = 0; this.mobileMove.y = 0;
      knob.style.transform = 'translate(0px, 0px)';
    };
    joy.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      joyId = e.pointerId; joy.setPointerCapture(e.pointerId);
    });
    joy.addEventListener('pointermove', (e) => {
      if (e.pointerId !== joyId) return;
      e.preventDefault();
      const r = joy.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const max = r.width * 0.34;
      const d = Math.hypot(dx, dy);
      if (d > max) { dx = dx / d * max; dy = dy / d * max; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.mobileMove.x = dx / max;
      this.mobileMove.y = dy / max;
    });
    joy.addEventListener('pointerup', resetJoy);
    joy.addEventListener('pointercancel', resetJoy);

    const hold = (id, down, up) => {
      const el = document.getElementById(id);
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); el.setPointerCapture(e.pointerId); down(); });
      el.addEventListener('pointerup', (e) => { e.preventDefault(); up && up(); });
      el.addEventListener('pointercancel', () => { up && up(); });
      el.addEventListener('pointerleave', () => { up && up(); });
    };
    hold('btn-fire', () => { this.mobileFire = true; }, () => { this.mobileFire = false; });
    hold('btn-sprint', () => { this.mobileSprint = true; }, () => { this.mobileSprint = false; });
    hold('btn-action', () => { if (this.onAction) this.onAction(); });
    hold('btn-jump', () => { if (this.onJump) this.onJump(); });

    // touch look on the world
    let lookId = null, lastX = 0, lastY = 0;
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || !this.enabled) return;
      if (lookId !== null) return;
      if (e.clientX < window.innerWidth * 0.32) return;
      lookId = e.pointerId; lastX = e.clientX; lastY = e.clientY;
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lookId) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      this.mobileLook.x += dx * 1.35;
      this.mobileLook.y += dy * 1.35;
    });
    const endLook = (e) => { if (e.pointerId === lookId) lookId = null; };
    this.canvas.addEventListener('pointerup', endLook);
    this.canvas.addEventListener('pointercancel', endLook);
  }
}
