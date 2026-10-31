import * as THREE from 'three';
import { Rig } from './rig.js';
import { LOOP, WAVES, sampleAll, lift } from './timeline.js';
import { Input } from './input.js';
import { sharedUniforms } from './materials/shared.js';
import { plateMaterial } from './materials/plate.js';
import { layerMaterial, waveMaterial, shadowMaterial } from './materials/layer.js';
import { bitmap, tex, pixels, Window, gridGeometry, layerGeometry } from './scene.js';
import { foamStrips } from './foam.js';
import { clawMeshes } from './claws.js';
import { puffMeshes } from './clouds.js';
import { sprayMeshes } from './spray.js';
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
const EYE = { x: 0.24, y: 0.1 };
const BASE = new URL('../', import.meta.url);
const at = (p) => new URL(p, BASE).href;

export async function start(canvas, ui) {
  THREE.ColorManagement.enabled = false;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;   // the print's sRGB numbers go straight to the screen
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x0b0c0f, 1);

  const scene = await (await fetch(at('assets/scene.json'))).json();
  const [W, H] = scene.size, O = scene.overscan;
  const planeZ = (y) => scene.depth.back + (scene.depth.front - scene.depth.back) * (y / H);
  const win = new Window(scene.size);
  const rig = new Rig(scene.bones);
  const B = Object.fromEntries(rig.list.map((b, i) => [b.name, i]));

  ui.progress?.(0.05);
  const files = ['plate.webp', 'maps/cloud.webp', 'spray.webp', 'foam.webp'];
  const layerFiles = scene.layers.map((L) => [`layers/${L.name}.webp`,
    ...Array.from({ length: L.skin?.maps || 0 }, (_, k) => `maps/${L.name}_w${k}.png`)]);
  const foamCrests = scene.crests.filter((c) => c.foam);
  const total = files.length + layerFiles.length + foamCrests.length;
  let done = 0;
  const tick = (x) => { ui.progress?.(0.05 + 0.85 * (++done / total)); return x; };
  const get = (f) => bitmap(at('assets/' + f));
  const [plateB, cloudB, sprayB, clawB] = await Promise.all(files.map((f) => get(f).then(tick)));
  const layerB = await Promise.all(layerFiles.map((fs) => Promise.all(fs.map(get)).then(tick)));
  const foamB = await Promise.all(foamCrests.map((c) => get(`layers/${c.name}.webp`).then(tick)));

  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const shared = sharedUniforms(scene, rig, { A: win.A, halfH: win.halfH, D, depthScale: DEPTH_SCALE });
  shared.uLoop.value = LOOP;
  shared.uAmp.value = AMP * (REDUCED ? 0.5 : 1);
  if (RAW) shared.uFilter.value = 0;

  const three = new THREE.Scene();
  const meshes = {};
  const order = [];

  // the plate: one tilted plane, its black clouds redrawn every frame
  const plateTex = tex(plateB);
  plateTex.anisotropy = maxAniso;
  const cloudTex = tex(cloudB, { mips: false });
  const plateGeo = gridGeometry([-O, -O, W + 2 * O, H + 2 * O], { step: 24, depth: (x, y) => planeZ(y) });
  meshes.plate = new THREE.Mesh(plateGeo, plateMaterial(shared, plateTex, cloudTex));
  order.push('plate');

  // spray and flecks, in three depth groups; puffs of cloud in front of the dragon
  const spray = sprayMeshes(shared, tex(sprayB), scene, { LOOP, waves: WAVES });
  const puffs = puffMeshes(shared, scene.fx?.puffs || [], LOOP);
  const after = { swell_r: ['spray_far'], whisker: puffs.map((p) => p.mesh.name), curl_r: ['spray_mid'] };
  meshes.spray_far = spray.meshes.far;
  meshes.spray_mid = spray.meshes.mid;
  meshes.spray_front = spray.meshes.front;
  for (const p of puffs) meshes[p.mesh.name] = p.mesh;

  const waveMats = {};
  const layerInfo = {};
  const geos = scene.layers.map((L, i) => {
    const [, ...wb] = layerB[i];
    const maps = wb.map(pixels);
    layerInfo[L.name] = { L, maps };
    return layerGeometry(L, rig, maps, { depth: () => L.z, step: L.step || 5 });
  });
  // the foam riding the crests, drawn just over its wave
  const foam = foamStrips(shared, scene, rig, layerInfo,
    Object.fromEntries(foamCrests.map((c, k) => { const t = tex(foamB[k]); t.anisotropy = maxAniso; return [c.name, t]; })),
    { LOOP, lift });
  for (const st of foam.strips) {
    meshes[st.name] = st.mesh;
    (after[st.layer] = after[st.layer] || []).unshift(st.name);
  }
  // every other foam claw, churning on its wave, drawn under the crest foam
  const clawTex = tex(clawB);
  clawTex.anisotropy = maxAniso;
  const claws = clawMeshes(shared, scene, rig, layerInfo, clawTex, { lift, planeZ });
  for (const name in claws.meshes) {
    meshes[name + '_claws'] = claws.meshes[name];
    if (name === 'plate') order.push('plate_claws');     // right over the plate
    else (after[name] = after[name] || []).unshift(name + '_claws');
  }
  scene.layers.forEach((L, i) => {
    const [cb] = layerB[i];
    const geo = geos[i];
    const t = tex(cb);
    t.anisotropy = maxAniso;
    // contact shadows for the figures, boats and creatures; not for the water:
    // a sea layer's edges are mostly cuts through one sea, and a shadow there
    // drew a false line between two bodies of the same water
    if (!RAW && L.kind !== 'wave') {
      const sh = new THREE.Mesh(geo, shadowMaterial(shared, t, L.box, { drop: [3, 9], soft: 2.6, dz: 0.012, cloth: L.cloth || null }));
      meshes[L.name + '_shadow'] = sh;
      order.push(L.name + '_shadow');
    }
    const mat = L.kind === 'wave' ? waveMaterial(shared, t, L.box) : layerMaterial(shared, t, L.box, { cloth: L.cloth || null });
    if (L.kind === 'wave') waveMats[L.name] = mat;
    meshes[L.name] = new THREE.Mesh(geo, mat);
    order.push(L.name);
    for (const n of after[L.name] || []) order.push(n);
  });
  order.push('spray_front');

  for (const name of order) {
    const m = meshes[name];
    m.name = name;
    m.frustumCulled = false;
    m.renderOrder = order.indexOf(name);
    three.add(m);
  }
  if (Q.has('only')) {
    const keep = new Set(Q.get('only').split(','));
    for (const n in meshes) meshes[n].visible = keep.has(n) || keep.has(n.replace(/_(shadow|claws)$/, ''));
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

  const warned = new Set();
  function pose(t) {
    rig.reset();
    const v = sampleAll(t);
    const amp = shared.uAmp.value;
    for (const key in v) {
      const [bone, prop] = key.split('.');
      const i = B[bone];
      if (i === undefined) {
        if (!warned.has(bone)) { warned.add(bone); console.warn('timeline: no bone', bone); }
        continue;
      }
      const p = rig.pose[i];
      if (prop === 'sx' || prop === 'sy') p[prop] = 1 + (v[key] - 1) * amp;
      else p[prop] = v[key] * amp;
    }
    rig.update();
    for (const name in waveMats) waveMats[name].uniforms.uLift.value = lift(name, t) * Math.min(1, amp);
    for (const p of puffs) p.update(t, amp);
    foam.update(t, amp);
    claws.update(t, amp);
    spray.update(t, amp);
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

  // dev: a run of frames for a contact sheet (work/captures/<name>_NNN.jpg)
  async function captureRun(name, t0, t1, n, { w = 1600, eye = null } = {}) {
    const keep = state.paused;
    state.paused = true;
    renderer.setAnimationLoop(null);
    sizeTo(w, Math.round(w / win.aspect / 2) * 2, 1, true);
    for (let i = 0; i < n; i++) {
      const t = t0 + ((t1 - t0) * i) / Math.max(1, n - 1);
      renderAt(t, eye);
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
      await fetch(`/__capture?name=${encodeURIComponent(`${name}_${String(i).padStart(3, '0')}`)}`, { method: 'POST', body: blob });
    }
    resize();
    state.paused = keep;
    renderer.setAnimationLoop(frameStep);
    return n;
  }

  // dev: the whole loop, frame by frame, piped into ffmpeg by tools/serve.py
  async function exportVideo({ fps = 30, w = 2560, name = 'arashi_loop_60s', quality = 0.95, crf = 18, keep = false, onFrame } = {}) {
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

  // debug: bone pivots over the print
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
    renderer, state, shared, post, meshes, rig, input, three, win, LOOP, spray, puffs, foam, claws,
    capture, captureRun, exportVideo, renderAt,
    setRaw(on) {
      shared.uFilter.value = on ? 0 : 1;
      post.finish.uniforms.uFilter.value = on ? 0 : 1;
    },
  };
}
