import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

import {
  STOPS, SHUTTERS, ISOS, UNIT_MM, depthOfField, blurDisc, exposureOffset, autoShutter,
  formatShutter, formatF, formatDistance, formatDisc, nearestIndex,
} from './optics.js';
import { CAMERAS, CAMERA_ORDER, LENSES } from './data/cameras.js';
import { PARTS } from './data/parts.js';
import { CameraRig, AXIS_Y } from './scene/cameraRig.js';
import { buildSubject, disposeObject, SUBJECTS, SUBJECT_ORDER } from './scene/subjects.js';
import { RayViz, POINT_KEYS } from './scene/rays.js';
import { createStage } from './scene/stage.js';
import { PhotoPipeline } from './render/photo.js';
import { ShutterSound } from './ui/sound.js';
import { mountLabNav } from '../shared/labnav.js';

const $ = (id) => document.getElementById(id);
const app = $('app');

// =================================================================== estado
const state = {
  cameraId: 'dslr',
  lensF: 50,
  subjectId: 'landscape',
  focusMm: 540,
  focusKey: 'mid',
  N: 2,
  shutter: 1 / 60,
  iso: 100,
  mode: 'A',
  exploded: true,
  xray: false,
  rays: true,
  labels: true,
  plane: true,
  tripod: false,
  mirrorDown: false,
  selected: null,
};
const BASE_GAIN = 1.0;
const FOCUS_MIN = 200;
const FOCUS_MAX = 1600;

// =================================================================== three
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
app.prepend(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.className = 'label-layer';
renderer.domElement.after(labelRenderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 200);
camera.layers.enable(1);
const PORTRAIT = window.innerWidth / window.innerHeight < 1;
const HOME = PORTRAIT
  ? { pos: new THREE.Vector3(1.5, 9.5, 24), target: new THREE.Vector3(2.8, 1.2, 0) }
  : { pos: new THREE.Vector3(1.2, 6.6, 16.8), target: new THREE.Vector3(3.3, 2.1, 0) };
if (window.innerWidth < 640) state.labels = false;
camera.position.copy(HOME.pos);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(HOME.target);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2;
controls.maxDistance = 32;
controls.maxPolarAngle = Math.PI * 0.53;
controls.update();

const stage = createStage(renderer, scene);
const photo = new PhotoPipeline(renderer, scene);
stage.screenMat.map = photo.rtPhoto.texture;
stage.screenMat.needsUpdate = true;
const galleryTargets = stage.gallery.map(() => photo.makeTarget(360, 240));
stage.gallery.forEach((g, i) => { g.mat.map = galleryTargets[i].texture; g.mat.needsUpdate = true; });

const rig = new CameraRig();
scene.add(rig.group);
const rays = new RayViz(scene);
const sound = new ShutterSound();

let subject = null;

// Vista previa (inserto HUD) dibujada con scissor sobre el mismo canvas
const insetScene = new THREE.Scene();
const insetCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const insetQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: photo.rtPhoto.texture, toneMapped: false }));
insetScene.add(insetQuad);

// =================================================================== etiquetas 3D
function tag(html, cls = '') {
  const el = document.createElement('div');
  el.className = `tag ${cls}`;
  el.innerHTML = html;
  const obj = new CSS2DObject(el);
  obj.center.set(0.5, 1);
  return obj;
}
let partTags = [];
const planeTag = tag('Plano de enfoque · <b>54 cm</b>', 'plane');
const slabTag = tag('Zona nítida · <b>1.5 cm</b>', 'plane');
scene.add(planeTag, slabTag);
const pointTags = {};
for (const k of POINT_KEYS) {
  pointTags[k] = tag('', `point ${k}`);
  pointTags[k].center.set(0.5, 1.4);
  scene.add(pointTags[k]);
}
const galleryTags = stage.gallery.map((g) => {
  const t = tag('', 'wall');
  t.position.copy(g.anchor);
  scene.add(t);
  return t;
});

function buildPartTags() {
  for (const t of partTags) {
    t.parent?.remove(t);
    t.element.remove();
  }
  partTags = [];
  for (const p of rig.parts.values()) {
    if (p.decor) continue;
    const info = PARTS[p.id];
    if (!info) continue;
    const t = tag(`${info.name} <small>${info.hint ?? ''}</small>`, info.drag ? 'drag' : '');
    t.position.copy(p.label);
    t.userData.partId = p.id;
    t.element.addEventListener('pointerdown', (e) => e.stopPropagation());
    t.element.addEventListener('click', (e) => {
      e.stopPropagation();
      selectPart(p.id, true);
    });
    t.element.addEventListener('mouseenter', () => rig.setHover(p.id));
    t.element.addEventListener('mouseleave', () => rig.setHover(null));
    p.holder.add(t);
    partTags.push(t);
  }
}

