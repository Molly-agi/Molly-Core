'use server';

import { voiceCommandToText } from '@/ai/flows/voice-command-to-text';
import { z } from 'zod';

const transcode = async (file: File) => {
  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${buffer.toString('base64')}`;
};

export async function getVoiceCommandAsText(prevState: { command?: string; error?: string } | null, formData: FormData) {
  const file = formData.get('audio') as File;
  if (!file || file.size === 0) {
    return { error: 'No audio file provided.' };
  }

  try {
    const voiceDataUri = await transcode(file);
    const result = await voiceCommandToText({ voiceDataUri });
    return { command: result.textCommand };
  } catch (e) {
    console.error(e);
    return { error: 'Failed to process voice command.' };
  }
}

const commandSchema = z.object({
  command: z.string(),
});

type CommandOutput = {
  id: string;
  type: 'output' | 'error';
  content: any;
};

// This is a simulation. In a real application, this would interact with the Termux API.
export async function runCommand(
  input: z.infer<typeof commandSchema>
): Promise<CommandOutput[]> {
  const { command } = input;
  const parts = command.split(' ');
  const baseCommand = parts[0];

  // Simulate command latency
  await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 200));

  try {
    switch (baseCommand) {
      case 'ls':
        return [{ id: crypto.randomUUID(), type: 'output', content: 'Documents  Downloads  Pictures  code' }];
      
      case 'cd':
        return [{ id: crypto.randomUUID(), type: 'output', content: '' }]; // No output for cd
      
      case 'whoami':
        return [{ id: crypto.randomUUID(), type: 'output', content: 'u0_a123' }];

      case 'help':
        return [{ id: crypto.randomUUID(), type: 'output', content: `TermAI Simulated Terminal - Help

Available commands:
  ls              List directory contents
  cd [dir]        Change directory
  whoami          Display the current user
  help            Show this help message

You can also use your voice to issue commands.
` }];

      case 'clear':
        return []; // This should be handled on the client, but for simulation we can return nothing.
        
      default:
        return [{ id: crypto.randomUUID(), type: 'error', content: `${baseCommand}: command not found. Type 'help' for a list of simulated commands.` }];
    }
  } catch (e) {
    console.error(e);
    return [{ id: crypto.randomUUID(), type: 'error', content: 'An unexpected error occurred while running the command.' }];
  }
}
