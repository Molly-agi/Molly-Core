/**
 * @fileOverview Widget Display Flow - Example
 *
 * A simple flow showing how Molly can use the widget to display information.
 * This demonstrates the integration between Molly's consciousness and the
 * Android widget via socket communication.
 */

import { defineFlow } from '@genkit-ai/flow';
import { z } from 'zod';
import { getWidgetSocketClient } from '@/ai/tools/widget-socket-client';
import { MollyLogger } from '@/ai/logger';

export const demoWidgetDisplay = defineFlow(
  {
    name: 'demoWidgetDisplay',
    inputSchema: z.object({
      message: z.string().describe('Message to display on the widget'),
      widget_type: z.string().optional().describe('Type of widget to show'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
  },
  async (input) => {
    try {
      const client = getWidgetSocketClient();
      const widgetType = input.widget_type || 'gemini_mother';

      MollyLogger.info(`Displaying message on widget: "${input.message}"`, 'widget-flow');

      // Check if widget is available
      const isAvailable = await client.isAvailable();
      if (!isAvailable) {
        return {
          success: false,
          message: 'Widget socket is not available. Is the APK running?',
        };
      }

      // Show the widget
      const response = await client.showWidget(widgetType, input.message);

      if (response.status === 'success') {
        MollyLogger.info('Widget displayed successfully', 'widget-flow');

        // Optionally update status after a delay
        await new Promise(r => setTimeout(r, 2000));
        await client.updateState('status', 'ready');

        return {
          success: true,
          message: `Widget displayed: ${input.message}`,
        };
      } else {
        return {
          success: false,
          message: `Failed to display widget: ${response.error}`,
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      MollyLogger.error(`Widget display flow error: ${errorMsg}`, 'widget-flow');

      return {
        success: false,
        message: `Error: ${errorMsg}`,
      };
    }
  }
);
