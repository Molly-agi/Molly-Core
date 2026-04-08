/**
 * MCP (Model Context Protocol) Integration
 *
 * Public API for Molly's MCP integration.
 * Connects Molly to the MCP ecosystem of external tool servers.
 *
 * @module ai/mcp
 */

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export {
  // Schemas
  ConfigScopeSchema,
  TransportTypeSchema,
  McpStdioServerConfigSchema,
  McpSSEServerConfigSchema,
  McpHTTPServerConfigSchema,
  McpWebSocketServerConfigSchema,
  McpServerConfigSchema,
  McpJsonConfigSchema,
  // Types
  type ConfigScope,
  type TransportType,
  type McpStdioServerConfig,
  type McpSSEServerConfig,
  type McpHTTPServerConfig,
  type McpWebSocketServerConfig,
  type McpServerConfig,
  type ScopedMcpServerConfig,
  type McpJsonConfig,
  // Connection types
  type McpServerCapabilities,
  type McpServerInfo,
  type ConnectedMCPServer,
  type FailedMCPServer,
  type NeedsAuthMCPServer,
  type PendingMCPServer,
  type DisabledMCPServer,
  type MCPServerConnection,
  // Tool types
  type McpToolInputSchema,
  type McpTool,
  type McpTextContent,
  type McpImageContent,
  type McpResourceContent,
  type McpContent,
  type McpToolResult,
  // Resource types
  type McpResource,
  type ServerResource,
  // State types
  type McpState,
  type McpConnectOptions,
  // Constants
  DEFAULT_MCP_CONNECT_OPTIONS,
  // Type guards
  isConnected,
  isFailed,
  needsAuth,
  isPending,
  isDisabled,
  isStdioConfig,
  isSSEConfig,
  isHTTPConfig,
  isWebSocketConfig,
  getTransportType,
} from './types';

// ============================================================================
// CONFIG EXPORTS
// ============================================================================

export {
  // Config loading
  loadConfigFile,
  loadProjectConfig,
  loadAllConfigs,
  // Config utilities
  expandEnvVars,
  expandConfigEnvVars,
  addScopeToServers,
  getServerConfig,
  // Config validation
  isValidServerName,
  // Config serialization
  createEmptyConfig,
  serializeConfig,
  // Types
  type McpConfigResult,
  type ConfigLoadError,
} from './config';

// ============================================================================
// CLIENT EXPORTS
// ============================================================================

export {
  // Connection management
  connectToServer,
  disconnectServer,
  disconnectAll,
  isServerConnected,
  getConnectedServers,
  // Tool operations
  listServerTools,
  listAllTools,
  callTool,
  // Resource operations
  listServerResources,
  readResource,
  // Health check
  pingServer,
} from './client';
