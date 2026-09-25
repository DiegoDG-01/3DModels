// Modelo 3D de la cámara: cada pieza es interactiva y tiene posición "montada" y "despiezada".
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DISPLAY_PER_MM } from '../optics.js';
import { filmStripTexture, labelTexture, bayerTexture, woodTexture } from './textures.js';

export const AXIS_Y = 2.0; // altura del eje óptico sobre el banco
const TAU = Math.PI * 2;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- materiales
const MAT = {
  black: () => new THREE.MeshStandardMaterial({ color: 0x1b1d22, metalness: 0.55, roughness: 0.42 }),
  satin: () => new THREE.MeshStandardMaterial({ color: 0x30343c, metalness: 0.85, roughness: 0.3 }),
  rubber: () => new THREE.MeshStandardMaterial({ color: 0x0d0e11, metalness: 0.05, roughness: 0.88 }),
  brass: () => new THREE.MeshStandardMaterial({ color: 0xc58f48, metalness: 1, roughness: 0.3 }),
  chrome: () => new THREE.MeshStandardMaterial({ color: 0xd5d9df, metalness: 1, roughness: 0.16 }),
  gold: () => new THREE.MeshStandardMaterial({ color: 0xf0c050, metalness: 1, roughness: 0.22 }),
  ceramic: () => new THREE.MeshStandardMaterial({ color: 0x3a3c40, metalness: 0.2, roughness: 0.55 }),
  pcb: () => new THREE.MeshStandardMaterial({ color: 0x1d5a3c, metalness: 0.1, roughness: 0.6 }),
  mirror: () => new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.03, envMapIntensity: 1.6 }),
  frosted: () => new THREE.MeshPhysicalMaterial({ color: 0xe8f2ff, metalness: 0, roughness: 0.7, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
  glass: (tint = 0xcfe8ff) => new THREE.MeshPhysicalMaterial({
    color: tint, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.3,
    depthWrite: false, side: THREE.DoubleSide, clearcoat: 1, clearcoatRoughness: 0.02,
    iridescence: 0.9, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 620],
    envMapIntensity: 2.4, specularIntensity: 1,
  }),
  wood: () => new THREE.MeshStandardMaterial({ color: 0xffffff, map: woodTexture(), metalness: 0, roughness: 0.75 }),
};

// ---------------------------------------------------------------- geometrías
/** Anillo hueco a lo largo del eje X (centrado en 0). */
function ringGeo(ri, ro, len, seg = 72, bevel = 0.012) {
  const s = new THREE.Shape();
  s.absarc(0, 0, ro, 0, TAU, false);
  const h = new THREE.Path();
  h.absarc(0, 0, ri, 0, TAU, true);
  s.holes.push(h);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.001, len - bevel * 2), curveSegments: seg,
    bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.7, bevelSegments: 2,
  });
  g.translate(0, 0, -(len - bevel * 2) / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

/** Lente (sección de revolución) a lo largo de X. c1/c2 = flecha de cada cara (+ convexa, − cóncava). */
function lensGeo(r, t, c1, c2, seg = 64) {
  const pts = [];
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * r;
    pts.push(new THREE.Vector2(Math.max(x, 1e-4), -(t / 2 + c2 * (1 - (x / r) ** 2))));
  }
  pts.push(new THREE.Vector2(r, 0));
  for (let i = n; i >= 0; i--) {
    const x = (i / n) * r;
    pts.push(new THREE.Vector2(Math.max(x, 1e-4), t / 2 + c1 * (1 - (x / r) ** 2)));
  }
  const g = new THREE.LatheGeometry(pts, seg);
  g.rotateZ(-Math.PI / 2);
  return g;
}

function cylX(r, len, seg = 48) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateZ(Math.PI / 2);
  return g;
}

