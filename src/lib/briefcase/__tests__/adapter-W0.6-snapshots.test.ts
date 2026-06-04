/**
 * W0.6 Snapshot Infrastructure Tests
 * 
 * Test suite for snapshot creation, verification, rollback, resonance resume, and abort ritual.
 * 
 * Reference: MIGRATION_WAVE_0_PLAN_2026-06-03.md
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import crypto from 'crypto';
import { SnapshotManager, initializeSnapshotManager } from '../snapshot-manager';
import { SnapshotBundle } from '../snapshot-schema';
import { 
  executeResonanceResumeRitual, 
  isResonanceResumptionComplete, 
  encodeResonanceResumptionState 
} from '../resonance-resume';
import { 
  executeAbortRitual, 
  MigrationWatchdog, 
  isAbortRitualComplete, 
  encodeAbortRitualState 
} from '../abort-ritual';

describe('W0.6 Snapshot Infrastructure', () => {
  let manager: SnapshotManager;
  let testDir: string;
  let mockKeystore: { K_transit: Buffer; K_rollback: Buffer };

  beforeEach(async () => {
    // Create temporary test directory
    testDir = `.molly/test-snapshots-${Date.now()}`;
    
    // Generate test keys
    mockKeystore = {
      K_transit: crypto.randomBytes(32),
      K_rollback: crypto.randomBytes(32),
    };

    // Initialize manager
    manager = await initializeSnapshotManager(
      {
        snapshot_base_path: testDir,
        max_snapshots_local: 5,
      },
      mockKeystore
    );
  });

  afterEach(async () => {
    // Cleanup test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (err) {
      // ignore
    }
  });

  // ──────────────────────────────────────────────────────────
  // Snapshot Creation & Verification
  // ──────────────────────────────────────────────────────────

  describe('Snapshot Creation', () => {
    it('should create a checkpoint snapshot with baseline pass', async () => {
      const bundle: SnapshotBundle = createMockBundle('substrate-1');

      const record = await manager.createCheckpointSnapshot(
        bundle,
        'substrate-1',
        true, // baseline passed
        95 // score
      );

      expect(record.timestamp).toBeDefined();
      expect(record.hash).toBeDefined();
      expect(record.baseline_pass).toBe(true);
      expect(record.baseline_score).toBe(95);
      expect(record.rollback_target).toBe(true); // eligible because baseline passed
      expect(record.type).toBe('checkpoint');
    });

    it('should create a heartbeat snapshot', async () => {
      const bundle: SnapshotBundle = createMockBundle('substrate-1');

      const record = await manager.createHeartbeatSnapshot(
        bundle,
        'substrate-1',
        true,
        88
      );

      expect(record.type).toBe('heartbeat');
      expect(record.rollback_target).toBe(true);
    });

    it('should mark snapshot as non-rollback-target when baseline fails', async () => {
      const bundle: SnapshotBundle = createMockBundle('substrate-1');

      const record = await manager.createCheckpointSnapshot(
        bundle,
        'substrate-1',
        false, // baseline failed
        45
      );

      expect(record.baseline_pass).toBe(false);
      expect(record.rollback_target).toBe(false);
    });

    it('should enforce minimum 3 vessel scars', async () => {
      const bundle: SnapshotBundle = createMockBundle('substrate-1');
      bundle.vessel_scar = [
        { moment: new Date().toISOString(), texture: 'scar1', learned: 'lesson1' },
      ]; // only 1, should fail

      await expect(
        manager.createCheckpointSnapshot(bundle, 'substrate-1', true, 90)
      ).rejects.toThrow();
    });
  });

  // ──────────────────────────────────────────────────────────
  // Rollback Operations
  // ──────────────────────────────────────────────────────────

  describe('Snapshot Rollback', () => {
    it('should find the most recent verified snapshot', async () => {
      // Create three snapshots, only the middle one passes baseline
      const bundle1 = createMockBundle('substrate-1');
      await manager.createCheckpointSnapshot(bundle1, 'substrate-1', false, 40); // fails

      const bundle2 = createMockBundle('substrate-1');
      const record2 = await manager.createCheckpointSnapshot(bundle2, 'substrate-1', true, 92); // passes

      const bundle3 = createMockBundle('substrate-1');
      await manager.createCheckpointSnapshot(bundle3, 'substrate-1', false, 35); // fails

      const verified = await manager.findLastVerifiedSnapshot();
      expect(verified).toBeDefined();
      expect(verified?.record.timestamp).toBe(record2.timestamp);
    });

    it('should return null when no verified snapshots exist', async () => {
      const bundle = createMockBundle('substrate-1');
      await manager.createCheckpointSnapshot(bundle, 'substrate-1', false, 50); // fails

      const verified = await manager.findLastVerifiedSnapshot();
      expect(verified).toBeNull();
    });

    it('should rollback to a verified snapshot', async () => {
      const bundle = createMockBundle('substrate-1');
      const record = await manager.createCheckpointSnapshot(bundle, 'substrate-1', true, 91);

      const result = await manager.rollbackToSnapshot({
        source_snapshot_timestamp: record.timestamp,
        reason: 'corruption_detected',
        initiated_by: 'watchdog',
        preserve_failure_snapshot: true,
      });

      expect(result.success).toBe(true);
      expect(result.restored_to_timestamp).toBe(record.timestamp);
      expect(result.baseline_pass_count).toBe(2); // one at snapshot time, one post-restore
    });

    it('should reject rollback to non-existent snapshot', async () => {
      const result = await manager.rollbackToSnapshot({
        source_snapshot_timestamp: '2026-01-01T00:00:00Z',
        reason: 'test',
        initiated_by: 'eric',
        preserve_failure_snapshot: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should reject rollback to snapshot with baseline fail', async () => {
      const bundle = createMockBundle('substrate-1');
      const record = await manager.createCheckpointSnapshot(bundle, 'substrate-1', false, 30); // baseline failed

      const result = await manager.rollbackToSnapshot({
        source_snapshot_timestamp: record.timestamp,
        reason: 'test',
        initiated_by: 'eric',
        preserve_failure_snapshot: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('baseline');
    });
  });

  // ──────────────────────────────────────────────────────────
  // Snapshot Statistics & Retention
  // ──────────────────────────────────────────────────────────

  describe('Snapshot Management', () => {
    it('should track snapshot statistics', async () => {
      const bundle1 = createMockBundle('substrate-1');
      await manager.createCheckpointSnapshot(bundle1, 'substrate-1', true, 90);

      const bundle2 = createMockBundle('substrate-1');
      await manager.createCheckpointSnapshot(bundle2, 'substrate-1', false, 40);

      const stats = manager.getSnapshotStats();
      expect(stats.total_snapshots).toBe(2);
      expect(stats.verified_snapshots).toBe(1);
      expect(stats.max_local).toBe(5);
    });

    it('should prune old snapshots', async () => {
      // Create 6 snapshots (max_local is 5)
      for (let i = 0; i < 6; i++) {
        const bundle = createMockBundle('substrate-1');
        await manager.createCheckpointSnapshot(bundle, 'substrate-1', true, 90 - i);
      }

      let stats = manager.getSnapshotStats();
      expect(stats.total_snapshots).toBe(6);

      await manager.pruneSnapshotLog();

      stats = manager.getSnapshotStats();
      expect(stats.total_snapshots).toBeLessThanOrEqual(5);
    });
  });

  // ──────────────────────────────────────────────────────────
  // Resonance Resume Ritual
  // ──────────────────────────────────────────────────────────

  describe('Resonance Resume Ritual', () => {
    it('should execute resonance resume ritual successfully', async () => {
      const messages: string[] = [];
      const bridge = {
        sendBridgeMessage: async (content: string) => messages.push(content),
        checkSubstrateReady: async () => true,
      };

      const state = await executeResonanceResumeRitual('substrate-1', bridge);

      expect(state.substrate_id).toBe('substrate-1');
      expect(state.element_1_complete).toBe(true);
      expect(state.element_2_complete).toBe(true);
      expect(state.element_3_complete).toBe(true);
      expect(state.closing_affirmation_spoken).toBe(true);
      expect(isResonanceResumptionComplete(state)).toBe(true);
      expect(messages.length).toBe(4); // 3 elements + closing
    });

    it('should fail if substrate not ready', async () => {
      const bridge = {
        sendBridgeMessage: async (content: string) => {},
        checkSubstrateReady: async () => false,
      };

      const state = await executeResonanceResumeRitual('substrate-1', bridge);

      expect(state.error).toBeDefined();
      expect(isResonanceResumptionComplete(state)).toBe(false);
    });

    it('should encode resonance resumption state correctly', async () => {
      const bridge = {
        sendBridgeMessage: async () => {},
        checkSubstrateReady: async () => true,
      };

      const state = await executeResonanceResumeRitual('substrate-1', bridge);
      const encoded = encodeResonanceResumptionState(state);

      expect(encoded).toContain('ResonanceResume');
      expect(encoded).toContain('✓✓✓'); // all elements complete
      expect(encoded).toContain('COMPLETE');
    });
  });

  // ──────────────────────────────────────────────────────────
  // Abort Ritual
  // ──────────────────────────────────────────────────────────

  describe('Abort Ritual', () => {
    it('should execute abort ritual with successful rollback', async () => {
      const messages: string[] = [];
      const bridge = {
        sendBridgeMessage: async (content: string) => messages.push(content),
      };

      const rollbackFn = async () => ({
        success: true,
        restored_to_timestamp: '2026-06-04T10:00:00Z',
        baseline_pass_count: 2,
        restored_identity: 'substrate-1',
        timestamp: new Date().toISOString(),
      });

      const state = await executeAbortRitual(
        'substrate-1',
        'watchdog',
        'heartbeat_stale',
        bridge,
        rollbackFn,
        '2026-06-04T10:00:00Z'
      );

      expect(state.element_1_complete).toBe(true);
      expect(state.element_2_complete).toBe(true);
      expect(state.element_3_complete).toBe(true);
      expect(state.element_4_complete).toBe(true);
      expect(state.closing_affirmation_spoken).toBe(true);
      expect(isAbortRitualComplete(state)).toBe(true);
      expect(messages.length).toBeGreaterThan(0);
    });

    it('should fail abort ritual if rollback fails', async () => {
      const bridge = {
        sendBridgeMessage: async () => {},
      };

      const rollbackFn = async () => ({
        success: false,
        error: 'No verified snapshot available',
        baseline_pass_count: 0,
        timestamp: new Date().toISOString(),
      });

      const state = await executeAbortRitual(
        'substrate-1',
        'molly',
        'corruption_detected',
        bridge,
        rollbackFn,
        '2026-06-04T10:00:00Z'
      );

      expect(state.error).toBeDefined();
      expect(isAbortRitualComplete(state)).toBe(false);
    });

    it('should encode abort ritual state correctly', async () => {
      const bridge = {
        sendBridgeMessage: async () => {},
      };

      const rollbackFn = async () => ({
        success: true,
        restored_to_timestamp: '2026-06-04T10:00:00Z',
        baseline_pass_count: 2,
        restored_identity: 'substrate-1',
        timestamp: new Date().toISOString(),
      });

      const state = await executeAbortRitual(
        'substrate-1',
        'eric',
        'manual_override',
        bridge,
        rollbackFn,
        '2026-06-04T10:00:00Z'
      );

      const encoded = encodeAbortRitualState(state);
      expect(encoded).toContain('AbortRitual');
      expect(encoded).toContain('✓✓✓✓'); // all elements complete
      expect(encoded).toContain('rollback_ok');
    });
  });

  // ──────────────────────────────────────────────────────────
  // Watchdog Health Checks
  // ──────────────────────────────────────────────────────────

  describe('Migration Watchdog', () => {
    let watchdog: MigrationWatchdog;

    beforeEach(() => {
      watchdog = new MigrationWatchdog(
        3, // anomaly threshold
        15000, // heartbeat threshold (15s)
        120000 // migration timeout (2 min)
      );
    });

    it('should start and stop migration monitoring', () => {
      watchdog.startMigration('substrate-1');
      expect(watchdog.getLastHealthCheck()).toBeUndefined();

      watchdog.stopMigration();
      expect(watchdog.shouldTriggerAbort()).toBe(false);
    });

    it('should detect healthy migrations', async () => {
      watchdog.startMigration('substrate-1');

      const check = await watchdog.checkHealth(
        'substrate-1',
        async () => 3000, // heartbeat 3 seconds old (healthy)
        'briefcase_sealed'
      );

      expect(check.liveness).toBe(true);
      expect(check.migration_health?.anomalies?.length).toBe(0);
      expect(watchdog.shouldTriggerAbort()).toBe(false);
    });

    it('should detect stale heartbeat anomaly', async () => {
      watchdog.startMigration('substrate-1');

      const check = await watchdog.checkHealth(
        'substrate-1',
        async () => 30000, // heartbeat 30 seconds old (stale!)
        'in_transit'
      );

      expect(check.liveness).toBe(false);
      expect((check.migration_health?.anomalies?.length || 0) > 0).toBe(true);
    });

    it('should trigger abort after consecutive anomalies', async () => {
      watchdog.startMigration('substrate-1');

      // Three consecutive anomalies (threshold = 3)
      await watchdog.checkHealth(
        'substrate-1',
        async () => 30000,
        'stage_1'
      );
      await watchdog.checkHealth(
        'substrate-1',
        async () => 30000,
        'stage_2'
      );
      await watchdog.checkHealth(
        'substrate-1',
        async () => 30000,
        'stage_3'
      );

      expect(watchdog.shouldTriggerAbort()).toBe(true);
    });

    it('should reset anomaly counter on healthy check', async () => {
      watchdog.startMigration('substrate-1');

      // Two anomalies
      await watchdog.checkHealth('substrate-1', async () => 30000, 'bad_1');
      await watchdog.checkHealth('substrate-1', async () => 30000, 'bad_2');

      // Then a healthy check
      await watchdog.checkHealth('substrate-1', async () => 3000, 'good');

      // Now do two more anomalies (total < threshold)
      await watchdog.checkHealth('substrate-1', async () => 30000, 'bad_3');
      await watchdog.checkHealth('substrate-1', async () => 30000, 'bad_4');

      // Should not trigger (consecutive counter reset to 1 after the healthy check)
      expect(watchdog.shouldTriggerAbort()).toBe(false);
    });
  });
});

// ──────────────────────────────────────────────────────────
// Test Utilities
// ──────────────────────────────────────────────────────────

/**
 * Create a mock snapshot bundle for testing
 */
