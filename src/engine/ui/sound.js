// Sonido sintetizado del motor, el silbido del turbo y el "psshh" de la blow-off.
export class EngineSound {
  constructor() {
    this.ctx = null;
    this.on = false;
  }

  start() {
    try {
      if (!this.ctx) this.build();
      this.ctx.resume();
      this.on = true;
      this.master.gain.setTargetAtTime(0.5, this.ctx.currentTime, 0.1);
    } catch {
      this.on = false;
    }
  }

  stop() {
    if (!this.ctx) return;
    this.on = false;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
  }

  build() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    // Motor: diente de sierra a la frecuencia de encendido + subarmónico
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 600;
    this.lp.Q.value = 3;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0.2;
    this.lp.connect(this.engGain).connect(this.master);
    this.osc = [0.5, 1, 2].map((m, i) => {
      const o = ctx.createOscillator();
      o.type = i === 1 ? 'sawtooth' : 'square';
      const gn = ctx.createGain();
      gn.gain.value = [0.35, 0.5, 0.12][i];
      o.connect(gn).connect(this.lp);
      o.start();
      return { o, m };
    });
    // Turbo: silbido agudo
    this.whistle = ctx.createOscillator();
    this.whistle.type = 'sine';
    this.whGain = ctx.createGain();
    this.whGain.gain.value = 0;
    this.whistle.connect(this.whGain).connect(this.master);
    this.whistle.start();
    // Ruido para la blow-off
    const len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
  }

  update(sim) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    const fire = (sim.rpm / 60) * 3; // 3 explosiones por vuelta
    for (const { o, m } of this.osc) o.frequency.setTargetAtTime(fire * m, t, 0.05);
    this.lp.frequency.setTargetAtTime(250 + 1800 * sim.throttle + sim.rpm * 0.08, t, 0.05);
    this.engGain.gain.setTargetAtTime(0.12 + 0.18 * sim.throttle, t, 0.05);
    this.whistle.frequency.setTargetAtTime(1800 + (sim.shaftRpm / sim.turbo.maxShaftRpm) * 5200, t, 0.1);
    this.whGain.gain.setTargetAtTime(0.02 * Math.max(0, sim.boost) * sim.throttle, t, 0.1);
  }

  bov() {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(3500, t);
    bp.frequency.exponentialRampToValueAtTime(900, t + 0.5);
    bp.Q.value = 0.9;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.6);
  }
}
