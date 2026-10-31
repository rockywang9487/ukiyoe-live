import * as THREE from 'three';

// Shared uniforms: one object, referenced by every layer material, so a single
// write per frame updates them all.
export function sharedUniforms(palette, tex, rig, geo) {
  const c = (hex) => new THREE.Color(hex); // converted to linear by ColorManagement
  return {
    uBones: { value: rig.packed },
    uA: { value: geo.A },
    uHalfH: { value: geo.halfH },
    uD: { value: geo.D },
    uDepthScale: { value: geo.depthScale },
    uEye: { value: new THREE.Vector3(0, 0, geo.D) },
    uLightPos: { value: new THREE.Vector3(0, 0.4, 1.6) },
    uTime: { value: 0 },
    uRaw: { value: 0 },
    uGrain: { value: tex.grain },
    uBrush: { value: tex.brush },
    cLacquer: { value: c(palette.lacquer) },
    cUmber: { value: c(palette.umber) },
    cOlive: { value: c(palette.olive) },
    cField: { value: c(palette.field) },
    cBone: { value: c(palette.bone) },
    cCoral: { value: c(palette.coral) },
    cCopper: { value: c(palette.copper) },
    cCopperDark: { value: c(palette.copperDark) },
    cRed: { value: c(palette.redFoil) },
    cPlat: { value: c('#ece6d6') },
    cGold: { value: c('#d2a04a') },   // bone gold, between the plate's coral and its brightest leaf
    cAo: { value: c('#b6a874') },     // ao-kin: the pale green gold of the plate's field
    uLeaf: { value: new THREE.Vector4(441, 0.55, 0.5, 0.35) }, // size px (109 mm), tint var, seam, wrinkle
    uSparkle: { value: 1.0 },
    uExposure: { value: 0.9 },
    uAuraGain: { value: 1.15 },
    uGreen: { value: 0.75 },       // how far the void leans to green gold (ao-kin)
    uEnvGain: { value: 1.0 },
    uKeyGain: { value: 1.0 },
    uFog: { value: 0.3 },
  };
}

export const KIND = { back: 0, bone: 1, figure: 2, straw: 3, glass: 4, sword: 5, scabbard: 2 };

