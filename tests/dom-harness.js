'use strict';
// A DOM small enough to run the language engine in, and no bigger.
//
// It is not a browser and is not trying to be. It exists so tests can ask
// questions that reading the source as text cannot answer: does this code
// execute, and -- since the voice work -- which voice does it actually end up
// handing to the speech engine.
//
// Named without `.test.` so `node --test` does not try to run it as a suite.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ROOT, readPage } = require('./helpers');

const PAGES = {
  'mots-du-jour.html': 'motsDuJour',
  'spanish.html': 'palabrasDelDia',
  'portuguese.html': 'palavrasDoDia',
  'japanese.html': 'tangoNoHi',
  'ukrainian.html': 'slovoDnya',
};

// One plain voice per page language, so a default run has something to pick.
const DEFAULT_VOICES = [
  { name: 'A', lang: 'fr-FR' }, { name: 'B', lang: 'es-ES' },
  { name: 'C', lang: 'pt-PT' }, { name: 'D', lang: 'ja-JP' },
  { name: 'E', lang: 'uk-UA' },
];

function makeDom() {
  const created = [];
  function el(tag) {
    const n = {
      tagName: String(tag).toUpperCase(),
      children: [], style: {}, dataset: {}, handlers: {},
      className: '', id: '', textContent: '', value: '',
      type: '', disabled: false, hidden: false, lang: '', title: '', href: '',
      // A real <select> exposes .options; the voice picker reads them.
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
    // Emptying a node empties it. A browser reparses innerHTML into children;
    // this only models the clearing case, which is the one the engine relies
    // on when it rebuilds the voice dropdown. Without it the stub keeps the
    // old <option>s in .options after the engine has cleared them, which is a
    // divergence that would have to be papered over on the production side.
    var html = '';
    Object.defineProperty(n, 'innerHTML', {
      get: function () { return html; },
      set: function (val) {
        html = String(val);
        if (html === '') { n.children.length = 0; n.options.length = 0; }
      },
    });
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

// opts.voices  what speechSynthesis.getVoices() returns
// opts.saved   entries seeded into localStorage before the engine loads
function loadPage(page, opts) {
  const o = opts || {};
  const { document, created, byId } = makeDom();
  const store = new Map(Object.entries(o.saved || {}));
  const spoken = [];       // every utterance handed to speak(), in order
  const synth = {
    getVoices: () => (o.voices || DEFAULT_VOICES),
    speak(u) { spoken.push(u); },
    cancel() {},
    onvoiceschanged: null,
  };
  const sandbox = {
    document,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    speechSynthesis: synth,
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

  return { store, created, byId, spoken, synth, sandbox };
}

// Click the first pronounce button the render produced and return the
// utterance it generated. Every page wires the same handler, so which button
// it is does not matter.
function speakOnce(loaded) {
  for (const el of [...loaded.byId.values(), ...loaded.created]) {
    for (const fn of el.handlers.click || []) {
      fn({ preventDefault() {}, target: el, currentTarget: el });
      if (loaded.spoken.length) return loaded.spoken[loaded.spoken.length - 1];
    }
  }
  return null;
}

module.exports = { PAGES, DEFAULT_VOICES, makeDom, loadPage, speakOnce };
