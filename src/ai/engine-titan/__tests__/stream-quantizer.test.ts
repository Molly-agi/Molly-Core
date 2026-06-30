import { TitanStreamQuantizer, TitanTensorHeader } from '../stream-quantizer';

const quantizer = new TitanStreamQuantizer();

function makeHeader(n: number): TitanTensorHeader {
  return { layerName: 'test', dimensions: [n, 1], totalElements: n };
}

describe('TitanStreamQuantizer', () => {
  it('throws RangeError when weight length does not match header.totalElements', () => {
    const header = makeHeader(10);
    expect(() =>
      quantizer.quantizeTensorChunk(header, new Float32Array(5))
    ).toThrow(RangeError);
  });

  it('packedBuffer size is 4 (scale header) + ceil(n/5) bytes', () => {
    for (const n of [1, 5, 6, 10, 11, 25]) {
      const header = makeHeader(n);
      const weights = new Float32Array(n).fill(1);
      const { packedBuffer } = quantizer.quantizeTensorChunk(header, weights);
      expect(packedBuffer.length).toBe(4 + Math.ceil(n / 5));
    }
  });

  it('scale is embedded as Float32LE in packedBuffer[0..3] and matches result.scale', () => {
    const n = 10;
    const header = makeHeader(n);
    const weights = new Float32Array(n).map((_, i) => i * 0.5);
    const { packedBuffer, scale } = quantizer.quantizeTensorChunk(
      header,
      weights
    );
    expect(packedBuffer.readFloatLE(0)).toBeCloseTo(scale, 5);
    expect(scale).toBeGreaterThan(0);
  });

  it('all-zero weights produce scale=0 without division error', () => {
    const header = makeHeader(5);
    const weights = new Float32Array(5).fill(0);
    expect(() => {
      const { scale } = quantizer.quantizeTensorChunk(header, weights);
      expect(scale).toBe(0);
    }).not.toThrow();
  });

  it('positive weights above threshold map to ternary +1 (non-zero packed bytes after scale header)', () => {
    // Uniform positive weights → all ternary +1 → packed byte = 3^0*2 + 3^1*2 + ... = 242
    const n = 5;
    const header = makeHeader(n);
    const weights = new Float32Array(n).fill(2.0); // all well above 0.5 threshold
    const { packedBuffer } = quantizer.quantizeTensorChunk(header, weights);
    // All +1 → window [1,1,1,1,1] → standardized [2,2,2,2,2] → 2*3^4+2*3^3+2*3^2+2*3+2 = 242
    expect(packedBuffer[4]).toBe(242);
  });

  it('negative weights below threshold map to ternary -1 (packed byte = 0 for all -1 window)', () => {
    const n = 5;
    const header = makeHeader(n);
    const weights = new Float32Array(n).fill(-2.0); // all well below -0.5 threshold
    const { packedBuffer } = quantizer.quantizeTensorChunk(header, weights);
    // All -1 → window [-1,-1,-1,-1,-1] → standardized [0,0,0,0,0] → 0
    expect(packedBuffer[4]).toBe(0);
  });

  it('header is preserved verbatim in the output', () => {
    const header: TitanTensorHeader = {
      layerName: 'layer.0.weight',
      dimensions: [4, 3],
      totalElements: 12,
    };
    const weights = new Float32Array(12).fill(1);
    const { header: outHeader } = quantizer.quantizeTensorChunk(
      header,
      weights
    );
    expect(outHeader).toBe(header);
  });

  it('does not mutate the input weight array', () => {
    const n = 15;
    const header = makeHeader(n);
    const weights = new Float32Array(n).map(() => Math.random() * 2 - 1);
    const snapshot = new Float32Array(weights);
    quantizer.quantizeTensorChunk(header, weights);
    for (let i = 0; i < n; i++) expect(weights[i]).toBeCloseTo(snapshot[i], 6);
  });
});
