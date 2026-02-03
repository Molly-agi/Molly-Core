'use server';

import { conversationalChat } from '@/ai/flows/conversational-chat';
import { healthCheck } from '@/ai/flows/health-check';
import { voiceCommandToText } from '@/ai/flows/voice-command-to-text';
import { textToTermuxCommand } from '@/ai/flows/text-to-termux-command';
import { contextualGuidance } from '@/ai/flows/contextual-ai-guidance';
import {
  autonomousSolution,
  type AutonomousSolutionOutput,
} from '@/ai/flows/autonomous-solution';
import { textToScript } from '@/ai/flows/text-to-script';
import type { TextToScriptOutput } from '@/ai/flows/text-to-script';
import { visionaryCoach } from '@/ai/flows/visionary-coach';
import { textToSpeech } from '@/ai/flows/text-to-speech';
import { introspectionFlow } from '@/ai/flows/introspection';

/**
 * Hardened gatekeeper to ensure environment stability.
 */
function ensureApiKey() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      'Molly: Critical Failure. GEMINI_API_KEY is not configured in the environment.'
    );
  }
}

export async function getHealthCheck(text: string) {
  ensureApiKey();
  return await healthCheck(text);
}

export async function getVoiceCommand(audioData: string) {
  ensureApiKey();
  const transcribedText = await voiceCommandToText(audioData);
  if (!transcribedText || !transcribedText.trim()) {
    return {
      prompt: '',
      command: "Error: No audible input detected.",
    };
  }
  const command = await textToTermuxCommand(transcribedText);
  return { prompt: transcribedText, command };
}

export async function getConversationalChat(text: string, history: any[]) {
  ensureApiKey();
  return await conversationalChat({ text, history });
}

export async function getTextToTermuxCommand(prompt: string) {
  ensureApiKey();
  return await textToTermuxCommand(prompt);
}

export async function getContextualGuidance(prompt: string) {
  ensureApiKey();
  return await contextualGuidance(prompt);
}

export async function getAutonomousSolution(prompt: string, userId: string): Promise<AutonomousSolutionOutput> {
  ensureApiKey();
  return await autonomousSolution(prompt, userId);
}

export async function getTextToScript(prompt: string): Promise<TextToScriptOutput> {
  ensureApiKey();
  return await textToScript(prompt);
}

export async function getVisionaryCoach(progress: string, stage: string, concern?: string) {
  ensureApiKey();
  return await visionaryCoach(progress, stage, concern);
}

export async function getMollyVoice(text: string) {
  ensureApiKey();
  return await textToSpeech(text);
}

export async function runIntrospection(pastLessons: any[], hardwareContext: string) {
  ensureApiKey();
  return await introspectionFlow({ pastLessons, hardwareContext });
}
