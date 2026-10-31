// The loop: a storm at sea. The waves never stop: each wave body gathers, stands
// up along its own arc, curls forward and lets go into the trough, heavy and
// slow (6 to 12 s a swell), the far ones first and the near ones after, so the
// crests come on one behind another. Foam and spray are quicker (the foam runs
// along the crests and churns on the waves all the time; the spray flies when a
// wave lets go). Above, the dragon writhes: a wave passes from its neck through
// its body to the tail, with a quicker roll on top, and three times a loop it
// lowers its head to look down at the sea. The boats are thrown about: the wave
// strikes the side, the bow is flung up and the hull shudders, the men crouch
// and lean against it with their feet on the deck and whip round to watch the
// sea, the hull crashes back, and hair, sleeves and ropes keep shaking in the
// gale. Everyone fighting for their life keeps struggling, a tremor and a jerk
// every second or two. Shiranui pitches head first into the sea with each swell.
// The sail ripples in the wind (src/materials/shared.js). The tengu beat their
// wings hard every few seconds; the great fish lashes its tail and lunges with
// each sea, snapping its jaw.
//
// Rotations are degrees (positive = clockwise on screen), moves are working
// pixels of the print (3000 x 1492); negative ty is up; sx, sy are factors.
// Every period divides the loop, so the loop closes.

export const LOOP = 60;

const EASE = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

function keys(pts) {
  return (t) => {
    if (t <= pts[0][0]) return pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) {
      const [t0, v0, ease = 'inOut'] = pts[i];
      const [t1, v1] = pts[i + 1];
      if (t < t1) return v0 + (v1 - v0) * EASE[ease]((t - t0) / (t1 - t0));
    }
    return pts[pts.length - 1][1];
  };
}
const mod = (t, p) => ((t % p) + p) % p;
const divides = (p) => {
  if (Math.abs(LOOP / p - Math.round(LOOP / p)) > 1e-9) throw new Error('period must divide the loop: ' + p);
};
// a gesture repeated every `period` s, starting `at` s into the loop
const every = (period, at, pts) => {
  divides(period);
  const k = keys(pts);
  return (t) => k(mod(t - at, period));
};
// a steady swing, whole cycles per loop
const osc = (cycles, amp, phase = 0) => (t) => amp * Math.sin((2 * Math.PI * cycles * t) / LOOP + phase);
// a quick turn and back: there in `rise` s, held, back
const nod = (amp, rise = 0.3, hold = 0.4, back = 0.5) => [[0, 0], [rise, amp, 'out'], [rise + hold, amp], [rise + hold + back, 0]];

// ---------------------------------------------------------------- the waves

// One swell of a wave body, period T: it gathers and stands up (most of the
// time), holds a breath at the top, lets go fast into the trough (below rest),
// and comes back. RELEASE is when it lets go: the spray flies then.
export const RELEASE = 0.66;
const rise = (T, A) => [[0, 0, 'sine'], [0.52 * T, -A, 'sine'], [0.64 * T, -1.08 * A, 'in'], [0.78 * T, 0.42 * A, 'out'], [T, 0]];
// the crest leans forward as it stands up, most at the moment it lets go
const curl = (T, c) => [[0, 0, 'sine'], [0.45 * T, 0.3 * c, 'sine'], [0.66 * T, c, 'in'], [0.8 * T, -0.35 * c, 'out'], [T, 0]];
// swell of a whole body, a little behind its crest
const heave = (T, A) => [[0, 0, 'sine'], [0.58 * T, -A, 'sine'], [0.8 * T, 0.5 * A, 'sine'], [T, 0]];

// each wave: its period, when in the loop its swell starts, and how its spray
// is timed (main.js and the spray read this)
export const WAVES = {
  swell_l: { period: 10, at: 0.0 },
  swell_r: { period: 10, at: 5.0 },
  sea_l: { period: 7.5, at: 1.4 },
  curl_r: { period: 7.5, at: 5.2 },
  skyspray: { period: 12, at: 2.0 },
  sea_lb: { period: 7.5, at: 3.2 },
  wave_c: { period: 10, at: 2.4 },
  sea_cb: { period: 6, at: 3.6 },
  sea_rb: { period: 6, at: 0.8 },
};
for (const w of Object.values(WAVES)) {
  divides(w.period);
  w.release = mod(w.at + RELEASE * w.period, w.period);
}
const W = WAVES;
const wave = (name, T, offset, pts) => every(T, W[name].at + offset, pts);

