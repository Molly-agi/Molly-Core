/**
 * @fileOverview Memory Evolution Initialization API
 * Server-side endpoint for initializing the memory system
 *
 * Note: This endpoint doesn't require authentication as it only
 * initializes the embedding provider, not user-specific data
 */

import { NextRequest, NextResponse } from 'next/server';
import { initializeMemoryEvolution } from '@/ai/memory-evolution-init';
import { MollyLogger } from '@/ai/logger';

export const dynamic = 'force-dynamic';

/**
 * POST /api/memory/init - Initialize memory evolution system
 * No authentication required - initializes global embedding provider only
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(_request: NextRequest) {
  try {
    MollyLogger.info('Memory initialization requested', 'api/memory/init');

    let success = false;
    let message = 'Unknown error during initialization';

    try {
      success = await initializeMemoryEvolution();

      if (success) {
        message = 'Memory evolution system initialized';
      } else {
        message = 'Memory evolution initialization incomplete';
      }
    } catch (initError) {
      MollyLogger.error(
        'Error during initializeMemoryEvolution call',
        'api/memory/init',
        {},
        initError
      );
      message =
        initError instanceof Error
          ? initError.message
          : 'Initialization failed';
      success = false;
    }

    // Always return valid JSON
    const statusCode = success ? 200 : 500;
    return NextResponse.json(
      {
        success,
        message,
      },
      { status: statusCode }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    MollyLogger.error(
      'Unexpected error in memory init route',
      'api/memory/init',
      {},
      error
    );

    // Always return valid JSON, even in case of unexpected error
    return NextResponse.json(
      {
        success: false,
        message: 'Initialization failed',
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
