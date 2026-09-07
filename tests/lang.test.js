'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { ROOT, pagePaths, readPage, pageJs } = require('./helpers');

const PAGES = pagePaths().map((p) => path.basename(p));
const ENGINE = require('node:fs').readFileSync(
  path.join(ROOT, 'assets/js/language-page.js'), 'utf8');

// The regional subtag is not decoration: pt-PT and pt-BR differ audibly, and
// these are the same tags each page already hands to SpeechSynthesis, so the
// screen reader and the Play button agree on the accent.
const LANG = {
  'mots-du-jour.html': 'fr-FR',
  'spanish.html': 'es-ES',
  'portuguese.html': 'pt-PT',
  'japanese.html': 'ja-JP',
  'ukrainian.html': 'uk-UA',
};

// The elements that actually hold foreign text. All three are built by
// JavaScript, so the attribute has to be in the generated markup.
const FOREIGN = ['word-fr', 'review-fr-answer', 'phrase-fr'];

test('the UI language of every page is still English', () => {
  for (const page of PAGES) {
    assert.match(readPage(page), /<html lang="en">/,
      `${page} lost its <html lang="en">; the surrounding interface is English ` +
      `on every page, including the language pages`);
  }
});

// Since the engine was extracted this is two separate claims, and they fail
// for different reasons. The engine can stop emitting the attribute at all,
// or a page can pass the wrong tag. Asserting them together would leave one
// of the two untested if the other happened to hold.
test('the shared engine marks every foreign element with the page language', () => {
  for (const cls of FOREIGN) {
    assert.ok(ENGINE.includes(`class="${cls}" lang="' + LANG + '"`),
      `assets/js/language-page.js does not mark .${cls} with the configured ` +
      `language. Unmarked foreign text is read aloud with an English voice ` +
      `on all five pages at once.`);
  }
});

test('each language page hands the engine the right tag', () => {
  for (const [page, code] of Object.entries(LANG)) {
    const init = /LanguagePage\.init\(\{([\s\S]*?)words:/.exec(readPage(page));
    assert.ok(init, `${page} does not call LanguagePage.init`);
    assert.match(init[1], new RegExp(`lang:\\s*'${code}'`),
      `${page} must pass lang: '${code}'. This one string sets the speech ` +
      `voice, the voice-picker filter and the lang="" on every foreign ` +
      `string, so getting it wrong is silent and total.`);
  }
});

// Two pages sharing a localStorage namespace would read each other's SRS
// queue and streak: grading a French card would mark a Spanish one learned.
test('every language page has its own storage namespace', () => {
  const seen = new Map();
  for (const page of Object.keys(LANG)) {
    const m = /prefix:\s*'([^']+)'/.exec(readPage(page));
    assert.ok(m, `${page} does not pass a storage prefix`);
    assert.ok(!seen.has(m[1]),
      `${page} and ${seen.get(m[1])} both store under '${m[1]}'; they would ` +
      `share one SRS queue and one streak`);
    seen.set(m[1], page);
  }
});

// .review-fr is misleadingly named: it holds the ENGLISH prompt, and the
// foreign answer lives in .review-fr-answer beside it. Marking it foreign
// makes a screen reader pronounce English words with a French voice, which is
// worse than leaving it alone. This test exists because the first pass at the
// change did exactly that.
test('the English prompt on a review card is never marked foreign', () => {
  for (const page of Object.keys(LANG)) {
    const src = pageJs(page);
    assert.ok(!/frEl\.lang\s*=/.test(src),
      `${page} sets a lang on the review prompt element. That element is ` +
      `assigned the English gloss (frEl.textContent = en), despite its ` +
      `.review-fr class name.`);
    assert.ok(!/class="review-fr" lang=/.test(src),
      `${page} marks .review-fr as foreign; it carries the English prompt`);
  }
});

// A tag nobody validates is a tag that quietly rots into "fr_FR" or "french".
test('every lang attribute is a well-formed BCP-47 tag', () => {
  const bad = [];
  for (const page of PAGES) {
    for (const m of readPage(page).matchAll(/\blang="([^"]*)"/g)) {
      if (!/^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$/.test(m[1])) {
        bad.push(`${page} -> lang="${m[1]}"`);
      }
    }
  }
  assert.deepEqual(bad, [], `malformed language tags:\n  ${bad.join('\n  ')}`);
});
