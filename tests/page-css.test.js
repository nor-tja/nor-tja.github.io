'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pagePaths, readPage } = require('./helpers');

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
    const decls = declarations(extractRule(readPage(page), 'footer'));
    assert.equal(decls['padding'], expected,
      `${page} footer padding should still be "${expected}"`);
  }
});

test('index.html still has no footer rule', () => {
  assert.equal(extractRule(readPage('index.html'), 'footer'), null,
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
    const decls = declarations(extractRule(readPage(page), '.wrap'));
    assert.equal(decls['max-width'], expected,
      `${page} .wrap max-width should still be "${expected}"`);
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
test('site.css is linked before the page\'s own <style>', () => {
  for (const page of PAGES) {
    const src = readPage(page);
    const link = src.indexOf(LINK);
    const style = src.indexOf('<style>');
    assert.ok(link !== -1 && style !== -1, `${page} is missing the link or <style>`);
    assert.ok(link < style,
      `${page} links site.css AFTER its <style> block; inline rules would ` +
      `stop overriding the shared ones`);
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
    const decls = declarations(extractRule(readPage(page), 'body'));
    assert.equal(decls['font-size'], undefined,
      `${page} deliberately has no body font-size; it must not acquire one`);
  }
});
