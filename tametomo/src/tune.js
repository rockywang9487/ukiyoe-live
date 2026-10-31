// ?tune=1: a panel for adjusting the clouds, foam, light and motion by eye.
// Rhythms live in src/timeline.js; everything here keeps the 60 s loop closed.
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.19.2/dist/lil-gui.esm.min.js';

export function tune(app) {
  const u = app.shared;
  const gui = new GUI({ title: '為朝難風 tune' });
  const c = gui.addFolder('black clouds');
  c.add(u.uCloudRoll, 'value', 0, 80, 0.5).name('lobes roll px');
  c.add(u.uCloudSwell, 'value', 0, 60, 0.5).name('masses swell px');
  const f0 = gui.addFolder('foam');
  f0.add(u.uFoamAmp, 'value', 0, 3, 0.01).name('claws circle x');
  f0.add(u.uFoamTurn, 'value', 0, 0.6, 0.005).name('claws turn rad');
  f0.add(u.uFoamSwell, 'value', 0, 0.4, 0.005).name('claws open/close');
  f0.add(u.uFoamCycles, 'value', 0, 30, 1).name('ripple turns / loop');
  f0.add(u.uFoamWave, 'value', 60, 900, 10).name('ripple wavelength px');
  const l = gui.addFolder('light');
  l.add(u.uLight, 'value', 0, 2, 0.01).name('overcast from above');
  l.add(u.uShadow, 'value', 0, 0.6, 0.005).name('contact shadows');
  const f = app.post.finish.uniforms;
  l.add(f.uLift, 'value', 0, 0.2, 0.001).name('lifted darks');
  l.add(f.uDesat, 'value', -0.4, 0.3, 0.005).name('desaturate');
  l.add(f.uContrast, 'value', 0.8, 1.4, 0.005).name('contrast');
  l.add(f.uVignette, 'value', 0, 0.4, 0.005).name('vignette');
  const a = gui.addFolder('motion');
  a.add(u.uAmp, 'value', 0, 2, 0.01).name('all motion');
  a.add(app.state, 'speed', 0, 2, 0.01).name('speed');
  a.add(app.state, 'paused');
  a.add({ raw: false }, 'raw').name('the print, untouched').onChange((on) => app.setRaw(on));
  return gui;
}
