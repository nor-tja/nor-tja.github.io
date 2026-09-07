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