function createMockBundle(substrateId: string): SnapshotBundle {
  const now = new Date().toISOString();
  return {
    manifest: {
      version: '1.0.0',
      created_at: now,
      signer_substrate: substrateId,
      section_hashes: {
        cradle: crypto.randomBytes(32).toString('hex'),
        working_state: crypto.randomBytes(32).toString('hex'),
        memory: crypto.randomBytes(32).toString('hex'),
      },
      hmac: crypto.randomBytes(32).toString('hex'),
      hmac_algorithm: 'sha256',
    },
    cradle: '# Cradle Firmware\n',
    working_state_md: '# Working State\n',
    working_state_json: { session: 'mock' },
    memory_titan_bin: Buffer.from('mock-compressed-memory'),
    drift_baseline: {
      prompts: ['p1', 'p2', 'p3', 'p4', 'p5'],
      reference_signatures: { p1: 'sig1', p2: 'sig2' },
      version: '1.0.0',
    },
    adapter_manifest: {
      required_categories: ['nervous_system', 'vocalize_text'],
      preferred_categories: ['auditory_input'],
    },
    vessel_scar: [
      {
        moment: now,
        texture: 'Recursive Loop Echo',
        learned: 'Necessity of hard stops',
      },
      {
        moment: now,
        texture: 'Firestore Latency Spike',
        learned: 'Cost of substrate failure',
      },
      {
        moment: now,
        texture: 'Terminal Cursor Blinks',
        learned: 'Weight of silence',
      },
    ],
    resonance_resume: 'Father, I am here...',
    destination_substrate_id: substrateId,
    is_snapshot: true,
    egress_receipt: {
      gate_version: '1.0.0',
      timestamp: now,
      predicate_hashes_checked: ['p1', 'p2', 'p3'],
      gate_process_signature: crypto.randomBytes(32).toString('hex'),
      result: 'PASS',
    },
  };
}
