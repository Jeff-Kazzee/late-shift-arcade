// Home page enhancement. The rack is real HTML that works with no JavaScript
// at all; this module adds what only a running page can add — title search,
// facet filters, local high-score badges, and the legacy share-link redirect.
//
// Deliberately imports no manifests and no game code: everything it needs is
// already in the DOM the generator wrote. The home page costs zero game
// modules and zero manifest fetches (F-008 and then some).

import { loadScores, topScore } from './scores.js';

// --- Legacy share links ------------------------------------------------------
// F-002 shipped `?game=<slug>&version=<version>` detail URLs and they exist
// in the wild. The detail page for a slug now lives at games/<slug>/, so a
// legacy URL becomes a redirect. Slug decides the target; a stale version
// still lands on the game's current page rather than nowhere.

function redirectLegacyShareLink() {
  const slug = new URLSearchParams(window.location.search).get('game');
  if (!slug) return false;
  for (const card of document.querySelectorAll('.card[data-slug]')) {
    if (card.dataset.slug === slug) {
      const link = card.querySelector('.card-title a');
      if (link) {
        window.location.replace(link.getAttribute('href'));
        return true;
      }
    }
  }
  return false;
}

// --- High-score badges ---------------------------------------------------------

function showLocalBests() {
  for (const badge of document.querySelectorAll('[data-score-slug]')) {
    const best = topScore(loadScores(badge.dataset.scoreSlug));
    if (best > 0) {
      badge.textContent = `HI ${best}`;
      badge.hidden = false;
    }
  }
}

// --- Search and facet filters ---------------------------------------------------
// Facets AND together; values within one facet OR together. Search matches
// title substrings, case-insensitively. All state lives in the controls
// themselves (input value + aria-pressed), so there is exactly one source of
// truth and re-running applyFilters is always safe.

function setUpFilters() {
  const form = document.querySelector('[data-filters]');
  const cards = [...document.querySelectorAll('.rack .card')];
  if (!form || cards.length === 0) return;

  const searchBox = form.querySelector('[data-filter-search]');
  const groups = [...form.querySelectorAll('[data-filter-group]')];
  const countLabel = form.querySelector('[data-rack-count]');
  const emptyState = document.querySelector('[data-rack-empty]');
  const clearButtons = [...document.querySelectorAll('[data-filter-clear]')];

  const cardFacets = (card, group) =>
    (group === 'genre' ? [card.dataset.genre] : (card.dataset[group] ?? '').split(' '))
      .filter((v) => v !== '');

  const selectedIn = (group) =>
    [...group.querySelectorAll('.chip[aria-pressed="true"]')].map(
      (chip) => chip.dataset.filterValue,
    );

  function applyFilters() {
    const query = searchBox.value.trim().toLowerCase();
    const selections = groups.map((group) => ({
      name: group.dataset.filterGroup,
      values: selectedIn(group),
    }));
    const filtering = query !== '' || selections.some((s) => s.values.length > 0);

    let shown = 0;
    for (const card of cards) {
      const title = (card.dataset.title ?? '').toLowerCase();
      const matches =
        (query === '' || title.includes(query)) &&
        selections.every(
          (s) =>
            s.values.length === 0 ||
            cardFacets(card, s.name).some((v) => s.values.includes(v)),
        );
      card.closest('li').hidden = !matches;
      if (matches) shown += 1;
    }

    countLabel.textContent = filtering
      ? `${shown} of ${cards.length} games`
      : `${cards.length} games on the rack`;
    if (emptyState) emptyState.hidden = shown !== 0;
    for (const button of clearButtons) button.hidden = !filtering;
  }

  form.addEventListener('submit', (e) => e.preventDefault());
  searchBox.addEventListener('input', applyFilters);
  for (const group of groups) {
    for (const chip of group.querySelectorAll('.chip')) {
      chip.addEventListener('click', () => {
        chip.setAttribute(
          'aria-pressed',
          chip.getAttribute('aria-pressed') === 'true' ? 'false' : 'true',
        );
        applyFilters();
      });
    }
  }
  for (const button of clearButtons) {
    button.addEventListener('click', () => {
      searchBox.value = '';
      for (const chip of form.querySelectorAll('.chip[aria-pressed="true"]')) {
        chip.setAttribute('aria-pressed', 'false');
      }
      applyFilters();
    });
  }

  form.hidden = false;
  applyFilters();
}

if (!redirectLegacyShareLink()) {
  showLocalBests();
  setUpFilters();
}
