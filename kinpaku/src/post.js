import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// The finish: the plate's glossy resin coat (a soft reflection that slides the
// opposite way to the light), its darkened rim, and a little grain so the
// gradients never band.
const Finish = {
  uniforms: {
    tDiffuse: { value: null },
    uAperture: { value: new THREE.Vector4(0, 0, 1, 1) }, // x0, y0, x1, y1 in uv
    uLight: { value: new THREE.Vector2() },
    uTime: { value: 0 },
    uCoat: { value: 1 },
    uVignette: { value: 1 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec4 uAperture;
    uniform vec2 uLight, uRes;
    uniform float uTime, uCoat, uVignette;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 ap0 = uAperture.xy, ap1 = uAperture.zw;
      vec2 q = (vUv - ap0) / (ap1 - ap0);              // 0..1 inside the window
      float inside = step(0.0, q.x) * step(q.x, 1.0) * step(0.0, q.y) * step(q.y, 1.0);
      vec2 p = q * 2.0 - 1.0;
      float aspect = (ap1.x - ap0.x) * uRes.x / ((ap1.y - ap0.y) * uRes.y);
      // rim darkening like the edge of the lacquered plate
      vec2 e = vec2(p.x, p.y * 0.85);
      float vig = 1.0 - smoothstep(0.55, 1.35, length(e * vec2(1.0, 1.0)));
      vig = mix(1.0, 0.38 + 0.62 * vig, uVignette);
      // resin coat: broad soft reflection opposite the light, plus a faint streak
      vec2 hc = -uLight * vec2(0.55, 0.45);
      vec2 d = (p - hc) * vec2(aspect * 0.5, 1.0);
      float coat = exp(-dot(d, d) * 2.2) * 0.075;
      float streak = exp(-pow((p.x * 0.8 + p.y * 0.55 + uLight.x * 0.4 - 0.15) * 7.0, 2.0)) * 0.03;
      vec3 coatC = vec3(1.0, 0.93, 0.8) * (coat + streak) * uCoat;
      vec3 col = c.rgb * mix(1.0, vig, inside) + coatC * inside;
      float g = hash(vUv * uRes + fract(uTime) * 91.7) - 0.5;
      col += g * 0.012;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function makePost(renderer, scene, camera) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.22, 0.45, 1.6);
  composer.addPass(bloom);
  const finish = new ShaderPass(Finish);
  composer.addPass(finish);
  composer.addPass(new OutputPass());
  return {
    composer, bloom, finish,
    setSize(w, h, pr) {
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
      finish.uniforms.uRes.value.set(w * pr, h * pr);
    },
  };
}
