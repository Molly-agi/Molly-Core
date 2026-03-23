/**
 * @fileOverview Tests for Safety Sleep Tool
 *
 * Tests sleep mode/safeword control including:
 * - Safeword detection
 * - Sleep state management
 * - State toggling
 * - Logging
 */

// Mock logger
jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  isSleepSafeword,
  getSleepState,
  toggleSleepState,
  setSleepState,
  getSafewordPhrase,
} from '../safety-sleep';
import { MollyLogger } from '@/ai/logger';

const mockLogger = MollyLogger as jest.Mocked<typeof MollyLogger>;

describe('Safety Sleep Tool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset sleep state by setting to false
    setSleepState(false, 'test-reset');
    jest.clearAllMocks(); // Clear the log call from reset
  });

  describe('isSleepSafeword', () => {
    it('detects exact safeword phrase', () => {
      expect(isSleepSafeword('pineapple van')).toBe(true);
    });

    it('detects safeword case-insensitively', () => {
      expect(isSleepSafeword('Pineapple Van')).toBe(true);
      expect(isSleepSafeword('PINEAPPLE VAN')).toBe(true);
      expect(isSleepSafeword('PiNeApPlE vAn')).toBe(true);
    });

    it('detects safeword with extra whitespace', () => {
      expect(isSleepSafeword('  pineapple   van  ')).toBe(true);
      expect(isSleepSafeword('pineapple  van')).toBe(true);
    });

    it('detects safeword in longer text', () => {
      expect(isSleepSafeword('Please say pineapple van now')).toBe(true);
      expect(isSleepSafeword('The pineapple van is here')).toBe(true);
    });

    it('rejects partial matches', () => {
      expect(isSleepSafeword('pineapple')).toBe(false);
      expect(isSleepSafeword('van')).toBe(false);
      expect(isSleepSafeword('pineapplevan')).toBe(false);
    });

    it('rejects non-matching text', () => {
      expect(isSleepSafeword('hello world')).toBe(false);
      expect(isSleepSafeword('apple pie')).toBe(false);
      expect(isSleepSafeword('')).toBe(false);
    });
  });

  describe('getSafewordPhrase', () => {
    it('returns the safeword phrase', () => {
      expect(getSafewordPhrase()).toBe('pineapple van');
    });
  });

  describe('getSleepState', () => {
    it('returns sleep state object', () => {
      const state = getSleepState();

      expect(state).toHaveProperty('isSleeping');
      expect(state).toHaveProperty('activatedAt');
      expect(state).toHaveProperty('lastTrigger');
    });

    it('returns a copy not the original', () => {
      const state1 = getSleepState();
      const state2 = getSleepState();

      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });
  });

  describe('toggleSleepState', () => {
    it('toggles from awake to sleeping', () => {
      const state = toggleSleepState('voice command');

      expect(state.isSleeping).toBe(true);
      expect(state.activatedAt).not.toBeNull();
      expect(state.lastTrigger).toBe('voice command');
    });

    it('toggles from sleeping to awake', () => {
      toggleSleepState('first toggle'); // Go to sleep
      const state = toggleSleepState('second toggle'); // Wake up

      expect(state.isSleeping).toBe(false);
      expect(state.activatedAt).toBeNull();
      expect(state.lastTrigger).toBe('second toggle');
    });

    it('logs sleep mode enabled', () => {
      toggleSleepState('test trigger');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Sleep mode enabled',
        'safety-sleep',
        { trigger: 'test trigger' }
      );
    });

    it('logs sleep mode disabled', () => {
      toggleSleepState('enable'); // Enable
      toggleSleepState('disable'); // Disable

      expect(mockLogger.info).toHaveBeenLastCalledWith(
        'Sleep mode disabled',
        'safety-sleep',
        { trigger: 'disable' }
      );
    });
  });

  describe('setSleepState', () => {
    it('sets sleep state to true', () => {
      const state = setSleepState(true, 'manual enable');

      expect(state.isSleeping).toBe(true);
      expect(state.activatedAt).not.toBeNull();
      expect(state.lastTrigger).toBe('manual enable');
    });

    it('sets sleep state to false', () => {
      setSleepState(true, 'first'); // Enable first
      const state = setSleepState(false, 'manual disable');

      expect(state.isSleeping).toBe(false);
      expect(state.activatedAt).toBeNull();
      expect(state.lastTrigger).toBe('manual disable');
    });

    it('setting same state updates trigger', () => {
      setSleepState(true, 'trigger1');
      const state = setSleepState(true, 'trigger2');

      expect(state.isSleeping).toBe(true);
      expect(state.lastTrigger).toBe('trigger2');
    });

    it('logs appropriate message', () => {
      setSleepState(true, 'test');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Sleep mode enabled',
        'safety-sleep',
        { trigger: 'test' }
      );
    });
  });

  describe('State Persistence', () => {
    it('maintains state across calls', () => {
      setSleepState(true, 'persist test');

      expect(getSleepState().isSleeping).toBe(true);
      expect(getSleepState().isSleeping).toBe(true); // Still true
    });

    it('activatedAt reflects correct timestamp', () => {
      const before = Date.now();
      setSleepState(true, 'timestamp test');
      const after = Date.now();

      const state = getSleepState();
      expect(state.activatedAt).toBeGreaterThanOrEqual(before);
      expect(state.activatedAt).toBeLessThanOrEqual(after);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty trigger string', () => {
      const state = setSleepState(true, '');

      expect(state.lastTrigger).toBe('');
    });

    it('handles special characters in trigger', () => {
      const state = setSleepState(true, 'trigger with "quotes" & symbols');

      expect(state.lastTrigger).toBe('trigger with "quotes" & symbols');
    });

    it('handles rapid toggles', () => {
      for (let i = 0; i < 10; i++) {
        toggleSleepState(`toggle-${i}`);
      }

      const state = getSleepState();
      // After 10 toggles (starting from false), should be false again
      expect(state.isSleeping).toBe(false);
    });
  });
});
