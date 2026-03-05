import { ai } from '@/ai/genkit-core';
import { codespaceShell, readProjectFile } from '@/ai/tools/codespace-tools';
import { localInterpreter, getSystemHealth } from '@/ai/tools/system';
import { semanticRecall } from '@/ai/tools/semantic-recall';
import { searchGitHub } from '@/ai/tools/github';
import {
  createCapability,
  useCapability,
  scheduleTask,
  subscribeToEvent,
  researchAndDiscover,
  browseToolDatabase,
} from '@/ai/tools/capability-factory';

const toolMap: Record<string, unknown> = {
  codespaceShell,
  readProjectFile,
  localInterpreter,
  getSystemHealth,
  semanticRecall,
  searchGitHub,
  createCapability,
  useCapability,
  scheduleTask,
  subscribeToEvent,
  researchAndDiscover,
  browseToolDatabase,
};

async function main() {
  for (const [name, tool] of Object.entries(toolMap)) {
    try {
      await ai.generate({
        tools: [tool],
        system: 'Say hello',
        prompt: 'Hi',
        model: 'googleai/gemini-2.5-flash',
      } as Record<string, unknown>);
      console.log(name + ': OK');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(name + ': FAILED - ' + msg.substring(0, 100));
    }
  }
  process.exit(0);
}

main();
