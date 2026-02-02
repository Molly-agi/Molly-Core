'use server';

import { conversationalChat } from '@/ai/flows/conversational-chat';
import { healthCheck } from '@/ai/flows/health-check';
import { voiceCommandToText } from '@/ai/flows/voice-command-to-text';
import { textToTermuxCommand } from '@/ai/flows/text-to-termux-command';


export async function getHealthCheck(text: string) {
  return await healthCheck(text);
}

export async function getVoiceCommand(audioData: string) {
  return await voiceCommandToText(audioData);
}

export async function getConversationalChat(text: string, history: any[]) {
  return await conversationalChat({ text, history });
}

export async function getTextToTermuxCommand(
  prompt: string
) {
  return await textToTermuxCommand(prompt);
}
