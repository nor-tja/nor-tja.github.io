'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, pagePaths, readPage, pageCss } = require('./helpers');

const PAGES = pagePaths().map((p) => path.basename(p));
const SITE = fs.readFileSync(path.join(ROOT, 'assets/css/site.css'), 'utf8');
const FONTS = fs.readFileSync(path.join(ROOT, 'assets/css/fonts.css'), 'utf8');

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// --font-serif / --font-ui / --font-mono, each mapped to the family it leads
// with. Everything below is expressed against this map rather than against
// family names, so swapping a face is a one-line change in site.css and not a
// rewrite of the test file. The last swap failed three tests that had spelled
// "Cormorant Garamond" into their assertions.
function roleTokens() {
  const out = {};
  for (const m of SITE.matchAll(/(--font-[a-z]+):\s*'?([^,';]+)'?/g)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

test('site.css declares the three role tokens, each with a distinct face', () => {
  const roles = roleTokens();
  assert.deepEqual(Object.keys(roles).sort(), ['--font-mono', '--font-serif', '--font-ui'],
    'the role vocabulary changed; every test below is written against these three');
  const families = Object.values(roles);
  assert.equal(new Set(families).size, 3,
    `two roles lead with the same family (${families.join(', ')}), so one of ` +
    `the three distinctions the design rests on is not actually being drawn`);
});

// The whole point of tokenising 64 declarations. A page that names a family
// directly does not break anything visible today; it just quietly stops
// tracking the rest of the site the next time the face changes, which is
// exactly how the site ended up with seven spellings of two families.
//
// The one exception is named rather than pattern-matched. japanese.html sets a
// CJK stack, because no Japanese face is self-hosted at all: Noto Sans JP
// ships ~124 subset files per weight and that page needs two. See the note at
// the foot of tools/fetch-fonts.js.
const DIRECT_FAMILY_OK = new Set(['japanese.html']);

test('no page names a font family directly; they all go through a role token', () => {
  const offenders = [];
  for (const page of PAGES) {
    if (DIRECT_FAMILY_OK.has(page)) continue;
    for (const m of pageCss(page).matchAll(/font-family:\s*([^;}]+)/g)) {
      const value = m[1].trim();
      if (/^var\(--font-(serif|ui|mono)\)$/.test(value)) continue;
      offenders.push(`${page}: font-family: ${value}`);
    }
  }
  assert.deepEqual(offenders, [],
    `these declarations bypass the role tokens in site.css:\n  ${offenders.join('\n  ')}`);
});

// The exception has to stay an exception. If japanese.html is ever allowed a
// direct family it must be a system stack; the moment it names a face the site
// self-hosts, it has smuggled a fourth spelling back in.
test('the one page allowed a direct family names no self-hosted face', () => {
  const hosted = new Set([...FONTS.matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1]));
  for (const page of DIRECT_FAMILY_OK) {
    for (const m of pageCss(page).matchAll(/font-family:\s*([^;}]+)/g)) {
      for (const family of hosted) {
        assert.ok(!m[1].includes(family),
          `${page} names the self-hosted ${family} directly instead of using a token`);
      }
    }
  }
});

