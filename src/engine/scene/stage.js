// Taller: suelo, soporte del motor, luces y pantalla del banco de potencia.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { labelTexture } from '../../shared/textures.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const FLOOR_Y = -2.7;

export function createStage(renderer, scene) {
  scene.background = new THREE.Color(0x0c0d10);
  scene.fog = new THREE.Fog(0x0c0d10, 24, 55);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;

  const root = new THREE.Group();
  scene.add(root);

  // Suelo de taller con cuadrícula
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.8, metalness: 0.15 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.receiveShadow = true;
  root.add(floor);
  const grid = new THREE.GridHelper(40, 40, 0x2a2e36, 0x1c1f25);
  grid.position.y = FLOOR_Y + 0.005;
  root.add(grid);
  // Zona pintada bajo el motor
  const pad = new THREE.Mesh(new THREE.RingGeometry(5.6, 5.75, 96), new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.35 }));
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(-0.6, FLOOR_Y + 0.01, 0.2);
  root.add(pad);

  const wall = new THREE.Mesh(new THREE.PlaneGeometry(80, 26), new THREE.MeshStandardMaterial({ color: 0x131519, roughness: 0.95 }));
  wall.position.set(0, 8, -7.5);
  root.add(wall);

  // Soporte giratorio de motor (rojo de taller) atornillado detrás del bloque
  const red = new THREE.MeshStandardMaterial({ color: 0xb4231c, metalness: 0.5, roughness: 0.45 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x7c828a, metalness: 0.9, roughness: 0.35 });
  const stand = new THREE.Group();
  const sx = 4.35;
  stand.add(mesh(new THREE.BoxGeometry(0.28, -FLOOR_Y + 0.1, 0.28), red, V(sx, FLOOR_Y / 2 + 0.05, 0)));
  stand.add(mesh(new THREE.BoxGeometry(2.4, 0.2, 0.28), red, V(sx - 0.2, FLOOR_Y + 0.2, 0)));
  stand.add(mesh(new THREE.BoxGeometry(0.28, 0.2, 3.0), red, V(sx, FLOOR_Y + 0.2, 0)));
  stand.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 24).rotateZ(Math.PI / 2), steel, V(sx - 0.3, 0.05, 0)));
  for (const [y, z] of [[0.9, 0.7], [0.9, -0.7], [-0.6, 0.7], [-0.6, -0.7]]) {
    const arm = mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), steel, V(sx - 0.8, y * 0.55, z * 0.6));
    root.add(arm);
  }
  for (const [x, z] of [[sx - 1.3, 0], [sx + 0.8, 0], [sx, 1.4], [sx, -1.4]]) {
    stand.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 16), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }), V(x, FLOOR_Y + 0.06, z)));
  }
  root.add(stand);

  // Luces
  const hemi = new THREE.HemisphereLight(0xd9e6ff, 0x2a241c, 0.55);
  const key = new THREE.DirectionalLight(0xfff0dc, 2.4);
  key.position.set(-6, 12, 9);
  key.target.position.set(0, 0.5, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  Object.assign(key.shadow.camera, { left: -9, right: 9, top: 8, bottom: -6, near: 1, far: 35 });
  const rim = new THREE.DirectionalLight(0xffd2b0, 1.1);
  rim.position.set(7, 5, -8);
  const fill = new THREE.DirectionalLight(0x8fb8ff, 0.6);
  fill.position.set(-9, 3, -3);
  root.add(hemi, key, key.target, rim, fill);
  for (const x of [-3.5, 2.5]) {
    const spot = new THREE.SpotLight(0xffffff, 45, 16, 0.55, 0.6, 1.6);
    spot.position.set(x, 9, 3.5);
    spot.target.position.set(x, 0, 0);
    root.add(spot, spot.target);
  }

  // Pantalla del banco de potencia (detrás del motor)
  const screen = new THREE.Group();
  const W = 7.2;
  const H = W / 1.6;
  screen.add(mesh(new RoundedBoxGeometry(W + 0.3, H + 0.3, 0.18, 3, 0.08), new THREE.MeshStandardMaterial({ color: 0x15181e, metalness: 0.5, roughness: 0.4 }), V()));
  const screenMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(W, H), screenMat);
  panel.position.z = 0.095;
  screen.add(panel);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.6, H + 0.6), new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.position.z = -0.1;
  screen.add(halo);
  const title = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.3), new THREE.MeshBasicMaterial({ map: labelTexture(['BANCO DE POTENCIA'], { w: 1024, h: 110, bg: '#0d1016', fg: '#ff8a3d' }), toneMapped: false }));
  title.position.set(-W / 2 + 1.4, H / 2 + 0.36, 0.02);
  screen.add(title);
  screen.position.set(2.6, 4.4, -5.6);
  root.add(screen);

  return { root, screenMat, hemi, key };
}

function mesh(geo, mat, pos) {
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(pos);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
