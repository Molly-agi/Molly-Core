import type { NeuralBridgeSignal } from '@/ai/tools/neural-bridge';
import { getPacingTelemetryPayload } from '../pacing-telemetry';

describe('pacing telemetry', () => {
  it('returns null when response is empty', () => {
    const signal: NeuralBridgeSignal = {
      action: 'self.nervous_system',
      cpuUsage: 52,
      temperatureC: 44.1,
    };

    expect(getPacingTelemetryPayload('', signal)).toBeNull();
  });

  it('returns null when signal is missing or not nervous system', () => {
    expect(getPacingTelemetryPayload('Hello', null)).toBeNull();

    const wrongSignal: NeuralBridgeSignal = {
      action: 'self.vocalize_text',
      content: 'hello',
    };

    expect(getPacingTelemetryPayload('Hello', wrongSignal)).toBeNull();
  });

  it('returns payload when nervous system signal is present', () => {
    const signal: NeuralBridgeSignal = {
      action: 'self.nervous_system',
      cpuUsage: 67,
      temperatureC: 51.2,
    };

    expect(getPacingTelemetryPayload('Hello', signal)).toEqual({
      responseLength: 5,
      cpuUsage: 67,
      temperatureC: 51.2,
    });
  });
});
