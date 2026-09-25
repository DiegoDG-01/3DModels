// Maquetas fotografiables. Capas: 0 = solo vista general, 1 = vista general + foto, 2 = solo foto.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { gradientTexture, woodTexture, checkerTexture, windowsTexture, labelTexture } from './textures.js';

export const TRAY_Y = 1.05; // superficie de la maqueta
const TRAY = { x0: 3.0, x1: 10.0, z: 1.9 };

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0, ...extra });

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function jitter(geo, amount, seed = 1) {
  // Desplaza cada vértice (compartiendo desplazamiento entre duplicados) sin mover la base.
  const r = rng(seed);
  const p = geo.attributes.position;
  geo.computeBoundingBox();
  const minY = geo.boundingBox.min.y;
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!map.has(key)) map.set(key, [(r() - 0.5) * amount, (r() - 0.5) * amount, (r() - 0.5) * amount]);
    const d = map.get(key);
    const base = Math.abs(p.getY(i) - minY) < 1e-4;
    p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + (base ? 0 : d[1]), p.getZ(i) + d[2]);
  }
  geo.computeVertexNormals();
  return geo;
}

function add(parent, geo, mat, pos, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.copy(pos);
  m.castShadow = cast;
  m.receiveShadow = receive;
  parent.add(m);
  return m;
}

/** Aplica capas: `shared` → 0+1, `photoOnly` → 2. */
function layer(obj, which) {
  obj.traverse((o) => {
    if (which === 'photo') o.layers.set(2);
    else {
      o.layers.set(0);
      o.layers.enable(1);
    }
  });
  return obj;
}

// --------------------------------------------------------------- piezas comunes
function tray(trim = 0x2b2f38) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0xffffff, map: woodTexture('#5b3d26', '#3a2616'), roughness: 0.7 });
  const trimMat = new THREE.MeshStandardMaterial({ color: trim, metalness: 0.6, roughness: 0.4 });
  const L = TRAY.x1 - TRAY.x0;
  const cx = (TRAY.x0 + TRAY.x1) / 2;
  add(g, new RoundedBoxGeometry(L + 0.2, 0.26, TRAY.z * 2 + 0.2, 2, 0.05), wood, V(cx, TRAY_Y - 0.13, 0));
  add(g, new THREE.BoxGeometry(L + 0.24, 0.05, TRAY.z * 2 + 0.24), trimMat, V(cx, TRAY_Y - 0.28, 0));
  // Patas
  for (const x of [TRAY.x0 + 0.6, TRAY.x1 - 0.6]) {
    add(g, new THREE.BoxGeometry(0.16, TRAY_Y - 0.3, 0.16), trimMat, V(x, (TRAY_Y - 0.3) / 2, -TRAY.z + 0.4));
    add(g, new THREE.BoxGeometry(0.16, TRAY_Y - 0.3, 0.16), trimMat, V(x, (TRAY_Y - 0.3) / 2, TRAY.z - 0.4));
  }
  return g;
}

function groundPlane(color, w = TRAY.x1 - TRAY.x0, d = TRAY.z * 2, seg = [28, 14], rough = 0.04, seed = 3) {
  const geo = new THREE.PlaneGeometry(w, d, seg[0], seg[1]);
  geo.rotateX(-Math.PI / 2);
  const r = rng(seed);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + r() * rough);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, flat(color));
}

function pine(h = 1.2, seed = 1, color = 0x2f7d45) {
  const g = new THREE.Group();
  const r = rng(seed);
  add(g, new THREE.CylinderGeometry(0.05 * h, 0.07 * h, 0.3 * h, 6), flat(0x5b3b24), V(0, 0.15 * h, 0));
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const rr = (0.42 - i * 0.1) * h;
    const hh = (0.5 - i * 0.06) * h;
    const c = new THREE.Color(color).offsetHSL((r() - 0.5) * 0.04, 0, (r() - 0.5) * 0.08 + i * 0.03);
    const cone = jitter(new THREE.ConeGeometry(rr, hh, 7, 1), 0.03 * h, seed * 10 + i);
    add(g, cone, flat(c), V(0, 0.28 * h + i * 0.24 * h + hh / 2, 0)).rotation.y = r() * 3;
  }
  return g;
}

