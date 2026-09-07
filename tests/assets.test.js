'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { ROOT, pagePaths, readPage } = require('./helpers');

function eachPage(fn) {
  for (const p of pagePaths()) fn(path.basename(p), readPage(path.basename(p)));
}

// Pull every local src=/href= that points at a media file. Skips absolute URLs,
// data URIs and anchors.
function localRefs(src) {
  const out = [];
  const re = /(?:src|href)="([^"]+\.(?:mp3|ogg|wav|jpg|jpeg|png|gif|svg|webp|ico))"/gi;
  let m;
  while ((m = re.exec(src))) {
    const ref = m[1];
    if (/^(https?:)?\/\//.test(ref) || ref.startsWith('data:') || ref.startsWith('#')) continue;
    out.push(ref);
  }
  return out;
}

// A missing media file is silent: the browser logs a 404 and the page carries on
// looking almost fine. An <audio> whose file 404s just never plays.
test('every locally referenced media file exists on disk', () => {
  const missing = [];
  eachPage((name, src) => {
    for (const ref of localRefs(src)) {
      if (!fs.existsSync(path.join(ROOT, ref))) missing.push(`${name} -> ${ref}`);
    }
  });
  assert.deepEqual(missing, [], `referenced but not on disk:\n  ${missing.join('\n  ')}`);
});

// The reverse: an audio file nobody plays is dead weight in the deployed site
// and, if it is under a restrictive licence, a liability for no benefit.
//
// Deliberately asks git rather than reading the directory. "Shipped" means
// committed -- an untracked file sitting in the working copy is never published
// to Pages, and failing the suite over one would be reporting a problem the
// visitor cannot have.
test('no unreferenced audio files are shipped', () => {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
  const audio = tracked.filter(f => /\.(mp3|ogg|wav)$/i.test(f));
  const referenced = new Set();
  eachPage((_, src) => localRefs(src).forEach(r => referenced.add(r)));
  const orphans = audio.filter(f => !referenced.has(f));
  assert.deepEqual(orphans, [],
    `audio files in the repo that no page plays: ${orphans.join(', ')}. ` +
    `Wire them up or delete them.`);
});

// Attribution for CC BY material is a licence condition, not a nicety: use
// without credit is simply unlicensed use. Unlike the other two recordings,
// which are CC0, this one cannot ship without naming its author.
test('CC BY audio is credited on the page that plays it', () => {
  const REQUIRED = [
    { file: 'ambience-waves.mp3', author: 'InspectorJ', licence: 'creativecommons.org/licenses/by/' }
  ];
  eachPage((name, src) => {
    for (const { file, author, licence } of REQUIRED) {
      if (!src.includes(file)) continue;
      assert.ok(src.includes(author),
        `${name} plays ${file} but never names its author (${author}). ` +
        `CC BY requires attribution.`);
      assert.ok(src.includes(licence),
        `${name} plays ${file} but does not link the CC BY licence. ` +
        `The licence text has to be identifiable, not just the author's name.`);
    }
  });
});
