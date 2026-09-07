'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, pagePaths, readPage } = require('./helpers');

const SITE_CSS = fs.readFileSync(path.join(ROOT, 'assets/css/site.css'), 'utf8');
const PAGES = pagePaths().map((p) => path.basename(p));

// Same tolerance tools/normalize-type.js applies. Declared once here so the
// test cannot drift away from the tool it is checking.
const TOLERANCE = 0.05;

function styleBlock(src) {
  const m = /<style>([\s\S]*?)<\/style>/.exec(src);
  return m ? m[1] : '';
}

// --fs-* tokens as site.css actually defines them, not as anyone remembers.
function scaleFromSiteCss() {
  const out = new Map();
  for (const m of SITE_CSS.matchAll(/(--fs-[\w-]+)\s*:\s*([\d.]+)rem/g)) {
    if (m[1] === '--fs-body') continue;   // the body's own size, not a step
    out.set(m[1], parseFloat(m[2]));
  }
  return out;
}

function literalFontSizes(css) {
  const out = [];
  for (const m of css.matchAll(/font-size:\s*([^;}]+)/g)) {
    const v = m[1].trim();
    if (/^var\(|^clamp\(/.test(v)) continue;
    out.push(v);
  }
  return out;
}

test('site.css defines the ten scale steps the normalizer assumes', () => {
  const scale = scaleFromSiteCss();
  assert.equal(scale.size, 10,
    `expected 10 --fs-* steps beside --fs-body, found ${scale.size}. ` +
    `tools/normalize-type.js carries its own copy of this list; if the scale ` +
    `changed, that copy has to change with it or it will substitute the ` +
    `wrong token.`);
});

// A typo like var(--fs-xxs) is not a build error anywhere in this stack. The
// browser drops the declaration and the element silently renders at the
// inherited size, which on a 10px uppercase label looks almost plausible.
test('every --fs- token a page references is defined in site.css', () => {
  const scale = scaleFromSiteCss();
  const unknown = [];
  for (const page of PAGES) {
    for (const m of styleBlock(readPage(page)).matchAll(/var\((--fs-[\w-]+)\)/g)) {
      if (m[1] !== '--fs-body' && !scale.has(m[1])) unknown.push(`${page} -> ${m[1]}`);
    }
  }
  assert.deepEqual(unknown, [],
    `these pages reference tokens that do not exist:\n  ${unknown.join('\n  ')}`);
});

// The normalizer is only useful if it stays run. Without this, the next hand
// edit reintroduces a literal .9rem beside twenty var(--fs-sm) and nothing
// objects.
test('no literal font-size sits within tolerance of a token', () => {
  const scale = [...scaleFromSiteCss().entries()];
  const strays = [];
  for (const page of PAGES) {
    for (const value of literalFontSizes(styleBlock(readPage(page)))) {
      if (!/rem$/.test(value)) continue;               // px is out of scope
      const rem = parseFloat(value);
      for (const [name, tokenRem] of scale) {
        if (Math.abs(tokenRem - rem) / rem <= TOLERANCE) {
          strays.push(`${page}: ${value} is within tolerance of ${name}`);
          break;
        }
      }
    }
  }
  assert.deepEqual(strays, [],
    `run node tools/normalize-type.js -- these could be tokens:\n  ` +
    `${strays.join('\n  ')}`);
});

// Characterisation pin, in the same spirit as FOOTER_PADDING and
// WRAP_MAX_WIDTH: these are the sizes deliberately left off the scale because
// snapping them would have been visible. The pin is exact so that new drift
// has to be an explicit decision rather than something that accumulates.
//
// The concentration below .7rem is the real story: the scale bottoms out at
// .65rem while the site wants finer steps than that for its uppercase labels.
const OFF_SCALE = {
  '.6rem': 17,
  '.58rem': 8,
  '.95rem': 7,
  '0.95rem': 2,
  '11px': 1,
  '12px': 1,
  '.55rem': 1,
  '0.5rem': 1,
  '1.4rem': 1,
};

test('the off-scale tail is exactly the known set', () => {
  const found = new Map();
  for (const page of PAGES) {
    for (const value of literalFontSizes(styleBlock(readPage(page)))) {
      found.set(value, (found.get(value) || 0) + 1);
    }
  }
  assert.deepEqual(
    Object.fromEntries([...found.entries()].sort()),
    Object.fromEntries(Object.entries(OFF_SCALE).sort()),
    'the set of off-scale font sizes changed. If that was deliberate, update ' +
    'OFF_SCALE; if not, a literal size crept back in.'
  );
});
