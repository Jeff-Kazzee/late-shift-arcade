// Cartridge contract shared by the cabinet and its rack.
//
// The contract has two halves, and keeping them apart is the whole point:
//
//   catalog entry   manifest (data) + the capability to FETCH the game later
//   loaded cartridge   the fetched factory + the capability to CREATE a game
//
// The cabinet builds its catalog from entries, so it can render a card for
// every game in the rack without downloading — let alone running — a single
// game. Code arrives only when a player launches, and only after the launch
// gate has cleared the manifest that declared it.

import { palette } from './palette.js';

const REQUIRED_METHODS = ['init', 'update', 'draw', 'destroy'];
const MANIFEST_SCHEMA_VERSION = 1;
const RUNTIMES = new Set(['first-party-2d', 'first-party-3d', 'community-iframe']);
const TRUST_LEVELS = new Set(['trusted-first-party', 'untrusted-community']);
const RELEASE_STATUSES = new Set(['published', 'suspended']);
// Two separate marks, so the halves of the contract cannot be swapped: an
// entry that has not been loaded cannot be handed to activateCartridge, and a
// loaded cartridge cannot be smuggled into a catalog in place of its entry.
const catalogEntries = new WeakSet();
const loadedCartridges = new WeakSet();
const MANIFEST_FIELDS = new Set([
  'schemaVersion',
  'slug',
  'version',
  'title',
  'summary',
  'creator',
  'runtime',
  'trustLevel',
  'modes',
  'goal',
  'scoreLabel',
  'controls',
  'artwork',
  'releaseStatus',
  'contentNotes',
  'madeWith',
  'source',
  'genre',
  'players',
  'tags',
  'orientation',
]);
const OPTIONAL_MANIFEST_FIELDS = new Set(['source', 'orientation']);
const REQUIRED_MANIFEST_FIELDS = new Set(
  [...MANIFEST_FIELDS].filter((field) => !OPTIONAL_MANIFEST_FIELDS.has(field)),
);
// Which way the phone has to turn for GAMEPLAY — never for browsing. Absent
// means 'landscape': the shared cabinet is a 640×480 landscape screen, so
// landscape is the property a game inherits unless it declares otherwise.
const ORIENTATIONS = new Set(['landscape', 'any']);
const ARTWORK_FIELDS = new Set(['accent']);
// Accent is a shell palette key, so it is a contract, not free text. Validating
// it against the real key set stops a typo shipping as a silent fallback and
// stops `palette[accent]` reaching inherited members like `toString`.
const ACCENTS = new Set(Object.keys(palette));
// Only this runtime is executed in-process. Anything else must never have its
// factory invoked on the platform origin — see defineCartridge.
const IN_PROCESS_RUNTIME = 'first-party-2d';

function fail(message) {
  throw new TypeError(`Invalid cartridge: ${message}`);
}

