/**
 * MCP Tool Adapter Tests
 *
 * Tests for bridging MCP tools to Molly's handler system.
 */

import {
  normalizeMcpToolName,
  parseMcpToolName,
  isMcpToolName,
  mcpResultToToolResult,
  createMcpToolHandler,
  mcpToolToHandlerEntry,
  registerServerTools,
  unregisterServerTools,
  clearMcpToolRegistry,
  getMcpToolHandler,
  hasMcpToolHandler,
  getMcpToolHandlers,
  listMcpTools,
  getMcpToolCount,
} from '../tool-adapter';
import type { McpToolResult } from '../types';
import * as client from '../client';

// Mock the client module
jest.mock('../client', () => ({
  isServerConnected: jest.fn(),
  getConnectedServers: jest.fn(),
  listServerTools: jest.fn(),
  callTool: jest.fn(),
}));

const mockedClient = jest.mocked(client);

describe('MCP Tool Adapter', () => {
  beforeEach(() => {
    clearMcpToolRegistry();
    jest.clearAllMocks();
  });

  describe('normalizeMcpToolName', () => {
    it('should create normalized name from server and tool', () => {
      const result = normalizeMcpToolName('my-server', 'my-tool');
      expect(result).toBe('mcp_my_server_my_tool');
    });

    it('should replace special characters with underscores', () => {
      const result = normalizeMcpToolName('server.name', 'tool/name');
      expect(result).toBe('mcp_server_name_tool_name');
    });

    it('should handle simple names', () => {
      const result = normalizeMcpToolName('slack', 'sendMessage');
      expect(result).toBe('mcp_slack_sendMessage');
    });
  });

  describe('parseMcpToolName', () => {
    it('should parse valid MCP tool name', () => {
      const result = parseMcpToolName('mcp_slack_sendMessage');
      expect(result).toEqual({ server: 'slack', tool: 'sendMessage' });
    });

    it('should return null for non-MCP tool names', () => {
      expect(parseMcpToolName('send_message')).toBeNull();
      expect(parseMcpToolName('slack_sendMessage')).toBeNull();
    });

    it('should return null for malformed MCP names', () => {
      expect(parseMcpToolName('mcp_')).toBeNull();
      expect(parseMcpToolName('mcp_server')).toBeNull();
    });

    it('should handle underscores in tool name', () => {
      const result = parseMcpToolName('mcp_server_tool_with_underscores');
      expect(result).toEqual({
        server: 'server',
        tool: 'tool_with_underscores',
      });
    });
  });

  describe('isMcpToolName', () => {
    it('should return true for MCP tool names', () => {
      expect(isMcpToolName('mcp_slack_send')).toBe(true);
      expect(isMcpToolName('mcp_a_b')).toBe(true);
    });

    it('should return false for non-MCP tool names', () => {
      expect(isMcpToolName('send_message')).toBe(false);
      expect(isMcpToolName('slack_send')).toBe(false);
      expect(isMcpToolName('')).toBe(false);
    });
  });

  describe('mcpResultToToolResult', () => {
    it('should convert text content', () => {
      const mcpResult: McpToolResult = {
        content: [{ type: 'text', text: 'Hello world' }],
        isError: false,
      };

      const result = mcpResultToToolResult(mcpResult);

      expect(result.success).toBe(true);
      expect(result.output).toBe('Hello world');
      expect(result.data?.mcpContent).toEqual(mcpResult.content);
    });

    it('should convert error result', () => {
      const mcpResult: McpToolResult = {
        content: [{ type: 'text', text: 'Something went wrong' }],
        isError: true,
      };

      const result = mcpResultToToolResult(mcpResult);

      expect(result.success).toBe(false);
      expect(result.output).toBe('Something went wrong');
    });

    it('should join multiple content items', () => {
      const mcpResult: McpToolResult = {
        content: [
          { type: 'text', text: 'Line 1' },
          { type: 'text', text: 'Line 2' },
        ],
        isError: false,
      };

      const result = mcpResultToToolResult(mcpResult);

      expect(result.output).toBe('Line 1\nLine 2');
    });

    it('should format image content', () => {
      const mcpResult: McpToolResult = {
        content: [{ type: 'image', data: 'base64data', mimeType: 'image/png' }],
        isError: false,
      };

      const result = mcpResultToToolResult(mcpResult);

      expect(result.output).toContain('Image');
      expect(result.output).toContain('image/png');
    });

    it('should format resource content', () => {
      const mcpResult: McpToolResult = {
        content: [
          {
            type: 'resource',
            resource: { uri: 'file:///test.txt', text: 'File content' },
          },
        ],
        isError: false,
      };

      const result = mcpResultToToolResult(mcpResult);

      expect(result.output).toBe('File content');
    });
  });

  describe('createMcpToolHandler', () => {
    it('should create a handler that calls MCP tool', async () => {
      mockedClient.isServerConnected.mockReturnValue(true);
      mockedClient.callTool.mockResolvedValue({
        content: [{ type: 'text', text: 'Result' }],
        isError: false,
      });

      const handler = createMcpToolHandler('test-server', {
        name: 'test-tool',
        server: 'test-server',
      });

      const result = await handler({ input: 'value' });

      expect(result.success).toBe(true);
      expect(result.output).toBe('Result');
      expect(mockedClient.callTool).toHaveBeenCalledWith(
        'test-server',
        'test-tool',
        { input: 'value' }
      );
    });

    it('should return error if server not connected', async () => {
      mockedClient.isServerConnected.mockReturnValue(false);

      const handler = createMcpToolHandler('test-server', {
        name: 'test-tool',
        server: 'test-server',
      });

      const result = await handler({});

      expect(result.success).toBe(false);
      expect(result.output).toContain('not connected');
    });

    it('should handle callTool errors', async () => {
      mockedClient.isServerConnected.mockReturnValue(true);
      mockedClient.callTool.mockRejectedValue(new Error('Network error'));

      const handler = createMcpToolHandler('test-server', {
        name: 'test-tool',
        server: 'test-server',
      });

      const result = await handler({});

      expect(result.success).toBe(false);
      expect(result.output).toContain('Network error');
    });
  });

  describe('mcpToolToHandlerEntry', () => {
    it('should return tuple of normalized name and handler', () => {
      const [name, handler] = mcpToolToHandlerEntry('slack', {
        name: 'sendMessage',
        server: 'slack',
      });

      expect(name).toBe('mcp_slack_sendMessage');
      expect(typeof handler).toBe('function');
    });
  });

  describe('registerServerTools', () => {
    it('should register tools from connected server', async () => {
      mockedClient.isServerConnected.mockReturnValue(true);
      mockedClient.listServerTools.mockResolvedValue([
        { name: 'tool1', server: 'test' },
        { name: 'tool2', server: 'test', description: 'A tool' },
      ]);

      const count = await registerServerTools('test');

      expect(count).toBe(2);
      expect(hasMcpToolHandler('mcp_test_tool1')).toBe(true);
      expect(hasMcpToolHandler('mcp_test_tool2')).toBe(true);
    });

    it('should return 0 if server not connected', async () => {
      mockedClient.isServerConnected.mockReturnValue(false);

      const count = await registerServerTools('test');

      expect(count).toBe(0);
    });
  });

  describe('unregisterServerTools', () => {
    it('should unregister tools for a server', async () => {
      mockedClient.isServerConnected.mockReturnValue(true);
      mockedClient.listServerTools.mockResolvedValue([
        { name: 'tool1', server: 'test' },
      ]);

      await registerServerTools('test');
      expect(hasMcpToolHandler('mcp_test_tool1')).toBe(true);

      const count = unregisterServerTools('test');

      expect(count).toBe(1);
      expect(hasMcpToolHandler('mcp_test_tool1')).toBe(false);
    });

    it('should only unregister tools for specified server', async () => {
      mockedClient.isServerConnected.mockReturnValue(true);
      mockedClient.listServerTools
        .mockResolvedValueOnce([{ name: 'tool1', server: 'server1' }])
        .mockResolvedValueOnce([{ name: 'tool2', server: 'server2' }]);

      await registerServerTools('server1');
      await registerServerTools('server2');

      unregisterServerTools('server1');

      expect(hasMcpToolHandler('mcp_server1_tool1')).toBe(false);
      expect(hasMcpToolHandler('mcp_server2_tool2')).toBe(true);
    });
  });

  describe('clearMcpToolRegistry', () => {
    it('should clear all registered tools', async () => {
      mockedClient.isServerConnected.mockReturnValue(true);
      mockedClient.listServerTools.mockResolvedValue([
        { name: 'tool1', server: 'test' },
      ]);

      await registerServerTools('test');
      expect(getMcpToolCount()).toBe(1);

      clearMcpToolRegistry();

      expect(getMcpToolCount()).toBe(0);
    });
  });

  describe('getMcpToolHandler', () => {
    it('should return handler for registered tool', async () => {
      mockedClient.isServerConnected.mockReturnValue(true);
      mockedClient.listServerTools.mockResolvedValue([
        { name: 'tool1', server: 'test' },
      ]);

      await registerServerTools('test');

      const handler = getMcpToolHandler('mcp_test_tool1');
      expect(handler).toBeDefined();
      expect(typeof handler).toBe('function');
    });

    it('should return undefined for unregistered tool', () => {
      const handler = getMcpToolHandler('mcp_unknown_tool');
      expect(handler).toBeUndefined();
    });
  });

  describe('getMcpToolHandlers', () => {
    it('should return all handlers as object', async () => {
      mockedClient.isServerConnected.mockReturnValue(true);
      mockedClient.listServerTools.mockResolvedValue([
        { name: 'tool1', server: 'test' },
        { name: 'tool2', server: 'test' },
      ]);

      await registerServerTools('test');

      const handlers = getMcpToolHandlers();

      expect(Object.keys(handlers)).toHaveLength(2);
      expect(handlers['mcp_test_tool1']).toBeDefined();
      expect(handlers['mcp_test_tool2']).toBeDefined();
    });
  });

  describe('listMcpTools', () => {
    it('should list all registered tools with metadata', async () => {
      mockedClient.isServerConnected.mockReturnValue(true);
      mockedClient.listServerTools.mockResolvedValue([
        { name: 'sendMessage', server: 'slack', description: 'Send a message' },
      ]);

      await registerServerTools('slack');

      const tools = listMcpTools();

      expect(tools).toHaveLength(1);
      expect(tools[0]).toEqual({
        name: 'mcp_slack_sendMessage',
        server: 'slack',
        description: 'Send a message',
      });
    });
  });

  describe('getMcpToolCount', () => {
    it('should return count of registered tools', async () => {
      mockedClient.isServerConnected.mockReturnValue(true);
      mockedClient.listServerTools.mockResolvedValue([
        { name: 'tool1', server: 'test' },
        { name: 'tool2', server: 'test' },
        { name: 'tool3', server: 'test' },
      ]);

      expect(getMcpToolCount()).toBe(0);

      await registerServerTools('test');

      expect(getMcpToolCount()).toBe(3);
    });
  });
});
