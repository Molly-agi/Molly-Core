/**
 * MCP Connection Manager
 *
 * Manages MCP server lifecycle including:
 * - Auto-connect on startup from config
 * - Reconnect on failure with exponential backoff
 * - Clean shutdown on process exit
 * - Health monitoring
 */

import { MollyLogger } from '@/ai/logger';
import {
  connectToServer,
  disconnectServer,
  disconnectAll,
  getConnectedServers,
  pingServer,
} from './client';
import {
  registerServerTools,
  unregisterServerTools,
  clearMcpToolRegistry,
} from './tool-adapter';
import { loadAllConfigs } from './config';
import type {
  ScopedMcpServerConfig,
  MCPServerConnection,
  McpConnectOptions,
} from './types';
import { isConnected, isFailed } from './types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Manager configuration options
 */
export interface McpManagerOptions {
  /** Auto-connect to servers from config on startup */
  autoConnect?: boolean;
  /** Enable automatic reconnection on failure */
  autoReconnect?: boolean;
  /** Maximum reconnection attempts per server */
  maxReconnectAttempts?: number;
  /** Base delay between reconnect attempts (ms) */
  reconnectDelayMs?: number;
  /** Maximum reconnect delay (ms) */
  maxReconnectDelayMs?: number;
  /** Health check interval (ms), 0 to disable */
  healthCheckIntervalMs?: number;
  /** Connection timeout (ms) */
  connectTimeoutMs?: number;
}

/**
 * Default manager options
 */
export const DEFAULT_MANAGER_OPTIONS: Required<McpManagerOptions> = {
  autoConnect: true,
  autoReconnect: true,
  maxReconnectAttempts: 5,
  reconnectDelayMs: 1000,
  maxReconnectDelayMs: 30000,
  healthCheckIntervalMs: 60000, // 1 minute
  connectTimeoutMs: 30000,
};

/**
 * Server state tracked by manager
 */
interface ManagedServer {
  name: string;
  config: ScopedMcpServerConfig;
  connection: MCPServerConnection | null;
  reconnectAttempts: number;
  reconnectTimer: NodeJS.Timeout | null;
  enabled: boolean;
}

/**
 * Manager status for diagnostics
 */
export interface McpManagerStatus {
  initialized: boolean;
  serverCount: number;
  connectedCount: number;
  failedCount: number;
  servers: Array<{
    name: string;
    status: 'connected' | 'failed' | 'pending' | 'disabled' | 'unknown';
    reconnectAttempts: number;
    error?: string;
  }>;
}

// ============================================================================
// MANAGER STATE
// ============================================================================

let managerOptions: Required<McpManagerOptions> = {
  ...DEFAULT_MANAGER_OPTIONS,
};
let initialized = false;
let healthCheckTimer: NodeJS.Timeout | null = null;
const managedServers = new Map<string, ManagedServer>();

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the MCP manager.
 * Loads config and optionally auto-connects to servers.
 *
 * @param options - Manager options
 */
export async function initializeMcpManager(
  options: McpManagerOptions = {}
): Promise<void> {
  if (initialized) {
    MollyLogger.warn('MCP manager already initialized', 'mcp-manager');
    return;
  }

  managerOptions = { ...DEFAULT_MANAGER_OPTIONS, ...options };

  MollyLogger.info('Initializing MCP manager', 'mcp-manager');

  // Load configurations
  const configResult = await loadAllConfigs();

  // Register servers from config
  for (const [name, config] of Object.entries(configResult.servers)) {
    managedServers.set(name, {
      name,
      config,
      connection: null,
      reconnectAttempts: 0,
      reconnectTimer: null,
      enabled: true,
    });
  }

  MollyLogger.debug(
    `Loaded ${managedServers.size} MCP server configurations`,
    'mcp-manager'
  );

  // Auto-connect if enabled
  if (managerOptions.autoConnect && managedServers.size > 0) {
    await connectAllServers();
  }

  // Start health checks if enabled
  if (managerOptions.healthCheckIntervalMs > 0) {
    startHealthChecks();
  }

  // Register cleanup handler
  registerCleanupHandler();

  initialized = true;
  MollyLogger.info('MCP manager initialized', 'mcp-manager');
}

/**
 * Shutdown the MCP manager.
 * Disconnects all servers and cleans up resources.
 */
