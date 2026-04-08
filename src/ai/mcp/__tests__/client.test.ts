/**
 * MCP Client Tests
 *
 * Tests for MCP client functionality.
 */

import {
  connectToServer,
  disconnectServer,
  disconnectAll,
  isServerConnected,
  getConnectedServers,
  listServerTools,
  listAllTools,
  callTool,
  pingServer,
} from '../client';
import type { ScopedMcpServerConfig } from '../types';
import { Client } from '@modelcontextprotocol/sdk/client';

// Mock the MCP SDK
jest.mock('@modelcontextprotocol/sdk/client', () => ({
  Client: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    getServerCapabilities: jest.fn().mockReturnValue({
      tools: { listChanged: true },
    }),
    getServerVersion: jest.fn().mockReturnValue({
      name: 'test-server',
      version: '1.0.0',
    }),
    getInstructions: jest.fn().mockReturnValue('Test instructions'),
    listTools: jest.fn().mockResolvedValue({
      tools: [
        {
          name: 'test-tool',
          description: 'A test tool',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    }),
    callTool: jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Tool result' }],
      isError: false,
    }),
    ping: jest.fn().mockResolvedValue({}),
  })),
}));

jest.mock('@modelcontextprotocol/sdk/client/stdio', () => ({
  StdioClientTransport: jest.fn().mockImplementation(() => ({
    start: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    onclose: null,
    onerror: null,
  })),
}));

jest.mock('@modelcontextprotocol/sdk/client/sse', () => ({
  SSEClientTransport: jest.fn().mockImplementation(() => ({
    start: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    onclose: null,
    onerror: null,
  })),
}));

jest.mock('@modelcontextprotocol/sdk/client/websocket', () => ({
  WebSocketClientTransport: jest.fn().mockImplementation(() => ({
    start: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    onclose: null,
    onerror: null,
  })),
}));

// Get mocked Client for manipulation
const MockedClient = jest.mocked(Client);

