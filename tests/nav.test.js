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

// index.html carries no footer nav on purpose: its entire body IS this same
// list. A footer repeating the six links a screenful below would be
// duplication, not navigation.
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

// The homepage is the hub, and its list is the only place every destination
// is introduced rather than just listed. The name has to do that work on its
// own -- there is no second line under it.
//
// Scoped to <nav class="links">. The coffee-mug illustration above it is also
// an anchor to coffee.html and legitimately carries no text; it is a picture,
// labelled by its own .cup-link-text.
function homeLinks() {
  const list = /<nav class="links">([\s\S]*?)<\/nav>/.exec(readPage('index.html'));
  assert.ok(list, 'index.html has no <nav class="links">');
  return [...list[1].matchAll(/<a href="([^"]+\.html)"[^>]*>([\s\S]*?)<\/a>/g)];
}

// coffee.html is reached from the illustrated mug in the corner instead of
// from the list. It is the only destination with a picture of its own, and a
// text link three lines above that picture was the same door twice.
//
// Named, not inferred: if a second page ever gets an illustration, adding it
// here has to be a decision. Dropping a link from the list without adding it
// here fails the reachability test below.
const ILLUSTRATED = { 'coffee.html': 'coffee-scene' };

test('the homepage names every destination, and names it something', () => {
  const links = homeLinks();
  const listed = DEST.filter((d) => d !== 'index.html' && !(d in ILLUSTRATED));
  assert.deepEqual(links.map((m) => m[1]), listed,
    'index.html does not list exactly the destinations that have no picture ' +
    'of their own, in nav order');
  for (const [, href, inner] of links) {
    assert.ok(!/<[a-z]/i.test(inner),
      `index.html ${href} wraps its name in markup. The name is the whole ` +
      `link now; a nested element is a subtitle growing back.`);
    assert.ok(inner.trim().length >= 2, `index.html ${href} has no visible name`);
  }
});

// The point the list was serving, stated directly so that trimming the list
// cannot quietly cost the homepage a destination. Every top-level page is one
// click from the hub, whether the click is on a name or on a drawing.
test('every destination is one click from the homepage', () => {
  const src = readPage('index.html');
  for (const dest of DEST) {
    if (dest === 'index.html') continue;
    const cls = ILLUSTRATED[dest];
    if (cls) {
      const tag = new RegExp(`<a href="${dest}"[^>]*class="[^"]*\\b${cls}\\b`).exec(src);
      assert.ok(tag, `index.html has no .${cls} anchor to ${dest}, so the only ` +
        `way to ${dest} from the hub is gone`);
      continue;
    }
    assert.ok(homeLinks().some((m) => m[1] === dest),
      `index.html neither lists ${dest} nor illustrates it`);
  }
});

// An anchor whose only content is an <img> is a link with no name to a screen
// reader unless something supplies one. The mug carries a .cup-link-text
// label, which is visually revealed on hover but present in the accessibility
// tree the whole time -- opacity:0 hides it from sight, not from the tree.
test('the illustrated links are not anonymous', () => {
  const src = readPage('index.html');
  for (const [dest, cls] of Object.entries(ILLUSTRATED)) {
    const a = new RegExp(`<a href="${dest}"[^>]*class="[^"]*\\b${cls}\\b[^>]*>([\\s\\S]*?)</a>`)
      .exec(src);
    assert.ok(a, `no .${cls} anchor to ${dest}`);
    const text = a[1].replace(/<[^>]+>/g, '').trim();
    const alt = /alt="([^"]*)"/.exec(a[1]);
    assert.ok(text.length >= 2 || (alt && alt[1].trim().length >= 2),
      `the .${cls} link to ${dest} has neither text nor a non-empty alt, so ` +
      `it is announced as "link" and nothing else`);
  }
});

// A decision, pinned so that undoing it has to be deliberate. These three
// pages used to be listed as "Resources", "Pomodoro" and "Languages" -- names
// that only mean something to someone who already knows what is behind them.
// A stranger reading "Pomodoro" learns nothing; "Pomodoro hourglass" tells
// them there is a picture of one on the other side.
test('the homepage does not fall back to bare category names', () => {
  const BARE = { 'resources.html': 'Resources', 'pomodoro.html': 'Pomodoro',
                 'languages.html': 'Languages' };
  for (const [, href, inner] of homeLinks()) {
    if (!(href in BARE)) continue;
    assert.notEqual(inner.trim(), BARE[href],
      `index.html calls ${href} just "${BARE[href]}", which tells a stranger ` +
      `nothing about what it is`);
  }
});

// Same floor as the site nav, and for the same reason: these are ~13px mono
// line boxes, so the padding is the entire tap target and it looks removable.
test('homepage links are tall enough to tap', () => {
  const rule = /\.links a \{([^}]*)\}/.exec(pageCss('index.html'));
  assert.ok(rule, 'index.html has no .links a rule');
  const pad = /padding:\s*([\d.]+)rem/.exec(rule[1]);
  assert.ok(pad, '.links a sets no vertical padding');
  const px = parseFloat(pad[1]) * 16 * 2 + 13;
  assert.ok(px >= 24,
    `.links a is about ${px.toFixed(0)}px tall; WCAG 2.5.8 asks 24`);
});

// The homepage centres its content in a flex column. With overflow hidden and
// plain `center`, content taller than the viewport is clipped at BOTH ends and
// cannot be scrolled to -- which a greeting plus six links is, on a phone in
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
