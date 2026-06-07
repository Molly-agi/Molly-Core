/**
 * @fileOverview Dead-Letter Audit for Memory Operations
 *
 * Tracks permanent failures in memory consolidation and engram persistence.
 * Validates that queue ACKs don't conflict with engram deduplication.
 * Provides audit trail for Phase 1 bridge upgrade validation.
 *
 * During Phase 1: Collect baseline audit data, identify failure patterns.
 * Before Phase 2: Review all dead-letters, ensure zero conflicts with dedup.
 */

import { getStorageRouter } from '@/lib/storage-router';
import { MollyLogger, generateTraceId } from '@/ai/logger';
import type { QueuedMessage } from '@/ai/bridge/queue-store';

export interface DeadLetterEntry {
  // Identifier
  id: string;
  timestamp: number;

  // Context
  userId: string;
  operationType: 'engram_persist' | 'consolidation' | 'embedding_generation';
  sourceMessageId?: string; // If from bridge queue

  // What failed
  resourceId: string; // engramId, consolidationId, etc.
  error: string;
  errorCode?: string;
  stackTrace?: string;

  // Recovery info
  attemptCount: number;
  finalAttemptAt: number;
  retryEligible: boolean;

  // Deduplication audit
  deduplicationConflict: boolean;
  conflictReason?: string; // If true, why did dedup prevent persistence?
}

export interface DeadLetterAudit {
  period: {
    startTime: number;
    endTime: number;
    durationMs: number;
  };
  summary: {
    totalEntries: number;
    byOperationType: Record<string, number>;
    deduplicationConflicts: number;
    retryEligible: number;
  };
  topErrors: Array<{
    error: string;
    count: number;
    affectedUsers: number;
  }>;
  recommendations: string[];
}

class DeadLetterAuditLog {
  private db: ReturnType<typeof getStorageRouter> | null = null;
  private collectionName = 'memory_dead_letters';
  private entries: Map<string, DeadLetterEntry[]> = new Map(); // userId -> entries

  async initialize(): Promise<void> {
    this.db = await getStorageRouter();
  }

