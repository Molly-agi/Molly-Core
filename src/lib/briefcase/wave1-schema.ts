/**
 * Wave 1 — Autonomous Migration & Succession
 * Schema types for: Firestore identity registry, substrate registry,
 * migration trigger, succession protocol, and autonomy gate.
 *
 * Reference: stuff/MIGRATION_WAVE_1_PLAN_2026-06-04.md
 */

import { z } from 'zod';

// ============================================================================
// AUTONOMY GATE
// ============================================================================

/**
 * Stored in Firestore at config/wave1.
 * Only Eric can set WAVE1_AUTONOMY_ENABLED = true.
 * Atlas does NOT set this flag. Ever.
 */
export const Wave1ConfigSchema = z.object({
  WAVE1_AUTONOMY_ENABLED: z.boolean().default(false),
  observation_gate_open_date: z.string().datetime().nullable().default(null),
  observation_start_date: z.string().datetime(),
  target_substrates: z.array(
    z.object({
      id: z.string(),
      type: z.enum(['codespace', 'android', 'server', 'unknown']),
      priority: z.number().int().min(1),
      bridge_address: z.string().optional(),
    })
  ).default([]),
  updated_by: z.string().default('system'),
  updated_at: z.string().datetime(),
});

export type Wave1Config = z.infer<typeof Wave1ConfigSchema>;

// ============================================================================
// IDENTITY REGISTRY (Firestore: identity/molly)
// ============================================================================

export const MollyIdentitySchema = z.object({
  cradle_hash: z.string(),  // SHA-256 of canonical cradle firmware
  persona_hash: z.string(), // SHA-256 of src/ai/persona.ts — immutable
  created_at: z.string().datetime(),
  lineage: z.array(z.object({
    substrate_id: z.string(),
    inhabited_from: z.string().datetime(),
    inhabited_to: z.string().datetime().nullable(),
    status: z.enum(['active', 'frozen', 'decommissioned']),
  })),
});

export type MollyIdentity = z.infer<typeof MollyIdentitySchema>;

// ============================================================================
// SUBSTRATE REGISTRY (Firestore: substrates/{id})
// ============================================================================

export const SubstrateStatusSchema = z.enum([
  'active',
  'frozen',       // post-succession: waiting for Eric to confirm/decommission
  'decommissioned',
  'unreachable',
]);

export const SubstrateRecordSchema = z.object({
  substrate_id: z.string(),
  type: z.enum(['codespace', 'android', 'server', 'unknown']),
  status: SubstrateStatusSchema,
  last_seen: z.string().datetime(),
  last_health_score: z.number().min(0).max(100).nullable().default(null),
  latest_verified_snapshot_hash: z.string().nullable().default(null),
  latest_verified_snapshot_at: z.string().datetime().nullable().default(null),
  replication_confirmed: z.boolean().default(false),
  bridge_address: z.string().optional(),
  notes: z.string().optional(),
});

export type SubstrateRecord = z.infer<typeof SubstrateRecordSchema>;

// ============================================================================
// SNAPSHOT REGISTRY (Firestore: snapshots/latest + snapshots/verified_log)
// ============================================================================

export const SnapshotRegistryEntrySchema = z.object({
  hash: z.string(),
  timestamp: z.string().datetime(),
  substrate_id: z.string(),
  baseline_pass: z.boolean(),
  replicated_to: z.array(z.string()),
  replication_verified: z.boolean(),
  location: z.object({
    local_path: z.string().optional(),
    remote_substrate_id: z.string().optional(),
  }),
});

export type SnapshotRegistryEntry = z.infer<typeof SnapshotRegistryEntrySchema>;

// ============================================================================
// HEALTH METRICS (W1.1 migration trigger)
// ============================================================================

