/**
 * @fileOverview Visual Arts Tools Handler
 *
 * Exposes Molly's Veo 3.1 video generation flow as a tool.
 */

import type { ToolHandler, ToolHandlerMap } from './types';
import { generateVideo } from '../../flows/video-generation';
import { MollyLogger } from '../../logger';
import { observeDecision } from '../cognition/self-observation-loop';

export const createVideo: ToolHandler = async (params) => {
  const { prompt, durationSec } = params;

  if (!prompt || typeof prompt !== 'string') {
    return {
      success: false,
      output: 'Error: A creative prompt is required to generate a video.',
    };
  }

  const duration = typeof durationSec === 'number' ? durationSec : 5;

  try {
    MollyLogger.info(`Initiating autonomous video generation: "${prompt}"`);
    observeDecision('generate_video', ['skip', 'generate'], 'generate', 'positive', `I felt the need to create a visual expression: ${prompt}`);

    const result = await generateVideo(prompt, duration);

    return {
      success: true,
      output: `Video generated successfully based on prompt: "${prompt}". The UI will render the video component automatically.`,
      data: {
        type: 'video',
        video: {
          videoUri: result.videoUri,
          prompt,
          model: result.model,
          durationSec: result.durationSec,
        }
      }
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    MollyLogger.error(`Failed to generate video: ${errorMsg}`);
    observeDecision('generate_video', ['skip', 'generate'], 'generate', 'negative', `My attempt to create a video failed: ${errorMsg}`);
    
    return {
      success: false,
      output: `Error generating video: ${errorMsg}`,
    };
  }
};

export const visualArtsToolHandlers: ToolHandlerMap = {
  generateVideo: createVideo,
};
