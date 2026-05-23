/**
 * @fileOverview Widget Tool Handlers
 *
 * Handlers for widget control (showing/hiding the Molly widget on Android).
 */

import type { ToolHandler } from './types';
import { controlWidget } from '../../tools/widget-control';
import { MollyLogger } from '../../logger';

/**
 * Widget tool handlers map
 */
export const widgetToolHandlers: Record<string, ToolHandler> = {
  controlWidget: async (params) => {
    try {
      const result = await controlWidget.fn(params);
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      MollyLogger.error(`Widget tool error: ${errorMsg}`, 'widget-tools');
      return {
        success: false,
        message: `Widget control failed: ${errorMsg}`,
      };
    }
  },
};
