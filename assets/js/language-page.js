/* The shared engine behind the five language pages.
 *
 * Before this file, mots-du-jour, spanish, portuguese, japanese and
 * ukrainian each carried their own copy of it: 381 lines apiece, of which
 * 380 were byte-identical once the storage prefix and the BCP-47 language
 * tag were normalised. The single genuine difference was one word in one
 * comment. Five copies meant every fix to the SRS queue, the streak
 * counter or the voice picker had to be made five times.
 *
 * A page supplies its own vocabulary and phrases -- that is content, and it
 * belongs on the page -- plus exactly two settings:
 *
 *   prefix   localStorage namespace, e.g. 'motsDuJour'. Changing it orphans
 *            every visitor's saved progress on that page.
 *   lang     BCP-47 tag, e.g. 'fr-FR'. Sets the utterance language, picks
 *            the voice list, and lands in the lang="" of every foreign
 *            string so screen readers switch pronunciation.
 *
 * The voice filter is derived from lang rather than passed separately: it
 * was always the tag's first subtag on all five pages, and a third setting
 * would only be a third thing to get out of step.
 */
(function (root) {
  'use strict';

  function init(config) {
    var PREFIX = config.prefix;
    var LANG = config.lang;
    // 'fr-FR' -> 'fr'. Voices are matched on the language, not the region:
    // a visitor with only fr-CA installed should still hear French.
    var VOICE_PREFIX = LANG.split('-')[0].toLowerCase();
  var WORDS = config.words;

  var WORD_MAP = {};
  WORDS.forEach(function (w) { WORD_MAP[w[0]] = w; });

  var PER_DAY = 5;
  var CYCLE_LEN = Math.ceil(WORDS.length / PER_DAY);

  // Each day's 5 words are always the same fixed group (grouped by theme in
  // the list above), so the two practice sentences below can be hand-written
  // to actually use those words together, instead of generated on the fly.
  var PHRASE_GROUPS = config.phrases;

  function dayIndexFor(date) {
    // days since epoch, using local calendar date so it flips at local midnight
    var utcMidnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.floor(utcMidnight / 86400000);
  }

  function groupIndexFor(date) {
    return dayIndexFor(date) % CYCLE_LEN;
  }

  function todaysWords(date) {
    var g = groupIndexFor(date);
    return WORDS.slice(g * PER_DAY, g * PER_DAY + PER_DAY);
  }

  // ── speech — lets you pick which installed voice for this page's language to use, since
  // quality varies a lot between the system voices browsers ship with ──
  var VOICE_KEY = PREFIX + ':voice';
  var matchingVoices = [];
  var activeVoice = null;
  var voicePicker = document.getElementById('voicePicker');
  var voiceSelect = document.getElementById('voiceSelect');

  // Ranks voices so the least robotic one is picked by default. Nobody arrives
  // at a vocabulary page wanting to audition four French voices first, and the
  // good ones are never the default: on a Mac the stock choice is a compact
  // voice from the 2000s while the Premium download sits one tier up, and in
  // Chrome the best voice on offer is Google's.
  //
  //   3  Google. Chrome's, and the reason this ranking exists.
  //   2  "Neural"/"Natural" -- Edge's online voices, Windows 11's local ones.
  //   1  "Enhanced"/"Premium" -- the macOS Spoken Content downloads.
  //   1  anything else the browser reports as non-local, since a voice worth
  //      the round trip is generally worth more than a compact local one.
  //   0  the rest.
  function voiceRank(v) {
    var name = v.name || '';
    if (/google/i.test(name)) return 3;
    if (/neural|natural/i.test(name)) return 2;
    if (/enhanced|premium/i.test(name)) return 1;
    if (v.localService === false) return 1;
    return 0;
  }
  // Quality first, accent second. A Québécois voice that sounds like a person
  // beats a Parisian one that sounds like a station announcement -- but with
  // quality equal, a French page should sound French. Nothing decided this
  // before: equal ranks kept getVoices() order, and on a stock Mac that order
  // hands a fr-FR page Amélie, who is fr-CA.
  function voiceScore(v) {
    var exact = (v.lang || '').toLowerCase().replace('_', '-') === LANG.toLowerCase();
    return voiceRank(v) * 2 + (exact ? 1 : 0);
  }
  // macOS bundles Eloquence, the DECtalk-descended formant synthesiser Apple
  // shipped in Ventura for accessibility users who want speed and bite over
  // naturalness. It is a robot on purpose, and there is a lot of it: 112 of
  // the 187 voices on the machine this was written on, including 16 of the
  // 19 French and 16 of the 19 Spanish.
  //
  // The ranking could not see any of it. Eloquence voices are local voices
  // with plain names, so they scored exactly what Thomas and Mónica score and
  // the winner came down to getVoices() order. They also filled the picker:
  // nineteen French voices offered, sixteen of them robots.
  //
  // Chrome hid this completely -- Google's network voices outrank everything
  // and the tie is never reached. Safari has no Google voices, which is why
  // this was only ever wrong in Safari.
  //
  // The roster is nine names, checked against all 112 entries. Eight are
  // obviously silly; Jacques is not, and is the reason this is a list rather
  // than a guess at what a robot sounds like. voiceURI carries
  // com.apple.eloquence.* and is the better signal where a browser exposes
  // it -- but the name list is what actually does the work here.
  var ELOQUENCE = /^(Eddy|Flo|Grandma|Grandpa|Jacques|Reed|Rocko|Sandy|Shelley)$/;
  function isRobot(v) {
    return /eloquence/i.test(v.voiceURI || '') || ELOQUENCE.test(v.name || '');
  }

  function loadVoice() {
    if (!('speechSynthesis' in window)) return;
    var voices = speechSynthesis.getVoices();
    matchingVoices = voices.filter(function (v) { return v.lang && v.lang.toLowerCase().indexOf(VOICE_PREFIX) === 0; });

    // Last resort, not banned: a language with nothing but Eloquence should
    // still speak, badly, rather than go silent. Filtering the one list means
    // the ranking, the picker and the offline fallback cannot disagree about
    // what counts as a candidate.
    var real = matchingVoices.filter(function (v) { return !isRobot(v); });
    if (real.length) matchingVoices = real;

    matchingVoices.sort(function (a, b) { return voiceScore(b) - voiceScore(a); });
    if (matchingVoices.length === 0) { activeVoice = null; return; }

    var savedName = null;
    try { savedName = localStorage.getItem(VOICE_KEY); } catch (e) {}
    activeVoice = matchingVoices.find(function (v) { return v.name === savedName; }) || matchingVoices[0];

    // Rebuild on the names, not the count. Chrome revises this list after
    // load, and a revision that swaps one voice for another leaves the count
    // alone -- so a count check would keep a dropdown listing voices that no
    // longer exist, and the assignment below would silently blank it.
    var listed = [];
    for (var i = 0; voiceSelect && i < voiceSelect.options.length; i++) listed.push(voiceSelect.options[i].value);
    if (voiceSelect && listed.join('\n') !== matchingVoices.map(function (v) { return v.name; }).join('\n')) {
      voiceSelect.innerHTML = '';
      matchingVoices.forEach(function (v) {
        var opt = document.createElement('option');
        opt.value = v.name;
        opt.textContent = v.name + ' (' + v.lang + ')';
        voiceSelect.appendChild(opt);
      });
    }
    if (voiceSelect) voiceSelect.value = activeVoice.name;
    if (voicePicker && matchingVoices.length > 1) voicePicker.style.display = 'flex';
  }
  if (voiceSelect) {
    voiceSelect.addEventListener('change', function () {
      activeVoice = matchingVoices.find(function (v) { return v.name === voiceSelect.value; }) || activeVoice;
      try { localStorage.setItem(VOICE_KEY, voiceSelect.value); } catch (e) {}
    });
  }
  if ('speechSynthesis' in window) {
    loadVoice();
    speechSynthesis.onvoiceschanged = loadVoice;
  }

  // The best voice for a page is often Google's, and Google's voices are
  // synthesised on Google's servers. On a train they simply fail: the button
  // flashes, nothing is said, and the reason goes to a console the visitor is
  // not looking at. So a failure retries once with the best voice that lives
  // on the machine.
  //
  // Only once, and only for real failures. speak() calls cancel() first, which
  // fires an error on whatever was already talking -- retrying that would
  // start a second voice over the top of the one just asked for.
  var DEAD_ENDS = { interrupted: 1, canceled: 1, cancelled: 1 };
  function bestLocalVoice(notThis) {
    return matchingVoices.find(function (v) {
      return v !== notThis && v.localService !== false;
    }) || null;
  }
  function utter(text, voice, btn, mayRetry) {
    var u = new SpeechSynthesisUtterance(text);
    // Ask for the language the chosen voice actually speaks. Handing an engine
    // a fr-CA voice inside a fr-FR utterance is a contradiction, and some
    // engines resolve it by discarding the voice.
    u.lang = (voice && voice.lang) || LANG;
    u.rate = 0.85;
    if (voice) u.voice = voice;
    if (btn) {
      btn.classList.add('playing');
      u.onend = function () { btn.classList.remove('playing'); };
    }
    u.onerror = function (e) {
      if (btn) btn.classList.remove('playing');
      if (!mayRetry || (e && DEAD_ENDS[e.error])) return;
      var local = bestLocalVoice(voice);
      if (local) utter(text, local, btn, false);
    };
    speechSynthesis.speak(u);
  }
  function speak(text, btn) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    utter(text, activeVoice, btn, true);
  }

  // ── learned dots (per-day, stored locally) ──
  // Worked out on every call, not once at load. This was `var todayKey = ...`,
  // which freezes whatever day the page was OPENED on. That is fine for a page
  // you visit and close, and this is not one: it is a daily habit, so a good
  // share of its visits are last thing at night. Open it at 23:50, tap a word
  // at 00:05, and the tap was filed under a day that had already ended -- the
  // page reads the new day's key tomorrow and the word is simply not there.
  // Third bug in this family; see the header of assets/js/day-math.js for the
  // first two. All three were a day boundary being decided in the wrong place.
  function todayKey() {
    return PREFIX + ':' + DayMath.todayISO();
  }
  function getLearned() {
    try { return JSON.parse(localStorage.getItem(todayKey()) || '[]'); } catch (e) { return []; }
  }
  function toggleLearned(word) {
    var list = getLearned();
    var idx = list.indexOf(word);
    if (idx === -1) list.push(word); else list.splice(idx, 1);
    try { localStorage.setItem(todayKey(), JSON.stringify(list)); } catch (e) {}
    return list;
  }

  // ── spaced repetition review pool (persists since day one) ──
  var SRS_KEY = PREFIX + ':srs';

  function loadSRS() {
    try { return JSON.parse(localStorage.getItem(SRS_KEY) || '{}'); } catch (e) { return {}; }
  }

  function saveSRS(srs) {
    try { localStorage.setItem(SRS_KEY, JSON.stringify(srs)); } catch (e) { /* storage unavailable */ }
  }

  // Adds a word to the permanent review pool the first time it's marked —
  // it's due for its first review immediately, so it shows up right away.
  // Re-marking an already-tracked word never resets its existing progress.
  function addToReview(fr) {
    var srs = loadSRS();
    if (!srs[fr]) {
      srs[fr] = { interval: 0, repetitions: 0, ease: 2.5, due: DayMath.todayISO(), added: DayMath.todayISO() };
      saveSRS(srs);
    }
  }

  function getDueEntries(srs) {
    srs = srs || loadSRS();
    var today = DayMath.todayISO();
    var list = [];
    Object.keys(srs).forEach(function (fr) {
      if (srs[fr].due <= today && WORD_MAP[fr]) {
        list.push({ fr: fr, word: WORD_MAP[fr], due: srs[fr].due });
      }
    });
    list.sort(function (a, b) { return a.due < b.due ? -1 : (a.due > b.due ? 1 : 0); });
    return list;
  }

  // A simplified SM-2 (the same scheduling idea behind apps like Anki):
  // quality < 3 ("Still learning") resets the interval back to 1 day;
  // quality >= 3 ("Got it") grows it — 1 day, then 6, then interval*ease,
  // with the ease factor itself nudged up or down based on how it went.
  function gradeReview(fr, quality) {
    var srs = loadSRS();
    var entry = srs[fr];
    if (!entry) return;

    if (quality < 3) {
      entry.repetitions = 0;
      entry.interval = 1;
    } else {
      if (entry.repetitions === 0) entry.interval = 1;
      else if (entry.repetitions === 1) entry.interval = 6;
      else entry.interval = Math.round(entry.interval * entry.ease);
      entry.repetitions += 1;
      entry.ease = Math.max(1.3, entry.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
    }
    entry.due = DayMath.addDays(DayMath.todayISO(), entry.interval);
    entry.lastReview = DayMath.todayISO();
    srs[fr] = entry;
    saveSRS(srs);
    renderReview();
  }

  function renderReview() {
    var container = document.getElementById('reviewSection');
    if (!container) return;
    container.innerHTML = '';

    var label = document.createElement('p');
    label.className = 'review-label';
    label.textContent = 'Review';
    container.appendChild(label);

    var srs = loadSRS();
    var total = Object.keys(srs).length;
    var due = getDueEntries(srs);

    var stats = document.createElement('p');
    stats.className = 'review-stats';
    stats.textContent = total === 0
      ? 'Words you mark with the dot above join your review pool and start coming back here for spaced review.'
      : due.length + ' due today · ' + total + ' word' + (total === 1 ? '' : 's') + ' in your review pool';
    container.appendChild(stats);

    if (total === 0) return;

    if (due.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'review-empty';
      empty.textContent = 'All caught up — nothing due today.';
      container.appendChild(empty);
      return;
    }

    due.forEach(function (item) {
      var fr = item.fr, w = item.word;
      var ipa = w[1], en = w[2];

      var card = document.createElement('div');
      card.className = 'review-card';

      var body = document.createElement('div');
      body.className = 'review-body';
      var frEl = document.createElement('p');
      frEl.className = 'review-fr';
      frEl.textContent = en;
      var answerEl = document.createElement('p');
      answerEl.className = 'review-answer';
      answerEl.innerHTML = '<span class="review-fr-answer" lang="' + LANG + '">' + fr + '</span> <span class="review-ipa">' + ipa + '</span>';
      body.appendChild(frEl);
      body.appendChild(answerEl);

      var actions = document.createElement('div');
      actions.className = 'review-actions';

      var revealBtn = document.createElement('button');
      revealBtn.className = 'review-btn';
      revealBtn.textContent = 'Show answer';
      revealBtn.addEventListener('click', function () {
        answerEl.classList.add('shown');
        actions.innerHTML = '';

        var pbtn = document.createElement('button');
        pbtn.className = 'review-play';
        pbtn.setAttribute('aria-label', 'Play pronunciation of ' + fr);
        pbtn.innerHTML = '🔊';
        pbtn.addEventListener('click', function () { speak(fr, pbtn); });

        var againBtn = document.createElement('button');
        againBtn.className = 'review-btn again';
        againBtn.textContent = 'Still learning';
        againBtn.addEventListener('click', function () { gradeReview(fr, 2); });

        var goodBtn = document.createElement('button');
        goodBtn.className = 'review-btn good';
        goodBtn.textContent = 'Got it';
        goodBtn.addEventListener('click', function () { gradeReview(fr, 4); });

        actions.appendChild(pbtn);
        actions.appendChild(againBtn);
        actions.appendChild(goodBtn);
      });
      actions.appendChild(revealBtn);

      card.appendChild(body);
      card.appendChild(actions);
      container.appendChild(card);
    });
  }

  function updateStreak() {
    try {
      var todayStr = DayMath.todayISO();
      var last = localStorage.getItem(PREFIX + ':lastPracticed');
      var streak = parseInt(localStorage.getItem(PREFIX + ':streak') || '0', 10);
      var learnedToday = getLearned().length > 0;
      if (learnedToday && last !== todayStr) {
        var yesterday = DayMath.addDays(DayMath.todayISO(), -1);
        streak = (last === yesterday) ? streak + 1 : 1;
        localStorage.setItem(PREFIX + ':streak', String(streak));
        localStorage.setItem(PREFIX + ':lastPracticed', todayStr);
      }
      var el = document.getElementById('streakLine');
      if (streak > 0) {
        el.textContent = '🔥 ' + streak + '-day streak';
        el.classList.add('visible');
      }
    } catch (e) { /* localStorage unavailable — skip streak */ }
  }

  function render() {
    var now = new Date();
    document.getElementById('dateLine').textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    var words = todaysWords(now);
    var learned = getLearned();
    var container = document.getElementById('words');
    container.innerHTML = '';

    if (!('speechSynthesis' in window)) {
      var notice = document.createElement('p');
      notice.className = 'no-speech';
      notice.textContent = "Your browser doesn't support spoken pronunciation — try Chrome or Safari for audio.";
      container.appendChild(notice);
    }

    words.forEach(function (w) {
      var fr = w[0], ipa = w[1], en = w[2], pos = w[3], icon = w[4];
      var card = document.createElement('div');
      card.className = 'word-card';

      var btn = document.createElement('button');
      btn.className = 'play-btn';
      btn.setAttribute('aria-label', 'Play pronunciation of ' + fr);
      btn.innerHTML = '🔊';
      btn.addEventListener('click', function () { speak(fr, btn); });

      var body = document.createElement('div');
      body.className = 'word-body';
      body.innerHTML =
        '<div class="word-top"><span class="word-fr" lang="' + LANG + '">' + fr + '</span><span class="word-icon" aria-hidden="true">' + (icon || '') + '</span><span class="word-pos">' + pos + '</span></div>' +
        '<div class="word-ipa">' + ipa + '</div>' +
        '<div class="word-en">' + en + '</div>';

      // A real <button>, not a <span>: the dot is the only way to record a
      // word, and as a span it was unreachable by keyboard and invisible to
      // screen readers. aria-pressed carries the on/off state, which a class
      // name alone cannot express.
      var dot = document.createElement('button');
      dot.type = 'button';
      var dotOn = learned.indexOf(fr) !== -1;
      dot.className = 'learned-dot' + (dotOn ? ' on' : '');
      dot.setAttribute('aria-pressed', dotOn ? 'true' : 'false');
      dot.setAttribute('aria-label', 'Mark ' + fr + ' as practiced today');
      dot.title = 'Mark as practiced today';
      dot.addEventListener('click', function () {
        var list = toggleLearned(fr);
        var isOn = list.indexOf(fr) !== -1;
        dot.classList.toggle('on', isOn);
        dot.setAttribute('aria-pressed', isOn ? 'true' : 'false');
        if (isOn) {
          addToReview(fr);
          renderReview();
        }
        updateStreak();
      });

      card.appendChild(btn);
      card.appendChild(body);
      card.appendChild(dot);
      container.appendChild(card);
    });

    var phrasesContainer = document.getElementById('phrases');
    phrasesContainer.innerHTML = '';
    var label = document.createElement('p');
    label.className = 'phrases-label';
    label.textContent = 'Try them in a sentence';
    phrasesContainer.appendChild(label);

    var sentences = PHRASE_GROUPS[groupIndexFor(now)] || [];
    sentences.forEach(function (pair) {
      var exampleFr = pair[0], exampleEn = pair[1];

      var item = document.createElement('div');
      item.className = 'phrase-item';

      var pbtn = document.createElement('button');
      pbtn.className = 'phrase-play';
      pbtn.setAttribute('aria-label', 'Play pronunciation of: ' + exampleFr);
      pbtn.innerHTML = '🔊';
      pbtn.addEventListener('click', function () { speak(exampleFr, pbtn); });

      var text = document.createElement('div');
      text.innerHTML =
        '<p class="phrase-fr" lang="' + LANG + '">' + exampleFr + '</p>' +
        '<p class="phrase-en">' + exampleEn + '</p>';

      item.appendChild(pbtn);
      item.appendChild(text);
      phrasesContainer.appendChild(item);
    });

    renderReview();
    updateStreak();
  }

  render();
  }

  var api = { init: init };
  root.LanguagePage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
