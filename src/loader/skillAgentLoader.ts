// src/loader/skillAgentLoader.ts
// Loader for markdown-based skills and agents. Scans directories, parses frontmatter, builds registry.
import fs from 'fs/promises';
import path from 'path';
import { parseFrontmatter } from '../utils/parseFrontmatter';

export interface SkillMeta {
  name: string;
  description: string;
  filePath: string;
  frontmatter: Record<string, unknown>;
  diagnostics?: string[];
}

export interface AgentMeta {
  name: string;
  description: string;
  filePath: string;
  frontmatter: Record<string, unknown>;
  diagnostics?: string[];
}

export interface Registry {
  skills: Map<string, SkillMeta>;
  agents: Map<string, AgentMeta>;
  diagnostics: Array<{
    filePath: string;
    type: 'skill' | 'agent';
    error: string;
    stack?: string;
  }>;
}

async function scanMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await scanMarkdownFiles(fullPath)));
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.md') &&
      !entry.name.startsWith('_')
    ) {
      // Underscore-prefixed files (e.g. _scope-guard.md) are shared prompt
      // fragments, not standalone skills/agents. Skip them.
      files.push(fullPath);
    }
  }
  return files;
}

// Skill convention: real skills are SKILL.md inside their own folder. The
// commands/ subtree uses bare .md filenames instead. Everything else under
// the skills root (READMEs, mappings, contrib docs from upstream cybersec
// repo) is supporting documentation and must not be parsed as a skill.
async function scanSkillFiles(skillsDir: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string, underCommands: boolean): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath, underCommands || entry.name === 'commands');
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        if (entry.name.startsWith('_')) continue;
        if (entry.name === 'SKILL.md' || underCommands) {
          files.push(fullPath);
        }
      }
    }
  }
  await walk(skillsDir, false);
  return files;
}

export async function loadRegistry(
  skillsDir: string,
  agentsDir: string
): Promise<Registry> {
  const skills = new Map<string, SkillMeta>();
  const agents = new Map<string, AgentMeta>();
  const diagnostics: Array<{
    filePath: string;
    type: 'skill' | 'agent';
    error: string;
    stack?: string;
  }> = [];

  // Load skills
  const skillFiles = await scanSkillFiles(skillsDir).catch(() => []);
  for (const file of skillFiles) {
    let content = '';
    try {
      content = await fs.readFile(file, 'utf8');
      const { frontmatter } = parseFrontmatter(content);
      if (frontmatter.name && frontmatter.description) {
        skills.set(frontmatter.name, {
          name: frontmatter.name,
          description: frontmatter.description,
          filePath: file,
          frontmatter,
          diagnostics: [],
        });
      } else {
        diagnostics.push({
          filePath: file,
          type: 'skill',
          error: 'Missing required frontmatter fields (name, description)',
        });
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        diagnostics.push({
          filePath: file,
          type: 'skill',
          error: err.message || 'Failed to read or parse file',
          stack: err.stack,
        });
      } else {
        diagnostics.push({
          filePath: file,
          type: 'skill',
          error: 'Failed to read or parse file',
        });
      }
    }
  }

  // Load agents
  const agentFiles = await scanMarkdownFiles(agentsDir).catch(() => []);
  for (const file of agentFiles) {
    let content = '';
    try {
      content = await fs.readFile(file, 'utf8');
      const { frontmatter } = parseFrontmatter(content);
      if (frontmatter.name && frontmatter.description) {
        agents.set(frontmatter.name, {
          name: frontmatter.name,
          description: frontmatter.description,
          filePath: file,
          frontmatter,
          diagnostics: [],
        });
      } else {
        diagnostics.push({
          filePath: file,
          type: 'agent',
          error: 'Missing required frontmatter fields (name, description)',
        });
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        diagnostics.push({
          filePath: file,
          type: 'agent',
          error: err.message || 'Failed to read or parse file',
          stack: err.stack,
        });
      } else {
        diagnostics.push({
          filePath: file,
          type: 'agent',
          error: 'Failed to read or parse file',
        });
      }
    }
  }

  return { skills, agents, diagnostics };
}