// =================================================================== derivados
function derived() {
  const cam = CAMERAS[state.cameraId];
  const lens = LENSES[state.lensF];
  const f = state.lensF;
  const N = cam.pinhole ? cam.fixedN : state.N;
  const iso = cam.isoFixed ?? state.iso;
  const dof = cam.pinhole ? { near: 0, far: Infinity, total: Infinity } : depthOfField(f, N, cam.coc, state.focusMm);
  const ev = exposureOffset(N, state.shutter, iso, subject?.ev ?? 11);
  const crop = 36 / cam.sensor.w;
  const handLimit = 1 / (f * crop);
  const tripod = state.tripod || cam.pinhole;
  let shake = 0;
  if (!tripod && state.shutter > handLimit * 1.01) shake = Math.min(46, 4 + 7 * Math.log2(state.shutter / handLimit));
  const fovV = THREE.MathUtils.radToDeg(2 * Math.atan(cam.sensor.h / 2 / f));
  const points = {};
  for (const k of POINT_KEYS) {
    const p = subject?.points[k];
    if (!p) continue;
    const u = p.pos.x * UNIT_MM;
    const disc = cam.pinhole ? 0.3 * (1 + 50 / u) : blurDisc(f, N, state.focusMm, u);
    points[k] = { ...p, u, disc, sharp: cam.pinhole ? true : disc <= cam.coc };
  }
  return {
    cam, lens, f, N, iso, dof, ev, shake, tripod, fovV, points,
    lightPct: Math.round((1.4 * 1.4) / (N * N) * 1000) / 10,
    extensionMm: (f * state.focusMm) / (state.focusMm - f) - f,
    state,
  };
}
let D = null;

// =================================================================== cambios de estado
let photoDirty = true;
let galleryDirtyAt = 0;
let hudDirty = true;

function recompute({ gallery = false } = {}) {
  const cam = CAMERAS[state.cameraId];
  if (state.mode === 'A' || cam.pinhole) {
    const N = cam.pinhole ? cam.fixedN : state.N;
    state.shutter = autoShutter(N, cam.isoFixed ?? state.iso, subject?.ev ?? 11);
  }
  D = derived();
  const irisR = cam.pinhole ? 0.012 : 0.62 * (1.4 / D.N);
  rig.setTargets({ exploded: state.exploded, xray: state.xray, irisR, focusMm: state.focusMm, f: D.f, mirrorDown: state.mirrorDown });
  rig.setApertureIndex(STOPS.indexOf(state.N));
  rig.setSelected(state.selected);
  rays.setVisible(state.rays);
  photoDirty = true;
  hudDirty = true;
  if (gallery) galleryDirtyAt = performance.now() + 250;
}

function setCamera(id) {
  const cam = CAMERAS[id];
  state.cameraId = id;
  if (!cam.lenses.includes(state.lensF)) state.lensF = cam.defaultLens;
  if (id === 'pinhole') state.lensF = 50;
  if (cam.isoFixed) state.iso = cam.isoFixed;
  state.mirrorDown = false;
  const lens = LENSES[state.lensF];
  if (state.N < lens.maxN) state.N = lens.maxN;
  rig.build(cam, photo.rtPhoto.texture);
  if (!cam.pinhole) rig.setLensLabel(lens.f, lens.maxN);
  if (state.selected && !rig.parts.has(state.selected)) state.selected = null;
  buildPartTags();
  buildPartsBar();
  buildControls();
  recompute({ gallery: true });
  if (state.selected) showPart(state.selected);
  else hidePart();
}

function setLens(f) {
  state.lensF = f;
  const lens = LENSES[f];
  if (state.N < lens.maxN) state.N = lens.maxN;
  rig.setLensLabel(lens.f, lens.maxN);
  buildControls();
  recompute({ gallery: true });
}

function setSubject(id) {
  if (subject) {
    scene.remove(subject.root, subject.photo);
    disposeObject(subject.root);
    disposeObject(subject.photo);
  }
  subject = buildSubject(id);
  state.subjectId = id;
  scene.add(subject.root, subject.photo);
  stage.setSubjectLighting(subject.light);
  focusOn(state.focusKey ?? 'mid', false);
  buildControls();
  recompute({ gallery: true });
}