  /**
   * Record a failed engram persistence operation
   */
  async recordEngramPersistenceFailure(
    userId: string,
    engramId: string,
    error: string,
    attemptCount: number,
    deduplicationConflict: boolean = false,
    conflictReason?: string
  ): Promise<string> {
    const entry: DeadLetterEntry = {
      id: `dl_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      timestamp: Date.now(),
      userId,
      operationType: 'engram_persist',
      resourceId: engramId,
      error,
      errorCode: this.extractErrorCode(error),
      attemptCount,
      finalAttemptAt: Date.now(),
      retryEligible: attemptCount < 3, // Standard retry limit
      deduplicationConflict,
      conflictReason,
    };

    this.addEntry(userId, entry);

    MollyLogger.error(
      `Engram persistence failed (dead-letter): ${engramId}`,
      'dead-letter-audit',
      {
        userId,
        engramId,
        error,
        attemptCount,
        deduplicationConflict,
      }
    );

    // Persist to Firestore
    if (this.db) {
      try {
        await this.db.batchWrite([
          {
            type: 'set',
            collectionPath: `${this.collectionName}/${userId}/entries`,
            docId: entry.id,
            data: {
              ...entry,
              storedAt: new Date().toISOString(),
            },
          },
        ]);
      } catch (err) {
        MollyLogger.error(
          'Failed to persist dead-letter entry',
          'dead-letter-audit',
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    return entry.id;
  }

  /**
   * Record a consolidation failure
   */
  async recordConsolidationFailure(
    userId: string,
    consolidationId: string,
    error: string,
    attemptCount: number
  ): Promise<string> {
    const entry: DeadLetterEntry = {
      id: `dl_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      timestamp: Date.now(),
      userId,
      operationType: 'consolidation',
      resourceId: consolidationId,
      error,
      errorCode: this.extractErrorCode(error),
      attemptCount,
      finalAttemptAt: Date.now(),
      retryEligible: attemptCount < 3,
      deduplicationConflict: false,
    };

    this.addEntry(userId, entry);

    MollyLogger.error(
      `Consolidation failed (dead-letter): ${consolidationId}`,
      'dead-letter-audit',
      {
        userId,
        consolidationId,
        error,
        attemptCount,
      }
    );

    if (this.db) {
      try {
        await this.db.batchWrite([
          {
            type: 'set',
            collectionPath: `${this.collectionName}/${userId}/entries`,
            docId: entry.id,
            data: {
              ...entry,
              storedAt: new Date().toISOString(),
            },
          },
        ]);
      } catch (err) {
        MollyLogger.error(
          'Failed to persist dead-letter entry',
          'dead-letter-audit',
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    return entry.id;
  }

  /**
   * Validate that queue ACKs don't conflict with deduplication
   *
   * Problem: If memory consolidation deduplicates engrams, but the bridge queue
   * expects to ACK them individually, there's a conflict. This check ensures
   * that deduplicated engrams are properly marked in the queue to avoid retry loops.
   */
  async validateAckDeduplicationAlignment(
    userId: string,
    engramIds: string[],
    queuedMessages: QueuedMessage[]
  ): Promise<{
    isAligned: boolean;
    conflicts: Array<{ engramId: string; reason: string }>;
  }> {
    const conflicts: Array<{ engramId: string; reason: string }> = [];

    for (const engramId of engramIds) {
      const queueMsg = queuedMessages.find((m) => m.id.includes(engramId));

      if (!queueMsg) {
        // Engram has no corresponding queue message — this is fine
        continue;
      }

      // Check if the queue message was marked as deduplicated
      // Deduplicated messages should be marked with status 'delivered' without
      // waiting for actual ACK, to prevent the queue from retrying them.
      if (queueMsg.status === 'pending' && queueMsg.deliveryAttempts > 0) {
        // Message in retry limbo — potential conflict
        conflicts.push({
          engramId,
          reason: `Queue message in retry state (${queueMsg.deliveryAttempts} attempts) but engram was deduplicated`,
        });
      }
    }

    const isAligned = conflicts.length === 0;

    if (!isAligned) {
      MollyLogger.warn(
        `ACK-dedup alignment issues detected: ${conflicts.length} conflicts`,
        'dead-letter-audit',
        {
          userId,
          engramCount: engramIds.length,
          conflictCount: conflicts.length,
        }
      );

      // Record alignment issues as potential future dead-letters
      for (const conflict of conflicts) {
        await this.recordEngramPersistenceFailure(
          userId,
          conflict.engramId,
          conflict.reason,
          1,
          true,
          conflict.reason
        );
      }
    }

    return { isAligned, conflicts };
  }

  /**
   * Generate audit report for a time period
   */
  async generateAuditReport(
    userId: string,
    startTime: number,
    endTime: number
  ): Promise<DeadLetterAudit> {
    const userEntries = this.entries.get(userId) || [];
    const periodEntries = userEntries.filter(
      (e) => e.timestamp >= startTime && e.timestamp <= endTime
    );

    // Aggregate metrics
    const byOperationType: Record<string, number> = {};
    let deduplicationConflicts = 0;
    let retryEligible = 0;

    for (const entry of periodEntries) {
      byOperationType[entry.operationType] =
        (byOperationType[entry.operationType] || 0) + 1;

      if (entry.deduplicationConflict) {
        deduplicationConflicts += 1;
      }

      if (entry.retryEligible) {
        retryEligible += 1;
      }
    }

    // Top errors
    const errorCounts: Record<string, Set<string>> = {}; // error -> userIds
    for (const entry of periodEntries) {
      if (!errorCounts[entry.error]) {
        errorCounts[entry.error] = new Set();
      }
      errorCounts[entry.error].add(entry.userId);
    }

    const topErrors = Object.entries(errorCounts)
      .map(([error, userIds]) => ({
        error,
        count: periodEntries.filter((e) => e.error === error).length,
        affectedUsers: userIds.size,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Recommendations
    const recommendations: string[] = [];

    if (deduplicationConflicts > 0) {
      recommendations.push(
        `⚠️ ${deduplicationConflicts} deduplication conflicts detected — review ACK-dedup alignment`
      );
    }

    if (byOperationType.engram_persist > 0) {
      const failRate =
        (byOperationType.engram_persist / periodEntries.length) * 100;
      if (failRate > 5) {
        recommendations.push(
          `⚠️ High engram persistence failure rate: ${failRate.toFixed(1)}% — investigate storage layer`
        );
      }
    }

    if (retryEligible > 0) {
      recommendations.push(
        `ℹ️ ${retryEligible} entries eligible for retry — review and requeue if appropriate`
      );
    }

    if (topErrors.length > 0 && topErrors[0].count > 10) {
      recommendations.push(
        `⚠️ Top error "${topErrors[0].error}" occurring ${topErrors[0].count}x — prioritize fix`
      );
    }

    return {
      period: {
        startTime,
        endTime,
        durationMs: endTime - startTime,
      },
      summary: {
        totalEntries: periodEntries.length,
        byOperationType,
        deduplicationConflicts,
        retryEligible,
      },
      topErrors,
      recommendations,
    };
  }

  /**
   * Get all entries for a user (for detailed audit)
   */
  async getEntriesForUser(userId: string): Promise<DeadLetterEntry[]> {
    return this.entries.get(userId) || [];
  }

  private addEntry(userId: string, entry: DeadLetterEntry): void {
    if (!this.entries.has(userId)) {
      this.entries.set(userId, []);
    }
    const userEntries = this.entries.get(userId)!;
    userEntries.push(entry);

    // Keep last 1000 to avoid unbounded growth
    if (userEntries.length > 1000) {
      this.entries.set(userId, userEntries.slice(-1000));
    }
  }

  private extractErrorCode(error: string): string {
    // Try to extract standardized error code from error message
    const match = error.match(/\[([A-Z_]+)\]/);
    return match ? match[1] : 'UNKNOWN';
  }
}

// Singleton
let instance: DeadLetterAuditLog | null = null;

export function getDeadLetterAudit(): DeadLetterAuditLog {
  if (!instance) {
    instance = new DeadLetterAuditLog();
    instance.initialize().catch((err) => {
      MollyLogger.error(
        'Failed to initialize dead-letter audit',
        'dead-letter-audit',
        err instanceof Error ? err.message : String(err)
      );
    });
  }
  return instance;
}
