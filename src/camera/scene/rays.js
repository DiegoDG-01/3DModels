// Trazado de rayos esquemático: desde un punto de la maqueta, a través del diafragma,
// hasta el sensor (o el espejo/visor, o el obturador cerrado).
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { UNIT_MM, DISPLAY_PER_MM, imageDistance } from '../optics.js';
import { AXIS_Y } from './cameraRig.js';
import { glowTexture } from '../../shared/textures.js';

export const POINT_COLORS = { fg: 0xffa14a, mid: 0x5ce1e6, bg: 0xff6fae };
export const POINT_KEYS = ['fg', 'mid', 'bg'];

const RING = 12; // muestras en el borde del diafragma
const PHOTONS_PER_RAY = 2;
const EXAGGERATE = 5; // amplifica el desenfoque para que se vea en el banco

const _v = new THREE.Vector3();

export class RayViz {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'rays';
    scene.add(this.group);
    const glow = glowTexture();
    this.sets = {};
    for (const key of POINT_KEYS) {
      const color = POINT_COLORS[key];
      const mat = new LineMaterial({
        color, linewidth: 1.6, transparent: true, opacity: 0.6,
        blending: THREE.AdditiveBlending, depthWrite: false, worldUnits: false,
      });
      const lines = new LineSegments2(new LineSegmentsGeometry(), mat);
      lines.frustumCulled = false;
      lines.renderOrder = 5;
      const n = (RING + 1) * PHOTONS_PER_RAY;
      const pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const photons = new THREE.Points(pGeo, new THREE.PointsMaterial({
        color, size: 0.13, map: glow, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, sizeAttenuation: true,
      }));
      photons.frustumCulled = false;
      photons.renderOrder = 6;
      const disc = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      disc.add(ring, fill);
      disc.renderOrder = 7;
      const src = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }));
      src.scale.setScalar(0.32);
      src.renderOrder = 8;
      this.group.add(lines, photons, disc, src);
      this.sets[key] = { lines, mat, photons, disc, src, paths: [], hits: [], result: null };
    }
    this.enabled = true;
  }

  setResolution(w, h) {
    for (const s of Object.values(this.sets)) s.mat.resolution.set(w, h);
  }

  setVisible(v) {
    this.enabled = v;
    this.group.visible = v;
  }

  /**
   * ctx: { points, optics, f, focusMm, time }
   * Devuelve por punto: { reachesSensor, viewfinder, blocked, discR, outOfFrame }
   */
  update(ctx) {
    const { points, optics: o, f, focusMm, time } = ctx;
    const out = {};
    for (const key of POINT_KEYS) {
      const set = this.sets[key];
      const pt = points[key];
      if (!pt) continue;
      const res = this.trace(pt.pos, o, f, focusMm);
      set.paths = res.paths;
      out[key] = res;
      if (!this.enabled) continue;

      const seg = [];
      for (const path of res.paths) {
        for (let i = 0; i < path.length - 1; i++) {
          seg.push(path[i].x, path[i].y, path[i].z, path[i + 1].x, path[i + 1].y, path[i + 1].z);
        }
      }
      set.lines.geometry.dispose();
      const g = new LineSegmentsGeometry();
      g.setPositions(seg);
      set.lines.geometry = g;

      // Fotones que viajan por cada rayo
      const arr = set.photons.geometry.attributes.position.array;
      let k = 0;
      res.paths.forEach((path, ri) => {
        const lens = [];
        let L = 0;
        for (let i = 0; i < path.length - 1; i++) {
          const l = path[i].distanceTo(path[i + 1]);
          lens.push(l);
          L += l;
        }
        for (let p = 0; p < PHOTONS_PER_RAY; p++) {
          let d = ((time * 2.4 + ri * 0.53 + p / PHOTONS_PER_RAY) % 1) * L;
          let i = 0;
          while (i < lens.length - 1 && d > lens[i]) d -= lens[i++];
          _v.lerpVectors(path[i], path[i + 1], lens[i] > 0 ? Math.min(1, d / lens[i]) : 0);
          arr[k++] = _v.x;
          arr[k++] = _v.y;
          arr[k++] = _v.z;
        }
      });
      while (k < arr.length) arr[k++] = 1e5;
      set.photons.geometry.attributes.position.needsUpdate = true;

      // Disco (o punto) de luz sobre el sensor
      if (res.hits.length) {
        const c = new THREE.Vector3();
        for (const h of res.hits) c.add(h);
        c.multiplyScalar(1 / res.hits.length);
        let r = 0;
        for (const h of res.hits) r = Math.max(r, Math.hypot(h.y - c.y, h.z - c.z));
        set.disc.visible = true;
        set.disc.position.set(o.sensorX + 0.025, c.y, c.z);
        const pulse = 1 + 0.08 * Math.sin(time * 6);
        set.disc.scale.setScalar(Math.max(0.018, r) * pulse);
        res.discR = r;
      } else {
        set.disc.visible = false;
      }
      set.src.position.copy(pt.pos);
      set.src.material.opacity = 0.75 + 0.25 * Math.sin(time * 3 + key.length);
    }
    return out;
  }

  trace(P, o, f, focusMm) {
    const paths = [];
    const hits = [];
    const res = { paths, hits, reachesSensor: false, viewfinder: false, blocked: false, discR: 0, outOfFrame: false };
    const u = P.x * UNIT_MM;
    if (u <= f * 1.05) return res;
    const O = new THREE.Vector3(0, AXIS_Y, 0);
    const Ls = -o.sensorX;
    const s = DISPLAY_PER_MM;
    const T = new THREE.Vector3(o.sensorX, AXIS_Y - ((P.y - AXIS_Y) / P.x) * f * s, (-P.z / P.x) * f * s);
    res.outOfFrame = Math.abs(T.y - AXIS_Y) > o.imageH / 2 || Math.abs(T.z) > o.imageW / 2;

    let C = null;
    if (!o.pinhole) {
      const v = imageDistance(f, u);
      const vs = imageDistance(f, focusMm);
      let dx = Ls * (1 + (EXAGGERATE * (v - vs)) / vs);
      dx = THREE.MathUtils.clamp(dx, Ls * 0.3, Ls * 3);
      C = O.clone().add(T.clone().sub(O).multiplyScalar(dx / Ls));
      res.convergeX = -dx;
    }

    const samples = [new THREE.Vector3(0, AXIS_Y, 0)];
    for (let i = 0; i < RING; i++) {
      const a = (i / RING) * Math.PI * 2 + 0.2;
      samples.push(new THREE.Vector3(0, AXIS_Y + Math.cos(a) * o.apertureR, Math.sin(a) * o.apertureR));
    }

    for (const A of samples) {
      const path = [P.clone()];
      if (o.flapBlocks) {
        // Tapa cerrada: la luz se queda delante del agujero
        const t = (0.12 - P.x) / (A.x - P.x);
        path.push(P.clone().lerp(A, t));
        paths.push(path);
        res.blocked = true;
        continue;
      }
      path.push(A.clone());
      let d = o.pinhole ? A.clone().sub(P).normalize() : C.clone().sub(A).normalize();
      let cur = A.clone();

      // ¿Espejo réflex en el camino?
      let reflected = false;
      if (o.mirror) {
        const m = o.mirror;
        const denom = d.dot(m.normal);
        if (denom < -1e-4) {
          const t = _v.copy(m.center).sub(cur).dot(m.normal) / denom;
          if (t > 0) {
            const hit = cur.clone().addScaledVector(d, t);
            const local = hit.clone().sub(m.center);
            if (Math.abs(local.dot(m.dir)) <= m.halfLen && Math.abs(local.z) <= m.halfW && hit.x > o.sensorX) {
              path.push(hit);
              d = d.clone().addScaledVector(m.normal, -2 * d.dot(m.normal));
              cur = hit;
              const vf = o.viewfinder;
              if (vf && d.y > 1e-3) {
                const S = cur.clone().addScaledVector(d, (vf.screenY - cur.y) / d.y);
                path.push(S);
                path.push(new THREE.Vector3(vf.prismTop.x, vf.prismTop.y, S.z * 0.4));
                path.push(new THREE.Vector3(vf.eye.x, vf.eye.y, S.z * 0.1));
              }
              reflected = true;
              res.viewfinder = true;
            }
          }
        }
      }
      if (!reflected) {
        if (o.shutterBlocks && o.shutterX != null && d.x < 0) {
          path.push(cur.clone().addScaledVector(d, (o.shutterX - cur.x) / d.x));
          res.blocked = true;
        } else if (d.x < 0) {
          const hit = cur.clone().addScaledVector(d, (o.sensorX - cur.x) / d.x);
          path.push(hit);
          hits.push(hit);
          res.reachesSensor = true;
        }
      }
      paths.push(path);
    }
    return res;
  }
}
