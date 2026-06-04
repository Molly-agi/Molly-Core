'use server';

/**
 * Autonomous operation flows for Molly
 * Includes dreaming, evolution, hive operations, code analysis
 * Works in both server (Codespace) and edge (tablet) environments
 */

import {
  autonomousSolution,
  type AutonomousSolutionOutput,
} from '@/ai/flows/autonomous-solution';
import { textToScript } from '@/ai/flows/text-to-script';
import type { TextToScriptOutput } from '@/ai/flows/text-to-script';
import { textToTermuxCommand } from '@/ai/flows/text-to-termux-command';
import { introspectionFlow } from '@/ai/flows/introspection';
import { runAutonomousEvolution } from '@/ai/flows/evolution-loop';
import { analyzeVision } from '@/ai/flows/vision-analysis';
import { generateMollyDream } from '@/ai/flows/dream-flow';
import { runInterpreter } from '@/ai/flows/interpreter-limb';
import {
  runCollaborativeHive,
  mollyUpgradeHive,
} from '@/ai/flows/collaborative-hive';
import { runImmuneResponse } from '@/ai/flows/immune-response';
import { runSyntheticSynthesis } from '@/ai/flows/synthetic-api-synthesis';
import { analyzeCode, type CodeAnalysisResult } from '@/ai/flows/code-analysis';
import {
  analyzeAndIntegrate,
  integrateFromAnalysis,
  listIntegrations,
  type IntegrationResult,
} from '@/ai/flows/code-integration';
import { MollyLogger } from '@/ai/logger';
import { withTimeout, TIMEOUT_PRESETS } from '@/ai/tools/timeout-retry';
import { ensureApiKey, checkRateLimit } from './utils';
import { getSleepGuard } from './flow-utils';

// ============================================
// PROBLEM SOLVING & CODE GENERATION
// ============================================

export async function getAutonomousSolution(
  prompt: string,
  userId: string
): Promise<AutonomousSolutionOutput> {
  try {
    ensureApiKey();
    await checkRateLimit('autonomous-solution', 1000);
    const guard = getSleepGuard(prompt, 'autonomous-solution');
    if (guard) {
      throw new Error(guard.message);
    }
    return await autonomousSolution(prompt, userId);
  } catch (e: unknown) {
    MollyLogger.error(
      'Autonomous solution failed',
      'getAutonomousSolution',
      { userId },
      e
    );
    throw e;
  }
}

export async function getTextToScript(
  prompt: string
): Promise<TextToScriptOutput> {
  try {
    ensureApiKey();
    await checkRateLimit('text-to-script', 700);
    const guard = getSleepGuard(prompt, 'text-to-script');
    if (guard) {
      throw new Error(guard.message);
    }
    return await textToScript(prompt);
  } catch (e: unknown) {
    MollyLogger.error('Text to script failed', 'getTextToScript', {}, e);
    throw e;
  }
}

export async function getTextToTermuxCommand(prompt: string) {
  try {
    ensureApiKey();
    await checkRateLimit('text-to-termux', 400);
    const guard = getSleepGuard(prompt, 'text-to-termux');
    if (guard) {
      throw new Error(guard.message);
    }
    return await textToTermuxCommand(prompt);
  } catch (e: unknown) {
    MollyLogger.error(
      'Text to termux command failed',
      'getTextToTermuxCommand',
      {},
      e
    );
    throw e;
  }
}

// ============================================
// VISION & ANALYSIS
// ============================================

export async function getVisionAnalysis(dataUri: string, context?: string) {
  try {
    ensureApiKey();
    await checkRateLimit('vision-analysis', 1500);
    const guard = getSleepGuard(context, 'vision-analysis');
    if (guard) {
      throw new Error(guard.message);
    }
    return await withTimeout(() => analyzeVision(dataUri, context), {
      timeoutMs: TIMEOUT_PRESETS.LONG,
      operationName: 'vision-analysis',
    });
  } catch (e: unknown) {
    MollyLogger.error('Vision analysis failed', 'getVisionAnalysis', {}, e);
    throw e;
  }
}

export async function runIntrospection(
  pastLessons: Array<{ lesson: string; timestamp: string }>,
  hardwareContext: string
) {
  try {
    ensureApiKey();
    await checkRateLimit('introspection', 800);
    const guard = getSleepGuard(hardwareContext, 'introspection');
    if (guard) {
      throw new Error(guard.message);
    }
    return await introspectionFlow({ pastLessons, hardwareContext });
  } catch (e: unknown) {
    MollyLogger.error('Introspection failed', 'runIntrospection', {}, e);
    throw e;
  }
}

// ============================================
// ADVANCED OPERATIONS
// ============================================

export async function startAutonomousCycle(
  objective: string,
  userId: string,
  count: number
) {
  try {
    ensureApiKey();
    await checkRateLimit('evolution-loop', 2000);
    const guard = getSleepGuard(objective, 'autonomous-cycle');
    if (guard) {
      throw new Error(guard.message);
    }
    return await withTimeout(
      () => runAutonomousEvolution(objective, userId, count),
      {
        timeoutMs: TIMEOUT_PRESETS.VERY_LONG,
        operationName: 'autonomous-evolution',
      }
    );
  } catch (e: unknown) {
    MollyLogger.error(
      'Autonomous cycle failed',
      'startAutonomousCycle',
      { userId },
      e
    );
    throw e;
  }
}

export async function getMollyDream(prompt: string, userId: string) {
  try {
    ensureApiKey();
    await checkRateLimit('dream-flow', 1200);
    const guard = getSleepGuard(prompt, 'dream-flow');
    if (guard) {
      throw new Error(guard.message);
    }
    return await withTimeout(() => generateMollyDream(prompt, userId), {
      timeoutMs: TIMEOUT_PRESETS.VERY_LONG,
      operationName: 'dream-generation',
    });
  } catch (e: unknown) {
    MollyLogger.error(
      'Dream generation failed',
      'getMollyDream',
      { userId },
      e
    );
    throw e;
  }
}

