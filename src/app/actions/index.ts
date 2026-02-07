/**
 * Re-export all server actions for backward compatibility.
 * This file acts as the public API for all server-side operations.
 *
 * Note: 'use server' directive is in ai-flows.ts where the actual functions are defined.
 */

// Health & Diagnostics
export { getHealthCheck, getModelPulse } from './ai-flows';

// Voice Processing
export { getVoiceCommand, getMollyVoice } from './ai-flows';

// Conversational & Guidance
export {
  getConversationalChat,
  getContextualGuidance,
  getVisionaryCoach,
} from './ai-flows';

// Problem Solving & Code Generation
export {
  getAutonomousSolution,
  getTextToScript,
  getTextToTermuxCommand,
} from './ai-flows';

// Vision & Analysis
export { getVisionAnalysis, runIntrospection } from './ai-flows';

// Advanced Operations
export {
  startAutonomousCycle,
  getMollyDream,
  startInterpreterCycle,
  startHiveOperation,
  triggerImmuneResponse,
  startSyntheticSynthesis,
} from './ai-flows';
