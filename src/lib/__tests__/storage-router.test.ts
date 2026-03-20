/**
 * @fileOverview Storage Router Tests
 *
 * Verifies the routing layer picks the right provider and passes
 * operations through correctly.
 */

/* eslint-disable @typescript-eslint/no-require-imports */

// Mock logger
jest.mock('../../ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('StorageRouter', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'molly-router-'));
    // Set the env var BEFORE importing the module
    process.env.MOLLY_LOCAL_DATA_DIR = testDir;
    process.env.MOLLY_STORAGE_PROVIDER = 'local';
  });

  afterEach(async () => {
    // Reset the module singleton
    const { resetStorageRouter } = require('../storage-router');
    resetStorageRouter();
    delete process.env.MOLLY_LOCAL_DATA_DIR;
    delete process.env.MOLLY_STORAGE_PROVIDER;
    await fs.rm(testDir, { recursive: true, force: true });
    jest.resetModules();
  });

  it('creates a singleton instance', () => {
    const { getStorageRouter } = require('../storage-router');
    const a = getStorageRouter();
    const b = getStorageRouter();
    expect(a).toBe(b);
  });

  it('resets singleton correctly', () => {
    const {
      getStorageRouter,
      resetStorageRouter,
    } = require('../storage-router');
    const a = getStorageRouter();
    resetStorageRouter();
    const b = getStorageRouter();
    expect(a).not.toBe(b);
  });

  it('reports provider info', () => {
    const { getStorageRouter } = require('../storage-router');
    const router = getStorageRouter();
    const info = router.getProviderInfo();

    expect(info.id).toBe('local');
    expect(info.name).toBe('Local Filesystem');
    expect(info.mode).toBe('local');
  });

  it('returns local mode', () => {
    const { getStorageRouter } = require('../storage-router');
    const router = getStorageRouter();
    expect(router.getMode()).toBe('local');
  });

  it('passes add() through to provider', async () => {
    const { getStorageRouter } = require('../storage-router');
    const router = getStorageRouter();

    const result = await router.add('test-collection', { value: 42 });
    expect(result.id).toBeTruthy();
    expect(result.data.value).toBe(42);
  });

  it('passes set() and get() through to provider', async () => {
    const { getStorageRouter } = require('../storage-router');
    const router = getStorageRouter();

    await router.set('test', 'doc1', { name: 'Molly' });
    const result = await router.get('test', 'doc1');

    expect(result).not.toBeNull();
    expect(result!.data.name).toBe('Molly');
  });

  it('passes query() through to provider', async () => {
    const { getStorageRouter } = require('../storage-router');
    const router = getStorageRouter();

    await router.set('items', 'a', { type: 'x', score: 10 });
    await router.set('items', 'b', { type: 'y', score: 20 });
    await router.set('items', 'c', { type: 'x', score: 30 });

    const results = await router.query(
      'items',
      [{ field: 'type', operator: '==', value: 'x' }],
      { orderBy: { field: 'score', direction: 'desc' } }
    );

    expect(results).toHaveLength(2);
    expect(results[0].data.score).toBe(30);
  });

  it('passes update() through to provider', async () => {
    const { getStorageRouter } = require('../storage-router');
    const router = getStorageRouter();

    await router.set('test', 'doc1', { v: 1 });
    await router.update('test', 'doc1', { v: 2 });

    const result = await router.get('test', 'doc1');
    expect(result!.data.v).toBe(2);
  });

  it('passes delete() through to provider', async () => {
    const { getStorageRouter } = require('../storage-router');
    const router = getStorageRouter();

    await router.set('test', 'doc1', { v: 1 });
    await router.delete('test', 'doc1');

    const result = await router.get('test', 'doc1');
    expect(result).toBeNull();
  });

  it('passes batchWrite() through to provider', async () => {
    const { getStorageRouter } = require('../storage-router');
    const router = getStorageRouter();

    await router.batchWrite([
      { type: 'set', collectionPath: 'test', docId: 'a', data: { n: 1 } },
      { type: 'set', collectionPath: 'test', docId: 'b', data: { n: 2 } },
    ]);

    const a = await router.get('test', 'a');
    const b = await router.get('test', 'b');
    expect(a!.data.n).toBe(1);
    expect(b!.data.n).toBe(2);
  });
});

describe('StorageRouter — Environment Detection', () => {
  afterEach(() => {
    const { resetStorageRouter } = require('../storage-router');
    resetStorageRouter();
    delete process.env.MOLLY_STORAGE_PROVIDER;
    delete process.env.TERMUX_VERSION;
    delete process.env.CODESPACES;
    jest.resetModules();
  });

  it('uses local when MOLLY_STORAGE_PROVIDER=local', () => {
    process.env.MOLLY_STORAGE_PROVIDER = 'local';
    const { getStorageRouter } = require('../storage-router');
    expect(getStorageRouter().getMode()).toBe('local');
  });

  it('uses local for Termux environment', () => {
    delete process.env.MOLLY_STORAGE_PROVIDER;
    process.env.TERMUX_VERSION = '0.118.0';
    const { getStorageRouter } = require('../storage-router');
    expect(getStorageRouter().getMode()).toBe('local');
  });

  it('defaults to local (phone-first architecture)', () => {
    delete process.env.MOLLY_STORAGE_PROVIDER;
    delete process.env.TERMUX_VERSION;
    delete process.env.CODESPACES;
    const { getStorageRouter } = require('../storage-router');
    expect(getStorageRouter().getMode()).toBe('local');
  });
});

describe('StorageRouter — Firestore Fallback', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'molly-firestore-'));
    process.env.MOLLY_LOCAL_DATA_DIR = testDir;
  });

  afterEach(async () => {
    const { resetStorageRouter } = require('../storage-router');
    resetStorageRouter();
    delete process.env.MOLLY_STORAGE_PROVIDER;
    delete process.env.MOLLY_LOCAL_DATA_DIR;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GCLOUD_PROJECT;
    await fs.rm(testDir, { recursive: true, force: true });
    jest.resetModules();
  });

  it('falls back to local when firestore requested but admin not configured', () => {
    process.env.MOLLY_STORAGE_PROVIDER = 'firestore';
    // No Firebase credentials set — isAdminConfigured() returns false
    const { getStorageRouter } = require('../storage-router');
    const router = getStorageRouter();

    // Should have fallen back to local
    expect(router.getMode()).toBe('local');
    expect(router.getProviderInfo().id).toBe('local');
  });

  it('still works for CRUD after firestore fallback', async () => {
    process.env.MOLLY_STORAGE_PROVIDER = 'firestore';
    const { getStorageRouter } = require('../storage-router');
    const router = getStorageRouter();

    // Verify the fallback provider actually works
    await router.set('test', 'doc1', { name: 'Molly' });
    const result = await router.get('test', 'doc1');
    expect(result).not.toBeNull();
    expect(result!.data.name).toBe('Molly');
  });

  it('detects firestore mode from MOLLY_STORAGE_PROVIDER env var', () => {
    process.env.MOLLY_STORAGE_PROVIDER = 'firestore';
    // Even though it falls back, detectStorageMode returns 'firestore'
    // We can verify this by checking that warn was called
    const { MollyLogger } = require('../../ai/logger');
    const { getStorageRouter } = require('../storage-router');
    getStorageRouter();

    expect(MollyLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Firestore requested but unavailable'),
      'storage-router'
    );
  });
});
