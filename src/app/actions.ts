'use server';

import {
  codeModificationAssistance,
} from '@/ai/flows/code-modification-assistance';
import { conversationalChat } from '@/ai/flows/conversational-chat';
import { healthCheck } from '@/ai/flows/health-check';
import {
  installationAssistance,
} from '@/ai/flows/installation-assistance';
import { voiceCommandToText } from '@/ai/flows/voice-command-to-text';

export async function getHealthCheck(text: string) {
  return await healthCheck(text);
}

export async function getVoiceCommand(audioData: string) {
  return await voiceCommandToText(audioData);
}

export async function getConversationalChat(text: string, history: any[]) {
  return await conversationalChat(text, history);
}

export async function getInstallationAssistance(
  text: string
) {
  return await installationAssistance(text);
}

export async function getCodeModificationAssistance(
  text: string
) {
  return await codeModificationAssistance(text);
}