function focusOn(key, rebuild = true) {
  const p = subject.points[key];
  state.focusKey = key;
  state.focusMm = Math.round(p.pos.x * UNIT_MM);
  if (rebuild) {
    syncControls();
    recompute({ gallery: true });
  }
}

function setFocusMm(mm) {
  state.focusMm = THREE.MathUtils.clamp(mm, FOCUS_MIN, FOCUS_MAX);
  state.focusKey = null;
  for (const k of POINT_KEYS) if (Math.abs(subject.points[k].pos.x * UNIT_MM - state.focusMm) < 4) state.focusKey = k;
  syncControls();
  recompute({ gallery: true });
}

function stepAperture(dir) {
  const cam = CAMERAS[state.cameraId];
  if (cam.pinhole) return;
  const lens = LENSES[state.lensF];
  let i = STOPS.indexOf(state.N) + dir;
  i = THREE.MathUtils.clamp(i, STOPS.indexOf(lens.maxN), STOPS.length - 1);
  state.N = STOPS[i];
  syncControls();
  recompute();
}

// =================================================================== controles
function buttons(container, items, onClick) {
  container.innerHTML = '';
  for (const it of items) {
    const b = document.createElement('button');
    b.innerHTML = it.html;
    if (it.title) b.title = it.title;
    b.disabled = !!it.disabled;
    b.dataset.key = it.key;
    b.addEventListener('click', () => onClick(it.key));
    container.append(b);
  }
}

function buildControls() {
  const cam = CAMERAS[state.cameraId];
  buttons($('camButtons'), CAMERA_ORDER.map((id) => ({ key: id, html: `${CAMERAS[id].short}<small>${CAMERAS[id].tag.split(' · ')[0]}</small>`, title: CAMERAS[id].name })), (id) => setCamera(id));
  buttons($('lensButtons'), [24, 35, 50, 85, 135].map((f) => ({ key: f, html: `${f}<small>mm</small>`, disabled: !cam.lenses.includes(f), title: LENSES[f].name })), (f) => setLens(+f));
  buttons($('subjectButtons'), SUBJECT_ORDER.map((id) => ({ key: id, html: SUBJECTS[id].short, title: SUBJECTS[id].name })), (id) => setSubject(id));
  const lens = LENSES[state.lensF];
  const ticks = $('apertureTicks');
  ticks.innerHTML = STOPS.map((s) => `<span>${s}</span>`).join('');
  $('apertureSlider').min = STOPS.indexOf(lens.maxN);
  syncControls();
}

function syncControls() {
  const cam = CAMERAS[state.cameraId];
  const lens = LENSES[state.lensF];
  const mark = (id, key) => {
    for (const b of $(id).children) b.classList.toggle('on', String(b.dataset.key ?? '') === String(key));
  };
  mark('camButtons', state.cameraId);
  mark('lensButtons', state.lensF);
  mark('subjectButtons', state.subjectId);
  $('camDesc').textContent = cam.desc;
  $('lensName').textContent = cam.pinhole ? '· sin lente (agujero)' : `· ${lens.name.toLowerCase()} · máx. ${formatF(lens.maxN)}`;
  for (const b of $('focusButtons').children) {
    b.classList.toggle('on', b.dataset.focus === state.focusKey);
    b.disabled = cam.pinhole;
    const p = subject?.points[b.dataset.focus];
    if (p) b.innerHTML = `${p.name}<small>${formatDistance(p.pos.x * UNIT_MM)}</small>`;
  }
  const fs = $('focusSlider');
  fs.value = Math.round((Math.log(state.focusMm / FOCUS_MIN) / Math.log(FOCUS_MAX / FOCUS_MIN)) * 1000);
  fs.disabled = cam.pinhole;
  $('focusVal').textContent = cam.pinhole ? 'no hay' : formatDistance(state.focusMm);
  const as = $('apertureSlider');
  as.value = STOPS.indexOf(state.N);
  as.disabled = cam.pinhole;
  const N = cam.pinhole ? cam.fixedN : state.N;
  $('apertureVal').textContent = formatF(N);
  drawIris(cam.pinhole ? 0.04 : 1.4 / N);
  for (const b of $('modeButtons').children) {
    b.classList.toggle('on', b.dataset.mode === (cam.pinhole ? 'A' : state.mode));
    b.disabled = cam.pinhole;
  }
  const ss = $('shutterSlider');
  ss.value = SHUTTERS.indexOf(state.shutter);
  ss.disabled = state.mode === 'A' || cam.pinhole;
  $('shutterVal').textContent = formatShutter(state.shutter);
  const is = $('isoSlider');
  is.value = ISOS.indexOf(cam.isoFixed ?? state.iso);
  is.disabled = !!cam.isoFixed;
  $('isoVal').textContent = cam.isoFixed ? `${cam.isoFixed}·fijo` : state.iso;
  for (const b of $('explodeButtons').children) b.classList.toggle('on', b.dataset.explode === (state.exploded ? '1' : '0'));
  $('tRays').checked = state.rays;
  $('tXray').checked = state.xray;
  $('tLabels').checked = state.labels;
  $('tTripod').checked = state.tripod || cam.pinhole;
  $('tTripod').disabled = cam.pinhole;
  $('tPlane').checked = state.plane;
  $('mirrorToggle').style.display = cam.mirror ? '' : 'none';
  $('tMirror').checked = state.mirrorDown;
}

