/**
 * Grant Molly permission to run autonomous cycles.
 * Only Eric should call this endpoint.
 */

import { NextResponse } from 'next/server';
import { grantAutonomyPermission } from '@/ai/agency/safety/autonomy-permission';

export async function POST(req: Request) {
  const secret = process.env.MOLLY_INTERNAL_KEY;
  if (secret) {
    const provided = req.headers.get('x-molly-key');
    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { reason, durationMs } = (await req.json()) as {
    reason?: string;
    durationMs?: number;
  };

  grantAutonomyPermission('eric', reason ?? 'Permission granted via API', durationMs);

  return NextResponse.json({
    success: true,
    message: 'Autonomy permission granted',
    timestamp: new Date().toISOString(),
  });
}
