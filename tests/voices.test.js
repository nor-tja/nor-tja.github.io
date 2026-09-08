'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadPage, speakOnce } = require('./dom-harness');

// Which voice a language page speaks with is the whole quality of the feature.
// The browser ships a range from "reads like a person" to "reads like a 1998
// train station", the good ones are not the default anywhere, and the visitor
// this site is for will not go hunting through a dropdown. So the engine picks,
// and these tests are about what it picks.
//
// They run the engine rather than reading it. The selection is a sort over a
// list that only exists inside a browser, and a grep cannot tell you what came
// out on top.

const PAGE = 'mots-du-jour.html';                 // lang: 'fr-FR'
const KEY = 'motsDuJour:voice';

const v = (name, lang, extra) => Object.assign({ name: name, lang: lang, localService: true }, extra);

test('the best voice on the machine wins without anyone asking for it', () => {
  const spoken = speakOnce(loadPage(PAGE, {
    voices: [
      v('Thomas', 'fr-FR'),                       // macOS compact, the default
      v('Amélie', 'fr-CA'),
      v('Google français', 'fr-FR', { localService: false }),
      v('Aurélie (Premium)', 'fr-FR'),
    ],
  }));
  assert.ok(spoken, 'no pronounce button produced an utterance');
  assert.equal(spoken.voice && spoken.voice.name, 'Google français',
    'the page spoke with a lesser voice while a better one was installed');
});

// The tier order, one rung at a time. The test above passes whichever of the
// two good voices wins, so on its own it cannot tell you the ranking still
// ranks: a probe that deleted the Google rule entirely left it green, because
// Google was still first in the list and the sort is stable.
test('Google outranks a Premium voice sitting on the machine', () => {
  const spoken = speakOnce(loadPage(PAGE, {
    voices: [v('Aurélie (Premium)', 'fr-FR'), v('Google français', 'fr-FR', { localService: false })],
  }));
  assert.equal(spoken.voice && spoken.voice.name, 'Google français');
});

// Nothing in the name says "good". All the browser will tell you is that the
// voice is not on this machine, which means somebody is running a server for
// it, which is a decent proxy for effort.
test('an unfamiliar cloud voice outranks a compact local one', () => {
  const spoken = speakOnce(loadPage(PAGE, {
    voices: [v('Thomas', 'fr-FR'), v('Céline', 'fr-FR', { localService: false })],
  }));
  assert.equal(spoken.voice && spoken.voice.name, 'Céline');
});

test('a machine with nothing good installed still speaks', () => {
  const spoken = speakOnce(loadPage(PAGE, { voices: [v('Thomas', 'fr-FR')] }));
  assert.ok(spoken, 'no utterance at all');
  assert.equal(spoken.voice && spoken.voice.name, 'Thomas');
});

// Quality first, accent second. A superb Québécois voice beats a robotic
// Parisian one -- but between two voices of the same quality, a page teaching
// French from France should sound like France. Nothing decided this before:
// equal ranks kept getVoices() order, and on a stock Mac that order puts
// Amélie (fr-CA) ahead of Thomas (fr-FR).
test('when two voices are equally good, the page speaks its own region', () => {
  const spoken = speakOnce(loadPage(PAGE, {
    voices: [v('Amélie', 'fr-CA'), v('Thomas', 'fr-FR')],
  }));
  assert.equal(spoken.voice && spoken.voice.name, 'Thomas',
    'a fr-FR page picked a fr-CA voice over an equally good fr-FR one');
});

test('quality still outranks region', () => {
  const spoken = speakOnce(loadPage(PAGE, {
    voices: [v('Thomas', 'fr-FR'), v('Google français canadien', 'fr-CA', { localService: false })],
  }));
  assert.equal(spoken.voice && spoken.voice.name, 'Google français canadien',
    'the page fell back to a compact voice to keep the accent, which is the wrong trade');
});

// Handing an engine a fr-CA voice inside a fr-FR utterance is a contradiction,
// and some engines resolve it by ignoring the voice. Then the careful choice
// above is silently discarded at the last step.
test('the utterance speaks the language of the voice that will say it', () => {
  const spoken = speakOnce(loadPage(PAGE, {
    voices: [v('Google français canadien', 'fr-CA', { localService: false })],
  }));
  assert.equal(spoken.lang, 'fr-CA',
    'the utterance asks for one language and the voice speaks another');
});

