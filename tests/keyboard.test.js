'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pagePaths, readPage } = require('./helpers');

const PAGES = pagePaths().map((p) => path.basename(p));
const LANGUAGE_PAGES = [
  'mots-du-jour.html', 'spanish.html', 'portuguese.html',
  'japanese.html', 'ukrainian.html',
];

// The learned dot is the only control that records progress. Built as a <span>
// with a click listener it was unreachable by keyboard, had no role, and
// announced no state -- a mouse-only feature on a page whose whole purpose is
// daily repetition.
test('the learned dot is a real button on every language page', () => {
  for (const page of LANGUAGE_PAGES) {
    const src = readPage(page);
    assert.ok(!/createElement\('span'\);\s*\n\s*dot\./.test(src),
      `${page} still builds the learned dot as a <span>`);
    assert.match(src, /var dot = document\.createElement\('button'\)/,
      `${page} must build the learned dot as a <button>`);
    assert.match(src, /dot\.type = 'button'/,
      `${page} must set type="button"; a bare button inside a form submits it`);
  }
});

// A class name is a styling hook, not a state announcement. Without
// aria-pressed a screen reader reads the same thing before and after the tap.
test('the learned dot announces its pressed state, and keeps it in sync', () => {
  for (const page of LANGUAGE_PAGES) {
    const src = readPage(page);
    const sets = src.match(/dot\.setAttribute\('aria-pressed'/g) || [];
    assert.ok(sets.length >= 2,
      `${page} sets aria-pressed ${sets.length} time(s). It needs one at ` +
      `creation and one inside the click handler, or the announced state ` +
      `drifts from the visible one after the first tap.`);
  }
});

// Every dot on the page is visually identical, so "button" alone tells a
// screen reader user nothing about which word they are marking.
test('the learned dot names the word it belongs to', () => {
  for (const page of LANGUAGE_PAGES) {
    assert.match(readPage(page), /dot\.setAttribute\('aria-label',\s*'Mark ' \+ fr/,
      `${page} must give the dot an aria-label naming its word`);
  }
});

// A <button> arrives with a platform background, border and font. The site
// reset zeroes margin and padding but not appearance, so without an explicit
// reset the hollow 9px circle renders as a grey OS button.
test('the learned dot is visually reset from platform button styling', () => {
  for (const page of LANGUAGE_PAGES) {
    const m = /\.learned-dot\s*\{([^}]*)\}/.exec(readPage(page));
    assert.ok(m, `${page} has no .learned-dot rule`);
    for (const prop of ['background', 'padding', 'appearance']) {
      assert.match(m[1], new RegExp(`(^|[;\\s])${prop}\\s*:`),
        `${page} .learned-dot does not reset ${prop}`);
    }
  }
});

// WCAG 2.5.8 puts the floor at 24x24 CSS px. The visible ring is 9px and
// should stay 9px -- it is a dot, not a checkbox -- so the target is widened
// with a transparent overlay instead. Guarding the overlay rather than the
// ring is the point: someone tidying up "an empty ::after that does nothing"
// would silently take the tap target back to 9px.
test('the learned dot is at least 24x24 to tap', () => {
  for (const page of LANGUAGE_PAGES) {
    const src = readPage(page);
    const m = /\.learned-dot::after\s*\{([^}]*)\}/.exec(src);
    assert.ok(m, `${page} has no .learned-dot::after; the tap target is ` +
      `whatever the 9px ring is, which is a third of the WCAG 2.5.8 minimum`);
    const decls = m[1];
    for (const axis of ['width', 'height']) {
      const v = new RegExp(`${axis}:\\s*(\\d+(?:\\.\\d+)?)px`).exec(decls);
      assert.ok(v, `${page} .learned-dot::after sets no ${axis} in px`);
      assert.ok(Number(v[1]) >= 24,
        `${page} .learned-dot::after is ${v[1]}px ${axis}; WCAG 2.5.8 asks 24`);
    }
    assert.match(decls, /position:\s*absolute/,
      `${page} the overlay must be absolutely positioned, or it changes the ` +
      `dot's own box and pushes the card layout around`);
    assert.match(/\.learned-dot\s*\{([^}]*)\}/.exec(src)[1], /position:\s*relative/,
      `${page} .learned-dot needs position:relative or the 24px overlay ` +
      `centres on the nearest positioned ancestor instead of the dot`);
  }
});

// Catches the general version of the same mistake anywhere on the site: an
// element given a click listener but no way to receive focus.
test('no page attaches a click listener to a non-focusable created element', () => {
  const offenders = [];
  for (const page of PAGES) {
    const src = readPage(page);
    for (const m of src.matchAll(
      /var (\w+) = document\.createElement\('(span|div)'\)([\s\S]{0,600}?)\1\.addEventListener\('click'/g
    )) {
      const [, name, tag, between] = m;
      if (/tabIndex|tabindex|setAttribute\('role'/.test(between)) continue;
      // A keydown handler beside the click one means keyboard access was
      // handled deliberately, as resources.html does for its video posters.
      if (new RegExp(`${name}\\.addEventListener\\('keydown'`).test(src)) continue;
      offenders.push(`${page}: <${tag}> "${name}" is clickable but not focusable`);
    }
  }
  assert.deepEqual(offenders, [],
    `these elements can be clicked but never reached by keyboard:\n  ` +
    `${offenders.join('\n  ')}`);
});
