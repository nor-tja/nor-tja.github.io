/* Day-math utilities that operate in LOCAL time.
 *
 * Extracted from the five language pages to fix a timezone bug.
 *
 * THE BUG: The original addDays() constructed a Date at local midnight
 * but read it back as UTC via toISOString():
 *
 *   var d = new Date(dateStr + 'T00:00:00');   // local midnight
 *   d.setDate(d.getDate() + n);
 *   return d.toISOString().slice(0, 10);        // read back as UTC
 *
 * At any positive UTC offset (Europe, Asia), local midnight falls on the
 * previous UTC day, so addDays('2026-09-04', 1) returned '2026-09-04'.
 * Because getDueEntries tests `due <= today`, a card graded "Got it" was
 * immediately due again and could never leave the queue.
 *
 * THE FIX: Work entirely in local time. Parse dates in local time, add
 * days using local Date methods, and format back using local getters.
 * Never touch UTC methods (toISOString, Date.UTC, getUTCFullYear, etc.).
 *
 * SECOND BUG: The day boundary was inconsistent. todaysWords() used local
 * date while todayKey/todayISO/updateStreak used UTC. In Tokyo, between
 * 00:00 and 09:00 local, the new day's words displayed but taps filed
 * under yesterday's key. Now everything is local.
 */
(function (root) {
  'use strict';

  /**
   * Returns today's date in local time as 'YYYY-MM-DD'.
   */
  function todayISO() {
    var d = new Date();
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
  }

  /**
   * Adds n days to a date string, operating in local time.
   *
   * @param {string} dateStr - Date in 'YYYY-MM-DD' format
   * @param {number} n - Number of days to add (can be negative)
   * @returns {string} Result date in 'YYYY-MM-DD' format
   */
  function addDays(dateStr, n) {
    // Parse as local date at midnight
    var parts = dateStr.split('-');
    var yyyy = parseInt(parts[0], 10);
    var mm = parseInt(parts[1], 10) - 1;  // month is 0-indexed
    var dd = parseInt(parts[2], 10);

    var d = new Date(yyyy, mm, dd);
    d.setDate(d.getDate() + n);

    // Format back using local getters
    var newYyyy = d.getFullYear();
    var newMm = String(d.getMonth() + 1).padStart(2, '0');
    var newDd = String(d.getDate()).padStart(2, '0');

    return newYyyy + '-' + newMm + '-' + newDd;
  }

  var api = {
    todayISO: todayISO,
    addDays: addDays
  };

  root.DayMath = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
