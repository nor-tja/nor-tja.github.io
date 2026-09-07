'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ROOT, readPage } = require('./helpers');

// Every other test in this suite reads the code as text. This one runs it.
//
// That gap mattered the moment the engine was extracted: the page's script had
// always been sloppy-mode, and the shared module is 'use strict'. An
// assignment to an undeclared variable that used to quietly create a global
// now throws a ReferenceError -- in the browser, at load, where nothing in
// this repo would ever see it. A grep-based test cannot find that class of
// bug. Neither can it find a typo'd property on a real DOM object.
//
// The stub below is deliberately small: enough DOM for the engine to complete
// a render and run its click handlers, and no more. It is not a browser, and
// it is not trying to be. It answers one question -- does this code execute?

const PAGES = {
  'mots-du-jour.html': 'motsDuJour',
  'spanish.html': 'palabrasDelDia',
  'portuguese.html': 'palavrasDoDia',
  'japanese.html': 'tangoNoHi',
  'ukrainian.html': 'slovoDnya',
};

function makeDom() {
  const created = [];
  function el(tag) {
    const n = {
      tagName: String(tag).toUpperCase(),
      children: [], style: {}, dataset: {}, handlers: {},
      className: '', id: '', textContent: '', innerHTML: '', value: '',
      type: '', disabled: false, hidden: false, lang: '', title: '', href: '',
      // A real <select> exposes .options; the voice picker reads its length.
      options: [], selectedIndex: -1,
      classList: {
        _s: new Set(),
        add(...c) { c.forEach((x) => this._s.add(x)); },
        remove(...c) { c.forEach((x) => this._s.delete(x)); },
        toggle(c, f) { const on = f === undefined ? !this._s.has(c) : f; if (on) this._s.add(c); else this._s.delete(c); return on; },
        contains(c) { return this._s.has(c); },
      },
      appendChild(c) { this.children.push(c); if (c.tagName === 'OPTION') this.options.push(c); return c; },
      insertBefore(c) { this.children.unshift(c); return c; },
      removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; },
      remove() {},
      addEventListener(t, fn) { (this.handlers[t] = this.handlers[t] || []).push(fn); },
      removeEventListener() {},
      setAttribute(k, v) { this[k] = v; },
      getAttribute(k) { return this[k] === undefined ? null : this[k]; },
      removeAttribute(k) { delete this[k]; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      closest() { return null; },
      focus() {}, blur() {},
      getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }; },
    };
    created.push(n);
    return n;
  }
  const byId = new Map();
  // Every id the engine looks up resolves, so the run takes the fully
  // populated path instead of bailing out early on a null.
  const document = {
    getElementById(id) { if (!byId.has(id)) byId.set(id, el('div')); return byId.get(id); },
    createElement: el,
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    body: el('body'),
    documentElement: el('html'),
  };
  return { document, created, byId };
}

function loadPage(page) {
  const { document, created, byId } = makeDom();
  const store = new Map();
  const sandbox = {
    document,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    speechSynthesis: {
      getVoices: () => [
        { name: 'A', lang: 'fr-FR' }, { name: 'B', lang: 'es-ES' },
        { name: 'C', lang: 'pt-PT' }, { name: 'D', lang: 'ja-JP' },
        { name: 'E', lang: 'uk-UA' },
      ],
      speak() {}, cancel() {}, onvoiceschanged: null,
    },
    SpeechSynthesisUtterance: function (t) { this.text = t; },
    console, setTimeout, clearTimeout, setInterval, clearInterval,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const ctx = vm.createContext(sandbox);
  const html = readPage(page);
  // Load exactly what the page loads, in the page's own order. If the tags are
  // ordered wrongly this throws here, which is the point.
  for (const m of html.matchAll(/<script[^>]+src="([^"]+)"[^>]*>/g)) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, m[1]), 'utf8'), ctx, { filename: m[1] });
  }
  vm.runInContext(/<script>([\s\S]*?)<\/script>/.exec(html)[1], ctx, { filename: page });

  return { store, created, byId };
}

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
