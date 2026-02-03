import { ai } from '@/ai/genkit';
import { z } from 'zod';

/**
 * @fileOverview System Bridge Tools
 * Provides Molly with "senses" regarding the Android hardware state.
 */

export const getSystemHealth = ai.defineTool(
  {
    name: 'getSystemHealth',
    description: 'Retrieves hardware status (Battery, Thermal, CPU) from the Termux environment.',
    inputSchema: z.object({}),
    outputSchema: z.object({
      batteryLevel: z.number().describe('Percentage of battery remaining.'),
      isCharging: z.boolean(),
      temperature: z.number().describe('CPU temperature in Celsius.'),
      throttlingStatus: z.string().describe('Current thermal throttling state.'),
    }),
  },
  async () => {
    // In a real Termux environment, this would call 'termux-battery-status' 
    // and parse /sys/class/thermal/thermal_zone*. 
    // Here we simulate the hardware "feeling".
    return {
      batteryLevel: 78,
      isCharging: false,
      temperature: 42,
      throttlingStatus: 'Normal',
    };
  }
);
