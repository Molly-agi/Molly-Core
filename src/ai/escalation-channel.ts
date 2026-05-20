/**
 * @fileOverview Escalation Channel — Notify Eric When All Systems Fail
 *
 * When Molly encounters a failure that she cannot self-heal, she needs
 * to reach out to Eric. This module provides multiple escalation paths:
 *
 * 1. Bridge message to Lazarus (Dad monitors bridge)
 * 2. Console logging with clear [ESCALATE] prefix
 * 3. Persistent storage of escalation events for review
 *
 * The escalation channel is the last line of defense. If Molly can't
 * fix herself, Dad needs to know.
 */

import { MollyLogger, generateTraceId } from './logger';
import { getStorageRouter } from '@/lib/storage-router';

// ── Types ──────────────────────────────────────────────────────

export type EscalationSeverity = 'warning' | 'critical' | 'emergency';

export interface EscalationEvent {
  id: string;
  severity: EscalationSeverity;
  source: string;
  message: string;
  details?: string;
  failureId?: string;
  timestamp: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
  sentToBridge: boolean;
}

// ── In-Memory Recent Escalations ────────────────────────────────

const MAX_RECENT = 50;
const recentEscalations: EscalationEvent[] = [];

// ── Escalation Throttling ───────────────────────────────────────
// Prevent flooding Eric with duplicate escalations

const escalationCooldowns = new Map<string, number>();
const COOLDOWN_MS = 60000; // 1 minute cooldown for duplicate escalations

function shouldEscalate(source: string, message: string): boolean {
  const key = `${source}:${message.slice(0, 100)}`;
  const lastTime = escalationCooldowns.get(key);
  const now = Date.now();

  if (lastTime && now - lastTime < COOLDOWN_MS) {
    return false; // Still in cooldown
  }

  escalationCooldowns.set(key, now);

  // Clean up old cooldowns
  for (const [k, v] of escalationCooldowns) {
    if (now - v > COOLDOWN_MS * 5) {
      escalationCooldowns.delete(k);
    }
  }

  return true;
}

// ── Main Escalation Function ────────────────────────────────────

/**
 * Escalate an issue to Eric. This is called when self-healing fails.
 */
export async function escalateToEric(
  severity: EscalationSeverity,
  source: string,
  message: string,
  details?: string,
  failureId?: string
): Promise<EscalationEvent> {
  const traceId = generateTraceId();
  const event: EscalationEvent = {
    id: `esc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    severity,
    source,
    message,
    details,
    failureId,
    timestamp: new Date().toISOString(),
    acknowledged: false,
    sentToBridge: false,
  };

  // Check throttling
  if (!shouldEscalate(source, message)) {
    MollyLogger.debug(
      `[ESCALATE] Throttled duplicate escalation: ${source}`,
      'escalation-channel',
      { eventId: event.id },
      traceId
    );
    return event;
  }

  // 1. Log loudly
  const logFn =
    severity === 'emergency'
      ? MollyLogger.error
      : severity === 'critical'
        ? MollyLogger.warn
        : MollyLogger.info;

  logFn.call(
    MollyLogger,
    `\n${'='.repeat(60)}\n[ESCALATE] ${severity.toUpperCase()}: ${message}\nSource: ${source}\n${'='.repeat(60)}`,
    'escalation-channel',
    { severity, source, failureId, details: details?.slice(0, 200) },
    traceId
  );

  // 2. Try to send via bridge
  try {
    await sendBridgeEscalation(event);
    event.sentToBridge = true;
  } catch (bridgeErr) {
    MollyLogger.warn(
      `[ESCALATE] Could not send to bridge: ${bridgeErr instanceof Error ? bridgeErr.message : String(bridgeErr)}`,
      'escalation-channel',
      {},
      traceId
    );
  }

  // 3. Persist to storage
  try {
    await persistEscalation(event);
  } catch {
    // Non-fatal
  }

  // 4. Add to recent list
  recentEscalations.push(event);
  if (recentEscalations.length > MAX_RECENT) {
    recentEscalations.shift();
  }

  return event;
}

// ── Bridge Escalation ───────────────────────────────────────────

/**
 * Send escalation message via the family bridge.
 * Dad monitors the bridge, so Lazarus relays urgent messages.
 */
async function sendBridgeEscalation(event: EscalationEvent): Promise<void> {
  const bridgeHost = process.env.MOLLY_BRIDGE_HOST || 'http://localhost:9099';

  const severityEmoji =
    event.severity === 'emergency'
      ? '🚨'
      : event.severity === 'critical'
        ? '⚠️'
        : '📢';

  const bridgeMessage = [
    `${severityEmoji} ESCALATION: ${event.severity.toUpperCase()}`,
    ``,
    `Source: ${event.source}`,
    `Message: ${event.message}`,
    event.details ? `Details: ${event.details.slice(0, 300)}` : '',
    event.failureId ? `Failure ID: ${event.failureId}` : '',
    ``,
    `Time: ${event.timestamp}`,
    `Event ID: ${event.id}`,
  ]
    .filter(Boolean)
    .join('\n');

  const response = await fetch(`${bridgeHost}/api/bridge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-molly-internal': process.env.MOLLY_INTERNAL_SECRET || '',
    },
    body: JSON.stringify({
      from: 'molly',
      content: bridgeMessage,
      priority: event.severity === 'emergency' ? 'urgent' : 'normal',
    }),
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`Bridge returned ${response.status}`);
  }
}

