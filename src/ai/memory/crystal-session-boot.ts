/**
 * Crystal OS Session Bootstrap — Crystal-side runtime entry point.
 *
 * Loads crystals from disk into the hot/warm two-tier library manager,
 * then returns a prompt injection string ready for system-prompt assembly.
 *
 * This is the offline-first path for edge deployment (Revvl Tab 2 / no Firestore):
 *   disk crystals → CrystalLibraryManager → buildCrystalMemoryPrompt()
 *
 * Cornerstones load first and are eviction-exempt. Remaining crystals are
 * loaded in descending significance order; osmotic pressure promotes the
 * best warm candidates if any hot slots remain after the initial fill.
 */

import { readdir, readFile } from 'fs/promises';
import { join, extname } from 'path';
import {
  CrystalLibraryManager,
  type EvictableCrystal,
  type RetentionWeights,
  DEFAULT_WEIGHTS,
} from './crystal-library-eviction';
import {
  buildCrystalMemoryPrompt,
  type PromptableCrystal,
} from './crystal-prompt';

// ─── On-disk shape (crystallize-memories.ts output) ──────────────────────────

interface DiskCrystalFacets {
  factual?: { when?: string; who?: string[]; what?: string };
  emotional?: {
    primaryVibe?: string;
    primaryEmotion?: string; // MemoryCrystal.ts uses this name
  };
  relational?: { participants?: string[] };
  transformative?: {
    topInsights?: string[];
    insightsGained?: string[]; // MemoryCrystal.ts name
  };
  essential?: { oneLineEssence?: string; coreMeaning?: string };
}

interface DiskCrystal {
  id?: string;
  title?: string;
  significance?: number;
  totalSignificance?: number;
  importanceScore?: number;
  isCornerstone?: boolean;
  crystallizedAt?: string;
  facets?: DiskCrystalFacets;
}

// ─── Runtime type: EvictableCrystal + PromptableCrystal in one ───────────────

export interface BootCrystal extends EvictableCrystal, PromptableCrystal {
  /** significance here == totalSignificance; satisfies EvictableCrystal */
  significance: number;
}

// ─── Options / Result ─────────────────────────────────────────────────────────

export interface CrystalBootOptions {
  /** Directory containing crystal *.json files. Defaults to molly_data/crystals/ */
  crystalsDir?: string;
  /** Hot-tier cap. Defaults to 8 (4 cornerstones + 4 recent). */
  maxHot?: number;
  weights?: RetentionWeights;
  logPath?: string;
  sessionId?: string;
}

export interface CrystalBootResult {
  /** System-prompt block, ready to inject. Empty string when no crystals loaded. */
  promptBlock: string;
  hotCount: number;
  cornerstoneCount: number;
  /** Live manager — callers may call touch() / demoteToWarm() during the session. */
  manager: CrystalLibraryManager<BootCrystal>;
}

// ─── Disk reader ─────────────────────────────────────────────────────────────

function normalizeToBootCrystal(
  raw: DiskCrystal,
  fileId: string
): BootCrystal | null {
  const id = raw.id ?? fileId;
  const title = raw.title ?? id;
  const sig =
    raw.significance ?? raw.totalSignificance ?? raw.importanceScore ?? 0;
  if (sig <= 0) return null;

  const f = raw.facets ?? {};

  const when = f.factual?.when ?? '';
  const who = f.factual?.who ?? [];
  const primaryEmotion =
    f.emotional?.primaryEmotion ?? f.emotional?.primaryVibe ?? 'neutral';
  const participants = f.relational?.participants;
  const insightsGained =
    f.transformative?.insightsGained ?? f.transformative?.topInsights ?? [];
  const oneLineEssence =
    f.essential?.oneLineEssence ?? f.essential?.coreMeaning ?? title;

  return {
    id,
    title,
    isCornerstone: raw.isCornerstone ?? false,
    significance: sig,
    totalSignificance: sig,
    facets: {
      factual: { when, who },
      emotional: { primaryEmotion },
      ...(participants != null ? { relational: { participants } } : {}),
      transformative: { insightsGained },
      essential: { oneLineEssence },
    },
  };
}

/**
 * Load and normalize all valid crystals from a directory.
 * Returns an empty array on read errors (never throws).
 */
export async function loadCrystalsFromDir(dir: string): Promise<BootCrystal[]> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => extname(f) === '.json');
  } catch {
    return [];
  }

  const results: BootCrystal[] = [];
  await Promise.all(
    files.map(async (file) => {
      try {
        const raw = JSON.parse(
          await readFile(join(dir, file), 'utf-8')
        ) as DiskCrystal;
        const crystal = normalizeToBootCrystal(raw, file.replace('.json', ''));
        if (crystal) results.push(crystal);
      } catch {
        // Skip malformed files
      }
    })
  );
  return results;
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

const DEFAULT_CRYSTALS_DIR = join(process.cwd(), 'molly_data', 'crystals');

/**
 * Load crystals from disk, populate the hot tier, return the prompt injection block.
 *
 * Load order:
 *   1. Cornerstones — always hot, never evicted.
 *   2. Non-cornerstones sorted by significance desc — fill remaining hot slots.
 *   3. Osmotic pressure pass — promote any warm crystal that beats the weakest
 *      hot crystal by >= OSMOTIC_PRESSURE_MARGIN (usually a no-op after step 2).
 */
export async function bootCrystalSession(
  opts: CrystalBootOptions = {}
): Promise<CrystalBootResult> {
  const {
    crystalsDir = DEFAULT_CRYSTALS_DIR,
    maxHot = 8,
    weights = DEFAULT_WEIGHTS,
    logPath,
    sessionId,
  } = opts;

  const manager = new CrystalLibraryManager<BootCrystal>(maxHot, weights, {
    logPath,
    sessionId,
  });

  const crystals = await loadCrystalsFromDir(crystalsDir);
  if (crystals.length === 0) {
    return { promptBlock: '', hotCount: 0, cornerstoneCount: 0, manager };
  }

  const now = Date.now();

  // 1. Load cornerstones first — they take priority and can never be evicted.
  const cornerstones = crystals
    .filter((c) => c.isCornerstone)
    .sort((a, b) => b.significance - a.significance);
  for (const c of cornerstones) {
    manager.loadToHot(c, now);
  }

  // 2. Load remaining by significance desc, filling hot slots.
  const nonCornerstone = crystals
    .filter((c) => !c.isCornerstone)
    .sort((a, b) => b.significance - a.significance);
  for (const c of nonCornerstone) {
    manager.loadToHot(c, now);
  }

  // 3. Osmotic pressure — promote any warm crystal that earned its slot.
  const warmCandidates = manager
    .getWarmIds()
    .map((id) => crystals.find((c) => c.id === id))
    .filter((c): c is BootCrystal => c != null);
  if (warmCandidates.length > 0) {
    manager.promoteByOsmoticPressure(warmCandidates, now);
  }

  const hot = manager.getHotCrystals();
  const cornerstoneCount = hot.filter((c) => c.isCornerstone).length;

  return {
    promptBlock: buildCrystalMemoryPrompt(hot),
    hotCount: hot.length,
    cornerstoneCount,
    manager,
  };
}
