/**
 * @fileOverview Email Delivery Service — SendGrid Integration
 *
 * Sends outreach emails through SendGrid's API. Starts on the free
 * tier (100 emails/day, no credit card), scales to paid as revenue grows.
 *
 * Architecture:
 *   1. Accepts outreach content from the outreach engine
 *   2. Formats for SendGrid API (v3 Mail Send)
 *   3. Sends with proper CAN-SPAM compliance:
 *      - Physical business address in footer
 *      - Unsubscribe link
 *      - Honest subject lines
 *   4. Tracks delivery status (sent, delivered, bounced, opened)
 *   5. Reports bounces back to contact tracker (undeliverable)
 *
 * Setup:
 *   1. Sign up at sendgrid.com (free tier, no credit card)
 *   2. Create API key
 *   3. Set SENDGRID_API_KEY in .env.local
 *   4. Verify sender identity (single sender verification — free)
 *
 * We use the REST API directly (no SDK) to keep dependencies minimal.
 */

import { MollyLogger } from '@/ai/logger';
import { getContactTracker } from './contact-tracker';
import type { OutreachContent } from './outreach-engine';

const FLOW_NAME = 'email-delivery';

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send';

// ============================================================================
// TYPES
// ============================================================================

export type DeliveryStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'bounced'
  | 'failed'
  | 'rate-limited';

export interface DeliveryResult {
  /** Whether the API call succeeded */
  success: boolean;
  /** Delivery status */
  status: DeliveryStatus;
  /** SendGrid message ID (for tracking) */
  messageId?: string;
  /** Error message if failed */
  error?: string;
  /** Timestamp */
  sentAt: string;
}

export interface EmailConfig {
  /** SendGrid API key (from env) */
  apiKey: string;
  /** Verified sender email */
  fromEmail: string;
  /** Sender display name */
  fromName: string;
  /** Physical business address (CAN-SPAM requirement) */
  businessAddress: string;
  /** Daily send limit (free tier: 100) */
  dailyLimit: number;
}

// ============================================================================
// RATE TRACKING
// ============================================================================

interface DailyCount {
  date: string;
  count: number;
}

let dailySendCount: DailyCount = {
  date: new Date().toISOString().split('T')[0]!,
  count: 0,
};

function getTodayCount(): number {
  const today = new Date().toISOString().split('T')[0]!;
  if (dailySendCount.date !== today) {
    dailySendCount = { date: today, count: 0 };
  }
  return dailySendCount.count;
}

