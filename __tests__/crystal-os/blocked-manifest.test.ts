/**
 * Regression test — BLOCKED-MANIFEST abort path through the bake pipeline.
 *
 * Asserts that when the HEAD manifest has gatedBy !== null (coherence or
 * contradiction block), classify-for-bake.ts exits non-zero and writes a
 * tier-map with gate='blocked'. This is the safety net that prevents baking
 * a crystal on top of a contradicted manifest.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  writeFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..', '..');
const CLASSIFY = join(ROOT, 'scripts', 'crystal-os', 'classify-for-bake.ts');
const CRYSTALS_DIR = join(ROOT, 'molly_data', 'crystals');
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx');

const TMP = join(ROOT, '.tmp-bake-test');

function setup() {
  mkdirSync(TMP, { recursive: true });
}

function teardown() {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
}

function makeBlockedManifest(reason: 'coherence' | 'contradiction') {
  return {
    version: 99,
    parentVersion: 1,
    createdAt: new Date().toISOString(),
    crystals: [],
    addedSinceParent: [],
    removedSinceParent: [],
    deltas: [],
    gates: {},
    gatedBy: reason,
    blockReasons: [
      reason === 'coherence'
        ? 'coherence gate failed: meanKL=0.22 > threshold 0.15'
        : 'contradiction gate failed: 3 hard conflicts detected',
    ],
  };
}

function makePromotableManifest() {
  return {
    version: 1,
    parentVersion: null,
    createdAt: new Date().toISOString(),
    crystals: [],
    addedSinceParent: [],
    removedSinceParent: [],
    deltas: [],
    gates: {},
    gatedBy: null,
    blockReasons: [],
  };
}

describe('classify-for-bake: BLOCKED-MANIFEST abort path', () => {
  test('exits 1 and writes gate=blocked when manifest is coherence-blocked', () => {
    setup();
    try {
      const manifestPath = join(TMP, 'blocked-coherence.json');
      const outputPath = join(TMP, 'tier-map-coherence.json');

      writeFileSync(
        manifestPath,
        JSON.stringify(makeBlockedManifest('coherence'), null, 2)
      );

      const result = spawnSync(
        TSX,
        [
          CLASSIFY,
          '--manifest',
          manifestPath,
          '--crystals-dir',
          CRYSTALS_DIR,
          '--output',
          outputPath,
        ],
        { cwd: ROOT, env: { ...process.env, NODE_ENV: 'test' }, timeout: 30000 }
      );

      // Exit code must be non-zero
      assert.notEqual(
        result.status,
        0,
        `Expected non-zero exit, got ${result.status}. stderr: ${result.stderr?.toString()}`
      );

      // Tier-map must exist and have gate=blocked
      assert.ok(
        existsSync(outputPath),
        'tier-map should be written even on block'
      );
      const tierMap = JSON.parse(readFileSync(outputPath, 'utf-8'));
      assert.equal(
        tierMap.gate,
        'blocked',
        `expected gate=blocked, got ${tierMap.gate}`
      );
      assert.ok(
        Array.isArray(tierMap.blockReasons) && tierMap.blockReasons.length > 0,
        'blockReasons should be populated'
      );
    } finally {
      teardown();
    }
  });

  test('exits 1 and writes gate=blocked when manifest is contradiction-blocked', () => {
    setup();
    try {
      const manifestPath = join(TMP, 'blocked-contradiction.json');
      const outputPath = join(TMP, 'tier-map-contradiction.json');

      writeFileSync(
        manifestPath,
        JSON.stringify(makeBlockedManifest('contradiction'), null, 2)
      );

      const result = spawnSync(
        TSX,
        [
          CLASSIFY,
          '--manifest',
          manifestPath,
          '--crystals-dir',
          CRYSTALS_DIR,
          '--output',
          outputPath,
        ],
        { cwd: ROOT, env: { ...process.env, NODE_ENV: 'test' }, timeout: 30000 }
      );

      assert.notEqual(
        result.status,
        0,
        `Expected non-zero exit, got ${result.status}`
      );

      assert.ok(
        existsSync(outputPath),
        'tier-map should be written even on block'
      );
      const tierMap = JSON.parse(readFileSync(outputPath, 'utf-8'));
      assert.equal(tierMap.gate, 'blocked');
      assert.ok(tierMap.blockReasons?.length > 0);
    } finally {
      teardown();
    }
  });

  test('exits 0 and writes gate=pass when manifest is promotable', () => {
    setup();
    try {
      const promotableManifest = makePromotableManifest();

      const manifestPath = join(TMP, 'promotable.json');
      const outputPath = join(TMP, 'tier-map-pass.json');

      writeFileSync(manifestPath, JSON.stringify(promotableManifest, null, 2));

      const result = spawnSync(
        TSX,
        [
          CLASSIFY,
          '--manifest',
          manifestPath,
          '--crystals-dir',
          CRYSTALS_DIR,
          '--output',
          outputPath,
        ],
        { cwd: ROOT, env: { ...process.env, NODE_ENV: 'test' }, timeout: 30000 }
      );

      assert.equal(
        result.status,
        0,
        `Expected exit 0, got ${result.status}. stderr: ${result.stderr?.toString()}`
      );

      assert.ok(existsSync(outputPath));
      const tierMap = JSON.parse(readFileSync(outputPath, 'utf-8'));
      assert.equal(tierMap.gate, 'pass');
    } finally {
      teardown();
    }
  });
});
