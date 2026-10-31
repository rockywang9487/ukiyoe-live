import * as THREE from 'three';
import { NOISE, VERTEX } from './materials/shared.js';
import { gridGeometry } from './scene.js';

// The pale indigo cloud bands, redrawn every frame. Nothing here moves the
// painted bitmap: each band is a signed distance field taken from the painting.
//  - the band travels: everything along its edge (lobes, wisps, curls, outline,
//    pigment) slides one period per loop, the top band to the left, the bottom
//    one to the right, while the band's edge line as a whole (its envelope,
//    smoothed from the painting) stays where Utamaro put it. A pixel keeps its
//    depth below (or above) the envelope and reads the band at the column the
//    travel brings to it; the repeating stretch's end is cross-blended into its start
//    so it repeats seamlessly and the loop closes
//  - a lighter flowing field, a ripple along the edge and slowly swelling lobes
//    on top, so nothing slides rigidly
//  - a band swells no further than its limits allow here (never onto a figure);
//    where it draws back, the walls and planks under it were continued
// Then it is painted: the dark outline and the white gofun line along the edge as
// it is now, the lobes' inner lines and the curls (which wind and unwind) from
// distance fields, the pigment travelling with the band, white sand on top.
const fragment = /* glsl */ `
  precision highp float;
  in vec2 vImg;
  in vec2 vPos;
  in float vDepth;
  uniform sampler2D uField, uLimits, uBody, uEnvTex;
  uniform float uEnvStep, uCloudTravel, uTravel, uSrc0, uBlend, uOuter;
  uniform vec2 uSize, uEye;
  uniform float uPhase, uAmp, uDir, uSeed;
  uniform float uCloudFlow, uCloudEdge, uCloudBreath, uCloudSway, uCurl, uCloudSand, uOutline;
  uniform vec4 uCurls[4];         // x, y, radius, phase
  uniform int uNCurls;
  ${NOISE}

  float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

  // noise carried along x: 'periods' lattice cells make one period (about the
  // painting's width), the pattern crosses 'travel' periods per loop and churns
  // 'boil' times per loop, so it closes on the loop exactly
  float flowNoise(vec2 p, float lambda, float periods, float travel, float boil) {
    return pnoise(vec3(p.x / lambda - uDir * uPhase * travel * periods, p.y / lambda, uPhase * boil),
                  vec3(periods, 289.0, max(boil, 1.0)));
  }

  // reads past the painting's edge come back mirrored (the outermost rows are the photograph's edge)
  vec2 mirrorIn(vec2 q) {
    vec2 lo = vec2(6.0), hi = uSize - 6.0;
    q = mix(q, 2.0 * lo - q, step(q, lo));
    q = mix(q, 2.0 * hi - q, step(hi, q));
    return q;
  }

  float sdfAt(vec2 q) {
    vec3 f = texture(uField, clamp(q / uSize, 0.0, 1.0)).rgb;
    float coarse = (f.r - 0.5) * 1020.0;
    float fine = (f.g - 0.5) * 127.0;
    return mix(fine, coarse, smoothstep(50.0, 60.0, abs(fine)));
  }

  // the band's smoothed edge line at column x
  float envAt(float x) {
    int n = textureSize(uEnvTex, 0).x;
    float fx = clamp(x, 0.0, uSize.x - 1.0) / uEnvStep;
    float i0 = floor(fx);
    float a = texelFetch(uEnvTex, ivec2(int(min(i0, float(n - 1))), 0), 0).r;
    float b = texelFetch(uEnvTex, ivec2(int(min(i0 + 1.0, float(n - 1))), 0), 0).r;
    return mix(a, b, fx - i0);
  }

  // the band at a point of its own (source) space: past the painting's outer edge
  // (the top for the top band, the bottom for the bottom one) it is always cloud
  float bandAt(vec2 s) {
    float d = sdfAt(s);
    float outside = uOuter > 0.0 ? (uSize.y - 30.0) - s.y : s.y - 30.0;
    return min(d, outside);
  }

  float smax(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (a - b) / k, 0.0, 1.0); return mix(b, a, h) + k * h * (1.0 - h); }
  float smin(float a, float b, float k) { return -smax(-a, -b, k); }

  // flat flakes of white sand, one in some 24 px cells
  vec4 sand(vec2 q) {
    vec2 cell = floor(q / 24.0);
    vec2 f = fract(q / 24.0);
    float h = hash(cell);
    if (h > 0.16) return vec4(0.0);
    vec2 c = vec2(hash(cell + 3.1), hash(cell + 7.7)) * 0.7 + 0.15;
    float ang = hash(cell + 11.3) * 3.14159;
    float s = mix(0.04, 0.12, hash(cell + 5.9));
    vec2 v = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * (f - c);
    vec2 dd = abs(v) - vec2(s, s * mix(0.45, 1.0, hash(cell + 2.2)));
    float sd = length(max(dd, 0.0)) + min(max(dd.x, dd.y), 0.0);
    float a = 1.0 - smoothstep(0.0, 0.05, sd);
    float glint = 0.94 + 0.06 * sin(dot(uEye, vec2(31.0, 17.0)) * (2.0 + 4.0 * hash(cell + 4.4)) + h * 40.0);
    return vec4(vec3(0.965, 0.958, 0.93) * glint, a);
  }

  void main() {
    vec2 p = vImg;
    float amp = uAmp;

    // a lighter flowing field on top of the travel
    vec2 w = vec2(0.0);
    w.x += 34.0 * flowNoise(p, 525.0, 8.0, 1.0, 2.0) + 14.0 * flowNoise(p + 91.0, 210.0, 20.0, 2.0, 4.0);
    w.y += 16.0 * flowNoise(p + 37.0, 525.0, 8.0, 1.0, 2.0) + 8.0 * flowNoise(p + 53.0, 210.0, 20.0, 2.0, 4.0);
    w.x += uCloudSway * 0.5 * sin(TAU * uPhase + p.y / 380.0 + uSeed);
    w *= uCloudFlow * amp;
    vec2 pw = p - w;

    // the travel: which column of the band this pixel shows now, at its own depth
    // below the band's edge line
    // (the band repeats over [uSrc0, uSrc0 + L + uBlend): its last uBlend px fade into its first)
    float L = uSize.x - uSrc0 - uBlend;
    float u = mod(pw.x - uSrc0 + uDir * uPhase * uTravel * uCloudTravel * L * amp, L);
    float r = pw.y - envAt(pw.x);
    vec2 s1 = vec2(uSrc0 + u, envAt(uSrc0 + u) + r);
    vec2 s2 = vec2(uSrc0 + u + L, envAt(uSrc0 + u + L) + r);
    float k1 = u < uBlend ? smoothstep(0.0, 1.0, u / uBlend) : 1.0;

    // where the edge is now
    float d = mix(bandAt(s2), bandAt(s1), k1);
    d += uCloudEdge * amp * (0.65 * flowNoise(p, 84.0, 50.0, 3.0, 9.0) + 0.35 * flowNoise(p + 19.0, 42.0, 100.0, 4.0, 13.0));
    d += uCloudBreath * amp * flowNoise(p + 7.0, 1050.0, 4.0, 0.0, 2.0);
    vec3 lim = texture(uLimits, clamp(p / uSize, 0.0, 1.0)).rgb;
    // never onto a figure; where a lobe is held back the hold itself ripples and travels
    float hold = 12.0 * amp * flowNoise(p + 23.0, 140.0, 30.0, 3.0, 6.0);
    d = smax(d, sdfAt(p) - lim.r * 255.0 + hold, 26.0);
    float aa = max(fwidth(d), 0.5);
    float cover = 1.0 - smoothstep(-aa, aa, d);
    if (cover < 0.004) discard;

    // the curls wind and unwind where they are in the band
    vec2 c1 = s1, c2 = s2;
    for (int i = 0; i < 4; i++) {
      if (i >= uNCurls) break;
      vec4 c = uCurls[i];
      for (int j = 0; j < 2; j++) {
        vec2 q = j == 0 ? c1 : c2;
        vec2 v = q - c.xy;
        float f = exp(-dot(v, v) / (c.z * c.z));
        float ang = radians(uCurl) * amp * sin(TAU * 3.0 * uPhase + c.w) * f;
        float sc = 1.0 + 0.1 * amp * f * sin(TAU * 2.0 * uPhase + c.w + 1.3);
        q = c.xy + mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * v * sc;
        if (j == 0) c1 = q; else c2 = q;
      }
    }
    float dDark = mix(texture(uField, mirrorIn(c2) / uSize).b, texture(uField, mirrorIn(c1) / uSize).b, k1) * 32.0;
    float dWhite = mix(texture(uLimits, mirrorIn(c2) / uSize).b, texture(uLimits, mirrorIn(c1) / uSize).b, k1) * 32.0;
    float al = max(fwidth(dDark), 0.35);
    float aw = max(fwidth(dWhite), 0.35);
    vec2 q = s1;

    // paint
    vec3 col = mix(texture(uBody, mirrorIn(s2) / uSize).rgb, texture(uBody, mirrorIn(s1) / uSize).rgb, k1);
    float ow = uOutline * (0.8 + 0.4 * (0.5 + 0.5 * flowNoise(p + 3.0, 60.0, 70.0, 3.0, 7.0)));
    float mott = 0.5 + 0.5 * pnoise(vec3(p / 7.0, 0.5), vec3(289.0));
    vec3 ink = mix(vec3(0.20, 0.19, 0.18), vec3(0.33, 0.31, 0.29), mott);
    vec3 gofun = vec3(0.93, 0.945, 0.95);
    float outer = smoothstep(-ow - aa, -ow + aa, d);                       // the dark outline band
    float whiteLine = smoothstep(-ow - 2.6 - aa, -ow - 2.6 + aa, d) * (1.0 - outer);
    float deep = 1.0 - smoothstep(-ow - 5.0, -ow - 3.0, d);                // inner lines stay off the edge
    col = mix(col, gofun, (1.0 - smoothstep(1.1 - aw, 1.1 + aw, dWhite)) * deep);
    col = mix(col, ink, (1.0 - smoothstep(2.5 - al, 2.5 + al, dDark)) * deep);
    col = mix(col, gofun, whiteLine);
    col = mix(col, ink, outer);
    vec4 s = sand(q + uEye * 30.0);
    col = mix(col, s.rgb, s.a * uCloudSand * deep * (1.0 - outer));
    gl_FragColor = vec4(col, cover);
  }
`;

