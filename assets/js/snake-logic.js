/* Snake rules that are worth testing on their own. */
(function (root) {
  'use strict';

  var BEST_KEY = 'kn-snake-best';

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

  function readBest(storage) {
    try {
      var n = parseInt(storage.getItem(BEST_KEY), 10);
      return isFinite(n) && n >= 0 ? n : 0;
    } catch (e) { return 0; }
  }

  function writeBest(storage, score) {
    try { storage.setItem(BEST_KEY, String(score)); } catch (e) { /* unavailable */ }
  }

  var api = {
    canTurn: canTurn, selfCollides: selfCollides,
    readBest: readBest, writeBest: writeBest, BEST_KEY: BEST_KEY
  };
  root.SnakeLogic = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
