// The Three.js world renderer — a one-way SUBSCRIBER of the sim (D1.2).
//
// It holds zero sim state: every frame it is handed a read-only WorldView
// ({ snap, readBlock }) and it can be destroyed and rebuilt wholesale from
// that view alone (rebuildAll — the context-loss/seam path). It has no
// residency setter, no radius parameter, and no way to express an opinion
// about what simulates. Everything disposable is tracked in the registry;
// dispose() is one sweep (GDD §13.6).

import * as THREE from '../vendor/three.module.min.js';
import { RULESET } from '../sim/constants.js';
import { meshSection, SECTION_SIZE } from './mesher.js';
import { createRegistry } from './registry.js';

const TURN = 4096;
const DAY_SKY = new THREE.Color(0x86b8e0);
const NIGHT_SKY = new THREE.Color(0x0d0e1c);
const DUSK_RAMP_TICKS = 200;

export function createWorldRenderer({ canvas }) {
  const registry = createRegistry();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
  registry.track(renderer, (r) => {
    r.dispose();
    if (typeof r.forceContextLoss === 'function') r.forceContextLoss();
  });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 2));

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

  const sections = new Map(); // 'sx,sy,sz' -> { mesh, token }
  const enemies = new Map(); // entity id -> mesh

  function dropSection(key) {
    const entry = sections.get(key);
    if (entry === undefined) return;
    scene.remove(entry.mesh);
    registry.release(entry.token);
    sections.delete(key);
  }

  // Array-backed halo cache: the greedy sweep reads each cell up to six
  // times; the world's chunk-map lookup is the hot path, so pay it once.
  function cachedReader(readBlock, sx, sy, sz) {
    const S = SECTION_SIZE + 2;
    const bx = sx * SECTION_SIZE - 1;
    const by = sy * SECTION_SIZE - 1;
    const bz = sz * SECTION_SIZE - 1;
    const cache = new Array(S * S * S);
    return (x, y, z) => {
      const i = ((y - by) * S + (z - bz)) * S + (x - bx);
      let v = cache[i];
      if (v === undefined) {
        v = readBlock(x, y, z);
        cache[i] = v;
      }
      return v;
    };
  }

  function buildSection(view, sx, sy, sz) {
    const key = `${sx},${sy},${sz}`;
    dropSection(key);
    if (view.sectionUniform !== undefined && view.sectionUniform(sx, sy, sz) === 'air') return;
    const data = meshSection(cachedReader(view.readBlock, sx, sy, sz), sx, sy, sz);
    if (data.indices.length === 0) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    const token = registry.track(geometry, (g) => g.dispose());
    const mesh = new THREE.Mesh(geometry, terrainMaterial);
    scene.add(mesh);
    sections.set(key, { mesh, token });
  }

  // Full rebuild from a snapshot view alone — the seam's acceptance path.
  function rebuildAll(view) {
    for (const key of [...sections.keys()]) dropSection(key);
    const region = view.snap.region;
    const nx = region.blocksX / SECTION_SIZE;
    const ny = region.blocksY / SECTION_SIZE;
    const nz = region.blocksZ / SECTION_SIZE;
    for (let sx = 0; sx < nx; sx += 1) {
      for (let sy = 0; sy < ny; sy += 1) {
        for (let sz = 0; sz < nz; sz += 1) buildSection(view, sx, sy, sz);
      }
    }
    beacon.position.set(view.snap.cache.x + 0.5, 100, view.snap.cache.z + 0.5);
  }

  // Re-mesh the sections the sim marked dirty this tick.
  function applyDirty(view, dirtyKeys) {
    const region = view.snap.region;
    for (const key of dirtyKeys) {
      const [sx, sy, sz] = key.split(',').map(Number);
      if (sx < 0 || sy < 0 || sz < 0) continue;
      if (sx * SECTION_SIZE >= region.blocksX) continue;
      if (sy * SECTION_SIZE >= region.blocksY) continue;
      if (sz * SECTION_SIZE >= region.blocksZ) continue;
      buildSection(view, sx, sy, sz);
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
    sections.clear();
    enemies.clear();
    scene.clear();
    return registry.sweep();
  }

  return {
    rebuildAll,
    applyDirty,
    render,
    dispose,
    // Introspection for the leak harness — counts only, no capabilities.
    debug: { registrySize: () => registry.size(), sectionCount: () => sections.size },
  };
}
