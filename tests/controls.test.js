'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, pagePaths, pageCss } = require('./helpers');

const PAGES = pagePaths().map((p) => path.basename(p));
const SITE = fs.readFileSync(path.join(ROOT, 'assets/css/site.css'), 'utf8');

// Same reason as in typography.test.js: a rule's selector is read as "the text
// before the {", so a twenty-line comment above a rule becomes part of its
// selector unless the comments come out first.
const decomment = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const CSS_SOURCES = [['site.css', SITE], ...PAGES.map((p) => [p, pageCss(p)])]
  .map(([name, css]) => [name, decomment(css)]);

// Every rule that draws a bordered box you can click. That is the set the
// "round on the edges" decision applies to: a control with no border has no
// edges to round, which is why the underlined text buttons (.daily-reset,
// .palette-shuffle, .ambience-toggle -- all `border:none; background:none`)
// are not in scope and are not failures.
function borderedControls() {
  const out = [];
  for (const [file, css] of CSS_SOURCES) {
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1].trim().replace(/\s+/g, ' ');
      const body = m[2];
      if (!/cursor:\s*pointer/.test(body)) continue;
      if (!/border:\s*\d/.test(body)) continue;           // `border:none` is out
      const r = /border-radius:\s*([^;]+)/.exec(body);
      if (!r) continue;
      out.push({ file, sel, radius: r[1].trim() });
    }
  }
  return out;
}

// The four that were square, plus the one that already was not. Named, because
// "all buttons are pills" is a decision someone made on purpose and a list is
// how the next person finds out it was on purpose.
const PILLS = ['.btn', '.review-btn', '.ambience-btn', '.ambience-chip', '.pad button'];

test('every button that was square is now a pill', () => {
  const found = borderedControls();
  const wrong = [];
  for (const want of PILLS) {
    const hits = found.filter((c) => c.sel === want);
    if (!hits.length) {
      wrong.push(`${want} is gone, or stopped being a bordered control`);
      continue;
    }
    for (const h of hits) {
      if (h.radius !== '999px') wrong.push(`${h.file} ${h.sel} is ${h.radius}, not 999px`);
    }
  }
  assert.deepEqual(wrong, [], `the buttons are meant to be fully rounded:\n  ${wrong.join('\n  ')}`);
});

// The list above can go stale by addition: someone writes a new button, gives
// it the 2px that used to be the house style, and every named test still
// passes. So this one does not read the list at all -- it looks at every
// bordered control there is and objects to a corner that is barely rounded.
//
// 8px is the floor rather than 999px because not everything clickable is a
// pill and should not be. .palette-swatch is a little card with colour dots
// stacked over a name; at 999px a box that shape turns into a stadium. It sits
// at 10px and that is a considered value, not an oversight.
const SQUARE_ENOUGH = 8;

test('no bordered control is left with a square corner', () => {
  const square = [];
  for (const c of borderedControls()) {
    if (c.radius === '50%' || c.radius.endsWith('%')) continue;   // circles are round already
    const px = parseFloat(c.radius);
    if (Number.isNaN(px)) continue;
    if (px < SQUARE_ENOUGH) square.push(`${c.file} ${c.sel} is ${c.radius}`);
  }
  assert.deepEqual(square, [],
    `these are clickable, bordered, and still have square corners:\n  ${square.join('\n  ')}`);
});

// The global focus ring sets a radius of its own. It has the same specificity
// as a plain class selector, so which one wins is decided purely by which
// stylesheet loads last -- and every button rule happens to live in a later
// sheet than site.css. That is true today and nothing was enforcing it, so a
// pill button would have squared off the moment it was focused if any of these
// rules ever moved into site.css.
test('the focus ring does not square off the buttons it lands on', () => {
  const ring = /:focus-visible\s*\{([^}]*)\}/.exec(decomment(SITE));
  if (!ring || !/border-radius/.test(ring[1])) return;   // nothing to collide with
  const offenders = borderedControls()
    .filter((c) => c.file === 'site.css')
    .map((c) => `${c.sel} is declared in site.css, alongside :focus-visible`);
  assert.deepEqual(offenders, [],
    `:focus-visible sets border-radius and has equal specificity to a class, so a ` +
    `button declared in the same file will be squared off while focused:\n  ${offenders.join('\n  ')}`);
});
