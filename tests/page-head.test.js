'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, pagePaths, readPage } = require('./helpers');

const CANONICAL_FONTS = 'family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=DM+Mono:wght@300;400;500';

function eachPage(fn) {
  for (const p of pagePaths()) fn(path.basename(p), readPage(path.basename(p)));
}

test('every page has a meta description', () => {
  eachPage((name, src) => {
    assert.match(src, /<meta\s+name="description"\s+content="[^"]{20,}"/,
      `${name} has no meta description`);
  });
});

test('every page has the Open Graph tags a link preview needs', () => {
  for (const tag of ['og:title', 'og:description', 'og:image', 'og:type', 'og:url']) {
    eachPage((name, src) => {
      assert.ok(src.includes(`property="${tag}"`), `${name} is missing ${tag}`);
    });
  }
});

test('every page declares a twitter card', () => {
  eachPage((name, src) => {
    assert.ok(src.includes('name="twitter:card"'), `${name} is missing twitter:card`);
  });
});

test('every og:image points at a file that exists', () => {
  eachPage((name, src) => {
    const m = src.match(/property="og:image"\s+content="([^"]+)"/);
    assert.ok(m, `${name} has no og:image`);
    const rel = m[1].replace(/^https?:\/\/[^/]+\//, '');
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `${name} og:image missing on disk: ${rel}`);
  });
});

test('every page declares exactly one favicon, and it exists on disk', () => {
  eachPage((name, src) => {
    const icons = src.match(/<link rel="icon"[^>]*>/g) || [];
    assert.equal(icons.length, 1,
      `${name} declares ${icons.length} rel="icon" links; two competing ` +
      `declarations leave the choice up to the browser`);

    const href = icons[0].match(/href="([^"]+)"/);
    assert.ok(href, `${name} favicon has no href`);
    assert.ok(!href[1].startsWith('data:'),
      `${name} inlines its favicon as a data URI. Ten pages each carried their ` +
      `own copy of the same icon; a shared file is cached once for the whole site.`);
    assert.ok(fs.existsSync(path.join(ROOT, href[1])),
      `${name} favicon missing on disk: ${href[1]}`);
  });
});

test('all pages request the same Google Fonts URL', () => {
  eachPage((name, src) => {
    const m = src.match(/fonts\.googleapis\.com\/css2\?([^"]+)/);
    if (!m) return;
    assert.ok(m[1].includes(CANONICAL_FONTS),
      `${name} uses a divergent font URL — this causes a cache miss on navigation`);
  });
});

test('every page preconnects to fonts.gstatic.com', () => {
  eachPage((name, src) => {
    if (!src.includes('fonts.googleapis.com')) return;
    assert.match(src, /preconnect"\s+href="https:\/\/fonts\.gstatic\.com"\s+crossorigin/,
      `${name} preconnects only to googleapis; the font files come from gstatic`);
  });
});

test('third-party scripts are not render-blocking', () => {
  eachPage((name, src) => {
    const headEnd = src.indexOf('</head>');
    const head = src.slice(0, headEnd === -1 ? src.length : headEnd);
    const tags = head.match(/<script[^>]+src="https?:\/\/[^"]+"[^>]*>/g) || [];
    for (const tag of tags) {
      assert.ok(/\bdefer\b|\basync\b/.test(tag),
        `${name} loads a render-blocking third-party script: ${tag}`);
    }
  });
});
