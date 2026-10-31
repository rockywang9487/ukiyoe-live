import * as THREE from 'three';

// Shared uniforms: one object referenced by every material, so one write per
// frame updates them all. Every time-varying term reads uPhase = t / LOOP and
// turns a whole number of times per loop, so t = LOOP and t = 0 are the same frame.
export function sharedUniforms(scene, rig, geo) {
  const v2 = (a) => new THREE.Vector2(a[0], a[1]);
  return {
    uBoneTex: { value: rig.texture },
    uA: { value: geo.A },
    uHalfH: { value: geo.halfH },
    uD: { value: geo.D },
    uDepthScale: { value: geo.depthScale },
    uSize: { value: v2(scene.size) },
    uOver: { value: scene.overscan },
    uZBack: { value: scene.depth.back },
    uZFront: { value: scene.depth.front },
    uPhase: { value: 0 },
    uLoop: { value: 60 },
    uAmp: { value: 1 },            // global motion multiplier (?amp=0 freezes everything)
    uFilter: { value: 1 },         // global multiplier for light and grade (?raw=1 turns it off)
    uEye: { value: new THREE.Vector2(0, 0) },

    // the foam claws on the waves (src/claws.js)
    uFoamAmp: { value: 1.0 },       // how far they circle, x their size-based default (4-14 px)
    uFoamTurn: { value: 0.17 },     // radians they turn
    uFoamSwell: { value: 0.1 },     // how much they open and close
    uFoamCycles: { value: 12 },     // the ripple running across the foam: turns per loop (whole)
    uFoamWave: { value: 300 },      // its wavelength, px

    // the black clouds
    uCloudMap: { value: null },
    uCloudRoll: { value: 26.0 },    // px, lobes rolling along the clouds' edges
    uCloudSwell: { value: 18.0 },   // px, whole masses swelling and drawing back

    // light
    uLight: { value: 1.0 },         // the overcast: a little more light from above
    uShadow: { value: 0.22 },       // contact shadows under the cut-outs
  };
}

export const NOISE = /* glsl */ `
  // Classic Perlin noise, periodic variant (Stefan Gustavson, MIT licence).
  // rep sets the lattice period per axis; 289.0 means "not periodic".
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  vec3 fade3(vec3 t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

  float pnoise(vec3 P, vec3 rep) {
    vec3 Pi0 = mod(floor(P), rep);
    vec3 Pi1 = mod(Pi0 + vec3(1.0), rep);
    Pi0 = mod289(Pi0);
    Pi1 = mod289(Pi1);
    vec3 Pf0 = fract(P);
    vec3 Pf1 = Pf0 - vec3(1.0);
    vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
    vec4 iy = vec4(Pi0.yy, Pi1.yy);
    vec4 iz0 = Pi0.zzzz;
    vec4 iz1 = Pi1.zzzz;
    vec4 ixy = permute(permute(ix) + iy);
    vec4 ixy0 = permute(ixy + iz0);
    vec4 ixy1 = permute(ixy + iz1);
    vec4 gx0 = ixy0 * (1.0 / 7.0);
    vec4 gy0 = fract(floor(gx0) * (1.0 / 7.0)) - 0.5;
    gx0 = fract(gx0);
    vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
    vec4 sz0 = step(gz0, vec4(0.0));
    gx0 -= sz0 * (step(0.0, gx0) - 0.5);
    gy0 -= sz0 * (step(0.0, gy0) - 0.5);
    vec4 gx1 = ixy1 * (1.0 / 7.0);
    vec4 gy1 = fract(floor(gx1) * (1.0 / 7.0)) - 0.5;
    gx1 = fract(gx1);
    vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
    vec4 sz1 = step(gz1, vec4(0.0));
    gx1 -= sz1 * (step(0.0, gx1) - 0.5);
    gy1 -= sz1 * (step(0.0, gy1) - 0.5);
    vec3 g000 = vec3(gx0.x, gy0.x, gz0.x);
    vec3 g100 = vec3(gx0.y, gy0.y, gz0.y);
    vec3 g010 = vec3(gx0.z, gy0.z, gz0.z);
    vec3 g110 = vec3(gx0.w, gy0.w, gz0.w);
    vec3 g001 = vec3(gx1.x, gy1.x, gz1.x);
    vec3 g101 = vec3(gx1.y, gy1.y, gz1.y);
    vec3 g011 = vec3(gx1.z, gy1.z, gz1.z);
    vec3 g111 = vec3(gx1.w, gy1.w, gz1.w);
    vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
    g000 *= norm0.x; g010 *= norm0.y; g100 *= norm0.z; g110 *= norm0.w;
    vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
    g001 *= norm1.x; g011 *= norm1.y; g101 *= norm1.z; g111 *= norm1.w;
    float n000 = dot(g000, Pf0);
    float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
    float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
    float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
    float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
    float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
    float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
    float n111 = dot(g111, Pf1);
    vec3 f = fade3(Pf0);
    vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), f.z);
    vec2 n_yz = mix(n_z.xy, n_z.zw, f.y);
    return 2.2 * mix(n_yz.x, n_yz.y, f.x);
  }

  // noise in space that evolves through 'cycles' lattice cells per loop and returns
  float loopNoise(vec2 p, float ph, float cycles) {
    return pnoise(vec3(p, ph * cycles), vec3(289.0, 289.0, cycles));
  }

  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

  const float TAU = 6.28318530718;
`;

