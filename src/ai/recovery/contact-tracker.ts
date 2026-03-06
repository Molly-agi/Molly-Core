/**
 * @fileOverview Contact Tracker — Outreach Lifecycle Management
 *
 * Manages the full lifecycle of heir/prospect communications:
 *
 *   1. Record every outreach attempt (email, letter, phone)
 *   2. Track responses and opt-outs
 *   3. Schedule follow-ups with configurable intervals
 *   4. Enforce max contact attempts (don't harass people)
 *   5. Maintain CAN-SPAM compliance (opt-out honored immediately)
 *   6. Generate contact history reports for compliance audits
 *
 * Every communication is logged. Every opt-out is permanent.
 * We run a clean operation.
 */

import { MollyLogger } from '@/ai/logger';
import type {
  OutreachContent,
  OutreachType,
  OutreachChannel,
} from './outreach-engine';

const FLOW_NAME = 'contact-tracker';

// ============================================================================
// TYPES
// ============================================================================

export type ContactStatus =
  | 'not-contacted' // No outreach attempted yet
  | 'initial-sent' // First contact sent
  | 'follow-up-sent' // Follow-up sent
  | 'agreement-sent' // Agreement sent to prospect
  | 'responded' // Prospect responded (positive or neutral)
  | 'interested' // Prospect expressed interest
  | 'agreement-signed' // Agreement signed — convert to active client
  | 'declined' // Prospect said no
  | 'opted-out' // Prospect opted out of all communication
  | 'undeliverable' // Contact info invalid (bounced email, returned mail)
  | 'no-response'; // Max attempts reached with no response

export interface ContactRecord {
  /** Unique contact record ID */
  id: string;
  /** Client/prospect ID (from client-manager) */
  clientId: string;
  /** Prospect name */
  name: string;
  /** Contact email */
  email?: string;
  /** Contact phone */
  phone?: string;
  /** Mailing address */
  mailingAddress?: string;
  /** Current contact status */
  status: ContactStatus;
  /** All outreach attempts */
  attempts: OutreachAttempt[];
  /** Responses received */
  responses: ContactResponse[];
  /** Maximum number of contact attempts before giving up */
  maxAttempts: number;
  /** Days between follow-ups */
  followUpIntervalDays: number;
  /** Next follow-up date (ISO string), null if not scheduled */
  nextFollowUp: string | null;
  /** Whether the prospect has opted out of communication */
  optedOut: boolean;
  /** Opt-out timestamp */
  optedOutAt?: string;
  /** Created timestamp */
  createdAt: string;
  /** Last updated */
  updatedAt: string;
}

export interface OutreachAttempt {
  /** Attempt number (1, 2, 3...) */
  attemptNumber: number;
  /** Channel used */
  channel: OutreachChannel;
  /** Type of outreach */
  type: OutreachType;
  /** Whether the outreach was actually sent (vs generated but held) */
  sent: boolean;
  /** If not sent, why */
  holdReason?: string;
  /** Timestamp */
  sentAt: string;
  /** Delivery confirmation (email delivered, letter mailed, etc.) */
  delivered?: boolean;
  /** Delivery timestamp */
  deliveredAt?: string;
}

export interface ContactResponse {
  /** How the response came in */
  channel: 'email' | 'phone' | 'letter' | 'web-form' | 'other';
  /** What they said (summarized, not raw PII) */
  summary: string;
  /** Sentiment */
  sentiment: 'positive' | 'neutral' | 'negative' | 'opt-out';
  /** Timestamp */
  receivedAt: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Default: maximum 3 contact attempts before marking as no-response */
const DEFAULT_MAX_ATTEMPTS = 3;

/** Default: 14 days between follow-ups */
const DEFAULT_FOLLOW_UP_INTERVAL_DAYS = 14;

// ============================================================================
// CONTACT TRACKER
// ============================================================================

export class ContactTracker {
  private static instance: ContactTracker | null = null;

  /** All contact records indexed by ID */
  private records: Map<string, ContactRecord> = new Map();
  /** Index: clientId → contactRecordId for quick lookup */
  private clientIndex: Map<string, string> = new Map();

  private constructor() {}

  static getInstance(): ContactTracker {
    if (!ContactTracker.instance) {
      ContactTracker.instance = new ContactTracker();
    }
    return ContactTracker.instance;
  }

  // ==========================================================================
  // RECORD MANAGEMENT
  // ==========================================================================

