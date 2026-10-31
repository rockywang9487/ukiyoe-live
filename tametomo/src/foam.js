import * as THREE from 'three';
import { LIGHT } from './materials/shared.js';
import { sampler } from './scene.js';

// The foam that runs along the crests. Each crest's claws were cut whole from
// the print (layers/<crest>.webp) and lifted off their wave; here they ride a
// strip laid along the crest line, which bends with the wave's bones. The strip
// slides from the base toward the lip, carrying the claws rigidly (each keeps
// its shape, turned only as the line turns), so the foam keeps running up the
// wave; what reaches the lip thins away there and the spray takes over, and the
// same claws come up again at the base. Two copies of the strip, one crest
// length apart, so the run never stops; their ends thin out, so where the last
// claw of one meets the first of the other there is a little open water, never
// a double image. The crest line is posed on the CPU every frame (its samples
// skinned like the wave) and read by the strips from a float texture.

const vertex = /* glsl */ `
  in vec2 aSD;                   // s along the crest (px from its base), d across it
  uniform sampler2D uRest, uPosed;
  uniform float uRow, uLen, uStep, uOff, uCopy, uZ, uFadeLen, uAmp;
  uniform float uA, uHalfH, uD, uDepthScale;
  out vec2 vRest;
  out vec2 vPos;
  out float vFade;
  vec4 at(sampler2D t, float s) {
    float i = clamp(s / uStep, 0.0, 510.0);
    int i0 = int(floor(i));
    vec4 a = texelFetch(t, ivec2(i0, int(uRow)), 0);
    vec4 b = texelFetch(t, ivec2(i0 + 1, int(uRow)), 0);
    vec4 r = mix(a, b, i - float(i0));
    r.zw = normalize(r.zw);
    return r;
  }
  void main() {
    float s = aSD.x, d = aSD.y;
    float n = floor(uLen / uStep);
    float sd = s + uOff - uCopy * uLen;                 // where this bit of foam is now
    float sdc = clamp(sd, 0.0, n * uStep);
    vec4 r = at(uRest, min(s, n * uStep));
    vec4 p = at(uPosed, sdc);
    vRest = r.xy + d * r.zw;
    vec2 q = p.xy + d * p.zw;
    vPos = q;
    float k = min(uAmp, 1.0);
    float fl = uFadeLen;
    float ends = smoothstep(0.0, fl, sd) * (1.0 - smoothstep(uLen - fl * 1.6, uLen, sd));
    float seam = smoothstep(0.0, fl * 0.7, s) * (1.0 - smoothstep(uLen - fl * 0.7, uLen, s));
    vFade = mix(1.0, ends * seam, k) * step(0.0, sd) * step(sd, uLen);
    float Z = uZ * uDepthScale;
    vec2 g = vec2(q.x * uA - 1.0, uHalfH - q.y * uA);
    gl_Position = projectionMatrix * viewMatrix * vec4(g * (uD + Z) / uD, -Z, 1.0);
  }
`;

const fragment = /* glsl */ `
  precision highp float;
  in vec2 vRest;
  in vec2 vPos;
  in float vFade;
  uniform sampler2D uFoam;
  uniform vec4 uBox;
  uniform float uLift;
  uniform vec2 uSize;
  ${LIGHT}
  void main() {
    vec2 uv = (vRest - uBox.xy) / uBox.zw;
    vec4 c = texture(uFoam, uv);
    c.a *= vFade * step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    if (c.a < 0.004) discard;
    vec3 col = c.rgb * (1.0 + 0.05 * uLift);
    gl_FragColor = vec4(overcast(col, vPos, 0.0), c.a);
  }
`;

function stripGeometry(len, d0, d1, ds = 4, dd = 4) {
  const ns = Math.max(2, Math.ceil(len / ds)), nd = Math.max(2, Math.ceil((d1 - d0) / dd));
  const sd = new Float32Array((ns + 1) * (nd + 1) * 2);
  let k = 0;
  for (let j = 0; j <= nd; j++) for (let i = 0; i <= ns; i++) sd.set([(i / ns) * len, d0 + (j / nd) * (d1 - d0)], 2 * k++);
  const index = [];
  for (let j = 0; j < nd; j++) {
    for (let i = 0; i < ns; i++) {
      const a = j * (ns + 1) + i, b = a + 1, c = a + ns + 1, e = c + 1;
      index.push(a, c, b, b, c, e);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('aSD', new THREE.BufferAttribute(sd, 2));
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((ns + 1) * (nd + 1) * 3), 3));
  g.setIndex(index);
  return g;
}

