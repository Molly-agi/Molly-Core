/**
 * MCP (Model Context Protocol) Type Definitions
 *
 * Adapted from Lazarus architecture for Molly-Core integration.
 * These types define server configurations, connection states,
 * and tool representations for MCP servers.
 *
 * @see https://modelcontextprotocol.io/
 */

import { z } from 'zod';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { ServerCapabilities } from '@modelcontextprotocol/sdk/types.js';

// ============================================================================
// Server Configuration Schemas
// ============================================================================

/**
 * Configuration for stdio-based MCP servers (local processes)
 */
export const McpStdioServerConfigSchema = z.object({
  type: z.literal('stdio').optional(), // Optional for backwards compatibility
  command: z.string().min(1, 'Command cannot be empty'),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).optional(),
});

/**
 * Configuration for SSE-based MCP servers (Server-Sent Events)
 */
export const McpSSEServerConfigSchema = z.object({
  type: z.literal('sse'),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
});

/**
 * Configuration for HTTP-based MCP servers (Streamable HTTP)
 */
export const McpHTTPServerConfigSchema = z.object({
  type: z.literal('http'),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
});

/**
 * Configuration for WebSocket-based MCP servers
 */
export const McpWebSocketServerConfigSchema = z.object({
  type: z.literal('ws'),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
});

/**
 * Union of all MCP server configuration types
 */
export const McpServerConfigSchema = z.union([
  McpStdioServerConfigSchema,
  McpSSEServerConfigSchema,
  McpHTTPServerConfigSchema,
  McpWebSocketServerConfigSchema,
]);

/**
 * Schema for the .mcp.json configuration file
 */
export const McpJsonConfigSchema = z.object({
  mcpServers: z.record(z.string(), McpServerConfigSchema),
});

// ============================================================================
// Type Exports (inferred from schemas)
// ============================================================================

export type McpStdioServerConfig = z.infer<typeof McpStdioServerConfigSchema>;
export type McpSSEServerConfig = z.infer<typeof McpSSEServerConfigSchema>;
export type McpHTTPServerConfig = z.infer<typeof McpHTTPServerConfigSchema>;
export type McpWebSocketServerConfig = z.infer<
  typeof McpWebSocketServerConfigSchema
>;
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;
export type McpJsonConfig = z.infer<typeof McpJsonConfigSchema>;

// ============================================================================
// Connection State Types
// ============================================================================

/**
 * A successfully connected MCP server
 */
export interface ConnectedMCPServer {
  name: string;
  type: 'connected';
  client: Client;
  capabilities: ServerCapabilities;
  config: McpServerConfig;
  serverInfo?: {
    name: string;
    version: string;
  };
  instructions?: string;
  cleanup: () => Promise<void>;
}

/**
 * An MCP server that failed to connect
 */
export interface FailedMCPServer {
  name: string;
  type: 'failed';
  config: McpServerConfig;
  error?: string;
}

/**
 * An MCP server that is currently connecting
 */
export interface PendingMCPServer {
  name: string;
  type: 'pending';
  config: McpServerConfig;
  reconnectAttempt?: number;
  maxReconnectAttempts?: number;
}

/**
 * An MCP server that has been disabled by the user
 */
export interface DisabledMCPServer {
  name: string;
  type: 'disabled';
  config: McpServerConfig;
}

/**
 * Union of all possible MCP server connection states
 */
export type MCPServerConnection =
  | ConnectedMCPServer
  | FailedMCPServer
  | PendingMCPServer
  | DisabledMCPServer;

// ============================================================================
// Tool Types
// ============================================================================

/**
 * Serialized representation of an MCP tool for storage/transmission
 */
export interface McpSerializedTool {
  /** The tool name (may be normalized) */
  name: string;
  /** Human-readable description */
  description: string;
  /** JSON Schema for tool input parameters */
  inputSchema?: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
  /** The server providing this tool */
  serverName: string;
  /** Original tool name before normalization */
  originalName?: string;
}

/**
 * Result from calling an MCP tool
 */
export interface McpToolCallResult {
  /** Content returned by the tool */
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
    [key: string]: unknown;
  }>;
  /** Whether the tool call resulted in an error */
  isError?: boolean;
  /** Metadata from the tool */
  _meta?: Record<string, unknown>;
}

// ============================================================================
// State Types
// ============================================================================

/**
 * Overall MCP system state
 */
export interface McpState {
  /** All configured servers and their connection states */
  servers: Map<string, MCPServerConnection>;
  /** All available tools from connected servers */
  tools: McpSerializedTool[];
  /** Whether the system has been initialized */
  initialized: boolean;
  /** Last error that occurred during initialization or operation */
  lastError?: string;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Options for connecting to an MCP server
 */
export interface McpConnectOptions {
  /** Connection timeout in milliseconds */
  timeoutMs?: number;
  /** Whether to auto-reconnect on failure */
  autoReconnect?: boolean;
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;
  /** Delay between reconnection attempts in milliseconds */
  reconnectDelayMs?: number;
}

/**
 * Default connection options
 */
export const DEFAULT_MCP_CONNECT_OPTIONS: Required<McpConnectOptions> = {
  timeoutMs: 30000,
  autoReconnect: true,
  maxReconnectAttempts: 3,
  reconnectDelayMs: 5000,
};

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a server connection is in a connected state
 */
export function isConnected(
  server: MCPServerConnection
): server is ConnectedMCPServer {
  return server.type === 'connected';
}

/**
 * Check if a server connection has failed
 */
export function isFailed(
  server: MCPServerConnection
): server is FailedMCPServer {
  return server.type === 'failed';
}

/**
 * Check if a server connection is pending
 */
export function isPending(
  server: MCPServerConnection
): server is PendingMCPServer {
  return server.type === 'pending';
}

/**
 * Check if a server is disabled
 */
export function isDisabled(
  server: MCPServerConnection
): server is DisabledMCPServer {
  return server.type === 'disabled';
}

/**
 * Check if a config is for a stdio server
 */
export function isStdioConfig(
  config: McpServerConfig
): config is McpStdioServerConfig {
  return config.type === undefined || config.type === 'stdio';
}

/**
 * Check if a config is for a remote server (SSE, HTTP, or WebSocket)
 */
export function isRemoteConfig(
  config: McpServerConfig
): config is
  | McpSSEServerConfig
  | McpHTTPServerConfig
  | McpWebSocketServerConfig {
  return (
    config.type === 'sse' || config.type === 'http' || config.type === 'ws'
  );
}