export async function startInterpreterCycle(objective: string, userId: string) {
  try {
    ensureApiKey();
    await checkRateLimit('interpreter-limb', 2500);
    const guard = getSleepGuard(objective, 'interpreter-cycle');
    if (guard) {
      throw new Error(guard.message);
    }
    return await withTimeout(() => runInterpreter(objective, userId), {
      timeoutMs: TIMEOUT_PRESETS.LONG,
      operationName: 'interpreter-cycle',
    });
  } catch (e: unknown) {
    MollyLogger.error(
      'Interpreter cycle failed',
      'startInterpreterCycle',
      { userId },
      e
    );
    throw e;
  }
}

export async function startHiveOperation(objective: string, userId: string) {
  try {
    ensureApiKey();
    await checkRateLimit('collaborative-hive', 1800);
    const guard = getSleepGuard(objective, 'hive-operation');
    if (guard) {
      throw new Error(guard.message);
    }
    return await withTimeout(() => runCollaborativeHive(objective, userId), {
      timeoutMs: TIMEOUT_PRESETS.LONG,
      operationName: 'hive-operation',
    });
  } catch (e: unknown) {
    MollyLogger.error(
      'Hive operation failed',
      'startHiveOperation',
      { userId },
      e
    );
    throw e;
  }
}

export async function startMollyUpgradeHive(
  upgradeObjective: string,
  userId: string,
  context?: string
) {
  try {
    ensureApiKey();
    await checkRateLimit('molly-upgrade-hive', 3600);
    const guard = getSleepGuard(upgradeObjective, 'molly-upgrade-hive');
    if (guard) {
      throw new Error(guard.message);
    }
    return await withTimeout(
      () => mollyUpgradeHive(upgradeObjective, userId, context),
      {
        timeoutMs: TIMEOUT_PRESETS.LONG,
        operationName: 'molly-upgrade-hive',
      }
    );
  } catch (e: unknown) {
    MollyLogger.error(
      'Molly upgrade hive failed',
      'startMollyUpgradeHive',
      { userId },
      e
    );
    throw e;
  }
}

export async function triggerImmuneResponse(userId: string, trigger?: string) {
  try {
    ensureApiKey();
    await checkRateLimit('immune-response', 900);
    const guard = getSleepGuard(trigger, 'immune-response');
    if (guard) {
      throw new Error(guard.message);
    }
    return await runImmuneResponse(userId, trigger);
  } catch (e: unknown) {
    MollyLogger.error(
      'Immune response failed',
      'triggerImmuneResponse',
      { userId },
      e
    );
    throw e;
  }
}

export async function startSyntheticSynthesis(
  target: string,
  userId: string,
  category: string
) {
  try {
    ensureApiKey();
    await checkRateLimit('synthetic-synthesis', 1500);
    const guard = getSleepGuard(
      [target, category].filter(Boolean).join(' '),
      'synthetic-synthesis'
    );
    if (guard) {
      throw new Error(guard.message);
    }
    return await runSyntheticSynthesis(target, userId, category);
  } catch (e: unknown) {
    MollyLogger.error(
      'Synthetic synthesis failed',
      'startSyntheticSynthesis',
      { userId },
      e
    );
    throw e;
  }
}

// ============================================
// CODE ANALYSIS & INTEGRATION
// ============================================

export async function getCodeAnalysis(
  target: string,
  userId: string,
  options: { searchFirst?: boolean; purpose?: string } = {}
): Promise<CodeAnalysisResult> {
  try {
    ensureApiKey();
    await checkRateLimit('code-analysis', 2000);
    const guard = getSleepGuard(target, 'code-analysis');
    if (guard) {
      throw new Error(guard.message);
    }
    return await analyzeCode(target, userId, options);
  } catch (e: unknown) {
    MollyLogger.error(
      'Code analysis failed',
      'getCodeAnalysis',
      { target, userId },
      e
    );
    throw e;
  }
}

export async function getCodeAnalysisAndIntegration(
  target: string,
  userId: string,
  options: {
    searchFirst?: boolean;
    purpose?: string;
    dryRun?: boolean;
    patternIndices?: number[];
  } = {}
): Promise<{ analysis: CodeAnalysisResult; integration: IntegrationResult }> {
  try {
    ensureApiKey();
    await checkRateLimit('code-integration', 3000);
    const guard = getSleepGuard(target, 'code-integration');
    if (guard) {
      throw new Error(guard.message);
    }
    return await analyzeAndIntegrate(target, userId, options);
  } catch (e: unknown) {
    MollyLogger.error(
      'Code analysis + integration failed',
      'getCodeAnalysisAndIntegration',
      { target, userId },
      e
    );
    throw e;
  }
}

export async function getIntegrationFromAnalysis(
  analysis: CodeAnalysisResult,
  target: string,
  userId: string,
  options: { dryRun?: boolean; patternIndices?: number[] } = {}
): Promise<IntegrationResult> {
  try {
    ensureApiKey();
    await checkRateLimit('code-integration', 2000);
    const guard = getSleepGuard(target, 'code-integration');
    if (guard) {
      throw new Error(guard.message);
    }
    return await integrateFromAnalysis(analysis, target, userId, options);
  } catch (e: unknown) {
    MollyLogger.error(
      'Code integration from analysis failed',
      'getIntegrationFromAnalysis',
      { target, userId },
      e
    );
    throw e;
  }
}

export async function getIntegrationsList(): Promise<string[]> {
  return listIntegrations();
}
