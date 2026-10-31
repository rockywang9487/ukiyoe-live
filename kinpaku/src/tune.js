// ?tune=1 — a panel for adjusting the gold by eye.
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.19.2/dist/lil-gui.esm.min.js';

export function tune(app) {
  const u = app.shared;
  const gui = new GUI({ title: '金箔 tune' });
  const color = (name, label) => {
    const o = { v: '#' + u[name].value.getHexString() };
    gui.addColor(o, 'v').name(label).onChange((hex) => u[name].value.set(hex));
  };
  const g = gui.addFolder('leaf');
  g.add(u.uLeaf.value, 'x', 60, 900, 1).name('leaf size px');
  g.add(u.uLeaf.value, 'y', 0, 2, 0.01).name('leaf tint var');
  g.add(u.uLeaf.value, 'z', 0, 2, 0.01).name('seams');
  g.add(u.uLeaf.value, 'w', 0, 2, 0.01).name('wrinkles');
  g.add(u.uSparkle, 'value', 0, 3, 0.01).name('sparkle');
  const l = gui.addFolder('light');
  l.add(u.uExposure, 'value', 0.3, 2.5, 0.01).name('exposure');
  l.add(u.uEnvGain, 'value', 0, 2.5, 0.01).name('room reflection');
  l.add(u.uKeyGain, 'value', 0, 3, 0.01).name('cursor light');
  l.add(u.uFog, 'value', 0, 0.8, 0.01).name('depth shade');
  l.add(app.post.bloom, 'strength', 0, 2, 0.01).name('bloom');
  l.add(app.post.bloom, 'threshold', 0, 3, 0.01).name('bloom threshold');
  l.add(app.post.finish.uniforms.uCoat, 'value', 0, 3, 0.01).name('resin coat');
  l.add(app.post.finish.uniforms.uVignette, 'value', 0, 1.5, 0.01).name('rim shade');
  const v = gui.addFolder('void & palette');
  v.add(u.uAuraGain, 'value', 0, 3, 0.01).name('aura');
  v.add(u.uGreen, 'value', 0, 1, 0.01).name('green gold');
  color('cGold', 'bone gold');
  color('cBone', 'brightest leaf');
  color('cAo', 'green gold field');
  color('cCoral', 'coral');
  color('cOlive', 'olive');
  color('cField', 'field');
  color('cLacquer', 'lacquer');
  color('cUmber', 'umber ink');
  color('cCopper', 'copper');
  color('cRed', 'red foil');
  color('cPlat', 'blade');
  const a = gui.addFolder('motion');
  a.add(app.state, 'speed', 0, 2, 0.01).name('speed');
  a.add(app.state, 'paused');
  a.add({ raw: false }, 'raw').name('original colours').onChange((on) => app.setRaw(on));
  return gui;
}