  /**
   * Create a contact record for a prospect.
   */
  createRecord(
    clientId: string,
    name: string,
    email?: string,
    phone?: string,
    mailingAddress?: string,
    maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
    followUpIntervalDays: number = DEFAULT_FOLLOW_UP_INTERVAL_DAYS
  ): ContactRecord {
    // Check if record already exists for this client
    const existingId = this.clientIndex.get(clientId);
    if (existingId) {
      const existing = this.records.get(existingId);
      if (existing) {
        MollyLogger.info(
          `Contact record already exists for client ${clientId}`,
          FLOW_NAME
        );
        return existing;
      }
    }

    const record: ContactRecord = {
      id: `contact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      clientId,
      name,
      email,
      phone,
      mailingAddress,
      status: 'not-contacted',
      attempts: [],
      responses: [],
      maxAttempts,
      followUpIntervalDays,
      nextFollowUp: null,
      optedOut: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.records.set(record.id, record);
    this.clientIndex.set(clientId, record.id);

    MollyLogger.info(`Contact record created: ${name}`, FLOW_NAME, {
      recordId: record.id,
      clientId,
    });

    return record;
  }

  /**
   * Get contact record by client ID.
   */
  getByClientId(clientId: string): ContactRecord | undefined {
    const recordId = this.clientIndex.get(clientId);
    if (!recordId) return undefined;
    return this.records.get(recordId);
  }

  /**
   * Get contact record by record ID.
   */
  getRecord(recordId: string): ContactRecord | undefined {
    return this.records.get(recordId);
  }

  // ==========================================================================
  // OUTREACH TRACKING
  // ==========================================================================

  /**
   * Record an outreach attempt.
   *
   * @param clientId - The client/prospect this is for
   * @param outreach - The generated outreach content
   * @param actuallySent - Whether it was actually sent (not just generated)
   * @returns Updated contact record, or null if blocked (opted out, max reached)
   */
  recordAttempt(
    clientId: string,
    outreach: OutreachContent,
    actuallySent: boolean
  ): ContactRecord | null {
    const record = this.getByClientId(clientId);
    if (!record) {
      MollyLogger.warn(`No contact record for client ${clientId}`, FLOW_NAME);
      return null;
    }

    // HARD BLOCK: opted out = no more contact, period
    if (record.optedOut) {
      MollyLogger.warn(
        `Contact blocked — prospect opted out: ${record.name}`,
        FLOW_NAME
      );
      return null;
    }

    // HARD BLOCK: max attempts reached
    const sentAttempts = record.attempts.filter((a) => a.sent).length;
    if (sentAttempts >= record.maxAttempts) {
      record.status = 'no-response';
      record.updatedAt = new Date().toISOString();
      MollyLogger.warn(
        `Max contact attempts reached for ${record.name} (${sentAttempts}/${record.maxAttempts})`,
        FLOW_NAME
      );
      return null;
    }

    const attempt: OutreachAttempt = {
      attemptNumber: record.attempts.length + 1,
      channel: outreach.channel,
      type: outreach.type,
      sent: actuallySent,
      holdReason: actuallySent
        ? undefined
        : outreach.holdReasons.join('; ') || 'Not sent',
      sentAt: new Date().toISOString(),
    };

    record.attempts.push(attempt);

    // Update status based on outreach type
    if (actuallySent) {
      switch (outreach.type) {
        case 'initial-discovery':
          record.status = 'initial-sent';
          break;
        case 'follow-up':
          record.status = 'follow-up-sent';
          break;
        case 'agreement-reminder':
          record.status = 'agreement-sent';
          break;
      }

      // Schedule next follow-up
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + record.followUpIntervalDays);
      record.nextFollowUp = nextDate.toISOString();
    }

    record.updatedAt = new Date().toISOString();

    MollyLogger.info(
      `Outreach recorded: ${outreach.type} for ${record.name}`,
      FLOW_NAME,
      {
        attemptNumber: attempt.attemptNumber,
        channel: outreach.channel,
        sent: actuallySent,
        nextFollowUp: record.nextFollowUp,
      }
    );

    return record;
  }

  /**
   * Record delivery confirmation for the most recent attempt.
   */
  recordDelivery(clientId: string): boolean {
    const record = this.getByClientId(clientId);
    if (!record || record.attempts.length === 0) return false;

    const lastAttempt = record.attempts[record.attempts.length - 1]!;
    lastAttempt.delivered = true;
    lastAttempt.deliveredAt = new Date().toISOString();
    record.updatedAt = new Date().toISOString();

    return true;
  }

  // ==========================================================================
  // RESPONSE TRACKING
  // ==========================================================================

  /**
   * Record a response from a prospect.
   */
  recordResponse(
    clientId: string,
    channel: ContactResponse['channel'],
    summary: string,
    sentiment: ContactResponse['sentiment']
  ): ContactRecord | null {
    const record = this.getByClientId(clientId);
    if (!record) return null;

    const response: ContactResponse = {
      channel,
      summary,
      sentiment,
      receivedAt: new Date().toISOString(),
    };

    record.responses.push(response);

    // Update status based on sentiment
    switch (sentiment) {
      case 'positive':
        record.status = 'interested';
        record.nextFollowUp = null; // They responded, no auto-follow-up
        break;
      case 'neutral':
        record.status = 'responded';
        break;
      case 'negative':
        record.status = 'declined';
        record.nextFollowUp = null;
        break;
      case 'opt-out':
        this.recordOptOut(clientId);
        break;
    }

    record.updatedAt = new Date().toISOString();

    MollyLogger.info(
      `Response recorded from ${record.name}: ${sentiment}`,
      FLOW_NAME,
      { clientId, channel, sentiment }
    );

    return record;
  }

  /**
   * Record that a prospect has opted out. This is permanent and immediate.
   * CAN-SPAM requires honoring opt-outs within 10 business days,
   * but we honor them instantly.
   */
  recordOptOut(clientId: string): boolean {
    const record = this.getByClientId(clientId);
    if (!record) return false;

    record.optedOut = true;
    record.optedOutAt = new Date().toISOString();
    record.status = 'opted-out';
    record.nextFollowUp = null;
    record.updatedAt = new Date().toISOString();

    MollyLogger.info(
      `Opt-out recorded for ${record.name} — no further contact`,
      FLOW_NAME,
      { clientId }
    );

    return true;
  }

  /**
   * Record undeliverable contact info.
   */
  recordUndeliverable(clientId: string, reason: string): boolean {
    const record = this.getByClientId(clientId);
    if (!record) return false;

    record.status = 'undeliverable';
    record.nextFollowUp = null;
    record.updatedAt = new Date().toISOString();

    record.responses.push({
      channel: 'other',
      summary: `Undeliverable: ${reason}`,
      sentiment: 'negative',
      receivedAt: new Date().toISOString(),
    });

    MollyLogger.info(
      `Contact undeliverable for ${record.name}: ${reason}`,
      FLOW_NAME,
      { clientId }
    );

    return true;
  }

  // ==========================================================================
  // FOLLOW-UP SCHEDULING
  // ==========================================================================

  /**
   * Get all contacts that are due for a follow-up.
   * Returns records where nextFollowUp is in the past and
   * the prospect hasn't opted out or hit max attempts.
   */
  getDueFollowUps(): ContactRecord[] {
    const now = new Date();
    const due: ContactRecord[] = [];

    for (const record of this.records.values()) {
      if (
        record.nextFollowUp &&
        !record.optedOut &&
        record.status !== 'no-response' &&
        record.status !== 'declined' &&
        record.status !== 'undeliverable' &&
        record.status !== 'agreement-signed' &&
        record.status !== 'interested'
      ) {
        const followUpDate = new Date(record.nextFollowUp);
        if (followUpDate <= now) {
          const sentAttempts = record.attempts.filter((a) => a.sent).length;
          if (sentAttempts < record.maxAttempts) {
            due.push(record);
          }
        }
      }
    }

    return due;
  }

  // ==========================================================================
  // REPORTING
  // ==========================================================================

  /**
   * Get a summary of all contact activity.
   */
  getSummary(): {
    total: number;
    byStatus: Record<ContactStatus, number>;
    totalAttempts: number;
    totalResponses: number;
    optOuts: number;
    dueForFollowUp: number;
    conversionRate: number;
  } {
    const byStatus: Record<string, number> = {};
    let totalAttempts = 0;
    let totalResponses = 0;
    let optOuts = 0;

    for (const record of this.records.values()) {
      byStatus[record.status] = (byStatus[record.status] || 0) + 1;
      totalAttempts += record.attempts.filter((a) => a.sent).length;
      totalResponses += record.responses.length;
      if (record.optedOut) optOuts++;
    }

    const dueForFollowUp = this.getDueFollowUps().length;
    const interested =
      (byStatus['interested'] || 0) + (byStatus['agreement-signed'] || 0);
    const contacted = this.records.size - (byStatus['not-contacted'] || 0);
    const conversionRate = contacted > 0 ? interested / contacted : 0;

    return {
      total: this.records.size,
      byStatus: byStatus as Record<ContactStatus, number>,
      totalAttempts,
      totalResponses,
      optOuts,
      dueForFollowUp,
      conversionRate,
    };
  }

  /**
   * Get full contact history for a client (for compliance audits).
   */
  getContactHistory(clientId: string): {
    record: ContactRecord;
    attemptCount: number;
    responseCount: number;
    timeline: { date: string; event: string }[];
  } | null {
    const record = this.getByClientId(clientId);
    if (!record) return null;

    const timeline: { date: string; event: string }[] = [];

    // Add all attempts to timeline
    for (const attempt of record.attempts) {
      timeline.push({
        date: attempt.sentAt,
        event: `${attempt.sent ? 'Sent' : 'Held'} ${attempt.type} via ${attempt.channel} (attempt #${attempt.attemptNumber})`,
      });
    }

    // Add all responses to timeline
    for (const response of record.responses) {
      timeline.push({
        date: response.receivedAt,
        event: `Response via ${response.channel}: ${response.sentiment} — ${response.summary}`,
      });
    }

    // Sort chronologically
    timeline.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    return {
      record,
      attemptCount: record.attempts.filter((a) => a.sent).length,
      responseCount: record.responses.length,
      timeline,
    };
  }

  // ==========================================================================
  // STATE PERSISTENCE
  // ==========================================================================

  exportState(): ContactRecord[] {
    return Array.from(this.records.values());
  }

  importState(records: ContactRecord[]): void {
    this.records.clear();
    this.clientIndex.clear();

    for (const record of records) {
      this.records.set(record.id, record);
      this.clientIndex.set(record.clientId, record.id);
    }

    MollyLogger.info('Contact tracker state imported', FLOW_NAME, {
      records: records.length,
    });
  }
}

// Singleton accessor
export function getContactTracker(): ContactTracker {
  return ContactTracker.getInstance();
}
