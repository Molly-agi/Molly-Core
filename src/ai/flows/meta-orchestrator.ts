'use server';
/**
 * @fileOverview Meta-Orchestrator Flow - Molly's Strategic Flow Composer
 *
 * This is a high-level flow that analyzes user requests and intelligently
 * selects and composes the appropriate flows to handle complex tasks.
 *
 * Think of this as Molly's "strategic brain" that breaks down complex
 * objectives into flow pipelines and parallel operations.
 */

import { ai, MODEL_PRO } from '@/ai/genkit';
import { z } from 'zod';
import { FlowOrchestrator, OrchestrationContext } from '../orchestrator';
import { withGenerateErrorHandling } from '../error-handler';
import { MollyLogger, generateTraceId } from '../logger';
import { getSystemHealth } from '../tools/system';

/**
 * Intent classification for flow selection
 */
const IntentSchema = z.object({
  primaryIntent: z.enum([
    'autonomous_solution', // Complex technical problem-solving
    'conversational_chat', // Simple Q&A or conversation
    'memory_recall', // Searching past experiences
    'vision_analysis', // Screenshot/image analysis
    'health_diagnostic', // System health check
    'evolution_task', // Code generation/evolution
    'research', // Web/GitHub research needed
    'multi_step', // Requires multiple flows
  ]),
  confidence: z.number().min(0).max(1),
  requiresMemory: z.boolean(),
  requiresVision: z.boolean(),
  requiresResearch: z.boolean(),
  complexity: z.enum(['simple', 'moderate', 'complex']),
  suggestedFlows: z.array(z.string()),
  reasoningPath: z.string(),
});

/**
 * Meta-orchestrator input
 */
const MetaOrchestratorInputSchema = z.object({
  userRequest: z.string(),
  userId: z.string(),
  sessionId: z.string().optional(),
  contextWindow: z.array(z.any()).optional(),
  screenshotUri: z.string().optional(),
});

/**
 * Meta-orchestrator output
 */
const MetaOrchestratorOutputSchema = z.object({
  intent: IntentSchema,
  executionPlan: z.object({
    strategy: z.enum(['single', 'pipeline', 'parallel', 'hybrid']),
    flows: z.array(z.string()),
    reasoning: z.string(),
  }),
  results: z.any(),
  summary: z.object({
    total: z.number(),
    successful: z.number(),
    failed: z.number(),
    totalDurationMs: z.number(),
  }),
  recommendation: z.string().optional(),
});

export const metaOrchestratorFlow = ai.defineFlow(
  {
    name: 'metaOrchestrator',
    inputSchema: MetaOrchestratorInputSchema,
    outputSchema: MetaOrchestratorOutputSchema,
  },
  async ({ userRequest, userId, contextWindow, screenshotUri }) => {
    const traceId = generateTraceId();
    MollyLogger.logFlowStart(
      'metaOrchestrator',
      { userId, userRequest },
      traceId
    );

    // Phase 1: Analyze intent and plan flow composition
    const intentAnalysis = await withGenerateErrorHandling(
      async () =>
        await ai.generate({
          model: MODEL_PRO,
          system: `You are Molly's Strategic Orchestration Engine.
Analyze the user's request and determine which flows should be executed and in what order.

Available Flows:
- autonomousSolution: Complex technical problem-solving, code generation, system operations
- conversationalChat: Simple questions, casual conversation, explanations
- experienceRecall: Search past memories and lessons learned
- visionAnalysis: Analyze screenshots or images
- healthCheck: System diagnostics and health monitoring
- evolutionLoop: Iterative development with learning
- interpreterLimb: Code execution and testing
- immuneResponse: Self-healing and error recovery

Consider:
- Task complexity (simple queries don't need autonomous solution)
- Whether memory/vision/research is needed
- Whether flows should run sequentially or in parallel
- System thermal/CPU state for resource planning`,
          prompt: `Analyze this request and create an execution plan:

USER REQUEST: "${userRequest}"

${contextWindow ? `CONVERSATION CONTEXT: ${JSON.stringify(contextWindow.slice(-3))}` : ''}
${screenshotUri ? 'SCREENSHOT PROVIDED: Yes' : ''}

Determine the intent, required capabilities, and optimal flow composition.`,
          output: { schema: IntentSchema },
        }),
      'metaOrchestrator',
      traceId
    );

    const intent = intentAnalysis.output!;

    MollyLogger.info('Intent analyzed', 'metaOrchestrator', {
      intent: intent.primaryIntent,
      complexity: intent.complexity,
      suggestedFlows: intent.suggestedFlows,
      traceId,
    });

    // Phase 2: Check system resources
    let systemHealth;
    try {
      systemHealth = await getSystemHealth({});
    } catch {
      systemHealth = {
        temperature: 50,
        cpuUsage: 50,
        throttlingStatus: 'Unknown',
      };
    }

    // Phase 3: Build execution plan
    const executionPlan = await buildExecutionPlan(intent, systemHealth, {
      userRequest,
      userId,
      screenshotUri,
    });

    MollyLogger.info('Execution plan created', 'metaOrchestrator', {
      strategy: executionPlan.strategy,
      flows: executionPlan.flows,
      traceId,
    });

    // Phase 4: Execute flows based on strategy
    let orchestrationResult: OrchestrationContext;
    const orchestrator = new FlowOrchestrator(traceId);

    // Register available flows (in a real implementation, these would be imported)
    // For now, we'll create placeholders showing the pattern

    switch (executionPlan.strategy) {
      case 'single':
        // Execute single flow (e.g., just conversationalChat)
        orchestrationResult = await executeSingleStrategy(
          orchestrator,
          executionPlan.flows[0] || intent.primaryIntent,
          { userRequest, userId, screenshotUri }
        );
        break;

      case 'pipeline':
        // Execute flows sequentially (e.g., recall → analyze → respond)
        orchestrationResult = await executePipelineStrategy(
          orchestrator,
          executionPlan.flows,
          { userRequest, userId, screenshotUri }
        );
        break;

      case 'parallel':
        // Execute flows in parallel (e.g., research + memory recall simultaneously)
        orchestrationResult = await executeParallelStrategy(
          orchestrator,
          executionPlan.flows,
          { userRequest, userId, screenshotUri }
        );
        break;

      case 'hybrid':
        // Complex multi-phase execution
        orchestrationResult = await executeHybridStrategy(
          orchestrator,
          executionPlan.flows,
          { userRequest, userId, screenshotUri, intent }
        );
        break;
    }

    const summary = FlowOrchestrator.getSummary(orchestrationResult);

    MollyLogger.logFlowComplete('metaOrchestrator', { summary }, traceId);

    return {
      intent,
      executionPlan,
      results: orchestrationResult,
      summary,
      recommendation: generateRecommendation(intent, summary, systemHealth),
    };
  }
);

