// PINBALL AFTER DARK — the table itself.
//
// Geometry is immutable module data, never simulation state. The simulation
// stores indices into these arrays (district 2, drop target 0), so a run's
// state stays plain JSON that survives a round trip through the structured
// clone or a save file. The renderer reads the same arrays, which is why the
// drawn table and the collided table cannot drift apart.
//
// Coordinates are canvas pixels: x right, y DOWN, so gravity is +y and an
// angle of 0 points right, +90° points down the playfield.

const rad = (deg) => (deg * Math.PI) / 180;

function segment(ax, ay, bx, by, extra = {}) {
  return Object.freeze({ ax, ay, bx, by, e: 0.42, kick: 0, kind: 'wall', ...extra });
}

// Polyline: [x0,y0, x1,y1, ...] becomes a chain of segments.
function chain(points, extra = {}) {
  const out = [];
  for (let i = 0; i + 3 < points.length; i += 2) {
    out.push(segment(points[i], points[i + 1], points[i + 2], points[i + 3], extra));
  }
  return out;
}

// A circular arc approximated by `steps` chords. 12 chords over 90° at r=100
// leaves a 0.2px sagitta, far below the 7px ball radius, so the ball never
// feels the facets.
function arc(cx, cy, r, fromDeg, toDeg, steps = 14, extra = {}) {
  const out = [];
  for (let i = 0; i < steps; i += 1) {
    const a0 = rad(fromDeg + ((toDeg - fromDeg) * i) / steps);
    const a1 = rad(fromDeg + ((toDeg - fromDeg) * (i + 1)) / steps);
    out.push(segment(
      cx + Math.cos(a0) * r, cy + Math.sin(a0) * r,
      cx + Math.cos(a1) * r, cy + Math.sin(a1) * r,
      extra,
    ));
  }
  return out;
}

export const TABLE = Object.freeze({
  width: 640,
  height: 480,
  // Everything below this line has left the playfield.
  drainY: 472,
  // The plunger lane, as a rectangle the simulation can test cheaply.
  lane: Object.freeze({ x: 596, y: 380, restX: 608, restY: 460 }),
  saucer: Object.freeze({ x: 300, y: 252, r: 20 }),
  flippers: Object.freeze([
    // Pivots 164 apart with a 24 degree rest leaves 40px of clear air between
    // the tips: just under three ball diameters, so an unflipped ball reliably
    // drains but a centre shot still has room to leave the table.
    Object.freeze({ side: 'left', px: 218, py: 396, len: 60, r: 7, rest: rad(24), up: rad(-36) }),
    Object.freeze({ side: 'right', px: 382, py: 396, len: 60, r: 7, rest: rad(156), up: rad(216) }),
  ]),
});

// Four districts of the grid. `need` is how many target hits arm the district;
// the spread (3/3/4/4) means the outer districts cost more to charge, so the
// order a player works the table in is itself a decision.
export const DISTRICTS = Object.freeze([
  Object.freeze({ id: 'harbor', name: 'HARBOR', need: 3, x: 58, y: 262, r: 9 }),
  Object.freeze({ id: 'market', name: 'MARKET', need: 3, x: 168, y: 112, r: 9 }),
  Object.freeze({ id: 'tower', name: 'TOWER', need: 4, x: 432, y: 112, r: 9 }),
  Object.freeze({ id: 'yards', name: 'YARDS', need: 4, x: 542, y: 262, r: 9 }),
]);

export const DROPS = Object.freeze([
  Object.freeze({ x: 140, y: 276, r: 9 }),
  Object.freeze({ x: 140, y: 302, r: 9 }),
  Object.freeze({ x: 140, y: 328, r: 9 }),
]);

export const BUMPERS = Object.freeze([
  Object.freeze({ x: 240, y: 168, r: 18 }),
  Object.freeze({ x: 318, y: 128, r: 18 }),
  Object.freeze({ x: 392, y: 176, r: 18 }),
]);

// Rubber posts guarding the substation mouth. Threading between them is the
// deliberate centre shot; the roof above stops the bumpers banking for you.
export const POSTS = Object.freeze([
  Object.freeze({ x: 264, y: 250, r: 7 }),
  Object.freeze({ x: 336, y: 250, r: 7 }),
]);

// The outer shell, in one list. Order is irrelevant: every segment is tested
// each substep and resolved independently.
export const WALLS = Object.freeze([
  // left wall, top-left arc, top wall
  ...chain([12, 318, 12, 160]),
  ...arc(112, 160, 100, 180, 270),
  ...chain([112, 60, 488, 60]),

  // plunger lane: two concentric arcs turn a vertical shot into a leftward
  // roll across the top, which is what gives the table a real right orbit.
  ...arc(488, 200, 140, 270, 360),
  ...chain([628, 200, 628, 470, 588, 470, 588, 200]),
  ...arc(488, 200, 100, 270, 360),

  // One-way gate across the lane mouth, angled so a ball completing the top
  // orbit is deflected DOWN into the playfield instead of rebounding flat.
  // `oneWay` is the outward normal of the blocked face: the gate only exists
  // for balls approaching from the playfield side.
  segment(480, 58, 496, 102, { e: 0.3, kind: 'gate', oneWayX: -0.9397, oneWayY: 0.342 }),

  // Inlane floors. Two rules, both learned the hard way:
  //
  // 1. Steep enough that gravity beats rolling friction all the way down.
  //    A 5-degree floor let balls creep at 23px/s and settle for a minute.
  // 2. The floor passes OVER the flipper pivot and ends past it, so the ball
  //    is dropped onto the bat. Ending the floor beside the pivot instead put
  //    the ball into the pivot circle's near-vertical left flank, where the
  //    floor normal and the circle normal oppose horizontally: a genuine
  //    static equilibrium that trapped the ball for the rest of the run.
  ...chain([12, 318, 100, 352, 228, 382]),
  ...chain([588, 318, 500, 352, 372, 382]),
  // Outlane walls: a ball that squeezes past the pivot on the outside is lost,
  // which is the outlane doing its job rather than a hole in the table.
  segment(212, 386, 212, 470),
  segment(388, 386, 388, 470),

  // slingshots: face A→B kicks, the other two faces are plain rubber
  segment(176, 296, 226, 346, { e: 0.4, kick: 400, kind: 'sling', slot: 0 }),
  ...chain([226, 346, 166, 350, 176, 296], { e: 0.55 }),
  segment(424, 296, 374, 346, { e: 0.4, kick: 400, kind: 'sling', slot: 1 }),
  ...chain([374, 346, 434, 350, 424, 296], { e: 0.55 }),

  // substation housing: a dead roof so a ball dropped from the bumpers is
  // deadened and rolls off instead of banking a district for the player.
  segment(268, 226, 332, 226, { e: 0.15, kind: 'roof' }),
  segment(268, 226, 262, 244, { e: 0.3 }),
  segment(332, 226, 338, 244, { e: 0.3 }),
]);

// Touch zones, in canvas pixels. Each is at least 96px on its shorter side and
// none of them overlap, so no gesture needs a second finger to disambiguate.
export const TOUCH = Object.freeze({
  flipLeft: Object.freeze({ x: 0, y: 368, w: 320, h: 112 }),
  flipRight: Object.freeze({ x: 320, y: 368, w: 320, h: 112 }),
  nudgeLeft: Object.freeze({ x: 0, y: 120, w: 96, h: 248 }),
  nudgeRight: Object.freeze({ x: 544, y: 120, w: 96, h: 248 }),
});

export function inZone(zone, x, y) {
  return x >= zone.x && x < zone.x + zone.w && y >= zone.y && y < zone.y + zone.h;
}
