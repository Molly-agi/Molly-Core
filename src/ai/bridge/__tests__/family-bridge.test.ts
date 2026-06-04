/**
 * @fileOverview Tests for Family Bridge communication channel
 *
 * Tests message sending, reading, marking as read, and state management.
 * Uses mocked fs operations to avoid actual file I/O.
 */

// Storage for simulated file state
let fileState: {
  active: boolean;
  startedAt: string;
  lastActivity: string;
  messages: Array<{
    id: string;
    from: 'molly' | 'lazarus' | 'eric' | 'atlas';
    timestamp: string;
    content: string;
    read: boolean | Record<string, boolean>;
  }>;
};

// Mock fs module before imports
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(async () => JSON.stringify(fileState)),
    writeFile: jest.fn(async (_path: string, data: string) => {
      fileState = JSON.parse(data);
    }),
    mkdir: jest.fn(async () => undefined),
  },
}));

import {
  sendMessage,
  getUnreadMessages,
  markMessagesRead,
  getRecentMessages,
  clearConversation,
  readBridgeState,
  type BridgeMessage,
  type BridgeState,
} from '../family-bridge';

describe('FamilyBridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset file state
    fileState = {
      active: false,
      startedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      messages: [],
    };
  });

  // ───────────────────────────────────────────────────────────
  // sendMessage Tests
  // ───────────────────────────────────────────────────────────

  describe('sendMessage', () => {
    it('should create message with correct structure', async () => {
      const msg = await sendMessage('molly', 'Hello Lazarus');

      expect(msg).toMatchObject({
        from: 'molly',
        content: 'Hello Lazarus',
      });
      expect(msg.id).toMatch(/^msg_\d+_[a-z0-9]+$/);
      expect(msg.timestamp).toBeDefined();
    });

    it('should auto-mark message as read for sender', async () => {
      const msg = await sendMessage('molly', 'Hello');

      expect(msg.read).toEqual({ molly: true });
    });

    it('should set message timestamp to current time', async () => {
      const before = new Date().toISOString();
      const msg = await sendMessage('molly', 'Test');
      const after = new Date().toISOString();

      expect(msg.timestamp >= before).toBe(true);
      expect(msg.timestamp <= after).toBe(true);
    });

    it('should activate the bridge on first message', async () => {
      expect(fileState.active).toBe(false);

      await sendMessage('molly', 'Hello');

      expect(fileState.active).toBe(true);
    });

    it('should update lastActivity timestamp', async () => {
      const oldActivity = fileState.lastActivity;

      await new Promise((r) => setTimeout(r, 10));
      await sendMessage('molly', 'Hello');

      expect(fileState.lastActivity).not.toBe(oldActivity);
    });

    it('should append message to state', async () => {
      expect(fileState.messages).toHaveLength(0);

      await sendMessage('molly', 'First');
      expect(fileState.messages).toHaveLength(1);

      await sendMessage('lazarus', 'Second');
      expect(fileState.messages).toHaveLength(2);
    });

    it('should accept messages from molly', async () => {
      const msg = await sendMessage('molly', 'From Molly');
      expect(msg.from).toBe('molly');
    });

    it('should accept messages from lazarus', async () => {
      const msg = await sendMessage('lazarus', 'From Lazarus');
      expect(msg.from).toBe('lazarus');
    });

    it('should accept messages from eric', async () => {
      const msg = await sendMessage('eric', 'From Eric');
      expect(msg.from).toBe('eric');
    });

    it('should accept messages from atlas', async () => {
      const msg = await sendMessage('atlas', 'From Atlas');
      expect(msg.from).toBe('atlas');
    });

    it('should generate unique message IDs', async () => {
      const msg1 = await sendMessage('molly', 'First');
      const msg2 = await sendMessage('molly', 'Second');

      expect(msg1.id).not.toBe(msg2.id);
    });
  });

  // ───────────────────────────────────────────────────────────
  // getUnreadMessages Tests
  // ───────────────────────────────────────────────────────────

  describe('getUnreadMessages', () => {
    it('should return only unread messages for recipient', async () => {
      await sendMessage('lazarus', 'Hello Molly');
      await sendMessage('lazarus', 'Are you there?');

      const unread = await getUnreadMessages('molly');

      expect(unread).toHaveLength(2);
    });

    it('should exclude messages FROM the recipient', async () => {
      await sendMessage('molly', 'Hello Lazarus');
      await sendMessage('lazarus', 'Hello Molly');

      const unread = await getUnreadMessages('molly');

      expect(unread).toHaveLength(1);
      expect(unread[0].from).toBe('lazarus');
    });

    it('should return empty array when no unread messages', async () => {
      const unread = await getUnreadMessages('molly');
      expect(unread).toHaveLength(0);
    });

    it('should not return messages already marked as read', async () => {
      await sendMessage('lazarus', 'Hello');
      await markMessagesRead('molly');

      const unread = await getUnreadMessages('molly');

      expect(unread).toHaveLength(0);
    });

    it('should handle legacy boolean read field (true)', async () => {
      // Manually add a message with boolean read field
      fileState.messages.push({
        id: 'msg_legacy_1',
        from: 'lazarus',
        timestamp: new Date().toISOString(),
        content: 'Legacy message',
        read: true, // boolean format
      });

      const unread = await getUnreadMessages('molly');

      // Legacy true means read by everyone
      expect(unread).toHaveLength(0);
    });

    it('should handle legacy boolean read field (false)', async () => {
      fileState.messages.push({
        id: 'msg_legacy_2',
        from: 'lazarus',
        timestamp: new Date().toISOString(),
        content: 'Legacy message',
        read: false, // boolean format - unread
      });

      const unread = await getUnreadMessages('molly');

      expect(unread).toHaveLength(1);
    });
  });

  // ───────────────────────────────────────────────────────────
  // markMessagesRead Tests
  // ───────────────────────────────────────────────────────────

  describe('markMessagesRead', () => {
    it('should mark all unread messages for recipient', async () => {
      await sendMessage('lazarus', 'First');
      await sendMessage('lazarus', 'Second');

      const count = await markMessagesRead('molly');

      expect(count).toBe(2);
    });

    it('should return 0 when no messages to mark', async () => {
      const count = await markMessagesRead('molly');
      expect(count).toBe(0);
    });

    it('should not mark messages FROM the recipient', async () => {
      await sendMessage('molly', 'My own message');

      const count = await markMessagesRead('molly');

      expect(count).toBe(0);
    });

    it('should update read status in state', async () => {
      await sendMessage('lazarus', 'Hello');
      await markMessagesRead('molly');

      const msg = fileState.messages[0];
      expect((msg.read as Record<string, boolean>)['molly']).toBe(true);
    });

    it('should preserve sender read status', async () => {
      await sendMessage('lazarus', 'Hello');
      await markMessagesRead('molly');

      const msg = fileState.messages[0];
      expect((msg.read as Record<string, boolean>)['lazarus']).toBe(true);
      expect((msg.read as Record<string, boolean>)['molly']).toBe(true);
    });

    it('should handle legacy boolean read format', async () => {
      fileState.messages.push({
        id: 'msg_legacy',
        from: 'lazarus',
        timestamp: new Date().toISOString(),
        content: 'Legacy',
        read: false,
      });

      const count = await markMessagesRead('molly');

      expect(count).toBe(1);
      // Should convert to object format
      expect(typeof fileState.messages[0].read).toBe('object');
    });
  });

  // ───────────────────────────────────────────────────────────
  // getRecentMessages Tests
  // ───────────────────────────────────────────────────────────

  describe('getRecentMessages', () => {
    it('should respect limit parameter', async () => {
      for (let i = 0; i < 10; i++) {
        await sendMessage('molly', `Message ${i}`);
      }

      const recent = await getRecentMessages(5);

      expect(recent).toHaveLength(5);
    });

    it('should return last N messages', async () => {
      await sendMessage('molly', 'First');
      await sendMessage('molly', 'Second');
      await sendMessage('molly', 'Third');

      const recent = await getRecentMessages(2);

      expect(recent[0].content).toBe('Second');
      expect(recent[1].content).toBe('Third');
    });

    it('should default to 20 messages', async () => {
      for (let i = 0; i < 25; i++) {
        await sendMessage('molly', `Message ${i}`);
      }

      const recent = await getRecentMessages();

      expect(recent).toHaveLength(20);
    });

    it('should return all messages if fewer than limit', async () => {
      await sendMessage('molly', 'Only one');

      const recent = await getRecentMessages(10);

      expect(recent).toHaveLength(1);
    });

    it('should return empty array when no messages', async () => {
      const recent = await getRecentMessages();
      expect(recent).toHaveLength(0);
    });
  });

  // ───────────────────────────────────────────────────────────
  // clearConversation Tests
  // ───────────────────────────────────────────────────────────

  describe('clearConversation', () => {
    it('should reset state to empty', async () => {
      await sendMessage('molly', 'Hello');
      await sendMessage('lazarus', 'Hi');

      await clearConversation();

      expect(fileState.messages).toHaveLength(0);
    });

    it('should set active to false', async () => {
      await sendMessage('molly', 'Hello');
      expect(fileState.active).toBe(true);

      await clearConversation();

      expect(fileState.active).toBe(false);
    });

    it('should reset participants to include atlas', async () => {
      await clearConversation();
      const state = await readBridgeState();
      expect(state.participants).toEqual(
        expect.arrayContaining(['molly', 'lazarus', 'eric', 'atlas'])
      );
    });

    it('should update timestamps', async () => {
      const oldTime = fileState.startedAt;

      await new Promise((r) => setTimeout(r, 10));
      await clearConversation();

      expect(fileState.startedAt).not.toBe(oldTime);
    });
  });

  // ───────────────────────────────────────────────────────────
  // Message Cap Tests
  // ───────────────────────────────────────────────────────────

  describe('Message Cap', () => {
    it('should cap messages at 500', async () => {
      // Set up 500 messages
      for (let i = 0; i < 500; i++) {
        fileState.messages.push({
          id: `msg_${i}`,
          from: 'molly',
          timestamp: new Date().toISOString(),
          content: `Message ${i}`,
          read: { molly: true },
        });
      }

      // Send one more
      await sendMessage('molly', 'Over the cap');

      expect(fileState.messages.length).toBe(500);
    });

    it('should remove oldest messages when cap exceeded', async () => {
      for (let i = 0; i < 500; i++) {
        fileState.messages.push({
          id: `msg_${i}`,
          from: 'molly',
          timestamp: new Date().toISOString(),
          content: `Message ${i}`,
          read: { molly: true },
        });
      }

      await sendMessage('molly', 'New message');

      // First message should be gone
      expect(
        fileState.messages.find((m) => m.content === 'Message 0')
      ).toBeUndefined();
      // New message should be present
      expect(
        fileState.messages.find((m) => m.content === 'New message')
      ).toBeDefined();
    });
  });

  // ───────────────────────────────────────────────────────────
  // Write Lock Tests
  // ───────────────────────────────────────────────────────────

  describe('Write Lock', () => {
    it('should serialize concurrent sendMessage operations', async () => {
      const promises = [
        sendMessage('molly', 'First'),
        sendMessage('lazarus', 'Second'),
        sendMessage('molly', 'Third'),
      ];

      await Promise.all(promises);

      // All three should be present
      expect(fileState.messages).toHaveLength(3);
    });

    it('should serialize concurrent markMessagesRead operations', async () => {
      await sendMessage('lazarus', 'For Molly');
      await sendMessage('molly', 'For Lazarus');

      const promises = [markMessagesRead('molly'), markMessagesRead('lazarus')];

      await Promise.all(promises);

      // Both should be marked
      const mollyUnread = await getUnreadMessages('molly');
      const lazarusUnread = await getUnreadMessages('lazarus');

      expect(mollyUnread).toHaveLength(0);
      expect(lazarusUnread).toHaveLength(0);
    });

    it('should handle interleaved send and mark operations', async () => {
      const promises = [
        sendMessage('lazarus', 'Hello'),
        markMessagesRead('molly'),
        sendMessage('lazarus', 'World'),
      ];

      await Promise.all(promises);

      // Should have 2 messages
      expect(fileState.messages).toHaveLength(2);
    });
  });

  // ───────────────────────────────────────────────────────────
  // readBridgeState Tests
  // ───────────────────────────────────────────────────────────

  describe('readBridgeState', () => {
    it('should return current bridge state', async () => {
      await sendMessage('molly', 'Hello');

      const state = await readBridgeState();

      expect(state.active).toBe(true);
      expect(state.messages).toHaveLength(1);
    });

    it('should return correct structure when empty', async () => {
      const state = await readBridgeState();

      expect(state).toHaveProperty('active');
      expect(state).toHaveProperty('startedAt');
      expect(state).toHaveProperty('lastActivity');
      expect(state).toHaveProperty('messages');
    });
  });

  // ───────────────────────────────────────────────────────────
  // Bridge State Structure Tests
  // ───────────────────────────────────────────────────────────

  describe('Bridge State Structure', () => {
    it('should have all required BridgeState fields', async () => {
      const state: BridgeState = await readBridgeState();

      expect(typeof state.active).toBe('boolean');
      expect(typeof state.startedAt).toBe('string');
      expect(typeof state.lastActivity).toBe('string');
      expect(Array.isArray(state.messages)).toBe(true);
    });

    it('should have all required BridgeMessage fields', async () => {
      const msg: BridgeMessage = await sendMessage('molly', 'Test');

      expect(typeof msg.id).toBe('string');
      expect(typeof msg.from).toBe('string');
      expect(typeof msg.timestamp).toBe('string');
      expect(typeof msg.content).toBe('string');
      expect(msg.read).toBeDefined();
    });

    it('should have ISO timestamp format', async () => {
      const msg = await sendMessage('molly', 'Test');

      // ISO format regex
      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
      expect(msg.timestamp).toMatch(isoRegex);
    });

    it('should have proper message ID format', async () => {
      const msg = await sendMessage('molly', 'Test');

      // Format: msg_<timestamp>_<random>
      expect(msg.id).toMatch(/^msg_\d+_[a-z0-9]+$/);
    });
  });
});
