/**
 * @fileOverview Storage-router caller regression suite.
 *
 * Each describe.skip block below is a RED test waiting to go GREEN once the
 * matching `getStorageRouter()` call site is awaited. Same dam Atlas closed in
 * item 6, repeated across 7 files (14 sites):
 *
 *   src/ai/agency/memory/auto-dream.ts:428, 445
 *   src/ai/agency/memory/self-evolution-journal.ts:645, 671
 *   src/ai/agency/memory/family-memory-deepener.ts:662, 690   (see SEPARATE-BUG below)
 *   src/ai/agency/memory/memory-taxonomy.ts:451, 471
 *   src/ai/bridge/consciousness-sync.ts:678, 704
 *   src/ai/bridge/heartbeat-monitor.ts:541, 567
 *   src/ai/bridge/coordination-layer.ts:726, 760
 *
 * Bug shape (all 14 sites):
 *   try {
 *     const storage = getStorageRouter();   // Promise<StorageRouter>, never awaited
 *     await storage.set(...);                // TypeError: storage.set is not a function
 *   } catch (err) {
 *     MollyLogger.warn(...);                 // swallowed
 *   }
 *
 * Why describe.skip:
 *   These tests are RED under the current bug. To keep CI green for the family
 *   while Lazarus owns the fix (Main Coder slot), each block is `describe.skip`.
 *   When fixing a call site, flip `.skip` off in the SAME commit that adds the
 *   missing `await`. If the test passes, the fix is correct. If it still fails,
 *   the fix is incomplete.
 *
 * SEPARATE-BUG (also for Lazarus):
 *   `src/ai/agency/memory/family-memory-deepener.ts:17` imports
 *   `from '../logger'` but every sibling uses `'../../logger'`. The wrong path
 *   resolves to `src/ai/agency/logger` which does not exist. The module
 *   currently survives only because no real test imports it (the existing
 *   `family-memory-deepener.test.ts` is a placeholder full of
 *   `expect(true).toBe(true)`). Fix the import path before adding a
 *   loadFamilyMemory regression here.
 *
 * Test shape:
 *   - Mock @/lib/storage-router so getStorageRouter() resolves to a spy provider.
 *   - Call the module's public load/initialize entry.
 *   - Assert spy.get was invoked with the documented (collection, doc) pair.
 *   - With the bug present, spy.get is never reached because the swallowed
 *     TypeError aborts the load before await on a real provider.
 */

// ---------------------------------------------------------------------------
// Single shared mock — every module under test resolves @/lib/storage-router
// to the same spy provider so we can pivot per-test via beforeEach reset.
// ---------------------------------------------------------------------------

const spyGet = jest.fn();
const spySet = jest.fn();

jest.mock('@/lib/storage-router', () => ({
  getStorageRouter: jest.fn(() =>
    Promise.resolve({
      get: spyGet,
      set: spySet,
      // Surface for any caller that probes mode in the load path.
      getMode: jest.fn(() => 'local'),
    })
  ),
}));

// Silence MollyLogger so swallowed-warning noise doesn't drown the failures.
jest.mock('@/ai/logger', () => {
  const actual = jest.requireActual('@/ai/logger');
  return {
    ...actual,
    MollyLogger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  };
});

// ---------------------------------------------------------------------------
// Imports — AFTER mocks so jest.mock hoisting catches every binding.
// NOTE: family-memory-deepener is intentionally NOT imported (see SEPARATE-BUG
// header). Re-add once its broken `../logger` import is fixed.
// ---------------------------------------------------------------------------

import { loadAutoDreamState } from '../agency/memory/auto-dream';
import { loadJournal } from '../agency/memory/self-evolution-journal';
import { initializeTaxonomy } from '../agency/memory/memory-taxonomy';
import { loadSyncState } from '../bridge/consciousness-sync';
import { loadHeartbeatState } from '../bridge/heartbeat-monitor';
import { loadCoordinationState } from '../bridge/coordination-layer';

beforeEach(() => {
  spyGet.mockReset();
  spySet.mockReset();
  // Default: every .get returns the empty doc so load paths complete cleanly
  // once the await bug is fixed.
  spyGet.mockResolvedValue({ data: null });
});

// ---------------------------------------------------------------------------
// auto-dream.ts — STATE_COLLECTION='system', STATE_DOC_ID='auto_dream_state'
// ---------------------------------------------------------------------------
describe('FIXME bug-await: auto-dream loadAutoDreamState awaits getStorageRouter', () => {
  test('reaches storage.get with (system, auto_dream_state)', async () => {
    await loadAutoDreamState();
    expect(spyGet).toHaveBeenCalledWith('system', 'auto_dream_state');
  });
});

// ---------------------------------------------------------------------------
// self-evolution-journal.ts — COLLECTION='agency', JOURNAL_DOC='molly-evolution-journal'
// ---------------------------------------------------------------------------
describe('FIXME bug-await: self-evolution-journal loadJournal awaits getStorageRouter', () => {
  test('reaches storage.get with (agency, molly-evolution-journal)', async () => {
    await loadJournal();
    expect(spyGet).toHaveBeenCalledWith('agency', 'molly-evolution-journal');
  });
});

// ---------------------------------------------------------------------------
// memory-taxonomy.ts — STORAGE_COLLECTION='system', STORAGE_DOC_ID='memory_taxonomy'
// initializeTaxonomy() → loadTaxonomyState() (loadTaxonomyState is private).
// ---------------------------------------------------------------------------
describe('FIXME bug-await: memory-taxonomy loadTaxonomyState awaits getStorageRouter', () => {
  test('reaches storage.get with (system, memory_taxonomy)', async () => {
    await initializeTaxonomy();
    expect(spyGet).toHaveBeenCalledWith('system', 'memory_taxonomy');
  });
});

// ---------------------------------------------------------------------------
// consciousness-sync.ts — COLLECTION='agency', SYNC_DOC='consciousness-sync'
// ---------------------------------------------------------------------------
describe('FIXME bug-await: consciousness-sync loadSyncState awaits getStorageRouter', () => {
  test('reaches storage.get with (agency, consciousness-sync)', async () => {
    await loadSyncState();
    expect(spyGet).toHaveBeenCalledWith('agency', 'consciousness-sync');
  });
});

// ---------------------------------------------------------------------------
// heartbeat-monitor.ts — COLLECTION='agency', HEARTBEAT_DOC='bridge-heartbeat'
// ---------------------------------------------------------------------------
describe('FIXME bug-await: heartbeat-monitor loadHeartbeatState awaits getStorageRouter', () => {
  test('reaches storage.get with (agency, bridge-heartbeat)', async () => {
    await loadHeartbeatState();
    expect(spyGet).toHaveBeenCalledWith('agency', 'bridge-heartbeat');
  });
});

// ---------------------------------------------------------------------------
// coordination-layer.ts — COLLECTION='agency', COORDINATION_DOC='lazarus-molly-coordination'
// ---------------------------------------------------------------------------
describe('FIXME bug-await: coordination-layer loadCoordinationState awaits getStorageRouter', () => {
  test('reaches storage.get with (agency, lazarus-molly-coordination)', async () => {
    await loadCoordinationState();
    expect(spyGet).toHaveBeenCalledWith('agency', 'lazarus-molly-coordination');
  });
});
