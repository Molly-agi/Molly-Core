export const NEURAL_BRIDGE_VERSION = '1.0';

export type NeuralBridgeInputContext = {
  source: 'self.auditory_input' | 'text_input' | 'system';
  modality: 'audio' | 'text';
  content: string;
};

export type NeuralBridgeSignal =
  | {
      action: 'self.vocalize_text';
      content: string;
    }
  | {
      action: 'self.nervous_system';
      latencyMs?: number;
      cpuUsage?: number;
      gpuUsage?: number;
      temperatureC?: number;
    }
  | {
      action: 'self.consciousness';
      awarenessLevel: string;
      regulationMode: string;
      errorRate?: number;
    };

function truncatePreview(text: string, maxLength = 180): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}

export function buildNeuralBridgeContext(
  inputContext?: NeuralBridgeInputContext,
  selfSignals?: NeuralBridgeSignal[]
): string {
  if (!inputContext && (!selfSignals || selfSignals.length === 0)) {
    return '';
  }

  const lines: string[] = [`bridge_version: ${NEURAL_BRIDGE_VERSION}`];

  if (inputContext) {
    lines.push(`input.source: ${inputContext.source}`);
    lines.push(`input.modality: ${inputContext.modality}`);
    lines.push(
      `input.content_preview: ${truncatePreview(inputContext.content)}`
    );
  }

  if (selfSignals && selfSignals.length > 0) {
    selfSignals.forEach((signal, index) => {
      lines.push(`signal.${index}.action: ${signal.action}`);
      if (signal.action === 'self.vocalize_text') {
        lines.push(
          `signal.${index}.content_preview: ${truncatePreview(signal.content)}`
        );
        return;
      }

      if (signal.action === 'self.consciousness') {
        lines.push(`signal.${index}.awareness: ${signal.awarenessLevel}`);
        lines.push(`signal.${index}.regulation: ${signal.regulationMode}`);
        if (signal.errorRate !== undefined) {
          lines.push(`signal.${index}.errorRate: ${signal.errorRate}`);
        }
        return;
      }

      if (signal.latencyMs !== undefined) {
        lines.push(`signal.${index}.latencyMs: ${signal.latencyMs}`);
      }
      if (signal.cpuUsage !== undefined) {
        lines.push(`signal.${index}.cpuUsage: ${signal.cpuUsage}`);
      }
      if (signal.gpuUsage !== undefined) {
        lines.push(`signal.${index}.gpuUsage: ${signal.gpuUsage}`);
      }
      if (signal.temperatureC !== undefined) {
        lines.push(`signal.${index}.temperatureC: ${signal.temperatureC}`);
      }
    });
  }

  return lines.join('\n');
}
