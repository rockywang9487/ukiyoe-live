import * as THREE from 'three';
import { NOISE } from './materials/shared.js';

// Snow drawn the way sunago is sprinkled: flat grains of gofun white, each a
// little irregular rectangle or lozenge that turns over as it falls, so it
// flickers between a sliver and a full flake. Three distances: far grains are
// small, slow and pale; middle ones clear and light; a few near ones larger.
// Every flake falls a whole number of times per loop from behind the eave above
// its column and fades out where it lands (a snow-laden branch, or the ground
// behind the lower railing), so the loop closes. Only where it is open air
// (env.r): eaves, pillars and the figures in front hide it.
const vertex = /* glsl */ `
  in vec4 aA;      // x0, y start, y end, layer
  in vec4 aB;      // passes per loop, phase, size px, sway px
  in vec4 aC;      // sway cycles, tumble cycles, seed, alpha
  in float aDz;
  uniform float uPhase, uA, uHalfH, uD, uDepthScale, uZBack, uZFront, uAmp, uSnowSize, uSnowWind;
  uniform vec2 uSize;
  out vec2 vLocal;
  out vec2 vPos;
  out float vAlpha;
  out vec2 vSeed;
  ${NOISE}
  void main() {
    float t = uPhase;
    float f = fract(t * aB.x + aB.y);
    float y0 = aA.y, y1 = aA.z;
    float y = mix(y0, y1, f);
    float sway = aB.w * sin(TAU * aC.x * t + aC.z * TAU);
    // a breeze now and then: three gusts per loop, carrying everything one way a little
    float gust = pow(0.5 + 0.5 * sin(TAU * 3.0 * t + 1.2), 3.0);
    float breeze = uSnowWind * gust * 38.0 * (0.7 + 0.3 * sin(TAU * 2.0 * t + y / 280.0));
    float x = aA.x + sway + breeze;
    // fade in behind the eave, out where it lands
    float alpha = smoothstep(0.0, 0.05, f) * (1.0 - smoothstep(y1 - 16.0, y1, y)) * aC.w;
    alpha *= step(0.001, uAmp);
    float z = (uZBack + (uZFront - uZBack) * (y / uSize.y)) + aDz;
    float Z = z * uDepthScale;
    float k = (uD + Z) / uD;
    vec2 g = vec2(x * uA - 1.0, uHalfH - y * uA);
    // turning over: the flake narrows to a sliver and opens again
    float tumble = mix(0.28, 1.0, abs(cos(TAU * aC.y * t + aC.z * 9.0)));
    float ang = aC.z * 3.14159 + 0.7 * sin(TAU * 0.5 * aC.y * t + aC.z * 5.0);
    vec2 corner = position.xy * vec2(tumble, 1.0);
    corner = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * corner;
    float half_ = 0.5 * aB.z * uSnowSize;
    vec2 off = corner * half_ * uA * vec2(1.0, -1.0);
    vec3 world = vec3((g + off) * k, -Z);
    vLocal = position.xy;
    vPos = vec2(x, y);
    vAlpha = alpha;
    vSeed = vec2(fract(aC.z * 13.7), fract(aC.z * 71.3));
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const fragment = /* glsl */ `
  precision highp float;
  in vec2 vLocal;
  in vec2 vPos;
  in float vAlpha;
  in vec2 vSeed;
  uniform sampler2D uEnv;
  uniform vec2 uSize;
  uniform float uSnow, uSoft;
  void main() {
    vec2 p = vLocal;
    // a cut flake: a rectangle or a lozenge with uneven sides
    float rect = max(abs(p.x) * (0.78 + 0.22 * vSeed.x), abs(p.y) * (0.72 + 0.28 * vSeed.y));
    float loz = (abs(p.x) * (0.8 + 0.2 * vSeed.y) + abs(p.y) * (0.75 + 0.25 * vSeed.x)) * 0.72;
    float d = vSeed.x > 0.45 ? rect : loz;
    float a = 1.0 - smoothstep(1.0 - uSoft, 1.0, d);
    a *= vAlpha * uSnow * texture(uEnv, clamp(vPos / uSize, 0.0, 1.0)).r;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vec3(0.975, 0.97, 0.948), a);
  }
`;

export function snowMeshes(shared, snow, scene) {
  const groups = { snow_back: [], snow_front: [] };
  for (const f of snow.flakes) groups[snow.layers[f[3]].name === 'near' ? 'snow_front' : 'snow_back'].push(f);
  const uniforms = {
    uPhase: shared.uPhase, uA: shared.uA, uHalfH: shared.uHalfH, uD: shared.uD, uDepthScale: shared.uDepthScale,
    uSize: shared.uSize, uAmp: shared.uAmp, uEnv: shared.uEnv,
    uZBack: { value: scene.depth.back }, uZFront: { value: scene.depth.front },
    uSnow: { value: 1 }, uSnowSize: { value: 1 }, uSnowWind: { value: 1 },
  };
  const meshes = Object.entries(groups).map(([name, list]) => {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const A = new Float32Array(list.length * 4), Bv = new Float32Array(list.length * 4);
    const C = new Float32Array(list.length * 4), Dz = new Float32Array(list.length);
    list.forEach((f, i) => {
      const [x0, ys, ye, li, k, ph, size, sway, sn, tn, seed] = f;
      const L = snow.layers[li];
      A.set([x0, ys, ye, li], i * 4);
      Bv.set([k, ph, size, sway], i * 4);
      C.set([sn, tn, seed, L.alpha], i * 4);
      Dz[i] = L.dz || 0;
    });
    g.setAttribute('aA', new THREE.InstancedBufferAttribute(A, 4));
    g.setAttribute('aB', new THREE.InstancedBufferAttribute(Bv, 4));
    g.setAttribute('aC', new THREE.InstancedBufferAttribute(C, 4));
    g.setAttribute('aDz', new THREE.InstancedBufferAttribute(Dz, 1));
    g.instanceCount = list.length;
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...uniforms, uSoft: { value: name === 'snow_front' ? 0.4 : 0.24 } },
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,     // image y runs down, world y up: the quads arrive back-facing
    });
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    return m;
  });
  return { meshes, uniforms };
}
