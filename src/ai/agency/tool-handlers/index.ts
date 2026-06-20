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
export { httpToolHandlers } from './http-tools';
export { musicToolHandlers } from './music-tools';
export { researchToolHandlers } from './research-tools';
export { pdfToolHandlers } from './pdf-tools';
export { visualArtsToolHandlers } from './visual-arts-tools';
export { widgetToolHandlers } from './widget-tools';
export { autonomousToolHandlers } from './autonomous-tools';
export { bodyToolHandlers } from './body-tools';
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
import { httpToolHandlers } from './http-tools';
import { musicToolHandlers } from './music-tools';
import { researchToolHandlers } from './research-tools';
import { pdfToolHandlers } from './pdf-tools';
import { widgetToolHandlers } from './widget-tools';
import { autonomousToolHandlers } from './autonomous-tools';
import { bodyToolHandlers } from './body-tools';
import { operateComputer } from '../computer-use/computer-use-handler';
import type { ToolHandler } from './types';

/**
 * Combined handler map for all modular tools.
 * Tools in this map are handled by the extracted handlers.
 *
 * MOLLY_DISABLE_TOOLS=name1,name2 strips matching tools at module load.
 * Modeled on Claude Code's DISABLE_*_COMMAND env vars.
 */
const allHandlers: Record<string, ToolHandler> = {
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
  ...httpToolHandlers,
  ...musicToolHandlers,
  ...researchToolHandlers,
  ...pdfToolHandlers,
  ...widgetToolHandlers,
  ...autonomousToolHandlers,
  ...bodyToolHandlers,
  operateComputer,
};

function applyDisabledToolFilter(
  handlers: Record<string, ToolHandler>
): Record<string, ToolHandler> {
  const raw = process.env.MOLLY_DISABLE_TOOLS;
  if (!raw) return handlers;
  const disabled = new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  if (disabled.size === 0) return handlers;
  const filtered: Record<string, ToolHandler> = {};
  for (const [name, handler] of Object.entries(handlers)) {
    if (!disabled.has(name)) filtered[name] = handler;
  }
  return filtered;
}

const modularToolHandlers: Record<string, ToolHandler> =
  applyDisabledToolFilter(allHandlers);

/** Names of tools removed from the registry via MOLLY_DISABLE_TOOLS. */
export function getDisabledTools(): string[] {
  return Object.keys(allHandlers)
    .filter((name) => !(name in modularToolHandlers))
    .sort();
}

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
