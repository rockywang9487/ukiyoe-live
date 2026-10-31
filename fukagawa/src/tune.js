// ?tune=1: a panel for adjusting the clouds, snow, light and motion by eye.
// Speeds are whole cycles per loop, so the 60 s loop always closes.
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.19.2/dist/lil-gui.esm.min.js';

export function tune(app) {
  const u = app.shared;
  const gui = new GUI({ title: '深川の雪 tune' });
  const c = gui.addFolder('clouds');
  c.add(u.uCloudTravel, 'value', 0, 4, 1).name('travel / loop');
  c.add(u.uCloudFlow, 'value', 0, 3, 0.01).name('flow x');
  c.add(u.uCloudEdge, 'value', 0, 60, 0.5).name('edge ripple px');
  c.add(u.uCloudBreath, 'value', 0, 120, 1).name('lobes swell px');
  c.add(u.uCloudSway, 'value', 0, 120, 1).name('sway px');
  c.add(u.uCurl, 'value', 0, 90, 1).name('curl turn deg');
  c.add(u.uOutline, 'value', 1, 12, 0.1).name('outline px');
  c.add(u.uCloudSand, 'value', 0, 1, 0.01).name('white sand');
  if (app.snow) {
    const s = gui.addFolder('snow');
    const su = app.snow.uniforms;
    s.add(su.uSnow, 'value', 0, 2, 0.01).name('amount');
    s.add(su.uSnowSize, 'value', 0.3, 3, 0.01).name('grain size');
    s.add(su.uSnowWind, 'value', 0, 3, 0.01).name('breeze');
  }
  const l = gui.addFolder('light');
  l.add(u.uCool, 'value', 0, 0.2, 0.001).name('snow light');
  l.add(u.uWarm, 'value', 0, 0.2, 0.001).name('warm wood');
  const f = app.post.finish.uniforms;
  l.add(f.uLift, 'value', 0, 0.2, 0.001).name('lifted darks');
  l.add(f.uDesat, 'value', -0.4, 0.3, 0.005).name('desaturate');
  l.add(f.uContrast, 'value', 0.8, 1.4, 0.005).name('contrast');
  l.add(f.uVignette, 'value', 0, 0.4, 0.005).name('vignette');
  const a = gui.addFolder('motion');
  a.add(u.uAmp, 'value', 0, 2, 0.01).name('all motion');
  a.add(app.state, 'speed', 0, 2, 0.01).name('speed');
  a.add(app.state, 'paused');
  a.add({ raw: false }, 'raw').name('the painting, untouched').onChange((on) => app.setRaw(on));
  return gui;
}