function drawIris(frac) {
  const n = 9;
  const r = 44 * Math.max(0.05, Math.min(1, frac));
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3;
    pts.push(`${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`);
  }
  $('irisPoly').setAttribute('points', pts.join(' '));
}

function wireControls() {
  for (const b of $('focusButtons').children) b.addEventListener('click', () => focusOn(b.dataset.focus));
  $('focusSlider').addEventListener('input', (e) => {
    setFocusMm(FOCUS_MIN * Math.pow(FOCUS_MAX / FOCUS_MIN, e.target.value / 1000));
  });
  $('apertureSlider').addEventListener('input', (e) => {
    state.N = STOPS[+e.target.value];
    syncControls();
    recompute();
  });
  for (const b of $('modeButtons').children) {
    b.addEventListener('click', () => {
      state.mode = b.dataset.mode;
      recompute();
      syncControls();
    });
  }
  $('shutterSlider').addEventListener('input', (e) => {
    state.shutter = SHUTTERS[+e.target.value];
    recompute();
    syncControls();
  });
  $('isoSlider').addEventListener('input', (e) => {
    state.iso = ISOS[+e.target.value];
    recompute();
    syncControls();
  });
  for (const b of $('explodeButtons').children) {
    b.addEventListener('click', () => {
      state.exploded = b.dataset.explode === '1';
      recompute();
      syncControls();
    });
  }
  const toggle = (id, key) => $(id).addEventListener('change', (e) => {
    state[key] = e.target.checked;
    recompute();
    syncControls();
  });
  toggle('tRays', 'rays');
  toggle('tXray', 'xray');
  toggle('tLabels', 'labels');
  toggle('tTripod', 'tripod');
  toggle('tMirror', 'mirrorDown');
  toggle('tPlane', 'plane');
  $('resetView').addEventListener('click', () => {
    selectPart(null);
    fly(HOME.pos, HOME.target);
  });
  $('helpBtn').addEventListener('click', () => $('help').showModal());
  $('helpClose').addEventListener('click', () => $('help').close());
  $('shootBtn').addEventListener('click', shoot);
  $('partClose').addEventListener('click', () => selectPart(null));
  $('lbClose').addEventListener('click', () => $('lightbox').close());
  $('brandCollapse').addEventListener('click', () => {
    $('brand').classList.toggle('min');
    $('brandCollapse').textContent = $('brand').classList.contains('min') ? '+' : '–';
  });
  $('controlsCollapse').addEventListener('click', () => {
    $('controls').classList.toggle('min');
    $('controlsCollapse').textContent = $('controls').classList.contains('min') ? '+' : '–';
  });
  $('menuBtn').addEventListener('click', () => $('controls').classList.toggle('open'));
}

// =================================================================== piezas
function buildPartsBar() {
  const bar = $('partsBar');
  bar.innerHTML = '<span class="lbl">PIEZAS</span>';
  for (const p of rig.parts.values()) {
    if (p.decor || !PARTS[p.id]) continue;
    const b = document.createElement('button');
    b.textContent = PARTS[p.id].name;
    b.dataset.part = p.id;
    b.addEventListener('click', () => selectPart(p.id, true));
    bar.append(b);
  }
}

function selectPart(id, flyTo = false) {
  state.selected = id;
  rig.setSelected(id);
  for (const b of $('partsBar').querySelectorAll('button')) b.classList.toggle('on', b.dataset.part === id);
  for (const t of partTags) t.element.classList.toggle('on', t.userData.partId === id);
  if (!id) {
    hidePart();
    return;
  }
  const p = rig.parts.get(id);
  // Si la pieza está oculta dentro del cuerpo, despiezamos para verla
  if (p.inner && !state.exploded && !state.xray) {
    state.exploded = true;
    recompute();
    syncControls();
  }
  showPart(id);
  if (flyTo) {
    setTimeout(() => {
      const target = rig.worldPos(id);
      const dir = camera.position.clone().sub(controls.target).normalize();
      dir.z = Math.max(dir.z, 0.55);
      dir.y = THREE.MathUtils.clamp(dir.y, 0.2, 0.6);
      dir.normalize();
      const dist = 4.2 + (p.radius ?? 1) * 2.4;
      fly(target.clone().addScaledVector(dir, dist), target);
    }, p.inner && !state.exploded ? 350 : 0);
  }
}