test('a voice you chose yourself is never overruled', () => {
  const spoken = speakOnce(loadPage(PAGE, {
    voices: [v('Google français', 'fr-FR', { localService: false }), v('Thomas', 'fr-FR')],
    saved: { [KEY]: 'Thomas' },
  }));
  assert.equal(spoken.voice && spoken.voice.name, 'Thomas',
    'the ranking overrode an explicit choice from the dropdown');
});

// The cost of preferring Google: those voices are synthesised on Google's
// servers, so they fail on a train. Without this the button flashes and the
// visitor hears nothing, with the reason only in the console.
test('a network voice that fails hands off to the best voice on the machine', () => {
  const page = loadPage(PAGE, {
    voices: [
      v('Google français', 'fr-FR', { localService: false }),
      v('Thomas', 'fr-FR'),
      v('Amélie', 'fr-CA'),
    ],
  });
  const first = speakOnce(page);
  assert.equal(first.voice.name, 'Google français');
  first.onerror({ error: 'network' });
  assert.equal(page.spoken.length, 2,
    'the network voice failed and nothing was said');
  assert.equal(page.spoken[1].voice.name, 'Thomas',
    'the retry did not use the best voice that works offline');
  assert.equal(page.spoken[1].text, first.text, 'the retry said something else');
});

// speak() calls cancel() first, which fires an error on whatever was already
// speaking. Treating that as a failure would start a second voice over the top
// of the one the visitor just asked for.
test('interrupting a sentence is not mistaken for a failure', () => {
  for (const why of ['interrupted', 'canceled']) {
    const page = loadPage(PAGE, {
      voices: [v('Google français', 'fr-FR', { localService: false }), v('Thomas', 'fr-FR')],
    });
    speakOnce(page).onerror({ error: why });
    assert.equal(page.spoken.length, 1,
      `a '${why}' error started a second utterance, so two voices talk at once`);
  }
});

// Offline, every network voice fails, not just the first one. Walking down to
// the next-best voice would just fail again.
test('the hand-off skips straight past the other network voices', () => {
  const page = loadPage(PAGE, {
    voices: [
      v('Google français', 'fr-FR', { localService: false }),
      v('Google français canadien', 'fr-CA', { localService: false }),
      v('Thomas', 'fr-FR'),
    ],
  });
  speakOnce(page).onerror({ error: 'network' });
  assert.equal(page.spoken.length, 2, 'nothing was said after the failure');
  assert.equal(page.spoken[1].voice.name, 'Thomas',
    'the retry picked another voice that needs the same network that just failed');
});

// Chrome revises getVoices() after load. A revision that swaps one voice for
// another leaves the count unchanged, and the rebuild used to be guarded on
// the count -- so the dropdown would go on listing a voice that no longer
// existed, and selecting it would do nothing.
test('the dropdown follows the voice list even when its length does not change', () => {
  const voices = [v('Thomas', 'fr-FR'), v('Amélie', 'fr-CA')];
  const page = loadPage(PAGE, { voices });
  const select = page.byId.get('voiceSelect');
  assert.deepEqual(select.options.map((o) => o.value), ['Thomas', 'Amélie']);

  voices.length = 0;
  voices.push(v('Google français', 'fr-FR', { localService: false }), v('Jacques', 'fr-FR'));
  page.synth.onvoiceschanged();

  assert.deepEqual(select.options.map((o) => o.value), ['Google français', 'Jacques'],
    'the dropdown still lists voices the browser has dropped');
  assert.equal(select.value, 'Google français', 'the dropdown shows a different voice than the one that will speak');
});

// Two local voices, deliberately. With only one there is nowhere for a second
// hand-off to go, so the test passed even with the stop removed -- it was
// describing a machine too poorly equipped to expose the bug.
test('the fallback does not itself fall back for ever', () => {
  const page = loadPage(PAGE, {
    voices: [
      v('Google français', 'fr-FR', { localService: false }),
      v('Thomas', 'fr-FR'),
      v('Jacques', 'fr-FR'),
    ],
  });
  speakOnce(page).onerror({ error: 'network' });
  assert.equal(page.spoken[1].voice.name, 'Thomas');
  page.spoken[1].onerror({ error: 'synthesis-failed' });
  assert.equal(page.spoken.length, 2,
    'the retry retried; with a broken audio device that walks the whole voice list');
});