function incrementCount(): void {
  const today = new Date().toISOString().split('T')[0]!;
  if (dailySendCount.date !== today) {
    dailySendCount = { date: today, count: 0 };
  }
  dailySendCount.count++;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

let emailConfig: EmailConfig | null = null;

/**
 * Configure the email delivery service.
 * Must be called before sending any emails.
 *
 * Can also be auto-configured from environment variables:
 *   SENDGRID_API_KEY — API key
 *   SENDGRID_FROM_EMAIL — Verified sender email
 *   SENDGRID_FROM_NAME — Sender display name
 */
export function configureEmail(config: EmailConfig): void {
  emailConfig = { ...config };
  MollyLogger.info('Email delivery configured', FLOW_NAME, {
    fromEmail: config.fromEmail,
    dailyLimit: config.dailyLimit,
  });
}

/**
 * Auto-configure from environment variables.
 */
export function configureEmailFromEnv(): boolean {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME || 'Asset Recovery Services';
  const businessAddress =
    process.env.BUSINESS_ADDRESS ||
    '[Business Address — Configure in .env.local]';

  if (!apiKey || !fromEmail) {
    MollyLogger.warn(
      'Email delivery not configured — SENDGRID_API_KEY and SENDGRID_FROM_EMAIL required in .env.local',
      FLOW_NAME
    );
    return false;
  }

  configureEmail({
    apiKey,
    fromEmail,
    fromName,
    businessAddress,
    dailyLimit: 100, // Free tier
  });

  return true;
}

function getConfig(): EmailConfig {
  if (!emailConfig) {
    // Try auto-configure
    if (!configureEmailFromEnv()) {
      throw new Error(
        'Email delivery not configured. Set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL in .env.local'
      );
    }
  }
  return emailConfig!;
}

// ============================================================================
// EMAIL SENDING
// ============================================================================

/**
 * Send an outreach email through SendGrid.
 *
 * Handles:
 *   - Rate limiting (respects daily cap)
 *   - CAN-SPAM footer (business address, unsubscribe)
 *   - Delivery tracking
 *   - Bounce reporting back to contact tracker
 */
export async function sendEmail(
  toEmail: string,
  toName: string,
  outreach: OutreachContent,
  clientId?: string
): Promise<DeliveryResult> {
  const config = getConfig();
  const now = new Date().toISOString();

  // Rate limit check
  const todayCount = getTodayCount();
  if (todayCount >= config.dailyLimit) {
    MollyLogger.warn(
      `Daily email limit reached (${todayCount}/${config.dailyLimit}). Queuing for tomorrow.`,
      FLOW_NAME
    );
    return {
      success: false,
      status: 'rate-limited',
      error: `Daily limit of ${config.dailyLimit} emails reached. Will retry tomorrow.`,
      sentAt: now,
    };
  }

  // Build CAN-SPAM compliant email body
  const htmlBody = buildHtmlEmail(
    outreach.body,
    config.businessAddress,
    toEmail
  );
  const textBody = buildTextEmail(
    outreach.body,
    config.businessAddress,
    toEmail
  );

  // SendGrid v3 Mail Send payload
  const payload = {
    personalizations: [
      {
        to: [{ email: toEmail, name: toName }],
        subject: outreach.subject,
      },
    ],
    from: {
      email: config.fromEmail,
      name: config.fromName,
    },
    reply_to: {
      email: config.fromEmail,
      name: config.fromName,
    },
    content: [
      { type: 'text/plain', value: textBody },
      { type: 'text/html', value: htmlBody },
    ],
    tracking_settings: {
      open_tracking: { enable: true },
      click_tracking: { enable: false }, // Don't track clicks — looks scammy
    },
    asm: {
      // Unsubscribe group — if configured in SendGrid
      group_id: 0, // Will use default
    },
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(SENDGRID_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 202) {
      // SendGrid returns 202 Accepted on success
      const messageId =
        response.headers.get('X-Message-Id') || `sg_${Date.now()}`;

      incrementCount();

      MollyLogger.info(`Email sent to ${toEmail}`, FLOW_NAME, {
        messageId,
        subject: outreach.subject,
        dailyCount: getTodayCount(),
      });

      // Record delivery in contact tracker
      if (clientId) {
        getContactTracker().recordDelivery(clientId);
      }

      return {
        success: true,
        status: 'sent',
        messageId,
        sentAt: now,
      };
    }

    // Handle errors
    let errorBody = '';
    try {
      errorBody = await response.text();
    } catch {
      // ignore
    }

    const errorMsg = `SendGrid API error: ${response.status} ${response.statusText} — ${errorBody}`;

    MollyLogger.error(errorMsg, FLOW_NAME, {
      toEmail,
      status: response.status,
    });

    // If bounced (400 with invalid email), report to tracker
    if (response.status === 400 && clientId) {
      getContactTracker().recordUndeliverable(
        clientId,
        `Email bounced: ${errorBody}`
      );
    }

    return {
      success: false,
      status: response.status === 429 ? 'rate-limited' : 'failed',
      error: errorMsg,
      sentAt: now,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    MollyLogger.error(`Email send failed: ${msg}`, FLOW_NAME, {
      toEmail,
    });

    return {
      success: false,
      status: 'failed',
      error: msg,
      sentAt: now,
    };
  }
}

/**
 * Get remaining daily send capacity.
 */
export function getRemainingCapacity(): {
  sent: number;
  remaining: number;
  limit: number;
} {
  const config = emailConfig;
  const limit = config?.dailyLimit ?? 100;
  const sent = getTodayCount();
  return {
    sent,
    remaining: Math.max(0, limit - sent),
    limit,
  };
}

// ============================================================================
// EMAIL FORMATTING — CAN-SPAM Compliant
// ============================================================================

function buildTextEmail(
  body: string,
  businessAddress: string,
  recipientEmail: string
): string {
  return `${body}

---
${businessAddress}

This message was sent to ${recipientEmail} because our research
identified unclaimed property that may belong to you.

To stop receiving these communications, reply with "UNSUBSCRIBE"
or contact us at the address above. We will honor your request
immediately.`;
}

function buildHtmlEmail(
  body: string,
  businessAddress: string,
  recipientEmail: string
): string {
  // Convert plain text to simple HTML
  const htmlBody = body
    .split('\n')
    .map((line) => {
      if (line.trim() === '') return '<br>';
      if (line.startsWith('═') || line.startsWith('─')) return '<hr>';
      if (line.startsWith('  - ') || line.startsWith('  • '))
        return `<li>${escapeHtml(line.trim().slice(2))}</li>`;
      return `<p style="margin:0 0 4px 0;">${escapeHtml(line)}</p>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Georgia, serif; font-size: 14px; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
${htmlBody}
<hr style="margin-top: 30px; border: none; border-top: 1px solid #ccc;">
<p style="font-size: 11px; color: #999;">
${escapeHtml(businessAddress)}<br><br>
This message was sent to ${escapeHtml(recipientEmail)} because our research
identified unclaimed property that may belong to you.<br><br>
To stop receiving these communications, reply with "UNSUBSCRIBE"
or contact us at the address above. We will honor your request immediately.
</p>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