function nonEmptyText(value, name) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${name} must be a non-empty string`);
  return value;
}

function validateInstance(instance) {
  if (instance === null || typeof instance !== 'object') fail('factory must return an object');
  nonEmptyText(instance.id, 'id');
  nonEmptyText(instance.title, 'title');
  nonEmptyText(instance.blurb, 'blurb');
  for (const method of REQUIRED_METHODS) {
    if (typeof instance[method] !== 'function') fail(`${method} must be a function`);
  }
  return instance;
}

function textList(value, name, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    fail(`${name} must be ${allowEmpty ? 'an array' : 'a non-empty array'}`);
  }
  for (const field of Reflect.ownKeys(value)) {
    if (field === 'length') continue;
    if (typeof field !== 'string' || !/^(0|[1-9]\d*)$/.test(field)) {
      fail(`${name} has unsupported field: ${String(field)}`);
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      fail(`${name}[${index}] must be a data property`);
    }
    nonEmptyText(descriptor.value, `${name}[${index}]`);
  }
  return value;
}

function oneOf(value, name, allowed) {
  nonEmptyText(value, name);
  if (!allowed.has(value)) fail(`${name} is unsupported: ${value}`);
  return value;
}

function validateRecord(value, name, allowedFields, requiredFields = new Set()) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(`${name} must be a plain object`);
  }
  for (const field of Reflect.ownKeys(value)) {
    if (typeof field !== 'string' || !allowedFields.has(field)) {
      fail(`${name} has unsupported field: ${String(field)}`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      fail(`${name}.${field} must be a data property`);
    }
  }
  for (const field of requiredFields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      fail(`${name}.${field} must be a data property`);
    }
  }
  return value;
}

function validateArtwork(artwork) {
  validateRecord(artwork, 'artwork', ARTWORK_FIELDS, ARTWORK_FIELDS);
  oneOf(artwork.accent, 'artwork.accent', ACCENTS);
  return artwork;
}

function validateSource(source) {
  if (source === undefined) return;
  nonEmptyText(source, 'source');
  let url;
  try {
    url = new URL(source);
  } catch {
    fail('source must be an absolute HTTP(S) URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    fail('source must be an absolute HTTP(S) URL');
  }
}

export function validateManifest(manifest) {
  validateRecord(manifest, 'manifest', MANIFEST_FIELDS, REQUIRED_MANIFEST_FIELDS);
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    fail(`schemaVersion must be ${MANIFEST_SCHEMA_VERSION}`);
  }
  const slug = nonEmptyText(manifest.slug, 'slug');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    fail('slug must contain lowercase letters, numbers, and single hyphens');
  }
  const version = nonEmptyText(manifest.version, 'version');
  // Leading zeros would let 1.0.0 and 01.0.0 name the same release while
  // reading as distinct identities to duplicate detection.
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    fail('version must be MAJOR.MINOR.PATCH without leading zeros');
  }
  nonEmptyText(manifest.title, 'title');
  nonEmptyText(manifest.summary, 'summary');
  nonEmptyText(manifest.creator, 'creator');
  oneOf(manifest.runtime, 'runtime', RUNTIMES);
  oneOf(manifest.trustLevel, 'trustLevel', TRUST_LEVELS);
  if (
    (manifest.runtime === 'community-iframe') !==
    (manifest.trustLevel === 'untrusted-community')
  ) {
    fail('runtime and trustLevel are incompatible');
  }
  textList(manifest.modes, 'modes');
  nonEmptyText(manifest.goal, 'goal');
  nonEmptyText(manifest.scoreLabel, 'scoreLabel');
  textList(manifest.controls, 'controls');
  validateArtwork(manifest.artwork);
  oneOf(manifest.releaseStatus, 'releaseStatus', RELEASE_STATUSES);
  textList(manifest.contentNotes, 'contentNotes', { allowEmpty: true });
  nonEmptyText(manifest.madeWith, 'madeWith');
  validateSource(Object.hasOwn(manifest, 'source') ? manifest.source : undefined);
  nonEmptyText(manifest.genre, 'genre');
  nonEmptyText(manifest.players, 'players');
  textList(manifest.tags, 'tags', { allowEmpty: true });
  if (Object.hasOwn(manifest, 'orientation')) {
    oneOf(manifest.orientation, 'orientation', ORIENTATIONS);
  }
  return manifest;
}

// The orientation a manifest demands of GAMEPLAY (browsing never demands one).
// Reads through the same default the validator documents, so pages and the
// player cannot disagree about what an absent field means.
export function requiredOrientation(manifest) {
  return manifest.orientation ?? 'landscape';
}

// A cartridge instance must present the identity its manifest declares, at
// define time and on every later launch. This is what keeps catalog metadata,
// score namespaces, and detail routes describing the same game.
function assertDeclaredIdentity(instance, manifest) {
  if (instance.id !== manifest.slug) fail(`id must match manifest slug: ${manifest.slug}`);
  if (instance.title !== manifest.title) fail(`title must match manifest title: ${manifest.title}`);
  if (instance.blurb !== manifest.summary) fail('blurb must match manifest summary');
  return instance;
}

function immutableCopy(value) {
  // Array.from, not map: map honours Symbol.species, so an exotic array could
  // validate as an array and then be stored as a plain object.
  if (Array.isArray(value)) return Object.freeze(Array.from(value, immutableCopy));
  if (value !== null && typeof value === 'object') {
    return Object.freeze(
      Object.fromEntries(Object.entries(value).map(([key, item]) => [key, immutableCopy(item)])),
    );
  }
  return value;
}

// Turn a fetched module into the launchable half of the contract.
//
// The declared manifest is authoritative and the module must MATCH it. An
// earlier version took slug/title/summary from the executed instance, so
// declared metadata was silently replaced by whatever the code returned —
// meaning a reviewer could approve one identity and the catalog ship another.
// The first instance is the probe: a module that does not present its declared
// identity is refused here, on the loading screen, rather than mid-launch.
function loadCartridge(module, manifest) {
  const factory = module?.default;
  if (typeof factory !== 'function') fail('module must default-export a cartridge factory');

  assertDeclaredIdentity(validateInstance(factory()), manifest);

  const create = () => assertDeclaredIdentity(validateInstance(factory()), manifest);
  const loaded = Object.freeze({ id: manifest.slug, manifest, create });
  loadedCartridges.add(loaded);
  return loaded;
}

// Declare a game without containing one. The manifest is validated now; the
// loader is not called until load(), and load() asks the launch gate first.
//
// Two ordering rules carry the trust model, and both are load-bearing rather
// than stylistic:
//
// 1. The gate runs BEFORE the loader. Evaluating a module *is* executing it,
//    so for a lazily fetched cartridge the import is the launch. Anything the
//    gate would refuse — suspended, or a runtime this origin may not host — is
//    never even downloaded. A gate that fires after the code already ran is
//    not a gate.
// 2. Nothing about a game runs at catalog-build time at all. A rack of thirty
//    entries costs thirty manifests and zero game modules.
export function defineCatalogEntry(manifest, loader) {
  if (typeof loader !== 'function') throw new TypeError('Cartridge loader must be a function');

  // Validate the caller's object to reject bad input loudly, then validate the
  // frozen copy that is actually stored. A Proxy or getter that answers
  // differently on a second read fails the second pass instead of validating
  // as one value and being served as another.
  validateManifest(manifest);
  const declared = immutableCopy(manifest);
  validateManifest(declared);

  let pending = null;
  let attempts = 0;

  const load = () => {
    const blocked = launchBlockReason(declared);
    if (blocked) {
      return Promise.reject(new TypeError(`Cartridge launch blocked: ${blocked}`));
    }
    // Memoised, so two taps during the loading screen share one fetch and a
    // second launch of the same game is free. A failure clears the slot: a
    // retry has to be a real second attempt, not a replay of the rejection.
    if (pending === null) {
      const attempt = attempts;
      attempts += 1;
      // The loader is called synchronously — load() starts the fetch, it does
      // not merely promise to. A loader that throws outright still becomes a
      // rejection rather than escaping into the caller's frame.
      const fetching = (async () => loadCartridge(await loader(attempt), declared))();
      pending = fetching.catch((error) => {
        pending = null;
        throw error;
      });
    }
    return pending;
  };

  const entry = Object.freeze({ id: declared.slug, manifest: declared, load });
  catalogEntries.add(entry);
  return entry;
}

// The standard loader: fetch a cartridge module relative to the file that
// declared it, so one registry line works from `/` and from a project subpath
// like `/late-shift-arcade/` without a build step or an import map.
//
// The attempt counter is not decoration. A dynamic import that fails is
// remembered by the page's module map, so retrying the same specifier can
// re-reject instantly without touching the network. A retry therefore has to
// ask for a URL this page has not already given up on.
export function lazyModule(specifier, baseUrl) {
  const href = new URL(specifier, baseUrl).href;
  return (attempt = 0) => import(attempt === 0 ? href : `${href}?retry=${attempt}`);
}

// The single source of truth for "may this entry launch?". Returns null when
// it may, or a short human-readable reason when it may not.
//
// Both the launch gate and the UI that offers the launch must consume this.
// When the two were written separately they had already diverged: the detail
// screen checked only release status, so a published entry with a runtime the
// cabinet cannot host advertised itself as playable and then threw on tap,
// dropping the player on a generic fault screen instead of an explanation.
export function launchBlockReason(manifest) {
  if (manifest.releaseStatus !== 'published') return manifest.releaseStatus;
  if (manifest.runtime !== IN_PROCESS_RUNTIME) return `runtime unavailable: ${manifest.runtime}`;
  return null;
}

// Initialise as a transaction: a partially initialised cartridge is cleaned
// up before the original init error reaches the cabinet fault screen.
//
// Takes a LOADED cartridge, not a catalog entry, and stays synchronous. The
// cabinet restarts a run by activating again mid-session; that path must not
// have to await anything. The gate is re-asked here anyway — the module was
// cleared to load, and is cleared again to run.
export function activateCartridge(loaded, context) {
  if (loaded === null || typeof loaded !== 'object' || !loadedCartridges.has(loaded)) {
    throw new TypeError('Invalid cartridge entry: entry was not validated');
  }
  const blocked = launchBlockReason(loaded.manifest);
  if (blocked) throw new TypeError(`Cartridge launch blocked: ${blocked}`);

  const cartridge = loaded.create();
  try {
    cartridge.init(context);
  } catch (error) {
    try {
      cartridge.destroy();
    } catch {
      // The init failure is the actionable error; cleanup is best-effort.
    }
    throw error;
  }
  return cartridge;
}

// Returns a frozen snapshot rather than the caller's array. Handing back the
// same mutable reference let an unvalidated entry be appended after validation
// and still be found by catalog lookups — it could not be launched, but it
// could be rendered, which is enough to put unreviewed text on a detail page.
export function validateCatalog(entries) {
  if (!Array.isArray(entries)) throw new TypeError('Cartridge catalog must be an array');
  const catalog = Object.freeze(Array.from(entries));
  const identities = new Set();
  for (const entry of catalog) {
    if (entry === null || typeof entry !== 'object' || !catalogEntries.has(entry)) {
      throw new TypeError('Invalid cartridge entry: entry was not validated');
    }
    const identity = `${entry.manifest.slug}@${entry.manifest.version}`;
    if (identities.has(identity)) {
      throw new TypeError(`Duplicate cartridge version: ${identity}`);
    }
    identities.add(identity);
  }
  return catalog;
}
