'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pagePaths, readPage, pageCss } = require('./helpers');

const PAGES = pagePaths().map((p) => path.basename(p));

// Pull a rule body out by brace matching. A line-based grep cannot do this:
// cv.html and snake.html write these rules across multiple lines while the
// other ten minify them onto one.
function extractRule(src, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp('(?:^|[};>\\n])[ \\t]*' + esc + '\\s*\\{').exec(src);
  if (!m) return null;
  let i = src.indexOf('{', m.index);
  const start = i;
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(start + 1, i);
}

// Order- and whitespace-insensitive declaration map.
function declarations(body) {
  const out = {};
  if (body == null) return out;
  for (const d of body.split(';')) {
    const i = d.indexOf(':');
    if (i === -1) continue;
    out[d.slice(0, i).trim()] = d.slice(i + 1).replace(/\s+/g, ' ').trim();
  }
  return out;
}

// --- characterisation pins -------------------------------------------------

// footer padding splits 4 ways with no majority. An earlier draft of the design
// proposed a shared 2.5rem default; that would have silently changed 8 pages.
const FOOTER_PADDING = {
  'coffee.html': '2.5rem 0',
  'cv.html': '2.5rem 0',
  'resources.html': '2.5rem 0',
  'japanese.html': '1rem 0 1rem',
  'languages.html': '1rem 0 1rem',
  'mots-du-jour.html': '1rem 0 1rem',
  'portuguese.html': '1rem 0 1rem',
  'spanish.html': '1rem 0 1rem',
  'ukrainian.html': '1rem 0 1rem',
  'pomodoro.html': '3rem 0 1rem',
  'snake.html': '3rem 0 0',
  // index.html has no footer rule at all.
};

test('footer padding is unchanged on every page', () => {
  for (const [page, expected] of Object.entries(FOOTER_PADDING)) {
    const decls = declarations(extractRule(pageCss(page), 'footer'));
    assert.equal(decls['padding'], expected,
      `${page} footer padding should still be "${expected}"`);
  }
});

test('index.html still has no footer rule', () => {
  assert.equal(extractRule(pageCss('index.html'), 'footer'), null,
    'index.html never had a footer rule; it should not acquire one');
});

// .wrap is the page column. Extracting it into site.css would have collapsed
// four distinct layout widths into one and changed nine pages.
const WRAP_MAX_WIDTH = {
  'coffee.html': '860px',
  'resources.html': '860px',
  'cv.html': '780px',
  'japanese.html': '640px',
  'languages.html': '640px',
  'mots-du-jour.html': '640px',
  'pomodoro.html': '640px',
  'portuguese.html': '640px',
  'spanish.html': '640px',
  'ukrainian.html': '640px',
  'snake.html': '520px',
  // index.html has no .wrap.
};

test('.wrap max-width is unchanged on every page', () => {
  for (const [page, expected] of Object.entries(WRAP_MAX_WIDTH)) {
    const decls = declarations(extractRule(pageCss(page), '.wrap'));
    assert.equal(decls['max-width'], expected,
      `${page} .wrap max-width should still be "${expected}"`);
  }
});

// --- extraction actually removed the duplicates ---------------------------

// All twelve, now that the migration is finished. Kept as an explicit list
// rather than pagePaths(): a new page should have to be added here by hand,
// which is the moment someone notices it has not been migrated.
const MIGRATED = [
  'coffee.html', 'cv.html', 'index.html', 'japanese.html', 'languages.html',
  'mots-du-jour.html', 'pomodoro.html', 'portuguese.html', 'resources.html',
  'snake.html', 'spanish.html', 'ukrainian.html',
];

const PALETTE_VARS = ['--bg', '--ink', '--muted', '--accent', '--line'];

test('migrated pages define no palette variables locally', () => {
  for (const page of MIGRATED) {
    const src = pageCss(page);
    for (const v of PALETTE_VARS) {
      assert.ok(!new RegExp(`${v}\\s*:`).test(src),
        `${page} still defines ${v} locally, shadowing site.css`);
    }
  }
});

