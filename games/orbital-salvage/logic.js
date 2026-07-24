// ORBITAL SALVAGE rules. Rendering and input stay in orbital-salvage.js; the
// simulation is plain serializable data advanced by pure functions.
//
// The physics model is deliberately legible rather than realistic: a single
// central gravity well (inverse-square, semi-implicit Euler on a fixed
// substep), circular parking orbits for everything the player is not towing,
// and burns as instant impulses so previewTrajectory can show exactly what a
// release will do. There is no n-body chaos: the route home changes only
// through the player's own burns and the mass they choose to tow. Towed
// cargo is a real second body on a rope-spring tether, so a heavy wreck
// visibly drags the tug off the line a bare tug would fly.

export const CFG = {
  W: 640,
  H: 480,
  CX: 320,
  CY: 240,
  MU: 360000, // gravity parameter; v_circular = sqrt(MU / r)
  TUG_MASS: 10,
  TUG_R: 7,
  CARGO_R: 9,
  FUEL: 140,
  FUEL_PER_IMPULSE: 0.08,
  IMPULSE_PER_PX: 2,
  MAX_DRAG: 120,
  MIN_DRAG: 8,
  RCS_THRUST: 60, // impulse per second while a thrust key is held
  PLANET_R: 40,
  ATMO_R: 58, // below this the tug (or cargo) burns up
  ESCAPE_R: 330, // beyond this the tug is lost to deep space
  HEAT_R: 112,
  HEAT_RATE: 30,
  COOL_RATE: 16,
  HEAT_MAX: 100,
  OVERHEAT_DPS: 10,
  TETHER_RANGE: 48,
  TETHER_LEN: 26,
  TETHER_K: 40,
  TETHER_DAMP: 9,
  DOCK_RANGE: 30,
  DOCK_SPEED: 34,
  HIT_HULL: 25,
  HIT_INVULN: 1.2,
  HIT_KICK: 46,
  DRIFT_GRACE: 30, // seconds of reserve power once the tank is dry
  CONTRACT_VALUE: 400,
  SUBSTEP: 1 / 120,
};

const TAU = Math.PI * 2;

// Small deterministic PRNG so contract variation is seeded, never ambient.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function orbitalSpeed(r) {
  return Math.sqrt(CFG.MU / r);
}

export function orbitalOmega(r) {
  return orbitalSpeed(r) / r;
}

export function orbitPosition(r, angle) {
  return { x: CFG.CX + Math.cos(angle) * r, y: CFG.CY + Math.sin(angle) * r };
}

export function orbitVelocity(r, angle, dir = 1) {
  const s = orbitalSpeed(r) * dir;
  return { vx: -Math.sin(angle) * s, vy: Math.cos(angle) * s };
}

export function wreckPosition(wreck) {
  return orbitPosition(wreck.r, wreck.angle);
}

export function carrierPosition(state) {
  return orbitPosition(state.carrier.r, state.carrier.angle);
}

export function carrierVelocity(state) {
  return orbitVelocity(state.carrier.r, state.carrier.angle, state.carrier.dir);
}

export function debrisPosition(cluster) {
  return orbitPosition(cluster.r, cluster.angle);
}

export function totalMass(state) {
  return CFG.TUG_MASS + (state.cargo ? state.cargo.mass : 0);
}

export function radiusOf(body) {
  return Math.hypot(body.x - CFG.CX, body.y - CFG.CY);
}

// One authored contract (G-013). The deep wreck alone meets the contract, and
// so does the pod + array pair: one dangerous heavy haul or two light trips.
function authoredWrecks() {
  return [
    {
      id: 'core', label: 'REACTOR CORE', r: 85, angle: 2.2, dir: 1,
      mass: 14, value: 400, riskBonus: 3000, state: 'field',
    },
    {
      id: 'array', label: 'SOLAR ARRAY', r: 130, angle: 4.4, dir: 1,
      mass: 8, value: 250, riskBonus: 1500, state: 'field',
    },
    {
      id: 'pod', label: 'CARGO POD', r: 215, angle: 0.6, dir: 1,
      mass: 5, value: 150, riskBonus: 500, state: 'field',
    },
  ];
}

