
'use server';

import { voiceCommandToText } from '@/ai/flows/voice-command-to-text';
import { installationAssistance } from '@/ai/flows/installation-assistance';
import { suggestCodeFixes } from '@/ai/flows/code-modification-assistance';
import { getContextualGuidance } from '@/ai/flows/contextual-ai-guidance';
import { z } from 'zod';
import { generateId } from 'genkit';

const transcode = async (file: File) => {
  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${buffer.toString('base64')}`;
};

export async function getVoiceCommandAsText(formData: FormData) {
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
  isRoot: z.boolean().optional(),
});

type CommandOutput = {
  id: string;
  type: 'output' | 'error' | 'component';
  content: any;
};

// This is a simulation. In a real application, this would interact with the Termux API.
export async function runCommand(
  input: z.infer<typeof commandSchema>
): Promise<CommandOutput[]> {
  const { command, isRoot } = input;
  const parts = command.split(' ');
  const baseCommand = parts[0];

  // Simulate command latency
  await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 200));

  try {
    switch (baseCommand) {
      case 'pkg':
      case 'apt':
      case 'apt-get':
        if (parts[1] === 'install' || parts[1] === 'update') {
          // Simulate installation error
          if (command.includes('error-prone-package')) {
            const errorMessage = `E: Unable to locate package error-prone-package`;
            const assistance = await installationAssistance({ command, errorMessage });
            return [
              { id: generateId(), type: 'error', content: errorMessage },
              { id: generateId(), type: 'component', content: { type: 'InstallAssist', data: assistance } },
            ];
          }
          return [{ id: generateId(), type: 'output', content: `Simulating installation of ${parts.slice(2).join(' ')}...\nPackage installed successfully.` }];
        }
        return [{ id: generateId(), type: 'output', content: `Simulated ${command} output.` }];
      
      case 'python':
      case 'node':
      case 'bash':
        // Simulate code execution error
        if (command.includes('buggy_script.py')) {
          const codeSnippet = `
def main():
  x = 10
  y = 0
  print(x / y) # Division by zero
main()
          `;
          const errorMessage = 'Traceback (most recent call last):\n  File "buggy_script.py", line 5, in <module>\n    main()\n  File "buggy_script.py", line 4, in main\n    print(x / y)\nZeroDivisionError: division by zero';
          const fix = await suggestCodeFixes({ command, errorMessage, codeSnippet, context: "User is trying to run a python script." });
          return [
            { id: generateId(), type: 'error', content: errorMessage },
            { id: generateId(), type: 'component', content: { type: 'CodeFix', data: fix } },
          ];
        }
        return [{ id: generateId(), type: 'output', content: 'Script executed successfully, returned 0.' }];

      case 'git':
        if (parts[1] === 'clone') {
          return [{ id: generateId(), type: 'output', content: `Cloning into '${parts[2].split('/').pop()}'...\nRemote: Enumerating objects: 10, done.\nReceiving objects: 100% (10/10), done.\nResolving deltas: 100% (2/2), done.` }];
        }
        return [{ id: generateId(), type: 'output', content: `Simulated git output.` }];

      case 'ls':
        return [{ id: generateId(), type: 'output', content: 'Documents  Downloads  Pictures  code' }];
      
      case 'cd':
        return [{ id: generateId(), type: 'output', content: '' }]; // No output for cd
      
      case 'su':
        if (!isRoot) {
            return [{ id: generateId(), type: 'component', content: { type: 'RootRequest' } }];
        }
        return [{ id: generateId(), type: 'output', content: '' }];
      
      case 'whoami':
        return [{ id: generateId(), type: 'output', content: isRoot ? 'root' : 'u0_a123' }];

      case 'help':
        return [{ id: generateId(), type: 'output', content: 'Available commands: ls, cd, git, pkg, python, su, whoami, help. Try asking the AI for guidance!' }];

      default:
        return [{ id: generateId(), type: 'error', content: `${baseCommand}: command not found. Type 'help' for a list of simulated commands.` }];
    }
  } catch (e) {
    console.error(e);
    return [{ id: generateId(), type: 'error', content: 'An unexpected error occurred while running the command.' }];
  }
}

export async function getGuidance(query: string, context: string) {
    try {
        const result = await getContextualGuidance({ query, termuxContext: context });
        return { suggestion: result };
    } catch (e) {
        console.error(e);
        return { error: 'Failed to get guidance from AI.' };
    }
}
