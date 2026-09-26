import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

import { TURBOS, SPECS, STROKES, EngineSim, dynoCurve, cyclePhase, strokeAt, output, mod } from './physics.js';
import { PARTS } from './data/parts.js';
import { EngineModel } from './scene/engineModel.js';
import { FlowViz } from './scene/flow.js';
import { createStage } from './scene/stage.js';
import { drawDyno } from './ui/dyno.js';
import { drawCylinder } from './ui/cylinder.js';
import { EngineSound } from './ui/sound.js';
import { mountLabNav } from '../shared/labnav.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const f0 = (v) => Math.round(v).toLocaleString('es-ES');
const f1 = (v) => v.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f2 = (v) => v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// =================================================================== estado
const state = {
  turboId: 'twin',
  rpm: 3000,
  throttle: 0.35,
  target: TURBOS.twin.stockBoost,
  slow: 0.02,
  exploded: false,
  xray: true,
  flow: true,
  labels: true,
  sound: false,
  selected: null,
  cyl: 1,
  tab: 'cyl',
  floor: false,
};
// Etiquetas visibles siempre; el resto aparece al pasar el ratón o al seleccionar
const MAIN_LABELS = new Set(['block', 'head', 'crankshaft', 'pistons', 'camIntake', 'turbo1', 'turbo2', 'intercooler', 'intakeManifold', 'exhaustManifold', 'timingBelt', 'flywheel', 'throttle', 'bov', 'valvesExhaust']);

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
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 200);
const PORTRAIT = window.innerWidth / window.innerHeight < 1;
const HOME = PORTRAIT
  ? { pos: new THREE.Vector3(-9, 9, 19), target: new THREE.Vector3(-0.8, 0.8, 0.2) }
  : { pos: new THREE.Vector3(-9.6, 6.4, 13.4), target: new THREE.Vector3(-0.2, 1.0, 0.4) };
if (window.innerWidth < 640) state.labels = false;
camera.position.copy(HOME.pos);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(HOME.target);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2;
controls.maxDistance = 34;
controls.maxPolarAngle = Math.PI * 0.56;
controls.update();

const stage = createStage(renderer, scene);
const model = new EngineModel();
scene.add(model.group);
const flow = new FlowViz(scene);
const sim = new EngineSim();
const sound = new EngineSound();

// Pantalla del banco de potencia (canvas → textura)
const dynoCanvas = document.createElement('canvas');
dynoCanvas.width = 1280;
dynoCanvas.height = 800;
const dynoTex = new THREE.CanvasTexture(dynoCanvas);
dynoTex.colorSpace = THREE.SRGBColorSpace;
dynoTex.anisotropy = 8;
stage.screenMat.map = dynoTex;
stage.screenMat.needsUpdate = true;
let curve = null;

// =================================================================== etiquetas
function tag(html, cls = '') {
  const el = document.createElement('div');
  el.className = `tag ${cls}`;
  el.innerHTML = html;
  const obj = new CSS2DObject(el);
  obj.center.set(0.5, 1);
  return obj;
}
let partTags = [];
function buildPartTags() {
  for (const t of partTags) {
    t.parent?.remove(t);
    t.element.remove();
  }
  partTags = [];
  for (const p of model.parts.values()) {
    const info = PARTS[p.id];
    if (!info) continue;
    const t = tag(`${info.name} <small>${info.hint ?? ''}</small>`);
    t.position.copy(p.label);
    t.userData.partId = p.id;
    t.element.addEventListener('pointerdown', (e) => e.stopPropagation());
    t.element.addEventListener('click', (e) => {
      e.stopPropagation();
      selectPart(p.id, true);
    });
    t.element.addEventListener('mouseenter', () => (model.hoverId = p.id));
    t.element.addEventListener('mouseleave', () => (model.hoverId = null));
    p.holder.add(t);
    partTags.push(t);
  }
}

// =================================================================== cambios de estado
function setTurbo(id) {
  state.turboId = id;
  const t = TURBOS[id];
  sim.turbo = t;
  state.target = t.stockBoost;
  model.build(t);
  flow.setPaths(model.paths);
  if (state.selected && !model.parts.has(state.selected)) state.selected = null;
  buildPartTags();
  buildPartsBar();
  buildControls();
  recompute();
  if (state.selected) showPart(state.selected);
  else hidePart();
}

