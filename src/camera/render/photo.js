// "Revelado" de la foto: renderiza la maqueta desde el centro óptico y aplica
// profundidad de campo física (círculo de confusión real), exposición, ruido y trepidación.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UNIT_MM } from '../optics.js';
import { AXIS_Y } from '../scene/cameraRig.js';

const quadVS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Bokeh por "gather" en espiral dorada (basado en la técnica de D. Gustafsson).
const dofFS = /* glsl */ `
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 texel;
uniform float cameraNear;
uniform float cameraFar;
uniform float focusDist;   // unidades de escena
uniform float cocScale;    // diámetro del disco en píxeles cuando |u-uf|/u = 1
uniform float baseBlur;    // desenfoque constante (difracción del estenopo)
uniform float maxBlur;     // radio máximo en píxeles
varying vec2 vUv;
const float GOLDEN = 2.39996323;
const float RAD_SCALE = 0.75;

float linDepth(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  return -perspectiveDepthToViewZ(d, cameraNear, cameraFar);
}
float blurSize(float z) {
  float c = cocScale * abs(z - focusDist) / max(z, 1e-3);
  return clamp(c * 0.5 + baseBlur, 0.0, maxBlur);
}
void main() {
  float cz = linDepth(vUv);
  float cs = blurSize(cz);
  vec3 col = texture2D(tColor, vUv).rgb;
  float tot = 1.0;
  float radius = RAD_SCALE;
  for (int i = 0; i < 600; i++) {
    if (radius >= maxBlur) break;
    float ang = float(i) * GOLDEN;
    vec2 tc = vUv + vec2(cos(ang), sin(ang)) * texel * radius;
    vec3 sc = texture2D(tColor, tc).rgb;
    float sz = linDepth(tc);
    float ss = blurSize(sz);
    if (sz > cz) ss = clamp(ss, 0.0, cs * 2.0);
    float m = smoothstep(radius - 0.5, radius + 0.5, ss);
    col += mix(col / tot, sc, m);
    tot += 1.0;
    radius += RAD_SCALE / radius;
  }
  gl_FragColor = vec4(col / tot, 1.0);
}
`;

