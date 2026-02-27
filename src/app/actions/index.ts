/**
 * Re-export all server actions for backward compatibility.
 * This file acts as the public API for all server-side operations.
 *
 * Note: 'use server' directive is in ai-flows.ts where the actual functions are defined.
 */

// Health & Diagnostics
export { getHealthCheck, getModelPulse } from './ai-flows';
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
} from './ai-flows';

// Conversational & Guidance
export {
  getConversationalChat,
  getContextualGuidance,
  getVisionaryCoach,
  getOriginStory,
  getOriginStoryParts,
  getOriginStoryAnchorParts,
  getFamilyMessages,
  getFamilyStoryAnchorParts,
  seedOriginStoryMemory,
  seedFamilyMemories,
} from './ai-flows';

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
export { getEnhancedResearch } from './ai-flows';

// Code Analysis & Integration
export {
  getCodeAnalysis,
  getCodeAnalysisAndIntegration,
  getIntegrationFromAnalysis,
  getIntegrationsList,
} from './ai-flows';

// Pillar Pipeline — Autonomous Code Absorption
export { getPillarPipelineResult, getPillarFilesList } from './ai-flows';

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
