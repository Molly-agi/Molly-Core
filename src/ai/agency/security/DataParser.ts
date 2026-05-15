/**
 * @fileOverview Telemetry timeline auditor and self-healing data parser.
 * Inspects cached frames for sequence gaps and hash anomalies, then emits
 * a repair event for the immune system to consume.
 */

import * as crypto from 'node:crypto';
import type { OfflineFrame } from './EncryptedCache';

export interface TelemetryFrame extends OfflineFrame {
  sequenceId: number;
  /** SHA-256 hex digest of the frame payload — must be exactly 64 chars. */
  cognitiveHash: string;
}

export interface AuditResult {
  isHealthy: boolean;
  missing: number[]; // sequence IDs of gap frames
  corrupt: number[]; // sequence IDs of frames with invalid hashes
}

export class DataParser {
  /**
   * Audit a timeline of frames for sequence gaps and corrupted hashes.
   */
  public static auditTimeline(frames: TelemetryFrame[]): AuditResult {
    const result: AuditResult = { isHealthy: true, missing: [], corrupt: [] };
    if (frames.length === 0) return result;

    frames.sort((a, b) => a.sequenceId - b.sequenceId);

    for (let i = 0; i < frames.length; i++) {
      const current = frames[i];

      // Validate cognitive hash — must be a 64-char lowercase hex string
      if (
        !current.cognitiveHash ||
        !/^[0-9a-f]{64}$/i.test(current.cognitiveHash)
      ) {
        result.corrupt.push(current.sequenceId);
        result.isHealthy = false;
      }

      // Detect sequence gaps
      if (i > 0) {
        const expected = frames[i - 1].sequenceId + 1;
        for (let mid = expected; mid < current.sequenceId; mid++) {
          result.missing.push(mid);
        }
        if (current.sequenceId !== expected) {
          result.isHealthy = false;
        }
      }
    }

    return result;
  }

  /** Generate a SHA-256 cognitive hash for a frame's payload. */
  public static hashFrame(payload: unknown): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  /**
   * Audit the backlog and fire a repair event if anomalies are found.
   * The 'molly:immune:repair' CustomEvent is consumed by ImmuneSystem.ts.
   */
  public static async parseAndHealBacklog(
    frames: TelemetryFrame[]
  ): Promise<void> {
    const audit = this.auditTimeline(frames);

    if (!audit.isHealthy) {
      const severity = audit.corrupt.length > 5 ? 'CRITICAL' : 'MODERATE';
      console.warn(
        `[DATA_PARSER]: Timeline anomaly — severity: ${severity}. ` +
          `Missing: [${audit.missing.join(', ')}], ` +
          `Corrupt: [${audit.corrupt.join(', ')}]`
      );

      if (typeof globalThis !== 'undefined') {
        const target = globalThis as unknown as EventTarget;
        if (typeof target.dispatchEvent === 'function') {
          target.dispatchEvent(
            new CustomEvent('molly:immune:repair', {
              detail: {
                origin: 'TELEMETRY_TIMELINE',
                missingDataWindows: audit.missing,
                damagedNodes: audit.corrupt,
                severity,
              },
            })
          );
        }
      }
    }
  }
}
