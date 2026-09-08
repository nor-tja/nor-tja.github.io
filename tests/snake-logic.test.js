'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { canTurn, selfCollides, readBest, writeBest } = require('../assets/js/snake-logic.js');
const { readPage } = require('./helpers');

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

test('module survives when storage property access throws (Safari private browsing)', () => {
  // Simulates Safari private browsing, Chrome with cookies blocked, or sandboxed iframe
  // where window.localStorage getter throws SecurityError before any method is called.
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    get() { throw new Error('SecurityError: localStorage is not available'); },
    configurable: true
  });
  try {
    assert.equal(readBest(), 0, 'readBest with no args must survive property access throw');
    assert.doesNotThrow(() => writeBest(42), 'writeBest with score arg must survive property access throw');
  } finally {
    if (original) {
      Object.defineProperty(globalThis, 'localStorage', original);
    } else {
      delete globalThis.localStorage;
    }
  }
});

// Regression guard for the real defect, which lived at the CALL SITE and not in
// this module. snake.html originally read localStorage unguarded at IIFE scope;
// the first attempt at a fix moved the try/catch into readBest() but still wrote
// `readBest(window.localStorage)`, so the property access was still evaluated
// outside the guard. In Safari private browsing, Chrome with cookies blocked, or
// a sandboxed iframe, that access throws SecurityError and the whole IIFE dies —
// the game never initialises.
//
// A unit test on this module cannot catch that: readBest() with no argument
// returns 0 whether or not the bug is present. The invariant has to be asserted
// against the page source. All storage access goes through snake-logic.js, which
// guards the property access, so the page itself must never name localStorage.
test('snake.html never references localStorage directly', () => {
  const src = readPage('snake.html');
  const hits = src.match(/localStorage/g) || [];
  assert.equal(
    hits.length, 0,
    `snake.html references localStorage ${hits.length}x. Even as an argument ` +
    `(readBest(window.localStorage)) the property access is evaluated outside ` +
    `the guard and throws in Safari private browsing. Use SnakeLogic.readBest() ` +
    `/ writeBest(score) and let the module resolve storage inside its try/catch.`
  );
});

// --- placing food ----------------------------------------------------------

// The old placer was rejection sampling with no exit: guess a cell, guess
// again if the snake is on it. That is fine on an empty board and gets worse
// with every apple -- on the last free cell it expects ~484 guesses -- and
// when the snake finally fills the board it never returns at all. The tab
// freezes on the winning move.
//
// Enumerating the free cells costs 484 array writes once per apple, which is
// nothing, and it makes the full board answerable instead of fatal.
const { pickFood } = require('../assets/js/snake-logic.js');

// A board small enough to fill by hand.
const COLS = 3, ROWS = 2;
const allCells = () => {
  const out = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) out.push({ x, y });
  return out;
};

test('food never lands on the snake', () => {
  const body = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }];
  // Sweep the whole random range rather than trusting one draw.
  for (let i = 0; i < 100; i++) {
    const f = pickFood(body, COLS, ROWS, () => i / 100);
    assert.ok(f, 'no cell returned even though two are free');
    assert.ok(!body.some((s) => s.x === f.x && s.y === f.y),
      `placed food at ${f.x},${f.y}, which the snake occupies`);
  }
});

test('a full board returns nothing instead of hanging', () => {
  const f = pickFood(allCells(), COLS, ROWS, Math.random);
  // strict: dropping the guard returns free[NaN], which is undefined, and
  // undefined == null. A loose check here would have passed the mutation.
  assert.strictEqual(f, null,
    'the board is completely full, so there is no cell to return. The old ' +
    'version looped for ever here and froze the tab on the winning move.');
});

test('the last free cell is found rather than stumbled upon', () => {
  const body = allCells().filter((c) => !(c.x === 1 && c.y === 1));
  // rand is deliberately hostile: always 0, so a rejection sampler that kept
  // guessing would sit on cell 0,0 for ever.
  const f = pickFood(body, COLS, ROWS, () => 0);
  assert.deepEqual(f, { x: 1, y: 1 });
});

test('every free cell is reachable', () => {
  const body = [{ x: 0, y: 0 }];
  const seen = new Set();
  for (let i = 0; i < 1000; i++) {
    const f = pickFood(body, COLS, ROWS, () => i / 1000);
    seen.add(`${f.x},${f.y}`);
  }
  assert.equal(seen.size, COLS * ROWS - 1,
    `only ${seen.size} of the 5 free cells can ever be chosen: ${[...seen].join(' ')}`);
});

// The module can be as careful as it likes and it buys nothing if the page
// throws the answer away. This is the one line of wiring that turns "there is
// nowhere to put an apple" into a win rather than a silent nothing.
test('snake.html places food through the module and acts on a full board', () => {
  const src = readPage('snake.html');
  assert.ok(!/while\s*\(\s*true\s*\)/.test(src),
    'snake.html still has an unbounded while(true) loop; the food placer used ' +
    'to be one and froze the tab when the board filled up');
  assert.match(src, /SnakeLogic\.pickFood\(/,
    'snake.html no longer places food through SnakeLogic.pickFood, so the ' +
    'full-board case above is testing a function the page does not call');
  assert.match(src, /if\s*\(\s*!placeFood\(\)\s*\)/,
    'the return value of placeFood() is being ignored. It reports the full ' +
    'board, and ignoring it means the win is never noticed.');
});
