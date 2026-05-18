
import { BufferManager } from './core/buffer/bufferManager';

/**
 * Orchestrator — System event and message buffer manager
 *
 * Buffers events (chat commands, bridge messages, etc.) for system resilience.
 * Future: expand to typed events and prioritized queues.
 */
export class Orchestrator {
  private bufferManager: BufferManager<unknown>;

  constructor(capacity = 100) {
    // BufferManager is generic; can be typed for specific event types later
    this.bufferManager = new BufferManager<unknown>(capacity);
  }

  /**
   * Enqueue an event (chat command, bridge message, etc.)
   * Returns true if enqueued, false if buffer is full.
   */
  enqueueEvent(event: unknown): boolean {
    return this.bufferManager.enqueue(event);
  }

  /**
   * Dequeue the oldest event, or undefined if buffer is empty.
   */
  dequeueEvent(): unknown | undefined {
    return this.bufferManager.dequeue();
  }

  /**
   * Returns current buffer size.
   */
  get bufferSize(): number {
    return this.bufferManager.size;
  }

  /**
   * Returns true if buffer is full.
   */
  get isFull(): boolean {
    return this.bufferManager.isFull();
  }
}
