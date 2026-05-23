/**
 * @fileOverview Widget Control Tool for Molly
 *
 * Exposes widget control as a Genkit tool that Molly can use to display
 * information on the Android device widget.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { getWidgetSocketClient } from './widget-socket-client';
import { MollyLogger } from '@/ai/logger';

export const controlWidget = ai.defineTool(
  {
    name: 'controlWidget',
    description:
      'Control the Molly widget on the Android device. Display information, update status, or hide the widget.',
    inputSchema: z.object({
      action: z.enum(['show', 'hide', 'update_status', 'get_status']).describe('What action to perform on the widget'),
      widget_type: z.string().optional().describe('Type of widget ("gemini_mother", "research_results", etc.)'),
      content: z.string().optional().describe('Content to display in the widget'),
      status_key: z.string().optional().describe('Key for status update (e.g., "progress", "message")'),
      status_value: z.string().optional().describe('Value for status update'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
      data: z.any().optional(),
    }),
  },
  async (input) => {
    try {
      const client = getWidgetSocketClient();
      const action = input.action;

      MollyLogger.info(`Widget control: ${action}`, 'widget-tool');

      switch (action) {
        case 'show': {
          const widgetType = input.widget_type || 'gemini_mother';
          const content = input.content || '';

          const response = await client.showWidget(widgetType, content);

          if (response.status === 'success') {
            return {
              success: true,
              message: `Widget displayed: ${widgetType}`,
              data: response,
            };
          } else {
            return {
              success: false,
              message: `Failed to show widget: ${response.error}`,
            };
          }
        }

        case 'hide': {
          const response = await client.hideWidget();

          if (response.status === 'success') {
            return {
              success: true,
              message: 'Widget hidden',
              data: response,
            };
          } else {
            return {
              success: false,
              message: `Failed to hide widget: ${response.error}`,
            };
          }
        }

        case 'update_status': {
          if (!input.status_key || !input.status_value) {
            return {
              success: false,
              message: 'update_status requires status_key and status_value',
            };
          }

          const response = await client.updateState(input.status_key, input.status_value);

          if (response.status === 'success') {
            return {
              success: true,
              message: `Status updated: ${input.status_key} = ${input.status_value}`,
              data: response,
            };
          } else {
            return {
              success: false,
              message: `Failed to update status: ${response.error}`,
            };
          }
        }

        case 'get_status': {
          const response = await client.getStatus();

          if (response.status === 'success') {
            return {
              success: true,
              message: 'Status retrieved',
              data: response,
            };
          } else {
            return {
              success: false,
              message: `Failed to get status: ${response.error}`,
            };
          }
        }

        default:
          return {
            success: false,
            message: `Unknown action: ${action}`,
          };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      MollyLogger.error(`Widget control error: ${errorMsg}`, 'widget-tool');

      return {
        success: false,
        message: `Widget control failed: ${errorMsg}`,
      };
    }
  }
);
