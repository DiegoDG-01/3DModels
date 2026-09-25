// Óptica de lente delgada + exposición.
// Todas las distancias reales van en milímetros.

export const STOPS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22];
export const SHUTTERS = [
  30, 15, 8, 4, 2, 1, 1 / 2, 1 / 4, 1 / 8, 1 / 15, 1 / 30, 1 / 60,
  1 / 125, 1 / 250, 1 / 500, 1 / 1000, 1 / 2000, 1 / 4000,
];
export const ISOS = [100, 200, 400, 800, 1600, 3200, 6400, 12800];

// 1 unidad de la escena 3D = 10 cm reales en el lado del motivo (la maqueta).
export const UNIT_MM = 100;
// En el lado de la cámara la escala es otra: 1 mm del sensor = 0.05 unidades.
export const DISPLAY_PER_MM = 0.05;
// Luz de la maqueta, en EV a ISO 100 (interior bien iluminado / día nublado).
export const SCENE_EV = 11;

/** Distancia imagen v para un objeto a distancia u (1/f = 1/u + 1/v). */
export function imageDistance(f, u) {
  if (u <= f * 1.0001) return Infinity;
  return (f * u) / (u - f);
}

/** Profundidad de campo: límites cercano y lejano de la zona nítida. */
export function depthOfField(f, N, c, u) {
  const H = (f * f) / (N * c) + f; // hiperfocal
  const near = (u * (H - f)) / (H + u - 2 * f);
  const far = u < H ? (u * (H - f)) / (H - u) : Infinity;
  return { near, far, total: far - near, hyperfocal: H };
}

/** Diámetro del círculo de confusión (mm sobre el sensor) de un punto a distancia u. */
export function blurDisc(f, N, focus, u) {
  const A = f / N;
  return (A * Math.abs(u - focus) / u) * (f / (focus - f));
}

/** Diferencia de exposición en pasos (EV). 0 = correcta, + = sobreexpuesta. */
export function exposureOffset(N, t, iso, sceneEv = SCENE_EV) {
  return sceneEv + Math.log2(iso / 100) - Math.log2((N * N) / t);
}

/** Velocidad de la lista más cercana a la exposición correcta (prioridad a la apertura). */
export function autoShutter(N, iso, sceneEv = SCENE_EV) {
  const ideal = (N * N) / Math.pow(2, sceneEv + Math.log2(iso / 100));
  let best = SHUTTERS[0];
  for (const s of SHUTTERS) {
    if (Math.abs(Math.log2(s / ideal)) < Math.abs(Math.log2(best / ideal))) best = s;
  }
  return best;
}

export function formatShutter(t) {
  if (t >= 1) return `${t}"`;
  return `1/${Math.round(1 / t)}`;
}

export function formatF(N) {
  return `ƒ/${N >= 10 ? Math.round(N) : +N.toFixed(1)}`;
}

export function formatDistance(mm) {
  if (!isFinite(mm)) return '∞';
  if (mm >= 10000) return `${(mm / 1000).toFixed(1)} m`;
  if (mm >= 1000) return `${(mm / 10).toFixed(0)} cm`;
  if (mm >= 100) return `${(mm / 10).toFixed(mm < 300 ? 1 : 0)} cm`;
  return `${(mm / 10).toFixed(1)} cm`;
}

export function formatDisc(mm) {
  if (mm < 0.1) return `${Math.round(mm * 1000)} µm`;
  return `${mm.toFixed(2)} mm`;
}

export function nearestIndex(list, value) {
  let bi = 0;
  for (let i = 1; i < list.length; i++) {
    if (Math.abs(Math.log(list[i] / value)) < Math.abs(Math.log(list[bi] / value))) bi = i;
  }
  return bi;
}
