/**
 * @fileOverview Voice Interaction API Endpoint
 *
 * Enables real-time voice conversation with Molly.
 * Mobile-friendly endpoint for voice commands.
 */

import { NextRequest, NextResponse } from 'next/server';
import { processVoiceCommand } from '@/ai/tools/voice-command-processor';
import { MollyLogger } from '@/ai/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface VoiceInteractRequest {
  audioData: string;
  userId?: string;
  sessionId?: string;
  synthesizeSpeech?: boolean;
  hardwareState?: {
    temperature?: number;
    batteryLevel?: number;
    cpuUsage?: number;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: VoiceInteractRequest = await request.json();

    // Validate audio data
    if (!body.audioData || !body.audioData.startsWith('data:')) {
      return NextResponse.json(
        { error: 'Invalid audio data format. Expected data URI.' },
        { status: 400 }
      );
    }

    // Default user ID for testing
    const userId = body.userId || 'test-user';
    const sessionId = body.sessionId || `session-${Date.now()}`;

    MollyLogger.info(
      'Voice interaction request received',
      'voice-interact-api',
      { userId, sessionId, hasAudio: !!body.audioData }
    );

    // Process voice command
    const result = await processVoiceCommand(
      body.audioData,
      {
        userId,
        sessionId,
        hardwareState: body.hardwareState,
      },
      body.synthesizeSpeech !== false
    );

    MollyLogger.info('Voice interaction completed', 'voice-interact-api', {
      userId,
      sessionId,
      intent: result.intent,
      recognized: result.recognized,
    });

    return NextResponse.json({
      success: true,
      result: {
        recognized: result.recognized,
        intent: result.intent,
        transcription: result.transcription,
        response: result.response,
        audioResponse: result.audioResponse,
        metadata: result.metadata,
      },
    });
  } catch (error) {
    MollyLogger.error(
      'Voice interaction API error',
      'voice-interact-api',
      {},
      error instanceof Error ? error : new Error(String(error))
    );

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: 'online',
    endpoint: 'voice-interact',
    message: 'Molly is ready to listen',
  });
}
