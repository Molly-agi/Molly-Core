/**
 * @fileOverview Tests for Action Gate (D.1)
 */

import { evaluateActionGate } from '../action-gate';

describe('Action Gate (D.1)', () => {
  describe('Structural Validation', () => {
    test('rejects empty tool name', async () => {
      const decision = await evaluateActionGate({
        tool: '',
        params: {},
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('Invalid tool name');
    });

    test('rejects null tool name', async () => {
      const decision = await evaluateActionGate({
        tool: null as unknown as string,
        params: {},
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('Invalid tool name');
    });

    test('accepts valid tool name', async () => {
      const decision = await evaluateActionGate({
        tool: 'readProjectFile',
        params: { path: 'src/index.ts' },
      });

      expect(decision.allowed).toBe(true);
    });

    test('rejects non-object params', async () => {
      const decision = await evaluateActionGate({
        tool: 'readProjectFile',
        params: 'not an object' as unknown as Record<string, unknown>,
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('Invalid params');
    });

    test('accepts undefined params', async () => {
      const decision = await evaluateActionGate({
        tool: 'listCapabilities',
        params: undefined as unknown as Record<string, unknown>,
      });

      expect(decision.allowed).toBe(true);
    });

    test('accepts empty params object', async () => {
      const decision = await evaluateActionGate({
        tool: 'listCapabilities',
        params: {},
      });

      expect(decision.allowed).toBe(true);
    });
  });

  describe('Decision Logging', () => {
    test('includes tool name in decision', async () => {
      const decision = await evaluateActionGate({
        tool: 'safeBatch',
        params: {},
      });

      expect(decision.toolName).toBe('safeBatch');
    });

    test('includes timestamp', async () => {
      const before = Date.now();
      const decision = await evaluateActionGate({
        tool: 'readProjectFile',
        params: {},
      });
      const after = Date.now();

      expect(decision.timestamp).toBeGreaterThanOrEqual(before);
      expect(decision.timestamp).toBeLessThanOrEqual(after);
    });

    test('includes reason for approval', async () => {
      const decision = await evaluateActionGate({
        tool: 'getSystemHealth',
        params: {},
      });

      expect(decision.reason).toContain('approved');
    });

    test('includes reason for rejection', async () => {
      const decision = await evaluateActionGate({
        tool: '',
        params: {},
      });

      expect(decision.reason.length).toBeGreaterThan(0);
    });

    test('sets severity appropriately', async () => {
      const approved = await evaluateActionGate({
        tool: 'readProjectFile',
        params: {},
      });

      expect(approved.severity).toBe('info');

      const rejected = await evaluateActionGate({
        tool: '',
        params: {},
      });

      expect(rejected.severity).toBe('error');
    });
  });

  describe('Atomic Directive Enforcement', () => {
    test('recognizes atomic directive context', async () => {
      const decision = await evaluateActionGate({
        tool: 'safeBatch',
        params: { isAtomicDirective: true },
        source: 'task',
      });

      expect(decision.allowed).toBe(true);
    });

    test('allows single action for atomic directive', async () => {
      const decision = await evaluateActionGate({
        tool: 'writeProjectFile',
        params: {
          isAtomicDirective: true,
          path: 'src/test.ts',
          content: 'test',
        },
        source: 'task',
      });

      expect(decision.allowed).toBe(true);
    });
  });

  describe('Destructive Operations', () => {
    const destructiveTools = [
      'writeProjectFile',
      'codespaceShell',
      'deleteFile',
    ];

    destructiveTools.forEach((tool) => {
      test(`allows ${tool} with dryRun flag`, async () => {
        const decision = await evaluateActionGate({
          tool,
          params: { dryRun: true },
        });

        expect(decision.allowed).toBe(true);
      });

      test(`allows ${tool} with confirmed flag`, async () => {
        const decision = await evaluateActionGate({
          tool,
          params: { confirmed: true },
        });

        expect(decision.allowed).toBe(true);
      });

      test(`denies autonomous ${tool} without confirmed or dryRun`, async () => {
        const decision = await evaluateActionGate({
          tool,
          params: {},
          source: 'autonomous',
        });

        expect(decision.allowed).toBe(false);
        expect(decision.reason).toContain('confirmed');
      });

      test(`allows autonomous ${tool} when confirmed`, async () => {
        const decision = await evaluateActionGate({
          tool,
          params: { confirmed: true },
          source: 'autonomous',
        });

        expect(decision.allowed).toBe(true);
      });
    });
  });

  describe('Context Awareness', () => {
    test('includes tool name in decision', async () => {
      const decision = await evaluateActionGate({
        tool: 'codespaceShell',
        params: { command: 'ls' },
      });

      expect(decision.toolName).toBe('codespaceShell');
    });

    test('accepts source context', async () => {
      const decisionAuto = await evaluateActionGate({
        tool: 'readProjectFile',
        params: {},
        source: 'autonomous',
      });

      const decisionBridge = await evaluateActionGate({
        tool: 'readProjectFile',
        params: {},
        source: 'bridge',
      });

      expect(decisionAuto.allowed).toBe(true);
      expect(decisionBridge.allowed).toBe(true);
    });

    test('tracks session ID in context', async () => {
      const decision = await evaluateActionGate({
        tool: 'getSystemHealth',
        params: {},
        sessionId: 'session-123',
      });

      expect(decision.allowed).toBe(true);
    });

    test('tracks trace ID in context', async () => {
      const decision = await evaluateActionGate({
        tool: 'getSystemHealth',
        params: {},
        traceId: 'trace-456',
      });

      expect(decision.allowed).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('handles whitespace-only tool name', async () => {
      const decision = await evaluateActionGate({
        tool: '   ',
        params: {},
      });

      expect(decision.allowed).toBe(false);
    });

    test('allows complex params', async () => {
      const decision = await evaluateActionGate({
        tool: 'safeBatch',
        params: {
          steps: [
            { type: 'shell', command: 'ls' },
            { type: 'readFile', path: 'src/index.ts' },
          ],
          label: 'test-batch',
        },
      });

      expect(decision.allowed).toBe(true);
    });
  });
});