function mountain(h, rad, seed, color = 0x7d8799, snow = true) {
  const g = new THREE.Group();
  const geo = jitter(new THREE.ConeGeometry(rad, h, 9, 4), rad * 0.18, seed);
  add(g, geo, flat(color), V(0, h / 2, 0));
  if (snow) {
    const sh = h * 0.34;
    const sgeo = jitter(new THREE.ConeGeometry(rad * 0.36, sh, 9, 1), rad * 0.05, seed + 7);
    add(g, sgeo, flat(0xf3f6fb), V(0, h - sh / 2 + 0.02, 0));
  }
  return g;
}

function lathe(points, mat, seg = 40) {
  const pts = points.map(([x, y]) => new THREE.Vector2(x, y));
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, seg), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ================================================================= PAISAJE
function buildLandscape() {
  const g = new THREE.Group();
  const photo = new THREE.Group();
  const cx = (TRAY.x0 + TRAY.x1) / 2;

  const ground = groundPlane(0x5e9b45);
  ground.position.set(cx, TRAY_Y, 0);
  ground.receiveShadow = true;
  g.add(ground);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 0.35).rotateX(-Math.PI / 2), flat(0xb89a6a));
  path.position.set(4.2, TRAY_Y + 0.025, 0.1);
  path.rotation.y = 0.25;
  path.receiveShadow = true;
  g.add(path);

  // Pino en primer plano
  const fgPine = pine(1.25, 3);
  fgPine.position.set(3.9, TRAY_Y, 0.55);
  g.add(fgPine);

  // Cabaña
  const cabin = new THREE.Group();
  const logs = flat(0x8a5a36);
  add(cabin, new THREE.BoxGeometry(0.62, 0.42, 0.72), logs, V(0, 0.21, 0));
  for (let i = 0; i < 5; i++) add(cabin, new THREE.BoxGeometry(0.64, 0.02, 0.74), flat(0x6d4428), V(0, 0.05 + i * 0.085, 0));
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-0.42, 0);
  roofShape.lineTo(0.42, 0);
  roofShape.lineTo(0, 0.36);
  roofShape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 0.86, bevelEnabled: false });
  roofGeo.translate(0, 0, -0.43);
  add(cabin, roofGeo, flat(0x9c3b2b), V(0, 0.42, 0));
  add(cabin, new THREE.BoxGeometry(0.1, 0.3, 0.1), flat(0x6e6a66), V(0.12, 0.72, 0.22));
  const winMat = new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb347, emissiveIntensity: 2.2 });
  for (const z of [-0.2, 0.2]) add(cabin, new THREE.PlaneGeometry(0.14, 0.12).rotateY(-Math.PI / 2), winMat, V(-0.315, 0.24, z), { cast: false });
  add(cabin, new THREE.PlaneGeometry(0.14, 0.24).rotateY(-Math.PI / 2), flat(0x4a2c18), V(-0.315, 0.12, 0), { cast: false });
  const lamp = new THREE.PointLight(0xffb45a, 0.6, 1.4, 2);
  lamp.position.set(-0.45, 0.3, 0);
  cabin.add(lamp);
  cabin.position.set(5.4, TRAY_Y, -0.15);
  g.add(cabin);

  // Más pinos
  const pines = [[4.6, -1.3, 1.0, 5], [6.3, 1.05, 1.1, 6], [7.0, -1.35, 1.35, 7], [6.7, 0.35, 0.8, 8], [7.6, 1.45, 1.4, 9], [4.9, 1.45, 0.85, 10], [3.4, -0.9, 0.7, 11], [8.0, 0.75, 1.2, 12], [6.0, -0.9, 0.75, 13]];
  for (const [x, z, h, s] of pines) {
    const p = pine(h, s, s % 2 ? 0x2c7340 : 0x3a8a4c);
    p.position.set(x, TRAY_Y, z);
    g.add(p);
  }
  // Rocas y valla
  const rock = flat(0x8d8f94);
  for (const [x, z, s] of [[3.5, 0.0, 0.14], [4.4, -0.45, 0.1], [6.0, 0.55, 0.16], [7.4, -0.4, 0.2]]) {
    add(g, jitter(new THREE.IcosahedronGeometry(s, 0), s * 0.3, x * 10), rock, V(x, TRAY_Y + s * 0.5, z));
  }
  for (let i = 0; i < 6; i++) add(g, new THREE.BoxGeometry(0.04, 0.2, 0.04), flat(0x7a5a3a), V(4.6 + i * 0.22, TRAY_Y + 0.1, 0.95));
  add(g, new THREE.BoxGeometry(1.15, 0.03, 0.03), flat(0x7a5a3a), V(5.15, TRAY_Y + 0.16, 0.95));

  // Montañas
  const m1 = mountain(2.9, 1.9, 21);
  m1.position.set(8.9, TRAY_Y, -0.2);
  g.add(m1);
  const m2 = mountain(2.2, 1.4, 33, 0x6f7a8f);
  m2.position.set(8.4, TRAY_Y, 1.35);
  g.add(m2);
  const m3 = mountain(2.5, 1.5, 44, 0x737e92);
  m3.position.set(9.3, TRAY_Y, -1.5);
  g.add(m3);

  // Solo para la foto: el mundo continúa fuera de la maqueta
  const ext = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), flat(0x5a9542));
  ext.position.set(40, TRAY_Y - 0.01, 0);
  ext.receiveShadow = true;
  photo.add(ext);
  const r = rng(99);
  for (let i = 0; i < 70; i++) {
    const side = r() < 0.5 ? -1 : 1;
    const x = 2.5 + r() * 16;
    const z = side * (TRAY.z + 0.4 + r() * 9);
    const p = pine(0.8 + r() * 1.2, 100 + i);
    p.position.set(x, TRAY_Y, z);
    photo.add(p);
  }
  for (let i = 0; i < 9; i++) {
    const mm = mountain(4 + r() * 5, 4 + r() * 3, 200 + i, 0x8995ab);
    mm.position.set(16 + r() * 10, TRAY_Y, -22 + i * 5.5 + r() * 2);
    photo.add(mm);
  }

  return {
    group: g,
    photo,
    sky: gradientTexture([[0, '#6fa6dc'], [0.55, '#cfe5f6'], [1, '#f6e7cc']]),
    ev: 11,
    light: { key: 1, hemi: 1, sun: 1.2 },
    points: {
      fg: { pos: V(3.9 - 0.2, TRAY_Y + 0.62, 0.55), label: 'el pino', name: 'Pino' },
      mid: { pos: V(5.4 - 0.33, TRAY_Y + 0.26, -0.15), label: 'la cabaña', name: 'Cabaña' },
      bg: { pos: V(8.35, TRAY_Y + 2.1, -0.2), label: 'la montaña', name: 'Montaña' },
    },
  };
}

