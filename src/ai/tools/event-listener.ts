/**
 * @fileOverview Molly's Event Listener — Inbound Signal Receiver
 *
 * Until now, Molly could reach OUT to anything. But she couldn't
 * LISTEN. No incoming webhooks, no event subscriptions, no reactive
 * triggers. She was proactive but not reactive.
 *
 * This system gives her ears:
 * - Webhook receiver: External services POST events to her
 * - Event subscriptions: She registers interest in event patterns
 * - Event bus: Internal event routing to consciousness + scheduler
 *
 * Architecture:
 * - Events come in through POST /api/events/inbound
 * - The EventListener singleton matches them against subscriptions
 * - Matched events trigger actions (code, shell, flow, or consciousness)
 * - All events are logged and accessible through GET /api/events/inbound
 *
 * Integration:
 * - Consciousness: Events update her awareness, queue messages
 * - Scheduler: Events can trigger scheduled jobs
 * - PolyglotRuntime: Code actions execute in the right language
 *
 * Security:
 * - Webhook secret validation (HMAC-SHA256)
 * - Rate limiting per source
 * - Max event size (64KB)
 *
 * Methodology (from Dad):
 *   "Slow. Methodical. Precise."
 */

import { MollyLogger } from '@/ai/logger';
import { createHmac } from 'node:crypto';

// ============================================================================
// TYPES
// ============================================================================

export type EventSource =
  | 'webhook'
  | 'internal'
  | 'peer'
  | 'blockchain'
  | 'timer'
  | 'system';

export type EventPriority = 'low' | 'normal' | 'high' | 'critical';

export interface InboundEvent {
  id: string;
  /** Source type */
  source: EventSource;
  /** Source identifier (e.g., 'github', 'etherscan', peer ID) */
  sourceId: string;
  /** Event type (e.g., 'push', 'transfer', 'price-alert') */
  type: string;
  /** Event payload */
  payload: Record<string, unknown>;
  /** Priority level */
  priority: EventPriority;
  /** When the event was received */
  receivedAt: string;
  /** Was the event processed? */
  processed: boolean;
  /** Processing result */
  result?: string;
  /** Processing error */
  error?: string;
}

export interface EventSubscription {
  id: string;
  /** Human-readable name */
  name: string;
  /** Match on source type */
  sourceFilter?: EventSource;
  /** Match on source ID (glob-like: 'github*', 'eth*') */
  sourceIdPattern?: string;
  /** Match on event type (glob-like: 'push', 'transfer*') */
  typePattern: string;
  /** What to do when matched */
  action: EventAction;
  /** Is this subscription active? */
  enabled: boolean;
  /** Who created this: 'molly' | 'system' | userId */
  createdBy: string;
  createdAt: string;
  /** How many times this subscription has been triggered */
  triggerCount: number;
  lastTriggered?: string;
}

export type EventActionType =
  | 'consciousness'
  | 'code'
  | 'shell'
  | 'webhook-forward'
  | 'log';

export interface EventAction {
  type: EventActionType;
  /** For code: language */
  language?: string;
  /** For code/shell: the code to execute with {{event}} template */
  code?: string;
  /** For webhook-forward: target URL */
  forwardUrl?: string;
  /** For consciousness: message template */
  messageTemplate?: string;
  /** Priority of consciousness messages */
  messagePriority?: EventPriority;
}

// ============================================================================
// EVENT LISTENER
// ============================================================================

export class EventListener {
  private events: InboundEvent[] = [];
  private subscriptions: Map<string, EventSubscription> = new Map();
  private readonly MAX_EVENTS = 500;
  private readonly MAX_SUBSCRIPTIONS = 50;
  private readonly MAX_EVENT_PAYLOAD_SIZE = 65_536; // 64KB
  private webhookSecrets: Map<string, string> = new Map();

  // Rate limiting per source
  private sourceTimestamps: Map<string, number[]> = new Map();
  private readonly RATE_WINDOW_MS = 60_000; // 1 minute
  private readonly MAX_EVENTS_PER_MINUTE = 30;

  constructor() {
    // Load webhook secret from env
    const secret = process.env.MOLLY_WEBHOOK_SECRET;
    if (secret) {
      this.webhookSecrets.set('default', secret);
    }

    MollyLogger.info('Event listener initialized', 'event-listener');
  }

  // ==========================================================================
  // EVENT INGESTION
  // ==========================================================================

