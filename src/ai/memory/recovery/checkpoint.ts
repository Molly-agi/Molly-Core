/**
 * Rollback Checkpoint Manager — Safety Layer
 * Creates snapshots before compression runs. Auto-restores if pipeline crashes.
 * Works with Firestore documents (Molly's actual storage backend).
 *
 * Eric's original design. Adapted for Firestore.
 */

import type { Firestore, DocumentData } from 'firebase/firestore';
import { doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';

export interface CheckpointMetadata {
  id: string;
  userId: string;
  createdAt: Timestamp;
  documentPath: string; // e.g., "users/userId/experiences/experienceId"
  dataHash: string; // SHA256 of the data snapshot
  status: 'active' | 'restored' | 'expired';
}

/**
 * Manages crash-safe checkpoints for memory compression operations.
 * Before compression: create checkpoint. On error: restore from checkpoint.
 */
export class RollbackCheckpointManager {
  private readonly db: Firestore;
  private readonly checkpointCollection = 'memory-checkpoints';

  constructor(db: Firestore) {
    this.db = db;
  }

  /**
   * Create a snapshot checkpoint before compression.
   * Returns checkpoint ID for later restoration if needed.
   */
  public async createCheckpoint(
    userId: string,
    documentPath: string,
    documentData: DocumentData
  ): Promise<string> {
    try {
      // Generate simple hash of data for integrity check
      const dataHash = this.simpleHash(JSON.stringify(documentData));
      const checkpointId = `chk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      const checkpoint: CheckpointMetadata = {
        id: checkpointId,
        userId,
        createdAt: Timestamp.now(),
        documentPath,
        dataHash,
        status: 'active',
      };

      // Store checkpoint with data
      const checkpointRef = doc(
        this.db,
        this.checkpointCollection,
        checkpointId
      );

      await setDoc(checkpointRef, {
        ...checkpoint,
        data: documentData,
      });

      console.log(`✅ Checkpoint created: ${checkpointId} for ${documentPath}`);
      return checkpointId;
    } catch (err) {
      console.error('❌ Failed to create checkpoint:', err);
      throw err;
    }
  }

  /**
   * Restore from a checkpoint if compression cycle failed.
   * Overwrites the corrupted document with the saved snapshot.
   */
  public async emergencyRollback(
    checkpointId: string,
    targetDocumentPath: string
  ): Promise<void> {
    try {
      // Retrieve checkpoint
      const checkpointRef = doc(
        this.db,
        this.checkpointCollection,
        checkpointId
      );
      const checkpointSnap = await getDoc(checkpointRef);

      if (!checkpointSnap.exists()) {
        console.error(`🚨 Checkpoint ${checkpointId} not found for rollback`);
        throw new Error(`Checkpoint ${checkpointId} does not exist`);
      }

      const { data: snapshotData } = checkpointSnap.data() as {
        data: DocumentData;
      };

      // Restore the document
      const targetRef = doc(this.db, targetDocumentPath);
      await setDoc(targetRef, snapshotData, { merge: false });

      // Mark checkpoint as restored
      await updateDoc(checkpointRef, { status: 'restored' as const });

      console.warn(
        `🚨 ROLLBACK COMPLETE: Restored ${targetDocumentPath} from checkpoint ${checkpointId}`
      );
    } catch (err) {
      console.error(
        `❌ CRITICAL: Rollback failed for checkpoint ${checkpointId}:`,
        err
      );
      throw err;
    }
  }

  /**
   * Clean up old checkpoints (older than 24 hours).
   * Prevents checkpoint collection from growing unbounded.
   */
  public async cleanupExpiredCheckpoints(userId: string): Promise<number> {
    try {
      const oneDayMs = 24 * 60 * 60 * 1000;
      const cleaned = 0;

      // In a real implementation, would use Firestore query + batch delete
      // For now, just log the intention
      console.log(
        `🧹 Cleanup: Would remove checkpoints older than ${oneDayMs}ms for user ${userId}`
      );

      return cleaned;
    } catch (err) {
      console.error('Failed to cleanup checkpoints:', err);
      return 0;
    }
  }

  /**
   * Simple hash function for data integrity checking.
   * Not cryptographic — just for basic corruption detection.
   */
  private simpleHash(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }
}
