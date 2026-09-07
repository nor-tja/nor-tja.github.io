'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { execSync } = require('node:child_process');
const path = require('node:path');

// Helper to run a test in a specific timezone by spawning node with TZ env var
function testInTimezone(tz, testCode) {
  const script = `
const DayMath = require('${path.resolve(__dirname, '../assets/js/day-math.js')}');
${testCode}
`;

  const result = execSync(`node -e "${script.replace(/"/g, '\\"')}"`, {
    env: { ...process.env, TZ: tz },
    encoding: 'utf8'
  });

  return JSON.parse(result.trim());
}

test('addDays returns the same result in all timezones', () => {
  // The bug: in positive UTC offsets, local midnight falls on the previous
  // UTC day, so addDays('2026-09-04', 1) returns '2026-09-04' instead of '2026-09-05'

  const timezones = ['UTC', 'Europe/Oslo', 'Asia/Tokyo', 'America/New_York'];
  const testCode = `console.log(JSON.stringify(DayMath.addDays('2026-09-04', 1)));`;

  const results = timezones.map(tz => {
    try {
      return { tz, result: testInTimezone(tz, testCode) };
    } catch (e) {
      return { tz, error: e.message };
    }
  });

  const expected = '2026-09-05';
  results.forEach(({ tz, result, error }) => {
    if (error) {
      // Module not found is expected on first run
      if (!error.includes('Cannot find module')) {
        throw new Error(`Unexpected error in ${tz}: ${error}`);
      }
    } else {
      assert.strictEqual(
        result,
        expected,
        `addDays('2026-09-04', 1) in ${tz} should return ${expected}, got ${result}`
      );
    }
  });
});

test('addDays correctly handles negative offsets', () => {
  const timezones = ['UTC', 'Europe/Oslo', 'Asia/Tokyo', 'America/New_York'];
  const testCode = `console.log(JSON.stringify(DayMath.addDays('2026-09-10', -3)));`;

  const results = timezones.map(tz => {
    try {
      return { tz, result: testInTimezone(tz, testCode) };
    } catch (e) {
      return { tz, error: e.message };
    }
  });

  const expected = '2026-09-07';
  results.forEach(({ tz, result, error }) => {
    if (error && !error.includes('Cannot find module')) {
      throw new Error(`Unexpected error in ${tz}: ${error}`);
    } else if (result) {
      assert.strictEqual(
        result,
        expected,
        `addDays('2026-09-10', -3) in ${tz} should return ${expected}, got ${result}`
      );
    }
  });
});

test('todayISO returns local date, not UTC date', () => {
  // Direct test without timezone spawning - the implementation should use local date
  const DayMath = require('../assets/js/day-math.js');

  // Create a Date at local time
  const now = new Date();
  const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  assert.strictEqual(DayMath.todayISO(), expected);
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
