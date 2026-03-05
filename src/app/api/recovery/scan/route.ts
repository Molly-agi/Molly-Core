/**
 * @fileOverview Asset Recovery API — Mission Alpha
 *
 * POST /api/recovery/scan — Run recovery scan
 * GET  /api/recovery/scan — Get recovery status
 * PUT  /api/recovery/scan — Set operating mode
 *
 * All endpoints require admin auth (same as other admin endpoints).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  runAssetRecoveryScan,
  getAssetRecoveryStatus,
  setAssetRecoveryMode,
} from '@/ai/flows/asset-recovery';
import { MollyLogger } from '@/ai/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // Scans can take time

const FLOW_NAME = 'api:recovery-scan';

/**
 * POST /api/recovery/scan
 *
 * Run an asset recovery scan.
 *
 * Body: {
 *   names: string[]           — Names to search (required)
 *   priorityStates?: string[] — US states to prioritize
 *   entities?: string[]       — Companies/trusts to search
 *   scanScope?: 'all' | 'us' | 'crypto'
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.names || !Array.isArray(body.names) || body.names.length === 0) {
      return NextResponse.json(
        { error: 'names[] is required and must contain at least one name' },
        { status: 400 }
      );
    }

    MollyLogger.info('Recovery scan requested via API', FLOW_NAME, {
      nameCount: body.names.length,
      scanScope: body.scanScope || 'all',
    });

    const result = await runAssetRecoveryScan({
      names: body.names,
      priorityStates: body.priorityStates,
      entities: body.entities,
      scanScope: body.scanScope || 'all',
    });

    return NextResponse.json(result, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    MollyLogger.error('Recovery scan API error', FLOW_NAME, undefined, error);
    return NextResponse.json(
      { error: 'Recovery scan failed', details: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/recovery/scan
 *
 * Get the current status of the recovery pipeline.
 *
 * Query: ?status=discovered|verified|claim-prepared|...
 */
export async function GET(req: NextRequest) {
  try {
    const statusFilter = req.nextUrl.searchParams.get('status') || undefined;

    const result = await getAssetRecoveryStatus(statusFilter);

    return NextResponse.json(result, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    MollyLogger.error('Recovery status API error', FLOW_NAME, undefined, error);
    return NextResponse.json(
      { error: 'Recovery status failed', details: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/recovery/scan
 *
 * Set the operating mode.
 *
 * Body: { mode: 'discovery-only' | 'discovery-contact' | 'full-operation' | 'paused' }
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const validModes = [
      'discovery-only',
      'discovery-contact',
      'full-operation',
      'paused',
    ];

    if (!body.mode || !validModes.includes(body.mode)) {
      return NextResponse.json(
        {
          error: `mode must be one of: ${validModes.join(', ')}`,
        },
        { status: 400 }
      );
    }

    const result = await setAssetRecoveryMode(body.mode);

    return NextResponse.json(result, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    MollyLogger.error('Recovery mode API error', FLOW_NAME, undefined, error);
    return NextResponse.json(
      { error: 'Set mode failed', details: (error as Error).message },
      { status: 500 }
    );
  }
}
