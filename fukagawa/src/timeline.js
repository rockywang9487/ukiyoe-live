// The loop: a busy teahouse. Every figure has its own rhythms, each a gesture
// repeated every few seconds (the period always divides the loop, so it closes),
// and two rhythms of different periods often play on the same bone, so the
// pattern only comes round again after their common multiple.
// Rotations are degrees (positive = clockwise on screen), moves are working
// pixels of the painting (4096 x 2308).

export const LOOP = 60;

const EASE = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

// keyframes [[time, value, easeToNext?], ...] from 0 back to 0
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
// a gesture repeated every `period` s, starting `at` s into the loop
const every = (period, at, pts) => {
  if (Math.abs(LOOP / period - Math.round(LOOP / period)) > 1e-9) throw new Error('period must divide the loop: ' + period);
  const k = keys(pts);
  return (t) => k(mod(t - at, period));
};
// a steady swing, whole cycles per loop
const osc = (cycles, amp, phase = 0) => (t) => amp * Math.sin((2 * Math.PI * cycles * t) / LOOP + phase);
// a quick nod or turn and back: up in `rise` s, held, back
const nod = (amp, rise = 0.25, hold = 0.3, back = 0.35) => [[0, 0], [rise, amp, 'out'], [rise + hold, amp], [rise + hold + back, 0]];

