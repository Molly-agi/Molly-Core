/**
 * MCP Tool Adapter
 *
 * Bridges MCP tools into Molly's tool handler system.
 * Converts MCP tool definitions to Molly ToolHandler format.
 */

import { MollyLogger } from '@/ai/logger';
import type { ToolHandler, ToolResult } from '@/ai/agency/tool-handlers/types';
import {
  callTool,
  listServerTools,
  isServerConnected,
  getConnectedServers,
} from './client';
import type { McpTool, McpToolResult, McpContent } from './types';

// ============================================================================
// TOOL NAME NORMALIZATION
// ============================================================================

/**
 * Create a normalized tool name for Molly's registry.
 * Format: mcp_<server>_<tool>
 *
 * @param serverName - MCP server name
 * @param toolName - Original tool name from server
 * @returns Normalized tool name
 */
export function normalizeMcpToolName(
  serverName: string,
  toolName: string
): string {
  // Replace non-alphanumeric chars with underscores
  const normalizedServer = serverName.replace(/[^a-zA-Z0-9]/g, '_');
  const normalizedTool = toolName.replace(/[^a-zA-Z0-9]/g, '_');
  return `mcp_${normalizedServer}_${normalizedTool}`;
}

/**
 * Parse a normalized MCP tool name back to server and tool.
 *
 * @param normalizedName - Normalized tool name (mcp_server_tool)
 * @returns Server and tool name, or null if not an MCP tool
 */
export function parseMcpToolName(
  normalizedName: string
): { server: string; tool: string } | null {
  if (!normalizedName.startsWith('mcp_')) {
    return null;
  }

  const withoutPrefix = normalizedName.slice(4);
  const firstUnderscore = withoutPrefix.indexOf('_');

  if (firstUnderscore === -1) {
    return null;
  }

  return {
    server: withoutPrefix.slice(0, firstUnderscore),
    tool: withoutPrefix.slice(firstUnderscore + 1),
  };
}

/**
 * Check if a tool name is an MCP tool.
 */
export function isMcpToolName(toolName: string | undefined): boolean {
  return typeof toolName === 'string' && toolName.startsWith('mcp_');
}

// ============================================================================
// RESULT FORMATTING
// ============================================================================

/**
 * Format MCP content for Molly's output format.
 */
function formatContent(content: McpContent): string {
  switch (content.type) {
    case 'text':
      return content.text;
    case 'image':
      return `[Image: ${content.mimeType}, ${content.data.length} bytes]`;
    case 'resource':
      if (content.resource.text) {
        return content.resource.text;
      }
      if (content.resource.blob) {
        return `[Resource: ${content.resource.uri}, ${content.resource.blob.length} bytes]`;
      }
      return `[Resource: ${content.resource.uri}]`;
    default:
      return JSON.stringify(content);
  }
}

/**
 * Convert MCP tool result to Molly ToolResult format.
 */
export function mcpResultToToolResult(mcpResult: McpToolResult): ToolResult {
  const output = mcpResult.content.map(formatContent).join('\n');

  return {
    success: !mcpResult.isError,
    output: output || (mcpResult.isError ? 'Tool call failed' : 'Success'),
    data: {
      mcpContent: mcpResult.content,
      _meta: mcpResult._meta,
    },
  };
}

// ============================================================================
// TOOL HANDLER CREATION
// ============================================================================

/**
 * Create a Molly ToolHandler for an MCP tool.
 *
 * @param serverName - MCP server name
 * @param mcpTool - MCP tool definition
 * @returns Molly-compatible tool handler
 */
export function createMcpToolHandler(
  serverName: string,
  mcpTool: McpTool
): ToolHandler {
  return async (params: Record<string, unknown>): Promise<ToolResult> => {
    // Check server connection
    if (!isServerConnected(serverName)) {
      return {
        success: false,
        output: `MCP server "${serverName}" is not connected`,
      };
    }

    try {
      MollyLogger.debug(
        `Calling MCP tool: ${serverName}/${mcpTool.name}`,
        'mcp-adapter'
      );

      const mcpResult = await callTool(serverName, mcpTool.name, params);
      return mcpResultToToolResult(mcpResult);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      MollyLogger.error(
        `MCP tool adapter error (${serverName}/${mcpTool.name}): ${errorMessage}`,
        'mcp-adapter'
      );

      return {
        success: false,
        output: `MCP tool error: ${errorMessage}`,
      };
    }
  };
}

