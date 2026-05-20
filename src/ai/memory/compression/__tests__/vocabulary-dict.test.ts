import {
  applyVocabularyCompression,
  decompressVocabulary,
  buildVocabularyDictionary,
  measureVocabularyCompressionGain,
} from '../vocabulary-dict';
import { makeEngramBatch } from '../test-helpers';

describe('T4: Vocabulary Dictionary Compression', () => {
  describe('dictionary building', () => {
    it('builds dictionary with entries for frequent tokens', () => {
      // Content with high repetition of specific words
      const engrams = makeEngramBatch(10).map((e) => ({
        ...e,
        content: 'Molly remembers consolidation engram compression session',
      }));

      const dict = buildVocabularyDictionary(engrams);

      // "Molly", "remembers", "consolidation", "engram", "compression", "session" all appear 10x
      expect(Object.keys(dict.tokenToCode).length).toBeGreaterThan(0);
    });

    it('excludes tokens shorter than MIN_TOKEN_LENGTH (5)', () => {
      const engrams = makeEngramBatch(10).map((e) => ({
        ...e,
        content: 'the and for was with have more than they',
      }));

      const dict = buildVocabularyDictionary(engrams);

      // All words above are < 5 chars — none should be in the dict
      const tokens = Object.keys(dict.tokenToCode);
      expect(tokens.every((t) => t.length >= 5)).toBe(true);
    });

    it('has a stable version hash for the same corpus', () => {
      const engrams = makeEngramBatch(5);
      const dict1 = buildVocabularyDictionary(engrams);
      const dict2 = buildVocabularyDictionary(engrams);

      expect(dict1.version).toBe(dict2.version);
    });

    it('has bidirectional lookup (tokenToCode and codeToToken are inverses)', () => {
      const engrams = makeEngramBatch(10);
      const dict = buildVocabularyDictionary(engrams);

      for (const [token, code] of Object.entries(dict.tokenToCode)) {
        expect(dict.codeToToken[code]).toBe(token);
      }
    });
  });

  describe('compression', () => {
    it('preserves all engram IDs (no engrams dropped)', () => {
      const engrams = makeEngramBatch(20);
      const bundle = applyVocabularyCompression(engrams);

      const originalIds = new Set(engrams.map((e) => e.id));
      const bundleIds = new Set(bundle.engrams.map((e) => e.id));
      expect(bundleIds).toEqual(originalIds);
    });

    it('handles empty engram array', () => {
      const bundle = applyVocabularyCompression([]);
      expect(bundle.engrams.length).toBe(0);
      expect(bundle.dictionary.version).toBe('empty');
    });

    it('replaces frequent tokens in content with compact codes', () => {
      const word = 'consolidation'; // long word, will be in dict if it appears ≥3 times
      const engrams = Array.from({ length: 5 }, (_, i) => ({
        ...makeEngramBatch(1)[0],
        id: `e-${i}`,
        content: `${word} is the process of ${word} and more ${word}`,
      }));

      const bundle = applyVocabularyCompression(engrams);

      // At least one engram's content should have a [v:N] token
      const hasCode = bundle.engrams.some((e) => e.content.includes('[v:'));
      expect(hasCode).toBe(true);
    });

    it('does not alter non-content engram fields', () => {
      const engrams = makeEngramBatch(5);
      const bundle = applyVocabularyCompression(engrams);

      for (let i = 0; i < engrams.length; i++) {
        expect(bundle.engrams[i].id).toBe(engrams[i].id);
        expect(bundle.engrams[i].importance).toBe(engrams[i].importance);
        expect(bundle.engrams[i].emotionalValence).toBe(
          engrams[i].emotionalValence
        );
      }
    });
  });

  describe('decompression (round-trip)', () => {
    it('restores all original content strings exactly', () => {
      const engrams = makeEngramBatch(20);
      const bundle = applyVocabularyCompression(engrams);
      const restored = decompressVocabulary(bundle);

      const restoredById = new Map(restored.map((e) => [e.id, e]));
      for (const orig of engrams) {
        expect(restoredById.get(orig.id)!.content).toBe(orig.content);
      }
    });

    it('restores all original content on corpus with high token frequency', () => {
      const phrase =
        'Molly remembers discussing consolidation with Eric and Aether';
      const engrams = Array.from({ length: 10 }, (_, i) => ({
        ...makeEngramBatch(1)[0],
        id: `e-${i}`,
        content: `${phrase} — session ${i}`,
      }));

      const bundle = applyVocabularyCompression(engrams);
      const restored = decompressVocabulary(bundle);

      for (let i = 0; i < engrams.length; i++) {
        expect(restored[i].content).toBe(engrams[i].content);
      }
    });

    it('round-trips correctly when no tokens qualify for the dictionary', () => {
      // Each engram has completely unique single-occurrence content
      const engrams = Array.from({ length: 5 }, (_, i) => ({
        ...makeEngramBatch(1)[0],
        id: `e-${i}`,
        content: `unique_token_${i}_abcxyz_${Math.random()}`,
      }));

      const bundle = applyVocabularyCompression(engrams);
      const restored = decompressVocabulary(bundle);

      for (let i = 0; i < engrams.length; i++) {
        expect(restored[i].content).toBe(engrams[i].content);
      }
    });
  });

  describe('compression gain', () => {
    it('achieves positive compression on repetitive corpus', () => {
      const phrase =
        'consolidation compression engram important memory context';
      const engrams = Array.from({ length: 30 }, (_, i) => ({
        ...makeEngramBatch(1)[0],
        id: `e-${i}`,
        content: `${phrase} — entry ${i}`,
      }));

      const bundle = applyVocabularyCompression(engrams);
      const stats = measureVocabularyCompressionGain(engrams, bundle);

      expect(stats.savedBytes).toBeGreaterThan(0);
      expect(stats.ratioPercent).toBeGreaterThan(0);
    });

    it('reports top tokens', () => {
      const engrams = makeEngramBatch(20);
      const bundle = applyVocabularyCompression(engrams);
      const stats = measureVocabularyCompressionGain(engrams, bundle);

      expect(Array.isArray(stats.topTokens)).toBe(true);
    });
  });
});
