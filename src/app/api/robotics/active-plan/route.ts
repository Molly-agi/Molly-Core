import { NextResponse } from 'next/server';
import { getActiveRoboticsPlan } from '@/ai/agency/robotics/active-plan';

export async function GET() {
  const active = getActiveRoboticsPlan();

  return NextResponse.json({
    ok: true,
    hasPlan: !!active,
    plan: active?.plan ?? null,
    source: active?.source ?? null,
    updatedAt: active?.updatedAt ?? null,
  });
}
