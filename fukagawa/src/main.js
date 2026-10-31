import * as THREE from 'three';
import { Rig } from './rig.js';
import { LOOP, sampleAll } from './timeline.js';
import { Input } from './input.js';
import { sharedUniforms } from './materials/shared.js';
import { plateMaterial } from './materials/plate.js';
import { layerMaterial } from './materials/layer.js';
import { bitmap, tex, pixels, sampler, Window, gridGeometry, layerGeometry } from './scene.js';
import { cloudMeshes } from './clouds.js';
import { snowMeshes } from './snow.js';
import { makePost } from './post.js';

const Q = new URLSearchParams(location.search);
const FREEZE = Q.has('t') ? parseFloat(Q.get('t')) : null;
const FIXED = Q.has('mouse') ? Q.get('mouse').split(',').map(Number) : null;
const RAW = Q.has('raw');
const AMP = RAW ? 0 : Q.has('amp') ? parseFloat(Q.get('amp')) : 1;
const BARE = Q.has('bare');
const DEBUG_BONES = Q.has('bones');
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

const D = 3.0;              // eye distance from the glass, window width = 2
const DEPTH_SCALE = 1.25;   // world units per unit of depth
const EYE = { x: 0.22, y: 0.1 };
const BASE = new URL('../', import.meta.url);
const at = (p) => new URL(p, BASE).href;

