// Sala, banco óptico, iluminación, pantalla de resultado, galería de aperturas y plano de enfoque.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { rulerTexture, labelTexture } from './textures.js';
import { TRAY_Y } from './subjects.js';
import { UNIT_MM } from '../optics.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const BENCH = { x0: -6.2, x1: 12.4, z: 2.7 };

export function createStage(renderer, scene) {
  scene.background = new THREE.Color(0x0b0d12);
  scene.fog = new THREE.Fog(0x0b0d12, 26, 60);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const root = new THREE.Group();
  scene.add(root);

  // ------------------------------------------------ banco óptico (consola)
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1d24, metalness: 0.4, roughness: 0.55 });
  const darker = new THREE.MeshStandardMaterial({ color: 0x121419, metalness: 0.3, roughness: 0.7 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc58f48, metalness: 1, roughness: 0.32 });
  const bw = BENCH.x1 - BENCH.x0;
  const bcx = (BENCH.x0 + BENCH.x1) / 2;
  const top = new THREE.Mesh(new RoundedBoxGeometry(bw, 0.34, BENCH.z * 2, 3, 0.08), dark);
  top.position.set(bcx, -0.17, 0);
  top.receiveShadow = true;
  root.add(top);
  const body = new THREE.Mesh(new THREE.BoxGeometry(bw - 0.4, 1.6, BENCH.z * 2 - 0.4), darker);
  body.position.set(bcx, -1.1, 0);
  root.add(body);
  // Carriles
  for (const z of [-0.9, 0.9]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(bw - 0.6, 0.06, 0.12), brass);
    rail.position.set(bcx, 0.03, z);
    rail.receiveShadow = true;
    root.add(rail);
  }
  // Regla frontal
  const ruler = new THREE.Mesh(new THREE.PlaneGeometry(bw - 0.4, 0.34), new THREE.MeshStandardMaterial({ map: rulerTexture(BENCH.x0 + 0.2, BENCH.x1 - 0.2), roughness: 0.6, metalness: 0.2 }));
  ruler.rotation.x = -Math.PI / 2;
  ruler.position.set(bcx, 0.005, BENCH.z - 0.3);
  root.add(ruler);
  // Rueda de ajuste (decorativa, como en la referencia)
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.16, 40), brass);
  knob.rotation.x = Math.PI / 2;
  knob.position.set(-1.0, -0.2, BENCH.z + 0.08);
  root.add(knob);

  // ------------------------------------------------ suelo y pared
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: 0x0f1115, roughness: 0.85, metalness: 0.1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.9;
  floor.receiveShadow = true;
  root.add(floor);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x14171d, roughness: 0.95 });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(80, 24), wallMat);
  wall.position.set(3, 8, -9);
  root.add(wall);
  // Listones verticales
  for (let i = -8; i <= 14; i += 2.2) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 24, 0.06), new THREE.MeshStandardMaterial({ color: 0x1c2029, roughness: 0.8 }));
    s.position.set(i, 8, -8.95);
    root.add(s);
  }

  // ------------------------------------------------ luces
  // capa 0: solo vista general · capa 1: compartida · capa 2: solo foto
  const lights = {};
  lights.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x2a2118, 0.7);
  lights.hemi.layers.set(1);
  lights.key = new THREE.DirectionalLight(0xfff1dd, 2.2);
  lights.key.position.set(-3, 11, 7);
  lights.key.target.position.set(3.5, 1, 0);
  lights.key.castShadow = true;
  lights.key.shadow.mapSize.set(2048, 2048);
  lights.key.shadow.bias = -0.0004;
  lights.key.shadow.normalBias = 0.02;
  Object.assign(lights.key.shadow.camera, { left: -10, right: 10, top: 8, bottom: -6, near: 1, far: 30 });
  lights.key.layers.set(1);
  lights.rim = new THREE.DirectionalLight(0x7fb8ff, 1.6);
  lights.rim.position.set(6, 5, -9);
  lights.rim.layers.set(0);
  lights.fill = new THREE.DirectionalLight(0xffd4a8, 0.5);
  lights.fill.position.set(-8, 3, 4);
  lights.fill.layers.set(0);
  lights.sun = new THREE.DirectionalLight(0xfff4e0, 1.4);
  lights.sun.position.set(-4, 8, 5);
  lights.sun.target.position.set(6, 1, 0);
  lights.sun.layers.set(2);
  for (const l of Object.values(lights)) {
    root.add(l);
    if (l.target) root.add(l.target);
  }
  // Focos cenitales del estudio
  for (const x of [-3, 5.5]) {
    const spot = new THREE.SpotLight(0xffffff, 40, 16, 0.5, 0.6, 1.6);
    spot.position.set(x, 9, 3);
    spot.target.position.set(x, 0, 0);
    spot.layers.set(0);
    root.add(spot, spot.target);
  }

  // ------------------------------------------------ pantalla de resultado (detrás de la maqueta)
  const screen = new THREE.Group();
  const SW = 5.4;
  const SH = SW / 1.5;
  const bezel = new THREE.Mesh(new RoundedBoxGeometry(SW + 0.3, SH + 0.3, 0.18, 3, 0.08), new THREE.MeshStandardMaterial({ color: 0x15181e, metalness: 0.5, roughness: 0.4 }));
  screen.add(bezel);
  const screenMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), screenMat);
  panel.position.z = 0.095;
  screen.add(panel);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x5ce1e6, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(SW + 0.5, SH + 0.5), glowMat);
  glow.position.z = -0.1;
  screen.add(glow);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.5, 16), dark);
  post.position.y = -SH / 2 - 2.2;
  screen.add(post);
  const title = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.28), new THREE.MeshBasicMaterial({ map: labelTexture(['RESULTADO · FOTO'], { w: 1024, h: 128, bg: '#0d1016', fg: '#5ce1e6' }), toneMapped: false }));
  title.position.set(-SW / 2 + 1.1, SH / 2 + 0.34, 0.02);
  screen.add(title);
  // Detrás de la maqueta, mirando al espectador: la foto queda justo detrás de los objetos 3D
  screen.position.set(7.2, TRAY_Y + SH / 2 + 1.1, -3.3);
  screen.rotation.y = -0.12;
  screen.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  root.add(screen);

  // ------------------------------------------------ galería de aperturas en la pared
  const gallery = [];
  const galleryGroup = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const fr = new THREE.Group();
    const w = 3.3;
    const h = w / 1.5;
    fr.add(new THREE.Mesh(new RoundedBoxGeometry(w + 0.28, h + 0.28, 0.14, 3, 0.06), new THREE.MeshStandardMaterial({ color: 0x1b1f27, metalness: 0.6, roughness: 0.35 })));
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    pic.position.z = 0.075;
    fr.add(pic);
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.6, h + 0.6), new THREE.MeshBasicMaterial({ color: 0x3aa8ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
    edge.position.z = -0.08;
    fr.add(edge);
    fr.position.set(-5.4 + i * 4.1, 6.4, -8.8);
    galleryGroup.add(fr);
    gallery.push({ group: fr, mat, anchor: V(fr.position.x, fr.position.y - h / 2 - 0.45, fr.position.z) });
  }
  root.add(galleryGroup);

  // ------------------------------------------------ plano de enfoque y zona nítida
  const focus = new THREE.Group();
  const PH = 3.6;
  const PW = 4.0;
  const planeMat = new THREE.MeshBasicMaterial({ color: 0x5ce1e6, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH).rotateY(Math.PI / 2), planeMat);
  plane.renderOrder = 4;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(PW, PH).rotateY(Math.PI / 2)), new THREE.LineBasicMaterial({ color: 0x9ff6ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  const planeGroup = new THREE.Group();
  planeGroup.add(plane, edges);
  // Línea de escaneo
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(PW, 0.04).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xbffbff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  planeGroup.add(scan);
  planeGroup.position.y = TRAY_Y + PH / 2;
  focus.add(planeGroup);
  const slabMat = new THREE.MeshBasicMaterial({ color: 0x5ce1e6, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1, PH, PW), slabMat);
  slab.position.y = TRAY_Y + PH / 2;
  slab.renderOrder = 3;
  focus.add(slab);
  const slabEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, PH, PW)), new THREE.LineBasicMaterial({ color: 0x5ce1e6, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  slabEdges.position.copy(slab.position);
  focus.add(slabEdges);
  root.add(focus);

  const focusApi = {
    group: focus,
    planeAnchor: V(),
    slabAnchor: V(),
    /** near/far/focus en mm; allSharp para la estenopeica. */
    update(focusMm, near, far, time, allSharp = false) {
      const x = focusMm / UNIT_MM;
      planeGroup.visible = !allSharp;
      planeGroup.position.x = x;
      scan.position.y = Math.sin(time * 1.3) * PH * 0.45;
      let x0 = allSharp ? 2.9 : Math.max(2.4, near / UNIT_MM);
      let x1 = allSharp ? 10.1 : Math.min(isFinite(far) ? far / UNIT_MM : 30, 30);
      if (x1 - x0 < 0.01) x1 = x0 + 0.01;
      slab.scale.x = x1 - x0;
      slab.position.x = (x0 + x1) / 2;
      slabEdges.scale.x = x1 - x0;
      slabEdges.position.x = slab.position.x;
      this.planeAnchor.set(x, TRAY_Y + PH + 0.25, 0);
      this.slabAnchor.set(allSharp ? 6.5 : x, TRAY_Y + 0.08, PW / 2 + 0.25);
    },
  };

  return {
    root,
    lights,
    screenMat,
    screen,
    gallery,
    focus: focusApi,
    setSubjectLighting(l) {
      lights.hemi.intensity = 0.7 * l.hemi;
      lights.key.intensity = 2.2 * l.key;
      lights.sun.intensity = 1.4 * l.sun;
    },
  };
}
