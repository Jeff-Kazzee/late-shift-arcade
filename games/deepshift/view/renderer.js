// The Three.js world renderer — a one-way SUBSCRIBER of the sim (D1.2).
//
// It holds zero sim state: every frame it is handed a read-only WorldView
// ({ snap, readBlock, sectionUniform? }) and it can be destroyed and rebuilt
// wholesale from that view alone (rebuildAll — the context-loss/seam path).
// It has no residency setter, no radius parameter on any sim-facing seam,
// and no way to express an opinion about what simulates. Everything
// disposable is tracked in the registry; dispose() is one sweep (GDD §13.6).
//
// DS-1b Gate 2 shape:
//   - RenderSet streaming: chunk columns load in spiral order to
//     RENDER_RADIUS (desktop 8) around the camera anchor and unload beyond
//     radius + 2 (render-set.js). Device-local presentation only —
//     authoritative activation stays SIM_RADIUS 3; frozen-but-visible
//     chunks are the normal case and render like any other.
//   - Meshing is asynchronous behind the F-06 snapshot contract: 16^3
//     sections are captured as immutable snapshots (mesh-snapshot.js) and
//     meshed by the pool (mesh-pool.js) on worker transports; results are
//     revision-checked and drained under a per-frame budget.
//   - Draw batching: the 32^3 chunk is the draw unit — up to 8 section
//     meshes merge into one geometry per chunk (GDD §13.3 "one draw per
//     chunk per bucket"), frustum-culled by three per chunk mesh.

import * as THREE from '../vendor/three.module.min.js';
import { RULESET } from '../sim/constants.js';
import { SECTION_SIZE } from './mesher.js';
import { snapshotSection } from './mesh-snapshot.js';
import { createMeshPool } from './mesh-pool.js';
import { defaultTransports } from './mesh-transports.js';
import { RENDER_RADIUS, columnsAround, shouldUnload } from './render-set.js';
import { createRegistry } from './registry.js';

const TURN = 4096;
const DAY_SKY = new THREE.Color(0x86b8e0);
const NIGHT_SKY = new THREE.Color(0x0d0e1c);
const DUSK_RAMP_TICKS = 200;
const CHUNK = RULESET.chunkSize;
const SECTIONS_PER_AXIS = CHUNK / SECTION_SIZE; // 2
// Per-frame budgets: streaming snapshot time and result-apply count. These
// pace presentation work only — the sim never waits on any of them.
const STREAM_BUDGET_MS = 3;
const STREAM_MAX_COLUMNS = 8;
const APPLY_MAX_RESULTS = 64;

function boundsOf(region) {
  return {
    chunksX: region.blocksX / CHUNK,
    chunksY: region.blocksY / CHUNK,
    chunksZ: region.blocksZ / CHUNK,
  };
}

