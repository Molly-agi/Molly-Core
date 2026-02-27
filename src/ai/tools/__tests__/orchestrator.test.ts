/**
 * @fileOverview Orchestrator Pipeline Smoke Tests
 *
 * Verifies basic orchestrator functionality:
 * - Sequential pipeline execution
 * - Flow composition
 * - Error handling
 */

import { FlowOrchestrator } from '../../orchestrator';

describe('FlowOrchestrator', () => {
  it('should register and execute sequential flows', async () => {
    const orchestrator = new FlowOrchestrator('test-trace-001');

    // Register test flows
    orchestrator.registerFlow({
      name: 'step1',
      execute: async (input: string) => {
        return `${input}-step1`;
      },
    });

    orchestrator.registerFlow({
      name: 'step2',
      execute: async (input: string) => {
        return `${input}-step2`;
      },
    });

    // Execute pipeline
    const context = await orchestrator.executePipeline(
      ['step1', 'step2'],
      'input',
      {
        userId: 'test-user',
        sessionId: 'test-session',
      }
    );

    // Verify results
    expect(context.userId).toBe('test-user');
    expect(context.sessionId).toBe('test-session');
    expect(context.flowResults.size).toBe(2);

    const step1Result = context.flowResults.get('step1');
    const step2Result = context.flowResults.get('step2');

    expect(step1Result?.success).toBe(true);
    expect(step1Result?.output).toBe('input-step1');

    expect(step2Result?.success).toBe(true);
    expect(step2Result?.output).toBe('input-step1-step2');
  });

  it('should handle flow failures gracefully', async () => {
    const orchestrator = new FlowOrchestrator('test-trace-002');

    orchestrator.registerFlow({
      name: 'failing-flow',
      execute: async () => {
        throw new Error('Test failure');
      },
    });

    orchestrator.registerFlow({
      name: 'safe-flow',
      execute: async (input: string) => {
        return `${input}-safe`;
      },
    });

    const context = await orchestrator.executePipeline(
      ['failing-flow', 'safe-flow'],
      'input',
      { userId: 'test-user', sessionId: 'test-session' }
    );

    // First flow should fail
    const failResult = context.flowResults.get('failing-flow');
    expect(failResult?.success).toBe(false);
    expect(failResult?.error).toBeDefined();

    // Second flow should still execute (isolated failure)
    const safeResult = context.flowResults.get('safe-flow');
    expect(safeResult?.success).toBe(true);
  });

  it('should execute conditional flows', async () => {
    const orchestrator = new FlowOrchestrator('test-trace-003');

    orchestrator.registerFlow({
      name: 'flow-a',
      execute: async () => 'route-a',
    });

    orchestrator.registerFlow({
      name: 'flow-b',
      execute: async () => 'route-b',
    });

    const testContext = { userId: 'test-user', sessionId: 'test-session' };

    const result = await orchestrator.executeConditional(
      [
        {
          condition: async (ctx: Record<string, unknown>) =>
            ctx.userId === 'test-user',
          flowName: 'flow-a',
          priority: 1,
        },
        {
          condition: async (ctx: Record<string, unknown>) =>
            ctx.userId === 'other-user',
          flowName: 'flow-b',
          priority: 2,
        },
      ],
      testContext
    );

    // Should execute flow-a since condition matches
    expect(result?.success).toBe(true);
    expect(result?.output).toBe('route-a');
    expect(result?.flowName).toBe('flow-a');
  });

  it('should execute flows in parallel', async () => {
    const orchestrator = new FlowOrchestrator('test-trace-004');

    orchestrator.registerFlow({
      name: 'parallel-flow-1',
      execute: async (input: string) => `${input}-p1`,
    });

    orchestrator.registerFlow({
      name: 'parallel-flow-2',
      execute: async (input: string) => `${input}-p2`,
    });

    orchestrator.registerFlow({
      name: 'parallel-flow-3',
      execute: async (input: string) => `${input}-p3`,
    });

    const inputs = new Map([
      ['parallel-flow-1', 'input'],
      ['parallel-flow-2', 'input'],
      ['parallel-flow-3', 'input'],
    ]);

    const context = await orchestrator.executeParallel(
      ['parallel-flow-1', 'parallel-flow-2', 'parallel-flow-3'],
      inputs,
      { userId: 'test-user', sessionId: 'test-session' }
    );

    // All flows should execute
    expect(context.flowResults.size).toBe(3);

    const result1 = context.flowResults.get('parallel-flow-1');
    const result2 = context.flowResults.get('parallel-flow-2');
    const result3 = context.flowResults.get('parallel-flow-3');

    expect(result1?.success).toBe(true);
    expect(result2?.success).toBe(true);
    expect(result3?.success).toBe(true);

    expect(result1?.output).toBe('input-p1');
    expect(result2?.output).toBe('input-p2');
    expect(result3?.output).toBe('input-p3');
  });
});
