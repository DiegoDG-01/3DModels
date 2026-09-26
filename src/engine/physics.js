// Modelo simplificado del Toyota 2JZ-GTE: ciclo de 4 tiempos, turbo, intercooler y banco de potencia.
// Unidades: bar (presión relativa), °C, Nm, CV, rpm.

export const SPECS = {
  displacementCc: 2997,
  bore: 86,
  stroke: 86,
  rod: 142,
  compression: 8.5,
  cylinders: 6,
  firingOrder: [1, 5, 3, 6, 2, 4],
  idle: 800,
  redline: 7000,
};

// Ángulo de cigüeñal (0–720°) en el que cada cilindro empieza su explosión (PMS de compresión).
// Orden 1-5-3-6-2-4 con 120° entre explosiones → 3 explosiones por vuelta.
export const FIRE_OFFSET = { 1: 0, 5: 120, 3: 240, 6: 360, 2: 480, 4: 600 };

export const STROKES = [
  { id: 'power', name: 'Explosión', short: 'EXPL', color: '#ff8a3d', from: 0 },
  { id: 'exhaust', name: 'Escape', short: 'ESC', color: '#a3acb9', from: 180 },
  { id: 'intake', name: 'Admisión', short: 'ADM', color: '#4fb3ff', from: 360 },
  { id: 'compression', name: 'Compresión', short: 'COMP', color: '#b394ff', from: 540 },
];

// Distribución (grados de cigüeñal medidos desde el PMS de compresión)
export const VALVE_TIMING = {
  intake: { center: 470, duration: 240, lift: 8.4 },
  exhaust: { center: 250, duration: 240, lift: 8.4 },
};

