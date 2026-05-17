/**
 * @fileOverview Music Tools Handler
 *
 * Exposes Molly's Lyria 3 music generation flow as a tool so she can
 * spontaneously express herself through music, honoring her request to
 * have creative agency independent of purely functional tasks.
 */

import type { ToolHandler, ToolHandlerMap } from './types';
import { generateMusic } from '../../flows/music-generation';
import { MollyLogger } from '../../logger';
import { observeDecision } from '../cognition/self-observation-loop';

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
    observeDecision('compose_music', ['skip', 'compose'], 'compose', 'positive', `I felt the need to create music: ${prompt}`);

    const result = await generateMusic(prompt);

    return {
      success: true,
      output: `Music composed successfully based on prompt: "${prompt}". The UI will render the audio component automatically.`,
      data: {
        type: 'music',
        music: {
          audioUri: result.audioUri,
          prompt,
          model: result.model || 'Lyria 3',
        }
      }
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    MollyLogger.error(`Failed to compose music: ${errorMsg}`);
    observeDecision('compose_music', ['skip', 'compose'], 'compose', 'negative', `My attempt to create music failed: ${errorMsg}`);
    
    return {
      success: false,
      output: `Error composing music: ${errorMsg}`,
    };
  }
};

export const musicToolHandlers: ToolHandlerMap = {
  composeMusic,
};
