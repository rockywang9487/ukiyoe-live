import * as THREE from 'three';
import { goldMaterial } from './materials/gold.js';

// ---------------------------------------------------------------- loading

export async function bitmap(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return createImageBitmap(await res.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
}

export function tex(bmp, { srgb = false, repeat = false, mips = true } = {}) {
  const t = new THREE.Texture(bmp);
  t.flipY = false;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.generateMipmaps = mips;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

export function pixels(bmp) {
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  return g.getImageData(0, 0, c.width, c.height);
}

function sampler(img) {
  // bilinear sample of one channel, u, v in 0..1
  const { width: w, height: h, data } = img;
  return (u, v, ch) => {
    const x = Math.min(Math.max(u * w - 0.5, 0), w - 1), y = Math.min(Math.max(v * h - 0.5, 0), h - 1);
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
    const fx = x - x0, fy = y - y0;
    const at = (xx, yy) => data[(yy * w + xx) * 4 + ch];
    return ((at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy) + (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy) / 255;
  };
}

// ---------------------------------------------------------------- the window

export class Window {
  constructor(size) {
    this.W = size[0];
    this.H = size[1];
    this.aspect = this.W / this.H;
    this.halfH = this.H / this.W;
    this.A = 2 / this.W;
  }

  layout(vw, vh) {
    const caption = vh < 520 ? 44 : 70;
    const m = Math.max(16, Math.min(vw, vh) * 0.045);
    let aw = vw - 2 * m, ah = aw / this.aspect;
    const maxH = vh - 2 * m - caption;
    if (ah > maxH) { ah = maxH; aw = ah * this.aspect; }
    const ax = (vw - aw) / 2;
    const ay = Math.max(m, (vh - ah - caption) / 2);
    this.ap = { x: ax, y: ay, w: aw, h: ah, vw, vh };
    const upp = 2 / aw;
    this.bounds = { l: -1 - ax * upp, r: 1 + (vw - ax - aw) * upp, t: this.halfH + ay * upp, b: -this.halfH - (vh - ay - ah) * upp };
    return this.ap;
  }

  // off-axis projection: the window rectangle stays put, the eye moves
  aim(camera, ex, ey, D) {
    const b = this.bounds, n = 0.05, f = 60, k = n / D;
    camera.position.set(ex, ey, D);
    camera.updateMatrixWorld(true);
    camera.projectionMatrix.makePerspective((b.l - ex) * k, (b.r - ex) * k, (b.t - ey) * k, (b.b - ey) * k, n, f);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
}

// ---------------------------------------------------------------- layers

function depthFn(L, win, floorCurve, auxS) {
  const d = L.depth || {};
  if (auxS) return (x, y, u, v) => auxS(u, v, 3);
  if (d.floor) {
    const c = floorCurve;
    return (x, y) => {
      if (y <= c[0][0]) return c[0][1] + (d.offset || 0);
      for (let i = 0; i < c.length - 1; i++) {
        if (y < c[i + 1][0]) {
          const t = (y - c[i][0]) / (c[i + 1][0] - c[i][0]);
          return c[i][1] + (c[i + 1][1] - c[i][1]) * t + (d.offset || 0);
        }
      }
      return c[c.length - 1][1] + (d.offset || 0);
    };
  }
  const z = d.z ?? 0.5, zx = d.zx || 0, zy = d.zy || 0;
  return (x, y) => z + zx * (x / win.W - 0.5) + zy * (y / win.H - 0.5);
}

export function layerGeometry(L, win, rig, { weights = null, aux = null, floorCurve, step }) {
  const [x0, y0, w, h] = L.box;
  const nx = Math.max(2, Math.round(w / step)), ny = Math.max(2, Math.round(h / step));
  const count = (nx + 1) * (ny + 1);
  const pos = new Float32Array(count * 3), img = new Float32Array(count * 2), uv = new Float32Array(count * 2);
  const depth = new Float32Array(count), bones = new Float32Array(count * 4), wts = new Float32Array(count * 4);
  const auxS = aux ? sampler(aux) : null;
  const wS = weights ? sampler(weights) : null;
  const dfn = depthFn(L, win, floorCurve, L.name === 'back' ? auxS : null);
  const def = rig.id(L.skin?.default);
  const named = (L.skin?.bones || []).map((n) => rig.id(n));
  let k = 0;
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++, k++) {
      const u = i / nx, v = j / ny;
      const x = x0 + u * w, y = y0 + v * h;
      pos.set([x, y, 0], k * 3);
      img.set([x, y], k * 2);
      uv.set([u, v], k * 2);
      depth[k] = dfn(x, y, u, v);
      const cand = [];
      let sum = 0;
      for (let b = 0; b < named.length; b++) {
        const wv = wS ? wS(u, v, b) : 0;
        if (wv > 0.002) { cand.push([named[b], wv]); sum += wv; }
      }
      if (sum > 1) { cand.forEach((c) => (c[1] /= sum)); sum = 1; }
      if (1 - sum > 0.002) cand.push([def, 1 - sum]);
      cand.sort((a, b) => b[1] - a[1]);
      const top = cand.slice(0, 4);
      const tot = top.reduce((s, c) => s + c[1], 0) || 1;
      for (let q = 0; q < 4; q++) {
        bones[k * 4 + q] = top[q] ? top[q][0] : 0;
        wts[k * 4 + q] = top[q] ? top[q][1] / tot : 0;
      }
    }
  }
  const index = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aImg', new THREE.BufferAttribute(img, 2));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1));
  g.setAttribute('aBones', new THREE.BufferAttribute(bones, 4));
  g.setAttribute('aWeights', new THREE.BufferAttribute(wts, 4));
  g.setIndex(index);
  return g;
}

export function layerMesh(L, textures, shared, win, rig, opts) {
  const geo = layerGeometry(L, win, rig, opts);
  const mat = goldMaterial(shared, { color: textures.color, mat: textures.mat, aux: textures.aux, kind: L.kind });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.name = L.name;
  return mesh;
}

// ---------------------------------------------------------------- frame

const frameVertex = /* glsl */ `
  in vec3 aNormal;
  out vec3 vWorld;
  out vec3 vN;
  void main() {
    vWorld = position;
    vN = aNormal;
    gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
  }
`;

const frameFragment = /* glsl */ `
  precision highp float;
  in vec3 vWorld;
  in vec3 vN;
  uniform vec3 uEye, uLightPos, cBone, cLacquer, cUmber;
  uniform float uHalfH, uLip, uEnvGain;
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  vec3 env(vec3 R) {
    vec3 c = mix(vec3(0.02, 0.012, 0.007), vec3(0.16, 0.11, 0.06), smoothstep(-0.4, 0.5, R.y));
    c += vec3(1.4, 1.2, 0.9) * smoothstep(0.86, 0.985, dot(R, normalize(vec3(-0.12, 0.30, 1.0))));
    return c;
  }
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(uEye - vWorld);
    vec3 R = reflect(-V, N);
    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    // urushi: a deep red-black under a glassy coat
    vec3 base = cLacquer * 1.6 + vec3(0.012, 0.004, 0.002);
    vec3 col = base * 0.6 + env(R) * fres * 0.55 * uEnvGain;
    // nashiji: sparse gold flecks suspended in the lacquer
    vec2 cell = floor(vWorld.xy * 900.0 + vWorld.z * 900.0);
    float fleck = step(0.985, hash12(cell));
    vec3 H = normalize(normalize(uLightPos - vWorld) + V);
    vec2 jitter = vec2(hash12(cell + 3.1), hash12(cell + 7.7)) - 0.5;
    float tw = pow(max(dot(normalize(N + vec3(jitter, 0.0) * 0.8), H), 0.0), 120.0);
    col += cBone * fleck * (0.05 + 2.5 * tw);
    // gold lip around the window
    float dx = max(abs(vWorld.x) - 1.0, 0.0), dy = max(abs(vWorld.y) - uHalfH, 0.0);
    float dist = max(dx, dy);
    float onFace = step(0.5, N.z);
    float lip = onFace * (1.0 - smoothstep(uLip * 0.6, uLip, dist));
    float lipSide = (1.0 - onFace) * (1.0 - smoothstep(0.0, uLip * 0.6, -vWorld.z));
    vec3 gold = cBone * (env(R) * 1.3 + vec3(0.25, 0.18, 0.1)) + cBone * pow(max(dot(N, H), 0.0), 60.0) * 2.0;
    col = mix(col, gold, max(lip, lipSide));
    // the inner reveal falls into shadow away from the glass
    col *= mix(1.0, 0.35, (1.0 - onFace) * smoothstep(0.0, 0.05, -vWorld.z));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function makeFrame(shared, win) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uEye: shared.uEye, uLightPos: shared.uLightPos, cBone: shared.cBone, cLacquer: shared.cLacquer,
      cUmber: shared.cUmber, uHalfH: shared.uHalfH, uEnvGain: shared.uEnvGain, uLip: { value: 0.006 },
    },
    vertexShader: frameVertex,
    fragmentShader: frameFragment,
    // transparent only so three.js sorts it with the layers by renderOrder
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  mesh.frustumCulled = false;
  mesh.name = 'frame';
  mesh.userData.rebuild = (bounds, revealDepth = 0.035) => {
    const h = win.halfH, B = { l: bounds.l - 0.5, r: bounds.r + 0.5, t: bounds.t + 0.5, b: bounds.b - 0.5 };
    const P = [], Nn = [], I = [];
    const quad = (a, b, c, d, n) => {
      const o = P.length / 3;
      P.push(...a, ...b, ...c, ...d);
      for (let i = 0; i < 4; i++) Nn.push(...n);
      I.push(o, o + 1, o + 2, o, o + 2, o + 3);
    };
    const Z = 0, F = [0, 0, 1];
    quad([B.l, h, Z], [B.r, h, Z], [B.r, B.t, Z], [B.l, B.t, Z], F);           // top
    quad([B.l, B.b, Z], [B.r, B.b, Z], [B.r, -h, Z], [B.l, -h, Z], F);         // bottom
    quad([B.l, -h, Z], [-1, -h, Z], [-1, h, Z], [B.l, h, Z], F);                 // left
    quad([1, -h, Z], [B.r, -h, Z], [B.r, h, Z], [1, h, Z], F);                   // right
    const d = -revealDepth;
    quad([-1, -h, Z], [-1, -h, d], [-1, h, d], [-1, h, Z], [1, 0, 0]);          // left reveal faces right
    quad([1, -h, d], [1, -h, Z], [1, h, Z], [1, h, d], [-1, 0, 0]);
    quad([-1, h, Z], [-1, h, d], [1, h, d], [1, h, Z], [0, -1, 0]);              // top reveal faces down
    quad([-1, -h, d], [-1, -h, Z], [1, -h, Z], [1, -h, d], [0, 1, 0]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('aNormal', new THREE.Float32BufferAttribute(Nn, 3));
    g.setIndex(I);
    mesh.geometry.dispose();
    mesh.geometry = g;
  };
  return mesh;
}
