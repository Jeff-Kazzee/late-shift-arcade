// FOLDSPACE simulation — paper-fold topology puzzles as plain serializable
// data. The level IS the move: a fold mirrors one side of the grid onto the
// other, the folded cells land on top, and the grid gets smaller. Win a
// puzzle by folding the light shard onto the exit gate; win the run by
// clearing every authored puzzle.
//
// Content is authored, not generated: every puzzle in PUZZLES ships with a
// fold budget, and the test suite PROVES each one solvable inside that budget
// with a breadth-first search over the real fold operator — the same code the
// game executes.
//
// Rules of the file, same as every cartridge here:
// 1. No ambient randomness — the puzzles are authored, so the sim needs none;
//    determinism is command-log replay, proven in the tests.
// 2. No canvas, DOM, clock, or input. Player intent arrives as commands.
// 3. Fixed steps; same commands ⇒ identical final state.

export const CFG = {
  W: 640,
  H: 480,
  TICK: 1 / 60,

  MAX_RESETS: 5, // the paper tears on the sixth re-crease

  // SCORE (the documented formula):
  //   + 10000 per cleared puzzle
  //   +  2000 per unused fold when a puzzle clears — economy pays
  //   +  5000 per spark folded into the shard's cell — the optional pickup
  //   + 15000 for clearing the whole set
  //   -  1000 per reset
  //   floored at 0. A collapsed or torn run keeps the puzzles it banked;
  //   only a full clear earns the completion bonus.
  SCORE_CLEAR: 10000,
  SCORE_FOLD_LEFT: 2000,
  SCORE_SPARK: 5000,
  SCORE_COMPLETE: 15000,
  PENALTY_RESET: 1000,
};

// Cell items. A cell is a stack (array) of these, bottom first.
//   S shard   G gate   # block   * spark
// Blocks are the only physical constraint: a fold that would land a block on
// a block is refused — the paper will not close over an anvil.
const ITEMS = new Set(['S', 'G', '#', '*']);

// --- The authored set ---------------------------------------------------------
// Nine puzzles. `budget` is the authored fold allowance; the tests prove a
// solution exists at or under it. Layout strings are rows, top to bottom.

export const PUZZLES = Object.freeze([
  {
    name: 'INTAKE',
    budget: 2,
    layout: ['S..G', '....', '....'],
  },
  {
    name: 'POSTCARD',
    budget: 3,
    layout: ['S...', '....', '....', '...G'],
  },
  {
    name: 'EMBER',
    budget: 3,
    layout: ['S..*', '....', '....', '...G'],
  },
  {
    name: 'PLEAT',
    budget: 3,
    layout: ['S.....', '......', '......', '.....G'],
  },
  {
    name: 'ANVIL',
    budget: 4,
    layout: ['S.....', '.#.#..', '.....G'],
  },
  {
    name: 'FURNACE',
    budget: 5,
    layout: ['S...*', '.#.#.', '*...G'],
  },
  {
    name: 'LANTERN',
    budget: 5,
    layout: ['S.....', '.#..#.', '......', '.....G'],
  },
  {
    name: 'DEEP FOLD',
    budget: 5,
    layout: ['S.....', '.#....', '....#.', '...*.G'],
  },
  {
    name: 'LAST CREASE',
    budget: 6,
    layout: ['S.....', '.#..#.', '.....G'],
  },
]);

export function parseLayout(layout) {
  const h = layout.length;
  const w = layout[0].length;
  const cells = [];
  for (let r = 0; r < h; r += 1) {
    const row = [];
    for (let c = 0; c < w; c += 1) {
      const ch = layout[r][c];
      row.push(ITEMS.has(ch) ? [ch] : []);
    }
    cells.push(row);
  }
  return { w, h, cells };
}

export function newRun() {
  const state = {
    tick: 0,
    status: 'briefing', // briefing | running | cleared | won | lost
    failure: null, // collapsed (out of folds) | torn (out of resets)
    puzzle: 0,
    grid: parseLayout(PUZZLES[0].layout),
    foldsUsed: 0,
    budget: PUZZLES[0].budget,
    totalFolds: 0,
    cleared: 0,
    sparks: 0,
    resets: 0,
    banked: 0,
  };
  return state;
}

