/**
 * MCP Tool Handlers
 *
 * Integrates MCP (Model Context Protocol) tools into Molly's tool system.
 * Tools are dynamically registered when MCP servers connect.
 */

import type { ToolHandler, ToolHandlerMap } from './types';
import {
  getMcpToolHandlers,
  hasMcpToolHandler,
  getMcpToolHandler,
  isMcpToolName,
  listMcpTools,
  getMcpToolCount,
} from '@/ai/mcp/tool-adapter';

/**
 * Get current MCP tool handlers.
 *
 * Note: This returns a snapshot of currently registered handlers.
 * MCP tools are registered dynamically when servers connect.
 */
export function getMcpHandlers(): ToolHandlerMap {
  return getMcpToolHandlers();
}

/**
 * Check if a tool is an MCP tool and has a handler.
 */
export function isMcpTool(toolName: string): boolean {
  return isMcpToolName(toolName) && hasMcpToolHandler(toolName);
}

/**
 * Get handler for an MCP tool.
 */
export function getMcpHandler(toolName: string): ToolHandler | undefined {
  if (!isMcpToolName(toolName)) {
    return undefined;
  }
  return getMcpToolHandler(toolName);
}

/**
 * List all available MCP tools.
 */
export function listAvailableMcpTools(): Array<{
  name: string;
  server: string;
  description?: string;
}> {
  return listMcpTools();
}

/**
 * Get count of available MCP tools.
 */
export function getMcpToolsCount(): number {
  return getMcpToolCount();
}

/**
 * Static handler map for compatibility with modularToolHandlers pattern.
 * Note: MCP tools are dynamically registered, so this starts empty.
 * Use getMcpHandlers() or isMcpTool()/getMcpHandler() for dynamic access.
 */
export const mcpToolHandlers: ToolHandlerMap = {};
