import * as THREE from 'three';
import { Rig } from './rig.js';
import { LOOP, sampleAll, TRACKS, sample } from './timeline.js';
import { Input } from './input.js';
import { sharedUniforms } from './materials/gold.js';
import { bitmap, tex, pixels, Window, layerMesh, makeFrame } from './scene.js';
import { goldMaterial } from './materials/gold.js';
import { layerGeometry } from './scene.js';
import { mitsukuniBlade, araimaruSword } from './swords.js';
import { goldDust } from './particles.js';
import { makePost } from './post.js';

const Q = new URLSearchParams(location.search);
const FREEZE = Q.has('t') ? parseFloat(Q.get('t')) : null;
const FIXED = Q.has('mouse') ? Q.get('mouse').split(',').map(Number) : null;
const DEBUG_BONES = Q.has('bones');
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

const D = 3.0;            // eye distance from the glass, window width = 2
const DEPTH_SCALE = 1.0;  // world units per unit of depth
const EYE = { x: 0.34, y: 0.2 };
const BASE = new URL('../', import.meta.url);
const at = (p) => new URL(p, BASE).href;

// Render order, back to front. The skeleton's lifting arm stays behind both
// samurai the whole time: it rises from behind them, as in the print.
const ORDER = [
  'back', 'dust_far', 'skeleton', 'woman', 'blind', 'straw_floor', 'dust_mid',
  'skeleton_arm', 'skeleton_forearm', 'skeleton_hand',
  'mitsukuni', 'araimaru', 'araimaru_sword', 'araimaru_fists',
  'mitsukuni_blade', 'mitsukuni_scabbard', 'mitsukuni_grip', 'dust_near',
  'poem', 'cartouche_takiyasha', 'cartouche_mitsukuni', 'cartouche_araimaru', 'sig_left', 'sig_mid', 'sig_right',
  'frame',
];

// breathing: integral of the tension curve, so breaths speed up smoothly and the
// loop still closes
const TENSION_INT = (() => {
  const n = 1000, out = new Float32Array(n + 1);
  for (let i = 1; i <= n; i++) out[i] = out[i - 1] + sample(TRACKS['fx:tension'], (i / n) * LOOP) * (LOOP / n);
  return (t) => out[Math.min(n, Math.max(0, Math.round((t / LOOP) * n)))] / out[n];
})();

function wave(t, n, extra = 0, phase = 0) {
  // n whole breaths per loop, plus `extra` breaths spread over the tense part
  return Math.sin(Math.PI * 2 * ((t / LOOP) * n + extra * TENSION_INT(t)) + phase);
}

function noise(t, s) {
  return Math.sin(t * 9.1 + s) * 0.5 + Math.sin(t * 13.7 + s * 2.3) * 0.3 + Math.sin(t * 23.3 + s * 5.1) * 0.2;
}

