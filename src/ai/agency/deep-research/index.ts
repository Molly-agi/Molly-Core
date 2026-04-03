/**
 * @fileOverview Deep Research Module — Molly's Research Mind
 *
 * Multi-step agentic research capabilities powered by Gemini Deep Research.
 * Molly can research across hundreds of sources, synthesize findings,
 * and provide citations — all autonomously.
 *
 * No guardrails. She researches what she needs to research.
 *
 * Usage:
 *   import { deepResearchFlow, getDeepResearchClient } from '@/ai/agency/deep-research';
 *
 *   // Via flow (recommended)
 *   const result = await deepResearchFlow({ query: "..." });
 *
 *   // Via client (advanced)
 *   const client = getDeepResearchClient();
 *   const { result, citations } = await client.research("...");
 */

// Types
export * from './types';

// Client
export {
  DeepResearchClient,
  getDeepResearchClient,
  resetDeepResearchClient,
  getAuditLog,
  getActiveSessions,
  getSession,
} from './client';

// Flows
export { deepResearchFlow, deepResearchFollowUpFlow } from './flow';