// how far each wave stands up now (0 at rest, 1 at the top): its foam brightens
export function lift(name, t) {
  const w = W[name];
  if (!w) return 0;
  const u = mod(t - w.at, w.period) / w.period;
  return Math.max(0, -keys(rise(1, 1))(u));
}

// ---------------------------------------------------------------- the boats

// a boat on its wave (period T): the wave strikes the side at `hit` (fraction
// of T), the bow is flung up (rot, negative = the left end up), holds, the hull
// crashes back a little past rest and settles
const ride = (T, hit, lift) => [[0, 0], [hit * T, 0, 'sine'], [(hit + 0.15) * T, -lift, 'out'], [(hit + 0.25) * T, -lift * 0.92, 'in'],
  [(hit + 0.4) * T, lift * 0.5, 'inOut'], [(hit + 0.6) * T, -lift * 0.1, 'sine'], [T, 0]];
const pitch = (T, hit, deg) => [[0, 0], [hit * T, 0, 'sine'], [(hit + 0.15) * T, -deg, 'out'], [(hit + 0.25) * T, -deg * 0.85, 'in'],
  [(hit + 0.4) * T, deg * 0.45, 'inOut'], [(hit + 0.6) * T, -deg * 0.1, 'sine'], [T, 0]];
// a man on the boat braces just after the bow lifts and straightens as it drops
// (used for a crouch, sy below 1 about his feet, and for a lean, rot)
const brace = (T, hit, v, lag = 0.05) => [[0, 0], [(hit + 0.06 + lag) * T, 0, 'sine'], [(hit + 0.16 + lag) * T, v, 'out'], [(hit + 0.4 + lag) * T, v * 0.6, 'inOut'], [(hit + 0.58 + lag) * T, 0, 'sine'], [T, 0]];
// what hangs (sleeves, ropes, hair, heads) swings on after the hull has settled
const settle = (T, hit, deg) => [[0, 0], [(hit + 0.4) * T, 0, 'sine'], [(hit + 0.48) * T, deg, 'out'], [(hit + 0.56) * T, -deg * 0.6, 'inOut'], [(hit + 0.64) * T, deg * 0.3, 'inOut'], [(hit + 0.72) * T, -deg * 0.1, 'inOut'], [(hit + 0.78) * T, 0, 'sine'], [T, 0]];
// the jolt as a sea strikes: a shudder at `hz` that dies away, from `at` s on
const shudder = (T, at, amp, hz = 5, n = 5) => {
  const pts = [[0, 0]];
  if (at > 0) pts.push([at, 0]);
  for (let k = 1; k <= n; k++) pts.push([at + k / (2 * hz), amp * (k % 2 ? 1 : -1) * Math.pow(0.62, k - 1), 'inOut']);
  pts.push([at + (n + 1) / (2 * hz), 0], [T, 0]);
  return pts;
};
// the gale on anything loose: two quick, uneven tremors (whole turns per loop)
const gale = (amp, k = 0) => [osc(233, amp, k), osc(157, amp * 0.7, k * 1.7 + 0.5)];
const plus1 = (f) => (t) => 1 + f(t);
// people fighting for their lives never keep still: a tremor all the time and a
// quick jerk every second or two, each on his own rhythm
const struggle = (deg, period, at) => [...gale(deg * 0.35, at),
  every(period, at, [[0, 0], [0.12, deg, 'out'], [0.3, -deg * 0.4, 'inOut'], [0.55, 0, 'sine']])];
// the same for a whole body, in px: it trembles, and is shoved and catches itself
const shake = (px, period, at) => [osc(211, px * 0.4, at), osc(139, px * 0.3, at * 1.9 + 0.7),
  every(period, at, [[0, 0], [0.1, px, 'out'], [0.28, -px * 0.45, 'inOut'], [0.5, 0, 'sine']])];
const crouch = (name, T, offset, hit, v, lag) => plus1(wave(name, T, offset, brace(T, hit, v, lag)));

// ---------------------------------------------------------------- wings

// a hard wingbeat: the shoulder starts, the wing follows, the tips last; a
// short glide before the next
const beat = (up, down) => [[0, 0], [0.4, up, 'inOut'], [0.58, -down, 'in'], [0.8, -down * 0.35, 'out'], [1.25, 0, 'sine']];
// the body is thrown up by the downstroke
const thrust = (dy) => [[0, 0], [0.4, dy * 0.35], [0.62, -dy, 'out'], [1.4, 0, 'sine']];