// ================================================================= BODEGÓN
function buildStillLife() {
  const g = new THREE.Group();
  const photo = new THREE.Group();
  const cx = (TRAY.x0 + TRAY.x1) / 2;
  const tableTex = woodTexture('#a47449', '#6f4a2c');
  tableTex.repeat.set(3, 1.5);
  const table = add(g, new THREE.PlaneGeometry(TRAY.x1 - TRAY.x0, TRAY.z * 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tableTex, roughness: 0.55 }), V(cx, TRAY_Y + 0.005, 0), { cast: false });
  table.receiveShadow = true;
  // Mantel
  const cloth = new THREE.PlaneGeometry(2.6, 1.6, 30, 12).rotateX(-Math.PI / 2);
  const cp = cloth.attributes.position;
  for (let i = 0; i < cp.count; i++) cp.setY(i, Math.max(0, Math.sin(cp.getX(i) * 5) * 0.02));
  cloth.computeVertexNormals();
  add(g, cloth, new THREE.MeshStandardMaterial({ color: 0xf0ece4, roughness: 0.95, side: THREE.DoubleSide }), V(4.6, TRAY_Y + 0.012, 0.3), { cast: false });

  // Manzana (primer plano)
  const apple = new THREE.Group();
  const ag = new THREE.SphereGeometry(0.22, 24, 16);
  ag.scale(1, 0.9, 1);
  add(apple, ag, new THREE.MeshStandardMaterial({ color: 0xc0262b, roughness: 0.35 }), V(0, 0.2, 0));
  add(apple, new THREE.CylinderGeometry(0.012, 0.015, 0.12, 6), flat(0x5a3a1c), V(0.01, 0.42, 0));
  const leaf = add(apple, new THREE.SphereGeometry(0.06, 8, 6).scale(1.6, 0.25, 0.8), flat(0x4f8a2f), V(0.07, 0.43, 0.02));
  leaf.rotation.z = 0.5;
  apple.position.set(3.9, TRAY_Y, 0.4);
  g.add(apple);
  const apple2 = apple.clone();
  apple2.position.set(4.25, TRAY_Y, 0.85);
  apple2.children[0].material = new THREE.MeshStandardMaterial({ color: 0x8fb63a, roughness: 0.4 });
  g.add(apple2);

  // Botella (plano medio)
  const bottle = new THREE.Group();
  const bprof = [[0.001, 0], [0.24, 0], [0.26, 0.04], [0.26, 0.72], [0.22, 0.86], [0.1, 1.0], [0.08, 1.2], [0.09, 1.24], [0.001, 1.24]];
  const bmat = new THREE.MeshPhysicalMaterial({ color: 0x1f6b3a, roughness: 0.08, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.88 });
  bottle.add(lathe(bprof, bmat));
  const lbl = labelTexture(['VINO', 'Reserva · 2019'], { w: 512, h: 256, bg: '#efe4c9', fg: '#3b1d12', accent: '#8e1f1f', font: 'Georgia' });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.265, 0.34, 40, 1, true, Math.PI, Math.PI), new THREE.MeshStandardMaterial({ map: lbl, roughness: 0.7 }));
  band.position.y = 0.42;
  bottle.add(band);
  add(bottle, new THREE.CylinderGeometry(0.075, 0.075, 0.1, 16), flat(0xb08a5a), V(0, 1.27, 0));
  bottle.position.set(5.4, TRAY_Y, -0.2);
  g.add(bottle);
  // Copa
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.35, clearcoat: 1, side: THREE.DoubleSide });
  const cup = lathe([[0.001, 0], [0.16, 0], [0.16, 0.02], [0.02, 0.04], [0.02, 0.36], [0.14, 0.42], [0.2, 0.6], [0.19, 0.72], [0.18, 0.72], [0.19, 0.6], [0.13, 0.43], [0.001, 0.4]], glassMat);
  const cupG = new THREE.Group();
  cupG.add(cup);
  add(cupG, new THREE.CylinderGeometry(0.15, 0.13, 0.12, 24), new THREE.MeshStandardMaterial({ color: 0x6a0f1e, roughness: 0.2 }), V(0, 0.5, 0));
  cupG.position.set(5.7, TRAY_Y, 0.55);
  g.add(cupG);
  // Queso
  const cheese = new THREE.CylinderGeometry(0.28, 0.28, 0.16, 20, 1, false, 0, Math.PI * 1.6);
  add(g, cheese, flat(0xf2c14e), V(4.7, TRAY_Y + 0.08, -0.7));

  // Jarrón con flores (fondo)
  const vase = new THREE.Group();
  vase.add(lathe([[0.001, 0], [0.2, 0], [0.32, 0.25], [0.3, 0.55], [0.16, 0.8], [0.18, 0.9], [0.001, 0.9]], new THREE.MeshStandardMaterial({ color: 0x2f5fa8, roughness: 0.25, metalness: 0.1 })));
  const r = rng(7);
  const petal = [0xf5c542, 0xe8574a, 0xf2f2f2, 0xd76ab0, 0xf59a3b];
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2;
    const rr = 0.05 + r() * 0.3;
    const h = 1.5 + r() * 0.9;
    const top = V(Math.cos(a) * rr, h, Math.sin(a) * rr);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, h - 0.8, 5), flat(0x3f7a2c));
    stem.position.set(top.x / 2, 0.8 + (h - 0.8) / 2, top.z / 2);
    stem.lookAt(top.x, h, top.z);
    stem.rotateX(Math.PI / 2);
    vase.add(stem);
    add(vase, new THREE.IcosahedronGeometry(0.1 + r() * 0.05, 0), flat(petal[i % petal.length]), top);
    add(vase, new THREE.SphereGeometry(0.035, 8, 6), flat(0x5a3a10), top.clone().add(V(-0.08, 0, 0)));
  }
  vase.position.set(8.3, TRAY_Y, 0.3);
  g.add(vase);
  // Libros
  const books = [[0x7a2e2e, 0.14], [0x2e4a7a, 0.12], [0x2e6a4a, 0.16]];
  let by = TRAY_Y;
  for (const [c, h] of books) {
    add(g, new THREE.BoxGeometry(0.9, h, 0.6), flat(c), V(8.2, by + h / 2, -1.0));
    by += h;
  }
  // Telón de fondo
  const drape = new THREE.PlaneGeometry(3.9, 4.2, 60, 1);
  const dp = drape.attributes.position;
  for (let i = 0; i < dp.count; i++) dp.setZ(i, Math.sin(dp.getX(i) * 7) * 0.08);
  drape.computeVertexNormals();
  drape.rotateY(-Math.PI / 2);
  add(g, drape, new THREE.MeshStandardMaterial({ color: 0x5a1822, roughness: 0.9, side: THREE.DoubleSide }), V(9.75, TRAY_Y + 2.1, 0), { cast: false });

  const ext = new THREE.Mesh(new THREE.PlaneGeometry(100, 100).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tableTex.clone(), roughness: 0.6, color: 0xcaa27a }));
  ext.material.map.repeat.set(30, 30);
  ext.position.set(40, TRAY_Y - 0.005, 0);
  ext.receiveShadow = true;
  photo.add(ext);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(80, 30).rotateY(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3e1219, roughness: 1 }));
  wall.position.set(9.9, TRAY_Y + 10, 0);
  photo.add(wall);

  return {
    group: g,
    photo,
    sky: gradientTexture([[0, '#2a1a16'], [1, '#4a3024']]),
    ev: 10,
    light: { key: 1.1, hemi: 0.7, sun: 1.0 },
    points: {
      fg: { pos: V(3.9 - 0.2, TRAY_Y + 0.22, 0.4), label: 'la manzana', name: 'Manzana' },
      mid: { pos: V(5.4 - 0.27, TRAY_Y + 0.42, -0.2), label: 'la botella', name: 'Botella' },
      bg: { pos: V(8.3 - 0.1, TRAY_Y + 1.9, 0.3), label: 'las flores', name: 'Flores' },
    },
  };
}