function authoredDebris(rng) {
  const clusters = [];
  const rings = [
    { r: 108, count: 6, omega: 0.55, radius: 8 },
    { r: 152, count: 7, omega: -0.4, radius: 9 },
  ];
  for (const ring of rings) {
    for (let i = 0; i < ring.count; i += 1) {
      clusters.push({
        r: ring.r,
        angle: (i / ring.count) * TAU + (rng() - 0.5) * 0.5,
        omega: ring.omega,
        radius: ring.radius,
      });
    }
  }
  return clusters;
}

export function newGame(seed = 1013) {
  const rng = mulberry32(seed);
  const carrier = { r: 185, angle: 1.0, dir: 1, omega: orbitalOmega(185) };
  const startAngle = carrier.angle + 0.22;
  const pos = orbitPosition(carrier.r, startAngle);
  const vel = orbitVelocity(carrier.r, startAngle, carrier.dir);
  return {
    seed,
    t: 0,
    tug: { x: pos.x, y: pos.y, vx: vel.vx, vy: vel.vy },
    fuel: CFG.FUEL,
    hull: 100,
    heat: 0,
    invuln: 0,
    emptyFor: 0,
    cargo: null, // { wreckId, mass, x, y, vx, vy }
    wrecks: authoredWrecks(),
    debris: authoredDebris(rng),
    carrier,
    contract: CFG.CONTRACT_VALUE,
    dockedValue: 0,
    riskBonus: 0,
    collisions: 0,
    over: false,
    win: false,
    outcome: null,
    score: 0,
  };
}

// Score contract from GAME_ROADMAP §9: 10 × docked salvage value + 100 per
// fuel unit + 500 per hull-integrity percent + authored risk bonus − 1,000
// per collision, floored at zero. Tie-break (less elapsed time) rides in
// state.t for future boards.
export function missionScore(state) {
  return Math.max(
    0,
    Math.round(
      10 * state.dockedValue +
        100 * Math.ceil(Math.max(0, state.fuel)) +
        500 * Math.max(0, Math.round(state.hull)) +
        state.riskBonus -
        1000 * state.collisions,
    ),
  );
}

function finish(state, outcome) {
  state.over = true;
  state.outcome = outcome;
  state.win = outcome === 'complete';
  state.score = missionScore(state);
}

// Drag vector (canvas pixels) → burn. dv lands on the tug alone: with cargo
// on the tether the same drag buys visibly less route change, which is the
// game's premise. effectiveDv reports the settled combined change for the HUD.
export function burnFromDrag(state, dx, dy) {
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len < CFG.MIN_DRAG) return null;
  const capped = Math.min(len, CFG.MAX_DRAG);
  let impulse = capped * CFG.IMPULSE_PER_PX;
  impulse = Math.min(impulse, Math.max(0, state.fuel) / CFG.FUEL_PER_IMPULSE);
  if (impulse <= 0) return null;
  const dv = impulse / CFG.TUG_MASS;
  return {
    dvx: (dx / len) * dv,
    dvy: (dy / len) * dv,
    impulse,
    fuelCost: impulse * CFG.FUEL_PER_IMPULSE,
    effectiveDv: impulse / totalMass(state),
  };
}

export function applyBurn(state, dx, dy) {
  if (state.over) return [];
  const burn = burnFromDrag(state, dx, dy);
  if (!burn) return [];
  state.tug.vx += burn.dvx;
  state.tug.vy += burn.dvy;
  state.fuel = Math.max(0, state.fuel - burn.fuelCost);
  return ['burn'];
}

export function nearestTetherable(state) {
  let best = null;
  let bestDist = CFG.TETHER_RANGE;
  for (const wreck of state.wrecks) {
    if (wreck.state !== 'field') continue;
    const p = wreckPosition(wreck);
    const d = Math.hypot(p.x - state.tug.x, p.y - state.tug.y);
    if (d <= bestDist) {
      best = wreck;
      bestDist = d;
    }
  }
  return best;
}

export function toggleTether(state) {
  if (state.over) return [];
  if (state.cargo) {
    // Released cargo settles into a circular parking orbit where it was let
    // go — a legible simplification so the field never becomes unreadable.
    const wreck = state.wrecks.find((w) => w.id === state.cargo.wreckId);
    if (wreck) {
      wreck.state = 'field';
      wreck.r = Math.max(CFG.ATMO_R + 12, radiusOf(state.cargo));
      wreck.angle = Math.atan2(state.cargo.y - CFG.CY, state.cargo.x - CFG.CX);
    }
    state.cargo = null;
    return ['release'];
  }
  const wreck = nearestTetherable(state);
  if (!wreck) return [];
  const p = wreckPosition(wreck);
  const v = orbitVelocity(wreck.r, wreck.angle, wreck.dir);
  wreck.state = 'tethered';
  state.cargo = { wreckId: wreck.id, mass: wreck.mass, x: p.x, y: p.y, vx: v.vx, vy: v.vy };
  return ['tether'];
}

