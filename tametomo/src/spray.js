import * as THREE from 'three';

// Spray and drifting foam, drawn with the print's own foam claws (spray.webp:
// white components of the sea, cut out with their light-blue shading), so a
// thrown-off drop is a claw of white paint that has been given weight.
//
// Spray: each emitter sits at a crest's lip and throws a few claws when its
// wave lets go (bursts timed by the timeline), plus a thin steady spill. A claw
// leaves fast, slows against the air, hangs a moment at the top, falls back and
// is gone as it meets the water; it turns slowly as it flies and opens a little.
// Flecks: small claws carried along the troughs past the hulls.
// Every path is a function of loop time alone, so the loop closes.

const vertex = /* glsl */ `
  in vec4 aP;       // x, y (image px), z (depth), alpha
  in vec4 aS;       // scale, rotation, sprite col, sprite row
  in vec2 aWH;      // sprite size in its cell (px)
  uniform float uA, uHalfH, uD, uDepthScale, uCell;
  uniform vec2 uGrid;
  out vec2 vUv;
  out float vAlpha;
  out vec2 vImg;
  void main() {
    float Z = aP.z * uDepthScale;
    float k = (uD + Z) / uD;
    vec2 g = vec2(aP.x * uA - 1.0, uHalfH - aP.y * uA);
    float c = cos(aS.y), s = sin(aS.y);
    vec2 corner = position.xy * aWH * aS.x;              // px
    corner = vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y);
    vec3 world = vec3((g + corner * uA * vec2(1.0, -1.0)) * k, -Z);
    // the sprite's own box inside its atlas cell
    vec2 cell = vec2(aS.z, aS.w);
    vec2 off = (vec2(uCell) - aWH) * 0.5 / uCell;
    vUv = (cell + off + (position.xy + 0.5) * aWH / uCell) / uGrid;
    vAlpha = aP.w;
    vImg = aP.xy + corner;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const fragment = /* glsl */ `
  precision highp float;
  in vec2 vUv;
  in float vAlpha;
  in vec2 vImg;
  uniform sampler2D uAtlas;
  uniform float uFilter;
  void main() {
    vec4 c = texture(uAtlas, vUv);
    float a = c.a * vAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(c.rgb, a);
  }
