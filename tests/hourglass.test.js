'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { readPage, pageCss } = require('./helpers');

const SRC = readPage('pomodoro.html');
const CSS = pageCss('pomodoro.html');
const SVG = /<svg id="hourglass-svg"[\s\S]*?<\/svg>/.exec(SRC);

// The rotor spins the whole drawing about the centre of its box. Everything
// below is a consequence of that one fact.
const CX = 105, CY = 260;

test('the hourglass svg is present', () => {
  assert.ok(SVG, 'pomodoro.html has no #hourglass-svg');
});

// The hardware is the part that must look STILL while the glass turns over,
// and it manages that by being its own mirror image about the centre of
// rotation. This is not a style rule, it is the whole illusion.
//
// It used to be a four-rect frame around the outside. That is gone and the
// collar at the waist is all that is left, but the requirement is a property
// of the flip, not of the frame, so the test follows the hardware rather than
// retiring with it. Anything added back here has to satisfy the same rule.
const HARDWARE = ['collar'];

test('the hardware is mirror-symmetric about the centre of rotation', () => {
  const rects = [];
  for (const id of HARDWARE) {
    const m = new RegExp(`<rect id="${id}"([^>]+?)/>`).exec(SVG[0]);
    assert.ok(m, `the hourglass has no <rect id="${id}">`);
    const a = {};
    for (const p of m[1].matchAll(/([\w-]+)="([^"]+)"/g)) a[p[1]] = p[2];
    rects.push({ id, x: +a.x, y: +a.y, w: +a.width, h: +a.height });
  }
  const key = (r) => `${r.x},${r.y},${r.w},${r.h}`;
  const have = new Set(rects.map(key));
  const missing = [];
  for (const r of rects) {
    // Rotating 180deg about (CX, CY) maps a rect's top-left to the mirror of
    // its bottom-right, hence the -w and -h. A shape centred on the point is
    // its own partner, which is how the collar passes alone.
    const mirrored = { x: 2 * CX - r.x - r.w, y: 2 * CY - r.y - r.h, w: r.w, h: r.h };
    if (!have.has(key(mirrored))) {
      missing.push(`${r.id} at ${key(r)} has no partner at ${key(mirrored)}`);
    }
  }
  assert.deepEqual(missing, [],
    `this will visibly jump every time the glass flips:\n  ${missing.join('\n  ')}`);
});

// The glass itself has the same obligation as the hardware, by a different
// mirror. The flip is a CSS rotateX, which in projection is a VERTICAL
// reflection: a point at (x, y) lands at (x, 520-y) and its x never moves.
// So the drawing has to be its own reflection in the horizontal line y=260 --
// the top bulb's path, reflected, must be the bottom bulb's path exactly, and
// likewise the two gloss highlights.
//
// Point symmetry is not the same rule and will not do. A shape mirrored
// through the centre POINT has its x flipped too, so a highlight on the left
// wall would slide across to the right wall halfway through the turn. The
// bulbs happen to be left-right symmetric so they satisfy both, but the
// highlights are not, and they are what makes the distinction bite.
//
// This is here because reshaping the bulbs from ovoid to funnel touched
// fourteen coordinate pairs in six places, and nothing was checking that the
// two halves stayed in step.
const MIRRORED_PATHS = [
  ['top bulb', 'bottom bulb', /d="(M95,250 [^"]+)"/, /d="(M95,270 [^"]+)"/],
  ['top highlight', 'bottom highlight', /d="(M42,60 [^"]+)"/, /d="(M42,460 [^"]+)"/],
];

test('the glass is its own reflection in the line the flip turns about', () => {
  // Reflect every coordinate pair in the path: x stays, y -> 2*CY - y.
  const reflect = (d) => d.replace(/(-?[\d.]+),(-?[\d.]+)/g,
    (_, x, y) => `${+x},${2 * CY - +y}`);

  for (const [topName, botName, topRe, botRe] of MIRRORED_PATHS) {
    const top = topRe.exec(SVG[0]);
    const bot = botRe.exec(SVG[0]);
    assert.ok(top, `the hourglass has no ${topName} path starting ${topRe.source}`);
    assert.ok(bot, `the hourglass has no ${botName} path starting ${botRe.source}`);
    assert.equal(reflect(top[1]), bot[1],
      `the ${botName} is not the ${topName} reflected in y=${CY}, so the two halves ` +
      `will not line up as the glass turns over.\n` +
      `  ${topName} reflected: ${reflect(top[1])}\n` +
      `  ${botName} actual:    ${bot[1]}`);
  }
});