// --- Reading the grid -----------------------------------------------------------

const stackHas = (stack, item) => stack.includes(item);

export function findItem(grid, item) {
  for (let r = 0; r < grid.h; r += 1) {
    for (let c = 0; c < grid.w; c += 1) {
      if (stackHas(grid.cells[r][c], item)) return { r, c };
    }
  }
  return null;
}

export function countItems(grid) {
  const counts = {};
  for (const row of grid.cells) {
    for (const stack of row) {
      for (const item of stack) counts[item] = (counts[item] ?? 0) + 1;
    }
  }
  return counts;
}

// Which side a crease folds. The smaller side always folds over the larger;
// at the exact middle the near side (left / top) folds, which is equivalent
// up to mirror to folding the far side.
//   axis 'v': crease k splits columns [0..k-1] | [k..w-1]
//   axis 'h': crease k splits rows    [0..k-1] | [k..h-1]
export function foldSide(grid, axis, crease) {
  const span = axis === 'v' ? grid.w : grid.h;
  if (!Number.isInteger(crease) || crease < 1 || crease >= span) return null;
  return crease * 2 <= span ? 'near' : 'far';
}

// Preview a fold without applying it: where does the folded region land, and
// is it legal? Returns { ok, reason, side } — reason is a player-readable
// refusal ('blocked'), never a throw.
export function checkFold(grid, axis, crease) {
  const side = foldSide(grid, axis, crease);
  if (side === null) return { ok: false, reason: 'no-crease', side: null };
  const span = axis === 'v' ? grid.w : grid.h;
  const lo = side === 'near' ? 0 : crease;
  const hi = side === 'near' ? crease : span;
  // Mirror across the crease line: index i lands on 2*crease - 1 - i.
  for (let r = 0; r < grid.h; r += 1) {
    for (let c = 0; c < grid.w; c += 1) {
      const i = axis === 'v' ? c : r;
      if (i < lo || i >= hi) continue;
      const stack = grid.cells[r][c];
      if (!stackHas(stack, '#')) continue;
      const m = 2 * crease - 1 - i;
      const dest = axis === 'v' ? grid.cells[r][m] : grid.cells[m][c];
      if (stackHas(dest, '#')) return { ok: false, reason: 'blocked', side };
    }
  }
  return { ok: true, reason: null, side };
}

// Apply a fold, returning the new smaller grid. Folded stacks flip over, so
// their layer order reverses and they land ON TOP of the destination stack —
// exactly what a piece of paper does.
export function applyFold(grid, axis, crease) {
  const { ok, side } = checkFold(grid, axis, crease);
  if (!ok) return null;
  const span = axis === 'v' ? grid.w : grid.h;
  const keepLo = side === 'near' ? crease : 0;
  const keepHi = side === 'near' ? span : crease;
  const foldLo = side === 'near' ? 0 : crease;
  const foldHi = side === 'near' ? crease : span;

  const w = axis === 'v' ? keepHi - keepLo : grid.w;
  const h = axis === 'h' ? keepHi - keepLo : grid.h;
  const cells = [];
  for (let r = 0; r < h; r += 1) {
    const row = [];
    for (let c = 0; c < w; c += 1) {
      const or = axis === 'h' ? r + keepLo : r;
      const oc = axis === 'v' ? c + keepLo : c;
      row.push([...grid.cells[or][oc]]);
    }
    cells.push(row);
  }
  for (let r = 0; r < grid.h; r += 1) {
    for (let c = 0; c < grid.w; c += 1) {
      const i = axis === 'v' ? c : r;
      if (i < foldLo || i >= foldHi) continue;
      const stack = grid.cells[r][c];
      if (stack.length === 0) continue;
      const m = 2 * crease - 1 - i;
      const nr = axis === 'h' ? m - keepLo : r;
      const nc = axis === 'v' ? m - keepLo : c;
      cells[nr][nc].push(...[...stack].reverse());
    }
  }
  return { w, h, cells };
}

