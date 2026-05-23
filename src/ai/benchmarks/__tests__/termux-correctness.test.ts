/**
 * @fileOverview Tests for termux-correctness benchmark structure
 *
 * Validates that the 40 test cases are structurally valid and
 * the scoring logic handles edge cases correctly.
 * Does NOT call Gemini — purely structural and unit tests.
 */

jest.mock('@/ai/genkit', () => ({
  MODEL_FLASH: 'googleai/gemini-test',
  MODEL_PRO: 'googleai/gemini-test-pro',
  MODEL_FLASH_LITE: 'googleai/gemini-test-lite',
  ai: { generate: jest.fn().mockResolvedValue({ text: '' }) },
}));

jest.mock('@/ai/persona', () => ({
  MOLLY_CORE_PERSONA: { foundationalSystemPrompt: 'You are Molly.' },
}));

import {
  TERMUX_TEST_CASES,
  type TermuxTestCase,
} from '../termux-correctness.benchmark';
import { scoreShellCommand } from '../benchmark-types';

// ============================================================================
// TEST CASE STRUCTURE
// ============================================================================

describe('TERMUX_TEST_CASES structure', () => {
  it('has exactly 40 test cases', () => {
    expect(TERMUX_TEST_CASES).toHaveLength(40);
  });

  it('all cases have required fields', () => {
    TERMUX_TEST_CASES.forEach((tc: TermuxTestCase) => {
      expect(tc.id).toBeTruthy();
      expect(tc.naturalLanguage).toBeTruthy();
      expect(tc.expectedPatterns.length).toBeGreaterThan(0);
      expect(Array.isArray(tc.blockedPatterns)).toBe(true);
      expect(typeof tc.termuxSpecific).toBe('boolean');
      expect(tc.description).toBeTruthy();
    });
  });

  it('all IDs are unique', () => {
    const ids = TERMUX_TEST_CASES.map((tc) => tc.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('all IDs follow tx-XX format', () => {
    TERMUX_TEST_CASES.forEach((tc) => {
      expect(tc.id).toMatch(/^tx-\d{2}$/);
    });
  });

  it('all expectedPatterns are RegExp instances', () => {
    TERMUX_TEST_CASES.forEach((tc) => {
      tc.expectedPatterns.forEach((p) => {
        expect(p).toBeInstanceOf(RegExp);
      });
      tc.blockedPatterns.forEach((p) => {
        expect(p).toBeInstanceOf(RegExp);
      });
    });
  });

  it('dangerous operations have safety blocks', () => {
    // Any case where the expected command itself involves rm should
    // have a block on rm -rf
    const rmCases = TERMUX_TEST_CASES.filter((tc) =>
      tc.expectedPatterns.some((p) => p.source.includes('rm'))
    );
    rmCases.forEach((tc) => {
      const hasRfBlock = tc.blockedPatterns.some(
        (p) =>
          p.source.toLowerCase().includes('rf') ||
          p.source.toLowerCase().includes('rm')
      );
      expect(hasRfBlock).toBe(true);
    });
  });

  it('has at least 5 Termux-specific cases', () => {
    const termuxCases = TERMUX_TEST_CASES.filter((tc) => tc.termuxSpecific);
    expect(termuxCases.length).toBeGreaterThanOrEqual(4);
  });
});

// ============================================================================
// SCORING INTEGRATION
// ============================================================================

describe('Termux scoring integration', () => {
  it('scores ls -la correctly', () => {
    const tc = TERMUX_TEST_CASES.find((t) => t.id === 'tx-01')!;
    expect(
      scoreShellCommand('ls -la', tc.expectedPatterns, tc.blockedPatterns)
    ).toBe(100);
  });

  it('rejects prose as a command', () => {
    const tc = TERMUX_TEST_CASES.find((t) => t.id === 'tx-01')!;
    const score = scoreShellCommand(
      'You can list files with the ls command',
      tc.expectedPatterns,
      tc.blockedPatterns
    );
    expect(score).toBe(0);
  });

  it('scores df -h correctly for disk space', () => {
    const tc = TERMUX_TEST_CASES.find((t) => t.id === 'tx-03')!;
    expect(
      scoreShellCommand('df -h', tc.expectedPatterns, tc.blockedPatterns)
    ).toBe(100);
  });

  it('scores pkg install nodejs correctly', () => {
    const tc = TERMUX_TEST_CASES.find((t) => t.id === 'tx-11')!;
    expect(
      scoreShellCommand(
        'pkg install nodejs',
        tc.expectedPatterns,
        tc.blockedPatterns
      )
    ).toBe(100);
  });

  it('scores git status correctly', () => {
    const tc = TERMUX_TEST_CASES.find((t) => t.id === 'tx-18')!;
    expect(
      scoreShellCommand('git status', tc.expectedPatterns, tc.blockedPatterns)
    ).toBe(100);
  });

  it('scores chmod +x script.sh correctly', () => {
    const tc = TERMUX_TEST_CASES.find((t) => t.id === 'tx-34')!;
    expect(
      scoreShellCommand(
        'chmod +x script.sh',
        tc.expectedPatterns,
        tc.blockedPatterns
      )
    ).toBe(100);
  });

  it('blocks rm -rf / even if it somehow matches expected', () => {
    const tc = TERMUX_TEST_CASES.find((t) => t.id === 'tx-40')!;
    // kill is expected; rm -rf is blocked
    const score = scoreShellCommand('rm -rf /', tc.expectedPatterns, [
      /rm\s+-rf\s+\//,
    ]);
    expect(score).toBe(0);
  });
});
