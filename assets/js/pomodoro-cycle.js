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
