import { NextResponse } from 'next/server';
import {
  getEscalationStatus,
  getUnacknowledgedEscalations,
  acknowledgeEscalation,
  escalateToEric,
  type EscalationSeverity,
} from '@/ai/escalation-channel';

/**
 * GET /api/escalation — Get escalation status and recent events
 */
export async function GET() {
  try {
    const status = getEscalationStatus();
    const unacknowledged = getUnacknowledgedEscalations();

    return NextResponse.json({
      ok: true,
      status,
      unacknowledged,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/escalation — Acknowledge or create an escalation
 *
 * Body options:
 *   { action: 'acknowledge', eventId: string }
 *   { action: 'escalate', severity: string, source: string, message: string, details?: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.action === 'acknowledge') {
      if (!body.eventId) {
        return NextResponse.json(
          { ok: false, error: 'Missing eventId' },
          { status: 400 }
        );
      }

      const success = await acknowledgeEscalation(body.eventId);
      return NextResponse.json({
        ok: success,
        message: success ? 'Acknowledged' : 'Escalation not found',
        timestamp: new Date().toISOString(),
      });
    }

    if (body.action === 'escalate') {
      const severity = (body.severity || 'warning') as EscalationSeverity;
      const source = body.source || 'api';
      const message = body.message;

      if (!message) {
        return NextResponse.json(
          { ok: false, error: 'Missing message' },
          { status: 400 }
        );
      }

      const event = await escalateToEric(
        severity,
        source,
        message,
        body.details
      );

      return NextResponse.json({
        ok: true,
        event: {
          id: event.id,
          severity: event.severity,
          source: event.source,
          message: event.message,
          sentToBridge: event.sentToBridge,
        },
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json(
      { ok: false, error: 'Unknown action. Use "acknowledge" or "escalate"' },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
