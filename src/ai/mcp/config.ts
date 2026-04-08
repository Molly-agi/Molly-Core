/**
 * MCP Configuration Loader
 *
 * Loads MCP server configurations from .mcp.json files.
 * Simplified from Lazarus architecture for Molly-Core.
 *
 * Configuration sources (in order of precedence):
 * 1. Dynamic configs (passed at runtime)
 * 2. Project config (.mcp.json in current directory)
 * 3. Parent directory configs (walking up to root)
 */

import { promises as fs } from 'fs';
import path from 'path';
import { MollyLogger } from '@/ai/logger';
import {
  McpJsonConfigSchema,
  type ConfigScope,
  type McpJsonConfig,
  type McpServerConfig,
  type ScopedMcpServerConfig,
} from './types';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default config file name */
export const MCP_CONFIG_FILENAME = '.mcp.json';

/** Maximum directory depth to search for configs */
const MAX_PARENT_DEPTH = 10;

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of loading MCP configuration
 */
export interface McpConfigResult {
  /** Loaded server configurations with scope info */
  servers: Record<string, ScopedMcpServerConfig>;
  /** Any errors encountered during loading */
  errors: McpConfigError[];
  /** Source files that were loaded */
  sources: string[];
}

/**
 * Configuration loading error
 */
export interface McpConfigError {
  /** File path where error occurred */
  file?: string;
  /** JSON path within the file */
  path?: string;
  /** Error message */
  message: string;
  /** Severity level */
  severity: 'warning' | 'error';
}

// ============================================================================
// ENVIRONMENT VARIABLE EXPANSION
// ============================================================================

/**
 * Expand environment variables in a string.
 * Supports ${VAR} and $VAR syntax.
 *
 * @param str - String potentially containing env vars
 * @returns Expanded string and list of missing variables
 */
export function expandEnvVars(str: string): {
  expanded: string;
  missingVars: string[];
} {
  const missingVars: string[] = [];

  // Match ${VAR} or $VAR patterns
  const expanded = str.replace(
    /\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/gi,
    (match, bracedVar, plainVar) => {
      const varName = bracedVar || plainVar;
      const value = process.env[varName];

      if (value === undefined) {
        missingVars.push(varName);
        return match; // Keep original if not found
      }

      return value;
    }
  );

  return { expanded, missingVars: [...new Set(missingVars)] };
}

/**
 * Expand environment variables in a server config.
 *
 * @param config - Server configuration
 * @returns Expanded config and any missing variables
 */
export function expandConfigEnvVars(config: McpServerConfig): {
  expanded: McpServerConfig;
  missingVars: string[];
} {
  const allMissingVars: string[] = [];

  const expandString = (s: string): string => {
    const { expanded, missingVars } = expandEnvVars(s);
    allMissingVars.push(...missingVars);
    return expanded;
  };

  const expandRecord = (
    record: Record<string, string> | undefined
  ): Record<string, string> | undefined => {
    if (!record) return undefined;
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(record)) {
      result[key] = expandString(value);
    }
    return result;
  };

  let expanded: McpServerConfig;

  if (config.type === 'sse' || config.type === 'http' || config.type === 'ws') {
    expanded = {
      ...config,
      url: expandString(config.url),
      headers: expandRecord(config.headers),
    };
  } else {
    // stdio config
    expanded = {
      ...config,
      command: expandString(config.command),
      args: config.args?.map(expandString) ?? [],
      env: expandRecord(config.env),
    };
  }

  return {
    expanded,
    missingVars: [...new Set(allMissingVars)],
  };
}

// ============================================================================
// CONFIG FILE LOADING
// ============================================================================

/**
 * Check if a file exists.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read and parse a JSON file.
 */
async function readJsonFile(filePath: string): Promise<unknown> {
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Load MCP config from a single file.
 *
 * @param filePath - Path to .mcp.json file
 * @param scope - Configuration scope
 * @returns Parsed config or null if file doesn't exist/is invalid
 */
export async function loadConfigFile(
  filePath: string,
  _scope: 'local' | 'project' | 'dynamic'
): Promise<{
  config: McpJsonConfig | null;
  errors: McpConfigError[];
}> {
  const errors: McpConfigError[] = [];

  // Check if file exists
  if (!(await fileExists(filePath))) {
    return { config: null, errors: [] };
  }

  // Read and parse JSON
  let rawConfig: unknown;
  try {
    rawConfig = await readJsonFile(filePath);
  } catch (err) {
    errors.push({
      file: filePath,
      message: `Failed to parse JSON: ${err instanceof Error ? err.message : 'unknown error'}`,
      severity: 'error',
    });
    return { config: null, errors };
  }

  // Validate against schema
  const result = McpJsonConfigSchema.safeParse(rawConfig);
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push({
        file: filePath,
        path: issue.path.join('.'),
        message: issue.message,
        severity: 'error',
      });
    }
    return { config: null, errors };
  }

  // Expand environment variables in each server config
  const expandedServers: Record<string, McpServerConfig> = {};
  for (const [name, serverConfig] of Object.entries(result.data.mcpServers)) {
    const { expanded, missingVars } = expandConfigEnvVars(serverConfig);

    if (missingVars.length > 0) {
      errors.push({
        file: filePath,
        path: `mcpServers.${name}`,
        message: `Missing environment variables: ${missingVars.join(', ')}`,
        severity: 'warning',
      });
    }

    expandedServers[name] = expanded;
  }

  return {
    config: { mcpServers: expandedServers },
    errors,
  };
}

