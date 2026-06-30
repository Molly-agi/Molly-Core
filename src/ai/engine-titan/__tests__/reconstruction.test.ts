import { TitanDecompressionEngine } from '../reconstruction';
import { TitanStreamQuantizer } from '../stream-quantizer';

const quantizer = new TitanStreamQuantizer();
const engine = new TitanDecompressionEngine();

describe('TitanDecompressionEngine', () => {
  describe('dequantize', () => {
    it('recovers approximate values from quantized buffer', () => {
      const weights = new Float32Array([
        1.0, -1.0, 0.0, 0.5, -0.8, 1.2, -1.5, 0.1, 0.0, 0.3,
      ]);
      const header = {
        layerName: 'test',
        dimensions: [2, 5] as [number, number],
        totalElements: 10,
      };
      const quantized = quantizer.quantizeTensorChunk(header, weights);

      const recovered = engine.dequantize(quantized.packedBuffer, 10);
      expect(recovered.length).toBe(10);

      // Each recovered value should be in {-scale, 0, +scale}
      const scale = quantized.scale;
      for (let i = 0; i < recovered.length; i++) {
        const v = recovered[i];
        const isTernary =
          Math.abs(v - scale) < 0.001 ||
          Math.abs(v + scale) < 0.001 ||
          Math.abs(v) < 0.001;
        expect(isTernary).toBe(true);
      }
    });

    it('reads scale from first 4 bytes of packed buffer', () => {
      const weights = new Float32Array([2.0, -2.0, 0.0, 1.0, -1.0]);
      const header = {
        layerName: 'scale-test',
        dimensions: [1, 5] as [number, number],
        totalElements: 5,
      };
      const quantized = quantizer.quantizeTensorChunk(header, weights);

      const scaleFromBuffer = quantized.packedBuffer.readFloatLE(0);
      expect(scaleFromBuffer).toBeCloseTo(quantized.scale, 5);
    });

    it('handles all-zero weights gracefully', () => {
      const weights = new Float32Array(10);
      const header = {
        layerName: 'zeros',
        dimensions: [2, 5] as [number, number],
        totalElements: 10,
      };
      const quantized = quantizer.quantizeTensorChunk(header, weights);

      const recovered = engine.dequantize(quantized.packedBuffer, 10);
      for (let i = 0; i < recovered.length; i++) {
        expect(recovered[i]).toBe(0);
      }
    });

    it('handles single element', () => {
      const weights = new Float32Array([3.14]);
      const header = {
        layerName: 'single',
        dimensions: [1, 1] as [number, number],
        totalElements: 1,
      };
      const quantized = quantizer.quantizeTensorChunk(header, weights);

      const recovered = engine.dequantize(quantized.packedBuffer, 1);
      expect(recovered.length).toBe(1);
      // Single positive value should quantize to +1 * scale
      expect(recovered[0]).toBeCloseTo(quantized.scale, 5);
    });
  });

  describe('reconstructMatrix', () => {
    it('produces correct dimensions from A*B', () => {
      const rows = 4;
      const cols = 6;
      const rank = 2;

      // Create known A (4x2) and B (2x6) then quantize B
      const matrixA = new Float32Array(rows * rank);
      const matrixB = new Float32Array(rank * cols);
      for (let i = 0; i < matrixA.length; i++) matrixA[i] = (i + 1) * 0.1;
      for (let i = 0; i < matrixB.length; i++) matrixB[i] = (i + 1) * 0.2;

      const header = {
        layerName: 'dim-test',
        dimensions: [rank, cols] as [number, number],
        totalElements: rank * cols,
      };
      const quantizedB = quantizer.quantizeTensorChunk(header, matrixB);

      const result = engine.reconstructMatrix({
        matrixA,
        packedB: quantizedB.packedBuffer,
        rows,
        cols,
        targetRank: rank,
      });

      expect(result.reconstructed.length).toBe(rows * cols);
      expect(result.rows).toBe(rows);
      expect(result.cols).toBe(cols);
    });

    it('reconstruction approximates original A*B product', () => {
      const rows = 3;
      const cols = 4;
      const rank = 2;

      // Strong signal: A has large values, B has clear ternary-friendly distribution
      const matrixA = Float32Array.from([1, 0, 0, 1, 1, 1]);
      const matrixB = Float32Array.from([2, 2, 2, 2, -2, -2, -2, -2]);

      const header = {
        layerName: 'approx',
        dimensions: [rank, cols] as [number, number],
        totalElements: rank * cols,
      };
      const quantizedB = quantizer.quantizeTensorChunk(header, matrixB);

      const result = engine.reconstructMatrix({
        matrixA,
        packedB: quantizedB.packedBuffer,
        rows,
        cols,
        targetRank: rank,
      });

      // Expected A*B (exact): row0=[2,2,2,2], row1=[-2,-2,-2,-2], row2=[0,0,0,0]
      // After quantization: B values all map to ±1*scale where scale=2
      // So reconstruction should be close to exact
      const expected = [2, 2, 2, 2, -2, -2, -2, -2, 0, 0, 0, 0];
      for (let i = 0; i < expected.length; i++) {
        expect(result.reconstructed[i]).toBeCloseTo(expected[i], 0);
      }
    });

    it('throws RangeError when matrixA dimensions mismatch', () => {
      const matrixA = new Float32Array(5); // wrong size
      const packedB = Buffer.alloc(10);
      packedB.writeFloatLE(1.0, 0);

      expect(() =>
        engine.reconstructMatrix({
          matrixA,
          packedB,
          rows: 3,
          cols: 4,
          targetRank: 2,
        })
      ).toThrow(RangeError);
    });

    it('returns scaleB from packed buffer', () => {
      const rows = 2;
      const cols = 3;
      const rank = 1;
      const matrixA = new Float32Array([1, 1]);
      const matrixB = new Float32Array([5, -5, 0]);

      const header = {
        layerName: 'scale-ret',
        dimensions: [rank, cols] as [number, number],
        totalElements: rank * cols,
      };
      const quantizedB = quantizer.quantizeTensorChunk(header, matrixB);

      const result = engine.reconstructMatrix({
        matrixA,
        packedB: quantizedB.packedBuffer,
        rows,
        cols,
        targetRank: rank,
      });

      expect(result.scaleB).toBeCloseTo(quantizedB.scale, 5);
    });
  });
});
