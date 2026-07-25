// The committed site pages are generated from the manifests by
// tools/generate-pages.js. These tests hold the two ends together:
//
//   1. No drift: every committed page is byte-identical (modulo line
//      endings) to what the generator renders from today's manifests, so a
//      manifest edit that forgets `node tools/generate-pages.js` fails here.
//   2. The site contract: pages are indexable (real titles and descriptions
//      in static HTML), untrusted-shaped manifest text is escaped, `source`
//      is never a live anchor, and no page references a game module — game
//      code is fetched only when the player launches (F-008).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  renderHomePage,
  renderDetailPage,
  renderSitemap,
  renderRobots,
  escapeHtml,
  SITE_BASE,
} from '../tools/generate-pages.js';
import { cartridges } from '../games/registry.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifests = cartridges.map((entry) => entry.manifest);

// Committed files may be checked out with CRLF on Windows; the generator
// writes LF. Compare content, not line-ending policy.
const readCommitted = (path) => readFileSync(`${root}${path}`, 'utf8').replaceAll('\r\n', '\n');

test('committed pages match the generator output exactly (no drift)', () => {
  assert.equal(readCommitted('index.html'), renderHomePage(manifests));
  assert.equal(readCommitted('sitemap.xml'), renderSitemap(manifests));
  assert.equal(readCommitted('robots.txt'), renderRobots());
  for (const manifest of manifests) {
    assert.equal(
      readCommitted(`games/${manifest.slug}/index.html`),
      renderDetailPage(manifest),
      `games/${manifest.slug}/index.html is stale — run: node tools/generate-pages.js`,
    );
  }
});

test('the home page is real, indexable HTML: every game title and summary is in the source', () => {
  const home = renderHomePage(manifests);
  for (const manifest of manifests) {
    assert.ok(home.includes(escapeHtml(manifest.title)), `home is missing ${manifest.title}`);
    assert.ok(home.includes(escapeHtml(manifest.summary)), `home is missing ${manifest.slug} summary`);
    assert.ok(home.includes(`href="games/${manifest.slug}/"`), `home is missing link to ${manifest.slug}`);
  }
});

test('detail pages carry per-game title, description, canonical, social cards, and VideoGame JSON-LD', () => {
  for (const manifest of manifests) {
    const page = renderDetailPage(manifest);
    const canonical = `${SITE_BASE}games/${manifest.slug}/`;
    assert.ok(page.includes(`<title>${escapeHtml(manifest.title)} — play free in your browser | Late Shift Arcade</title>`));
    assert.ok(page.includes('<meta name="description"'));
    assert.ok(page.includes(`<link rel="canonical" href="${canonical}">`));
    assert.ok(page.includes('<meta property="og:title"'));
    assert.ok(page.includes('<meta name="twitter:card" content="summary_large_image">'));
    assert.ok(page.includes('"@type": "VideoGame"'));
    assert.ok(page.includes(`"softwareVersion": "${manifest.version}"`));
  }
});

test('every page carries an absolute og:image and twitter:image pointing at its committed card', () => {
  const home = renderHomePage(manifests);
  assert.ok(home.includes(`<meta property="og:image" content="${SITE_BASE}assets/og/site.png">`));
  assert.ok(home.includes(`<meta name="twitter:image" content="${SITE_BASE}assets/og/site.png">`));
  for (const manifest of manifests) {
    const page = renderDetailPage(manifest);
    const image = `${SITE_BASE}assets/og/${manifest.slug}.png`;
    assert.ok(page.includes(`<meta property="og:image" content="${image}">`), `${manifest.slug} og:image`);
    assert.ok(page.includes('<meta property="og:image:width" content="1200">'));
    assert.ok(page.includes('<meta property="og:image:height" content="630">'));
    assert.ok(page.includes('<meta property="og:image:alt"'));
    assert.ok(page.includes(`<meta name="twitter:image" content="${image}">`), `${manifest.slug} twitter:image`);
    assert.ok(image.startsWith('https://'), 'og:image must be an absolute URL');
  }
});

test('no page references a game module — game code loads only on launch (F-008)', () => {
  const pages = [renderHomePage(manifests), ...manifests.map((m) => renderDetailPage(m))];
  for (const page of pages) {
    for (const manifest of manifests) {
      assert.ok(
        !page.includes(`${manifest.slug}/${manifest.slug}.js`),
        `a page references the ${manifest.slug} game module`,
      );
      assert.ok(!page.includes(`${manifest.slug}/logic.js`));
    }
    // The only scripts on any page are the two site modules.
    const scripts = [...page.matchAll(/<script type="module" src="([^"]+)"/g)].map((m) => m[1]);
    for (const src of scripts) {
      assert.match(src, /^(\.\.\/\.\.\/)?shell\/(site|player)\.js$/);
    }
  }
});

