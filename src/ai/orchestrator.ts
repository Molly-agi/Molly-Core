/**
 * @fileOverview Flow Orchestration & Composition System
 *
 * Phase 8: Enables Molly to chain, compose, and dynamically select flows
 * for complex multi-step autonomous operations.
 *
 * Capabilities:
 * - Sequential flow chaining (pipeline)
 * - Parallel flow execution
 * - Conditional flow selection (decision trees)
 * - Result aggregation and context passing
 * - Error isolation per flow
 */

import { MollyLogger, generateTraceId } from './logger';
import { withTimeout } from './error-handler';

/**
 * Flow execution result with metadata
 */
export interface FlowResult<T = unknown> {
  flowName: string;
  success: boolean;
  output?: T;
  error?: string;
  durationMs: number;
  traceId: string;
}

/**
 * Flow definition for orchestration
 */
export interface OrchestrableFlow<I = unknown, O = unknown> {
  name: string;
  execute: (input: I | unknown) => Promise<O>;
  timeoutMs?: number;
  retryOnFailure?: boolean;
}

/**
 * Decision node for conditional flow selection
 */
export interface FlowDecision<T = unknown> {
  condition: (context: T) => boolean | Promise<boolean>;
  flowName: string;
  priority?: number; // Higher priority evaluated first
}

/**
 * Context passed between chained flows
 */
export interface OrchestrationContext {
  userId: string;
  sessionId?: string;
  initialInput: unknown;
  flowResults: Map<string, FlowResult>;
  sharedData: Record<string, unknown>;
  traceId: string;
}

/**
 * Orchestrator for composing and executing multiple flows
 */
export class FlowOrchestrator {
  private flows: Map<string, OrchestrableFlow>;
  private traceId: string;

  constructor(traceId?: string) {
    this.flows = new Map();
    this.traceId = traceId || generateTraceId();
  }

  /**
   * Register a flow for orchestration
   */
  registerFlow<I, O>(flow: OrchestrableFlow<I, O>): void {
    this.flows.set(flow.name, flow);
    MollyLogger.info(`Registered flow: ${flow.name}`, 'orchestrator', {
      traceId: this.traceId,
    });
  }

  /**
   * Execute flows sequentially in a pipeline
   * Each flow receives output from previous flow
   */
  async executePipeline<T>(
    flowNames: string[],
    initialInput: T,
    context: Partial<OrchestrationContext> = {}
  ): Promise<OrchestrationContext> {
    const orchContext: OrchestrationContext = {
      userId: context.userId || 'anonymous',
      sessionId: context.sessionId,
      initialInput,
      flowResults: new Map(),
      sharedData: context.sharedData || {},
      traceId: this.traceId,
    };

    MollyLogger.info(
      `Starting pipeline: ${flowNames.join(' → ')}`,
      'orchestrator',
      {
        traceId: this.traceId,
      }
    );

    let currentInput: unknown = initialInput;

    for (const flowName of flowNames) {
      const flow = this.flows.get(flowName);
      if (!flow) {
        const error = `Flow '${flowName}' not registered`;
        MollyLogger.error(
          error,
          'orchestrator',
          { flowName },
          undefined,
          this.traceId
        );
        orchContext.flowResults.set(flowName, {
          flowName,
          success: false,
          error,
          durationMs: 0,
          traceId: this.traceId,
        });
        continue;
      }

      const result = await this.executeSingleFlow(flow, currentInput);
      orchContext.flowResults.set(flowName, result);

      if (result.success) {
        currentInput = result.output; // Chain output to next flow
      } else {
        MollyLogger.warn(
          `Flow ${flowName} failed, continuing with remaining flows in pipeline`,
          'orchestrator',
          {
            traceId: this.traceId,
            error: result.error,
          }
        );
        // Don't break - continue with next flow using previous successful input
      }
    }

    return orchContext;
  }