`;

const rnd = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// a group of sprites whose state is written from the CPU every frame
function spriteMesh(atlasTex, atlas, count, shared) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute('position', quad.getAttribute('position'));
  const aP = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
  const aS = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
  const aWH = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2);
  aP.setUsage(THREE.DynamicDrawUsage);
  aS.setUsage(THREE.DynamicDrawUsage);
  aWH.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aP', aP);
  g.setAttribute('aS', aS);
  g.setAttribute('aWH', aWH);
  g.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uA: shared.uA, uHalfH: shared.uHalfH, uD: shared.uD, uDepthScale: shared.uDepthScale, uFilter: shared.uFilter,
      uAtlas: { value: atlasTex }, uCell: { value: atlas.cell }, uGrid: { value: new THREE.Vector2(atlas.cols, atlas.rows) },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,      // drawn in image axes (y down): the winding flips
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  return { mesh, aP, aS, aWH, count };
}

// Emitters come from scene.fx.spray (image px already scaled to working px by
// main.js); `waves` gives each wave's period and the time in it when it lets go.
export function sprayMeshes(shared, atlasTex, scene, { LOOP, waves, groups = ['far', 'mid', 'front'] }) {
  const atlas = scene.spray;
  const sprites = atlas.sprites;
  const fx = scene.fx || {};
  const G = 820;                      // px / s^2: everything falls back
  const particles = Object.fromEntries(groups.map((g) => [g, []]));

  (fx.spray || []).forEach((em, ei) => {
    const r = rnd(1000 + ei * 7919);
    const wave = waves[em.wave] || { period: em.every || 6, release: 0 };
    const period = em.every || wave.period;
    const n = em.n ?? 5;
    const bursts = em.bursts || [0];
    for (const b of bursts) {
      for (let i = 0; i < n; i++) {
        const along = em.line ? r() : 0;
        const x0 = em.line ? em.line[0][0] + (em.line[1][0] - em.line[0][0]) * along : em.at[0];
        const y0 = em.line ? em.line[0][1] + (em.line[1][1] - em.line[0][1]) * along : em.at[1];
        const ang = ((em.dir + (r() - 0.5) * 2 * (em.spread ?? 25)) * Math.PI) / 180;
        const v = em.speed[0] + r() * (em.speed[1] - em.speed[0]);
        const birth = (wave.release + b + (r() - 0.5) * 2 * (em.jitter ?? 0.25) + period * 4) % period;
        particles[em.group || 'mid'].push({
          x0: x0 + (r() - 0.5) * 2 * (em.scatter ?? 8), y0: y0 + (r() - 0.5) * 2 * (em.scatter ?? 8),
          vx: Math.cos(ang) * v, vy: -Math.sin(ang) * v,
          birth, period, life: em.life[0] + r() * (em.life[1] - em.life[0]),
          drag: em.drag ?? 1.6, g: G * (em.gravity ?? 1),
          size: em.size[0] + r() * (em.size[1] - em.size[0]),
          rot0: r() * Math.PI * 2, spin: (r() - 0.5) * 2 * (em.spin ?? 1.6),
          sprite: Math.floor(r() * sprites.length), z: em.z,
          wind: em.wind ?? 60,
        });
      }
    }
  });

  // flecks along the troughs: whole trips per loop
  const flecks = [];
  (fx.flecks || []).forEach((fl, fi) => {
    const r = rnd(5000 + fi * 104729);
    const pts = fl.path;
    const seg = [];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      seg.push(l);
      total += l;
    }
    for (let i = 0; i < fl.n; i++) {
      flecks.push({
        pts, seg, total, trips: fl.trips, phase: r(),
        off: (r() - 0.5) * 2 * (fl.width ?? 14), wob: 4 + r() * 6, wobN: 1 + Math.floor(r() * 4),
        size: fl.size[0] + r() * (fl.size[1] - fl.size[0]), sprite: Math.floor(r() * sprites.length),
        rot0: r() * Math.PI * 2, spinN: Math.round((r() - 0.5) * 6), z: fl.z, group: fl.group || 'mid',
      });
    }
  });
  for (const f of flecks) particles[f.group].push({ fleck: f });

  const meshes = {};
  for (const g of groups) meshes[g] = spriteMesh(atlasTex, atlas, Math.max(1, particles[g].length), shared);

  function update(t, amp) {
    const live = Math.min(1, amp);
    for (const g of groups) {
      const M = meshes[g];
      const P = M.aP.array, S = M.aS.array, WH = M.aWH.array;
      particles[g].forEach((p, i) => {
        let x, y, z, a, sc, rot, spr;
        if (p.fleck) {
          const f = p.fleck;
          const u = (((t / LOOP) * f.trips + f.phase) % 1 + 1) % 1;
          let dist = u * f.total, k = 0;
          while (k < f.seg.length - 1 && dist > f.seg[k]) { dist -= f.seg[k]; k++; }
          const q = Math.min(1, dist / f.seg[k]);
          const A = f.pts[k], B = f.pts[k + 1];
          const tx = (B[0] - A[0]) / f.seg[k], ty = (B[1] - A[1]) / f.seg[k];
          const wob = f.wob * Math.sin(2 * Math.PI * (u * f.wobN * 3 + f.phase));
          x = A[0] + (B[0] - A[0]) * q - ty * (f.off + wob);
          y = A[1] + (B[1] - A[1]) * q + tx * (f.off + wob);
          z = f.z;
          a = Math.min(1, u * 12) * Math.min(1, (1 - u) * 12) * 0.95;
          sc = f.size;
          rot = f.rot0 + 2 * Math.PI * f.spinN * (t / LOOP);
          spr = f.sprite;
        } else {
          const age = (((t - p.birth) % p.period) + p.period) % p.period;
          if (age > p.life) { a = 0; x = p.x0; y = p.y0; z = p.z; sc = 0; rot = 0; spr = p.sprite; }
          else {
            const k = p.drag;
            const tau = (1 - Math.exp(-k * age)) / k;
            x = p.x0 + p.vx * tau + p.wind * age * age * 0.5;
            y = p.y0 + p.vy * tau + 0.5 * p.g * age * age * 0.55;
            z = p.z - 0.004 * age;
            const u = age / p.life;
            a = Math.min(1, age / 0.07) * (1 - Math.pow(Math.max(0, (u - 0.62) / 0.38), 1.6));
            // gone as it meets the water again
            if (y > p.y0 + 10) a *= Math.max(0, 1 - (y - p.y0 - 10) / 26);
            sc = p.size * (0.85 + 0.35 * Math.min(1, age / 0.5));
            rot = p.rot0 + p.spin * age;
            spr = p.sprite;
          }
        }
        const s = sprites[spr];
        P[i * 4] = x; P[i * 4 + 1] = y; P[i * 4 + 2] = z; P[i * 4 + 3] = a * live;
        S[i * 4] = sc; S[i * 4 + 1] = rot; S[i * 4 + 2] = s[0]; S[i * 4 + 3] = s[1];
        WH[i * 2] = s[2]; WH[i * 2 + 1] = s[3];
      });
      M.aP.needsUpdate = true;
      M.aS.needsUpdate = true;
      M.aWH.needsUpdate = true;
    }
  }

  return { meshes: Object.fromEntries(groups.map((g) => [g, meshes[g].mesh])), update, count: Object.fromEntries(groups.map((g) => [g, particles[g].length])) };
}