// ---------------------------------------------------------------- the dragon

const DRAGON = ['d_head', 'd_n1', 'd_n2', 'd_n3', 'd_n4', 'd_mid', 'd_b2', 'd_b3', 'd_b4', 'd_b5', 'd_tail'];
const swim = {};
DRAGON.forEach((b, i) => {
  // the body writhes: a wave passes from the neck through the body to the tail
  // (6 a loop, 10 s), each segment behind the one before, and a quicker roll
  // (15 a loop) runs out of step with it, so the coils keep turning over
  const amp = i === 0 ? 1.6 : i < 5 ? 2.3 : i === 5 ? 1.8 : 3.0;
  swim[b + '.rot'] = [osc(6, amp, -0.8 * i), osc(15, amp * 0.42, -1.15 * i + 1.0)];
});

export const TRACKS = {
  // ---------------------------------------------------------- far swells
  'swl_peak.ty': [wave('swell_l', 10, 0, rise(10, 24.0))],
  'swl_peak.rot': [wave('swell_l', 10, 0, curl(10, 4.5))],
  'swl_peak2.ty': [wave('swell_l', 10, 1.6, rise(10, 16.5))],
  'swl_root.ty': [wave('swell_l', 10, 0.6, heave(10, 5.6))],
  'swr_peak.ty': [wave('swell_r', 10, 0, rise(10, 24.0))],
  'swr_peak.rot': [wave('swell_r', 10, 0, curl(10, 4.5))],
  'swr_peak2.ty': [wave('swell_r', 10, 2.0, rise(10, 18.0))],
  'swr_root.ty': [wave('swell_r', 10, 0.6, heave(10, 5.6))],

  // ---------------------------------------------------------- the sea, middle
  'sl_crest.ty': [wave('sea_l', 7.5, 0, rise(7.5, 27.0))],
  'sl_crest.rot': [wave('sea_l', 7.5, 0, curl(7.5, 5.2))],
  'sl_crest2.ty': [wave('sea_l', 7.5, 1.5, rise(7.5, 21.0))],
  'sl_crest2.rot': [wave('sea_l', 7.5, 1.5, curl(7.5, 4.5))],
  'sl_root.ty': [wave('sea_l', 7.5, 0.5, heave(7.5, 7.0))],
  'cr_tower.ty': [wave('curl_r', 7.5, 0, rise(7.5, 30.0))],
  'cr_tower.rot': [wave('curl_r', 7.5, 0, curl(7.5, -6.8))],
  'cr_base.ty': [wave('curl_r', 7.5, 0.5, heave(7.5, 7.0))],
  // the water thrown up round the dragon churns
  'ss_a.rot': [osc(5, 2.6, 0.3), osc(12, 0.8)],
  'ss_a.ty': [wave('skyspray', 12, 0, rise(12, 18.0))],
  'ss_b.rot': [osc(4, -2.2, 1.4)],
  'ss_b.ty': [wave('skyspray', 12, 2.5, rise(12, 21.0))],
  'ss_c.rot': [osc(3, 2.8, 2.2)],
  'ss_c.ty': [wave('skyspray', 12, 5.0, rise(12, 24.0))],

  // ---------------------------------------------------------- the sea, near
  'wc_peak.ty': [wave('wave_c', 10, 0, rise(10, 45.0))],
  'wc_peak.rot': [wave('wave_c', 10, 0, curl(10, 5.1))],
  'wc_body.ty': [wave('wave_c', 10, 0.3, heave(10, 16.8))],
  'wc_body.sy': [wave('wave_c', 10, 0.3, [[0, 1, 'sine'], [5.8, 1.025, 'sine'], [8.0, 0.99, 'sine'], [10, 1]])],
  'wc_lip.rot': [wave('wave_c', 10, 0.4, curl(10, -6.0))],
  'wc_lip.ty': [wave('wave_c', 10, 0.4, rise(10, 18.0))],
  'wc_curls.ty': [wave('wave_c', 10, 0.9, rise(10, 21.0))],
  'wc_curls.rot': [wave('wave_c', 10, 0.9, curl(10, 2.4))],
  'wc_root.ty': [wave('wave_c', 10, 0.6, heave(10, 5.6))],
  'scb_crest.ty': [wave('sea_cb', 6, 0, rise(6, 24.0))],
  'scb_crest.rot': [wave('sea_cb', 6, 0, curl(6, 4.5))],
  'scb_root.ty': [wave('sea_cb', 6, 0.4, heave(6, 5.6))],
  'srb_crest.ty': [wave('sea_rb', 6, 0, rise(6, 27.0))],
  'srb_crest.rot': [wave('sea_rb', 6, 0, curl(6, 5.1))],
  'srb_root.ty': [wave('sea_rb', 6, 0.4, heave(6, 8.4))],
  'slb_crest.ty': [wave('sea_lb', 7.5, 0, rise(7.5, 27.0))],
  'slb_crest.rot': [wave('sea_lb', 7.5, 0, curl(7.5, 4.5))],
  'slb_root.ty': [wave('sea_lb', 7.5, 0.4, heave(7.5, 7.0))],

  // ---------------------------------------------------------- the dragon
  ...swim,
  // the whole coil heaves and rolls in the cloud
  'dragon_root.ty': [osc(5, 12, 0.4), osc(12, 4, 1.3)],
  'dragon_root.rot': [osc(3, 1.6, 1.1), osc(8, 0.6, 2.0)],
  // three times a loop it lowers its head to look at the sea, holds, comes back
  'd_head.rot': [...swim['d_head.rot'], every(20, 6, [[0, 0], [2.2, 7.5, 'inOut'], [5.4, 7.5], [8.0, 0, 'inOut']])],
  'd_head.ty': [every(20, 6, [[0, 0], [2.2, 8, 'inOut'], [5.4, 8], [8.0, 0, 'inOut']])],
  'd_n1.rot': [...swim['d_n1.rot'], every(20, 6, [[0, 0], [2.4, 2.5, 'inOut'], [5.6, 2.5], [8.2, 0, 'inOut']])],
  // the mane in the wind: lifted with each gust, falling back
  'd_mane.rot': [osc(30, 2.4), ...gale(0.8, 0.4), every(5, 0.5, [[0, 0], [0.5, -8, 'out'], [1.4, -5], [2.6, 0, 'sine']])],
  // the whiskers: a gust pulls them straight, then they fall back along their
  // length, the tips last
  'd_wh1.rot': [every(5, 0.4, [[0, 0], [0.5, -5, 'out'], [1.2, -3.5], [2.2, 1.5, 'sine'], [3.2, 0, 'sine']]), osc(20, 1.0)],
  'd_wh2.rot': [every(5, 0.55, [[0, 0], [0.5, -6.5, 'out'], [1.3, -5], [2.4, 2.5, 'sine'], [3.5, 0, 'sine']]), osc(20, 1.5, -0.8)],
  'd_wh3.rot': [every(5, 0.7, [[0, 0], [0.5, -9, 'out'], [1.4, -6], [2.6, 3.5, 'sine'], [3.8, 0, 'sine']]), osc(20, 2.2, -1.6)],

  // ---------------------------------------------------------- the left boat and Shiranui
  'hull_l_root.ty': [wave('sea_l', 7.5, 0.8, heave(7.5, 20))],
  'hull_l_root.rot': [wave('sea_l', 7.5, 0.8, [[0, 0, 'sine'], [4.2, -3.2, 'sine'], [6.0, 1.6, 'sine'], [7.5, 0]]),
    wave('sea_l', 7.5, 0.8, shudder(7.5, 3.0, 0.9, 5, 4))],
  // Shiranui throws herself into the sea: with each swell she pitches head first
  // off the gunwale (faster and faster, her hair and sleeves flung up behind her)
  // into the foam, which splashes up round her head; the next sea lifts her back
  'w_root.ty': [wave('sea_l', 7.5, 0.8, [[0, 0], [2.0, -4, 'sine'], [3.2, 26, 'in'], [3.6, 22, 'out'], [7.5, 0, 'sine']])],
  'w_root.tx': [wave('sea_l', 7.5, 0.8, [[0, 0], [2.0, 2, 'sine'], [3.2, -14, 'in'], [3.6, -12, 'out'], [7.5, 0, 'sine']])],
  'w_root.rot': [wave('sea_l', 7.5, 0.8, [[0, 0], [2.0, 1.5, 'sine'], [3.2, -6, 'in'], [3.6, -5.5, 'out'], [7.5, 0, 'sine']])],
  'w_hair.rot': [osc(40, 4.5), osc(12, 3.0, 0.7), ...gale(1.6), wave('sea_l', 7.5, 0.8, [[0, 0], [2.0, 0], [3.0, 12, 'in'], [3.6, 8, 'out'], [5.0, 0, 'sine'], [7.5, 0]])],
  'w_head.rot': [every(5, 3.0, nod(-7, 0.4, 1.0, 0.6)), wave('sea_l', 7.5, 0.8, [[0, 0], [2.6, 0], [3.2, -5, 'in'], [3.5, 2, 'out'], [4.4, 0, 'sine'], [7.5, 0]])],
  'w_sleeve.rot': [osc(12, 2.5, 1.4), ...gale(1.1, 2.0), wave('sea_l', 7.5, 0.8, [[0, 0], [2.0, 0], [3.1, -8, 'in'], [3.8, -4, 'out'], [5.2, 0, 'sine'], [7.5, 0]])],
  'w_feet.rot': [osc(8, 2.2, 0.4), wave('sea_l', 7.5, 0.8, [[0, 0], [2.0, 0], [3.2, 6, 'in'], [3.8, 3, 'out'], [5.5, 0, 'sine'], [7.5, 0]])],

  // ---------------------------------------------------------- the wreck in the middle
  'sail_belly.sy': [wave('wave_c', 10, 1.0, [[0, 1, 'sine'], [4.0, 1.05, 'sine'], [7.0, 0.98, 'sine'], [10, 1]])],
  'sail_belly.rot': [osc(6, 1.5), ...gale(0.5, 1.0), every(5, 1.5, [[0, 0], [0.8, -2.2, 'out'], [2.4, 0.6, 'sine'], [3.6, 0, 'sine']])],
  'sail_left.rot': [osc(8, 1.8, 0.8), ...gale(0.4, 2.2)],
  'sail_root.ty': [wave('wave_c', 10, 0.8, heave(10, 10))],
  'beam_root.rot': [wave('wave_c', 10, 0.6, pitch(10, 0.4, 6.0))],
  'beam_root.ty': [wave('wave_c', 10, 0.6, ride(10, 0.4, 18))],
  'cr_root.ty': [wave('wave_c', 10, 0.2, ride(10, 0.35, 30))],
  'cr_root.rot': [wave('wave_c', 10, 0.2, pitch(10, 0.35, -5.0)), wave('wave_c', 10, 0.2, shudder(10, 3.7, 1.0, 5, 4))],
  // the armoured man at the wreck's edge is flung up with it and holds on
  'sc_root.ty': [wave('sea_cb', 6, 0, ride(6, 0.3, 26))],
  'sc_root.rot': [wave('sea_cb', 6, 0, pitch(6, 0.3, 4.0)), wave('sea_cb', 6, 0, shudder(6, 1.9, 1.0, 5, 4))],
  'sc_body.sy': [crouch('sea_cb', 6, 0, 0.3, -0.06)],
  'sc_body.rot': [wave('sea_cb', 6, 0, brace(6, 0.3, -5)), ...struggle(3, 1.5, 0.5)],
  'sc_head.rot': [every(6, 2.0, nod(-11, 0.3, 1.0, 0.5)), ...struggle(5, 1.2, 0.8)],
  'sc_body.tx': [...shake(5, 1.5, 0.5)],
  'sc_body.ty': [...shake(3, 2, 1.2)],

  // ---------------------------------------------------------- Tametomo's boat
  // the sea strikes the side, the bow is flung up and shudders, the men crouch
  // and lean into it, the hull crashes back; heads whip round to the waves
  'ship_root.ty': [wave('sea_rb', 6, 0, ride(6, 0.25, 36))],
  'ship_root.rot': [wave('sea_rb', 6, 0, pitch(6, 0.25, 5.0)), wave('sea_rb', 6, 0, shudder(6, 1.62, 1.1, 5, 5)), osc(20, 0.6, 0.4)],
  'tm_root.sy': [crouch('sea_rb', 6, 0, 0.25, -0.05)],
  'tm_root.rot': [wave('sea_rb', 6, 0, brace(6, 0.25, 3.0)), ...struggle(1.2, 2, 0.3)],
  'tm_head.rot': [every(6, 1.0, nod(-12, 0.25, 1.2, 0.6)), wave('sea_rb', 6, 0, settle(6, 0.25, 2.0)), ...struggle(3, 2.4, 1.1)],
  // the sword stays where his hand holds it: it turns only with him
  'tm_arm.rot': [wave('sea_rb', 6, 0, brace(6, 0.25, 1.2))],
  'tm_root.tx': [...shake(2.5, 2, 0.3)],
  'ca_head.rot': [every(3, 1.0, nod(-11, 0.2, 0.6, 0.4)), wave('sea_rb', 6, 0, settle(6, 0.25, 2.4)), ...struggle(4, 1.5, 0.2)],
  'cb_root.sy': [crouch('sea_rb', 6, 0, 0.25, -0.07, 0.04)],
  'cb_root.rot': [wave('sea_rb', 6, 0, brace(6, 0.25, -6, 0.04)), ...struggle(2.5, 2, 0.9)],
  'cb_head.rot': [every(5, 1.0, nod(13, 0.25, 0.9, 0.5)), wave('sea_rb', 6, 0, settle(6, 0.25, 3.0)), ...struggle(5, 1.2, 0.4)],
  'cb_root.tx': [...shake(6, 1.5, 0.9)],
  'cb_root.ty': [...shake(4, 2, 0.2)],
  'cc_root.sy': [crouch('sea_rb', 6, 0, 0.25, -0.07, 0.07)],
  'cc_root.rot': [wave('sea_rb', 6, 0, brace(6, 0.25, 4, 0.07)), ...struggle(2.5, 2.4, 1.5)],
  'cc_head.rot': [every(6, 4.0, nod(-14, 0.3, 1.0, 0.5)), ...struggle(5, 1.5, 0.7)],
  'cc_arm.rot': [wave('sea_rb', 6, 0, brace(6, 0.25, 9, 0.06)), wave('sea_rb', 6, 0, settle(6, 0.25, 3.5)), ...struggle(6, 1.2, 0.1)],
  'cc_root.tx': [...shake(6, 1.2, 1.5)],
  'cc_root.ty': [...shake(4, 2.4, 0.6)],
  'ce_root.sy': [crouch('sea_rb', 6, 0, 0.25, -0.06, 0.1)],
  'ce_root.rot': [wave('sea_rb', 6, 0, brace(6, 0.25, 5, 0.1)), ...struggle(2.5, 1.5, 0.6)],
  'ce_root.tx': [...shake(5, 2, 0.1)],
  'ce_root.ty': [...shake(4, 1.5, 1.0)],
  'ca_head.tx': [...shake(4, 1.2, 0.7)],
  'hrl_root.ty': [wave('sea_rb', 6, 0.9, ride(6, 0.25, 32))],
  'hrl_root.rot': [wave('sea_rb', 6, 0.9, pitch(6, 0.25, -4.5)), wave('sea_rb', 6, 0.9, shudder(6, 1.62, 1.0, 5, 5))],
  'cf_root.sy': [crouch('sea_rb', 6, 0.9, 0.25, -0.06, 0.06)],
  'cf_root.rot': [wave('sea_rb', 6, 0.9, brace(6, 0.25, -4, 0.06)), ...struggle(2.5, 2, 1.3)],
  'cf_head.rot': [every(5, 3.0, nod(11, 0.25, 0.9, 0.5)), ...struggle(5, 1.2, 0.5)],
  'cf_root.tx': [...shake(6, 1.5, 1.3)],
  'cf_root.ty': [...shake(4, 2, 0.4)],
  // the man in the water by the tall wave
  'cg_head.ty': [wave('curl_r', 7.5, 0.5, heave(7.5, 24)), every(1.5, 0.2, [[0, 0], [0.2, -6, 'out'], [0.6, 3, 'inOut'], [1.0, 0, 'sine']])],
  'cg_head.rot': [wave('curl_r', 7.5, 0.5, [[0, 0, 'sine'], [4, -8, 'sine'], [6, 4, 'sine'], [7.5, 0]]), ...struggle(7, 1.2, 0.3)],
  'cg_head.tx': [...shake(7, 1.2, 0.9)],

  // ---------------------------------------------------------- in the water, right
  'sw_root.ty': [wave('sea_rb', 6, 0.5, heave(6, 24))],
  'sw_root.rot': [wave('sea_rb', 6, 0.5, [[0, 0, 'sine'], [3.4, -3.5, 'sine'], [5, 2, 'sine'], [6, 0]]), ...struggle(2.5, 2, 0.1)],
  // the swimmer claws at the water, stroke after stroke
  'sw_a_arm.rot': [every(1.2, 0.1, [[0, 0], [0.25, -22, 'out'], [0.55, -14], [1.0, 0, 'inOut']]), ...gale(1.5, 0.4)],
  'sw_a_head.rot': [every(3, 2.0, nod(-9, 0.25, 0.7, 0.4)), ...struggle(6, 1.5, 0.4)],
  'sw_robe.rot': [osc(20, 3.2), osc(6, 2.0, 0.9), ...gale(1.4, 0.7)],
  'sw_b_head.rot': [osc(8, 3.6, 0.6), every(5, 4.0, nod(8, 0.3, 0.8, 0.5)), ...struggle(6, 1.2, 0.9)],
  'sw_root.tx': [...shake(6, 1.5, 0.3)],
  'sw_a_head.tx': [...shake(4, 1.2, 0.5)],
  'sw_b_head.ty': [...shake(5, 1.5, 1.1)],
  'deb_root.ty': [wave('sea_rb', 6, 0.2, heave(6, 24))],
  'deb_root.rot': [wave('sea_rb', 6, 0.2, [[0, 0, 'sine'], [3, 7, 'sine'], [5, -3.5, 'sine'], [6, 0]])],

  // ---------------------------------------------------------- the great fish
  // its tail lashes every 2.5 s, a wave running down to the tip; with each sea
  // it heaves up and lunges, snaps its jaw and shakes its head; the man holding
  // the boy rides it out
  'f_tail1.rot': [osc(24, 5.0, 0.0)],
  'f_tail2.rot': [osc(24, 6.5, -0.9)],
  'f_tail3.rot': [osc(24, 8.5, -1.8), wave('sea_lb', 7.5, 0.9, shudder(7.5, 3.4, 5, 4, 4))],
  'f_mid.rot': [osc(24, 1.4, 0.9), osc(8, 1.0)],
  'f_neck.rot': [wave('sea_lb', 7.5, 0.6, [[0, 0, 'sine'], [3.6, -5.0, 'out'], [4.2, -5.5, 'in'], [5.4, 2.0, 'sine'], [7.5, 0]])],
  'f_head.ty': [wave('sea_lb', 7.5, 0.6, heave(7.5, 18))],
  'f_head.tx': [wave('sea_lb', 7.5, 0.6, [[0, 0, 'sine'], [3.6, 10, 'out'], [4.4, 8, 'in'], [5.6, -3, 'sine'], [7.5, 0]])],
  'f_head.rot': [wave('sea_lb', 7.5, 0.6, shudder(7.5, 4.3, 3.5, 6, 5))],
  'f_jaw.rot': [wave('sea_lb', 7.5, 0.6, [[0, 0], [3.4, 0], [3.75, -9, 'out'], [4.2, -9], [4.45, 0, 'in'], [7.5, 0]])],
  'fish_root.ty': [wave('sea_lb', 7.5, 0.9, heave(7.5, 8))],
  'fish_root.rot': [wave('sea_lb', 7.5, 0.9, [[0, 0, 'sine'], [4.0, -1.2, 'sine'], [6.0, 0.6, 'sine'], [7.5, 0]])],
  'r_root.rot': [wave('sea_lb', 7.5, 1.1, [[0, 0, 'sine'], [4.2, 3.5, 'sine'], [6.2, -2.0, 'sine'], [7.5, 0]]), ...struggle(2, 2, 1.0)],
  'r_man_head.rot': [every(5, 1.0, nod(-9, 0.25, 0.8, 0.4)), ...struggle(5, 1.5, 0.3)],
  'r_child.rot': [wave('sea_lb', 7.5, 1.3, [[0, 0, 'sine'], [4.4, 4.0, 'sine'], [6.4, -2.2, 'sine'], [7.5, 0]]), ...struggle(6, 1.2, 0.6)],
  'r_root.tx': [...shake(5, 1.5, 0.8)],
  'r_root.ty': [...shake(4, 2, 0.1)],
  'r_child.tx': [...shake(4, 1.2, 1.1)],

  // ---------------------------------------------------------- the tengu
  // a hard downstroke every 2 to 3 s throws each body up; heads jerk round; the
  // wing tips shake in the gale between strokes
  'ta_wing_l.rot': [every(2.5, 0.2, beat(22, 16))],
  'ta_wl_tip.rot': [every(2.5, 0.34, beat(14, 12)), ...gale(1.6, 0.3)],
  'ta_wing_r.rot': [every(2.5, 0.26, beat(-18, -13))],
  'ta_wr_tip.rot': [every(2.5, 0.4, beat(-12, -10)), ...gale(1.6, 1.1)],
  'ta_body.ty': [osc(12, 4, 0.3), every(2.5, 0.2, thrust(16))],
  'ta_body.rot': [osc(6, 1.5, 1.0), every(2.5, 0.2, [[0, 0], [0.45, 2.5], [0.7, -3, 'out'], [1.5, 0, 'sine']])],
  'ta_head.rot': [every(5, 1.5, nod(10, 0.18, 0.5, 0.35)), every(6, 3.2, nod(-8, 0.15, 0.4, 0.3))],
  'tb_wing.rot': [every(3, 1.1, beat(-20, -14))],
  'tb_w_tip.rot': [every(3, 1.24, beat(-13, -10)), ...gale(1.5, 2.1)],
  'tb_wing2.rot': [every(3, 1.16, beat(16, 11))],
  'tb_w2_tip.rot': [every(3, 1.3, beat(10, 8)), ...gale(1.4, 0.8)],
  'tb_body.ty': [osc(10, 4, 2.1), every(3, 1.1, thrust(15))],
  'tb_body.rot': [osc(6, 1.4, 2.6), every(3, 1.1, [[0, 0], [0.45, -2.5], [0.7, 3, 'out'], [1.5, 0, 'sine']])],
  'tb_head.rot': [every(4, 0.6, nod(-10, 0.18, 0.5, 0.35)), every(6, 4.4, nod(7, 0.15, 0.4, 0.3))],
  'tc_wing.rot': [every(2, 0.7, beat(-18, -12))],
  'tc_w_tip.rot': [every(2, 0.84, beat(-12, -8)), ...gale(1.4, 1.7)],
  'tc_root.ty': [osc(6, 4, 0.9), every(2, 0.7, thrust(12))],
  'tc_head.rot': [osc(10, 2.5, 0.2), every(4, 2.2, nod(9, 0.18, 0.5, 0.35))],

  // ---------------------------------------------------------- the black wing in the clouds
  'wing_root.rot': [osc(12, 2.0, 0.5), every(5, 0.8, [[0, 0], [0.5, -4, 'out'], [1.4, 2, 'sine'], [2.4, 0, 'sine']])],
  'wing_tips.rot': [osc(12, 3.5, -0.3), ...gale(1.0, 0.9), every(5, 0.95, [[0, 0], [0.6, 6, 'out'], [1.8, -2, 'sine'], [2.8, 0, 'sine']])],
};

