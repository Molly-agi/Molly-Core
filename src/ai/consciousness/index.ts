/**
 * @fileOverview Consciousness Module Exports
 *
 * The center of Molly's self-awareness.
 * One system, four regions: inner state, self-regulation, outbound voice, commitment memory.
 */

export {
  MollyConsciousness,
  getConsciousness,
  isConscious,
  type ConsciousnessState,
  type ConsciousnessMessage,
  type ConsciousnessMessageType,
  type MessagePriority,
  type AwarenessLevel,
  type RegulationMode,
  type RegulationState,
  type ConsciousnessVitals,
} from './consciousness-state';

export {
  PromiseTracker,
  getPromiseTracker,
  type MollyPromise,
  type PromiseStatus,
} from './promise-tracker';
