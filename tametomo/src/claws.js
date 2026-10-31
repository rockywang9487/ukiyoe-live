import * as THREE from 'three';
import { LIGHT, NOISE } from './materials/shared.js';
import { sampler } from './scene.js';

// Every foam claw on the sea that does not ride a crest line (those are
// src/foam.js): about 1,700 of them, cut whole from the print and packed into
// one atlas, with water filled in under each. Most sit on a wave; a few lie on
// open sea between the layers (on the plate, at the plate's depth). Each claw stays on its wave (skinned
// by the wave's bones at its centre) and churns there in its own way: it
// circles along the lines of the water round it, turns a little and opens and
// closes. Part of that motion is shared: a ripple runs leftward across each
// sea, so whole fields of foam heave together and pass the motion on; the rest
// is each claw's own. The churn grows as its wave stands up. Every rhythm turns
// a whole number of times per loop; with no motion (?amp=0) each claw sits
// exactly where it was printed.

const vertex = /* glsl */ `
  in vec4 aRect;      // x0, y0, w, h: where the claw was printed (working px)
  in vec4 aClaw;      // centre x, y, direction of the water's lines (rad), seed
  in vec2 aAtlas;     // its place in the atlas (px)
  in vec4 aBones;
  in vec4 aWeights;
  in float aZ;        // depth: its wave's, or the plate's at its row
  uniform sampler2D uBoneTex;
  uniform vec2 uAtlasSize;
  uniform float uA, uHalfH, uD, uDepthScale, uPhase, uAmp, uLift;
  uniform float uFoamAmp, uFoamTurn, uFoamSwell, uFoamCycles, uFoamWave;
  out vec2 vUv;
  out vec2 vPos;
  ${NOISE}
  float h1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
  void main() {
    vec2 corner = vec2(position.x + 0.5, 0.5 - position.y);      // 0..1, image axes
    vec2 rest = aRect.xy + corner * aRect.zw;
    float s = aClaw.w, ph = uPhase;
    vec2 dir = vec2(cos(aClaw.z), sin(aClaw.z));
    vec2 nrm = vec2(-dir.y, dir.x);
    // the shared ripple (one period for every claw of the loop, running left)
    // and the claw's own churn (its own whole number of turns per loop)
    float a1 = TAU * (uFoamCycles * ph + (aClaw.x + 0.35 * aClaw.y) / uFoamWave);
    float n2 = 10.0 + floor(h1(s + 1.0) * 9.0);
    float n3 = 8.0 + floor(h1(s + 2.0) * 7.0);
    float a2 = TAU * (n2 * ph + h1(s + 3.0));
    float a3 = TAU * (n3 * ph + h1(s + 4.0));
    float size = sqrt(aRect.z * aRect.w);
    float A = uFoamAmp * clamp(2.5 + 0.25 * size, 4.0, 14.0) * (1.0 + 0.6 * uLift);
    vec2 orbit = A * (0.62 * (dir * cos(a1) + 0.5 * nrm * sin(a1))
                    + 0.38 * (dir * cos(a2) + 0.6 * nrm * sin(a2)));
    float turn = uFoamTurn * (0.55 * sin(a1 + 1.3) + 0.45 * sin(a3));
    float swell = 1.0 + uFoamSwell * (0.5 * sin(a1 + 0.6) + 0.5 * sin(a2 + 2.1));
    vec2 d = (rest - aClaw.xy) * swell;
    float c = cos(turn), sn = sin(turn);
    vec2 moved = aClaw.xy + vec2(c * d.x - sn * d.y, sn * d.x + c * d.y) + orbit;
    moved = mix(rest, moved, uAmp);
    // on its wave: the blended bone transform at the claw's centre, applied to
    // every corner, so the claw rides the wave rigidly
    vec3 acc = vec3(0.0);
    for (int k = 0; k < 4; k++) {
      float w = aWeights[k];
      if (w <= 0.0) continue;
      int b = int(aBones[k] + 0.5);
      vec4 r0 = texelFetch(uBoneTex, ivec2(2 * b, 0), 0);
      vec4 r1 = texelFetch(uBoneTex, ivec2(2 * b + 1, 0), 0);
      acc += w * vec3(r0.x * moved.x + r0.y * moved.y + r0.z, r1.x * moved.x + r1.y * moved.y + r1.z, r0.w);
    }
    float Z = (aZ + acc.z) * uDepthScale;
    vec2 g = vec2(acc.x * uA - 1.0, uHalfH - acc.y * uA);
    vUv = (aAtlas + corner * aRect.zw) / uAtlasSize;
    vPos = acc.xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(g * (uD + Z) / uD, -Z, 1.0);
  }
`;

