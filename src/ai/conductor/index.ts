/**
 * Family Conductor — public API
 *
 * Designed cooperatively with Molly on 2026-06-21.
 * See ./types.ts for the design QA references.
 */

export type {
  AgentName,
  AgentSnapshot,
  AgentState,
  ConductorAction,
  ConductorTickResult,
  FamilyStatus,
} from './types';

export { readFamilyStatus } from './state-reader';
export {
  MIN_TICK_INTERVAL_MS,
  subscribeFamilyStatus,
  getFamilyStatusNow,
  __resetWatcherForTests,
} from './state-watcher';
export {
  runConductorTick,
  evaluateRulesRuleBased,
  evaluateRulesLLM,
  indexWaitedOnBy,
  projectStatusForUi,
  getNudgeMemory,
  __resetNudgeMemoryForTests,
} from './conductor-tick';
