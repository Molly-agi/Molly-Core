/**
 * MCP Client
 *
 * Manages connections to MCP servers and provides methods for
 * listing and calling MCP tools.
 *
 * Simplified from Lazarus architecture for Molly-Core.
 */

import { Client } from '@modelcontextprotocol/sdk/client';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport';
import { MollyLogger } from '@/ai/logger';
import {
  type McpServerConfig,
  type McpStdioServerConfig,
  type McpSSEServerConfig,
  type McpHTTPServerConfig,
  type McpWebSocketServerConfig,
  type ScopedMcpServerConfig,
  type ConnectedMCPServer,
  type FailedMCPServer,
  type MCPServerConnection,
  type McpTool,
  type McpToolResult,
  type McpConnectOptions,
  DEFAULT_MCP_CONNECT_OPTIONS,
  isStdioConfig,
  isSSEConfig,
  isHTTPConfig,
  isWebSocketConfig,
} from './types';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Timeout for tool calls (60 seconds) */
const TOOL_CALL_TIMEOUT_MS = 60000;

/** Client name for MCP protocol */
const CLIENT_NAME = 'molly-mcp-client';

/** Client version */
const CLIENT_VERSION = '1.0.0';

// ============================================================================
// INTERNAL STATE
// ============================================================================

/**
 * Map of server name to active MCP client instance.
 * We keep this separate from the MCPServerConnection to avoid
 * exposing the SDK client in our public types.
 */
const activeClients = new Map<string, Client>();

/**
 * Map of server name to transport instance for cleanup.
 */
const activeTransports = new Map<string, Transport>();

// ============================================================================
// TRANSPORT CREATION
// ============================================================================

/**
 * Create a transport for a stdio MCP server.
 */
function createStdioTransport(config: McpStdioServerConfig): Transport {
  return new StdioClientTransport({
    command: config.command,
    args: config.args ?? [],
    env: config.env,
    stderr: 'pipe', // Capture stderr for logging
  });
}

/**
 * Create a transport for an SSE MCP server.
 */
function createSSETransport(config: McpSSEServerConfig): Transport {
  const url = new URL(config.url);
  return new SSEClientTransport(url, {
    requestInit: config.headers ? { headers: config.headers } : undefined,
  });
}

/**
 * Create a transport for an HTTP MCP server.
 * Note: Uses SSE transport as the SDK's streamableHttp is similar in behavior.
 */
function createHTTPTransport(config: McpHTTPServerConfig): Transport {
  const url = new URL(config.url);
  return new SSEClientTransport(url, {
    requestInit: config.headers ? { headers: config.headers } : undefined,
  });
}

/**
 * Create a transport for a WebSocket MCP server.
 */
function createWebSocketTransport(config: McpWebSocketServerConfig): Transport {
  const url = new URL(config.url);
  return new WebSocketClientTransport(url);
}

/**
 * Create appropriate transport for server config.
 */
function createTransport(config: McpServerConfig): Transport {
  if (isStdioConfig(config)) {
    return createStdioTransport(config);
  }
  if (isSSEConfig(config)) {
    return createSSETransport(config);
  }
  if (isHTTPConfig(config)) {
    return createHTTPTransport(config);
  }
  if (isWebSocketConfig(config)) {
    return createWebSocketTransport(config);
  }

  // Default to stdio if type is ambiguous
  MollyLogger.warn(`Unknown transport type, defaulting to stdio`, 'mcp-client');
  return createStdioTransport(config as McpStdioServerConfig);
}

// ============================================================================
// CONNECTION MANAGEMENT
// ============================================================================

/**
 * Connect to an MCP server.
 *
 * @param name - Server name (for logging and identification)
 * @param config - Server configuration
 * @param options - Connection options
 * @returns Connected or failed server state
 */
