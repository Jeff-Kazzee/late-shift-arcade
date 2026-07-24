import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG_COLUMNS,
  CATALOG_LAYOUT,
  CATALOG_PAGER,
  CATALOG_PAGE_SIZE,
  CATALOG_ROWS,
  MIN_TOUCH_TARGET,
  cardRect,
  catalogPageControlAt,
  cardsForPage,
  clampPage,
  hitTestPage,
  firstIndexForPage,
  moveCatalogSelection,
  pageCount,
  pageForIndex,
  shiftCatalogPage,
  slicePage,
} from '../shell/catalog-layout.js';

test('catalog geometry is an 8-card, generous-touch-target grid', () => {
  assert.equal(CATALOG_COLUMNS, 2);
  assert.equal(CATALOG_ROWS, 4);
  assert.equal(CATALOG_PAGE_SIZE, 8);
  assert.ok(CATALOG_LAYOUT.cardWidth >= MIN_TOUCH_TARGET);
  assert.ok(CATALOG_LAYOUT.cardHeight >= MIN_TOUCH_TARGET);

  assert.deepEqual(cardRect(0), {
    x: 44,
    y: 72,
    w: 268,
    h: 76,
  });
  assert.deepEqual(cardRect(7), {
    x: 328,
    y: 336,
    w: 268,
    h: 76,
  });
  assert.equal(cardRect(8), null);
});

test('paging slices items and clamps page requests', () => {
  const items = Array.from({ length: 17 }, (_, index) => `game-${index}`);
  assert.equal(pageCount(0), 1);
  assert.equal(pageCount(items.length), 3);
  assert.equal(clampPage(-2, items.length), 0);
  assert.equal(clampPage(99, items.length), 2);
  assert.deepEqual(slicePage(items, 1), items.slice(8, 16));
  assert.deepEqual(slicePage(items, 2), ['game-16']);
  assert.equal(pageForIndex(16, items.length), 2);
  assert.equal(pageForIndex(99, items.length), 2);
});

test('partial pages expose only real cards and hit test their bounds', () => {
  const cards = cardsForPage(10, 1);
  assert.deepEqual(cards.map((card) => card.index), [8, 9]);
  assert.equal(hitTestPage(10, 1, cards[0].x + 1, cards[0].y + 1), 8);
  assert.equal(hitTestPage(10, 1, cards[1].x + cards[1].w, cards[1].y + cards[1].h), 9);
  assert.equal(hitTestPage(10, 1, cards[1].x + cards[1].w + 1, cards[1].y), -1);
  assert.equal(hitTestPage(0, 0, 80, 90), -1);
});

test('directional selection moves in logical columns and wraps across pages', () => {
  assert.equal(moveCatalogSelection(0, 'right', 10), 1);
  assert.equal(moveCatalogSelection(1, 'left', 10), 0);
  assert.equal(moveCatalogSelection(6, 'down', 10), 8);
  assert.equal(moveCatalogSelection(8, 'down', 10), 0);
  assert.equal(moveCatalogSelection(1, 'up', 10), 9);
  assert.equal(moveCatalogSelection(9, 'down', 10), 1);
});

test('a lone final card remains stable horizontally and empty catalogs have no selection', () => {
  assert.equal(moveCatalogSelection(8, 'left', 9), 8);
  assert.equal(moveCatalogSelection(8, 'right', 9), 8);
  assert.equal(moveCatalogSelection(123, 'unknown', 9), 8);
  assert.equal(moveCatalogSelection(0, 'down', 0), -1);
});

test('touch pager exposes 44px controls and reaches later pages', () => {
  assert.ok(CATALOG_PAGER.previous.w >= MIN_TOUCH_TARGET);
  assert.ok(CATALOG_PAGER.next.h >= MIN_TOUCH_TARGET);
  assert.equal(catalogPageControlAt(8, CATALOG_PAGER.next.x, CATALOG_PAGER.next.y), null);
  assert.equal(catalogPageControlAt(9, CATALOG_PAGER.next.x + 4, CATALOG_PAGER.next.y + 4), 'next');
  assert.equal(catalogPageControlAt(9, CATALOG_PAGER.previous.x + 4, CATALOG_PAGER.previous.y + 4), 'previous');
  assert.equal(shiftCatalogPage(0, 1, 17), 1);
  assert.equal(shiftCatalogPage(0, -1, 17), 2);
  assert.equal(firstIndexForPage(1, 9), 8);
});
