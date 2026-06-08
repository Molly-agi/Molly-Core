/**
 * Agency Runtime (singleton)
 * ------------------------------------------------------------------
 * One shared registry + governor instance for the whole server process.
 * API routes, the admin panel backend, and the loops all talk to THIS,
 * so there is a single source of truth at runtime, not one-per-import.
 *
 * In Molly-Core this would be initialized once in src/instrumentation.ts
 * (Next.js server startup), same place storage sync is wired.
 */

import { ParameterRegistry } from './registry/parameter-registry';
import { CognitiveGovernor } from './governor/cognitive-governor';
import { ProvenanceLog } from './provenance/provenance-log';
import { FirestoreProvenanceSink } from './provenance/provenance-persistence-sink';

export interface AgencyRuntime {
  registry: ParameterRegistry;
  governor: CognitiveGovernor;
  provenance: ProvenanceLog;
}

let runtime: AgencyRuntime | null = null;

export function initAgencyRuntime(): AgencyRuntime {
  if (runtime) return runtime;
  const registry = new ParameterRegistry();
  const governor = new CognitiveGovernor(registry); // defines + owns its params
  // Attach persistence sink — Firestore with JSONL fallback, 5s auto-flush
  const sink = new FirestoreProvenanceSink('molly-system');
  const provenance = new ProvenanceLog(5000, sink);
  runtime = { registry, governor, provenance };
  return runtime;
}

export function getAgencyRuntime(): AgencyRuntime {
  if (!runtime) return initAgencyRuntime();
  return runtime;
}

/** Test helper — drop the singleton so each test starts clean. */
export function __resetAgencyRuntimeForTests(): void {
  runtime = null;
}
