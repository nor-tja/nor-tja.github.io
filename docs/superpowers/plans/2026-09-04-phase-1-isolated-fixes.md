# Phase 1: Isolated Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the site's three broken behaviours and make every page shareable, without touching the code that Phase 2 will replace.

**Architecture:** The site is 12 standalone HTML files with inline CSS and JS, no build step. This phase keeps that. Where a fix needs to be *tested*, the specific buggy function — and only that function — is lifted into a small file under `assets/js/` that dual-exports (browser global + CommonJS), so Node can unit-test it while the page still loads it with a plain `<script src>`. Everything else is edited in place.

**Tech Stack:** Plain HTML/CSS/ES5-ish JS. `node --test` (built into Node v26, zero dependencies) for tests. `sips` (macOS built-in) for image resizing and SVG→PNG rasterisation. No npm packages, no `package.json`, no build step.

## Global Constraints

- **No build step and no npm dependencies.** Verified available and sufficient: Node v26.5.0, `sips`, `qlmanage`, `cupsfilter`, `textutil`, `git` 2.50.1.
- **No ES modules and no `fetch`-loaded JSON.** Both are blocked by CORS under `file://`, which would end the ability to preview by double-clicking a file. All new JS is a classic script assigning to a global, with a CommonJS shim appended for tests.
- **Filenames at the repository root do not change.** Inbound links and bookmarks must keep working.
- **JPEG only, no WebP.** `sips` can read WebP but only *write* JPEG (`sips --formats` marks only `public.jpeg` Writable), and `cwebp` is not installed. WebP is deferred to a follow-up gated on `brew install webp`; it would save roughly a further 30KB on one image.
- **Palette (unchanged this phase):** `--bg:#f5f2ed`, `--ink:#1a1814`, `--muted:#7a7570`, `--accent:#9a2a2a`, `--line:#d8d3cc`. The `--muted` contrast fix is Phase 3.
- **Fonts:** Cormorant Garamond + DM Mono, via Google Fonts.
- **Run all tests with:** `node --test tests/`
- **Commit after every task.** Never `git add -A` — stage explicit paths.

---

### Task 1: Test harness and the 955KB coffee photo

`coffee.html` is 955,304 bytes and line 387 alone is 915,467 of them — a 1500×2000 JPEG inlined as base64, rendered at 220×275 inside a `<details>` that is collapsed by default. Inline base64 is not separately cacheable, and both `<script>` blocks sit after it, so the stats strip and pattern charts show `–` and empty bars until it finishes downloading.

**Files:**
- Create: `tests/helpers.js`
- Create: `tests/page-weight.test.js`
- Create: `assets/img/katja.jpg`
- Modify: `coffee.html:387`

**Interfaces:**
- Consumes: nothing.
- Produces: `tests/helpers.js` exporting `{ ROOT, pagePaths(), readPage(name), sizeOf(name) }`. `pagePaths()` returns absolute paths to every `*.html` at the repo root, sorted. `readPage(name)` takes a bare filename like `'coffee.html'` and returns a UTF-8 string. `sizeOf(name)` returns bytes. Every later task's tests use these.

- [ ] **Step 1: Write the test helper**

Create `tests/helpers.js`:

```js
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

module.exports = { ROOT, pagePaths, readPage, sizeOf };
```

- [ ] **Step 2: Write the failing test**

Create `tests/page-weight.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pagePaths, readPage, sizeOf } = require('./helpers');

const MAX_PAGE_BYTES = 60 * 1024;
const MAX_DATA_URI_BYTES = 10 * 1024;

test('no HTML page exceeds 60KB', () => {
  for (const p of pagePaths()) {
    const name = path.basename(p);
    const bytes = sizeOf(name);
    assert.ok(
      bytes <= MAX_PAGE_BYTES,
      `${name} is ${Math.round(bytes / 1024)}KB, over the ${MAX_PAGE_BYTES / 1024}KB budget`
    );
  }
});

test('no inline base64 data URI exceeds 10KB', () => {
  for (const p of pagePaths()) {
    const name = path.basename(p);
    const uris = readPage(name).match(/data:[a-z/+.-]+;base64,[A-Za-z0-9+/=]+/g) || [];
    for (const uri of uris) {
      assert.ok(
        uri.length <= MAX_DATA_URI_BYTES,
        `${name} has a ${Math.round(uri.length / 1024)}KB inline data URI — extract it to assets/`
      );
    }
  }
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test tests/`

Expected: both tests FAIL. `coffee.html is 932KB, over the 60KB budget` and `coffee.html has a 894KB inline data URI`.

- [ ] **Step 4: Extract and resize the photo**

The display slot is 220×275 (ratio 0.80); the source is 1500×2000 (ratio 0.75). Because the source is proportionally *narrower*, `object-fit: cover` scales to match **width** and crops height — so the 2× DPR target is width 440, not height 550. Sizing by height would under-size it.

```bash
mkdir -p assets/img
python3 - <<'PY'
import re, base64
src = open('coffee.html', encoding='utf-8').read()
m = re.search(r'data:image/jpeg;base64,([A-Za-z0-9+/=]+)', src)
open('/tmp/katja-original.jpg', 'wb').write(base64.b64decode(m.group(1)))
print('decoded', len(base64.b64decode(m.group(1))), 'bytes')
PY
sips --resampleWidth 440 /tmp/katja-original.jpg \
     --out assets/img/katja.jpg -s format jpeg -s formatOptions 80
sips -g pixelWidth -g pixelHeight assets/img/katja.jpg
ls -l assets/img/katja.jpg
```

Expected: `decoded 686561 bytes`, then `pixelWidth: 440`, `pixelHeight: 586`, and a file of roughly 80KB.

Keep `/tmp/katja-original.jpg` until Step 7 confirms the page renders — it is the only copy of the full-resolution original outside git history.

