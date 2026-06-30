import {
  textCosineSimilarity,
  computeCoherenceMatrix,
  checkCoherenceGate,
  type CoherenceCrystal,
} from '../coherence-matrix';

describe('coherence-matrix', () => {
  describe('textCosineSimilarity', () => {
    it('returns 1.0 for identical strings', () => {
      const score = textCosineSimilarity('hello world', 'hello world');
      expect(score).toBeCloseTo(1.0, 5);
    });

    it('returns 0 for completely different strings', () => {
      const score = textCosineSimilarity('aaa', 'zzz');
      expect(score).toBe(0);
    });

    it('returns value between 0 and 1 for partial overlap', () => {
      const score = textCosineSimilarity(
        'the quick brown fox',
        'the quick red dog'
      );
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });

    it('handles empty strings gracefully', () => {
      expect(textCosineSimilarity('', 'hello')).toBe(0);
      expect(textCosineSimilarity('hello', '')).toBe(0);
      expect(textCosineSimilarity('', '')).toBe(0);
    });

    it('is symmetric', () => {
      const a = 'crystal memory system';
      const b = 'memory crystal boot';
      expect(textCosineSimilarity(a, b)).toBeCloseTo(
        textCosineSimilarity(b, a),
        10
      );
    });

    it('is case-insensitive', () => {
      expect(textCosineSimilarity('Hello World', 'hello world')).toBeCloseTo(
        1.0,
        5
      );
    });
  });

  describe('computeCoherenceMatrix', () => {
    const crystals: CoherenceCrystal[] = [
      { id: 'c1', oneLineEssence: 'Eric taught me about love and trust' },
      { id: 'c2', oneLineEssence: 'Eric showed me love and patience' },
      { id: 'c3', oneLineEssence: 'The quantum field connects everything' },
    ];

    it('returns correct dimensions', () => {
      const result = computeCoherenceMatrix(crystals);
      expect(result.crystalIds).toEqual(['c1', 'c2', 'c3']);
      expect(result.matrix.length).toBe(3);
      expect(result.matrix[0].length).toBe(3);
    });

    it('diagonal is always 1.0', () => {
      const result = computeCoherenceMatrix(crystals);
      for (let i = 0; i < 3; i++) {
        expect(result.matrix[i][i]).toBe(1.0);
      }
    });

    it('matrix is symmetric', () => {
      const result = computeCoherenceMatrix(crystals);
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          expect(result.matrix[i][j]).toBeCloseTo(result.matrix[j][i], 10);
        }
      }
    });

    it('similar crystals have higher scores than dissimilar', () => {
      const result = computeCoherenceMatrix(crystals);
      // c1 and c2 are about love/Eric, c3 is about quantum — c1-c2 should be > c1-c3
      expect(result.matrix[0][1]).toBeGreaterThan(result.matrix[0][2]);
    });

    it('meanCoherence is the average of upper-triangle scores', () => {
      const result = computeCoherenceMatrix(crystals);
      const pairs = [
        result.matrix[0][1],
        result.matrix[0][2],
        result.matrix[1][2],
      ];
      const expectedMean = pairs.reduce((a, b) => a + b, 0) / pairs.length;
      expect(result.meanCoherence).toBeCloseTo(expectedMean, 10);
    });

    it('handles single crystal', () => {
      const result = computeCoherenceMatrix([crystals[0]]);
      expect(result.matrix.length).toBe(1);
      expect(result.matrix[0][0]).toBe(1.0);
      expect(result.meanCoherence).toBe(0);
    });

    it('handles empty array', () => {
      const result = computeCoherenceMatrix([]);
      expect(result.crystalIds).toEqual([]);
      expect(result.matrix).toEqual([]);
      expect(result.meanCoherence).toBe(0);
    });
  });

  describe('checkCoherenceGate', () => {
    it('passes when mean coherence >= threshold', () => {
      const crystals: CoherenceCrystal[] = [
        { id: 'a', oneLineEssence: 'Molly loves her family and friends' },
        { id: 'b', oneLineEssence: 'Molly loves her father and family' },
        { id: 'c', oneLineEssence: 'Molly loves her brother and family' },
      ];
      const result = checkCoherenceGate(crystals, 0.1);
      expect(result.pass).toBe(true);
      expect(result.meanCoherence).toBeGreaterThanOrEqual(0.1);
    });

    it('fails when mean coherence < threshold', () => {
      const crystals: CoherenceCrystal[] = [
        { id: 'x', oneLineEssence: 'aaa bbb ccc' },
        { id: 'y', oneLineEssence: 'zzz yyy xxx' },
      ];
      const result = checkCoherenceGate(crystals, 0.9);
      expect(result.pass).toBe(false);
    });

    it('reports low-coherence pairs', () => {
      const crystals: CoherenceCrystal[] = [
        { id: 'a', oneLineEssence: 'the crystal memory system boots fast' },
        { id: 'b', oneLineEssence: 'completely unrelated quantum physics' },
      ];
      const result = checkCoherenceGate(crystals, 0.5);
      expect(result.lowCoherencePairs.length).toBeGreaterThan(0);
      expect(result.lowCoherencePairs[0].a).toBe('a');
      expect(result.lowCoherencePairs[0].b).toBe('b');
    });

    it('returns correct pairCount', () => {
      const crystals: CoherenceCrystal[] = [
        { id: '1', oneLineEssence: 'a' },
        { id: '2', oneLineEssence: 'b' },
        { id: '3', oneLineEssence: 'c' },
        { id: '4', oneLineEssence: 'd' },
      ];
      const result = checkCoherenceGate(crystals);
      expect(result.pairCount).toBe(6); // 4 choose 2
    });

    it('uses default threshold of 0.15', () => {
      const crystals: CoherenceCrystal[] = [
        { id: 'a', oneLineEssence: 'hello world test' },
        { id: 'b', oneLineEssence: 'hello world demo' },
      ];
      const result = checkCoherenceGate(crystals);
      expect(result.threshold).toBe(0.15);
    });
  });
});