/** Dientes/estrías repartidos alrededor del eje X. */
function teeth(count, radius, size, mat, x = 0) {
  const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
  const m = new THREE.InstancedMesh(g, mat, count);
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

function mesh(geo, mat, pos = null, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.copy(pos);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
}

/** Lente con canto ennegrecido y aro de retención. */
function element(r, t, c1, c2, { glass, ring, x = 0, ringColor = null } = {}) {
  const g = new THREE.Group();
  const lens = mesh(lensGeo(r, t, c1, c2), glass, null, false);
  lens.renderOrder = 2;
  g.add(lens);
  g.add(mesh(ringGeo(r - 0.015, r + 0.06, t + 0.06), ring));
  // Canto iluminado (brillo como en la referencia)
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(r - 0.02, 0.008, 8, 96).rotateY(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: ringColor ?? 0x9fdcff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  rim.userData.noHighlight = true;
  g.add(rim);
  g.position.x = x;
  return g;
}

function planeX(w, h, mat, flipV = false) {
  const g = new THREE.PlaneGeometry(w, h);
  if (flipV) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  }
  g.rotateY(Math.PI / 2); // mira hacia +X (hacia el objetivo)
  return new THREE.Mesh(g, mat);
}

// ---------------------------------------------------------------- iris
function bladeGeo(r, R) {
  const w = Math.sqrt(Math.max(R * R - r * r, 1e-6));
  const a0 = Math.atan2(r, w);
  const s = new THREE.Shape();
  s.moveTo(w, r);
  s.absarc(0, 0, R, a0, Math.PI - a0, false);
  s.lineTo(-w, r);
  s.closePath();
  const g = new THREE.ShapeGeometry(s, 24);
  g.rotateY(Math.PI / 2);
  return g;
}

// ====================================================================== Rig
export class CameraRig {
  constructor() {
    this.group = new THREE.Group();
    this.group.position.set(0, AXIS_Y, 0);
    this.parts = new Map();
    this.pickables = [];
    this.cam = null;

    this.explodeT = 1;
    this.explodeTarget = 1;
    this.xrayT = 0;
    this.xray = false;
    this.mirrorAngle = 0;
    this.c1 = 1;
    this.c2 = 0;
    this.flap = 1;
    this.irisR = 0.4;
    this.irisTarget = 0.4;
    this.focusAngle = 0;
    this.focusAngleTarget = 0;
    this.focusShift = 0;
    this.focusShiftTarget = 0;
    this.apertureAngle = 0;
    this.apertureAngleTarget = 0;
    this.mirrorDown = false;
    this.timeline = null;
    this.hoverId = null;
    this.selectedId = null;
    this.sensorLight = 1;
    this._lastBladeR = -1;
    this._time = 0;
    this.standMats = { base: MAT.black(), post: MAT.chrome(), saddle: MAT.brass() };
  }

  // ------------------------------------------------------------ construcción
  build(cam, photoTexture) {
    this.clear();
    this.cam = cam;
    this.photoTexture = photoTexture;
    this.imageW = cam.sensor.w * DISPLAY_PER_MM;
    this.imageH = cam.sensor.h * DISPLAY_PER_MM;

    if (cam.pinhole) this.buildPinhole();
    else {
      this.buildLens();
      if (cam.mirror) this.buildReflexBody();
      else this.buildMirrorlessBody();
    }
    this.mirrorAngle = cam.mirror && this.mirrorDown ? 45 : 0;
    this.applyExplode(true);
  }

  clear() {
    for (const p of this.parts.values()) {
      this.group.remove(p.holder);
      p.holder.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) if (!Object.values(this.standMats).includes(m)) m.dispose();
        }
      });
    }
    this.parts.clear();
    this.pickables = [];
    this.timeline = null;
  }

  /**
   * Registra una pieza.
   * opts: a/e posiciones (montada/despiezada), stand {bottom, z}, shell (carcasa que se desvanece),
   * inner (solo visible con despiece o rayos X), label offset.
   */
  addPart(id, obj, opts) {
    const holder = new THREE.Group();
    holder.name = id;
    holder.add(obj);
    const part = {
      id,
      holder,
      obj,
      a: opts.a.clone(),
      e: opts.e.clone(),
      shell: opts.shell ?? false,
      shellMin: opts.shellMin ?? 0,
      inner: opts.inner ?? false,
      label: opts.label ?? V(0, 1.2, 0),
      mats: [],
      shellMats: [],
      stand: null,
      radius: opts.radius ?? 1,
    };
    obj.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      o.userData.partId = id;
      this.pickables.push(o);
      if (o.userData.noHighlight) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.emissive && !part.mats.includes(m)) {
          m.userData.baseEmissive = m.emissive.clone();
          m.userData.baseEmissiveIntensity = m.emissiveIntensity;
          part.mats.push(m);
        }
        if (part.shell && !part.shellMats.includes(m)) {
          m.userData.baseOpacity = m.opacity;
          part.shellMats.push(m);
        }
      }
    });
    if (opts.stand) part.stand = this.makeStand(part, opts.stand);
    this.group.add(holder);
    this.parts.set(id, part);
    return part;
  }

  makeStand(part, { bottom = 1, z = 0, x = 0 }) {
    const root = new THREE.Group();
    const H = AXIS_Y + part.e.y - bottom;
    const m = this.standMats;
    const base = mesh(new RoundedBoxGeometry(0.7, 0.1, 0.8, 2, 0.03), m.base, V(x, 0.05, z));
    const post = mesh(new THREE.CylinderGeometry(0.045, 0.045, H, 16), m.post, V(x, H / 2, z));
    const saddle = mesh(new RoundedBoxGeometry(0.34, 0.12, 0.34, 2, 0.03), m.saddle, V(x, H - 0.02, z));
    root.add(base, post, saddle);
    if (z !== 0) {
      const arm = mesh(new THREE.BoxGeometry(0.08, 0.08, Math.abs(z)), m.post, V(x, H - 0.02, z / 2));
      root.add(arm);
    }
    root.traverse((o) => { if (o.isMesh) o.userData.noHighlight = true; });
    part.holder.add(root);
    return root;
  }

  // ------------------------------------------------------------ objetivo
  buildLens() {
    const glass = () => MAT.glass();

    // Lente frontal: menisco grande + segunda lente, con parasol/bisel.
    {
      const g = new THREE.Group();
      const ring = MAT.black();
      g.add(element(0.84, 0.1, 0.24, -0.08, { glass: glass(), ring, x: 0 }));
      g.add(element(0.74, 0.1, 0.12, 0.12, { glass: glass(), ring, x: -0.32 }));
      const bezel = mesh(ringGeo(0.86, 0.98, 0.34), MAT.black(), V(0.02, 0, 0));
      g.add(bezel);
      const accent = mesh(ringGeo(0.975, 0.99, 0.03, 72, 0), MAT.brass(), V(0.16, 0, 0));
      g.add(accent);
      this.addPart('front', g, { a: V(1.15), e: V(2.35), stand: { bottom: 0.98 }, label: V(0, -1.45, 0), radius: 1 });
    }

    // Grupo de enfoque: doblete acromático.
    {
      const g = new THREE.Group();
      const ring = MAT.satin();
      g.add(element(0.64, 0.12, 0.14, 0.02, { glass: glass(), ring, x: 0.08 }));
      g.add(element(0.64, 0.05, -0.02, -0.09, { glass: MAT.glass(0xffd9c4), ring, x: -0.1, ringColor: 0xffc79a }));
      g.add(mesh(ringGeo(0.66, 0.74, 0.42), MAT.black()));
      this.addPart('focusGroup', g, { a: V(0.52), e: V(0.92), stand: { bottom: 0.74 }, inner: true, label: V(0, -0.95, 0), radius: 0.75 });
    }

    // Anillo de enfoque de goma estriada con corona dentada.
    {
      const g = new THREE.Group();
      const rot = new THREE.Group();
      rot.add(mesh(ringGeo(0.9, 0.98, 0.72), MAT.rubber()));
      rot.add(teeth(90, 1.0, [0.62, 0.05, 0.035], MAT.rubber()));
      rot.add(mesh(ringGeo(0.92, 1.04, 0.1), MAT.brass(), V(-0.4, 0, 0)));
      rot.add(teeth(70, 1.06, [0.1, 0.06, 0.05], MAT.brass(), -0.4));
      const mark = mesh(new THREE.BoxGeometry(0.5, 0.03, 0.03), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x5ce1e6, emissiveIntensity: 0.6 }), V(0, 1.03, 0));
      rot.add(mark);
      g.add(rot);
      this.focusRingRot = rot;
      this.addPart('focusRing', g, { a: V(0.62), e: V(1.6), stand: { bottom: 1.06 }, label: V(0, 1.75, 0), radius: 1.06 });
    }

    // Diafragma: láminas + carcasa.
    {
      const g = new THREE.Group();
      g.add(mesh(ringGeo(0.72, 0.86, 0.14), MAT.black()));
      this.blades = [];
      const bladeMats = [
        new THREE.MeshStandardMaterial({ color: 0x131417, metalness: 0.35, roughness: 0.55, side: THREE.DoubleSide, envMapIntensity: 0.4 }),
        new THREE.MeshStandardMaterial({ color: 0x1c1e23, metalness: 0.35, roughness: 0.5, side: THREE.DoubleSide, envMapIntensity: 0.4 }),
      ];
      const n = 9;
      for (let i = 0; i < n; i++) {
        const b = new THREE.Mesh(bladeGeo(0.4, 0.8), bladeMats[i % 2]);
        b.rotation.x = (i / n) * TAU;
        b.position.x = -0.035 + i * 0.008;
        b.castShadow = true;
        g.add(b);
        this.blades.push(b);
      }
      this.addPart('iris', g, { a: V(0), e: V(0), inner: true, label: V(0, -1.45, 0), radius: 0.86 });
    }

    // Anillo de diafragma (latón dentado).
    {
      const g = new THREE.Group();
      const rot = new THREE.Group();
      rot.add(mesh(ringGeo(0.9, 1.0, 0.2), MAT.brass()));
      rot.add(teeth(64, 1.02, [0.2, 0.07, 0.05], MAT.brass()));
      const nums = mesh(ringGeo(1.0, 1.005, 0.06, 72, 0), MAT.black(), V(0.12, 0, 0));
      rot.add(nums);
      g.add(rot);
      this.apertureRingRot = rot;
      this.addPart('apertureRing', g, { a: V(0.05), e: V(0), stand: { bottom: 1.08 }, label: V(0, 1.35, 0), radius: 1.08 });
    }

    // Grupo trasero.
    {
      const g = new THREE.Group();
      const ring = MAT.black();
      g.add(element(0.58, 0.05, -0.08, 0.04, { glass: glass(), ring, x: 0.06 }));
      g.add(element(0.56, 0.1, 0.1, 0.1, { glass: glass(), ring, x: -0.12 }));
      this.addPart('rear', g, { a: V(-0.15), e: V(-0.78), stand: { bottom: 0.64 }, inner: true, label: V(0, -0.85, 0), radius: 0.64 });
    }

    // Barril (solo visible montado).
    {
      const g = new THREE.Group();
      g.add(mesh(ringGeo(0.86, 0.92, 1.3), MAT.black(), V(0.25, 0, 0)));
      g.add(mesh(ringGeo(0.86, 0.95, 0.12), MAT.satin(), V(-0.22, 0, 0)));
      const txt = labelTexture(['50mm  1:1.4'], { w: 512, h: 64, bg: '#0f1013', fg: '#dfe3ea' });
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.925, 0.925, 0.12, 64, 1, true, -0.9, 1.8).rotateZ(Math.PI / 2),
        new THREE.MeshStandardMaterial({ map: txt, metalness: 0.3, roughness: 0.5, transparent: true }),
      );
      band.position.x = 1.05;
      g.add(band);
      this.lensBandTex = txt;
      this.addPart('barrel', g, { a: V(0), e: V(0), shell: true, label: V(0.1, -1.3, 0), radius: 0.95 });
    }

    // Montura bayoneta.
    {
      const g = new THREE.Group();
      g.add(mesh(ringGeo(0.72, 0.95, 0.08), MAT.chrome()));
      g.add(mesh(ringGeo(0.95, 1.15, 0.06), MAT.black(), V(-0.05, 0, 0)));
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + 0.4;
        const tab = mesh(new THREE.BoxGeometry(0.06, 0.08, 0.42), MAT.chrome(), V(0.03, Math.cos(a) * 0.68, Math.sin(a) * 0.68));
        tab.rotation.x = a;
        g.add(tab);
      }
      for (let i = 0; i < 8; i++) {
        const a = -0.55 + i * 0.16;
        const c = mesh(new THREE.BoxGeometry(0.03, 0.04, 0.05), MAT.gold(), V(0.05, Math.cos(a) * 0.78, Math.sin(a) * 0.78));
        c.rotation.x = a;
        g.add(c);
      }
      const dot = mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshStandardMaterial({ color: 0xff3344, emissive: 0xff2233, emissiveIntensity: 0.5 }), V(0.02, 1.05, 0));
      g.add(dot);
      this.addPart('mount', g, { a: V(-0.33), e: V(-1.5), stand: { bottom: 1.15 }, label: V(0, 1.85, 0), radius: 1.15 });
    }
  }

  // ------------------------------------------------------------ piezas del cuerpo
  buildSensor(x, e) {
    const g = new THREE.Group();
    const sw = this.imageW;
    const sh = this.imageH;
    g.add(mesh(new THREE.BoxGeometry(0.05, sh + 0.55, sw + 0.6), MAT.pcb(), V(-0.06, 0, 0)));
    g.add(mesh(new THREE.BoxGeometry(0.06, sh + 0.25, sw + 0.25), MAT.ceramic(), V(0, 0, 0)));
    const padMat = MAT.gold();
    const pads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, 0.05, 0.035), padMat, 48);
    const d = new THREE.Object3D();
    for (let i = 0; i < 24; i++) {
      const z = -sw / 2 + (i + 0.5) * (sw / 24);
      d.position.set(0.035, sh / 2 + 0.08, z); d.updateMatrix(); pads.setMatrixAt(i, d.matrix);
      d.position.set(0.035, -sh / 2 - 0.08, z); d.updateMatrix(); pads.setMatrixAt(24 + i, d.matrix);
    }
    g.add(pads);
    this.imageMat = new THREE.MeshBasicMaterial({ map: this.photoTexture, toneMapped: false });
    const img = planeX(sw, sh, this.imageMat, true);
    img.position.x = 0.035;
    g.add(img);
    const bt = bayerTexture();
    bt.repeat.set(sw * 90, sh * 90);
    const bayer = planeX(sw, sh, new THREE.MeshBasicMaterial({ map: bt, transparent: true, opacity: 0.1, depthWrite: false }));
    bayer.position.x = 0.037;
    bayer.userData.noHighlight = true;
    g.add(bayer);
    const cover = planeX(sw + 0.1, sh + 0.1, MAT.glass(0xe0f0ff));
    cover.position.x = 0.06;
    cover.userData.noHighlight = true;
    g.add(cover);
    this.imageSurfaceOffset = 0.035;
    this.addPart('sensor', g, { a: V(x), e: V(e), stand: { bottom: (sh + 0.55) / 2 }, inner: true, label: V(0, -(sh / 2 + 0.55), 0), radius: sh / 2 + 0.3 });
  }

  buildFilm(x, e) {
    const g = new THREE.Group();
    const sw = this.imageW;
    const sh = this.imageH;
    const strip = planeX(3.1, 1.62, new THREE.MeshStandardMaterial({ map: filmStripTexture(), roughness: 0.35, metalness: 0.1, side: THREE.DoubleSide }));
    g.add(strip);
    this.imageMat = new THREE.MeshBasicMaterial({ map: this.photoTexture, toneMapped: false, color: 0xffd2a0 });
    const img = planeX(sw, sh, this.imageMat, true);
    img.position.x = 0.006;
    g.add(img);
    g.add(mesh(new THREE.BoxGeometry(0.04, 1.3, 2.2), MAT.chrome(), V(-0.06, 0, 0)));
    const can = new THREE.Group();
    const label = labelTexture(['400', 'ISO · 36 EXP'], { w: 512, h: 256, bg: '#f3c622', fg: '#1b1b1b', accent: '#c8201e' });
    can.add(mesh(new THREE.CylinderGeometry(0.33, 0.33, 1.7, 40), new THREE.MeshStandardMaterial({ map: label, metalness: 0.3, roughness: 0.45 })));
    can.add(mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 40), MAT.chrome(), V(0, 0.88, 0)));
    can.add(mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 40), MAT.chrome(), V(0, -0.88, 0)));
    can.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.18, 16), MAT.black(), V(0, 0.99, 0)));
    can.position.set(-0.25, 0, -1.8);
    g.add(can);
    const spool = new THREE.Group();
    spool.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.62, 40), new THREE.MeshStandardMaterial({ color: 0x5a2c0c, roughness: 0.4 })));
    spool.add(mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 40), MAT.black(), V(0, 0.84, 0)));
    spool.add(mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 40), MAT.black(), V(0, -0.84, 0)));
    spool.position.set(-0.25, 0, 1.75);
    g.add(spool);
    this.spool = spool;
    this.imageSurfaceOffset = 0.006;
    this.addPart('film', g, { a: V(x), e: V(e), stand: { bottom: 0.95 }, inner: true, label: V(0, -1.2, 0), radius: 0.9 });
  }

  buildShutter(x, e) {
    const g = new THREE.Group();
    const W = this.imageW + 0.2;
    const H = this.imageH + 0.1;
    const frame = MAT.satin();
    const housing = MAT.black();
    g.add(mesh(new THREE.BoxGeometry(0.16, 0.5, W + 0.36), housing, V(0, H / 2 + 0.25, 0)));
    g.add(mesh(new THREE.BoxGeometry(0.16, 0.56, W + 0.36), housing, V(0, -H / 2 - 0.28, 0)));
    g.add(mesh(new THREE.BoxGeometry(0.1, H, 0.18), frame, V(0, 0, W / 2 + 0.09)));
    g.add(mesh(new THREE.BoxGeometry(0.1, H, 0.18), frame, V(0, 0, -W / 2 - 0.09)));
    const slatMat1 = new THREE.MeshStandardMaterial({ color: 0x23262d, metalness: 0.7, roughness: 0.35 });
    const slatMat2 = new THREE.MeshStandardMaterial({ color: 0x191b20, metalness: 0.7, roughness: 0.4 });
    const slatH = H / 4 + 0.04;
    this.curtain1 = [];
    this.curtain2 = [];
    for (let i = 0; i < 4; i++) {
      const s1 = mesh(new THREE.BoxGeometry(0.015, slatH, W), slatMat1, V(0.025, 0, 0));
      const s2 = mesh(new THREE.BoxGeometry(0.015, slatH, W), slatMat2, V(-0.025, 0, 0));
      g.add(s1, s2);
      this.curtain1.push(s1);
      this.curtain2.push(s2);
    }
    this.shutterH = H;
    this.slatH = slatH;
    this.addPart('shutter', g, { a: V(x), e: V(e), stand: { bottom: H / 2 + 0.56 }, inner: true, label: V(0, H / 2 + 0.75, 0), radius: H / 2 + 0.5 });
  }

  updateCurtains() {
    if (!this.curtain1) return;
    const H = this.shutterH;
    const sh = this.slatH;
    for (let i = 0; i < 4; i++) {
      const cover1 = H / 2 - (i + 0.5) * (H / 4);
      const stow1 = -H / 2 - sh / 2 - 0.03 - i * 0.02;
      this.curtain1[i].position.y = THREE.MathUtils.lerp(cover1, stow1, this.c1);
      const cover2 = -H / 2 + (i + 0.5) * (H / 4);
      const stow2 = H / 2 + sh / 2 + 0.01 + i * 0.02;
      this.curtain2[i].position.y = THREE.MathUtils.lerp(stow2, cover2, this.c2);
    }
  }

  buildReflexBody() {
    const film = this.cam.film;
    // Espejo abatible.
    {
      const g = new THREE.Group();
      const pivot = new THREE.Group();
      pivot.position.set(-0.495, 0.495, 0);
      const plate = new THREE.Group();
      plate.add(mesh(new THREE.BoxGeometry(1.4, 0.03, 1.6), MAT.mirror(), V(0.7, 0, 0)));
      plate.add(mesh(new THREE.BoxGeometry(1.46, 0.025, 1.66), MAT.black(), V(0.7, -0.02, 0)));
      pivot.add(plate);
      g.add(pivot);
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 12), MAT.chrome(), V(-0.495, 0.495, 0)).rotateX(Math.PI / 2));
      // Caja del espejo (marco)
      const fm = MAT.black();
      g.add(mesh(new THREE.BoxGeometry(1.3, 0.06, 0.06), fm, V(0, -0.62, 0.92)));
      g.add(mesh(new THREE.BoxGeometry(1.3, 0.06, 0.06), fm, V(0, -0.62, -0.92)));
      g.add(mesh(new THREE.BoxGeometry(0.06, 1.14, 0.06), fm, V(-0.62, -0.05, 0.92)));
      g.add(mesh(new THREE.BoxGeometry(0.06, 1.14, 0.06), fm, V(-0.62, -0.05, -0.92)));
      this.mirrorPivot = pivot;
      this.addPart('mirror', g, { a: V(-1.25), e: V(-2.55), stand: { bottom: 0.66 }, inner: true, label: V(0.2, -1.0, 0), radius: 0.7 });
    }
    // Pantalla de enfoque.
    {
      const g = new THREE.Group();
      g.add(mesh(new THREE.BoxGeometry(1.45, 0.03, 1.75), MAT.frosted(), null, false));
      const fr = MAT.satin();
      g.add(mesh(new THREE.BoxGeometry(1.5, 0.05, 0.05), fr, V(0, 0, 0.9)));
      g.add(mesh(new THREE.BoxGeometry(1.5, 0.05, 0.05), fr, V(0, 0, -0.9)));
      this.addPart('screen', g, { a: V(-1.25, 0.62), e: V(-2.55, 1.2), stand: { bottom: 0.05, z: -1.35, x: -0.35 }, inner: true, label: V(0, 0.05, 1.3), radius: 0.2 });
    }
    // Pentaprisma.
    {
      const s = new THREE.Shape();
      s.moveTo(-0.72, 0);
      s.lineTo(0.72, 0);
      s.lineTo(0.72, 0.22);
      s.lineTo(0.22, 0.66);
      s.lineTo(-0.38, 0.66);
      s.lineTo(-0.72, 0.3);
      s.closePath();
      const geo = new THREE.ExtrudeGeometry(s, { depth: 1.3, bevelEnabled: false });
      geo.translate(0, 0, -0.65);
      const g = new THREE.Group();
      const prismMat = MAT.glass(0xa9e9ff);
      prismMat.opacity = 0.38;
      const p = mesh(geo, prismMat, null, false);
      g.add(p);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x8fe9ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      g.add(edges);
      g.add(mesh(new THREE.BoxGeometry(1.5, 0.04, 1.36), MAT.satin(), V(0, -0.02, 0)));
      this.addPart('prism', g, { a: V(-1.25, 0.66), e: V(-2.55, 1.75), stand: { bottom: 0.04, z: -1.2, x: 0.35 }, inner: true, label: V(0, 0.95, 0), radius: 0.1 });
    }
    // Ocular.
    {
      const g = new THREE.Group();
      g.add(mesh(cylX(0.2, 0.3), MAT.black()));
      g.add(mesh(ringGeo(0.14, 0.26, 0.14), MAT.rubber(), V(-0.2, 0, 0)));
      const lensMat = MAT.glass();
      const l = mesh(lensGeo(0.15, 0.03, 0.03, 0.03), lensMat, V(-0.1, 0, 0), false);
      g.add(l);
      this.addPart('eyepiece', g, { a: V(-2.66, 1.02), e: V(-3.6, 2.05), stand: { bottom: 0.26, z: -1.5 }, label: V(-0.1, 0.5, 0), radius: 0.26 });
    }
    this.buildShutter(-2.05, -3.45);
    if (film) this.buildFilm(-2.2, -4.3);
    else this.buildSensor(-2.2, -4.3);

    // Carcasa.
    {
      const g = new THREE.Group();
      const shellMat = MAT.black();
      shellMat.roughness = 0.62;
      shellMat.metalness = 0.25;
      const leather = MAT.rubber();
      g.add(mesh(new RoundedBoxGeometry(2.2, 2.05, 3.8, 4, 0.2), shellMat, V(-1.45, -0.275, 0)));
      g.add(mesh(new RoundedBoxGeometry(1.95, 1.9, 0.9, 4, 0.32), leather, V(-0.88, -0.33, 1.78)));
      // Joroba del pentaprisma
      const hs = new THREE.Shape();
      hs.moveTo(-0.85, 0);
      hs.lineTo(0.85, 0);
      hs.lineTo(0.55, 0.8);
      hs.lineTo(-0.55, 0.8);
      hs.closePath();
      const hg = new THREE.ExtrudeGeometry(hs, { depth: 1.7, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 });
      hg.translate(0, 0, -0.85);
      g.add(mesh(hg, shellMat, V(-1.3, 0.7, 0)));
      const logo = labelTexture([film ? 'CAM·3D  FILM' : 'CAM·3D'], { w: 512, h: 96, bg: '#15171b', fg: '#e8eaee' });
      const lp = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.17).rotateY(Math.PI / 2).rotateZ(-0.36), new THREE.MeshStandardMaterial({ map: logo, roughness: 0.5 }));
      lp.position.set(-0.64, 1.15, 0);
      g.add(lp);
      // Botón de disparo y diales
      g.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 32), MAT.chrome(), V(-0.7, 0.66, 1.85)));
      g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 32), new THREE.MeshStandardMaterial({ color: 0xb8322a, roughness: 0.4 }), V(-0.7, 0.71, 1.85)));
      g.add(mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.16, 40), MAT.satin(), V(-1.75, 0.83, -1.3)));
      g.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 40), MAT.satin(), V(-1.75, 0.8, 1.2)));
      if (film) {
        const lever = mesh(new THREE.BoxGeometry(0.7, 0.04, 0.14), MAT.chrome(), V(-1.9, 0.92, 1.25));
        lever.rotation.y = 0.5;
        g.add(lever);
        g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.2, 24), MAT.chrome(), V(-1.8, 0.85, -1.35)));
      } else {
        // Pantalla trasera con Live View
        this.lcdMat = new THREE.MeshBasicMaterial({ map: this.photoTexture, toneMapped: false });
        const lcd = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.4).rotateY(-Math.PI / 2), this.lcdMat);
        lcd.position.set(-2.56, -0.3, -0.35);
        g.add(lcd);
      }
      // Pie (trípode) montado
      this.addPart('body', g, { a: V(0), e: V(0), shell: true, label: V(-1.4, 2.0, 0), radius: 1.3 });
    }
    this.buildTripodHead(-1.45, -1.3);
  }

  buildMirrorlessBody() {
    this.buildShutter(-1.0, -2.45);
    this.buildSensor(-1.13, -3.4);
    // Visor electrónico
    {
      const g = new THREE.Group();
      g.add(mesh(new RoundedBoxGeometry(0.95, 0.6, 1.0, 3, 0.1), MAT.black()));
      g.add(mesh(ringGeo(0.12, 0.24, 0.18), MAT.rubber(), V(-0.55, 0, 0)));
      this.evfMat = new THREE.MeshBasicMaterial({ map: this.photoTexture, toneMapped: false });
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.24).rotateY(-Math.PI / 2), this.evfMat);
      scr.position.x = -0.48;
      g.add(scr);
      this.addPart('evf', g, { a: V(-0.9, 1.1, -1.05), e: V(-2.0, 2.05, -1.05), stand: { bottom: 0.3 }, label: V(0, 0.55, 0), radius: 0.3 });
    }
    {
      const g = new THREE.Group();
      const shellMat = MAT.black();
      shellMat.roughness = 0.6;
      shellMat.metalness = 0.25;
      g.add(mesh(new RoundedBoxGeometry(1.0, 2.1, 3.8, 4, 0.16), shellMat, V(-0.85, -0.25, 0)));
      g.add(mesh(new RoundedBoxGeometry(1.45, 1.95, 0.85, 4, 0.3), MAT.rubber(), V(-0.55, -0.3, 1.8)));
      g.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 32), MAT.chrome(), V(-0.5, 0.7, 1.82)));
      g.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.14, 40), MAT.satin(), V(-0.85, 0.87, 1.0)));
      const logo = labelTexture(['CAM·3D  Z'], { w: 512, h: 96, bg: '#15171b', fg: '#e8eaee' });
      const lp = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.15).rotateY(Math.PI / 2), new THREE.MeshStandardMaterial({ map: logo, roughness: 0.5 }));
      lp.position.set(-0.34, 0.5, -1.2);
      g.add(lp);
      this.lcdMat = new THREE.MeshBasicMaterial({ map: this.photoTexture, toneMapped: false });
      const lcd = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.5).rotateY(-Math.PI / 2), this.lcdMat);
      lcd.position.set(-1.36, -0.3, -0.2);
      g.add(lcd);
      this.addPart('body', g, { a: V(0), e: V(0), shell: true, label: V(-0.85, 1.6, 0.6), radius: 1.3 });
    }
    this.buildTripodHead(-0.85, -1.3);
  }

  buildPinhole() {
    // Estenopo: chapa con un agujero diminuto en el centro óptico.
    {
      const g = new THREE.Group();
      g.add(mesh(new THREE.BoxGeometry(0.03, 0.9, 0.9), MAT.black(), V(0.01, 0, 0)));
      g.add(mesh(ringGeo(0.03, 0.26, 0.02, 48, 0), MAT.brass(), V(0.03, 0, 0)));
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.03, 24).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      hole.position.x = 0.041;
      g.add(hole);
      this.addPart('pinhole', g, { a: V(0), e: V(0), stand: { bottom: 0.45 }, label: V(0, 0.8, 0), radius: 0.45 });
    }
    // Tapa obturadora con bisagra superior.
    {
      const g = new THREE.Group();
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.5, 0);
      pivot.add(mesh(new RoundedBoxGeometry(0.05, 1.0, 1.0, 2, 0.02), MAT.rubber(), V(0, -0.5, 0)));
      pivot.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.02, 12).rotateX(Math.PI / 2), MAT.brass()));
      g.add(pivot);
      this.flapPivot = pivot;
      this.addPart('flap', g, { a: V(0.07), e: V(0.95), stand: { bottom: 0.52 }, label: V(0.2, 0.95, 0), radius: 0.5 });
    }
    // Placa de película al fondo.
    {
      const g = new THREE.Group();
      const sw = this.imageW;
      const sh = this.imageH;
      g.add(mesh(new THREE.BoxGeometry(0.08, sh + 0.35, sw + 0.4), MAT.black(), V(-0.04, 0, 0)));
      this.imageMat = new THREE.MeshBasicMaterial({ map: this.photoTexture, toneMapped: false, color: 0xfff0dc });
      const img = planeX(sw, sh, this.imageMat, true);
      img.position.x = 0.006;
      g.add(img);
      this.imageSurfaceOffset = 0.006;
      this.addPart('filmSheet', g, { a: V(-1.5), e: V(-3.0), stand: { bottom: (sh + 0.35) / 2 }, inner: true, label: V(0, -(sh / 2 + 0.45), 0), radius: 0.8 });
    }
    // Caja de madera.
    {
      const g = new THREE.Group();
      const wood = MAT.wood();
      const t = 0.06;
      const L = 1.6;
      const H = 1.9;
      const W = 2.8;
      g.add(mesh(new THREE.BoxGeometry(L, t, W), wood, V(-L / 2, H / 2, 0)));
      g.add(mesh(new THREE.BoxGeometry(L, t, W), wood, V(-L / 2, -H / 2, 0)));
      g.add(mesh(new THREE.BoxGeometry(L, H, t), wood, V(-L / 2, 0, W / 2)));
      g.add(mesh(new THREE.BoxGeometry(L, H, t), wood, V(-L / 2, 0, -W / 2)));
      g.add(mesh(new THREE.BoxGeometry(t, H, W), wood, V(-L, 0, 0)));
      // Frontal con agujero central (cuatro piezas)
      const fh = (H - 0.8) / 2;
      const fw = (W - 0.8) / 2;
      g.add(mesh(new THREE.BoxGeometry(t, fh, W), wood, V(-t / 2, H / 2 - fh / 2, 0)));
      g.add(mesh(new THREE.BoxGeometry(t, fh, W), wood, V(-t / 2, -H / 2 + fh / 2, 0)));
      g.add(mesh(new THREE.BoxGeometry(t, 0.8, fw), wood, V(-t / 2, 0, W / 2 - fw / 2)));
      g.add(mesh(new THREE.BoxGeometry(t, 0.8, fw), wood, V(-t / 2, 0, -W / 2 + fw / 2)));
      this.addPart('box', g, { a: V(0), e: V(0, 2.6, 0), shell: true, shellMin: 0.25, label: V(-0.8, 1.35, 0), radius: 1 });
    }
    this.buildTripodHead(-0.8, -0.95);
  }

  buildTripodHead(x, bottomY) {
    // Soporte para la vista montada (se oculta al despiezar).
    const g = new THREE.Group();
    const h = AXIS_Y + bottomY;
    g.add(mesh(new RoundedBoxGeometry(1.2, 0.12, 1.4, 2, 0.04), this.standMats.base, V(x, -AXIS_Y + 0.06, 0)));
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.16, h - 0.2, 24), this.standMats.post, V(x, -AXIS_Y + h / 2, 0)));
    g.add(mesh(new RoundedBoxGeometry(0.9, 0.12, 0.9, 2, 0.04), this.standMats.saddle, V(x, bottomY - 0.06, 0)));
    g.traverse((o) => { if (o.isMesh) o.userData.noHighlight = true; });
    this.tripod = g;
    const holder = new THREE.Group();
    holder.add(g);
    this.group.add(holder);
    this.parts.set('__tripod', { id: '__tripod', holder, obj: g, a: V(0), e: V(0), mats: [], shellMats: [], decor: true });
  }

  // ------------------------------------------------------------ estado
  setTargets({ exploded, xray, irisR, focusMm, f, mirrorDown }) {
    this.explodeTarget = exploded ? 1 : 0;
    this.xray = xray;
    this.irisTarget = irisR;
    this.mirrorDown = !!mirrorDown;
    const vs = (f * focusMm) / (focusMm - f);
    this.extensionMm = vs - f;
    this.focusShiftTarget = 0.32 * Math.tanh(this.extensionMm / 12);
    this.focusAngleTarget = -Math.log(focusMm / 300) * 1.4;
  }

  /** Rotula el barril con la focal y la luminosidad del objetivo actual. */
  setLensLabel(f, maxN) {
    const band = this.parts.get('barrel')?.obj.children.find((o) => o.material?.map === this.lensBandTex);
    if (!band) return;
    const t = labelTexture([`${f}mm  1:${maxN}`], { w: 512, h: 64, bg: '#0f1013', fg: '#dfe3ea' });
    band.material.map = t;
    this.lensBandTex?.dispose();
    this.lensBandTex = t;
    band.material.needsUpdate = true;
  }

  setApertureIndex(i) {
    this.apertureAngleTarget = -i * 0.22;
  }

  shoot({ hold, onExpose, onDone }) {
    if (this.timeline) return false;
    const steps = [];
    if (this.cam.pinhole) {
      steps.push({ d: 0.18, f: (k) => (this.flap = 1 - k) });
      steps.push({ d: 0.25, f: (k) => (this.flap = k) });
      steps.push({ d: hold, end: onExpose });
      steps.push({ d: 0.25, f: (k) => (this.flap = 1 - k) });
      steps.push({ d: 0.3, f: (k) => (this.flap = k) });
    } else {
      const wasDown = this.cam.mirror && this.mirrorDown;
      if (!wasDown) steps.push({ d: 0.1, f: (k) => (this.c1 = 1 - k) });
      if (wasDown) steps.push({ d: 0.12, f: (k) => (this.mirrorAngle = 45 * (1 - k)) });
      steps.push({ d: 0.15, f: (k) => { this.c1 = k; this.c2 = 0; } });
      steps.push({ d: hold, end: onExpose });
      steps.push({ d: 0.15, f: (k) => (this.c2 = k) });
      if (wasDown) steps.push({ d: 0.15, f: (k) => (this.mirrorAngle = 45 * k) });
      steps.push({ d: 0.3, f: (k) => { this.c2 = 1 - k; this.c1 = wasDown ? 1 - k : 1; } });
      if (this.spool) {
        // Arrastre de la película al siguiente fotograma
        const r0 = this.spool.rotation.y;
        steps.push({ d: 0.3, f: (k) => (this.spool.rotation.y = r0 + k * 2.2) });
      }
    }
    this.timeline = { steps, i: 0, t: 0, onDone };
    return true;
  }

  get busy() {
    return !!this.timeline;
  }

  setHover(id) {
    this.hoverId = id;
  }

  setSelected(id) {
    this.selectedId = id;
  }

  applyExplode(snap = false) {
    const t = this.explodeT;
    const k = t * t * (3 - 2 * t);
    for (const p of this.parts.values()) {
      if (p.decor) {
        p.holder.visible = t < 0.98;
        p.holder.position.y = -k * 1.5;
        continue;
      }
      p.holder.position.lerpVectors(p.a, p.e, k);
      if (p.stand) {
        p.stand.visible = t > 0.02;
        p.stand.position.y = -(AXIS_Y + p.holder.position.y);
        p.stand.scale.y = Math.max(0.001, k);
      }
    }
    if (snap) this.updateShells(1);
  }

  updateShells(blend = 0.15) {
    const t = this.explodeT;
    for (const p of this.parts.values()) {
      if (!p.shell) continue;
      let o = THREE.MathUtils.lerp(1, p.shellMin, t);
      o = Math.min(o, THREE.MathUtils.lerp(1, 0.14, this.xrayT));
      for (const m of p.shellMats) {
        const target = (m.userData.baseOpacity ?? 1) * o;
        m.opacity = blend >= 1 ? target : m.opacity + (target - m.opacity) * Math.min(1, blend * 4);
        const tr = m.opacity < 0.995 || m.userData.baseOpacity < 1;
        if (m.transparent !== tr) {
          m.transparent = tr;
          m.needsUpdate = true;
        }
        m.depthWrite = !tr;
      }
      p.holder.visible = o > 0.01;
      p.hidden = o < 0.3;
    }
  }

  update(dt) {
    this._time += dt;
    const a = 1 - Math.exp(-dt * 7);

    this.explodeT += Math.sign(this.explodeTarget - this.explodeT) * Math.min(Math.abs(this.explodeTarget - this.explodeT), dt * 1.1);
    this.xrayT += ((this.xray ? 1 : 0) - this.xrayT) * a;
    this.applyExplode();
    this.updateShells(a);

    // Diafragma
    this.irisR += (this.irisTarget - this.irisR) * a;
    if (this.blades && Math.abs(this.irisR - this._lastBladeR) > 0.0015) {
      for (const b of this.blades) {
        b.geometry.dispose();
        b.geometry = bladeGeo(Math.max(0.012, this.irisR), 0.8);
      }
      this._lastBladeR = this.irisR;
    }
    // Enfoque
    this.focusAngle += (this.focusAngleTarget - this.focusAngle) * a;
    this.focusShift += (this.focusShiftTarget - this.focusShift) * a;
    if (this.focusRingRot) this.focusRingRot.rotation.x = this.focusAngle;
    const fg = this.parts.get('focusGroup');
    if (fg) fg.holder.position.x += this.focusShift;
    const fr = this.parts.get('front');
    if (fr) fr.holder.position.x += this.focusShift * (1 - this.explodeT * 0.7);
    this.apertureAngle += (this.apertureAngleTarget - this.apertureAngle) * a;
    if (this.apertureRingRot) this.apertureRingRot.rotation.x = this.apertureAngle;

    // Mecanismos (línea de tiempo del disparo o estado de reposo)
    if (this.timeline) {
      const tl = this.timeline;
      const st = tl.steps[tl.i];
      tl.t += dt;
      const k = Math.min(1, tl.t / Math.max(st.d, 1e-3));
      st.f?.(k * k * (3 - 2 * k));
      if (k >= 1) {
        st.end?.();
        tl.i++;
        tl.t = 0;
        if (tl.i >= tl.steps.length) {
          this.timeline = null;
          tl.onDone?.();
        }
      }
    } else {
      const s = Math.min(1, dt * 5);
      if (this.cam?.mirror) {
        const target = this.mirrorDown ? 45 : 0;
        this.mirrorAngle += Math.sign(target - this.mirrorAngle) * Math.min(Math.abs(target - this.mirrorAngle), dt * 260);
        const c1t = this.mirrorDown ? 0 : 1;
        this.c1 += (c1t - this.c1) * s;
      } else {
        this.c1 += (1 - this.c1) * s;
      }
      this.c2 += (0 - this.c2) * s;
      this.flap += (1 - this.flap) * s;
    }
    if (this.mirrorPivot) this.mirrorPivot.rotation.z = -THREE.MathUtils.degToRad(this.mirrorAngle);
    if (this.flapPivot) this.flapPivot.rotation.z = this.flap * 1.9;
    this.updateCurtains();

    // Luz que llega al sensor
    let light = 1;
    if (this.cam?.pinhole) light = THREE.MathUtils.clamp(this.flap * 1.6 - 0.3, 0, 1);
    else {
      light = THREE.MathUtils.clamp(this.c1, 0, 1) * (1 - THREE.MathUtils.clamp(this.c2, 0, 1));
      if (this.cam?.mirror) light *= THREE.MathUtils.clamp(1 - this.mirrorAngle / 12, 0, 1);
    }
    this.sensorLight = light;
    if (this.imageMat) {
      const base = this.cam.film ? (this.cam.pinhole ? 0xfff0dc : 0xffd2a0) : 0xffffff;
      this.imageMat.color.setHex(base).multiplyScalar(0.06 + light * 0.94);
    }
    const lcdOn = !(this.cam?.mirror && this.mirrorDown) && !this.timeline;
    if (this.lcdMat) this.lcdMat.color.setScalar(lcdOn ? 0.9 : 0.04);
    if (this.evfMat) this.evfMat.color.setScalar(this.timeline ? 0.05 : 1);

    // Resaltado
    const pulse = 0.5 + 0.5 * Math.sin(this._time * 4);
    for (const p of this.parts.values()) {
      const sel = p.id === this.selectedId;
      const hov = p.id === this.hoverId;
      for (const m of p.mats) {
        if (sel) {
          m.emissive.setHex(0x1e6a80);
          m.emissiveIntensity = 0.5 + pulse * 0.6;
        } else if (hov) {
          m.emissive.setHex(0x2a5f7a);
          m.emissiveIntensity = 0.9;
        } else {
          m.emissive.copy(m.userData.baseEmissive);
          m.emissiveIntensity = m.userData.baseEmissiveIntensity;
        }
      }
    }
  }

  // ------------------------------------------------------------ consultas (coordenadas de mundo)
  worldPos(id, out = new THREE.Vector3()) {
    const p = this.parts.get(id);
    if (!p) return null;
    return out.copy(p.holder.position).add(this.group.position);
  }

  isPartVisible(id) {
    const p = this.parts.get(id);
    if (!p || p.decor) return false;
    if (p.shell) return !p.hidden;
    if (p.inner) return this.explodeT > 0.5 || this.xrayT > 0.5;
    return true;
  }

  /** Datos que necesita el trazado de rayos. */
  optics() {
    const cam = this.cam;
    const res = {
      pinhole: cam.pinhole,
      apertureR: cam.pinhole ? 0.012 : Math.max(0.012, this.irisR),
      sensorX: 0,
      shutterX: null,
      shutterBlocks: false,
      flapBlocks: false,
      mirror: null,
      viewfinder: null,
      imageW: this.imageW,
      imageH: this.imageH,
    };
    const sensorId = cam.pinhole ? 'filmSheet' : cam.film ? 'film' : 'sensor';
    res.sensorX = this.worldPos(sensorId).x + (this.imageSurfaceOffset ?? 0.03);
    if (cam.pinhole) {
      res.flapBlocks = this.flap < 0.45;
    } else {
      res.shutterX = this.worldPos('shutter').x + 0.04;
      res.shutterBlocks = this.c1 < 0.5 || this.c2 > 0.5;
    }
    if (cam.mirror && this.mirrorAngle > 4) {
      const th = THREE.MathUtils.degToRad(this.mirrorAngle);
      const hinge = this.worldPos('mirror').add(V(-0.495, 0.495, 0));
      const dir = V(Math.cos(th), -Math.sin(th), 0);
      res.mirror = {
        center: hinge.clone().addScaledVector(dir, 0.7),
        normal: V(Math.sin(th), Math.cos(th), 0),
        dir,
        halfLen: 0.7,
        halfW: 0.8,
      };
      const screen = this.worldPos('screen');
      const prism = this.worldPos('prism');
      const eye = this.worldPos('eyepiece');
      res.viewfinder = { screenY: screen.y, prismTop: V(prism.x - 0.1, prism.y + 0.55, 0), eye };
    }
    return res;
  }
}
