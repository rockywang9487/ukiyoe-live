import * as THREE from 'three';
import { NOISE } from './materials/shared.js';

// Black cloud passing in front of the dragon: a few masses of flat sumi that
// drift slowly across its coils, gather, roll their lobes over and thin away
// again, so a stretch of scales, a claw or the tail is hidden and then shown.
// They never reach the head. Each mass is a union of lobes turning about its
// centre with a ragged edge and the print's lighter grey at the rim. Paths and
// lives are whole cycles per loop.
const vertex = /* glsl */ `
  uniform vec4 uRect;          // x0, y0, w, h (image px)
  uniform float uZ, uA, uHalfH, uD, uDepthScale;
  out vec2 vLocal;             // px from the puff's centre
  void main() {
    vec2 p = uRect.xy + (position.xy * vec2(1.0, -1.0) + 0.5) * uRect.zw;
    float Z = uZ * uDepthScale;
    vec2 g = vec2(p.x * uA - 1.0, uHalfH - p.y * uA);
    vLocal = (position.xy * vec2(1.0, -1.0)) * uRect.zw;
    gl_Position = projectionMatrix * viewMatrix * vec4(g * (uD + Z) / uD, -Z, 1.0);
  }
`;

const fragment = /* glsl */ `
  precision highp float;
  in vec2 vLocal;
  uniform vec2 uCentre;        // current centre relative to the rect centre (px)
  uniform float uR, uRoll, uSwell, uAlpha, uSeed, uPhase;
  ${NOISE}
  float h1(float n) { return fract(sin(n * 127.1 + uSeed * 31.7) * 43758.5453); }
  void main() {
    // an elongated body with a scalloped rim: lobes of different sizes all round
    // it, as Kuniyoshi cuts his storm clouds; the rim's lobes roll slowly round
    vec2 p = vLocal - uCentre;
    vec2 e = p / vec2(1.0, 0.62);
    float d = length(e) - uR * (0.55 + 0.04 * uSwell);
    for (int i = 0; i < 15; i++) {
      float fi = float(i);
      float a = uRoll + fi * 0.4189 + 0.25 * (h1(fi) - 0.5);
      float rr = uR * (0.18 + 0.16 * h1(fi + 7.0)) * (1.0 + 0.12 * uSwell * sin(fi * 1.9 + uPhase * 12.566));
      vec2 c = vec2(cos(a), sin(a) * 0.62) * uR * (0.6 + 0.12 * h1(fi + 3.0));
      d = min(d, length(p - c) - rr);
    }
    d += 2.5 * pnoise(vec3(p / 14.0 + uSeed, uPhase * 6.0), vec3(289.0, 289.0, 6.0));
    float aa = max(fwidth(d), 0.7);
    float cover = 1.0 - smoothstep(-aa, aa, d);
    if (cover * uAlpha < 0.004) discard;
    // sumi, with the print's lighter grey just inside the rim
    float tone = 0.065 + 0.075 * smoothstep(-6.0, 0.0, d);
    tone *= 0.92 + 0.16 * hash12(floor(vLocal * 0.75 + uSeed * 31.0));
    gl_FragColor = vec4(vec3(tone) * vec3(0.93, 0.97, 1.08), cover * uAlpha);
  }
`;

// puffs: [{ path: [[x, y], [x, y]] (working px), r, z, trips, phase, life }]
export function puffMeshes(shared, puffs, LOOP) {
  return puffs.map((pf, i) => {
    const pad = pf.r * 1.6;
    const xs = pf.path.map((p) => p[0]), ys = pf.path.map((p) => p[1]);
    const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
    const w = Math.max(...xs) + pad - x0, h = Math.max(...ys) + pad - y0;
    const u = {
      uA: shared.uA, uHalfH: shared.uHalfH, uD: shared.uD, uDepthScale: shared.uDepthScale, uPhase: shared.uPhase,
      uRect: { value: new THREE.Vector4(x0, y0, w, h) }, uZ: { value: pf.z },
      uCentre: { value: new THREE.Vector2() }, uR: { value: pf.r }, uRoll: { value: 0 }, uSwell: { value: 0 },
      uAlpha: { value: 0 }, uSeed: { value: i * 3.7 + 1.3 },
    };
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: u, vertexShader: vertex, fragmentShader: fragment, transparent: true, depthTest: false, depthWrite: false,
      side: THREE.DoubleSide,     // drawn in image axes (y down): the winding flips
    }));
    mesh.frustumCulled = false;
    mesh.name = 'puff' + i;
    const cx = x0 + w / 2, cy = y0 + h / 2;
    const update = (t, amp) => {
      const ph = t / LOOP;
      // there and back along its path, a whole number of times per loop
      const s = 0.5 - 0.5 * Math.cos(2 * Math.PI * (ph * pf.trips + pf.phase));
      const [a, b] = pf.path;
      u.uCentre.value.set(a[0] + (b[0] - a[0]) * s - cx, a[1] + (b[1] - a[1]) * s - cy);
      u.uRoll.value = 2 * Math.PI * (ph * (pf.roll ?? 1)) + i;
      u.uSwell.value = Math.sin(2 * Math.PI * (ph * pf.trips * 2 + pf.phase));
      // gathers and thins away: present for part of each trip
      const life = Math.sin(Math.PI * ((ph * pf.trips * (pf.lives ?? 1) + pf.phase * 1.7) % 1));
      u.uAlpha.value = Math.min(1, amp) * Math.min(1, Math.max(0, life * 1.6 - 0.15));
    };
    return { mesh, update };
  });
}
