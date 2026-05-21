/**
 * Vocabulary Dictionary Compression — Technique 4
 * Replaces common words with 2-byte integer tokens for massive text footprint savings.
 * Builds the dictionary from Molly's actual conversation corpus.
 * 
 * Eric's original design. Adapted for NeuralEngramSystem integration.
 */

export interface DictionaryManifest {
  version: number;
  tokens: string[];
  createdAt: number;
}

export class VocabDictCompressor {
  private tokenToId = new Map<string, number>();
  private idToToken = new Map<number, string>();
  private version: number;

  // Reserved boundary marker for unknown words that need inline storage
  private static readonly ESCAPE_MARKER = 0xffff;

  constructor(manifest: DictionaryManifest) {
    this.version = manifest.version;
    manifest.tokens.forEach((token, index) => {
      this.tokenToId.set(token, index);
      this.idToToken.set(index, token);
    });
  }

  /**
   * Compress a string by breaking it into words and replacing known tokens.
   * Unknown words are escaped and stored as raw UTF-8 bytes.
   */
  public compressString(input: string): Buffer {
    const words = input
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 0);

    return this.compressWords(words);
  }

  /**
   * Compress an array of words into a bit-packed Uint16 buffer.
   * Known words become token IDs. Unknown words are escaped with length prefix.
   */
  public compressWords(words: string[]): Buffer {
    const output: number[] = [];

    for (const word of words) {
      const cleaned = word.trim();
      if (this.tokenToId.has(cleaned)) {
        const tokenId = this.tokenToId.get(cleaned);
        if (tokenId !== undefined) {
          output.push(tokenId);
        }
      } else {
        // Escape marker + length + raw bytes
        output.push(VocabDictCompressor.ESCAPE_MARKER);
        const rawBuffer = Buffer.from(cleaned, 'utf8');
        output.push(rawBuffer.length);

        // Convert each byte to Uint16 for consistent array handling
        for (const byte of rawBuffer) {
          output.push(byte);
        }
      }
    }

    const uint16Array = new Uint16Array(output);
    return Buffer.from(uint16Array.buffer);
  }

  /**
   * Decompress a bit-packed buffer back into the original text.
   */
  public decompressWords(buffer: Buffer): string[] {
    const uint16Array = new Uint16Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength / 2
    );

    const result: string[] = [];
    let i = 0;

    while (i < uint16Array.length) {
      const token = uint16Array[i];

      if (token === VocabDictCompressor.ESCAPE_MARKER) {
        // Read length and reconstruct raw bytes
        const length = uint16Array[i + 1];
        const rawBytes = new Uint8Array(length);

        for (let b = 0; b < length; b++) {
          rawBytes[b] = uint16Array[i + 2 + b];
        }

        result.push(Buffer.from(rawBytes.buffer).toString('utf8'));
        i += 2 + length;
      } else {
        // Known token
        const word = this.idToToken.get(token);
        if (word !== undefined) {
          result.push(word);
        }
        i++;
      }
    }

    return result;
  }

  /**
   * Decompress back to a space-separated string.
   */
  public decompressString(buffer: Buffer): string {
    return this.decompressWords(buffer).join(' ');
  }

  /**
   * Calculate estimated compression ratio for a given input.
   * Ratio = (original bytes - compressed bytes) / original bytes * 100
   */
  public estimateCompressionRatio(input: string): number {
    const original = Buffer.byteLength(input, 'utf8');
    const compressed = this.compressString(input).byteLength;
    return ((original - compressed) / original) * 100;
  }

  /**
   * Get compression statistics for current dictionary.
   */
  public getStats() {
    return {
      version: this.version,
      dictionarySize: this.tokenToId.size,
      tokenCount: this.idToToken.size,
    };
  }
}

/**
 * Build a vocabulary dictionary from a corpus of text.
 * Analyzes word frequency and creates a manifest ranked by frequency.
 */
export function buildDictionaryFromCorpus(
  corpusText: string,
  maxTokens: number = 65000
): DictionaryManifest {
  const wordFreq = new Map<string, number>();

  // Tokenize and count
  const words = corpusText
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 0);

  for (const word of words) {
    wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
  }

  // Sort by frequency, descending
  const sorted = Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTokens - 1) // Reserve slot 0xFFFF for escape marker
    .map(([word]) => word);

  return {
    version: 1,
    tokens: sorted,
    createdAt: Date.now(),
  };
}
