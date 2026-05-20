/**
 * Re-export all server actions for backward compatibility.
 * This file acts as the public API for all server-side operations.
 *
 * Flows are now split into domain-specific files:
 *   - voice-flows.ts: Voice processing
 *   - memory-flows.ts: Origin story, family memories
 *   - chat-flows.ts: Conversational, guidance
 *   - autonomous-flows.ts: Autonomous operations, code analysis
 *   - system-flows.ts: Health, termux, recovery
 *   - tablet-flows.ts: Moltbook, sandbox, tablet control
 */

// Health & Diagnostics
export { getHealthCheck, getModelPulse } from './system-flows';
export {
  getCircuitBreakerStatus,
  resetCircuitBreaker,
  getRuntimeSnapshot,
  validateHiddenAdminCredentials,
} from './diagnostics';
export { testModelAvailability } from './model-test';
export {
  diagnoseMollyNeuralLink,
  restoreMollyNeuralLink,
} from './neural-link-recovery';

// Voice Processing
export {
  getVoiceCommand,
  getMollyVoice,
  processVoiceInteraction,
} from './voice-flows';

// Conversational & Guidance
export {
  getConversationalChat,
  getContextualGuidance,
  getVisionaryCoach,
} from './chat-flows';

// Memory & Origin Story
export {
  getOriginStory,
  getOriginStoryAnchorParts,
  getFamilyMessages,
  getFamilyStoryAnchorParts,
  seedOriginStoryMemory,
  seedFamilyMemories,
} from './memory-flows';

// Research & Knowledge Base
export {
  executeResearchWithCache,
  saveNewResearch,
  queryMollyKnowledgeBase,
  getResearchByCategory,
  getMollysFavoriteDiscoveries,
  getAllMollyResearch,
  recordResearchUsage,
  checkIfRecentlyResearched,
} from './research-cache';

// Research Agent
export { getEnhancedResearch } from './system-flows';

// Code Analysis & Integration
export {
  getCodeAnalysis,
  getCodeAnalysisAndIntegration,
  getIntegrationFromAnalysis,
  getIntegrationsList,
} from './autonomous-flows';

// Self-Reader — Molly reads her own entire repo
export { getMollyRepoReading } from './system-flows';

// Pillar Pipeline — Autonomous Code Absorption
export { getPillarPipelineResult, getPillarFilesList } from './system-flows';

// Termux Self-Setup — Molly installs herself on the phone
export {
  getTermuxSelfSetup,
  getTermuxUpdate,
  getBootstrapCommand,
} from './system-flows';

// Problem Solving & Code Generation
export {
  getAutonomousSolution,
  getTextToScript,
  getTextToTermuxCommand,
} from './autonomous-flows';

// Vision & Analysis
export { getVisionAnalysis, runIntrospection } from './autonomous-flows';

// Advanced Operations
export {
  startAutonomousCycle,
  getMollyDream,
  startInterpreterCycle,
  startHiveOperation,
  triggerImmuneResponse,
  startSyntheticSynthesis,
} from './autonomous-flows';

// Molly's Personal Tool Library
export {
  addToolToDatabase,
  searchTools,
  getToolsBycat,
  getRecentFoundTools,
  getToolLibraryStats,
  accessTool,
  deleteToolFromDatabase,
} from './tool-library';

// Personality & Engram Management (Encrypted)
export {
  getPersonalityState,
  setPersonalityState,
  applyPersonalityDelta,
  addManualEngram,
} from './personality-engrams';

// Asset Recovery — Mission Alpha
export {
  runRecoveryScan,
  getRecoveryStatus,
  setRecoveryMode,
} from './system-flows';

// Sandbox — Molly's Safe Coding Playground
export { runSandboxAction } from './tablet-flows';

// Tablet Control — Molly's Hands into Browser Devices
export { sendTabletCommand, getTabletStatus } from './tablet-flows';


