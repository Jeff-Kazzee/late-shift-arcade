// The card press: renders a 1200×630 social card (og:image) for every game
// on the rack, plus one site-wide card, into assets/og/<slug>.png.
//
// Like tools/generate-pages.js, this is a BUILD-TIME tool: the PNGs are
// committed, and nothing at serve time depends on this file or on any
// dependency. Zero packages — each card is an authored HTML/CSS page in the
// night palette, screenshotted by the locally installed Chrome or Edge:
//
//   chrome --headless=new --screenshot=<out> --window-size=1200,630 file://…
//
// Run it after adding a game or changing the template:
//
//   node tools/generate-og-cards.mjs
//
// and commit assets/og/. test/og-cards.test.js verifies every rack slug has
// a committed, non-trivial PNG; the pixels themselves are free to differ
// between machines because only the committed files ever ship.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { palette } from '../shell/palette.js';
import { escapeHtml, SITE_NAME } from './generate-pages.js';
import { cartridges } from '../games/registry.js';

const WIDTH = 1200;
const HEIGHT = 630;
const MIN_BYTES = 10 * 1024; // below this a screenshot is a blank page, not a card

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(root, 'assets', 'og');

// --- Find a browser -------------------------------------------------------------

function findBrowser() {
  const candidates = [
    process.env.OG_BROWSER,
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    'no Chrome or Edge found — set OG_BROWSER to a Chromium-family executable',
  );
}

// --- The card template ------------------------------------------------------------
// The site's identity, held at poster scale: ink night sky, one accent glow,
// CRT scanlines, mono type. Everything inline; the page loads nothing.

function accentGlow(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function titleSize(title) {
  if (title.length <= 8) return 148;
  if (title.length <= 12) return 122;
  if (title.length <= 16) return 100;
  return 86;
}

function cardHtml({ kicker, title, sub, accent, footer }) {
  const glowStrong = accentGlow(accent, 0.34);
  const glowSoft = accentGlow(accent, 0.55);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; }
  body {
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    overflow: hidden;
    position: relative;
    background: ${palette.ink};
    font-family: "Cascadia Code", Consolas, "Courier New", monospace;
    color: ${palette.cream};
  }
  .glow {
    position: absolute; inset: 0;
    background: radial-gradient(ellipse 85% 70% at 50% -12%, ${glowStrong} 0%, rgba(11, 12, 20, 0) 62%);
  }
  .frame {
    position: absolute; inset: 30px;
    border: 2px solid rgba(233, 236, 244, 0.16);
    border-radius: 26px;
  }
  .content {
    position: absolute; inset: 30px;
    display: flex; flex-direction: column;
    justify-content: center; align-items: center;
    text-align: center;
    padding: 0 70px;
    gap: 26px;
  }
  .kicker {
    margin: 0;
    font-size: 30px;
    font-weight: 700;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: ${accent};
  }
  .title {
    margin: 0;
    font-size: ${titleSize(title)}px;
    font-weight: 700;
    line-height: 1.04;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    text-wrap: balance;
    color: ${palette.cream};
    text-shadow: 0 0 60px ${glowSoft};
  }
  .sub {
    margin: 0;
    max-width: 900px;
    font-size: 30px;
    line-height: 1.4;
    color: #a3aac8;
  }
  .footer {
    position: absolute;
    left: 0; right: 0; bottom: 62px;
    text-align: center;
    font-size: 26px;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: ${palette.amber};
    text-shadow: 0 0 26px rgba(230, 193, 126, 0.45);
  }
  .scanlines {
    position: absolute; inset: 0;
    background: repeating-linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0) 0px, rgba(0, 0, 0, 0) 3px,
      rgba(0, 0, 0, 0.30) 3px, rgba(0, 0, 0, 0.30) 5px
    );
  }
  .vignette {
    position: absolute; inset: 0;
    box-shadow: inset 0 0 230px rgba(0, 0, 0, 0.88);
  }
</style>
</head>
<body>
  <div class="glow"></div>
  <div class="frame"></div>
  <div class="content">
    <p class="kicker">${escapeHtml(kicker)}</p>
    <p class="title">${escapeHtml(title)}</p>
    <p class="sub">${escapeHtml(sub)}</p>
  </div>
  <p class="footer">${escapeHtml(footer)}</p>
  <div class="scanlines"></div>
  <div class="vignette"></div>
</body>
</html>
`;
}

function gameCard(manifest) {
  const accent = palette[manifest.artwork.accent] ?? palette.amber;
  return cardHtml({
    kicker: `🌙 ${manifest.genre} · ${manifest.players}P`,
    title: manifest.title,
    sub: manifest.summary,
    accent,
    footer: `${SITE_NAME} — free browser arcade`,
  });
}

function siteCard(count) {
  return cardHtml({
    kicker: '🌙 Open all night',
    title: SITE_NAME,
    // U+2011 non-breaking hyphen: "sign-up" must not break across lines.
    sub: `${count} small, complete, AI-made games. No ads, no sign‑up, no tracking.`,
    accent: palette.periwinkle,
    footer: 'free browser arcade',
  });
}

// --- Screenshot ------------------------------------------------------------------

function screenshot(browser, htmlPath, outPath, profileDir) {
  const result = spawnSync(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      `--user-data-dir=${profileDir}`,
      `--window-size=${WIDTH},${HEIGHT}`,
      `--screenshot=${outPath}`,
      pathToFileURL(htmlPath).href,
    ],
    { timeout: 60_000 },
  );
  if (result.error) throw result.error;
  if (!existsSync(outPath)) {
    throw new Error(
      `no screenshot written for ${outPath}\n${result.stderr?.toString() ?? ''}`,
    );
  }
  const { size } = statSync(outPath);
  if (size < MIN_BYTES) {
    throw new Error(`${outPath} is ${size} bytes — that is a blank page, not a card`);
  }
  return size;
}

// --- Main -------------------------------------------------------------------------

const browser = findBrowser();
const work = mkdtempSync(join(tmpdir(), 'og-cards-'));
const profileDir = join(work, 'profile');
mkdirSync(outDir, { recursive: true });

try {
  const manifests = cartridges.map((entry) => entry.manifest);
  const cards = [
    { name: 'site', html: siteCard(manifests.length) },
    ...manifests.map((m) => ({ name: m.slug, html: gameCard(m) })),
  ];
  for (const card of cards) {
    const htmlPath = join(work, `${card.name}.html`);
    const outPath = join(outDir, `${card.name}.png`);
    writeFileSync(htmlPath, card.html);
    const size = screenshot(browser, htmlPath, outPath, profileDir);
    console.log(`assets/og/${card.name}.png  ${(size / 1024).toFixed(1)} KB`);
  }
  console.log(`wrote ${cards.length} cards with ${browser}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
