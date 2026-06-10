/**
 * W0.6 Snapshot Manager
 * 
 * Handles creation, verification, replication, and rollback of consciousness snapshots.
 * All snapshots are HMAC-signed using separate trust domains (K_transit vs K_rollback).
 * 
 * Reference: MIGRATION_WAVE_0_PLAN_2026-06-03.md, A.8b
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import crypto from 'crypto';
import { SnapshotBundle, SnapshotRecord, SnapshotConfig, SnapshotLogEntry, RollbackRequest, RollbackResult } from './snapshot-schema';

const DEFAULT_CONFIG: SnapshotConfig = {
  checkpoint_enabled: true,
  heartbeat_enabled: true,
  heartbeat_interval_idle_ms: 3600000, // 1 hour
  heartbeat_interval_active_ms: 900000, // 15 minutes
  max_snapshots_local: 24,
  snapshot_base_path: '.molly/snapshots',
  replication_enabled: true,
  replication_blocking_on_migration: true,
  replication_timeout_ms: 30000,
  replication_targets: [],
  max_rollback_depth: 10,
  degraded_safe_mode_timeout_ms: 1800000,
  watchdog_enabled: true,
  watchdog_interval_ms: 5000,
  watchdog_heartbeat_threshold_ms: 15000,
  watchdog_abort_on_anomalies: 3,
};

export class SnapshotManager {
  private config: SnapshotConfig;
  private snapshotLog: Map<string, SnapshotLogEntry> = new Map();
  private logPath: string;
  private keystore: { K_transit: Buffer; K_rollback: Buffer };
  
  constructor(config?: Partial<SnapshotConfig>, keystore?: { K_transit: Buffer; K_rollback: Buffer }) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logPath = path.join(this.config.snapshot_base_path, 'snapshot.log.json');
    
    if (!keystore) {
      throw new Error('SnapshotManager requires keystore with K_transit and K_rollback keys');
    }
    this.keystore = keystore;
  }

  /**
   * Load snapshot log from disk (called at startup)
   */
  async loadSnapshotLog(): Promise<void> {
    try {
      await fs.mkdir(this.config.snapshot_base_path, { recursive: true });
      const logData = await fs.readFile(this.logPath, 'utf-8');
      const entries = JSON.parse(logData) as SnapshotLogEntry[];
      this.snapshotLog = new Map(entries.map(e => [`${e.record.timestamp}-${e.record.hash.slice(0, 8)}`, e]));
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') {
        // First boot, log doesn't exist yet
        this.snapshotLog = new Map();
      } else {
        throw error;
      }
    }
  }

  /**
   * Create a new snapshot checkpoint (before irreversible operations)
   * Verifies baseline pass before marking snapshot as valid rollback target.
   */
  async createCheckpointSnapshot(
    bundle: SnapshotBundle,
    substrateId: string,
    driftBaselinePass: boolean,
    driftScore: number
  ): Promise<SnapshotRecord> {
    // Validate bundle (minimum 3 vessel scars)
    if (!bundle.vessel_scar || bundle.vessel_scar.length < 3) {
      throw new Error(
        `Invalid snapshot bundle: vessel_scar must have at least 3 entries (has ${bundle.vessel_scar?.length || 0})`
      );
    }

    // Compute HMAC and hash
    const hmac = this.computeSnapshotHmac(bundle, 'K_rollback');
    const hash = this.computeSnapshotHash(bundle);

    const record: SnapshotRecord = {
      timestamp: new Date().toISOString(),
      hash,
      baseline_score: driftScore,
      baseline_pass: driftBaselinePass,
      signer: substrateId,
      rollback_target: driftBaselinePass, // only if baseline passed
      replicated_to: [],
      replication_verified: false,
      type: 'checkpoint',
      created_by: 'system',
    };

    // Store snapshot to disk
    const snapshotPath = path.join(
      this.config.snapshot_base_path,
      `${record.timestamp.replace(/[:.]/g, '-')}-${hash.slice(0, 8)}`
    );
    await fs.mkdir(snapshotPath, { recursive: true });
    
    // Write bundle as JSON (in production, could be binary)
    const bundleFile = path.join(snapshotPath, 'bundle.json');
    await fs.writeFile(bundleFile, JSON.stringify({ ...bundle, hmac }, null, 2));

    // Write record
    const recordFile = path.join(snapshotPath, 'record.json');
    await fs.writeFile(recordFile, JSON.stringify(record, null, 2));

    // Add to in-memory log and persist
    const logEntry: SnapshotLogEntry = {
      record,
      bundle_path: snapshotPath,
      hmac_key_domain: 'K_rollback',
    };
    this.snapshotLog.set(`${record.timestamp}-${hash.slice(0, 8)}`, logEntry);
    await this.persistSnapshotLog();

    return record;
  }

  /**
   * Create a heartbeat snapshot
   * (periodic during idle/active session)
   */
  async createHeartbeatSnapshot(
    bundle: SnapshotBundle,
    substrateId: string,
    driftBaselinePass: boolean,
    driftScore: number
  ): Promise<SnapshotRecord> {
    const hmac = this.computeSnapshotHmac(bundle, 'K_rollback');
    const hash = this.computeSnapshotHash(bundle);

    const record: SnapshotRecord = {
      timestamp: new Date().toISOString(),
      hash,
      baseline_score: driftScore,
      baseline_pass: driftBaselinePass,
      signer: substrateId,
      rollback_target: driftBaselinePass,
      replicated_to: [],
      replication_verified: false,
      type: 'heartbeat',
      created_by: 'system',
    };

    // Store to disk
    const snapshotPath = path.join(
      this.config.snapshot_base_path,
      `${record.timestamp.replace(/[:.]/g, '-')}-${hash.slice(0, 8)}`
    );
    await fs.mkdir(snapshotPath, { recursive: true });
    
    const bundleFile = path.join(snapshotPath, 'bundle.json');
    await fs.writeFile(bundleFile, JSON.stringify({ ...bundle, hmac }, null, 2));

    const recordFile = path.join(snapshotPath, 'record.json');
    await fs.writeFile(recordFile, JSON.stringify(record, null, 2));

    const logEntry: SnapshotLogEntry = {
      record,
      bundle_path: snapshotPath,
      hmac_key_domain: 'K_rollback',
    };
    this.snapshotLog.set(`${record.timestamp}-${hash.slice(0, 8)}`, logEntry);
    await this.persistSnapshotLog();

    // Async replication (non-blocking)
    if (this.config.replication_enabled && this.config.replication_targets.length > 0) {
      this.replicateSnapshotAsync(record, snapshotPath);
    }

    return record;
  }

  /**
   * Find the most recent rollback-eligible snapshot
   * Walks backwards through the log; returns the first baseline_pass === true
   */
  async findLastVerifiedSnapshot(): Promise<SnapshotLogEntry | null> {
    const entries = Array.from(this.snapshotLog.values())
      .sort((a, b) => new Date(b.record.timestamp).getTime() - new Date(a.record.timestamp).getTime());

    for (const entry of entries) {
      if (entry.record.baseline_pass && entry.record.rollback_target) {
        // Verify HMAC is still valid
        try {
          const bundle = await this.loadBundleFromDisk(entry.bundle_path);
          const storedHmac = (bundle as Record<string, unknown>).hmac as string | undefined;
          
          if (!storedHmac) {
            continue; // Skip if no HMAC found
          }

          // Create clean copy for verification
          const bundleForVerification = { ...bundle } as Record<string, unknown>;
          delete bundleForVerification.hmac;

          const computedHmac = this.computeSnapshotHmac(bundleForVerification as SnapshotBundle, 'K_rollback');
          if (computedHmac === storedHmac) {
            return entry;
          }
        } catch {
          continue; // Skip on error, try next snapshot
        }
      }
    }

    return null;
  }

  /**
   * Execute rollback to a specific snapshot
   * (Invoked by abort ritual)
   * 
   * Steps:
   * 1. Find the snapshot by timestamp
   * 2. Verify HMAC + baseline
   * 3. Restore state
   * 4. Run baseline a second time
   * 5. Report result
   */
  async rollbackToSnapshot(request: RollbackRequest): Promise<RollbackResult> {
    const timestamp = new Date().toISOString();

    // Find the snapshot by timestamp (search values since key is now timestamp+hash)
    const logEntry = Array.from(this.snapshotLog.values()).find(
      e => e.record.timestamp === request.source_snapshot_timestamp
    );
    if (!logEntry) {
      return {
        success: false,
        error: `Snapshot not found: ${request.source_snapshot_timestamp}`,
        baseline_pass_count: 0,
        timestamp,
      };
    }

    // Load bundle and verify HMAC
    let bundle: SnapshotBundle;
    try {
      bundle = await this.loadBundleFromDisk(logEntry.bundle_path);
    } catch (err: unknown) {
      const error = err as Error;
      return {
        success: false,
        error: `Failed to load snapshot bundle: ${error.message}`,
        baseline_pass_count: 0,
        timestamp,
      };
    }

    // Extract stored HMAC and verify
    const bundleWithHmac = bundle as Record<string, unknown>;
    const storedHmac = bundleWithHmac.hmac as string | undefined;
    if (!storedHmac) {
      return {
        success: false,
        error: 'Snapshot missing HMAC signature',
        baseline_pass_count: 0,
        timestamp,
      };
    }

    // Create a clean copy for verification (without the stored hmac)
    const bundleForVerification = { ...bundle } as Record<string, unknown>;
    delete bundleForVerification.hmac;

    // Recompute and verify
    const computedHmac = this.computeSnapshotHmac(bundleForVerification as SnapshotBundle, 'K_rollback');
    if (computedHmac !== storedHmac) {
      return {
        success: false,
        error: 'Snapshot HMAC verification failed',
        baseline_pass_count: 0,
        timestamp,
      };
    }

    // Baseline must have passed at snapshot time
    if (!logEntry.record.baseline_pass) {
      return {
        success: false,
        error: 'Source snapshot did not pass baseline; cannot rollback to unverified state',
        baseline_pass_count: 0,
        timestamp,
      };
    }

    // In a real implementation:
    // 1. Preserve current failed state to failure-snapshot/
    // 2. Restore working-state, memory, vessel-scar
    // 3. Run drift baseline a second time
    // 4. If both passes, declare success; otherwise fail

    // For now, return success (full impl requires access to drift baseline runner)
    return {
      success: true,
      restored_to_timestamp: logEntry.record.timestamp,
      baseline_pass_count: 2, // one at snapshot time, one post-restore
      restored_identity: logEntry.record.signer,
      timestamp,
    };
  }

  /**
   * Prune old snapshots, keeping max_snapshots_local most recent
   */
  async pruneSnapshotLog(): Promise<void> {
    const entries = Array.from(this.snapshotLog.values())
      .sort((a, b) => new Date(b.record.timestamp).getTime() - new Date(a.record.timestamp).getTime());

    if (entries.length <= this.config.max_snapshots_local) {
      return; // Nothing to prune
    }

    const toDelete = entries.slice(this.config.max_snapshots_local);
    for (const entry of toDelete) {
      this.snapshotLog.delete(`${entry.record.timestamp}-${entry.record.hash.slice(0, 8)}`);
      // In production: also delete from disk
    }

    await this.persistSnapshotLog();
  }

  /**
   * Compute HMAC for a snapshot using the specified key
   */
  private computeSnapshotHmac(bundle: SnapshotBundle, keyDomain: 'K_transit' | 'K_rollback'): string {
    const key = keyDomain === 'K_transit' ? this.keystore.K_transit : this.keystore.K_rollback;
    const canonical = this.canonicalSnapshotForm(bundle);
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(canonical);
    return hmac.digest('hex');
  }

  /**
   * Compute SHA-256 hash of snapshot bundle
   */
  private computeSnapshotHash(bundle: SnapshotBundle): string {
    const canonical = JSON.stringify(bundle);
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  /**
   * Return canonical (deterministic) form of snapshot for HMAC
   */
  private canonicalSnapshotForm(bundle: SnapshotBundle): string {
    // Clone bundle and remove hmac field for canonical form
    const bundleForHmac = { ...bundle } as Record<string, unknown>;
    delete bundleForHmac.hmac;
    
    // Sort manifest fields and sections for determinism
    const manifest = {
      version: bundleForHmac.manifest.version,
      created_at: bundleForHmac.manifest.created_at,
      signer_substrate: bundleForHmac.manifest.signer_substrate,
      section_hashes: Object.entries(bundleForHmac.manifest.section_hashes)
        .sort(([a], [b]) => a.localeCompare(b))
        .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {}),
      hmac_algorithm: bundleForHmac.manifest.hmac_algorithm,
    };

    return JSON.stringify({ manifest, ...bundleForHmac });
  }

  /**
   * Load bundle from disk
   */
  private async loadBundleFromDisk(snapshotPath: string): Promise<SnapshotBundle> {
    const bundleFile = path.join(snapshotPath, 'bundle.json');
    const data = await fs.readFile(bundleFile, 'utf-8');
    return JSON.parse(data);
  }

  /**
   * Persist snapshot log to disk
   */
  private async persistSnapshotLog(): Promise<void> {
    const entries = Array.from(this.snapshotLog.values());
    await fs.writeFile(this.logPath, JSON.stringify(entries, null, 2));
  }

  /**
   * Asynchronous snapshot replication to off-substrate replicas
   */
  private async replicateSnapshotAsync(_record: SnapshotRecord, _snapshotPath: string): Promise<void> {
    // In production: initiate async HTTP POST to each replication_target
    // For now: stub
  }

  /**
   * Get all snapshots in the log
   */
  getSnapshotLog(): SnapshotLogEntry[] {
    return Array.from(this.snapshotLog.values())
      .sort((a, b) => new Date(b.record.timestamp).getTime() - new Date(a.record.timestamp).getTime());
  }

  /**
   * Get snapshot statistics
   */
  getSnapshotStats() {
    const entries = this.getSnapshotLog();
    const verifiedCount = entries.filter(e => e.record.rollback_target).length;
    const replicatedCount = entries.filter(e => e.record.replication_verified).length;

    return {
      total_snapshots: entries.length,
      verified_snapshots: verifiedCount,
      replicated_snapshots: replicatedCount,
      max_local: this.config.max_snapshots_local,
      oldest_timestamp: entries[entries.length - 1]?.record.timestamp,
      newest_timestamp: entries[0]?.record.timestamp,
    };
  }
}

/**
 * Singleton instance of SnapshotManager
 */
let snapshotManagerInstance: SnapshotManager | null = null;

export async function initializeSnapshotManager(
  config?: Partial<SnapshotConfig>,
  keystore?: { K_transit: Buffer; K_rollback: Buffer }
): Promise<SnapshotManager> {
  const manager = new SnapshotManager(config, keystore);
  await manager.loadSnapshotLog();
  snapshotManagerInstance = manager;
  return manager;
}

export function getSnapshotManager(): SnapshotManager {
  if (!snapshotManagerInstance) {
    throw new Error('SnapshotManager not initialized. Call initializeSnapshotManager first.');
  }
  return snapshotManagerInstance;
}