// region each band may occupy (its own edge, plus room to swell), image px
const REGIONS = { top: [-1, -1, -1, 780], bottom: [-1, 1740, -1, -1] };

export function cloudMeshes(shared, C, maps, scene) {
  const [W, H] = scene.size, O = scene.overscan;
  return C.map((c, i) => {
    const r = REGIONS[c.name] || [-1, -1, -1, -1];
    const x0 = -O, x1 = W + O;
    const y0 = r[1] < 0 ? -O : r[1], y1 = r[3] < 0 ? H + O : r[3];
    const geo = gridGeometry([x0, y0, x1 - x0, y1 - y0], { step: 64, depth: () => c.z, def: 0 });
    const curls = [...(c.curls || []).slice(0, 4)];
    while (curls.length < 4) curls.push([0, 0, 1, 0]);
    // the band's edge line, one texel per env_step px, read exactly
    const env = new THREE.DataTexture(new Float32Array(c.env), c.env.length, 1, THREE.RedFormat, THREE.FloatType);
    env.minFilter = env.magFilter = THREE.NearestFilter;
    env.generateMipmaps = false;
    env.needsUpdate = true;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...shared,
        uEnvTex: { value: env },
        uEnvStep: { value: c.env_step },
        uTravel: { value: c.travel ?? 1 },        // band repeats per loop, x the shared travel
        uSrc0: { value: c.src0 ?? 0 },            // where the repeating stretch of the band starts
        uBlend: { value: c.blend ?? 700 },        // px over which its end fades into its start
        uOuter: { value: c.edge === 'bottom' ? 0 : 1 },   // which edge of the painting is the band's own
        uField: { value: maps.field },
        uLimits: { value: maps.limits },
        uBody: { value: maps.body },
        uDir: { value: c.edge === 'bottom' ? 1 : -1 },    // the top band flows right, the bottom one left
        uSeed: { value: i * 2.3 },
        uCurls: { value: curls.map((v) => new THREE.Vector4(...v)) },
        uNCurls: { value: Math.min(4, (c.curls || []).length) },
      },
      vertexShader: VERTEX,
      fragmentShader: fragment,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const m = new THREE.Mesh(geo, mat);
    m.name = 'cloud_' + c.name;
    return m;
  });
}
