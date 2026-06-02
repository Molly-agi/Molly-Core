/**
 * Bridge Adapter - Dual-mode operation
 *
 * Operates in one of two modes:
 * 1. LEGACY: Use existing in-memory queue (current behavior)
 * 2. DURABLE: Use Firestore-backed queue (Phase 1 migration target)
 *
 * Gradual migration: Start with LEGACY, flip DURABLE when ready, monitor,
 * then sunset LEGACY after 48h of stable DURABLE operation.
 */

import { queueStore, QueuedMessage } from './queue-store';

const BRIDGE_QUEUE_MODE = process.env.BRIDGE_QUEUE_MODE || 'LEGACY';

export interface BridgeMessage extends QueuedMessage {
  read?: { [recipient: string]: boolean };
}

export class BridgeQueueAdapter {
  private legacyMessages: Map<string, BridgeMessage> = new Map();
  private isDurable = BRIDGE_QUEUE_MODE === 'DURABLE';

  async add(msg: Omit<BridgeMessage, 'id'>): Promise<string> {
    if (this.isDurable) {
      return await queueStore.enqueue({
        from: msg.from,
        to: msg.to,
        content: msg.content,
        timestamp: msg.timestamp || Date.now(),
        source: 'bridge-daemon',
      });
    } else {
      const id = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      this.legacyMessages.set(id, {
        id,
        from: msg.from,
        to: msg.to,
        content: msg.content,
        timestamp: msg.timestamp || Date.now(),
        status: 'pending',
        deliveryAttempts: 0,
        ackedBy: [],
        read: {},
      });
      return id;
    }
  }

  async getUnread(recipient: string): Promise<BridgeMessage[]> {
    if (this.isDurable) {
      return (await queueStore.getUnread(recipient)) as BridgeMessage[];
    } else {
      // Legacy: filter by read status
      return Array.from(this.legacyMessages.values()).filter((m) => {
        if (m.from === recipient) return false;
        if (m.to && m.to !== recipient && m.to !== 'all') return false;
        return !(m.read?.[recipient] ?? false);
      });
    }
  }

  async markRead(messageId: string, recipient: string): Promise<void> {
    if (this.isDurable) {
      await queueStore.ack(messageId, recipient);
    } else {
      const msg = this.legacyMessages.get(messageId);
      if (msg) {
        msg.read = msg.read || {};
        msg.read[recipient] = true;
      }
    }
  }

  async getMessage(messageId: string): Promise<BridgeMessage | null> {
    if (this.isDurable) {
      return (await queueStore.getById(messageId)) as BridgeMessage;
    } else {
      return this.legacyMessages.get(messageId) || null;
    }
  }

  async getAllMessages(limit_: number = 1000): Promise<BridgeMessage[]> {
    if (this.isDurable) {
      // In DURABLE mode, only return recent messages
      // (queue is filtered, not full history)
      return [];
    } else {
      return Array.from(this.legacyMessages.values()).slice(-limit_);
    }
  }

  async cleanupExpired(): Promise<number> {
    if (this.isDurable) {
      return await queueStore.cleanupExpired();
    } else {
      let deleted = 0;
      const now = Date.now();
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;

      for (const [id, msg] of this.legacyMessages.entries()) {
        if (now - msg.timestamp > thirtyDays) {
          this.legacyMessages.delete(id);
          deleted++;
        }
      }
      return deleted;
    }
  }

  async getStats(): Promise<Record<string, unknown>> {
    if (this.isDurable) {
      return await queueStore.getStats();
    } else {
      const pending = Array.from(this.legacyMessages.values()).filter(
        (m) => !m.read || Object.keys(m.read).length === 0
      ).length;
      return {
        pending,
        delivered: this.legacyMessages.size - pending,
        inMemory: true,
        mode: 'LEGACY',
      };
    }
  }

  getMode(): string {
    return BRIDGE_QUEUE_MODE;
  }
}

export const queueAdapter = new BridgeQueueAdapter();