function gravityAccel(x, y) {
  const dx = x - CFG.CX;
  const dy = y - CFG.CY;
  const r2 = dx * dx + dy * dy;
  const r = Math.sqrt(r2);
  const a = -CFG.MU / (r2 * r);
  return { ax: a * dx, ay: a * dy };
}

// Advance the tug (and tethered cargo) one substep. Shared verbatim by step()
// and previewTrajectory() so the preview cannot lie about the physics.
function integratePair(tug, cargo, cargoMass, h, thrust) {
  const g = gravityAccel(tug.x, tug.y);
  let ax = g.ax + (thrust ? thrust.ax : 0);
  let ay = g.ay + (thrust ? thrust.ay : 0);
  if (cargo) {
    const gc = gravityAccel(cargo.x, cargo.y);
    let cax = gc.ax;
    let cay = gc.ay;
    const dx = cargo.x - tug.x;
    const dy = cargo.y - tug.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist > CFG.TETHER_LEN) {
      const nx = dx / dist;
      const ny = dy / dist;
      const relv = (cargo.vx - tug.vx) * nx + (cargo.vy - tug.vy) * ny;
      const force = CFG.TETHER_K * (dist - CFG.TETHER_LEN) + CFG.TETHER_DAMP * relv;
      ax += (force * nx) / CFG.TUG_MASS;
      ay += (force * ny) / CFG.TUG_MASS;
      cax -= (force * nx) / cargoMass;
      cay -= (force * ny) / cargoMass;
    }
    cargo.vx += cax * h;
    cargo.vy += cay * h;
    cargo.x += cargo.vx * h;
    cargo.y += cargo.vy * h;
  }
  tug.vx += ax * h;
  tug.vy += ay * h;
  tug.x += tug.vx * h;
  tug.y += tug.vy * h;
}