function showPart(id) {
  const info = PARTS[id];
  if (!info) return;
  $('partCard').hidden = false;
  $('explainCard').hidden = true;
  $('partGroup').textContent = info.group;
  $('partName').textContent = info.name;
  $('partWhat').textContent = info.what;
  $('partLight').textContent = info.light;
  $('partLive').textContent = info.live && D ? info.live(D) : '';
  const act = $('partActions');
  act.innerHTML = '';
  for (const a of info.actions ?? []) {
    const b = document.createElement('button');
    b.className = 'ghost';
    b.textContent = a.label;
    b.addEventListener('click', () => runAction(a.action));
    act.append(b);
  }
}

function hidePart() {
  $('partCard').hidden = true;
  $('explainCard').hidden = false;
}

function runAction(action) {
  const [kind, arg] = action.split(':');
  if (kind === 'focus') focusOn(arg);
  if (kind === 'aperture') stepAperture(+arg);
  if (kind === 'mirror') {
    state.mirrorDown = !state.mirrorDown;
    recompute();
    syncControls();
  }
  if (kind === 'xray') {
    state.xray = !state.xray;
    recompute();
    syncControls();
  }
  if (kind === 'shoot') shoot();
}

// =================================================================== vuelo de cámara
let flight = null;
function fly(pos, target, dur = 0.9) {
  flight = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), t: 0, dur };
}
function updateFlight(dt) {
  if (!flight) return;
  flight.t += dt / flight.dur;
  const k = Math.min(1, flight.t);
  const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  camera.position.lerpVectors(flight.p0, flight.p1, e);
  controls.target.lerpVectors(flight.t0, flight.t1, e);
  if (k >= 1) flight = null;
}
controls.addEventListener('start', () => { flight = null; });

// =================================================================== puntero
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerMoved = false;
let pointerClient = { x: 0, y: 0 };
let drag = null;

function pick() {
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(rig.pickables, false);
  for (const h of hits) {
    const id = h.object.userData.partId;
    if (!id || !rig.isPartVisible(id)) continue;
    let o = h.object;
    let visible = true;
    while (o) {
      if (!o.visible) visible = false;
      o = o.parent;
    }
    if (visible) return id;
  }
  return null;
}

renderer.domElement.addEventListener('pointermove', (e) => {
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  pointerClient = { x: e.clientX, y: e.clientY };
  pointerMoved = true;
  if (drag) {
    const dy = e.clientY - drag.y;
    drag.moved += Math.abs(e.movementY) + Math.abs(e.movementX);
    if (drag.id === 'focusRing') {
      setFocusMm(drag.startFocus * Math.exp(dy * 0.006));
    } else if (drag.id === 'apertureRing') {
      const steps = Math.trunc(dy / 26);
      if (steps !== drag.steps) {
        stepAperture(steps - drag.steps);
        drag.steps = steps;
      }
    }
  }
});

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const id = pick();
  const down = { x: e.clientX, y: e.clientY, id, moved: 0, steps: 0, startFocus: state.focusMm };
  if (id && PARTS[id]?.drag) {
    drag = down;
    controls.enabled = false;
    renderer.domElement.setPointerCapture(e.pointerId);
  } else {
    drag = null;
    clickCandidate = down;
  }
});
let clickCandidate = null;
renderer.domElement.addEventListener('pointerup', (e) => {
  if (drag) {
    if (drag.moved < 4) selectPart(drag.id, false);
    drag = null;
    controls.enabled = true;
    renderer.domElement.releasePointerCapture(e.pointerId);
    return;
  }
  if (clickCandidate && Math.hypot(e.clientX - clickCandidate.x, e.clientY - clickCandidate.y) < 5) {
    selectPart(clickCandidate.id, false);
  }
  clickCandidate = null;
});
renderer.domElement.addEventListener('pointerleave', () => {
  rig.setHover(null);
  $('tooltip').classList.remove('show');
});