describe('MCP Client', () => {
  const stdioConfig: ScopedMcpServerConfig = {
    type: 'stdio',
    command: 'node',
    args: ['test-server.js'],
    scope: 'project',
  };

  const sseConfig: ScopedMcpServerConfig = {
    type: 'sse',
    url: 'http://localhost:3000/mcp',
    scope: 'project',
  };

  const wsConfig: ScopedMcpServerConfig = {
    type: 'ws',
    url: 'ws://localhost:3000/mcp',
    scope: 'project',
  };

  beforeEach(async () => {
    // Clean up between tests
    await disconnectAll();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await disconnectAll();
  });

  describe('connectToServer', () => {
    it('should connect to a stdio server successfully', async () => {
      const result = await connectToServer('test-stdio', stdioConfig);

      expect(result.type).toBe('connected');
      expect(result.name).toBe('test-stdio');
      if (result.type === 'connected') {
        expect(result.capabilities.tools).toEqual({ listChanged: true });
        expect(result.serverInfo).toEqual({
          name: 'test-server',
          version: '1.0.0',
        });
        expect(result.instructions).toBe('Test instructions');
      }
    });

    it('should connect to an SSE server successfully', async () => {
      const result = await connectToServer('test-sse', sseConfig);

      expect(result.type).toBe('connected');
      expect(result.name).toBe('test-sse');
    });

    it('should connect to a WebSocket server successfully', async () => {
      const result = await connectToServer('test-ws', wsConfig);

      expect(result.type).toBe('connected');
      expect(result.name).toBe('test-ws');
    });

    it('should return failed connection on error', async () => {
      MockedClient.mockImplementationOnce(
        () =>
          ({
            connect: jest
              .fn()
              .mockRejectedValue(new Error('Connection refused')),
          }) as unknown as Client
      );

      const result = await connectToServer('test-fail', stdioConfig);

      expect(result.type).toBe('failed');
      if (result.type === 'failed') {
        expect(result.error).toContain('Connection refused');
      }
    });

    it('should handle connection timeout', async () => {
      MockedClient.mockImplementationOnce(
        () =>
          ({
            connect: jest.fn().mockImplementation(() => new Promise(() => {})), // Never resolves
          }) as unknown as Client
      );

      const result = await connectToServer('test-timeout', stdioConfig, {
        timeoutMs: 100,
      });

      expect(result.type).toBe('failed');
      if (result.type === 'failed') {
        expect(result.error).toContain('timeout');
      }
    });
  });

  describe('disconnectServer', () => {
    it('should disconnect a connected server', async () => {
      await connectToServer('test', stdioConfig);
      expect(isServerConnected('test')).toBe(true);

      await disconnectServer('test');
      expect(isServerConnected('test')).toBe(false);
    });

    it('should handle disconnecting non-existent server gracefully', async () => {
      await expect(disconnectServer('non-existent')).resolves.not.toThrow();
    });
  });

  describe('disconnectAll', () => {
    it('should disconnect all connected servers', async () => {
      await connectToServer('server1', stdioConfig);
      await connectToServer('server2', sseConfig);

      expect(getConnectedServers()).toHaveLength(2);

      await disconnectAll();

      expect(getConnectedServers()).toHaveLength(0);
    });
  });

  describe('isServerConnected', () => {
    it('should return true for connected server', async () => {
      await connectToServer('test', stdioConfig);
      expect(isServerConnected('test')).toBe(true);
    });

    it('should return false for disconnected server', () => {
      expect(isServerConnected('non-existent')).toBe(false);
    });
  });

  describe('getConnectedServers', () => {
    it('should return list of connected server names', async () => {
      await connectToServer('server1', stdioConfig);
      await connectToServer('server2', sseConfig);

      const servers = getConnectedServers();
      expect(servers).toContain('server1');
      expect(servers).toContain('server2');
      expect(servers).toHaveLength(2);
    });

    it('should return empty array when no servers connected', () => {
      expect(getConnectedServers()).toEqual([]);
    });
  });

  describe('listServerTools', () => {
    it('should list tools from a connected server', async () => {
      await connectToServer('test', stdioConfig);

      const tools = await listServerTools('test');

      expect(tools).toHaveLength(1);
      expect(tools[0]).toEqual({
        name: 'test-tool',
        description: 'A test tool',
        inputSchema: { type: 'object', properties: {} },
        server: 'test',
      });
    });

    it('should return empty array for non-connected server', async () => {
      const tools = await listServerTools('non-existent');
      expect(tools).toEqual([]);
    });
  });

  describe('listAllTools', () => {
    it('should list tools from all connected servers', async () => {
      await connectToServer('server1', stdioConfig);
      await connectToServer('server2', sseConfig);

      const tools = await listAllTools();

      expect(tools.length).toBeGreaterThanOrEqual(2);
      expect(tools.some((t) => t.server === 'server1')).toBe(true);
      expect(tools.some((t) => t.server === 'server2')).toBe(true);
    });
  });

  describe('callTool', () => {
    it('should call a tool successfully', async () => {
      await connectToServer('test', stdioConfig);

      const result = await callTool('test', 'test-tool', { input: 'value' });

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({ type: 'text', text: 'Tool result' });
    });

    it('should return error for non-connected server', async () => {
      const result = await callTool('non-existent', 'test-tool', {});

      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe('text');
      if (result.content[0].type === 'text') {
        expect(result.content[0].text).toContain('not connected');
      }
    });

    it('should handle tool call errors', async () => {
      await connectToServer('test', stdioConfig);

      // Get the mock instance from the last call
      const mockClientInstance = MockedClient.mock.results[
        MockedClient.mock.results.length - 1
      ].value as { callTool: jest.Mock };
      mockClientInstance.callTool.mockRejectedValueOnce(
        new Error('Tool error')
      );

      const result = await callTool('test', 'test-tool', {});

      expect(result.isError).toBe(true);
      if (result.content[0].type === 'text') {
        expect(result.content[0].text).toContain('Tool error');
      }
    });
  });

  describe('pingServer', () => {
    it('should return true for responsive server', async () => {
      await connectToServer('test', stdioConfig);

      const result = await pingServer('test');

      expect(result).toBe(true);
    });

    it('should return false for non-connected server', async () => {
      const result = await pingServer('non-existent');
      expect(result).toBe(false);
    });

    it('should return false if ping fails', async () => {
      await connectToServer('test', stdioConfig);

      // Get the mock instance from the last call
      const mockClientInstance = MockedClient.mock.results[
        MockedClient.mock.results.length - 1
      ].value as { ping: jest.Mock };
      mockClientInstance.ping.mockRejectedValueOnce(new Error('Ping failed'));

      const result = await pingServer('test');

      expect(result).toBe(false);
    });
  });
});