export function createWorldRenderer({ canvas, meshTransports }) {
  const registry = createRegistry();
  const now = () => (globalThis.performance === undefined ? 0 : globalThis.performance.now());

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
  registry.track(renderer, (r) => {
    r.dispose();
    if (typeof r.forceContextLoss === 'function') r.forceContextLoss();
  });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 2));

  const pool = createMeshPool({ transports: meshTransports ?? defaultTransports() });
  registry.track(pool, (p) => p.dispose()); // eject = sweep + worker terminate

  const scene = new THREE.Scene();
  scene.background = DAY_SKY.clone();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 400);
  camera.rotation.order = 'YXZ';

  const terrainMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  registry.track(terrainMaterial, (m) => m.dispose());

  const hollowedGeometry = new THREE.BoxGeometry(0.6, 1.8125, 0.6);
  registry.track(hollowedGeometry, (g) => g.dispose());
  const hollowedMaterial = new THREE.MeshBasicMaterial({ color: 0x8c2f4a });
  registry.track(hollowedMaterial, (m) => m.dispose());

  // A tall amber beacon over the clan cache — the bank is always findable.
  const beaconGeometry = new THREE.BoxGeometry(0.25, 200, 0.25);
  registry.track(beaconGeometry, (g) => g.dispose());
  const beaconMaterial = new THREE.MeshBasicMaterial({ color: 0xe6c17e, transparent: true, opacity: 0.4 });
  registry.track(beaconMaterial, (m) => m.dispose());
  const beacon = new THREE.Mesh(beaconGeometry, beaconMaterial);
  beacon.visible = false;
  scene.add(beacon);

  // Mining-target highlight.
  const highlightGeometry = new THREE.BoxGeometry(1.002, 1.002, 1.002);
  registry.track(highlightGeometry, (g) => g.dispose());
  const highlightEdges = new THREE.EdgesGeometry(highlightGeometry);
  registry.track(highlightEdges, (g) => g.dispose());
  const highlightMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
  registry.track(highlightMaterial, (m) => m.dispose());
  const highlight = new THREE.LineSegments(highlightEdges, highlightMaterial);
  highlight.visible = false;
  scene.add(highlight);

  // --- render-set state (all derived, all rebuildable from the view) ---
  const revisions = new Map(); // section key -> latest revision submitted
  const sectionData = new Map(); // section key -> applied mesh result (non-empty)
  const chunkMeshes = new Map(); // chunk key -> { mesh, token }
  const streamed = new Set(); // chunk keys whose sections have been submitted
  const dirtyChunks = new Set(); // chunk keys needing geometry re-merge
  const enemies = new Map(); // entity id -> mesh
  let loadQueue = []; // [cx, cz] columns awaiting streaming, spiral order
  let anchor = null; // { cx, cz } camera chunk column
  let lastBounds = null;

  const sectionKeysOf = (cx, cy, cz) => {
    const keys = [];
    for (let sy = cy * SECTIONS_PER_AXIS; sy < (cy + 1) * SECTIONS_PER_AXIS; sy += 1) {
      for (let sz = cz * SECTIONS_PER_AXIS; sz < (cz + 1) * SECTIONS_PER_AXIS; sz += 1) {
        for (let sx = cx * SECTIONS_PER_AXIS; sx < (cx + 1) * SECTIONS_PER_AXIS; sx += 1) {
          keys.push(`${sx},${sy},${sz}`);
        }
      }
    }
    return keys;
  };

  const chunkKeyOfSection = (sx, sy, sz) => (
    `${Math.floor(sx / SECTIONS_PER_AXIS)},${Math.floor(sy / SECTIONS_PER_AXIS)},${Math.floor(sz / SECTIONS_PER_AXIS)}`
  );

  function dropChunkMesh(chunkKey) {
    const entry = chunkMeshes.get(chunkKey);
    if (entry === undefined) return;
    scene.remove(entry.mesh);
    registry.release(entry.token);
    chunkMeshes.delete(chunkKey);
  }

  function unloadChunk(chunkKey) {
    const [cx, cy, cz] = chunkKey.split(',').map(Number);
    for (const key of sectionKeysOf(cx, cy, cz)) {
      sectionData.delete(key);
      revisions.delete(key);
      pool.forget(key); // any in-flight result now arrives stale
    }
    dropChunkMesh(chunkKey);
    streamed.delete(chunkKey);
    dirtyChunks.delete(chunkKey);
  }

  function submitSection(view, sx, sy, sz, revision) {
    const uniform = view.sectionUniform === undefined ? null : view.sectionUniform(sx, sy, sz);
    const snapshot = snapshotSection(
      view.readBlock, sx, sy, sz, revision,
      uniform !== null && uniform !== 'air' ? uniform : null,
    );
    pool.submit(snapshot);
  }

  function streamChunk(view, cx, cy, cz) {
    const chunkKey = `${cx},${cy},${cz}`;
    if (streamed.has(chunkKey)) return;
    streamed.add(chunkKey);
    for (const key of sectionKeysOf(cx, cy, cz)) {
      const [sx, sy, sz] = key.split(',').map(Number);
      // A uniform-air section can never own a face (face ownership sits
      // with the solid cell); skip the job outright.
      if (view.sectionUniform !== undefined && view.sectionUniform(sx, sy, sz) === 'air') continue;
      const revision = (revisions.get(key) ?? 0) + 1;
      revisions.set(key, revision);
      submitSection(view, sx, sy, sz, revision);
    }
  }

  function applyResult(result) {
    if (result.indices.length === 0) sectionData.delete(result.key);
    else sectionData.set(result.key, result);
    dirtyChunks.add(chunkKeyOfSection(result.sx, result.sy, result.sz));
  }

  // Merge a chunk's applied section meshes into one geometry: the draw unit.
  function rebuildChunkGeometry(chunkKey) {
    const [cx, cy, cz] = chunkKey.split(',').map(Number);
    const parts = [];
    for (const key of sectionKeysOf(cx, cy, cz)) {
      const data = sectionData.get(key);
      if (data !== undefined) parts.push(data);
    }
    if (parts.length === 0) {
      dropChunkMesh(chunkKey);
      return;
    }
    let vertexCount = 0;
    let indexCount = 0;
    for (const part of parts) {
      vertexCount += part.positions.length / 3;
      indexCount += part.indices.length;
    }
    const positions = new Float32Array(vertexCount * 3);
    const colors = new Float32Array(vertexCount * 3);
    const indices = new Uint32Array(indexCount);
    let vertexBase = 0;
    let indexBase = 0;
    for (const part of parts) {
      positions.set(part.positions, vertexBase * 3);
      colors.set(part.colors, vertexBase * 3);
      for (let i = 0; i < part.indices.length; i += 1) {
        indices[indexBase + i] = part.indices[i] + vertexBase;
      }
      vertexBase += part.positions.length / 3;
      indexBase += part.indices.length;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    const token = registry.track(geometry, (g) => g.dispose());
    const existing = chunkMeshes.get(chunkKey);
    if (existing === undefined) {
      const mesh = new THREE.Mesh(geometry, terrainMaterial);
      scene.add(mesh);
      chunkMeshes.set(chunkKey, { mesh, token });
    } else {
      registry.release(existing.token);
      existing.mesh.geometry = geometry;
      existing.token = token;
    }
  }

  // Advance streaming, meshing, and geometry merging under frame budgets.
  function pumpStreaming(view) {
    const bounds = boundsOf(view.snap.region);
    lastBounds = bounds;
    const started = now();
    let columns = 0;
    while (loadQueue.length > 0 && columns < STREAM_MAX_COLUMNS && now() - started < STREAM_BUDGET_MS) {
      const [cx, cz] = loadQueue.shift();
      for (let cy = 0; cy < bounds.chunksY; cy += 1) streamChunk(view, cx, cy, cz);
      columns += 1;
    }
    pool.drain(applyResult, { maxResults: APPLY_MAX_RESULTS });
    for (const chunkKey of dirtyChunks) rebuildChunkGeometry(chunkKey);
    dirtyChunks.clear();
  }

  function retargetAnchor(view, cx, cz) {
    anchor = { cx, cz };
    const bounds = boundsOf(view.snap.region);
    const columns = columnsAround(cx, cz, RENDER_RADIUS, bounds);
    loadQueue = columns.filter(([qx, qz]) => {
      for (let cy = 0; cy < bounds.chunksY; cy += 1) {
        if (!streamed.has(`${qx},${cy},${qz}`)) return true;
      }
      return false;
    });
    for (const chunkKey of [...streamed]) {
      const [ux, , uz] = chunkKey.split(',').map(Number);
      if (shouldUnload(ux, uz, cx, cz)) unloadChunk(chunkKey);
    }
  }

  // Full reset from a snapshot view alone — the seam's acceptance path.
  // Chunks stream back in around the camera on the following frames.
  function rebuildAll(view) {
    for (const chunkKey of [...chunkMeshes.keys()]) dropChunkMesh(chunkKey);
    for (const key of revisions.keys()) pool.forget(key);
    revisions.clear();
    sectionData.clear();
    streamed.clear();
    dirtyChunks.clear();
    loadQueue = [];
    anchor = null;
    const cache = view.snap.cache;
    if (cache !== undefined) {
      beacon.position.set(cache.x + 0.5, 100, cache.z + 0.5);
      beacon.visible = true;
    } else {
      beacon.visible = false;
    }
  }

  // Re-mesh the sections the sim marked dirty this tick: bump the revision
  // (staling any in-flight job) and submit a fresh snapshot.
  function applyDirty(view, dirtyKeys) {
    const region = view.snap.region;
    for (const key of dirtyKeys) {
      const [sx, sy, sz] = key.split(',').map(Number);
      if (sx < 0 || sy < 0 || sz < 0) continue;
      if (sx * SECTION_SIZE >= region.blocksX) continue;
      if (sy * SECTION_SIZE >= region.blocksY) continue;
      if (sz * SECTION_SIZE >= region.blocksZ) continue;
      if (!streamed.has(chunkKeyOfSection(sx, sy, sz))) continue; // not resident: streams fresh later
      const revision = (revisions.get(key) ?? 0) + 1;
      revisions.set(key, revision);
      submitSection(view, sx, sy, sz, revision);
    }
  }

  function syncEnemies(snap) {
    const seen = new Set();
    for (const entity of snap.entities) {
      seen.add(entity.id);
      let mesh = enemies.get(entity.id);
      if (mesh === undefined) {
        mesh = new THREE.Mesh(hollowedGeometry, hollowedMaterial);
        scene.add(mesh);
        enemies.set(entity.id, mesh);
      }
      mesh.position.set(entity.x / 65536, entity.y / 65536 + 0.90625, entity.z / 65536);
    }
    for (const [id, mesh] of enemies) {
      if (!seen.has(id)) {
        scene.remove(mesh);
        enemies.delete(id);
      }
    }
  }

  function skyBlend(tick) {
    // 0 = day, 1 = night, ramped across the dusk boundary.
    const dusk = RULESET.dayTicks;
    const t = (tick - (dusk - DUSK_RAMP_TICKS / 2)) / DUSK_RAMP_TICKS;
    return Math.max(0, Math.min(1, t));
  }

  // eye: { x, y, z (float blocks), yaw, pitch (4096-per-turn units) }.
  // target: [bx, by, bz] highlighted cell or null.
  function render(view, eye, target) {
    const snap = view.snap;
    const width = canvas.clientWidth || canvas.width;
    const height = canvas.clientHeight || canvas.height;
    const size = new THREE.Vector2();
    renderer.getSize(size);
    if (size.x !== width || size.y !== height) {
      renderer.setSize(width, height, false);
    }
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    camera.position.set(eye.x, eye.y, eye.z);
    camera.rotation.y = (-eye.yaw * Math.PI * 2) / TURN;
    camera.rotation.x = (eye.pitch * Math.PI * 2) / TURN;

    const anchorCx = Math.floor(eye.x / CHUNK);
    const anchorCz = Math.floor(eye.z / CHUNK);
    if (anchor === null || anchor.cx !== anchorCx || anchor.cz !== anchorCz) {
      retargetAnchor(view, anchorCx, anchorCz);
    }
    pumpStreaming(view);

    const blend = skyBlend(snap.tick);
    scene.background.copy(DAY_SKY).lerp(NIGHT_SKY, blend);
    terrainMaterial.color.setScalar(1 - 0.55 * blend);

    if (target === null || target === undefined) {
      highlight.visible = false;
    } else {
      highlight.visible = true;
      highlight.position.set(target[0] + 0.5, target[1] + 0.5, target[2] + 0.5);
    }

    syncEnemies(snap);
    renderer.render(scene, camera);
  }

  function dispose() {
    revisions.clear();
    sectionData.clear();
    chunkMeshes.clear();
    streamed.clear();
    dirtyChunks.clear();
    loadQueue = [];
    enemies.clear();
    scene.clear();
    return registry.sweep(); // includes pool disposal (worker terminate)
  }

  // True when every chunk within `radius` columns of the anchor has been
  // streamed and no section of it still has work in the pool — the
  // time-to-first-playable predicate for the stress harness.
  function coreComplete(radius) {
    if (anchor === null || lastBounds === null) return false;
    for (const [cx, cz] of columnsAround(anchor.cx, anchor.cz, radius, lastBounds)) {
      for (let cy = 0; cy < lastBounds.chunksY; cy += 1) {
        if (!streamed.has(`${cx},${cy},${cz}`)) return false;
        for (const key of sectionKeysOf(cx, cy, cz)) {
          if (pool.busy(key)) return false;
        }
      }
    }
    return true;
  }

  return {
    rebuildAll,
    applyDirty,
    render,
    dispose,
    // Introspection for the leak/stress harnesses — counts only, no capabilities.
    debug: {
      registrySize: () => registry.size(),
      sectionCount: () => sectionData.size,
      chunkMeshCount: () => chunkMeshes.size,
      streamedChunkCount: () => streamed.size,
      loadQueueLength: () => loadQueue.length,
      poolStats: () => pool.stats(),
      renderInfo: () => ({
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
      }),
      coreComplete,
    },
  };
}
