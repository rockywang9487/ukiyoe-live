import * as THREE from 'three';
import { vertexShader, NOISE, LIGHT } from './shared.js';

// A cut-out (a figure, a hull, the dragon, a tengu): its own pixels, skinned by
// the rig, in the same overcast light as the plate; a bone that turns the piece
// toward the light brightens it a little, away darkens it. Cloth (the sail) also
// catches the light on the slopes of its ripples.
const figureFragment = (cloth) => /* glsl */ `
  precision highp float;
  in vec2 vImg;
  in vec2 vPos;
  in float vDepth;
  in float vTilt;
  ${cloth ? 'in float vCloth;' : ''}
  uniform sampler2D uColor;
  uniform vec4 uBox;
  uniform float uOpacity, uTiltLight;
  uniform vec2 uSize;
  ${LIGHT}
  void main() {
    vec4 c = texture(uColor, (vImg - uBox.xy) / uBox.zw);
    if (c.a < 0.004) discard;
    vec3 col = c.rgb${cloth ? ' * (1.0 + vCloth)' : ''};
    gl_FragColor = vec4(overcast(col, vPos, -vTilt * uTiltLight), c.a * uOpacity);
  }
`;

// A wave: its own pixels (its crest foam lifted off: see src/foam.js); the
// foam left on it catches a little more light as it stands up.
const waveFragment = /* glsl */ `
  precision highp float;
  in vec2 vImg;
  in vec2 vPos;
  in float vDepth;
  in float vTilt;
  uniform sampler2D uColor;
  uniform vec4 uBox;
  uniform float uOpacity, uTiltLight, uLift;
  uniform vec2 uSize;
  ${LIGHT}
  void main() {
    vec4 col = texture(uColor, (vImg - uBox.xy) / uBox.zw);
    if (col.a < 0.004) discard;
    float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
    vec3 c3 = col.rgb * (1.0 + uLift * 0.06 * smoothstep(0.55, 0.9, lum));
    gl_FragColor = vec4(overcast(c3, vPos, -vTilt * uTiltLight), col.a * uOpacity);
  }
`;

// Contact shadow: the piece's own silhouette, softened and dropped a few px,
// laid just behind it. Light comes from above, so it falls a little downward.
const shadowFragment = /* glsl */ `
  precision highp float;
  in vec2 vImg;
  in vec2 vPos;
  in float vDepth;
  in float vTilt;
  uniform sampler2D uColor;
  uniform vec4 uBox;
  uniform vec2 uDrop;
  uniform float uShadow, uFilter, uOpacity, uSoft;
  void main() {
    vec2 uv = (vImg - uDrop - uBox.xy) / uBox.zw;
    float a = textureLod(uColor, uv, uSoft).a;
    a *= step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    float own = texture(uColor, (vImg - uBox.xy) / uBox.zw).a;
    a *= 1.0 - own;                       // never on the piece itself
    if (a < 0.004) discard;
    gl_FragColor = vec4(0.02, 0.03, 0.06, a * uShadow * uFilter * uOpacity);
  }
`;

// cloth: { a: [anchor x, span, direction, wavelength], b: [amplitude, turns per loop, light, 0], pin: [x, span] }
const common = (shared, tex, box, cloth = null) => ({
  ...shared,
  uColor: { value: tex },
  uBox: { value: new THREE.Vector4(...box) },
  uOpacity: { value: 1 },
  uTiltLight: { value: 0.5 },
  uDz: { value: 0 },
  ...(cloth ? {
    uClothA: { value: new THREE.Vector4(...cloth.a) },
    uClothB: { value: new THREE.Vector4(...cloth.b) },
    uClothPin: { value: new THREE.Vector2(...(cloth.pin || [-1e5, 1])) },
  } : {}),
});

export function layerMaterial(shared, tex, box, { cloth = null } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: common(shared, tex, box, cloth),
    vertexShader: vertexShader({ cloth: !!cloth }),
    fragmentShader: figureFragment(!!cloth),
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
}

export function waveMaterial(shared, tex, box) {
  return new THREE.ShaderMaterial({
    uniforms: { ...common(shared, tex, box), uLift: { value: 0 } },
    vertexShader: vertexShader(),
    fragmentShader: waveFragment,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
}

export function shadowMaterial(shared, tex, box, { drop = [3, 9], soft = 2.5, dz = 0.012, cloth = null } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...common(shared, tex, box, cloth),
      uDrop: { value: new THREE.Vector2(...drop) },
      uSoft: { value: soft },
      uDz: { value: dz },
    },
    vertexShader: vertexShader({ cloth: !!cloth }),
    fragmentShader: shadowFragment,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
}