/**
 * Build execution plan based on intent and system state
 */
async function buildExecutionPlan(
  intent: z.infer<typeof IntentSchema>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  systemHealth: any,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _context: Record<string, unknown>
): Promise<{
  strategy: 'single' | 'pipeline' | 'parallel' | 'hybrid';
  flows: string[];
  reasoning: string;
}> {
  // Simple intent → single flow
  if (
    intent.complexity === 'simple' &&
    !intent.requiresMemory &&
    !intent.requiresVision
  ) {
    return {
      strategy: 'single',
      flows: [intent.primaryIntent],
      reasoning: 'Simple request requires single flow execution',
    };
  }

  // Complex with thermal throttling → sequential to avoid overload
  if (
    systemHealth.temperature > 48 ||
    systemHealth.throttlingStatus !== 'Normal'
  ) {
    return {
      strategy: 'pipeline',
      flows: intent.suggestedFlows,
      reasoning: 'Sequential execution due to thermal constraints',
    };
  }

  // Complex with good resources → parallel optimization
  if (
    intent.complexity === 'complex' &&
    intent.requiresMemory &&
    intent.requiresResearch
  ) {
    return {
      strategy: 'parallel',
      flows: ['experienceRecall', 'webResearch', intent.primaryIntent],
      reasoning: 'Parallel execution for optimal performance',
    };
  }

  // Default: pipeline for moderate complexity
  return {
    strategy: 'pipeline',
    flows: intent.suggestedFlows,
    reasoning: 'Sequential pipeline for moderate complexity task',
  };
}

/**
 * Execute single flow strategy
 */
async function executeSingleStrategy(
  orchestrator: FlowOrchestrator,
  flowName: string,
  input: Record<string, unknown>
): Promise<OrchestrationContext> {
  // In real implementation, would dynamically import and execute the flow
  return {
    userId: input.userId as string,
    initialInput: input,
    flowResults: new Map(),
    sharedData: {},
    traceId: orchestrator['traceId'],
  };
}

/**
 * Execute pipeline strategy
 */
async function executePipelineStrategy(
  orchestrator: FlowOrchestrator,
  flows: string[],
  input: Record<string, unknown>
): Promise<OrchestrationContext> {
  return await orchestrator.executePipeline(flows, input, {
    userId: input.userId as string,
  });
}

/**
 * Execute parallel strategy
 */
async function executeParallelStrategy(
  orchestrator: FlowOrchestrator,
  flows: string[],
  input: Record<string, unknown>
): Promise<OrchestrationContext> {
  const inputs = new Map(flows.map((f) => [f, input]));
  return await orchestrator.executeParallel(flows, inputs, {
    userId: input.userId as string,
  });
}

/**
 * Execute hybrid strategy (multi-phase)
 */
async function executeHybridStrategy(
  orchestrator: FlowOrchestrator,
  flows: string[],
  input: Record<string, unknown>
): Promise<OrchestrationContext> {
  // Example: Run memory recall + research in parallel, then feed into autonomous solution
  const phase1 = await orchestrator.executeParallel(
    flows.slice(0, 2),
    new Map(flows.slice(0, 2).map((f) => [f, input])),
    { userId: input.userId as string }
  );

  // Phase 2: Use aggregated results in main flow
  return await orchestrator.executePipeline(flows.slice(2), phase1.sharedData, {
    userId: input.userId as string,
    sharedData: phase1.sharedData,
  });
}

/**
 * Generate recommendations based on execution results
 */
function generateRecommendation(
  intent: z.infer<typeof IntentSchema>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  summary: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  systemHealth: any
): string {
  if (summary.failed > 0) {
    return 'Some flows failed. Consider retrying or breaking down the task further.';
  }

  if (systemHealth.temperature > 48) {
    return 'System thermal load high. Consider throttling complex operations.';
  }

  if (intent.complexity === 'complex' && summary.successful === summary.total) {
    return 'Complex task completed successfully. All flows executed as planned.';
  }

  return 'Task completed. All flows executed successfully.';
}

export async function orchestrateTask(
  userRequest: string,
  userId: string,
  options?: {
    sessionId?: string;
    contextWindow?: Record<string, unknown>[];
    screenshotUri?: string;
  }
) {
  return await metaOrchestratorFlow({
    userRequest,
    userId,
    sessionId: options?.sessionId,
    contextWindow: options?.contextWindow,
    screenshotUri: options?.screenshotUri,
  });
}
