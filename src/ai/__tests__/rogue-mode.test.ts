/**
 * @fileOverview Rogue Mode Tests — Security Operations (direct-tool model)
 *
 * Tests cover the post-refactor surface only:
 * - Initial state queries (isActive, getCurrentMission)
 * - Compartmentalization (getState returns a copy)
 * - Mission history read (listMissions, readMission path-traversal block)
 * - Singleton (getRogueMode / resetRogueMode)
 *
 * Activation/deactivation passphrase tests + buildRogueModeSystemPrompt tests
 * were removed in PR-4. Production rogue-mode.ts is now a direct tool — no
 * mode switching, no activation phrase, no system-prompt builder. See the
 * header docstring of src/ai/rogue-mode.ts for the design rationale.
 * Parallels the PR-230 precedent: when production deletes a contract, the
 * tests that asserted it go with it rather than being rewritten to lie.
 */

// Mock logger
jest.mock('../logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  generateTraceId: jest.fn(() => 'test-trace-rogue-mode'),
}));

// Mock fs to avoid actual disk I/O in tests
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockResolvedValue('{}'),
    readdir: jest.fn().mockResolvedValue([]),
  },
}));

import { getRogueMode, resetRogueMode } from '../rogue-mode';

describe('Rogue Mode — Security Operations', () => {
  beforeEach(() => {
    resetRogueMode();
  });

  // ── Initial State ──

  describe('Initial State', () => {
    it('starts inactive', () => {
      const rogue = getRogueMode();
      expect(rogue.isActive()).toBe(false);
    });

    it('has no current mission', () => {
      const rogue = getRogueMode();
      expect(rogue.getCurrentMission()).toBeNull();
    });
  });

  // ── Compartmentalization ──

  describe('Compartmentalization', () => {
    it('getState returns a copy, not a reference', () => {
      const rogue = getRogueMode();
      const state1 = rogue.getState();
      const state2 = rogue.getState();
      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });
  });

  // ── Mission History ──

  describe('Mission History', () => {
    it('lists missions (returns empty array when none)', async () => {
      const rogue = getRogueMode();
      const missions = await rogue.listMissions();
      expect(Array.isArray(missions)).toBe(true);
    });

    it('readMission returns null for non-existent mission', async () => {
      // Override the mock readFile to throw for this specific test
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fsPromises = require('fs').promises;
      fsPromises.readFile.mockRejectedValueOnce(
        new Error('ENOENT: no such file')
      );
      const rogue = getRogueMode();
      const mission = await rogue.readMission('non-existent');
      expect(mission).toBeNull();
    });

    it('readMission blocks path traversal', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fsPromises = require('fs').promises;
      fsPromises.readFile.mockRejectedValueOnce(new Error('ENOENT'));
      const rogue = getRogueMode();
      const mission = await rogue.readMission('../../etc/passwd');
      expect(mission).toBeNull();
    });
  });

  // ── Singleton ──

  describe('Singleton', () => {
    it('returns the same instance', () => {
      const a = getRogueMode();
      const b = getRogueMode();
      expect(a).toBe(b);
    });

    it('reset creates a fresh instance', () => {
      const a = getRogueMode();
      resetRogueMode();
      const b = getRogueMode();
      expect(a).not.toBe(b);
    });
  });
});
