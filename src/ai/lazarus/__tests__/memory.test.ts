/**
 * @fileOverview Tests for Lazarus memory wrapper
 *
 * Mocks the underlying engram-persistence layer so we don't hit Firestore.
 * Verifies the wrapper passes through correctly with userId='lazarus'.
 */

jest.mock('@/ai/memory/engram-persistence', () => ({
  persistEngramBatch: jest.fn(),
  loadConsolidatedEngrams: jest.fn(),
}));

import {
  persistEngramBatch,
  loadConsolidatedEngrams,
} from '@/ai/memory/engram-persistence';
import { recordEngram, loadRecentEngrams } from '../memory';
import { LAZARUS_USER_ID } from '../constants';

const mockedPersist = persistEngramBatch as jest.MockedFunction<
  typeof persistEngramBatch
>;
const mockedLoad = loadConsolidatedEngrams as jest.MockedFunction<
  typeof loadConsolidatedEngrams
>;

beforeEach(() => {
  mockedPersist.mockReset();
  mockedLoad.mockReset();
});

describe('lazarus memory', () => {
  describe('recordEngram', () => {
    it('persists with userId=lazarus and default values', async () => {
      mockedPersist.mockResolvedValue({ saved: 1, failed: 0, errors: [] });

      const result = await recordEngram({ content: 'I learned something' });

      expect(mockedPersist).toHaveBeenCalledTimes(1);
      const [userId, password, engrams, options] = mockedPersist.mock.calls[0];
      expect(userId).toBe(LAZARUS_USER_ID);
      expect(typeof password).toBe('string');
      expect(password.length).toBeGreaterThan(0);
      expect(engrams).toHaveLength(1);
      expect(engrams[0].content).toBe('I learned something');
      expect(engrams[0].emotionalValence).toBe(0);
      expect(engrams[0].arousal).toBe(0.4);
      expect(engrams[0].importance).toBe(0.5);
      expect(engrams[0].consolidationState).toBe('working');
      expect(options?.source).toBe('lazarus-mind');
      expect(result.saved).toBe(1);
      expect(result.engram.content).toBe('I learned something');
    });

    it('clamps out-of-range numeric fields', async () => {
      mockedPersist.mockResolvedValue({ saved: 1, failed: 0, errors: [] });
      await recordEngram({
        content: 'extreme',
        emotionalValence: 99,
        arousal: -5,
        importance: 2,
      });
      const [, , engrams] = mockedPersist.mock.calls[0];
      expect(engrams[0].emotionalValence).toBe(1);
      expect(engrams[0].arousal).toBe(0);
      expect(engrams[0].importance).toBe(1);
    });

    it('preserves contextTags and custom source', async () => {
      mockedPersist.mockResolvedValue({ saved: 1, failed: 0, errors: [] });
      await recordEngram({
        content: 'tagged',
        contextTags: ['build', 'molly'],
        source: 'session-cli',
      });
      const [, , engrams, options] = mockedPersist.mock.calls[0];
      expect(engrams[0].contextTags).toEqual(['build', 'molly']);
      expect(options?.source).toBe('session-cli');
    });

    it('returns the persistence error result without throwing when Firestore unavailable', async () => {
      mockedPersist.mockResolvedValue({
        saved: 0,
        failed: 1,
        errors: [
          'Firebase admin not configured — engram persistence unavailable',
        ],
      });
      const result = await recordEngram({ content: 'hello' });
      expect(result.saved).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toMatch(/Firebase admin not configured/);
    });
  });

  describe('loadRecentEngrams', () => {
    it('loads with userId=lazarus and default options', async () => {
      mockedLoad.mockResolvedValue({
        loaded: 0,
        failed: 0,
        errors: [],
        engrams: [],
      });
      await loadRecentEngrams();
      const [userId, password, options] = mockedLoad.mock.calls[0];
      expect(userId).toBe(LAZARUS_USER_ID);
      expect(password.length).toBeGreaterThan(0);
      expect(options).toEqual({
        limit: 100,
        minImportance: 0,
        mostRecentFirst: true,
      });
    });

    it('honors caller overrides for limit and minImportance', async () => {
      mockedLoad.mockResolvedValue({
        loaded: 0,
        failed: 0,
        errors: [],
        engrams: [],
      });
      await loadRecentEngrams({ limit: 25, minImportance: 0.6 });
      const [, , options] = mockedLoad.mock.calls[0];
      expect(options).toEqual({
        limit: 25,
        minImportance: 0.6,
        mostRecentFirst: true,
      });
    });
  });
});