function recompute() {
  sim.target = state.target;
  if (!state.floor) sim.throttle = state.throttle;
  model.setTargets({ exploded: state.exploded, xray: state.xray });
  model.selectedId = state.selected;
  flow.enabled = state.flow;
  curve = dynoCurve(sim.turbo, state.target);
  syncControls();
}

function setFloor(on) {
  state.floor = on;
  sim.throttle = on ? 1 : state.throttle;
  $('floorBtn').classList.toggle('held', on);
}

// =================================================================== controles
function buttons(container, items, onClick) {
  container.innerHTML = '';
  for (const it of items) {
    const b = document.createElement('button');
    b.innerHTML = it.html;
    b.dataset.key = it.key;
    if (it.title) b.title = it.title;
    b.addEventListener('click', () => onClick(it.key));
    container.append(b);
  }
}

function buildControls() {
  buttons($('turboButtons'), Object.values(TURBOS).map((t) => ({ key: t.id, html: `${t.short}<small>${t.tag}</small>`, title: t.name })), (id) => setTurbo(id));
  const cp = $('cylPicker');
  cp.innerHTML = '';
  for (let c = 1; c <= 6; c++) {
    const b = document.createElement('button');
    b.textContent = c;
    b.title = `Ver el cilindro ${c}`;
    b.dataset.cyl = c;
    b.addEventListener('click', () => setCyl(c));
    cp.append(b);
  }
  syncControls();
}

function syncControls() {
  const t = sim.turbo;
  for (const b of $('turboButtons').children) b.classList.toggle('on', b.dataset.key === state.turboId);
  $('turboDesc').textContent = t.desc;
  $('rpmSlider').value = state.rpm;
  $('rpmVal').textContent = `${f0(state.rpm)} rpm`;
  for (const b of $('rpmPresets').children) b.classList.toggle('on', +b.dataset.rpm === state.rpm);
  $('throttleSlider').value = Math.round(state.throttle * 100);
  $('throttleVal').textContent = `${Math.round(state.throttle * 100)}%`;
  const ts = $('targetSlider');
  ts.max = t.maxBoost;
  ts.value = state.target;
  $('targetVal').textContent = `${f2(state.target)} bar`;
  $('targetVal').title = `${f0(state.target * 14.5)} psi`;
  for (const b of $('slowButtons').children) b.classList.toggle('on', +b.dataset.slow === state.slow);
  for (const b of $('explodeButtons').children) b.classList.toggle('on', b.dataset.explode === (state.exploded ? '1' : '0'));
  $('tFlow').checked = state.flow;
  $('tXray').checked = state.xray;
  $('tLabels').checked = state.labels;
  $('tSound').checked = state.sound;
  for (const b of $('cylPicker').children) b.classList.toggle('on', +b.dataset.cyl === state.cyl);
  for (const b of $('insetTabs').children) b.classList.toggle('on', b.dataset.tab === state.tab);
}

function setCyl(c) {
  state.cyl = c;
  state.tab = 'cyl';
  syncControls();
}