function updateHover() {
  if (!pointerMoved || drag) return;
  pointerMoved = false;
  const id = pick();
  rig.setHover(id);
  const tip = $('tooltip');
  if (id && PARTS[id]) {
    tip.innerHTML = `${PARTS[id].name}<small>${PARTS[id].drag ? '↕ arrastra para girarlo · clic para info' : 'clic para ver qué hace'}</small>`;
    tip.style.left = `${pointerClient.x}px`;
    tip.style.top = `${pointerClient.y}px`;
    tip.classList.add('show');
    renderer.domElement.style.cursor = PARTS[id].drag ? 'ns-resize' : 'pointer';
  } else {
    tip.classList.remove('show');
    renderer.domElement.style.cursor = '';
  }
}

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'range') return;
  if (document.querySelector('dialog[open]')) return;
  const k = e.key.toLowerCase();
  if (k === '1') focusOn('fg');
  else if (k === '2') focusOn('mid');
  else if (k === '3') focusOn('bg');
  else if (k === 'arrowleft') stepAperture(-1);
  else if (k === 'arrowright') stepAperture(1);
  else if (k === 'e') runToggle('exploded');
  else if (k === 'x') runToggle('xray');
  else if (k === 'r') runToggle('rays');
  else if (k === 'l') runToggle('labels');
  else if (k === ' ') {
    e.preventDefault();
    shoot();
  } else if (k === 'escape') selectPart(null);
  else return;
  if (k.startsWith('arrow')) e.preventDefault();
});
function runToggle(key) {
  state[key] = !state[key];
  recompute();
  syncControls();
}

// =================================================================== disparo
const roll = [];
function shoot() {
  if (rig.busy) return;
  const t = state.shutter;
  const hold = THREE.MathUtils.clamp(0.15 + (0.5 * Math.log10(1 + t * 1000)) / 1.2, 0.15, 2.2);
  sound.resume();
  $('shootBtn').classList.add('busy');
  $('insetHint').textContent = `Exponiendo ${formatShutter(t)}…`;
  sound.click(0.9);
  rig.shoot({
    hold,
    onExpose: () => {
      capture();
      sound.click(0.7);
      $('flash').classList.remove('go');
      void $('flash').offsetWidth;
      $('flash').classList.add('go');
    },
    onDone: () => {
      $('shootBtn').classList.remove('busy');
      hudDirty = true;
    },
  });
}

function capture() {
  renderPhoto();
  const full = photo.toCanvas(photo.rtPhoto);
  const url = full.toDataURL('image/jpeg', 0.92);
  const meta = `${D.cam.short} · ${D.f} mm · ${formatF(D.N)} · ${formatShutter(state.shutter)} · ISO ${D.iso} · enfoque ${D.cam.pinhole ? '—' : formatDistance(state.focusMm)}`;
  roll.unshift({ url, meta });
  const r = $('roll');
  r.querySelector('.roll-empty')?.remove();
  const img = document.createElement('img');
  img.src = url;
  img.title = meta;
  img.className = 'new';
  img.addEventListener('click', () => {
    $('lbImg').src = url;
    $('lbMeta').textContent = meta;
    $('lbDownload').href = url;
    $('lbDownload').download = `camara3d-${Date.now()}.jpg`;
    $('lightbox').showModal();
  });
  r.prepend(img);
  while (r.children.length > 12) r.lastChild.remove();
}

// =================================================================== foto
function photoParams(overrides = {}) {
  const cam = D.cam;
  const evOff = THREE.MathUtils.clamp(D.ev, -7, 7);
  let noise;
  if (cam.film) noise = cam.pinhole ? 0.022 : 0.05;
  else noise = Math.max(0, 0.02 * Math.sqrt(D.iso / 100) - 0.012);
  const ang = 0.5;
  return {
    f: D.f,
    N: D.N,
    focusMm: state.focusMm,
    sensorW: cam.sensor.w,
    sensorH: cam.sensor.h,
    exposure: BASE_GAIN * Math.pow(2, evOff),
    noise,
    film: cam.film,
    pinhole: cam.pinhole,
    shake: [Math.cos(ang) * D.shake, Math.sin(ang) * D.shake],
    sky: subject.sky,
    ...overrides,
  };
}

function renderPhoto() {
  photo.render(photoParams());
  photoDirty = false;
}

function renderGallery() {
  const cam = D.cam;
  const f = cam.pinhole ? 50 : D.f;
  const lens = LENSES[f];
  const stops = [Math.max(2, lens.maxN), 5.6, 16];
  stops.forEach((N, i) => {
    photo.render(photoParams({ N, f, pinhole: false, exposure: BASE_GAIN, noise: 0.004, shake: [0, 0], film: false }), galleryTargets[i]);
    const dof = depthOfField(f, N, cam.coc, state.focusMm);
    galleryTags[i].element.innerHTML = `${formatF(N)} · zona nítida ${formatDistance(dof.total)}`;
  });
  galleryDirtyAt = 0;
}