// A funnel is widest at the rim and narrows all the way to the waist. An
// ovoid is widest somewhere in its middle. That one number is the difference
// between reading as an hourglass and reading as a balloon, and it regressed
// once already -- silently, because the wooden frame was carrying the meaning
// until it was removed.
// Walk the path rather than reading its control points. Where a curve is
// widest is not generally at a control point, so checking the numbers in the
// `d` string answers a different question than the eye asks.
function flatten(d) {
  const pts = [];
  let cur = null;
  for (const m of d.matchAll(/([MLCZ])([^MLCZ]*)/gi)) {
    const cmd = m[1].toUpperCase();
    const n = (m[2].match(/-?[\d.]+/g) || []).map(Number);
    if (cmd === 'M' || cmd === 'L') { cur = [n[0], n[1]]; pts.push(cur); }
    else if (cmd === 'C') {
      for (let i = 0; i + 5 < n.length; i += 6) {
        const [p0, p1, p2, p3] = [cur, [n[i], n[i + 1]], [n[i + 2], n[i + 3]], [n[i + 4], n[i + 5]]];
        for (let s = 1; s <= 32; s++) {
          const t = s / 32, u = 1 - t;
          pts.push([0, 1].map((k) =>
            u ** 3 * p0[k] + 3 * u ** 2 * t * p1[k] + 3 * u * t ** 2 * p2[k] + t ** 3 * p3[k]));
        }
        cur = p3;
      }
    }
  }
  return pts;
}

test('the bulb is widest at its rim, not at its belly', () => {
  const pts = flatten(/d="(M95,250 [^"]+)"/.exec(SVG[0])[1]);
  const leftmost = Math.min(...pts.map((p) => p[0]));
  // Highest point on the path that is (near enough) as wide as it ever gets.
  const widestY = Math.min(...pts.filter((p) => p[0] <= leftmost + 0.5).map((p) => p[1]));
  // The bulb runs y=15 at the rim to y=250 at the waist.
  const frac = (widestY - 15) / (250 - 15);
  assert.ok(frac < 0.25,
    `the top bulb is at its widest (x=${leftmost.toFixed(1)}) at y=${widestY.toFixed(0)}, ` +
    `which is ${(frac * 100).toFixed(0)}% of the way from the rim to the waist. ` +
    `A funnel is widest at the rim; the ovoid this replaced was widest at 42% ` +
    `and read as a balloon, which is the whole reason this test exists.`);
});

// ...and having got wide at the top, it has to keep narrowing. A profile that
// pinches in and bulges out again is a vase, not an hourglass, and the check
// above would not notice.
test('the bulb narrows all the way from rim to waist', () => {
  const pts = flatten(/d="(M95,250 [^"]+)"/.exec(SVG[0])[1]);
  const BANDS = 10, TOP = 40, BOT = 250;   // from below the corner radius
  const wall = [];
  for (let b = 0; b < BANDS; b++) {
    const lo = TOP + ((BOT - TOP) * b) / BANDS;
    const hi = TOP + ((BOT - TOP) * (b + 1)) / BANDS;
    const xs = pts.filter((p) => p[1] >= lo && p[1] < hi).map((p) => p[0]);
    if (xs.length) wall.push({ y: Math.round(lo), x: Math.min(...xs) });
  }
  const bulges = wall
    .filter((b, i) => i && b.x < wall[i - 1].x - 0.5)
    .map((b, i) => `at y=${b.y} the wall moves back out to x=${b.x.toFixed(1)}`);
  assert.deepEqual(bulges, [],
    `the bulb wall stops narrowing on the way down, so the silhouette bulges:\n  ${bulges.join('\n  ')}`);
});

