'use strict';
// Runs pomodoro.html's inline script for real, the way dom-harness.js runs the
// language engine. Separate file because the two pages need different props:
// this one wants an audio context, a window that takes listeners, and -- the
// whole reason it exists -- timers and a clock the test drives by hand.
//
// The page is a timer. Almost everything interesting about it happens between
// one tick and the next, or inside the 550ms flip, and none of that is
// reachable by reading the source as text.
//
// Named without `.test.` so `node --test` does not try to run it as a suite.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ROOT, readPage } = require('./helpers');
const { makeDom } = require('./dom-harness');

// setTimeout/setInterval that do not involve real time. Callbacks are held
// until a test asks for them, so the 550ms flip can be inspected from inside.
function makeTimers() {
  let nextId = 1;
  const pending = new Map();       // id -> { fn, delay, repeat }
  const api = {
    setTimeout(fn, delay) { pending.set(nextId, { fn, delay, repeat: false }); return nextId++; },
    setInterval(fn, delay) { pending.set(nextId, { fn, delay, repeat: true }); return nextId++; },
    clearTimeout(id) { pending.delete(id); },
    clearInterval(id) { pending.delete(id); },
  };
  // Fire every one-shot timer currently pending, as the browser would once
  // its delay elapsed. Intervals are left alone: a test drives those with
  // tickInterval so a runaway repeat cannot spin the suite.
  api.runTimeouts = () => {
    for (const [id, t] of [...pending]) {
      if (t.repeat) continue;
      pending.delete(id);
      t.fn();
    }
  };
  api.tickInterval = (times) => {
    for (let i = 0; i < (times || 1); i++) {
      for (const t of [...pending.values()]) if (t.repeat) t.fn();
    }
  };
  api.pendingTimeouts = () => [...pending.values()].filter((t) => !t.repeat).length;
  return api;
}

// opts.clock  mutable { now: ms }; drives Date.now() and new Date()
// opts.saved  entries seeded into localStorage before the page loads
function loadPomodoro(opts) {
  const o = opts || {};
  const clock = o.clock || { now: Date.now() };
  const { document, created, byId } = makeDom();
  const store = new Map(Object.entries(o.saved || {}));
  const timers = makeTimers();

  // The page reaches for a handful of elements by selector rather than id.
  // Resolving each to a stable stub keeps it on the fully-populated path
  // instead of bailing out early on a null, same reasoning as getElementById.
  const bySel = new Map();
  document.querySelector = (sel) => {
    if (!bySel.has(sel)) bySel.set(sel, document.createElement('div'));
    return bySel.get(sel);
  };
  document.querySelectorAll = () => [];

  const silentAudio = () => ({
    currentTime: 0,
    destination: {},
    state: 'running',
    resume() {},
    createOscillator: () => ({
      connect() {}, start() {}, stop() {},
      frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      type: '',
    }),
    createGain: () => ({
      connect() {},
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, value: 0 },
    }),
  });

  const sandbox = {
    document,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    console,
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    setInterval: timers.setInterval, clearInterval: timers.clearInterval,
    requestAnimationFrame: (fn) => timers.setTimeout(fn, 16),
    AudioContext: function () { return silentAudio(); },
    webkitAudioContext: function () { return silentAudio(); },
    Notification: { permission: 'denied', requestPermission() {} },
    navigator: {},
    location: { href: '' },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    addEventListener() {}, removeEventListener() {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.Date = class extends Date {
    constructor(...args) {
      if (args.length === 0) super(clock.now); else super(...args);
    }
    static now() { return clock.now; }
  };

  const ctx = vm.createContext(sandbox);
  const html = readPage('pomodoro.html');
  for (const m of html.matchAll(/<script[^>]+src="([^"]+)"[^>]*>/g)) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, m[1]), 'utf8'), ctx, { filename: m[1] });
  }
  vm.runInContext(/<script>([\s\S]*?)<\/script>/.exec(html)[1], ctx, { filename: 'pomodoro.html' });

  const click = (id) => {
    const el = byId.get(id);
    if (!el) throw new Error(`no element with id "${id}"`);
    for (const fn of el.handlers.click || []) fn({ preventDefault() {}, target: el, currentTarget: el });
  };

  return { document, byId, created, store, clock, timers, sandbox, click,
           mode: () => byId.get('modeLabel').textContent };
}

module.exports = { loadPomodoro, makeTimers };
