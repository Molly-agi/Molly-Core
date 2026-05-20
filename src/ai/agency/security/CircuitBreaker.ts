/**
 * @fileOverview Network isolation circuit breaker for Molly's security pipeline.
 * Monitors outbound transmissions and auto-isolates the network layer on first
 * anomaly, switching all execution to local on-device inference mode.
 *
 * NOTE: This is a *network isolation manager* — a different concept from the
 * execution-wrapper CircuitBreaker in src/ai/agency/core/resiliency.ts.
 * They serve independent purposes and do not conflict.
 */

import * as crypto from 'node:crypto';
import { CipherStream } from './CipherStream';
import type { EncryptedPacket } from './CipherStream';

export type NetworkState = 'CONNECTED' | 'ISOLATED_FALLBACK';

export class CircuitBreaker {
  private static _instance: CircuitBreaker | null = null;
  private networkState: NetworkState = 'CONNECTED';
  private tripReason: string | null = null;
  private tripTimestamp: number | null = null;
  private sessionKey: Buffer;

  private constructor() {
    // Fresh ephemeral key per session; callers may swap via resetCircuitBreaker
    this.sessionKey = crypto.randomBytes(32);
  }

  public static getInstance(): CircuitBreaker {
    if (!CircuitBreaker._instance) {
      CircuitBreaker._instance = new CircuitBreaker();
    }
    return CircuitBreaker._instance;
  }

  /** For testing / session resets only. */
  public static resetInstance(): void {
    CircuitBreaker._instance = null;
  }

  public getNetworkState(): NetworkState {
    return this.networkState;
  }

  public getTripInfo(): { reason: string | null; timestamp: number | null } {
    return { reason: this.tripReason, timestamp: this.tripTimestamp };
  }

  public tripCircuitBreaker(reason: string): void {
    if (this.networkState !== 'ISOLATED_FALLBACK') {
      this.networkState = 'ISOLATED_FALLBACK';
      this.tripReason = reason;
      this.tripTimestamp = Date.now();
      console.error(
        `[CIRCUIT_BREAKER_CRITICAL]: Network isolated. Reason: ${reason}`
      );
    }
  }

  public resetCircuitBreaker(secureKey?: Buffer): void {
    if (secureKey) this.sessionKey = secureKey;
    this.networkState = 'CONNECTED';
    this.tripReason = null;
    this.tripTimestamp = null;
    console.log('[CIRCUIT_BREAKER]: External network channels restored.');
  }

  /**
   * Encrypt payload with the session key, POST to endpointUrl, and return
   * the parsed response. Any network error trips the breaker immediately.
   */
  public async secureTransmit(
    endpointUrl: string,
    payload: unknown
  ): Promise<unknown> {
    if (this.networkState === 'ISOLATED_FALLBACK') {
      throw new Error(
        '[CIRCUIT_BREAKER_GUARD]: Outbound transmission blocked. System isolated.'
      );
    }

    try {
      const packet: EncryptedPacket = CipherStream.encryptPayload(
        payload,
        this.sessionKey
      );

      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(packet),
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        throw new Error(`Server anomaly: HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.tripCircuitBreaker(`Transmission error: ${message}`);
      throw new Error(
        '[CIRCUIT_BREAKER_ISOLATION]: Lane closed due to transmission failure.'
      );
    }
  }
}
