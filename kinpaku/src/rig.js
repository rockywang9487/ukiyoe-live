// 2D bones in image pixels. Each bone has a rest pivot; its pose is a rotation,
// scale and translation about that pivot plus a depth offset. World transforms
// are packed two vec4s per bone for the vertex shader:
//   (a, b, c, dz), (d, e, f, 0)  with  x' = a x + b y + c,  y' = d x + e y + f

export const MAX_BONES = 40;

export class Rig {
  constructor(bones, scale) {
    // index 0 is the static root
    this.list = [{ name: '__root', parent: null, pivot: [0, 0] }, ...bones];
    this.index = new Map(this.list.map((b, i) => [b.name, i]));
    this.parent = this.list.map((b) => (b.parent ? this.index.get(b.parent) : b.name === '__root' ? -1 : 0));
    this.scale = scale; // working px per source px
    this.pose = this.list.map(() => ({ rot: 0, sx: 1, sy: 1, tx: 0, ty: 0, dz: 0 }));
    this.world = new Float64Array(this.list.length * 6);
    this.depth = new Float64Array(this.list.length);
    this.packed = new Float32Array(MAX_BONES * 8);
    if (this.list.length > MAX_BONES) throw new Error('too many bones');
  }

  id(name) {
    if (name == null) return 0;
    const i = this.index.get(name);
    if (i === undefined) throw new Error('unknown bone ' + name);
    return i;
  }

  reset() {
    for (const p of this.pose) { p.rot = 0; p.sx = 1; p.sy = 1; p.tx = 0; p.ty = 0; p.dz = 0; }
  }

  update() {
    const W = this.world;
    for (let i = 0; i < this.list.length; i++) {
      const p = this.pose[i];
      const [px, py] = this.list[i].pivot;
      const r = (p.rot * Math.PI) / 180;
      const c = Math.cos(r), s = Math.sin(r);
      const a = c * p.sx, b = -s * p.sy, d = s * p.sx, e = c * p.sy;
      const tx = p.tx * this.scale, ty = p.ty * this.scale;
      const lc = px + tx - (a * px + b * py);
      const lf = py + ty - (d * px + e * py);
      const pi = this.parent[i];
      const o = i * 6;
      if (pi < 0) {
        W[o] = a; W[o + 1] = b; W[o + 2] = lc; W[o + 3] = d; W[o + 4] = e; W[o + 5] = lf;
        this.depth[i] = p.dz;
      } else {
        const q = pi * 6;
        const A = W[q], B = W[q + 1], C = W[q + 2], D = W[q + 3], E = W[q + 4], F = W[q + 5];
        W[o] = A * a + B * d; W[o + 1] = A * b + B * e; W[o + 2] = A * lc + B * lf + C;
        W[o + 3] = D * a + E * d; W[o + 4] = D * b + E * e; W[o + 5] = D * lc + E * lf + F;
        this.depth[i] = this.depth[pi] + p.dz;
      }
      const k = i * 8;
      this.packed[k] = W[o]; this.packed[k + 1] = W[o + 1]; this.packed[k + 2] = W[o + 2]; this.packed[k + 3] = this.depth[i];
      this.packed[k + 4] = W[o + 3]; this.packed[k + 5] = W[o + 4]; this.packed[k + 6] = W[o + 5]; this.packed[k + 7] = 0;
    }
  }

  // where a bone's rest pivot ends up (image px)
  pivotNow(i) {
    const W = this.world, o = i * 6;
    const [x, y] = this.list[i].pivot;
    return [W[o] * x + W[o + 1] * y + W[o + 2], W[o + 3] * x + W[o + 4] * y + W[o + 5]];
  }
}
