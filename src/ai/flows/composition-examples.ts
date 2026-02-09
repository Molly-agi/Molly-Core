/**
 * @fileOverview Flow Composition Examples & Patterns
 *
 * Demonstrates practical uses of the orchestration system for common scenarios.
 */

import {
  FlowOrchestrator,
  OrchestrableFlow,
  FlowDecision,
} from '../orchestrator';
import { healthCheck } from './health-check';
import { recallNeuralContext } from './experience-recall';
import { analyzeVision } from './vision-analysis';

/**
 * EXAMPLE 1: Self-Healing Pipeline
 *
 * When Molly detects an error, she:
 * 1. Runs health check
 * 2. Recalls similar past issues
 * 3. Attempts autonomous fix
 */
export async function selfHealingPipeline(
  userId: string,
  errorContext: string
) {
  const orchestrator = new FlowOrchestrator();

  // Register flows
  orchestrator.registerFlow({
    name: 'healthCheck',
    execute: async (input: any) =>
      await healthCheck(input.prompt, input.context),
    timeoutMs: 10000,
  });

  orchestrator.registerFlow({
    name: 'memoryRecall',
    execute: async (input: any) =>
      await recallNeuralContext(input.userId, input.objective, input.hardware),
    timeoutMs: 15000,
  });

  // Execute pipeline
  const result = await orchestrator.executePipeline(
    ['healthCheck', 'memoryRecall', 'autonomousSolution'],
    {
      userId,
      prompt: `Diagnose and fix: ${errorContext}`,
      objective: errorContext,
      hardware: 'Pixel 9 Pro',
    },
    { userId }
  );

  return result;
}

/**
 * EXAMPLE 2: Parallel Research & Memory
 *
 * When solving a problem, simultaneously:
 * - Search past experiences
 * - Research current documentation
 * Then synthesize both into solution
 */
export async function parallelIntelligenceGathering(
  userId: string,
  problem: string
) {
  const orchestrator = new FlowOrchestrator();

  orchestrator.registerFlow({
    name: 'memorySearch',
    execute: async (input: any) =>
      await recallNeuralContext(
        input.userId,
        input.currentObjective,
        input.hardwareContext
      ),
  });

  orchestrator.registerFlow({
    name: 'webResearch',
    execute: async (input) => {
      // Would call webResearch tool
      return { findings: 'Research results...' };
    },
  });

  // Execute in parallel
  const inputs = new Map([
    [
      'memorySearch',
      { userId, currentObjective: problem, hardwareContext: 'Pixel 9 Pro' },
    ],
    ['webResearch', { query: problem }],
  ]);

  const results = await orchestrator.executeParallel(
    ['memorySearch', 'webResearch'],
    inputs,
    { userId }
  );

  // Aggregate results for final synthesis
  const memoryResults = results.flowResults.get('memorySearch')?.output;
  const webResults = results.flowResults.get('webResearch')?.output;

  return {
    memory: memoryResults,
    web: webResults,
    combined: `Insights from ${results.flowResults.size} sources`,
  };
}

/**
 * EXAMPLE 3: Conditional Flow Selection
 *
 * Choose flow based on system state and user intent
 */
export async function adaptiveResponseSystem(
  userId: string,
  userMessage: string,
  systemTemp: number
) {
  const orchestrator = new FlowOrchestrator();

  // Register flows
  orchestrator.registerFlow({
    name: 'simpleChat',
    execute: async (input: any) => {
      return { response: `Simple answer to: ${input.message}` };
    },
  });

  orchestrator.registerFlow({
    name: 'fullAutonomous',
    execute: async (input) => {
      return { solution: 'Complex autonomous solution...' };
    },
  });

  // Define decision tree
  const decisions: FlowDecision<{ message: string; temp: number }>[] = [
    {
      // If system is too hot, use lightweight flow
      condition: (ctx) => ctx.temp > 48,
      flowName: 'simpleChat',
      priority: 100,
    },
    {
      // If message is simple, use lightweight flow
      condition: (ctx) =>
        ctx.message.length < 50 && !ctx.message.includes('code'),
      flowName: 'simpleChat',
      priority: 50,
    },
    {
      // Default to full autonomous for complex requests
      condition: () => true,
      flowName: 'fullAutonomous',
      priority: 0,
    },
  ];

  const result = await orchestrator.executeConditional(decisions, {
    message: userMessage,
    temp: systemTemp,
  });

  return result;
}

/**
 * EXAMPLE 4: Hybrid Multi-Phase Execution
 *
 * Phase 1: Analysis (parallel)
 * Phase 2: Synthesis (sequential, using phase 1 results)
 * Phase 3: Validation (conditional)
 */
