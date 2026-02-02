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
import { textToScript, type TextToScriptOutput } from '@/ai/flows/text-to-script';

export async function getHealthCheck(text: string) {
  return await healthCheck(text);
}

export async function getVoiceCommand(audioData: string) {
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
  return await conversationalChat({ text, history });
}

export async function getTextToTermuxCommand(prompt: string) {
  return await textToTermuxCommand(prompt);
}

export async function getContextualGuidance(prompt: string) {
  return await contextualGuidance(prompt);
}

export async function getAutonomousSolution(prompt:string): Promise<AutonomousSolutionOutput> {
  return await autonomousSolution(prompt);
}

export async function getTextToScript(prompt: string): Promise<TextToScriptOutput> {
  return await textToScript(prompt);
}
