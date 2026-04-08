/**
 * MCP (Model Context Protocol) Types
 *
 * Adapted from Lazarus architecture for Molly-Core integration.
 * Provides type definitions for MCP server configurations,
 * connection states, and tool representations.
 *
 * @see https://modelcontextprotocol.io/
 */

import { z } from 'zod';

// ============================================================================
// SERVER CONFIGURATION SCHEMAS
// ============================================================================

/**
 * Configuration scope - where the config was loaded from
 */
export const ConfigScopeSchema = z.enum(['local', 'project', 'dynamic']);
export type ConfigScope = z.infer<typeof ConfigScopeSchema>;

/**
 * Transport types supported by MCP
 */
export const TransportTypeSchema = z.enum(['stdio', 'sse', 'http', 'ws']);
export type TransportType = z.infer<typeof TransportTypeSchema>;

/**
 * Stdio server configuration - runs a local command
 */
export const McpStdioServerConfigSchema = z.object({
  type: z.literal('stdio').optional(), // Optional for backwards compatibility
  command: z.string().min(1, 'Command cannot be empty'),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).optional(),
});
export type McpStdioServerConfig = z.infer<typeof McpStdioServerConfigSchema>;

/**
 * SSE (Server-Sent Events) server configuration - connects to remote server
 */
export const McpSSEServerConfigSchema = z.object({
  type: z.literal('sse'),
  url: z.string().url('Invalid URL'),
  headers: z.record(z.string(), z.string()).optional(),
});
export type McpSSEServerConfig = z.infer<typeof McpSSEServerConfigSchema>;

/**
 * HTTP server configuration - connects via HTTP transport
 */
export const McpHTTPServerConfigSchema = z.object({
  type: z.literal('http'),
  url: z.string().url('Invalid URL'),
  headers: z.record(z.string(), z.string()).optional(),
});
export type McpHTTPServerConfig = z.infer<typeof McpHTTPServerConfigSchema>;

/**
 * WebSocket server configuration
 */
export const McpWebSocketServerConfigSchema = z.object({
  type: z.literal('ws'),
  url: z.string().url('Invalid URL'),
  headers: z.record(z.string(), z.string()).optional(),
});
export type McpWebSocketServerConfig = z.infer<
  typeof McpWebSocketServerConfigSchema
>;

/**
 * Union of all server config types
 */
export const McpServerConfigSchema = z.union([
  McpStdioServerConfigSchema,
  McpSSEServerConfigSchema,
  McpHTTPServerConfigSchema,
  McpWebSocketServerConfigSchema,
]);
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

/**
 * Server config with scope information
 */
export type ScopedMcpServerConfig = McpServerConfig & {
  scope: ConfigScope;
};

/**
 * MCP JSON config file schema (.mcp.json)
 */
export const McpJsonConfigSchema = z.object({
  mcpServers: z.record(z.string(), McpServerConfigSchema),
});
export type McpJsonConfig = z.infer<typeof McpJsonConfigSchema>;

// ============================================================================
// CONNECTION STATES
// ============================================================================

/**
 * Server capabilities returned after connection
 */
export interface McpServerCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  logging?: Record<string, unknown>;
}

/**
 * Server info returned after connection
 */
export interface McpServerInfo {
  name: string;
  version: string;
}

/**
 * Connected MCP server with active client
 */
export interface ConnectedMCPServer {
  name: string;
  type: 'connected';
  capabilities: McpServerCapabilities;
  serverInfo?: McpServerInfo;
  instructions?: string;
  config: ScopedMcpServerConfig;
  cleanup: () => Promise<void>;
}

/**
 * Failed MCP server connection
 */
export interface FailedMCPServer {
  name: string;
  type: 'failed';
  config: ScopedMcpServerConfig;
  error?: string;
}

/**
 * MCP server requiring authentication
 */
export interface NeedsAuthMCPServer {
  name: string;
  type: 'needs-auth';
  config: ScopedMcpServerConfig;
}

/**
 * Pending MCP server connection
 */