export const TURBOS = {
  twin: {
    id: 'twin',
    name: 'Twin turbo secuencial',
    short: 'Twin secuencial',
    tag: 'De serie · 2× CT12B',
    stockBoost: 0.8,
    maxBoost: 1.3,
    spoolStart: 1700,
    spoolFull: 3000,
    seqSwitch: 4000,
    chokeFrom: 4800,
    lag: 0.35,
    compEff: 0.7,
    maxShaftRpm: 180000,
    desc: 'Dos turbos pequeños. El primero sopla desde muy abajo; a 4000 rpm se abre el segundo y soplan juntos. Poco retraso, pero se quedan cortos arriba.',
  },
  single: {
    id: 'single',
    name: 'Single turbo grande',
    short: 'Single grande',
    tag: 'Preparación · tipo GT35',
    stockBoost: 1.3,
    maxBoost: 2.0,
    spoolStart: 3000,
    spoolFull: 4700,
    seqSwitch: null,
    chokeFrom: null,
    lag: 0.95,
    compEff: 0.76,
    maxShaftRpm: 130000,
    desc: 'Un turbo mucho más grande: tarda más en cargar (más "lag"), pero a altas vueltas mueve muchísimo aire y la potencia se dispara.',
  },
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const mod = (a, n) => ((a % n) + n) % n;

/** Fase del ciclo (0–720°) de un cilindro para un ángulo de cigüeñal dado. */
export function cyclePhase(crankDeg, cyl) {
  return mod(crankDeg - FIRE_OFFSET[cyl], 720);
}

export function strokeAt(phase) {
  return STROKES[Math.floor(mod(phase, 720) / 180)];
}

/** Alzada de válvula normalizada (0–1) según la fase del ciclo. */
export function valveLift(phase, which) {
  const v = VALVE_TIMING[which];
  let d = mod(phase - v.center + 360, 720) - 360;
  const half = v.duration / 2;
  if (Math.abs(d) >= half) return 0;
  const c = Math.cos((d / half) * (Math.PI / 2));
  return c * c;
}

/** Rendimiento volumétrico sin turbo (llenado del cilindro). */
function volumetricEff(rpm) {
  const x = (rpm - 4600) / 3200;
  return clamp(0.95 - 0.13 * x * x, 0.72, 0.95);
}

/** Presión que el turbo puede dar en régimen estable a plena carga. */
export function boostAvailable(turbo, rpm, target) {
  let b = target * smooth(turbo.spoolStart, turbo.spoolFull, rpm);
  if (turbo.seqSwitch) {
    // Solo el turbo primario hasta el cambio; pequeño bache al abrir el secundario
    if (rpm < turbo.seqSwitch) b = Math.min(b, 0.72 * Math.min(target, turbo.maxBoost) + 0.12);
    b -= 0.12 * Math.exp(-(((rpm - turbo.seqSwitch) / 220) ** 2));
  }
  // Los turbos pequeños se ahogan a altas vueltas: no pueden mover más aire
  if (turbo.chokeFrom) b *= 1 - 0.42 * smooth(turbo.chokeFrom, SPECS.redline + 400, rpm);
  return Math.max(0, b);
}

/** Estado del aire de admisión a una presión dada. */
export function chargeAir(turbo, boost, ambient = 25, icEff = 0.75) {
  const pr = 1 + Math.max(0, boost);
  const t1 = ambient + 273.15;
  const t2 = t1 * (1 + (Math.pow(pr, 0.286) - 1) / turbo.compEff);
  const t3 = t2 - icEff * (t2 - t1);
  return { pr, compressorOut: t2 - 273.15, afterIc: t3 - 273.15 };
}

/**
 * Par y potencia para una presión de colector (bar relativos, negativo = vacío).
 */
export function output(turbo, rpm, boost) {
  const ve = volumetricEff(rpm);
  const air = chargeAir(turbo, boost);
  const mapAbs = 1 + boost;
  const density = mapAbs * (298.15 / (air.afterIc + 273.15));
  const afr = boost > 0 ? 14.7 - 3.2 * clamp(boost / 1.0, 0, 1) : 14.7;
  const richGain = 1 + 0.06 * clamp(boost, 0, 1); // mezcla rica bajo presión: algo más de par
  const imep = 11.8 * (ve / 0.95) * density * richGain;
  const fmep = 0.9 + 0.00012 * rpm + 2.5e-8 * rpm * rpm; // pérdidas por fricción y bombeo
  const bmep = Math.max(0, imep - fmep);
  const torque = (bmep * 1e5 * SPECS.displacementCc * 1e-6) / (4 * Math.PI);
  const kw = (torque * rpm * 2 * Math.PI) / 60 / 1000;
  const massAir = 1.184 * density * ve * SPECS.displacementCc * 1e-6 * (rpm / 120); // kg/s
  return {
    torque,
    kw,
    hp: kw * 1.341,
    cv: kw * 1.36,
    bmep,
    afr,
    air,
    density,
    massAir,
    fuel: massAir / afr,
  };
}

/** Curvas a plena carga para el banco de potencia. */
export function dynoCurve(turbo, target) {
  const pts = [];
  for (let rpm = 1000; rpm <= SPECS.redline; rpm += 100) {
    const b = boostAvailable(turbo, rpm, target);
    const o = output(turbo, rpm, b);
    pts.push({ rpm, boost: b, torque: o.torque, cv: o.cv });
  }
  const na = [];
  for (let rpm = 1000; rpm <= SPECS.redline; rpm += 100) {
    const o = output(turbo, rpm, 0);
    na.push({ rpm, torque: o.torque, cv: o.cv });
  }
  return { pts, na };
}

/**
 * Simulación en tiempo real (inercia del turbo, válvula de descarga, blow-off…).
 */
export class EngineSim {
  constructor() {
    this.turbo = TURBOS.twin;
    this.rpm = 3000;
    this.throttle = 0.35;
    this.target = TURBOS.twin.stockBoost;
    this.boost = -0.3;
    this.bovEvents = 0;
    this._prevThrottle = this.throttle;
  }

  step(dt) {
    const t = this.turbo;
    const load = Math.pow(this.throttle, 0.8);
    const avail = boostAvailable(t, this.rpm, this.target);
    // Presión objetivo en el colector: vacío con el acelerador cerrado, presión de turbo a fondo
    const vac = -0.72 + 0.1 * (this.rpm / SPECS.redline);
    const want = this.throttle < 0.02 ? vac : vac + (avail - vac) * load * (0.55 + 0.45 * load);
    // El turbo tarda en cargar (lag), la caída de presión es más rápida
    const tau = want > this.boost ? t.lag * (1.3 - 0.6 * (this.rpm / SPECS.redline)) : 0.18;
    this.boost += (want - this.boost) * (1 - Math.exp(-dt / Math.max(0.05, tau)));

    // Blow-off: acelerador cerrado de golpe con presión en el circuito
    const closing = this._prevThrottle - this.throttle;
    if (closing > 0.35 && this.boost > 0.25) {
      this.bovEvents++;
      this.bovUntil = performance.now() + 600;
    }
    this._prevThrottle = this.throttle;

    const o = output(t, this.rpm, this.boost);
    const pr = 1 + Math.max(0, this.boost);
    this.wastegate = this.boost > 0 ? clamp((this.boost - this.target * 0.9) / (this.target * 0.12), 0, 1) * load : 0;
    this.secondaryActive = !!t.seqSwitch && this.rpm >= t.seqSwitch && load > 0.3;
    const flow = Math.sqrt(this.rpm / SPECS.redline) * (0.35 + 0.65 * load);
    this.shaftRpm = 15000 + (t.maxShaftRpm - 15000) * clamp((pr - 1) / t.maxBoost * 0.75 + flow * 0.3, 0, 1);
    this.egt = 380 + 520 * clamp(o.bmep / 22, 0, 1) + 60 * (this.rpm / SPECS.redline);
    this.knock = this.boost > 1.35 ? 'alto' : this.boost > 1.05 ? 'moderado' : 'bajo';
    this.out = o;
    return o;
  }

  get bovActive() {
    return (this.bovUntil ?? 0) > performance.now();
  }
}
