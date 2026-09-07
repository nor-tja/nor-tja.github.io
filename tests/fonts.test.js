'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, pagePaths, readPage } = require('./helpers');

const PAGES = pagePaths().map((p) => path.basename(p));
const FONTS_CSS = fs.readFileSync(path.join(ROOT, 'assets/css/fonts.css'), 'utf8');
const FONT_DIR = path.join(ROOT, 'assets/fonts');

// The whole point of self-hosting. One page quietly re-adding the Google link
// -- most likely by being copied from an older sibling -- puts every visitor
// to that page back in front of a third party before the first paint.
test('no page loads fonts from a third party', () => {
  const offenders = [];
  for (const page of PAGES) {
    const src = readPage(page);
    for (const host of ['fonts.googleapis.com', 'fonts.gstatic.com']) {
      if (src.includes(host)) offenders.push(`${page} -> ${host}`);
    }
  }
  assert.deepEqual(offenders, [],
    `these pages still fetch fonts from Google:\n  ${offenders.join('\n  ')}`);
});

test('every page links the self-hosted stylesheet', () => {
  for (const page of PAGES) {
    assert.match(readPage(page), /<link rel="stylesheet" href="assets\/css\/fonts\.css">/,
      `${page} does not link assets/css/fonts.css, so it renders in a system ` +
      `serif with no warning`);
  }
});

// A @font-face pointing at a file that is not there fails silently: the
// browser drops to the next family in the stack and the page merely looks
// slightly wrong, which is exactly the kind of thing nobody reports.
test('every font-face in fonts.css points at a file that exists', () => {
  const missing = [];
  for (const m of FONTS_CSS.matchAll(/url\(\.\.\/fonts\/([^)]+)\)/g)) {
    if (!fs.existsSync(path.join(FONT_DIR, m[1]))) missing.push(m[1]);
  }
  assert.ok(missing.length === 0, `declared but not on disk:\n  ${missing.join('\n  ')}`);
  assert.ok(FONTS_CSS.match(/@font-face/g).length >= 20,
    'fonts.css has suspiciously few faces; re-run tools/fetch-fonts.js');
});

// The reverse: a font Google has revved leaves an orphan behind, and 500KB of
// woff2 nobody serves is 500KB in every clone.
test('no font file on disk is unreferenced', () => {
  const referenced = new Set(
    [...FONTS_CSS.matchAll(/url\(\.\.\/fonts\/([^)]+)\)/g)].map((m) => m[1]));
  const orphans = fs.readdirSync(FONT_DIR)
    .filter((f) => f.endsWith('.woff2') && !referenced.has(f));
  assert.deepEqual(orphans, [],
    `font files no stylesheet references: ${orphans.join(', ')}. ` +
    `tools/fetch-fonts.js prunes these; re-run it.`);
});

// A preload without crossorigin is worse than no preload: fonts are always
// fetched in CORS mode, so the browser cannot match the preloaded response to
// the real request and downloads the file twice.
test('every font preload carries crossorigin and the right type', () => {
  const bad = [];
  for (const page of PAGES) {
    for (const m of readPage(page).matchAll(/<link[^>]*rel="preload"[^>]*>/g)) {
      const tag = m[0];
      if (!/as="font"/.test(tag)) continue;
      if (!/\bcrossorigin\b/.test(tag)) bad.push(`${page}: preload without crossorigin`);
      if (!/type="font\/woff2"/.test(tag)) bad.push(`${page}: preload without a woff2 type`);
      const href = /href="([^"]+)"/.exec(tag);
      if (href && !fs.existsSync(path.join(ROOT, href[1]))) {
        bad.push(`${page}: preloads ${href[1]}, which is not on disk`);
      }
    }
  }
  assert.deepEqual(bad, [], `broken font preloads:\n  ${bad.join('\n  ')}`);
});

// Ukrainian is the reason the cyrillic subsets are kept at all; dropping them
// from KEEP in the generator would leave that page in a fallback serif and
// nothing else would notice.
test('the subsets the site actually needs are all present', () => {
  for (const subset of ['latin', 'latin-ext', 'cyrillic']) {
    assert.ok(FONTS_CSS.includes(`cormorant-garamond-normal-300-${subset}.woff2`),
      `fonts.css has no ${subset} face for body text. Ukrainian needs ` +
      `cyrillic; French, Spanish and Portuguese need latin-ext.`);
  }
});