export async function shutdownMcpManager(): Promise<void> {
  if (!initialized) {
    return;
  }

  MollyLogger.info('Shutting down MCP manager', 'mcp-manager');

  // Stop health checks
  stopHealthChecks();

  // Cancel all reconnect timers
  for (const server of managedServers.values()) {
    if (server.reconnectTimer) {
      clearTimeout(server.reconnectTimer);
      server.reconnectTimer = null;
    }
  }

  // Disconnect all servers
  await disconnectAll();

  // Clear tool registry
  clearMcpToolRegistry();

  // Clear state
  managedServers.clear();
  initialized = false;

  MollyLogger.info('MCP manager shutdown complete', 'mcp-manager');
}

// ============================================================================
// CONNECTION MANAGEMENT
// ============================================================================

/**
 * Connect to all configured servers.
 */
export async function connectAllServers(): Promise<void> {
  const servers = Array.from(managedServers.values()).filter((s) => s.enabled);

  MollyLogger.info(
    `Connecting to ${servers.length} MCP server(s)`,
    'mcp-manager'
  );

  await Promise.all(servers.map((s) => connectManagedServer(s.name)));
}

/**
 * Connect to a specific managed server.
 */
async function connectManagedServer(
  name: string
): Promise<MCPServerConnection | null> {
  const server = managedServers.get(name);
  if (!server) {
    MollyLogger.warn(`Unknown server: ${name}`, 'mcp-manager');
    return null;
  }

  if (!server.enabled) {
    MollyLogger.debug(`Server ${name} is disabled, skipping`, 'mcp-manager');
    return null;
  }

  // Cancel any pending reconnect
  if (server.reconnectTimer) {
    clearTimeout(server.reconnectTimer);
    server.reconnectTimer = null;
  }

  const connectOptions: McpConnectOptions = {
    timeoutMs: managerOptions.connectTimeoutMs,
  };

  const connection = await connectToServer(name, server.config, connectOptions);
  server.connection = connection;

  if (isConnected(connection)) {
    server.reconnectAttempts = 0;

    // Register tools from this server
    const toolCount = await registerServerTools(name);
    MollyLogger.debug(
      `Registered ${toolCount} tools from ${name}`,
      'mcp-manager'
    );
  } else if (isFailed(connection)) {
    // Schedule reconnect if enabled
    if (managerOptions.autoReconnect) {
      scheduleReconnect(name);
    }
  }

  return connection;
}

/**
 * Disconnect a specific server.
 */
export async function disconnectManagedServer(name: string): Promise<void> {
  const server = managedServers.get(name);
  if (!server) {
    return;
  }

  // Cancel any pending reconnect
  if (server.reconnectTimer) {
    clearTimeout(server.reconnectTimer);
    server.reconnectTimer = null;
  }

  // Unregister tools
  unregisterServerTools(name);

  // Disconnect
  await disconnectServer(name);
  server.connection = null;
  server.reconnectAttempts = 0;
}

/**
 * Reconnect a failed server.
 */
export async function reconnectServer(
  name: string
): Promise<MCPServerConnection | null> {
  const server = managedServers.get(name);
  if (!server) {
    return null;
  }

  // Reset reconnect attempts for manual reconnect
  server.reconnectAttempts = 0;

  return connectManagedServer(name);
}

// ============================================================================
// AUTO-RECONNECT
// ============================================================================

/**
 * Schedule a reconnect attempt with exponential backoff.
 */
function scheduleReconnect(name: string): void {
  const server = managedServers.get(name);
  if (!server || !server.enabled) {
    return;
  }

  if (server.reconnectAttempts >= managerOptions.maxReconnectAttempts) {
    MollyLogger.warn(
      `Server ${name} exceeded max reconnect attempts (${managerOptions.maxReconnectAttempts})`,
      'mcp-manager'
    );
    return;
  }

  // Calculate delay with exponential backoff
  const delay = Math.min(
    managerOptions.reconnectDelayMs * Math.pow(2, server.reconnectAttempts),
    managerOptions.maxReconnectDelayMs
  );

  server.reconnectAttempts++;

  MollyLogger.debug(
    `Scheduling reconnect for ${name} in ${delay}ms (attempt ${server.reconnectAttempts})`,
    'mcp-manager'
  );

  server.reconnectTimer = setTimeout(async () => {
    server.reconnectTimer = null;
    await connectManagedServer(name);
  }, delay);
}