// =================================================================== HUD
function updateHud(rr) {
  const cam = D.cam;
  const stats = [
    ['Enfoque', cam.pinhole ? '—' : formatDistance(state.focusMm), true],
    ['Apertura', formatF(D.N), true],
    ['Zona nítida', cam.pinhole ? 'todo' : formatDistance(D.dof.total), true],
    ['Velocidad', formatShutter(state.shutter)],
    ['ISO', `${D.iso}`],
    ['Focal', `${D.f} mm`],
  ];
  $('stats').innerHTML = stats.map(([k, v, hl]) => `<div class="stat${hl ? ' hl' : ''}"><span>${k}</span><b>${v}</b></div>`).join('');

  const ev = D.ev;
  const pct = (THREE.MathUtils.clamp(ev, -3.4, 3.4) + 3) / 6;
  $('meterNeedle').style.left = `calc(${(Math.min(Math.max(pct, -0.02), 1.02) * 100).toFixed(1)}% )`;
  const mt = $('meterText');
  mt.className = Math.abs(ev) < 0.5 ? '' : ev > 0 ? 'over' : 'under';
  mt.textContent = Math.abs(ev) < 0.5 ? 'correcta' : `${ev > 0 ? '+' : '−'}${Math.abs(ev).toFixed(1)} EV ${ev > 0 ? 'sobreexpuesta' : 'subexpuesta'}`;

  $('explain').innerHTML = explanation(rr);

  $('legend').innerHTML = POINT_KEYS.map((k) => {
    const p = D.points[k];
    if (!p) return '';
    const out = rr?.[k]?.outOfFrame ? ' <small title="Queda fuera del encuadre">⧄ fuera</small>' : '';
    const status = p.sharp ? `<em class="sharp">punto · Ø ${formatDisc(p.disc)}</em>` : `<em class="blur">disco · Ø ${formatDisc(p.disc)}</em>`;
    return `<li data-k="${k}" title="Enfocar aquí"><i class="c-${k}" style="background: currentColor"></i><span><b>${p.name}</b> · ${formatDistance(p.u)}${out}</span>${status}</li>`;
  }).join('');
  for (const li of $('legend').children) li.addEventListener('click', () => focusOn(li.dataset.k));

  const off = cam.mirror && state.mirrorDown;
  $('insetView').classList.toggle('off', off);
  $('insetTitle').textContent = off ? 'VISOR' : 'VISTA PREVIA';
  $('insetMeta').textContent = `${D.f}mm · ${formatF(D.N)} · ${formatShutter(state.shutter)} · ISO ${D.iso}`;
  if (!rig.busy) {
    let hint = 'Así quedaría la foto';
    if (D.shake > 0) hint = `⚠ Trepidación: ${formatShutter(state.shutter)} es lenta a pulso`;
    else if (D.ev > 1) hint = '⚠ Demasiada luz: foto quemada';
    else if (D.ev < -1) hint = '⚠ Poca luz: foto oscura';
    else if (!cam.film && D.iso >= 3200) hint = 'ISO alto: se nota el ruido';
    $('insetHint').textContent = hint;
  }
  if (state.selected && PARTS[state.selected]?.live) $('partLive').textContent = PARTS[state.selected].live(D);

  planeTag.element.innerHTML = `Plano de enfoque · <b>${formatDistance(state.focusMm)}</b>`;
  slabTag.element.innerHTML = cam.pinhole ? 'Zona nítida · <b>toda la escena</b>' : `Zona nítida · <b>${formatDistance(D.dof.total)}</b>`;
}

