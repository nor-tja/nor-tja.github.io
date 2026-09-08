'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./helpers');

const CSS_PATH = path.join(ROOT, 'assets/css/site.css');
const css = () => fs.readFileSync(CSS_PATH, 'utf8');

// WCAG 2.1 relative luminance. Computed from the hex rather than compared
// against an expected string: a string check would pass for any colour someone
// typed in, including a wrong one, which defeats the point of the test.
function luminance(hex) {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (hi + 0.05) / (lo + 0.05);
}

function varValue(name) {
  const m = new RegExp(`${name}\\s*:\\s*([^;}]+)`).exec(css());
  assert.ok(m, `site.css does not define ${name}`);
  return m[1].trim();
}

test('site.css exists', () => {
  assert.ok(fs.existsSync(CSS_PATH), 'assets/css/site.css is missing');
});

// The 9-10px uppercase labels are almost all --muted on --bg. At 4.08:1 they
// were below the AA floor, which is a legibility defect, not a style opinion.
test('--muted on --bg meets WCAG AA for normal text', () => {
  const ratio = contrast(varValue('--muted'), varValue('--bg'));
  assert.ok(ratio >= 4.5,
    `--muted (${varValue('--muted')}) on --bg (${varValue('--bg')}) is ` +
    `${ratio.toFixed(3)}:1, below the 4.5:1 AA threshold`);
});

test('the accent colour is also readable on the background', () => {
  const ratio = contrast(varValue('--accent'), varValue('--bg'));
  assert.ok(ratio >= 4.5,
    `--accent on --bg is ${ratio.toFixed(3)}:1, below 4.5:1`);
});

// 1.4.11, the one nobody remembers, because it is not about text. A control
// drawn as nothing but a hairline ring -- the play buttons, the learned dots,
// the D-pad, the voice picker, all background:transparent -- has no fill and
// no label inside it, so the border carries the whole job of saying "this is
// a thing you can press". That makes it required to identify the component,
// which puts the floor at 3:1. --line, correctly, does not clear it: a rule
// between two paragraphs is decorative and exempt. That is why there are two
// tokens, and why only one of them is tested here.
test('--line-strong clears the 3:1 floor for control borders', () => {
  const ratio = contrast(varValue('--line-strong'), varValue('--bg'));
  assert.ok(ratio >= 3,
    `--line-strong (${varValue('--line-strong')}) on --bg is ` +
    `${ratio.toFixed(3)}:1, below the 3:1 floor WCAG 1.4.11 sets for the ` +
    `boundary of a user interface component`);
});

// The pairing has to stay in that order. If someone "tidies up" by setting
// --line-strong back to --line, every assertion above still passes and the
// controls quietly go invisible again.
test('the two line tokens are actually different weights', () => {
  assert.notStrictEqual(varValue('--line-strong'), varValue('--line'),
    '--line-strong has been collapsed back into --line; the transparent ' +
    'controls have no visible boundary again');
});

test('all eleven type tokens are defined', () => {
  const EXPECTED = {
    '--fs-3xs': '.65rem', '--fs-2xs': '.7rem', '--fs-xs': '.8rem',
    '--fs-sm': '.875rem', '--fs-base': '1rem', '--fs-md': '1.1rem',
    '--fs-lg': '1.2rem', '--fs-xl': '1.3rem', '--fs-2xl': '1.5rem',
    '--fs-3xl': '1.6rem', '--fs-body': '1.125rem',
  };
  for (const [name, value] of Object.entries(EXPECTED)) {
    assert.equal(varValue(name), value, `${name} should be ${value}`);
  }
});

// A px clamp on the root would pin the whole site to 16px regardless of the
// reader's browser default, silently overriding the one accessibility control
// every browser ships. rem on the root element resolves against font-size's
// initial value -- the reader's own setting -- so the scale moves with them.
test('the fluid root scale is expressed in rem, not px', () => {
  const m = /html\s*\{[^}]*font-size:\s*clamp\(([^)]*)\)/.exec(css());
  assert.ok(m, 'site.css does not set a clamp() font-size on html');
  const [min, , max] = m[1].split(',').map((s) => s.trim());
  for (const [label, bound] of [['minimum', min], ['maximum', max]]) {
    assert.ok(!/\d\s*px/.test(bound),
      `the ${label} of the root clamp is "${bound}", which uses px. ` +
      `A px bound ignores the reader's browser font-size setting.`);
  }
});

// The point of the token is that it is a LENGTH. A unitless value is
// re-multiplied by each descendant's own font-size, which is precisely the
// per-block rhythm drift it exists to remove.
test('--leading-body is an absolute length, not a bare multiplier', () => {
  const v = varValue('--leading-body');
  assert.match(v, /^[\d.]+(rem|em|px)$/,
    `--leading-body is "${v}"; it must carry a unit to inherit as one ` +
    `computed line box rather than being re-multiplied per element.`);
});

// Both tokens are rem-based so the fluid root moves them together. If someone
// later pins one to px, the ratio silently drifts as the viewport widens --
// tight lines on a desktop, loose ones on a phone, and no error anywhere.
test('leading keeps a constant ratio to body text across the fluid range', () => {
  const toRem = (v) => {
    const m = /^([\d.]+)rem$/.exec(v);
    assert.ok(m, `expected a rem value, got "${v}"`);
    return parseFloat(m[1]);
  };
  const ratio = toRem(varValue('--leading-body')) / toRem(varValue('--fs-body'));
  assert.ok(ratio >= 1.55 && ratio <= 1.8,
    `leading:body ratio is ${ratio.toFixed(3)}, outside the 1.55-1.8 band that ` +
    `reads comfortably for a serif at this measure`);
});

// Nothing on the site had a focus style, so keyboard navigation was invisible.
test('site.css defines a visible :focus-visible outline', () => {
  const src = css();
  const m = /:focus-visible\s*\{([^}]*)\}/.exec(src);
  assert.ok(m, 'site.css has no :focus-visible rule');
  assert.match(m[1], /outline\s*:\s*(?!none)/,
    ':focus-visible must set a real outline, not none');
});

// Collapsing durations rather than disabling animation is load-bearing: several
// elements start at opacity:0 and are revealed BY the rise animation, so
// `animation: none` would leave them permanently invisible.
test('reduced-motion collapses durations instead of disabling animation', () => {
  const src = css();
  const m = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?\n\})/.exec(src);
  assert.ok(m, 'site.css has no prefers-reduced-motion block');
  const body = m[1];
  assert.match(body, /animation-duration\s*:\s*\.01ms/,
    'must collapse animation-duration');
  assert.ok(!/animation\s*:\s*none/.test(body),
    'must NOT use `animation: none` — elements that start at opacity:0 and are ' +
    'revealed by @keyframes rise would never become visible');
});