// ============================================================================
// HEALTH CHECKS
// ============================================================================

/**
 * Start periodic health checks.
 */
function startHealthChecks(): void {
  if (healthCheckTimer) {
    return;
  }

  healthCheckTimer = setInterval(
    performHealthChecks,
    managerOptions.healthCheckIntervalMs
  );

  MollyLogger.debug(
    `Health checks started (interval: ${managerOptions.healthCheckIntervalMs}ms)`,
    'mcp-manager'
  );
}

/**
 * Stop periodic health checks.
 */
function stopHealthChecks(): void {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
}

/**
 * Perform health checks on all connected servers.
 */
async function performHealthChecks(): Promise<void> {
  const connectedServers = getConnectedServers();

  for (const name of connectedServers) {
    const healthy = await pingServer(name);

    if (!healthy) {
      MollyLogger.warn(`Health check failed for ${name}`, 'mcp-manager');

      const server = managedServers.get(name);
      if (server && managerOptions.autoReconnect) {
        // Mark as failed and schedule reconnect
        await disconnectManagedServer(name);
        scheduleReconnect(name);
      }
    }
  }
}

// ============================================================================
// SERVER MANAGEMENT
// ============================================================================

/**
 * Enable a server (allows connection).
 */
export function enableServer(name: string): void {
  const server = managedServers.get(name);
  if (server) {
    server.enabled = true;
    MollyLogger.debug(`Server ${name} enabled`, 'mcp-manager');
  }
}

/**
 * Disable a server (prevents connection, disconnects if connected).
 */
export async function disableServer(name: string): Promise<void> {
  const server = managedServers.get(name);
  if (server) {
    server.enabled = false;
    await disconnectManagedServer(name);
    MollyLogger.debug(`Server ${name} disabled`, 'mcp-manager');
  }
}

/**
 * Add a new server configuration at runtime.
 */
export function addServer(name: string, config: ScopedMcpServerConfig): void {
  if (managedServers.has(name)) {
    MollyLogger.warn(`Server ${name} already exists`, 'mcp-manager');
    return;
  }

  managedServers.set(name, {
    name,
    config,
    connection: null,
    reconnectAttempts: 0,
    reconnectTimer: null,
    enabled: true,
  });

  MollyLogger.debug(`Added server ${name}`, 'mcp-manager');
}

/**
 * Remove a server configuration.
 */
export async function removeServer(name: string): Promise<void> {
  await disconnectManagedServer(name);
  managedServers.delete(name);
  MollyLogger.debug(`Removed server ${name}`, 'mcp-manager');
}

// ============================================================================
// STATUS & DIAGNOSTICS
// ============================================================================

/**
 * Get manager status for diagnostics.
 */
export function getManagerStatus(): McpManagerStatus {
  const servers: McpManagerStatus['servers'] = [];
  let connectedCount = 0;
  let failedCount = 0;

  for (const server of managedServers.values()) {
    let status: 'connected' | 'failed' | 'pending' | 'disabled' | 'unknown';
    let error: string | undefined;

    if (!server.enabled) {
      status = 'disabled';
    } else if (!server.connection) {
      status = 'pending';
    } else if (isConnected(server.connection)) {
      status = 'connected';
      connectedCount++;
    } else if (isFailed(server.connection)) {
      status = 'failed';
      error = server.connection.error;
      failedCount++;
    } else {
      status = 'unknown';
    }

    servers.push({
      name: server.name,
      status,
      reconnectAttempts: server.reconnectAttempts,
      error,
    });
  }

  return {
    initialized,
    serverCount: managedServers.size,
    connectedCount,
    failedCount,
    servers,
  };
}

/**
 * Check if manager is initialized.
 */
export function isManagerInitialized(): boolean {
  return initialized;
}

/**
 * Get list of managed server names.
 */
export function getManagedServerNames(): string[] {
  return Array.from(managedServers.keys());
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Register cleanup handler for process exit.
 */
function registerCleanupHandler(): void {
  const cleanup = async () => {
    await shutdownMcpManager();
  };

  // Handle various exit signals
  process.on('beforeExit', cleanup);
  process.on('SIGINT', async () => {
    await cleanup();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await cleanup();
    process.exit(0);
  });
}