// The role rule, in the only form a test can check it: a monospace is for
// figures and notation, and a tracked-out uppercase run of small caps is by
// definition a name. Before the split this combination appeared 50-odd times
// and was the single thing that made the furniture read as terminal output.
test('the mono face is never used to set a word', () => {
  const offenders = [];
  for (const page of PAGES) {
    // Split on '}' to get one declaration block at a time; these stylesheets
    // have no nested at-rule bodies that carry font-family.
    for (const block of pageCss(page).split('}')) {
      if (!block.includes('var(--font-mono)')) continue;
      if (!/text-transform:\s*uppercase/.test(block)) continue;
      const sel = /([^{;]+)\{/.exec(block);
      offenders.push(`${page}: ${(sel ? sel[1] : block).trim().replace(/\s+/g, ' ')}`);
    }
  }
  assert.deepEqual(offenders, [],
    `these rules set uppercase text in --font-mono, which is reserved for ` +
    `figures and notation:\n  ${offenders.join('\n  ')}`);
});

test('running text is set in the serif', () => {
  const body = /\nbody \{([\s\S]*?)\}/.exec(SITE);
  assert.ok(body, 'site.css has no body rule');
  assert.match(body[1], /font-family:\s*var\(--font-serif\)/,
    'body no longer inherits the serif, so every page is set in whatever the ' +
    'furniture font is and only the headings would look wrong enough to notice');
});

// The two places on the site where a number changes under the reader's eye.
// Both need the mono AND tabular figures: in a proportional face a 1 is
// narrower than a 4, so the clock jitters once a second and the score jumps
// sideways on every apple. This is the reason --font-mono still exists at all,
// so it is worth pinning by name.
test('the readouts that count are monospaced and tabular', () => {
  for (const [page, selector] of [
    ['pomodoro.html', '.time-display'],
    ['snake.html', '.hud span.accent'],
  ]) {
    const rule = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`)
      .exec(pageCss(page));
    assert.ok(rule, `${page} has no ${selector} rule`);
    assert.match(rule[1], /font-family:\s*var\(--font-mono\)/,
      `${page} ${selector} is not set in --font-mono, so its digits change width`);
    assert.match(rule[1], /font-variant-numeric:\s*tabular-nums/,
      `${page} ${selector} does not ask for tabular figures. DM Mono is already ` +
      `fixed-pitch, but the fallbacks in the stack are not.`);
  }
});

// Ask for a weight the stylesheet does not carry and the browser synthesises
// one by smearing the outline sideways. It never fails, it never warns, and it
// looks like a slightly worse version of the right answer -- which is why this
// has to be arithmetic rather than an eyeball.
//
// A rule that sets a weight but no family inherits the serif from body, so
// "the weights the serif must carry" is every weight declared outside a rule
// that has explicitly claimed one of the other two roles.
test('every weight the serif is asked for is actually self-hosted', () => {
  const serif = roleTokens()['--font-serif'];
  const wanted = new Set();
  const sources = [SITE, ...PAGES.map(pageCss)];
  for (const css of sources) {
    for (const block of css.split('}')) {
      if (/var\(--font-(ui|mono)\)/.test(block)) continue;
      for (const m of block.matchAll(/font-weight:\s*(\d+)/g)) wanted.add(m[1]);
    }
  }
  assert.ok(wanted.size, 'no font-weight found anywhere; the parse is wrong');
  const missing = [...wanted].sort()
    .filter((w) => !FONTS.includes(`font-family: '${serif}';\n  font-style: normal;\n  font-weight: ${w};`));
  assert.deepEqual(missing, [],
    `the CSS asks ${serif} for weight ${missing.join(', ')}, which fonts.css ` +
    `does not carry, so the browser will fake it. Add the weight to SRC in ` +
    `tools/fetch-fonts.js and re-run it.`);
});

// Italics are not optional decoration here: every page title has an emphasised
// word in it, and the greeting on the homepage italicises the name.
test('the serif has a real italic rather than a slanted upright', () => {
  const serif = roleTokens()['--font-serif'];
  assert.ok(FONTS.includes(`font-family: '${serif}';\n  font-style: italic;`),
    `fonts.css carries no italic ${serif}. The site uses font-style:italic on ` +
    `every heading, so the browser would shear the upright instead.`);
});

// A preload is a promise that the page needs this file NOW. Preloading a face
// the page never uses is the opposite: it spends a connection on a download
// that is thrown away, and Chrome logs a console warning for it.
//
// Three pages carried a DM Mono preload after the mono role shrank to figures
// and notation, which none of them display.
test('no page preloads a font it has no way of using', () => {
  const roles = roleTokens();
  const bySlug = {};
  for (const [token, family] of Object.entries(roles)) bySlug[slug(family)] = token;

  const wasted = [];
  for (const page of PAGES) {
    const css = pageCss(page) + SITE;
    for (const m of readPage(page).matchAll(/rel="preload"[^>]*href="assets\/fonts\/([^"]+)"/g)) {
      const file = m[1];
      const token = Object.keys(bySlug).filter((s) => file.startsWith(s + '-'))
        .sort((a, b) => b.length - a.length)[0];
      if (!token) { wasted.push(`${page} preloads ${file}, which no role token names`); continue; }
      if (!css.includes(`var(${bySlug[token]})`)) {
        wasted.push(`${page} preloads ${file} but never uses ${bySlug[token]}`);
      }
    }
  }
  assert.deepEqual(wasted, [], `wasted font preloads:\n  ${wasted.join('\n  ')}`);
});