// ================================================================= AJEDREZ
function chessPiece(type, white) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: white ? 0xf0e6d0 : 0x1c1a1f, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.15,
  });
  const base = [[0.001, 0], [0.2, 0], [0.2, 0.05], [0.16, 0.08], [0.17, 0.11], [0.12, 0.14]];
  const s = 1.25;
  let prof;
  const g = new THREE.Group();
  if (type === 'pawn') prof = [...base, [0.07, 0.34], [0.12, 0.36], [0.06, 0.4], [0.001, 0.4]];
  if (type === 'rook') prof = [...base, [0.1, 0.5], [0.15, 0.52], [0.15, 0.66], [0.1, 0.66], [0.1, 0.6], [0.001, 0.6]];
  if (type === 'bishop') prof = [...base, [0.06, 0.52], [0.12, 0.55], [0.06, 0.58], [0.1, 0.7], [0.001, 0.86]];
  if (type === 'queen') prof = [...base, [0.06, 0.62], [0.14, 0.66], [0.06, 0.7], [0.14, 0.86], [0.001, 0.84]];
  if (type === 'king') prof = [...base, [0.07, 0.66], [0.15, 0.7], [0.07, 0.74], [0.13, 0.9], [0.001, 0.92]];
  const m = lathe(prof.map(([x, y]) => [x * s, y * s]), mat, 32);
  g.add(m);
  if (type === 'pawn') add(g, new THREE.SphereGeometry(0.1 * s, 24, 16), mat, V(0, 0.46 * s, 0));
  if (type === 'bishop') add(g, new THREE.SphereGeometry(0.035 * s, 12, 8), mat, V(0, 0.88 * s, 0));
  if (type === 'queen') add(g, new THREE.SphereGeometry(0.05 * s, 12, 8), mat, V(0, 0.9 * s, 0));
  if (type === 'king') {
    add(g, new THREE.BoxGeometry(0.04 * s, 0.2 * s, 0.04 * s), mat, V(0, 1.0 * s, 0));
    add(g, new THREE.BoxGeometry(0.04 * s, 0.04 * s, 0.14 * s), mat, V(0, 1.03 * s, 0));
  }
  return g;
}

