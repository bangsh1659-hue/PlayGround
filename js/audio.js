export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineNodes = null;
    this.sirenNodes = null;
    this.padNodes = null;
    this.ambient = null;
    this.chordIndex = 0;
    this.chordTimer = 0;
    this.engineOn = false;
    this.engineSpeed = 0;
    this.sirenLevel = 0;
    this.ready = false;
  }

  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    this.master.connect(this.ctx.destination);
    this.ready = true;

    // low city rumble
    const noise = this.noiseBuffer(3);
    const src = this.ctx.createBufferSource();
    src.buffer = noise; src.loop = true;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
    const gain = this.ctx.createGain(); gain.gain.value = 0.028;
    src.connect(lp).connect(gain).connect(this.master);
    src.start();
    this.ambient = gain;

    this.buildEngine();
    this.buildSiren();
    this.buildPad();
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.05);
  }

  noiseBuffer(seconds = 1) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  buildEngine() {
    const ctx = this.ctx;
    const out = ctx.createGain(); out.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 480; lp.Q.value = 3;
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 55;
    const osc2 = ctx.createOscillator(); osc2.type = 'square'; osc2.frequency.value = 27.5;
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    osc.connect(lp); osc2.connect(g2).connect(lp);
    lp.connect(out).connect(this.master);
    osc.start(); osc2.start();
    this.engineNodes = { out, lp, osc, osc2 };
  }

  buildSiren() {
    const ctx = this.ctx;
    const out = ctx.createGain(); out.gain.value = 0;
    const osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = 760;
    const osc2 = ctx.createOscillator(); osc2.type = 'sine'; osc2.frequency.value = 1140;
    const g2 = ctx.createGain(); g2.gain.value = 0.4;
    osc.connect(out); osc2.connect(g2).connect(out);
    out.connect(this.master);
    osc.start(); osc2.start();
    this.sirenNodes = { out, osc, osc2, phase: 0 };
  }

  buildPad() {
    const ctx = this.ctx;
    const out = ctx.createGain(); out.gain.value = 0.0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const notes = [220, 261.63, 329.63, 392.0];
    const oscs = notes.map((f) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0.25;
      o.connect(g).connect(lp); o.start();
      return o;
    });
    lp.connect(out).connect(this.master);
    out.gain.setTargetAtTime(0.05, ctx.currentTime, 2.5);
    this.padNodes = { out, lp, oscs };
  }

  setEngine(on, speed = 0, throttle = 0) {
    if (!this.ctx) return;
    this.engineOn = on; this.engineSpeed = speed;
    const n = this.engineNodes;
    if (!n) return;
    const target = on ? 0.055 + Math.abs(throttle) * 0.035 : 0;
    n.out.gain.setTargetAtTime(target, this.ctx.currentTime, 0.12);
    const f = 42 + Math.min(180, Math.abs(speed) * 4.2);
    n.osc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.08);
    n.osc2.frequency.setTargetAtTime(f * 0.5, this.ctx.currentTime, 0.08);
    n.lp.frequency.setTargetAtTime(320 + Math.abs(speed) * 16, this.ctx.currentTime, 0.1);
  }

  setSiren(level) {
    if (!this.ctx || !this.sirenNodes) return;
    this.sirenLevel = level;
    this.sirenNodes.out.gain.setTargetAtTime(level * 0.06, this.ctx.currentTime, 0.1);
  }

  update(dt) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.sirenNodes && this.sirenLevel > 0.001) {
      const s = this.sirenNodes;
      s.phase += dt;
      const hi = (s.phase % 1.1) < 0.55;
      s.osc.frequency.setTargetAtTime(hi ? 960 : 700, t, 0.02);
      s.osc2.frequency.setTargetAtTime(hi ? 1440 : 1050, t, 0.02);
    }
    if (this.padNodes) {
      this.chordTimer += dt;
      if (this.chordTimer > 9) {
        this.chordTimer = 0;
        this.chordIndex = (this.chordIndex + 1) % 4;
        const roots = [220, 174.61, 261.63, 196.0];
        const root = roots[this.chordIndex];
        const ratios = [1, 1.1892, 1.4983, 1.7818];
        this.padNodes.oscs.forEach((o, i) => o.frequency.setTargetAtTime(root * ratios[i], t, 1.8));
      }
    }
  }

  blip(freq = 800, dur = 0.06, type = 'sine', gain = 0.06, slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  noiseBurst(dur = 0.12, freq = 1800, gain = 0.16, type = 'lowpass') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuffer(Math.max(0.05, dur));
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master); src.start(t); src.stop(t + dur + 0.02);
  }

  gunshot() {
    if (!this.ctx) return;
    this.noiseBurst(0.13, 2400, 0.22);
    this.noiseBurst(0.28, 500, 0.1);
    this.blip(120, 0.1, 'square', 0.12, -70);
  }
  enemyShot() {
    if (!this.ctx) return;
    this.noiseBurst(0.1, 1500, 0.09);
    this.blip(90, 0.08, 'square', 0.05, -50);
  }
  hit() { this.blip(1450, 0.05, 'square', 0.05, -300); }
  kill() { this.blip(900, 0.12, 'sawtooth', 0.05, 400); }
  reload() {
    this.blip(300, 0.04, 'square', 0.05);
    setTimeout(() => this.blip(520, 0.05, 'square', 0.05), 130);
  }
  pickup() {
    this.blip(660, 0.09, 'triangle', 0.07);
    setTimeout(() => this.blip(990, 0.12, 'triangle', 0.07), 80);
  }
  missionComplete() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.07), i * 110));
  }
  wasted() {
    this.blip(180, 0.9, 'sawtooth', 0.1, -120);
    setTimeout(() => this.blip(90, 1.2, 'sine', 0.12, -40), 200);
  }
  explosion() {
    this.noiseBurst(0.8, 420, 0.3);
    this.blip(80, 0.7, 'sine', 0.18, -55);
  }
  ui() { this.blip(620, 0.05, 'triangle', 0.05); }
  crash() { this.noiseBurst(0.18, 900, 0.09); }
}
