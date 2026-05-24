// src/ai/engine-echo/pipeline.ts
import { EchoCoreParser, EchoCompressedFrame } from "./core-parser";
import { VocabDictCompressor } from "../memory/compression/vocab-dict";

export interface EchoPackedBlock {
  readonly schemaManifestVersion: number;
  readonly compressedStructure: Buffer;
  readonly compressedNumerics: Buffer;
  readonly dictionaryPayload: {
    version: number;
    compressedStream: Buffer;
  };
}

export class EchoPipeline {
  private readonly parser: EchoCoreParser;
  private readonly vocabCompressor: VocabDictCompressor;

  constructor(parser: EchoCoreParser, vocabCompressor: VocabDictCompressor) {
    this.parser = parser;
    this.vocabCompressor = vocabCompressor;
  }

  /**
   * Compresses incoming data structures by isolating text, copying memory
   * defensively, and tracking data across byte boundaries.
   */
  public async compressPayload(
    rawJson: Record<string, any>
  ): Promise<EchoPackedBlock> {
    
    const frame: EchoCompressedFrame = this.parser.parseFrame(rawJson);

    // Structural bitmask buffer
    const structuralBuffer = Buffer.from(frame.keyBitmask.buffer);

    // Numeric primitives buffer
    const numericBuffer = Buffer.from(frame.numericalPrimitives.buffer);

    // Unified text compression using the vocabulary dictionary
    const unifiedText = frame.textPayloads.join(" ");
    const dictionaryCompressed = this.vocabCompressor.compressString(unifiedText);

    return {
      schemaManifestVersion: frame.schemaVersion,
      compressedStructure: structuralBuffer,
      compressedNumerics: numericBuffer,
      dictionaryPayload: {
        version: frame.schemaVersion,
        compressedStream: dictionaryCompressed
      }
    };
  }
}
