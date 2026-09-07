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

// Every stylesheet that sets type, labelled. pageCss() already folds in the
// shared language-page.css for the five pages that link it, so a bad rule
// there is reported once per page rather than once -- which is noisier, and
// also true: it does affect all five.
//
// Comments are stripped first. The tests below read a block's selector as
// "the text before the {", and this file's comments are long: without this,
// a rule preceded by twenty lines of prose has a twenty-line selector, and a
// check for the selector being exactly `body` can never match. That is not
// hypothetical -- it made the "never thin running text" guard silent, and the
// mutation that proved it is the reason this line exists.
const decomment = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const CSS_SOURCES = [['site.css', SITE], ...PAGES.map((p) => [p, pageCss(p)])]
  .map(([name, css]) => [name, decomment(css)]);

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

// EB Garamond's wght axis starts at 400: there is no lighter cut, and Google
// answers a request for 300 with the 400 file. So the only way to make large
// text lighter is to stop macOS fattening the strokes, which takes TWO
// properties -- WebKit and Firefox each have their own -- and one of them
// alone silently fixes half the browsers.
const SMOOTHING = [
  ['-webkit-font-smoothing', 'antialiased'],
  ['-moz-osx-font-smoothing', 'grayscale'],
];

// Where the serif runs at display size and therefore gets the treatment.
// Named rather than derived from font-size, because h1 picks it up from an
// element selector in site.css while the other two are page rules -- that is
// the cascade, and no scan of font-size declarations can see it. A fourth
// display-size rule means a fourth line here.
const DISPLAY_RULES = [
  ['site.css', 'h1'],
  ['index.html', '.greeting'],
  ['mots-du-jour.html', '.word-fr'],   // shared by all five language pages
];

test('the serif is thinned everywhere it runs at display size', () => {
  for (const [file, selector] of DISPLAY_RULES) {
    const css = file === 'site.css' ? SITE : pageCss(file);
    const rule = new RegExp(`(^|[},\\s])${selector.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`, 'm')
      .exec(css);
    assert.ok(rule, `${file} has no ${selector} rule`);
    for (const [prop, value] of SMOOTHING) {
      assert.match(rule[2], new RegExp(`${prop}\\s*:\\s*${value}`),
        `${file} ${selector} runs at display size but does not set ${prop}. ` +
        `EB Garamond has no cut below 400, so this is the only lever left; ` +
        `without it the text goes back to being the heaviest thing on the page.`);
    }
  }
});

test('font smoothing is always declared as a pair', () => {
  const bad = [];
  for (const [name, css] of CSS_SOURCES) {
    for (const block of css.split('}')) {
      const has = SMOOTHING.map(([prop]) => new RegExp(`${prop}\\s*:`).test(block));
      if (!has[0] && !has[1]) continue;
      const sel = (/([^{;]+)\{/.exec(block) || [, block]).pop().trim().replace(/\s+/g, ' ');
      for (const [i, [prop, value]] of SMOOTHING.entries()) {
        if (!has[i]) bad.push(`${name}: ${sel} sets no ${prop}`);
        else if (!new RegExp(`${prop}\\s*:\\s*${value}`).test(block)) {
          bad.push(`${name}: ${sel} sets ${prop} to something other than ${value}`);
        }
      }
    }
  }
  assert.deepEqual(bad, [], `half-applied font smoothing:\n  ${bad.join('\n  ')}`);
});

// The reason it is scoped to headings. Thinning 18px running text by 20% is
// the exact complaint that got Cormorant Garamond replaced; putting this on
// body or on * would undo that swap without changing a single font file.
test('running text is never thinned by font smoothing', () => {
  const bad = [];
  for (const [name, css] of CSS_SOURCES) {
    for (const block of css.split('}')) {
      if (!/-font-smoothing\s*:/.test(block)) continue;
      const sel = (/([^{;]+)\{/.exec(block) || [, ''])[1] || '';
      for (const part of sel.split(',')) {
        const s = part.trim();
        if (s === 'body' || s === 'html' || s === '*' || s === ':root') {
          bad.push(`${name}: "${s}" thins every word on the page, not just the big ones`);
        }
      }
    }
  }
  assert.deepEqual(bad, [], `${bad.join('\n  ')}`);
});

// The defect this pins, twice reported: a serif rule that is BOTH large and
// heavy. The 500 tier exists so a name can be picked out of body copy at body
// size. Above ~23px, size has already done that, and EB Garamond's 500 is a
// good deal blacker than the Cormorant 400 the site used to set these in --
// so the two compound and the word reads as shouting.
//
// 1.3rem is where the tokens put --fs-xl, and --fs-xl at 500 was one of the
// two rules that prompted this.
const DISPLAY_REM = 1.3;

test('no serif rule is both display-size and heavy', () => {
  const tokens = {};
  for (const m of SITE.matchAll(/(--fs-[\w-]+):\s*([\d.]+)rem/g)) tokens[m[1]] = +m[2];

  // The largest size the rule can ever reach: a clamp is its upper bound.
  const remOf = (decl) => {
    const tok = /var\((--fs-[\w-]+)\)/.exec(decl);
    if (tok) return tokens[tok[1]] ?? 0;
    const rems = [...decl.matchAll(/([\d.]+)rem/g)].map((m) => +m[1]);
    return rems.length ? Math.max(...rems) : 0;
  };

  const offenders = [];
  for (const [name, css] of CSS_SOURCES) {
    for (const block of css.split('}')) {
      if (/var\(--font-(ui|mono)\)/.test(block)) continue;  // not the serif
      const size = /font-size:\s*([^;]+)/.exec(block);
      const weight = /font-weight:\s*(\d+)/.exec(block);
      if (!size || !weight) continue;
      const rem = remOf(size[1]);
      if (rem < DISPLAY_REM || +weight[1] < 500) continue;
      const sel = (/([^{;]+)\{/.exec(block) || [, block]).pop().trim().replace(/\s+/g, ' ');
      offenders.push(`${name}: ${sel} is ${rem}rem at weight ${weight[1]}`);
    }
  }
  assert.deepEqual(offenders, [],
    `these set the serif large AND heavy; at ${DISPLAY_REM}rem and up, size ` +
    `has already picked the text out and the weight only adds ink:\n  ` +
    `${offenders.join('\n  ')}`);
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
