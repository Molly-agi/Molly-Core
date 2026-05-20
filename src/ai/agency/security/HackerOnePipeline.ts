/**
 * @fileOverview HackerOne operational security gate.
 * Intercepts exploit dispatches and freezes the fuzzing pipeline whenever
 * the CircuitBreaker detects network isolation, preventing unmonitored or
 * dangling payload delivery that could leak endpoint vectors.
 */

import { CircuitBreaker } from './CircuitBreaker';
import { EncryptedCache } from './EncryptedCache';

export interface ExploitPayloadState {
  targetDomain: string;
  vulnerabilityType:
    | 'RCE'
    | 'SQLi'
    | 'SSRF'
    | 'IDOR'
    | 'ID_LEAK'
    | 'XSS'
    | 'CMDI';
  activePayloadStr: string;
  fuzzingSequenceIndex: number;
}

export class HackerOnePipeline {
  private static isFuzzingActive = false;

  /**
   * Gate outbound exploit delivery behind a live network isolation check.
   * If isolated, the payload is encrypted and frozen in EncryptedCache so it
   * can be replayed once connectivity is restored — no data is ever discarded.
   */
  public static async dispatchExploitPayload(
    payload: ExploitPayloadState,
    cache: EncryptedCache
  ): Promise<void> {
    const breaker = CircuitBreaker.getInstance();

    if (breaker.getNetworkState() === 'ISOLATED_FALLBACK') {
      console.warn(
        `[OPSEC_GUARD]: Blocking exploit delivery to ${payload.targetDomain}. ` +
          `Network lane is isolated.`
      );

      this.isFuzzingActive = false;

      await cache.queueOfflineFrame({
        systemContext: 'HACKERONE_EXPLOIT_FREEZE',
        timestamp: Date.now(),
        payloadMetadata: payload,
      });

      throw new Error(
        '[H1_PIPELINE_CLOSED]: Outbound exploit delivery blocked — system isolation active.'
      );
    }

    const proxyUrl = process.env.MOLLY_BUG_HUNTING_PROXY;
    if (!proxyUrl) {
      throw new Error(
        '[H1_PIPELINE]: MOLLY_BUG_HUNTING_PROXY env var is required for exploit dispatch.'
      );
    }

    this.isFuzzingActive = true;
    await breaker.secureTransmit(proxyUrl, payload);
  }

  public static isActive(): boolean {
    return this.isFuzzingActive;
  }

  public static halt(): void {
    this.isFuzzingActive = false;
    console.log('[H1_PIPELINE]: Fuzzing pipeline halted.');
  }
}
