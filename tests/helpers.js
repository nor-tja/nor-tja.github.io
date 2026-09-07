'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function pagePaths() {
  return fs.readdirSync(ROOT)
    .filter((f) => f.endsWith('.html'))
    .sort()
    .map((f) => path.join(ROOT, f));
}

function readPage(name) {
  return fs.readFileSync(path.join(ROOT, name), 'utf8');
}

function sizeOf(name) {
  return fs.statSync(path.join(ROOT, name)).size;
}

// The two shared foundations. They are linked by every page and have their own
// tests; the page-level assertions are about what a PAGE contributes on top.
const FOUNDATIONS = new Set(['assets/css/site.css', 'assets/css/fonts.css']);

// A page's own CSS, in cascade order: any page-level stylesheet it links,
// followed by its inline <style>.
//
// Before the language pages were consolidated, "the page's CSS" and "the text
// between <style> and </style>" were the same thing, and the tests read the
// HTML directly. They are not the same thing any more: five pages now keep
// their rules in assets/css/language-page.css. Reading only the inline block
// would quietly stop checking those pages rather than fail -- the most
// dangerous shape a test can take.
function pageCss(name) {
  const src = readPage(name);
  let out = '';
  for (const m of src.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)) {
    const href = m[1];
    if (/^(https?:)?\/\//.test(href) || FOUNDATIONS.has(href)) continue;
    out += fs.readFileSync(path.join(ROOT, href), 'utf8') + '\n';
  }
  const inline = /<style>([\s\S]*?)<\/style>/.exec(src);
  if (inline) out += inline[1];
  return out;
}

// The JavaScript a page actually runs: every local <script src> it loads, in
// order, followed by its inline <script>.
//
// Same reasoning as pageCss. The learned dot, the SRS queue and the speech
// code moved into assets/js/language-page.js; a test still reading the HTML
// would find none of it. Assertions about the <script> TAG -- that a page
// loads the engine at all, or loads it in the right order -- belong on
// readPage, because that is a fact about the page rather than about the code.
function pageJs(name) {
  const src = readPage(name);
  let out = '';
  for (const m of src.matchAll(/<script[^>]+src="([^"]+)"[^>]*>/g)) {
    const s = m[1];
    if (/^(https?:)?\/\//.test(s)) continue;
    out += fs.readFileSync(path.join(ROOT, s), 'utf8') + '\n';
  }
  for (const m of src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    out += m[1] + '\n';
  }
  return out;
}

module.exports = { ROOT, pagePaths, readPage, sizeOf, pageCss, pageJs };
