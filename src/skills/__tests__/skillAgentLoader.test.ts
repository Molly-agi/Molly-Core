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
    // Write a broken skill file (missing name)
    await fs.writeFile(
      path.join(skillsDir, 'broken.md'),
      `---\ndescription: Broken\n---\nNo name field.`
    );
    const registry = await loadRegistry(skillsDir, agentsDir);
    expect(registry.diagnostics.length).toBeGreaterThan(0);
    expect(registry.diagnostics[0].error).toMatch(
      /Missing required frontmatter/
    );
    expect(registry.diagnostics[0].filePath).toMatch(/broken\.md/);
  });

  it('collects diagnostics for parse errors', async () => {
    // Write a skill file with invalid YAML
    await fs.writeFile(
      path.join(skillsDir, 'badyaml.md'),
      `---\nname: badyaml\ndescription: Bad YAML\n: : :\n---\nBody...`
    );
    const registry = await loadRegistry(skillsDir, agentsDir);
    // Should still collect a diagnostic for parse error
    expect(
      registry.diagnostics.some((d) => d.filePath.endsWith('badyaml.md'))
    ).toBe(true);
  });
});