// The tint in an empty bulb has to stay much fainter than it looks like it
// can afford to be, because the gradient it draws from ends at #1b2a4e. At the
// 0.34 it used to be, an EMPTY bottom bulb measured 71% as far from the paper
// as a bulb full of sand, so at 25:00 the timer showed two full-looking halves
// and the drawing said nothing about how much time was left.
//
// 0.12 puts it at 29%. The ceiling here is 0.16 rather than 0.12 exactly so
// there is room to tune, but not room to undo it. Costs nothing on the full
// side: sand is opaque, so a full bulb measures 92.0 from paper at every value
// in that range.
test('an empty bulb does not look like a full one', () => {
  const fills = [...SVG[0].matchAll(/fill="url\(#(amber|blue)Glass\)" opacity="([\d.]+)"/g)];
  assert.equal(fills.length, 2,
    `expected exactly two bulb fills, found ${fills.length}`);
  const heavy = fills.filter((f) => +f[2] > 0.16)
    .map((f) => `${f[1]}Glass fill is at opacity ${f[2]}`);
  assert.deepEqual(heavy, [],
    `the glass tint is dark enough that an empty bulb reads as a full one:\n  ${heavy.join('\n  ')}`);
  assert.equal(fills[0][2], fills[1][2],
    `the two bulbs are tinted at different opacities (${fills[0][2]} and ${fills[1][2]}), ` +
    `so the glass will change density as it turns over`);
});

// ...and the outline has to carry the shape on its own once the fill is that
// faint. These are separate paths, so it is entirely possible to fade the fill
// and the stroke together and end up with no visible bottom bulb at all.
test('the bulb outline stays strong enough to hold the silhouette', () => {
  const strokes = [...SVG[0].matchAll(/stroke="url\(#(amber|blue)Glass\)"[^/]*?opacity="([\d.]+)"/g)];
  assert.equal(strokes.length, 2,
    `expected exactly two bulb outlines, found ${strokes.length}`);
  const faint = strokes.filter((s) => +s[2] < 0.6)
    .map((s) => `${s[1]}Glass stroke is at opacity ${s[2]}`);
  assert.deepEqual(faint, [],
    `the bulb fill is only 0.12, so the outline is what makes the glass visible ` +
    `at all:\n  ${faint.join('\n  ')}`);
});

// The frame's own removal, pinned. Nothing here is load-bearing for the
// illusion any more, so a stray reference is dead weight that will confuse
// the next person reading the drawing rather than break anything -- which is
// exactly the kind of thing that survives for years.
test('nothing is left over from the frame that was removed', () => {
  const leftovers = ['id="frame"', 'frameWood'].filter((s) => SRC.includes(s));
  assert.deepEqual(leftovers, [],
    `pomodoro.html still refers to the removed frame: ${leftovers.join(', ')}`);
});

test('the viewBox is centred on the point the rotor spins about', () => {
  const vb = /viewBox="([^"]+)"/.exec(SVG[0])[1].trim().split(/\s+/).map(Number);
  const [x0, y0, w, h] = vb;
  assert.equal(x0 + w / 2, CX, `viewBox centre x is ${x0 + w / 2}, not ${CX}`);
  assert.equal(y0 + h / 2, CY,
    `viewBox centre y is ${y0 + h / 2}, not ${CY}. Off-centre, the drawing ` +
    `swings sideways as it flips instead of turning in place.`);
});

// preserveAspectRatio defaults to "meet", so a stage whose ratio disagrees
// with the viewBox letterboxes the glass inside it -- silently, and only
// visible as the drawing drifting away from the timer beneath it.
//
// This used to check each breakpoint's width against its height, because both
// were typed out in px and either could be edited alone. They are not any
// more: the width is the height times one constant, so there is exactly one
// number that can be wrong, and this is it.
test('the stage width is derived from the viewBox ratio', () => {
  const vb = /viewBox="([^"]+)"/.exec(SVG[0])[1].trim().split(/\s+/).map(Number);
  const want = vb[2] / vb[3];
  const m = /\.glass-stage \{[^}]*?width:\s*calc\(var\(--glass-h\)[^)]*\)?[^;]*?\*\s*([\d.]+)\s*\)/
    .exec(CSS);
  assert.ok(m, '.glass-stage no longer derives its width from --glass-h times ' +
    'a ratio constant; if it went back to two px values, restore the ' +
    'per-breakpoint check that used to be here');
  const drift = Math.abs(+m[1] - want) / want;
  assert.ok(drift < 0.005,
    `.glass-stage multiplies its height by ${m[1]}, but the viewBox is ` +
    `${vb[2]}x${vb[3]}, a ratio of ${want.toFixed(5)} (${(drift * 100).toFixed(2)}% ` +
    `off). The glass will letterbox inside the stage.`);
});

