/**
 * Prune Compliance Logger — Audit Trail
 * Every memory eviction gets logged with a reason code for regulatory/audit compliance.
 * Append-only JSONL format for immutability.
 *
 * Eric's original design. Adapted for Molly's audit needs.
 */

import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Reason codes for why a memory engram was modified, archived, or purged.
 * Required for compliance audits.
 */
export type PruneReasonCode =
  | 'TTL_EXPIRATION' // Record exceeded time-to-live
  | 'SEMANTIC_DEDUPE' // Merged with similar memory (>0.96 similarity)
  | 'CAPACITY_CONSTRAINT' // Miller's Law: 7±2 slot limit hit
  | 'LOW_STRENGTH_DECAY' // Emotional strength decayed below threshold
  | 'MANUAL_OVERRIDE' // User/system explicitly removed
  | 'CORRUPTION_DETECTED'; // Data integrity check failed

/**
 * Immutable audit record for a single memory action.
 */
export interface AuditLogEntry {
  timestamp: string; // ISO 8601
  engramId: string;
  userId: string;
  actionTaken: 'ARCHIVED' | 'PURGED' | 'COMPACTED' | 'CONSOLIDATED';
  reasonCode: PruneReasonCode;
  impactMetrics: {
    bytesSaved: number;
    retainedSimilarityScore?: number; // For dedup operations
    compressionRatio?: number; // % reduction
  };
}

/**
 * Append-only logger for memory modification audit trail.
 * Ensures regulatory compliance: every eviction is logged and immutable.
 */
export class PruneComplianceLogger {
  private auditFilePath: string;
  private writerQueue: Promise<void> = Promise.resolve();

  constructor(auditFilePath: string = 'logs/memory-audit.jsonl') {
    this.auditFilePath = auditFilePath;
    this.ensureLogDir();
  }

  /**
   * Ensure the log directory exists.
   */
  private async ensureLogDir(): Promise<void> {
    try {
      const dir = dirname(this.auditFilePath);
      await fs.mkdir(dir, { recursive: true });
    } catch (err) {
      console.error('Failed to create audit log directory:', err);
    }
  }

  /**
   * Log a memory action (eviction, compression, consolidation).
   * Non-blocking: queues write asynchronously.
   */
  public async logAction(
    entry: Omit<AuditLogEntry, 'timestamp'>
  ): Promise<void> {
    // Chain writes to maintain strict ordering
    this.writerQueue = this.writerQueue.then(() => this._writeLogEntry(entry));

    return this.writerQueue;
  }

  /**
   * Internal: Actually write the entry to the JSONL file.
   */
  private async _writeLogEntry(
    entry: Omit<AuditLogEntry, 'timestamp'>
  ): Promise<void> {
    try {
      const fullEntry: AuditLogEntry = {
        timestamp: new Date().toISOString(),
        ...entry,
      };

      const logRow = JSON.stringify(fullEntry) + '\n';

      // Append-only file write: maintains integrity even on crash
      await fs.appendFile(this.auditFilePath, logRow, 'utf8');
    } catch (error) {
      console.error(
        '🚨 AUDIT FAILURE: Could not write memory audit log:',
        error
      );
      // Do NOT throw — audit failure should not crash the application
      // But log it prominently for operational visibility
    }
  }

  /**
   * Read audit log entries (for debugging / compliance reports).
   */
  public async readAuditLog(limit?: number): Promise<AuditLogEntry[]> {
    try {
      const content = await fs.readFile(this.auditFilePath, 'utf8');
      const lines = content.split('\n').filter((line) => line.trim());

      return lines
        .map((line) => {
          try {
            return JSON.parse(line) as AuditLogEntry;
          } catch {
            return null;
          }
        })
        .filter((entry): entry is AuditLogEntry => entry !== null)
        .slice(limit ? -limit : undefined);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return []; // Log file doesn't exist yet
      }
      throw err;
    }
  }

  /**
   * Generate compliance report: summary stats of all audit entries.
   */
  public async generateComplianceReport(): Promise<{
    totalEntries: number;
    byReason: Record<PruneReasonCode, number>;
    totalBytesSaved: number;
    reportGeneratedAt: string;
  }> {
    const entries = await this.readAuditLog();

    const byReason: Record<PruneReasonCode, number> = {
      TTL_EXPIRATION: 0,
      SEMANTIC_DEDUPE: 0,
      CAPACITY_CONSTRAINT: 0,
      LOW_STRENGTH_DECAY: 0,
      MANUAL_OVERRIDE: 0,
      CORRUPTION_DETECTED: 0,
    };

    let totalBytesSaved = 0;

    for (const entry of entries) {
      byReason[entry.reasonCode]++;
      totalBytesSaved += entry.impactMetrics.bytesSaved;
    }

    return {
      totalEntries: entries.length,
      byReason,
      totalBytesSaved,
      reportGeneratedAt: new Date().toISOString(),
    };
  }
}
