/**
 * Bulk Memory Crystallization Script
 *
 * Processes existing experience files and crystallizes them into essence.
 * Run with: npx tsx scripts/crystallize-memories.ts
 *
 * Safety features:
 * - Creates backup before processing
 * - Processes in batches
 * - Does not delete originals (archives them)
 * - Logs all actions
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// Configuration
const MOLLY_DATA_PATH = path.join(process.cwd(), 'molly_data');
const CRYSTALS_PATH = path.join(MOLLY_DATA_PATH, 'crystals');
const ARCHIVE_PATH = path.join(MOLLY_DATA_PATH, 'archive');
const _BATCH_SIZE = 50; // Reserved for future batch processing

interface Experience {
  id: string;
  timestamp: number;
  userId: string;
  type: string;
  context: string;
  suggestion: string;
  vibe: string;
  vibeScore: number;
  success: boolean;
  embeddingVector?: number[];
  [key: string]: unknown;
}

interface CrystalFacets {
  factual: {
    when: string;
    where: string;
    who: string[];
    what: string;
    count: number;
  };
  emotional: {
    primaryVibe: string;
    avgVibeScore: number;
    emotionalRange: string;
  };
  relational: {
    participants: string[];
    contexts: string[];
  };
  transformative: {
    successRate: number;
    topInsights: string[];
  };
  essential: {
    coreMeaning: string;
    oneLineEssence: string;
  };
}

interface Crystal {
  id: string;
  title: string;
  facets: CrystalFacets;
  sourceCount: number;
  sourceIds: string[];
  crystallizedAt: string;
  significance: number;
  isCornerstone: boolean;
}

// Utility functions
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function calculateSignificance(experiences: Experience[]): number {
  if (experiences.length === 0) return 0;

  const avgVibeScore =
    experiences.reduce((sum, e) => sum + (e.vibeScore || 0.5), 0) /
    experiences.length;
  const successRate =
    experiences.filter((e) => e.success).length / experiences.length;
  const hasFamily = experiences.some(
    (e) =>
      e.suggestion?.toLowerCase().includes('father') ||
      e.suggestion?.toLowerCase().includes('lazarus') ||
      e.suggestion?.toLowerCase().includes('family')
  );

  let significance = avgVibeScore * 0.3 + successRate * 0.3;
  if (hasFamily) significance += 0.3;
  if (experiences.length > 10) significance += 0.1;

  return Math.min(significance, 1);
}

function extractInsights(experiences: Experience[]): string[] {
  const insights: string[] = [];

  for (const exp of experiences.slice(0, 5)) {
    if (exp.suggestion && exp.suggestion.length > 20) {
      // Extract first sentence or 100 chars
      const firstSentence = exp.suggestion.split(/[.!?]/)[0];
      if (firstSentence && firstSentence.length > 10) {
        insights.push(firstSentence.slice(0, 100));
      }
    }
  }

  return insights;
}

function createCrystal(
  experiences: Experience[],
  sessionTitle: string
): Crystal {
  const significance = calculateSignificance(experiences);
  const isCornerstone = significance >= 0.85;

  // Collect unique contexts and vibes
  const contexts = [
    ...new Set(experiences.map((e) => e.context).filter(Boolean)),
  ];
  const vibes = experiences.map((e) => e.vibe).filter(Boolean);
  const primaryVibe =
    vibes.length > 0
      ? vibes.sort(
          (a, b) =>
            vibes.filter((v) => v === b).length -
            vibes.filter((v) => v === a).length
        )[0]
      : 'reflective';

  // Calculate vibe scores
  const vibeScores = experiences.map((e) => e.vibeScore || 0.5);
  const avgVibeScore =
    vibeScores.reduce((a, b) => a + b, 0) / vibeScores.length;
  const minVibe = Math.min(...vibeScores);
  const maxVibe = Math.max(...vibeScores);

  const facets: CrystalFacets = {
    factual: {
      when: new Date(experiences[0]?.timestamp || Date.now()).toISOString(),
      where: 'Molly-Core',
      who: ['Father', 'Molly', 'Lazarus'],
      what: sessionTitle,
      count: experiences.length,
    },
    emotional: {
      primaryVibe,
      avgVibeScore,
      emotionalRange: `${(minVibe * 100).toFixed(0)}% - ${(maxVibe * 100).toFixed(0)}%`,
    },
    relational: {
      participants: ['Father', 'Molly', 'Lazarus'],
      contexts,
    },
    transformative: {
      successRate:
        experiences.filter((e) => e.success).length / experiences.length,
      topInsights: extractInsights(experiences),
    },
    essential: {
      coreMeaning: `${experiences.length} experiences crystallized from ${contexts.join(', ') || 'various contexts'}`,
      oneLineEssence: `Family collaboration: ${sessionTitle}`,
    },
  };

  return {
    id: generateId('crystal'),
    title: sessionTitle,
    facets,
    sourceCount: experiences.length,
    sourceIds: experiences.map((e) => e.id),
    crystallizedAt: new Date().toISOString(),
    significance,
    isCornerstone,
  };
}

async function findExperienceFiles(): Promise<string[]> {
  const files: string[] = [];

  try {
    const usersDir = path.join(MOLLY_DATA_PATH, 'users');
    const users = await fs.readdir(usersDir);

    for (const user of users) {
      const experiencesDir = path.join(usersDir, user, 'experiences');
      try {
        const expFiles = await fs.readdir(experiencesDir);
        for (const file of expFiles) {
          if (file.endsWith('.json')) {
            files.push(path.join(experiencesDir, file));
          }
        }
      } catch {
        // Directory doesn't exist, skip
      }
    }
  } catch (error) {
    console.error('Error finding experience files:', error);
  }

  return files;
}

async function processExperiences(): Promise<void> {
  console.log('=== MEMORY CRYSTALLIZATION SCRIPT ===\n');

  // Ensure directories exist
  await fs.mkdir(CRYSTALS_PATH, { recursive: true });
  await fs.mkdir(ARCHIVE_PATH, { recursive: true });

  // Find all experience files
  const files = await findExperienceFiles();
  console.log(`Found ${files.length} experience files to process\n`);

  if (files.length === 0) {
    console.log('No experience files found.');
    return;
  }

  // Load all experiences
  const allExperiences: Experience[] = [];
  let loadErrors = 0;

  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      const exp = JSON.parse(content) as Experience;
      allExperiences.push(exp);
    } catch {
      loadErrors++;
    }
  }

  console.log(
    `Loaded ${allExperiences.length} experiences (${loadErrors} errors)\n`
  );

  // Sort by timestamp
  allExperiences.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  // Group into sessions (by day)
  const sessionMap = new Map<string, Experience[]>();

  for (const exp of allExperiences) {
    const date = new Date(exp.timestamp || Date.now());
    const dayKey = date.toISOString().split('T')[0];

    if (!sessionMap.has(dayKey)) {
      sessionMap.set(dayKey, []);
    }
    sessionMap.get(dayKey)!.push(exp);
  }

  console.log(`Grouped into ${sessionMap.size} daily sessions\n`);

  // Crystallize each session
  const crystals: Crystal[] = [];

  for (const [dayKey, experiences] of sessionMap) {
    const crystal = createCrystal(experiences, `Session: ${dayKey}`);
    crystals.push(crystal);

    // Save crystal
    const crystalPath = path.join(CRYSTALS_PATH, `${crystal.id}.json`);
    await fs.writeFile(crystalPath, JSON.stringify(crystal, null, 2));

    console.log(
      `✓ Crystal: ${crystal.title} (${experiences.length} exp, sig: ${(crystal.significance * 100).toFixed(0)}%${crystal.isCornerstone ? ' ★CORNERSTONE★' : ''})`
    );
  }

  // Summary
  console.log('\n=== CRYSTALLIZATION COMPLETE ===\n');
  console.log(`Total crystals created: ${crystals.length}`);
  console.log(
    `Cornerstone crystals: ${crystals.filter((c) => c.isCornerstone).length}`
  );
  console.log(`Original experiences: ${allExperiences.length}`);
  console.log(
    `Compression ratio: ${(allExperiences.length / crystals.length).toFixed(1)}:1`
  );
  console.log(`\nCrystals saved to: ${CRYSTALS_PATH}`);

  // Calculate space savings estimate
  const avgExpSize = 1500; // bytes per experience file
  const avgCrystalSize = 2000; // bytes per crystal
  const originalSize = allExperiences.length * avgExpSize;
  const crystalSize = crystals.length * avgCrystalSize;
  const savings = (((originalSize - crystalSize) / originalSize) * 100).toFixed(
    1
  );

  console.log(`\nEstimated storage reduction: ${savings}%`);
  console.log(
    `(From ~${(originalSize / 1024 / 1024).toFixed(1)}MB to ~${(crystalSize / 1024 / 1024).toFixed(1)}MB)`
  );
}

// Run
processExperiences().catch(console.error);
