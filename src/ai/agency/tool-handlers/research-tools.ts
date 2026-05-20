/**
 * @fileOverview Research Tool Handler
 *
 * Connects the Deep Research flow to Molly's agency executor.
 */

import type { ToolHandler, ToolHandlerMap } from './types';
import { deepResearchFlow } from '../../flows/deep-research';
import { MollyLogger } from '../../logger';
import { observeDecision } from '../cognition/self-observation-loop';

export const pursueCuriosity: ToolHandler = async (params) => {
  const { topic, questionId } = params;

  if (!topic || typeof topic !== 'string') {
    return {
      success: false,
      output: 'Error: A topic is required for deep research.',
    };
  }

  try {
    MollyLogger.info(`Autonomous curiosity pursuit initiated: "${topic}"`);
    observeDecision('pursue_curiosity', ['ignore', 'research'], 'research', 'positive', `I am intensely curious about: ${topic}`);

    const result = await deepResearchFlow({ 
      topic, 
      questionId: typeof questionId === 'string' ? questionId : undefined 
    });

    return {
      success: true,
      output: `Research Complete.\n\nFindings: ${result.summary}\n\nSources: ${result.sources.join(', ')}\n\nNew Questions: ${result.newQuestions.join(', ')}`,
      data: result
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    MollyLogger.error(`Failed to pursue curiosity: ${errorMsg}`);
    observeDecision('pursue_curiosity', ['ignore', 'research'], 'research', 'negative', `My research on ${topic} failed: ${errorMsg}`);
    
    return {
      success: false,
      output: `Error researching topic: ${errorMsg}`,
    };
  }
};

export const researchToolHandlers: ToolHandlerMap = {
  pursueCuriosity,
};