// The above only holds while the height is the sole free number. A px width
// anywhere -- most likely added at a new breakpoint by copying the old rule
// out of git -- overrides the derivation and the ratio silently stops being
// checked by anything.
test('no .glass-stage rule sets a width of its own', () => {
  const offenders = [...CSS.matchAll(/\.glass-stage\s*\{([^}]*)\}/g)]
    .map((m) => m[1])
    .filter((body) => /width:\s*calc\((\d|\.)/.test(body) || /width:\s*\d/.test(body));
  assert.deepEqual(offenders, [],
    `a .glass-stage rule sets a literal width instead of letting it follow ` +
    `--glass-h:\n  ${offenders.join('\n  ')}`);
});

// The bug this replaced: the grains translate in the SVG's own coordinates,
// but the rotor is what flips. +Y inside a container rotated 180deg travels
// UP the screen, so for the whole of every break the sand fell upward.
test('the grain stream falls downward in both orientations', () => {
  const yOf = (name) => {
    const kf = new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\s*\\}`).exec(CSS);
    assert.ok(kf, `no @keyframes ${name}`);
    const to = /to\s*\{[^}]*translateY\((-?[\d.]+)px\)/.exec(kf[1]);
    assert.ok(to, `@keyframes ${name} has no translateY on its "to" step`);
    return parseFloat(to[1]);
  };
  const down = yOf('fall');
  const up = yOf('fallUp');
  assert.ok(down > 0, `@keyframes fall should travel +Y, got ${down}`);
  assert.equal(up, -down,
    `@keyframes fallUp travels ${up}px but fall travels ${down}px. They must ` +
    `be exact opposites, or the stream changes speed when the glass flips.`);
  assert.match(CSS, /\.glass-rotor\.flipped \.grain \{[^}]*animation-name:\s*fallUp/,
    'nothing switches the grains to fallUp when the rotor is flipped, so the ' +
    'sand will fall upward through every break');
});

// SVG comments are XML comments: "--" may not appear inside one. The HTML
// parser forgives it, so this stays invisible in the browser and only breaks
// when the SVG is lifted out into a file of its own.
test('the hourglass svg has no illegal double hyphen in a comment', () => {
  const bad = [...SVG[0].matchAll(/<!--([\s\S]*?)-->/g)]
    .filter((m) => m[1].includes('--'))
    .map((m) => m[1].trim().slice(0, 60));
  assert.deepEqual(bad, [], `these svg comments contain "--":\n  ${bad.join('\n  ')}`);
});

// The ruled lines and the writing have to advance at the same rate. They only
// do so while both are expressed against the same font-size, which is why the
// ruling sits on the textarea and not on the note behind it.
test('the post-it ruling advances one line per line of writing', () => {
  const rule = /\.postit textarea \{([^}]*)\}/.exec(CSS);
  assert.ok(rule, 'pomodoro.html has no .postit textarea rule');
  const lh = /line-height:\s*([\d.]+)\s*;/.exec(rule[1]);
  const bg = /background-size:\s*100%\s*([\d.]+)em/.exec(rule[1]);
  assert.ok(lh, '.postit textarea sets no unitless line-height');
  assert.ok(bg, '.postit textarea carries no ruling; if it moved back to ' +
                '.postit its em resolves against the body size and drifts');
  assert.equal(parseFloat(bg[1]), parseFloat(lh[1]),
    `the ruling repeats every ${bg[1]}em but a line of writing is ${lh[1]}em ` +
    `tall, so the two drift apart down the note`);
  assert.match(rule[1], /background-attachment:\s*local/,
    'without `local` the ruling stays pinned while the writing scrolls over it');
});

// A note that is 4.45 lines tall shows a line of writing cut through the
// middle. It can only be a whole number of lines at every window width if the
// height is in em like the line box is -- a px height is a whole number of
// lines at exactly one root font-size, and the root scale here is fluid.
test('the post-it is a whole number of lines tall', () => {
  const rule = /\.postit textarea \{([^}]*)\}/.exec(CSS);
  const lh = parseFloat(/line-height:\s*([\d.]+)\s*;/.exec(rule[1])[1]);
  const h = /height:\s*([\d.]+)(px|em|rem)/.exec(rule[1]);
  assert.ok(h, '.postit textarea sets no height');
  assert.equal(h[2], 'em',
    `.postit textarea is ${h[1]}${h[2]} tall. Only em tracks the font-size ` +
    `the line box is built from; px slices the last line at most root sizes.`);
  const lines = parseFloat(h[1]) / lh;
  assert.equal(lines, Math.round(lines),
    `.postit textarea is ${h[1]}em tall, which is ${lines.toFixed(2)} lines of ` +
    `${lh}em. Give it a whole number of lines.`);
});
