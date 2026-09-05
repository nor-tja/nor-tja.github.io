# Website improvements — design

**Date:** 2026-09-04
**Status:** Approved, pending implementation plan

## Context

`my_website` is 12 hand-written HTML files, each fully self-contained: inline CSS,
inline JS, no build step, no version control, deployed by copying files to a host.

Three decisions frame this work:

- **The site is published.** Page weight, link previews and search visibility are
  real costs, not hypotheticals.
- **The tools are the draw.** The pomodoro, language drills, coffee notes and Snake
  are meant to find an audience beyond the author. The CV is not the centrepiece.
- **Light structure only.** Plain HTML/CSS/JS with shared files and data extracted.
  No framework, no build step.

## Problems

### Broken behaviour

**The spaced-repetition scheduler does not work east of UTC.** `addDays()`
(`mots-du-jour.html:418-422`) constructs a date at *local* midnight and reads it back
as UTC:

```js
var d = new Date(dateStr + 'T00:00:00');   // local midnight
d.setDate(d.getDate() + n);
return d.toISOString().slice(0, 10);        // read back as UTC
```

At any positive UTC offset, local midnight falls on the previous UTC day, so the
increment is cancelled. Verified under `TZ=Europe/Oslo`: `addDays('2026-09-04', 1)`
returns `2026-09-04`. Because `getDueEntries` tests `due <= today`, a card graded
"Got it" is immediately due again and can never leave the queue. Correct under
`TZ=America/New_York`; broken from London eastward. Present in all five language
pages.

**The day boundary is inconsistent.** `todaysWords` uses the *local* calendar date
(`:319`) while `todayKey` (`:401`), `todayISO` (`:416`) and `updateStreak` (`:571`)
use UTC. In Japan, between 00:00 and 09:00 local, the new day's words are displayed
but taps are filed under yesterday's key.

**The pomodoro double-counts every session.** The completion block
(`pomodoro.html:1096-1106`) has no guard: it does not clear the interval, null
`endTime`, or change `mode`. Those happen 550ms later inside a `setTimeout`, so the
250ms `tick` re-enters the block roughly three times per session — three chimes, a
stuttering flip animation, and daily stats and cycle dots inflated ~3×. The block is
duplicated at `:1163-1171`, so the fix must land twice.

**`coffee.html` is 955KB, and 915,467 bytes of that is line 387** — a 1500×2000 JPEG
inlined as base64, rendered at 220×275 (`:157`) inside a `<details>` that is collapsed
by default (`:385-388`). Inline base64 is not separately cacheable, so it is
re-downloaded on essentially every visit, and both `<script>` blocks sit after it —
the stats strip and pattern charts render as `–` and empty bars until it finishes.
Roughly 4s on slow 4G.

**The coffee process chart is wrong.** `/honey/i` is tested against name *and* notes,
and before `natural`/`washed`. Four washed beans whose notes mention "honeycomb" or
"honeydew" are classified as honey-process, corrupting the page's headline chart.

**Snake has three defects:** reversal-into-self compares against the committed `dir`
rather than `nextDir` (`snake.html:261`); collision tests include the tail cell being
vacated on the same step (`:218`); and `localStorage` is read unguarded at IIFE scope
(`:165`), so the entire game fails to initialise in Safari private browsing.

### Discoverability

- **No `meta description` and no Open Graph tags on any of the 12 pages.** Every
  shared link renders as a bare URL.
- The homepage leads with the CV and lists four destinations. Coffee is reachable only
  by hovering the mug image; **Snake is linked from nowhere at all**.
- Two different Google Fonts URLs across pages (some request DM Mono 500, some do
  not), so the font cache misses on navigation.
- All 12 pages `preconnect` to `fonts.googleapis.com`; the font *files* come from
  `fonts.gstatic.com`, which is never preconnected.

### Duplication

The five language pages are **~96% byte-identical outside their data arrays**. The
entire SRS implementation (~155 lines) and `render()` (87 lines) are identical in all
five, variable names included. Six of the ~23 differing code lines exist only because
a local variable was renamed `frVoice` → `esVoice` → `ptVoice` and so on.

All 12 pages independently duplicate the `:root` palette and `@keyframes rise`.

### Accessibility (site-wide)

