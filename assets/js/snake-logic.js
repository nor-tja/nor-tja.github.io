/* Snake rules that are worth testing on their own. */
(function (root) {
  'use strict';

  var BEST_KEY = 'kn-snake-best';

  // Returns window.localStorage or null if the property access throws
  // (Safari private browsing, Chrome with cookies blocked, sandboxed iframe).
  function defaultStorage() {
    try { return root.localStorage; } catch (e) { return null; }
  }

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

  // Accepts optional storage; defaults to window.localStorage via defaultStorage().
  // The property access is guarded so Safari private browsing doesn't kill the IIFE.
  function readBest(storage) {
    try {
      var s = storage !== undefined ? storage : defaultStorage();
      if (!s) return 0;
      var n = parseInt(s.getItem(BEST_KEY), 10);
      return isFinite(n) && n >= 0 ? n : 0;
    } catch (e) { return 0; }
  }

  // Accepts optional score as first arg (when storage is omitted) or second arg
  // (when storage is provided). Handles both writeBest(42) and writeBest(storage, 42).
  function writeBest(storageOrScore, score) {
    try {
      var s, val;
      if (score === undefined) {
        // Called as writeBest(42)
        s = defaultStorage();
        val = storageOrScore;
      } else {
        // Called as writeBest(storage, 42)
        s = storageOrScore;
        val = score;
      }
      if (!s) return;
      s.setItem(BEST_KEY, String(val));
    } catch (e) { /* unavailable */ }
  }

  var api = {
    canTurn: canTurn, selfCollides: selfCollides,
    readBest: readBest, writeBest: writeBest, BEST_KEY: BEST_KEY
  };
  root.SnakeLogic = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
