/**
 * @fileOverview Flow Orchestrator Tests
 *
 * Tests the flow composition system:
 * - Pipeline execution (sequential chaining)
 * - Parallel execution
 * - Conditional execution (decision trees)
 * - Error isolation per flow
 * - Summary generation
 */

// Mock logger
jest.mock('../logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  generateTraceId: jest.fn(() => 'test-trace-id'),
}));

// Mock error-handler (withTimeout)
jest.mock('../error-handler', () => ({
  withTimeout: jest.fn(async (promise: Promise<unknown>) => await promise),
}));

import {
  FlowOrchestrator,
  type OrchestrableFlow,
  type FlowDecision,
} from '../orchestrator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockFlow<I = string, O = string>(
  name: string,
  handler: (input: I) => Promise<O>,
  options: { timeoutMs?: number } = {}
): OrchestrableFlow<I, O> {
  return {
    name,
    execute: handler,
    ...options,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FlowOrchestrator', () => {
  let orchestrator: FlowOrchestrator;

  beforeEach(() => {
    orchestrator = new FlowOrchestrator('test-trace');
  });

  // ===== Flow Registration =====

  describe('Flow Registration', () => {
    it('registers a flow successfully', () => {
      const flow = createMockFlow('test-flow', async () => 'result');
      orchestrator.registerFlow(flow);
      // If no error thrown, registration succeeded
    });

    it('overwrites flow with same name', () => {
      const flow1 = createMockFlow('dupe', async () => 'first');
      const flow2 = createMockFlow('dupe', async () => 'second');

      orchestrator.registerFlow(flow1);
      orchestrator.registerFlow(flow2);

      // No error — last registration wins
    });
  });

  // ===== Pipeline Execution =====

  describe('Pipeline Execution', () => {
    it('executes flows sequentially and chains output', async () => {
      const step1 = createMockFlow<string, string>(
        'step1',
        async (input) => `${input}→A`
      );
      const step2 = createMockFlow<string, string>(
        'step2',
        async (input) => `${input}→B`
      );
      const step3 = createMockFlow<string, string>(
        'step3',
        async (input) => `${input}→C`
      );

      orchestrator.registerFlow(step1);
      orchestrator.registerFlow(step2);
      orchestrator.registerFlow(step3);

      const context = await orchestrator.executePipeline(
        ['step1', 'step2', 'step3'],
        'START'
      );

      expect(context.flowResults.get('step1')?.success).toBe(true);
      expect(context.flowResults.get('step2')?.success).toBe(true);
      expect(context.flowResults.get('step3')?.success).toBe(true);

      // Final output should be chained through all steps
      expect(context.flowResults.get('step3')?.output).toBe('START→A→B→C');
    });

    it('continues pipeline when a flow fails', async () => {
      const good = createMockFlow('good', async () => 'ok');
      const bad = createMockFlow('bad', async () => {
        throw new Error('oof');
      });
      const after = createMockFlow('after', async () => 'recovered');

      orchestrator.registerFlow(good);
      orchestrator.registerFlow(bad);
      orchestrator.registerFlow(after);

      const context = await orchestrator.executePipeline(
        ['good', 'bad', 'after'],
        'input'
      );

      expect(context.flowResults.get('good')?.success).toBe(true);
      expect(context.flowResults.get('bad')?.success).toBe(false);
      expect(context.flowResults.get('bad')?.error).toBe('oof');
      expect(context.flowResults.get('after')?.success).toBe(true);
    });

    it('handles unregistered flow in pipeline gracefully', async () => {
      const flow = createMockFlow('real', async () => 'ok');
      orchestrator.registerFlow(flow);

      const context = await orchestrator.executePipeline(
        ['real', 'ghost', 'real'],
        'input'
      );

      expect(context.flowResults.get('real')?.success).toBe(true);
      expect(context.flowResults.get('ghost')?.success).toBe(false);
      expect(context.flowResults.get('ghost')?.error).toContain(
        'not registered'
      );
    });

    it('records duration for each flow', async () => {
      const slow = createMockFlow('slow', async () => {
        await new Promise((r) => setTimeout(r, 50));
        return 'done';
      });

      orchestrator.registerFlow(slow);
      const context = await orchestrator.executePipeline(['slow'], 'go');

      const result = context.flowResults.get('slow');
      expect(result?.durationMs).toBeGreaterThanOrEqual(40);
    });

    it('pipeline context carries userId and sessionId', async () => {
      const flow = createMockFlow('a', async () => 'ok');
      orchestrator.registerFlow(flow);

      const context = await orchestrator.executePipeline(['a'], 'input', {
        userId: 'eric',
        sessionId: 'sess-123',
      });

      expect(context.userId).toBe('eric');
      expect(context.sessionId).toBe('sess-123');
    });
  });

  // ===== Parallel Execution =====

  describe('Parallel Execution', () => {
    it('executes multiple flows in parallel', async () => {
      const flowA = createMockFlow('A', async () => 'result-A');
      const flowB = createMockFlow('B', async () => 'result-B');
      const flowC = createMockFlow('C', async () => 'result-C');

      orchestrator.registerFlow(flowA);
      orchestrator.registerFlow(flowB);
      orchestrator.registerFlow(flowC);

      const inputs = new Map<string, string>([
        ['A', 'in-a'],
        ['B', 'in-b'],
        ['C', 'in-c'],
      ]);

      const context = await orchestrator.executeParallel(
        ['A', 'B', 'C'],
        inputs
      );

      expect(context.flowResults.get('A')?.success).toBe(true);
      expect(context.flowResults.get('B')?.success).toBe(true);
      expect(context.flowResults.get('C')?.success).toBe(true);
    });

    it('isolates errors in parallel execution', async () => {
      const good = createMockFlow('good', async () => 'fine');
      const bad = createMockFlow('bad', async () => {
        throw new Error('parallel fail');
      });

      orchestrator.registerFlow(good);
      orchestrator.registerFlow(bad);

      const inputs = new Map([
        ['good', 'a'],
        ['bad', 'b'],
      ]);

      const context = await orchestrator.executeParallel(
        ['good', 'bad'],
        inputs
      );

      expect(context.flowResults.get('good')?.success).toBe(true);
      expect(context.flowResults.get('bad')?.success).toBe(false);
      expect(context.flowResults.get('bad')?.error).toBe('parallel fail');
    });

    it('handles unregistered flow in parallel', async () => {
      const inputs = new Map([['missing', 'data']]);
      const context = await orchestrator.executeParallel(['missing'], inputs);

      expect(context.flowResults.get('missing')?.success).toBe(false);
      expect(context.flowResults.get('missing')?.error).toContain(
        'not registered'
      );
    });
  });

  // ===== Conditional Execution =====

  describe('Conditional Execution', () => {
    it('executes flow when condition matches', async () => {
      const flow = createMockFlow('handler', async () => 'handled');
      orchestrator.registerFlow(flow);

      const decisions: FlowDecision<{ type: string }>[] = [
        {
          condition: (ctx) => ctx.type === 'urgent',
          flowName: 'handler',
          priority: 1,
        },
      ];

      const result = await orchestrator.executeConditional(decisions, {
        type: 'urgent',
      });

      expect(result?.success).toBe(true);
      expect(result?.output).toBe('handled');
    });

    it('returns null when no conditions match', async () => {
      const decisions: FlowDecision<{ type: string }>[] = [
        {
          condition: (ctx) => ctx.type === 'rare',
          flowName: 'handler',
        },
      ];

      const result = await orchestrator.executeConditional(decisions, {
        type: 'common',
      });

      expect(result).toBeNull();
    });

    it('evaluates higher priority conditions first', async () => {
      const lowPriority = createMockFlow('low', async () => 'low-result');
      const highPriority = createMockFlow('high', async () => 'high-result');

      orchestrator.registerFlow(lowPriority);
      orchestrator.registerFlow(highPriority);

      const decisions: FlowDecision<{ match: boolean }>[] = [
        {
          condition: () => true,
          flowName: 'low',
          priority: 1,
        },
        {
          condition: () => true,
          flowName: 'high',
          priority: 10,
        },
      ];

      const result = await orchestrator.executeConditional(decisions, {
        match: true,
      });

      // High priority should execute first
      expect(result?.flowName).toBe('high');
      expect(result?.output).toBe('high-result');
    });

    it('handles async conditions', async () => {
      const flow = createMockFlow('async-handler', async () => 'async-ok');
      orchestrator.registerFlow(flow);

      const decisions: FlowDecision<string>[] = [
        {
          condition: async () => {
            await new Promise((r) => setTimeout(r, 10));
            return true;
          },
          flowName: 'async-handler',
        },
      ];

      const result = await orchestrator.executeConditional(decisions, 'ctx');
      expect(result?.success).toBe(true);
    });
  });

  // ===== Summary =====

  describe('Summary Generation', () => {
    it('correctly summarizes orchestration results', async () => {
      const ok1 = createMockFlow('ok1', async () => 'a');
      const ok2 = createMockFlow('ok2', async () => 'b');
      const fail1 = createMockFlow('fail1', async () => {
        throw new Error('x');
      });

      orchestrator.registerFlow(ok1);
      orchestrator.registerFlow(ok2);
      orchestrator.registerFlow(fail1);

      const context = await orchestrator.executePipeline(
        ['ok1', 'ok2', 'fail1'],
        'start'
      );

      const summary = FlowOrchestrator.getSummary(context);
      expect(summary.total).toBe(3);
      expect(summary.successful).toBe(2);
      expect(summary.failed).toBe(1);
      expect(summary.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('empty context returns zero summary', () => {
      const emptyContext = {
        userId: 'test',
        initialInput: null,
        flowResults: new Map(),
        sharedData: {},
        traceId: 'test',
      };

      const summary = FlowOrchestrator.getSummary(emptyContext);
      expect(summary.total).toBe(0);
      expect(summary.successful).toBe(0);
      expect(summary.failed).toBe(0);
      expect(summary.totalDurationMs).toBe(0);
    });
  });
});
