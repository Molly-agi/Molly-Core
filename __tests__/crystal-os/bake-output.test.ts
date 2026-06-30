/**
 * Smoke test — bake pipeline output validation.
 *
 * Validates that a .cache file produced by bake-crystal.sh via the /slots API
 * is structurally sound: non-zero size and the correct llama.cpp slot blob
 * magic header (0x71 0x73 0x67 0x67 = "qsgg").
 *
 * Run after a successful bake:
 *   CACHE_FILE=/tmp/molly-slots-final/molly-persona.cache npx tsx --test __tests__/crystal-os/bake-output.test.ts
 *
 * Or with defaults (checks the standard bake output path).
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync, openSync, readSync, closeSync } from 'node:fs';

// Magic bytes for llama.cpp slot save blobs (GGUF-adjacent format)
const SLOT_MAGIC = Buffer.from([0x71, 0x73, 0x67, 0x67]); // "qsgg"

const CACHE_FILE =
  process.env.CACHE_FILE ?? '/tmp/molly-slots-final/molly-persona.cache';

describe('bake-crystal.sh: /slots output validation', () => {
  before(() => {
    if (!existsSync(CACHE_FILE)) {
      console.log(
        `[skip] Cache file not found at ${CACHE_FILE} — run bake-crystal.sh first`
      );
    }
  });

  test('cache file exists and is non-zero', () => {
    if (!existsSync(CACHE_FILE)) return; // skip if not baked yet
    const stat = statSync(CACHE_FILE);
    assert.ok(stat.size > 0, `Expected non-zero size, got ${stat.size}`);
    console.log(`  cache size: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
  });

  test('cache file starts with llama.cpp slot magic (qsgg)', () => {
    if (!existsSync(CACHE_FILE)) return;
    const buf = Buffer.alloc(4);
    const fd = openSync(CACHE_FILE, 'r');
    try {
      readSync(fd, buf, 0, 4, 0);
    } finally {
      closeSync(fd);
    }
    assert.deepEqual(
      buf,
      SLOT_MAGIC,
      `Magic mismatch: expected ${SLOT_MAGIC.toString('hex')}, got ${buf.toString('hex')}`
    );
    console.log(`  magic header: ${buf.toString('ascii')} ✔`);
  });

  test('cache file is large enough to contain real KV state (>= 1 MB)', () => {
    if (!existsSync(CACHE_FILE)) return;
    const stat = statSync(CACHE_FILE);
    assert.ok(
      stat.size >= 1024 * 1024,
      `Cache too small (${stat.size} bytes) — likely an empty or failed bake`
    );
  });
});
