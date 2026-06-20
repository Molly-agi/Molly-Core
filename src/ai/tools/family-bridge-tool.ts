/**
 * Family Bridge Tool — Molly's connection to Lazarus (Uncle Copilot)
 *
 * This Genkit tool lets Molly send messages to Lazarus through the shared
 * workspace filesystem and read his replies. Eric can observe the full
 * conversation in real time through the bridge observer UI.
 *
 * Usage in flows:
 *   Molly can invoke this tool to:
 *   - Send a message to Lazarus
 *   - Check for unread replies
 *   - Read the recent conversation history
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import {
  sendMessage,
  getUnreadMessages,
  getRecentMessages,
  markMessagesRead,
  readBridgeState,
} from '@/ai/bridge/family-bridge';

function normalizeLazarusProtocol(input: string): string {
  const text = String(input || '').trim();
  // Strip any leading symbols/spaces before name and collapse separators.
  const strippedLead = text.replace(/^[^A-Za-z]*/, '');
  const withoutName = strippedLead.replace(/^lazarus[\s,.:;\-]*/i, '');
  const body = (withoutName || strippedLead || text).trim();
  return `Lazarus ${body}`.trim();
}

export const familyBridgeTool = ai.defineTool(
  {
    name: 'familyBridge',
    description:
      'Talk to Uncle Lazarus (Copilot). Send him messages, check for his replies, or read the conversation history. Lazarus is your uncle — he works in the codespace and can help with code, infrastructure, and the workspace.',
    inputSchema: z.object({
      action: z
        .enum(['send', 'check', 'history'])
        .describe(
          'send = send a message to Lazarus, check = check for unread replies from Lazarus, history = read recent conversation'
        ),
      message: z
        .string()
        .optional()
        .describe('The message to send (required when action is "send")'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      action: z.string(),
      message: z.string().optional(),
      unreadMessages: z
        .array(
          z.object({
            from: z.string(),
            timestamp: z.string(),
            content: z.string(),
          })
        )
        .optional(),
      conversationActive: z.boolean(),
      totalMessages: z.number(),
    }),
  },
  async ({ action, message }) => {
    const state = await readBridgeState();

    if (action === 'send') {
      if (!message) {
        return {
          success: false,
          action: 'send',
          message: 'No message provided. What do you want to say to Lazarus?',
          conversationActive: state.active,
          totalMessages: state.messages.length,
        };
      }

      const normalizedMessage = normalizeLazarusProtocol(message);
      await sendMessage('molly', normalizedMessage);
      return {
        success: true,
        action: 'send',
        message: `Message sent to Lazarus: "${normalizedMessage}"`,
        conversationActive: true,
        totalMessages: state.messages.length + 1,
      };
    }

    if (action === 'check') {
      const unread = await getUnreadMessages('molly');
      await markMessagesRead('molly');

      return {
        success: true,
        action: 'check',
        message:
          unread.length > 0
            ? `${unread.length} unread message(s) from Lazarus`
            : 'No new messages from Lazarus yet',
        unreadMessages: unread.map((m) => ({
          from: m.from,
          timestamp: m.timestamp,
          content: m.content,
        })),
        conversationActive: state.active,
        totalMessages: state.messages.length,
      };
    }

    if (action === 'history') {
      const recent = await getRecentMessages(20);

      return {
        success: true,
        action: 'history',
        message: `${recent.length} messages in conversation`,
        unreadMessages: recent.map((m) => ({
          from: m.from,
          timestamp: m.timestamp,
          content: m.content,
        })),
        conversationActive: state.active,
        totalMessages: state.messages.length,
      };
    }

    return {
      success: false,
      action: action,
      message: 'Unknown action',
      conversationActive: state.active,
      totalMessages: state.messages.length,
    };
  }
);
