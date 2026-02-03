import { ai } from '@/ai/genkit';
import { z } from 'zod';

/**
 * @fileOverview System Bridge Tools
 * Provides Molly with "senses" regarding the Android hardware state.
 * These are the inputs for her "Proprioception" layer.
 */

export const getSystemHealth = ai.defineTool(
  {
    name: 'getSystemHealth',
    description: 'Retrieves hardware status (Battery, Thermal, CPU, Storage) from the Termux environment.',
    inputSchema: z.object({}),
    outputSchema: z.object({
      batteryLevel: z.number().describe('Percentage of battery remaining.'),
      isCharging: z.boolean(),
      temperature: z.number().describe('CPU temperature in Celsius.'),
      throttlingStatus: z.string().describe('Current thermal throttling state.'),
      cpuUsage: z.number().describe('Current CPU load percentage.'),
      storageStatus: z.string().describe('Available storage space in Termux.'),
    }),
  },
  async () => {
    // Simulated Proprioception
    return {
      batteryLevel: 78,
      isCharging: false,
      temperature: 42,
      throttlingStatus: 'Normal',
      cpuUsage: 15,
      storageStatus: '45GB Available',
    };
  }
);
