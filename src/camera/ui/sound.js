// "Clac" del obturador sintetizado con Web Audio (sin archivos).
export class ShutterSound {
  constructor() {
    this.ctx = null;
  }

  resume() {
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  click(level = 1) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.06);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35 * level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(t);
    // golpe grave del mecanismo
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.05);
    og.gain.setValueAtTime(0.25 * level, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.connect(og).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.07);
  }
}
