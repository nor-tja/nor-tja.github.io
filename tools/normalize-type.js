#!/usr/bin/env node
/* Replace literal font-size values with the shared type tokens, but only where
 * doing so cannot be seen.
 *
 * The site had 240 literal font-size declarations against a 10-step token
 * scale. Snapping all of them would have been a redesign, not a cleanup: the
 * scale bottoms out at .65rem while the site uses eight distinct sizes below
 * .7rem, so the smallest labels would have grown by up to 30%.
 *
 * So this tool substitutes a token only when the token is within TOLERANCE of
 * the literal it replaces. Everything outside that band is left exactly as
 * written and reported at the end, because a silent 12% jump in a caption is
 * the kind of change nobody notices until the page looks subtly wrong.
 *
 * px values are never touched. Converting 11px to a rem token would make it
 * scale with the fluid root in a way it does not today -- a behaviour change
 * wearing the costume of a rename.
 *
 * Idempotent: safe to re-run. Run from anywhere: node tools/normalize-type.js
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// The largest relative difference between a literal and the token replacing it.
// At the fluid root's 18px ceiling, 5% of even the largest tokenised size is
// under a pixel.
const TOLERANCE = 0.05;

// Mirrors :root in assets/css/site.css. --fs-body is deliberately absent: it is
// the body's own size, not a step on the scale.
const TOKENS = [
  ['--fs-4xs', 0.6], ['--fs-3xs', 0.65], ['--fs-2xs', 0.7], ['--fs-xs', 0.8],
  ['--fs-sm', 0.875], ['--fs-base', 1], ['--fs-md', 1.1], ['--fs-lg', 1.2],
  ['--fs-xl', 1.3], ['--fs-2xl', 1.5], ['--fs-3xl', 1.6],
];

function nearest(rem) {
  let best = null;
  let bestDelta = Infinity;
  for (const [name, value] of TOKENS) {
    const delta = Math.abs(value - rem) / rem;
    if (delta < bestDelta) { bestDelta = delta; best = { name, value, delta }; }
  }
  return best;
}

const skipped = new Map();   // literal -> count, for the closing report
let replaced = 0;
let pagesChanged = 0;

for (const file of fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).sort()) {
  const full = path.join(ROOT, file);
  const before = fs.readFileSync(full, 'utf8');

  // Only rewrite inside the page's own <style>. A font-size in an inline
  // style attribute or a script string is not ours to touch.
  const src = before.replace(/(<style>)([\s\S]*?)(<\/style>)/, (_, open, css, close) =>
    open + css.replace(/font-size:\s*([^;}]+)/g, (whole, raw) => {
      const value = raw.trim();
      // Already a token, a clamp(), or anything non-literal: leave it.
      if (!/^0?\.\d+rem$|^\d+(\.\d+)?rem$/.test(value)) {
        if (!/^var\(|^clamp\(/.test(value)) {
          skipped.set(value, (skipped.get(value) || 0) + 1);
        }
        return whole;
      }
      const rem = parseFloat(value);
      const match = nearest(rem);
      if (match.delta > TOLERANCE) {
        skipped.set(value, (skipped.get(value) || 0) + 1);
        return whole;
      }
      replaced++;
      return `font-size: var(${match.name})`;
    }) + close);

  if (src !== before) {
    fs.writeFileSync(full, src);
    pagesChanged++;
    console.log(`  normalised ${file}`);
  } else {
    console.log(`  unchanged   ${file}`);
  }
}

console.log(`\n${replaced} declarations tokenised across ${pagesChanged} pages.`);
if (skipped.size) {
  const rows = [...skipped.entries()].sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((n, [, c]) => n + c, 0);
  console.log(`\n${total} left as literals -- further than ${TOLERANCE * 100}% from any token:`);
  for (const [value, count] of rows) {
    const rem = parseFloat(value);
    const note = /rem$/.test(value)
      ? `nearest ${nearest(rem).name} is ${(nearest(rem).delta * 100).toFixed(1)}% away`
      : 'not a rem value';
    console.log(`  ${value.padEnd(9)} x${String(count).padEnd(3)} ${note}`);
  }
}
