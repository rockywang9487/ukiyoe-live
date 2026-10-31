import * as THREE from 'three';

// ---------------------------------------------------------------- loading

export async function bitmap(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return createImageBitmap(await res.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
}

// Colours stay as the painting's sRGB numbers from texture to screen (the page
// renders with no colour conversion), so at rest the canvas is the painting.
export function tex(bmp, { mips = true, nearest = false } = {}) {
  const t = new THREE.Texture(bmp);
  t.flipY = false;
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = mips;
  t.minFilter = nearest ? THREE.NearestFilter : mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
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

export function sampler(img, { nearest = false } = {}) {
  // sample of one channel, u, v in 0..1 (bilinear, or nearest for index maps)
  const { width: w, height: h, data } = img;
  if (nearest) {
    return (u, v, ch) => {
      const x = Math.min(w - 1, Math.max(0, Math.floor(u * w))), y = Math.min(h - 1, Math.max(0, Math.floor(v * h)));
      return data[(y * w + x) * 4 + ch] / 255;
    };
  }
  return (u, v, ch) => {
    const x = Math.min(Math.max(u * w - 0.5, 0), w - 1), y = Math.min(Math.max(v * h - 0.5, 0), h - 1);
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
    const fx = x - x0, fy = y - y0;
    const at = (xx, yy) => data[(yy * w + xx) * 4 + ch];
    return ((at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy) + (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy) / 255;
  };
}

// ---------------------------------------------------------------- the window

// The painting hangs in a window (the aperture). World units: the window is 2
// wide; the eye sits D in front of it and moves for parallax.
export class Window {
  constructor(size) {
    this.W = size[0];
    this.H = size[1];
    this.aspect = this.W / this.H;
    this.halfH = this.H / this.W;
    this.A = 2 / this.W;
  }

  layout(vw, vh, { bare = false } = {}) {
    let ax, ay, aw, ah;
    if (bare) {
      ax = 0; ay = 0; aw = vw; ah = vh;
    } else {
      const caption = 0;
      const m = 0;
      aw = vw - 2 * m; ah = aw / this.aspect;
      const maxH = vh - 2 * m - caption;
      if (ah > maxH) { ah = maxH; aw = ah * this.aspect; }
      ax = (vw - aw) / 2;
      ay = Math.max(m, (vh - ah - caption) / 2);
    }
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

// ---------------------------------------------------------------- grids

// A grid over a box [x0, y0, w, h] in image px. Each vertex is skinned by up to
// four bones; skin(x, y, u, v) returns [[boneIndex, weight], ...] (the rest goes
// to `def`). depth(x, y) gives its distance behind the glass.
export function gridGeometry(box, { step, depth, skin = null, def = 0 }) {
  const [x0, y0, w, h] = box;
  const nx = Math.max(2, Math.round(w / step)), ny = Math.max(2, Math.round(h / step));
  const count = (nx + 1) * (ny + 1);
  const pos = new Float32Array(count * 3), img = new Float32Array(count * 2);
  const dep = new Float32Array(count), bones = new Float32Array(count * 4), wts = new Float32Array(count * 4);
  let k = 0;
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++, k++) {
      const u = i / nx, v = j / ny;
      const x = x0 + u * w, y = y0 + v * h;
      pos.set([x, y, 0], k * 3);
      img.set([x, y], k * 2);
      dep[k] = depth(x, y);
      const cand = skin ? skin(x, y, u, v) : [];
      let sum = cand.reduce((s, c) => s + c[1], 0);
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
  g.setAttribute('aDepth', new THREE.BufferAttribute(dep, 1));
  g.setAttribute('aBones', new THREE.BufferAttribute(bones, 4));
  g.setAttribute('aWeights', new THREE.BufferAttribute(wts, 4));
  g.setIndex(index);
  return g;
}

// A cut-out layer's grid: its bones come from RGB weight maps, three per map,
// in the order of L.skin.bones; whatever is left goes to L.skin.default.
export function layerGeometry(L, rig, maps, { depth, step }) {
  const named = (L.skin?.bones || []).map((n) => rig.id(n));
  const S = maps.map((m) => sampler(m));
  return gridGeometry(L.box, {
    step, depth, def: rig.id(L.skin?.default),
    skin: (x, y, u, v) => {
      const out = [];
      for (let b = 0; b < named.length; b++) {
        const wv = S[Math.floor(b / 3)](u, v, b % 3);
        if (wv > 0.002) out.push([named[b], wv]);
      }
      return out;
    },
  });
}
