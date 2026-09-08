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
  voices.push(v('Google français', 'fr-FR', { localService: false }), v('Audrey', 'fr-FR'));
  page.synth.onvoiceschanged();

  assert.deepEqual(select.options.map((o) => o.value), ['Google français', 'Audrey'],
    'the dropdown still lists voices the browser has dropped');
  assert.equal(select.value, 'Google français', 'the dropdown shows a different voice than the one that will speak');
});

// --- Eloquence ---------------------------------------------------------------
//
// macOS bundles Eloquence, the DECtalk-descended formant synthesiser Apple
// added in Ventura for accessibility users who want speed and bite rather
// than naturalness. It is a robot, deliberately, and it is enormous: 112 of
// the 187 voices on the machine this was written on are Eloquence, including
// 16 of the 19 French ones and 16 of the 19 Spanish.
//
// None of that shows up in the ranking, because Eloquence voices are plain
// local voices with plain names. They score exactly what Thomas and Mónica
// score, so which one wins is decided by getVoices() order -- luck. And they
// filled the picker: nineteen French voices, sixteen of them robots.
//
// Chrome hid all of this, because Google's network voices outrank everything
// and win before the tie is ever reached. Safari has no Google voices. That
// is why this was only ever wrong in Safari.
//
// The roster is a closed set of nine names, verified against all 112 entries.
const ROBOTS = ['Eddy', 'Flo', 'Grandma', 'Grandpa', 'Jacques', 'Reed', 'Rocko',
                'Sandy', 'Shelley'];

test('a robot does not win the tie just by being first in the list', () => {
  const spoken = speakOnce(loadPage(PAGE, {
    voices: [v('Eddy', 'fr-FR'), v('Thomas', 'fr-FR')],
  }));
  assert.equal(spoken.voice && spoken.voice.name, 'Thomas',
    'Eddy is Eloquence and Thomas is a real voice, but they score the same, ' +
    'so the sort just kept whichever getVoices() happened to list first');
});

// Eight of the nine are obviously silly and one is not. Jacques reads like a
// perfectly ordinary French voice and is com.apple.eloquence.fr-FR.Jacques.
// A rule built on how the names look would let him through.
test('the ordinary-sounding robot is demoted too', () => {
  const spoken = speakOnce(loadPage(PAGE, {
    voices: [v('Jacques', 'fr-FR'), v('Thomas', 'fr-FR')],
  }));
  assert.equal(spoken.voice && spoken.voice.name, 'Thomas',
    'Jacques is Eloquence with a human-sounding name');
});

test('every one of the nine is demoted, not just the ones that look silly', () => {
  for (const robot of ROBOTS) {
    const spoken = speakOnce(loadPage(PAGE, {
      voices: [v(robot, 'fr-FR'), v('Thomas', 'fr-FR')],
    }));
    assert.equal(spoken.voice && spoken.voice.name, 'Thomas',
      `${robot} outranked a real voice`);
  }
});

// The roster is a list of nine names Apple chose, which means it is a list
// Apple can add to. voiceURI carries com.apple.eloquence.* and does not care
// what the voice is called, so it catches the tenth name before anyone
// notices there is one. Written without proof that Safari populates voiceURI
// -- if it does not, the name list above still does the work, and this costs
// one regex against an empty string.
test('a robot is caught by its identifier even under an unfamiliar name', () => {
  const spoken = speakOnce(loadPage(PAGE, {
    voices: [
      { name: 'Bertrand', lang: 'fr-FR', localService: true,
        voiceURI: 'com.apple.eloquence.fr-FR.Bertrand' },
      v('Thomas', 'fr-FR'),
    ],
  }));
  assert.equal(spoken.voice && spoken.voice.name, 'Thomas',
    'an Eloquence voice under a name not on the list outranked a real voice');
});

// The complaint that started this. A stock Mac offers three real French voices
// and sixteen robots; the picker listed all nineteen, in an order that put
// robots above Amélie. Hiding them is the same rule as demoting them -- the
// ranking and the dropdown read the same list -- so this is not a second
// mechanism, it is the same one seen from the page.
test('the picker offers the real voices, not sixteen robots', () => {
  const page = loadPage(PAGE, {
    voices: [
      v('Amélie (Premium)', 'fr-CA'), v('Amélie', 'fr-CA'), v('Thomas', 'fr-FR'),
      ...ROBOTS.map((n) => v(n, 'fr-FR')),
      ...ROBOTS.map((n) => v(n, 'fr-CA')),
    ],
  });
  const listed = page.byId.get('voiceSelect').options.map((o) => o.value);
  assert.deepEqual(listed, ['Amélie (Premium)', 'Thomas', 'Amélie'],
    'the picker still offers robots while real voices are installed');
});

// The other half of that rule, and the reason it is a demotion rather than a
// deletion. Nothing guarantees a language has a real voice at all -- and a
// page that says nothing is worse than a page that says it badly.
test('a language served only by robots still speaks', () => {
  const page = loadPage(PAGE, { voices: ROBOTS.map((n) => v(n, 'fr-FR')) });
  const spoken = speakOnce(page);
  assert.ok(spoken && spoken.voice,
    'with only Eloquence installed the page went silent instead of using it');
  assert.equal(page.byId.get('voiceSelect').options.length, ROBOTS.length,
    'the picker hid every voice there was');
});

// Not a fix -- a check that the advice attached to this is true. With quality
// ranked above region, a fr-FR page prefers a Canadian Premium voice to a
// French compact one, which is what Safari has been doing. Downloading a
// French-from-France Premium voice is therefore the whole cure, and it needs
// no code: the existing ranking already prefers it.
test('a good voice from the right region beats a good one from the wrong region', () => {
  const spoken = speakOnce(loadPage(PAGE, {
    voices: [v('Amélie (Premium)', 'fr-CA'), v('Thomas (Premium)', 'fr-FR')],
  }));
  assert.equal(spoken.voice && spoken.voice.name, 'Thomas (Premium)',
    'installing a Premium fr-FR voice would not actually change what is spoken, ' +
    'so the advice given with this change is wrong');
});

// Two local voices, deliberately. With only one there is nowhere for a second
// hand-off to go, so the test passed even with the stop removed -- it was
// describing a machine too poorly equipped to expose the bug.
//
// Which means the names here are load-bearing. This fixture used to say
// Jacques, and the moment Eloquence started being filtered out, Jacques
// stopped being a candidate: back to one local voice, and the test went
// quietly back to proving nothing while still passing. Any name used here has
// to be a real voice, not one of ROBOTS.
test('the fallback does not itself fall back for ever', () => {
  const page = loadPage(PAGE, {
    voices: [
      v('Google français', 'fr-FR', { localService: false }),
      v('Thomas', 'fr-FR'),
      v('Audrey', 'fr-FR'),
    ],
  });
  speakOnce(page).onerror({ error: 'network' });
  assert.equal(page.spoken[1].voice.name, 'Thomas');
  page.spoken[1].onerror({ error: 'synthesis-failed' });
  assert.equal(page.spoken.length, 2,
    'the retry retried; with a broken audio device that walks the whole voice list');
});
