import * as THREE from 'three';

// Katana drawn the way Kuniyoshi draws metal: a hard black contour, flat pale
// steel, the ridge line (shinogi) and a wavy temper line (hamon) near the edge.
// Each sword is three canvases: colour, material (R = keep colour, A = 1) and
// aux (flow along the blade, depth 0.5), all at RES x working pixels.

const RES = 2;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * RES);
  c.height = Math.ceil(h * RES);
  const g = c.getContext('2d');
  g.scale(RES, RES);
  return [c, g];
}

function texture(c, srgb) {
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

// blade from x0 to x0+len along y=cy, edge on the lower side, slight curve upward
function bladePath(g, x0, len, cy, w, curve = 0.035) {
  const sori = len * curve;
  const yAt = (x) => cy - sori * Math.pow((x - x0) / len, 2);
  g.beginPath();
  g.moveTo(x0, yAt(x0) - w * 0.5);
  for (let i = 1; i <= 24; i++) {
    const x = x0 + (len * 0.9 * i) / 24;
    g.lineTo(x, yAt(x) - w * 0.5 * (1 - 0.18 * (i / 24)));
  }
  // kissaki: the back curves down to the point
  const tip = x0 + len;
  g.quadraticCurveTo(tip - len * 0.02, yAt(tip) - w * 0.38, tip, yAt(tip) + w * 0.12);
  g.quadraticCurveTo(tip - len * 0.05, yAt(tip) + w * 0.5, tip - len * 0.1, yAt(tip - len * 0.1) + w * 0.45);
  for (let i = 24; i >= 0; i--) {
    const x = x0 + (len * 0.9 * i) / 24;
    g.lineTo(x, yAt(x) + w * 0.5 * (1 - 0.1 * (i / 24)));
  }
  g.closePath();
  return yAt;
}

function drawBlade(g, x0, len, cy, w, curve) {
  const yAt = bladePath(g, x0, len, cy, w, curve);
  const grad = g.createLinearGradient(0, cy - w, 0, cy + w);
  grad.addColorStop(0, '#9aa3a8');
  grad.addColorStop(0.45, '#dfe4e4');
  grad.addColorStop(1, '#f4f2ea');
  g.fillStyle = grad;
  g.fill();
  g.lineWidth = 1.6;
  g.strokeStyle = '#141210';
  g.stroke();
  // shinogi
  g.beginPath();
  g.moveTo(x0 + 6, yAt(x0) - w * 0.12);
  for (let i = 1; i <= 20; i++) {
    const x = x0 + 6 + ((len * 0.86 - 6) * i) / 20;
    g.lineTo(x, yAt(x) - w * 0.12);
  }
  g.lineWidth = 0.9;
  g.strokeStyle = 'rgba(30,30,32,0.75)';
  g.stroke();
  // hamon
  g.beginPath();
  for (let i = 0; i <= 90; i++) {
    const x = x0 + 8 + ((len * 0.88 - 8) * i) / 90;
    const wob = Math.sin(i * 1.7) * 0.9 + Math.sin(i * 0.63) * 0.6;
    const y = yAt(x) + w * 0.2 + wob;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.lineWidth = 1.1;
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.stroke();
}

function drawHabaki(g, x, cy, w) {
  g.fillStyle = '#c99a3c';
  g.strokeStyle = '#141210';
  g.lineWidth = 1.4;
  g.beginPath();
  g.rect(x, cy - w * 0.62, 10, w * 1.24);
  g.fill();
  g.stroke();
}

function drawTsuba(g, x, cy, h) {
  g.beginPath();
  g.ellipse(x, cy, 5.5, h / 2, 0, 0, Math.PI * 2);
  g.fillStyle = '#2a2420';
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = '#b8862c';
  g.stroke();
}

function drawHilt(g, x0, x1, cy, w) {
  g.beginPath();
  g.roundRect(x0, cy - w / 2, x1 - x0, w, w * 0.35);
  g.fillStyle = '#ece6da';
  g.fill();
  g.lineWidth = 1.6;
  g.strokeStyle = '#141210';
  g.stroke();
  // tsuka-ito: black diamonds over white rayskin
  g.save();
  g.clip();
  g.fillStyle = '#16120f';
  const step = w * 0.95;
  for (let x = x0 + 2; x < x1; x += step) {
    g.beginPath();
    g.moveTo(x, cy - w / 2);
    g.lineTo(x + step * 0.5, cy);
    g.lineTo(x, cy + w / 2);
    g.lineTo(x + step, cy + w / 2);
    g.lineTo(x + step * 0.5, cy);
    g.lineTo(x + step, cy - w / 2);
    g.closePath();
    g.fill();
  }
  g.restore();
  g.fillStyle = '#7a5a2a';
  g.fillRect(x0 - 2, cy - w * 0.55, 5, w * 1.1); // kashira
}

function maps(w, h, drawKeep) {
  const [mc, mg] = canvas(w, h);
  mg.fillStyle = 'rgb(0,0,0)';
  mg.fillRect(0, 0, w, h);
  mg.fillStyle = 'rgb(255,0,0)';
  drawKeep(mg);
  // alpha = 1 - void = 1 everywhere
  const id = mg.getImageData(0, 0, mc.width, mc.height);
  for (let i = 3; i < id.data.length; i += 4) id.data[i] = 255;
  mg.putImageData(id, 0, 0);
  const [ac, ag] = canvas(w, h);
  ag.fillStyle = 'rgb(255,128,0)'; // flow along x, no aura
  ag.fillRect(0, 0, w, h);
  const ad = ag.getImageData(0, 0, ac.width, ac.height);
  for (let i = 3; i < ad.data.length; i += 4) ad.data[i] = 128; // depth 0.5
  ag.putImageData(ad, 0, 0);
  return [texture(mc, false), texture(ac, false)];
}

// Mitsukuni's blade: starts at the tsuba of the hilt he already holds and lies
// inside the red scabbard at rest. `s` = working px per source px.
export function mitsukuniBlade(s, tsuba) {
  const len = 300 * s, w = 9 * s, pad = 6 * s;
  const W = len + 14 * s + pad * 2, H = w * 4;
  const [c, g] = canvas(W, H);
  const x0 = pad + 10 * s;
  drawBlade(g, x0, len, H / 2, w, 0.012); // nearly straight, so it hides inside the straight scabbard
  drawHabaki(g, pad, H / 2, w);
  const [mat, aux] = maps(W, H, (mg) => mg.fillRect(0, 0, x0, H));
  return {
    name: 'mitsukuni_blade',
    color: texture(c, true), mat, aux,
    // place the habaki on the tsuba; the blade runs right, along the scabbard
    box: [tsuba[0] * s - pad, tsuba[1] * s - H / 2, W, H],
    bladeStart: x0 / W,
  };
}

// Araimaru's sword: a whole katana held in his fists, pointing back along his
// body at rest (as if still at his hip); it is drawn and stood up.
export function araimaruSword(s, grip) {
  const hilt = 70 * s, len = 270 * s, w = 9 * s, pad = 6 * s;
  const W = hilt + 16 * s + len + pad * 2, H = w * 4.4;
  const [c, g] = canvas(W, H);
  const cy = H / 2;
  drawHilt(g, pad, pad + hilt, cy, w * 1.15);
  drawTsuba(g, pad + hilt + 4 * s, cy, w * 3.1);
  const x0 = pad + hilt + 16 * s;
  drawHabaki(g, x0 - 9 * s, cy, w);
  drawBlade(g, x0, len, cy, w);
  const [mat, aux] = maps(W, H, (mg) => mg.fillRect(0, 0, x0 - 9 * s, H));
  return {
    name: 'araimaru_sword',
    color: texture(c, true), mat, aux,
    // the middle of the hilt sits in his fists
    box: [grip[0] * s - (pad + hilt * 0.55), grip[1] * s - cy, W, H],
    bladeStart: (x0 - 9 * s) / W,
  };
}