function buildChess() {
  const g = new THREE.Group();
  const photo = new THREE.Group();
  const cx = (TRAY.x0 + TRAY.x1) / 2;
  const ct = checkerTexture(2, '#e6d6b8', '#3b2819');
  ct.wrapS = ct.wrapT = THREE.RepeatWrapping;
  ct.repeat.set(17.5 / 2, 9.5 / 2);
  const board = add(g, new THREE.PlaneGeometry(TRAY.x1 - TRAY.x0, TRAY.z * 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: ct, roughness: 0.3, metalness: 0.05 }), V(cx, TRAY_Y + 0.005, 0), { cast: false });
  board.receiveShadow = true;

  const place = (type, white, x, z) => {
    const p = chessPiece(type, white);
    p.position.set(x, TRAY_Y, z);
    g.add(p);
    return p;
  };
  place('pawn', true, 3.9, 0.35);
  place('pawn', true, 4.3, -0.85);
  place('king', true, 5.4, -0.15);
  place('queen', false, 5.9, 0.75);
  place('bishop', true, 6.6, -1.0);
  place('pawn', false, 7.0, 0.3);
  place('rook', false, 8.3, 0.1);
  place('bishop', false, 8.7, -1.1);
  place('king', false, 9.2, 1.1);
  place('pawn', false, 7.7, 1.4);

  const ext = new THREE.Mesh(new THREE.PlaneGeometry(100, 100).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.4 }));
  ext.position.set(40, TRAY_Y - 0.005, 0);
  ext.receiveShadow = true;
  photo.add(ext);

  return {
    group: g,
    photo,
    sky: gradientTexture([[0, '#0f1117'], [0.7, '#232633'], [1, '#2b2a2f']]),
    ev: 10,
    light: { key: 1.2, hemi: 0.5, sun: 1.1 },
    points: {
      fg: { pos: V(3.9 - 0.12, TRAY_Y + 0.55, 0.35), label: 'el peón', name: 'Peón' },
      mid: { pos: V(5.4 - 0.12, TRAY_Y + 0.75, -0.15), label: 'el rey', name: 'Rey' },
      bg: { pos: V(8.3 - 0.18, TRAY_Y + 0.75, 0.1), label: 'la torre', name: 'Torre' },
    },
  };
}

