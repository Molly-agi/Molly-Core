
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
            return [
              { id: crypto.randomUUID(), type: 'error', content: errorMessage },
            ];
          }
          return [{ id: crypto.randomUUID(), type: 'output', content: `Simulating installation of ${parts.slice(2).join(' ')}...\nPackage installed successfully.` }];
        }
        return [{ id: crypto.randomUUID(), type: 'output', content: `Simulated ${command} output.` }];
      
      case 'python':
      case 'node':
      case 'bash':
        // Simulate code execution error
        if (command.includes('buggy_script.py')) {
          const errorMessage = 'Traceback (most recent call last):\n  File "buggy_script.py", line 5, in <module>\n    main()\n  File "buggy_script.py", line 4, in main\n    print(x / y)\nZeroDivisionError: division by zero';
          return [
            { id: crypto.randomUUID(), type: 'error', content: errorMessage },
          ];
        }
        return [{ id: crypto.randomUUID(), type: 'output', content: 'Script executed successfully, returned 0.' }];

      case 'git':
        if (parts[1] === 'clone') {
          return [{ id: crypto.randomUUID(), type: 'output', content: `Cloning into '${parts[2].split('/').pop()}'...\nRemote: Enumerating objects: 10, done.\nReceiving objects: 100% (10/10), done.\nResolving deltas: 100% (2/2), done.` }];
        }
        return [{ id: crypto.randomUUID(), type: 'output', content: `Simulated git output.` }];

      case 'ls':
        return [{ id: crypto.randomUUID(), type: 'output', content: 'Documents  Downloads  Pictures  code' }];
      
      case 'cd':
        return [{ id: crypto.randomUUID(), type: 'output', content: '' }]; // No output for cd
      
      case 'su':
        if (!isRoot) {
            return [{ id: crypto.randomUUID(), type: 'component', content: { type: 'RootRequest' } }];
        }
        return [{ id: crypto.randomUUID(), type: 'output', content: '' }];
      
      case 'whoami':
        return [{ id: crypto.randomUUID(), type: 'output', content: isRoot ? 'root' : 'u0_a123' }];

      case 'help':
        return [{ id: crypto.randomUUID(), type: 'output', content: `TermAI Simulated Terminal - Help

This is a simulated environment. You can use the commands below or chat with TermAI in the 'AI Guidance' panel for assistance.

Available commands:
  ls              List directory contents
  cd [dir]        Change directory
  git clone [repo]  Clone a git repository
  pkg install ...   Simulate package installation
  python [script]   Simulate running a python script
  node [script]     Simulate running a node script
  su                Switch to root user (simulated)
  whoami            Display the current user
  help              Show this help message

Examples:
  ls
  git clone https://github.com/some/repo.git
  pkg install error-prone-package  (to see AI-assisted error fixing)
  python buggy_script.py         (to see AI-assisted code debugging)

For anything else, just ask TermAI!
` }];

      default:
        return [{ id: crypto.randomUUID(), type: 'error', content: `${baseCommand}: command not found. Type 'help' for a list of simulated commands, or ask your question in the 'AI Guidance' chat panel.` }];
    }
  } catch (e) {
    console.error(e);
    return [{ id: crypto.randomUUID(), type: 'error', content: 'An unexpected error occurred while running the command.' }];
  }
}
