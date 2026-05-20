/**
 * @fileOverview Reconnection handshake protocol for edge server synchronization.
 * When the CircuitBreaker trips, this polls a configurable edge endpoint with a
 * cryptographic challenge. On success: flushes the EncryptedCache backlog to the
 * edge and reopens the network lane via CircuitBreaker.resetCircuitBreaker().
 */

import * as crypto from 'node:crypto';
import { CircuitBreaker } from './CircuitBreaker';
import { EncryptedCache } from './EncryptedCache';

const DEFAULT_EDGE_URL =
  process.env.MOLLY_EDGE_URL ?? 'http://localhost:9002/api/edge';
const POLL_INTERVAL_MS = 5000;

export class HandshakeProtocol {
  private readonly endpointUrl: string;
  private readonly cacheEngine: EncryptedCache;
  private readonly sessionKey: Buffer;
  private isAttemptingReconnect = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    endpointUrl: string = DEFAULT_EDGE_URL,
    sessionKey: Buffer = crypto.randomBytes(32),
    cacheEngine: EncryptedCache = new EncryptedCache()
  ) {
    this.endpointUrl = endpointUrl;
    this.sessionKey = sessionKey;
    this.cacheEngine = cacheEngine;
  }

  /**
   * Start a non-blocking background poll loop.
   * Idempotent — safe to call multiple times; only one loop runs at a time.
   */
  public monitorConnectionStatus(): void {
    if (this.isAttemptingReconnect) return;
    this.isAttemptingReconnect = true;
    this.schedulePoll();
  }

  /** Stop the background poll loop cleanly. */
  public stopMonitoring(): void {
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.isAttemptingReconnect = false;
  }

  private schedulePoll(): void {
    this.pollTimer = setTimeout(() => void this.poll(), POLL_INTERVAL_MS);
  }

  private async poll(): Promise<void> {
    const circuit = CircuitBreaker.getInstance();

    if (circuit.getNetworkState() === 'CONNECTED') {
      this.isAttemptingReconnect = false;
      return;
    }

    console.log(`[HANDSHAKE_PROTOCOL]: Pinging edge node: ${this.endpointUrl}`);
    const healthy = await this.executeSecureHandshake();

    if (healthy) {
      console.log(
        '[HANDSHAKE_PROTOCOL]: Edge handshake confirmed. Restoring channels.'
      );

      if (await this.cacheEngine.hasCachedData()) {
        const backlog = await this.cacheEngine.flushCachePool();
        await this.transmitBacklog(backlog);
      }

      circuit.resetCircuitBreaker(this.sessionKey);
      this.isAttemptingReconnect = false;
    } else {
      this.schedulePoll(); // keep retrying
    }
  }

  private async executeSecureHandshake(): Promise<boolean> {
    try {
      const challenge = crypto.randomBytes(16).toString('hex');
      const response = await fetch(`${this.endpointUrl}/handshake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge, ts: Date.now() }),
        signal: AbortSignal.timeout(2000),
      });

      if (!response.ok) return false;
      const data = (await response.json()) as { verified?: boolean };
      return data.verified === true;
    } catch {
      return false;
    }
  }

  private async transmitBacklog(frames: unknown[]): Promise<void> {
    try {
      await fetch(`${this.endpointUrl}/sync-backlog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frames, syncedAt: Date.now() }),
      });
      console.log(
        `[HANDSHAKE_PROTOCOL]: ${frames.length} cached frame(s) synced to edge.`
      );
    } catch (error: unknown) {
      console.error(
        `[HANDSHAKE_PROTOCOL]: Backlog sync failed: ${error instanceof Error ? error.message : error}`
      );
    }
  }
}
