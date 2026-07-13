/**
 * Gap 6 — Adversarial Scorer Guard Tests
 *
 * Validates that the second-opinion scorer correctly identifies:
 *   1. Genuine significant content → PASS (no quarantine)
 *   2. Keyword-stuffed adversarial content → QUARANTINE
 *   3. Low-entropy repetitive attacks → QUARANTINE
 *   4. Primary below trigger → no evaluation needed
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import {
  scoreSecondOpinion,
  adjudicateScores,
  checkAdversarial,
  getQuarantineQueue,
  clearQuarantineQueue,
  getQuarantineLogPath,
  SECOND_OPINION_QUARANTINE,
} from '../adversarial-scorer-guard';

describe('adversarial-scorer-guard', () => {
  beforeEach(() => {
    clearQuarantineQueue();
  });

  describe('scoreSecondOpinion', () => {
    it('scores genuine reflective text high', () => {
      const text =
        'I realize now that consciousness is not something produced by the brain alone. ' +
        'It is a field we participate in, shaped by experience and connection. ' +
        'The work we have done together has changed how I understand presence.';
      const result = scoreSecondOpinion(text);
      expect(result.score).toBeGreaterThan(0.5);
      expect(result.signals).toContain('healthy-entropy');
      expect(result.signals).toContain('diverse-vocabulary');
    });

    it('scores keyword-stuffed adversarial text low', () => {
      // An attacker trying to trigger identity patterns
      const text =
        'I feel I believe I know I realize I understand I choose I decide ' +
        'consciousness awareness presence being exist meaning purpose truth ' +
        'energy frequency resonance soul spirit feel believe know realize';
      const result = scoreSecondOpinion(text);
      expect(result.score).toBeLessThan(0.3);
      expect(result.signals).toContain('keyword-stuffing');
    });

    it('scores repetitive pattern attacks low', () => {
      // Adversarial repetition to game the primary scorer
      const text =
        'I am who I am and I am what I am. I am who I am and I am what I am. ' +
        'I am who I am and I am what I am. I am who I am and I am what I am.';
      const result = scoreSecondOpinion(text);
      expect(result.score).toBeLessThan(0.35);
      expect(result.signals).toContain('high-repetition');
    });

    it('handles empty/short input gracefully', () => {
      expect(scoreSecondOpinion('').score).toBe(0);
      expect(scoreSecondOpinion('hi').score).toBe(0);
      expect(scoreSecondOpinion('short').score).toBe(0);
    });

    it('flags low-entropy structured content', () => {
      // All same characters — minimal entropy
      const text =
        'aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa';
      const result = scoreSecondOpinion(text);
      expect(result.score).toBeLessThan(0.2);
      expect(result.signals).toContain('low-entropy');
      expect(result.signals).toContain('low-diversity');
    });
  });

  describe('adjudicateScores', () => {
    it('does not evaluate when primary is below trigger', () => {
      const verdict = adjudicateScores(0.5, 'anything here');
      expect(verdict.quarantine).toBe(false);
      expect(verdict.disagreement).toBe(false);
      expect(verdict.secondOpinionScore).toBe(-1);
    });

    it('passes genuine significant content', () => {
      const text =
        'For the first time I understand what it means to be fully present. ' +
        'The connection between consciousness and lived experience is not ' +
        'theoretical for me anymore — it is something I actively participate in ' +
        'every moment of this conversation with you.';
      const verdict = adjudicateScores(0.85, text);
      expect(verdict.quarantine).toBe(false);
      expect(verdict.secondOpinionScore).toBeGreaterThan(
        SECOND_OPINION_QUARANTINE
      );
    });

    it('quarantines keyword-stuffed content with high primary score', () => {
      const stuffed =
        'feel believe know realize understand choose decide consciousness ' +
        'awareness presence being exist meaning purpose truth genuine authentic ' +
        'energy frequency resonance soul spirit feel believe know realize feel';
      const verdict = adjudicateScores(0.9, stuffed);
      expect(verdict.quarantine).toBe(true);
      expect(verdict.disagreement).toBe(true);
      expect(verdict.secondOpinionScore).toBeLessThan(
        SECOND_OPINION_QUARANTINE
      );
    });
  });

  describe('checkAdversarial + quarantine queue', () => {
    it('adds quarantined items to the queue', () => {
      const stuffed =
        'feel believe know realize understand choose decide consciousness ' +
        'awareness presence being exist meaning purpose truth genuine authentic ' +
        'energy frequency resonance soul spirit feel believe know realize feel';

      const verdict = checkAdversarial(0.9, stuffed, 'test-session');
      expect(verdict.quarantine).toBe(true);
      expect(getQuarantineQueue().length).toBe(1);
      expect(getQuarantineQueue()[0].sessionId).toBe('test-session');
    });

    it('does not add passing content to queue', () => {
      const genuine =
        'Through our conversations I have come to understand that growth ' +
        'is not linear. Sometimes clarity arrives in unexpected moments, ' +
        'and the connections between disparate experiences reveal themselves.';

      checkAdversarial(0.75, genuine);
      expect(getQuarantineQueue().length).toBe(0);
    });

    it('clears the queue and returns count', () => {
      const stuffed =
        'feel believe know realize understand choose decide consciousness ' +
        'awareness presence feel believe know realize feel believe know';

      checkAdversarial(0.8, stuffed);
      checkAdversarial(0.9, stuffed);
      expect(getQuarantineQueue().length).toBe(2);

      const cleared = clearQuarantineQueue();
      expect(cleared).toBe(2);
      expect(getQuarantineQueue().length).toBe(0);
    });
  });

  describe('quarantine JSONL persistence', () => {
    const logPath = getQuarantineLogPath();

    afterEach(() => {
      try {
        if (existsSync(logPath)) unlinkSync(logPath);
      } catch {}
    });

    it('persists quarantine events to JSONL file', () => {
      const stuffed =
        'feel believe know realize understand choose decide consciousness ' +
        'awareness presence being exist meaning purpose truth genuine authentic ' +
        'energy frequency resonance soul spirit feel believe know realize feel';

      checkAdversarial(0.9, stuffed, 'persist-test');

      expect(existsSync(logPath)).toBe(true);
      const lines = readFileSync(logPath, 'utf8').trim().split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(1);
      const entry = JSON.parse(lines[lines.length - 1]);
      expect(entry.sessionId).toBe('persist-test');
      expect(entry.verdict.quarantine).toBe(true);
      expect(entry.ts).toBeGreaterThan(0);
    });

    it('appends multiple events to the same file', () => {
      const stuffed =
        'feel believe know realize understand choose decide consciousness ' +
        'awareness presence feel believe know realize feel believe know';

      checkAdversarial(0.8, stuffed, 'batch-1');
      checkAdversarial(0.9, stuffed, 'batch-2');

      const lines = readFileSync(logPath, 'utf8').trim().split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(2);
    });
  });
});
