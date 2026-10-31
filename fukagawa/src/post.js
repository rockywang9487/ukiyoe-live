import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// The finish: a breath more contrast, the darks lifted towards indigo like
// old sumi on paper, a soft vignette, a grain so gradients never band. Only
// inside the painting; the page around it keeps its exact colour.
const Finish = {
  uniforms: {
    tDiffuse: { value: null },
    uAperture: { value: new THREE.Vector4(0, 0, 1, 1) }, // x0, y0, x1, y1 in uv
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uLift: { value: 0.02 },
    uLiftColor: { value: new THREE.Vector3(0.16, 0.19, 0.27) },
    uDesat: { value: -0.04 },
    uContrast: { value: 1.04 },
    uVignette: { value: 0.14 },
    uGrain: { value: 0.01 },
    uFilter: { value: 1 },
    uBg: { value: new THREE.Vector3(0.051, 0.055, 0.067) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec4 uAperture;
    uniform vec2 uRes;
    uniform vec3 uLiftColor, uBg;
    uniform float uTime, uLift, uDesat, uContrast, uVignette, uGrain, uFilter;
    varying vec2 vUv;
    float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main() {
      vec2 q = (vUv - uAperture.xy) / (uAperture.zw - uAperture.xy);
      float inside = step(0.0, q.x) * step(q.x, 1.0) * step(0.0, q.y) * step(q.y, 1.0);
      if (inside < 0.5) { gl_FragColor = vec4(uBg, 1.0); return; }
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      float k = uFilter;
      col = mix(col, (col - 0.5) * uContrast + 0.5, k);
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, uLiftColor, uLift * k * (1.0 - lum) * (1.0 - lum));
      col = mix(vec3(lum), col, 1.0 - uDesat * k);
      vec2 e = (q - 0.5) * vec2(1.0, 1.4);
      col *= 1.0 - uVignette * k * smoothstep(0.3, 0.85, length(e));
      col += (hash(vUv * uRes + fract(uTime) * 91.7) - 0.5) * uGrain * k;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function makePost(renderer, scene, camera) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const finish = new ShaderPass(Finish);
  composer.addPass(finish);
  return {
    composer, finish,
    render(dt) { composer.render(dt); },
    setSize(w, h, pr) {
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
      finish.uniforms.uRes.value.set(w * pr, h * pr);
    },
  };
}