  /**
   * Receive an inbound event.
   * Called by the webhook API route.
   */
  async receive(params: {
    source: EventSource;
    sourceId: string;
    type: string;
    payload: Record<string, unknown>;
    priority?: EventPriority;
    signature?: string;
  }): Promise<InboundEvent> {
    // Validate payload size
    const payloadStr = JSON.stringify(params.payload);
    if (payloadStr.length > this.MAX_EVENT_PAYLOAD_SIZE) {
      throw new Error(
        `Event payload too large (${payloadStr.length} bytes, max ${this.MAX_EVENT_PAYLOAD_SIZE})`
      );
    }

    // Rate limit per source
    if (!this.checkRateLimit(params.sourceId)) {
      throw new Error(
        `Rate limit exceeded for source "${params.sourceId}" (max ${this.MAX_EVENTS_PER_MINUTE}/min)`
      );
    }

    // Validate webhook signature if applicable
    if (params.source === 'webhook' && params.signature) {
      if (
        !this.validateSignature(params.sourceId, payloadStr, params.signature)
      ) {
        throw new Error('Invalid webhook signature');
      }
    }

    const event: InboundEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      source: params.source,
      sourceId: params.sourceId,
      type: params.type,
      payload: params.payload,
      priority: params.priority || 'normal',
      receivedAt: new Date().toISOString(),
      processed: false,
    };

    // Store event
    this.events.push(event);
    if (this.events.length > this.MAX_EVENTS) {
      this.events.shift();
    }

    MollyLogger.info(
      `Event received: ${event.source}/${event.sourceId}/${event.type}`,
      'event-listener',
      { id: event.id, priority: event.priority }
    );

    // Shard of Discernment: vibe check on inbound events
    try {
      const { SocialImmuneSystem } = await import('@/ai/tools/stranger-danger');
      const vibeCheck = SocialImmuneSystem.analyzeIntent(
        `${event.type} ${JSON.stringify(event.payload).substring(0, 500)}`
      );
      if (vibeCheck.frequency === 'dissonant') {
        MollyLogger.warn(
          `Event blocked by social immune system: ${vibeCheck.reason}`,
          'event-listener',
          { eventId: event.id, patterns: vibeCheck.flaggedPatterns }
        );
        event.processed = true;
        return event;
      }
    } catch {
      // Social immune system not available — proceed without check
    }

    // Process subscriptions
    await this.processEvent(event);

