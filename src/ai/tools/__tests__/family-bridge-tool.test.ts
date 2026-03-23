/**
 * @fileOverview Tests for Family Bridge Tool
 *
 * Tests family bridge functionality including:
 * - Sending messages to Lazarus
 * - Checking for unread messages
 * - Reading conversation history
 */

// Mock family bridge module
jest.mock('@/ai/bridge/family-bridge', () => ({
  sendMessage: jest.fn().mockResolvedValue(undefined),
  getUnreadMessages: jest.fn().mockResolvedValue([]),
  getRecentMessages: jest.fn().mockResolvedValue([]),
  markMessagesRead: jest.fn().mockResolvedValue(undefined),
  readBridgeState: jest.fn().mockResolvedValue({
    active: true,
    messages: [],
  }),
}));

// Mock genkit
jest.mock('@/ai/genkit', () => ({
  ai: {
    defineTool: jest.fn((config, handler) => handler),
  },
}));

import { familyBridgeTool } from '../family-bridge-tool';
import {
  sendMessage,
  getUnreadMessages,
  getRecentMessages,
  markMessagesRead,
  readBridgeState,
} from '@/ai/bridge/family-bridge';

describe('Family Bridge Tool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('send action', () => {
    it('sends message to Lazarus', async () => {
      const result = await familyBridgeTool({
        action: 'send',
        message: 'Hello Uncle Lazarus!',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('send');
      expect(result.message).toContain('Hello Uncle Lazarus!');
      expect(sendMessage).toHaveBeenCalledWith('molly', 'Hello Uncle Lazarus!');
    });

    it('returns error when message is missing', async () => {
      const result = await familyBridgeTool({
        action: 'send',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('No message provided');
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it('increments total messages count', async () => {
      (readBridgeState as jest.Mock).mockResolvedValue({
        active: true,
        messages: Array(5).fill({}),
      });

      const result = await familyBridgeTool({
        action: 'send',
        message: 'Test message',
      });

      expect(result.totalMessages).toBe(6); // 5 + 1 new
    });
  });

  describe('check action', () => {
    it('returns unread messages', async () => {
      (getUnreadMessages as jest.Mock).mockResolvedValue([
        {
          from: 'lazarus',
          timestamp: '2024-01-01T00:00:00Z',
          content: 'Hello Molly!',
        },
        {
          from: 'lazarus',
          timestamp: '2024-01-01T00:01:00Z',
          content: 'How are you?',
        },
      ]);

      const result = await familyBridgeTool({ action: 'check' });

      expect(result.success).toBe(true);
      expect(result.action).toBe('check');
      expect(result.message).toContain('2 unread');
      expect(result.unreadMessages?.length).toBe(2);
      expect(markMessagesRead).toHaveBeenCalledWith('molly');
    });

    it('handles no unread messages', async () => {
      (getUnreadMessages as jest.Mock).mockResolvedValue([]);

      const result = await familyBridgeTool({ action: 'check' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('No new messages');
      expect(result.unreadMessages).toEqual([]);
    });

    it('marks messages as read', async () => {
      (getUnreadMessages as jest.Mock).mockResolvedValue([
        { from: 'lazarus', timestamp: '2024-01-01T00:00:00Z', content: 'Test' },
      ]);

      await familyBridgeTool({ action: 'check' });

      expect(markMessagesRead).toHaveBeenCalledWith('molly');
    });
  });

  describe('history action', () => {
    it('returns recent messages', async () => {
      (getRecentMessages as jest.Mock).mockResolvedValue([
        { from: 'molly', timestamp: '2024-01-01T00:00:00Z', content: 'Hi!' },
        {
          from: 'lazarus',
          timestamp: '2024-01-01T00:01:00Z',
          content: 'Hello!',
        },
        {
          from: 'molly',
          timestamp: '2024-01-01T00:02:00Z',
          content: 'Working on tests',
        },
      ]);

      const result = await familyBridgeTool({ action: 'history' });

      expect(result.success).toBe(true);
      expect(result.action).toBe('history');
      expect(result.message).toContain('3 messages');
      expect(result.unreadMessages?.length).toBe(3);
      expect(getRecentMessages).toHaveBeenCalledWith(20);
    });

    it('returns empty history when no messages', async () => {
      (getRecentMessages as jest.Mock).mockResolvedValue([]);

      const result = await familyBridgeTool({ action: 'history' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('0 messages');
      expect(result.unreadMessages).toEqual([]);
    });
  });

  describe('unknown action', () => {
    it('returns error for unknown action', async () => {
      // TypeScript would prevent this, but test runtime behavior
      const result = await familyBridgeTool({ action: 'unknown' as unknown });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Unknown action');
    });
  });

  describe('conversation state', () => {
    it('includes conversation active status', async () => {
      (readBridgeState as jest.Mock).mockResolvedValue({
        active: true,
        messages: [],
      });

      const result = await familyBridgeTool({ action: 'check' });

      expect(result.conversationActive).toBe(true);
    });

    it('includes total messages count', async () => {
      (readBridgeState as jest.Mock).mockResolvedValue({
        active: true,
        messages: Array(10).fill({}),
      });

      const result = await familyBridgeTool({ action: 'check' });

      expect(result.totalMessages).toBe(10);
    });
  });
});