export async function start(canvas, ui) {
  THREE.ColorManagement.enabled = false;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;   // the painting's sRGB numbers go straight to the screen
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x0d0e11, 1);

  const scene = await (await fetch(at('assets/scene.json'))).json();
  const [W, H] = scene.size, O = scene.overscan;
  const planeZ = (y) => scene.depth.back + (scene.depth.front - scene.depth.back) * (y / H);
  const win = new Window(scene.size);
  const rig = new Rig(scene.bones);
  const B = Object.fromEntries(rig.list.map((b, i) => [b.name, i]));

  ui.progress?.(0.05);
  const files = [['plate.webp'], ['maps/env.webp'], ...(scene.breath ? [['maps/breath.png']] : [])];
  const cloudFiles = ['maps/cloudfield.webp', 'maps/cloudlimits.webp', 'maps/cloudbody.webp'];
  const layerFiles = scene.layers.map((L) => [`layers/${L.name}.webp`,
    ...Array.from({ length: L.skin?.maps || 0 }, (_, k) => `maps/${L.name}_w${k}.png`)]);
  const total = files.length + cloudFiles.length + layerFiles.length;
  let done = 0;
  const tick = (x) => { ui.progress?.(0.05 + 0.85 * (++done / total)); return x; };
  const get = (f) => bitmap(at('assets/' + f));
  const [plateB, envB, breathB] = await Promise.all(files.map(([f]) => get(f).then(tick)));
  const cloudB = await Promise.all(cloudFiles.map((f) => get(f).then(tick)));
  const layerB = await Promise.all(layerFiles.map((fs) => Promise.all(fs.map(get)).then(tick)));

  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const shared = sharedUniforms(scene, rig, { A: win.A, halfH: win.halfH, D, depthScale: DEPTH_SCALE });
  shared.uEnv.value = tex(envB);
  shared.uLoop.value = LOOP;
  shared.uAmp.value = AMP * (REDUCED ? 0.5 : 1);
  if (RAW) shared.uFilter.value = 0;

  const three = new THREE.Scene();
  const meshes = {};
  const order = [];

  // the plate: one tilted plane; the figures that are not cut out breathe in it
  const breathS = breathB ? sampler(pixels(breathB), { nearest: true }) : null;
  const breathW = breathB ? sampler(pixels(breathB)) : null;
  const plateTex = tex(plateB);
  plateTex.anisotropy = maxAniso;
  const plateGeo = gridGeometry([-O, -O, W + 2 * O, H + 2 * O], {
    step: 16, depth: (x, y) => planeZ(y),
    skin: breathS ? (x, y) => {
      const u = x / W, v = y / H;
      if (u < 0 || v < 0 || u > 1 || v > 1) return [];
      const id = Math.round(breathS(u, v, 0) * 255), w = breathW(u, v, 1);
      return id > 0 && w > 0.002 ? [[id, w]] : [];
    } : null,
  });
  meshes.plate = new THREE.Mesh(plateGeo, plateMaterial(shared, plateTex));
  order.push('plate');

  // snow: far and middle grains fall behind the figures, the few near ones in front
  const snow = snowMeshes(shared, scene.snow, scene);
  meshes.snow_back = snow.meshes[0];
  meshes.snow_front = snow.meshes[1];
  if (RAW) snow.uniforms.uSnow.value = 0;
  order.push('snow_back');

  scene.layers.forEach((L, i) => {
    const [cb, ...wb] = layerB[i];
    const geo = layerGeometry(L, rig, wb.map(pixels), { depth: () => L.z, step: L.step || 5 });
    const t = tex(cb);
    t.anisotropy = maxAniso;
    meshes[L.name] = new THREE.Mesh(geo, layerMaterial(shared, t, L.box));
    order.push(L.name);
  });

  order.push('snow_front');
  // distance fields are read exactly: linear, no mipmaps
  const field = (b) => tex(b, { mips: false });
  const clouds = cloudMeshes(shared, scene.clouds, { field: field(cloudB[0]), limits: field(cloudB[1]), body: tex(cloudB[2]) }, scene);
  for (const m of clouds) { meshes[m.name] = m; order.push(m.name); }

  for (const name of order) {
    const m = meshes[name];
    m.name = name;
    m.frustumCulled = false;
    m.renderOrder = order.indexOf(name);
    three.add(m);
  }
  if (Q.has('only')) {
    const keep = new Set(Q.get('only').split(','));
    for (const n in meshes) meshes[n].visible = keep.has(n);
  }

  const camera = new THREE.PerspectiveCamera();
  const post = makePost(renderer, three, camera);
  if (RAW) post.finish.uniforms.uFilter.value = 0;
  const input = new Input(canvas, { fixed: FIXED, reduced: REDUCED });
  input.onFirstMove = () => ui.firstMove?.();

  const state = { paused: false, speed: 1, capturing: false };

  function sizeTo(vw, vh, pr, bare) {
    renderer.setPixelRatio(pr);
    renderer.setSize(vw, vh, false);
    post.setSize(vw, vh, pr);
    const ap = win.layout(vw, vh, { bare });
    post.finish.uniforms.uAperture.value.set(ap.x / vw, 1 - (ap.y + ap.h) / vh, (ap.x + ap.w) / vw, 1 - ap.y / vh);
    return ap;
  }
  const resize = () => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(8e6 / (vw * vh)));
    const ap = sizeTo(vw, vh, pr, BARE);
    ui.layout?.(ap);
  };
  window.addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- the pose

  const breath = (t, n, phase) => Math.sin(2 * Math.PI * ((t / LOOP) * n) + phase);

  function pose(t) {
    rig.reset();
    const v = sampleAll(t);
    const amp = shared.uAmp.value;
    for (const key in v) {
      if (key.startsWith('fx:')) continue;
      const [bone, prop] = key.split('.');
      const p = rig.pose[B[bone]];
      if (prop === 'sx' || prop === 'sy') p[prop] = 1 + (v[key] - 1) * amp;
      else p[prop] = v[key] * amp;
    }
    // everyone breathes: whole breaths per loop, each on her own rhythm; a breath
    // gives way while she moves (fx:<bone> < 1)
    for (const b of scene.breathing || []) {
      const k = v['fx:' + b.bone] ?? 1;
      const w = breath(t, b.n, b.phase) * amp * k * (b.amp ?? 1);
      const p = rig.pose[B[b.bone]];
      p.sy *= 1 + 0.012 * w;
      p.sx *= 1 + 0.004 * w;
    }
    rig.update();
  }

  // the eye's slow swing for stills, video and an idle page: once across and
  // back per loop, so the loop still closes
  const drift = (t) => {
    const ph = t / LOOP;
    return [0.85 * Math.sin(2 * Math.PI * ph), 0.12 * Math.sin(2 * Math.PI * 2 * ph + 0.6)];
  };

  function setUniforms(t, ex, ey) {
    shared.uPhase.value = t / LOOP;
    shared.uEye.value.set(ex, ey);
    win.aim(camera, ex, ey, D);
    post.finish.uniforms.uTime.value = (t / LOOP) * 37.0;
  }

  let last = performance.now() / 1000, clock = 0;
  function frameStep() {
    const now = performance.now() / 1000;
    const dt = Math.min(0.05, now - last);
    last = now;
    if (!state.paused) clock = (clock + dt * state.speed) % LOOP;
    const t = FREEZE ?? clock;
    input.update(dt, now, drift(t));
    pose(t);
    setUniforms(t, input.eyeX * EYE.x * shared.uAmp.value, input.eyeY * EYE.y * shared.uAmp.value);
    post.render(dt);
    if (DEBUG_BONES) drawBones();
    ui.tick?.(dt, t);
  }

  // one frame at loop time t (stills and video)
  function renderAt(t, eye = null) {
    const tt = ((t % LOOP) + LOOP) % LOOP;
    const e = eye ?? drift(tt);
    pose(tt);
    setUniforms(tt, e[0] * EYE.x * shared.uAmp.value, e[1] * EYE.y * shared.uAmp.value);
    post.render(1 / 30);
  }

  // dev: a still at loop time t, posted to the local server (work/captures)
  async function capture(name, t = FREEZE ?? clock, { w = null, eye = null } = {}) {
    const keep = state.paused;
    state.paused = true;
    renderer.setAnimationLoop(null);
    if (w) sizeTo(w, Math.round(w / win.aspect / 2) * 2, 1, true);
    renderAt(t, eye);
    const blob = await new Promise((res) => canvas.toBlob(res, w ? 'image/png' : 'image/jpeg', 0.92));
    if (w) resize();
    state.paused = keep;
    renderer.setAnimationLoop(frameStep);
    await fetch(`/__capture?name=${encodeURIComponent(name)}${w ? '&ext=png' : ''}`, { method: 'POST', body: blob });
    return { size: [canvas.width, canvas.height] };
  }

  // dev: the whole loop, frame by frame, piped into ffmpeg by tools/serve.py
  async function exportVideo({ fps = 30, w = 2560, name = 'fukagawa_loop_60s', quality = 0.95, crf = 18, keep = false, onFrame } = {}) {
    const h = Math.round(w / win.aspect / 2) * 2;
    state.capturing = true;
    renderer.setAnimationLoop(null);
    sizeTo(w, h, 1, true);
    const grain = post.finish.uniforms.uGrain.value;
    post.finish.uniforms.uGrain.value = 0;
    try {
      const r = await fetch(`/__video/start?name=${encodeURIComponent(name)}&fps=${fps}&crf=${crf}${keep ? '&keep=1' : ''}`, { method: 'POST' });
      if (!r.ok) throw new Error('video start: ' + r.status);
      const n = Math.round(LOOP * fps);
      for (let i = 0; i < n; i++) {
        renderAt(i / fps);
        // base64 text, not a Blob: 1800 Blobs of a megabyte outgrow the browser's
        // blob store long before they are collected
        const url = canvas.toDataURL('image/jpeg', quality);
        const body = url.slice(url.indexOf(',') + 1);
        // a dropped request must not cost the whole render: try a frame a few times
        for (let attempt = 0; ; attempt++) {
          try {
            const fr = await fetch(`/__video/frame?i=${i}&b64=1`, { method: 'POST', body });
            if (fr.ok) break;
            throw new Error('frame ' + i + ': ' + fr.status);
          } catch (err) {
            if (attempt >= 4) throw err;
            await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
          }
        }
        onFrame?.(i + 1, n);
      }
      return await (await fetch('/__video/end', { method: 'POST' })).json();
    } finally {
      post.finish.uniforms.uGrain.value = grain;
      state.capturing = false;
      resize();
      renderer.setAnimationLoop(frameStep);
    }
  }

  // debug: bone pivots over the painting
  let dbg;
  function drawBones() {
    if (!dbg) {
      dbg = document.createElement('canvas');
      dbg.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5';
      document.body.appendChild(dbg);
    }
    const vw = window.innerWidth, vh = window.innerHeight;
    dbg.width = vw; dbg.height = vh;
    const g = dbg.getContext('2d');
    g.font = '10px system-ui';
    const ap = win.ap;
    for (let i = 1; i < rig.list.length; i++) {
      const [x, y] = rig.pivotNow(i);
      const sx = ap.x + (x / W) * ap.w, sy = ap.y + (y / H) * ap.h;
      g.fillStyle = '#0fc';
      g.beginPath(); g.arc(sx, sy, 2.5, 0, 7); g.fill();
      g.fillText(rig.list[i].name, sx + 4, sy - 4);
    }
  }

  renderer.setAnimationLoop(frameStep);
  ui.progress?.(1);
  return {
    renderer, state, shared, post, meshes, rig, input, three, win, LOOP, snow,
    capture, exportVideo, renderAt,
    setRaw(on) {
      shared.uFilter.value = on ? 0 : 1;
      post.finish.uniforms.uFilter.value = on ? 0 : 1;
    },
  };
}
