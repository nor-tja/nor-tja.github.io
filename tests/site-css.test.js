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

test('all eleven type tokens are defined', () => {
  const EXPECTED = {
    '--fs-3xs': '.65rem', '--fs-2xs': '.7rem', '--fs-xs': '.8rem',
    '--fs-sm': '.875rem', '--fs-base': '1rem', '--fs-md': '1.1rem',
    '--fs-lg': '1.2rem', '--fs-xl': '1.3rem', '--fs-2xl': '1.5rem',
    '--fs-3xl': '1.6rem', '--fs-body': '18px',
  };
  for (const [name, value] of Object.entries(EXPECTED)) {
    assert.equal(varValue(name), value, `${name} should be ${value}`);
  }
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
