'use strict';
// Reset has to win. When a focus session ends the glass flips, and the next
// session is scheduled 550ms later so it lands as the flip finishes. For those
// 550ms the page has already decided what happens next -- and Reset, pressed
// inside that window, used to be overwritten by the decision when it arrived.
//
// The window is short but it is exactly when people reach for Reset: the pling
// has just gone, the glass is turning, and you decide you do not want the break
// after all. You get "Focus 25:00", and half a second later the page changes
// its mind in front of you.
const test = require('node:test');
const assert = require('node:assert');
const { loadPomodoro } = require('./pomodoro-dom');

// Start a focus session and run it to zero, leaving the 550ms flip pending.
function runToEndOfFocus() {
  const clock = { now: new Date(2026, 8, 8, 9, 0).getTime() };
  const p = loadPomodoro({ clock });
  assert.equal(p.mode(), 'Focus', 'a fresh page should open on Focus');

  p.click('startPauseBtn');
  clock.now += 25 * 60 * 1000 + 1000;   // past the end of the session
  p.timers.tickInterval();              // the interval notices and completes it
  return p;
}

test('the session that follows a focus block is queued, not immediate', () => {
  const p = runToEndOfFocus();
  assert.equal(p.mode(), 'Focus',
    'the mode changed before the flip finished; this test assumes it is deferred');
  assert.ok(p.timers.pendingTimeouts() >= 1,
    'nothing was scheduled, so there is no transition window to test');
});

test('Reset during the flip is not undone when the flip lands', () => {
  const p = runToEndOfFocus();

  p.click('resetBtn');
  assert.equal(p.mode(), 'Focus', 'Reset did not put the page back on Focus');

  p.timers.runTimeouts();               // the 550ms transition arrives

  assert.equal(p.mode(), 'Focus',
    'the queued break overwrote the reset. Pressing Reset during the flip ' +
    'showed Focus 25:00 and then silently became a break half a second later.');
});

test('left alone, the flip still advances to the break', () => {
  const p = runToEndOfFocus();
  p.timers.runTimeouts();
  assert.notEqual(p.mode(), 'Focus',
    'the transition no longer advances at all -- cancelling it on Reset must ' +
    'not mean cancelling it always');
});