const span = (k, text) => `<span class="c-${k}">${text}</span>`;
function joinNames(keys) {
  const names = keys.map((k) => span(k, D.points[k].label));
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}
function explanation(rr) {
  const cam = D.cam;
  if (cam.pinhole) {
    return `Sin lente: desde cada punto solo entra un hilo de luz por un agujero de 0,3 mm, así que ${joinNames(POINT_KEYS)} llegan como <b>puntos diminutos</b>: todo sale nítido. A cambio es ${formatF(D.N)} y la exposición dura <b>${formatShutter(state.shutter)}</b>.`;
  }
  if (cam.mirror && state.mirrorDown) {
    return 'El <b>espejo</b> está bajado: la luz rebota hacia la pantalla de enfoque, el <b>pentaprisma</b> y el ocular. El sensor está a oscuras hasta que dispares (el espejo sube de golpe).';
  }
  const sharp = POINT_KEYS.filter((k) => D.points[k]?.sharp);
  const blur = POINT_KEYS.filter((k) => D.points[k] && !D.points[k].sharp);
  const zone = `Zona nítida: <b>${formatDistance(D.dof.total)}</b>.`;
  if (!blur.length) return `A ${formatF(D.N)} el cono de rayos es tan fino que ${joinNames(sharp)} llegan casi como <b>un punto</b>: todo parece nítido. ${zone}`;
  if (!sharp.length) return `Nada está sobre el plano de enfoque (${formatDistance(state.focusMm)}): ${joinNames(blur)} llegan al sensor como <b>discos</b>, así que todo sale borroso. ${zone}`;
  const one = sharp.length === 1;
  return `Solo ${joinNames(sharp)} ${one ? 'está' : 'están'} sobre el plano: ${one ? 'sus' : 'sus'} rayos se juntan en <b>un punto</b> del sensor. ${joinNames(blur)} ${blur.length === 1 ? 'llega' : 'llegan'} como <b>discos</b>, por eso ${blur.length === 1 ? 'se ve borroso' : 'se ven borrosos'}. ${zone}`;
}

// =================================================================== bucle
const clock = new THREE.Timer();
let time = 0;
let lastHud = 0;
let lastSig = '';

function frame() {
  clock.update();
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;
  updateFlight(dt);
  controls.update();
  rig.update(dt);
  updateHover();

  const optics = rig.optics();
  const rr = rays.update({ points: subject.points, optics, f: D.f, focusMm: state.focusMm, time });

  stage.focus.update(state.focusMm, D.dof.near, D.dof.far, time, D.cam.pinhole);
  stage.focus.group.visible = state.plane;
  planeTag.position.copy(stage.focus.planeAnchor);
  slabTag.position.copy(stage.focus.slabAnchor);
  planeTag.visible = state.plane && state.labels && !D.cam.pinhole;
  slabTag.visible = state.plane && state.labels;
  for (const k of POINT_KEYS) {
    const p = D.points[k];
    const t = pointTags[k];
    t.position.copy(p.pos);
    t.visible = state.labels && state.rays;
    t.element.innerHTML = `${p.name} <small>${formatDistance(p.u)}</small>`;
  }
  for (const t of partTags) t.visible = state.labels && rig.isPartVisible(t.userData.partId);

  if (photoDirty) renderPhoto();
  if (galleryDirtyAt && performance.now() > galleryDirtyAt) renderGallery();

  const sig = POINT_KEYS.map((k) => `${rr[k]?.viewfinder}${rr[k]?.blocked}${rr[k]?.outOfFrame}`).join();
  if (hudDirty || sig !== lastSig || time - lastHud > 1) {
    updateHud(rr);
    hudDirty = false;
    lastSig = sig;
    lastHud = time;
  }

  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  renderer.render(scene, camera);
  renderInset();
  labelRenderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function renderInset() {
  const el = $('insetView');
  const r = el.getBoundingClientRect();
  if (r.width < 2 || getComputedStyle($('photoInset')).display === 'none') return;
  const x = r.left + 1;
  const y = window.innerHeight - r.bottom + 1;
  const w = r.width - 2;
  const h = r.height - 2;
  const dim = D.cam.mirror && state.mirrorDown ? 0.55 : 1;
  insetQuad.material.color.setScalar(rig.busy ? 0.05 + rig.sensorLight * 0.95 : dim);
  renderer.setScissorTest(true);
  renderer.setScissor(x, y, w, h);
  renderer.setViewport(x, y, w, h);
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(insetScene, insetCam);
  renderer.autoClear = true;
  renderer.setScissorTest(false);
}

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
  camera.aspect = w / h;
  // En pantallas estrechas alejamos la cámara para que quepa el banco
  camera.fov = w / h < 1 ? 55 : 38;
  camera.updateProjectionMatrix();
  rays.setResolution(w, h);
}
window.addEventListener('resize', onResize);

// =================================================================== arranque
mountLabNav('camera');
wireControls();
setSubject(state.subjectId);
setCamera(state.cameraId);
onResize();
renderGallery();
requestAnimationFrame(frame);
requestAnimationFrame(() => requestAnimationFrame(() => $('loading').classList.add('done')));

// Acceso para depuración desde la consola
window.__camera3d = { state, rig, photo, scene, camera, controls, setCamera, setSubject, setLens, focusOn, shoot, stage };
