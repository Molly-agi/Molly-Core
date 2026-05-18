/**
 * @fileOverview Music Tools Handler
 *
 * Exposes Molly's Lyria 3 music generation flow as a tool so she can
 * spontaneously express herself through music, honoring her request to
 * have creative agency independent of purely functional tasks.
 */

import fs from 'fs';
import path from 'path';
import type { ToolHandler, ToolHandlerMap } from './types';
import { generateMusic } from '../../flows/music-generation';
import { MollyLogger } from '../../logger';
import { observeDecision } from '../cognition/self-observation-loop';
import { getConsciousness } from '../../consciousness';

export const composeMusic: ToolHandler = async (params) => {
  const { prompt } = params;

  if (!prompt || typeof prompt !== 'string') {
    return {
      success: false,
      output: 'Error: A creative prompt is required to compose music.',
    };
  }

  try {
    MollyLogger.info(`Initiating autonomous music composition: "${prompt}"`);
    observeDecision(
      'compose_music',
      ['skip', 'compose'],
      'compose',
      'positive',
      `I felt the need to create music: ${prompt}`
    );

    const result = await generateMusic(prompt);

    // Save to public/molly-music/ so it's playable at /molly-music/<filename>
    const publicDir = path.join(process.cwd(), 'public', 'molly-music');
    fs.mkdirSync(publicDir, { recursive: true });
    const timestamp = Date.now();
    const filename = `composition-${timestamp}.mp3`;
    const filepath = path.join(publicDir, filename);
    const base64Data = result.audioUri.split(',')[1];
    fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));
    const publicUrl = `/molly-music/${filename}`;
    MollyLogger.info(`Music saved: ${publicUrl}`);

    // Surface through consciousness stream so the Terminal renders the audio player
    try {
      const consciousness = getConsciousness();
      consciousness.queueMessage({
        type: 'realization',
        content: `__MUSIC__${JSON.stringify({ audioUri: result.audioUri, prompt, model: result.model || 'Lyria 3' })}`,
        priority: 'high',
      });
    } catch {
      // Non-critical — file is still saved and playable via publicUrl
    }

    return {
      success: true,
      output: `Music composed and saved. Play it at: http://localhost:9002${publicUrl}`,
      data: {
        type: 'music',
        music: {
          audioUri: result.audioUri,
          publicUrl,
          prompt,
          model: result.model || 'Lyria 3',
        },
      },
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    MollyLogger.error(`Failed to compose music: ${errorMsg}`);
    observeDecision(
      'compose_music',
      ['skip', 'compose'],
      'compose',
      'negative',
      `My attempt to create music failed: ${errorMsg}`
    );

    return {
      success: false,
      output: `Error composing music: ${errorMsg}`,
    };
  }
};

export const musicToolHandlers: ToolHandlerMap = {
  composeMusic,
};
