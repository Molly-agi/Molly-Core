import type { NeuralBridgeSignal } from '@/ai/tools/neural-bridge';
import { MollyLogger } from '@/ai/logger';

type PacingTelemetryPayload = {
  responseLength: number;
  cpuUsage?: number;
  temperatureC?: number;
};

export function getPacingTelemetryPayload(
  responseText: string,
  nervousSignal?: NeuralBridgeSignal | null
): PacingTelemetryPayload | null {
  if (!responseText) return null;
  if (!nervousSignal || nervousSignal.action !== 'self.nervous_system') {
    return null;
  }

  return {
    responseLength: responseText.length,
    cpuUsage: nervousSignal.cpuUsage,
    temperatureC: nervousSignal.temperatureC,
  };
}

export function logPacingTelemetry(
  flowName: string,
  responseText: string,
  nervousSignal?: NeuralBridgeSignal | null
) {
  const payload = getPacingTelemetryPayload(responseText, nervousSignal);
  if (!payload) return;

  MollyLogger.info('Pacing telemetry', flowName, payload);
}
