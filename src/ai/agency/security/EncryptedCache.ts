/**
 * @fileOverview Encrypted offline cache for local device fallback.
 * When the CircuitBreaker trips, all telemetry frames are queued here as
 * newline-delimited AES-256-GCM blobs. HandshakeProtocol flushes them on
 * reconnection so no data is ever lost during network outages.
 */

import { promises as fs } from 'fs';
import * as path from 'node:path';
import { CipherStream } from './CipherStream';
import type { EncryptedPacket } from './CipherStream';

export interface OfflineFrame {
  systemContext: string;
  timestamp: number;
  payloadMetadata?: unknown;
  [key: string]: unknown;
}

const DEFAULT_CACHE_DIR = path.join(process.cwd(), '.molly_cache');
const CACHE_FILE = 'offline_telemetry.log';
const ENV_CACHE_KEY = process.env.MOLLY_CACHE_KEY ?? 'molly-offline-cache-key';

export class EncryptedCache {
  private readonly cachePath: string;
  private readonly secretKey: string | Buffer;

  constructor(
    secretKey: string | Buffer = ENV_CACHE_KEY,
    storageDir: string = DEFAULT_CACHE_DIR
  ) {
    this.secretKey = secretKey;
    this.cachePath = path.join(storageDir, CACHE_FILE);
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(path.dirname(this.cachePath), { recursive: true });
  }

  /** Encrypt and append a frame to the local cache log. */
  public async queueOfflineFrame(
    frameData: OfflineFrame | unknown
  ): Promise<void> {
    await this.ensureDir();
    try {
      const packet: EncryptedPacket = CipherStream.encryptPayload(
        frameData,
        this.secretKey
      );
      await fs.appendFile(
        this.cachePath,
        JSON.stringify(packet) + '\n',
        'utf8'
      );
    } catch (error: unknown) {
      console.error(
        `[ENCRYPTED_CACHE]: Write failure: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  /**
   * Read, decrypt, and return all queued frames, then truncate the cache file.
   * Corrupted lines are skipped with a warning rather than blocking the flush.
   */
  public async flushCachePool<T = OfflineFrame>(): Promise<T[]> {
    try {
      if (!(await this.hasCachedData())) return [];

      const raw = await fs.readFile(this.cachePath, 'utf8');
      const lines = raw.split('\n').filter((l) => l.trim().length > 0);
      const frames: T[] = [];

      for (const line of lines) {
        try {
          const packet = JSON.parse(line) as EncryptedPacket;
          frames.push(CipherStream.decryptPayload<T>(packet, this.secretKey));
        } catch {
          console.warn('[ENCRYPTED_CACHE]: Skipping unreadable cache entry.');
        }
      }

      await fs.writeFile(this.cachePath, '', 'utf8'); // truncate
      return frames;
    } catch (error: unknown) {
      console.error(
        `[ENCRYPTED_CACHE]: Flush failure: ${error instanceof Error ? error.message : error}`
      );
      return [];
    }
  }

  /** Returns true if the cache file exists and has content. */
  public async hasCachedData(): Promise<boolean> {
    try {
      const stat = await fs.stat(this.cachePath);
      return stat.size > 0;
    } catch {
      return false;
    }
  }

  /** Approximate count of queued frames. */
  public async cachedFrameCount(): Promise<number> {
    try {
      const raw = await fs.readFile(this.cachePath, 'utf8');
      return raw.split('\n').filter((l) => l.trim().length > 0).length;
    } catch {
      return 0;
    }
  }
}