/**
 * Add scope to server configs.
 */
export function addScopeToServers(
  servers: Record<string, McpServerConfig>,
  scope: ConfigScope
): Record<string, ScopedMcpServerConfig> {
  const result: Record<string, ScopedMcpServerConfig> = {};
  for (const [name, config] of Object.entries(servers)) {
    result[name] = { ...config, scope };
  }
  return result;
}

// ============================================================================
// MAIN CONFIG LOADING
// ============================================================================

/**
 * Load MCP configurations from the project directory and parent directories.
 *
 * Walks up the directory tree from `startDir` looking for .mcp.json files.
 * Configs closer to `startDir` take precedence over parent configs.
 *
 * @param startDir - Directory to start searching from (defaults to cwd)
 * @returns Combined configuration from all found files
 */
export async function loadProjectConfig(
  startDir: string = process.cwd()
): Promise<McpConfigResult> {
  const allServers: Record<string, ScopedMcpServerConfig> = {};
  const allErrors: McpConfigError[] = [];
  const sources: string[] = [];

  // Build list of directories to check (from root toward startDir)
  const dirsToCheck: string[] = [];
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  for (
    let depth = 0;
    depth < MAX_PARENT_DEPTH && currentDir !== root;
    depth++
  ) {
    dirsToCheck.unshift(currentDir); // Add to front (root first)
    currentDir = path.dirname(currentDir);
  }

  // Load configs from root toward startDir (later configs override)
  for (const dir of dirsToCheck) {
    const configPath = path.join(dir, MCP_CONFIG_FILENAME);
    const { config, errors } = await loadConfigFile(configPath, 'project');

    if (errors.length > 0) {
      allErrors.push(...errors);
    }

    if (config) {
      sources.push(configPath);
      const scopedServers = addScopeToServers(config.mcpServers, 'project');
      Object.assign(allServers, scopedServers);
    }
  }

  return {
    servers: allServers,
    errors: allErrors,
    sources,
  };
}

/**
 * Load all MCP configurations including dynamic configs.
 *
 * @param dynamicServers - Runtime-provided server configs
 * @param projectDir - Project directory (defaults to cwd)
 * @returns Combined configuration
 */
export async function loadAllConfigs(
  dynamicServers: Record<string, McpServerConfig> = {},
  projectDir: string = process.cwd()
): Promise<McpConfigResult> {
  // Load project configs
  const projectResult = await loadProjectConfig(projectDir);

  // Add dynamic servers with highest precedence
  const dynamicScoped = addScopeToServers(dynamicServers, 'dynamic');

  // Merge: project servers, then dynamic (dynamic wins)
  const allServers = {
    ...projectResult.servers,
    ...dynamicScoped,
  };

  // Log loaded servers
  const serverNames = Object.keys(allServers);
  if (serverNames.length > 0) {
    MollyLogger.debug(
      `Loaded ${serverNames.length} MCP server(s): ${serverNames.join(', ')}`,
      'mcp-config'
    );
  }

  // Log any errors
  for (const error of projectResult.errors) {
    if (error.severity === 'error') {
      MollyLogger.error(
        `MCP config error in ${error.file}: ${error.message}`,
        'mcp-config'
      );
    } else {
      MollyLogger.warn(
        `MCP config warning in ${error.file}: ${error.message}`,
        'mcp-config'
      );
    }
  }

  return {
    servers: allServers,
    errors: projectResult.errors,
    sources: projectResult.sources,
  };
}

/**
 * Get a specific server config by name.
 *
 * @param name - Server name
 * @param configs - Loaded config result
 * @returns Server config or undefined
 */
export function getServerConfig(
  name: string,
  configs: McpConfigResult
): ScopedMcpServerConfig | undefined {
  return configs.servers[name];
}

/**
 * Validate a server name.
 * Names can only contain letters, numbers, hyphens, and underscores.
 */
export function isValidServerName(name: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(name);
}

/**
 * Create a minimal valid .mcp.json config.
 */
export function createEmptyConfig(): McpJsonConfig {
  return { mcpServers: {} };
}

/**
 * Serialize a config to JSON string.
 */
export function serializeConfig(config: McpJsonConfig): string {
  return JSON.stringify(config, null, 2);
}