/**
 * Convert an MCP tool to a Molly handler entry.
 * Returns tuple of [normalizedName, handler].
 */
export function mcpToolToHandlerEntry(
  serverName: string,
  mcpTool: McpTool
): [string, ToolHandler] {
  const normalizedName = normalizeMcpToolName(serverName, mcpTool.name);
  const handler = createMcpToolHandler(serverName, mcpTool);
  return [normalizedName, handler];
}

// ============================================================================
// HANDLER REGISTRY
// ============================================================================

/**
 * Registry of dynamically loaded MCP tool handlers.
 * This is updated when MCP servers connect/disconnect.
 */
const mcpToolRegistry = new Map<string, ToolHandler>();

/**
 * Tool metadata for documentation/introspection.
 */
const mcpToolMetadata = new Map<
  string,
  { server: string; tool: McpTool; normalizedName: string }
>();

/**
 * Register tools from an MCP server.
 *
 * @param serverName - Server name
 * @returns Number of tools registered
 */
export async function registerServerTools(serverName: string): Promise<number> {
  if (!isServerConnected(serverName)) {
    MollyLogger.warn(
      `Cannot register tools: server ${serverName} not connected`,
      'mcp-adapter'
    );
    return 0;
  }

  const tools = await listServerTools(serverName);

  for (const tool of tools) {
    const [normalizedName, handler] = mcpToolToHandlerEntry(serverName, tool);
    mcpToolRegistry.set(normalizedName, handler);
    mcpToolMetadata.set(normalizedName, {
      server: serverName,
      tool,
      normalizedName,
    });
  }

  MollyLogger.info(
    `Registered ${tools.length} MCP tools from ${serverName}`,
    'mcp-adapter'
  );

  return tools.length;
}

/**
 * Unregister tools from an MCP server.
 *
 * @param serverName - Server name
 * @returns Number of tools unregistered
 */
export function unregisterServerTools(serverName: string): number {
  let count = 0;

  for (const [name, meta] of mcpToolMetadata.entries()) {
    if (meta.server === serverName) {
      mcpToolRegistry.delete(name);
      mcpToolMetadata.delete(name);
      count++;
    }
  }

  if (count > 0) {
    MollyLogger.debug(
      `Unregistered ${count} MCP tools from ${serverName}`,
      'mcp-adapter'
    );
  }

  return count;
}

/**
 * Register tools from all connected servers.
 *
 * @returns Total number of tools registered
 */
export async function registerAllServerTools(): Promise<number> {
  const servers = getConnectedServers();
  let total = 0;

  for (const server of servers) {
    total += await registerServerTools(server);
  }

  return total;
}

/**
 * Clear all registered MCP tools.
 */
export function clearMcpToolRegistry(): void {
  mcpToolRegistry.clear();
  mcpToolMetadata.clear();
}

// ============================================================================
// HANDLER ACCESS
// ============================================================================

/**
 * Get an MCP tool handler by normalized name.
 */
export function getMcpToolHandler(
  normalizedName: string
): ToolHandler | undefined {
  return mcpToolRegistry.get(normalizedName);
}

/**
 * Check if an MCP tool handler exists.
 */
export function hasMcpToolHandler(normalizedName: string): boolean {
  return mcpToolRegistry.has(normalizedName);
}

/**
 * Get all registered MCP tool handlers.
 */
export function getMcpToolHandlers(): Record<string, ToolHandler> {
  return Object.fromEntries(mcpToolRegistry);
}

/**
 * Get metadata for an MCP tool.
 */
export function getMcpToolMetadata(
  normalizedName: string
): { server: string; tool: McpTool; normalizedName: string } | undefined {
  return mcpToolMetadata.get(normalizedName);
}

/**
 * List all registered MCP tools with metadata.
 */
export function listMcpTools(): Array<{
  name: string;
  server: string;
  description?: string;
}> {
  return Array.from(mcpToolMetadata.values()).map((meta) => ({
    name: meta.normalizedName,
    server: meta.server,
    description: meta.tool.description,
  }));
}

/**
 * Get count of registered MCP tools.
 */
export function getMcpToolCount(): number {
  return mcpToolRegistry.size;
}
