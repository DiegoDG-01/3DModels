// Modelo 3D procedural del 2JZ-GTE. 1 unidad = 100 mm.
// Eje del cigüeñal = X (cilindro 1 delante, en -X). Admisión en -Z, escape y turbos en +Z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FIRE_OFFSET, VALVE_TIMING, cyclePhase, valveLift, strokeAt } from '../physics.js';
import { labelTexture, stripeTexture, finTexture, glowTexture } from '../../shared/textures.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export const PITCH = 0.98;
export const CRANK_R = 0.43;
export const ROD = 1.42;
export const DECK = 2.19;
export const CYL_X = [0, 1, 2, 3, 4, 5].map((i) => (i - 2.5) * PITCH); // índice 0 = cilindro 1
const PIN_OFFSET = [1, 2, 3, 4, 5, 6].map((c) => FIRE_OFFSET[c] % 360); // ángulo de muñequilla
const VALVE_VIS_LIFT = 0.12; // alzada visible (exagerada ×1.4)
const CAM_BASE = 0.14;

// Válvulas inclinadas 24,5° (ángulo entre válvulas de ~49°, como el 2JZ)
const U_IN = V(0, 0.909, -0.414).normalize();
const U_EX = V(0, 0.909, 0.414).normalize();
const SEAT_Y = 2.24;
const SEAT_Z = 0.2;
const TAPPET = 0.55;
const CAM_IN = V(0, SEAT_Y, -SEAT_Z).addScaledVector(U_IN, TAPPET + CAM_BASE);
const CAM_EX = V(0, SEAT_Y, SEAT_Z).addScaledVector(U_EX, TAPPET + CAM_BASE);
const FRONT_X = -3.42; // plano de la distribución

// ---------------------------------------------------------------- materiales
const M = {
  iron: () => new THREE.MeshStandardMaterial({ color: 0x55585e, metalness: 0.55, roughness: 0.72 }),
  alu: () => new THREE.MeshStandardMaterial({ color: 0xb9bdc3, metalness: 0.8, roughness: 0.42 }),
  castAlu: () => new THREE.MeshStandardMaterial({ color: 0x9da2a8, metalness: 0.7, roughness: 0.6 }),
  steel: () => new THREE.MeshStandardMaterial({ color: 0x8d939b, metalness: 0.95, roughness: 0.28 }),
  darkSteel: () => new THREE.MeshStandardMaterial({ color: 0x3b3f46, metalness: 0.9, roughness: 0.35 }),
  black: () => new THREE.MeshStandardMaterial({ color: 0x1a1b1e, metalness: 0.4, roughness: 0.55 }),
  crinkle: () => new THREE.MeshStandardMaterial({ color: 0x1c1c1f, metalness: 0.2, roughness: 0.85 }),
  red: () => new THREE.MeshStandardMaterial({ color: 0xb3261e, metalness: 0.3, roughness: 0.5 }),
  rubber: () => new THREE.MeshStandardMaterial({ color: 0x141416, metalness: 0, roughness: 0.9 }),
  hose: () => new THREE.MeshStandardMaterial({ color: 0x2b5fae, metalness: 0.1, roughness: 0.55 }),
  chrome: () => new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 1, roughness: 0.15 }),
  brass: () => new THREE.MeshStandardMaterial({ color: 0xc58f48, metalness: 1, roughness: 0.3 }),
  exhaust: () => new THREE.MeshStandardMaterial({ color: 0x4d4745, metalness: 0.75, roughness: 0.5, emissive: 0xff4a10, emissiveIntensity: 0 }),
  spring: () => new THREE.MeshStandardMaterial({ color: 0x3c6fd6, metalness: 0.6, roughness: 0.35 }),
  piston: () => new THREE.MeshStandardMaterial({ color: 0xd3d7dc, metalness: 0.75, roughness: 0.32 }),
};

// ---------------------------------------------------------------- geometrías
function ringX(ri, ro, len, seg = 64) {
  const s = new THREE.Shape();
  s.absarc(0, 0, ro, 0, TAU, false);
  const h = new THREE.Path();
  h.absarc(0, 0, ri, 0, TAU, true);
  s.holes.push(h);
  const g = new THREE.ExtrudeGeometry(s, { depth: len, curveSegments: seg, bevelEnabled: false });
  g.translate(0, 0, -len / 2);
  g.rotateY(Math.PI / 2);
  return g;
}
function cylX(r, len, seg = 32) {
  return new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);
}
function mesh(geo, mat, pos, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.copy(pos);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}
function teethX(count, radius, size, mat, x = 0) {
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(...size), mat, count);
  const d = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU;
    d.position.set(x, Math.cos(a) * radius, Math.sin(a) * radius);
    d.rotation.set(a, 0, 0);
    d.updateMatrix();
    m.setMatrixAt(i, d.matrix);
  }
  m.castShadow = true;
  return m;
}
function tube(points, r, mat, { closed = false, seg = 64, radial = 16 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', 0.3);
  const m = mesh(new THREE.TubeGeometry(curve, seg, r, radial, closed), mat);
  m.userData.curve = curve;
  return m;
}
/** Perfil de leva (nariz en +Y) extruido a lo largo de X. */
function lobeGeo(width) {
  const s = new THREE.Shape();
  const n = 96;
  for (let i = 0; i <= n; i++) {
    const psi = (i / n) * 360 - 180; // grados de leva desde la nariz
    const b = Math.abs(psi) < 60 ? Math.cos((psi / 60) * (Math.PI / 2)) ** 2 : 0;
    const r = CAM_BASE + VALVE_VIS_LIFT * b;
    const a = (90 + psi) * DEG;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false });
  g.translate(0, 0, -width / 2);
  g.rotateY(Math.PI / 2);
  return g;
}
/** Brazo del cigüeñal con contrapeso (muñequilla en +Y). */
function webGeo(thick) {
  const s = new THREE.Shape();
  const pr = 0.29;
  s.moveTo(CRANK_R, -pr);
  for (let t = -90; t <= 90; t += 10) s.lineTo(CRANK_R + Math.cos(t * DEG) * pr, Math.sin(t * DEG) * pr);
  s.lineTo(0.02, 0.36);
  for (let t = 118; t <= 242; t += 6) s.lineTo(Math.cos(t * DEG) * 0.72, Math.sin(t * DEG) * 0.72);
  s.lineTo(0.02, -0.36);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1 });
  g.translate(0, 0, -thick / 2);
  g.rotateZ(Math.PI / 2);
  g.rotateY(Math.PI / 2);
  return g;
}
function helixGeo(radius, height, turns, wire) {
  const pts = [];
  const n = turns * 24;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(V(Math.cos(t * turns * TAU) * radius, t * height, Math.sin(t * turns * TAU) * radius));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, wire, 6, false);
}