// crests: scene.crests; layers: name -> { L, maps (ImageData weight maps) };
// foamTex: crest name -> texture
export function foamStrips(shared, scene, rig, layers, foamTex, { LOOP, lift }) {
  const Wt = 512;
  const crests = scene.crests;
  const rows = crests.length;
  const rest = new Float32Array(Wt * rows * 4);
  const posed = new Float32Array(Wt * rows * 4);
  const mk = (data) => {
    const t = new THREE.DataTexture(data, Wt, rows, THREE.RGBAFormat, THREE.FloatType);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  };
  crests.forEach((c, row) => c.pts.forEach((p, i) => { if (i < Wt) rest.set(p, (row * Wt + i) * 4); }));
  const restTex = mk(rest), posedTex = mk(posed);

  // each sample's bones, from its wave's weight maps (as the wave's own grid is skinned)
  const skins = crests.map((c) => {
    const lay = layers[c.layer];
    const L = lay.L;
    const named = (L.skin?.bones || []).map((n) => rig.id(n));
    const S = lay.maps.map((m) => sampler(m));
    const def = rig.id(L.skin?.default);
    const [bx, by, bw, bh] = L.box;
    return c.pts.slice(0, Wt).map(([x, y]) => {
      const u = (x - bx) / bw, v = (y - by) / bh;
      const out = [];
      let sum = 0;
      for (let b = 0; b < named.length; b++) {
        const wv = S[Math.floor(b / 3)](u, v, b % 3);
        if (wv > 0.002) { out.push([named[b], wv]); sum += wv; }
      }
      if (sum < 1) out.push([def, 1 - sum]);
      return out;
    });
  });

  function pose() {
    const Wm = rig.world;
    crests.forEach((c, row) => {
      const sk = skins[row];
      for (let i = 0; i < sk.length; i++) {
        const [x, y, nx, ny] = c.pts[i];
        let px = 0, py = 0, qx = 0, qy = 0;
        for (const [b, w] of sk[i]) {
          const o = b * 6;
          px += w * (Wm[o] * x + Wm[o + 1] * y + Wm[o + 2]);
          py += w * (Wm[o + 3] * x + Wm[o + 4] * y + Wm[o + 5]);
          qx += w * (Wm[o] * nx + Wm[o + 1] * ny);
          qy += w * (Wm[o + 3] * nx + Wm[o + 4] * ny);
        }
        const nl = Math.hypot(qx, qy) || 1;
        posed.set([px, py, qx / nl, qy / nl], (row * Wt + i) * 4);
      }
    });
    posedTex.needsUpdate = true;
  }

  const strips = [];
  crests.forEach((c, row) => {
    if (!c.foam || !foamTex[c.name]) return;
    const lay = layers[c.layer];
    const geo = stripGeometry(c.length, c.dr[0], c.dr[1]);
    for (let copy = 0; copy < 2; copy++) {
      const u = {
        ...shared,
        uRest: { value: restTex }, uPosed: { value: posedTex }, uFoam: { value: foamTex[c.name] },
        uBox: { value: new THREE.Vector4(...c.foam) }, uRow: { value: row }, uLen: { value: c.length },
        uStep: { value: c.step }, uOff: { value: 0 }, uCopy: { value: copy }, uZ: { value: lay.L.z - 0.002 },
        uFadeLen: { value: Math.min(30, c.length * 0.08) }, uLift: { value: 0 },
      };
      const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
        uniforms: u, vertexShader: vertex, fragmentShader: fragment, transparent: true, depthTest: false, depthWrite: false,
        side: THREE.DoubleSide,     // drawn in image axes (y down): the winding flips
      }));
      mesh.frustumCulled = false;
      strips.push({ mesh, crest: c, layer: c.layer, u, name: `${c.name}_${copy}` });
    }
  });

  function update(t, amp) {
    pose();
    const live = Math.min(1, amp);
    for (const s of strips) {
      const c = s.crest;
      // whole crest lengths per loop: the run closes with the loop
      s.u.uOff.value = (((t / LOOP) * c.speed) % 1) * c.length * (live > 0 ? 1 : 0);
      s.u.uLift.value = lift(s.layer, t) * live;
    }
  }
  return { strips, update };
}