// Paper and light shared by everything printed: the overcast comes a touch
// more from above, so the upper faces of the sea and the hulls hold a little
// more light than the troughs; where a piece moves away from its rest place the
// change of light follows it (vTilt).
export const LIGHT = /* glsl */ `
  uniform float uLight, uFilter;
  vec3 overcast(vec3 col, vec2 p, float tilt) {
    float k = uLight * uFilter;
    float top = 1.0 - p.y / uSize.y;
    vec3 c = col * (1.0 + k * (0.035 * (top - 0.5) + tilt));
    return c;
  }
`;

// Cloth in the wind (the sail): ripples run across it the way the wind blows,
// bigger towards its free edge and nothing where it hangs from the spar; each
// ripple lifts the cloth across its run and catches the light on its slope.
// uClothA: anchor x (image px; the cloth is held right of it), falloff span,
// direction the ripples run (radians), wavelength. uClothB: amplitude px, turns
// per loop (whole), light on the slopes, 0. uClothPin: x and span over which
// the ripples fade in from a pinned edge (where the sail meets a seam).
const CLOTH = /* glsl */ `
  uniform vec4 uClothA, uClothB;
  uniform vec2 uClothPin;
  uniform float uPhase, uAmp;
  out float vCloth;
  vec2 cloth(vec2 rest) {
    vec2 dir = vec2(cos(uClothA.z), sin(uClothA.z));
    vec2 nrm = vec2(-dir.y, dir.x);
    float w = clamp((uClothA.x - rest.x) / uClothA.y, 0.0, 1.0);
    w = w * w * (3.0 - 2.0 * w);
    w *= smoothstep(uClothPin.x, uClothPin.x + uClothPin.y, rest.x);
    float s = dot(rest, dir) / uClothA.w;
    float a1 = 6.28318530718 * (uClothB.y * uPhase - s);
    float a2 = 6.28318530718 * (2.0 * uClothB.y * uPhase - 1.7 * s + 0.3);
    vCloth = uClothB.z * w * (cos(a1) + 0.35 * cos(a2)) * min(uAmp, 1.0);
    return nrm * uClothB.x * w * (sin(a1) + 0.35 * sin(a2)) * uAmp;
  }
`;

// Skinned, depth-placed vertex: each vertex of a grid is skinned by up to four
// bones in image space (their transforms are read from a float texture), then
// put on the ray from the rest eye through its spot on the glass, so at rest
// every layer lines up with the print exactly. vTilt is how far its bones have
// turned it (the light follows). With cloth, the wind's ripples move it too.
export function vertexShader({ cloth = false } = {}) {
  return /* glsl */ `
  in vec2 aImg;
  in vec4 aBones;
  in vec4 aWeights;
  in float aDepth;
  uniform sampler2D uBoneTex;
  uniform float uA, uHalfH, uD, uDepthScale, uDz;
  out vec2 vImg;     // rest position: where to read the texture
  out vec2 vPos;     // posed position: where to read the maps
  out float vDepth;
  out float vTilt;
  ${cloth ? CLOTH : ''}
  void main() {
    vec3 acc = vec3(0.0);
    float tilt = 0.0;
    for (int k = 0; k < 4; k++) {
      float w = aWeights[k];
      if (w <= 0.0) continue;
      int b = int(aBones[k] + 0.5);
      vec4 r0 = texelFetch(uBoneTex, ivec2(2 * b, 0), 0);
      vec4 r1 = texelFetch(uBoneTex, ivec2(2 * b + 1, 0), 0);
      acc += w * vec3(r0.x * aImg.x + r0.y * aImg.y + r0.z, r1.x * aImg.x + r1.y * aImg.y + r1.z, r0.w);
      tilt += w * r1.x;            // sin of the bone's world turn (d = s * sx)
    }
    ${cloth ? 'acc.xy += cloth(aImg);' : ''}
    float d = aDepth + acc.z + uDz;
    float Z = d * uDepthScale;
    vec2 g = vec2(acc.x * uA - 1.0, uHalfH - acc.y * uA);
    vec3 world = vec3(g * (uD + Z) / uD, -Z);
    vImg = aImg;
    vPos = acc.xy;
    vDepth = d;
    vTilt = tilt;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;
}
