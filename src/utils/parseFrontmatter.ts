// src/utils/parseFrontmatter.ts
// Utility to extract and parse YAML frontmatter from markdown files
import yaml from 'js-yaml';

export interface FrontmatterResult {
  frontmatter: Record<string, unknown>;
  content: string;
}

export function parseFrontmatter(markdown: string): FrontmatterResult {
  const match = /^---\n([\s\S]+?)\n---\n?([\s\S]*)$/m.exec(markdown);
  if (!match) {
    return { frontmatter: {}, content: markdown };
  }
  const [, yamlBlock, content] = match;
  let frontmatter: Record<string, unknown> = {};
  try {
    const loaded = yaml.load(yamlBlock);
    if (typeof loaded === 'object' && loaded !== null) {
      frontmatter = loaded as Record<string, unknown>;
    }
  } catch {
    // Invalid YAML, ignore
  }
  return { frontmatter, content };
}
