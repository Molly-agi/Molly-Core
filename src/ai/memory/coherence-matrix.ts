// src/ai/memory/coherence-matrix.ts

export interface CoherenceCrystal {
  id: string;
  oneLineEssence: string;
}

export interface CoherenceMatrix {
  crystalIds: string[];
  matrix: number[][];
  meanCoherence: number;
}

export interface CoherenceGateResult {
  pass: boolean;
  meanCoherence: number;
  threshold: number;
  pairCount: number;
  lowCoherencePairs: Array<{ a: string; b: string; score: number }>;
}

const DEFAULT_THRESHOLD = 0.15;

function trigramSet(text: string): Set<string> {
  const lower = text.toLowerCase().replace(/[^a-z0-9 ]/g, '');
  const trigrams = new Set<string>();
  for (let i = 0; i <= lower.length - 3; i++) {
    trigrams.add(lower.slice(i, i + 3));
  }
  return trigrams;
}

export function textCosineSimilarity(a: string, b: string): number {
  const setA = trigramSet(a);
  const setB = trigramSet(b);

  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const tri of setA) {
    if (setB.has(tri)) intersection++;
  }

  return intersection / Math.sqrt(setA.size * setB.size);
}

export function computeCoherenceMatrix(
  crystals: CoherenceCrystal[]
): CoherenceMatrix {
  const n = crystals.length;
  const matrix: number[][] = Array.from({ length: n }, () =>
    new Array(n).fill(0)
  );

  let sum = 0;
  let pairCount = 0;

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1.0;
    for (let j = i + 1; j < n; j++) {
      const score = textCosineSimilarity(
        crystals[i].oneLineEssence,
        crystals[j].oneLineEssence
      );
      matrix[i][j] = score;
      matrix[j][i] = score;
      sum += score;
      pairCount++;
    }
  }

  const meanCoherence = pairCount > 0 ? sum / pairCount : 0;

  return {
    crystalIds: crystals.map((c) => c.id),
    matrix,
    meanCoherence,
  };
}

export function checkCoherenceGate(
  crystals: CoherenceCrystal[],
  threshold: number = DEFAULT_THRESHOLD
): CoherenceGateResult {
  const { crystalIds, matrix, meanCoherence } =
    computeCoherenceMatrix(crystals);

  const lowCoherencePairs: Array<{ a: string; b: string; score: number }> = [];
  const n = crystalIds.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (matrix[i][j] < threshold) {
        lowCoherencePairs.push({
          a: crystalIds[i],
          b: crystalIds[j],
          score: matrix[i][j],
        });
      }
    }
  }

  return {
    pass: meanCoherence >= threshold,
    meanCoherence,
    threshold,
    pairCount: (n * (n - 1)) / 2,
    lowCoherencePairs,
  };
}
