import * as THREE from 'three';
import { VERTEX } from './shared.js';

// Light shared by the plate and the cut-outs: the winter light. Outdoors the
// snow light is a touch cooler, indoors the wood a touch warmer (env.b).
export const LIGHT = /* glsl */ `
  uniform sampler2D uEnv;
  uniform vec2 uSize;
  uniform float uCool, uWarm, uFilter;
  vec3 winterLight(vec3 col, vec2 p) {
    float cool = texture(uEnv, clamp(p / uSize, 0.0, 1.0)).b;
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 c = mix(col, col * vec3(0.96, 0.99, 1.04) + vec3(0.0, 0.004, 0.012), uCool * cool * 10.0 * uFilter);
    c = mix(c, c * vec3(1.03, 1.0, 0.95), uWarm * (1.0 - cool) * 10.0 * uFilter * smoothstep(0.15, 0.6, lum));
    return c;
  }
`;

// The painting itself (with what the moving parts hide filled in), on one
// tilted plane, overscanned so parallax never shows past its edge.
const fragment = /* glsl */ `
  precision highp float;
  in vec2 vImg;
  in vec2 vPos;
  in float vDepth;
  uniform sampler2D uPlate;
  uniform float uOver;
  ${LIGHT}
  void main() {
    vec2 uv = (vImg + uOver) / (uSize + 2.0 * uOver);
    vec3 col = texture(uPlate, uv).rgb;
    gl_FragColor = vec4(winterLight(col, vPos), 1.0);
  }
`;

export function plateMaterial(shared, tex) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uPlate: { value: tex } },
    vertexShader: VERTEX,
    fragmentShader: fragment,
    depthTest: false,
    depthWrite: false,
  });
}
