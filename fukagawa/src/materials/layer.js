import * as THREE from 'three';
import { VERTEX } from './shared.js';
import { LIGHT } from './plate.js';

// A cut-out (a figure, an arm, the cat, a sparrow): its own pixels, skinned by
// the rig, in the same light as the plate.
const fragment = /* glsl */ `
  precision highp float;
  in vec2 vImg;
  in vec2 vPos;
  in float vDepth;
  uniform sampler2D uColor;
  uniform vec4 uBox;          // x0, y0, w, h in image px
  uniform float uOpacity;
  ${LIGHT}
  void main() {
    vec4 c = texture(uColor, (vImg - uBox.xy) / uBox.zw);
    if (c.a < 0.004) discard;
    gl_FragColor = vec4(winterLight(c.rgb, vPos), c.a * uOpacity);
  }
`;

export function layerMaterial(shared, tex, box) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uColor: { value: tex }, uBox: { value: new THREE.Vector4(...box) }, uOpacity: { value: 1 } },
    vertexShader: VERTEX,
    fragmentShader: fragment,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
}
