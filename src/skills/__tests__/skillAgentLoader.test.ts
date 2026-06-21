// src/skills/__tests__/skillAgentLoader.test.ts
// Tests for skillAgentLoader loader/registry
import { loadRegistry } from '../../loader/skillAgentLoader';
import fs from 'fs/promises';
import path from 'path';

describe('skillAgentLoader', () => {
  const skillsDir = path.join(__dirname, '../fixtures/skills');
  const agentsDir = path.join(__dirname, '../fixtures/agents');

  beforeEach(async () => {
    // Setup: create fixture directories and files before each test
    await fs.mkdir(skillsDir + '/summarize', { recursive: true });
    await fs.mkdir(agentsDir + '/research', { recursive: true });
    await fs.writeFile(
      path.join(skillsDir, 'summarize/SKILL.md'),
      `---\nname: summarize\ndescription: Summarize text\n---\nBody...`
    );
    await fs.writeFile(
      path.join(agentsDir, 'research/AGENT.md'),
      `---\nname: research\ndescription: Research agent\n---\nBody...`
    );
  });

  afterEach(async () => {
    // Cleanup after each test
    await fs.rm(path.join(__dirname, '../fixtures'), {
      recursive: true,
      force: true,
    });
  });

  it('loads skills and agents from markdown', async () => {
    const registry = await loadRegistry(skillsDir, agentsDir);
    expect(registry.skills.has('summarize')).toBe(true);
    expect(registry.agents.has('research')).toBe(true);
    expect(registry.skills.get('summarize')?.description).toBe(
      'Summarize text'
    );
    expect(registry.agents.get('research')?.description).toBe('Research agent');
  });

  it('collects diagnostics for missing frontmatter', async () => {
    // Write a broken skill file (missing name) — must use SKILL.md convention
    await fs.mkdir(path.join(skillsDir, 'broken'), { recursive: true });
    await fs.writeFile(
      path.join(skillsDir, 'broken/SKILL.md'),
      `---\ndescription: Broken\n---\nNo name field.`
    );
    const registry = await loadRegistry(skillsDir, agentsDir);
    expect(registry.diagnostics.length).toBeGreaterThan(0);
    expect(registry.diagnostics[0].error).toMatch(
      /Missing required frontmatter/
    );
    expect(registry.diagnostics[0].filePath).toMatch(/broken\/SKILL\.md/);
  });

  it('collects diagnostics for parse errors', async () => {
    // Write a skill file with invalid YAML — must use SKILL.md convention
    await fs.mkdir(path.join(skillsDir, 'badyaml'), { recursive: true });
    await fs.writeFile(
      path.join(skillsDir, 'badyaml/SKILL.md'),
      `---\nname: badyaml\ndescription: Bad YAML\n: : :\n---\nBody...`
    );
    const registry = await loadRegistry(skillsDir, agentsDir);
    // Should still collect a diagnostic for parse error
    expect(
      registry.diagnostics.some((d) => d.filePath.endsWith('SKILL.md'))
    ).toBe(true);
  });

  it('ignores non-skill markdown files (READMEs, contrib docs)', async () => {
    // Upstream skill repos ship README/CONTRIBUTING/mapping docs alongside
    // real SKILL.md files. The loader must not treat them as skill candidates.
    await fs.writeFile(
      path.join(skillsDir, 'README.md'),
      `# Upstream readme\n\nNo frontmatter, not a skill.`
    );
    await fs.mkdir(path.join(skillsDir, 'mappings'), { recursive: true });
    await fs.writeFile(
      path.join(skillsDir, 'mappings/owasp.md'),
      `# OWASP mapping\n\nReference doc, not a skill.`
    );
    const registry = await loadRegistry(skillsDir, agentsDir);
    expect(registry.skills.has('summarize')).toBe(true);
    expect(
      registry.diagnostics.some((d) => d.filePath.endsWith('README.md'))
    ).toBe(false);
    expect(
      registry.diagnostics.some((d) => d.filePath.endsWith('owasp.md'))
    ).toBe(false);
  });

  it('loads commands/ subtree as bare .md files', async () => {
    // commands/ uses a different convention: bare filename, not SKILL.md.
    await fs.mkdir(path.join(skillsDir, 'commands'), { recursive: true });
    await fs.writeFile(
      path.join(skillsDir, 'commands/recommend.md'),
      `---\nname: recommend\ndescription: Recommend an agent\n---\nBody...`
    );
    const registry = await loadRegistry(skillsDir, agentsDir);
    expect(registry.skills.has('recommend')).toBe(true);
  });
});