function wireControls() {
  $('rpmSlider').addEventListener('input', (e) => {
    state.rpm = +e.target.value;
    syncControls();
  });
  for (const b of $('rpmPresets').children) b.addEventListener('click', () => {
    state.rpm = +b.dataset.rpm;
    syncControls();
  });
  $('throttleSlider').addEventListener('input', (e) => {
    state.throttle = e.target.value / 100;
    recompute();
  });
  $('targetSlider').addEventListener('input', (e) => {
    state.target = +e.target.value;
    recompute();
  });
  for (const b of $('slowButtons').children) b.addEventListener('click', () => {
    state.slow = +b.dataset.slow;
    syncControls();
  });
  for (const b of $('explodeButtons').children) b.addEventListener('click', () => {
    state.exploded = b.dataset.explode === '1';
    recompute();
  });
  const toggle = (id, key, after) => $(id).addEventListener('change', (e) => {
    state[key] = e.target.checked;
    after?.();
    recompute();
  });
  toggle('tFlow', 'flow');
  toggle('tXray', 'xray');
  toggle('tLabels', 'labels');
  toggle('tSound', 'sound', applySound);
  for (const b of $('insetTabs').children) b.addEventListener('click', () => {
    state.tab = b.dataset.tab;
    syncControls();
  });
  const fb = $('floorBtn');
  fb.addEventListener('pointerdown', (e) => {
    fb.setPointerCapture(e.pointerId);
    setFloor(true);
  });
  const release = () => state.floor && setFloor(false);
  fb.addEventListener('pointerup', release);
  fb.addEventListener('pointercancel', release);
  $('resetView').addEventListener('click', () => {
    selectPart(null);
    fly(HOME.pos, HOME.target);
  });
  $('helpBtn').addEventListener('click', () => $('help').showModal());
  $('helpClose').addEventListener('click', () => $('help').close());
  $('partClose').addEventListener('click', () => selectPart(null));
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

function applySound() {
  if (state.sound) sound.start();
  else sound.stop();
}

// =================================================================== piezas
function buildPartsBar() {
  const bar = $('partsBar');
  bar.innerHTML = '<span class="lbl">PIEZAS</span>';
  for (const p of model.parts.values()) {
    if (!PARTS[p.id]) continue;
    const b = document.createElement('button');
    b.textContent = PARTS[p.id].name;
    b.dataset.part = p.id;
    b.addEventListener('click', () => selectPart(p.id, true));
    bar.append(b);
  }
}

function selectPart(id, flyTo = false) {
  state.selected = id;
  model.selectedId = id;
  for (const b of $('partsBar').querySelectorAll('button')) b.classList.toggle('on', b.dataset.part === id);
  for (const t of partTags) t.element.classList.toggle('on', t.userData.partId === id);
  if (!id) {
    hidePart();
    return;
  }
  const p = model.parts.get(id);
  if (p.inner && !state.xray && !state.exploded) {
    state.xray = true;
    recompute();
  }
  showPart(id);
  if (flyTo) {
    const target = model.worldPos(id);
    const dir = camera.position.clone().sub(controls.target).normalize();
    dir.z = Math.max(dir.z, 0.45);
    dir.y = THREE.MathUtils.clamp(dir.y, 0.25, 0.65);
    dir.normalize();
    fly(target.clone().addScaledVector(dir, 3.6 + (p.radius ?? 1) * 3), target);
  }
}

function ctx() {
  return { rpm: sim.rpm, crankDeg, sim };
}

function showPart(id) {
  const info = PARTS[id];
  if (!info) return;
  $('partCard').hidden = false;
  $('explainCard').hidden = true;
  $('partGroup').textContent = info.group;
  $('partName').textContent = info.name;
  $('partWhat').textContent = info.what;
  $('partLight').textContent = info.role;
  $('partLive').textContent = info.live && sim.out ? info.live(ctx()) : '';
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
  if (kind === 'xray') {
    state.xray = !state.xray;
    recompute();
  }
  if (kind === 'throttle') {
    state.throttle = +arg;
    recompute();
  }
  if (kind === 'bov') {
    // Acelerar a fondo y soltar de golpe cuando hay presión
    if (state.rpm < 4000) {
      state.rpm = 4500;
      syncControls();
    }
    setFloor(true);
    setTimeout(() => setFloor(false), 2600);
  }
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
let down = null;

function pick() {
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(model.pickables, false);
  for (const h of hits) {
    const id = h.object.userData.partId;
    if (!id || !model.isPartVisible(id)) continue;
    const p = model.parts.get(id);
    if (p.shell && p.hidden) continue;
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
});
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button === 0) down = { x: e.clientX, y: e.clientY, id: pick() };
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) selectPart(down.id, false);
  down = null;
});
renderer.domElement.addEventListener('pointerleave', () => {
  model.hoverId = null;
  $('tooltip').classList.remove('show');
});

function updateHover() {
  if (!pointerMoved) return;
  pointerMoved = false;
  const id = pick();
  model.hoverId = id;
  const tip = $('tooltip');
  if (id && PARTS[id]) {
    tip.innerHTML = `${PARTS[id].name}<small>clic para ver qué hace</small>`;
    tip.style.left = `${pointerClient.x}px`;
    tip.style.top = `${pointerClient.y}px`;
    tip.classList.add('show');
    renderer.domElement.style.cursor = 'pointer';
  } else {
    tip.classList.remove('show');
    renderer.domElement.style.cursor = '';
  }
}

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'range') return;
  if (document.querySelector('dialog[open]')) return;
  const k = e.key.toLowerCase();
  if (k === ' ') {
    e.preventDefault();
    if (!e.repeat) setFloor(true);
    return;
  }
  if (k === 'arrowup' || k === 'arrowdown') {
    e.preventDefault();
    state.rpm = THREE.MathUtils.clamp(state.rpm + (k === 'arrowup' ? 250 : -250), SPECS.idle, SPECS.redline);
    syncControls();
  } else if (k >= '1' && k <= '6') setCyl(+k);
  else if (k === 'e') runToggle('exploded');
  else if (k === 'x') runToggle('xray');
  else if (k === 'f') runToggle('flow');
  else if (k === 'l') runToggle('labels');
  else if (k === 's') {
    state.sound = !state.sound;
    applySound();
    syncControls();
  } else if (k === 'escape') selectPart(null);
});
window.addEventListener('keyup', (e) => {
  if (e.key === ' ') setFloor(false);
});
function runToggle(key) {
  state[key] = !state[key];
  recompute();
}

