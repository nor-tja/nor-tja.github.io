'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function pagePaths() {
  return fs.readdirSync(ROOT)
    .filter((f) => f.endsWith('.html'))
    .sort()
    .map((f) => path.join(ROOT, f));
}

function readPage(name) {
  return fs.readFileSync(path.join(ROOT, name), 'utf8');
}

function sizeOf(name) {
  return fs.statSync(path.join(ROOT, name)).size;
}

module.exports = { ROOT, pagePaths, readPage, sizeOf };
