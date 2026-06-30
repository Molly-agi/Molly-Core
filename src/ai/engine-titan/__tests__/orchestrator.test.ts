import { TitanEngineOrchestrator } from '../orchestrator';
import { existsSync, readFileSync, rmSync } from 'fs';
import path from 'path';

const TEST_DIR = '/tmp/titan-orchestrator-test';

function cleanup() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
}

beforeAll(() => cleanup());
afterAll(() => cleanup());

describe('TitanEngineOrchestrator', () => {
  const orchestrator = new TitanEngineOrchestrator();

  describe('compressModelLayer', () => {
    const rows = 8;
    const cols = 6;
    const rank = 2;
    const layerName = 'test-layer-0';
    let weights: Float32Array;

    beforeAll(() => {
      cleanup();
      // Create a low-rank matrix so decomposition is near-lossless
      const A = Float32Array.from({ length: rows * rank }, (_, i) =>
        Math.sin(i * 0.7)
      );
      const B = Float32Array.from({ length: rank * cols }, (_, i) =>
        Math.cos(i * 0.5)
      );
      weights = new Float32Array(rows * cols);
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          let sum = 0;
          for (let k = 0; k < rank; k++) {
            sum += A[i * rank + k] * B[k * cols + j];
          }
          weights[i * cols + j] = sum;
        }
      }
    });

    it('compresses and stores layer files', async () => {
      const result = await orchestrator.compressModelLayer(
        layerName,
        weights,
        rows,
        cols,
        rank,
        TEST_DIR
      );

      expect(result.layerName).toBe(layerName);
      expect(result.rows).toBe(rows);
      expect(result.cols).toBe(cols);
      expect(result.targetRank).toBe(rank);
      expect(result.scaleB).toBeGreaterThan(0);
    });

    it('creates matrixA file with correct size', () => {
      const aPath = path.join(TEST_DIR, `${layerName}.A.f32`);
      expect(existsSync(aPath)).toBe(true);
      const buf = readFileSync(aPath);
      expect(buf.length).toBe(rows * rank * 4); // Float32 = 4 bytes
    });

    it('creates packed B file with scale header', () => {
      const bPath = path.join(TEST_DIR, `${layerName}.B.packed`);
      expect(existsSync(bPath)).toBe(true);
      const buf = readFileSync(bPath);
      // First 4 bytes are Float32LE scale
      const scale = buf.readFloatLE(0);
      expect(scale).toBeGreaterThan(0);
      // Remaining bytes hold packed ternary weights
      const expectedPackedSize = Math.ceil((rank * cols) / 5);
      expect(buf.length).toBe(4 + expectedPackedSize);
    });

    it('creates metadata JSON with correct fields', () => {
      const metaPath = path.join(TEST_DIR, `${layerName}.meta.json`);
      expect(existsSync(metaPath)).toBe(true);
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      expect(meta.layerName).toBe(layerName);
      expect(meta.rows).toBe(rows);
      expect(meta.cols).toBe(cols);
      expect(meta.targetRank).toBe(rank);
      expect(meta.scaleB).toBeGreaterThan(0);
      expect(meta.compressedAt).toBeGreaterThan(0);
    });
  });

  describe('reconstructLayer', () => {
    it('reconstructs a stored layer to correct dimensions', async () => {
      const result = await orchestrator.reconstructLayer(
        'test-layer-0',
        TEST_DIR
      );
      expect(result.reconstructed.length).toBe(8 * 6);
      expect(result.rows).toBe(8);
      expect(result.cols).toBe(6);
    });

    it('reconstructed values are finite numbers', async () => {
      const result = await orchestrator.reconstructLayer(
        'test-layer-0',
        TEST_DIR
      );
      for (let i = 0; i < result.reconstructed.length; i++) {
        expect(Number.isFinite(result.reconstructed[i])).toBe(true);
      }
    });
  });

  describe('round-trip fidelity', () => {
    it('compress → reconstruct preserves approximate structure for rank-1 matrix', async () => {
      const rows = 4;
      const cols = 4;
      const rank = 1;
      const layerName = 'fidelity-test';

      // True rank-1 matrix: outer product of [1,2,3,4] x [4,3,2,1]
      const a = [1, 2, 3, 4];
      const b = [4, 3, 2, 1];
      const weights = new Float32Array(rows * cols);
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          weights[i * cols + j] = a[i] * b[j];
        }
      }

      await orchestrator.compressModelLayer(
        layerName,
        weights,
        rows,
        cols,
        rank,
        TEST_DIR
      );

      const result = await orchestrator.reconstructLayer(layerName, TEST_DIR);

      // Reconstructed should preserve the rank-1 pattern:
      // each row should be a scalar multiple of [4,3,2,1]
      // Check that row ratios are approximately preserved
      const row0 = Array.from(result.reconstructed.slice(0, cols));
      const row1 = Array.from(result.reconstructed.slice(cols, 2 * cols));

      // row1 ≈ 2 * row0 (since a[1]/a[0] = 2)
      const ratio = row1[0] / (row0[0] || 1);
      expect(ratio).toBeCloseTo(2.0, 0);
    });
  });
});