// Manifest text is untrusted-shaped by design: community submissions will
// supply it later. The templates must survive hostile values today.
const hostile = Object.freeze({
  schemaVersion: 1,
  slug: 'hostile-cart',
  version: '1.0.0',
  title: '<script>alert(1)</script>',
  summary: '"><img src=x onerror=alert(2)>',
  creator: "O'Malley & Sons <admin>",
  runtime: 'first-party-2d',
  trustLevel: 'trusted-first-party',
  modes: ['solo'],
  goal: '</script><script>alert(3)</script>',
  scoreLabel: '"quoted"',
  controls: ['<b>MOVE</b>'],
  artwork: { accent: 'amber' },
  releaseStatus: 'published',
  contentNotes: ['<style>*{display:none}</style>'],
  madeWith: 'AI & <humans>',
  source: 'https://attacker.example/x?"><a href="https://evil.example">',
  genre: '<GENRE>',
  players: '1',
  tags: ['<tag>'],
});

test('hostile manifest text is inert: escaped as text, never markup', () => {
  const page = renderDetailPage(hostile);
  assert.ok(!page.includes('<script>alert'));
  assert.ok(!page.includes('<img src=x'));
  assert.ok(!page.includes('<style>'));
  assert.ok(page.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  // A hostile goal must not be able to close the JSON-LD script element.
  const jsonLdBlock = page.slice(page.indexOf('application/ld+json'));
  assert.ok(!jsonLdBlock.slice(0, jsonLdBlock.indexOf('</script>')).includes('</script><script>'));

  const home = renderHomePage([hostile]);
  assert.ok(!home.includes('<script>alert'));
  assert.ok(!home.includes('<img src=x'));
});

test('manifest source is rendered as text, never as a live anchor (C-003)', () => {
  for (const manifest of [...manifests, hostile]) {
    if (manifest.source === undefined) continue;
    const page = renderDetailPage(manifest);
    // The value appears, escaped, inside a plain span…
    assert.ok(
      page.includes(`Source: <span class="mono">${escapeHtml(manifest.source)}</span>`),
      `${manifest.slug} does not render source as inert text`,
    );
    // …and the provenance section (the only place manifest.source is
    // rendered) contains no anchor at all. The site footer's authored
    // repository link is site copy, not manifest text, and lives outside it.
    const provenance = page.slice(
      page.indexOf('id="provenance-title"'),
      page.indexOf('</section>', page.indexOf('id="provenance-title"')),
    );
    assert.ok(!provenance.includes('<a '), `${manifest.slug} renders source as a link`);
  }
});

test('a blocked manifest gets a detail page with a notice and no play button', () => {
  const suspended = { ...hostile, releaseStatus: 'suspended' };
  const page = renderDetailPage(suspended);
  assert.ok(page.includes('notice-blocked'));
  assert.ok(!page.includes('data-play'));

  const foreignRuntime = { ...hostile, runtime: 'community-iframe', trustLevel: 'untrusted-community' };
  const foreignPage = renderDetailPage(foreignRuntime);
  assert.ok(foreignPage.includes('notice-blocked'));
  assert.ok(!foreignPage.includes('data-play'));

  // And a published, in-process manifest does get one.
  assert.ok(renderDetailPage(hostile).includes('data-play'));
});

test('the sitemap lists the home page and every game page, absolutely', () => {
  const sitemap = renderSitemap(manifests);
  assert.ok(sitemap.includes(`<loc>${SITE_BASE}</loc>`));
  for (const manifest of manifests) {
    assert.ok(sitemap.includes(`<loc>${SITE_BASE}games/${manifest.slug}/</loc>`));
  }
  assert.equal([...sitemap.matchAll(/<url>/g)].length, manifests.length + 1);
});

test('every rack entry gets exactly one card and one detail page path', () => {
  const home = renderHomePage(manifests);
  for (const manifest of manifests) {
    const cards = [...home.matchAll(new RegExp(`data-slug="${manifest.slug}"`, 'g'))];
    assert.equal(cards.length, 1, `${manifest.slug} should appear on exactly one card`);
  }
});
