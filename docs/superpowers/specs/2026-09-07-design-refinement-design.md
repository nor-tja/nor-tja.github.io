# Design refinement — spec

**Date:** 2026-09-07
**Status:** approved (visual comparison reviewed and accepted 2026-09-07)
**Predecessor:** `2026-09-04-website-improvements-design.md` — this supersedes and
expands that spec's *Phase 3 — Shared foundation*.

## Context

Twelve standalone HTML pages, no framework and no build step, served from GitHub
Pages at katjanorstad.no. Every page carries its own `<style>` block.

The brief was explicit and narrow: **keep the look, fix the craft.** The cream /
Cormorant Garamond / DM Mono / deep-red editorial aesthetic is not under review.
Headings and layout scale are not under review either — they were deliberately
scaled down in earlier work and must stay as they are.

## Measured findings

Everything below was measured against the working tree, not estimated.

| Finding | Measurement |
|---|---|
| Distinct `font-size` values | **47** |
| …after normalising `.62rem` / `0.62rem` spellings | **39** — so 8 are the same number written two ways |
| Total `font-size` declarations | **289** |
| Language pages with byte-identical CSS blocks | **4** (`mots-du-jour`, `spanish`, `portuguese`, `ukrainian` — md5 `dec8f978…`, 8,775 bytes each) |
| `japanese.html` | near-copy of the same block that has drifted (md5 `fbc66485…`) |
| Smallest text on the site | `.5rem` (8.0px), `.55rem` (8.8px), `.58rem` (9.3px), `.62rem` (9.9px — 34 uses) |
| `--muted: #7a7570` on `--bg: #f5f2ed` | **4.08:1** — fails WCAG AA (needs 4.5:1) |
| `:focus-visible` / `:focus` styles | **none anywhere on the site** |
| `prefers-reduced-motion` blocks | **none anywhere on the site** |

The contrast failure and the smallest type are **the same pixels**: `--muted` is
applied predominantly to the 9–10px uppercase labels. This is a legibility
problem, not a tidiness problem, which is why the fix touches size as well as
colour.

### Shared rules are not textually identical

An early assumption — that the shared furniture could be lifted verbatim — was
checked and found false. Each candidate rule was extracted from all 12 pages by
brace-matching, normalised (whitespace collapsed, declarations sorted), and
grouped. Results:

| Rule | Distinct meanings | Verdict |
|---|---|---|
| `:root` — the 5 palette vars | **1** across all 12 | **extract** |
| `.back` | **1** (3 spellings: `0.65rem`/`.65rem`, `'DM Mono', monospace`/`'DM Mono',monospace`) | **extract** |
| `.back:hover` | **1** across 11 | **extract** |
| `.eyebrow` | **2** — 10 pages agree; `cv` adds `animation:rise`, `opacity:0`, `margin-bottom:1.4rem` | extract the common rule; **`cv` keeps an override** |
| `@keyframes rise` | **2** — `translateY(16px)` on 11, **`18px` on `cv`** | extract the 16px form; **`cv` keeps its own** |
| `body` | **4** — but 5 declarations are universal | **extract only the universal core** |
| `footer` | `text-align:center` unanimous; `padding` splits 4 ways | **extract `text-align` only** |
| `.wrap` | **4 real layout widths** | **stays local — not shared at all** |

Three of these were assumed shared and are not:

- **`.wrap` is not shared.** `max-width` is `860px` (coffee, resources),
  `780px` (cv), `640px` (7 language/pomodoro pages), `520px` (snake), and
  padding varies too (`0 2rem` / `0 2rem 4rem` / `0 2rem 3rem`). Only
  `margin: 0 auto` is common, which is not worth a shared rule. Extracting
  `.wrap` would have changed the column width of nine pages.
- **`cv.html`'s `@keyframes rise` travels 18px, not 16px.** Keyframes cannot be
  partially overridden — a local `@keyframes rise` replaces the shared one
  wholesale — so `cv` simply keeps its own copy.
- **`pomodoro.html`'s `:root` carries 6 extra variables** (`--amber-1/2/3`,
  `--blue-1/2/3`) for its hourglass. Its 5 palette vars match everyone else's.
  The extra six stay local; the `no-local-palette` test must therefore assert on
  the 5 palette names specifically, not on "`:root` is absent".

`footer` padding distribution, for the record:

| Padding | Pages |
|---|---|
| `1rem 0 1rem` | `languages`, `mots-du-jour`, `japanese`, `spanish`, `portuguese`, `ukrainian` (6) |
| `2.5rem 0` | `cv`, `coffee`, `resources` (3) |
| `3rem 0 1rem` | `pomodoro` (1) |
| `3rem 0 0` | `snake` (1) |

