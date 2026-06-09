/**
 * @fileOverview Tests for Action Gate (D.1)
 */

import { evaluateActionGate, GateDecision } from '../action-gate';

describe('Action Gate (D.1)', () => {
  describe('Structural Validation', () => {
    test('rejects empty tool name', () => {
      const decision = evaluateActionGate({
        tool: '',
        params: {},
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('Invalid tool name');
    });

    test('rejects null tool name', () => {
      const decision = evaluateActionGate({
        tool: null as any,
        params: {},
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('Invalid tool name');
    });

    test('accepts valid tool name', () => {
      const decision = evaluateActionGate({
        tool: 'readProjectFile',
        params: { path: 'src/index.ts' },
      });

      expect(decision.allowed).toBe(true);
    });

    test('rejects non-object params', () => {
      const decision = evaluateActionGate({
        tool: 'readProjectFile',
        params: 'not an object' as any,
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('Invalid params');
    });

    test('accepts undefined params', () => {
      const decision = evaluateActionGate({
        tool: 'listCapabilities',
        params: undefined as any,
      });

      expect(decision.allowed).toBe(true);
    });

    test('accepts empty params object', () => {
      const decision = evaluateActionGate({
        tool: 'listCapabilities',
        params: {},
      });

      expect(decision.allowed).toBe(true);
    });
  });

  describe('Decision Logging', () => {
    test('includes tool name in decision', () => {
      const decision = evaluateActionGate({
        tool: 'safeBatch',
        params: {},
      });

      expect(decision.toolName).toBe('safeBatch');
    });

    test('includes timestamp', () => {
      const before = Date.now();
      const decision = evaluateActionGate({
        tool: 'readProjectFile',
        params: {},
      });
      const after = Date.now();

      expect(decision.timestamp).toBeGreaterThanOrEqual(before);
      expect(decision.timestamp).toBeLessThanOrEqual(after);
    });

    test('includes reason for approval', () => {
      const decision = evaluateActionGate({
        tool: 'getSystemHealth',
        params: {},
      });

      expect(decision.reason).toContain('approved');
    });

    test('includes reason for rejection', () => {
      const decision = evaluateActionGate({
        tool: '',
        params: {},
      });

      expect(decision.reason.length).toBeGreaterThan(0);
    });

    test('sets severity appropriately', () => {
      const approved = evaluateActionGate({
        tool: 'readProjectFile',
        params: {},
      });

      expect(approved.severity).toBe('info');

      const rejected = evaluateActionGate({
        tool: '',
        params: {},
      });

      expect(rejected.severity).toBe('error');
    });
  });

  describe('Atomic Directive Enforcement', () => {
    test('recognizes atomic directive context', () => {
      const decision = evaluateActionGate({
        tool: 'safeBatch',
        params: { isAtomicDirective: true },
        source: 'task',
      });

      expect(decision.allowed).toBe(true);
    });

    test('allows single action for atomic directive', () => {
      const decision = evaluateActionGate({
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
    const destructiveTools = ['writeProjectFile', 'codespaceShell', 'deleteFile'];

    destructiveTools.forEach((tool) => {
      test(`allows ${tool} with dryRun flag`, () => {
        const decision = evaluateActionGate({
          tool,
          params: { dryRun: true },
        });

        expect(decision.allowed).toBe(true);
      });

      test(`allows ${tool} with confirmed flag`, () => {
        const decision = evaluateActionGate({
          tool,
          params: { confirmed: true },
        });

        expect(decision.allowed).toBe(true);
      });
    });
  });

  describe('Context Awareness', () => {
    test('includes tool name in decision', () => {
      const decision = evaluateActionGate({
        tool: 'codespaceShell',
        params: { command: 'ls' },
      });

      expect(decision.toolName).toBe('codespaceShell');
    });

    test('accepts source context', () => {
      const decisionAuto = evaluateActionGate({
        tool: 'readProjectFile',
        params: {},
        source: 'autonomous',
      });

      const decisionBridge = evaluateActionGate({
        tool: 'readProjectFile',
        params: {},
        source: 'bridge',
      });

      expect(decisionAuto.allowed).toBe(true);
      expect(decisionBridge.allowed).toBe(true);
    });

    test('tracks session ID in context', () => {
      const decision = evaluateActionGate({
        tool: 'getSystemHealth',
        params: {},
        sessionId: 'session-123',
      });

      expect(decision.allowed).toBe(true);
      // Session ID is passed to gate but not returned; it's used for logging
    });

    test('tracks trace ID in context', () => {
      const decision = evaluateActionGate({
        tool: 'getSystemHealth',
        params: {},
        traceId: 'trace-456',
      });

      expect(decision.allowed).toBe(true);
      // Trace ID is passed to gate but not returned; it's used for logging
    });
  });

  describe('Edge Cases', () => {
    test('handles whitespace-only tool name', () => {
      const decision = evaluateActionGate({
        tool: '   ',
        params: {},
      });

      expect(decision.allowed).toBe(false);
    });

    test('allows complex params', () => {
      const decision = evaluateActionGate({
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