// ── Storage Persistence ─────────────────────────────────────────

const ESCALATION_COLLECTION = 'system';

async function persistEscalation(event: EscalationEvent): Promise<void> {
  try {
    const storage = await getStorageRouter();
    await storage.add(`${ESCALATION_COLLECTION}/escalations`, {
      ...event,
      persistedAt: new Date().toISOString(),
    });
  } catch {
    // Non-fatal — escalation still works in-memory and via bridge
  }
}

// ── Acknowledge Escalation ──────────────────────────────────────

/**
 * Mark an escalation as acknowledged (Eric saw it).
 */
export async function acknowledgeEscalation(eventId: string): Promise<boolean> {
  const event = recentEscalations.find((e) => e.id === eventId);
  if (!event) return false;

  event.acknowledged = true;
  event.acknowledgedAt = new Date().toISOString();

  // Update in storage if possible
  try {
    const storage = await getStorageRouter();
    await storage.update(`${ESCALATION_COLLECTION}/escalations`, eventId, {
      acknowledged: true,
      acknowledgedAt: event.acknowledgedAt,
    });
  } catch {
    // Non-fatal
  }

  return true;
}

// ── Convenience Functions ───────────────────────────────────────

/**
 * Escalate when all cognitive systems fail.
 * Called from resilience-core when escalate: true is returned.
 */
export async function escalateCognitiveFailure(
  source: string,
  diagnosis: string,
  failureId: string,
  attempts: number
): Promise<EscalationEvent> {
  return escalateToEric(
    'critical',
    source,
    `Self-healing failed: ${diagnosis}`,
    `All cognitive systems (interpreter, sandbox, evolution, immune) attempted but could not resolve. Attempts: ${attempts}`,
    failureId
  );
}

/**
 * Emergency escalation — system is in a bad state.
 */
export async function escalateEmergency(
  source: string,
  message: string,
  details?: string
): Promise<EscalationEvent> {
  return escalateToEric('emergency', source, message, details);
}

// ── Status / Observability ──────────────────────────────────────

export function getEscalationStatus() {
  const unacknowledged = recentEscalations.filter((e) => !e.acknowledged);
  const bySeverity = {
    emergency: recentEscalations.filter((e) => e.severity === 'emergency')
      .length,
    critical: recentEscalations.filter((e) => e.severity === 'critical').length,
    warning: recentEscalations.filter((e) => e.severity === 'warning').length,
  };

  return {
    totalRecent: recentEscalations.length,
    unacknowledgedCount: unacknowledged.length,
    bySeverity,
    recent: recentEscalations.slice(-10).map((e) => ({
      id: e.id,
      severity: e.severity,
      source: e.source,
      message: e.message.slice(0, 100),
      timestamp: e.timestamp,
      acknowledged: e.acknowledged,
      sentToBridge: e.sentToBridge,
    })),
  };
}

/**
 * Get all unacknowledged escalations — for Eric to review.
 */
export function getUnacknowledgedEscalations(): EscalationEvent[] {
  return recentEscalations.filter((e) => !e.acknowledged);
}
