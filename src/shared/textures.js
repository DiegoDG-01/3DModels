// Texturas generadas con canvas (sin archivos externos).
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { srgb = true, repeat = false, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

/** Regla del banco óptico: 0 en el centro óptico, marcas en cm hacia la escena. */
export function rulerTexture(x0, x1, unitCm = 10) {
  const pxPerUnit = 220;
  const W = Math.round((x1 - x0) * pxPerUnit);
  const H = 96;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#16181d';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#23262d';
  g.fillRect(0, 0, W, 6);
  for (let x = Math.ceil(x0 * 10) / 10; x <= x1; x += 0.1) {
    const xr = Math.round(x * 10) / 10;
    const px = (xr - x0) * pxPerUnit;
    const major = Math.abs(xr - Math.round(xr)) < 1e-6;
    const half = !major && Math.abs(xr * 2 - Math.round(xr * 2)) < 1e-6;
    g.strokeStyle = major ? '#d8dbe2' : half ? '#8c919c' : '#5a5f69';
    g.lineWidth = major ? 3 : 2;
    g.beginPath();
    g.moveTo(px, 6);
    g.lineTo(px, major ? 46 : half ? 32 : 22);
    g.stroke();
    if (major) {
      g.fillStyle = xr === 0 ? '#5ce1e6' : '#c9ccd4';
      g.font = '600 28px "JetBrains Mono", monospace';
      g.textAlign = 'center';
      const label = xr === 0 ? '0' : xr > 0 ? `${Math.round(xr * unitCm)}` : '';
      g.fillText(label, px, 82);
    }
  }
  g.fillStyle = '#5ce1e6';
  g.font = '600 22px Inter, sans-serif';
  g.textAlign = 'left';
  g.fillText('cm desde el centro óptico →', (0.15 - x0) * pxPerUnit, 82);
  return tex(c);
}

/** Tira de película 35 mm con perforaciones. */
export function filmStripTexture() {
  const [c, g] = canvas(1024, 256);
  g.fillStyle = '#6b3510';
  g.fillRect(0, 0, 1024, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,170,90,0.25)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(255,170,90,0.25)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 256);
  g.fillStyle = '#1a0d05';
  for (let x = 8; x < 1024; x += 32) {
    g.fillRect(x, 10, 18, 22);
    g.fillRect(x, 224, 18, 22);
  }
  g.fillStyle = 'rgba(255,200,120,0.7)';
  g.font = '600 12px "JetBrains Mono", monospace';
  for (let x = 40; x < 1024; x += 256) g.fillText('KODAK 400  ▸ 12A', x, 50);
  return tex(c);
}

/** Etiqueta de texto (placa de marca, chasis de película…). */
export function labelTexture(lines, { w = 512, h = 128, bg = '#101114', fg = '#e7e9ee', accent = null, font = 'Outfit' } = {}) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  if (accent) {
    g.fillStyle = accent;
    g.fillRect(0, h - 10, w, 10);
  }
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const n = lines.length;
  lines.forEach((l, i) => {
    const size = i === 0 ? h * (n > 1 ? 0.36 : 0.5) : h * 0.2;
    g.font = `${i === 0 ? 800 : 600} ${size}px ${font}, Inter, sans-serif`;
    g.fillText(l, w / 2, n > 1 ? h * (i === 0 ? 0.4 : 0.76) : h / 2);
  });
  return tex(c);
}

/** Cielo en degradado para el fondo de la foto. */
export function gradientTexture(stops, { w = 16, h = 512 } = {}) {
  const [c, g] = canvas(w, h);
  const grad = g.createLinearGradient(0, 0, 0, h);
  for (const [p, col] of stops) grad.addColorStop(p, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const t = tex(c, { aniso: 1 });
  return t;
}

export function woodTexture(base = '#7a5233', dark = '#4e321d') {
  const [c, g] = canvas(512, 512);
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 140; i++) {
    const y = Math.random() * 512;
    g.strokeStyle = dark;
    g.globalAlpha = 0.08 + Math.random() * 0.2;
    g.lineWidth = 1 + Math.random() * 3;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 4);
    g.stroke();
  }
  g.globalAlpha = 1;
  return tex(c, { repeat: true });
}

/** Mosaico Bayer (RGGB) para la superficie del sensor. */
export function bayerTexture() {
  const [c, g] = canvas(4, 4);
  const cols = [['#ff3b3b', '#3bff5e'], ['#3bff5e', '#3b6bff']];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    g.fillStyle = cols[y % 2][x % 2];
    g.fillRect(x, y, 1, 1);
  }
  const t = tex(c, { repeat: true, aniso: 1 });
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  return t;
}

export function checkerTexture(n = 8, a = '#e9dcc3', b = '#3a2a1e') {
  const [c, g] = canvas(512, 512);
  const s = 512 / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    g.fillStyle = (x + y) % 2 ? b : a;
    g.fillRect(x * s, y * s, s, s);
  }
  return tex(c);
}

/** Ventanas iluminadas para edificios. */
export function windowsTexture(cols = 4, rows = 8, lit = 0.55, seed = 1) {
  const [c, g] = canvas(256, 512);
  g.fillStyle = '#2b3140';
  g.fillRect(0, 0, 256, 512);
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const cw = 256 / cols;
  const rh = 512 / rows;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const on = rnd() < lit;
    g.fillStyle = on ? (rnd() < 0.7 ? '#ffd27a' : '#bfe3ff') : '#161a24';
    g.fillRect(x * cw + cw * 0.22, y * rh + rh * 0.2, cw * 0.56, rh * 0.55);
  }
  return tex(c);
}

/** Pequeño brillo radial para sprites de fotones. */
export function glowTexture() {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return tex(c, { srgb: false, aniso: 1 });
}

/** Rayas para la correa dentada (se desplazan para simular el movimiento). */
export function stripeTexture() {
  const [c, g] = canvas(64, 16);
  g.fillStyle = '#161618';
  g.fillRect(0, 0, 64, 16);
  g.fillStyle = '#2c2c30';
  g.fillRect(0, 0, 26, 16);
  g.fillStyle = '#f2b233';
  g.fillRect(40, 6, 4, 4);
  return tex(c, { repeat: true, aniso: 4 });
}

/** Aletas del intercooler. */
export function finTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#2a2d33';
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 6) {
    g.fillStyle = y % 12 ? '#8c9199' : '#5d626a';
    g.fillRect(0, y, 256, 3);
  }
  for (let x = 0; x < 256; x += 32) {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(x, 0, 2, 256);
  }
  const t = tex(c, { repeat: true });
  t.repeat.set(4, 3);
  return t;
}
