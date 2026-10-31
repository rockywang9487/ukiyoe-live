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
    uPhase: { value: 0 },
    uLoop: { value: 60 },
    uAmp: { value: 1 },            // global motion multiplier (?amp=0 freezes everything)
    uFilter: { value: 1 },         // global multiplier for light and grade (?raw=1 turns it off)
    uEye: { value: new THREE.Vector2(0, 0) },   // eye offset, world units (for sheen and sand)
    uEnv: { value: null },         // R outdoors, G cloud calm, B cool light

    // clouds (redrawn every frame, see src/clouds.js)
    uCloudTravel: { value: 1 },     // band lengths the clouds travel per loop (whole numbers)
    uCloudFlow: { value: 1.0 },     // the flowing field on top, x its default strength (34 + 14 px)
    uCloudEdge: { value: 18.0 },    // px, the ripple running over the edge
    uCloudBreath: { value: 40.0 },  // px, whole lobes swelling and shrinking
    uCloudSway: { value: 46.0 },    // px, the band drifting and coming back
    uCurl: { value: 35.0 },         // degrees the curls wind and unwind
    uCloudSand: { value: 1.0 },     // the white sand sprinkled on the clouds
    uOutline: { value: 5.0 },       // px, the dark outline

    // light
    uCool: { value: 0.06 },         // snow light outdoors
    uWarm: { value: 0.035 },        // lamplight on the wood indoors
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

  const float TAU = 6.28318530718;
`;

// Skinned, depth-placed vertex: each vertex of a grid is skinned by up to four
// bones in image space (their transforms are read from a float texture), then
// put on the ray from the rest eye through its spot on the glass, so at rest
// every layer lines up with the painting exactly.
export const VERTEX = /* glsl */ `
  in vec2 aImg;
  in vec4 aBones;
  in vec4 aWeights;
  in float aDepth;
  uniform sampler2D uBoneTex;
  uniform float uA, uHalfH, uD, uDepthScale;
  out vec2 vImg;     // rest position: where to read the texture
  out vec2 vPos;     // posed position: where to read the maps
  out float vDepth;
  void main() {
    vec3 acc = vec3(0.0);
    for (int k = 0; k < 4; k++) {
      float w = aWeights[k];
      if (w <= 0.0) continue;
      int b = int(aBones[k] + 0.5);
      vec4 r0 = texelFetch(uBoneTex, ivec2(2 * b, 0), 0);
      vec4 r1 = texelFetch(uBoneTex, ivec2(2 * b + 1, 0), 0);
      acc += w * vec3(r0.x * aImg.x + r0.y * aImg.y + r0.z, r1.x * aImg.x + r1.y * aImg.y + r1.z, r0.w);
    }
    float d = aDepth + acc.z;
    float Z = d * uDepthScale;
    vec2 g = vec2(acc.x * uA - 1.0, uHalfH - acc.y * uA);
    vec3 world = vec3(g * (uD + Z) / uD, -Z);
    vImg = aImg;
    vPos = acc.xy;
    vDepth = d;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;