`index.html` is the outlier throughout: no `.back`, no `.eyebrow`, no `footer`,
no `.wrap`, and a `body` that is a centred flex container rather than a document.

Extraction must therefore compare semantics, not bytes — and must split rules
that are only *partly* shared, rather than forcing a default onto a property
that genuinely varies.

## Goals

1. One place to fix palette, focus and motion, instead of twelve.
2. `--muted` passes WCAG AA.
3. The smallest text is legible.
4. A coherent type scale.
5. No visible change to headings, layout, palette hue, or page structure —
   beyond the deliberate contrast and small-text changes in goals 2 and 3, which
   are the only differences a visitor should be able to notice.

## Non-goals

- Any change to the visual direction, palette hues or font choices.
- Any change to heading sizes or the `clamp()` heading rules.
- The homepage reframe (tools-first, nav on every page). That was in the earlier
  spec's Phase 3; the user chose "keep the look, fix the craft" over "rework
  layout + navigation", so it is explicitly **deferred**, not cancelled.
- Any framework or build step.

## Design

### 1. `assets/css/site.css`

A single stylesheet linked by all 12 pages, holding **only** what the
measurement above proved is genuinely shared:

- the 5 `:root` palette vars and the 11 new `--fs-*` type tokens
- `*, *::before, *::after { box-sizing: border-box }`
- `body` — **the universal core only**: `background`, `color`, `font-family`,
  `font-weight`, `min-height`
- `.back`, `.back:hover`, `.eyebrow`
- `footer { text-align: center; }` — the unanimous half only
- `@keyframes rise` — the `translateY(16px)` form
- `:focus-visible` rules
- the `prefers-reduced-motion` block

Everything else stays in each page's inline `<style>`, including four things
that look shared but are not: `.wrap`, `footer` padding, `body`'s
`font-size`/`line-height`, and the per-page overrides for `cv`'s `.eyebrow` and
`@keyframes rise`.

**Why `body`'s `font-size: 18px; line-height: 1.7` stays local.** Ten pages set
it; `index` and `snake` deliberately do not. Promoting it to `site.css` would
newly apply 18px and 1.7 to those two pages, resizing every child that has no
explicit size — a visible change on two pages, which contradicts goal 5. The
cost of leaving it is two duplicated declarations on ten pages. That is the
cheaper error.

**Link placement.** Immediately before the page's first `<style>` tag, so inline
rules still win on specificity ties. Inserted idempotently by extending
`tools/add-head-meta.js`, which already owns `<head>` content.

**Footer padding stays local.** Only `text-align: center` moves to `site.css`.
Each page keeps its own `footer { padding: … }` exactly as it is today.

An earlier draft of this spec proposed a shared `2.5rem 0` default with three
pages overriding it. Measurement showed that backwards: `2.5rem 0` is used by 3
pages and `1rem 0 1rem` by 6. Either choice leaves 5–8 pages overriding, so the
"default" would carry no weight while silently risking a layout change on every
page that inherited it. Splitting the rule and moving only the unanimous half is
the honest reading of the data.

### 2. Type scale: 47 values → 11 tokens

Defined in `site.css` and referenced as `var(--fs-*)`:

| Token | Value | px @16 | Replaces | Uses |
|---|---|---|---|---|
| `--fs-3xs` | `.65rem` | 10.4 | `.5` `.55` `.58` `.6` `.62` `.65` `.66` | 91 |
| `--fs-2xs` | `.7rem` | 11.2 | `.68` `.7` `.72` | 30 |
| `--fs-xs` | `.8rem` | 12.8 | `.78` `.8` `.82` | 18 |
| `--fs-sm` | `.875rem` | 14.0 | `.85` `.88` `.9` `.92` | 49 |
| `--fs-base` | `1rem` | 16.0 | `.95` `.98` `1` | 26 |
| `--fs-md` | `1.1rem` | 17.6 | `1.05` `1.08` `1.1` | 19 |
| `--fs-lg` | `1.2rem` | 19.2 | `1.15` `1.2` | 16 |
| `--fs-xl` | `1.3rem` | 20.8 | `1.3` `1.35` | 7 |
| `--fs-2xl` | `1.5rem` | 24.0 | `1.5` | 6 |
| `--fs-3xl` | `1.6rem` | 25.6 | `1.6` | 1 |
| `--fs-body` | `18px` | 18.0 | `18px` (body rules) | 10 |

**The arithmetic closes exactly**, in both directions.

