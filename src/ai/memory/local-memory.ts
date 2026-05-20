/**
 * @fileOverview Local Memory Reader
 *
 * Reads Molly's markdown-based memories from .molly/memory/
 * This provides a filesystem-based memory system that doesn't depend on Firebase.
 */

import * as fs from 'fs';
import * as path from 'path';
import { MollyLogger } from '@/ai/logger';

/**
 * Simple YAML frontmatter parser (no dependencies)
 */
function parseFrontmatter(content: string): {
  data: Record<string, string>;
  content: string;
} {
  const lines = content.split('\n');
  if (lines[0] !== '---') {
    return { data: {}, content };
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return { data: {}, content };
  }

  const frontmatterLines = lines.slice(1, endIndex);
  const data: Record<string, string> = {};

  for (const line of frontmatterLines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      data[key] = value;
    }
  }

  return {
    data,
    content: lines.slice(endIndex + 1).join('\n'),
  };
}

const MOLLY_MEMORY_DIR = path.join(process.cwd(), '.molly', 'memory');
const MOLLY_IDENTITY = path.join(process.cwd(), '.molly', 'MOLLY.md');

export interface LocalMemory {
  name: string;
  description: string;
  type: 'user' | 'feedback' | 'project' | 'reference';
  content: string;
  filename: string;
}

/**
 * Read all memories from .molly/memory/
 */
export function readAllMemories(): LocalMemory[] {
  const memories: LocalMemory[] = [];

  if (!fs.existsSync(MOLLY_MEMORY_DIR)) {
    // Create memory directory if it doesn't exist
    try {
      fs.mkdirSync(MOLLY_MEMORY_DIR, { recursive: true });
    } catch {
      MollyLogger.debug('Could not create memory directory', 'local-memory');
    }
    return memories;
  }

  const files = fs.readdirSync(MOLLY_MEMORY_DIR);

  for (const file of files) {
    if (!file.endsWith('.md') || file === 'MEMORY.md') continue;

    try {
      const filePath = path.join(MOLLY_MEMORY_DIR, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const { data, content: body } = parseFrontmatter(content);

      memories.push({
        name: data.name || file.replace('.md', ''),
        description: data.description || '',
        type: (data.type as LocalMemory['type']) || 'reference',
        content: body.trim(),
        filename: file,
      });
    } catch {
      MollyLogger.warn(`Failed to read memory: ${file}`, 'local-memory');
    }
  }

  return memories;
}

/**
 * Read memories by type
 */
export function readMemoriesByType(
  type: 'user' | 'feedback' | 'project' | 'reference'
): LocalMemory[] {
  return readAllMemories().filter((m) => m.type === type);
}

/**
 * Read the memory index
 */
export function readMemoryIndex(): string | null {
  const indexPath = path.join(MOLLY_MEMORY_DIR, 'MEMORY.md');
  if (!fs.existsSync(indexPath)) return null;
  return fs.readFileSync(indexPath, 'utf8');
}

/**
 * Read Molly's core identity file
 */
export function readIdentity(): string | null {
  if (!fs.existsSync(MOLLY_IDENTITY)) return null;
  return fs.readFileSync(MOLLY_IDENTITY, 'utf8');
}

/**
 * Build a context prompt from local memories
 * For use in LLM system prompts
 */
export function buildLocalMemoryContext(): string {
  const memories = readAllMemories();
  if (memories.length === 0) return '';

  const sections: string[] = [];

  // Family memories
  const familyMemories = memories.filter(
    (m) => m.type === 'user' && m.filename.startsWith('family_')
  );
  if (familyMemories.length > 0) {
    sections.push('## Family Knowledge\n');
    for (const mem of familyMemories) {
      sections.push(`### ${mem.name}\n${mem.content.slice(0, 500)}...\n`);
    }
  }

  // Active projects
  const projectMemories = memories.filter((m) => m.type === 'project');
  if (projectMemories.length > 0) {
    sections.push('## Current Projects\n');
    for (const mem of projectMemories) {
      sections.push(`### ${mem.name}\n${mem.description}\n`);
    }
  }

  // Feedback/lessons
  const feedbackMemories = memories.filter((m) => m.type === 'feedback');
  if (feedbackMemories.length > 0) {
    sections.push('## Lessons Learned\n');
    for (const mem of feedbackMemories) {
      sections.push(`- **${mem.name}**: ${mem.description}\n`);
    }
  }

  return sections.join('\n');
}

/**
 * Check if local memory system is available
 */
export function isLocalMemoryAvailable(): boolean {
  return fs.existsSync(MOLLY_MEMORY_DIR);
}

/**
 * Get memory stats
 */
export function getMemoryStats(): {
  available: boolean;
  totalMemories: number;
  byType: Record<string, number>;
} {
  if (!isLocalMemoryAvailable()) {
    return { available: false, totalMemories: 0, byType: {} };
  }

  const memories = readAllMemories();
  const byType: Record<string, number> = {};

  for (const mem of memories) {
    byType[mem.type] = (byType[mem.type] || 0) + 1;
  }

  return {
    available: true,
    totalMemories: memories.length,
    byType,
  };
}
