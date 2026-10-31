// The loop: keyframed tracks sampled by loop time, plus the choreography.
// Rotations are degrees (positive = clockwise on screen), moves are source
// pixels of the print (2000 px wide), dz is depth (negative = toward you).

export const LOOP = 10;

const EASE = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  backOut: (t) => {
    const c1 = 1.9, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

// track: [[time, value, easeToNext?], ...] in ascending time
export function sample(track, t) {
  if (t <= track[0][0]) return track[0][1];
  for (let i = 0; i < track.length - 1; i++) {
    const [t0, v0, ease = 'inOut'] = track[i];
    const [t1, v1] = track[i + 1];
    if (t < t1) return v0 + (v1 - v0) * EASE[ease]((t - t0) / (t1 - t0));
  }
  return track[track.length - 1][1];
}

// Beats (seconds):
// 0.0-1.0  still: the print as Kuniyoshi drew it, everyone breathing
// 1.0-3.0  the arm behind Araimaru lifts slowly; its forearm rises between
//          the two men, fingers up
// 1.8-3.1  Mitsukuni pulls his blade from the red scabbard and points it at
//          the skull (the challenge)
// 2.2-3.4  Araimaru lifts his head and stands a blade up in front of him (the guard)
// 3.0-3.8  the claw pounces forward at Mitsukuni, into the raised blades
// 3.8-6.2  hold: the claw closes slowly, blades tremble
// 6.2-8.6  everything returns to the print
export const TRACKS = {
  // the skeleton's other arm: rises behind the two men, fingers up, then pounces
  // the forearm folds up behind them first, so the claw never passes under them
  'arm_upper.rot': [[0, 0], [1.0, 0, 'inOut'], [2.0, 8, 'inOut'], [3.0, 29, 'out'], [3.8, 27, 'inOut'], [6.2, 27, 'inOut'], [6.9, 31, 'inOut'], [7.8, 8, 'inOut'], [8.6, 0], [10, 0]],
  'arm_upper.dz': [[0, 0], [1.0, 0], [3.0, -0.1, 'inOut'], [6.4, -0.1, 'inOut'], [8.6, 0]],
  'arm_fore.rot': [[0, 0], [1.0, 0, 'out'], [2.0, 110, 'out'], [3.0, 134, 'out'], [3.8, 130, 'inOut'], [6.2, 130, 'inOut'], [6.9, 138, 'inOut'], [7.8, 110, 'in'], [8.6, 0]],
  'arm_hand.rot': [[0, 0], [1.0, 0, 'inOut'], [2.0, 10, 'inOut'], [3.0, 37, 'inOut'], [3.75, -118, 'backOut'], [6.2, -110, 'inOut'], [6.9, 30, 'inOut'], [7.8, 10, 'inOut'], [8.6, 0]],
  'arm_fingers.rot': [[0, 0], [3.0, -10, 'inOut'], [3.8, 4, 'inOut'], [6.0, 20, 'inOut'], [6.8, -4, 'inOut'], [8.4, 0]],
  'arm_fingers.sx': [[0, 1], [3.0, 1.15, 'out'], [3.8, 1.25, 'inOut'], [6.0, 0.86, 'inOut'], [6.8, 1.1, 'inOut'], [8.4, 1]],
  'layer:skeleton_forearm.opacity': [[0, 0], [1.55, 0, 'linear'], [1.8, 1], [7.95, 1, 'linear'], [8.2, 0]],
  'layer:skeleton_hand.opacity': [[0, 0], [1.55, 0, 'linear'], [1.8, 1], [7.95, 1, 'linear'], [8.2, 0]],

  // the skull leans in, the other claw tightens
  'skel_skull.rot': [[0, 0], [1.2, 0, 'inOut'], [3.8, -2.6, 'inOut'], [6.2, -2.4, 'inOut'], [8.6, 0]],
  'skel_skull.ty': [[0, 0], [1.2, 0, 'inOut'], [3.8, 6, 'inOut'], [6.2, 5, 'inOut'], [8.6, 0]],
  'skel_claw.rot': [[0, 0], [2.4, 0, 'inOut'], [3.8, 3.5, 'inOut'], [6.0, 5, 'inOut'], [7.6, 0]],

  // Mitsukuni: pull the blade, then point it at the skull (the challenge)
  // the pull slides the blade out along the scabbard (which slopes ~4 degrees)
  'mitsukuni_grip.tx': [[0, 0], [1.8, 0, 'in'], [2.35, -34, 'out'], [3.1, -22, 'inOut'], [6.8, -22, 'inOut'], [7.8, -34, 'inOut'], [8.5, 0]],
  'mitsukuni_grip.ty': [[0, 0], [1.8, 0, 'in'], [2.35, -2.6, 'out'], [3.1, -16, 'inOut'], [6.8, -16, 'inOut'], [7.8, -2.6, 'inOut'], [8.5, 0]],
  'mitsukuni_grip.rot': [[0, 0], [2.35, 0, 'backOut'], [3.1, -62], [6.8, -62, 'inOut'], [7.7, 0]],
  'mitsukuni_forearm.rot': [[0, 0], [2.35, 0, 'out'], [3.1, -10, 'inOut'], [6.8, -10, 'inOut'], [7.8, 0, 'linear'], [10, 0]],
  'mitsukuni_head.rot': [[0, 0], [1.4, 0, 'inOut'], [2.8, 4, 'inOut'], [6.6, 4, 'inOut'], [8.0, 0]],
  'layer:mitsukuni_blade.opacity': [[0, 0], [1.82, 0, 'linear'], [1.9, 1], [8.45, 1, 'linear'], [8.52, 0]],

  // Araimaru: lift the head, stand the blade up (the guard)
  'araimaru_head.rot': [[0, 0], [2.0, 0, 'inOut'], [3.0, 7, 'inOut'], [6.6, 7, 'inOut'], [8.0, 0]],
  'araimaru_arms.ty': [[0, 0], [2.2, 0, 'inOut'], [2.9, -10, 'inOut'], [6.8, -10, 'inOut'], [8.0, 0]],
  'araimaru_arms.rot': [[0, 0], [2.2, 0, 'inOut'], [2.9, -3, 'inOut'], [6.8, -3, 'inOut'], [8.0, 0]],
  'araimaru_sword.rot': [[0, 0], [2.25, 0, 'backOut'], [3.4, -112], [6.9, -112, 'inOut'], [8.0, 0]],
  'layer:araimaru_sword.opacity': [[0, 0], [2.2, 0, 'linear'], [2.32, 1], [7.9, 1, 'linear'], [8.05, 0]],
  'fx:araimaru_reveal': [[0, 0], [2.25, 0, 'out'], [3.1, 1], [6.9, 1, 'in'], [7.45, 0]],

  // light running along each blade the moment it stands
  'fx:glint_mitsukuni': [[0, -0.3], [3.05, -0.3, 'out'], [3.7, 1.3], [10, 1.3]],
  'fx:glint_araimaru': [[0, -0.3], [3.35, -0.3, 'out'], [4.0, 1.3], [10, 1.3]],

  // how frightened everyone is: speeds up breathing, drives the trembling
  'fx:tension': [[0, 0], [1.0, 0, 'inOut'], [3.2, 1, 'inOut'], [6.2, 1, 'inOut'], [8.8, 0]],
};

export function sampleAll(t) {
  const out = {};
  for (const key in TRACKS) out[key] = sample(TRACKS[key], t);
  return out;
}
