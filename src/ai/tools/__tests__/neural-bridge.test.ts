/**
 * @fileOverview Tests for Neural Bridge — Context Building
 *
 * Tests neural bridge functionality including:
 * - Building context strings
 * - Input context formatting
 * - Signal formatting
 * - Content truncation
 */

import {
  NEURAL_BRIDGE_VERSION,
  buildNeuralBridgeContext,
  NeuralBridgeInputContext,
  NeuralBridgeSignal,
} from '../neural-bridge';

describe('Neural Bridge', () => {
  describe('NEURAL_BRIDGE_VERSION', () => {
    it('exports version string', () => {
      expect(NEURAL_BRIDGE_VERSION).toBe('1.0');
    });
  });

  describe('buildNeuralBridgeContext()', () => {
    it('returns empty string when no input or signals', () => {
      const result = buildNeuralBridgeContext();
      expect(result).toBe('');
    });

    it('returns empty string with empty signals array', () => {
      const result = buildNeuralBridgeContext(undefined, []);
      expect(result).toBe('');
    });

    it('includes bridge version', () => {
      const input: NeuralBridgeInputContext = {
        source: 'text_input',
        modality: 'text',
        content: 'Hello',
      };

      const result = buildNeuralBridgeContext(input);
      expect(result).toContain('bridge_version: 1.0');
    });
  });

  describe('Input Context Formatting', () => {
    it('formats auditory input source', () => {
      const input: NeuralBridgeInputContext = {
        source: 'self.auditory_input',
        modality: 'audio',
        content: 'Voice message content',
      };

      const result = buildNeuralBridgeContext(input);

      expect(result).toContain('input.source: self.auditory_input');
      expect(result).toContain('input.modality: audio');
    });

    it('formats text input source', () => {
      const input: NeuralBridgeInputContext = {
        source: 'text_input',
        modality: 'text',
        content: 'Text message',
      };

      const result = buildNeuralBridgeContext(input);

      expect(result).toContain('input.source: text_input');
      expect(result).toContain('input.modality: text');
    });

    it('formats system source', () => {
      const input: NeuralBridgeInputContext = {
        source: 'system',
        modality: 'text',
        content: 'System message',
      };

      const result = buildNeuralBridgeContext(input);

      expect(result).toContain('input.source: system');
    });

    it('includes content preview', () => {
      const input: NeuralBridgeInputContext = {
        source: 'text_input',
        modality: 'text',
        content: 'This is the message content',
      };

      const result = buildNeuralBridgeContext(input);

      expect(result).toContain(
        'input.content_preview: This is the message content'
      );
    });

    it('truncates long content preview', () => {
      const longContent = 'A'.repeat(200);
      const input: NeuralBridgeInputContext = {
        source: 'text_input',
        modality: 'text',
        content: longContent,
      };

      const result = buildNeuralBridgeContext(input);

      expect(result).toContain('input.content_preview: ');
      expect(result).toContain('...');
      expect(result.length).toBeLessThan(longContent.length + 100);
    });

    it('does not truncate short content', () => {
      const shortContent = 'Short text';
      const input: NeuralBridgeInputContext = {
        source: 'text_input',
        modality: 'text',
        content: shortContent,
      };

      const result = buildNeuralBridgeContext(input);

      expect(result).toContain(`input.content_preview: ${shortContent}`);
      expect(result).not.toContain('...');
    });
  });

  describe('Signal Formatting - Vocalize', () => {
    it('formats vocalize text signal', () => {
      const signals: NeuralBridgeSignal[] = [
        {
          action: 'self.vocalize_text',
          content: 'Hello world',
        },
      ];

      const result = buildNeuralBridgeContext(undefined, signals);

      expect(result).toContain('signal.0.action: self.vocalize_text');
      expect(result).toContain('signal.0.content_preview: Hello world');
    });

    it('truncates long vocalize content', () => {
      const longContent = 'B'.repeat(200);
      const signals: NeuralBridgeSignal[] = [
        {
          action: 'self.vocalize_text',
          content: longContent,
        },
      ];

      const result = buildNeuralBridgeContext(undefined, signals);

      expect(result).toContain('signal.0.content_preview: ');
      expect(result).toContain('...');
    });
  });

  describe('Signal Formatting - Nervous System', () => {
    it('formats nervous system signal with latency', () => {
      const signals: NeuralBridgeSignal[] = [
        {
          action: 'self.nervous_system',
          latencyMs: 150,
        },
      ];

      const result = buildNeuralBridgeContext(undefined, signals);

      expect(result).toContain('signal.0.action: self.nervous_system');
      expect(result).toContain('signal.0.latencyMs: 150');
    });

    it('formats nervous system signal with CPU usage', () => {
      const signals: NeuralBridgeSignal[] = [
        {
          action: 'self.nervous_system',
          cpuUsage: 45.5,
        },
      ];

      const result = buildNeuralBridgeContext(undefined, signals);

      expect(result).toContain('signal.0.cpuUsage: 45.5');
    });

    it('formats nervous system signal with GPU usage', () => {
      const signals: NeuralBridgeSignal[] = [
        {
          action: 'self.nervous_system',
          gpuUsage: 80,
        },
      ];

      const result = buildNeuralBridgeContext(undefined, signals);

      expect(result).toContain('signal.0.gpuUsage: 80');
    });

    it('formats nervous system signal with temperature', () => {
      const signals: NeuralBridgeSignal[] = [
        {
          action: 'self.nervous_system',
          temperatureC: 65,
        },
      ];

      const result = buildNeuralBridgeContext(undefined, signals);

      expect(result).toContain('signal.0.temperatureC: 65');
    });

    it('formats nervous system signal with all metrics', () => {
      const signals: NeuralBridgeSignal[] = [
        {
          action: 'self.nervous_system',
          latencyMs: 100,
          cpuUsage: 50,
          gpuUsage: 75,
          temperatureC: 70,
        },
      ];

      const result = buildNeuralBridgeContext(undefined, signals);

      expect(result).toContain('signal.0.latencyMs: 100');
      expect(result).toContain('signal.0.cpuUsage: 50');
      expect(result).toContain('signal.0.gpuUsage: 75');
      expect(result).toContain('signal.0.temperatureC: 70');
    });

    it('omits undefined metrics', () => {
      const signals: NeuralBridgeSignal[] = [
        {
          action: 'self.nervous_system',
          latencyMs: 100,
        },
      ];

      const result = buildNeuralBridgeContext(undefined, signals);

      expect(result).toContain('signal.0.latencyMs: 100');
      expect(result).not.toContain('cpuUsage');
      expect(result).not.toContain('gpuUsage');
      expect(result).not.toContain('temperatureC');
    });
  });

  describe('Signal Formatting - Consciousness', () => {
    it('formats consciousness signal', () => {
      const signals: NeuralBridgeSignal[] = [
        {
          action: 'self.consciousness',
          awarenessLevel: 'high',
          regulationMode: 'active',
        },
      ];

      const result = buildNeuralBridgeContext(undefined, signals);

      expect(result).toContain('signal.0.action: self.consciousness');
      expect(result).toContain('signal.0.awareness: high');
      expect(result).toContain('signal.0.regulation: active');
    });

    it('includes error rate when provided', () => {
      const signals: NeuralBridgeSignal[] = [
        {
          action: 'self.consciousness',
          awarenessLevel: 'medium',
          regulationMode: 'monitoring',
          errorRate: 0.05,
        },
      ];

      const result = buildNeuralBridgeContext(undefined, signals);

      expect(result).toContain('signal.0.errorRate: 0.05');
    });

    it('omits error rate when undefined', () => {
      const signals: NeuralBridgeSignal[] = [
        {
          action: 'self.consciousness',
          awarenessLevel: 'low',
          regulationMode: 'passive',
        },
      ];

      const result = buildNeuralBridgeContext(undefined, signals);

      expect(result).not.toContain('errorRate');
    });
  });

  describe('Multiple Signals', () => {
    it('formats multiple signals with correct indices', () => {
      const signals: NeuralBridgeSignal[] = [
        {
          action: 'self.vocalize_text',
          content: 'First',
        },
        {
          action: 'self.nervous_system',
          latencyMs: 50,
        },
        {
          action: 'self.consciousness',
          awarenessLevel: 'high',
          regulationMode: 'active',
        },
      ];

      const result = buildNeuralBridgeContext(undefined, signals);

      expect(result).toContain('signal.0.action: self.vocalize_text');
      expect(result).toContain('signal.1.action: self.nervous_system');
      expect(result).toContain('signal.2.action: self.consciousness');
    });
  });

  describe('Combined Input and Signals', () => {
    it('formats both input context and signals', () => {
      const input: NeuralBridgeInputContext = {
        source: 'text_input',
        modality: 'text',
        content: 'User message',
      };

      const signals: NeuralBridgeSignal[] = [
        {
          action: 'self.vocalize_text',
          content: 'Response',
        },
      ];

      const result = buildNeuralBridgeContext(input, signals);

      expect(result).toContain('bridge_version: 1.0');
      expect(result).toContain('input.source: text_input');
      expect(result).toContain('signal.0.action: self.vocalize_text');
    });

    it('joins lines with newlines', () => {
      const input: NeuralBridgeInputContext = {
        source: 'text_input',
        modality: 'text',
        content: 'Test',
      };

      const result = buildNeuralBridgeContext(input);

      const lines = result.split('\n');
      expect(lines.length).toBeGreaterThan(1);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty string content', () => {
      const input: NeuralBridgeInputContext = {
        source: 'text_input',
        modality: 'text',
        content: '',
      };

      const result = buildNeuralBridgeContext(input);

      expect(result).toContain('input.content_preview: ');
    });

    it('handles content exactly at truncation limit', () => {
      const exactContent = 'X'.repeat(180);
      const input: NeuralBridgeInputContext = {
        source: 'text_input',
        modality: 'text',
        content: exactContent,
      };

      const result = buildNeuralBridgeContext(input);

      expect(result).toContain(`input.content_preview: ${exactContent}`);
      expect(result).not.toContain('...');
    });

    it('handles zero metrics', () => {
      const signals: NeuralBridgeSignal[] = [
        {
          action: 'self.nervous_system',
          latencyMs: 0,
          cpuUsage: 0,
        },
      ];

      const result = buildNeuralBridgeContext(undefined, signals);

      expect(result).toContain('signal.0.latencyMs: 0');
      expect(result).toContain('signal.0.cpuUsage: 0');
    });

    it('handles special characters in content', () => {
      const input: NeuralBridgeInputContext = {
        source: 'text_input',
        modality: 'text',
        content: 'Hello\nWorld\t!@#$%',
      };

      const result = buildNeuralBridgeContext(input);

      expect(result).toContain('Hello\nWorld\t!@#$%');
    });
  });
});
