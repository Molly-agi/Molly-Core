/**
 * @fileOverview Predicate Registry — storage and loading of gate predicates (W0.4)
 *
 * Manages the set of predicates available to the gate daemon.
 * Sources: app defaults + user Firestore overrides.
 */

import type { Predicate, UserGateConfig } from './types/predicate';

/**
 * Predicate Registry: Central store for all available predicates
 */
export class PredicateRegistry {
  private predicates: Map<string, Predicate> = new Map();

  /**
   * Register a predicate
   */
  register(predicate: Predicate): void {
    if (this.predicates.has(predicate.id)) {
      throw new Error(`Predicate ${predicate.id} already registered`);
    }
    this.predicates.set(predicate.id, predicate);
  }

  /**
   * Get a predicate by ID
   */
  get(id: string): Predicate | undefined {
    return this.predicates.get(id);
  }

  /**
   * Get all predicates
   */
  getAll(): Predicate[] {
    return Array.from(this.predicates.values());
  }

  /**
   * Get predicates by tag (e.g., "security", "ui")
   */
  getByTag(tag: string): Predicate[] {
    return Array.from(this.predicates.values()).filter((p) =>
      p.tags.includes(tag)
    );
  }

  /**
   * Load user configuration for which predicates to enforce
   * Returns predicates in user config, sorted by ID (F4.1)
   */
  loadForUser(config: UserGateConfig): Predicate[] {
    const result: Predicate[] = [];

    for (const pred_id of config.enabled_predicates.sort()) {
      const pred = this.predicates.get(pred_id);
      if (!pred) {
        console.warn(`[PredicateRegistry] Predicate ${pred_id} not found`);
        continue;
      }

      // Apply user overrides if present
      if (config.predicate_overrides?.[pred_id]) {
        const override = config.predicate_overrides[pred_id];
        result.push({ ...pred, ...override });
      } else {
        result.push(pred);
      }
    }

    return result;
  }
}

/**
 * Global singleton predicate registry
 */
let global_registry: PredicateRegistry | null = null;

/**
 * Get or create the global registry
 */
export function getGlobalRegistry(): PredicateRegistry {
  if (!global_registry) {
    global_registry = new PredicateRegistry();
  }
  return global_registry;
}

/**
 * Initialize global registry with default predicates
 * (Called once at app startup)
 */
export function initializeDefaultPredicates(): void {
  const registry = getGlobalRegistry();

  // Default predicate set (will expand as W0.4 develops)
  // These are placeholder definitions; real predicates are implemented per requirement

  const default_predicates: Predicate[] = [
    {
      id: 'manifest-integrity',
      name: 'Manifest Integrity Check',
      version: '1.0.0',
      hash: '', // Will be computed from source
      description:
        'Verifies manifest HMAC is valid and all required artifacts present',
      tags: ['security', 'mandatory'],
      timeout_ms: 1000,
      evaluate: async (_briefcase, _context) => {
        // TODO: Implement manifest validation
        return 'PASS';
      },
    },
  ];

  for (const pred of default_predicates) {
    registry.register(pred);
  }
}
