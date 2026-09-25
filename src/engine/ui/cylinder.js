// Corte 2D animado de un cilindro: los cuatro tiempos, válvulas, chispa y flujo.
import { STROKES, cyclePhase, strokeAt, valveLift, mod } from '../physics.js';

const GAS = { intake: [79, 179, 255], compression: [179, 148, 255], power: [255, 122, 26], exhaust: [139, 127, 120] };

export function drawCylinder(canvas, { crankDeg, cyl, time }) {
  const g = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const dpr = W / 372;
  g.save();
  g.scale(dpr, dpr);
  const w = 372;
  const h = H / dpr;
  g.fillStyle = '#0b0d12';
  g.fillRect(0, 0, w, h);

  const phase = cyclePhase(crankDeg, cyl);
  const st = strokeAt(phase);
  const a = (mod(phase, 360) * Math.PI) / 180;

  // Escala: 1 unidad del motor = u px
  const u = h / 4.3;
  const cx = w * 0.36;
  const cy = h - 0.62 * u;
  const R = 0.43 * u;
  const L = 1.42 * u;
  const bore = 0.86 * u;
  const deck = cy - 2.19 * u;
  const pinX = cx + R * Math.sin(a);
  const pinY = cy - R * Math.cos(a);
  const pistonPinY = pinY - Math.sqrt(L * L - (R * Math.sin(a)) ** 2);
  const crown = pistonPinY - 0.33 * u;

  // Gas en la cámara
  const gc = GAS[st.id];
  let alpha = 0.45;
  if (st.id === 'compression') alpha = 0.35 + 0.35 * ((phase - 540) / 180);
  if (st.id === 'power') alpha = 0.85 - 0.5 * (phase / 180);
  g.fillStyle = `rgba(${gc[0]},${gc[1]},${gc[2]},${alpha})`;
  g.fillRect(cx - bore / 2, deck, bore, crown - deck);
  if (st.id === 'power' && phase < 90) {
    const r = (0.2 + phase / 90) * bore * 0.7;
    const grd = g.createRadialGradient(cx, deck + 8, 2, cx, deck + 8, r);
    grd.addColorStop(0, 'rgba(255,240,180,0.95)');
    grd.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = grd;
    g.fillRect(cx - bore / 2, deck, bore, crown - deck);
  }

  // Paredes del cilindro y culata
  g.fillStyle = '#3a3e45';
  g.fillRect(cx - bore / 2 - 14, deck, 14, cy - 0.4 * u - deck);
  g.fillRect(cx + bore / 2, deck, 14, cy - 0.4 * u - deck);
  g.fillStyle = '#8f949b';
  const headTop = deck - 0.95 * u;
  g.beginPath();
  g.moveTo(cx - bore / 2 - 60, headTop);
  g.lineTo(cx + bore / 2 + 60, headTop);
  g.lineTo(cx + bore / 2 + 60, deck);
  g.lineTo(cx - bore / 2 - 14, deck);
  g.closePath();
  g.fill();
  // Conductos
  const port = (side, lift, color) => {
    const sx = cx + side * bore * 0.26;
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(sx - 13, deck);
    g.quadraticCurveTo(sx + side * 10, deck - 30, cx + side * (bore / 2 + 60), deck - 44);
    g.lineTo(cx + side * (bore / 2 + 60), deck - 18);
    g.quadraticCurveTo(sx + side * 20, deck - 10, sx + 13, deck);
    g.fill();
    // Válvula
    const ls = lift * 16;
    g.strokeStyle = '#d6dae0';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(sx, deck + ls - 2);
    g.lineTo(sx + side * 8, headTop + 6 + ls);
    g.stroke();
    g.fillStyle = '#d6dae0';
    g.fillRect(sx - 13, deck - 3 + ls, 26, 5);
  };
  const li = valveLift(phase, 'intake');
  const le = valveLift(phase, 'exhaust');
  port(-1, li, '#1c3a57');
  port(1, le, '#4a2c1c');
  // Partículas en los conductos
  const dots = (side, lift, color, dir) => {
    if (lift < 0.05) return;
    g.fillStyle = color;
    for (let i = 0; i < 7; i++) {
      const t = mod(time * 1.6 * dir + i / 7, 1);
      const tt = dir > 0 ? t : 1 - t;
      const x = cx + side * (bore / 2 + 60) * (1 - tt) + side * bore * 0.26 * tt;
      const y = deck - 31 * (1 - tt) + 6 * tt + (dir > 0 ? 0 : 0);
      g.globalAlpha = lift;
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  };
  dots(-1, li, '#6fc3ff', 1);
  dots(1, le, '#ff9a5a', -1);
  // Bujía
  g.fillStyle = '#e6e6e6';
  g.fillRect(cx - 4, headTop - 18, 8, deck - headTop + 14);
  if (phase > 706 || phase < 6) {
    g.fillStyle = '#dff2ff';
    g.beginPath();
    g.arc(cx, deck + 4, 9 + Math.random() * 5, 0, Math.PI * 2);
    g.fill();
  }

  // Pistón, biela, cigüeñal
  g.strokeStyle = '#2a2d33';
  g.lineWidth = 2;
  g.fillStyle = '#9aa0a8';
  g.beginPath();
  g.arc(cx, cy, 0.72 * u, Math.PI * 0.15 + a, Math.PI * 0.85 + a);
  g.fill();
  g.fillStyle = '#5b6068';
  g.beginPath();
  g.arc(cx, cy, 0.28 * u, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#b8bdc4';
  g.lineWidth = 11;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(pinX, pinY);
  g.lineTo(cx, pistonPinY);
  g.stroke();
  g.fillStyle = '#d3d7dc';
  g.fillRect(cx - bore / 2 + 2, crown, bore - 4, 0.55 * u);
  g.fillStyle = '#6f675f';
  g.fillRect(cx - bore / 2 + 2, crown, bore - 4, 4);
  g.fillStyle = '#50545b';
  for (const dy of [9, 15, 21]) g.fillRect(cx - bore / 2 + 2, crown + dy, bore - 4, 2);
  g.fillStyle = '#eceff3';
  g.beginPath();
  g.arc(pinX, pinY, 8, 0, Math.PI * 2);
  g.fill();

  // Textos
  const panelX = w * 0.665;
  g.textAlign = 'left';
  g.fillStyle = '#8a92a1';
  g.font = '600 10px "JetBrains Mono", monospace';
  g.fillText(`CILINDRO ${cyl}`, panelX, 24);
  g.fillStyle = st.color;
  g.font = '800 17px Outfit, Inter, sans-serif';
  g.fillText(st.name.toUpperCase(), panelX, 46);
  g.fillStyle = '#e9ecf2';
  g.font = '700 13px "JetBrains Mono", monospace';
  g.fillText(`${Math.round(phase)}° / 720°`, panelX, 66);
  const desc = {
    intake: ['Baja el pistón', 'y aspira aire', '(+ gasolina).'],
    compression: ['Sube con las', 'válvulas cerradas', 'y comprime 8,5×.'],
    power: ['La chispa', 'enciende la mezcla:', 'empuja el pistón.'],
    exhaust: ['Sube y expulsa', 'los gases hacia', 'el turbo.'],
  }[st.id];
  g.fillStyle = '#b9bfca';
  g.font = '500 11.5px Inter, sans-serif';
  desc.forEach((l, i) => g.fillText(l, panelX, 90 + i * 16));
  g.font = '600 9.5px "JetBrains Mono", monospace';
  g.fillStyle = '#4fb3ff';
  g.fillText('ADM', cx - bore / 2 - 58, deck - 50);
  g.fillStyle = '#ff9a5a';
  g.fillText('ESC', cx + bore / 2 + 34, deck - 50);

  // Tira de 720°
  const sx0 = panelX;
  const sw = w - panelX - 14;
  const sy = h - 34;
  STROKES.forEach((s, i) => {
    g.fillStyle = s.color;
    g.globalAlpha = s.id === st.id ? 1 : 0.35;
    g.fillRect(sx0 + (i * sw) / 4, sy, sw / 4 - 2, 10);
  });
  g.globalAlpha = 1;
  g.fillStyle = '#fff';
  g.fillRect(sx0 + (phase / 720) * sw - 1, sy - 5, 3, 20);
  g.fillStyle = '#8a92a1';
  g.font = '600 8.5px "JetBrains Mono", monospace';
  STROKES.forEach((s, i) => g.fillText(s.short, sx0 + (i * sw) / 4, sy + 24));
  g.restore();
}