export const TRACKS = {
  // ---------------------------------------------------------- upper left room
  // the ken game: a throw every second, the opponent answers half a second later
  'ken_arm.rot': [every(1, 0, [[0, 0], [0.16, -18, 'out'], [0.28, 8, 'in'], [0.5, 0]])],
  'ken_head.rot': [every(1, 0.05, nod(4, 0.12, 0.08, 0.3)), every(6, 2.2, nod(-9, 0.3, 0.8, 0.5))],
  'ken_chest.rot': [every(1, 0.1, nod(1.6, 0.14, 0.05, 0.35)), every(4, 1.5, [[0, 0], [0.4, -5, 'out'], [0.9, -5], [1.4, 0]])],
  'blue_arm.rot': [every(1, 0.5, [[0, 0], [0.16, 16, 'out'], [0.28, -7, 'in'], [0.5, 0]])],
  'blue_head.rot': [every(1, 0.55, nod(-3, 0.12, 0.06, 0.3)), every(6, 4.0, nod(10, 0.35, 1.2, 0.5))],
  'blue_chest.rot': [every(4, 3.2, [[0, 0], [0.4, 4, 'out'], [1.0, 4], [1.5, 0]])],
  // the shamisen: a stroke every half second, the head keeping time
  'sham_hand.rot': [every(0.5, 0, [[0, 0], [0.07, 24, 'out'], [0.36, 0]])],
  'sham_head.rot': [osc(60, 2.4), every(5, 1.0, nod(6, 0.3, 0.6, 0.5))],
  'sham_chest.rot': [osc(15, 2.2, 0.5)],
  // the woman in red listens, leans, laughs
  'red_head.rot': [every(4, 0.6, nod(10, 0.3, 0.7, 0.4)), every(6, 3.4, nod(-7, 0.25, 0.5, 0.4))],
  // the woman draped on the railing points down at the sparrows and looks
  'lean_arm.rot': [every(2, 0.2, [[0, 0], [0.2, -16, 'out'], [0.45, -6], [0.7, -16], [1.1, 0]])],
  'lean_head.rot': [every(4, 0.0, nod(-12, 0.3, 1.2, 0.5)), osc(10, 2.0, 1.1)],
  'lean_chest.rot': [every(4, 0.1, nod(-3.5, 0.4, 1.0, 0.6))],
  // the woman in brown turns to the game; the one behind nods along
  'brown_head.rot': [every(6, 1.0, nod(12, 0.35, 1.6, 0.5)), every(3, 2.4, nod(-5, 0.2, 0.3, 0.3))],
  'brown_chest.rot': [every(6, 1.1, nod(3.5, 0.4, 1.5, 0.6)), osc(12, 1.2)],
  'back_head.rot': [every(3, 0.4, nod(9, 0.25, 0.4, 0.35)), every(2, 1.5, nod(-4, 0.15, 0.1, 0.25))],

  // ---------------------------------------------------------- centre room
  'peek_head.rot': [every(6, 0.5, nod(-11, 0.35, 1.8, 0.5)), every(2, 1.0, nod(4, 0.15, 0.2, 0.25))],
  'peek_head.tx': [every(6, 0.5, nod(-12, 0.35, 1.8, 0.5))],
  'seat_head.rot': [every(5, 2.0, nod(12, 0.3, 1.2, 0.45)), every(2.5, 0.3, nod(-5, 0.2, 0.3, 0.3))],
  'seat_chest.rot': [osc(10, 2.4, 2.0)],
  // the woman with the letter fans herself with it, then laughs
  'letter_hands.rot': [every(5, 0.0, [[0, 0], [0.15, 18], [0.3, -10], [0.45, 18], [0.6, -10], [0.75, 18], [0.9, -10], [1.05, 18], [1.2, -10], [1.35, 16], [1.6, 0]])],
  'letter_head.rot': [every(5, 0.0, nod(-6, 0.3, 1.0, 0.4)), every(5, 2.6, nod(10, 0.2, 0.6, 0.5)), osc(30, 1.2)],
  'letter_chest.rot': [every(5, 2.6, nod(-4, 0.25, 0.6, 0.5))],
  'orn_head.rot': [every(4, 1.4, nod(-10, 0.3, 0.9, 0.4)), every(3, 0.2, nod(6, 0.2, 0.2, 0.3))],

  // ---------------------------------------------------------- the doorway and the porter
  'door_chest.rot': [every(6, 3.0, nod(-6, 0.45, 1.6, 0.6))],
  'door_head.rot': [every(6, 3.0, nod(-9, 0.4, 1.6, 0.6)), every(3, 0.8, nod(6, 0.2, 0.3, 0.3))],
  // the porter shifts under the bundle all the time and hitches it every three seconds
  'porter_body.ty': [every(3, 0, [[0, 0], [0.35, 9, 'out'], [0.6, -6, 'out'], [1.0, 0]]), osc(40, 2.5)],
  'porter_bundle.ty': [every(3, 0.1, [[0, 0], [0.45, -20, 'out'], [0.75, 7, 'in'], [1.05, -3], [1.4, 0]])],
  'porter_bundle.rot': [every(3, 0.15, [[0, 0], [0.5, -4.5], [1.0, 1.5], [1.5, 0]]), osc(20, 1.0)],
  'porter_head.rot': [every(3, 0.1, nod(5, 0.3, 0.2, 0.5)), osc(40, 1.2, 0.7)],

  // ---------------------------------------------------------- the stair and the reclining woman
  // the woman at the railing points into the garden and turns back to the room
  'rail_head.rot': [every(4, 0.0, [[0, 0], [0.3, -13, 'out'], [1.3, -13], [1.6, 7, 'inOut'], [2.4, 7], [2.8, 0]])],
  'rail_arm.rot': [every(4, 0.1, [[0, 0], [0.3, 14, 'out'], [0.6, 6], [0.9, 14], [1.4, 0]]), every(2, 1.0, nod(4, 0.15, 0.1, 0.25))],
  'rail_chest.rot': [every(4, 0.0, [[0, 0], [0.4, -3.5], [1.4, -3.5], [1.8, 2], [2.6, 0]])],
  // the reclining woman waves and throws her head back laughing
  'recl_arm.rot': [every(3, 0.0, [[0, 0], [0.12, -20], [0.27, 12], [0.42, -20], [0.57, 12], [0.72, -20], [0.87, 10], [1.1, 0]])],
  'recl_head.rot': [every(3, 0.4, nod(-11, 0.25, 0.7, 0.5)), every(6, 4.4, nod(8, 0.3, 0.5, 0.4))],
  'recl_chest.rot': [every(3, 0.4, nod(-4, 0.3, 0.6, 0.5)), osc(20, 1.0)],

  // ---------------------------------------------------------- round the brazier: talk and laughter
  'b1_head.rot': [every(3, 0.0, nod(-11, 0.25, 0.6, 0.4)), every(5, 2.2, nod(8, 0.3, 0.5, 0.4))],
  'b1_chest.rot': [every(3, 0.1, nod(-3.5, 0.3, 0.5, 0.5)), osc(15, 1.4)],
  'b2_head.rot': [every(4, 1.3, nod(12, 0.3, 1.0, 0.4)), every(2.5, 0.5, nod(-5, 0.2, 0.2, 0.3))],
  'b2_chest.rot': [every(4, 1.3, nod(4, 0.35, 0.9, 0.5))],
  'b3_head.rot': [every(5, 0.8, nod(-12, 0.3, 1.2, 0.4)), every(2, 0.2, nod(5, 0.15, 0.2, 0.25))],
  'b3_chest.rot': [every(5, 0.8, nod(-4, 0.35, 1.1, 0.5)), osc(12, 1.2, 1.0)],
  'b4_head.rot': [every(2.5, 0.0, nod(-9, 0.2, 0.4, 0.35)), every(6, 3.0, nod(7, 0.3, 0.8, 0.4))],
  'tall_head.rot': [every(6, 2.0, nod(13, 0.4, 1.6, 0.5)), every(3, 0.4, nod(-5, 0.2, 0.3, 0.3))],
  'tall_chest.rot': [every(6, 2.1, nod(4, 0.45, 1.5, 0.6)), osc(10, 1.0, 0.4)],
  'tall_hips.rot': [osc(10, 1.6, 2.2)],
  // the apprentice blows on her hands, again and again
  'app_head.rot': [every(3, 0.0, [[0, 0], [0.25, -11, 'out'], [0.45, -9], [0.6, -12], [0.8, -9], [1.2, -11], [1.6, 0]])],
  'app_chest.rot': [every(3, 0.0, nod(-4, 0.3, 0.9, 0.5))],

  // ---------------------------------------------------------- the sparrows: flutter, hop, flit
  'sp1_wing.rot': [every(2, 0.0, [[0, 0], [0.06, -42], [0.12, 8], [0.18, -42], [0.24, 8], [0.3, -42], [0.36, 8], [0.42, -42], [0.48, 8], [0.54, -40], [0.62, 0]])],
  'sp1_body.ty': [every(2, 0.0, [[0, 0], [0.3, -22, 'out'], [0.6, -8], [0.9, 0]])],
  'sp1_body.tx': [every(4, 0.0, [[0, 0], [0.5, 16], [2.0, 16], [2.5, 0]])],
  'sp1_body.rot': [every(2, 0.0, [[0, 0], [0.3, -10], [0.8, 0]])],
  'sp2_wing_l.rot': [every(2, 1.0, [[0, 0], [0.06, -36], [0.12, 6], [0.18, -36], [0.24, 6], [0.3, -36], [0.36, 6], [0.42, -36], [0.48, 6], [0.56, 0]])],
  'sp2_wing_r.rot': [every(2, 1.0, [[0, 0], [0.06, 36], [0.12, -6], [0.18, 36], [0.24, -6], [0.3, 36], [0.36, -6], [0.42, 36], [0.48, -6], [0.56, 0]])],
  'sp2_body.tx': [every(4, 1.0, [[0, 0], [0.6, -24], [2.0, -24], [2.6, 0]])],
  'sp2_body.ty': [every(2, 1.0, [[0, 0], [0.3, -14, 'out'], [0.8, 0]])],

  // ---------------------------------------------------------- the foreground
  // the woman with the tray steps along; her wrists keep the tray level
  'tray_hips.rot': [osc(66, 2.6)],
  'tray_chest.rot': [osc(66, -1.4, 0.4), every(6, 2.0, nod(3, 0.4, 1.4, 0.6))],
  'tray_root.ty': [(t) => -3.5 * Math.abs(Math.sin((Math.PI * 66 * t) / LOOP))],
  'tray_hands.rot': [osc(66, -2.2, 0.3)],
  'tray_head.rot': [every(6, 2.0, nod(12, 0.35, 1.4, 0.5)), osc(66, 1.0, 0.9)],
  'tray_arm.rot': [osc(33, 2.0, 1.2)],
  // the pair greet each other, over and over: a deep bow, a nod back, then the other way round
  'greet_b_hips.rot': [every(5, 0.0, [[0, 0], [0.5, -11, 'out'], [1.2, -11], [1.8, 0]])],
  'greet_b_head.rot': [every(5, 0.1, nod(-7, 0.4, 0.8, 0.6)), every(5, 2.9, nod(-10, 0.2, 0.3, 0.3))],
  'greet_a_head.rot': [every(5, 0.8, nod(-13, 0.25, 0.5, 0.4)), every(5, 2.5, nod(-7, 0.3, 0.6, 0.4))],
  'greet_a_head.ty': [every(5, 0.8, nod(6, 0.25, 0.5, 0.4))],
  'greet_a_chest.rot': [every(5, 0.8, nod(-4, 0.3, 0.5, 0.5)), every(5, 2.5, [[0, 0], [0.4, -7, 'out'], [1.0, -7], [1.5, 0]])],
  // the women with sake: the cup goes up and down, heads turn to the kitten
  'sake_b_arm.rot': [every(4, 0.5, [[0, 0], [0.3, -18, 'out'], [1.2, -18], [1.6, 4], [1.9, 0]])],
  'sake_b_head.rot': [every(4, 0.6, nod(8, 0.3, 1.0, 0.4)), every(3, 2.0, nod(-5, 0.2, 0.3, 0.3))],
  'sake_b_chest.rot': [osc(15, 1.5, 0.8)],
  'sake_a_head.rot': [every(3, 1.2, nod(-11, 0.25, 0.8, 0.4))],
  'sake_a_chest.rot': [every(3, 1.25, nod(-3, 0.3, 0.7, 0.5)), osc(12, 1.0)],
  // the kitten will not leave the hem alone
  'cat_head.rot': [every(1.5, 0.0, [[0, 0], [0.12, -12], [0.3, 6], [0.5, -4], [0.75, 0]]), every(3, 1.0, nod(-14, 0.12, 0.3, 0.3))],
  'cat_head.tx': [every(3, 1.0, [[0, 0], [0.12, 12, 'out'], [0.5, 10], [0.8, 0]])],
  'cat_head.ty': [every(3, 1.0, [[0, 0], [0.12, -5, 'out'], [0.5, -4], [0.8, 0]])],
  'cat_rear.rot': [osc(120, 9), every(3, 1.05, nod(10, 0.12, 0.3, 0.4))],
  'sake_a_hem.tx': [every(3, 1.1, [[0, 0], [0.1, -12, 'out'], [0.5, -9], [0.9, 0]])],
  'sake_a_hem.ty': [every(3, 1.1, [[0, 0], [0.1, 4, 'out'], [0.5, 3], [0.9, 0]])],
  // the boy waves at the kitten; his mother rocks him and laughs
  'boy_arm.rot': [every(2, 0.0, [[0, 0], [0.15, 14], [0.3, -6], [0.45, 14], [0.6, -6], [0.75, 12], [1.0, 0]])],
  'boy_head.rot': [every(2, 0.0, nod(8, 0.2, 0.6, 0.4)), osc(30, 1.5)],
  'kneel_chest.rot': [osc(20, 2.6, 0.3)],
  'kneel_head.rot': [osc(20, 3.5, 0.9), every(5, 2.0, nod(8, 0.3, 0.8, 0.5))],
};

export function sampleAll(t) {
  const out = {};
  for (const key in TRACKS) {
    let v = 0;
    for (const f of TRACKS[key]) v += f(t);
    out[key] = v;
  }
  return out;
}
