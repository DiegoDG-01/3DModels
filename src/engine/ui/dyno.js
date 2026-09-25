// Gráfica del banco de potencia (par y potencia a plena carga + punto de funcionamiento actual).
import { SPECS } from '../physics.js';

const C = {
  bg: '#0d1016', grid: 'rgba(255,255,255,0.07)', axis: '#8a92a1', text: '#e9ecf2',
  torque: '#ff8a3d', power: '#5ce1e6', na: '#6b7383', boost: '#b394ff',
};
const fmt = (v) => Math.round(v).toLocaleString('es-ES');

export function drawDyno(canvas, { curve, turbo, target, rpm, torque, cv, boost, compact = false }) {
  const g = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const s = W / 1280;
  const t = s * (compact ? 2.2 : 1); // escala de textos y trazos
  g.save();
  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);

  const pad = compact ? { l: 50 * t, r: 46 * t, t: 58 * t, b: 92 * t } : { l: 96 * s, r: 96 * s, t: 118 * s, b: 170 * s };
  const x0 = pad.l;
  const x1 = W - pad.r;
  const y0 = H - pad.b;
  const y1 = pad.t;
  const maxT = Math.max(500, Math.ceil(Math.max(...curve.pts.map((p) => p.torque)) / 100) * 100 + 100);
  const maxP = Math.max(400, Math.ceil(Math.max(...curve.pts.map((p) => p.cv)) / 100) * 100 + 100);
  const X = (r) => x0 + ((r - 1000) / (SPECS.redline - 1000)) * (x1 - x0);
  const YT = (t) => y0 - (t / maxT) * (y0 - y1);
  const YP = (p) => y0 - (p / maxP) * (y0 - y1);

  // Título
  g.fillStyle = C.text;
  g.font = `800 ${34 * t}px Outfit, Inter, sans-serif`;
  if (!compact) g.fillText(`2JZ-GTE · ${turbo.short}`, x0, 52 * s);
  g.fillStyle = C.axis;
  g.font = `600 ${20 * t}px "JetBrains Mono", monospace`;
  if (!compact) g.fillText(`Plena carga · presión objetivo ${target.toFixed(2).replace('.', ',')} bar`, x0, 84 * s);

  // Rejilla
  g.strokeStyle = C.grid;
  g.lineWidth = 1 * s;
  g.font = `600 ${17 * t}px "JetBrains Mono", monospace`;
  for (let r = 1000; r <= SPECS.redline; r += 1000) {
    g.beginPath();
    g.moveTo(X(r), y0);
    g.lineTo(X(r), y1);
    g.stroke();
    g.fillStyle = C.axis;
    g.textAlign = 'center';
    g.fillText(`${r / 1000}k`, X(r), y0 + 22 * t);
  }
  if (!compact) g.fillText('rpm', (x0 + x1) / 2, y0 + 50 * s);
  const stepT = compact ? 200 : 100;
  for (let v = 0; v <= maxT; v += stepT) {
    g.beginPath();
    g.moveTo(x0, YT(v));
    g.lineTo(x1, YT(v));
    g.stroke();
    g.textAlign = 'right';
    g.fillStyle = C.torque;
    g.fillText(fmt(v), x0 - 8 * t, YT(v) + 6 * t);
  }
  for (let p = 0; p <= maxP; p += compact ? 200 : 100) {
    g.textAlign = 'left';
    g.fillStyle = C.power;
    g.fillText(fmt(p), x1 + 8 * t, YP(p) + 6 * t);
  }
  if (!compact) {
  g.save();
  g.translate(28 * s, (y0 + y1) / 2);
  g.rotate(-Math.PI / 2);
  g.textAlign = 'center';
  g.fillStyle = C.torque;
  g.fillText('PAR (Nm)', 0, 0);
  g.restore();
  g.save();
  g.translate(W - 28 * s, (y0 + y1) / 2);
  g.rotate(Math.PI / 2);
  g.textAlign = 'center';
  g.fillStyle = C.power;
  g.fillText('POTENCIA (CV)', 0, 0);
  g.restore();
  }

  // Zona roja
  g.fillStyle = 'rgba(255,60,60,0.08)';
  g.fillRect(X(6500), y1, X(SPECS.redline) - X(6500), y0 - y1);

  const line = (pts, fx, fy, color, width, dash = []) => {
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(fx(p), fy(p)) : g.moveTo(fx(p), fy(p))));
    g.strokeStyle = color;
    g.lineWidth = width * t;
    g.setLineDash(dash.map((d) => d * s));
    g.stroke();
    g.setLineDash([]);
  };
  // Área bajo la potencia
  g.beginPath();
  curve.pts.forEach((p, i) => (i ? g.lineTo(X(p.rpm), YP(p.cv)) : g.moveTo(X(p.rpm), YP(p.cv))));
  g.lineTo(X(SPECS.redline), y0);
  g.lineTo(X(1000), y0);
  g.closePath();
  const grad = g.createLinearGradient(0, y1, 0, y0);
  grad.addColorStop(0, 'rgba(92,225,230,0.22)');
  grad.addColorStop(1, 'rgba(92,225,230,0)');
  g.fillStyle = grad;
  g.fill();
  line(curve.na, (p) => X(p.rpm), (p) => YT(p.torque), C.na, 3, [10, 8]);
  line(curve.pts, (p) => X(p.rpm), (p) => YT(p.torque), C.torque, 5);
  line(curve.pts, (p) => X(p.rpm), (p) => YP(p.cv), C.power, 5);

  // Picos
  const pkT = curve.pts.reduce((a, b) => (b.torque > a.torque ? b : a));
  const pkP = curve.pts.reduce((a, b) => (b.cv > a.cv ? b : a));
  const peak = (x, y, text, color) => {
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, 6 * t, 0, Math.PI * 2);
    g.fill();
    g.font = `700 ${19 * t}px "JetBrains Mono", monospace`;
    g.textAlign = x > (x0 + x1) / 2 ? 'right' : 'left';
    g.fillText(text, x + (g.textAlign === 'right' ? -10 : 10) * t, y - 10 * t);
  };
  peak(X(pkT.rpm), YT(pkT.torque), `${fmt(pkT.torque)} Nm @ ${fmt(pkT.rpm)}`, C.torque);
  peak(X(pkP.rpm), YP(pkP.cv), `${fmt(pkP.cv)} CV @ ${fmt(pkP.rpm)}`, C.power);

  // Presión de turbo (franja inferior)
  const by0 = H - (compact ? 14 : 36) * t;
  const by1 = y0 + (compact ? 38 : 70) * t;
  const maxB = Math.max(1, turbo.maxBoost);
  g.fillStyle = C.boost;
  g.font = `600 ${16 * t}px "JetBrains Mono", monospace`;
  g.textAlign = 'right';
  g.fillText('TURBO', x0 - 8 * t, by0 - 4 * t);
  line(curve.pts, (p) => X(p.rpm), (p) => by0 - (p.boost / maxB) * (by0 - by1), C.boost, 3);

  // Punto actual
  const xr = X(Math.min(SPECS.redline, Math.max(1000, rpm)));
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 2 * s;
  g.setLineDash([6 * s, 6 * s]);
  g.beginPath();
  g.moveTo(xr, y1 - 10 * s);
  g.lineTo(xr, by0);
  g.stroke();
  g.setLineDash([]);
  const dot = (y, color) => {
    g.fillStyle = color;
    g.beginPath();
    g.arc(xr, y, 9 * t, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#fff';
    g.lineWidth = 2.5 * t;
    g.stroke();
  };
  dot(YT(torque), C.torque);
  dot(YP(cv), C.power);
  dot(by0 - (Math.max(0, boost) / maxB) * (by0 - by1), C.boost);
  const label = compact ? `${fmt(torque)} Nm · ${fmt(cv)} CV` : `AHORA ${fmt(rpm)} rpm · ${fmt(torque)} Nm · ${fmt(cv)} CV`;
  g.font = `700 ${20 * t}px "JetBrains Mono", monospace`;
  const tw = g.measureText(label).width + 20 * t;
  const lx = Math.min(Math.max(xr - tw / 2, x0), x1 - tw);
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.beginPath();
  g.roundRect(lx, y1 - 40 * t, tw, 30 * t, 7 * t);
  g.fill();
  g.fillStyle = '#0d1016';
  g.textAlign = 'left';
  g.fillText(label, lx + 10 * t, y1 - 19 * t);

  // Leyenda
  if (compact) {
    g.restore();
    return;
  }
  const leg = [[C.torque, 'Par'], [C.power, 'Potencia'], [C.na, 'Par sin turbo'], [C.boost, 'Presión turbo']];
  let lxp = x1 - 560 * s;
  g.font = `600 ${17 * t}px Inter, sans-serif`;
  for (const [col, name] of leg) {
    g.fillStyle = col;
    g.fillRect(lxp, 70 * s, 24 * s, 5 * s);
    g.fillStyle = C.text;
    g.fillText(name, lxp + 32 * s, 78 * s);
    lxp += g.measureText(name).width + 62 * s;
  }
  g.restore();
}
