/**
 * MCP (Model Context Protocol) Integration for Molly-Core
 *
 * This module provides MCP client functionality, allowing Molly
 * to connect to external tool servers via the Model Context Protocol.
 *
 * @example
 * ```typescript
 * import { McpServerConfigSchema, isConnected } from '@/ai/mcp';
 *
 * // Validate a server config
 * const config = McpServerConfigSchema.parse({
 *   type: 'stdio',
 *   command: 'npx',
 *   args: ['-y', '@modelcontextprotocol/server-filesystem']
 * });
 * ```
 *
 * @see https://modelcontextprotocol.io/
 */

// ============================================================================
// Schema Exports (for validation)
// ============================================================================

export {
  McpStdioServerConfigSchema,
  McpSSEServerConfigSchema,
  McpHTTPServerConfigSchema,
  McpWebSocketServerConfigSchema,
  McpServerConfigSchema,
  McpJsonConfigSchema,
} from './types';

// ============================================================================
// Type Exports
// ============================================================================

export type {
  // Server configs
  McpStdioServerConfig,
  McpSSEServerConfig,
  McpHTTPServerConfig,
  McpWebSocketServerConfig,
  McpServerConfig,
  McpJsonConfig,
  // Connection states
  ConnectedMCPServer,
  FailedMCPServer,
  PendingMCPServer,
  DisabledMCPServer,
  MCPServerConnection,
  // Tool types
  McpSerializedTool,
  McpToolCallResult,
  // State
  McpState,
  // Options
  McpConnectOptions,
} from './types';

// ============================================================================
// Constants
// ============================================================================

export { DEFAULT_MCP_CONNECT_OPTIONS } from './types';

// ============================================================================
// Type Guards
// ============================================================================

export {
  isConnected,
  isFailed,
  isPending,
  isDisabled,
  isStdioConfig,
  isRemoteConfig,
} from './types';
