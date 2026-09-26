import { LABS } from '../shared/labs.js';

const ICONS = {
  camera: `<svg viewBox="0 0 120 120" aria-hidden="true">
    <circle cx="60" cy="60" r="46" fill="none" stroke="currentColor" stroke-width="6"/>
    <circle cx="60" cy="60" r="34" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="2"/>
    ${Array.from({ length: 9 }, (_, i) => {
      const a = (i / 9) * Math.PI * 2;
      const x1 = 60 + Math.cos(a) * 14, y1 = 60 + Math.sin(a) * 14;
      const x2 = 60 + Math.cos(a + 0.9) * 34, y2 = 60 + Math.sin(a + 0.9) * 34;
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="currentColor" stroke-width="2.5"/>`;
    }).join('')}
    <circle cx="60" cy="60" r="12" fill="currentColor" fill-opacity=".9"/>
  </svg>`,
  engine: `<svg viewBox="0 0 120 120" aria-hidden="true">
    <rect x="34" y="14" width="52" height="58" rx="4" fill="none" stroke="currentColor" stroke-width="6"/>
    <rect x="42" y="36" width="36" height="22" rx="3" fill="currentColor" fill-opacity=".9"/>
    <line x1="60" y1="58" x2="48" y2="92" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
    <circle cx="60" cy="96" r="16" fill="none" stroke="currentColor" stroke-opacity=".4" stroke-width="3"/>
    <circle cx="48" cy="92" r="5" fill="currentColor"/>
    <path d="M40 22 h8 M72 22 h8" stroke="currentColor" stroke-width="4"/>
  </svg>`,
};

const grid = document.getElementById('labs');
for (const lab of LABS) {
  const a = document.createElement('a');
  a.className = 'card';
  a.href = `./${lab.path}`;
  a.style.setProperty('--accent', lab.accent);
  a.innerHTML = `
    <div class="art">${ICONS[lab.id] ?? ''}</div>
    <div class="body">
      <div class="kicker">${lab.kicker}</div>
      <h2>${lab.name}</h2>
      <p>${lab.desc}</p>
      <ul>${lab.tags.map((t) => `<li>${t}</li>`).join('')}</ul>
      <span class="go">Abrir laboratorio <b aria-hidden="true">→</b></span>
    </div>`;
  grid.append(a);
}
const soon = document.createElement('div');
soon.className = 'card soon';
soon.innerHTML = `<div class="body"><div class="kicker">Próximamente</div><h2>Nuevo laboratorio</h2>
  <p>La estructura admite más entornos: cada uno vive en su propia carpeta y se registra en <code>src/shared/labs.js</code>.</p></div>`;
grid.append(soon);
