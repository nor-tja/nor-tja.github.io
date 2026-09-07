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

// The frame is the only part that must look STILL while the glass turns over.
// It manages that by being its own mirror image about the centre of rotation
// -- so this is not a style rule, it is the whole illusion.
test('the frame is mirror-symmetric about the centre of rotation', () => {
  const frame = /<g id="frame">([\s\S]*?)<\/g>/.exec(SVG[0]);
  assert.ok(frame, 'the hourglass has no <g id="frame">');
  const rects = [...frame[1].matchAll(/<rect ([^>]+?)\/>/g)].map((m) => {
    const a = {};
    for (const p of m[1].matchAll(/([\w-]+)="([^"]+)"/g)) a[p[1]] = p[2];
    return { x: +a.x, y: +a.y, w: +a.width, h: +a.height };
  });
  assert.ok(rects.length >= 4, `frame has only ${rects.length} shapes`);
  const key = (r) => `${r.x},${r.y},${r.w},${r.h}`;
  const have = new Set(rects.map(key));
  const missing = [];
  for (const r of rects) {
    // Rotating 180deg about (CX, CY) maps a rect's top-left to the mirror of
    // its bottom-right, hence the -w and -h.
    const mirrored = { x: 2 * CX - r.x - r.w, y: 2 * CY - r.y - r.h, w: r.w, h: r.h };
    if (!have.has(key(mirrored))) missing.push(`${key(r)} has no partner at ${key(mirrored)}`);
  }
  assert.deepEqual(missing, [],
    `the frame is not symmetric, so it will visibly jump every time the glass ` +
    `flips:\n  ${missing.join('\n  ')}`);
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
test('every .glass-stage size keeps the viewBox aspect ratio', () => {
  const vb = /viewBox="([^"]+)"/.exec(SVG[0])[1].trim().split(/\s+/).map(Number);
  const want = vb[2] / vb[3];
  const stages = [...CSS.matchAll(
    /\.glass-stage \{[^}]*?width:\s*calc\((\d+(?:\.\d+)?)px[^}]*?height:\s*calc\((\d+(?:\.\d+)?)px/g)];
  assert.ok(stages.length >= 2,
    `found ${stages.length} sized .glass-stage rules; expected the desktop one ` +
    `and the <=480px one`);
  for (const [, w, h] of stages) {
    const drift = Math.abs(+w / +h - want) / want;
    assert.ok(drift < 0.005,
      `.glass-stage at ${w}x${h} is ${(drift * 100).toFixed(2)}% off the ` +
      `viewBox ratio ${want.toFixed(5)}; the glass will letterbox`);
  }
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
