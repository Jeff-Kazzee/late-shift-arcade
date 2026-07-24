// Pure geometry and selection rules for the cabinet's scalable game catalog.
// The canvas stays fixed at 640 × 480; callers render the returned rectangles.

export const CATALOG_COLUMNS = 2;
export const CATALOG_ROWS = 4;
export const CATALOG_PAGE_SIZE = CATALOG_COLUMNS * CATALOG_ROWS;
export const MIN_TOUCH_TARGET = 44;
export const CATALOG_PAGER = Object.freeze({
  previous: Object.freeze({ x: 492, y: 8, w: 44, h: 44 }),
  next: Object.freeze({ x: 552, y: 8, w: 44, h: 44 }),
});

export const CATALOG_LAYOUT = {
  width: 640,
  height: 480,
  left: 44,
  top: 72,
  columnGap: 16,
  rowGap: 12,
  cardHeight: 76,
};

CATALOG_LAYOUT.cardWidth =
  (CATALOG_LAYOUT.width - CATALOG_LAYOUT.left * 2 - CATALOG_LAYOUT.columnGap) /
  CATALOG_COLUMNS;

const validCount = (itemCount) => Math.max(0, Math.floor(Number(itemCount) || 0));

export function pageCount(itemCount) {
  return Math.max(1, Math.ceil(validCount(itemCount) / CATALOG_PAGE_SIZE));
}

export function clampPage(page, itemCount) {
  const last = pageCount(itemCount) - 1;
  return Math.min(last, Math.max(0, Math.floor(Number(page) || 0)));
}

export function pageForIndex(index, itemCount) {
  const count = validCount(itemCount);
  if (count === 0) return 0;
  const safeIndex = Math.min(count - 1, Math.max(0, Math.floor(Number(index) || 0)));
  return Math.floor(safeIndex / CATALOG_PAGE_SIZE);
}

export function shiftCatalogPage(page, delta, itemCount) {
  const pages = pageCount(itemCount);
  const current = clampPage(page, itemCount);
  return (current + Math.sign(delta) + pages) % pages;
}

export function firstIndexForPage(page, itemCount) {
  const count = validCount(itemCount);
  if (count === 0) return -1;
  return Math.min(count - 1, clampPage(page, count) * CATALOG_PAGE_SIZE);
}

export function catalogPageControlAt(itemCount, x, y) {
  if (pageCount(itemCount) <= 1) return null;
  for (const [name, rect] of Object.entries(CATALOG_PAGER)) {
    if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return name;
  }
  return null;
}

export function cardRect(slot) {
  const safeSlot = Math.floor(Number(slot));
  if (!Number.isFinite(safeSlot) || safeSlot < 0 || safeSlot >= CATALOG_PAGE_SIZE) return null;

  const column = safeSlot % CATALOG_COLUMNS;
  const row = Math.floor(safeSlot / CATALOG_COLUMNS);
  return {
    x: CATALOG_LAYOUT.left + column * (CATALOG_LAYOUT.cardWidth + CATALOG_LAYOUT.columnGap),
    y: CATALOG_LAYOUT.top + row * (CATALOG_LAYOUT.cardHeight + CATALOG_LAYOUT.rowGap),
    w: CATALOG_LAYOUT.cardWidth,
    h: CATALOG_LAYOUT.cardHeight,
  };
}

export function cardsForPage(itemCount, page) {
  const count = validCount(itemCount);
  const safePage = clampPage(page, count);
  const firstIndex = safePage * CATALOG_PAGE_SIZE;
  const cardCount = Math.max(0, Math.min(CATALOG_PAGE_SIZE, count - firstIndex));

  return Array.from({ length: cardCount }, (_, slot) => ({
    index: firstIndex + slot,
    slot,
    ...cardRect(slot),
  }));
}

export function slicePage(items, page) {
  const list = Array.isArray(items) ? items : [];
  const safePage = clampPage(page, list.length);
  const firstIndex = safePage * CATALOG_PAGE_SIZE;
  return list.slice(firstIndex, firstIndex + CATALOG_PAGE_SIZE);
}

export function hitTestPage(itemCount, page, x, y) {
  for (const card of cardsForPage(itemCount, page)) {
    if (x >= card.x && x <= card.x + card.w && y >= card.y && y <= card.y + card.h) {
      return card.index;
    }
  }
  return -1;
}

function normalizedIndex(index, count) {
  if (count === 0) return -1;
  const candidate = Math.floor(Number(index) || 0);
  return Math.min(count - 1, Math.max(0, candidate));
}

function columnIndices(column, count) {
  const indices = [];
  for (let index = column; index < count; index += CATALOG_COLUMNS) indices.push(index);
  return indices;
}

// Horizontal movement changes partner within a logical row. A final, lone
// card remains selected horizontally; vertical movement still cycles its column.
// Vertical movement cycles every card in the selected column, crossing pages.
export function moveCatalogSelection(index, direction, itemCount) {
  const count = validCount(itemCount);
  const current = normalizedIndex(index, count);
  if (current < 0) return -1;

  if (direction === 'left' || direction === 'right') {
    const partner = current % CATALOG_COLUMNS === 0 ? current + 1 : current - 1;
    return partner < count ? partner : current;
  }

  if (direction === 'up' || direction === 'down') {
    const column = current % CATALOG_COLUMNS;
    const indices = columnIndices(column, count);
    const position = indices.indexOf(current);
    const delta = direction === 'up' ? -1 : 1;
    return indices[(position + delta + indices.length) % indices.length];
  }

  return current;
}
