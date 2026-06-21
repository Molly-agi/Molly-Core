import { NextRequest } from 'next/server';
import path from 'path';
import { loadRegistry } from '@/loader/skillAgentLoader';

const skillsDir = path.resolve(process.cwd(), 'src/skills/registry/skills');
const agentsDir = path.resolve(process.cwd(), 'src/skills/registry/agents');

export async function GET(_request: NextRequest) {
  try {
    const registry = await loadRegistry(skillsDir, agentsDir);
    return Response.json({
      skills: Array.from(registry.skills.values()),
      agents: Array.from(registry.agents.values()),
      diagnostics: registry.diagnostics,
      error: null,
    });
  } catch (error: unknown) {
    let message = 'Unknown error loading skills/agents';
    if (error instanceof Error) message = error.message;
    return Response.json(
      {
        skills: [],
        agents: [],
        diagnostics: [],
        error: message,
      },
      { status: 500 }
    );
  }
}