// =================================================================== HUD
function updateHud() {
  const o = sim.out;
  const b = sim.boost;
  const stats = [
    ['Régimen', `${f0(sim.rpm)}`, 'rpm'],
    ['Presión', `${b >= 0 ? '+' : ''}${f2(b)}`, 'bar', true],
    ['Potencia', f0(o.cv), 'CV', true],
    ['Par', f0(o.torque), 'Nm', true],
    ['Turbo', f0(sim.shaftRpm / 1000), 'k rpm'],
    ['Aire', f0(o.air.afterIc), '°C'],
  ];
  $('stats').innerHTML = stats.map(([k, v, u, hl]) => `<div class="stat${hl ? ' hl' : ''}"><span>${k}</span><b>${v} <small>${u}</small></b></div>`).join('');
  const pct = (THREE.MathUtils.clamp(b, -0.8, 2) + 0.8) / 2.8;
  $('meterNeedle').style.left = `${(pct * 100).toFixed(1)}%`;
  const mt = $('meterText');
  mt.className = b > 0.05 ? 'over' : b < -0.05 ? 'under' : '';
  mt.textContent = b > 0.05 ? `+${f2(b)} bar · soplando` : b < -0.05 ? `${f2(b)} bar · vacío` : 'presión atmosférica';

  $('explain').innerHTML = explanation();
  renderCycle();
  $('insetMeta').textContent = state.tab === 'cyl' ? `${f0(sim.rpm)} rpm · ${state.slow === 1 ? 'tiempo real' : `÷${f0(1 / state.slow)}`}` : `${f0(o.cv)} CV · ${f0(o.torque)} Nm`;
  if (state.selected && PARTS[state.selected]?.live) $('partLive').textContent = PARTS[state.selected].live(ctx());
}

function explanation() {
  const o = sim.out;
  const b = sim.boost;
  const perCyl = sim.rpm / 120;
  const parts = [];
  parts.push(`A <b>${f0(sim.rpm)} rpm</b> cada cilindro explota ${f0(perCyl)} veces por segundo (${f0(perCyl * 6)} explosiones/s entre los seis).`);
  if (b < -0.05) {
    parts.push(`Con el acelerador al ${f0(sim.throttle * 100)}% la mariposa frena el aire: en el colector hay <b>vacío</b> y el turbo casi no sopla.`);
  } else {
    const na = output(sim.turbo, sim.rpm, 0);
    const more = Math.round((o.density - 1) * 100);
    parts.push(`El turbo gira a <b>${f0(sim.shaftRpm)} rpm</b> y empuja <b>${f2(Math.max(0, b))} bar</b>: cabe un ${more}% más de aire en cada cilindro. Al comprimirlo se calienta a <span class="hot">${f0(o.air.compressorOut)} °C</span> y el intercooler lo enfría a <span class="cool">${f0(o.air.afterIc)} °C</span>.`);
    parts.push(`Por eso da <b>${f0(o.torque)} Nm</b> en vez de los ${f0(na.torque)} Nm que daría sin turbo.`);
  }
  const avail = sim.turbo ? curve.pts.find((p) => p.rpm >= sim.rpm)?.boost ?? 0 : 0;
  if (sim.throttle > 0.8 && b < avail * 0.8 - 0.05) parts.push('<b>El turbo está cargando</b> (retraso o "lag"): los gases de escape todavía lo están acelerando.');
  if (sim.turbo.seqSwitch) parts.push(sim.secondaryActive ? 'Por encima de 4000 rpm <b>soplan los dos turbos</b>.' : 'Solo sopla el <b>turbo primario</b>; el segundo entra a 4000 rpm.');
  else if (sim.rpm < sim.turbo.spoolStart) parts.push(`El turbo grande no empieza a cargar hasta ~${f0(sim.turbo.spoolStart)} rpm.`);
  if (sim.wastegate > 0.3) parts.push('La <b>wastegate</b> está abierta: desvía escape para no pasar de la presión objetivo.');
  if (sim.knock !== 'bajo') parts.push(`<b style="color:#ff5a52">Riesgo de detonación ${sim.knock}</b>: con compresión 8,5:1 y tanta presión haría falta gasolina de más octanos o E85.`);
  return parts.join(' ');
}