// cv.html's rise travels 18px where every other page travels 16px. A local
// @keyframes replaces the shared one wholesale rather than merging with it, so
// keeping cv's copy is both safe and necessary: delete it and cv's entrance
// animation silently changes. Listed here so the exception is a decision on the
// record rather than an oversight nobody noticed.
const KEYFRAMES_EXCEPT = ['cv.html'];

test('migrated pages define no duplicated furniture', () => {
  for (const page of MIGRATED) {
    const src = pageCss(page);
    for (const sel of ['.back', '.back:hover']) {
      assert.equal(extractRule(src, sel), null,
        `${page} still defines ${sel} locally; the extraction added the link ` +
        `but did not actually deduplicate anything`);
    }
    assert.equal(extractRule(src, '*, *::before, *::after'), null,
      `${page} still defines the universal reset locally`);
    if (!KEYFRAMES_EXCEPT.includes(page)) {
      assert.equal(extractRule(src, '@keyframes rise'), null,
        `${page} still defines @keyframes rise locally`);
    }
  }
});

// .eyebrow is the one piece of furniture a page may legitimately keep, because
// cv.html adds a longer margin and its own entrance animation. What it may not
// keep is the half that moved to site.css -- so the test polices the shared
// declarations rather than the rule's existence.
test('no migrated page re-declares the shared half of .eyebrow', () => {
  const SHARED = ['font-family', 'font-size', 'letter-spacing', 'text-transform', 'color'];
  for (const page of MIGRATED) {
    const rule = extractRule(pageCss(page), '.eyebrow');
    if (rule === null) continue;
    const decls = declarations(rule);
    for (const p of SHARED) {
      assert.equal(decls[p], undefined,
        `${page} .eyebrow still sets ${p}; that moved to site.css. Only ` +
        `genuinely divergent declarations may stay behind.`);
    }
  }
});

test('migrated pages keep only their own footer padding', () => {
  for (const page of MIGRATED) {
    const rule = extractRule(pageCss(page), 'footer');
    // index.html has no footer element at all; a separate test pins that.
    if (rule === null) continue;
    const decls = declarations(rule);
    assert.equal(decls['text-align'], undefined,
      `${page} still sets footer text-align; that half moved to site.css`);
    assert.ok(decls['padding'], `${page} must keep its own footer padding`);
  }
});

test('migrated pages keep only the non-universal half of body', () => {
  for (const page of MIGRATED) {
    const decls = declarations(extractRule(pageCss(page), 'body'));
    for (const p of ['background', 'color', 'font-family', 'font-weight', 'min-height']) {
      assert.equal(decls[p], undefined,
        `${page} still sets body ${p}; that moved to site.css`);
    }
  }
});

// --- shared stylesheet is linked ------------------------------------------

const LINK = '<link rel="stylesheet" href="assets/css/site.css">';

test('every page links the shared stylesheet', () => {
  for (const page of PAGES) {
    assert.ok(readPage(page).includes(LINK),
      `${page} does not link ${LINK}`);
  }
});

// Order is load-bearing. site.css must come FIRST so that a page rule with the
// same specificity still wins; reverse them and every inline override dies.
test('site.css is linked before whatever a page overrides it with', () => {
  for (const page of PAGES) {
    const src = readPage(page);
    const link = src.indexOf(LINK);
    // A page contributes its own rules either through a page-level stylesheet
    // or an inline <style>. Demanding a <style> would have quietly excused
    // the language pages from this check the moment their CSS moved into a
    // file -- and naming those files one by one has the same failure a step
    // later, which is what happened when pomodoro.css was extracted. So:
    // anything under assets/css/ that is not one of the two foundations
    // counts as the page's own rules.
    const own = [...src.matchAll(
      /<link[^>]+rel="stylesheet"[^>]+href="assets\/css\/([^"]+)"/g)]
      .filter((m) => !['site.css', 'fonts.css'].includes(m[1]))
      .map((m) => m.index);
    const style = src.indexOf('<style>');
    if (style !== -1) own.push(style);
    assert.ok(link !== -1, `${page} is missing the site.css link`);
    assert.ok(own.length,
      `${page} has neither a page stylesheet nor a <style>; it contributes ` +
      `no rules of its own, which is almost certainly a mistake`);
    assert.ok(link < Math.min(...own),
      `${page} links site.css AFTER its own rules; equal-specificity ` +
      `overrides would stop winning`);
  }
});

