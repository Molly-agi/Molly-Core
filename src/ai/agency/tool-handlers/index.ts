/**
 * @fileOverview Tool Handler Registry
 *
 * Central index for all tool handlers. Import handlers from here
 * to keep the main tool-executor.ts file clean and modular.
 */

export type { ToolResult, ToolHandler, ToolHandlerMap } from './types';

// Export individual handler modules
export {
  systemToolHandlers,
  isCommandSafe,
  resolveSafePath,
} from './system-tools';
export { diagnosticToolHandlers } from './diagnostic-tools';
export { webToolHandlers } from './web-tools';
export { familyToolHandlers } from './family-tools';

// Import all handlers
import { systemToolHandlers } from './system-tools';
import { diagnosticToolHandlers } from './diagnostic-tools';
import { webToolHandlers } from './web-tools';
import { familyToolHandlers } from './family-tools';
import type { ToolHandler } from './types';

/**
 * Combined handler map for all modular tools.
 * Tools in this map are handled by the extracted handlers.
 */
export const modularToolHandlers: Record<string, ToolHandler> = {
  ...systemToolHandlers,
  ...diagnosticToolHandlers,
  ...webToolHandlers,
  ...familyToolHandlers,
};

/**
 * Check if a tool has a modular handler
 */
export function hasModularHandler(tool: string): boolean {
  return tool in modularToolHandlers;
}

/**
 * Get the handler for a tool
 */
export function getModularHandler(tool: string): ToolHandler | undefined {
  return modularToolHandlers[tool];
}