// ================================================================= CIUDAD
function car(color) {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, metalness: 0.4, clearcoat: 1 });
  add(g, new RoundedBoxGeometry(0.5, 0.2, 1.1, 2, 0.06), paint, V(0, 0.17, 0));
  add(g, new RoundedBoxGeometry(0.42, 0.18, 0.6, 2, 0.06), paint, V(0, 0.34, -0.05));
  const glass = new THREE.MeshStandardMaterial({ color: 0x1b2a3a, roughness: 0.1, metalness: 0.6 });
  add(g, new THREE.BoxGeometry(0.43, 0.12, 0.5), glass, V(0, 0.35, -0.05));
  const wheel = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
  for (const [x, z] of [[-0.24, 0.35], [0.24, 0.35], [-0.24, -0.35], [0.24, -0.35]]) {
    add(g, new THREE.CylinderGeometry(0.1, 0.1, 0.08, 16).rotateZ(Math.PI / 2), wheel, V(x, 0.1, z));
  }
  const head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 3 });
  const tail = new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: 0xff2020, emissiveIntensity: 2.5 });
  for (const x of [-0.16, 0.16]) {
    add(g, new THREE.BoxGeometry(0.1, 0.05, 0.02), head, V(x, 0.2, 0.555), { cast: false });
    add(g, new THREE.BoxGeometry(0.1, 0.05, 0.02), tail, V(x, 0.2, -0.555), { cast: false });
  }
  return g;
}