const finishFS = /* glsl */ `
uniform sampler2D tDof;
uniform vec2 texel;
uniform float exposure;
uniform vec2 shake;
uniform float noise;
uniform float film;
uniform float seed;
uniform float vignette;
varying vec2 vUv;

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21) + seed);
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
void main() {
  vec3 c = vec3(0.0);
  const int TAPS = 15;
  for (int i = 0; i < TAPS; i++) {
    float t = float(i) / float(TAPS - 1) - 0.5;
    c += texture2D(tDof, vUv + shake * texel * t).rgb;
  }
  c /= float(TAPS);
  c *= exposure;
  vec2 q = vUv - 0.5;
  c *= 1.0 - vignette * dot(q, q) * 2.0;
  if (film > 0.5) {
    c *= vec3(1.07, 1.0, 0.86);
    c = c * 0.95 + 0.01;
  }
  c = aces(c);
  vec2 px = floor(vUv / texel);
  float n = hash(px) - 0.5;
  vec3 nc = film > 0.5 ? vec3(n) : mix(vec3(n), vec3(hash(px + 17.0), hash(px + 71.0), hash(px + 131.0)) - 0.5, 0.55);
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  c += nc * noise * (1.25 - lum);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

export const PHOTO_W = 720;
export const PHOTO_H = 480;

export class PhotoPipeline {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    const w = PHOTO_W;
    const h = PHOTO_H;
    this.w = w;
    this.h = h;
    this.cam = new THREE.PerspectiveCamera(27, w / h, 0.08, 150);
    this.cam.layers.set(1);
    this.cam.layers.enable(2);
    this.cam.position.set(0, AXIS_Y, 0);
    this.cam.lookAt(10, AXIS_Y, 0);

    const depth = new THREE.DepthTexture(w, h);
    depth.type = THREE.UnsignedIntType;
    this.rtScene = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthTexture: depth, samples: 4 });
    this.rtDof = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false });
    this.rtPhoto = this.makeTarget(w, h);

    this.dof = new FullScreenQuad(new THREE.ShaderMaterial({
      vertexShader: quadVS,
      fragmentShader: dofFS,
      uniforms: {
        tColor: { value: this.rtScene.texture },
        tDepth: { value: depth },
        texel: { value: new THREE.Vector2(1 / w, 1 / h) },
        cameraNear: { value: this.cam.near },
        cameraFar: { value: this.cam.far },
        focusDist: { value: 5 },
        cocScale: { value: 0 },
        baseBlur: { value: 0 },
        maxBlur: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    }));
    this.finish = new FullScreenQuad(new THREE.ShaderMaterial({
      vertexShader: quadVS,
      fragmentShader: finishFS,
      uniforms: {
        tDof: { value: this.rtDof.texture },
        texel: { value: new THREE.Vector2(1 / w, 1 / h) },
        exposure: { value: 1 },
        shake: { value: new THREE.Vector2() },
        noise: { value: 0 },
        film: { value: 0 },
        seed: { value: 0 },
        vignette: { value: 0.25 },
      },
      depthTest: false,
      depthWrite: false,
    }));
  }

  makeTarget(w = this.w, h = this.h) {
    const rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false, colorSpace: THREE.SRGBColorSpace });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    return rt;
  }

  /**
   * p: { f, N, focusMm, sensorW, sensorH, exposure, noise, film, pinhole, shake:[x,y] px, sky, fog }
   */
  render(p, target = this.rtPhoto) {
    const r = this.renderer;
    const scene = this.scene;
    const cam = this.cam;
    cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(p.sensorH / 2 / p.f));
    cam.aspect = p.sensorW / p.sensorH;
    cam.updateProjectionMatrix();

    const prevBg = scene.background;
    const prevFog = scene.fog;
    const prevTarget = r.getRenderTarget();
    scene.background = p.sky ?? null;
    scene.fog = p.fog ?? null;
    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(scene, cam);
    scene.background = prevBg;
    scene.fog = prevFog;

    const du = this.dof.material.uniforms;
    const focus = Math.max(p.focusMm, p.f * 1.05);
    du.focusDist.value = focus / UNIT_MM;
    if (p.pinhole) {
      du.cocScale.value = 0;
      du.baseBlur.value = 1.4;
    } else {
      du.cocScale.value = ((p.f / p.N) * (p.f / (focus - p.f)) / p.sensorW) * this.w;
      du.baseBlur.value = 0;
    }
    du.maxBlur.value = Math.min(22, du.cocScale.value * 0.5 * 1.6 + du.baseBlur.value + 0.01);
    r.setRenderTarget(this.rtDof);
    this.dof.render(r);

    const fu = this.finish.material.uniforms;
    fu.exposure.value = p.exposure;
    fu.noise.value = p.noise;
    fu.film.value = p.film ? 1 : 0;
    fu.seed.value = Math.random() * 10;
    fu.shake.value.set(p.shake?.[0] ?? 0, p.shake?.[1] ?? 0);
    fu.vignette.value = p.pinhole ? 0.9 : p.film ? 0.35 : 0.2;
    r.setRenderTarget(target);
    this.finish.render(r);
    r.setRenderTarget(prevTarget);
  }

  /** Lee un render target a un <canvas> (para el carrete). */
  toCanvas(target = this.rtPhoto, scale = 1) {
    const w = target.width;
    const h = target.height;
    const buf = new Uint8Array(w * h * 4);
    this.renderer.readRenderTargetPixels(target, 0, 0, w, h, buf);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const src = (h - 1 - y) * w * 4;
      img.data.set(buf.subarray(src, src + w * 4), y * w * 4);
    }
    g.putImageData(img, 0, 0);
    if (scale === 1) return c;
    const s = document.createElement('canvas');
    s.width = Math.round(w * scale);
    s.height = Math.round(h * scale);
    s.getContext('2d').drawImage(c, 0, 0, s.width, s.height);
    return s;
  }
}