*Distinct values:* 29 `rem` values in the table + `1.4rem` (excluded, below)
+ 8 that are the same number written two ways (`0.62`/`.62`, and likewise
`0.85`, `0.65`, `0.95`, `0.9`, `0.7`, `0.72`, `0.68`) + 5 distinct `clamp()`
expressions + 3 `px` values + 1 runtime-computed = **47**.

*Declarations:* the Uses column sums to **273**, plus 12 `clamp()` + 11px + 12px
+ `1.4rem` + 1 runtime-computed = **289**.

Nothing is unaccounted for in either count. These two totals are what the
type-scale test checks against, so a value introduced later cannot slip through
unnoticed.

`--fs-3xl` exists for a single declaration — pomodoro's `.time-display` timer
readout. Folding it into `--fs-2xl` would shrink the focal element of that page
by 1.6px, which contradicts goal 5. One extra token is the cheaper price.

**Shifts.** Largest *downward* shift is `.92rem → .875rem` (0.72px) — the point
below which nothing is perceptibly resized. Upward shifts are larger and
deliberate: they are the legibility fix. The biggest is
`index.html .cup-link-text`, `0.5rem → .65rem` (8px → 10.4px).

That element is an absolutely-positioned hover label inside the coffee-cup
illustration, with `white-space: nowrap` and `letter-spacing: 0.16em`. If 10.4px
overflows the cup, the remedy is to reduce its letter-spacing to `0.12em` —
**not** to revert the size. 8px text that a visitor is meant to read is exactly
the defect this phase exists to fix.

**Excluded from tokenisation, by name.** Each is an exception in
`tools/normalize-type.js` *and* in the type-scale test, so a future edit cannot
quietly reintroduce it as an untokenised value:

1. The **12 `clamp()` heading declarations** (5 distinct expressions) —
   untouched. This is what preserves the scaled-down headings.
2. **`coffee.html` flavour tags**, sized at runtime as
   `(0.68 + (count / maxCount) * 0.28)` rem — a continuous 0.68–0.96rem ramp
   encoding tag frequency. Tokenising it would destroy the information it
   carries.
3. **`.leaflet-popup-content-wrapper { font-size: 11px }`** — styles Leaflet's
   own markup, matched to Leaflet's internal metrics.
4. **`.popup-name { font-size: 12px }`** — our markup, but rendered inside that
   Leaflet popup and sized against the 11px wrapper it sits in.
5. **`languages.html .lang-flag { font-size: 1.4rem }`** — sizes an emoji glyph
   centred in a fixed 46px circle. It is an icon dimension that happens to be
   expressed as `font-size`, not text.

Exclusions 3–5 are the ones most likely to look like oversights in review, which
is why they are enumerated rather than described by pattern.

**Inline `style=` attributes.** Four in `cv.html` carry
`font-size:0.85rem`. CSS custom properties resolve normally in inline styles, so
these become `font-size:var(--fs-sm)` like any other declaration. The fifth
inline occurrence is the coffee flavour tag (exclusion 2).

Applied by `tools/normalize-type.js`: a table-driven, idempotent rewriter in the
same style as `tools/add-head-meta.js`. Re-running it must report zero changes.

### 3. Accessibility

**Contrast.** `--muted: #7a7570` → `#6e6963`.

