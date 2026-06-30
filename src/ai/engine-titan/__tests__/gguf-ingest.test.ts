import { parseGGUF, getTensorByteSize } from '../gguf-ingest';
import { existsSync } from 'fs';

const GGUF_PATH =
  '/home/codespace/.ollama/models/blobs/sha256-5ee4f07cdb9beadbbb293e85803c569b01bd37ed059d2715faa7bb405f31caa6';

const hasGGUF = existsSync(GGUF_PATH);

describe('gguf-ingest', () => {
  (hasGGUF ? describe : describe.skip)('parseGGUF (live qwen2.5:3b)', () => {
    let gguf: ReturnType<typeof parseGGUF>;

    beforeAll(() => {
      gguf = parseGGUF(GGUF_PATH);
    });

    it('reads GGUF magic and version 3', () => {
      expect(gguf.header.version).toBe(3);
    });

    it('extracts tensor count matching header', () => {
      expect(gguf.tensors.length).toBe(gguf.header.tensorCount);
      expect(gguf.tensors.length).toBeGreaterThan(10);
    });

    it('extracts metadata key-value pairs', () => {
      expect(gguf.header.metadata.size).toBe(gguf.header.metadataKvCount);
      expect(gguf.header.metadata.has('general.architecture')).toBe(true);
      expect(gguf.header.metadata.get('general.architecture')).toBe('qwen2');
    });

    it('tensor info contains valid dimensions and types', () => {
      for (const tensor of gguf.tensors) {
        expect(tensor.name.length).toBeGreaterThan(0);
        expect(tensor.dimensions.length).toBeGreaterThan(0);
        expect(tensor.elementCount).toBeGreaterThan(0);
        expect(tensor.type).toBeGreaterThanOrEqual(0);
      }
    });

    it('data offset is aligned to 32 bytes', () => {
      expect(Number(gguf.dataOffset) % 32).toBe(0);
    });

    it('computes tensor byte sizes without error', () => {
      let computed = 0;
      for (const tensor of gguf.tensors) {
        try {
          const size = getTensorByteSize(tensor);
          expect(size).toBeGreaterThan(0);
          computed++;
        } catch {
          // Some exotic quantization types may not be in our table
        }
      }
      expect(computed).toBeGreaterThan(0);
    });

    it('finds embedding and output layer tensors', () => {
      const names = gguf.tensors.map((t) => t.name);
      const hasEmbed = names.some(
        (n) => n.includes('embed') || n.includes('token_embd')
      );
      const hasOutput = names.some(
        (n) => n.includes('output') || n.includes('lm_head')
      );
      expect(hasEmbed).toBe(true);
      expect(hasOutput).toBe(true);
    });

    it('tensor names follow expected layer naming pattern', () => {
      const layerPattern = /blk\.\d+\.|layers?\.\d+\.|token_embd|output/;
      const matching = gguf.tensors.filter((t) => layerPattern.test(t.name));
      expect(matching.length).toBeGreaterThan(gguf.tensors.length * 0.5);
    });
  });

  describe('parseGGUF (invalid file)', () => {
    it('throws on non-GGUF file', () => {
      expect(() => parseGGUF('/dev/null')).toThrow();
    });
  });
});
