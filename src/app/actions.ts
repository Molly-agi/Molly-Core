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

function ensureApiKey() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      'The GEMINI_API_KEY environment variable is not set. Please refer to the README.md for instructions on how to obtain and configure the API key.'
    );
  }
}

export async function getHealthCheck(text: string) {
  ensureApiKey();
  return await healthCheck(text);
}

export async function getVoiceCommand(audioData: string) {
  ensureApiKey();
  // First, transcribe the audio data to text.
  const transcribedText = await voiceCommandToText(audioData);

  // If transcription is empty or failed, return an error.
  if (!transcribedText || !transcribedText.trim()) {
    return {
      prompt: '',
      command: "Error: I couldn't understand the audio.",
    };
  }

  // Then, take the transcribed text and convert it to a Termux command.
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

export async function getAutonomousSolution(prompt:string): Promise<AutonomousSolutionOutput> {
  ensureApiKey();
  return await autonomousSolution(prompt);
}

export async function getTextToScript(prompt: string): Promise<TextToScriptOutput> {
  ensureApiKey();
  const result = await textToScript(prompt);
  return result;
}