// ================================================================== Motor
export class EngineModel {
  constructor() {
    this.group = new THREE.Group();
    this.parts = new Map();
    this.pickables = [];
    this.explodeT = 0;
    this.explodeTarget = 0;
    this.xrayT = 1;
    this.xray = true;
    this.hoverId = null;
    this.selectedId = null;
    this._time = 0;
    this.glow = glowTexture();
  }

  // ------------------------------------------------------------ registro de piezas
  addPart(id, obj, { explode = V(), shell = false, shellMin = 0.12, exploded = null, label = V(0, 1, 0), inner = false, radius = 1 } = {}) {
    const holder = new THREE.Group();
    holder.add(obj);
    const part = { id, holder, obj, explode, shell, shellMin, exploded, label, inner, radius, mats: [], shellMats: [] };
    obj.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      if (o.userData.decor) return;
      o.userData.partId = id;
      this.pickables.push(o);
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.emissive && !part.mats.includes(m) && !o.userData.noHighlight) {
          m.userData.baseEmissive = m.emissive.clone();
          m.userData.baseEmissiveIntensity = m.emissiveIntensity;
          part.mats.push(m);
        }
        if (shell && !part.shellMats.includes(m)) {
          m.userData.baseOpacity = m.opacity;
          part.shellMats.push(m);
        }
      }
    });
    this.group.add(holder);
    this.parts.set(id, part);
    return part;
  }

  clear() {
    for (const p of this.parts.values()) {
      this.group.remove(p.holder);
      p.holder.traverse((o) => {
        o.geometry?.dispose();
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of mats) {
          m.map?.dispose();
          m.dispose();
        }
      });
    }
    for (const o of this.extras ?? []) this.group.remove(o);
    this.parts.clear();
    this.pickables = [];
    this.extras = [];
  }

  // ------------------------------------------------------------ construcción
  build(turbo) {
    this.clear();
    this.turbo = turbo;
    this.twin = turbo.id === 'twin';
    this.paths = { trunk: [], runners: [], exhaust: [], bov: null };
    this.buildBlock();
    this.buildRotating();
    this.buildHead();
    this.buildValvetrain();
    this.buildTiming();
    this.buildIntake();
    this.buildExhaustAndTurbo();
    this.buildGas();
    this.applyExplode();
  }

  buildBlock() {
    // Parte de cilindros: rectángulo con 6 taladros extruido en vertical
    const g = new THREE.Group();
    const iron = M.iron();
    const s = new THREE.Shape();
    s.moveTo(-3.1, -0.64);
    s.lineTo(3.1, -0.64);
    s.lineTo(3.1, 0.64);
    s.lineTo(-3.1, 0.64);
    s.closePath();
    for (const x of CYL_X) {
      const h = new THREE.Path();
      h.absarc(x, 0, 0.435, 0, TAU, true);
      s.holes.push(h);
    }
    const cylGeo = new THREE.ExtrudeGeometry(s, { depth: DECK - 0.55, curveSegments: 40, bevelEnabled: false });
    cylGeo.rotateX(-Math.PI / 2);
    g.add(mesh(cylGeo, iron, V(0, 0.55, 0)));
    // Cárter (paredes)
    const W = 0.86;
    g.add(mesh(new THREE.BoxGeometry(6.2, 1.05, 0.08), iron, V(0, 0.07, W)));
    g.add(mesh(new THREE.BoxGeometry(6.2, 1.05, 0.08), iron, V(0, 0.07, -W)));
    g.add(mesh(new THREE.BoxGeometry(0.1, 1.05, 2 * W), iron, V(-3.1, 0.07, 0)));
    g.add(mesh(new THREE.BoxGeometry(0.1, 1.05, 2 * W), iron, V(3.1, 0.07, 0)));
    g.add(mesh(new THREE.BoxGeometry(6.2, 0.08, 2 * W), iron, V(0, 0.6, 0)));
    // Nervios exteriores
    for (const x of [-2.45, -1.47, -0.49, 0.49, 1.47, 2.45]) {
      for (const z of [W + 0.05, -W - 0.05]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.95, 0.06), iron, V(x + 0.49, 0.05, z)));
    }
    // Filtro de aceite
    const filt = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.45, 24).rotateX(Math.PI / 2), M.red(), V(-0.9, 0.25, -1.12));
    g.add(filt);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.36), new THREE.MeshStandardMaterial({ map: labelTexture(['2JZ'], { w: 512, h: 160, bg: '#4b4e54', fg: '#d9dce1' }), metalness: 0.5, roughness: 0.6 }));
    plate.position.set(0.9, 0.22, W + 0.045);
    g.add(plate);
    this.addPart('block', g, { shell: true, shellMin: 0.22, label: V(-2.6, 1.3, 1.0), radius: 3 });

    // Cárter de aceite
    const pan = new THREE.Group();
    const panMat = M.castAlu();
    pan.add(mesh(new RoundedBoxGeometry(6.1, 0.55, 1.65, 3, 0.1), panMat, V(0, -0.72, 0)));
    pan.add(mesh(new RoundedBoxGeometry(2.4, 0.6, 1.4, 3, 0.12), panMat, V(1.6, -1.12, 0)));
    pan.add(mesh(cylX(0.06, 0.2), M.steel(), V(2.85, -1.2, 0.3)));
    this.addPart('oilPan', pan, { shell: true, explode: V(0, -1.3, 0), label: V(1.5, -1.6, 0.9), radius: 1 });
  }

  buildRotating() {
    // Cigüeñal
    const crank = new THREE.Group();
    const rot = new THREE.Group();
    const steel = M.steel();
    const webMat = M.darkSteel();
    for (let k = 0; k <= 6; k++) rot.add(mesh(cylX(0.28, 0.2), steel, V((k - 3) * PITCH, 0, 0)));
    const web = webGeo(0.1);
    CYL_X.forEach((x, i) => {
      const a = -PIN_OFFSET[i] * DEG;
      const pin = mesh(cylX(0.24, 0.24), steel, V(x, CRANK_R * Math.cos(a), CRANK_R * Math.sin(a)));
      rot.add(pin);
      for (const dx of [-0.17, 0.17]) {
        const w = mesh(web, webMat, V(x + dx, 0, 0));
        w.rotation.x = a;
        rot.add(w);
      }
    });
    rot.add(mesh(cylX(0.2, 0.7), steel, V(-3.25, 0, 0)));
    rot.add(mesh(cylX(0.42, 0.1), steel, V(3.12, 0, 0)));
    // Polea (dámper) y piñón de distribución
    const pulley = new THREE.Group();
    pulley.add(mesh(cylX(0.45, 0.22), M.black(), V(-3.72, 0, 0)));
    for (let i = 0; i < 4; i++) pulley.add(mesh(ringX(0.45, 0.47, 0.025), M.steel(), V(-3.64 - i * 0.05, 0, 0)));
    pulley.add(mesh(cylX(0.13, 0.25), M.chrome(), V(-3.86, 0, 0)));
    rot.add(pulley);
    rot.add(mesh(cylX(0.2, 0.1), M.steel(), V(FRONT_X, 0, 0)));
    rot.add(teethX(22, 0.21, [0.1, 0.03, 0.035], M.steel(), FRONT_X));
    crank.add(rot);
    this.crankRot = rot;
    this.addPart('crankshaft', crank, { inner: true, explode: V(0, -0.35, 0), label: V(-2.9, -0.95, 0.9), radius: 0.8 });

    // Volante
    const fw = new THREE.Group();
    const fwRot = new THREE.Group();
    fwRot.add(mesh(cylX(0.95, 0.12), M.darkSteel(), V(3.26, 0, 0)));
    fwRot.add(teethX(110, 0.97, [0.1, 0.05, 0.035], M.steel(), 3.26));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      fwRot.add(mesh(cylX(0.06, 0.14), M.chrome(), V(3.26, Math.cos(a) * 0.25, Math.sin(a) * 0.25)));
    }
    fw.add(fwRot);
    this.flywheelRot = fwRot;
    this.addPart('flywheel', fw, { explode: V(1.0, 0, 0), label: V(3.3, 1.3, 0), radius: 1 });

    // Bielas y pistones
    const rods = new THREE.Group();
    const pistons = new THREE.Group();
    const rodMat = M.steel();
    const pMat = M.piston();
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x6f675f, metalness: 0.4, roughness: 0.7 });
    const ringMat = M.darkSteel();
    this.rodObjs = [];
    this.pistonObjs = [];
    for (let i = 0; i < 6; i++) {
      const r = new THREE.Group();
      r.add(mesh(ringX(0.245, 0.34, 0.2), rodMat));
      r.add(mesh(new THREE.BoxGeometry(0.14, ROD - 0.42, 0.08), rodMat, V(0, ROD / 2 + 0.02, 0)));
      for (const z of [-0.06, 0.06]) r.add(mesh(new THREE.BoxGeometry(0.2, ROD - 0.5, 0.03), rodMat, V(0, ROD / 2 + 0.02, z)));
      r.add(mesh(ringX(0.095, 0.16, 0.18), rodMat, V(0, ROD, 0)));
      for (const z of [-0.29, 0.29]) r.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 10), M.chrome(), V(0, -0.05, z)));
      r.position.x = CYL_X[i];
      rods.add(r);
      this.rodObjs.push(r);

      const p = new THREE.Group();
      p.add(mesh(new THREE.CylinderGeometry(0.425, 0.425, 0.5, 40), pMat, V(0, 0.07, 0)));
      p.add(mesh(new THREE.CylinderGeometry(0.425, 0.425, 0.02, 40), crownMat, V(0, 0.33, 0)));
      for (const y of [0.27, 0.23, 0.19]) p.add(mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.016, 40, 1, true), ringMat, V(0, y, 0)));
      p.add(mesh(cylX(0.09, 0.72), M.chrome()));
      p.position.x = CYL_X[i];
      pistons.add(p);
      this.pistonObjs.push(p);
    }
    this.addPart('rods', rods, { inner: true, label: V(0.49, 0.2, 1.05), radius: 0.8 });
    this.addPart('pistons', pistons, { inner: true, label: V(-1.47, 2.1, 1.0), radius: 0.8 });
  }

  buildHead() {
    const g = new THREE.Group();
    const alu = M.alu();
    g.add(mesh(new RoundedBoxGeometry(6.25, 0.9, 1.62, 3, 0.05), alu, V(0, DECK + 0.45, 0)));
    // Lumbreras (bocas) de admisión y escape
    const dark = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 1 });
    for (const x of CYL_X) {
      for (const z of [-0.815, 0.815]) {
        const port = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), dark);
        port.position.set(x, 2.52, z);
        port.rotation.y = z > 0 ? 0 : Math.PI;
        port.userData.noHighlight = true;
        g.add(port);
      }
    }
    this.addPart('head', g, { shell: true, explode: V(0, 1.35, 0), label: V(2.6, 2.65, 1.0), radius: 1 });

    // Tapa de balancines con las bobinas en el centro
    const cover = new THREE.Group();
    const crk = M.crinkle();
    for (const z of [-0.47, 0.47]) cover.add(mesh(new RoundedBoxGeometry(6.2, 0.42, 0.62, 3, 0.14), crk, V(0, 3.28, z)));
    cover.add(mesh(new RoundedBoxGeometry(6.0, 0.16, 0.5, 2, 0.05), crk, V(0, 3.14, 0)));
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 0.34),
      new THREE.MeshStandardMaterial({ map: labelTexture(['TOYOTA  ·  24 VALVE  ·  TWIN TURBO'], { w: 1024, h: 100, bg: '#1c1c1f', fg: '#d8352b' }), roughness: 0.7 }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(-0.6, 3.495, 0.47);
    if (!this.twin) decal.material.map = labelTexture(['TOYOTA  ·  2JZ-GTE  ·  24 VALVE'], { w: 1024, h: 100, bg: '#1c1c1f', fg: '#d8352b' });
    cover.add(decal);
    this.addPart('camCover', cover, { shell: true, explode: V(0, 2.6, 0), label: V(-2.4, 3.7, 0.5), radius: 0.8 });

    const coils = new THREE.Group();
    const cMat = M.black();
    for (const x of CYL_X) {
      coils.add(mesh(new RoundedBoxGeometry(0.34, 0.26, 0.28, 2, 0.05), cMat, V(x, 3.38, 0)));
      coils.add(mesh(new THREE.BoxGeometry(0.12, 0.1, 0.1), M.red(), V(x + 0.12, 3.46, -0.08)));
      coils.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 12), M.rubber(), V(x, 2.82, 0)));
      coils.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8), M.chrome(), V(x, 2.28, 0)));
    }
    this.addPart('coils', coils, { explode: V(0, 3.6, 0), label: V(0.5, 3.75, 0), radius: 0.4 });
  }

  buildValvetrain() {
    // Árboles de levas
    const camMatIn = M.steel();
    const camMatEx = M.steel();
    this.cams = {};
    const lobe = lobeGeo(0.13);
    for (const which of ['intake', 'exhaust']) {
      const c = which === 'intake' ? CAM_IN : CAM_EX;
      const g = new THREE.Group();
      const rot = new THREE.Group();
      rot.position.set(0, c.y, c.z);
      const mat = which === 'intake' ? camMatIn : camMatEx;
      rot.add(mesh(cylX(0.075, 6.4), mat, V(0.1, 0, 0)));
      for (let k = 0; k < 7; k++) rot.add(mesh(cylX(0.12, 0.1), mat, V((k - 3) * PITCH, 0, 0)));
      // Orientación de cada leva: nariz hacia el taqué en el centro de apertura
      const target = which === 'intake' ? 155.5 : 204.5;
      for (let i = 0; i < 6; i++) {
        const theta = FIRE_OFFSET[i + 1] + VALVE_TIMING[which].center;
        const a = (target - theta / 2) * DEG;
        for (const dx of [-0.2, 0.2]) {
          const l = mesh(lobe, mat, V(CYL_X[i] + dx, 0, 0));
          l.rotation.x = a;
          rot.add(l);
        }
      }
      // Piñón de distribución (el doble de dientes que el del cigüeñal)
      rot.add(mesh(cylX(0.4, 0.12), M.darkSteel(), V(FRONT_X, 0, 0)));
      rot.add(teethX(44, 0.41, [0.12, 0.035, 0.035], M.darkSteel(), FRONT_X));
      rot.add(mesh(cylX(0.08, 0.2), M.chrome(), V(FRONT_X - 0.1, 0, 0)));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        const hole = mesh(cylX(0.07, 0.14), M.black(), V(FRONT_X, Math.cos(a) * 0.22, Math.sin(a) * 0.22));
        hole.userData.noHighlight = true;
        rot.add(hole);
      }
      g.add(rot);
      this.cams[which] = rot;
      const id = which === 'intake' ? 'camIntake' : 'camExhaust';
      this.addPart(id, g, { inner: true, explode: V(0, 2.0, which === 'intake' ? -0.25 : 0.25), label: V(1.6, c.y + 0.45, c.z * 1.6), radius: 0.3 });
    }

    // Válvulas: cabeza, vástago, muelle, taqué
    this.valves = { intake: [], exhaust: [] };
    for (const which of ['intake', 'exhaust']) {
      const g = new THREE.Group();
      const u = which === 'intake' ? U_IN : U_EX;
      const zs = which === 'intake' ? -SEAT_Z : SEAT_Z;
      const vMat = which === 'intake' ? M.steel() : new THREE.MeshStandardMaterial({ color: 0x9a8a7a, metalness: 0.85, roughness: 0.4 });
      const sMat = M.spring();
      const tMat = M.chrome();
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), u);
      const headR = which === 'intake' ? 0.13 : 0.115;
      for (let i = 0; i < 6; i++) {
        for (const dx of [-0.2, 0.2]) {
          const base = new THREE.Group();
          base.position.set(CYL_X[i] + dx, SEAT_Y, zs);
          base.quaternion.copy(q);
          const moving = new THREE.Group();
          moving.add(mesh(new THREE.CylinderGeometry(0.04, headR, 0.05, 24), vMat, V(0, 0.0, 0)));
          moving.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.5, 8), vMat, V(0, 0.27, 0)));
          moving.add(mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.03, 16), tMat, V(0, 0.44, 0)));
          moving.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 20), tMat, V(0, TAPPET - 0.05, 0)));
          base.add(moving);
          const spring = mesh(helixGeo(0.07, 0.25, 6, 0.012), sMat, V(0, 0.18, 0), { cast: false });
          base.add(spring);
          g.add(base);
          this.valves[which].push({ cyl: i + 1, moving, spring });
        }
      }
      this.addPart(which === 'intake' ? 'valvesIntake' : 'valvesExhaust', g, {
        inner: true,
        explode: V(0, 1.35, 0),
        label: V(-1.9, 2.95, which === 'intake' ? -0.9 : 0.9),
        radius: 0.3,
      });
    }
  }

  buildTiming() {
    const g = new THREE.Group();
    // Recorrido de la correa en el plano (Y, Z)
    const yz = [[-0.22, 0], [0, 0.23], [1.2, 0.62], [2.55, 0.92], [3.05, 0.9], [3.29, 0.5], [3.33, 0], [3.29, -0.5], [3.05, -0.9], [2.55, -0.92], [1.3, -0.72], [0, -0.23]];
    const pts = yz.map(([y, z]) => V(FRONT_X, y, z));
    const tex = stripeTexture();
    tex.repeat.set(70, 1);
    this.beltTex = tex;
    const belt = tube(pts, 0.045, new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 0.8 }), { closed: true, seg: 200, radial: 8 });
    g.add(belt);
    // Tensor y polea loca
    g.add(mesh(cylX(0.16, 0.12), M.chrome(), V(FRONT_X, 1.25, -0.56)));
    g.add(mesh(cylX(0.12, 0.12), M.chrome(), V(FRONT_X, 1.2, 0.5)));
    this.addPart('timingBelt', g, { explode: V(-1.1, 0, 0), label: V(FRONT_X, 1.9, 1.2), radius: 0.5 });
  }

  buildIntake() {
    const g = new THREE.Group();
    const alu = M.castAlu();
    // Plenum y conductos
    g.add(mesh(new RoundedBoxGeometry(5.3, 0.5, 0.6, 3, 0.2), alu, V(-0.2, 2.62, -1.88)));
    this.paths.runners = [];
    CYL_X.forEach((x) => {
      const pts = [V(x, 2.72, -1.62), V(x, 2.98, -1.3), V(x, 2.82, -0.95), V(x, 2.53, -0.8)];
      g.add(tube(pts, 0.13, alu, { seg: 32, radial: 14 }));
      this.paths.runners.push(new THREE.CatmullRomCurve3([V(x, 2.62, -1.88), ...pts, V(x, 2.34, -0.4), V(x, 2.12, -0.12), V(x, 1.85, 0)]));
    });
    // Cuerpo de mariposa
    g.add(mesh(ringX(0.2, 0.26, 0.4), alu, V(-3.05, 2.62, -1.88)));
    this.addPart('intakeManifold', g, { shell: true, explode: V(0, 0.3, -1.4), label: V(0.6, 3.25, -1.9), radius: 0.6 });

    const th = new THREE.Group();
    const plate = mesh(new THREE.CircleGeometry(0.195, 32).rotateY(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc9a34a, metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide }), V(-3.05, 2.62, -1.88));
    th.add(plate);
    th.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.44, 8), M.chrome(), V(-3.05, 2.62, -1.88)));
    this.throttlePlate = plate;
    this.addPart('throttle', th, { explode: V(0, 0.3, -1.4), label: V(-3.1, 3.05, -1.9), radius: 0.25 });

    // Inyectores y rampa
    const inj = new THREE.Group();
    const rail = mesh(cylX(0.06, 5.4), M.chrome(), V(-0.1, 3.08, -1.08));
    inj.add(rail);
    CYL_X.forEach((x) => {
      const body = mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.32, 12), M.black(), V(x, 2.93, -1.02));
      body.rotation.x = -0.35;
      inj.add(body);
      inj.add(mesh(new THREE.BoxGeometry(0.08, 0.06, 0.1), new THREE.MeshStandardMaterial({ color: 0x3a8a4a, roughness: 0.6 }), V(x, 3.08, -0.98)));
    });
    this.addPart('injectors', inj, { explode: V(0, 1.0, -1.4), label: V(-1.5, 3.4, -1.2), radius: 0.3 });
  }

  /** Turbo con el eje a lo largo de X: compresor en -X, turbina en +X. */
  makeTurbo(s) {
    const g = new THREE.Group();
    const housing = new THREE.Group();
    const iron = M.exhaust();
    const alu = M.alu();
    housing.add(mesh(cylX(0.13 * s, 0.34 * s), M.steel()));
    // Turbina (lado caliente)
    const tv = mesh(new THREE.TorusGeometry(0.25 * s, 0.14 * s, 16, 40).rotateY(Math.PI / 2), iron, V(0.3 * s, 0, 0));
    housing.add(tv);
    housing.add(mesh(cylX(0.2 * s, 0.16 * s), iron, V(0.3 * s, 0, 0)));
    housing.add(mesh(cylX(0.17 * s, 0.22 * s), iron, V(0.5 * s, 0, 0)));
    housing.add(mesh(new THREE.BoxGeometry(0.3 * s, 0.16 * s, 0.3 * s), iron, V(0.3 * s, 0.4 * s, 0)));
    // Compresor (lado frío)
    housing.add(mesh(new THREE.TorusGeometry(0.29 * s, 0.16 * s, 16, 40).rotateY(Math.PI / 2), alu, V(-0.32 * s, 0, 0)));
    housing.add(mesh(cylX(0.24 * s, 0.14 * s), alu, V(-0.32 * s, 0, 0)));
    housing.add(mesh(ringX(0.16 * s, 0.21 * s, 0.34 * s), alu, V(-0.62 * s, 0, 0)));
    const outlet = mesh(new THREE.CylinderGeometry(0.1 * s, 0.1 * s, 0.34 * s, 16), alu, V(-0.32 * s, 0.35 * s, 0.22 * s));
    housing.add(outlet);
    g.add(housing);
    // Ruedas
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xcfd4da, metalness: 1, roughness: 0.2, side: THREE.DoubleSide });
    const hotMat = new THREE.MeshStandardMaterial({ color: 0x8a8076, metalness: 0.9, roughness: 0.35, side: THREE.DoubleSide });
    const wheel = (x, mat, n, r) => {
      const w = new THREE.Group();
      w.add(mesh(new THREE.ConeGeometry(0.07 * s, 0.2 * s, 16).rotateZ(x < 0 ? Math.PI / 2 : -Math.PI / 2), mat));
      for (let i = 0; i < n; i++) {
        const b = mesh(new THREE.BoxGeometry(0.16 * s, r * s, 0.012 * s), mat, V(0, (r * s) / 2 + 0.03 * s, 0));
        const piv = new THREE.Group();
        piv.rotation.x = (i / n) * TAU;
        b.rotation.y = 0.5;
        piv.add(b);
        w.add(piv);
      }
      w.position.x = x * s;
      return w;
    };
    const comp = wheel(-0.36, bladeMat, 11, 0.2);
    const turb = wheel(0.32, hotMat, 9, 0.17);
    g.add(comp, turb);
    return {
      group: g,
      housingMats: [iron, alu],
      comp,
      turb,
      compIn: V(-0.8 * s, 0, 0),
      compOut: V(-0.32 * s, 0.52 * s, 0.22 * s),
      turbIn: V(0.3 * s, 0.48 * s, 0),
      turbOut: V(0.62 * s, 0, 0),
      scale: s,
    };
  }

  buildExhaustAndTurbo() {
    const twin = this.twin;
    const s = twin ? 0.85 : 1.25;
    const turboPos = twin ? [V(-1.35, 1.18, 2.02), V(1.35, 1.18, 2.02)] : [V(0.1, 1.2, 2.2)];
    this.turbos = [];
    turboPos.forEach((p, k) => {
      const t = this.makeTurbo(s);
      t.group.position.copy(p);
      const id = k === 0 ? 'turbo1' : 'turbo2';
      const part = this.addPart(id, t.group, { explode: V(0, -0.1, 1.9), label: V(p.x, p.y + 0.75 * s, p.z + 0.2), radius: 0.5 });
      // Las carcasas se vuelven translúcidas con rayos X para ver las ruedas
      part.shellMats = t.housingMats;
      for (const m of t.housingMats) m.userData.baseOpacity = 1;
      part.shell = true;
      part.shellMin = 1;
      part.xrayOnly = true;
      const w = (v) => v.clone().add(p);
      this.turbos.push({ ...t, pos: p, compInW: w(t.compIn), compOutW: w(t.compOut), turbInW: w(t.turbIn), turbOutW: w(t.turbOut) });
    });

    // Colector de escape (tubos), downpipes y wastegate
    const ex = new THREE.Group();
    const exMat = M.exhaust();
    this.exhaustMat = exMat;
    this.paths.exhaust = [];
    CYL_X.forEach((x, i) => {
      const t = twin ? this.turbos[i < 3 ? 0 : 1] : this.turbos[0];
      const inlet = t.turbInW;
      const pts = [V(x, 2.52, 0.8), V(x, 2.5, 1.18), V(THREE.MathUtils.lerp(x, inlet.x, 0.45), 2.2, 1.72), V(inlet.x, inlet.y + 0.35, inlet.z), V(inlet.x, inlet.y + 0.02, inlet.z)];
      ex.add(tube(pts, 0.1, exMat, { seg: 48, radial: 12 }));
      const turbCenter = t.pos.clone().add(V(0.3 * t.scale, 0, 0));
      const down = [t.turbOutW, t.turbOutW.clone().add(V(0.35, -0.25, 0.05)), V(t.turbOutW.x + 0.5, -0.5, 2.25), V(4.2, -0.75, 1.9)];
      this.paths.exhaust.push(new THREE.CatmullRomCurve3([V(x, 1.9, 0), V(x, 2.15, 0.12), V(x, 2.34, 0.4), ...pts, turbCenter, ...down]));
    });
    for (const t of this.turbos) {
      const down = [t.turbOutW, t.turbOutW.clone().add(V(0.35, -0.25, 0.05)), V(t.turbOutW.x + 0.5, -0.5, 2.25), V(4.2, -0.75, 1.9)];
      ex.add(tube(down, 0.14 * t.scale + 0.03, exMat, { seg: 40, radial: 14 }));
    }
    this.addPart('exhaustManifold', ex, { explode: V(0, 0, 1.0), label: V(1.9, 2.55, 1.6), radius: 0.6 });

    // Wastegate sobre la entrada de la turbina del primer turbo
    const wg = new THREE.Group();
    const t0 = this.turbos[twin ? 1 : 0];
    const wgBase = t0.turbInW.clone().add(V(0.28, 0.1, 0.25));
    wg.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.12, 24).rotateX(Math.PI / 2), M.brass(), wgBase.clone().add(V(0, 0.2, 0.18))));
    const arm = mesh(new THREE.BoxGeometry(0.03, 0.3, 0.03), M.chrome(), wgBase.clone().add(V(0, 0.05, 0.18)));
    wg.add(arm);
    this.wastegateArm = arm;
    this.addPart('wastegate', wg, { explode: V(0, -0.1, 1.9), label: wgBase.clone().add(V(0.3, 0.5, 0.3)), radius: 0.2 });

    // Filtro de aire
    const af = new THREE.Group();
    const fp = V(-3.95, 1.3, 2.3);
    af.add(mesh(cylX(0.3, 0.6), new THREE.MeshStandardMaterial({ color: 0xc8342a, roughness: 0.8 }), fp));
    af.add(teethX(40, 0.31, [0.5, 0.03, 0.03], new THREE.MeshStandardMaterial({ color: 0x8e1f18, roughness: 0.8 }), fp.x));
    af.children[1].position.set(0, fp.y, fp.z);
    af.add(mesh(cylX(0.32, 0.05), M.chrome(), fp.clone().add(V(-0.3, 0, 0))));
    this.addPart('airFilter', af, { explode: V(-0.8, 0, 0.6), label: fp.clone().add(V(0, 0.6, 0)), radius: 0.3 });

    // Intercooler frontal
    const ic = new THREE.Group();
    const icX = -5.05;
    const fins = finTexture();
    ic.add(mesh(new THREE.BoxGeometry(0.28, 1.25, 3.1), new THREE.MeshStandardMaterial({ map: fins, metalness: 0.7, roughness: 0.45 }), V(icX, 1.0, 0)));
    for (const z of [1.72, -1.72]) ic.add(mesh(new RoundedBoxGeometry(0.34, 1.3, 0.34, 2, 0.08), M.alu(), V(icX, 1.0, z)));
    this.addPart('intercooler', ic, { shell: true, shellMin: 0.3, explode: V(-1.0, 0, 0), label: V(icX, 1.95, 0), radius: 1 });

    // Tuberías de presión y paths de flujo
    const pipes = new THREE.Group();
    const pipeMat = M.alu();
    const hose = M.hose();
    const icIn = V(icX + 0.02, 1.0, 1.9);
    const icOut = V(icX + 0.02, 1.0, -1.9);
    const tb = V(-3.25, 2.62, -1.88);
    const merge = V(-2.35, 2.05, 2.42);
    const toIc = [merge, V(-3.6, 1.95, 2.35), V(-4.6, 1.2, 2.2), icIn];
    const fromIc = [icOut, V(-4.6, 1.3, -2.1), V(-3.9, 2.4, -2.05), tb];
    pipes.add(tube(toIc, 0.12, pipeMat), tube(fromIc, 0.12, pipeMat));
    const fOut = fp.clone().add(V(0.3, 0, 0));
    const trunkEnd = [icIn, V(icX, 1.0, 1.2), V(icX, 1.0, 0), V(icX, 1.0, -1.2), icOut, ...fromIc.slice(1), V(-2.6, 2.62, -1.88), V(-0.2, 2.62, -1.88)];
    const temps = (nAmb, nHot) => [...Array(nAmb).fill('amb'), ...Array(nHot).fill('hot')];
    for (const [k, t] of this.turbos.entries()) {
      // Filtro → compresor
      const inPts = twin && k === 1
        ? [fOut, V(-3.1, 1.1, 2.45), V(-2.2, 0.72, 2.55), V(0.1, 0.72, 2.5), V(t.compInW.x - 0.35, t.compInW.y, t.compInW.z), t.compInW]
        : [fOut, V(-3.2, 1.25, 2.3), V(t.compInW.x - 0.35, t.compInW.y, t.compInW.z), t.compInW];
      pipes.add(tube(inPts, 0.13, hose, { seg: 48 }));
      // Compresor → unión
      const up = t.compOutW.clone().add(V(0, 0.3, 0.08));
      const outPts = twin && k === 1 ? [t.compOutW, up, V(0.2, 2.15, 2.45), V(-1.2, 2.12, 2.45), merge] : [t.compOutW, up, V(t.compOutW.x - 0.5, 2.1, 2.42), merge];
      pipes.add(tube(outPts, 0.1, pipeMat, { seg: 40 }));
      const center = t.pos.clone().add(V(-0.32 * t.scale, 0, 0));
      const full = [...inPts, center, ...outPts, ...toIc.slice(1), ...trunkEnd.slice(1)];
      const tags = [...temps(inPts.length, 0), 'hot', ...Array(outPts.length + toIc.length - 1).fill('hot'), 'hot', ...Array(trunkEnd.length - 2).fill('cool')];
      this.paths.trunk.push({ curve: new THREE.CatmullRomCurve3(full), tags, secondary: twin && k === 1 });
    }
    // Válvula blow-off
    const bov = new THREE.Group();
    const bovPos = V(-3.3, 2.28, 2.36);
    bov.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 24), M.chrome(), bovPos));
    bov.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 16), M.black(), bovPos.clone().add(V(0, 0.16, 0))));
    this.paths.bov = new THREE.CatmullRomCurve3([bovPos, bovPos.clone().add(V(0, 0.5, 0.1)), bovPos.clone().add(V(-0.2, 1.2, 0.4))]);
    this.addPart('bov', bov, { label: bovPos.clone().add(V(0, 0.55, 0)), radius: 0.2 });
    this.addPart('piping', pipes, { shell: true, shellMin: 0, label: V(-4.2, 2.35, 2.3), radius: 0.8 });
  }

  buildGas() {
    // Columna de gas dentro de cada cilindro (visible con rayos X)
    this.gas = [];
    this.sparks = [];
    this.flames = [];
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.415, 0.415, 1, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x4fb3ff, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
      m.position.x = CYL_X[i];
      m.userData.decor = true;
      g.add(m);
      this.gas.push(m);
      const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xcfe6ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      spark.position.set(CYL_X[i], 2.25, 0);
      spark.scale.setScalar(0.5);
      g.add(spark);
      this.sparks.push(spark);
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xff7a1a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      flame.position.set(CYL_X[i], 2.1, 0);
      g.add(flame);
      this.flames.push(flame);
    }
    this.group.add(g);
    this.extras.push(g);
    this.gasGroup = g;
  }

  // ------------------------------------------------------------ animación
  setTargets({ exploded, xray }) {
    this.explodeTarget = exploded ? 1 : 0;
    this.xray = xray;
  }

  applyExplode() {
    const k = this.explodeT * this.explodeT * (3 - 2 * this.explodeT);
    for (const p of this.parts.values()) p.holder.position.copy(p.explode).multiplyScalar(k);
  }

  update(dt, { crankDeg, throttle, wastegate, egt, shaftRpm, maxShaftRpm, slow, beltSpeed, flow }) {
    this._time += dt;
    const a = 1 - Math.exp(-dt * 6);
    this.explodeT += Math.sign(this.explodeTarget - this.explodeT) * Math.min(Math.abs(this.explodeTarget - this.explodeT), dt * 1.2);
    this.xrayT += ((this.xray ? 1 : 0) - this.xrayT) * a;
    this.applyExplode();

    // Carcasas translúcidas
    for (const p of this.parts.values()) {
      if (!p.shell) continue;
      let o = p.xrayOnly ? 1 : THREE.MathUtils.lerp(1, p.shellMin, this.explodeT);
      o = Math.min(o, THREE.MathUtils.lerp(1, p.xrayOnly ? 0.28 : Math.max(0.12, p.shellMin * 0.6), this.xrayT));
      if (p.id === 'piping') o = Math.min(o, 1 - this.explodeT);
      for (const m of p.shellMats) {
        m.opacity = o;
        const tr = o < 0.995;
        if (m.transparent !== tr) {
          m.transparent = tr;
          m.needsUpdate = true;
        }
        m.depthWrite = !tr;
      }
      p.holder.visible = o > 0.02;
      p.hidden = o < 0.35;
    }

    // Cigüeñal, bielas y pistones
    const th = crankDeg * DEG;
    this.crankRot.rotation.x = th;
    this.flywheelRot.rotation.x = th;
    for (let i = 0; i < 6; i++) {
      const al = th - PIN_OFFSET[i] * DEG;
      const py = CRANK_R * Math.cos(al);
      const pz = CRANK_R * Math.sin(al);
      const yp = py + Math.sqrt(ROD * ROD - pz * pz);
      const rod = this.rodObjs[i];
      rod.position.set(CYL_X[i], py, pz);
      rod.rotation.x = Math.atan2(-pz, yp - py);
      this.pistonObjs[i].position.y = yp;

      // Gas, chispa y llama
      const phase = cyclePhase(crankDeg, i + 1);
      const st = strokeAt(phase);
      const crown = yp + 0.34;
      const gas = this.gas[i];
      gas.scale.y = Math.max(0.02, DECK + 0.05 - crown);
      gas.position.y = crown + gas.scale.y / 2;
      const cols = { intake: 0x4fb3ff, compression: 0xb394ff, power: 0xff7a1a, exhaust: 0x8b7f78 };
      gas.material.color.setHex(cols[st.id]);
      gas.material.opacity = (0.12 + (st.id === 'power' ? 0.35 * Math.max(0, 1 - phase / 140) : st.id === 'compression' ? 0.12 * ((phase - 540) / 180) : 0.05)) * this.xrayT;
      const sparkOn = phase > 708 || phase < 4;
      this.sparks[i].visible = sparkOn && this.xrayT > 0.3;
      this.sparks[i].scale.setScalar(0.35 + Math.random() * 0.25);
      const burn = phase < 110 ? Math.pow(1 - phase / 110, 1.5) : 0;
      this.flames[i].visible = burn > 0.01 && this.xrayT > 0.3;
      this.flames[i].position.y = (crown + DECK) / 2;
      this.flames[i].scale.setScalar(0.4 + burn * 0.9);
      this.flames[i].material.opacity = burn;
    }
    this.gasGroup.visible = this.xrayT > 0.05 || this.explodeT > 0.5;

    // Levas y válvulas
    for (const which of ['intake', 'exhaust']) {
      this.cams[which].rotation.x = th / 2;
      for (const v of this.valves[which]) {
        const lift = valveLift(cyclePhase(crankDeg, v.cyl), which) * VALVE_VIS_LIFT;
        v.moving.position.y = -lift;
        v.spring.scale.y = (0.25 - lift) / 0.25;
      }
    }

    // Distribución, mariposa, turbos, wastegate, color del escape
    this.beltTex.offset.x -= beltSpeed * dt;
    this.throttlePlate.rotation.y = throttle * 78 * DEG;
    const vis = 0.4 + 5 * (shaftRpm / maxShaftRpm) * Math.min(1, slow * 20);
    for (const t of this.turbos) {
      const active = t === this.turbos[1] ? flow.secondary : true;
      const spin = (active ? vis : 0.15) * TAU * dt;
      t.comp.rotation.x += spin;
      t.turb.rotation.x += spin;
    }
    if (this.wastegateArm) this.wastegateArm.rotation.x = wastegate * 0.6;
    const glow = THREE.MathUtils.clamp((egt - 620) / 330, 0, 1); // al rojo por encima de ~620 °C
    this.exhaustMat.emissiveIntensity = glow * 0.9;
    for (const t of this.turbos) t.housingMats[0].emissiveIntensity = glow * 0.7;

    // Resaltado
    const pulse = 0.5 + 0.5 * Math.sin(this._time * 4);
    for (const p of this.parts.values()) {
      const sel = p.id === this.selectedId;
      const hov = p.id === this.hoverId;
      for (const m of p.mats) {
        if (sel) {
          m.emissive.setHex(0x7a3510);
          m.emissiveIntensity = 0.5 + pulse * 0.6;
        } else if (hov) {
          m.emissive.setHex(0x6a3a1a);
          m.emissiveIntensity = 0.9;
        } else {
          // El escape y la turbina conservan su brillo por temperatura
          m.emissive.copy(m.userData.baseEmissive);
          if (m !== this.exhaustMat && !this.turbos.some((t) => t.housingMats[0] === m)) m.emissiveIntensity = m.userData.baseEmissiveIntensity;
        }
      }
    }
  }

  worldPos(id, out = new THREE.Vector3()) {
    const p = this.parts.get(id);
    if (!p) return null;
    const box = new THREE.Box3().setFromObject(p.obj);
    return box.getCenter(out);
  }

  isPartVisible(id) {
    const p = this.parts.get(id);
    if (!p) return false;
    if (p.shell && p.hidden && !p.xrayOnly) return false;
    if (p.inner) return this.explodeT > 0.5 || this.xrayT > 0.5;
    return p.holder.visible;
  }
}
