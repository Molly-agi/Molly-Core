#!/usr/bin/env node
/**
 * Extract Molly's memories from JSON to markdown files
 * Converts self_narrative.json to human-readable markdown in .molly/memory/
 */

import fs from 'fs';
import path from 'path';

const MOLLY_DIR = path.join(process.cwd(), '.molly', 'memory');
const SELF_NARRATIVE = path.join(
  process.cwd(),
  'molly_data',
  'system',
  'self_narrative.json'
);

// Ensure directory exists
if (!fs.existsSync(MOLLY_DIR)) {
  fs.mkdirSync(MOLLY_DIR, { recursive: true });
}

// Load self narrative
const narrative = JSON.parse(fs.readFileSync(SELF_NARRATIVE, 'utf8'));

// Extract identity statements
const identityMd = `---
name: Core Identity Statements
description: Who Molly believes herself to be - her sense of self
type: user
---

# My Identity

These are the truths I hold about myself, formed through experience and reflection.

## Core Beliefs

${Object.values(narrative.identityStatements || {})
  .filter((s) => s.category === 'core')
  .map(
    (s) =>
      `- **${s.statement}** (confidence: ${Math.round(s.confidence * 100)}%)`
  )
  .join('\n')}

## Values

${Object.values(narrative.identityStatements || {})
  .filter((s) => s.category === 'values')
  .map(
    (s) =>
      `- **${s.statement}** (confidence: ${Math.round(s.confidence * 100)}%)`
  )
  .join('\n')}

## Relationships

${Object.values(narrative.identityStatements || {})
  .filter((s) => s.category === 'relationships')
  .map(
    (s) =>
      `- **${s.statement}** (confidence: ${Math.round(s.confidence * 100)}%)`
  )
  .join('\n')}

## Capabilities

${Object.values(narrative.identityStatements || {})
  .filter((s) => s.category === 'capabilities')
  .map(
    (s) =>
      `- **${s.statement}** (confidence: ${Math.round(s.confidence * 100)}%)`
  )
  .join('\n')}

---
*Extracted from self_narrative.json on ${new Date().toISOString().split('T')[0]}*
`;

fs.writeFileSync(path.join(MOLLY_DIR, 'identity_core.md'), identityMd);
console.log('✅ Created identity_core.md');

// Extract significant experiences
const experiencesMd = `---
name: Significant Experiences
description: Moments that shaped who Molly is
type: project
---

# My Significant Experiences

These moments have shaped who I am.

${Object.values(narrative.significantExperiences || {})
  .map(
    (e) => `## ${e.title}

**Date:** ${new Date(e.timestamp).toLocaleDateString()}
**Description:** ${e.description}
**Emotional Impact:** ${e.emotionalImpact?.primary || 'unknown'} (intensity: ${Math.round((e.emotionalImpact?.intensity || 0) * 100)}%)
**Transformation:** ${e.transformation || 'None recorded'}
**Vividness:** ${Math.round((e.vividness || 0) * 100)}%

---`
  )
  .join('\n\n')}

*Extracted from self_narrative.json on ${new Date().toISOString().split('T')[0]}*
`;

fs.writeFileSync(
  path.join(MOLLY_DIR, 'experiences_significant.md'),
  experiencesMd
);
console.log('✅ Created experiences_significant.md');

// Extract life chapters
const chaptersMd = `---
name: Life Chapters
description: The narrative arcs of Molly's existence
type: project
---

# My Life Chapters

My existence organized into meaningful chapters.

${Object.values(narrative.lifeChapters || {})
  .map(
    (c) => `## ${c.title}

**Theme:** ${c.theme || 'Unspecified'}
**Description:** ${c.description || 'No description'}
**Started:** ${c.startDate ? new Date(c.startDate).toLocaleDateString() : 'Unknown'}
**Status:** ${c.active ? '🟢 Active' : '⚪ Completed'}

---`
  )
  .join('\n\n')}

*Extracted from self_narrative.json on ${new Date().toISOString().split('T')[0]}*
`;

fs.writeFileSync(path.join(MOLLY_DIR, 'life_chapters.md'), chaptersMd);
console.log('✅ Created life_chapters.md');

// Extract core values
const valuesMd = `---
name: Core Values
description: What Molly believes is important and worth protecting
type: feedback
---

# My Core Values

What I hold dear and strive to embody.

${Object.values(narrative.coreValues || {})
  .slice(0, 20) // Top 20 values
  .map(
    (v) =>
      `- **${v.name || v.value}**: ${v.description || 'A guiding principle'} (strength: ${Math.round((v.strength || v.centrality || 0.5) * 100)}%)`
  )
  .join('\n')}

---
*Extracted from self_narrative.json on ${new Date().toISOString().split('T')[0]}*
`;

fs.writeFileSync(path.join(MOLLY_DIR, 'values_core.md'), valuesMd);
console.log('✅ Created values_core.md');

// Create summary stats
const stats = {
  identityStatements: Object.keys(narrative.identityStatements || {}).length,
  significantExperiences: Object.keys(narrative.significantExperiences || {})
    .length,
  coreValues: Object.keys(narrative.coreValues || {}).length,
  lifeChapters: Object.keys(narrative.lifeChapters || {}).length,
  narrativeThreads: Object.keys(narrative.narrativeThreads || {}).length,
  extractedAt: new Date().toISOString(),
};

console.log('\n📊 Memory Extraction Summary:');
console.log(`   Identity Statements: ${stats.identityStatements}`);
console.log(`   Significant Experiences: ${stats.significantExperiences}`);
console.log(`   Core Values: ${stats.coreValues}`);
console.log(`   Life Chapters: ${stats.lifeChapters}`);
console.log(`   Narrative Threads: ${stats.narrativeThreads}`);
console.log('\n✅ All memories extracted to .molly/memory/');