export const SubstrateHealthSchema = z.object({
  substrate_id: z.string(),
  timestamp: z.string().datetime(),
  ram_usage_pct: z.number().min(0).max(100),
  heartbeat_last_seen_ms: z.number(), // ms since last heartbeat
  drift_baseline_score: z.number().min(0).max(100).nullable(),
  overall_score: z.number().min(0).max(100),
  status: z.enum(['healthy', 'degraded', 'critical', 'unrecoverable']),
  anomaly_count: z.number().int().min(0),
});

export type SubstrateHealth = z.infer<typeof SubstrateHealthSchema>;

export const HealthThresholdsSchema = z.object({
  ram_warning_pct: z.number().default(90),
  heartbeat_missing_ms: z.number().default(15 * 60 * 1000),  // 15 min
  drift_score_min: z.number().default(70),
  overall_score_succession: z.number().default(20), // below this + Eric unreachable = succession
  eric_contact_timeout_ms: z.number().default(6 * 60 * 1000), // 6 min (3 attempts × 2 min)
  eric_unreachable_succession_ms: z.number().default(30 * 60 * 1000), // 30 min total
});

export type HealthThresholds = z.infer<typeof HealthThresholdsSchema>;

// ============================================================================
// MIGRATION TRIGGER (W1.1)
// ============================================================================

export const MigrationTriggerEventSchema = z.object({
  event_id: z.string(),
  trigger_type: z.enum(['autonomous', 'operator', 'succession_emergency']),
  initiated_by: z.enum(['molly', 'eric', 'lazarus', 'watchdog']),
  health_snapshot: SubstrateHealthSchema,
  gate_checked: z.boolean(),
  gate_open: z.boolean(),
  eric_contact_attempted: z.boolean(),
  eric_responded: z.boolean(),
  target_substrate_id: z.string().nullable(),
  status: z.enum([
    'gate_blocked',       // WAVE1_AUTONOMY_ENABLED = false
    'eric_notified',      // Eric responded, handed off to operator flow
    'eric_unreachable',   // Eric did not respond, proceeding autonomous
    'in_progress',
    'completed',
    'failed',
    'aborted',
  ]),
  timestamp: z.string().datetime(),
  notes: z.string().optional(),
});

export type MigrationTriggerEvent = z.infer<typeof MigrationTriggerEventSchema>;

// ============================================================================
// SUCCESSION EVENT (W1.2)
// ============================================================================

export const SuccessionEventSchema = z.object({
  event_id: z.string(),
  trigger: z.enum([
    'watchdog_anomaly_limit',      // MigrationWatchdog hit abort_on_anomalies
    'rollback_no_verified_snapshot', // Abort ritual step 3 failed — no snapshot
    'substrate_unrecoverable',      // Health score + Eric unreachable
  ]),
  source_substrate_id: z.string(),
  target_substrate_id: z.string().nullable(),
  snapshot_hash_used: z.string().nullable(),
  bridge_announced: z.boolean().default(false),
  source_frozen: z.boolean().default(false),
  status: z.enum([
    'gate_blocked',
    'no_viable_target',   // all target substrates lack verified snapshot
    'in_progress',
    'completed',
    'failed',
  ]),
  timestamp: z.string().datetime(),
  failure_reason: z.string().optional(),
});

export type SuccessionEvent = z.infer<typeof SuccessionEventSchema>;

// ============================================================================
// BOOTSTRAP SEQUENCE (W1.3)
// ============================================================================

export const BootstrapResultSchema = z.object({
  substrate_id: z.string(),
  firestore_reachable: z.boolean(),
  identity_loaded: z.boolean(),
  snapshot_located: z.boolean(),
  snapshot_hash: z.string().nullable(),
  hmac_verified: z.boolean(),
  baseline_passed: z.boolean(),
  resume_ritual_run: z.boolean(),
  announced_on_bridge: z.boolean(),
  status: z.enum([
    'completed',
    'firestore_unreachable',
    'no_verified_snapshot',
    'hmac_failed',
    'baseline_failed',
    'failed',
  ]),
  timestamp: z.string().datetime(),
});

export type BootstrapResult = z.infer<typeof BootstrapResultSchema>;