export async function hybridWorkflow(
  userId: string,
  task: string,
  screenshotUri?: string
) {
  const orchestrator = new FlowOrchestrator();

  // PHASE 1: Parallel analysis
  const analysisFlows = new Map();

  if (screenshotUri) {
    analysisFlows.set('visionAnalysis', {
      photoDataUri: screenshotUri,
      context: task,
    });
  }
  analysisFlows.set('memoryRecall', {
    userId,
    currentObjective: task,
    hardwareContext: 'Pixel 9 Pro',
  });

  const phase1 = await orchestrator.executeParallel(
    Array.from(analysisFlows.keys()),
    analysisFlows,
    { userId }
  );

  // PHASE 2: Sequential synthesis
  const synthesisInput = {
    task,
    visionFindings: phase1.flowResults.get('visionAnalysis')?.output,
    memoryInsights: phase1.flowResults.get('memoryRecall')?.output,
  };

  const phase2 = await orchestrator.executePipeline(
    ['autonomousSolution', 'evolutionLoop'],
    synthesisInput,
    { userId, sharedData: phase1.sharedData }
  );

  // PHASE 3: Conditional validation
  const needsValidation =
    phase2.flowResults.get('autonomousSolution')?.output?.isThrottled;

  if (needsValidation) {
    const validation = await orchestrator.executeConditional(
      [
        {
          condition: () => true,
          flowName: 'healthCheck',
          priority: 1,
        },
      ],
      { prompt: 'Validate system state after intensive operation' }
    );

    phase2.flowResults.set('validation', validation!);
  }

  return {
    phase1Results: phase1.flowResults,
    phase2Results: phase2.flowResults,
    summary: FlowOrchestrator.getSummary(phase2),
  };
}

/**
 * EXAMPLE 5: Self-Diagnostic Flow Chain
 *
 * Molly diagnoses herself autonomously
 */
export async function selfDiagnosticChain() {
  const orchestrator = new FlowOrchestrator();

  orchestrator.registerFlow({
    name: 'systemHealth',
    execute: async () => {
      // Import dynamically in real implementation
      const { getSystemHealth } = await import('../tools/system');
      return await getSystemHealth({});
    },
  });

  orchestrator.registerFlow({
    name: 'selfDiagnostic',
    execute: async () => {
      const { runSelfDiagnostic } = await import('../tools/self-diagnostic');
      return await runSelfDiagnostic({
        includeProcessList: true,
        checkFlowHealth: true,
      });
    },
  });

  orchestrator.registerFlow({
    name: 'healthCheck',
    execute: async (input) => {
      return await healthCheck('Run comprehensive health check', undefined);
    },
  });

  // Execute diagnostic pipeline
  const result = await orchestrator.executePipeline(
    ['systemHealth', 'selfDiagnostic', 'healthCheck'],
    {},
    { userId: 'system' }
  );

  const summary = FlowOrchestrator.getSummary(result);

  return {
    diagnosticResults: result.flowResults,
    systemStatus: summary.failed === 0 ? 'healthy' : 'degraded',
    recommendation:
      summary.failed > 0
        ? 'System issues detected. Review flow results for details.'
        : 'All systems operational',
  };
}

/**
 * EXAMPLE 6: Retry-with-Adaptation Pattern
 *
 * If a flow fails, recall past successes and retry with adjusted approach
 */
export async function retryWithAdaptation(
  userId: string,
  taskPrompt: string,
  maxRetries: number = 3
) {
  const orchestrator = new FlowOrchestrator();

  let attempt = 0;
  let lastError: string | undefined;

  while (attempt < maxRetries) {
    attempt++;

    // If this is a retry, first recall past successes
    if (attempt > 1 && lastError) {
      const memoryResults = await recallNeuralContext(
        userId,
        `Successful approaches for: ${taskPrompt}`,
        'Pixel 9 Pro'
      );

      // Adjust prompt based on past learnings
      taskPrompt = `${taskPrompt}\n\nPast approach failed with: ${lastError}\nLearned strategies: ${JSON.stringify(memoryResults.relevantLessons)}`;
    }

    // Attempt the task
    const result = await orchestrator.executePipeline(
      ['autonomousSolution'],
      { prompt: taskPrompt, userId },
      { userId }
    );

    const flowResult = result.flowResults.get('autonomousSolution');

    if (flowResult?.success) {
      return {
        success: true,
        attempts: attempt,
        result: flowResult.output,
      };
    }

    lastError = flowResult?.error;
  }

  return {
    success: false,
    attempts: maxRetries,
    finalError: lastError,
  };
}