export async function start(canvas, ui) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0x050302, 1);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const scene = await (await fetch(at('assets/scene.json'))).json();
  const palette = await (await fetch(at('assets/palette.json'))).json();
  const win = new Window(scene.size);
  const S = scene.scale;
  const rig = new Rig(scene.bones, S);

  ui.progress?.(0.05);
  const [grainB, brushB] = await Promise.all([bitmap(at('assets/tex/grain.png')), bitmap(at('assets/tex/brush.png'))]);
  const shared = sharedUniforms(palette, { grain: tex(grainB, { repeat: true }), brush: tex(brushB, { repeat: true }) }, rig,
    { A: win.A, halfH: win.halfH, D, depthScale: DEPTH_SCALE });

  // load every layer: colour, material, aux, skin weights
  let done = 0;
  const layers = await Promise.all(scene.layers.map(async (L) => {
    const [c, m, a, w] = await Promise.all([
      bitmap(at(`assets/layers/${L.name}.webp`)),
      bitmap(at(`assets/maps/${L.name}_mat.webp`)),
      bitmap(at(`assets/maps/${L.name}_aux.webp`)),
      L.skin?.map ? bitmap(at(`assets/maps/${L.name}_w.png`)) : null,
    ]);
    ui.progress?.(0.05 + 0.85 * (++done / scene.layers.length));
    return { L, c, m, a, w };
  }));

  const three = new THREE.Scene();
  const meshes = {};
  for (const { L, c, m, a, w } of layers) {
    const textures = { color: tex(c, { srgb: true }), mat: tex(m), aux: tex(a) };
    textures.color.anisotropy = maxAniso;
    const step = L.name === 'back' ? 24 : L.box[2] * L.box[3] > 9e5 ? 12 : 6;
    const mesh = layerMesh(L, textures, shared, win, rig, {
      weights: w ? pixels(w) : null,
      aux: L.name === 'back' ? pixels(a) : null,
      floorCurve: scene.floor_curve,
      step,
    });
    meshes[L.name] = mesh;
    three.add(mesh);
  }

  // the two new swords
  const bones = Object.fromEntries(scene.bones.map((b) => [b.name, b]));
  const mk = (spec, owner, depth) => {
    const L = { name: spec.name, box: spec.box, kind: 'sword', depth: { z: depth }, skin: { default: owner, bones: [] } };
    const geo = layerGeometry(L, win, rig, { floorCurve: scene.floor_curve, step: 6 });
    const mat = goldMaterial(shared, { color: spec.color, mat: spec.mat, aux: spec.aux, kind: 'sword', opacity: 0 });
    mat.uniforms.uBladeStart.value = spec.bladeStart;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.name = spec.name;
    meshes[spec.name] = mesh;
    three.add(mesh);
  };
  const tsuba = bones.mitsukuni_blade.pivot.map((v) => v / S);
  mk(mitsukuniBlade(S, tsuba), 'mitsukuni_blade', 0.36);
  const grip = bones.araimaru_sword.pivot.map((v) => v / S);
  mk(araimaruSword(S, grip), 'araimaru_sword', 0.34);

  // gold dust at three depths, interleaved with the layers
  const dustScale = REDUCED ? 0.4 : 1;
  meshes.dust_far = goldDust(shared, { count: Math.round(140 * dustScale), depthLo: 0.7, depthHi: 1.0, seed: 3, gain: 0.8 });
  meshes.dust_mid = goldDust(shared, { count: Math.round(110 * dustScale), depthLo: 0.42, depthHi: 0.7, seed: 7, gain: 0.9 });
  meshes.dust_near = goldDust(shared, { count: Math.round(70 * dustScale), depthLo: 0.06, depthHi: 0.34, seed: 11, gain: 1 });
  three.add(meshes.dust_far, meshes.dust_mid, meshes.dust_near);

  const frame = makeFrame(shared, win);
  meshes.frame = frame;
  three.add(frame);
  ORDER.forEach((n, i) => { if (meshes[n]) meshes[n].renderOrder = i; });
  for (const n in meshes) if (!ORDER.includes(n)) console.warn('no render order for', n);
  if (Q.has('only')) {
    // debug: ?only=back,skeleton_arm shows just those layers (the frame stays)
    const keep = new Set([...Q.get('only').split(','), 'frame']);
    for (const n in meshes) meshes[n].visible = keep.has(n);
  }

  const camera = new THREE.PerspectiveCamera();
  const post = makePost(renderer, three, camera);
  const input = new Input(canvas, { fixed: FIXED, reduced: REDUCED });
  input.onFirstMove = () => ui.firstMove?.();

  const resize = () => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pr);
    renderer.setSize(vw, vh, false);
    post.setSize(vw, vh, pr);
    const ap = win.layout(vw, vh);
    frame.userData.rebuild(win.bounds);
    post.finish.uniforms.uAperture.value.set(ap.x / vw, 1 - (ap.y + ap.h) / vh, (ap.x + ap.w) / vw, 1 - ap.y / vh);
    ui.layout?.(ap);
  };
  window.addEventListener('resize', resize);
  resize();

  const id = (n) => rig.id(n);
  const B = Object.fromEntries(rig.list.map((b, i) => [b.name, i]));
  let last = performance.now() / 1000, clock = 0;
  const state = { paused: false, speed: 1 };

  function pose(t, now) {
    rig.reset();
    const v = sampleAll(t);
    for (const key in v) {
      if (key.startsWith('layer:')) {
        const [name, prop] = key.slice(6).split('.');
        const m = meshes[name];
        if (m && prop === 'opacity') m.material.uniforms.uOpacity.value = v[key];
      } else if (!key.startsWith('fx:')) {
        const [bone, prop] = key.split('.');
        rig.pose[id(bone)][prop] = v[key];
      }
    }
    const tension = v['fx:tension'];

    // everyone breathes; the samurai faster once the arm rises
    const wb = wave(t, 2, 0, 0.3);
    rig.pose[B.woman_chest].sy = 1 + 0.009 * wb;
    rig.pose[B.woman_chest].ty -= 1.2 * wb;
    const mb = wave(t, 3, 2, 1.1);
    rig.pose[B.mitsukuni_chest].sy = 1 + (0.008 + 0.006 * tension) * mb;
    rig.pose[B.mitsukuni_chest].ty -= (1.2 + 0.8 * tension) * mb;
    const ab = wave(t, 3, 2, 2.4);
    rig.pose[B.araimaru_back].sy = 1 + (0.009 + 0.006 * tension) * ab;
    rig.pose[B.araimaru_back].ty -= (1.5 + 1.0 * tension) * ab;
    const sb = wave(t, 1, 0, 0.0);
    rig.pose[B.skel_ribs].sx = 1 + 0.007 * sb;
    rig.pose[B.skel_ribs].sy = 1 + 0.009 * sb;
    rig.pose[B.skel_skull].ty += -2.0 * sb;
    rig.pose[B.skel_skull].rot += 0.35 * sb;

    // the blade lies along the scabbard, which slopes down about 4 degrees;
    // only the length pulled out of the scabbard is drawn, all of it once raised
    rig.pose[B.mitsukuni_blade].rot = 4.3;
    const pulled = Math.max(0, -rig.pose[B.mitsukuni_grip].tx) / 300;
    const raised = Math.min(1, Math.abs(rig.pose[B.mitsukuni_grip].rot) / 16);
    meshes.mitsukuni_blade.material.uniforms.uReveal.value = Math.min(1, Math.max(pulled, raised));

    // held blades tremble a little; the claw flexes
    rig.pose[B.mitsukuni_grip].rot += tension * 0.55 * noise(t, 1.0);
    rig.pose[B.araimaru_sword].rot += tension * 0.65 * noise(t, 4.0);
    rig.pose[B.arm_fingers].rot += tension * 1.5 * noise(t * 0.5, 7.0);
    rig.pose[B.arm_upper].rot += tension * 0.6 * Math.sin(t * 2.1);

    // Takiyasha watches the cursor: chin up when it rises, down when it falls
    rig.pose[B.woman_head].rot += input.headY * 9;
    rig.pose[B.woman_head].ty += -input.headY * 1.5;
    rig.update();

    const gm = v['fx:glint_mitsukuni'], ga = v['fx:glint_araimaru'];
    meshes.mitsukuni_blade.material.uniforms.uGlint.value.set(gm, gm > -0.2 && gm < 1.2 ? 1 : 0);
    meshes.araimaru_sword.material.uniforms.uGlint.value.set(ga, ga > -0.2 && ga < 1.2 ? 1 : 0);
    meshes.araimaru_sword.material.uniforms.uReveal.value = v['fx:araimaru_reveal'];
  }

  function frameStep() {
    const now = performance.now() / 1000;
    const dt = Math.min(0.05, now - last);
    last = now;
    if (!state.paused) clock = (clock + dt * state.speed) % LOOP;
    const t = FREEZE ?? clock;
    input.update(dt, now);
    pose(t, now);
    shared.uTime.value = FREEZE ?? now;
    const ex = input.eyeX * EYE.x, ey = input.eyeY * EYE.y;
    win.aim(camera, ex, ey, D);
    shared.uEye.value.set(ex, ey, D);
    shared.uLightPos.value.set(input.lightX * 1.5, 0.35 + input.lightY * 0.9, 1.7);
    post.finish.uniforms.uLight.value.set(input.lightX, input.lightY);
    post.finish.uniforms.uTime.value = now;
    post.composer.render(dt);
    if (DEBUG_BONES) drawBones();
    ui.tick?.(dt, t);
  }

  // debug: bone pivots projected to the screen
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
      const sx = ap.x + (x / win.W) * ap.w, sy = ap.y + (y / win.H) * ap.h;
      const pi = rig.parent[i];
      if (pi > 0) {
        const [px, py] = rig.pivotNow(pi);
        g.strokeStyle = 'rgba(0,255,200,0.7)';
        g.beginPath(); g.moveTo(ap.x + (px / win.W) * ap.w, ap.y + (py / win.H) * ap.h); g.lineTo(sx, sy); g.stroke();
      }
      g.fillStyle = '#0fc';
      g.beginPath(); g.arc(sx, sy, 3, 0, 7); g.fill();
      g.fillText(rig.list[i].name, sx + 4, sy - 4);
    }
  }

  // dev: render one frame at loop time t and post it to the local server
  async function capture(name, t = FREEZE ?? clock) {
    const keep = state.paused;
    state.paused = true;
    clock = t;
    frameStep();
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
    state.paused = keep;
    await fetch(`/__capture?name=${encodeURIComponent(name)}`, { method: 'POST', body: blob });
    const pr = renderer.getPixelRatio(), ap = win.ap;
    return { size: [canvas.width, canvas.height], ap: [ap.x * pr, ap.y * pr, ap.w * pr, ap.h * pr] };
  }

  renderer.setAnimationLoop(frameStep);
  ui.progress?.(1);
  return { renderer, state, shared, post, meshes, rig, input, three, capture, setRaw: (on) => (shared.uRaw.value = on ? 1 : 0) };
}
