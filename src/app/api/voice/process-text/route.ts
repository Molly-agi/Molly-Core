/**
 * Voice text processing endpoint
 * Takes already-transcribed text from Web Speech API and sends to Molly
 */
import { NextRequest, NextResponse } from 'next/server';
import { getConversationalChat } from '@/app/actions';
import { MollyLogger } from '@/ai/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transcription, userId, lastResponse } = body;

    if (!transcription || typeof transcription !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing transcription' },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Missing userId' },
        { status: 400 }
      );
    }

    MollyLogger.info('Processing voice text', 'voice/process-text', {
      userId,
      transcriptionLength: transcription.length,
    });

    // Send to Molly's conversational flow
    const response = await getConversationalChat(
      transcription,
      lastResponse ? [{ role: 'bot' as const, content: lastResponse }] : [],
      undefined,
      userId
    );

    return NextResponse.json({
      success: true,
      response: response.response,
      intent: 'conversation',
      recognized: true,
      transcription,
    });
  } catch (error) {
    MollyLogger.error(
      'Voice text processing failed',
      'voice/process-text',
      {},
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Processing failed',
      },
      { status: 500 }
    );
  }
}
