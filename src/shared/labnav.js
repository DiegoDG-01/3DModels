// Píldora de navegación entre laboratorios (arriba, centrada).
import { LABS } from './labs.js';
import './labnav.css';

export function mountLabNav(currentId) {
  if (window.__NO_LABNAV) return null; // p. ej. vistas previas de un solo entorno
  const nav = document.createElement('nav');
  nav.className = 'labnav';
  nav.setAttribute('aria-label', 'Laboratorios');
  const home = document.createElement('a');
  home.href = '../';
  home.className = 'labnav-home';
  home.innerHTML = '<span aria-hidden="true">◂</span> Laboratorios';
  nav.append(home);
  for (const lab of LABS) {
    const a = document.createElement('a');
    a.href = `../${lab.path}`;
    a.textContent = lab.short;
    a.style.setProperty('--lab', lab.accent);
    if (lab.id === currentId) {
      a.className = 'on';
      a.setAttribute('aria-current', 'page');
    }
    nav.append(a);
  }
  document.body.append(nav);
  return nav;
}
