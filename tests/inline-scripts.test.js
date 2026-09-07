'use strict';
const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const path = require('node:path');
const { pagePaths, readPage } = require('./helpers');

// Inline <script> blocks only: those with a src= attribute have no body.
const INLINE = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;

function inlineBlocks(src) {
  const out = [];
  let m;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(src))) out.push({ code: m[1], at: m.index });
  return out;
}

function eachPage(fn) {
  for (const p of pagePaths()) fn(path.basename(p), readPage(path.basename(p)));
}

// Blanks out comments, preserving length so indices still line up with the
// original source. String literals are skipped over but left intact.
//
// This is not decoration. The first version of the guard below searched the
// raw text for the word "DOMContentLoaded", and the explanatory comment above
// the map setup contains that word — so the comment alone satisfied the check
// and the test passed against genuinely broken code.
//
// Strings have to be tracked (so that the "//" in a URL like
// "https://unpkg.com/..." is not mistaken for the start of a comment) but must
// NOT be blanked: the listener is registered as addEventListener('DOM...'),
// so erasing string bodies would destroy the very thing being matched. That
// mistake made the guard fail against correct code as well as broken code.
function blankNonCode(src) {
  const out = src.split('');
  let i = 0;
  const blank = (from, to) => {
    for (let k = from; k < to && k < out.length; k++) {
      if (out[k] !== '\n') out[k] = ' ';
    }
  };
  while (i < src.length) {
    const c = src[i], next = src[i + 1];
    if (c === '/' && next === '/') {
      const end = src.indexOf('\n', i);
      blank(i, end === -1 ? src.length : end);
      i = end === -1 ? src.length : end;
    } else if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      blank(i, end === -1 ? src.length : end + 2);
      i = end === -1 ? src.length : end + 2;
    } else if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === c) break;
        j++;
      }
      i = j + 1; // skip the literal, leave its contents alone
    } else {
      i++;
    }
  }
  return out.join('');
}

// There is no build step and no bundler, so nothing checks these files before
// they reach a browser. A stray brace ships silently and the page just stops
// working. vm.Script compiles without executing, which is exactly the check a
// bundler would have given us.
test('every inline script parses', () => {
  eachPage((name, src) => {
    inlineBlocks(src).forEach(({ code }, i) => {
      assert.doesNotThrow(
        () => new vm.Script(code),
        `${name} inline script block #${i + 1} is not valid JavaScript`
      );
    });
  });
});

// Regression guard. Leaflet was made `defer` to stop it blocking first paint,
// but coffee.html builds its map from an INLINE script, and inline scripts run
// at parse time -- before any deferred script has executed. `L` was therefore
// undefined and the map died on load. Deferred scripts do run before
// DOMContentLoaded, so gating on that event is the fix.
//
// Anything deferred creates this hazard, so the check is written against the
// general rule rather than against Leaflet specifically.
const DEFERRED_GLOBALS = [
  { pattern: /unpkg\.com\/leaflet/, global: 'L', label: 'Leaflet' }
];

test('inline scripts do not touch a deferred library before DOMContentLoaded', () => {
  eachPage((name, src) => {
    for (const { pattern, global, label } of DEFERRED_GLOBALS) {
      const tag = src.match(new RegExp(`<script[^>]+src="[^"]*${pattern.source}[^"]*"[^>]*>`));
      if (!tag) continue;
      if (!/\bdefer\b|\basync\b/.test(tag[0])) continue; // loaded synchronously, no hazard

      const use = new RegExp(`\\b${global}\\s*\\.`);
      // Match the actual listener registration, not the bare word: the word
      // appears in comments, and a comment does not gate anything.
      const gate = /addEventListener\(\s*['"]DOMContentLoaded['"]/;
      for (const { code: raw } of inlineBlocks(src)) {
        const code = blankNonCode(raw);
        const firstUse = code.search(use);
        if (firstUse === -1) continue;
        const ready = code.search(gate);
        assert.ok(
          ready !== -1 && ready < firstUse,
          `${name} uses ${global}. from an inline script at parse time, but ${label} ` +
          `is deferred and has not executed yet — ${global} is undefined here. ` +
          `Move the code inside a DOMContentLoaded listener, which fires after ` +
          `deferred scripts run.`
        );
      }
    }
  });
});