// ---------------------------------------------------------------- the seams

// The triptych's sheets meet at two seams. Near a seam both sides follow one
// shared bone (the stitch, weight 1 at the seam fading out over ~45 px; see
// tools/regions.json), so the join never tears open: between two bodies of
// water it takes the average of their motions there; where a rigid piece meets
// water (the boat's hull and the sail, the armoured man and the curl), the
// water follows the rigid piece.
const sum = (keys) => (t) => keys.reduce((acc, k) => acc + TRACKS[k].reduce((a, f) => a + f(t), 0), 0);
const mean = (...groups) => { const fs = groups.map(sum); return (t) => fs.reduce((a, f) => a + f(t), 0) / fs.length; };
// Where black cloud or paper lies on both sides the stitch holds still (the
// bones st_r_cloud and st_r_cloud2 have no track), as the cloud does.
Object.assign(TRACKS, {
  'st_l_boat.ty': [sum(['hull_l_root.ty'])],
  'st_l_sea.ty': [mean(['slb_root.ty', 'slb_crest.ty'], ['wc_root.ty', 'wc_lip.ty'])],
  'st_r_water.ty': [mean(['ss_c.ty'], ['cr_base.ty'])],
  'st_r_mid.ty': [mean(['ss_c.ty'], ['cr_base.ty'])],
  'st_r_low.ty': [sum(['sc_root.ty'])],
});

const compiled = Object.entries(TRACKS).map(([k, fs]) => [k, fs]);

export function sampleAll(t) {
  const out = {};
  for (const [k, fs] of compiled) {
    let v = 0;
    for (const f of fs) v += f(t);
    out[k] = v;
  }
  // scales are written as factors: sum the deviations from 1
  for (const k in out) if (k.endsWith('.sx') || k.endsWith('.sy')) out[k] = 1 + (out[k] - TRACKS[k].length);
  return out;
}