- [ ] **Step 5: Replace line 387**

Line 387 is a single `<img>` whose `src` is the base64 payload, ending `alt="Katja">`. Replace the entire line with:

```html
    <img src="assets/img/katja.jpg" width="440" height="586" alt="Katja outdoors, holding a coffee" loading="lazy" decoding="async">
```

`loading="lazy"` matters here specifically: the image sits inside a collapsed `<details>`, so most visitors never open it and now never download it.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test tests/`

Expected: PASS. Confirm the drop:

```bash
ls -l coffee.html | awk '{printf "coffee.html: %d KB\n", $5/1024}'
```

Expected: roughly 40KB, down from 932KB.

- [ ] **Step 7: Verify in the browser**

Open `coffee.html`, expand "Rise & Sip! ☕", and confirm the photo appears and is not visibly degraded at 220×275. Confirm the stats strip shows numbers rather than `–`, and that the process/origin bars render.

- [ ] **Step 8: Commit**

```bash
git add tests/helpers.js tests/page-weight.test.js assets/img/katja.jpg coffee.html
git commit -m "perf: extract inlined coffee photo, 955KB page -> ~40KB

Line 387 was a 1500x2000 JPEG inlined as base64 (915,467 bytes, 96% of
the file) displayed at 220x275 inside a collapsed <details>. Inline
base64 is not separately cacheable, so it was re-downloaded on every
visit, and both <script> blocks sat after it -- the stats strip and
pattern charts rendered as placeholders until it finished.

Now a 440x586 JPEG (80KB) loaded lazily, so visitors who never open the
disclosure never fetch it at all.

Adds a zero-dependency node --test harness with page-weight regression
guards so this cannot recur."
```

---

### Task 2: Coffee process chart misclassification

`PROCESS_KEYWORDS` (`coffee.html:415-420`) tests `/honey/i` **second**, and against `full = nameText + ' ' + notesText` (`:442`, used at `:444`). Four beans whose *tasting notes* mention "honeycomb" or "honeydew" are therefore filed as honey-process, corrupting "average score by process" — the page's headline chart.

**Files:**
- Create: `assets/js/coffee-patterns.js`
- Create: `tests/coffee-patterns.test.js`
- Modify: `coffee.html` — add `<script src>` in `<head>`; replace the inline `PROCESS_KEYWORDS` array and the classification loop

**Interfaces:**
- Consumes: `tests/helpers.js` from Task 1.
- Produces: global `CoffeePatterns` with `classifyProcess(name)` → one of `'Anaerobic' | 'Honey' | 'Natural' | 'Washed' | null`. Takes the bean **name only**, never the notes.

- [ ] **Step 1: Write the failing test**

Create `tests/coffee-patterns.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { classifyProcess } = require('../assets/js/coffee-patterns.js');

test('classifies from the bean name', () => {
  assert.equal(classifyProcess('Guatemala — Valentín Carrillo Washed'), 'Washed');
  assert.equal(classifyProcess('Saime Cardenas — Costa Rica Red Honey'), 'Honey');
  assert.equal(classifyProcess('Musasa — Rwanda, dried without pulp'), 'Washed');
  assert.equal(classifyProcess('Some Lot — Anaerobic'), 'Anaerobic');
  assert.equal(classifyProcess('Finca X — dried with the fruit'), 'Natural');
});

test('returns null when the name states no process', () => {
  assert.equal(classifyProcess('Yirgacheffe — Ethiopia Heirloom Banko Gotiti'), null);
});

test('honeycomb and honeydew in a name do not mean honey process', () => {
  assert.notEqual(classifyProcess('Washed lot, honeycomb sweetness'), 'Honey');
  assert.notEqual(classifyProcess('Washed lot, honeydew melon'), 'Honey');
});

