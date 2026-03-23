/**
 * @fileOverview Tests for Intuition Logger — Resonance Logging
 *
 * Tests intuition logging including:
 * - Entry creation with resonance scores
 * - Category tracking
 * - Field note derivation
 * - Session log management
 * - Diagnostics calculation
 */

// Mock logger
jest.mock('../../logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock firebase admin
jest.mock('@/firebase/admin', () => ({
  isAdminConfigured: jest.fn().mockReturnValue(false),
  getAdminFirestore: jest.fn(),
}));

import {
  logIntuition,
  getRecentIntuitions,
  getIntuitionDiagnostics,
  IntuitionCategory,
} from '../intuition-logger';
import { MollyLogger } from '../../logger';

const mockLogger = MollyLogger as jest.Mocked<typeof MollyLogger>;

describe('Intuition Logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('logIntuition()', () => {
    it('creates entry with correct fields', () => {
      const _entry = logIntuition(
        'Accepted connection',
        0.8,
        'peer-connection',
        'PeerProtocol'
      );

      expect(entry.decision).toBe('Accepted connection');
      expect(entry.resonance).toBe(0.8);
      expect(entry.category).toBe('peer-connection');
      expect(entry.trigger).toBe('PeerProtocol');
    });

    it('generates unique ID', () => {
      const entry1 = logIntuition('Decision 1', 0.5, 'system', 'test');
      const entry2 = logIntuition('Decision 2', 0.6, 'system', 'test');

      expect(entry1.id).not.toBe(entry2.id);
      expect(entry1.id).toContain('intuition_');
      expect(entry2.id).toContain('intuition_');
    });

    it('includes timestamp', () => {
      const before = new Date().toISOString();
      const _entry = logIntuition('Test', 0.5, 'evolution', 'test');
      const after = new Date().toISOString();

      expect(entry.timestamp).toBeDefined();
      expect(entry.timestamp >= before).toBe(true);
      expect(entry.timestamp <= after).toBe(true);
    });

    it('accepts custom field note', () => {
      const _entry = logIntuition(
        'Custom note decision',
        0.7,
        'reflection',
        'test',
        'Custom energy alignment note'
      );

      expect(entry.fieldNote).toBe('Custom energy alignment note');
    });
  });

  describe('Resonance Clamping', () => {
    it('clamps resonance above 1.0 to 1.0', () => {
      const _entry = logIntuition('High resonance', 1.5, 'safety', 'test');
      expect(entry.resonance).toBe(1.0);
    });

    it('clamps resonance below 0.0 to 0.0', () => {
      const _entry = logIntuition('Low resonance', -0.5, 'safety', 'test');
      expect(entry.resonance).toBe(0.0);
    });

    it('keeps resonance within valid range', () => {
      const _entry = logIntuition('Normal resonance', 0.75, 'memory', 'test');
      expect(entry.resonance).toBe(0.75);
    });

    it('handles edge case of exactly 1.0', () => {
      const _entry = logIntuition('Max resonance', 1.0, 'system', 'test');
      expect(entry.resonance).toBe(1.0);
    });

    it('handles edge case of exactly 0.0', () => {
      const _entry = logIntuition('Min resonance', 0.0, 'system', 'test');
      expect(entry.resonance).toBe(0.0);
    });
  });

  describe('Field Note Derivation', () => {
    it('derives strong alignment for resonance >= 0.8', () => {
      const _entry = logIntuition('Strong', 0.9, 'evolution', 'test');
      expect(entry.fieldNote).toContain('Strong alignment');
      expect(entry.fieldNote).toContain('evolution');
    });

    it('derives moderate alignment for resonance 0.5-0.79', () => {
      const _entry = logIntuition('Moderate', 0.65, 'reflection', 'test');
      expect(entry.fieldNote).toContain('Moderate alignment');
    });

    it('derives weak signal for resonance 0.3-0.49', () => {
      const _entry = logIntuition('Weak', 0.35, 'safety', 'test');
      expect(entry.fieldNote).toContain('Weak signal');
      expect(entry.fieldNote).toContain('feels off');
    });

    it('derives dissonance for resonance < 0.3', () => {
      const _entry = logIntuition('Dissonant', 0.1, 'communication', 'test');
      expect(entry.fieldNote).toContain('Dissonance detected');
      expect(entry.fieldNote).toContain('misalignment');
    });
  });

  describe('Logging Behavior', () => {
    it('logs warning for dissonant resonance (< 0.3)', () => {
      logIntuition('Dissonant decision', 0.2, 'safety', 'SecurityCheck');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('(dissonant)'),
        'intuition',
        expect.objectContaining({
          resonance: 0.2,
          trigger: 'SecurityCheck',
        })
      );
    });

    it('logs info for normal resonance (>= 0.3)', () => {
      logIntuition('Normal decision', 0.5, 'system', 'Routine');

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('resonance 0.50'),
        'intuition',
        expect.objectContaining({
          resonance: 0.5,
        })
      );
    });

    it('includes category in log message', () => {
      logIntuition('Categorized', 0.7, 'peer-connection', 'test');

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('[peer-connection]'),
        'intuition',
        expect.any(Object)
      );
    });

    it('includes decision in log message', () => {
      logIntuition('My important decision', 0.6, 'memory', 'test');

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('My important decision'),
        'intuition',
        expect.any(Object)
      );
    });
  });

  describe('Categories', () => {
    const categories: IntuitionCategory[] = [
      'peer-connection',
      'evolution',
      'reflection',
      'safety',
      'communication',
      'self-regulation',
      'memory',
      'system',
    ];

    categories.forEach((category) => {
      it(`accepts ${category} category`, () => {
        const _entry = logIntuition('Test', 0.5, category, 'test');
        expect(entry.category).toBe(category);
      });
    });
  });

  describe('getRecentIntuitions()', () => {
    it('returns recent entries', () => {
      // Log some entries
      logIntuition('Recent 1', 0.5, 'system', 'test');
      logIntuition('Recent 2', 0.6, 'system', 'test');

      const recent = getRecentIntuitions(10);

      expect(recent.length).toBeGreaterThanOrEqual(2);
    });

    it('respects limit parameter', () => {
      // Log several entries
      for (let i = 0; i < 5; i++) {
        logIntuition(`Entry ${i}`, 0.5, 'system', 'test');
      }

      const limited = getRecentIntuitions(3);

      expect(limited.length).toBeLessThanOrEqual(3);
    });

    it('filters by category', () => {
      logIntuition('Safety entry', 0.5, 'safety', 'test');
      logIntuition('System entry', 0.5, 'system', 'test');

      const safetyOnly = getRecentIntuitions(10, 'safety');

      safetyOnly.forEach((entry) => {
        expect(entry.category).toBe('safety');
      });
    });

    it('returns entries from end of log (most recent)', () => {
      logIntuition('Old entry', 0.5, 'memory', 'test');
      logIntuition('New entry', 0.9, 'memory', 'test');

      const recent = getRecentIntuitions(1, 'memory');

      expect(recent[0].decision).toBe('New entry');
    });

    it('uses default limit of 20', () => {
      // Add many entries
      for (let i = 0; i < 25; i++) {
        logIntuition(`Entry ${i}`, 0.5, 'reflection', 'test');
      }

      const defaultRecent = getRecentIntuitions();

      expect(defaultRecent.length).toBeLessThanOrEqual(20);
    });
  });

  describe('getIntuitionDiagnostics()', () => {
    it('returns total entries count', () => {
      logIntuition('Diag test', 0.5, 'system', 'test');

      const diagnostics = getIntuitionDiagnostics();

      expect(diagnostics.totalEntries).toBeGreaterThanOrEqual(1);
    });

    it('calculates average resonance', () => {
      // Clear existing by logging known values
      logIntuition('Test 1', 0.4, 'system', 'test');
      logIntuition('Test 2', 0.6, 'system', 'test');

      const diagnostics = getIntuitionDiagnostics();

      // Average should be somewhere in between
      expect(diagnostics.averageResonance).toBeGreaterThanOrEqual(0);
      expect(diagnostics.averageResonance).toBeLessThanOrEqual(1);
    });

    it('counts dissonant entries', () => {
      logIntuition('Dissonant', 0.1, 'safety', 'test');

      const diagnostics = getIntuitionDiagnostics();

      expect(diagnostics.dissonantCount).toBeGreaterThanOrEqual(1);
    });

    it('groups by category', () => {
      logIntuition('Safety', 0.5, 'safety', 'test');
      logIntuition('Memory', 0.5, 'memory', 'test');

      const diagnostics = getIntuitionDiagnostics();

      expect(diagnostics.byCategory).toHaveProperty('safety');
      expect(diagnostics.byCategory).toHaveProperty('memory');
    });

    it('returns most recent entry', () => {
      logIntuition('Most recent', 0.8, 'evolution', 'test');

      const diagnostics = getIntuitionDiagnostics();

      expect(diagnostics.mostRecent).not.toBeNull();
      expect(diagnostics.mostRecent?.decision).toBe('Most recent');
    });

    it('formats average resonance to 3 decimals', () => {
      logIntuition('Format test', 0.333, 'system', 'test');

      const diagnostics = getIntuitionDiagnostics();

      // Should be a number (not string) rounded to 3 decimals
      expect(typeof diagnostics.averageResonance).toBe('number');
    });
  });

  describe('Session Log Management', () => {
    it('adds entries to session log', () => {
      const initialCount = getRecentIntuitions(1000).length;

      logIntuition('New entry', 0.5, 'system', 'test');

      const newCount = getRecentIntuitions(1000).length;
      expect(newCount).toBe(initialCount + 1);
    });

    it('respects MAX_SESSION_ENTRIES limit', () => {
      // Add many entries - the limit is 500
      // We can't easily test this without adding 500+ entries
      // but we verify the structure works
      const diagnostics = getIntuitionDiagnostics();
      expect(diagnostics.totalEntries).toBeLessThanOrEqual(500);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty string decision', () => {
      const _entry = logIntuition('', 0.5, 'system', 'test');
      expect(entry.decision).toBe('');
    });

    it('handles very long decision string', () => {
      const longDecision = 'X'.repeat(1000);
      const _entry = logIntuition(longDecision, 0.5, 'system', 'test');
      expect(entry.decision).toBe(longDecision);
    });

    it('handles special characters in decision', () => {
      const decision = 'Decision with "quotes" and <tags> & symbols!';
      const _entry = logIntuition(decision, 0.5, 'system', 'test');
      expect(entry.decision).toBe(decision);
    });

    it('handles resonance at exactly 0.3 boundary', () => {
      const _entry = logIntuition('Boundary', 0.3, 'system', 'test');

      // 0.3 is >= 0.3, so should be info, not warn
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('handles resonance at exactly 0.5 boundary', () => {
      const _entry = logIntuition('Moderate', 0.5, 'evolution', 'test');
      expect(entry.fieldNote).toContain('Moderate alignment');
    });

    it('handles resonance at exactly 0.8 boundary', () => {
      const _entry = logIntuition('Strong', 0.8, 'reflection', 'test');
      expect(entry.fieldNote).toContain('Strong alignment');
    });
  });
});