- `--muted: #7a7570` on `--bg: #f5f2ed` measures **4.08:1** — below AA — and is applied
  to the smallest text on the site (0.58–0.65rem).
- **No `:focus` or `:focus-visible` styles anywhere on the site.**
- **No `prefers-reduced-motion` block anywhere on the site.**
- `<html lang="en">` on all 12 pages, including the Japanese, Ukrainian and Spanish
  content, with no `lang` attribute on any target-language text.
- The language pages' "learned" dot — which drives the streak and the entire SRS pool —
  is a 9×9px `<span>` with a click listener: no `role`, no `tabindex`, no keyboard
  handler, no `aria-pressed`.

## Design

### Phase 0 — Version control  *(done)*

The site deploys from **`nor-tja/nor-tja.github.io`** (GitHub Pages user site,
`CNAME` = `katjanorstad.no`), with 156 commits of history. `~/my_website` was an
untracked copy of it that had drifted in both directions. It is now attached to that
remote as a real working clone.

Reconciled at commit `a14eab1`. The drift was unambiguous — every file had one
obviously-correct side:

- **`pomodoro.html` on `main` was `mots-du-jour.html` under the wrong filename**,
  uploaded over the real file in `7405820`. Restored from `015f45e`.
- `index.html` and `CNAME`: live was ahead. Taken from live.
- `mots-du-jour`, `spanish`, `portuguese`: local was ahead (`.voice-tip`). Taken from local.

**Deployment must stop going through the GitHub web upload page.** Drag-and-drop is
what renamed one page over another, and it is why two copies drifted apart unnoticed.
Deploy by pushing from the clone.

### Phase 1 — Isolated fixes

Changes that do not touch code Phase 2 will replace.

| Fix | Detail |
|---|---|
| Coffee photo | Decode line 387 to `assets/img/`, resize to 440×550, emit WebP + JPEG fallback, reference with `loading="lazy"`, `decoding="async"` and explicit `width`/`height`. 955KB → ~40KB |
| Pomodoro guard | Null `endTime` on entering the completion block, in **both** copies |
| Meta + OG | `description`, `og:*` and `twitter:card` on all 12 pages. Generate the 1200×630 cards here too (see Phase 3) rather than shipping `og:image` tags that point at files which do not yet exist |
| Leaflet | Add `defer` — currently a render-blocking ~150KB third-party script in `<head>` |
| Process chart | Match against bean name only; order Honey last |
| Favicons | Add to `index.html` and `cv.html`, the only two pages lacking one |
| Snake | Fix reversal, tail-cell collision, and unguarded `localStorage` |
| Pomodoro settings | Persist the four timing inputs to `pomodoro:settings` and restore on load. Currently hardcoded `value="25"` in markup, so a 50/10 preference is re-entered every visit |
| Ambience volumes | Forest plays at `1.0` against 0.35–0.55 for the others; level them so layering works |
| Orphaned audio | `ambience-birdsong.mp3` (3.3MB) is referenced by nothing — wire it into the ambience chips or delete it |
| Audio attribution | The pomodoro credits none of its four tracks, while `coffee.html:186` credits Freesound (CC0). Close the gap |

### Phase 2 — Language consolidation

**Layout.** Existing filenames stay at the repository root, so no inbound link or
bookmark breaks. The five language pages become thin shells.

```
assets/css/site.css        tokens, .back, header, footer, rise, focus, reduced-motion
assets/css/practice.css    language-page specifics
assets/js/practice.js      the single engine
assets/data/{french,spanish,portuguese,japanese,ukrainian}.js
assets/img/                extracted photo, OG cards
```

**Classic scripts, not modules.** Data files are plain `<script src>` setting a global.
ES modules and `fetch`-loaded JSON are both blocked by CORS under `file://`, which
would end the ability to preview by double-clicking a file. This constraint is
deliberate and should not be "cleaned up" later.

**Data schema.** Two structural faults are fixed by the shape itself. Field 2 of the
current tuple means IPA in three languages and romanisation in two while sharing one
style; and `PHRASE_GROUPS.length` is a hand-maintained 20 while `CYCLE_LEN` derives
from `WORDS.length`, so adding five words silently empties the sentences section.
Co-locating words with their phrases makes that unrepresentable:

