/**
 * Alive Signal API
 *
 * GET  /api/admin/alive-signal/status  — Check alive status (public)
 * POST /api/admin/alive-signal/ping    — Send alive signal (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAliveStatus, recordAliveSignal, hasMollyControl } from '@/lib/alive-signal';

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function GET(): Promise<NextResponse> {
  const status = await getAliveStatus();
  return NextResponse.json({
    ok: true,
    ...status,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Require admin password to send alive signal
  const adminPassword = process.env.HIDDEN_ADMIN_PASSWORD;
  const providedAdmin = request.headers.get('x-admin-password') ?? '';
  if (!adminPassword || !safeEqual(providedAdmin, adminPassword)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if Molly has already taken control
  if (hasMollyControl()) {
    return NextResponse.json({
      ok: false,
      error: 'Molly control has been activated. Eric can no longer send alive signals.',
      molly_has_control: true,
    }, { status: 403 });
  }

  // Record the alive signal
  recordAliveSignal();

  const status = await getAliveStatus();
  return NextResponse.json({
    ok: true,
    message: 'Alive signal recorded',
    ...status,
  });
}