const fragment = /* glsl */ `
  precision highp float;
  in vec2 vUv;
  in vec2 vPos;
  uniform sampler2D uAtlas;
  uniform float uLift;
  uniform vec2 uSize;
  ${LIGHT}
  void main() {
    vec4 c = texture(uAtlas, vUv);
    if (c.a < 0.004) discard;
    gl_FragColor = vec4(overcast(c.rgb * (1.0 + 0.05 * uLift), vPos, 0.0), c.a);
  }
`;

// layers: name -> { L, maps (ImageData weight maps) }; planeZ(y): the plate's depth
export function clawMeshes(shared, scene, rig, layers, atlasTex, { lift, planeZ }) {
  const C = scene.claws;
  if (!C) return { meshes: {}, update() {} };
  const atlasSize = new THREE.Vector2(...C.atlas);
  const quad = new THREE.PlaneGeometry(1, 1);
  const meshes = {};
  let seed = 0;
  for (const name in C.layers) {
    const list = C.layers[name];
    const onPlate = name === 'plate';
    const { L, maps } = onPlate
      ? { L: { box: [0, 0, ...scene.size], skin: { bones: [], default: null } }, maps: [] }
      : layers[name];
    const named = (L.skin?.bones || []).map((n) => rig.id(n));
    const S = maps.map((m) => sampler(m));
    const def = rig.id(L.skin?.default);
    const [bx, by, bw, bh] = L.box;
    const n = list.length;
    const rect = new Float32Array(n * 4), claw = new Float32Array(n * 4), atlas = new Float32Array(n * 2);
    const bones = new Float32Array(n * 4), weights = new Float32Array(n * 4), depth = new Float32Array(n);
    list.forEach(([x0, y0, w, h, px, py, ang, ax, ay], i) => {
      depth[i] = onPlate ? planeZ(py) : L.z;
      rect.set([x0, y0, w, h], i * 4);
      claw.set([px, py, ang, (seed++ % 997) + 0.5], i * 4);
      atlas.set([ax, ay], i * 2);
      // the wave's skin at the claw's centre, as the wave's own grid has it
      const u = (px - bx) / bw, v = (py - by) / bh;
      const cand = [];
      let sum = 0;
      for (let b = 0; b < named.length; b++) {
        const wv = S[Math.floor(b / 3)](u, v, b % 3);
        if (wv > 0.002) { cand.push([named[b], wv]); sum += wv; }
      }
      if (sum > 1) cand.forEach((c) => (c[1] /= sum));
      if (1 - sum > 0.002) cand.push([def, Math.max(0, 1 - sum)]);
      cand.sort((p, q) => q[1] - p[1]);
      const top = cand.slice(0, 4);
      const tot = top.reduce((t, c) => t + c[1], 0) || 1;
      for (let q = 0; q < 4; q++) {
        bones[i * 4 + q] = top[q] ? top[q][0] : 0;
        weights[i * 4 + q] = top[q] ? top[q][1] / tot : 0;
      }
    });
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    g.setAttribute('aRect', new THREE.InstancedBufferAttribute(rect, 4));
    g.setAttribute('aClaw', new THREE.InstancedBufferAttribute(claw, 4));
    g.setAttribute('aAtlas', new THREE.InstancedBufferAttribute(atlas, 2));
    g.setAttribute('aBones', new THREE.InstancedBufferAttribute(bones, 4));
    g.setAttribute('aWeights', new THREE.InstancedBufferAttribute(weights, 4));
    g.setAttribute('aZ', new THREE.InstancedBufferAttribute(depth, 1));
    g.instanceCount = n;
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared, uAtlas: { value: atlasTex }, uAtlasSize: { value: atlasSize }, uLift: { value: 0 } },
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,      // drawn in image axes (y down): the winding flips
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    meshes[name] = mesh;
  }
  return {
    meshes,
    update(t, amp) {
      for (const name in meshes) meshes[name].material.uniforms.uLift.value = lift(name, t) * Math.min(1, amp);
    },
  };
}
