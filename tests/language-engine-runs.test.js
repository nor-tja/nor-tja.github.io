'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { PAGES, loadPage } = require('./dom-harness');

// Every other test in this suite reads the code as text. This one runs it.
//
// That gap mattered the moment the engine was extracted: the page's script had
// always been sloppy-mode, and the shared module is 'use strict'. An
// assignment to an undeclared variable that used to quietly create a global
// now throws a ReferenceError -- in the browser, at load, where nothing in
// this repo would ever see it. A grep-based test cannot find that class of
// bug. Neither can it find a typo'd property on a real DOM object.
//
// The DOM stub and the loader moved to ./dom-harness once the voice tests
// needed them too. Same stub, same deliberate smallness.

test('every language page loads and renders without throwing', () => {
  for (const page of Object.keys(PAGES)) {
    let r;
    assert.doesNotThrow(() => { r = loadPage(page); },
      `${page} throws while loading. In a browser this leaves the page blank ` +
      `with the error only in the console.`);
    assert.ok(r.created.length > 0, `${page} rendered no elements at all`);
  }
});

test('every click handler on a language page runs without throwing', () => {
  for (const page of Object.keys(PAGES)) {
    const { created, byId } = loadPage(page);
    let fired = 0;
    for (const el of [...byId.values(), ...created]) {
      for (const fn of el.handlers.click || []) {
        assert.doesNotThrow(
          () => fn({ preventDefault() {}, target: el, currentTarget: el }),
          `${page}: clicking ${el.className || el.tagName} throws`);
        fired++;
      }
    }
    assert.ok(fired > 0,
      `${page} wired up no click handlers at all. The learned dot and the ` +
      `review buttons are the only way to record progress.`);
  }
});

// The bug this would catch is quiet and destructive: two pages writing the
// same localStorage keys means grading a card on one page reorders another
// page's queue. Checking the prefix constant is not enough -- this checks
// what the code actually writes.
test('a language page writes only inside its own storage namespace', () => {
  for (const [page, prefix] of Object.entries(PAGES)) {
    const { store, created, byId } = loadPage(page);
    for (const el of [...byId.values(), ...created]) {
      for (const fn of el.handlers.click || []) fn({ preventDefault() {}, target: el, currentTarget: el });
    }
    const keys = [...store.keys()];
    assert.ok(keys.length > 0, `${page} wrote nothing to localStorage after every control was used`);
    const stray = keys.filter((k) => !k.startsWith(prefix + ':'));
    assert.deepEqual(stray, [],
      `${page} wrote keys outside its '${prefix}:' namespace: ${stray.join(', ')}`);
  }
});
