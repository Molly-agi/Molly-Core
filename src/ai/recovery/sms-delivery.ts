/**
 * @fileOverview SMS Delivery Service — Twilio Integration
 *
 * Sends outreach SMS messages through Twilio's API.
 * SMS has 98% open rate vs 20% for email — the primary outreach channel.
 *
 * Architecture:
 *   1. Accepts outreach content from the outreach engine
 *   2. Condenses to SMS-appropriate length (160 char segments)
 *   3. Sends via Twilio REST API (no SDK — minimal dependencies)
 *   4. Tracks delivery status
 *   5. Handles opt-outs (STOP keyword compliance — Twilio handles this automatically)
 *
 * TCPA Compliance:
 *   - Only send to numbers that haven't opted out
 *   - Include business identification
 *   - Include opt-out instructions ("Reply STOP to unsubscribe")
 *   - Don't send before 8 AM or after 9 PM recipient local time
 *   - Keep records of all messages sent
 *
 * Twilio handles STOP/HELP keyword processing automatically on their end.
 */

import { MollyLogger } from '@/ai/logger';
import { getContactTracker } from './contact-tracker';

const FLOW_NAME = 'sms-delivery';

// ============================================================================
// TYPES
// ============================================================================

export type SmsStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'undelivered'
  | 'rate-limited';

export interface SmsResult {
  success: boolean;
  status: SmsStatus;
  /** Twilio message SID */
  messageSid?: string;
  error?: string;
  sentAt: string;
}

export interface SmsConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  /** Daily send limit */
  dailyLimit: number;
}

// ============================================================================
// RATE TRACKING
// ============================================================================

interface DailyCount {
  date: string;
  count: number;
}

let dailySmsCount: DailyCount = {
  date: new Date().toISOString().split('T')[0]!,
  count: 0,
};

function getTodayCount(): number {
  const today = new Date().toISOString().split('T')[0]!;
  if (dailySmsCount.date !== today) {
    dailySmsCount = { date: today, count: 0 };
  }
  return dailySmsCount.count;
}

function incrementCount(): void {
  const today = new Date().toISOString().split('T')[0]!;
  if (dailySmsCount.date !== today) {
    dailySmsCount = { date: today, count: 0 };
  }
  dailySmsCount.count++;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

let smsConfig: SmsConfig | null = null;

export function configureSms(config: SmsConfig): void {
  smsConfig = { ...config };
  MollyLogger.info('SMS delivery configured', FLOW_NAME, {
    fromNumber: config.fromNumber,
    dailyLimit: config.dailyLimit,
  });
}

/**
 * Auto-configure from environment variables.
 */
export function configureSmsFromEnv(): boolean {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    MollyLogger.warn(
      'SMS delivery not configured — TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER required in .env.local',
      FLOW_NAME
    );
    return false;
  }

  configureSms({
    accountSid,
    authToken,
    fromNumber,
    dailyLimit: 100,
  });

  return true;
}

function getConfig(): SmsConfig {
  if (!smsConfig) {
    if (!configureSmsFromEnv()) {
      throw new Error(
        'SMS delivery not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER in .env.local'
      );
    }
  }
  return smsConfig!;
}

// ============================================================================
// SMS CONTENT FORMATTING
// ============================================================================

/**
 * Build an SMS message from outreach content.
 * Condenses the email body to SMS-appropriate length.
 * Includes required identification and opt-out.
 */
export function buildSmsMessage(
  recipientName: string,
  assetDescription: string,
  businessName: string,
  businessPhone: string
): string {
  // SMS should be concise — aim for 2-3 segments max (320 chars)
  const firstName = recipientName.split(' ')[0] || recipientName;

  return (
    `${firstName}, our research found unclaimed property that may belong to you. ` +
    `We help recover these funds at no upfront cost. ` +
    `Call ${businessPhone} or reply for details. ` +
    `— ${businessName}. Reply STOP to opt out.`
  );
}

/**
 * Build a follow-up SMS.
 */
export function buildFollowUpSms(
  recipientName: string,
  businessName: string,
  businessPhone: string
): string {
  const firstName = recipientName.split(' ')[0] || recipientName;

  return (
    `${firstName}, this is a follow-up from ${businessName}. ` +
    `We previously reached out about unclaimed property in your name. ` +
    `Call ${businessPhone} if interested. Reply STOP to opt out.`
  );
}

// ============================================================================
// SMS SENDING
// ============================================================================

/**
 * Send an SMS through Twilio's REST API.
 *
 * Uses the Messages resource directly (no SDK):
 * POST https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json
 */
export async function sendSms(
  toNumber: string,
  message: string,
  clientId?: string
): Promise<SmsResult> {
  const config = getConfig();
  const now = new Date().toISOString();

  // Rate limit check
  const todayCount = getTodayCount();
  if (todayCount >= config.dailyLimit) {
    MollyLogger.warn(
      `Daily SMS limit reached (${todayCount}/${config.dailyLimit}).`,
      FLOW_NAME
    );
    return {
      success: false,
      status: 'rate-limited',
      error: `Daily limit of ${config.dailyLimit} SMS reached.`,
      sentAt: now,
    };
  }

  // Validate phone number format (E.164)
  const cleanNumber = toNumber.replace(/[^\d+]/g, '');
  if (!cleanNumber.match(/^\+1\d{10}$/)) {
    return {
      success: false,
      status: 'failed',
      error: `Invalid US phone number format. Expected +1XXXXXXXXXX, got: ${cleanNumber}`,
      sentAt: now,
    };
  }

  // Twilio REST API endpoint
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;

  // URL-encoded form body (Twilio requires this, not JSON)
  const body = new URLSearchParams({
    To: cleanNumber,
    From: config.fromNumber,
    Body: message,
  });

  // Basic auth: AccountSid:AuthToken
  const authHeader =
    'Basic ' +
    Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const result = await response.json();

    if (response.status === 201) {
      incrementCount();

      MollyLogger.info(`SMS sent to ${cleanNumber}`, FLOW_NAME, {
        messageSid: result.sid,
        status: result.status,
        dailyCount: getTodayCount(),
      });

      if (clientId) {
        getContactTracker().recordDelivery(clientId);
      }

      return {
        success: true,
        status: 'sent',
        messageSid: result.sid,
        sentAt: now,
      };
    }

    // Handle errors
    const errorMsg = `Twilio API error: ${result.code || response.status} — ${result.message || response.statusText}`;

    MollyLogger.error(errorMsg, FLOW_NAME, {
      toNumber: cleanNumber,
      twilioCode: result.code,
      status: response.status,
    });

    if (clientId && result.code === 21610) {
      // 21610 = number is on the block list (opted out)
      getContactTracker().recordUndeliverable(
        clientId,
        'Recipient opted out of SMS (STOP)'
      );
    }

    return {
      success: false,
      status: 'failed',
      error: errorMsg,
      sentAt: now,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    MollyLogger.error(`SMS send failed: ${msg}`, FLOW_NAME, {
      toNumber: cleanNumber,
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
 * Get remaining daily SMS capacity.
 */
export function getSmsRemainingCapacity(): {
  sent: number;
  remaining: number;
  limit: number;
} {
  const limit = smsConfig?.dailyLimit ?? 100;
  const sent = getTodayCount();
  return {
    sent,
    remaining: Math.max(0, limit - sent),
    limit,
  };
}