export async function connectToServer(
  name: string,
  config: ScopedMcpServerConfig,
  options: McpConnectOptions = {}
): Promise<MCPServerConnection> {
  const opts = { ...DEFAULT_MCP_CONNECT_OPTIONS, ...options };

  MollyLogger.debug(`Connecting to MCP server: ${name}`, 'mcp-client');

  // Disconnect existing connection if any
  await disconnectServer(name);

  try {
    // Create transport and client
    const transport = createTransport(config);
    const client = new Client(
      { name: CLIENT_NAME, version: CLIENT_VERSION },
      { capabilities: {} }
    );

    // Set up error handling on transport
    transport.onerror = (error) => {
      MollyLogger.error(
        `MCP transport error for ${name}: ${error.message}`,
        'mcp-client'
      );
    };

    transport.onclose = () => {
      MollyLogger.debug(`MCP transport closed for ${name}`, 'mcp-client');
      activeClients.delete(name);
      activeTransports.delete(name);
    };

    // Connect with timeout
    const connectPromise = client.connect(transport);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Connection timeout after ${opts.timeoutMs}ms`)),
        opts.timeoutMs
      );
    });

    await Promise.race([connectPromise, timeoutPromise]);

    // Store client and transport
    activeClients.set(name, client);
    activeTransports.set(name, transport);

    // Get server info
    const capabilities = client.getServerCapabilities() ?? {};
    const serverVersion = client.getServerVersion();
    const instructions = client.getInstructions();

    MollyLogger.info(
      `Connected to MCP server: ${name}${serverVersion ? ` (${serverVersion.name} v${serverVersion.version})` : ''}`,
      'mcp-client'
    );

    const connected: ConnectedMCPServer = {
      name,
      type: 'connected',
      capabilities: {
        tools: capabilities.tools,
        resources: capabilities.resources,
        prompts: capabilities.prompts,
        logging: capabilities.logging,
      },
      serverInfo: serverVersion
        ? { name: serverVersion.name, version: serverVersion.version }
        : undefined,
      instructions,
      config,
      cleanup: async () => {
        await disconnectServer(name);
      },
    };

    return connected;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    MollyLogger.error(
      `Failed to connect to MCP server ${name}: ${errorMessage}`,
      'mcp-client'
    );

    const failed: FailedMCPServer = {
      name,
      type: 'failed',
      config,
      error: errorMessage,
    };

    return failed;
  }
}

/**
 * Disconnect from an MCP server.
 *
 * @param name - Server name to disconnect
 */
export async function disconnectServer(name: string): Promise<void> {
  const transport = activeTransports.get(name);
  if (transport) {
    try {
      await transport.close();
    } catch (error) {
      MollyLogger.warn(
        `Error closing transport for ${name}: ${error instanceof Error ? error.message : 'unknown'}`,
        'mcp-client'
      );
    }
  }

  activeClients.delete(name);
  activeTransports.delete(name);
}

/**
 * Disconnect all connected servers.
 */
export async function disconnectAll(): Promise<void> {
  const names = Array.from(activeClients.keys());
  await Promise.all(names.map(disconnectServer));
}

/**
 * Check if a server is currently connected.
 */
export function isServerConnected(name: string): boolean {
  return activeClients.has(name);
}

/**
 * Get a list of all connected server names.
 */
export function getConnectedServers(): string[] {
  return Array.from(activeClients.keys());
}

// ============================================================================
// TOOL OPERATIONS
// ============================================================================

/**
 * List tools from a connected MCP server.
 *
 * @param name - Server name
 * @returns List of tools or empty array if not connected
 */
export async function listServerTools(name: string): Promise<McpTool[]> {
  const client = activeClients.get(name);
  if (!client) {
    MollyLogger.warn(
      `Cannot list tools: server ${name} not connected`,
      'mcp-client'
    );
    return [];
  }

  try {
    const result = await client.listTools();

    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as McpTool['inputSchema'],
      server: name,
    }));
  } catch (error) {
    MollyLogger.error(
      `Error listing tools from ${name}: ${error instanceof Error ? error.message : 'unknown'}`,
      'mcp-client'
    );
    return [];
  }
}

/**
 * List tools from all connected servers.
 *
 * @returns Combined list of tools from all servers
 */
export async function listAllTools(): Promise<McpTool[]> {
  const servers = getConnectedServers();
  const toolLists = await Promise.all(servers.map(listServerTools));
  return toolLists.flat();
}

/**
 * Call a tool on an MCP server.
 *
 * @param serverName - Server name
 * @param toolName - Tool name on that server
 * @param args - Tool arguments
 * @returns Tool result
 */
export async function callTool(
  serverName: string,
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<McpToolResult> {
  const client = activeClients.get(serverName);
  if (!client) {
    return {
      content: [
        {
          type: 'text',
          text: `MCP server "${serverName}" not connected`,
        },
      ],
      isError: true,
    };
  }

  try {
    // Call with timeout
    const callPromise = client.callTool({
      name: toolName,
      arguments: args,
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(`Tool call timeout after ${TOOL_CALL_TIMEOUT_MS}ms`)
          ),
        TOOL_CALL_TIMEOUT_MS
      );
    });

    const result = await Promise.race([callPromise, timeoutPromise]);

    // Handle the result format from SDK
    if ('content' in result) {
      return {
        content: result.content.map((c) => {
          if (c.type === 'text') {
            return { type: 'text' as const, text: c.text };
          }
          if (c.type === 'image') {
            return {
              type: 'image' as const,
              data: c.data,
              mimeType: c.mimeType,
            };
          }
          if (c.type === 'resource') {
            return {
              type: 'resource' as const,
              resource: c.resource,
            };
          }
          // Default to text for unknown types
          return { type: 'text' as const, text: JSON.stringify(c) };
        }),
        isError: result.isError,
        _meta: result._meta,
      };
    }

    // Legacy toolResult format
    if ('toolResult' in result) {
      return {
        content: [
          {
            type: 'text',
            text:
              typeof result.toolResult === 'string'
                ? result.toolResult
                : JSON.stringify(result.toolResult),
          },
        ],
        isError: false,
      };
    }

    // Unknown format
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      isError: false,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    MollyLogger.error(
      `MCP tool call failed (${serverName}/${toolName}): ${errorMessage}`,
      'mcp-client'
    );

    return {
      content: [{ type: 'text', text: `Tool call error: ${errorMessage}` }],
      isError: true,
    };
  }
}

// ============================================================================
// RESOURCE OPERATIONS
// ============================================================================

/**
 * List resources from a connected MCP server.
 *
 * @param name - Server name
 * @returns List of resources or empty array if not connected
 */
export async function listServerResources(
  name: string
): Promise<
  { uri: string; name: string; description?: string; mimeType?: string }[]
> {
  const client = activeClients.get(name);
  if (!client) {
    return [];
  }

  try {
    const result = await client.listResources();
    return result.resources.map((r) => ({
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType,
    }));
  } catch (error) {
    MollyLogger.error(
      `Error listing resources from ${name}: ${error instanceof Error ? error.message : 'unknown'}`,
      'mcp-client'
    );
    return [];
  }
}

/**
 * Read a resource from an MCP server.
 *
 * @param serverName - Server name
 * @param uri - Resource URI
 * @returns Resource contents
 */
export async function readResource(
  serverName: string,
  uri: string
): Promise<{ uri: string; text?: string; blob?: string; mimeType?: string }[]> {
  const client = activeClients.get(serverName);
  if (!client) {
    throw new Error(`MCP server "${serverName}" not connected`);
  }

  const result = await client.readResource({ uri });
  return result.contents.map((c) => ({
    uri: c.uri,
    text: 'text' in c ? c.text : undefined,
    blob: 'blob' in c ? c.blob : undefined,
    mimeType: c.mimeType,
  }));
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Ping an MCP server to check connectivity.
 *
 * @param name - Server name
 * @returns true if server responds, false otherwise
 */
export async function pingServer(name: string): Promise<boolean> {
  const client = activeClients.get(name);
  if (!client) {
    return false;
  }

  try {
    await client.ping();
    return true;
  } catch {
    return false;
  }
}
