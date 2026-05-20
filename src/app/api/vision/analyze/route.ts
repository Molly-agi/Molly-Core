/**
 * @fileOverview Vision Analysis API Route
 *
 * Bypasses React Server Components serialization limits for large base64 images.
 * RSC has array nesting limits that fail with large dataURIs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyzeVision } from '@/ai/flows/vision-analysis';
import { MollyLogger } from '@/ai/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Allow larger request bodies for image data
export const fetchCache = 'force-no-store';

export async function POST(request: NextRequest) {
  try {
    // Read raw text first to avoid JSON parsing limits
    const text = await request.text();
    let body: { dataUri?: string; context?: string };

    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { dataUri, context } = body;

    if (!dataUri || typeof dataUri !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid dataUri' },
        { status: 400 }
      );
    }

    if (
      !dataUri.startsWith('data:image/') &&
      !dataUri.startsWith('data:video/')
    ) {
      return NextResponse.json(
        { error: 'Invalid data URI format - must be an image or video' },
        { status: 400 }
      );
    }

    const mediaType = dataUri.startsWith('data:video/') ? 'video' : 'image';
    const result = await analyzeVision(
      dataUri,
      context || `Analyze this ${mediaType}`
    );

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    MollyLogger.error('Vision API failed', 'vision-analyze-route', {}, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