const vertex = /* glsl */ `
  in vec2 aImg;
  in vec4 aBones;
  in vec4 aWeights;
  in float aDepth;
  uniform vec4 uBones[80];
  uniform float uA, uHalfH, uD, uDepthScale, uLayerDz;
  out vec2 vUv;
  out vec2 vImg;
  out vec3 vWorld;
  out float vDepth;

  void main() {
    vec3 acc = vec3(0.0);
    for (int k = 0; k < 4; k++) {
      float w = aWeights[k];
      if (w <= 0.0) continue;
      int b = int(aBones[k] + 0.5);
      vec4 r0 = uBones[2 * b];
      vec4 r1 = uBones[2 * b + 1];
      acc += w * vec3(r0.x * aImg.x + r0.y * aImg.y + r0.z,
                      r1.x * aImg.x + r1.y * aImg.y + r1.z, r0.w);
    }
    float d = aDepth + acc.z + uLayerDz;
    float Z = d * uDepthScale;
    // place the point on the ray from the rest eye through its spot on the glass,
    // so at rest every layer lines up with the print exactly
    vec2 g = vec2(acc.x * uA - 1.0, uHalfH - acc.y * uA);
    vec3 world = vec3(g * (uD + Z) / uD, -Z);
    vUv = uv;
    vImg = aImg;
    vWorld = world;
    vDepth = d;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const fragment = /* glsl */ `
  precision highp float;
  in vec2 vUv;
  in vec2 vImg;
  in vec3 vWorld;
  in float vDepth;

  uniform sampler2D uColor, uMat, uAux, uGrain, uBrush;
  uniform vec3 uEye, uLightPos;
  uniform float uTime, uRaw, uKind, uOpacity, uSparkle, uExposure, uAuraGain, uGreen, uEnvGain, uKeyGain, uFog;
  uniform vec4 uLeaf;
  uniform vec3 cLacquer, cUmber, cOlive, cField, cBone, cCoral, cCopper, cCopperDark, cRed, cPlat, cGold, cAo;
  uniform vec2 uGlint;     // sword: position of the light along the blade, strength
  uniform float uReveal;   // sword: how much of the blade has left the scabbard (0..1)
  uniform float uBladeStart; // sword: where the blade begins along u

  const float PI = 3.14159265;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x),
               mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
  }
  float lumS(vec3 lin) {
    vec3 s = pow(max(lin, 0.0), vec3(1.0 / 2.2));
    return dot(s, vec3(0.2126, 0.7152, 0.0722));
  }

  // The room the gold reflects: dark floor, amber walls, a broad window above
  // the viewer and a small lamp to the right.
  vec3 env(vec3 R) {
    vec3 c = mix(vec3(0.018, 0.011, 0.006), vec3(0.13, 0.085, 0.045), smoothstep(-0.5, 0.05, R.y));
    c = mix(c, vec3(0.42, 0.31, 0.19), smoothstep(0.05, 0.6, R.y));
    float sb = smoothstep(0.90, 0.995, dot(R, normalize(vec3(-0.16, 0.34, 1.0))));
    c += vec3(0.62, 0.52, 0.40) * sb;
    float l2 = smoothstep(0.985, 0.999, dot(R, normalize(vec3(0.34, 0.10, 1.0))));
    c += vec3(0.45, 0.35, 0.24) * l2;
    return c;
  }

  // gold ramp for pale paper and bone: white -> bright gold, grey shading -> coral
  vec3 goldRamp(float L) {
    vec3 c = mix(cUmber, cCopperDark * 1.7, smoothstep(0.05, 0.3, L));
    c = mix(c, cCoral * 0.8, smoothstep(0.28, 0.52, L));
    c = mix(c, cGold, smoothstep(0.5, 0.78, L));
    c = mix(c, cBone * 0.92, smoothstep(0.8, 1.0, L));
    return c;
  }

  void main() {
    vec4 src = texture(uColor, vUv);
    float alpha = src.a * uOpacity;
    float bladeU = 0.0;
    if (uKind > 4.5) {
      // swords: hide the part of the blade still in the scabbard
      bladeU = (vUv.x - uBladeStart) / max(1.0 - uBladeStart, 1e-3);
      if (bladeU > uReveal) discard;
    }
    if (alpha < 0.003) discard;
    if (uRaw > 0.5) { gl_FragColor = vec4(src.rgb, alpha); return; }

    vec4 mat = texture(uMat, vUv);   // pigment, copper, foil, 1 - void
    vec4 aux = texture(uAux, vUv);   // flow (cos2t, sin2t), aura, depth
    float pigment = mat.r, copper = mat.g, foil = mat.b, voidW = 1.0 - mat.a;

    float L = lumS(src.rgb);
    float Lm = lumS(textureLod(uColor, vUv, 3.0).rgb);
    float ink;
    if (uKind > 0.5 && uKind < 1.5) ink = smoothstep(0.30, 0.13, L);
    else ink = smoothstep(0.05, 0.2, Lm - L) * (1.0 - smoothstep(0.32, 0.55, L));
    ink *= 1.0 - voidW * 0.85;

    // ---- albedo by material
    vec3 base = goldRamp(L);
    if (uKind > 1.5 && uKind < 2.5) pigment = max(pigment, 0.74);   // figures: colour printed over leaf
    vec3 pig = mix(vec3(dot(src.rgb, vec3(0.2126, 0.7152, 0.0722))), src.rgb, 0.9) * vec3(1.04, 0.99, 0.9);
    pig = mix(pig, pig * cGold * 1.6, 0.14);
    base = mix(base, pig, pigment);

    vec2 fl = aux.rg * 2.0 - 1.0;
    float flowA = 0.5 * atan(fl.y, fl.x);
    vec2 fdir = vec2(cos(flowA), sin(flowA));
    float along = dot(vImg, fdir), across = dot(vImg, vec2(-fdir.y, fdir.x));
    float brush = texture(uBrush, vec2(along / 512.0, across / 128.0) * vec2(1.0, 2.2)).r;
    vec3 cop = mix(cCopperDark * 1.1, cCopper * vec3(1.75, 1.35, 1.1), smoothstep(0.22, 0.85, L)) * (0.72 + 0.55 * brush);
    base = mix(base, cop, copper);

    vec3 red = mix(cRed * 0.5, cRed * vec3(2.4, 1.3, 1.2), smoothstep(0.1, 0.7, L));
    base = mix(base, red, foil);

    // the black void becomes leaf: pale green gold near the skeleton, burnt toward the edges
    float aura = clamp(pow(aux.b, 0.7) * uAuraGain, 0.0, 1.0);
    vec3 ao = mix(cField, cAo, uGreen);
    vec3 voidC = mix(cLacquer * 2.0 + cCopperDark * 0.45, ao, smoothstep(0.04, 0.8, aura));
    base = mix(base, voidC, voidW);

    if (uKind > 4.5) {
      float blade = 1.0 - pigment;
      base = mix(base, cPlat * (0.82 + 0.3 * L), blade);
    }

    vec3 inkC = cUmber * (0.65 + 0.5 * L);
    base = mix(base, inkC, ink);

    // ---- gold leaf: 109 mm squares laid in rows, each at its own slight angle
    float leafAmt = clamp((1.0 - pigment) * (1.0 - copper) * (1.0 - foil) + voidW, 0.0, 1.0) * (1.0 - ink);
    float S = uLeaf.x;
    float rowJit = (hash12(vec2(floor(vImg.y / S), 7.0)) - 0.5) * 0.18;
    vec2 lp = vImg / S + vec2(rowJit, 0.0);
    lp += (vec2(vnoise(vImg * 0.02), vnoise(vImg * 0.02 + 19.0)) - 0.5) * 0.03;
    vec2 cell = floor(lp), f = fract(lp);
    vec2 rnd = hash22(cell + 3.7);
    float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) * S;
    float seam = 1.0 - smoothstep(0.6, 2.2, edge);
    float lap = 1.0 - smoothstep(3.0, 11.0, edge);
    base *= 1.0 + leafAmt * ((rnd.x - 0.5) * 0.05 * uLeaf.y - lap * 0.05 * uLeaf.z);
    base = mix(base, base * 0.55, seam * leafAmt * uLeaf.z * 0.6);

    // ---- surface normal: print relief + leaf tilt + wrinkles + plate grain
    float h = L * 1.2 - ink * 0.6 + copper * brush * 0.5;
    vec3 dpdx = dFdx(vWorld), dpdy = dFdy(vWorld);
    vec3 N0 = vec3(0.0, 0.0, 1.0);
    vec3 r1 = cross(dpdy, N0), r2 = cross(N0, dpdx);
    float det = dot(dpdx, r1);
    vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
    vec3 N = normalize(abs(det) * N0 - grad * 0.0012 / max(abs(det), 1e-9) * abs(det));
    vec2 tilt = (rnd - 0.5) * 0.028 * leafAmt;
    float wr = vnoise(vImg * 0.11) - 0.5;
    tilt += vec2(wr, vnoise(vImg * 0.11 + 31.0) - 0.5) * 0.08 * uLeaf.w * leafAmt;
    vec4 gr = texture(uGrain, vImg / 260.0) - 0.5;
    tilt += gr.rg * 0.10;
    N = normalize(N + vec3(tilt, 0.0));

    // ---- lighting
    vec3 V = normalize(uEye - vWorld);
    vec3 Ld = normalize(uLightPos - vWorld);
    vec3 H = normalize(Ld + V);
    vec3 R = reflect(-V, N);
    float NdL = max(dot(N, Ld), 0.0), NdV = max(dot(N, V), 1e-3), NdH = max(dot(N, H), 0.0);
    float rough = mix(0.42, 0.6, pigment);
    rough = mix(rough, 0.40, copper);
    rough = mix(rough, 0.24, foil);
    rough = mix(rough, 0.5, ink);
    if (uKind > 4.5) rough = mix(rough, 0.16, 1.0 - pigment);
    float a2 = pow(rough * rough, 2.0);
    float D = a2 / (PI * pow(NdH * NdH * (a2 - 1.0) + 1.0, 2.0));
    float k = pow(rough + 1.0, 2.0) / 8.0;
    float G = NdL / (NdL * (1.0 - k) + k) * NdV / (NdV * (1.0 - k) + k);
    float metal = (1.0 - pigment * 0.72) * (1.0 - ink * 0.8);
    vec3 F0 = mix(vec3(0.04), base, metal);
    vec3 F = F0 + (1.0 - F0) * pow(1.0 - max(dot(H, V), 0.0), 5.0);
    vec3 key = vec3(1.0, 0.86, 0.66) * 0.85 * uKeyGain;
    vec3 spec = D * F * G / max(4.0 * NdL * NdV, 1e-3) * NdL * key;
    vec3 envc = env(R) * uEnvGain;
    vec3 metalC = base * envc * 1.25 + min(spec, vec3(1.6));
    vec3 dielC = base * (vec3(0.30, 0.25, 0.20) + NdL * key * 0.22) + 0.04 * envc + spec * 0.4;
    vec3 col = mix(dielC, metalC, metal);

    // ---- flakes: tiny bits of leaf at their own angles, glinting as you move
    vec2 fc = floor(vImg / 1.9);
    vec2 fr = hash22(fc);
    float fdens = step(0.86, hash12(fc + 11.0)) * (leafAmt * 0.8 + copper * 0.6 + foil * 0.6 + 0.2);
    vec3 nf = normalize(N + vec3((fr - 0.5) * 0.9, 0.0));
    float g1 = pow(max(dot(nf, H), 0.0), 700.0) * 6.0;
    float g2 = smoothstep(0.95, 0.995, dot(reflect(-V, nf), normalize(vec3(-0.16, 0.34, 1.0)))) * 0.6;
    col += (g1 + g2) * fdens * uSparkle * mix(base, vec3(1.0, 0.86, 0.6), 0.15) * (0.5 + gr.b);

    // ---- swords: a line of light runs along the blade when it stands
    if (uKind > 4.5) {
      float blade = 1.0 - pigment;
      float gl = exp(-pow((bladeU - uGlint.x) / 0.06, 2.0)) * uGlint.y * blade;
      col += cPlat * gl * 5.0;
      float lip = smoothstep(uReveal - 0.04, uReveal, bladeU) * step(uReveal, 0.999) * blade;
      col += vec3(1.0, 0.85, 0.55) * lip * 3.0;
    }

    // deeper layers sit in more shadow
    col *= mix(1.0, 1.0 - uFog, smoothstep(0.3, 1.0, vDepth));
    col *= uExposure;
    gl_FragColor = vec4(col, alpha);
  }
`;

export function goldMaterial(shared, { color, mat, aux, kind, opacity = 1 }) {
  const uniforms = {
    ...shared,
    uColor: { value: color },
    uMat: { value: mat },
    uAux: { value: aux },
    uKind: { value: KIND[kind] ?? 2 },
    uOpacity: { value: opacity },
    uLayerDz: { value: 0 },
    uGlint: { value: new THREE.Vector2(-1, 0) },
    uReveal: { value: 1 },
    uBladeStart: { value: 0 },
  };
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
}
