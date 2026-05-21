/**
 * @fileOverview Test endpoint for robotics plan integration
 * Allows manual triggering of robotics plans for debugging
 */

import { NextRequest, NextResponse } from 'next/server';
import { setActiveRoboticsPlan } from '@/ai/agency/robotics/active-plan';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Create a test plan
    const testPlan = body.plan || {
      id: `test-${Date.now()}`,
      goal: 'Test robotics plan',
      actions: [
        { type: 'gesture', description: 'Nod head', duration: 2 },
        { type: 'look', target: 'camera', duration: 1 },
        { type: 'gesture', description: 'Smile', duration: 1 },
      ],
    };

    setActiveRoboticsPlan(testPlan, 'test-endpoint');

    return NextResponse.json({
      ok: true,
      plan: testPlan,
      message: 'Test plan loaded',
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 }
    );
  }
}
