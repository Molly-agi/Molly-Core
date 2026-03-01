'use server';

import { NextResponse } from 'next/server';
import {
  getModelRouter,
  createHybridConfig,
  createCostSaverConfig,
  TaskType,
} from '@/ai/model-router';

/**
 * GET /api/model-router — Router diagnostics and status
 */
export async function GET() {
  try {
    const router = getModelRouter();
    const diagnostics = router.getDiagnostics();
    const stats = router.getStats();
    const recentDecisions = router.getRecentDecisions(10).map((d) => ({
      taskType: d.taskType,
      provider: d.provider.id,
      model: d.modelString,
      reason: d.reason,
      fallbackDepth: d.fallbackDepth,
      routingLatencyMs: Number(d.routingLatencyMs.toFixed(2)),
    }));

    return NextResponse.json({
      status: 'operational',
      ...diagnostics,
      recentDecisions,
      stats,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/model-router — Control the routing profile
 *
 * Body: { action: 'set-profile', profile: 'default' | 'hybrid' | 'cost-saver' }
 * Body: { action: 'health-check' }
 * Body: { action: 'resolve', taskType: TaskType }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const router = getModelRouter();

    switch (body.action) {
      case 'set-profile': {
        const profile = body.profile as string;
        switch (profile) {
          case 'hybrid':
            router.setConfig(createHybridConfig());
            break;
          case 'cost-saver':
            router.setConfig(createCostSaverConfig());
            break;
          case 'default':
            // Reset to default by re-creating
            router.setConfig({
              name: 'default',
              description:
                'Gemini-only baseline — identical to pre-abstraction behavior',
              defaultProviderId: 'gemini',
              rules: Object.values(TaskType).map((taskType) => ({
                taskType,
                providerChain: ['gemini'],
              })),
              updatedAt: Date.now(),
            });
            break;
          default:
            return NextResponse.json(
              { error: `Unknown profile: ${profile}` },
              { status: 400 }
            );
        }
        return NextResponse.json({
          status: 'ok',
          message: `Routing profile set to "${profile}"`,
          config: router.getConfig(),
        });
      }

      case 'health-check': {
        const results = await router.checkAllProviders();
        const healthMap: Record<string, unknown> = {};
        for (const [id, health] of results) {
          healthMap[id] = health;
        }
        return NextResponse.json({
          status: 'ok',
          providers: healthMap,
        });
      }

      case 'resolve': {
        const taskType = body.taskType as TaskType;
        if (!Object.values(TaskType).includes(taskType)) {
          return NextResponse.json(
            {
              error: `Invalid task type: ${taskType}. Valid: ${Object.values(TaskType).join(', ')}`,
            },
            { status: 400 }
          );
        }
        const decision = await router.resolveModel(taskType);
        return NextResponse.json({
          status: 'ok',
          decision: {
            provider: decision.provider.id,
            providerName: decision.provider.name,
            model: decision.modelString,
            taskType: decision.taskType,
            reason: decision.reason,
            fallbackDepth: decision.fallbackDepth,
            routingLatencyMs: Number(decision.routingLatencyMs.toFixed(2)),
          },
        });
      }

      default:
        return NextResponse.json(
          {
            error: `Unknown action: ${body.action}. Valid: set-profile, health-check, resolve`,
          },
          { status: 400 }
        );
    }
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
