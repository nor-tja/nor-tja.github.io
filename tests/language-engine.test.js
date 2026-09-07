'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ROOT, readPage } = require('./helpers');

const LANGUAGE_PAGES = [
  'mots-du-jour.html', 'spanish.html', 'portuguese.html',
  'japanese.html', 'ukrainian.html',
];
const ENGINE_SRC = 'assets/js/language-page.js';
const ENGINE = fs.readFileSync(path.join(ROOT, ENGINE_SRC), 'utf8');

test('every language page loads the shared engine', () => {
  for (const page of LANGUAGE_PAGES) {
    assert.ok(readPage(page).includes(`src="${ENGINE_SRC}"`),
      `${page} does not load ${ENGINE_SRC}, so LanguagePage.init is undefined ` +
      `and the page renders an empty word list with no error the reader sees`);
  }
});

// Classic ordering trap: both tags are present, the page throws
// "LanguagePage is not defined", and the only symptom is a blank card.
test('the engine loads before the page calls it', () => {
  for (const page of LANGUAGE_PAGES) {
    const src = readPage(page);
    assert.ok(src.indexOf(`src="${ENGINE_SRC}"`) < src.indexOf('LanguagePage.init('),
      `${page} calls LanguagePage.init before loading ${ENGINE_SRC}`);
  }
});

// day-math.js is a hard dependency of the engine, not an optional extra: the
// engine calls DayMath.todayISO() and DayMath.addDays() directly.
test('every language page loads day-math before the engine', () => {
  assert.match(ENGINE, /DayMath\./,
    'the engine no longer uses DayMath; if that is deliberate, drop this test ' +
    'and the <script> tags with it');
  for (const page of LANGUAGE_PAGES) {
    const src = readPage(page);
    const dm = src.indexOf('src="assets/js/day-math.js"');
    assert.ok(dm !== -1, `${page} does not load day-math.js`);
    assert.ok(dm < src.indexOf(`src="${ENGINE_SRC}"`),
      `${page} loads the engine before day-math.js`);
  }
});

// Running each page's inline script with a stubbed engine is the closest this
// suite gets to loading the page: it proves the config parses as JavaScript
// and arrives with the shape the engine destructures.
test('every page calls init with a complete, well-formed config', () => {
  for (const page of LANGUAGE_PAGES) {
    const inline = /<script>([\s\S]*?)<\/script>/.exec(readPage(page));
    assert.ok(inline, `${page} has no inline <script>`);

    let cfg = null;
    vm.runInNewContext(inline[1], { LanguagePage: { init: (c) => { cfg = c; } } });
    assert.ok(cfg, `${page} never calls LanguagePage.init`);

    assert.deepEqual(Object.keys(cfg).sort(), ['lang', 'phrases', 'prefix', 'words'],
      `${page} passes the wrong set of config keys`);
    assert.match(cfg.prefix, /^[a-zA-Z][a-zA-Z0-9]*$/,
      `${page} prefix "${cfg.prefix}" is not a plain identifier; it is ` +
      `concatenated with ':' to build localStorage keys`);
    assert.ok(Array.isArray(cfg.words) && cfg.words.length > 0,
      `${page} passes no words`);
    assert.ok(Array.isArray(cfg.phrases) && cfg.phrases.length > 0,
      `${page} passes no phrases`);
  }
});

// The engine serves five words a day from fixed groups and pairs each group
// with hand-written sentences. If the counts fall out of step, the last group
// silently gets no phrases, or phrases nobody ever sees.
test('every page has one phrase group per day of words', () => {
  for (const page of LANGUAGE_PAGES) {
    const inline = /<script>([\s\S]*?)<\/script>/.exec(readPage(page))[1];
    let cfg = null;
    vm.runInNewContext(inline, { LanguagePage: { init: (c) => { cfg = c; } } });
    const groups = Math.ceil(cfg.words.length / 5);
    assert.equal(cfg.phrases.length, groups,
      `${page} has ${cfg.words.length} words (${groups} days of five) but ` +
      `${cfg.phrases.length} phrase groups`);
  }
});

// Every word row is [word, ipa, gloss, partOfSpeech, icon]. A short row does
// not throw -- it renders "undefined" into the card.
test('every word row has all five fields', () => {
  for (const page of LANGUAGE_PAGES) {
    const inline = /<script>([\s\S]*?)<\/script>/.exec(readPage(page))[1];
    let cfg = null;
    vm.runInNewContext(inline, { LanguagePage: { init: (c) => { cfg = c; } } });
    const bad = cfg.words
      .map((w, i) => (Array.isArray(w) && w.length === 5 ? null : `row ${i}: ${JSON.stringify(w)}`))
      .filter(Boolean);
    assert.deepEqual(bad, [], `${page} has malformed word rows:\n  ${bad.join('\n  ')}`);
  }
});

// The whole point of the extraction. A page that reintroduces its own copy of
// the engine gets no benefit from fixes made to the shared one.
test('no page carries its own copy of the engine', () => {
  const offenders = [];
  for (const page of LANGUAGE_PAGES) {
    const inline = /<script>([\s\S]*?)<\/script>/.exec(readPage(page))[1];
    for (const marker of ['speechSynthesis', 'localStorage', 'addEventListener']) {
      if (inline.includes(marker)) offenders.push(`${page} inline script uses ${marker}`);
    }
  }
  assert.deepEqual(offenders, [],
    `these pages have engine logic back in the page:\n  ${offenders.join('\n  ')}`);
});

// The engine must not hard-code the language it was cut from. Comments are
// stripped first: the header documents prefix and lang with the real
// mots-du-jour values, which is the clearest way to explain them and is not
// a behavioural leak.
test('no French-specific value survived into the shared engine', () => {
  const code = ENGINE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const strays = [];
  for (const re of [/motsDuJour/g, /'fr-FR'/g, /\bfrVoice\b/g, /indexOf\('fr'\)/g]) {
    for (const m of code.matchAll(re)) strays.push(m[0]);
  }
  assert.deepEqual(strays, [],
    `the engine was cut from mots-du-jour; these leftovers would make the ` +
    `other four pages behave as French:\n  ${strays.join('\n  ')}`);
});
