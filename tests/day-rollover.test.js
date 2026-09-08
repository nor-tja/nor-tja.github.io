'use strict';
// The third day-boundary bug on these pages. The first two are written up at
// the top of assets/js/day-math.js: addDays() read local midnight back as UTC,
// and todayKey disagreed with todaysWords() about when a day starts. Both were
// about WHICH day. This one is about WHEN the answer is worked out.
//
// A vocabulary page is a thing you leave open. Open it before bed, mark a word
// after midnight, and the page is still using the key it computed at load. The
// mark lands on yesterday. Worse, the streak reads the same stale key, so it
// can see "words learned today" from a day that ended an hour ago and skip the
// increment -- the exact failure the streak exists to avoid.
//
// These run the real engine against a clock the test controls, so they check
// what the page does rather than what the source says.
const test = require('node:test');
const assert = require('node:assert');
const { loadPage } = require('./dom-harness');

const PAGE = 'mots-du-jour.html';
const PREFIX = 'motsDuJour';

const at = (y, m, d, h, min) => new Date(y, m - 1, d, h, min).getTime();

// The learned dot is the only <button> the render gives a 'learned-dot' class.
function clickFirstDot(loaded) {
  const dot = loaded.created.find((el) => /(^| )learned-dot( |$)/.test(el.className));
  assert.ok(dot, 'the render produced no learned dot to click');
  const handler = (dot.handlers.click || [])[0];
  assert.ok(handler, 'the learned dot has no click handler');
  handler({ preventDefault() {}, target: dot, currentTarget: dot });
  return dot;
}

test('a word marked after midnight is filed under the new day', () => {
  const clock = { now: at(2026, 9, 8, 23, 50) };
  const loaded = loadPage(PAGE, { clock });

  clock.now = at(2026, 9, 9, 0, 5);          // ten past midnight, page still open
  clickFirstDot(loaded);

  const keys = [...loaded.store.keys()].filter((k) => /:\d{4}-\d{2}-\d{2}$/.test(k));
  assert.deepEqual(keys, [`${PREFIX}:2026-09-09`],
    `the mark was filed under ${keys.join(', ') || 'nothing'}. The page was ` +
    `opened at 23:50 and the word was marked at 00:05, so it belongs to the 9th. ` +
    `Filing it under the 8th loses it: tomorrow the page reads the 9th and the ` +
    `word is not there.`);
});

// The streak is deliberately NOT asserted here. It reads the same stale key,
// but it recomputes todayISO() on every call, and in the ordinary case the two
// errors cancel: the mark that landed on yesterday also makes yesterday look
// practised, so the increment comes out right by accident. A test that pinned
// the streak would have passed before the fix and guarded nothing. What breaks
// for real is the mark itself, so that is what these check.
test('a session that spans midnight files each word under its own day', () => {
  const clock = { now: at(2026, 9, 8, 23, 50) };
  const loaded = loadPage(PAGE, { clock });

  const dots = loaded.created.filter((el) => /(^| )learned-dot( |$)/.test(el.className));
  assert.ok(dots.length >= 2, 'need at least two words to test this');
  const click = (dot) => (dot.handlers.click || [])[0]({ preventDefault() {}, target: dot, currentTarget: dot });
  const wordOf = (dot) => /^Mark (.*) as practiced today$/.exec(dot['aria-label'])[1];

  click(dots[0]);                             // 23:50, the 8th
  clock.now = at(2026, 9, 9, 0, 5);
  click(dots[1]);                             // 00:05, the 9th

  assert.deepEqual(
    JSON.parse(loaded.store.get(`${PREFIX}:2026-09-08`) || '[]'), [wordOf(dots[0])],
    'the word marked before midnight is no longer filed under the 8th');
  assert.deepEqual(
    JSON.parse(loaded.store.get(`${PREFIX}:2026-09-09`) || '[]'), [wordOf(dots[1])],
    'the word marked after midnight did not land on the 9th');
});

// The counterpart: staying inside one day must not double-count. If the key
// were recomputed but the streak logic lost its guard, every tap would look
// like a fresh day.
test('marking several words in one sitting is still one day', () => {
  const clock = { now: at(2026, 9, 9, 10, 0) };
  const loaded = loadPage(PAGE, {
    clock,
    saved: {
      [`${PREFIX}:streak`]: '4',
      [`${PREFIX}:lastPracticed`]: '2026-09-08',
    },
  });

  const dots = loaded.created.filter((el) => /(^| )learned-dot( |$)/.test(el.className));
  assert.ok(dots.length >= 2, 'need at least two words to test this');
  for (const dot of dots.slice(0, 3)) {
    (dot.handlers.click || [])[0]({ preventDefault() {}, target: dot, currentTarget: dot });
  }

  assert.equal(loaded.store.get(`${PREFIX}:streak`), '5',
    'three taps in one morning moved the streak more than one day');
});