Verified by computing WCAG relative luminance rather than trusting the value:
L(#6e6963) = 0.14322, L(#f5f2ed) = 0.89038, ratio = (0.89038 + 0.05) /
(0.14322 + 0.05) = **4.867:1**. Clears the 4.5:1 AA threshold for normal text.

**Focus.** No focus styling exists anywhere today, so keyboard navigation is
invisible. Add to `site.css`:

```css
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 2px;
}
```

`:focus-visible` rather than `:focus` so mouse users see no rings.

**Reduced motion.** Every page animates content in with `@keyframes rise`, and
`.ambience-chip.playing` pulses indefinitely. Add:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Deliberately collapses durations to `.01ms` rather than setting `animation: none`.
Several elements start at `opacity: 0` and are made visible *by* the animation;
`none` would leave them permanently invisible. This is the difference between
respecting the preference and breaking the page for the people who set it.

**Language attributes.** All 12 pages declare `<html lang="en">`. That is correct
for the UI chrome, which is English throughout. The defect is that target-language
words carry no `lang` of their own, so a screen reader pronounces Japanese and
Ukrainian vocabulary with English phonetics. Add `lang` to the elements rendering
target-language text on the five language pages: `lang="fr"`, `lang="es"`,
`lang="pt"`, `lang="ja"`, `lang="uk"`. `<html lang="en">` stays.

### 4. Interaction defect carried over

The language pages' "learned" dot is built in JavaScript, not in static markup:

```js
var dot = document.createElement('span');
dot.className = 'learned-dot' + (learned.indexOf(fr) !== -1 ? ' on' : '');
dot.title = 'Mark as practiced today';
dot.addEventListener('click', function () { … });
```

`.learned-dot` is `width:9px; height:9px; cursor:pointer`. There is no `role`, no
`tabindex`, no keyboard handler and no `aria-pressed` anywhere on the site. The
`title` attribute is a mouse-only affordance and confers no keyboard access.

This control drives the streak and the entire spaced-repetition pool, so a
keyboard or screen-reader user cannot use the core feature of five of the twelve
pages. In scope as an accessibility fix:

- `createElement('span')` → `createElement('button')`, `type = 'button'`
- `aria-pressed` set from the same boolean that drives the `.on` class, and
  updated in the same place, so the two cannot drift apart
- the visible dot stays exactly 9×9px; the hit area grows to ≥24×24px via
  padding and a transparent background, with `border:0` and `padding:0` reset so
  the UA button styling does not leak in
- `title` is kept, and an `aria-label` added, since a button with no text content
  is otherwise unnamed

Because the element is JS-created, the test must assert against the page's
script text, not its static body.

## Testing

`node --test`, zero dependencies, consistent with the existing 39-test suite.

Every test must be demonstrated to **fail against the pre-change tree** before it
is accepted. Three tests in the previous phase initially passed against code known
to be broken; that is the specific failure mode being guarded against here.

| Test | Asserts |
|---|---|
| `contrast` | `--muted` vs `--bg` ≥ 4.5:1, **computed from the hex values** via WCAG relative luminance — not a string comparison against `#6e6963`, which would pass for any wrong-but-expected colour |
| `type-scale` | Every `font-size` in every page resolves to a `--fs-*` token, except the five named exclusions above — which are asserted **individually and by exact selector**, so removing one from the page does not silently widen the exemption |
| `no-local-palette` | No page redefines the **5 palette names** `--bg`/`--ink`/`--muted`/`--accent`/`--line` in its own `<style>`. Asserted per-name, not as "`:root` is absent" — `pomodoro.html` legitimately keeps `--amber-1/2/3` and `--blue-1/2/3` |
| `footer-padding` | Each page's `footer` padding still equals the value recorded in the table above — the specific regression a shared-default footer would have caused |
| `wrap-widths` | `.wrap` `max-width` is still `860px` on coffee/resources, `780px` on cv, `640px` on the 7 language+pomodoro pages, `520px` on snake. Pins the nine-page column-width regression that extracting `.wrap` would have caused |
| `stylesheet-linked` | All 12 pages link `assets/css/site.css`, and it precedes the inline `<style>` |
| `no-duplicate-furniture` | No page still defines `.back` or `.back:hover` locally, and no page but `cv.html` defines `.eyebrow` or `@keyframes rise`. Without this, extraction could "succeed" while every page kept its copy — the link added, nothing actually deduplicated. The two `cv` exemptions are named explicitly, so they cannot silently widen |
| `focus-visible` | `site.css` defines a `:focus-visible` rule with a visible outline |
| `reduced-motion` | `site.css` contains a `prefers-reduced-motion` block, and it does **not** use `animation: none` |
| `lang-attrs` | Target-language text on the five language pages carries the correct `lang` |
| `learned-dot` | The control is a `button` with `aria-pressed` on all five language pages |
| `idempotent` | `normalize-type.js` reports zero changes on a second run |

The existing 39 tests must continue to pass unchanged.

## Risks

**Extraction regression is the main risk.** Removing a rule from a page's inline
block and relying on `site.css` is where a subtle visual break would hide.
Mitigation: migrate **one page first** (`resources.html` — small, representative,
has the full furniture set), confirm it renders identically, and only then apply
the same transformation to the rest.

**Specificity.** `site.css` loads before the inline `<style>`, so on equal
specificity the page wins. Any page rule that currently relies on source order
*within* its own block is unaffected, since that block moves as a unit.

**289 declarations is a large mechanical diff.** It is scripted and idempotent
rather than hand-edited, and guarded by the type-scale test.

## Out of scope

- Homepage reframe and site-wide navigation (deferred; see Non-goals).
- Dark mode.
- Replacing Google Fonts with self-hosted files.
- Anything in the predecessor spec's Phase 2 (language consolidation).

## Open items

None. All decisions in this spec are settled.
