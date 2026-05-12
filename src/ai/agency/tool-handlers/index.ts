// export { bugBountyToolHandlers } from './bug-bounty-tools';
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
export { initiativeToolHandlers } from './initiative-tools';
export { securityToolHandlers } from './security-tools';
export { sessionToolHandlers } from './session-tools';
export { visionToolHandlers } from './vision-tools';
export { vocalToolHandlers } from './vocal-tools';
export { buildRecoveryToolHandlers } from './build-recovery-tools';
export { databaseToolHandlers } from './database-tools';
export { sandboxToolHandlers } from './sandbox-tools';
export { rogueToolHandlers } from './rogue-tools';
export { cognitionToolHandlers } from './cognition-tools';
export { planningToolHandlers } from './planning-tools';
export { memoryToolHandlers } from './memory-tools';
export { safetyToolHandlers } from './safety-tools';
export { coreToolHandlers } from './core-tools';
export { sensingToolHandlers } from './sensing-tools';
export { geminiToolHandlers } from './gemini-tools';
export { bugBountyToolHandlers } from './bug-bounty-tools';
export { searchToolHandlers } from './search-tools';
export {
  mcpToolHandlers,
  getMcpHandlers,
  isMcpTool,
  getMcpHandler,
  listAvailableMcpTools,
  getMcpToolsCount,
} from './mcp-tools';

// Import all handlers
import { systemToolHandlers } from './system-tools';
import { diagnosticToolHandlers } from './diagnostic-tools';
import { webToolHandlers } from './web-tools';
import { familyToolHandlers } from './family-tools';
import { initiativeToolHandlers } from './initiative-tools';
import { securityToolHandlers } from './security-tools';
import { sessionToolHandlers } from './session-tools';
import { visionToolHandlers } from './vision-tools';
import { vocalToolHandlers } from './vocal-tools';
import { buildRecoveryToolHandlers } from './build-recovery-tools';
import { databaseToolHandlers } from './database-tools';
import { sandboxToolHandlers } from './sandbox-tools';
import { rogueToolHandlers } from './rogue-tools';
import { cognitionToolHandlers } from './cognition-tools';
import { planningToolHandlers } from './planning-tools';
import { memoryToolHandlers } from './memory-tools';
import { safetyToolHandlers } from './safety-tools';
import { coreToolHandlers } from './core-tools';
import { sensingToolHandlers } from './sensing-tools';
import { geminiToolHandlers } from './gemini-tools';
import { bugBountyToolHandlers } from './bug-bounty-tools';
import { searchToolHandlers } from './search-tools';
import type { ToolHandler } from './types';

/**
 * Combined handler map for all modular tools.
 * Tools in this map are handled by the extracted handlers.
 */
const modularToolHandlers: Record<string, ToolHandler> = {
  ...systemToolHandlers,
  ...diagnosticToolHandlers,
  ...webToolHandlers,
  ...familyToolHandlers,
  ...initiativeToolHandlers,
  ...securityToolHandlers,
  ...sessionToolHandlers,
  ...visionToolHandlers,
  ...vocalToolHandlers,
  ...buildRecoveryToolHandlers,
  ...databaseToolHandlers,
  ...sandboxToolHandlers,
  ...rogueToolHandlers,
  ...cognitionToolHandlers,
  ...planningToolHandlers,
  ...memoryToolHandlers,
  ...safetyToolHandlers,
  ...coreToolHandlers,
  ...sensingToolHandlers,
  ...geminiToolHandlers,
  ...bugBountyToolHandlers,
  ...searchToolHandlers,
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