export interface PendingMCPServer {
  name: string;
  type: 'pending';
  config: ScopedMcpServerConfig;
  reconnectAttempt?: number;
  maxReconnectAttempts?: number;
}

/**
 * Disabled MCP server
 */
export interface DisabledMCPServer {
  name: string;
  type: 'disabled';
  config: ScopedMcpServerConfig;
}

/**
 * Union of all connection states
 */
export type MCPServerConnection =
  | ConnectedMCPServer
  | FailedMCPServer
  | NeedsAuthMCPServer
  | PendingMCPServer
  | DisabledMCPServer;

// ============================================================================
// TOOL TYPES
// ============================================================================

/**
 * MCP tool input schema (JSON Schema format)
 */
export interface McpToolInputSchema {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

/**
 * Serialized MCP tool representation
 */
export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: McpToolInputSchema;
  /** Server this tool belongs to */
  server: string;
  /** Original name from server (before normalization) */
  originalName?: string;
}

/**
 * MCP tool call result content types
 */
export interface McpTextContent {
  type: 'text';
  text: string;
}

export interface McpImageContent {
  type: 'image';
  data: string;
  mimeType: string;
}

export interface McpResourceContent {
  type: 'resource';
  resource: {
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
  };
}

export type McpContent = McpTextContent | McpImageContent | McpResourceContent;

/**
 * MCP tool call result
 */
export interface McpToolResult {
  content: McpContent[];
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

// ============================================================================
// RESOURCE TYPES
// ============================================================================

/**
 * MCP resource definition
 */
export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * MCP resource with server info
 */
export interface ServerResource extends McpResource {
  server: string;
}

// ============================================================================
// MCP STATE
// ============================================================================

/**
 * Overall MCP system state
 */
export interface McpState {
  servers: Record<string, MCPServerConnection>;
  tools: McpTool[];
  resources: Record<string, ServerResource[]>;
  lastUpdated: number;
}

// ============================================================================
// CONNECTION OPTIONS
// ============================================================================

/**
 * Options for connecting to MCP servers
 */
export interface McpConnectOptions {
  /** Connection timeout in milliseconds */
  timeoutMs?: number;
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;
  /** Base delay between reconnection attempts */
  reconnectDelayMs?: number;
}

/**
 * Default connection options
 */
export const DEFAULT_MCP_CONNECT_OPTIONS: Required<McpConnectOptions> = {
  timeoutMs: 30000,
  maxReconnectAttempts: 3,
  reconnectDelayMs: 1000,
};

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Check if a server connection is connected
 */
export function isConnected(
  server: MCPServerConnection
): server is ConnectedMCPServer {
  return server.type === 'connected';
}

/**
 * Check if a server connection failed
 */
export function isFailed(
  server: MCPServerConnection
): server is FailedMCPServer {
  return server.type === 'failed';
}

/**
 * Check if a server needs authentication
 */
export function needsAuth(
  server: MCPServerConnection
): server is NeedsAuthMCPServer {
  return server.type === 'needs-auth';
}

/**
 * Check if a server is pending connection
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
 * Check if config is for stdio transport
 */
export function isStdioConfig(
  config: McpServerConfig
): config is McpStdioServerConfig {
  return config.type === undefined || config.type === 'stdio';
}

/**
 * Check if config is for SSE transport
 */
export function isSSEConfig(
  config: McpServerConfig
): config is McpSSEServerConfig {
  return config.type === 'sse';
}

/**
 * Check if config is for HTTP transport
 */
export function isHTTPConfig(
  config: McpServerConfig
): config is McpHTTPServerConfig {
  return config.type === 'http';
}

/**
 * Check if config is for WebSocket transport
 */
export function isWebSocketConfig(
  config: McpServerConfig
): config is McpWebSocketServerConfig {
  return config.type === 'ws';
}

/**
 * Get transport type from config
 */
export function getTransportType(config: McpServerConfig): TransportType {
  if (isStdioConfig(config)) return 'stdio';
  if (isSSEConfig(config)) return 'sse';
  if (isHTTPConfig(config)) return 'http';
  if (isWebSocketConfig(config)) return 'ws';
  return 'stdio'; // Default fallback
}
