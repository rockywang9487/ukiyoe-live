import * as THREE from 'three';
import { vertexShader, NOISE, LIGHT } from './shared.js';

// The print itself (with what the moving parts hide filled in), on one tilted
// plane, overscanned so parallax never shows past its edge. The black clouds
// are part of it and are redrawn every frame from a distance field: where they
// meet the paper sky their lobes roll along the edge with the wind and whole
// masses swell and draw back; two scales drift at different speeds. Inside,
// the print's own ink; at the edge, the soft grey of the printed gradation.
const fragment = /* glsl */ `
  precision highp float;
  in vec2 vImg;
  in vec2 vPos;
  in float vDepth;
  in float vTilt;
  uniform sampler2D uPlate, uCloudMap;
  uniform float uOver, uPhase, uAmp, uCloudRoll, uCloudSwell;
  uniform vec2 uSize;
  ${NOISE}
  ${LIGHT}

  vec4 clouds(vec2 p, float ph) {
    vec3 m = texture(uCloudMap, p / uSize).rgb;
    float e0 = (m.r - 0.5) * 256.0;                 // working px, < 0 inside the ink
    if (e0 > 90.0) return vec4(0.0);
    float live = min(uAmp, 1.0) * m.g;
    // lobes rolling along with the wind: two scales, two speeds (whole lattice
    // periods per loop, so the loop closes)
    float r1 = pnoise(vec3(p.x / 95.0 - ph * 7.0, p.y / 95.0, ph * 5.0), vec3(7.0, 289.0, 5.0));
    float r2 = pnoise(vec3(p.x / 41.0 - ph * 13.0, p.y / 41.0 + 3.7, ph * 9.0), vec3(13.0, 289.0, 9.0));
    // whole masses swelling and drawing back, slowly
    float sw = pnoise(vec3(p.x / 420.0, p.y / 420.0, ph * 3.0), vec3(289.0, 289.0, 3.0));
    float e = e0 + live * (uCloudRoll * (0.75 * r1 + 0.35 * r2) + uCloudSwell * sw);
    float aa = max(fwidth(e), 0.6);
    float cover = 1.0 - smoothstep(-aa, aa, e);
    // the ink: the print's own tone well inside, an even sumi where it grows
    float deep = smoothstep(-3.0, -12.0, e0);
    float tone = mix(0.075, min(m.b, 0.2), deep);
    // the printed gradation at the edge against the paper: a lighter grey a
    // few px wide (round the dragon and the spray the ink runs right up to them)
    tone += 0.09 * smoothstep(-7.0, 0.0, e) * (1.0 - deep * 0.6) * m.g;
    // the baren's mottle
    tone *= 0.92 + 0.16 * hash12(floor(p * 0.75));
    vec3 col = vec3(tone) * vec3(0.93, 0.97, 1.08);
    return vec4(col, cover);
  }

  void main() {
    vec2 uv = (vImg + uOver) / (uSize + 2.0 * uOver);
    vec3 col = texture(uPlate, uv).rgb;
    vec4 c = clouds(vImg, uPhase * step(0.0, uAmp - 1e-4));
    col = mix(col, c.rgb, c.a);
    gl_FragColor = vec4(overcast(col, vImg, 0.0), 1.0);
  }
`;

export function plateMaterial(shared, tex, cloudMap) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uPlate: { value: tex }, uCloudMap: { value: cloudMap }, uDz: { value: 0 } },
    vertexShader: vertexShader(),
    fragmentShader: fragment,
    depthTest: false,
    depthWrite: false,
  });
}