test('no page links the shared stylesheet twice', () => {
  for (const page of PAGES) {
    const n = readPage(page).split(LINK).length - 1;
    assert.equal(n, 1, `${page} links site.css ${n} times, expected exactly 1`);
  }
});

// body font-size is set on 10 of 12 pages. index and snake omit it on purpose:
// index is a centred flex illustration, snake sizes its own board. Promoting
// 18px into site.css would have resized every unsized child on those two.
test('index.html and snake.html still set no body font-size', () => {
  for (const page of ['index.html', 'snake.html']) {
    const decls = declarations(extractRule(pageCss(page), 'body'));
    assert.equal(decls['font-size'], undefined,
      `${page} deliberately has no body font-size; it must not acquire one`);
  }
});

// --- absolute leading -------------------------------------------------------
//
// var(--leading-body) is a LENGTH, so it inherits to descendants as one fixed
// line box instead of being re-multiplied by each element's own font-size.
// That is the whole point of it, and also its one sharp edge: an element set
// larger than the body text keeps the body's line box, and once the glyphs
// outgrow it the lines collide.
//
// The measurement that motivated this guard: nine of the twelve pages carry at
// least one such element (.word-fr at 24px, .time-display at 25.6px, .lang-flag
// at 22.4px ...). None of them are broken today because they have not adopted
// the token yet -- so this test only polices pages that HAVE adopted it, and
// starts biting the moment one does.
test('pages using the length leading protect their oversized text', () => {
  // Reads the rendered cascade badly on purpose: only same-file rules count,
  // which is the conservative direction. A false positive costs one explicit
  // line-height; a false negative ships overlapping text.
  const offenders = [];
  for (const page of PAGES) {
    const src = pageCss(page);
    const body = extractRule(src, 'body');
    if (!body || !/var\(--leading-body\)/.test(declarations(body)['line-height'] || '')) continue;

    // Body size in px. --fs-body is 1.125rem against a 16px root at the
    // clamp's floor; the floor is the worst case, since a larger root scales
    // the oversized elements too.
    const bodyPx = 1.125 * 16;

    // Aggregate by selector before judging. A selector routinely sets its
    // line-height in the base rule and then re-declares only font-size inside
    // a media query; the base line-height still applies there, so scoring each
    // rule in isolation would report a break that cannot happen.
    const biggest = new Map();
    const guarded = new Set();
    for (const m of src.matchAll(/([.#][\w-]+)\s*\{([^}]*)\}/g)) {
      const [, sel, decls] = m;
      if (/line-height/.test(decls)) guarded.add(sel);
      const f = /font-size:\s*([\d.]+)(rem|px)/.exec(decls);
      if (!f) continue;
      const px = f[2] === 'rem' ? parseFloat(f[1]) * 16 : parseFloat(f[1]);
      biggest.set(sel, Math.max(biggest.get(sel) || 0, px));
    }
    for (const [sel, px] of biggest) {
      if (px <= bodyPx) continue;          // smaller text only gains air
      if (guarded.has(sel)) continue;
      offenders.push(`${page} ${sel} is ${px.toFixed(1)}px vs a ${bodyPx}px line box`);
    }
  }
  assert.deepEqual(offenders, [],
    `these elements are larger than the inherited line box and set no ` +
    `line-height of their own, so their lines will overlap:\n  ` +
    `${offenders.join('\n  ')}`);
});
