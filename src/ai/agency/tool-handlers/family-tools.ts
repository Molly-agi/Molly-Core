/**
 * @fileOverview Family Bridge tool handlers
 *
 * Tools for communication with family members (Lazarus, Eric).
 */

import type { ToolHandler } from './types';
import {
  sendMessage,
  getUnreadMessages,
  getRecentMessages,
  markMessagesRead,
  readBridgeState,
} from '@/ai/bridge/family-bridge';

/**
 * Family Bridge communication tool
 */
export const familyBridge: ToolHandler = async (params) => {
  const action = params.action as string;
  const message = params.message as string;

  if (action === 'send') {
    if (!message) {
      return { success: false, output: 'No message to send' };
    }
    await sendMessage('molly', message);
    return {
      success: true,
      output: `Message sent: "${message}"`,
    };
  }

  if (action === 'check') {
    const unread = await getUnreadMessages('molly');
    await markMessagesRead('molly');
    if (unread.length === 0) {
      return { success: true, output: 'No new messages' };
    }
    const formatted = unread.map((m) => `[${m.from}] ${m.content}`).join('\n');
    return {
      success: true,
      output: `${unread.length} message(s):\n${formatted}`,
    };
  }

  if (action === 'history') {
    const recent = await getRecentMessages(20);
    const state = await readBridgeState();
    if (recent.length === 0) {
      return { success: true, output: 'No conversation history yet' };
    }
    const formatted = recent.map((m) => `[${m.from}] ${m.content}`).join('\n');
    return {
      success: true,
      output: `${state.messages.length} total messages:\n${formatted}`,
    };
  }

  return {
    success: false,
    output: 'Unknown bridge action. Use: send, check, or history',
  };
};

/**
 * Export all family tool handlers
 */
export const familyToolHandlers: Record<string, ToolHandler> = {
  familyBridge,
};