function buildCity() {
  const g = new THREE.Group();
  const photo = new THREE.Group();
  const cx = (TRAY.x0 + TRAY.x1) / 2;
  add(g, new THREE.PlaneGeometry(TRAY.x1 - TRAY.x0, 2.0).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.55, metalness: 0.1 }), V(cx, TRAY_Y + 0.005, 0), { cast: false }).receiveShadow = true;
  for (let x = TRAY.x0 + 0.3; x < TRAY.x1 - 0.3; x += 0.6) add(g, new THREE.PlaneGeometry(0.3, 0.05).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe9e3c4, roughness: 0.6 }), V(x, TRAY_Y + 0.01, 0), { cast: false });
  const walk = flat(0x6c6f78);
  add(g, new THREE.BoxGeometry(TRAY.x1 - TRAY.x0, 0.08, 0.9), walk, V(cx, TRAY_Y + 0.04, 1.45));
  add(g, new THREE.BoxGeometry(TRAY.x1 - TRAY.x0, 0.08, 0.9), walk, V(cx, TRAY_Y + 0.04, -1.45));

  // Farola (primer plano)
  const lamp = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x24282f, metalness: 0.8, roughness: 0.35 });
  add(lamp, new THREE.CylinderGeometry(0.03, 0.045, 1.35, 10), metal, V(0, 0.675, 0));
  add(lamp, new THREE.BoxGeometry(0.03, 0.03, 0.3), metal, V(0, 1.33, -0.13));
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffe4b0, emissive: 0xffc070, emissiveIntensity: 5 });
  add(lamp, new THREE.SphereGeometry(0.07, 16, 12), bulbMat, V(0, 1.27, -0.28), { cast: false });
  add(lamp, new THREE.ConeGeometry(0.12, 0.1, 16, 1, true), metal, V(0, 1.33, -0.28));
  const pl = new THREE.PointLight(0xffb866, 2.5, 3.2, 1.6);
  pl.position.set(0, 1.2, -0.28);
  lamp.add(pl);
  lamp.position.set(3.9, TRAY_Y + 0.08, 1.2);
  g.add(lamp);

  const c1 = car(0xc8322b);
  c1.position.set(5.4, TRAY_Y, -0.35);
  g.add(c1);
  const c2 = car(0x2f7fd0);
  c2.position.set(7.2, TRAY_Y, 0.45);
  c2.rotation.y = Math.PI;
  g.add(c2);
  // Semáforo
  const tl = new THREE.Group();
  add(tl, new THREE.CylinderGeometry(0.025, 0.025, 0.9, 8), metal, V(0, 0.45, 0));
  add(tl, new THREE.BoxGeometry(0.1, 0.28, 0.1), metal, V(0, 1.0, 0));
  add(tl, new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshStandardMaterial({ color: 0x40ff80, emissive: 0x30ff70, emissiveIntensity: 4 }), V(-0.055, 0.92, 0), { cast: false });
  tl.position.set(6.4, TRAY_Y + 0.08, -1.2);
  g.add(tl);

  // Edificios
  const bld = [[7.9, -1.1, 0.9, 2.6, 1.0, 1], [8.1, 0.0, 1.0, 3.1, 1.0, 2], [8.3, 1.2, 0.8, 2.2, 1.1, 3], [9.3, -0.6, 0.9, 3.6, 1.2, 4], [9.4, 0.8, 0.8, 2.9, 1.2, 5]];
  for (const [x, z, w, h, d, s] of bld) {
    const t = windowsTexture(4, Math.round(h * 3), 0.5, s);
    const side = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.8 });
    const roof = flat(0x2d3140);
    const b = add(g, new THREE.BoxGeometry(w, h, d), [side, side, roof, roof, side, side], V(x, TRAY_Y + h / 2 + 0.08, z));
    b.castShadow = true;
  }
  const neon = labelTexture(['CAFÉ'], { w: 256, h: 96, bg: '#130a1e', fg: '#ff5fd0' });
  add(g, new THREE.PlaneGeometry(0.6, 0.22).rotateY(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: neon, emissiveMap: neon, emissive: 0xffffff, emissiveIntensity: 2.2 }), V(7.59, TRAY_Y + 0.9, 0.0), { cast: false });

  const ext = new THREE.Mesh(new THREE.PlaneGeometry(100, 100).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x25272c, roughness: 0.7 }));
  ext.position.set(40, TRAY_Y - 0.005, 0);
  photo.add(ext);
  const r = rng(5);
  for (let i = 0; i < 40; i++) {
    const side = i % 2 ? 1 : -1;
    const h = 2 + r() * 6;
    const w = 0.8 + r() * 1.4;
    const t = windowsTexture(4, Math.round(h * 2.5), 0.45, 50 + i);
    const m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 1.0, roughness: 0.8 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), m);
    b.position.set(2 + r() * 20, TRAY_Y + h / 2, side * (2.6 + r() * 8));
    photo.add(b);
  }
  for (let i = 0; i < 12; i++) {
    const h = 5 + r() * 9;
    const t = windowsTexture(6, Math.round(h * 2), 0.4, 90 + i);
    const m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.8 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(2, h, 2), m);
    b.position.set(13 + r() * 6, TRAY_Y + h / 2, -14 + i * 2.5);
    photo.add(b);
  }

  return {
    group: g,
    photo,
    sky: gradientTexture([[0, '#141b3a'], [0.55, '#4b3f73'], [0.85, '#c7746a'], [1, '#e9a06f']]),
    ev: 8,
    light: { key: 0.25, hemi: 0.35, sun: 0.15 },
    points: {
      fg: { pos: V(3.9, TRAY_Y + 1.35, 0.92), label: 'la farola', name: 'Farola' },
      mid: { pos: V(5.4 - 0.26, TRAY_Y + 0.25, -0.35), label: 'el coche', name: 'Coche' },
      bg: { pos: V(8.1 - 0.5, TRAY_Y + 2.2, 0.0), label: 'los edificios', name: 'Edificios' },
    },
  };
}

// ================================================================= catálogo
const BUILDERS = {
  landscape: { name: 'Cabaña y montaña', short: 'Paisaje', build: buildLandscape },
  still: { name: 'Bodegón', short: 'Bodegón', build: buildStillLife },
  chess: { name: 'Ajedrez', short: 'Ajedrez', build: buildChess },
  city: { name: 'Calle de noche', short: 'Ciudad', build: buildCity },
};
export const SUBJECT_ORDER = ['landscape', 'still', 'chess', 'city'];
export const SUBJECTS = BUILDERS;

export function buildSubject(id) {
  const def = BUILDERS[id];
  const s = def.build();
  const root = new THREE.Group();
  root.add(tray());
  root.add(s.group);
  layer(root, 'shared');
  layer(s.photo, 'photo');
  // Luces locales: afectan a ambas vistas
  root.traverse((o) => {
    if (o.isLight) {
      o.layers.enable(0);
      o.layers.enable(1);
      o.layers.enable(2);
    }
  });
  return { id, name: def.name, root, photo: s.photo, sky: s.sky, ev: s.ev, light: s.light, points: s.points };
}

export function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        for (const k of ['map', 'emissiveMap']) if (m[k]) m[k].dispose();
        m.dispose();
      }
    }
  });
}