// --- Commands --------------------------------------------------------------------

export function begin(state) {
  if (state.status !== 'briefing') return false;
  state.status = 'running';
  return true;
}

export function fold(state, axis, crease) {
  if (state.status !== 'running') return false;
  if (axis !== 'v' && axis !== 'h') return false;
  const next = applyFold(state.grid, axis, crease);
  if (next === null) return false;
  state.grid = next;
  state.foldsUsed += 1;
  state.totalFolds += 1;

  // Sparks: folding a spark into the shard's cell (or the shard onto a
  // spark) collects it.
  for (const row of state.grid.cells) {
    for (const stack of row) {
      if (stackHas(stack, 'S') && stackHas(stack, '*')) {
        let got = 0;
        for (let i = stack.length - 1; i >= 0; i -= 1) {
          if (stack[i] === '*') {
            stack.splice(i, 1);
            got += 1;
          }
        }
        state.sparks += got;
        state.banked += got * CFG.SCORE_SPARK;
      }
    }
  }

  // Win check: shard and gate share a cell.
  for (const row of state.grid.cells) {
    for (const stack of row) {
      if (stackHas(stack, 'S') && stackHas(stack, 'G')) {
        state.cleared += 1;
        state.banked +=
          CFG.SCORE_CLEAR + (state.budget - state.foldsUsed) * CFG.SCORE_FOLD_LEFT;
        state.status = 'cleared';
        return true;
      }
    }
  }

  // Out of folds with the shard still stranded: the space collapses.
  if (state.foldsUsed >= state.budget) {
    state.status = 'lost';
    state.failure = 'collapsed';
  }
  return true;
}

// Re-crease the current puzzle. Costs score, and the paper only survives
// MAX_RESETS of them across the whole run.
export function reset(state) {
  if (state.status !== 'running') return false;
  if (state.foldsUsed === 0) return false; // nothing to undo — refuse, no charge
  state.resets += 1;
  state.banked -= CFG.PENALTY_RESET;
  if (state.resets > CFG.MAX_RESETS) {
    state.status = 'lost';
    state.failure = 'torn';
    return true;
  }
  state.grid = parseLayout(PUZZLES[state.puzzle].layout);
  state.foldsUsed = 0;
  return true;
}

// Advance past a cleared puzzle. The last clear wins the run.
export function advance(state) {
  if (state.status !== 'cleared') return false;
  if (state.puzzle + 1 >= PUZZLES.length) {
    state.status = 'won';
    state.banked += CFG.SCORE_COMPLETE;
    return true;
  }
  state.puzzle += 1;
  state.grid = parseLayout(PUZZLES[state.puzzle].layout);
  state.foldsUsed = 0;
  state.budget = PUZZLES[state.puzzle].budget;
  state.status = 'running';
  return true;
}

export function applyCommand(state, command) {
  switch (command?.k) {
    case 'begin':
      return begin(state);
    case 'fold':
      return fold(state, command.axis, command.crease);
    case 'reset':
      return reset(state);
    case 'advance':
      return advance(state);
    default:
      return false;
  }
}

// --- The tick ---------------------------------------------------------------------
// Foldspace is turn-based; the tick only carries elapsed time for the HUD.

export function step(state) {
  if (state.status === 'won' || state.status === 'lost') return [];
  state.tick += 1;
  return [];
}

// --- Score -------------------------------------------------------------------------

export function terminalScore(state) {
  return Math.max(0, state.banked);
}

export function runSummary(state) {
  return {
    status: state.status,
    failure: state.failure,
    cleared: state.cleared,
    sparks: state.sparks,
    totalFolds: state.totalFolds,
    score: terminalScore(state),
  };
}

// Shared score contract: full clears rank ahead of collapsed runs, then
// score, then this game's stated tie-break — fewer total folds.
export function compareRuns(a, b) {
  const done = (run) => (run.status === 'won' ? 1 : 0);
  if (done(a) !== done(b)) return done(b) - done(a);
  if (a.score !== b.score) return b.score - a.score;
  return a.totalFolds - b.totalFolds;
}
