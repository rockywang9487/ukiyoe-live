import * as THREE from 'three';

// Loose gold in the air: sunago (square dust) and noge (thin slivers of leaf).
// Each flake drifts down slowly at its own depth and flashes as it turns,
// which is what makes the room read as a volume when the view moves.

const vertex = /* glsl */ `
  in vec2 aCorner;
  in vec4 aSeed;   // x, y on the glass (-1..1), depth 0..1, shape/phase
  in vec4 aSeed2;  // fall speed, sway, spin, size
  uniform float uTime, uA, uHalfH, uD, uDepthScale, uDepthLo, uDepthHi;
  out vec2 vCorner;
  out float vFlash;
  out float vShape;
  out float vFade;

  void main() {
    float d = mix(uDepthLo, uDepthHi, aSeed.z);
    float Z = d * uDepthScale;
    float span = 2.0 * uHalfH + 0.2;
    float y = aSeed.y * (uHalfH + 0.1) - uTime * (0.006 + 0.012 * aSeed2.x);
    y = mod(y + uHalfH + 0.1, span) - uHalfH - 0.1;
    float x = aSeed.x * 1.08 + sin(uTime * (0.3 + 0.4 * aSeed2.y) + aSeed.w * 6.28) * 0.02;
    float ang = uTime * (0.6 + 1.6 * aSeed2.z) + aSeed.w * 12.0;
    float turn = sin(ang);
    vFlash = pow(abs(turn), 24.0);
    vShape = step(0.78, fract(aSeed.w * 7.3));
    vec2 size = vec2(1.0, mix(1.0, 0.16, vShape)) * (1.6 + 3.2 * aSeed2.w) * uA * 1.5;
    size.x *= mix(0.25, 1.0, abs(turn));             // edge-on when it turns away
    float c = cos(ang * 0.3), s = sin(ang * 0.3);
    vec2 off = mat2(c, -s, s, c) * (aCorner * size);
    vec2 g = vec2(x, y) + off;
    vec3 world = vec3(g * (uD + Z) / uD, -Z);
    vCorner = aCorner;
    vFade = smoothstep(uHalfH + 0.1, uHalfH - 0.05, abs(y));
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const fragment = /* glsl */ `
  precision highp float;
  in vec2 vCorner;
  in float vFlash;
  in float vShape;
  in float vFade;
  uniform vec3 cBone;
  uniform float uGain;
  void main() {
    vec2 q = abs(vCorner) * 2.0;
    float m = (1.0 - smoothstep(0.7, 1.0, q.x)) * (1.0 - smoothstep(0.7, 1.0, q.y));
    vec3 col = cBone * (0.12 + 3.4 * vFlash);
    gl_FragColor = vec4(col * m * vFade * uGain, 1.0);
  }
`;

export function goldDust(shared, { count, depthLo, depthHi, seed = 1, gain = 1 }) {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('aCorner', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]), 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const a = new Float32Array(count * 4), b = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    a.set([rnd() * 2 - 1, rnd() * 2 - 1, rnd(), rnd()], i * 4);
    b.set([rnd(), rnd(), rnd(), Math.pow(rnd(), 2.5)], i * 4);
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(a, 4));
  geo.setAttribute('aSeed2', new THREE.InstancedBufferAttribute(b, 4));
  geo.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime, uA: shared.uA, uHalfH: shared.uHalfH, uD: shared.uD,
      uDepthScale: shared.uDepthScale, cBone: shared.cBone,
      uDepthLo: { value: depthLo }, uDepthHi: { value: depthHi }, uGain: { value: gain },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}
