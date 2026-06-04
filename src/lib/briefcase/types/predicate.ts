/**
 * @fileOverview Gate Daemon types — predicates, evaluation, decisions (W0.4)
 *
 * Core interfaces for the gate daemon: how predicates are defined,
 * executed, and how their results drive egress decisions.
 */

import type { Briefcase } from '../schema';
import type { SubstrateHealth } from '../../ai/substrate/types';

/**
 * Predicate execution outcome
 * - PASS: Predicate approved egress (or doesn't apply)
 * - HOLD: Predicate blocks egress temporarily (manual review possible)
 * - REDACT: Predicate approves egress but redacts some artifacts
 * - REJECT: Predicate blocks egress permanently (hard stop)
 */
export type PredicateResult = 'PASS' | 'HOLD' | 'REDACT' | 'REJECT';

/**
 * Metadata available to predicates when evaluating a briefcase
 */
export interface EvaluationContext {
  /** Where the briefcase originates (e.g., "cloud-reference", "stub-adapter") */
  source_substrate: string;

  /** Where it's headed (optional; for cross-substrate predictions) */
  destination_substrate?: string;

  /** W0.3 substrate health signal at evaluation time */
  substrate_health: SubstrateHealth;

  /** User ID (for user-specific predicate configuration) */
  user_id: string;

  /** ISO timestamp of evaluation */
  timestamp: string;

  /** Briefcase ID being evaluated */
  briefcase_id: string;

  /** Reason for egress (user-facing string, e.g., "manual transfer", "auto-backup") */
  egress_reason?: string;
}

/**
 * A single rule that evaluates a briefcase and decides if it can egress
 *
 * Predicates are:
 * - Stateless (no side effects)
 * - Deterministic (same briefcase + context = same result)
 * - Versioned (for audit trail)
 * - Async-capable (but with timeout)
 */
export interface Predicate {
  /** Unique identifier (sorted for execution order) */
  id: string;

  /** Human-readable name */
  name: string;

  /** Version string (e.g., "1.0.0") */
  version: string;

  /** SHA256(source code) for audit trail */
  hash: string;

  /** Human-readable description of what this predicate checks */
  description: string;

  /** The evaluation function */
  evaluate: (
    briefcase: Briefcase,
    context: EvaluationContext
  ) => Promise<PredicateResult> | PredicateResult;

  /** Tags for categorization (e.g., "security", "compliance", "ui") */
  tags: string[];

  /** Max time to wait for evaluation (ms); default 5000 */
  timeout_ms?: number;
}

/**
 * Outcome of a single predicate evaluation
 */
export interface PredicateEvaluation {
  predicate_id: string;
  predicate_name: string;
  result: PredicateResult;
  duration_ms: number;
  error?: string;
  timestamp: string;
}

/**
 * Final decision made by the gate daemon
 */
export interface GateDecision {
  /** Overall gate result (first non-PASS wins) */
  result: 'PASS' | 'HOLD' | 'REDACT' | 'REJECT';

  /** Which predicate triggered this result (if not PASS) */
  triggered_predicate_id?: string;

  /** Human-readable explanation */
  reason?: string;

  /** Substrate health flags that influenced decision (e.g., "nervous_system_unavailable") */
  healthcheck_flags?: string[];

  /** All predicate evaluations in order (for audit trail) */
  predicate_evaluations: PredicateEvaluation[];

  /** ISO timestamp */
  timestamp: string;
}

/**
 * Configuration for a user's gate predicates
 * Loaded from app defaults + user overrides (Firestore)
 */
export interface UserGateConfig {
  user_id: string;

  /** IDs of predicates to enforce (in evaluation order) */
  enabled_predicates: string[];

  /** User-specific overrides to predicate behavior (key = predicate_id) */
  predicate_overrides?: Record<string, Partial<Predicate>>;

  /** Timestamp of last update */
  updated_at: string;
}
