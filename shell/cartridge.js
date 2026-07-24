// Cartridge contract shared by the cabinet and its rack. A catalog entry is
// descriptive and immutable; `create()` is deliberately the only route to a
// playable, fresh cartridge instance.

const REQUIRED_METHODS = ['init', 'update', 'draw', 'destroy'];

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
  value.forEach((item, index) => nonEmptyText(item, `${name}[${index}]`));
  return value;
}

function validateDetails(details) {
  if (details === null || typeof details !== 'object' || Array.isArray(details)) {
    throw new TypeError('Cartridge details must be an object');
  }
  nonEmptyText(details.genre, 'genre');
  nonEmptyText(details.players, 'players');
  nonEmptyText(details.accent, 'accent');
  textList(details.controls, 'controls');
  textList(details.tags, 'tags', { allowEmpty: true });
  return details;
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
// Details are intentionally open-ended game metadata (genre, controls,
// players, accent, tags, and future display-only fields).
export function defineCartridge(factory, details = {}) {
  if (typeof factory !== 'function') throw new TypeError('Cartridge factory must be a function');

  const probe = validateInstance(factory());
  const metadata = immutableCopy(validateDetails(details));
  const create = () => validateInstance(factory());

  return Object.freeze({
    id: probe.id,
    title: probe.title,
    blurb: probe.blurb,
    details: metadata,
    create,
  });
}

// Initialise as a transaction: a partially initialised cartridge is cleaned
// up before the original init error reaches the cabinet fault screen.
export function activateCartridge(entry, context) {
  if (entry === null || typeof entry !== 'object' || typeof entry.create !== 'function') {
    throw new TypeError('Invalid cartridge entry: create must be a function');
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
  const ids = new Set();
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object') {
      throw new TypeError('Invalid cartridge entry: entry must be an object');
    }
    const id = nonEmptyText(entry.id, 'catalog id');
    if (typeof entry.create !== 'function') {
      throw new TypeError('Invalid cartridge entry: create must be a function');
    }
    if (ids.has(id)) throw new TypeError(`Duplicate cartridge id: ${id}`);
    ids.add(id);
  }
  return entries;
}
