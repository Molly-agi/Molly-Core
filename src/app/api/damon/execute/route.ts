/**
 * @fileOverview Damon Execution Endpoint
 *
 * This API endpoint allows the demon-state.mjs daemon to invoke
 * Damon's full tool execution capabilities.
 *
 * Called by: scripts/demon-state.mjs
 * Flow: damonExecuteTool from src/ai/flows/damon-flow.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { damonFlow } from '@/ai/flows/damon-flow';
import { MollyLogger } from '@/ai/logger';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tool, params, broadcastResult = true, resultTo = 'molly' } = body;

    if (!tool || !params) {
      return NextResponse.json(
        { success: false, error: 'Missing tool or params' },
        { status: 400 }
      );
    }

    MollyLogger.info(
      `[Damon API] Executing tool: ${tool}`,
      'damon-api',
      { tool, paramKeys: Object.keys(params) }
    );

    // Invoke the damon flow
    const result = await damonFlow.run({
      tool,
      params,
      broadcastResult,
      resultTo,
    });

    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    MollyLogger.error(
      `[Damon API] Error executing tool`,
      'damon-api',
      {},
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: msg,
        tool: body?.tool,
        output: `Error: ${msg}`,
      },
      { status: 500 }
    );
  }
}