test('a washed bean whose notes mention honey is still washed', () => {
  // Regression: the old code matched against name + notes concatenated.
  assert.equal(classifyProcess('Guatemala — Valentín Carrillo Washed'), 'Washed');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/coffee-patterns.test.js`

Expected: FAIL — `Cannot find module '../assets/js/coffee-patterns.js'`.

- [ ] **Step 3: Write the implementation**

Create `assets/js/coffee-patterns.js`:

```js
/* Bean process classification.
 *
 * Two rules earn their keep here:
 *   1. Match against the bean NAME only. The old inline version tested
 *      name + notes, so four washed beans whose notes mentioned
 *      "honeycomb" or "honeydew" were filed as honey-process.
 *   2. Test Honey LAST, and with word boundaries. "Red Honey" is a real
 *      process; "honeycomb" is a flavour note.
 */
(function (root) {
  'use strict';

  var PROCESS_KEYWORDS = [
    { re: /anaerobic/i, label: 'Anaerobic' },
    { re: /natural|dried with (the )?fruit|dried with pulp/i, label: 'Natural' },
    { re: /washed|dried without (the )?fruit|dried without pulp/i, label: 'Washed' },
    { re: /\bhoney\b/i, label: 'Honey' }
  ];

  function classifyProcess(name) {
    var text = name || '';
    for (var i = 0; i < PROCESS_KEYWORDS.length; i++) {
      if (PROCESS_KEYWORDS[i].re.test(text)) return PROCESS_KEYWORDS[i].label;
    }
    return null;
  }

  var api = { classifyProcess: classifyProcess, PROCESS_KEYWORDS: PROCESS_KEYWORDS };
  root.CoffeePatterns = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/coffee-patterns.test.js`

Expected: PASS, 4 tests.

- [ ] **Step 5: Wire it into the page**

In `coffee.html` `<head>` (after the Leaflet tag), add:

```html
  <script src="assets/js/coffee-patterns.js"></script>
```

Delete the inline `PROCESS_KEYWORDS` array at `coffee.html:415-420`. Then replace the classification loop — currently:

```js
      let process = null;
      for (const p of PROCESS_KEYWORDS) { if (p.re.test(full)) { process = p.label; break; } }
```

with:

```js
      const process = CoffeePatterns.classifyProcess(nameText);
```

Leave `full` in place — `:446` still uses it for country detection.

- [ ] **Step 6: Verify in the browser**

Open `coffee.html`. Under "The patterns", confirm the process chart no longer shows an inflated Honey group. Cross-check that Guatemala Valentín Carrillo and Musasa Rwanda now count toward Washed.

- [ ] **Step 7: Commit**

```bash
git add assets/js/coffee-patterns.js tests/coffee-patterns.test.js coffee.html
git commit -m "fix: coffee process chart misclassified washed beans as honey

/honey/i was tested second and against name + notes concatenated, so
four washed beans whose tasting notes mentioned honeycomb or honeydew
were filed as honey-process -- corrupting the page's headline chart.

Now matches the bean name only, tests Honey last, and uses a word
boundary so honeycomb/honeydew no longer match. Extracted to
assets/js/coffee-patterns.js so it is unit-testable."
```

---

### Task 3: Pomodoro counts every session ~3 times

The completion block (`pomodoro.html:1096-1106`) has no guard: it does not clear the interval, null `endTime`, or change `mode`. Those happen 550ms later inside a `setTimeout`, while `tick` runs every 250ms — so the block re-enters roughly three times per session. Three chimes, a flip animation reversed mid-flight, and `completedFocusSessions++` plus `recordFocusCompleted()` running 3×. **Daily stats and cycle dots are inflated ~3×.** The same block is duplicated at `:1163-1171`.

**Files:**
- Create: `assets/js/pomodoro-cycle.js`
- Create: `tests/pomodoro-cycle.test.js`
- Modify: `pomodoro.html` — add `<script src>`; replace `nextMode()` (`:1070-1079`) and both completion blocks (`:1096-1106`, `:1163-1171`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: global `PomodoroCycle` with `create(opts)` → cycle object. `opts` is `{ cyclesBeforeLong: () => number, onFocusCompleted: (minutes) => void }` — `cyclesBeforeLong` is a **function** so it reads the live input value. The returned object has:
  - `complete(mode, minutes)` → `'short' | 'long' | 'focus' | null`. Returns `null` when already transitioning (this is the guard).
  - `finishTransition()` → clears the transitioning flag.
  - `reset()` → zeroes the counter and the flag.
  - `completedFocusSessions` → number (getter).
  - `transitioning` → boolean (getter).

- [ ] **Step 1: Write the failing test**

Create `tests/pomodoro-cycle.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { create } = require('../assets/js/pomodoro-cycle.js');

function makeCycle(cycles) {
  const recorded = [];
  const cycle = create({
    cyclesBeforeLong: () => cycles,
    onFocusCompleted: (m) => recorded.push(m)
  });
  return { cycle, recorded };
}

test('a focus session completes exactly once even if tick re-enters', () => {
  const { cycle, recorded } = makeCycle(4);
  // tick fires every 250ms; the transition takes 550ms -> 3 entries
  const results = [cycle.complete('focus', 25), cycle.complete('focus', 25), cycle.complete('focus', 25)];
  assert.equal(results[0], 'short');
  assert.equal(results[1], null, 'second re-entry must be rejected by the guard');
  assert.equal(results[2], null, 'third re-entry must be rejected by the guard');
  assert.equal(cycle.completedFocusSessions, 1, 'counter must not inflate');
  assert.deepEqual(recorded, [25], 'stats must be recorded once');
});

test('every fourth focus session earns a long break', () => {
  const { cycle } = makeCycle(4);
  const seen = [];
  for (let i = 0; i < 4; i++) {
    seen.push(cycle.complete('focus', 25));
    cycle.finishTransition();
    cycle.complete('short', 5);
    cycle.finishTransition();
  }
  assert.deepEqual(seen, ['short', 'short', 'short', 'long']);
  assert.equal(cycle.completedFocusSessions, 4);
});

test('a break completes to focus and does not touch the counter', () => {
  const { cycle, recorded } = makeCycle(4);
  assert.equal(cycle.complete('short', 5), 'focus');
  assert.equal(cycle.completedFocusSessions, 0);
  assert.deepEqual(recorded, []);
});

test('finishTransition re-arms the guard', () => {
  const { cycle } = makeCycle(4);
  assert.equal(cycle.complete('focus', 25), 'short');
  assert.equal(cycle.transitioning, true);
  cycle.finishTransition();
  assert.equal(cycle.transitioning, false);
  assert.equal(cycle.complete('short', 5), 'focus');
});

test('cyclesBeforeLong is read live, not captured', () => {
  let cycles = 2;
  const cycle = create({ cyclesBeforeLong: () => cycles, onFocusCompleted: () => {} });
  assert.equal(cycle.complete('focus', 25), 'short');
  cycle.finishTransition();
  cycles = 4; // user edits the setting mid-session
  assert.equal(cycle.complete('focus', 25), 'short', 'session 2 of 4 is not a long break');
});

test('reset zeroes the counter and the flag', () => {
  const { cycle } = makeCycle(4);
  cycle.complete('focus', 25);
  cycle.reset();
  assert.equal(cycle.completedFocusSessions, 0);
  assert.equal(cycle.transitioning, false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/pomodoro-cycle.test.js`

Expected: FAIL — `Cannot find module '../assets/js/pomodoro-cycle.js'`.

- [ ] **Step 3: Write the implementation**

Create `assets/js/pomodoro-cycle.js`:

```js
/* Pomodoro session-cycle state machine.
 *
 * Extracted from pomodoro.html so the completion guard is testable.
 *
 * The bug this fixes: tick() runs every 250ms, but the mode/endTime
 * change that ends a session happened 550ms later inside a setTimeout.
 * The completion block therefore re-entered ~3x per session, inflating
 * the daily tally and the cycle dots ~3x and firing three chimes.
 *
 * complete() now returns null on re-entry. Callers must treat null as
 * "already handled, do nothing" and call finishTransition() when the
 * animation delay has elapsed.
 */
(function (root) {
  'use strict';

  function create(opts) {
    var completedFocusSessions = 0;
    var transitioning = false;

    return {
      get completedFocusSessions() { return completedFocusSessions; },
      get transitioning() { return transitioning; },

      complete: function (mode, minutes) {
        if (transitioning) return null;
        transitioning = true;

        if (mode === 'focus') {
          completedFocusSessions += 1;
          opts.onFocusCompleted(minutes);
          var perLong = opts.cyclesBeforeLong();
          return (completedFocusSessions % perLong === 0) ? 'long' : 'short';
        }
        return 'focus';
      },

      finishTransition: function () { transitioning = false; },

      reset: function () {
        completedFocusSessions = 0;
        transitioning = false;
      }
    };
  }

  var api = { create: create };
  root.PomodoroCycle = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/pomodoro-cycle.test.js`

Expected: PASS, 6 tests.

- [ ] **Step 5: Wire it into the page**

Add to `pomodoro.html` `<head>`:

```html
  <script src="assets/js/pomodoro-cycle.js"></script>
```

Inside the main IIFE, replace `nextMode()` (`:1070-1079`) with a cycle instance:

```js
  const cycle = PomodoroCycle.create({
    cyclesBeforeLong: () => totalCycles(),
    onFocusCompleted: (minutes) => {
      updateDots();
      recordFocusCompleted(minutes);
    }
  });
```

`updateDots()` reads `completedFocusSessions`; change it to read `cycle.completedFocusSessions`. Delete the standalone `completedFocusSessions` variable and update `reset()` (`:1137`) to call `cycle.reset()` instead of `completedFocusSessions = 0`.

Then add one shared completion routine and call it from both sites:

```js
  function completeSession() {
    const upcoming = cycle.complete(mode, Math.round(durationSec / 60));
    if (upcoming === null) return;      // already transitioning — the guard

    clearInterval(timerId);
    timerId = null;
    pling(mode === 'focus' ? 1 : 2);
    flipped = !flipped;
    rotor.classList.toggle('flipped', flipped);

    setTimeout(() => {
      cycle.finishTransition();
      startSession(upcoming, true);
      if (isRunning) timerId = setInterval(tick, 250);
    }, 550);
  }
```

Replace the body of `if (remainingSec <= 0) { ... }` at `:1096-1106` with a single call to `completeSession()`, and do the same for the duplicated block at `:1163-1171`. Both blocks are now one function, so this class of bug cannot diverge again.

- [ ] **Step 6: Run the full suite**

Run: `node --test tests/`

Expected: PASS.

- [ ] **Step 7: Verify in the browser**

Set focus to 1 minute in Customize timings. Note the "sessions today" count, run one session to completion, and confirm the count rises by **exactly 1**, that you hear **one** chime, and that the hourglass flip runs smoothly without stuttering or reversing.

- [ ] **Step 8: Commit**

```bash
git add assets/js/pomodoro-cycle.js tests/pomodoro-cycle.test.js pomodoro.html
git commit -m "fix: pomodoro counted every session ~3 times

tick() runs every 250ms but mode/endTime only changed 550ms later inside
a setTimeout, so the unguarded completion block re-entered ~3x per
session: three chimes, a flip animation reversed mid-flight, and both
completedFocusSessions++ and recordFocusCompleted() running three times.
Daily stats and cycle dots were inflated ~3x.

The block was also copy-pasted in two places. Both now call one
completeSession(), backed by a tested state machine whose complete()
returns null on re-entry."
```

---

### Task 4: Pomodoro timing settings are never persisted

The four timing inputs are hardcoded `value="25"/"5"/"15"/"4"` in markup (`pomodoro.html:384-396`) and nothing writes them to storage. A visitor who prefers 50/10 re-enters it every single visit.

**Files:**
- Create: `assets/js/pomodoro-settings.js`
- Create: `tests/pomodoro-settings.test.js`
- Modify: `pomodoro.html`

**Interfaces:**
- Consumes: nothing.
- Produces: global `PomodoroSettings` with `load(storage)` → `{focus, short, long, cycles}` and `save(storage, settings)` → void. `storage` is any object with `getItem`/`setItem` (the real `localStorage`, or a stub in tests). Key: `pomodoro:settings`. Invalid, missing, or out-of-range values fall back to the defaults `{focus:25, short:5, long:15, cycles:4}`.

- [ ] **Step 1: Write the failing test**

Create `tests/pomodoro-settings.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { load, save, DEFAULTS, KEY } = require('../assets/js/pomodoro-settings.js');

function stubStorage(initial) {
  const data = Object.assign({}, initial);
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); }
  };
}

test('returns defaults when storage is empty', () => {
  assert.deepEqual(load(stubStorage()), DEFAULTS);
});

test('round-trips a saved set of settings', () => {
  const s = stubStorage();
  save(s, { focus: 50, short: 10, long: 25, cycles: 3 });
  assert.deepEqual(load(s), { focus: 50, short: 10, long: 25, cycles: 3 });
});

test('falls back to defaults on malformed JSON', () => {
  assert.deepEqual(load(stubStorage({ [KEY]: 'not json{' })), DEFAULTS);
});

test('rejects out-of-range and non-numeric values field by field', () => {
  const s = stubStorage({ [KEY]: JSON.stringify({ focus: 0, short: 'x', long: 999, cycles: 3 }) });
  const got = load(s);
  assert.equal(got.focus, DEFAULTS.focus, 'zero is out of range');
  assert.equal(got.short, DEFAULTS.short, 'non-numeric falls back');
  assert.equal(got.long, DEFAULTS.long, '999 is out of range');
  assert.equal(got.cycles, 3, 'valid values survive alongside invalid ones');
});

test('survives a storage that throws (Safari private browsing)', () => {
  const hostile = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('denied'); }
  };
  assert.deepEqual(load(hostile), DEFAULTS);
  assert.doesNotThrow(() => save(hostile, DEFAULTS));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/pomodoro-settings.test.js`

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `assets/js/pomodoro-settings.js`:

```js
/* Persistence for the four pomodoro timing inputs.
 *
 * Every accessor is wrapped: localStorage throws outright in Safari
 * private browsing, and a timer that refuses to load is worse than a
 * timer that forgets your settings.
 */
(function (root) {
  'use strict';

  var KEY = 'pomodoro:settings';
  var DEFAULTS = { focus: 25, short: 5, long: 15, cycles: 4 };
  var RANGES = { focus: [1, 180], short: [1, 60], long: [1, 120], cycles: [1, 12] };

  function clean(field, value) {
    var n = Number(value);
    var range = RANGES[field];
    if (!isFinite(n) || Math.floor(n) !== n) return DEFAULTS[field];
    if (n < range[0] || n > range[1]) return DEFAULTS[field];
    return n;
  }

  function load(storage) {
    var raw;
    try { raw = storage.getItem(KEY); } catch (e) { return Object.assign({}, DEFAULTS); }
    if (!raw) return Object.assign({}, DEFAULTS);

    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return Object.assign({}, DEFAULTS); }
    if (!parsed || typeof parsed !== 'object') return Object.assign({}, DEFAULTS);

    return {
      focus: clean('focus', parsed.focus),
      short: clean('short', parsed.short),
      long: clean('long', parsed.long),
      cycles: clean('cycles', parsed.cycles)
    };
  }

  function save(storage, settings) {
    try {
      storage.setItem(KEY, JSON.stringify({
        focus: clean('focus', settings.focus),
        short: clean('short', settings.short),
        long: clean('long', settings.long),
        cycles: clean('cycles', settings.cycles)
      }));
    } catch (e) { /* storage unavailable — settings just won't persist */ }
  }

  var api = { load: load, save: save, DEFAULTS: DEFAULTS, KEY: KEY };
  root.PomodoroSettings = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/pomodoro-settings.test.js`

Expected: PASS, 5 tests.

- [ ] **Step 5: Wire it into the page**

Add to `<head>`: `<script src="assets/js/pomodoro-settings.js"></script>`

On init, before the first `startSession`, hydrate the inputs:

```js
  const savedSettings = PomodoroSettings.load(window.localStorage);
  focusInput.value = savedSettings.focus;
  shortInput.value = savedSettings.short;
  longInput.value = savedSettings.long;
  cyclesInput.value = savedSettings.cycles;
```

In the existing `change`/`input` handler for the timing fields — the one that already calls `syncActiveDuration` — also persist:

```js
    PomodoroSettings.save(window.localStorage, {
      focus: focusInput.value, short: shortInput.value,
      long: longInput.value, cycles: cyclesInput.value
    });
```

Use the actual variable names present in the file for the four inputs; the plan assumes `focusInput`, `shortInput`, `longInput`, `cyclesInput` based on `focusInput` at `:430`.

- [ ] **Step 6: Verify in the browser**

Set focus to 50 and short to 10, reload the page, and confirm both persist. Then run `localStorage.setItem('pomodoro:settings','garbage')` in the console, reload, and confirm the timer still loads at 25/5/15/4 rather than breaking.

- [ ] **Step 7: Commit**

```bash
git add assets/js/pomodoro-settings.js tests/pomodoro-settings.test.js pomodoro.html
git commit -m "feat: persist pomodoro timing settings

The four inputs were hardcoded in markup and never saved, so a 50/10
preference had to be re-entered on every visit. Now stored under
pomodoro:settings, with per-field range validation and defaults on
malformed data. All storage access is wrapped -- localStorage throws
outright in Safari private browsing."
```

---

### Task 5: Pomodoro ambience — volume, orphaned track, attribution

Three small defects. Forest plays at `volume: 1` while the other three sit at 0.35–0.55 (`pomodoro.html:1211-1216`), so it is roughly twice as loud when layered. `ambience-birdsong.mp3` (3.3MB) is referenced by no file in the repository. And the pomodoro credits none of its tracks, while `coffee.html:186` credits Freesound (CC0) for the one they share.

**Files:**
- Modify: `pomodoro.html` — ambience volume table, chip markup, credits line
- Create: `tests/assets.test.js`

**Interfaces:**
- Consumes: `tests/helpers.js`.
- Produces: nothing consumed later.

**Blocked on input:** the licence and author of `fireplace.mp3`, `ambience-forest.mp3` and `ambience-waves.mp3` are unknown. Only `ambience-coffee.mp3` has known provenance (Matias44, Freesound, CC0). Do not invent attributions — get these from the site owner before this task. If a source cannot be established for a track, remove that track rather than ship it uncredited.

- [ ] **Step 1: Write the failing test**

Create `tests/assets.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, pagePaths, readPage } = require('./helpers');

test('every mp3 in the repo is referenced by at least one page', () => {
  const audio = fs.readdirSync(ROOT).filter((f) => f.endsWith('.mp3'));
  const allHtml = pagePaths().map((p) => readPage(path.basename(p))).join('\n');
  for (const file of audio) {
    assert.ok(allHtml.includes(file), `${file} is in the repo but no page references it`);
  }
});

test('pomodoro credits its ambience tracks', () => {
  const src = readPage('pomodoro.html');
  assert.match(src, /freesound|CC0|creative commons/i,
    'ambience tracks are used without attribution');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/assets.test.js`

Expected: both FAIL — `ambience-birdsong.mp3 is in the repo but no page references it`, and no attribution found.

- [ ] **Step 3: Level the ambience volumes**

Replace the track table at `pomodoro.html:1211-1216`. Forest is the only change — `1` becomes `0.45`, inside the 0.35–0.55 band of the others:

```js
    var tracks = [
      { btn: $('fireBtn'),   audio: $('fireAudio'),   volume: 0.55 },
      { btn: $('cafeBtn'),   audio: $('cafeAudio'),   volume: 0.55 },
      { btn: $('forestBtn'), audio: $('forestAudio'), volume: 0.45 },
      { btn: $('wavesBtn'),  audio: $('wavesAudio'),  volume: 0.35 },
      { btn: $('birdsBtn'),  audio: $('birdsAudio'),  volume: 0.45 }
    ];
```

Verify by layering forest with fireplace and confirming neither dominates.

- [ ] **Step 4: Wire in the orphaned birdsong track**

Add the chip after the waves chip at `pomodoro.html:361`:

```html
        <button class="ambience-chip" id="birdsBtn"><span class="chip-icon">🐦</span><span class="chip-label">Birdsong</span></button>
```

And the audio element after `:366`, matching the existing `loop preload="none"` (which is why none of the ~15MB is fetched until a chip is clicked):

```html
      <audio id="birdsAudio" loop preload="none" src="ambience-birdsong.mp3"></audio>
```

**Watch the panel height.** `.ambience-panel.open` sets `max-height: 220px` with `overflow: hidden` (`pomodoro.html:162-166`). Four chips already nearly fill it; a fifth will be clipped and unclickable. Change that rule to `max-height: 320px`, then verify at 375px width that all five chips are visible and tappable.

If the site owner would rather drop the track, delete `ambience-birdsong.mp3` and skip this step — the test passes either way. Do not leave it orphaned; it is 3.3MB of dead weight in the deploy.

- [ ] **Step 5: Add the credits line**

Add after the `<audio>` elements, matching the phrasing at `coffee.html:186`. Fill in the three unknown attributions from the site owner before committing — do not invent them:

```html
      <p class="ambience-credit">
        Café by Matias44, Freesound (CC0). <!-- fireplace / forest / waves / birdsong: pending -->
      </p>
```

Style it to match `footer p` (`pomodoro.html:238`): DM Mono, `0.62rem`, `var(--muted)`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test tests/`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add pomodoro.html tests/assets.test.js
git commit -m "fix: level ambience volumes, wire in birdsong, add attribution

Forest played at 1.0 against 0.35-0.55 for the others, dominating any
layered mix. ambience-birdsong.mp3 (3.3MB) was in the repo referenced by
nothing. And the pomodoro credited none of its four tracks while
coffee.html credits the one they share.

Adds a test that fails if any mp3 goes unreferenced again."
```

---

### Task 6: Snake — three defects

Reversal-into-self compares against `dir` (`snake.html:261`), which is only committed inside `step()` (`:215`); press Up→Left→Down within one tick and you turn 180° into your own neck. Collision tests the whole array including the tail cell being vacated on the same step (`:218`), so moving into the square your tail is leaving kills you. And `localStorage` is read unguarded at IIFE scope (`:165`), so **the entire game fails to initialise** in Safari private browsing — no board, no error.

**Files:**
- Create: `assets/js/snake-logic.js`
- Create: `tests/snake-logic.test.js`
- Modify: `snake.html`

**Interfaces:**
- Consumes: nothing.
- Produces: global `SnakeLogic` with:
  - `canTurn(pendingDir, requested)` → boolean. Compares against the **pending** direction, not the committed one.
  - `selfCollides(body, head, growing)` → boolean. `body` is an array of `{x, y}`, head-first. When `growing` is false the final element is excluded, because it is vacated on the same step.
  - `readBest(storage)` / `writeBest(storage, score)` → guarded high-score access.

- [ ] **Step 1: Write the failing test**

Create `tests/snake-logic.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { canTurn, selfCollides, readBest, writeBest } = require('../assets/js/snake-logic.js');

const UP = { x: 0, y: -1 }, DOWN = { x: 0, y: 1 };
const LEFT = { x: -1, y: 0 }, RIGHT = { x: 1, y: 0 };

test('cannot reverse directly into itself', () => {
  assert.equal(canTurn(UP, DOWN), false);
  assert.equal(canTurn(LEFT, RIGHT), false);
});

test('perpendicular turns are allowed', () => {
  assert.equal(canTurn(UP, LEFT), true);
  assert.equal(canTurn(RIGHT, DOWN), true);
});

test('two turns within one tick cannot produce a reversal', () => {
  // Regression: the old code compared against the committed dir, so
  // Up -> Left -> Down all passed within a single tick.
  let pending = UP;
  if (canTurn(pending, LEFT)) pending = LEFT;
  assert.equal(canTurn(pending, DOWN), true, 'Left -> Down is a legal perpendicular turn');
  pending = UP;
  if (canTurn(pending, RIGHT)) pending = RIGHT;
  assert.equal(canTurn(pending, LEFT), false, 'Right -> Left must be rejected');
});

test('moving into the cell the tail is vacating is safe', () => {
  const body = [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 5 }];
  assert.equal(selfCollides(body, { x: 6, y: 5 }, false), false, 'tail is freed this step');
});

test('moving into the tail while growing is a collision', () => {
  const body = [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 5 }];
  assert.equal(selfCollides(body, { x: 6, y: 5 }, true), true, 'tail stays put when growing');
});

test('running into the middle of the body is a collision', () => {
  const body = [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 5 }];
  assert.equal(selfCollides(body, { x: 5, y: 6 }, false), true);
});

test('high score survives a storage that throws', () => {
  const hostile = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('denied'); }
  };
  assert.equal(readBest(hostile), 0);
  assert.doesNotThrow(() => writeBest(hostile, 42));
});

test('high score round-trips and ignores junk', () => {
  const data = {};
  const s = { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
  assert.equal(readBest(s), 0);
  writeBest(s, 17);
  assert.equal(readBest(s), 17);
  data['kn-snake-best'] = 'banana';
  assert.equal(readBest(s), 0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/snake-logic.test.js`

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `assets/js/snake-logic.js`:

```js
/* Snake rules that are worth testing on their own. */
(function (root) {
  'use strict';

  var BEST_KEY = 'kn-snake-best';

  // Compare against the PENDING direction, not the committed one. The old
  // inline version checked the committed dir, so Up -> Left -> Down inside
  // a single tick let you reverse into your own neck.
  function canTurn(pendingDir, requested) {
    return !(pendingDir.x === -requested.x && pendingDir.y === -requested.y);
  }

  // When not growing, the last segment is vacated on this same step, so
  // moving into it is legal. The old version tested the whole array and
  // killed you for it.
  function selfCollides(body, head, growing) {
    var limit = growing ? body.length : body.length - 1;
    for (var i = 0; i < limit; i++) {
      if (body[i].x === head.x && body[i].y === head.y) return true;
    }
    return false;
  }

  function readBest(storage) {
    try {
      var n = parseInt(storage.getItem(BEST_KEY), 10);
      return isFinite(n) && n >= 0 ? n : 0;
    } catch (e) { return 0; }
  }

  function writeBest(storage, score) {
    try { storage.setItem(BEST_KEY, String(score)); } catch (e) { /* unavailable */ }
  }

  var api = {
    canTurn: canTurn, selfCollides: selfCollides,
    readBest: readBest, writeBest: writeBest, BEST_KEY: BEST_KEY
  };
  root.SnakeLogic = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/snake-logic.test.js`

Expected: PASS, 8 tests.

- [ ] **Step 5: Wire it into the page**

Add to `snake.html` `<head>`: `<script src="assets/js/snake-logic.js"></script>`

- Replace the direction check at `:261` with `if (!SnakeLogic.canTurn(nextDir, {x: nx, y: ny})) return;` — note it now reads `nextDir`, not `dir`.
- Replace the collision test at `:218` with `SnakeLogic.selfCollides(snake, head, willGrow)`, where `willGrow` is whatever the existing code uses to decide against `pop()`.
- Replace the unguarded `localStorage.getItem` at `:165` with `SnakeLogic.readBest(window.localStorage)` and the write at `:239` with `SnakeLogic.writeBest(window.localStorage, best)`.

- [ ] **Step 6: Fix the Space-to-retry dead end**

The game-over message says "press a key to retry" (`:241,243`) but the Space branch is gated on `if (running)` (`:279`), so Space does nothing after a game over. Move the restart out of that guard so Space restarts when the game is over.

- [ ] **Step 7: Verify in the browser**

Open `snake.html`. Confirm: rapidly pressing Up then Left then Down does not kill you instantly; following your own tail closely does not kill you; Space restarts after a game over. Then open the page in a Safari private window and confirm the board renders and the game is playable.

- [ ] **Step 8: Commit**

```bash
git add assets/js/snake-logic.js tests/snake-logic.test.js snake.html
git commit -m "fix: three Snake defects

- Reversal check compared against the committed direction rather than
  the pending one, so Up/Left/Down within one tick turned you 180 degrees
  into your own neck.
- Collision test included the tail cell being vacated on the same step,
  so following your own tail was fatal.
- localStorage was read unguarded at IIFE scope, so the entire game
  failed to initialise in Safari private browsing -- no board, no error.
- Space did nothing after a game over despite the prompt saying otherwise."
```

---

### Task 7: Link previews, favicons, and the render-blocking script

No page has a `meta description` or any Open Graph tag, so every shared link renders as a bare URL. `index.html` and `cv.html` are the only two pages without a favicon. Leaflet is a ~150KB third-party script loaded render-blocking in `coffee.html`'s `<head>`.

Two page-head issues from Phase 3 are folded in here rather than touching all 12 `<head>` blocks twice: the two divergent Google Fonts URLs (which cause a font cache miss on navigation) are canonicalised to one, and `preconnect` is pointed at `fonts.gstatic.com`, where the font files actually come from.

**Files:**
- Create: `assets/og/*.png` (12 cards), `tools/make-og-cards.sh`
- Create: `tests/page-head.test.js`
- Modify: all 12 `*.html` `<head>` blocks

**Interfaces:**
- Consumes: `tests/helpers.js`.
- Produces: nothing consumed later.

- [ ] **Step 1: Write the failing test**

Create `tests/page-head.test.js`:

```js
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

test('every page has a favicon', () => {
  eachPage((name, src) => {
    assert.ok(src.includes('rel="icon"'), `${name} has no favicon`);
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/page-head.test.js`

Expected: FAIL on all eight — no page has any of these.

- [ ] **Step 3: Write the OG card generator**

`sips` rasterises SVG to PNG with no installs — verified at 1200×630, ~38KB. Note that `font-style="italic"` is not honoured; use the upright face.

Create `tools/make-og-cards.sh`:

```bash
#!/usr/bin/env bash
# Generate 1200x630 Open Graph cards. Zero dependencies: sips is macOS built-in.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p assets/og
TMP="$(mktemp -d)"

card() {  # slug | title | subtitle
  local slug="$1" title="$2" sub="$3"
  cat > "$TMP/$slug.svg" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#f5f2ed"/>
  <rect x="0" y="0" width="1200" height="8" fill="#9a2a2a"/>
  <text x="90" y="300" font-family="Georgia,serif" font-size="88" fill="#1a1814">$title</text>
  <text x="90" y="370" font-family="Georgia,serif" font-size="34" fill="#7a7570">$sub</text>
  <text x="90" y="545" font-family="Courier,monospace" font-size="24" fill="#9a2a2a" letter-spacing="6">KATJA NORSTAD</text>
</svg>
SVG
  sips -s format png "$TMP/$slug.svg" --out "assets/og/$slug.png" >/dev/null
  printf '  %-18s %s\n' "$slug.png" "$(du -h "assets/og/$slug.png" | cut -f1)"
}

card index        "Katja Norstad"      "Data scientist in Oslo, and a few things I built"
card cv           "Curriculum Vitae"   "Data scientist, Oslo — since 2012"
card resources    "Worth your time"    "A small collection of things I keep coming back to"
card pomodoro     "Pomodoro Timer"     "An hourglass that keeps you honest"
card languages    "Practise a language" "Five words a day, with spaced repetition"
card mots-du-jour "Mots du jour"       "Five French words a day"
card spanish      "Palabras del día"   "Five Spanish words a day"
card portuguese   "Palavras do dia"    "Five Portuguese words a day"
card japanese     "今日の単語"           "Five Japanese words a day"
card ukrainian    "Слова дня"          "Five Ukrainian words a day"
card coffee       "Coffee notes"       "52 beans, 6 Oslo roasters, one tasting log"
card snake        "Snake"              "A small game, in a small canvas"

echo "Done. Cards in assets/og/"
```

Run it:

```bash
chmod +x tools/make-og-cards.sh && ./tools/make-og-cards.sh
```

Expected: 12 PNGs listed, each roughly 25–45KB.

- [ ] **Step 4: Open one card and check it visually**

Open `assets/og/pomodoro.png`. Confirm the title and subtitle rendered as text and the card is not blank — a failed SVG rasterisation still produces a correctly-sized but empty PNG, so dimensions alone do not prove success. Check the Japanese and Ukrainian cards specifically, since they depend on font fallback for CJK and Cyrillic.

- [ ] **Step 5: Add the head tags to all 12 pages**

For each page, add inside `<head>`. The example is `pomodoro.html`; vary title, description and slug per page, matching the subtitles used in the card script.

```html
  <meta name="description" content="A pomodoro timer shaped like an hourglass, with layerable ambience and a daily focus tally." />
  <link rel="canonical" href="https://katjanorstad.no/pomodoro.html" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://katjanorstad.no/pomodoro.html" />
  <meta property="og:title" content="Pomodoro Timer — Katja Norstad" />
  <meta property="og:description" content="An hourglass that keeps you honest." />
  <meta property="og:image" content="https://katjanorstad.no/assets/og/pomodoro.png" />
  <meta name="twitter:card" content="summary_large_image" />
```

**The domain is `https://katjanorstad.no`** — confirmed from the `CNAME` file in `nor-tja/nor-tja.github.io`, the GitHub Pages repo this site deploys from. Keep `og:image` absolute: most scrapers ignore relative ones.

While in each `<head>`:
- Add `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />` beside the existing googleapis preconnect.
- Canonicalise the fonts URL to include `DM+Mono:wght@300;400;500` on every page, so the cache hits across navigation. `japanese.html` keeps its additional `&family=Noto+Sans+JP:wght@300;400;500`.
- Add the shared base64 SVG favicon (copy the `<link rel="icon" ...>` line from `languages.html:7`) to `index.html` and `cv.html`.
- In `coffee.html:12`, add `defer` to the Leaflet `<script>` tag.

- [ ] **Step 6: Run the full suite**

Run: `node --test tests/`

Expected: PASS, all files.

- [ ] **Step 7: Verify the previews**

Deploy, then paste one URL into each of: the Facebook Sharing Debugger, and a Slack or iMessage draft. Confirm a title, description and image card appear. Also confirm `coffee.html` still renders its map with Leaflet now deferred — `defer` scripts run after parsing, so any inline code depending on `L` must run on `DOMContentLoaded` or later.

- [ ] **Step 8: Commit**

```bash
git add tools/make-og-cards.sh assets/og tests/page-head.test.js *.html
git commit -m "feat: link previews, favicons, and non-blocking Leaflet

No page had a meta description or any Open Graph tag, so every shared
link rendered as a bare URL -- the largest gap for tools meant to reach
people beyond the author.

- 12 generated 1200x630 OG cards (sips rasterises SVG; no installs)
- description, og:*, twitter:card and canonical on all 12 pages
- favicons for index.html and cv.html, the only two lacking one
- one canonical Google Fonts URL (two variants were causing a cache miss
  on navigation) and preconnect to gstatic, where the fonts actually are
- defer on Leaflet, a ~150KB render-blocking third-party script

Tests assert every invariant, including that each og:image exists."
```

---

## Verification

After all seven tasks:

```bash
node --test tests/                                        # all suites pass
for f in *.html; do printf "%-22s %4d KB\n" "$f" $(( $(stat -f%z "$f")/1024 )); done | sort -k2 -rn | head -3
du -sh .
```

Expected: no page over 60KB (the largest was 932KB), and the repository smaller by roughly the 3.3MB birdsong track if it was dropped.

Manual pass, since none of this is covered by unit tests: open every page in a browser and confirm nothing regressed; check `coffee.html` in Safari private browsing and `snake.html` too.

## Deferred to Phase 2 / 3

- The `addDays` timezone bug breaking spaced repetition — Phase 2, fixed once during the engine consolidation rather than five times now.
- `--muted` contrast, `:focus-visible`, `prefers-reduced-motion`, `lang` attributes — Phase 3, in the shared stylesheet.
- Homepage reframe and nav entries for Coffee and Snake — Phase 3.
- `overflow: hidden` on `index.html` body — Phase 3.
- WebP for the coffee photo — gated on `brew install webp`, worth roughly 30KB.
- Notification API for backgrounded pomodoro completion — a feature, not a repair.