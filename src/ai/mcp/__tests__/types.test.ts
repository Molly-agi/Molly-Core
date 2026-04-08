/**
 * MCP Types Tests
 *
 * Tests for MCP type validation, schemas, and type guards.
 */

import {
  // Schemas
  McpServerConfigSchema,
  McpJsonConfigSchema,
  McpStdioServerConfigSchema,
  McpSSEServerConfigSchema,
  McpHTTPServerConfigSchema,
  McpWebSocketServerConfigSchema,
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
  // Constants
  DEFAULT_MCP_CONNECT_OPTIONS,
  // Types
  type MCPServerConnection,
  type McpServerConfig,
  type ScopedMcpServerConfig,
} from '../types';

describe('MCP Types', () => {
  describe('McpStdioServerConfigSchema', () => {
    it('should validate a valid stdio config', () => {
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

    it('should validate stdio config with explicit type', () => {
      const config = {
        type: 'stdio' as const,
        command: 'node',
        args: ['server.js'],
        env: { NODE_ENV: 'production' },
      };

      const result = McpStdioServerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject empty command', () => {
      const config = {
        command: '',
        args: [],
      };

      const result = McpStdioServerConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should default args to empty array', () => {
      const config = {
        command: 'my-server',
      };

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
        url: 'https://example.com/sse',
      };

      const result = McpSSEServerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should validate SSE config with headers', () => {
      const config = {
        type: 'sse' as const,
        url: 'https://example.com/sse',
        headers: {
          Authorization: 'Bearer token123',
        },
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
  });

  describe('McpWebSocketServerConfigSchema', () => {
    it('should validate a valid WebSocket config', () => {
      const config = {
        type: 'ws' as const,
        url: 'wss://example.com/ws',
      };

      const result = McpWebSocketServerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe('McpServerConfigSchema (union)', () => {
    it('should accept stdio config without type', () => {
      const config = {
        command: 'python',
        args: ['-m', 'mcp_server'],
      };

      const result = McpServerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should accept SSE config', () => {
      const config = {
        type: 'sse' as const,
        url: 'https://example.com/sse',
      };

      const result = McpServerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should accept HTTP config', () => {
      const config = {
        type: 'http' as const,
        url: 'https://example.com/http',
      };

      const result = McpServerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should accept WebSocket config', () => {
      const config = {
        type: 'ws' as const,
        url: 'wss://example.com/ws',
      };

      const result = McpServerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe('McpJsonConfigSchema', () => {
    it('should validate a valid .mcp.json config', () => {
      const config = {
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem'],
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
      const config = {
        mcpServers: {},
      };

      const result = McpJsonConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject missing mcpServers', () => {
      const config = {};

      const result = McpJsonConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe('Type Guards - Connection States', () => {
    const createConnection = (
      type: MCPServerConnection['type']
    ): MCPServerConnection => {
      const baseConfig: ScopedMcpServerConfig = {
        command: 'test',
        args: [],
        scope: 'project',
      };

      switch (type) {
        case 'connected':
          return {
            name: 'test',
            type: 'connected',
            capabilities: {},
            config: baseConfig,
            cleanup: async () => {},
          };
        case 'failed':
          return {
            name: 'test',
            type: 'failed',
            config: baseConfig,
            error: 'Connection failed',
          };
        case 'needs-auth':
          return {
            name: 'test',
            type: 'needs-auth',
            config: baseConfig,
          };
        case 'pending':
          return {
            name: 'test',
            type: 'pending',
            config: baseConfig,
          };
        case 'disabled':
          return {
            name: 'test',
            type: 'disabled',
            config: baseConfig,
          };
      }
    };

    it('isConnected should identify connected servers', () => {
      expect(isConnected(createConnection('connected'))).toBe(true);
      expect(isConnected(createConnection('failed'))).toBe(false);
      expect(isConnected(createConnection('pending'))).toBe(false);
    });

    it('isFailed should identify failed servers', () => {
      expect(isFailed(createConnection('failed'))).toBe(true);
      expect(isFailed(createConnection('connected'))).toBe(false);
    });

    it('needsAuth should identify servers needing auth', () => {
      expect(needsAuth(createConnection('needs-auth'))).toBe(true);
      expect(needsAuth(createConnection('connected'))).toBe(false);
    });

    it('isPending should identify pending servers', () => {
      expect(isPending(createConnection('pending'))).toBe(true);
      expect(isPending(createConnection('connected'))).toBe(false);
    });

    it('isDisabled should identify disabled servers', () => {
      expect(isDisabled(createConnection('disabled'))).toBe(true);
      expect(isDisabled(createConnection('connected'))).toBe(false);
    });
  });

  describe('Type Guards - Config Types', () => {
    it('isStdioConfig should identify stdio configs', () => {
      const stdioNoType: McpServerConfig = { command: 'node', args: [] };
      const stdioWithType: McpServerConfig = {
        type: 'stdio',
        command: 'node',
        args: [],
      };
      const sseConfig: McpServerConfig = {
        type: 'sse',
        url: 'https://example.com',
      };

      expect(isStdioConfig(stdioNoType)).toBe(true);
      expect(isStdioConfig(stdioWithType)).toBe(true);
      expect(isStdioConfig(sseConfig)).toBe(false);
    });

    it('isSSEConfig should identify SSE configs', () => {
      const sseConfig: McpServerConfig = {
        type: 'sse',
        url: 'https://example.com',
      };
      const stdioConfig: McpServerConfig = { command: 'node', args: [] };

      expect(isSSEConfig(sseConfig)).toBe(true);
      expect(isSSEConfig(stdioConfig)).toBe(false);
    });

    it('isHTTPConfig should identify HTTP configs', () => {
      const httpConfig: McpServerConfig = {
        type: 'http',
        url: 'https://example.com',
      };
      const sseConfig: McpServerConfig = {
        type: 'sse',
        url: 'https://example.com',
      };

      expect(isHTTPConfig(httpConfig)).toBe(true);
      expect(isHTTPConfig(sseConfig)).toBe(false);
    });

    it('isWebSocketConfig should identify WebSocket configs', () => {
      const wsConfig: McpServerConfig = {
        type: 'ws',
        url: 'wss://example.com',
      };
      const httpConfig: McpServerConfig = {
        type: 'http',
        url: 'https://example.com',
      };

      expect(isWebSocketConfig(wsConfig)).toBe(true);
      expect(isWebSocketConfig(httpConfig)).toBe(false);
    });
  });

  describe('getTransportType', () => {
    it('should return correct transport type for each config', () => {
      expect(getTransportType({ command: 'node', args: [] })).toBe('stdio');
      expect(
        getTransportType({ type: 'stdio', command: 'node', args: [] })
      ).toBe('stdio');
      expect(
        getTransportType({ type: 'sse', url: 'https://example.com' })
      ).toBe('sse');
      expect(
        getTransportType({ type: 'http', url: 'https://example.com' })
      ).toBe('http');
      expect(getTransportType({ type: 'ws', url: 'wss://example.com' })).toBe(
        'ws'
      );
    });
  });

  describe('DEFAULT_MCP_CONNECT_OPTIONS', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_MCP_CONNECT_OPTIONS.timeoutMs).toBe(30000);
      expect(DEFAULT_MCP_CONNECT_OPTIONS.maxReconnectAttempts).toBe(3);
      expect(DEFAULT_MCP_CONNECT_OPTIONS.reconnectDelayMs).toBe(1000);
    });
  });
});
