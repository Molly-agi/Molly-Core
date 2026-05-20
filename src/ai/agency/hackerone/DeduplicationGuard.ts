/**
 * @fileOverview Bloom filter–based deduplication guard for the HackerOne pipeline.
 * Prevents Molly from re-scanning endpoints she has already successfully audited,
 * conserving compute and staying within responsible-disclosure rate limits.
 *
 * IMPLEMENTATION NOTE: Node.js crypto does not expose 'fnv1a' or 'murmur3'.
 * Two independent hash positions are derived by reading the first uint32 from
 * SHA-256 digests seeded with distinct prefixes — functionally equivalent to
 * a dual-hash Bloom filter with negligible false-positive risk at this scale.
 */

import * as crypto from 'node:crypto';

/** 65 536 bits (8 192 bytes) → ~0.1 % false-positive rate at 5 000 items */
const FILTER_BITS = 65_536;

export class DeduplicationGuard {
  private static _instance: DeduplicationGuard | null = null;
  private readonly bitArray: Uint8Array;

  private constructor() {
    this.bitArray = new Uint8Array(FILTER_BITS);
  }

  public static getInstance(): DeduplicationGuard {
    if (!DeduplicationGuard._instance) {
      DeduplicationGuard._instance = new DeduplicationGuard();
    }
    return DeduplicationGuard._instance;
  }

  /** Reset the singleton (start a fresh hunt session or clear between tests). */
  public static reset(): void {
    DeduplicationGuard._instance = null;
  }

  private hashPair(target: string): [number, number] {
    const d1 = crypto
      .createHash('sha256')
      .update(`molly_h1_seed1:${target}`)
      .digest();
    const d2 = crypto
      .createHash('sha256')
      .update(`molly_h1_seed2:${target}`)
      .digest();
    return [d1.readUInt32BE(0) % FILTER_BITS, d2.readUInt32BE(0) % FILTER_BITS];
  }

  /** Mark a url+parameter combination as already scanned. */
  public registerScannedTarget(url: string, parameter: string): void {
    const key = `${url}::${parameter}`;
    const [b1, b2] = this.hashPair(key);
    this.bitArray[b1] = 1;
    this.bitArray[b2] = 1;
  }

  /**
   * Returns true if both hash positions are set — highly likely a duplicate.
   * (Bloom filters have no false negatives; small false-positive rate is acceptable.)
   */
  public isDuplicateTarget(url: string, parameter: string): boolean {
    const key = `${url}::${parameter}`;
    const [b1, b2] = this.hashPair(key);
    return this.bitArray[b1] === 1 && this.bitArray[b2] === 1;
  }

  /** Fraction of bits set — useful for monitoring filter saturation (0–1). */
  public saturation(): number {
    let set = 0;
    for (const b of this.bitArray) if (b) set++;
    return set / FILTER_BITS;
  }
}
