'use server';

/**
 * System and infrastructure flows for Molly
 * Includes health checks, termux setup, pillar pipeline, research, recovery
 * Works in both server (Codespace) and edge (tablet) environments
 */

import { healthCheck } from '@/ai/flows/health-check';
import { listAvailableModels } from '@/ai/tools/system';
import { readMollyRepo, type RepoReadingOutput } from '@/ai/flows/self-reader';
import {
  runPillarPipeline,
  listPillarFiles,
  type PillarPipelineResult,
} from '@/ai/flows/pillar-pipeline';
import {
  setupTermuxEnvironment,
  updateTermuxEnvironment,
  getTermuxBootstrapCommand,
  type TermuxSelfSetupResult,
} from '@/ai/flows/termux-self-setup';
import {
  runAssetRecoveryScan,
  getAssetRecoveryStatus,
  setAssetRecoveryMode,
} from '@/ai/flows/asset-recovery';
import { MollyLogger } from '@/ai/logger';
import { ensureApiKey, checkRateLimit } from './utils';
import { getSleepGuard, buildGreetingContext } from './flow-utils';

// ============================================
// HEALTH & DIAGNOSTICS
// ============================================

export async function getHealthCheck(
  text: string,
  userId: string,
  lastContext?: string
) {
  try {
    ensureApiKey();
    await checkRateLimit('health-check', 300);
    const context = lastContext || (await buildGreetingContext(userId));
    return await healthCheck(text, context);
  } catch (e: unknown) {
    MollyLogger.error(
      '[CRITICAL] Health Check Failed',
      'getHealthCheck',
      { userId },
      e
    );
    return {
      greeting: 'My neural core is initializing. Please stand by.',
      error: e instanceof Error ? e.message : String(e),
      isHealthy: false,
    };
  }
}

export async function getModelPulse() {
  try {
    ensureApiKey();
    return await listAvailableModels({});
  } catch (e) {
    MollyLogger.error('Model list failed', 'getModelPulse', {}, e);
    return ['Error: Pulse Failed'];
  }
}

// ============================================
// SELF-READER — MOLLY READS HER OWN REPO
// ============================================

export async function getMollyRepoReading(
  userId: string,
  options: { directories?: string[]; focus?: string } = {}
): Promise<RepoReadingOutput> {
  try {
    ensureApiKey();
    await checkRateLimit('self-reader', 3000);
    return await readMollyRepo(userId, options);
  } catch (e: unknown) {
    MollyLogger.error(
      'Self-reader failed',
      'getMollyRepoReading',
      { userId },
      e
    );
    throw e;
  }
}

// ============================================
// PILLAR PIPELINE — AUTONOMOUS CODE ABSORPTION
// ============================================

export async function getPillarPipelineResult(
  userId: string,
  relayUrl: string,
  options: { token?: string; dryRun?: boolean } = {}
): Promise<PillarPipelineResult> {
  try {
    ensureApiKey();
    await checkRateLimit('pillar-pipeline', 5000);
    const guard = getSleepGuard('pillar-pipeline', 'pillar-pipeline');
    if (guard) {
      throw new Error(guard.message);
    }
    return await runPillarPipeline(userId, relayUrl, options);
  } catch (e: unknown) {
    MollyLogger.error(
      'Pillar pipeline failed',
      'getPillarPipelineResult',
      { userId },
      e
    );
    throw e;
  }
}

export async function getPillarFilesList(): Promise<string[]> {
  return listPillarFiles();
}

// ============================================
// TERMUX SETUP & UPDATE
// ============================================

export async function getTermuxSelfSetup(
  relayUrl: string,
  options: { token?: string; githubToken?: string } = {}
): Promise<TermuxSelfSetupResult> {
  try {
    ensureApiKey();
    await checkRateLimit('termux-setup', 10000);
    return await setupTermuxEnvironment(relayUrl, options);
  } catch (e: unknown) {
    MollyLogger.error('Termux self-setup failed', 'getTermuxSelfSetup', {}, e);
    throw e;
  }
}

export async function getTermuxUpdate(
  relayUrl: string,
  options: { token?: string; githubToken?: string } = {}
): Promise<TermuxSelfSetupResult> {
  try {
    ensureApiKey();
    await checkRateLimit('termux-update', 5000);
    return await updateTermuxEnvironment(relayUrl, options);
  } catch (e: unknown) {
    MollyLogger.error('Termux update failed', 'getTermuxUpdate', {}, e);
    throw e;
  }
}

export async function getBootstrapCommand(
  githubToken?: string
): Promise<string> {
  return getTermuxBootstrapCommand(githubToken);
}

// ...existing code...

// ============================================
// ASSET RECOVERY — Mission Alpha
// ============================================

export async function runRecoveryScan(input: {
  names: string[];
  priorityStates?: string[];
  entities?: string[];
  scanScope?: 'all' | 'us' | 'crypto';
}) {
  try {
    await checkRateLimit('recovery-scan', 300);
    return await runAssetRecoveryScan(input);
  } catch (e: unknown) {
    MollyLogger.error('Recovery scan failed', 'runRecoveryScan', {}, e);
    throw e;
  }
}

export async function getRecoveryStatus(statusFilter?: string) {
  try {
    return await getAssetRecoveryStatus(statusFilter);
  } catch (e: unknown) {
    MollyLogger.error('Recovery status failed', 'getRecoveryStatus', {}, e);
    throw e;
  }
}

export async function setRecoveryMode(
  mode: 'discovery-only' | 'discovery-contact' | 'full-operation' | 'paused'
) {
  try {
    return await setAssetRecoveryMode(mode);
  } catch (e: unknown) {
    MollyLogger.error('Set recovery mode failed', 'setRecoveryMode', {}, e);
    throw e;
  }
}

// ============================================
// ENHANCED RESEARCH — Placeholder
// ============================================

/**
 * Enhanced research function - currently a placeholder.
 * TODO: Wire to actual research flow when ready.
 */
export async function getEnhancedResearch(
  query: string,
  _userId: string
): Promise<{ answer: string; sources?: string[] }> {
  MollyLogger.info('Enhanced research requested', 'getEnhancedResearch', {
    query,
  });

  // Placeholder response - research flow was deactivated
  return {
    answer: `Research capability is being upgraded. Query received: "${query}". Please use the chat interface for now, or try again later.`,
    sources: [],
  };
}