export function step(state, dt, controls = {}) {
  const events = [];
  if (state.over || !Number.isFinite(dt) || dt <= 0) return events;
  state.t += dt;

  // RCS trim: held-key thrust, fuel-gated, mass-divided like everything else.
  const rcs = controls.rcs ?? { x: 0, y: 0 };
  const rcsLen = Math.hypot(rcs.x, rcs.y);
  let thrust = null;
  if (rcsLen > 0 && state.fuel > 0) {
    const accel = CFG.RCS_THRUST / CFG.TUG_MASS;
    thrust = { ax: (rcs.x / rcsLen) * accel, ay: (rcs.y / rcsLen) * accel };
    state.fuel = Math.max(0, state.fuel - CFG.RCS_THRUST * CFG.FUEL_PER_IMPULSE * dt);
    events.push('rcs');
  }

  const cargoMass = state.cargo ? state.cargo.mass : 0;
  let remaining = dt;
  while (remaining > 1e-9) {
    const h = Math.min(CFG.SUBSTEP, remaining);
    integratePair(state.tug, state.cargo, cargoMass, h, thrust);
    remaining -= h;
  }

  // Everything not towed rides its authored circular orbit.
  for (const wreck of state.wrecks) {
    if (wreck.state === 'field') wreck.angle += wreck.dir * orbitalOmega(wreck.r) * dt;
  }
  for (const cluster of state.debris) cluster.angle += cluster.omega * dt;
  state.carrier.angle += state.carrier.dir * state.carrier.omega * dt;

  // Heat: skimming the well cooks the hull; altitude cools it.
  const r = radiusOf(state.tug);
  const wasOverheating = state.heat >= CFG.HEAT_MAX;
  if (r < CFG.HEAT_R) {
    state.heat += ((CFG.HEAT_R - r) / (CFG.HEAT_R - CFG.ATMO_R)) * CFG.HEAT_RATE * dt;
  } else {
    state.heat -= CFG.COOL_RATE * dt;
  }
  state.heat = Math.max(0, Math.min(CFG.HEAT_MAX, state.heat));
  if (state.heat >= CFG.HEAT_MAX) {
    state.hull -= CFG.OVERHEAT_DPS * dt;
    if (!wasOverheating) events.push('overheat');
    if (state.hull <= 0) {
      state.hull = 0;
      finish(state, 'hull');
      events.push('game-over');
      return events;
    }
  }

  // Failed orbit: the well below, deep space above.
  if (r < CFG.ATMO_R) {
    finish(state, 'burn-up');
    events.push('game-over');
    return events;
  }
  if (r > CFG.ESCAPE_R) {
    finish(state, 'adrift');
    events.push('game-over');
    return events;
  }
  if (state.cargo) {
    const cargoR = radiusOf(state.cargo);
    if (cargoR < CFG.ATMO_R) {
      finish(state, 'cargo');
      events.push('game-over');
      return events;
    }
  }

  // Rotating hazards. The tug bounces and bleeds hull; tethered cargo is
  // fragile and simply dies, taking the mission with it.
  state.invuln = Math.max(0, state.invuln - dt);
  for (const cluster of state.debris) {
    const p = debrisPosition(cluster);
    if (state.invuln <= 0) {
      const d = Math.hypot(p.x - state.tug.x, p.y - state.tug.y);
      if (d < CFG.TUG_R + cluster.radius) {
        state.hull -= CFG.HIT_HULL;
        state.collisions += 1;
        state.invuln = CFG.HIT_INVULN;
        const n = d || 1;
        state.tug.vx += ((state.tug.x - p.x) / n) * CFG.HIT_KICK;
        state.tug.vy += ((state.tug.y - p.y) / n) * CFG.HIT_KICK;
        events.push('collision');
        if (state.hull <= 0) {
          state.hull = 0;
          finish(state, 'hull');
          events.push('game-over');
          return events;
        }
      }
    }
    if (state.cargo) {
      const cd = Math.hypot(p.x - state.cargo.x, p.y - state.cargo.y);
      if (cd < CFG.CARGO_R + cluster.radius) {
        finish(state, 'cargo');
        events.push('game-over');
        return events;
      }
    }
  }

  // Docking: close and slow relative to the moving carrier.
  const cp = carrierPosition(state);
  const cv = carrierVelocity(state);
  const dockDist = Math.hypot(cp.x - state.tug.x, cp.y - state.tug.y);
  const relSpeed = Math.hypot(state.tug.vx - cv.vx, state.tug.vy - cv.vy);
  if (dockDist < CFG.DOCK_RANGE && relSpeed < CFG.DOCK_SPEED && state.cargo) {
    const wreck = state.wrecks.find((w) => w.id === state.cargo.wreckId);
    if (wreck) {
      wreck.state = 'docked';
      state.dockedValue += wreck.value;
      state.riskBonus += wreck.riskBonus;
    }
    state.cargo = null;
    events.push('deposit');
    if (state.dockedValue >= state.contract) {
      finish(state, 'complete');
      events.push('complete');
      return events;
    }
  }

  // Dry tank: a reserve-power countdown, then the tug is written off.
  if (state.fuel <= 0) {
    state.emptyFor += dt;
    if (state.emptyFor >= CFG.DRIFT_GRACE) {
      finish(state, 'stranded');
      events.push('game-over');
      return events;
    }
  } else {
    state.emptyFor = 0;
  }

  return events;
}

// Forward-integrate the tug (+ tethered cargo) with an optional pending burn.
// Gravity and tether only: debris and heat are dynamic hazards the preview
// deliberately does not solve (G-013 acceptance). Returns sampled points and
// how the coast ends, if it ends inside the horizon.
export function previewTrajectory(state, dvx = 0, dvy = 0, seconds = 18) {
  const hz = 30;
  const stride = 3;
  const tug = { ...state.tug, vx: state.tug.vx + dvx, vy: state.tug.vy + dvy };
  const cargo = state.cargo ? { ...state.cargo } : null;
  const cargoMass = cargo ? cargo.mass : 0;
  const points = [];
  let fate = null;
  const steps = Math.floor(seconds * hz);
  for (let i = 0; i < steps; i += 1) {
    integratePair(tug, cargo, cargoMass, 1 / hz, null);
    if (i % stride === 0) points.push({ x: tug.x, y: tug.y });
    const r = radiusOf(tug);
    if (r < CFG.ATMO_R) {
      fate = 'burn-up';
      break;
    }
    if (r > CFG.ESCAPE_R) {
      fate = 'escape';
      break;
    }
  }
  return { points, fate };
}
