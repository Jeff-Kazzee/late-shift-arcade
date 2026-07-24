// Cartridge contract shared by the cabinet and its rack. Each entry combines
// one serializable manifest with the private capability to create a fresh game.

const REQUIRED_METHODS = ['init', 'update', 'draw', 'destroy'];
const MANIFEST_SCHEMA_VERSION = 1;
const RUNTIMES = new Set(['first-party-2d', 'first-party-3d', 'community-iframe']);
const TRUST_LEVELS = new Set(['trusted-first-party', 'untrusted-community']);
const RELEASE_STATUSES = new Set(['published', 'suspended']);
const validatedEntries = new WeakSet();
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
]);
const REQUIRED_MANIFEST_FIELDS = new Set(
  [...MANIFEST_FIELDS].filter((field) => field !== 'source'),
);
const ARTWORK_FIELDS = new Set(['accent']);

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
  nonEmptyText(artwork.accent, 'artwork.accent');
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
  if (!/^\d+\.\d+\.\d+$/.test(version)) fail('version must be immutable semantic version text');
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
  return manifest;
}

function immutableCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutableCopy));
  if (value !== null && typeof value === 'object') {
    return Object.freeze(
      Object.fromEntries(Object.entries(value).map(([key, item]) => [key, immutableCopy(item)])),
    );
  }
  return value;
}

// Define once, probe now, and create a fresh validated instance on every run.
export function defineCartridge(factory, metadata = {}) {
  if (typeof factory !== 'function') throw new TypeError('Cartridge factory must be a function');

  const probe = validateInstance(factory());
  const manifest = immutableCopy(validateManifest({
    ...metadata,
    slug: probe.id,
    title: probe.title,
    summary: probe.blurb,
  }));
  const create = () => {
    const instance = validateInstance(factory());
    if (instance.id !== manifest.slug) fail(`id must match manifest slug: ${manifest.slug}`);
    if (instance.title !== manifest.title) fail(`title must match manifest title: ${manifest.title}`);
    if (instance.blurb !== manifest.summary) fail('blurb must match manifest summary');
    return instance;
  };
  const entry = Object.freeze({
    id: manifest.slug,
    manifest,
    create,
  });
  validatedEntries.add(entry);
  return entry;
}

// Initialise as a transaction: a partially initialised cartridge is cleaned
// up before the original init error reaches the cabinet fault screen.
export function activateCartridge(entry, context) {
  if (entry === null || typeof entry !== 'object' || !validatedEntries.has(entry)) {
    throw new TypeError('Invalid cartridge entry: entry was not validated');
  }
  if (entry.manifest.releaseStatus !== 'published') {
    throw new TypeError(`Cartridge launch blocked: ${entry.manifest.releaseStatus}`);
  }
  if (entry.manifest.runtime !== 'first-party-2d') {
    throw new TypeError(`Cartridge launch blocked: runtime unavailable: ${entry.manifest.runtime}`);
  }

  const cartridge = entry.create();
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

export function validateCatalog(entries) {
  if (!Array.isArray(entries)) throw new TypeError('Cartridge catalog must be an array');
  const identities = new Set();
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object' || !validatedEntries.has(entry)) {
      throw new TypeError('Invalid cartridge entry: entry was not validated');
    }
    const identity = `${entry.manifest.slug}@${entry.manifest.version}`;
    if (identities.has(identity)) {
      throw new TypeError(`Duplicate cartridge version: ${identity}`);
    }
    identities.add(identity);
  }
  return entries;
}
