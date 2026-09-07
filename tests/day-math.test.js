'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const MODULE = path.resolve(__dirname, '../assets/js/day-math.js');

// Runs an expression in a child node process pinned to a given timezone. TZ has
// to be set before the process starts -- V8 caches the zone on first use, so it
// cannot be changed from inside a running process.
//
// execFileSync with an argv array, NOT execSync with an interpolated string:
// the string form goes through a shell, so the script has to be quote-escaped
// by hand and any slip silently changes what runs.
//
// Nothing here is wrapped in try/catch. An earlier version swallowed failures
// whose message contained "Cannot find module", which meant a broken module
// path made every timezone test pass green. If the child fails, this throws.
function inTimezone(tz, expr) {
  const script = `const DayMath = require(${JSON.stringify(MODULE)});\n` +
                 `console.log(JSON.stringify(${expr}));`;
  const out = execFileSync(process.execPath, ['-e', script], {
    env: { ...process.env, TZ: tz },
    encoding: 'utf8'
  });
  return JSON.parse(out.trim());
}

// Spread deliberately across the whole offset range: UTC+14 down to UTC-11.
const ZONES = ['Pacific/Kiritimati', 'Asia/Tokyo', 'Europe/Oslo', 'UTC',
               'America/New_York', 'Pacific/Midway'];

test('addDays returns the same result in every timezone', () => {
  // The bug: the old code built a Date at LOCAL midnight and read it back with
  // toISOString(), which is UTC. East of Greenwich local midnight is still the
  // previous UTC day, so addDays('2026-09-04', 1) returned '2026-09-04'.
  // getDueEntries tests `due <= today`, so a card graded "Got it" came straight
  // back and the review queue could never drain.
  for (const tz of ZONES) {
    assert.strictEqual(inTimezone(tz, `DayMath.addDays('2026-09-04', 1)`), '2026-09-05',
      `addDays('2026-09-04', 1) is wrong in ${tz}`);
  }
});

test('addDays handles negative offsets in every timezone', () => {
  for (const tz of ZONES) {
    assert.strictEqual(inTimezone(tz, `DayMath.addDays('2026-09-10', -3)`), '2026-09-07',
      `addDays('2026-09-10', -3) is wrong in ${tz}`);
  }
});

test('addDays crosses a DST boundary without losing or gaining a day', () => {
  // Europe/Oslo springs forward 2026-03-29 and falls back 2026-10-25. A naive
  // implementation that adds 86400000ms instead of incrementing the date field
  // lands on the wrong calendar day on exactly these two nights.
  assert.strictEqual(inTimezone('Europe/Oslo', `DayMath.addDays('2026-03-28', 1)`), '2026-03-29');
  assert.strictEqual(inTimezone('Europe/Oslo', `DayMath.addDays('2026-03-29', 1)`), '2026-03-30');
  assert.strictEqual(inTimezone('Europe/Oslo', `DayMath.addDays('2026-10-24', 1)`), '2026-10-25');
  assert.strictEqual(inTimezone('Europe/Oslo', `DayMath.addDays('2026-10-25', 1)`), '2026-10-26');
});

test('todayISO returns the local date, not the UTC date', () => {
  // Comparing todayISO() to local getters inside one process only catches the
  // bug when the local date and the UTC date actually differ -- which depends
  // on what time of day the suite happens to run. Checked against the old
  // implementation at 05:31 UTC, that test passed in Tokyo, Oslo, New York and
  // Kiritimati and failed only in Midway. Green most of the day, for no reason
  // connected to the code.
  //
  // Kiritimati is UTC+14, so its local date differs from UTC exactly when the
  // UTC hour is >= 10. Midway is UTC-11, so its local date differs exactly when
  // the UTC hour is < 11. Those two conditions cover every hour, so at least
  // one of the pair always discriminates -- at any instant, on any day.
  const probes = ['Pacific/Kiritimati', 'Pacific/Midway'].map(tz => ({
    tz,
    ...inTimezone(tz, `(() => {
      const n = new Date();
      const p = v => String(v).padStart(2, '0');
      return {
        got: DayMath.todayISO(),
        local: n.getFullYear() + '-' + p(n.getMonth() + 1) + '-' + p(n.getDate()),
        utc: n.toISOString().slice(0, 10)
      };
    })()`)
  }));

  for (const { tz, got, local } of probes) {
    assert.strictEqual(got, local, `todayISO() returned the UTC date in ${tz}`);
  }

  // Guard the guard: if neither probe zone disagreed with UTC, the assertions
  // above proved nothing and this test must not report success.
  assert.ok(probes.some(p => p.local !== p.utc),
    `neither ${probes.map(p => p.tz).join(' nor ')} differed from UTC ` +
    `(${probes.map(p => `${p.tz}=${p.local}`).join(', ')}, utc=${probes[0].utc}) — ` +
    `this test degenerated into a tautology and would pass a UTC-based todayISO`);
});

test('addDays with zero offset returns the same date', () => {
  const DayMath = require('../assets/js/day-math.js');
  assert.strictEqual(DayMath.addDays('2026-09-04', 0), '2026-09-04');
});

test('addDays handles month boundaries correctly', () => {
  const DayMath = require('../assets/js/day-math.js');
  assert.strictEqual(DayMath.addDays('2026-08-31', 1), '2026-09-01');
  assert.strictEqual(DayMath.addDays('2026-09-01', -1), '2026-08-31');
});

test('addDays handles year boundaries correctly', () => {
  const DayMath = require('../assets/js/day-math.js');
  assert.strictEqual(DayMath.addDays('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(DayMath.addDays('2027-01-01', -1), '2026-12-31');
});

test('addDays handles leap years correctly', () => {
  const DayMath = require('../assets/js/day-math.js');
  assert.strictEqual(DayMath.addDays('2024-02-28', 1), '2024-02-29');
  assert.strictEqual(DayMath.addDays('2024-02-29', 1), '2024-03-01');
  assert.strictEqual(DayMath.addDays('2025-02-28', 1), '2025-03-01');
});
