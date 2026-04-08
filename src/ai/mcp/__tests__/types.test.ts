/**
 * MCP Types Test Suite
 *
 * Tests for MCP server configuration validation and type guards.
 */

import {
  McpStdioServerConfigSchema,
  McpSSEServerConfigSchema,
  McpHTTPServerConfigSchema,
  McpWebSocketServerConfigSchema,
  McpServerConfigSchema,
  McpJsonConfigSchema,
  isConnected,
  isFailed,
  isPending,
  isDisabled,
  isStdioConfig,
  isRemoteConfig,
  DEFAULT_MCP_CONNECT_OPTIONS,
  type MCPServerConnection,
  type McpServerConfig,
} from '../types';

describe('MCP Server Config Schemas', () => {
  describe('McpStdioServerConfigSchema', () => {
    it('should validate a minimal stdio config', () => {
      const config = {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
      };
      const result = McpStdioServerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.command).toBe('npx');
        expect(result.data.args).toEqual([
          '-y',
          '@modelcontextprotocol/server-filesystem',
        ]);
      }
    });

    it('should validate a stdio config with explicit type', () => {
      const config = {
        type: 'stdio' as const,
        command: 'node',
        args: ['server.js'],
        env: { DEBUG: 'true' },
      };
      const result = McpStdioServerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject empty command', () => {
      const config = { command: '', args: [] };
      const result = McpStdioServerConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should default args to empty array', () => {
      const config = { command: 'node' };
      const result = McpStdioServerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.args).toEqual([]);
      }
    });
  });

  describe('McpSSEServerConfigSchema', () => {
    it('should validate a valid SSE config', () => {
      const config = {
        type: 'sse' as const,
        url: 'https://example.com/mcp',
      };
      const result = McpSSEServerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should validate SSE config with headers', () => {
      const config = {
        type: 'sse' as const,
        url: 'https://example.com/mcp',
        headers: { Authorization: 'Bearer token123' },
      };
      const result = McpSSEServerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject invalid URL', () => {
      const config = {
        type: 'sse' as const,
        url: 'not-a-valid-url',
      };
      const result = McpSSEServerConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe('McpHTTPServerConfigSchema', () => {
    it('should validate a valid HTTP config', () => {
      const config = {
        type: 'http' as const,
        url: 'https://api.example.com/mcp',
      };
      const result = McpHTTPServerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should validate HTTP config with headers', () => {
      const config = {
        type: 'http' as const,
        url: 'https://api.example.com/mcp',
        headers: { 'X-API-Key': 'secret' },
      };
      const result = McpHTTPServerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe('McpWebSocketServerConfigSchema', () => {
    it('should validate a valid WebSocket config', () => {
      const config = {
        type: 'ws' as const,
        url: 'wss://example.com/mcp',
      };
      const result = McpWebSocketServerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should allow non-URL strings for ws (flexibility)', () => {
      // WebSocket URLs can have various formats
      const config = {
        type: 'ws' as const,
        url: 'ws://localhost:8080',
      };
      const result = McpWebSocketServerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe('McpServerConfigSchema (union)', () => {
    it('should validate stdio config without type field', () => {
      const config = { command: 'node', args: ['server.js'] };
      const result = McpServerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should validate explicit stdio config', () => {
      const config = { type: 'stdio' as const, command: 'npx', args: [] };
      const result = McpServerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should validate SSE config', () => {
      const config = { type: 'sse' as const, url: 'https://example.com/mcp' };
      const result = McpServerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should validate HTTP config', () => {
      const config = { type: 'http' as const, url: 'https://example.com/mcp' };
      const result = McpServerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should validate WebSocket config', () => {
      const config = { type: 'ws' as const, url: 'wss://example.com/mcp' };
      const result = McpServerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject invalid type', () => {
      const config = { type: 'invalid', url: 'https://example.com' };
      const result = McpServerConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe('McpJsonConfigSchema', () => {
    it('should validate a complete .mcp.json config', () => {
      const config = {
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
          },
          'remote-api': {
            type: 'sse' as const,
            url: 'https://api.example.com/mcp',
          },
        },
      };
      const result = McpJsonConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(Object.keys(result.data.mcpServers)).toHaveLength(2);
      }
    });

    it('should validate empty mcpServers', () => {
      const config = { mcpServers: {} };
      const result = McpJsonConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject missing mcpServers', () => {
      const config = {};
      const result = McpJsonConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });
});

describe('MCP Type Guards', () => {
  const mockClient = {} as never; // Minimal mock for connected server
  const mockConfig: McpServerConfig = { command: 'node', args: [] };

  const connectedServer: MCPServerConnection = {
    name: 'test',
    type: 'connected',
    client: mockClient,
    capabilities: {},
    config: mockConfig,
    cleanup: async () => {},
  };

  const failedServer: MCPServerConnection = {
    name: 'test',
    type: 'failed',
    config: mockConfig,
    error: 'Connection refused',
  };

  const pendingServer: MCPServerConnection = {
    name: 'test',
    type: 'pending',
    config: mockConfig,
  };

  const disabledServer: MCPServerConnection = {
    name: 'test',
    type: 'disabled',
    config: mockConfig,
  };

  describe('isConnected', () => {
    it('should return true for connected server', () => {
      expect(isConnected(connectedServer)).toBe(true);
    });

    it('should return false for failed server', () => {
      expect(isConnected(failedServer)).toBe(false);
    });

    it('should return false for pending server', () => {
      expect(isConnected(pendingServer)).toBe(false);
    });

    it('should return false for disabled server', () => {
      expect(isConnected(disabledServer)).toBe(false);
    });
  });

  describe('isFailed', () => {
    it('should return true for failed server', () => {
      expect(isFailed(failedServer)).toBe(true);
    });

    it('should return false for connected server', () => {
      expect(isFailed(connectedServer)).toBe(false);
    });
  });

  describe('isPending', () => {
    it('should return true for pending server', () => {
      expect(isPending(pendingServer)).toBe(true);
    });

    it('should return false for connected server', () => {
      expect(isPending(connectedServer)).toBe(false);
    });
  });

  describe('isDisabled', () => {
    it('should return true for disabled server', () => {
      expect(isDisabled(disabledServer)).toBe(true);
    });

    it('should return false for connected server', () => {
      expect(isDisabled(connectedServer)).toBe(false);
    });
  });

  describe('isStdioConfig', () => {
    it('should return true for config without type', () => {
      const config: McpServerConfig = { command: 'node', args: [] };
      expect(isStdioConfig(config)).toBe(true);
    });

    it('should return true for explicit stdio config', () => {
      const config: McpServerConfig = {
        type: 'stdio',
        command: 'node',
        args: [],
      };
      expect(isStdioConfig(config)).toBe(true);
    });

    it('should return false for SSE config', () => {
      const config: McpServerConfig = {
        type: 'sse',
        url: 'https://example.com',
      };
      expect(isStdioConfig(config)).toBe(false);
    });
  });

  describe('isRemoteConfig', () => {
    it('should return true for SSE config', () => {
      const config: McpServerConfig = {
        type: 'sse',
        url: 'https://example.com',
      };
      expect(isRemoteConfig(config)).toBe(true);
    });

    it('should return true for HTTP config', () => {
      const config: McpServerConfig = {
        type: 'http',
        url: 'https://example.com',
      };
      expect(isRemoteConfig(config)).toBe(true);
    });

    it('should return true for WebSocket config', () => {
      const config: McpServerConfig = { type: 'ws', url: 'wss://example.com' };
      expect(isRemoteConfig(config)).toBe(true);
    });

    it('should return false for stdio config', () => {
      const config: McpServerConfig = { command: 'node', args: [] };
      expect(isRemoteConfig(config)).toBe(false);
    });
  });
});

describe('MCP Constants', () => {
  describe('DEFAULT_MCP_CONNECT_OPTIONS', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_MCP_CONNECT_OPTIONS.timeoutMs).toBe(30000);
      expect(DEFAULT_MCP_CONNECT_OPTIONS.autoReconnect).toBe(true);
      expect(DEFAULT_MCP_CONNECT_OPTIONS.maxReconnectAttempts).toBe(3);
      expect(DEFAULT_MCP_CONNECT_OPTIONS.reconnectDelayMs).toBe(5000);
    });
  });
});
