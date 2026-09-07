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
