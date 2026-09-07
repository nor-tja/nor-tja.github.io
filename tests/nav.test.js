'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, pagePaths, readPage, pageCss } = require('./helpers');

const PAGES = pagePaths().map((p) => path.basename(p));

// The top-level destinations, in the order the nav lists them.
const DEST = ['index.html', 'cv.html', 'resources.html', 'coffee.html',
              'pomodoro.html', 'languages.html', 'snake.html'];

// index.html carries no footer nav on purpose: its entire body is this same
// list with a line of description under each entry. A footer repeating the
// six links a screenful below would be duplication, not navigation.
const NO_FOOTER_NAV = ['index.html'];

function navOf(page) {
  return /<nav class="sitenav"[^>]*>([\s\S]*?)<\/nav>/.exec(readPage(page));
}

test('every page except the homepage carries the site nav', () => {
  for (const page of PAGES) {
    const has = navOf(page) !== null;
    const should = !NO_FOOTER_NAV.includes(page);
    assert.equal(has, should,
      should ? `${page} has no site nav, so it is a dead end apart from "back"`
             : `${page} has a site nav but is listed in NO_FOOTER_NAV`);
  }
});

test('the site nav offers every destination on every page', () => {
  for (const page of PAGES) {
    const nav = navOf(page);
    if (!nav) continue;
    for (const dest of DEST) {
      const listed = dest === page
        ? new RegExp('aria-current="page"').test(nav[1])
        : nav[1].includes(`href="${dest}"`);
      assert.ok(listed, `${page} nav does not offer ${dest}`);
    }
  }
});

// A nav link to a page that does not exist is a 404 on every page at once.
test('every site-nav link points at a file that exists', () => {
  const broken = [];
  for (const page of PAGES) {
    const nav = navOf(page);
    if (!nav) continue;
    for (const m of nav[1].matchAll(/href="([^"]+)"/g)) {
      if (!fs.existsSync(path.join(ROOT, m[1]))) broken.push(`${page} -> ${m[1]}`);
    }
  }
  assert.deepEqual(broken, [], `site-nav links to missing files:\n  ${broken.join('\n  ')}`);
});

// A link to the page you are already on looks live and does nothing. Marking
// it aria-current and rendering it as a span says where you are instead.
test('the current page is marked, and is not a link to itself', () => {
  for (const page of PAGES) {
    const nav = navOf(page);
    if (!nav || !DEST.includes(page)) continue;
    assert.ok(!nav[1].includes(`href="${page}"`),
      `${page} nav links to itself`);
    assert.match(nav[1], /<span aria-current="page">/,
      `${page} is a top-level destination but marks no current item`);
    assert.equal((nav[1].match(/aria-current/g) || []).length, 1,
      `${page} marks more than one nav item as current`);
  }
});

// The five language pages are children of languages.html, not destinations in
// their own right, so nothing in their nav is "current" -- every entry is a
// real link somewhere else. This is a decision, so it is pinned.
test('a language sub-page marks no nav item as current', () => {
  for (const page of ['mots-du-jour.html', 'spanish.html', 'portuguese.html',
                      'japanese.html', 'ukrainian.html']) {
    const nav = navOf(page);
    assert.ok(nav, `${page} has no site nav`);
    assert.ok(!nav[1].includes('aria-current'),
      `${page} is a sub-page of languages.html and is not itself a nav ` +
      `destination, so no entry should claim to be the current page`);
  }
});

// The actual point of the change, stated as the property rather than as the
// markup: before this, reaching coffee.html from pomodoro.html took two hops
// through the homepage, and three from a language page.
test('every page reaches every destination in one hop', () => {
  const unreachable = [];
  for (const page of PAGES) {
    const src = readPage(page);
    for (const dest of DEST) {
      if (dest === page) continue;
      if (!src.includes(`href="${dest}"`)) unreachable.push(`${page} cannot reach ${dest}`);
    }
  }
  assert.deepEqual(unreachable, [],
    `these pages are more than one click from a destination:\n  ${unreachable.join('\n  ')}`);
});

// WCAG 2.5.8 again. These are ~10px mono labels; without vertical padding the
// tap target is the line box, well under the 24px floor. Guarding the padding
// rather than the font size is the point -- the padding looks removable.
test('site-nav entries are tall enough to tap', () => {
  const rule = /\.sitenav a,\s*\.sitenav span \{([^}]*)\}/.exec(
    fs.readFileSync(path.join(ROOT, 'assets/css/site.css'), 'utf8'));
  assert.ok(rule, 'site.css has no .sitenav a rule');
  const pad = /padding:\s*([\d.]+)rem/.exec(rule[1]);
  assert.ok(pad, '.sitenav entries set no vertical padding');
  // 1rem is at least 16px, and the mono label is a ~13px line box.
  const px = parseFloat(pad[1]) * 16 * 2 + 13;
  assert.ok(px >= 24,
    `.sitenav entries are about ${px.toFixed(0)}px tall; WCAG 2.5.8 asks 24`);
});

// The homepage is the hub: it is the one page that describes each destination
// rather than just naming it.
test('the homepage describes every destination it links to', () => {
  const src = readPage('index.html');
  for (const dest of DEST) {
    if (dest === 'index.html') continue;
    assert.ok(src.includes(`href="${dest}"`), `index.html does not link ${dest}`);
  }
  // Scoped to the links list. The coffee-mug illustration above it is also an
  // anchor to coffee.html and legitimately has no label -- it is a picture,
  // labelled by its own .cup-link-text.
  const list = /<nav class="links">([\s\S]*?)<\/nav>/.exec(src);
  assert.ok(list, 'index.html has no <nav class="links">');
  const links = [...list[1].matchAll(/<a href="([^"]+\.html)"[^>]*>([\s\S]*?)<\/a>/g)]
    .filter((m) => DEST.includes(m[1]));
  assert.equal(links.length, DEST.length - 1,
    `index.html lists ${links.length} destinations; expected ${DEST.length - 1}`);
  for (const [, href, inner] of links) {
    assert.match(inner, /class="link-label"/, `index.html ${href} has no label`);
    assert.match(inner, /class="link-note"/,
      `index.html links ${href} with no note saying what it is. A bare label ` +
      `gives a stranger no reason to click.`);
  }
});

// The homepage centres its content in a flex column. With overflow hidden and
// plain `center`, content taller than the viewport is clipped at BOTH ends
// and cannot be scrolled to -- which six two-line links can be, on a phone in
// landscape.
test('the homepage can scroll when its content outgrows the viewport', () => {
  const body = /body \{([^}]*)\}/.exec(pageCss('index.html'));
  assert.ok(body, 'index.html has no body rule');
  assert.ok(!/overflow:\s*hidden/.test(body[1]),
    'index.html sets overflow:hidden on body; tall content becomes unreachable');
  assert.match(body[1], /align-items:\s*safe center/,
    'index.html must use `safe center`, or the top of overflowing content ' +
    'cannot be scrolled to');
});