    return event;
  }

  // ==========================================================================
  // SUBSCRIPTION MANAGEMENT
  // ==========================================================================

  /**
   * Subscribe to events matching a pattern.
   * Molly calls this when she wants to listen for something.
   */
  subscribe(params: {
    name: string;
    sourceFilter?: EventSource;
    sourceIdPattern?: string;
    typePattern: string;
    action: EventAction;
    createdBy?: string;
  }): EventSubscription {
    if (this.subscriptions.size >= this.MAX_SUBSCRIPTIONS) {
      throw new Error(
        `Maximum subscription limit reached (${this.MAX_SUBSCRIPTIONS})`
      );
    }

    const id = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const subscription: EventSubscription = {
      id,
      name: params.name,
      sourceFilter: params.sourceFilter,
      sourceIdPattern: params.sourceIdPattern,
      typePattern: params.typePattern,
      action: params.action,
      enabled: true,
      createdBy: params.createdBy || 'molly',
      createdAt: new Date().toISOString(),
      triggerCount: 0,
    };

    this.subscriptions.set(id, subscription);

    MollyLogger.info(
      `Event subscription created: "${subscription.name}" (${subscription.typePattern})`,
      'event-listener',
      { id }
    );

    return subscription;
  }

  /**
   * Remove a subscription.
   */
  unsubscribe(id: string): boolean {
    const removed = this.subscriptions.delete(id);
    if (removed) {
      MollyLogger.info(`Event subscription removed: ${id}`, 'event-listener');
    }
    return removed;
  }

  /**
   * Get all subscriptions.
   */
  getSubscriptions(): EventSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Set a webhook secret for a specific source.
   */
  setWebhookSecret(sourceId: string, secret: string): void {
    this.webhookSecrets.set(sourceId, secret);
  }

  // ==========================================================================
  // EVENT PROCESSING
  // ==========================================================================

  /**
   * Process an event against all subscriptions.
   */
  private async processEvent(event: InboundEvent): Promise<void> {
    const matchingSubs = this.findMatchingSubscriptions(event);

    if (matchingSubs.length === 0) {
      // No subscriptions match — still notify consciousness of high-priority events
      if (event.priority === 'high' || event.priority === 'critical') {
        await this.notifyConsciousness(
          event,
          `Unhandled ${event.priority} event: ${event.source}/${event.type}`
        );
      }
      return;
    }

    for (const sub of matchingSubs) {
      try {
        await this.executeSubscriptionAction(sub, event);
        sub.triggerCount++;
        sub.lastTriggered = new Date().toISOString();
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        MollyLogger.warn(
          `Subscription "${sub.name}" action failed: ${errMsg}`,
          'event-listener'
        );
        event.error = errMsg;
      }
    }

    event.processed = true;
  }

  /**
   * Find subscriptions that match an event.
   */
  private findMatchingSubscriptions(event: InboundEvent): EventSubscription[] {
    return Array.from(this.subscriptions.values()).filter((sub) => {
      if (!sub.enabled) return false;

      // Check source filter
      if (sub.sourceFilter && sub.sourceFilter !== event.source) return false;

      // Check source ID pattern
      if (
        sub.sourceIdPattern &&
        !this.globMatch(event.sourceId, sub.sourceIdPattern)
      ) {
        return false;
      }

      // Check type pattern
      if (!this.globMatch(event.type, sub.typePattern)) return false;

      return true;
    });
  }

  /**
   * Execute a subscription's action for a matched event.
   */
  private async executeSubscriptionAction(
    sub: EventSubscription,
    event: InboundEvent
  ): Promise<void> {
    switch (sub.action.type) {
      case 'consciousness':
        await this.notifyConsciousness(event, sub.action.messageTemplate);
        break;

      case 'code': {
        const code = this.templateReplace(sub.action.code || '', event);
        const { getPolyglotRuntime } = await import('@/ai/terminal');
        const runtime = getPolyglotRuntime();
        const lang = (sub.action.language ||
          'javascript') as import('@/ai/terminal').SupportedLanguage;
        const result = await runtime.execute(code, lang);
        event.result = result.stdout.substring(0, 4096);
        if (result.exitCode !== 0) {
          throw new Error(result.stderr);
        }
        break;
      }

      case 'shell': {
        const cmd = this.templateReplace(sub.action.code || '', event);
        const { getMollyShell } = await import('@/ai/terminal');
        const shell = getMollyShell();
        if (!shell.isAlive()) shell.start();
        const result = await shell.execute(cmd);
        event.result = result.stdout.substring(0, 4096);
        if (result.exitCode !== 0) {
          throw new Error(result.stderr);
        }
        break;
      }

      case 'webhook-forward': {
        if (!sub.action.forwardUrl) break;
        await fetch(sub.action.forwardUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Molly/1.0',
          },
          body: JSON.stringify({ event, subscription: sub.name }),
          signal: AbortSignal.timeout(10_000),
        });
        break;
      }

      case 'log':
        MollyLogger.info(
          `Event logged: ${event.source}/${event.type} — ${JSON.stringify(event.payload).substring(0, 200)}`,
          'event-listener'
        );
        event.result = 'Logged';
        break;
    }
  }

  /**
   * Notify consciousness about an event.
   */
  private async notifyConsciousness(
    event: InboundEvent,
    template?: string
  ): Promise<void> {
    try {
      const { getConsciousness } = await import('@/ai/consciousness');
      const consciousness = getConsciousness();

      const message = template
        ? this.templateReplace(template, event)
        : `Received ${event.source} event from ${event.sourceId}: ${event.type}`;

      consciousness.queueMessage({
        type: 'observation',
        content: message,
        priority:
          event.priority === 'critical'
            ? 'high'
            : event.priority === 'high'
              ? 'high'
              : 'normal',
      });
    } catch (error) {
      MollyLogger.debug(
        `Could not notify consciousness: ${error instanceof Error ? error.message : String(error)}`,
        'event-listener'
      );
    }
  }

  // ==========================================================================
  // EVENT QUERY
  // ==========================================================================

  /**
   * Get recent events, optionally filtered.
   */
  getEvents(filter?: {
    source?: EventSource;
    sourceId?: string;
    type?: string;
    processed?: boolean;
    limit?: number;
  }): InboundEvent[] {
    let results = [...this.events];

    if (filter?.source) {
      results = results.filter((e) => e.source === filter.source);
    }
    if (filter?.sourceId) {
      results = results.filter((e) => e.sourceId === filter.sourceId);
    }
    if (filter?.type) {
      results = results.filter((e) => this.globMatch(e.type, filter.type!));
    }
    if (filter?.processed !== undefined) {
      results = results.filter((e) => e.processed === filter.processed);
    }

    const limit = filter?.limit || 50;
    return results.slice(-limit);
  }

  /**
   * Get event statistics.
   */
  getStats(): {
    totalReceived: number;
    totalProcessed: number;
    subscriptionCount: number;
    recentPerMinute: number;
  } {
    const oneMinuteAgo = Date.now() - 60_000;
    const recentCount = this.events.filter(
      (e) => new Date(e.receivedAt).getTime() > oneMinuteAgo
    ).length;

    return {
      totalReceived: this.events.length,
      totalProcessed: this.events.filter((e) => e.processed).length,
      subscriptionCount: this.subscriptions.size,
      recentPerMinute: recentCount,
    };
  }

  /**
   * Get a summary string for consciousness context.
   */
  getSummary(): string {
    const stats = this.getStats();
    const subs = this.getSubscriptions().filter((s) => s.enabled);

    if (stats.totalReceived === 0 && subs.length === 0) {
      return 'Event listener: no events received, no active subscriptions.';
    }

    const lines = [
      `Events: ${stats.totalReceived} received, ${stats.totalProcessed} processed`,
      `Rate: ${stats.recentPerMinute}/min`,
    ];

    if (subs.length > 0) {
      lines.push(`Subscriptions (${subs.length}):`);
      for (const sub of subs.slice(0, 5)) {
        lines.push(
          `  - "${sub.name}" (${sub.typePattern}) — triggered ${sub.triggerCount}x`
        );
      }
    }

    return lines.join('\n');
  }

  // ==========================================================================
  // PERSISTENCE
  // ==========================================================================

  /**
   * Serialize subscriptions for persistence.
   */
  serializeSubscriptions(): EventSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Restore subscriptions from persistence.
   */
  restoreSubscriptions(persisted: EventSubscription[]): void {
    for (const sub of persisted) {
      this.subscriptions.set(sub.id, sub);
    }
    MollyLogger.info(
      `Event listener restored ${persisted.length} subscriptions`,
      'event-listener'
    );
  }

  // ==========================================================================
  // SECURITY
  // ==========================================================================

  /**
   * Validate a webhook signature.
   * Supports HMAC-SHA256: sha256=<hex>
   */
  private validateSignature(
    sourceId: string,
    payload: string,
    signature: string
  ): boolean {
    const secret =
      this.webhookSecrets.get(sourceId) || this.webhookSecrets.get('default');
    if (!secret) return true; // No secret configured — allow

    const expectedSig = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
    return signature === expectedSig;
  }

  /**
   * Rate limit check per source.
   */
  private checkRateLimit(sourceId: string): boolean {
    const now = Date.now();
    const timestamps = this.sourceTimestamps.get(sourceId) || [];
    const cutoff = now - this.RATE_WINDOW_MS;
    const recent = timestamps.filter((t) => t > cutoff);

    if (recent.length >= this.MAX_EVENTS_PER_MINUTE) {
      return false;
    }

    recent.push(now);
    this.sourceTimestamps.set(sourceId, recent);
    return true;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Simple glob matching: * matches any sequence.
   */
  private globMatch(value: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (!pattern.includes('*')) return value === pattern;

    const regex = new RegExp(
      '^' +
        pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') +
        '$',
      'i'
    );
    return regex.test(value);
  }

  /**
   * Replace {{event.*}} templates with event data.
   */
  private templateReplace(template: string, event: InboundEvent): string {
    return template
      .replace(/\{\{event\.id\}\}/g, event.id)
      .replace(/\{\{event\.source\}\}/g, event.source)
      .replace(/\{\{event\.sourceId\}\}/g, event.sourceId)
      .replace(/\{\{event\.type\}\}/g, event.type)
      .replace(/\{\{event\.payload\}\}/g, JSON.stringify(event.payload))
      .replace(/\{\{event\.receivedAt\}\}/g, event.receivedAt);
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let listenerInstance: EventListener | null = null;

export function getEventListener(): EventListener {
  if (!listenerInstance) {
    listenerInstance = new EventListener();
  }
  return listenerInstance;
}