let cycleRows = null;
function renderCycle() {
  const el = $('cycleTable');
  if (!cycleRows) {
    el.innerHTML = '';
    cycleRows = [];
    for (let c = 1; c <= 6; c++) {
      const row = document.createElement('div');
      row.className = 'row';
      row.title = `Ver el cilindro ${c}`;
      row.innerHTML = `<b>C${c}</b><span class="chip"></span><div class="bar">${STROKES.map((s) => `<span style="background:${s.color}"></span>`).join('')}<i></i></div>`;
      row.addEventListener('click', () => setCyl(c));
      el.append(row);
      cycleRows.push(row);
    }
  }
  cycleRows.forEach((row, i) => {
    const ph = cyclePhase(crankDeg, i + 1);
    const st = strokeAt(ph);
    const chip = row.children[1];
    chip.textContent = st.name.toUpperCase();
    chip.style.background = st.color;
    row.querySelector('i').style.left = `${(ph / 720) * 100}%`;
    const spans = row.querySelectorAll('.bar span');
    spans.forEach((s, k) => (s.style.opacity = STROKES[k].id === st.id ? 1 : 0.3));
    row.classList.toggle('on', state.cyl === i + 1);
  });
}

// =================================================================== bucle
const timer = new THREE.Timer();
let time = 0;
let crankDeg = 0;
let lastHud = -1;
let lastDyno = -1;
let lastBov = 0;

function frame() {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  time += dt;

  // Régimen con inercia y simulación en tiempo real
  sim.rpm += (state.rpm - sim.rpm) * (1 - Math.exp(-dt * 2.5));
  sim.step(dt);
  if (sim.bovEvents !== lastBov) {
    lastBov = sim.bovEvents;
    sound.bov();
  }
  sound.update(sim);
  const degPerSec = sim.rpm * 6 * state.slow;
  crankDeg = mod(crankDeg + degPerSec * dt, 720);

  updateFlight(dt);
  controls.update();
  model.update(dt, {
    crankDeg,
    throttle: sim.throttle,
    wastegate: sim.wastegate,
    egt: sim.egt,
    shaftRpm: sim.shaftRpm,
    maxShaftRpm: sim.turbo.maxShaftRpm,
    slow: state.slow,
    beltSpeed: (degPerSec / 360) * 0.8,
    flow: { secondary: sim.secondaryActive },
  });
  flow.update({ dt, crankDeg, degPerSec, sim, visible: model.explodeT < 0.3 });
  updateHover();

  for (const t of partTags) {
    const id = t.userData.partId;
    const show = state.labels && model.isPartVisible(id) && (MAIN_LABELS.has(id) || id === state.selected || id === model.hoverId);
    t.visible = show;
  }

  if (time - lastHud > 0.08) {
    updateHud();
    lastHud = time;
  }
  if (time - lastDyno > 0.15) {
    const data = { curve, turbo: sim.turbo, target: state.target, rpm: sim.rpm, torque: sim.out.torque, cv: sim.out.cv, boost: sim.boost };
    drawDyno(dynoCanvas, data);
    dynoTex.needsUpdate = true;
    if (state.tab === 'dyno') drawDyno($('insetCanvas'), { ...data, compact: true });
    lastDyno = time;
  }
  if (state.tab === 'cyl') drawCylinder($('insetCanvas'), { crankDeg, cyl: state.cyl, time });

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = w / h < 1 ? 55 : 40;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);

// =================================================================== arranque
mountLabNav('engine');
wireControls();
setTurbo(state.turboId);
sim.step(0.016);
onResize();
requestAnimationFrame(frame);
requestAnimationFrame(() => requestAnimationFrame(() => $('loading').classList.add('done')));

// Acceso para depuración desde la consola
window.__engine = { state, sim, model, flow, camera, controls, setTurbo, selectPart, setFloor };