```js
window.PRACTICE_DATA = {
  slug: 'french', langTag: 'fr-FR', voicePrefix: 'fr',
  displayName: 'French', title: 'Mots du jour', fontStack: null,
  groups: [{
    words: [{ term: 'bonjour', reading: '/bɔ̃.ʒuʁ/', readingKind: 'ipa',
              en: 'hello', pos: 'interjection', icon: '👋' } /* …5 */ ],
    phrases: [{ target: '…', en: '…' }, { target: '…', en: '…' }]
  } /* …20 groups */ ]
};
```

`readingKind` is one of `ipa` | `romaji` | `translit`, so the value can be labelled and
styled according to what it actually is.

**Storage.** One versioned key per language replaces five, and absorbs the unbounded
per-day keys (currently ~1,825 dead keys per year across five languages):

```
practice:v1:<slug> → { srs, voice, streak, lastPracticed, marked: { 'YYYY-MM-DD': [...] } }
```

`marked` is pruned to the last 14 days on write.

**Migration.** On first load, if `practice:v1:<slug>` is absent and legacy keys exist,
read the legacy keys and write the new shape. **Legacy keys are left in place** so
rollback costs nothing.

**Overdue rebase.** Every `due` date in existing history was computed by the broken
`addDays` and is therefore in the past. Fixing the bug would make every card ever
marked come due simultaneously. On migration, for any entry whose `due` is already
past, set `due = today + interval`. Intervals and ease factors are preserved.

**Folded into the port** (once, rather than five times): the `addDays` fix; the
local/UTC day boundary standardised on **local**; the learned dot rebuilt as a real
`<button>` with `aria-pressed` and a ≥24px target; `lang` attributes on
target-language text; `textContent` in place of `innerHTML` interpolation; and schema
versioning.

### Phase 3 — Shared foundation

`site.css` replaces the palette, `.back`, header, footer and `@keyframes rise`
currently duplicated across all 12 files. Because it is one file, these are fixed once:

- `--muted` → `#6e6963` (**4.87:1**, passes AA; `#7a7570` measured 4.08:1)
- `:focus-visible` rings
- a `prefers-reduced-motion` block
- one canonical Google Fonts URL across all pages, plus `preconnect` to
  `fonts.gstatic.com` with `crossorigin`

**Homepage reframe.** Lead with the tools rather than the CV, and give every
destination a nav entry — including Coffee, currently a mug-hover easter egg, and
Snake, currently unlinked. Remove `overflow: hidden` from `body`, which clips the
greeting on short landscape viewports with no way to scroll.

**OG images.** One generated 1200×630 typographic card per page: page title in
Cormorant Garamond on the cream background, in the existing palette. The cards are
produced during Phase 1 alongside the tags that reference them; this section defines
their appearance.

## Out of scope

- **Notification API for backgrounded pomodoro completion.** The right fix for "the
  tab was hidden when the timer ended", but a feature, not a repair.
- **Extending the 20-day / 100-word rotation.** Day 21 is identical to day 1. This is
  the language pages' real product ceiling, but it is a content problem, not a code
  problem, and the new schema makes adding groups trivial.
- **Analytics.** Worth revisiting once the tools are findable.
- **Any framework or build step.** Explicitly excluded.

## Planning note

Phase 1 is planned and landed on its own. Phases 2 and 3 get their own plans once the
shape of the Phase 1 changes is visible.

## Open items

- **Ambience licensing.** Closing the attribution gap requires knowing the source and
  licence of the three uncredited tracks (`fireplace`, `ambience-forest`,
  `ambience-waves`, and `ambience-birdsong` if it is kept). Only
  `ambience-coffee.mp3` has a known provenance — Matias44, Freesound, CC0.
- **GitHub Pages is not enforcing HTTPS.** `nor-tja.github.io` currently 301s to
  `http://katjanorstad.no/`. The "Enforce HTTPS" box in the repository's Pages
  settings appears unchecked. One click, and it must happen before the absolute
  `https://` URLs added in Phase 1 are correct.
- **Push access.** The `gh` CLI on this machine is authenticated as `katjanorstad`,
  but the repository is owned by `nor-tja`, so pushes are rejected with 403.
