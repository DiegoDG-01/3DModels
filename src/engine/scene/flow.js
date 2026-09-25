// Partículas del flujo: aire (azul frío / naranja caliente tras el compresor) y gases de escape.
import * as THREE from 'three';
import { glowTexture } from '../../shared/textures.js';
import { cyclePhase, valveLift } from '../physics.js';

const COLORS = {
  amb: new THREE.Color(0xcfe8ff),
  hot: new THREE.Color(0xffa24a),
  cool: new THREE.Color(0x3fa9ff),
  exStart: new THREE.Color(0xff5a1f),
  exEnd: new THREE.Color(0x6e6560),
  bov: new THREE.Color(0xffffff),
};
const MAX = 2600;

export class FlowViz {
  constructor(scene) {
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3).fill(1e5);
    this.col = new Float32Array(MAX * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({
      size: 0.13, map: glowTexture(), vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
    this.p = [];
    this.acc = {};
    this.enabled = true;
    this._c = new THREE.Color();
    this._v = new THREE.Vector3();
  }

  setPaths(paths) {
    this.paths = paths;
    this.p = [];
    this.acc = {};
    this.lengths = new Map();
    const len = (c) => {
      if (!this.lengths.has(c)) this.lengths.set(c, c.getLength());
      return this.lengths.get(c);
    };
    for (const t of paths.trunk) t.len = len(t.curve);
    this.runnerLen = paths.runners.map(len);
    this.exLen = paths.exhaust.map(len);
    this.bovLen = paths.bov ? len(paths.bov) : 1;
  }

  emit(key, rate, dt, spawn) {
    this.acc[key] = (this.acc[key] ?? 0) + rate * dt;
    while (this.acc[key] >= 1 && this.p.length < MAX) {
      this.acc[key] -= 1;
      spawn();
    }
    if (this.acc[key] > 5) this.acc[key] = 0;
  }

  /**
   * ctx: { dt, crankDeg, degPerSec, sim, visible }
   */
  update({ dt, crankDeg, degPerSec, sim, visible }) {
    this.points.visible = this.enabled && visible;
    if (!this.points.visible || !this.paths) return;
    const P = this.paths;
    const cyclePeriod = 720 / Math.max(1, degPerSec); // segundos de pantalla por ciclo
    const load = sim.out.massAir / 0.3;
    const trunkSpeed = THREE.MathUtils.clamp(1.2 + (degPerSec / 360) * 2.2, 0.8, 9) * (0.6 + 0.6 * Math.min(1, load));

    // Tronco de admisión (filtro → turbo → intercooler → colector)
    P.trunk.forEach((t, n) => {
      if (t.secondary && !sim.secondaryActive) return;
      const rate = 20 + 260 * Math.min(1.4, load);
      this.emit(`t${n}`, rate, dt, () => this.p.push({ kind: 'trunk', path: t, s: 0, speed: trunkSpeed * (0.85 + Math.random() * 0.3), j: jitter(0.07) }));
    });
    // Conductos de admisión y escape, solo con la válvula abierta
    const openDur = (240 / 720) * cyclePeriod;
    for (let i = 0; i < 6; i++) {
      const ph = cyclePhase(crankDeg, i + 1);
      const li = valveLift(ph, 'intake');
      if (li > 0.08) {
        const speed = Math.max(1.2, this.runnerLen[i] / (openDur * 0.7));
        this.emit(`r${i}`, (60 + 220 * Math.min(1.5, load)) * li, dt, () => this.p.push({ kind: 'runner', i, s: 0, speed, j: jitter(0.1) }));
      }
      const le = valveLift(ph, 'exhaust');
      if (le > 0.08) {
        const speed = Math.max(1.5, this.exLen[i] / (openDur * 1.3));
        this.emit(`e${i}`, (70 + 200 * Math.min(1.5, load)) * le, dt, () => this.p.push({ kind: 'ex', i, s: 0, speed, j: jitter(0.08) }));
      }
    }
    if (sim.bovActive && P.bov) {
      this.emit('bov', 260, dt, () => this.p.push({ kind: 'bov', s: 0, speed: 2.5 + Math.random() * 1.5, j: jitter(0.18) }));
    }

    // Avance
    const alive = [];
    for (const q of this.p) {
      q.s += q.speed * dt;
      const L = q.kind === 'trunk' ? q.path.len : q.kind === 'runner' ? this.runnerLen[q.i] : q.kind === 'ex' ? this.exLen[q.i] : this.bovLen;
      if (q.s < L) alive.push(q);
    }
    this.p = alive;

    let k = 0;
    const v = this._v;
    const c = this._c;
    for (const q of this.p) {
      let t;
      if (q.kind === 'trunk') {
        t = q.s / q.path.len;
        q.path.curve.getPointAt(t, v);
        const tags = q.path.tags;
        const idx = Math.min(tags.length - 1, Math.round(t * (tags.length - 1)));
        c.copy(COLORS[tags[idx]]);
      } else if (q.kind === 'runner') {
        t = q.s / this.runnerLen[q.i];
        P.runners[q.i].getPointAt(t, v);
        c.copy(COLORS.cool);
      } else if (q.kind === 'ex') {
        t = q.s / this.exLen[q.i];
        P.exhaust[q.i].getPointAt(t, v);
        c.copy(COLORS.exStart).lerp(COLORS.exEnd, Math.max(0, (t - 0.35) / 0.65));
      } else {
        t = q.s / this.bovLen;
        P.bov.getPointAt(t, v);
        c.copy(COLORS.bov).multiplyScalar(1 - t);
      }
      this.pos[k * 3] = v.x + q.j[0];
      this.pos[k * 3 + 1] = v.y + q.j[1];
      this.pos[k * 3 + 2] = v.z + q.j[2];
      this.col[k * 3] = c.r;
      this.col[k * 3 + 1] = c.g;
      this.col[k * 3 + 2] = c.b;
      k++;
    }
    this.pos.fill(1e5, k * 3);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.setDrawRange(0, k);
  }
}

function jitter(a) {
  return [(Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a];
}