  /**
   * Execute flows in parallel and aggregate results
   */
  async executeParallel<T>(
    flowNames: string[],
    inputs: Map<string, T>,
    context: Partial<OrchestrationContext> = {}
  ): Promise<OrchestrationContext> {
    const orchContext: OrchestrationContext = {
      userId: context.userId || 'anonymous',
      sessionId: context.sessionId,
      initialInput: Object.fromEntries(inputs),
      flowResults: new Map(),
      sharedData: context.sharedData || {},
      traceId: this.traceId,
    };

    MollyLogger.info(
      `Starting parallel execution: ${flowNames.join(', ')}`,
      'orchestrator',
      {
        traceId: this.traceId,
      }
    );

    const promises = flowNames.map(async (flowName) => {
      const flow = this.flows.get(flowName);
      if (!flow) {
        return {
          flowName,
          result: {
            flowName,
            success: false,
            error: `Flow '${flowName}' not registered`,
            durationMs: 0,
            traceId: this.traceId,
          } as FlowResult,
        };
      }

      const input = inputs.get(flowName);
      const result = await this.executeSingleFlow(flow, input);
      return { flowName, result };
    });

    const results = await Promise.allSettled(promises);

    for (const result of results) {
      if (result.status === 'fulfilled') {
        orchContext.flowResults.set(result.value.flowName, result.value.result);
      } else {
        MollyLogger.error(
          'Parallel flow execution failed',
          'orchestrator',
          {},
          result.reason,
          this.traceId
        );
      }
    }

    return orchContext;
  }

  /**
   * Execute flows based on decision tree evaluation
   * Evaluates conditions and runs first matching flow
   */
  async executeConditional<T>(
    decisions: FlowDecision<T>[],
    context: T,

    _orchContext: Partial<OrchestrationContext> = {}
  ): Promise<FlowResult | null> {
    const sortedDecisions = [...decisions].sort(
      (a, b) => (b.priority || 0) - (a.priority || 0)
    );

    for (const decision of sortedDecisions) {
      try {
        const shouldExecute = await decision.condition(context);
        if (shouldExecute) {
          MollyLogger.info(
            `Condition matched: executing ${decision.flowName}`,
            'orchestrator',
            {
              traceId: this.traceId,
            }
          );

          const flow = this.flows.get(decision.flowName);
          if (!flow) {
            const error = `Flow '${decision.flowName}' not registered`;
            MollyLogger.error(error, 'orchestrator', {
              flowName: decision.flowName,
            });
            return {
              flowName: decision.flowName,
              success: false,
              error,
              durationMs: 0,
              traceId: this.traceId,
            };
          }

          return await this.executeSingleFlow(flow, context);
        }
      } catch (error) {
        MollyLogger.error(
          `Condition evaluation failed for ${decision.flowName}`,
          'orchestrator',
          {},
          error,
          this.traceId
        );
      }
    }

    MollyLogger.warn('No conditions matched in decision tree', 'orchestrator', {
      traceId: this.traceId,
    });
    return null;
  }

  /**
   * Execute a single flow with timing and error handling
   */
  private async executeSingleFlow<I, O>(
    flow: OrchestrableFlow<I, O>,
    input: I
  ): Promise<FlowResult<O>> {
    const startTime = Date.now();
    const flowTraceId = generateTraceId();

    try {
      MollyLogger.info(`Executing flow: ${flow.name}`, 'orchestrator', {
        parentTraceId: this.traceId,
        flowTraceId,
      });

      let output: O;
      if (flow.timeoutMs) {
        output = await withTimeout(
          flow.execute(input),
          flow.timeoutMs,
          `Flow ${flow.name} timed out`,
          flowTraceId
        );
      } else {
        output = await flow.execute(input);
      }

      const durationMs = Date.now() - startTime;

      MollyLogger.info(
        `Flow ${flow.name} completed successfully`,
        'orchestrator',
        {
          durationMs,
          flowTraceId,
        }
      );

      return {
        flowName: flow.name,
        success: true,
        output,
        durationMs,
        traceId: flowTraceId,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      MollyLogger.error(
        `Flow ${flow.name} failed`,
        'orchestrator',
        { durationMs },
        error,
        flowTraceId
      );

      return {
        flowName: flow.name,
        success: false,
        error: errorMessage,
        durationMs,
        traceId: flowTraceId,
      };
    }
  }

  /**
   * Get execution summary from orchestration context
   */
  static getSummary(context: OrchestrationContext): {
    total: number;
    successful: number;
    failed: number;
    totalDurationMs: number;
  } {
    let successful = 0;
    let failed = 0;
    let totalDurationMs = 0;

    for (const result of context.flowResults.values()) {
      if (result.success) successful++;
      else failed++;
      totalDurationMs += result.durationMs;
    }

    return {
      total: context.flowResults.size,
      successful,
      failed,
      totalDurationMs,
    };
  }
}
