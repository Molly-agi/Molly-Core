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

export interface AgencyRuntime {
  registry: ParameterRegistry;
  governor: CognitiveGovernor;
}

let runtime: AgencyRuntime | null = null;

export function initAgencyRuntime(): AgencyRuntime {
  if (runtime) return runtime;
  const registry = new ParameterRegistry();
  const governor = new CognitiveGovernor(registry); // defines + owns its params
  runtime = { registry, governor };
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
