'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pagePaths, readPage, sizeOf } = require('./helpers');

const MAX_PAGE_BYTES = 60 * 1024;
const MAX_DATA_URI_BYTES = 10 * 1024;

test('no HTML page exceeds 60KB', () => {
  for (const p of pagePaths()) {
    const name = path.basename(p);
    const bytes = sizeOf(name);
    assert.ok(
      bytes <= MAX_PAGE_BYTES,
      `${name} is ${Math.round(bytes / 1024)}KB, over the ${MAX_PAGE_BYTES / 1024}KB budget`
    );
  }
});

test('no inline base64 data URI exceeds 10KB', () => {
  for (const p of pagePaths()) {
    const name = path.basename(p);
    const uris = readPage(name).match(/data:[a-z/+.-]+;base64,[A-Za-z0-9+/=]+/g) || [];
    for (const uri of uris) {
      assert.ok(
        uri.length <= MAX_DATA_URI_BYTES,
        `${name} has a ${Math.round(uri.length / 1024)}KB inline data URI — extract it to assets/`
      );
    }
  }
});
